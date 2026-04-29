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


# ========== EXPENSES ==========
class ExpenseIn(BaseModel):
    category: str
    amount: float
    description: Optional[str] = None
    expense_date: Optional[datetime] = None
    store_id: Optional[str] = None
    method: str = "cash"
    cash_account_id: Optional[str] = None


@router.get("/admin/expenses")
async def list_expenses(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                         q: Optional[str] = None, page: int = 1, page_size: int = 50,
                         store_id: Optional[str] = None):
    base = select(M.Expense)
    if q:
        base = base.where(or_(M.Expense.category.ilike(f"%{q}%"), M.Expense.description.ilike(f"%{q}%")))
    if store_id:
        base = base.where(M.Expense.store_id == store_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    page_size = min(max(1, page_size), 100); page = max(1, page)
    rows = (await db.execute(base.order_by(desc(M.Expense.expense_date)).offset((page-1)*page_size).limit(page_size))).scalars().all()
    items = [{"id": e.id, "category": e.category, "amount": e.amount, "description": e.description,
              "store_id": e.store_id, "method": e.method, "cash_account_id": e.cash_account_id,
              "expense_date": e.expense_date.isoformat()} for e in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/admin/expenses")
async def create_expense(payload: ExpenseIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_perm("manual_inc_exp"))):
    e = M.Expense(**payload.model_dump(exclude_unset=True))
    e.created_by = user.user_id
    if not e.expense_date:
        e.expense_date = datetime.now(timezone.utc)
    db.add(e); await db.flush()
    # Cash ledger if assigned to an account
    if payload.cash_account_id:
        ca = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == payload.cash_account_id))).scalar_one_or_none()
        if ca:
            ca.balance -= payload.amount
            db.add(M.CashLedger(cash_account_id=ca.id, direction="out", amount=payload.amount,
                                source_kind="expense", source_id=e.id,
                                notes=f"{e.category}: {e.description or ''}",
                                created_by=user.user_id))
    await db.commit(); await db.refresh(e)
    return {"id": e.id}


@router.delete("/admin/expenses/{eid}")
async def delete_expense(eid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    e = (await db.execute(select(M.Expense).where(M.Expense.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Not found")
    await db.delete(e); await db.commit()
    return {"ok": True}


