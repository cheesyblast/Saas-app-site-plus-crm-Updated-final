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


# ========== PRODUCTS ==========
class VariantIn(BaseModel):
    id: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    color_hex: Optional[str] = None
    price_override: Optional[float] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    stock: int = 0


class ProductIn(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    supplier_id: Optional[str] = None
    base_price: float
    compare_price: Optional[float] = None
    cost_price: Optional[float] = None
    sku: Optional[str] = None
    status: str = "active"
    featured: bool = False
    shipping_note: Optional[str] = None
    returns_note: Optional[str] = None
    variants: List[VariantIn] = []


async def product_to_dict(p: M.Product, db: AsyncSession, include_details: bool = True):
    data = {
        "id": p.id, "name": p.name, "slug": p.slug, "description": p.description,
        "category_id": p.category_id, "supplier_id": p.supplier_id,
        "base_price": p.base_price, "compare_price": p.compare_price, "cost_price": p.cost_price,
        "sku": p.sku, "status": p.status, "featured": p.featured,
        "shipping_note": p.shipping_note, "returns_note": p.returns_note,
        "created_at": p.created_at.isoformat(),
    }
    imgs_q = await db.execute(
        select(M.ProductImage.id, M.ProductImage.mime_type, M.ProductImage.is_primary, M.ProductImage.sort_order, M.ProductImage.color)
        .where(M.ProductImage.product_id == p.id).order_by(M.ProductImage.sort_order)
    )
    imgs = imgs_q.all()
    if include_details:
        data["images"] = [{"id": i.id, "url": f"/api/images/{i.id}", "mime_type": i.mime_type,
                          "is_primary": i.is_primary, "color": i.color} for i in imgs]
    else:
        primary = [i for i in imgs if i.is_primary] or (imgs[:1] if imgs else [])
        data["images"] = [{"id": i.id, "url": f"/api/images/{i.id}", "mime_type": i.mime_type,
                          "is_primary": True, "color": i.color} for i in primary]
    if include_details:
        variants = (await db.execute(select(M.Variant).where(M.Variant.product_id == p.id))).scalars().all()
        inv_map = {}
        if variants:
            for iv in (await db.execute(select(M.Inventory).where(M.Inventory.variant_id.in_([v.id for v in variants])))).scalars().all():
                inv_map[iv.variant_id] = inv_map.get(iv.variant_id, 0) + iv.quantity
        data["variants"] = [{"id": v.id, "size": v.size, "color": v.color, "color_hex": v.color_hex,
                            "price_override": v.price_override, "sku": v.sku, "barcode": v.barcode,
                            "stock": inv_map.get(v.id, 0)}
                           for v in variants]
        cat = (await db.execute(select(M.Category).where(M.Category.id == p.category_id))).scalar_one_or_none() if p.category_id else None
        data["category"] = {"id": cat.id, "name": cat.name, "slug": cat.slug} if cat else None
    return data


async def products_to_list(rows, db: AsyncSession):
    if not rows:
        return []
    pids = [p.id for p in rows]
    imgs_q = await db.execute(
        select(M.ProductImage.id, M.ProductImage.product_id, M.ProductImage.mime_type, M.ProductImage.is_primary, M.ProductImage.sort_order, M.ProductImage.color)
        .where(M.ProductImage.product_id.in_(pids)).order_by(M.ProductImage.sort_order)
    )
    imgs_by_pid = {}
    for i in imgs_q.all():
        imgs_by_pid.setdefault(i.product_id, []).append(i)
    cat_ids = list({p.category_id for p in rows if p.category_id})
    cats = {}
    if cat_ids:
        for c in (await db.execute(select(M.Category).where(M.Category.id.in_(cat_ids)))).scalars().all():
            cats[c.id] = {"id": c.id, "name": c.name, "slug": c.slug}
    out = []
    for p in rows:
        pimgs = imgs_by_pid.get(p.id, [])
        primary = [i for i in pimgs if i.is_primary] or (pimgs[:1] if pimgs else [])
        out.append({
            "id": p.id, "name": p.name, "slug": p.slug, "base_price": p.base_price,
            "compare_price": p.compare_price, "featured": p.featured, "status": p.status,
            "category": cats.get(p.category_id),
            "images": [{"id": i.id, "url": f"/api/images/{i.id}", "mime_type": i.mime_type, "is_primary": True, "color": i.color} for i in primary],
        })
    return out


@router.get("/products")
async def list_products(
    db: AsyncSession = Depends(get_db),
    category: Optional[str] = None, featured: Optional[bool] = None,
    search: Optional[str] = None, limit: int = 50, exclude_id: Optional[str] = None,
):
    q = select(M.Product).where(M.Product.status == "active")
    if category:
        # Resolve category slug + all descendant categories
        cat = (await db.execute(select(M.Category).where(M.Category.slug == category))).scalar_one_or_none()
        if cat:
            all_cats = (await db.execute(select(M.Category))).scalars().all()
            flat = [{"id": c.id, "parent_id": c.parent_id} for c in all_cats]
            ids = _descendant_ids(flat, cat.id)
            q = q.where(M.Product.category_id.in_(list(ids)))
    if featured:
        q = q.where(M.Product.featured == True)
    if search:
        q = q.where(M.Product.name.ilike(f"%{search}%"))
    if exclude_id:
        q = q.where(M.Product.id != exclude_id)
    q = q.order_by(desc(M.Product.created_at)).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return await products_to_list(rows, db)


@router.get("/products/{slug}")
async def get_product(slug: str, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(M.Product).where(M.Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    return await product_to_dict(p, db, include_details=True)


@router.get("/admin/products")
async def admin_list_products(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                               q: Optional[str] = None, page: int = 1, page_size: int = 50,
                               store_id: Optional[str] = None, in_stock: bool = False):
    base = select(M.Product)
    if q:
        base = base.where(or_(M.Product.name.ilike(f"%{q}%"), M.Product.sku.ilike(f"%{q}%")))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    page_size = min(max(1, page_size), 100); page = max(1, page)
    rows = (await db.execute(base.order_by(desc(M.Product.created_at)).offset((page-1)*page_size).limit(page_size))).scalars().all()
    items = [await product_to_dict(p, db, include_details=True) for p in rows]
    # Optional store-stock filter (used by POS): only keep variants with positive stock at the chosen store
    if store_id and in_stock:
        invs = (await db.execute(select(M.Inventory).where(M.Inventory.store_id == store_id))).scalars().all()
        stock_map = {iv.variant_id: iv.quantity for iv in invs}
        filtered = []
        for p in items:
            keep_variants = []
            for v in p.get("variants", []):
                qty = stock_map.get(v["id"], 0)
                v["stock"] = qty
                if qty > 0:
                    keep_variants.append(v)
            if keep_variants:
                p["variants"] = keep_variants
                filtered.append(p)
        items = filtered
        total = len(items)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/images/{img_id}")
async def stream_image(img_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(M.ProductImage.data_base64, M.ProductImage.mime_type).where(M.ProductImage.id == img_id)
    )).first()
    if not row:
        raise HTTPException(404, "Not found")
    try:
        raw = _b64.b64decode(row.data_base64)
    except Exception:
        raise HTTPException(500, "Corrupt image")
    return FastResponse(content=raw, media_type=row.mime_type or "image/png",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


async def _ensure_default_store_DEPRECATED_INLINE(db: AsyncSession) -> M.Store:
    # Now imported from deps; this stub left intentionally unused. Replaced via from deps import.
    pass


@router.post("/admin/products")
async def create_product(payload: ProductIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    store = await _ensure_default_store(db)
    slug = slugify(payload.name) + "-" + uuid.uuid4().hex[:4]
    p = M.Product(
        name=payload.name, slug=slug, description=payload.description,
        category_id=payload.category_id, supplier_id=payload.supplier_id,
        base_price=payload.base_price, compare_price=payload.compare_price,
        cost_price=payload.cost_price, sku=payload.sku,
        status=payload.status, featured=payload.featured,
        shipping_note=payload.shipping_note, returns_note=payload.returns_note,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    for v in payload.variants:
        variant = M.Variant(product_id=p.id, size=v.size, color=v.color, color_hex=v.color_hex,
                            price_override=v.price_override, sku=v.sku, barcode=v.barcode)
        db.add(variant)
        await db.flush()
        db.add(M.Inventory(variant_id=variant.id, store_id=store.id, quantity=v.stock))
    await db.commit()
    return await product_to_dict(p, db, include_details=True)


@router.put("/admin/products/{pid}")
async def update_product(pid: str, payload: ProductIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Product).where(M.Product.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    store = await _ensure_default_store(db)
    p.name = payload.name; p.description = payload.description
    p.category_id = payload.category_id; p.supplier_id = payload.supplier_id
    p.base_price = payload.base_price
    p.compare_price = payload.compare_price; p.cost_price = payload.cost_price
    p.sku = payload.sku
    p.status = payload.status; p.featured = payload.featured
    p.shipping_note = payload.shipping_note; p.returns_note = payload.returns_note
    p.updated_at = datetime.now(timezone.utc)
    existing_variants = (await db.execute(select(M.Variant).where(M.Variant.product_id == p.id))).scalars().all()
    existing_map = {v.id: v for v in existing_variants}
    incoming_ids = set()
    for v in payload.variants:
        if v.id and v.id in existing_map:
            ev = existing_map[v.id]
            ev.size = v.size; ev.color = v.color; ev.color_hex = v.color_hex
            ev.price_override = v.price_override; ev.sku = v.sku; ev.barcode = v.barcode
            inv = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == ev.id, M.Inventory.store_id == store.id)))).scalar_one_or_none()
            if inv:
                inv.quantity = v.stock
            else:
                db.add(M.Inventory(variant_id=ev.id, store_id=store.id, quantity=v.stock))
            incoming_ids.add(v.id)
        else:
            nv = M.Variant(product_id=p.id, size=v.size, color=v.color, color_hex=v.color_hex,
                          price_override=v.price_override, sku=v.sku, barcode=v.barcode)
            db.add(nv); await db.flush()
            db.add(M.Inventory(variant_id=nv.id, store_id=store.id, quantity=v.stock))
            incoming_ids.add(nv.id)
    for vid, v in existing_map.items():
        if vid not in incoming_ids:
            await db.delete(v)
    await db.commit()
    return await product_to_dict(p, db, include_details=True)


@router.delete("/admin/products/{pid}")
async def delete_product(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Product).where(M.Product.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    await db.delete(p)
    await db.commit()
    return {"ok": True}


class ImagePayload(BaseModel):
    data_base64: str
    mime_type: str = "image/png"
    is_primary: bool = False
    color: Optional[str] = None  # bind to a specific color variant


@router.post("/admin/products/{pid}/images")
async def add_product_image(pid: str, payload: ImagePayload, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Product).where(M.Product.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    # Defence-in-depth: reject anything larger than ~3MB binary. Frontend
    # already compresses to 1.5MB but a buggy client could send unbounded
    # data and bloat the DB. Base64 inflates ~33%, so 4MB chars ≈ 3MB binary.
    if payload.data_base64 and len(payload.data_base64) > 4 * 1024 * 1024:
        raise HTTPException(413, "Image too large. Max 3 MB after compression.")
    if payload.is_primary:
        for e in (await db.execute(select(M.ProductImage).where(M.ProductImage.product_id == pid))).scalars().all():
            e.is_primary = False
    img = M.ProductImage(product_id=pid, data_base64=payload.data_base64, mime_type=payload.mime_type,
                         is_primary=payload.is_primary, color=payload.color)
    db.add(img)
    await db.commit()
    await db.refresh(img)
    return {"id": img.id, "is_primary": img.is_primary, "color": img.color}


class ImageMetaUpdate(BaseModel):
    is_primary: Optional[bool] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


@router.put("/admin/products/images/{img_id}")
async def update_image_meta(img_id: str, payload: ImageMetaUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    img = (await db.execute(select(M.ProductImage).where(M.ProductImage.id == img_id))).scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Not found")
    if payload.is_primary:
        for e in (await db.execute(select(M.ProductImage).where(and_(M.ProductImage.product_id == img.product_id, M.ProductImage.id != img_id)))).scalars().all():
            e.is_primary = False
        img.is_primary = True
    elif payload.is_primary is False:
        img.is_primary = False
    if payload.color is not None:
        img.color = payload.color or None
    if payload.sort_order is not None:
        img.sort_order = payload.sort_order
    await db.commit()
    return {"id": img.id, "is_primary": img.is_primary, "color": img.color}


@router.delete("/admin/products/images/{img_id}")
async def delete_image(img_id: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    img = (await db.execute(select(M.ProductImage).where(M.ProductImage.id == img_id))).scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Not found")
    await db.delete(img)
    await db.commit()
    return {"ok": True}


