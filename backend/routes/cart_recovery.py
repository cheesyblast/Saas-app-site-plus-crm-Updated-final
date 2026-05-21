"""Cart abandonment recovery.

Flow:
  1. Storefront calls POST /api/cart/sync whenever the customer's cart
     changes and we have their email/phone (e.g. they reached checkout
     and started typing contact info, or they signed in). A CartSession
     row is upserted.
  2. On a successful POST /api/checkout, the corresponding CartSession is
     marked converted (we de-dupe by email/phone of the placed order).
  3. A lightweight background task wakes up every 60 seconds and, IF the
     merchant has cart_recovery_enabled=true, looks for sessions where
     last_seen_at < now - threshold, converted_at is null, reminded_at is
     null, and the contact has an email or phone. It dispatches the
     `abandoned_cart` template and stamps `reminded_at`.

We never spam: at most one reminder per session, controlled by the
admin from Marketing → Abandonment.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AsyncSessionLocal
from auth import require_admin
import models as M

logger = logging.getLogger(__name__)
router = APIRouter()


class CartItem(BaseModel):
    variant_id: str
    quantity: int = 1
    name: Optional[str] = None
    price: Optional[float] = None


class CartSyncPayload(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    items: List[CartItem] = []
    estimated_total: Optional[float] = 0.0


@router.post("/cart/sync")
async def cart_sync(payload: CartSyncPayload, db: AsyncSession = Depends(get_db)):
    """Public endpoint — anyone can call. Identifies a cart by (email,phone)
    pair and upserts. Returns the session id so the client can pass it back
    on POST /checkout if it wants to (we also de-dupe by email/phone there).
    """
    if not payload.customer_email and not payload.customer_phone:
        return {"ok": True, "id": None, "skipped": "no contact info"}
    if not payload.items:
        return {"ok": True, "id": None, "skipped": "empty cart"}

    # Find an existing UN-converted session for this contact
    conds = []
    if payload.customer_email:
        conds.append(M.CartSession.customer_email == payload.customer_email)
    if payload.customer_phone:
        conds.append(M.CartSession.customer_phone == payload.customer_phone)
    session = (await db.execute(
        select(M.CartSession).where(and_(
            or_(*conds), M.CartSession.converted_at.is_(None),
        )).order_by(M.CartSession.last_seen_at.desc())
    )).scalars().first()

    items_json = [i.dict() for i in payload.items]
    count = sum(i.quantity for i in payload.items)
    now = datetime.now(timezone.utc)
    if session:
        session.items_json = items_json
        session.items_count = count
        session.estimated_total = float(payload.estimated_total or 0)
        session.customer_name = payload.customer_name or session.customer_name
        session.customer_id = payload.customer_id or session.customer_id
        if payload.customer_email and not session.customer_email:
            session.customer_email = payload.customer_email
        if payload.customer_phone and not session.customer_phone:
            session.customer_phone = payload.customer_phone
        session.last_seen_at = now
        # If they already received a reminder but came back active, clear it
        # so the next abandonment can re-trigger.
        if session.reminded_at:
            session.reminded_at = None
            session.reminded_channel = None
    else:
        session = M.CartSession(
            customer_id=payload.customer_id,
            customer_name=payload.customer_name,
            customer_email=payload.customer_email,
            customer_phone=payload.customer_phone,
            items_json=items_json, items_count=count,
            estimated_total=float(payload.estimated_total or 0),
            last_seen_at=now,
        )
        db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"ok": True, "id": session.id}


async def mark_converted_for(db: AsyncSession, email: Optional[str], phone: Optional[str]):
    """Called from POST /checkout success — mark any open sessions for this
    contact as converted so the worker stops chasing them."""
    if not email and not phone:
        return
    conds = []
    if email:
        conds.append(M.CartSession.customer_email == email)
    if phone:
        conds.append(M.CartSession.customer_phone == phone)
    sessions = (await db.execute(
        select(M.CartSession).where(and_(
            or_(*conds), M.CartSession.converted_at.is_(None),
        ))
    )).scalars().all()
    now = datetime.now(timezone.utc)
    for s in sessions:
        s.converted_at = now


# ---------- Admin: list + config ----------

@router.get("/admin/cart-sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_admin),
    state: str = "open",  # open | reminded | converted | all
):
    q = select(M.CartSession).order_by(M.CartSession.last_seen_at.desc())
    if state == "open":
        q = q.where(and_(M.CartSession.converted_at.is_(None), M.CartSession.reminded_at.is_(None)))
    elif state == "reminded":
        q = q.where(and_(M.CartSession.converted_at.is_(None), M.CartSession.reminded_at.is_not(None)))
    elif state == "converted":
        q = q.where(M.CartSession.converted_at.is_not(None))
    rows = (await db.execute(q.limit(200))).scalars().all()
    return [{
        "id": r.id, "name": r.customer_name, "email": r.customer_email, "phone": r.customer_phone,
        "items_count": r.items_count, "estimated_total": r.estimated_total,
        "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
        "reminded_at": r.reminded_at.isoformat() if r.reminded_at else None,
        "reminded_channel": r.reminded_channel,
        "converted_at": r.converted_at.isoformat() if r.converted_at else None,
    } for r in rows]


@router.post("/admin/cart-sessions/run-worker")
async def trigger_worker_now(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    """Manually fire the abandonment worker — useful for testing."""
    result = await _run_abandonment_pass(db)
    return {"ok": True, **result}


# ---------- Background worker ----------

async def _run_abandonment_pass(db: AsyncSession) -> dict:
    """Single pass of the abandonment dispatcher.

    Picks up sessions older than the merchant's threshold and sends one
    reminder via the configured channels. Returns counters for telemetry.
    """
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    if not cs or not cs.cart_recovery_enabled:
        return {"sent_email": 0, "sent_sms": 0, "skipped": 0, "checked": 0, "reason": "disabled"}
    threshold_min = cs.cart_recovery_after_min or 60
    channels = [c.strip() for c in (cs.cart_recovery_channels or "email,sms").split(",") if c.strip()]
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=threshold_min)

    rows = (await db.execute(
        select(M.CartSession).where(and_(
            M.CartSession.last_seen_at < cutoff,
            M.CartSession.converted_at.is_(None),
            M.CartSession.reminded_at.is_(None),
            M.CartSession.items_count > 0,
        )).limit(200)
    )).scalars().all()

    if not rows:
        return {"sent_email": 0, "sent_sms": 0, "skipped": 0, "checked": 0}

    # Lazy imports to avoid circular import at module load time.
    from dispatcher import dispatch, render_template_for_event
    from routes.orders import _resolve_brand_name

    brand = await _resolve_brand_name(db)
    sent_email = sent_sms = skipped = 0
    for r in rows:
        ctx = {
            "customer_name": r.customer_name or "",
            "first_name": (r.customer_name or "").split()[0] if r.customer_name else "",
            "total": f"{(r.estimated_total or 0):.2f}",
            "tracking_url": "/checkout",
            "brand_name": brand,
        }
        used_channel = None
        if "email" in channels and r.customer_email:
            subject, body, body_html = await render_template_for_event(
                db, "abandoned_cart", "email", ctx,
                f"You left items in your cart · {brand}",
                f"Hi {ctx['first_name']}, your cart at {brand} is still waiting. Complete checkout: /checkout",
            )
            try:
                status, prov = await dispatch(db, "email", r.customer_email, subject, body, body_html=body_html)
            except Exception as e:
                logger.warning("cart recovery email failed for %s: %s", r.customer_email, e)
                status = "failed"
            if status == "sent":
                sent_email += 1
                used_channel = "email"
        if not used_channel and "sms" in channels and r.customer_phone:
            _, body, _ = await render_template_for_event(
                db, "abandoned_cart", "sms", ctx, None,
                f"{brand}: Hi {ctx['first_name']}, your cart is waiting. Complete order: /checkout",
            )
            try:
                status, prov = await dispatch(db, "sms", r.customer_phone, None, body)
            except Exception as e:
                logger.warning("cart recovery sms failed for %s: %s", r.customer_phone, e)
                status = "failed"
            if status == "sent":
                sent_sms += 1
                used_channel = "sms"
        if used_channel:
            r.reminded_at = datetime.now(timezone.utc)
            r.reminded_channel = used_channel
        else:
            skipped += 1
    await db.commit()
    return {"checked": len(rows), "sent_email": sent_email, "sent_sms": sent_sms, "skipped": skipped}


_worker_task: Optional[asyncio.Task] = None


async def _worker_loop():
    """Background task — wakes up every 60s and runs a pass."""
    await asyncio.sleep(20)  # let app finish starting
    while True:
        try:
            async with AsyncSessionLocal() as db:
                res = await _run_abandonment_pass(db)
                if res.get("sent_email", 0) or res.get("sent_sms", 0):
                    logger.info("cart-recovery pass: %s", res)
        except Exception as e:
            logger.exception("cart-recovery worker crashed: %s", e)
        await asyncio.sleep(60)


def start_worker(app):
    """Call once at FastAPI startup to spawn the loop. Safe to call multiple
    times — we cancel any prior task first so reload doesn't double-run."""
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
    _worker_task = asyncio.create_task(_worker_loop())
    logger.info("cart-recovery worker started")
