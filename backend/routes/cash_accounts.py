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


# ========== CASH ACCOUNTS ==========
class CashAccountIn(BaseModel):
    name: str
    kind: str = "cash"
    store_id: Optional[str] = None
    balance: float = 0.0
    active: bool = True


@router.get("/admin/cash-accounts")
async def list_cash_accounts(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.CashAccount).order_by(M.CashAccount.kind, M.CashAccount.name))).scalars().all()
    out = []
    for r in rows:
        store_name = ""
        if r.store_id:
            st = (await db.execute(select(M.Store).where(M.Store.id == r.store_id))).scalar_one_or_none()
            store_name = st.name if st else ""
        out.append({"id": r.id, "name": r.name, "kind": r.kind, "store_id": r.store_id,
                    "store_name": store_name, "balance": r.balance, "active": r.active})
    return out


@router.post("/admin/cash-accounts")
async def create_cash_account(payload: CashAccountIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    a = M.CashAccount(**payload.model_dump())
    db.add(a); await db.commit(); await db.refresh(a)
    return {"id": a.id}


@router.put("/admin/cash-accounts/{aid}")
async def update_cash_account(aid: str, payload: CashAccountIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    a = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == aid))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(a, k, v)
    await db.commit()
    return {"ok": True}


@router.delete("/admin/cash-accounts/{aid}")
async def delete_cash_account(aid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    a = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == aid))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Not found")
    await db.delete(a); await db.commit()
    return {"ok": True}


@router.get("/admin/cash-ledger")
async def list_cash_ledger(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                            cash_account_id: Optional[str] = None, limit: int = 200):
    base = select(M.CashLedger).order_by(desc(M.CashLedger.created_at)).limit(limit)
    if cash_account_id:
        base = base.where(M.CashLedger.cash_account_id == cash_account_id)
    rows = (await db.execute(base)).scalars().all()
    return [{"id": r.id, "cash_account_id": r.cash_account_id, "direction": r.direction,
             "amount": r.amount, "source_kind": r.source_kind, "source_id": r.source_id,
             "notes": r.notes, "created_at": r.created_at.isoformat()} for r in rows]


