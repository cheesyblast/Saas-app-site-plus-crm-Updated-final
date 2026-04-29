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


# ========== SUPPLIERS ==========
class SupplierIn(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


def _supplier_dict(s):
    return {"id": s.id, "name": s.name, "contact_person": s.contact_person, "phone": s.phone,
            "email": s.email, "address": s.address, "notes": s.notes,
            "balance_owed": s.balance_owed, "total_purchases": s.total_purchases, "total_paid": s.total_paid,
            "active": s.active, "created_at": s.created_at.isoformat()}


@router.get("/admin/suppliers")
async def list_suppliers(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                          q: Optional[str] = None, page: int = 1, page_size: int = 50):
    base = select(M.Supplier)
    if q:
        base = base.where(or_(M.Supplier.name.ilike(f"%{q}%"), M.Supplier.phone.ilike(f"%{q}%"),
                              M.Supplier.email.ilike(f"%{q}%")))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    page_size = min(max(1, page_size), 100); page = max(1, page)
    rows = (await db.execute(base.order_by(desc(M.Supplier.created_at)).offset((page-1)*page_size).limit(page_size))).scalars().all()
    return {"items": [_supplier_dict(s) for s in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/admin/suppliers")
async def create_supplier(payload: SupplierIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = M.Supplier(**payload.model_dump())
    db.add(s); await db.commit(); await db.refresh(s)
    return _supplier_dict(s)


@router.put("/admin/suppliers/{sid}")
async def update_supplier(sid: str, payload: SupplierIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Supplier).where(M.Supplier.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    await db.commit()
    return _supplier_dict(s)


@router.delete("/admin/suppliers/{sid}")
async def delete_supplier(sid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Supplier).where(M.Supplier.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    await db.delete(s); await db.commit()
    return {"ok": True}


class SupplierInvoiceIn(BaseModel):
    supplier_id: str
    reference: Optional[str] = None
    amount: float
    notes: Optional[str] = None
    invoice_date: Optional[datetime] = None


@router.get("/admin/suppliers/{sid}/invoices")
async def list_supplier_invoices(sid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.SupplierInvoice).where(M.SupplierInvoice.supplier_id == sid)
                              .order_by(desc(M.SupplierInvoice.invoice_date)))).scalars().all()
    return [{"id": r.id, "reference": r.reference, "amount": r.amount, "paid": r.paid, "balance": r.amount - r.paid,
             "notes": r.notes, "invoice_date": r.invoice_date.isoformat()} for r in rows]


@router.post("/admin/supplier-invoices")
async def create_supplier_invoice(payload: SupplierInvoiceIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Supplier).where(M.Supplier.id == payload.supplier_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Supplier not found")
    inv = M.SupplierInvoice(supplier_id=payload.supplier_id, reference=payload.reference,
                             amount=payload.amount, notes=payload.notes,
                             invoice_date=payload.invoice_date or datetime.now(timezone.utc),
                             created_by=user.user_id)
    db.add(inv)
    s.total_purchases += payload.amount
    s.balance_owed += payload.amount
    await db.commit(); await db.refresh(inv)
    return {"id": inv.id}


class SupplierPayIn(BaseModel):
    supplier_id: str
    invoice_id: Optional[str] = None
    amount: float
    method: str = "cash"
    cash_account_id: Optional[str] = None
    notes: Optional[str] = None


@router.post("/admin/supplier-payments")
async def pay_supplier(payload: SupplierPayIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Supplier).where(M.Supplier.id == payload.supplier_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Supplier not found")
    pay = M.SupplierPayment(supplier_id=payload.supplier_id, invoice_id=payload.invoice_id,
                             amount=payload.amount, method=payload.method,
                             cash_account_id=payload.cash_account_id, notes=payload.notes,
                             created_by=user.user_id)
    db.add(pay)
    s.total_paid += payload.amount
    s.balance_owed = max(0.0, s.balance_owed - payload.amount)
    if payload.invoice_id:
        inv = (await db.execute(select(M.SupplierInvoice).where(M.SupplierInvoice.id == payload.invoice_id))).scalar_one_or_none()
        if inv:
            inv.paid = min(inv.amount, inv.paid + payload.amount)
    if payload.cash_account_id:
        ca = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == payload.cash_account_id))).scalar_one_or_none()
        if ca:
            ca.balance -= payload.amount
            db.add(M.CashLedger(cash_account_id=ca.id, direction="out", amount=payload.amount,
                                source_kind="supplier", source_id=pay.id,
                                notes=f"Paid {s.name}", created_by=user.user_id))
    await db.commit(); await db.refresh(pay)
    return {"id": pay.id, "balance_owed": s.balance_owed}


