import os
import re
import uuid
import random
import string
import logging
import base64 as _b64
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import Response as FastResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc

from database import get_db
import models as M
from auth import (
    hash_password, verify_password,
    make_session_jwt, set_session_cookie, clear_session_cookie, get_session_token,
    get_current_user, get_current_user_optional, require_admin, require_roles, require_perm,
    check_lockout, record_failed_login, clear_login_attempts,
    fetch_emergent_profile, create_db_session, gen_reset_token,
    ADMIN_ROLES, ALL_PERMISSIONS,
)
from sl_locations import SL_DISTRICT_CITIES, all_districts, cities_for
from deps import (
    slugify, new_order_number, normalize_phone_lk,
    _select_active_discounts, _best_discount_for, _client_ip, _public_user,
    _descendant_ids, _ensure_default_store,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ========== PAGES & PAGE BUILDER ==========
class SectionIn(BaseModel):
    section_type: str
    sort_order: int = 0
    visible: bool = True
    config: dict = {}


class SectionUpdate(BaseModel):
    sort_order: Optional[int] = None
    visible: Optional[bool] = None
    config: Optional[dict] = None


class ThemeIn(BaseModel):
    config: dict


def _section_to_dict(s):
    return {"id": s.id, "page": s.page, "section_type": s.section_type,
            "sort_order": s.sort_order, "visible": s.visible, "config": s.config or {}}


def _page_to_dict(p):
    return {"id": p.id, "slug": p.slug, "title": p.title, "is_system": p.is_system,
            "show_in_header_menu": p.show_in_header_menu, "sort_order": p.sort_order,
            "visible": p.visible}


@router.get("/page/{page}")
async def get_page(page: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(M.PageSection).where(and_(M.PageSection.page == page, M.PageSection.visible == True)).order_by(M.PageSection.sort_order)
    )).scalars().all()
    theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
    meta = (await db.execute(select(M.CustomPage).where(M.CustomPage.slug == page))).scalar_one_or_none()
    return {"sections": [_section_to_dict(s) for s in rows],
            "theme": (theme.config if theme else DEFAULT_THEME),
            "meta": _page_to_dict(meta) if meta else None}


@router.get("/pages")
async def list_public_pages(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(M.CustomPage).where(and_(
        M.CustomPage.visible == True, M.CustomPage.is_system == False
    )).order_by(M.CustomPage.sort_order, M.CustomPage.title))).scalars().all()
    return [_page_to_dict(p) for p in rows]


@router.get("/admin/pages")
async def admin_list_pages(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.CustomPage).order_by(M.CustomPage.is_system.desc(), M.CustomPage.sort_order, M.CustomPage.title))).scalars().all()
    return [_page_to_dict(p) for p in rows]


class PageIn(BaseModel):
    slug: Optional[str] = None
    title: str
    show_in_header_menu: bool = False
    sort_order: int = 0
    visible: bool = True


