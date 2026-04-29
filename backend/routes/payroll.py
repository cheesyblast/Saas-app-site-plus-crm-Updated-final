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


# ========== PAYROLL ==========
class PayrollIn(BaseModel):
    staff_user_id: str
    month: int
    year: int
    base_salary: float
    bonus: float = 0.0
    deduction: float = 0.0
    status: str = "pending"


@router.get("/admin/payroll")
async def list_payroll(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Payroll).order_by(desc(M.Payroll.created_at)))).scalars().all()
    out = []
    for p in rows:
        u = (await db.execute(select(M.User).where(M.User.user_id == p.staff_user_id))).scalar_one_or_none()
        out.append({"id": p.id, "staff_user_id": p.staff_user_id, "staff_name": u.name if u else "",
                    "month": p.month, "year": p.year, "base_salary": p.base_salary, "bonus": p.bonus,
                    "deduction": p.deduction, "net": p.net, "status": p.status,
                    "paid_date": p.paid_date.isoformat() if p.paid_date else None})
    return out


@router.post("/admin/payroll")
async def create_payroll(payload: PayrollIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    net = payload.base_salary + payload.bonus - payload.deduction
    p = M.Payroll(**payload.model_dump(), net=net)
    if payload.status == "paid":
        p.paid_date = datetime.now(timezone.utc)
    db.add(p); await db.commit(); await db.refresh(p)
    return {"id": p.id}


@router.put("/admin/payroll/{pid}/pay")
async def mark_payroll_paid(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Payroll).where(M.Payroll.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    p.status = "paid"; p.paid_date = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


