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


# ========== CSV IMPORT (Products + Inventory) ==========
class CsvImportIn(BaseModel):
    rows: List[dict]  # parsed CSV rows
    commit: bool = False  # if False, dry-run for preview


def _csv_clean(v):
    """Treat empty string / None as 'not provided'."""
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _csv_float(v):
    s = _csv_clean(v)
    if s is None: return None
    try: return float(s)
    except ValueError: return None


def _csv_int(v):
    s = _csv_clean(v)
    if s is None: return None
    try: return int(float(s))
    except ValueError: return None


def _csv_bool(v):
    s = _csv_clean(v)
    if s is None: return None
    return s.lower() in ("true", "1", "yes", "y", "t")


@router.post("/admin/import/products")
async def import_products(payload: CsvImportIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    """Bulk import products + first variant + initial inventory.
    Each row: name, sku, base_price, compare_price, cost_price, category(name), description,
              size, color, color_hex, stock, featured, status.
    Empty fields are skipped — only what's provided is updated.
    Existing product (matched by sku then name) updates the variant by size/color and adjusts inventory.
    """
    cats_by_name = {c.name.lower(): c for c in (await db.execute(select(M.Category))).scalars().all()}
    suppliers_by_name = {s.name.lower(): s for s in (await db.execute(select(M.Supplier))).scalars().all()}
    store = await _ensure_default_store(db)
    summary = {"created": 0, "updated": 0, "errors": []}
    preview = []
    for idx, raw in enumerate(payload.rows, start=1):
        try:
            name = _csv_clean(raw.get("name"))
            sku = _csv_clean(raw.get("sku"))
            if not name and not sku:
                raise ValueError("Row needs at least 'name' or 'sku'")
            base_price = _csv_float(raw.get("base_price"))
            compare_price = _csv_float(raw.get("compare_price"))
            cost_price = _csv_float(raw.get("cost_price"))
            category_name = _csv_clean(raw.get("category"))
            supplier_name = _csv_clean(raw.get("supplier"))
            description = _csv_clean(raw.get("description"))
            size = _csv_clean(raw.get("size"))
            color = _csv_clean(raw.get("color"))
            color_hex = _csv_clean(raw.get("color_hex"))
            stock = _csv_int(raw.get("stock"))
            featured = _csv_bool(raw.get("featured"))
            status_v = _csv_clean(raw.get("status"))
            cat = cats_by_name.get(category_name.lower()) if category_name else None
            sup = suppliers_by_name.get(supplier_name.lower()) if supplier_name else None
            existing = None
            if sku:
                existing = (await db.execute(select(M.Product).where(M.Product.sku == sku))).scalar_one_or_none()
            if not existing and name:
                existing = (await db.execute(select(M.Product).where(M.Product.name == name))).scalar_one_or_none()
            if existing:
                p = existing
                # Partial update: only override fields that were actually provided
                if name is not None: p.name = name
                if sku is not None: p.sku = sku
                if base_price is not None: p.base_price = base_price
                if compare_price is not None: p.compare_price = compare_price
                if cost_price is not None: p.cost_price = cost_price
                if cat: p.category_id = cat.id
                if sup: p.supplier_id = sup.id
                if description is not None: p.description = description
                if featured is not None: p.featured = featured
                if status_v is not None: p.status = status_v
                p.updated_at = datetime.now(timezone.utc)
                action = "updated"
            else:
                # New product needs a name
                if not name:
                    raise ValueError("New product requires 'name'")
                slug = slugify(name) + "-" + uuid.uuid4().hex[:4]
                p = M.Product(
                    name=name, slug=slug, description=description,
                    category_id=cat.id if cat else None,
                    supplier_id=sup.id if sup else None,
                    base_price=base_price if base_price is not None else 0.0,
                    compare_price=compare_price, cost_price=cost_price,
                    sku=sku, status=status_v or "active",
                    featured=bool(featured) if featured is not None else False,
                )
                db.add(p)
                await db.flush()
                action = "created"
            preview.append({"row": idx, "name": p.name, "sku": p.sku, "action": action,
                            "size": size, "color": color, "stock": stock if stock is not None else "—"})
            if action == "created": summary["created"] += 1
            else: summary["updated"] += 1
            if not payload.commit:
                continue
            # Variant + inventory
            if size or color:
                vq = select(M.Variant).where(and_(M.Variant.product_id == p.id, M.Variant.size == size, M.Variant.color == color))
                v = (await db.execute(vq)).scalar_one_or_none()
                if not v:
                    v = M.Variant(product_id=p.id, size=size, color=color, color_hex=color_hex)
                    db.add(v); await db.flush()
                else:
                    if color_hex: v.color_hex = color_hex
                if stock is not None:
                    inv = (await db.execute(select(M.Inventory).where(and_(
                        M.Inventory.variant_id == v.id, M.Inventory.store_id == store.id)))).scalar_one_or_none()
                    if inv:
                        inv.quantity = stock
                    else:
                        db.add(M.Inventory(variant_id=v.id, store_id=store.id, quantity=stock))
        except Exception as e:
            summary["errors"].append({"row": idx, "error": str(e)})
            continue
    if payload.commit:
        await db.commit()
    else:
        await db.rollback()
    return {"summary": summary, "preview": preview, "committed": payload.commit}


@router.get("/admin/import/products/template")
async def products_csv_template():
    csv = "name,sku,base_price,compare_price,cost_price,category,supplier,description,size,color,color_hex,stock,featured,status\n"
    csv += 'Sample Tee,TS-001,2500,3000,1500,Tees,,A soft cotton tee.,M,Black,#000000,12,false,active\n'
    csv += 'Sample Tee,TS-001,,,,,,,L,White,#ffffff,8,,\n'
    return FastResponse(content=csv, media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="products_template.csv"'})


