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


# ========== STAFF ==========
class StaffIn(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    role: str
    base_salary: Optional[float] = None
    active: bool = True
    password: Optional[str] = None  # Optional initial password
    permissions: Optional[dict] = None


@router.get("/admin/staff")
async def list_staff(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None):
    query = select(M.User).where(M.User.role != "customer").order_by(desc(M.User.created_at))
    if q:
        query = query.where(or_(M.User.name.ilike(f"%{q}%"), M.User.email.ilike(f"%{q}%")))
    rows = (await db.execute(query)).scalars().all()
    return [{"user_id": u.user_id, "email": u.email, "name": u.name, "phone": u.phone,
             "role": u.role, "base_salary": u.base_salary, "active": u.active,
             "auth_provider": u.auth_provider, "permissions": u.permissions or {},
             "created_at": u.created_at.isoformat()} for u in rows]


@router.post("/admin/staff")
async def create_staff(payload: StaffIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    # Default to "all permissions OFF" — admin must explicitly grant.
    perms = payload.permissions or {p: False for p in ALL_PERMISSIONS}
    existing = (await db.execute(select(M.User).where(M.User.email == payload.email.lower()))).scalar_one_or_none()
    if existing:
        existing.role = payload.role; existing.name = payload.name
        existing.phone = payload.phone; existing.base_salary = payload.base_salary
        existing.active = payload.active; existing.permissions = perms
        if payload.password:
            existing.password_hash = hash_password(payload.password)
            existing.auth_provider = "password"
        await db.commit()
        return {"user_id": existing.user_id}
    u = M.User(user_id=f"user_{uuid.uuid4().hex[:12]}", email=payload.email.lower(), name=payload.name,
               phone=payload.phone, role=payload.role, base_salary=payload.base_salary,
               active=payload.active, auth_provider="password", permissions=perms,
               password_hash=hash_password(payload.password) if payload.password else None)
    db.add(u); await db.commit(); await db.refresh(u)
    return {"user_id": u.user_id}


@router.put("/admin/staff/{uid}")
async def update_staff(uid: str, payload: StaffIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    u = (await db.execute(select(M.User).where(M.User.user_id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Not found")
    u.email = payload.email.lower(); u.name = payload.name; u.phone = payload.phone
    u.role = payload.role; u.base_salary = payload.base_salary; u.active = payload.active
    if payload.permissions is not None:
        u.permissions = payload.permissions
    if payload.password:
        u.password_hash = hash_password(payload.password)
        u.auth_provider = "password"
    await db.commit()
    return {"ok": True}


@router.delete("/admin/staff/{uid}")
async def delete_staff(uid: str, db: AsyncSession = Depends(get_db), current: M.User = Depends(require_roles("super_admin"))):
    if uid == current.user_id:
        raise HTTPException(400, "Cannot delete yourself")
    u = (await db.execute(select(M.User).where(M.User.user_id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Not found")
    u.active = False; u.role = "customer"
    await db.commit()
    return {"ok": True}


