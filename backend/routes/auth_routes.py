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


# ========== AUTH ==========
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str
    phone: Optional[str] = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


@router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    ident = f"{_client_ip(request)}:{email}"
    await check_lockout(db, ident)
    user = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        await record_failed_login(db, ident)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled")
    await clear_login_attempts(db, ident)
    token = make_session_jwt(user.user_id)
    set_session_cookie(response, token)
    return {"user": _public_user(user), "token": token}


@router.post("/auth/register")
async def register(payload: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    existing = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = M.User(
        user_id=f"user_{uuid.uuid4().hex[:12]}",
        email=email, name=payload.name, phone=payload.phone,
        password_hash=hash_password(payload.password),
        auth_provider="password", role="customer", active=True,
    )
    db.add(user)
    await db.flush()
    db.add(M.Customer(user_id=user.user_id, name=user.name, email=user.email, phone=user.phone))
    await db.commit()
    await db.refresh(user)
    token = make_session_jwt(user.user_id)
    set_session_cookie(response, token)
    return {"user": _public_user(user), "token": token}


@router.get("/auth/me")
async def auth_me(user: M.User = Depends(get_current_user)):
    return _public_user(user)


@router.post("/auth/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = await get_session_token(request)
    if token:
        # If this is a DB-backed session (Google OAuth), remove it
        sess = (await db.execute(select(M.UserSession).where(M.UserSession.session_token == token))).scalar_one_or_none()
        if sess:
            await db.delete(sess)
            await db.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: M.User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.auth_provider = "password"
    await db.commit()
    return {"ok": True}


# ---- Google OAuth (customer-only) ----
class SessionRequest(BaseModel):
    session_id: str


@router.post("/auth/session")
async def auth_session(payload: SessionRequest, response: Response, db: AsyncSession = Depends(get_db)):
    profile = await fetch_emergent_profile(payload.session_id)
    email = (profile.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")
    user = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if user:
        # Existing user - update profile picture/name only
        if profile.get("name"):
            user.name = profile["name"]
        if profile.get("picture"):
            user.picture = profile["picture"]
    else:
        # Brand new user via Google = always customer (admins must use password)
        user = M.User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email, name=profile.get("name", email.split("@")[0]),
            picture=profile.get("picture"), role="customer",
            auth_provider="google", active=True,
        )
        db.add(user)
        await db.flush()
        db.add(M.Customer(user_id=user.user_id, name=user.name, email=user.email))
    await db.commit()
    await db.refresh(user)
    # Use DB-backed session for Google flow (matches their session_token)
    sess_token = profile.get("session_token") or uuid.uuid4().hex
    await create_db_session(db, user, sess_token)
    set_session_cookie(response, sess_token)
    return {"user": _public_user(user)}


