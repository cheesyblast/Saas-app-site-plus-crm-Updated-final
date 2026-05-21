"""POS barcode lookup + variant-level barcode CRUD.

Used by the POS to scan a barcode and instantly get the matching variant
+ product info to add to the bill. Also returns rich enough data so the
"Print labels" sheet in the admin can show product image + price next to
each barcode preview.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import require_admin
import models as M

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/admin/barcode/lookup/{code}")
async def lookup_barcode(code: str,
                         db: AsyncSession = Depends(get_db),
                         _: M.User = Depends(require_admin)):
    """Return the variant + product matching `code`. Looks up by `barcode`
    first then falls back to `sku` so legacy data still works.
    """
    code = (code or "").strip()
    if not code:
        raise HTTPException(400, "code is required")
    v = (await db.execute(
        select(M.Variant).where(M.Variant.barcode == code)
    )).scalars().first()
    if not v:
        v = (await db.execute(
            select(M.Variant).where(M.Variant.sku == code)
        )).scalars().first()
    if not v:
        # Maybe it's a product-level SKU
        p = (await db.execute(
            select(M.Product).where(M.Product.sku == code)
        )).scalars().first()
        if p:
            v = (await db.execute(
                select(M.Variant).where(M.Variant.product_id == p.id).limit(1)
            )).scalars().first()
    if not v:
        raise HTTPException(404, "No product matches this barcode")
    p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Variant has no product")
    price = v.price_override if v.price_override is not None else p.base_price
    return {
        "variant_id": v.id, "product_id": p.id, "product_name": p.name,
        "size": v.size, "color": v.color, "color_hex": v.color_hex,
        "sku": v.sku, "barcode": v.barcode, "price": price,
    }


@router.get("/admin/barcode/labels")
async def list_label_data(db: AsyncSession = Depends(get_db),
                          _: M.User = Depends(require_admin)):
    """Return every variant flat with print-ready label data so the admin
    can render a printable sheet client-side using JsBarcode."""
    variants = (await db.execute(select(M.Variant))).scalars().all()
    out = []
    for v in variants:
        p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one_or_none()
        if not p:
            continue
        price = v.price_override if v.price_override is not None else p.base_price
        out.append({
            "variant_id": v.id, "product_name": p.name,
            "size": v.size, "color": v.color, "sku": v.sku,
            "barcode": v.barcode or v.sku or v.id[:12],
            "price": price,
        })
    return out
