"""Shared utility helpers used across route modules.

Extracted from server.py UTILS section. Keep this dependency-light to avoid
circular imports — only import models and database here.
"""
import re
import uuid
import random
import string
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import models as M

# ========== UTILS ==========
def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


def new_order_number() -> str:
    return "ORD-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def normalize_phone_lk(raw):
    """Sri Lanka phone normalisation -> E.164. Accepts 0777..., 777..., 94777..., +94777... ."""
    if not raw:
        return raw
    digits = re.sub(r"[^\d+]", "", str(raw))
    if digits.startswith("+94"): return digits
    if digits.startswith("94"): return f"+{digits}"
    if digits.startswith("0"): return f"+94{digits[1:]}"
    if re.fullmatch(r"[1-9]\d{8}", digits): return f"+94{digits}"
    return digits if digits.startswith("+") else digits


async def _select_active_discounts(db: AsyncSession):
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(M.Discount).where(M.Discount.active == True))).scalars().all()
    out = []
    for d in rows:
        if d.starts_at:
            sa = d.starts_at if d.starts_at.tzinfo else d.starts_at.replace(tzinfo=timezone.utc)
            if sa > now: continue
        if d.ends_at:
            ea = d.ends_at if d.ends_at.tzinfo else d.ends_at.replace(tzinfo=timezone.utc)
            if ea < now: continue
        out.append(d)
    return out


def _best_discount_for(product, unit_price, discounts):
    best_save = 0.0
    best_d = None
    for d in discounts:
        if d.scope == "sitewide":
            applies = True
        elif d.scope == "products" and product.id in (d.scope_product_ids or []):
            applies = True
        elif d.scope == "categories" and product.category_id and product.category_id in (d.scope_category_ids or []):
            applies = True
        else:
            applies = False
        if not applies: continue
        save = unit_price * (d.value / 100.0) if d.type == "percent" else min(unit_price, d.value)
        if save > best_save:
            best_save = save; best_d = d
    return best_save, best_d


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _public_user(u: M.User) -> dict:
    return {"user_id": u.user_id, "email": u.email, "name": u.name, "picture": u.picture,
            "role": u.role, "phone": u.phone, "permissions": u.permissions or {}}


# Shared across categories + products
def _descendant_ids(rows, parent_id):
    """Recursively collect descendant category ids (including self)."""
    out = {parent_id}
    children = [r for r in rows if r["parent_id"] == parent_id]
    for c in children:
        out.update(_descendant_ids(rows, c["id"]))
    return out


# Shared across products + inventory + orders + csv_import
async def _ensure_default_store(db: AsyncSession) -> M.Store:
    store = (await db.execute(select(M.Store).where(M.Store.is_online == True))).scalars().first()
    if not store:
        store = (await db.execute(select(M.Store))).scalars().first()
    if not store:
        store = M.Store(name="Online Store", is_online=True)
        db.add(store)
        await db.commit()
        await db.refresh(store)
    return store


