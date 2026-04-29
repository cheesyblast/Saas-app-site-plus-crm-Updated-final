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


# ========== MARKETING ==========
class CampaignIn(BaseModel):
    name: str; channel: str; status: str = "draft"
    spend: float = 0.0; revenue: float = 0.0; reach: int = 0
    clicks: int = 0; conversions: int = 0
    start_date: Optional[datetime] = None; end_date: Optional[datetime] = None


@router.get("/admin/marketing/campaigns")
async def list_campaigns(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.MarketingCampaign).order_by(desc(M.MarketingCampaign.created_at)))).scalars().all()
    return [{"id": c.id, "name": c.name, "channel": c.channel, "status": c.status,
             "spend": c.spend, "revenue": c.revenue, "reach": c.reach, "clicks": c.clicks,
             "conversions": c.conversions,
             "roi": round((c.revenue - c.spend) / c.spend * 100, 2) if c.spend else 0} for c in rows]


@router.post("/admin/marketing/campaigns")
async def create_campaign(payload: CampaignIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.MarketingCampaign(**payload.model_dump())
    db.add(c); await db.commit(); await db.refresh(c)
    return {"id": c.id}


@router.put("/admin/marketing/campaigns/{cid}")
async def update_campaign(cid: str, payload: CampaignIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.MarketingCampaign).where(M.MarketingCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    await db.commit()
    return {"ok": True}


@router.delete("/admin/marketing/campaigns/{cid}")
async def delete_campaign(cid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.MarketingCampaign).where(M.MarketingCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    await db.delete(c); await db.commit()
    return {"ok": True}


@router.get("/admin/notifications")
async def list_notifications(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), limit: int = 50):
    rows = (await db.execute(select(M.NotificationLog).order_by(desc(M.NotificationLog.created_at)).limit(limit))).scalars().all()
    return [{"id": n.id, "channel": n.channel, "to": n.to_address, "subject": n.subject,
             "body": n.body, "related_order": n.related_order, "status": n.status,
             "provider": n.provider, "created_at": n.created_at.isoformat()} for n in rows]


