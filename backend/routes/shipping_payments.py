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


# ========== SHIPPING & PAYMENTS ==========
@router.get("/locations")
async def get_locations():
    return {"districts": all_districts(), "by_district": SL_DISTRICT_CITIES}


@router.get("/shipping/quote")
async def shipping_quote(district: Optional[str] = None, city: Optional[str] = None, subtotal: float = 0.0, db: AsyncSession = Depends(get_db)):
    rules = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.active == True).order_by(M.ShippingRule.sort_order))).scalars().all()
    # Most specific (district+city) > district-only > default fallback (district null)
    matched = None
    for r in rules:
        if r.district and r.city and r.district == district and r.city == city:
            matched = r; break
    if not matched:
        for r in rules:
            if r.district and not r.city and r.district == district:
                matched = r; break
    if not matched:
        for r in rules:
            if not r.district and not r.city:
                matched = r; break
    fee = matched.fee if matched else 0.0
    if matched and matched.free_above is not None and subtotal >= matched.free_above:
        fee = 0.0
    return {"fee": fee, "matched_rule_id": matched.id if matched else None,
            "label": matched.label if matched else None}


def _shipping_rule_dict(r):
    return {"id": r.id, "district": r.district, "city": r.city, "fee": r.fee,
            "free_above": r.free_above, "label": r.label, "active": r.active, "sort_order": r.sort_order}


@router.get("/admin/shipping/rules")
async def list_shipping_rules(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.ShippingRule).order_by(M.ShippingRule.sort_order, M.ShippingRule.district, M.ShippingRule.city))).scalars().all()
    return [_shipping_rule_dict(r) for r in rows]


class ShippingRuleIn(BaseModel):
    district: Optional[str] = None
    city: Optional[str] = None
    fee: float = 0.0
    free_above: Optional[float] = None
    label: Optional[str] = None
    active: bool = True
    sort_order: int = 0


@router.post("/admin/shipping/rules")
async def create_shipping_rule(payload: ShippingRuleIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    r = M.ShippingRule(**payload.model_dump())
    db.add(r); await db.commit(); await db.refresh(r)
    return _shipping_rule_dict(r)


@router.put("/admin/shipping/rules/{rid}")
async def update_shipping_rule(rid: str, payload: ShippingRuleIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    r = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.id == rid))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(r, k, v)
    await db.commit()
    return _shipping_rule_dict(r)


@router.delete("/admin/shipping/rules/{rid}")
async def delete_shipping_rule(rid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    r = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.id == rid))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Not found")
    await db.delete(r); await db.commit()
    return {"ok": True}


def _payment_dict(p):
    return {"id": p.id, "code": p.code, "label": p.label, "description": p.description,
            "scope": p.scope, "active": p.active, "sort_order": p.sort_order, "config": p.config or {}}


@router.get("/payment-methods")
async def public_payment_methods(scope: str = "online", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(M.PaymentMethod).where(and_(M.PaymentMethod.scope == scope, M.PaymentMethod.active == True)).order_by(M.PaymentMethod.sort_order))).scalars().all()
    # Don't leak provider config publicly
    return [{"id": p.id, "code": p.code, "label": p.label, "description": p.description, "scope": p.scope} for p in rows]


@router.get("/admin/payment-methods")
async def list_payment_methods(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.PaymentMethod).order_by(M.PaymentMethod.scope, M.PaymentMethod.sort_order))).scalars().all()
    return [_payment_dict(p) for p in rows]


class PaymentMethodIn(BaseModel):
    code: str
    label: str
    description: Optional[str] = None
    scope: str = "online"
    active: bool = True
    sort_order: int = 0
    config: dict = {}


@router.post("/admin/payment-methods")
async def create_payment_method(payload: PaymentMethodIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = M.PaymentMethod(**payload.model_dump())
    db.add(p); await db.commit(); await db.refresh(p)
    return _payment_dict(p)


@router.put("/admin/payment-methods/{pid}")
async def update_payment_method(pid: str, payload: PaymentMethodIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.PaymentMethod).where(M.PaymentMethod.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    await db.commit()
    return _payment_dict(p)


@router.delete("/admin/payment-methods/{pid}")
async def delete_payment_method(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.PaymentMethod).where(M.PaymentMethod.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    await db.delete(p); await db.commit()
    return {"ok": True}


