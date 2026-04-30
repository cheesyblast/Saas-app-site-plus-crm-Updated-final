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


# ========== NOTIFICATION TEMPLATES ==========
EVENT_KEYS = [
    "order_placed", "order_paid", "order_shipped",
    "order_delivered", "order_cancelled", "order_refunded",
    "marketing_blast",
]


def _template_dict(t: M.NotificationTemplate) -> dict:
    return {
        "id": t.id, "event_key": t.event_key, "channel": t.channel,
        "name": t.name, "subject": t.subject, "body": t.body,
        "active": t.active, "is_default": t.is_default,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


class TemplateIn(BaseModel):
    event_key: str
    channel: str  # email | sms
    name: str
    subject: Optional[str] = None
    body: str
    active: bool = True
    is_default: bool = False


@router.get("/admin/marketing/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_admin),
    channel: Optional[str] = None,
    event_key: Optional[str] = None,
):
    q = select(M.NotificationTemplate).order_by(M.NotificationTemplate.event_key,
                                                 M.NotificationTemplate.channel,
                                                 desc(M.NotificationTemplate.is_default))
    if channel:
        q = q.where(M.NotificationTemplate.channel == channel)
    if event_key:
        q = q.where(M.NotificationTemplate.event_key == event_key)
    rows = (await db.execute(q)).scalars().all()
    return [_template_dict(t) for t in rows]


@router.post("/admin/marketing/templates")
async def create_template(payload: TemplateIn, db: AsyncSession = Depends(get_db),
                          _: M.User = Depends(require_admin)):
    if payload.event_key not in EVENT_KEYS:
        raise HTTPException(400, f"Invalid event_key. Allowed: {EVENT_KEYS}")
    if payload.channel not in ("email", "sms"):
        raise HTTPException(400, "channel must be 'email' or 'sms'")
    t = M.NotificationTemplate(**payload.model_dump())
    # Ensure only one default per (event_key, channel) at a time.
    if t.is_default:
        await db.execute(
            select(M.NotificationTemplate).where(
                M.NotificationTemplate.event_key == t.event_key,
                M.NotificationTemplate.channel == t.channel,
                M.NotificationTemplate.is_default == True,  # noqa: E712
            )
        )
        # Unset existing defaults inline
        existing = (await db.execute(select(M.NotificationTemplate).where(
            M.NotificationTemplate.event_key == t.event_key,
            M.NotificationTemplate.channel == t.channel,
            M.NotificationTemplate.is_default == True,  # noqa: E712
        ))).scalars().all()
        for x in existing:
            x.is_default = False
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _template_dict(t)


@router.put("/admin/marketing/templates/{tid}")
async def update_template(tid: str, payload: TemplateIn,
                          db: AsyncSession = Depends(get_db),
                          _: M.User = Depends(require_admin)):
    t = (await db.execute(select(M.NotificationTemplate).where(M.NotificationTemplate.id == tid))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    if t.is_default:
        existing = (await db.execute(select(M.NotificationTemplate).where(
            M.NotificationTemplate.event_key == t.event_key,
            M.NotificationTemplate.channel == t.channel,
            M.NotificationTemplate.is_default == True,  # noqa: E712
            M.NotificationTemplate.id != t.id,
        ))).scalars().all()
        for x in existing:
            x.is_default = False
    t.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _template_dict(t)


@router.delete("/admin/marketing/templates/{tid}")
async def delete_template(tid: str, db: AsyncSession = Depends(get_db),
                          _: M.User = Depends(require_admin)):
    t = (await db.execute(select(M.NotificationTemplate).where(M.NotificationTemplate.id == tid))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


# ========== BULK MARKETING SEND ==========
class BulkSendPayload(BaseModel):
    channel: str  # email | sms
    subject: Optional[str] = None
    body: str
    customer_ids: Optional[List[str]] = None  # None = all opted-in customers
    district: Optional[str] = None
    marketing_opt_in_only: bool = True


@router.post("/admin/marketing/bulk-send")
async def bulk_send(payload: BulkSendPayload,
                    db: AsyncSession = Depends(get_db),
                    _: M.User = Depends(require_admin)):
    """Queue an email/SMS blast to selected customers.

    Currently writes a NotificationLog row per recipient with status='queued'.
    The dispatch worker (Iter12+) will pick these up and call the configured
    provider. This is the SAME pipeline used for transactional notifications,
    so the merchant only needs to configure providers once (see /admin/integrations).
    """
    if payload.channel not in ("email", "sms"):
        raise HTTPException(400, "channel must be 'email' or 'sms'")

    q = select(M.Customer)
    if payload.customer_ids:
        q = q.where(M.Customer.id.in_(payload.customer_ids))
    else:
        if payload.district:
            q = q.where(M.Customer.district == payload.district)
        if payload.marketing_opt_in_only:
            q = q.where(M.Customer.marketing_opt_in == True)  # noqa: E712
    rows = (await db.execute(q)).scalars().all()

    address_field = "email" if payload.channel == "email" else "phone"
    queued = 0
    for c in rows:
        addr = getattr(c, address_field)
        if not addr:
            continue
        body = payload.body.replace("{{customer_name}}", c.name or "")\
                            .replace("{{first_name}}", (c.name or "").split()[0] if c.name else "")
        log = M.NotificationLog(
            channel=payload.channel,
            to_address=addr,
            subject=payload.subject if payload.channel == "email" else None,
            body=body,
            status="queued",
            provider="bulk-send",
        )
        db.add(log)
        queued += 1
    await db.commit()
    logger.info("bulk_send queued %s/%s recipients via %s", queued, len(rows), payload.channel)
    return {"ok": True, "queued": queued, "skipped": len(rows) - queued}


