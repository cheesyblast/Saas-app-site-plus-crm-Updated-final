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


# ========== CUSTOMERS ==========
@router.get("/admin/customers")
async def list_customers(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None, limit: int = 200):
    query = select(M.Customer).order_by(desc(M.Customer.created_at))
    if q:
        # Search by name, phone, email, or order_number
        # First check if a matching order_number exists
        order_match = (await db.execute(select(M.Order).where(M.Order.order_number.ilike(f"%{q}%")))).scalars().first()
        if order_match and order_match.customer_id:
            query = query.where(M.Customer.id == order_match.customer_id)
        else:
            # Phones are stored normalised in +94 E.164 form, so a cashier
            # typing "0771234567" must also match "+94771234567".
            normalised_phone = normalize_phone_lk(q)
            phone_clauses = [M.Customer.phone.ilike(f"%{q}%")]
            if normalised_phone and normalised_phone != q:
                phone_clauses.append(M.Customer.phone.ilike(f"%{normalised_phone}%"))
            query = query.where(or_(
                M.Customer.name.ilike(f"%{q}%"),
                *phone_clauses,
                M.Customer.email.ilike(f"%{q}%"),
            ))
    rows = (await db.execute(query.limit(limit))).scalars().all()
    return [{"id": c.id, "name": c.name, "email": c.email, "phone": c.phone, "address": c.address,
             "district": c.district, "city": c.city,
             "notes": c.notes, "total_orders": c.total_orders, "total_spent": c.total_spent,
             "created_at": c.created_at.isoformat()} for c in rows]


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None


class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None


@router.post("/admin/customers")
async def create_customer(payload: CustomerCreate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    # Auto-deduplicate by phone or email
    existing = None
    if payload.phone:
        existing = (await db.execute(select(M.Customer).where(M.Customer.phone == payload.phone))).scalar_one_or_none()
    if not existing and payload.email:
        existing = (await db.execute(select(M.Customer).where(M.Customer.email == payload.email))).scalar_one_or_none()
    if existing:
        return {"id": existing.id, "name": existing.name, "phone": existing.phone, "email": existing.email,
                "address": existing.address, "district": existing.district, "city": existing.city, "deduplicated": True}
    c = M.Customer(**payload.model_dump())
    db.add(c); await db.commit(); await db.refresh(c)
    return {"id": c.id, "name": c.name, "phone": c.phone, "email": c.email,
            "address": c.address, "district": c.district, "city": c.city}


@router.put("/admin/customers/{cid}")
async def update_customer(cid: str, payload: CustomerUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Customer).where(M.Customer.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await db.commit()
    return {"ok": True}


# Logged-in customer fetch own profile (for autofill)
@router.get("/my/profile")
async def my_profile(user: M.User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    customer = (await db.execute(select(M.Customer).where(M.Customer.user_id == user.user_id))).scalar_one_or_none()
    if not customer:
        return {"name": user.name, "email": user.email, "phone": user.phone}
    return {"name": customer.name, "email": customer.email, "phone": customer.phone,
            "address": customer.address, "district": customer.district, "city": customer.city}


