import os
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
import bcrypt
import jwt
import httpx
from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, UserSession, LoginAttempt

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
JWT_ALGORITHM = "HS256"
SESSION_DAYS = 7
LOCKOUT_THRESHOLD = 5
LOCKOUT_MINUTES = 15

# Roles that may access /admin/*
ADMIN_ROLES = {"super_admin", "manager", "sales_staff", "inventory_staff", "accountant"}


def _jwt_secret() -> str:
    s = os.environ.get("JWT_SECRET")
    if not s:
        raise RuntimeError("JWT_SECRET missing in env")
    return s


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_session_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "jti": uuid.uuid4().hex,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


# ---- Cookie helpers ----
COOKIE_NAME = "session_token"
COOKIE_KW = dict(httponly=True, secure=True, samesite="none", path="/")


def set_session_cookie(response, token: str):
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        max_age=60 * 60 * 24 * SESSION_DAYS,
        **COOKIE_KW,
    )


def clear_session_cookie(response):
    response.delete_cookie(COOKIE_NAME, path="/", samesite="none", secure=True)


async def get_session_token(request: Request) -> Optional[str]:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.split(" ", 1)[1]
    return None


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = await get_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id: Optional[str] = None
    payload = decode_jwt(token)
    if payload and payload.get("sub"):
        user_id = payload["sub"]
    else:
        # Fallback: legacy DB-backed UserSession (eg. Google OAuth flow)
        sess = (await db.execute(select(UserSession).where(UserSession.session_token == token))).scalar_one_or_none()
        if sess:
            exp = sess.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp >= datetime.now(timezone.utc):
                user_id = sess.user_id
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = (await db.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_user_optional(request: Request, db: AsyncSession = Depends(get_db)) -> Optional[User]:
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_roles(*allowed: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker


# Granular permission gate: super_admin always passes; others require the named permission flag.
ALL_PERMISSIONS = {"products", "orders", "pos", "inventory", "reports", "accounting", "settings", "suppliers", "marketing", "customers"}


def require_perm(name: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Admin access required")
        if user.role == "super_admin":
            return user
        perms = user.permissions or {}
        if not perms.get(name, False):
            raise HTTPException(status_code=403, detail=f"Missing permission: {name}")
        return user
    return checker


# ---- Brute force lockout ----
async def check_lockout(db: AsyncSession, identifier: str):
    row = (await db.execute(select(LoginAttempt).where(LoginAttempt.identifier == identifier))).scalar_one_or_none()
    if row and row.locked_until:
        until = row.locked_until
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        if until > datetime.now(timezone.utc):
            mins = int((until - datetime.now(timezone.utc)).total_seconds() // 60) + 1
            raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {mins} min.")


async def record_failed_login(db: AsyncSession, identifier: str):
    row = (await db.execute(select(LoginAttempt).where(LoginAttempt.identifier == identifier))).scalar_one_or_none()
    if not row:
        row = LoginAttempt(identifier=identifier, attempts=1)
        db.add(row)
    else:
        row.attempts += 1
        row.updated_at = datetime.now(timezone.utc)
        if row.attempts >= LOCKOUT_THRESHOLD:
            row.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
            row.attempts = 0
    await db.commit()


async def clear_login_attempts(db: AsyncSession, identifier: str):
    row = (await db.execute(select(LoginAttempt).where(LoginAttempt.identifier == identifier))).scalar_one_or_none()
    if row:
        row.attempts = 0
        row.locked_until = None
        await db.commit()


# ---- Emergent Google OAuth (customer only) ----
async def fetch_emergent_profile(session_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as cli:
        r = await cli.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        return r.json()


async def create_db_session(db: AsyncSession, user: User, token: str):
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    db.add(UserSession(session_token=token, user_id=user.user_id, expires_at=expires))
    await db.commit()


def gen_reset_token() -> str:
    return secrets.token_urlsafe(48)
