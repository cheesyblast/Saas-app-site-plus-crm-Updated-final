import os
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx
from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, UserSession

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Role helpers
ADMIN_ROLES = {"super_admin", "manager", "sales_staff", "inventory_staff", "accountant"}


async def fetch_emergent_profile(session_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as cli:
        r = await cli.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        return r.json()


async def get_session_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
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
    result = await db.execute(select(UserSession).where(UserSession.session_token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = (await db.execute(select(User).where(User.user_id == session.user_id))).scalar_one_or_none()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


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


async def create_session_for_user(db: AsyncSession, user: User, session_token: str) -> UserSession:
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    sess = UserSession(session_token=session_token, user_id=user.user_id, expires_at=expires_at)
    db.add(sess)
    await db.commit()
    await db.refresh(sess)
    return sess
