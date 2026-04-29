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


# ========== INTEGRATION SETTINGS (SMTP/SendGrid/Brevo/Twilio/Notify.lk) ==========
class IntegrationIn(BaseModel):
    kind: str  # email, sms
    provider: str
    label: Optional[str] = None
    config: dict = {}
    active: bool = False
    is_default: bool = False


def _integration_dict(i: M.IntegrationSetting):
    return {"id": i.id, "kind": i.kind, "provider": i.provider, "label": i.label,
            "config": i.config or {}, "active": i.active, "is_default": i.is_default,
            "created_at": i.created_at.isoformat()}


@router.get("/admin/integrations")
async def list_integrations(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.IntegrationSetting).order_by(M.IntegrationSetting.kind, M.IntegrationSetting.created_at))).scalars().all()
    return [_integration_dict(i) for i in rows]


@router.post("/admin/integrations")
async def create_integration(payload: IntegrationIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    if payload.is_default:
        existing = (await db.execute(select(M.IntegrationSetting).where(M.IntegrationSetting.kind == payload.kind))).scalars().all()
        for e in existing:
            e.is_default = False
    i = M.IntegrationSetting(**payload.model_dump())
    db.add(i)
    await db.commit()
    await db.refresh(i)
    return _integration_dict(i)


@router.put("/admin/integrations/{iid}")
async def update_integration(iid: str, payload: IntegrationIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    i = (await db.execute(select(M.IntegrationSetting).where(M.IntegrationSetting.id == iid))).scalar_one_or_none()
    if not i:
        raise HTTPException(404, "Not found")
    if payload.is_default:
        for e in (await db.execute(select(M.IntegrationSetting).where(and_(M.IntegrationSetting.kind == payload.kind, M.IntegrationSetting.id != iid)))).scalars().all():
            e.is_default = False
    for k, v in payload.model_dump().items():
        setattr(i, k, v)
    await db.commit()
    return _integration_dict(i)


@router.delete("/admin/integrations/{iid}")
async def delete_integration(iid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    i = (await db.execute(select(M.IntegrationSetting).where(M.IntegrationSetting.id == iid))).scalar_one_or_none()
    if not i:
        raise HTTPException(404, "Not found")
    await db.delete(i)
    await db.commit()
    return {"ok": True}