@router.post("/admin/pages")
async def create_page(payload: PageIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    slug = (payload.slug and slugify(payload.slug)) or slugify(payload.title)
    if (await db.execute(select(M.CustomPage).where(M.CustomPage.slug == slug))).scalar_one_or_none():
        slug = slug + "-" + uuid.uuid4().hex[:4]
    p = M.CustomPage(slug=slug, title=payload.title, show_in_header_menu=payload.show_in_header_menu,
                      sort_order=payload.sort_order, visible=payload.visible, is_system=False)
    db.add(p); await db.commit(); await db.refresh(p)
    # Seed an initial empty heading_text section
    db.add(M.PageSection(page=slug, section_type="custom", sort_order=0, visible=True,
                          config={"block_type": "heading_text", "eyebrow": "", "heading": payload.title,
                                  "text": "Edit this page from Page Builder.", "alignment": "left",
                                  "max_width": "narrow", "padding": "lg"}))
    await db.commit()
    return _page_to_dict(p)


@router.put("/admin/pages/{pid}")
async def update_page(pid: str, payload: PageIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.CustomPage).where(M.CustomPage.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    p.title = payload.title; p.show_in_header_menu = payload.show_in_header_menu
    p.sort_order = payload.sort_order; p.visible = payload.visible
    await db.commit()
    return _page_to_dict(p)


@router.delete("/admin/pages/{pid}")
async def delete_page(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.CustomPage).where(M.CustomPage.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    if p.is_system:
        raise HTTPException(400, "Cannot delete system page")
    # delete sections too
    for s in (await db.execute(select(M.PageSection).where(M.PageSection.page == p.slug))).scalars().all():
        await db.delete(s)
    await db.delete(p); await db.commit()
    return {"ok": True}


@router.get("/admin/page/{page}")
async def admin_get_page(page: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(
        select(M.PageSection).where(M.PageSection.page == page).order_by(M.PageSection.sort_order)
    )).scalars().all()
    return {"sections": [_section_to_dict(s) for s in rows]}


@router.post("/admin/page/{page}/sections")
async def add_section(page: str, payload: SectionIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    if payload.sort_order is None or payload.sort_order == 0:
        max_order = (await db.execute(select(func.max(M.PageSection.sort_order)).where(M.PageSection.page == page))).scalar_one() or 0
        payload.sort_order = int(max_order) + 10
    s = M.PageSection(page=page, section_type=payload.section_type, sort_order=payload.sort_order,
                      visible=payload.visible, config=payload.config)
    db.add(s); await db.commit(); await db.refresh(s)
    return _section_to_dict(s)


@router.put("/admin/page/sections/{sid}")
async def update_section(sid: str, payload: SectionUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.PageSection).where(M.PageSection.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    if payload.sort_order is not None:
        s.sort_order = payload.sort_order
    if payload.visible is not None:
        s.visible = payload.visible
    if payload.config is not None:
        s.config = payload.config
    s.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _section_to_dict(s)


@router.delete("/admin/page/sections/{sid}")
async def delete_section(sid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.PageSection).where(M.PageSection.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    await db.delete(s); await db.commit()
    return {"ok": True}


class ReorderIn(BaseModel):
    ids: list[str]


@router.post("/admin/page/{page}/reorder")
async def reorder_sections(page: str, payload: ReorderIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    for i, sid in enumerate(payload.ids):
        s = (await db.execute(select(M.PageSection).where(and_(M.PageSection.id == sid, M.PageSection.page == page)))).scalar_one_or_none()
        if s:
            s.sort_order = i * 10
    await db.commit()
    return {"ok": True}


@router.get("/theme")
async def get_theme(db: AsyncSession = Depends(get_db)):
    theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
    return theme.config if theme else DEFAULT_THEME


@router.put("/admin/theme")
async def update_theme(payload: ThemeIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
    if not theme:
        theme = M.ThemeSetting(id="default", config=payload.config); db.add(theme)
    else:
        theme.config = payload.config; theme.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return theme.config


# ---- Media ----
class MediaUpload(BaseModel):
    data_base64: str
    mime_type: str = "image/png"
    filename: Optional[str] = None


@router.post("/admin/media")
async def upload_media(payload: MediaUpload, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    # Reject grossly oversized uploads (base64 of ~4MB binary). Frontend
    # already auto-compresses; this is a defence in depth.
    MAX_B64_LEN = 5 * 1024 * 1024  # ~3.75MB binary
    if payload.data_base64 and len(payload.data_base64) > MAX_B64_LEN:
        raise HTTPException(413, "Image too large. Max 3 MB after compression.")
    m = M.Media(data_base64=payload.data_base64, mime_type=payload.mime_type, filename=payload.filename)
    db.add(m); await db.commit(); await db.refresh(m)
    return {"id": m.id, "url": f"/api/media/{m.id}", "mime_type": m.mime_type, "size": len(payload.data_base64 or "")}


@router.get("/media/{mid}")
async def stream_media(mid: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(M.Media.data_base64, M.Media.mime_type).where(M.Media.id == mid))).first()
    if not row:
        raise HTTPException(404, "Not found")
    try:
        raw = _b64.b64decode(row.data_base64)
    except Exception:
        raise HTTPException(500, "Corrupt")
    return FastResponse(content=raw, media_type=row.mime_type or "image/png",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.delete("/admin/media/{mid}")
async def delete_media(mid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    m = (await db.execute(select(M.Media).where(M.Media.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Not found")
    await db.delete(m); await db.commit()
    return {"ok": True}


