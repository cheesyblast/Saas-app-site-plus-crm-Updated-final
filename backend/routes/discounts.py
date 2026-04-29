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


# ========== DISCOUNTS (storefront promotions) ==========
class DiscountIn(BaseModel):
    name: str
    description: Optional[str] = None
    type: str = "percent"
    value: float = 0.0
    scope: str = "sitewide"
    scope_product_ids: Optional[List[str]] = None
    scope_category_ids: Optional[List[str]] = None
    show_badge_on_products: bool = True
    badge_label: Optional[str] = None
    badge_color: str = "#FF3B30"
    show_marquee: bool = True
    marquee_size: str = "sm"
    marquee_speed: str = "normal"
    marquee_bg: str = "#FF3B30"
    marquee_fg: str = "#FFFFFF"
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    active: bool = True


def _discount_dict(d: M.Discount):
    return {
        "id": d.id, "name": d.name, "description": d.description,
        "type": d.type, "value": d.value, "scope": d.scope,
        "scope_product_ids": d.scope_product_ids or [],
        "scope_category_ids": d.scope_category_ids or [],
        "show_badge_on_products": d.show_badge_on_products,
        "badge_label": d.badge_label, "badge_color": d.badge_color,
        "show_marquee": d.show_marquee, "marquee_size": d.marquee_size,
        "marquee_speed": d.marquee_speed, "marquee_bg": d.marquee_bg, "marquee_fg": d.marquee_fg,
        "starts_at": d.starts_at.isoformat() if d.starts_at else None,
        "ends_at": d.ends_at.isoformat() if d.ends_at else None,
        "active": d.active,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("/admin/discounts")
async def list_discounts(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                          q: Optional[str] = None, page: int = 1, page_size: int = 50):
    base = select(M.Discount)
    if q:
        base = base.where(or_(M.Discount.name.ilike(f"%{q}%"), M.Discount.description.ilike(f"%{q}%")))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    page_size = min(max(1, page_size), 100); page = max(1, page)
    rows = (await db.execute(base.order_by(desc(M.Discount.created_at)).offset((page-1)*page_size).limit(page_size))).scalars().all()
    return {"items": [_discount_dict(d) for d in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/admin/discounts")
async def create_discount(payload: DiscountIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    d = M.Discount(**payload.model_dump())
    db.add(d); await db.commit(); await db.refresh(d)
    return _discount_dict(d)


@router.put("/admin/discounts/{did}")
async def update_discount(did: str, payload: DiscountIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    d = (await db.execute(select(M.Discount).where(M.Discount.id == did))).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(d, k, v)
    d.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _discount_dict(d)


@router.delete("/admin/discounts/{did}")
async def delete_discount(did: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    d = (await db.execute(select(M.Discount).where(M.Discount.id == did))).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Not found")
    await db.delete(d); await db.commit()
    return {"ok": True}


@router.get("/discounts/active")
async def public_active_discounts(db: AsyncSession = Depends(get_db)):
    """Public list of currently-active discounts for marquee + product badges."""
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(M.Discount).where(M.Discount.active == True))).scalars().all()
    out = []
    for d in rows:
        if d.starts_at:
            sa = d.starts_at if d.starts_at.tzinfo else d.starts_at.replace(tzinfo=timezone.utc)
            if sa > now: continue
        if d.ends_at:
            ea = d.ends_at if d.ends_at.tzinfo else d.ends_at.replace(tzinfo=timezone.utc)
            if ea < now: continue
        out.append(_discount_dict(d))
    return out


