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


# ========== SETUP WIZARD ==========
class SetupInit(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    tagline: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_address: Optional[str] = None
    currency: str = "LKR"
    admin_email: EmailStr
    admin_name: str = Field(..., min_length=1)
    admin_password: str = Field(..., min_length=8)


@router.get("/setup/status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    return {"setup_complete": bool(cs and cs.setup_complete),
            "company_name": cs.company_name if cs else None}


@router.post("/setup/init")
async def setup_init(payload: SetupInit, response: Response, db: AsyncSession = Depends(get_db)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    if cs and cs.setup_complete:
        raise HTTPException(409, "Setup already completed")
    # Create the super_admin
    email = payload.admin_email.lower()
    existing = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if existing:
        existing.password_hash = hash_password(payload.admin_password)
        existing.name = payload.admin_name
        existing.role = "super_admin"
        existing.active = True
        existing.auth_provider = "password"
        admin = existing
    else:
        admin = M.User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email, name=payload.admin_name, role="super_admin",
            password_hash=hash_password(payload.admin_password),
            auth_provider="password", active=True,
        )
        db.add(admin)
    if not cs:
        cs = M.CompanySettings(id="default")
        db.add(cs)
    cs.company_name = payload.company_name
    cs.tagline = payload.tagline
    cs.email = payload.company_email
    cs.phone = payload.company_phone
    cs.address = payload.company_address
    cs.currency = payload.currency or "LKR"
    cs.setup_complete = True
    cs.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(admin)
    token = make_session_jwt(admin.user_id)
    set_session_cookie(response, token)
    return {"ok": True, "user": _public_user(admin), "token": token}


