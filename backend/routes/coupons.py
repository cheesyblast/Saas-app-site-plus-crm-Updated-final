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


# ========== COUPONS ==========
class CouponIn(BaseModel):
    code: str
    type: str = "percent"
    value: float
    min_order: float = 0.0
    usage_limit: int = 0
    active: bool = True
    expires_at: Optional[datetime] = None
    scope: str = "all"  # all, products, categories
    scope_product_ids: Optional[List[str]] = None
    scope_category_ids: Optional[List[str]] = None


def _coupon_dict(c):
    return {"id": c.id, "code": c.code, "type": c.type, "value": c.value, "min_order": c.min_order,
            "usage_limit": c.usage_limit, "used_count": c.used_count, "active": c.active,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "scope": c.scope or "all",
            "scope_product_ids": c.scope_product_ids or [],
            "scope_category_ids": c.scope_category_ids or []}


@router.get("/admin/coupons")
async def list_coupons(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                       q: Optional[str] = None, page: int = 1, page_size: int = 50):
    base = select(M.Coupon)
    if q:
        base = base.where(M.Coupon.code.ilike(f"%{q}%"))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    page_size = min(max(1, page_size), 100); page = max(1, page)
    rows = (await db.execute(base.order_by(desc(M.Coupon.created_at)).offset((page-1)*page_size).limit(page_size))).scalars().all()
    items = [_coupon_dict(c) for c in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/admin/coupons")
async def create_coupon(payload: CouponIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.Coupon(**payload.model_dump()); c.code = c.code.upper()
    db.add(c); await db.commit(); await db.refresh(c)
    return {"id": c.id}


@router.put("/admin/coupons/{cid}")
async def update_coupon(cid: str, payload: CouponIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Coupon).where(M.Coupon.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    c.code = c.code.upper()
    await db.commit()
    return {"ok": True}


@router.delete("/admin/coupons/{cid}")
async def delete_coupon(cid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Coupon).where(M.Coupon.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    await db.delete(c); await db.commit()
    return {"ok": True}


@router.get("/coupons/validate/{code}")
async def validate_coupon(code: str, db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(M.Coupon).where(M.Coupon.code == code.upper()))).scalar_one_or_none()
    if not c or not c.active:
        raise HTTPException(404, "Invalid coupon")
    return {"code": c.code, "type": c.type, "value": c.value, "min_order": c.min_order}


