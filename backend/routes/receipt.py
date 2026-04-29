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


# ========== PUBLIC RECEIPT (for SMS link) ==========
@router.get("/receipt/{order_number}")
async def public_receipt(order_number: str, db: AsyncSession = Depends(get_db)):
    """Returns a public-friendly receipt JSON. Used by /receipt/{n} frontend page."""
    o = (await db.execute(select(M.Order).where(M.Order.order_number == order_number))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Order not found")
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    items = (await db.execute(select(M.OrderItem).where(M.OrderItem.order_id == o.id))).scalars().all()
    return {
        "order_number": o.order_number, "status": o.status, "payment_status": o.payment_status,
        "payment_method": o.payment_method, "subtotal": o.subtotal, "discount": o.discount,
        "shipping": o.shipping, "total": o.total, "cash_tendered": o.cash_tendered, "cash_change": o.cash_change,
        "card_last4": o.card_last4, "customer_name": o.customer_name,
        "created_at": o.created_at.isoformat(),
        "items": [{"name": i.product_name, "variant": i.variant_label, "qty": i.quantity,
                   "unit": i.unit_price, "subtotal": i.subtotal} for i in items],
        "company": {"name": cs.company_name if cs else "Store", "address": cs.address if cs else None,
                    "phone": cs.phone if cs else None, "email": cs.email if cs else None,
                    "currency": cs.currency if cs else "LKR"},
    }


