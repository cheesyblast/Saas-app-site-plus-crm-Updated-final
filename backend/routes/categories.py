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


# ========== CATEGORIES ==========
class CategoryIn(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: int = 0


def cat_to_dict(c):
    return {"id": c.id, "name": c.name, "slug": c.slug, "description": c.description,
            "parent_id": c.parent_id, "sort_order": c.sort_order}


def _build_category_tree(rows):
    by_id = {c["id"]: {**c, "children": []} for c in rows}
    roots = []
    for c in by_id.values():
        if c["parent_id"] and c["parent_id"] in by_id:
            by_id[c["parent_id"]]["children"].append(c)
        else:
            roots.append(c)
    return roots


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db), q: Optional[str] = None, tree: bool = False):
    query = select(M.Category).order_by(M.Category.sort_order, M.Category.name)
    if q:
        query = query.where(M.Category.name.ilike(f"%{q}%"))
    rows = (await db.execute(query)).scalars().all()
    flat = [cat_to_dict(c) for c in rows]
    if tree:
        return _build_category_tree(flat)
    return flat


@router.post("/admin/categories")
async def create_category(payload: CategoryIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.Category(name=payload.name, slug=slugify(payload.name), description=payload.description,
                    parent_id=payload.parent_id or None, sort_order=payload.sort_order)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return cat_to_dict(c)


@router.put("/admin/categories/{cid}")
async def update_category(cid: str, payload: CategoryIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Category).where(M.Category.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    if payload.parent_id == cid:
        raise HTTPException(400, "Cannot be own parent")
    c.name = payload.name
    c.slug = slugify(payload.name)
    c.description = payload.description
    c.parent_id = payload.parent_id or None
    c.sort_order = payload.sort_order
    await db.commit()
    return cat_to_dict(c)


@router.delete("/admin/categories/{cid}")
async def delete_category(cid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Category).where(M.Category.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


