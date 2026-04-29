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


# ========== INVENTORY ==========
@router.get("/admin/inventory")
async def list_inventory(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                         q: Optional[str] = None, store_id: Optional[str] = None,
                         page: int = 1, page_size: int = 50):
    rows = (await db.execute(select(M.Inventory))).scalars().all()
    out = []
    for iv in rows:
        if store_id and iv.store_id != store_id:
            continue
        v = (await db.execute(select(M.Variant).where(M.Variant.id == iv.variant_id))).scalar_one_or_none()
        p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one_or_none() if v else None
        s = (await db.execute(select(M.Store).where(M.Store.id == iv.store_id))).scalar_one_or_none()
        if q and p:
            q_low = q.lower()
            if q_low not in (p.name or "").lower() and q_low not in (v.sku or "").lower() and q_low not in (v.color or "").lower():
                continue
        out.append({
            "id": iv.id, "variant_id": iv.variant_id, "store_id": iv.store_id,
            "store_name": s.name if s else "", "quantity": iv.quantity,
            "low_stock_threshold": iv.low_stock_threshold,
            "product_name": p.name if p else "", "product_id": p.id if p else None,
            "variant_label": f"{v.size or ''} / {v.color or ''}" if v else "",
            "sku": v.sku if v else None, "low": iv.quantity <= iv.low_stock_threshold,
            "_created": v.created_at.isoformat() if v else "",
        })
    out.sort(key=lambda r: r.get("_created", ""), reverse=True)
    total = len(out)
    page_size = min(max(1, page_size), 100); page = max(1, page)
    start = (page - 1) * page_size
    items = out[start:start + page_size]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


class StockMoveIn(BaseModel):
    variant_id: str
    store_id: Optional[str] = None
    type: str
    quantity: int
    reason: Optional[str] = None
    reference: Optional[str] = None


@router.post("/admin/stock-movements")
async def create_stock_movement(payload: StockMoveIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_perm("move_stocks"))):
    store = await _ensure_default_store(db)
    sid = payload.store_id or store.id
    inv = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == payload.variant_id, M.Inventory.store_id == sid)))).scalar_one_or_none()
    if not inv:
        inv = M.Inventory(variant_id=payload.variant_id, store_id=sid, quantity=0)
        db.add(inv); await db.flush()
    if payload.type == "in":
        inv.quantity += payload.quantity
    elif payload.type == "out":
        inv.quantity = max(0, inv.quantity - payload.quantity)
    elif payload.type == "adjust":
        inv.quantity = payload.quantity
    db.add(M.StockMovement(variant_id=payload.variant_id, store_id=sid, type=payload.type,
                            quantity=payload.quantity, reason=payload.reason,
                            reference=payload.reference, user_id=user.user_id))
    await db.commit()
    return {"ok": True, "new_quantity": inv.quantity}


class TransferIn(BaseModel):
    variant_id: str
    from_store_id: str
    to_store_id: str
    quantity: int
    reason: Optional[str] = None


@router.post("/admin/inventory/transfer")
async def transfer_stock(payload: TransferIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_perm("move_stocks"))):
    if payload.from_store_id == payload.to_store_id:
        raise HTTPException(400, "Same source and destination")
    if payload.quantity <= 0:
        raise HTTPException(400, "Quantity must be > 0")
    src = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == payload.variant_id, M.Inventory.store_id == payload.from_store_id)))).scalar_one_or_none()
    if not src or src.quantity < payload.quantity:
        raise HTTPException(400, "Insufficient stock at source")
    dst = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == payload.variant_id, M.Inventory.store_id == payload.to_store_id)))).scalar_one_or_none()
    if not dst:
        dst = M.Inventory(variant_id=payload.variant_id, store_id=payload.to_store_id, quantity=0)
        db.add(dst); await db.flush()
    src.quantity -= payload.quantity
    dst.quantity += payload.quantity
    ref = f"TRF-{uuid.uuid4().hex[:6].upper()}"
    db.add(M.StockMovement(variant_id=payload.variant_id, store_id=payload.from_store_id,
                            type="transfer_out", quantity=payload.quantity,
                            reason=payload.reason or "Transfer", reference=ref, user_id=user.user_id))
    db.add(M.StockMovement(variant_id=payload.variant_id, store_id=payload.to_store_id,
                            type="transfer_in", quantity=payload.quantity,
                            reason=payload.reason or "Transfer", reference=ref, user_id=user.user_id))
    await db.commit()
    return {"ok": True, "reference": ref, "from_qty": src.quantity, "to_qty": dst.quantity}


@router.get("/admin/stock-movements")
async def list_stock_movements(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), limit: int = 100):
    rows = (await db.execute(select(M.StockMovement).order_by(desc(M.StockMovement.created_at)).limit(limit))).scalars().all()
    out = []
    for m in rows:
        v = (await db.execute(select(M.Variant).where(M.Variant.id == m.variant_id))).scalar_one_or_none()
        p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one_or_none() if v else None
        s = (await db.execute(select(M.Store).where(M.Store.id == m.store_id))).scalar_one_or_none()
        out.append({
            "id": m.id, "type": m.type, "quantity": m.quantity, "reason": m.reason,
            "reference": m.reference, "store_name": s.name if s else "",
            "product_name": p.name if p else "",
            "variant_label": f"{v.size or ''} / {v.color or ''}" if v else "",
            "created_at": m.created_at.isoformat(),
        })
    return out


