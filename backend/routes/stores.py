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


# ========== STORES ==========
class StoreIn(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    is_online: bool = False
    active: bool = True


@router.get("/admin/stores")
async def list_stores(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Store).order_by(desc(M.Store.is_online), M.Store.name))).scalars().all()
    return [{"id": s.id, "name": s.name, "address": s.address, "phone": s.phone, "is_online": s.is_online, "active": s.active} for s in rows]


@router.post("/admin/stores")
async def create_store(payload: StoreIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = M.Store(**payload.model_dump())
    db.add(s); await db.commit(); await db.refresh(s)
    return {"id": s.id}


@router.put("/admin/stores/{sid}")
async def update_store(sid: str, payload: StoreIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Store).where(M.Store.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    await db.commit()
    return {"ok": True}


@router.delete("/admin/stores/{sid}")
async def delete_store(sid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Store).where(M.Store.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    await db.delete(s); await db.commit()
    return {"ok": True}


