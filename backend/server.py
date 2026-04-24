import os
import logging
import uuid
import re
import random
import string
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List
from dotenv import load_dotenv

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from database import get_db, engine, Base
import models as M
from auth import (
    get_current_user,
    require_admin,
    require_roles,
    fetch_emergent_profile,
    create_session_for_user,
    get_session_token,
)
from image_gen import generate_tshirt_image

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Threadline SaaS ERP")
api = APIRouter(prefix="/api")


# ---- Startup: ensure tables exist ----
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stores = (await db.execute(select(M.Store))).scalars().all()
        if not stores:
            db.add(M.Store(name="Main Store", is_online=True, active=True, address="Online"))
            await db.commit()
        # Seed default theme
        theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
        if not theme:
            db.add(M.ThemeSetting(id="default", config=DEFAULT_THEME))
            await db.commit()
        # Seed default Home sections if none exist
        existing = (await db.execute(select(M.PageSection).where(M.PageSection.page == "home"))).scalars().all()
        if not existing:
            for i, sec in enumerate(DEFAULT_HOME_SECTIONS):
                db.add(M.PageSection(
                    page="home",
                    section_type=sec["section_type"],
                    sort_order=i * 10,
                    visible=True,
                    config=sec["config"],
                ))
            await db.commit()


DEFAULT_THEME = {
    "primary_color": "#FF3B30",
    "primary_color_hover": "#D92D23",
    "background_color": "#09090B",
    "marquee_phrases": ["HERITAGE POLOS", "EST. 2026", "QUIETLY BOLD"],
    "marquee_separator": "//",
}


DEFAULT_HOME_SECTIONS = [
    {
        "section_type": "hero",
        "config": {
            "badge_text": "SS26 COLLECTION — IN STOCK",
            "headline_line1": "Quietly bold.",
            "headline_line2": "Sharply cut.",
            "headline_line2_accent": True,
            "headline_size": "lg",
            "subheading": "Heritage polos in heavyweight pima cotton. Embroidered crests, contrast tipping and a fit that holds its shape from the office to the 19th hole.",
            "cta_primary_label": "Shop The Collection",
            "cta_primary_link": "/shop",
            "cta_secondary_label": "View Heritage",
            "cta_secondary_link": "/shop?featured=1",
            "image_url": "https://images.unsplash.com/photo-1768084356884-22bb77e76931?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHwyfHxzdHJlZXR3ZWFyJTIwbW9kZWwlMjBkYXJrJTIwdXJiYW4lMjBmYXNoaW9ufGVufDB8fHx8MTc3NzA0NjYyMHww&ixlib=rb-4.1.0&q=85",
            "image_id": None,
            "image_position": "right",
            "overlay_opacity": 60,
            "height": "tall",
        },
    },
    {
        "section_type": "featured",
        "config": {
            "eyebrow": "Featured",
            "heading": "Signature Polos",
            "max_items": 8,
            "category_slug": None,
            "show_view_all_button": True,
            "view_all_label": "Shop The Full Collection",
            "view_all_link": "/shop",
        },
    },
    {
        "section_type": "brand",
        "config": {
            "eyebrow": "The Brand",
            "headline": "Stitched right.\nWorn easy.\nBuilt to last.",
            "paragraph": "Threadline crafts heritage-style polos with a modern edge — heavyweight pima, embroidered crests, contrast tipping, and a fit that flatters without trying. Designed in the studio, finished by hand.",
            "stats": [
                {"value": "210gsm", "label": "Pima cotton"},
                {"value": "100%", "label": "Hand-finished"},
                {"value": "5+", "label": "Signature crests"},
            ],
            "image_url": "https://images.unsplash.com/photo-1776021810500-5f50a3d461a7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwxfHxkYXJrJTIwd2FyZWhvdXNlJTIwaW5kdXN0cmlhbCUyMGNvbmNyZXRlfGVufDB8fHx8MTc3NzA0NjYyMHww&ixlib=rb-4.1.0&q=85",
            "image_id": None,
            "image_side": "right",
            "tagline": "EST. 2026 · SL",
        },
    },
    {
        "section_type": "story",
        "config": {
            "eyebrow": "Our Story",
            "headline": "From a back-room idea to a heritage label.",
            "paragraph": "It started in 2026 with three sketches and a stubborn idea: that a polo can be quiet and powerful at the same time. Five seasons later, we're still hand-finishing every collar, still shipping in numbered runs, still answering every email ourselves.",
            "image_url": "",
            "image_id": None,
            "image_side": "left",
        },
    },
    {
        "section_type": "reviews",
        "config": {
            "eyebrow": "Praise",
            "heading": "Worn & loved.",
            "items": [
                {"name": "Marcus K.", "role": "Verified Buyer", "rating": 5, "text": "Best polo I own. The collar still snaps after a year of wear and weekly washes. Worth every cent."},
                {"name": "Anika R.", "role": "Verified Buyer", "rating": 5, "text": "Beautifully cut, the embroidery is sharp, and the colours are unreal in person. Bought two more."},
                {"name": "James O.", "role": "Verified Buyer", "rating": 5, "text": "Heavy enough to feel premium, light enough for summer. Fits like it was made for me."},
            ],
        },
    },
    {
        "section_type": "custom",
        "config": {
            "block_type": "heading_text",
            "eyebrow": "",
            "heading": "Add your own block.",
            "text": "Edit this section from the admin Builder. Switch its type to a heading + text, an image hero, or split image + text.",
            "image_url": "",
            "image_id": None,
            "alignment": "center",
            "max_width": "narrow",
            "padding": "lg",
        },
    },
]


# ========== UTILS ==========
def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


def new_order_number() -> str:
    return "ORD-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


# ========== AUTH ENDPOINTS ==========
class SessionRequest(BaseModel):
    session_id: str


@api.post("/auth/session")
async def auth_session(payload: SessionRequest, response: Response, db: AsyncSession = Depends(get_db)):
    profile = await fetch_emergent_profile(payload.session_id)
    email = profile.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")

    # ADMIN_EMAILS env: comma-separated list — these are ALWAYS super_admin
    admin_emails = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
    is_protected_admin = email.lower() in admin_emails

    # find or create user
    existing = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if existing:
        if profile.get("name"):
            existing.name = profile["name"]
        if profile.get("picture"):
            existing.picture = profile["picture"]
        # Always promote protected admin emails (idempotent)
        if is_protected_admin and existing.role != "super_admin":
            existing.role = "super_admin"
            existing.active = True
        await db.commit()
        user = existing
    else:
        if is_protected_admin:
            role = "super_admin"
        else:
            # First non-admin user with no admins yet => super_admin
            count = (await db.execute(select(func.count(M.User.user_id)))).scalar_one()
            role = "super_admin" if count == 0 else "customer"
        user = M.User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email,
            name=profile.get("name", email.split("@")[0]),
            picture=profile.get("picture"),
            role=role,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        if user.role == "customer":
            db.add(M.Customer(user_id=user.user_id, name=user.name, email=user.email))
            await db.commit()
    session_token = profile.get("session_token") or uuid.uuid4().hex
    await create_session_for_user(db, user, session_token)
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=60 * 60 * 24 * 7,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return {
        "user": {
            "user_id": user.user_id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "role": user.role,
        }
    }


@api.get("/auth/me")
async def auth_me(user: M.User = Depends(get_current_user)):
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
        "phone": user.phone,
    }


@api.post("/auth/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = await get_session_token(request)
    if token:
        sess = (await db.execute(select(M.UserSession).where(M.UserSession.session_token == token))).scalar_one_or_none()
        if sess:
            await db.delete(sess)
            await db.commit()
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


# ========== CATEGORIES ==========
class CategoryIn(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0


def cat_to_dict(c: M.Category):
    return {"id": c.id, "name": c.name, "slug": c.slug, "description": c.description, "sort_order": c.sort_order}


@api.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(M.Category).order_by(M.Category.sort_order, M.Category.name))).scalars().all()
    return [cat_to_dict(c) for c in rows]


@api.post("/admin/categories")
async def create_category(payload: CategoryIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.Category(name=payload.name, slug=slugify(payload.name), description=payload.description, sort_order=payload.sort_order)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return cat_to_dict(c)


@api.put("/admin/categories/{cid}")
async def update_category(cid: str, payload: CategoryIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Category).where(M.Category.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    c.name = payload.name
    c.slug = slugify(payload.name)
    c.description = payload.description
    c.sort_order = payload.sort_order
    await db.commit()
    return cat_to_dict(c)


@api.delete("/admin/categories/{cid}")
async def delete_category(cid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Category).where(M.Category.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


# ========== PRODUCTS ==========
class VariantIn(BaseModel):
    id: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    color_hex: Optional[str] = None
    price_override: Optional[float] = None
    sku: Optional[str] = None
    stock: int = 0


class ProductIn(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    base_price: float
    compare_price: Optional[float] = None
    sku: Optional[str] = None
    status: str = "active"
    featured: bool = False
    variants: List[VariantIn] = []


async def product_to_dict(p: M.Product, db: AsyncSession, include_details: bool = True):
    data = {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "description": p.description,
        "category_id": p.category_id,
        "base_price": p.base_price,
        "compare_price": p.compare_price,
        "sku": p.sku,
        "status": p.status,
        "featured": p.featured,
        "created_at": p.created_at.isoformat(),
    }
    imgs_q = await db.execute(
        select(M.ProductImage.id, M.ProductImage.mime_type, M.ProductImage.is_primary, M.ProductImage.sort_order)
        .where(M.ProductImage.product_id == p.id)
        .order_by(M.ProductImage.sort_order)
    )
    imgs = imgs_q.all()
    if include_details:
        data["images"] = [
            {"id": i.id, "url": f"/api/images/{i.id}", "mime_type": i.mime_type, "is_primary": i.is_primary}
            for i in imgs
        ]
    else:
        primary = [i for i in imgs if i.is_primary] or (imgs[:1] if imgs else [])
        data["images"] = [
            {"id": i.id, "url": f"/api/images/{i.id}", "mime_type": i.mime_type, "is_primary": True}
            for i in primary
        ]

    if include_details:
        variants_q = await db.execute(select(M.Variant).where(M.Variant.product_id == p.id))
        variants = variants_q.scalars().all()
        inv_map = {}
        if variants:
            inv_q = await db.execute(select(M.Inventory).where(M.Inventory.variant_id.in_([v.id for v in variants])))
            for iv in inv_q.scalars().all():
                inv_map[iv.variant_id] = inv_map.get(iv.variant_id, 0) + iv.quantity
        data["variants"] = [
            {
                "id": v.id,
                "size": v.size,
                "color": v.color,
                "color_hex": v.color_hex,
                "price_override": v.price_override,
                "sku": v.sku,
                "stock": inv_map.get(v.id, 0),
            }
            for v in variants
        ]
        cat = (await db.execute(select(M.Category).where(M.Category.id == p.category_id))).scalar_one_or_none() if p.category_id else None
        data["category"] = {"id": cat.id, "name": cat.name, "slug": cat.slug} if cat else None
    return data


async def products_to_list(rows: list[M.Product], db: AsyncSession):
    """Fast batch serializer for product listings — avoids N+1."""
    if not rows:
        return []
    pids = [p.id for p in rows]
    # Batch fetch images (id + meta only — base64 is served separately via /api/images/{id})
    imgs_q = await db.execute(
        select(M.ProductImage.id, M.ProductImage.product_id, M.ProductImage.mime_type, M.ProductImage.is_primary, M.ProductImage.sort_order)
        .where(M.ProductImage.product_id.in_(pids))
        .order_by(M.ProductImage.sort_order)
    )
    imgs_by_pid = {}
    for i in imgs_q.all():
        imgs_by_pid.setdefault(i.product_id, []).append(i)
    # Batch fetch categories
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
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "base_price": p.base_price,
            "compare_price": p.compare_price,
            "featured": p.featured,
            "status": p.status,
            "category": cats.get(p.category_id),
            "images": [{"id": i.id, "url": f"/api/images/{i.id}", "mime_type": i.mime_type, "is_primary": True} for i in primary],
        })
    return out


@api.get("/products")
async def list_products(
    db: AsyncSession = Depends(get_db),
    category: Optional[str] = None,
    featured: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = 50,
):
    q = select(M.Product).where(M.Product.status == "active")
    if category:
        cat = (await db.execute(select(M.Category).where(M.Category.slug == category))).scalar_one_or_none()
        if cat:
            q = q.where(M.Product.category_id == cat.id)
    if featured:
        q = q.where(M.Product.featured == True)
    if search:
        q = q.where(M.Product.name.ilike(f"%{search}%"))
    q = q.order_by(desc(M.Product.created_at)).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return await products_to_list(rows, db)


@api.get("/products/{slug}")
async def get_product(slug: str, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(M.Product).where(M.Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    return await product_to_dict(p, db, include_details=True)


@api.get("/admin/products")
async def admin_list_products(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Product).order_by(desc(M.Product.created_at)))).scalars().all()
    return [await product_to_dict(p, db, include_details=True) for p in rows]


# ---- Binary Image streaming (fast, cacheable) ----
import base64 as _b64
from fastapi import Response as _Response


@api.get("/images/{img_id}")
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
    return _Response(
        content=raw,
        media_type=row.mime_type or "image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


async def _ensure_default_store(db: AsyncSession) -> M.Store:
    store = (await db.execute(select(M.Store).limit(1))).scalar_one_or_none()
    if not store:
        store = M.Store(name="Main Store", is_online=True)
        db.add(store)
        await db.commit()
        await db.refresh(store)
    return store


@api.post("/admin/products")
async def create_product(payload: ProductIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    store = await _ensure_default_store(db)
    slug = slugify(payload.name) + "-" + uuid.uuid4().hex[:4]
    p = M.Product(
        name=payload.name,
        slug=slug,
        description=payload.description,
        category_id=payload.category_id,
        base_price=payload.base_price,
        compare_price=payload.compare_price,
        sku=payload.sku,
        status=payload.status,
        featured=payload.featured,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    for v in payload.variants:
        variant = M.Variant(
            product_id=p.id,
            size=v.size,
            color=v.color,
            color_hex=v.color_hex,
            price_override=v.price_override,
            sku=v.sku,
        )
        db.add(variant)
        await db.flush()
        db.add(M.Inventory(variant_id=variant.id, store_id=store.id, quantity=v.stock))
    await db.commit()
    return await product_to_dict(p, db, include_details=True)


@api.put("/admin/products/{pid}")
async def update_product(pid: str, payload: ProductIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Product).where(M.Product.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    store = await _ensure_default_store(db)
    p.name = payload.name
    p.description = payload.description
    p.category_id = payload.category_id
    p.base_price = payload.base_price
    p.compare_price = payload.compare_price
    p.sku = payload.sku
    p.status = payload.status
    p.featured = payload.featured
    p.updated_at = datetime.now(timezone.utc)
    # handle variants
    existing_variants = (await db.execute(select(M.Variant).where(M.Variant.product_id == p.id))).scalars().all()
    existing_map = {v.id: v for v in existing_variants}
    incoming_ids = set()
    for v in payload.variants:
        if v.id and v.id in existing_map:
            ev = existing_map[v.id]
            ev.size = v.size
            ev.color = v.color
            ev.color_hex = v.color_hex
            ev.price_override = v.price_override
            ev.sku = v.sku
            # update inventory
            inv = (await db.execute(select(M.Inventory).where(M.Inventory.variant_id == ev.id))).scalar_one_or_none()
            if inv:
                inv.quantity = v.stock
            else:
                db.add(M.Inventory(variant_id=ev.id, store_id=store.id, quantity=v.stock))
            incoming_ids.add(v.id)
        else:
            nv = M.Variant(
                product_id=p.id,
                size=v.size,
                color=v.color,
                color_hex=v.color_hex,
                price_override=v.price_override,
                sku=v.sku,
            )
            db.add(nv)
            await db.flush()
            db.add(M.Inventory(variant_id=nv.id, store_id=store.id, quantity=v.stock))
            incoming_ids.add(nv.id)
    # delete removed variants
    for vid, v in existing_map.items():
        if vid not in incoming_ids:
            await db.delete(v)
    await db.commit()
    return await product_to_dict(p, db, include_details=True)


@api.delete("/admin/products/{pid}")
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


@api.post("/admin/products/{pid}/images")
async def add_product_image(pid: str, payload: ImagePayload, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Product).where(M.Product.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    # If setting primary, unset others
    if payload.is_primary:
        existing = (await db.execute(select(M.ProductImage).where(M.ProductImage.product_id == pid))).scalars().all()
        for e in existing:
            e.is_primary = False
    img = M.ProductImage(
        product_id=pid,
        data_base64=payload.data_base64,
        mime_type=payload.mime_type,
        is_primary=payload.is_primary,
    )
    db.add(img)
    await db.commit()
    await db.refresh(img)
    return {"id": img.id, "is_primary": img.is_primary}


class AIGenReq(BaseModel):
    prompt: str
    is_primary: bool = True


@api.post("/admin/products/{pid}/images/ai")
async def ai_generate_image(pid: str, payload: AIGenReq, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Product).where(M.Product.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    b64 = await generate_tshirt_image(payload.prompt)
    if not b64:
        raise HTTPException(500, "Image generation failed")
    if payload.is_primary:
        existing = (await db.execute(select(M.ProductImage).where(M.ProductImage.product_id == pid))).scalars().all()
        for e in existing:
            e.is_primary = False
    img = M.ProductImage(product_id=pid, data_base64=b64, mime_type="image/png", is_primary=payload.is_primary)
    db.add(img)
    await db.commit()
    await db.refresh(img)
    return {"id": img.id, "data_base64": b64, "mime_type": "image/png", "is_primary": img.is_primary}


@api.delete("/admin/products/images/{img_id}")
async def delete_image(img_id: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    img = (await db.execute(select(M.ProductImage).where(M.ProductImage.id == img_id))).scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Not found")
    await db.delete(img)
    await db.commit()
    return {"ok": True}


# ========== INVENTORY ==========
@api.get("/admin/inventory")
async def list_inventory(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Inventory))).scalars().all()
    out = []
    for iv in rows:
        v = (await db.execute(select(M.Variant).where(M.Variant.id == iv.variant_id))).scalar_one_or_none()
        p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one_or_none() if v else None
        s = (await db.execute(select(M.Store).where(M.Store.id == iv.store_id))).scalar_one_or_none()
        out.append({
            "id": iv.id,
            "variant_id": iv.variant_id,
            "store_id": iv.store_id,
            "store_name": s.name if s else "",
            "quantity": iv.quantity,
            "low_stock_threshold": iv.low_stock_threshold,
            "product_name": p.name if p else "",
            "product_id": p.id if p else None,
            "variant_label": f"{v.size or ''} / {v.color or ''}" if v else "",
            "sku": v.sku if v else None,
            "low": iv.quantity <= iv.low_stock_threshold,
        })
    return out


class StockMoveIn(BaseModel):
    variant_id: str
    store_id: Optional[str] = None
    type: str  # in, out, adjust
    quantity: int
    reason: Optional[str] = None
    reference: Optional[str] = None


@api.post("/admin/stock-movements")
async def create_stock_movement(payload: StockMoveIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
    store = await _ensure_default_store(db)
    sid = payload.store_id or store.id
    inv = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == payload.variant_id, M.Inventory.store_id == sid)))).scalar_one_or_none()
    if not inv:
        inv = M.Inventory(variant_id=payload.variant_id, store_id=sid, quantity=0)
        db.add(inv)
        await db.flush()
    if payload.type == "in":
        inv.quantity += payload.quantity
    elif payload.type == "out":
        inv.quantity = max(0, inv.quantity - payload.quantity)
    elif payload.type == "adjust":
        inv.quantity = payload.quantity
    db.add(M.StockMovement(
        variant_id=payload.variant_id,
        store_id=sid,
        type=payload.type,
        quantity=payload.quantity,
        reason=payload.reason,
        reference=payload.reference,
        user_id=user.user_id,
    ))
    await db.commit()
    return {"ok": True, "new_quantity": inv.quantity}


@api.get("/admin/stock-movements")
async def list_stock_movements(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), limit: int = 100):
    rows = (await db.execute(select(M.StockMovement).order_by(desc(M.StockMovement.created_at)).limit(limit))).scalars().all()
    out = []
    for m in rows:
        v = (await db.execute(select(M.Variant).where(M.Variant.id == m.variant_id))).scalar_one_or_none()
        p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one_or_none() if v else None
        out.append({
            "id": m.id,
            "type": m.type,
            "quantity": m.quantity,
            "reason": m.reason,
            "reference": m.reference,
            "product_name": p.name if p else "",
            "variant_label": f"{v.size or ''} / {v.color or ''}" if v else "",
            "created_at": m.created_at.isoformat(),
        })
    return out


# ========== STORES ==========
class StoreIn(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    is_online: bool = False
    active: bool = True


@api.get("/admin/stores")
async def list_stores(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Store).order_by(M.Store.name))).scalars().all()
    return [{"id": s.id, "name": s.name, "address": s.address, "phone": s.phone, "is_online": s.is_online, "active": s.active} for s in rows]


@api.post("/admin/stores")
async def create_store(payload: StoreIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = M.Store(**payload.model_dump())
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"id": s.id, "name": s.name, "address": s.address, "phone": s.phone, "is_online": s.is_online, "active": s.active}


@api.put("/admin/stores/{sid}")
async def update_store(sid: str, payload: StoreIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Store).where(M.Store.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    await db.commit()
    return {"ok": True}


@api.delete("/admin/stores/{sid}")
async def delete_store(sid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.Store).where(M.Store.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    await db.delete(s)
    await db.commit()
    return {"ok": True}


# ========== ORDERS ==========
class OrderItemIn(BaseModel):
    variant_id: str
    quantity: int


class CheckoutIn(BaseModel):
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    items: List[OrderItemIn]
    coupon_code: Optional[str] = None
    payment_method: str = "mock"
    notes: Optional[str] = None
    source: str = "online"
    store_id: Optional[str] = None


async def _log_notification(db: AsyncSession, channel: str, to: str, subject: str, body: str, order_id: Optional[str] = None):
    db.add(M.NotificationLog(channel=channel, to_address=to, subject=subject, body=body, related_order=order_id))


async def _build_order_response(o: M.Order, db: AsyncSession):
    items = (await db.execute(select(M.OrderItem).where(M.OrderItem.order_id == o.id))).scalars().all()
    return {
        "id": o.id,
        "order_number": o.order_number,
        "status": o.status,
        "payment_method": o.payment_method,
        "payment_status": o.payment_status,
        "subtotal": o.subtotal,
        "discount": o.discount,
        "coupon_code": o.coupon_code,
        "shipping": o.shipping,
        "tax": o.tax,
        "total": o.total,
        "customer_name": o.customer_name,
        "customer_email": o.customer_email,
        "customer_phone": o.customer_phone,
        "shipping_address": o.shipping_address,
        "source": o.source,
        "notes": o.notes,
        "created_at": o.created_at.isoformat(),
        "items": [
            {
                "id": i.id,
                "product_name": i.product_name,
                "variant_label": i.variant_label,
                "unit_price": i.unit_price,
                "quantity": i.quantity,
                "subtotal": i.subtotal,
            }
            for i in items
        ],
    }


@api.post("/checkout")
async def checkout(payload: CheckoutIn, request: Request, db: AsyncSession = Depends(get_db)):
    if not payload.items:
        raise HTTPException(400, "Empty cart")
    store = await _ensure_default_store(db)
    store_id = payload.store_id or store.id
    # Try to associate with logged-in user
    user = None
    token = await get_session_token(request)
    if token:
        sess = (await db.execute(select(M.UserSession).where(M.UserSession.session_token == token))).scalar_one_or_none()
        if sess:
            user = (await db.execute(select(M.User).where(M.User.user_id == sess.user_id))).scalar_one_or_none()

    customer = None
    if user:
        customer = (await db.execute(select(M.Customer).where(M.Customer.user_id == user.user_id))).scalar_one_or_none()
    if not customer and payload.customer_email:
        customer = (await db.execute(select(M.Customer).where(M.Customer.email == payload.customer_email))).scalar_one_or_none()
    if not customer:
        customer = M.Customer(
            user_id=user.user_id if user else None,
            name=payload.customer_name,
            email=payload.customer_email,
            phone=payload.customer_phone,
            address=payload.shipping_address,
        )
        db.add(customer)
        await db.flush()

    subtotal = 0.0
    order_items_data = []
    for it in payload.items:
        v = (await db.execute(select(M.Variant).where(M.Variant.id == it.variant_id))).scalar_one_or_none()
        if not v:
            raise HTTPException(400, f"Invalid variant: {it.variant_id}")
        p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one()
        inv = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == v.id, M.Inventory.store_id == store_id)))).scalar_one_or_none()
        if not inv or inv.quantity < it.quantity:
            raise HTTPException(400, f"Insufficient stock for {p.name}")
        price = v.price_override if v.price_override is not None else p.base_price
        line_subtotal = price * it.quantity
        subtotal += line_subtotal
        variant_label = f"{v.size or ''} / {v.color or ''}".strip(" /")
        order_items_data.append((v, p, inv, price, it.quantity, line_subtotal, variant_label))

    discount = 0.0
    coupon = None
    if payload.coupon_code:
        coupon = (await db.execute(select(M.Coupon).where(M.Coupon.code == payload.coupon_code.upper()))).scalar_one_or_none()
        if not coupon or not coupon.active:
            raise HTTPException(400, "Invalid coupon")
        if coupon.expires_at:
            exp = coupon.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                raise HTTPException(400, "Coupon expired")
        if coupon.usage_limit and coupon.used_count >= coupon.usage_limit:
            raise HTTPException(400, "Coupon usage limit reached")
        if subtotal < coupon.min_order:
            raise HTTPException(400, f"Minimum order ${coupon.min_order} required")
        if coupon.type == "percent":
            discount = round(subtotal * (coupon.value / 100.0), 2)
        else:
            discount = min(subtotal, coupon.value)

    shipping_fee = 0.0 if payload.source == "pos" else (0.0 if subtotal >= 75 else 5.99)
    total = max(0.0, subtotal - discount + shipping_fee)

    order = M.Order(
        order_number=new_order_number(),
        customer_id=customer.id,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        shipping_address=payload.shipping_address,
        status="paid" if payload.payment_method in ("mock", "cash") else "pending",
        payment_method=payload.payment_method,
        payment_status="paid" if payload.payment_method in ("mock", "cash") else "pending",
        subtotal=subtotal,
        discount=discount,
        coupon_code=coupon.code if coupon else None,
        shipping=shipping_fee,
        total=total,
        store_id=store_id,
        created_by=user.user_id if user else None,
        source=payload.source,
        notes=payload.notes,
    )
    db.add(order)
    await db.flush()

    for v, p, inv, price, qty, line_sub, vlabel in order_items_data:
        db.add(M.OrderItem(
            order_id=order.id,
            variant_id=v.id,
            product_id=p.id,
            product_name=p.name,
            variant_label=vlabel,
            unit_price=price,
            quantity=qty,
            subtotal=line_sub,
        ))
        inv.quantity = max(0, inv.quantity - qty)
        db.add(M.StockMovement(
            variant_id=v.id, store_id=store_id, type="sale", quantity=qty,
            reason=f"Order {order.order_number}", reference=order.order_number,
            user_id=user.user_id if user else None,
        ))

    if coupon:
        coupon.used_count += 1

    customer.total_orders += 1
    customer.total_spent += total

    # Notifications (mocked)
    if payload.customer_email:
        await _log_notification(db, "email", payload.customer_email, f"Order {order.order_number} confirmed",
                                f"Thank you {payload.customer_name}! Your order {order.order_number} totaling ${total:.2f} has been received.", order.id)
    if payload.customer_phone:
        await _log_notification(db, "sms", payload.customer_phone, "Order Confirmed",
                                f"Order {order.order_number} confirmed. Total ${total:.2f}.", order.id)

    await db.commit()
    await db.refresh(order)
    return await _build_order_response(order, db)


@api.get("/orders/{order_number}")
async def get_order(order_number: str, db: AsyncSession = Depends(get_db)):
    o = (await db.execute(select(M.Order).where(M.Order.order_number == order_number))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    return await _build_order_response(o, db)


@api.get("/my/orders")
async def my_orders(user: M.User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    customer = (await db.execute(select(M.Customer).where(M.Customer.user_id == user.user_id))).scalar_one_or_none()
    if not customer:
        return []
    rows = (await db.execute(select(M.Order).where(M.Order.customer_id == customer.id).order_by(desc(M.Order.created_at)))).scalars().all()
    return [await _build_order_response(o, db) for o in rows]


@api.get("/admin/orders")
async def admin_orders(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), status: Optional[str] = None, limit: int = 100):
    q = select(M.Order).order_by(desc(M.Order.created_at))
    if status:
        q = q.where(M.Order.status == status)
    rows = (await db.execute(q.limit(limit))).scalars().all()
    return [await _build_order_response(o, db) for o in rows]


class OrderStatusIn(BaseModel):
    status: str


@api.put("/admin/orders/{oid}/status")
async def update_order_status(oid: str, payload: OrderStatusIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    o = (await db.execute(select(M.Order).where(M.Order.id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    o.status = payload.status
    # Mocked notification
    if o.customer_email:
        await _log_notification(db, "email", o.customer_email, f"Order {o.order_number} {payload.status}",
                                f"Your order {o.order_number} status is now: {payload.status}.", o.id)
    if o.customer_phone:
        await _log_notification(db, "sms", o.customer_phone, "Order Update",
                                f"Order {o.order_number} is now {payload.status}.", o.id)
    await db.commit()
    return {"ok": True, "status": o.status}


# ========== CUSTOMERS ==========
@api.get("/admin/customers")
async def list_customers(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Customer).order_by(desc(M.Customer.created_at)))).scalars().all()
    return [{
        "id": c.id, "name": c.name, "email": c.email, "phone": c.phone, "address": c.address,
        "notes": c.notes, "total_orders": c.total_orders, "total_spent": c.total_spent,
        "created_at": c.created_at.isoformat(),
    } for c in rows]


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


@api.put("/admin/customers/{cid}")
async def update_customer(cid: str, payload: CustomerUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Customer).where(M.Customer.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await db.commit()
    return {"ok": True}


# ========== COUPONS ==========
class CouponIn(BaseModel):
    code: str
    type: str = "percent"
    value: float
    min_order: float = 0.0
    usage_limit: int = 0
    active: bool = True
    expires_at: Optional[datetime] = None


@api.get("/admin/coupons")
async def list_coupons(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Coupon).order_by(desc(M.Coupon.created_at)))).scalars().all()
    return [{
        "id": c.id, "code": c.code, "type": c.type, "value": c.value, "min_order": c.min_order,
        "usage_limit": c.usage_limit, "used_count": c.used_count, "active": c.active,
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
    } for c in rows]


@api.post("/admin/coupons")
async def create_coupon(payload: CouponIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.Coupon(**payload.model_dump())
    c.code = c.code.upper()
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": c.id}


@api.put("/admin/coupons/{cid}")
async def update_coupon(cid: str, payload: CouponIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Coupon).where(M.Coupon.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    c.code = c.code.upper()
    await db.commit()
    return {"ok": True}


@api.delete("/admin/coupons/{cid}")
async def delete_coupon(cid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Coupon).where(M.Coupon.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@api.get("/coupons/validate/{code}")
async def validate_coupon(code: str, db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(M.Coupon).where(M.Coupon.code == code.upper()))).scalar_one_or_none()
    if not c or not c.active:
        raise HTTPException(404, "Invalid coupon")
    return {"code": c.code, "type": c.type, "value": c.value, "min_order": c.min_order}


# ========== EXPENSES ==========
class ExpenseIn(BaseModel):
    category: str
    amount: float
    description: Optional[str] = None
    expense_date: Optional[datetime] = None


@api.get("/admin/expenses")
async def list_expenses(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Expense).order_by(desc(M.Expense.expense_date)))).scalars().all()
    return [{
        "id": e.id, "category": e.category, "amount": e.amount, "description": e.description,
        "expense_date": e.expense_date.isoformat(),
    } for e in rows]


@api.post("/admin/expenses")
async def create_expense(payload: ExpenseIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
    e = M.Expense(**payload.model_dump(exclude_unset=True))
    e.created_by = user.user_id
    if not e.expense_date:
        e.expense_date = datetime.now(timezone.utc)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return {"id": e.id}


@api.delete("/admin/expenses/{eid}")
async def delete_expense(eid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    e = (await db.execute(select(M.Expense).where(M.Expense.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Not found")
    await db.delete(e)
    await db.commit()
    return {"ok": True}


# ========== PAYROLL ==========
class PayrollIn(BaseModel):
    staff_user_id: str
    month: int
    year: int
    base_salary: float
    bonus: float = 0.0
    deduction: float = 0.0
    status: str = "pending"


@api.get("/admin/payroll")
async def list_payroll(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Payroll).order_by(desc(M.Payroll.created_at)))).scalars().all()
    out = []
    for p in rows:
        u = (await db.execute(select(M.User).where(M.User.user_id == p.staff_user_id))).scalar_one_or_none()
        out.append({
            "id": p.id, "staff_user_id": p.staff_user_id, "staff_name": u.name if u else "",
            "month": p.month, "year": p.year, "base_salary": p.base_salary,
            "bonus": p.bonus, "deduction": p.deduction, "net": p.net, "status": p.status,
            "paid_date": p.paid_date.isoformat() if p.paid_date else None,
        })
    return out


@api.post("/admin/payroll")
async def create_payroll(payload: PayrollIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    net = payload.base_salary + payload.bonus - payload.deduction
    p = M.Payroll(**payload.model_dump(), net=net)
    if payload.status == "paid":
        p.paid_date = datetime.now(timezone.utc)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return {"id": p.id}


@api.put("/admin/payroll/{pid}/pay")
async def mark_payroll_paid(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Payroll).where(M.Payroll.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    p.status = "paid"
    p.paid_date = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ========== STAFF ==========
class StaffIn(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    role: str
    base_salary: Optional[float] = None
    active: bool = True


@api.get("/admin/staff")
async def list_staff(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.User).where(M.User.role != "customer").order_by(desc(M.User.created_at)))).scalars().all()
    return [{
        "user_id": u.user_id, "email": u.email, "name": u.name, "phone": u.phone,
        "role": u.role, "base_salary": u.base_salary, "active": u.active,
        "created_at": u.created_at.isoformat(),
    } for u in rows]


@api.post("/admin/staff")
async def create_staff(payload: StaffIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    existing = (await db.execute(select(M.User).where(M.User.email == payload.email))).scalar_one_or_none()
    if existing:
        # promote existing user
        existing.role = payload.role
        existing.name = payload.name
        existing.phone = payload.phone
        existing.base_salary = payload.base_salary
        existing.active = payload.active
        await db.commit()
        return {"user_id": existing.user_id}
    u = M.User(
        user_id=f"user_{uuid.uuid4().hex[:12]}",
        email=payload.email,
        name=payload.name,
        phone=payload.phone,
        role=payload.role,
        base_salary=payload.base_salary,
        active=payload.active,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"user_id": u.user_id}


@api.put("/admin/staff/{uid}")
async def update_staff(uid: str, payload: StaffIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    u = (await db.execute(select(M.User).where(M.User.user_id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Not found")
    u.email = payload.email
    u.name = payload.name
    u.phone = payload.phone
    u.role = payload.role
    u.base_salary = payload.base_salary
    u.active = payload.active
    await db.commit()
    return {"ok": True}


@api.delete("/admin/staff/{uid}")
async def delete_staff(uid: str, db: AsyncSession = Depends(get_db), current: M.User = Depends(require_roles("super_admin"))):
    if uid == current.user_id:
        raise HTTPException(400, "Cannot delete yourself")
    u = (await db.execute(select(M.User).where(M.User.user_id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Not found")
    u.active = False
    u.role = "customer"
    await db.commit()
    return {"ok": True}


# ========== REPORTS / DASHBOARD ==========
@api.get("/admin/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    d30 = now - timedelta(days=30)

    orders_30 = (await db.execute(select(M.Order).where(M.Order.created_at >= d30))).scalars().all()
    total_revenue = sum(o.total for o in orders_30 if o.payment_status == "paid")
    total_orders = len(orders_30)

    customer_count = (await db.execute(select(func.count(M.Customer.id)))).scalar_one()

    # low stock
    low_rows = (await db.execute(select(M.Inventory))).scalars().all()
    low_stock = [x for x in low_rows if x.quantity <= x.low_stock_threshold]

    # daily sales for 14 days
    d14 = now - timedelta(days=14)
    daily_orders = (await db.execute(select(M.Order).where(M.Order.created_at >= d14))).scalars().all()
    daily = {}
    for o in daily_orders:
        if o.payment_status != "paid":
            continue
        d = o.created_at.strftime("%Y-%m-%d")
        daily[d] = daily.get(d, 0) + o.total
    sales_chart = [{"date": k, "revenue": round(v, 2)} for k, v in sorted(daily.items())]

    # top products
    items = (await db.execute(select(M.OrderItem))).scalars().all()
    top_map = {}
    for i in items:
        top_map[i.product_name] = top_map.get(i.product_name, 0) + i.quantity
    top_products = sorted(
        [{"name": k, "qty": v} for k, v in top_map.items()],
        key=lambda x: -x["qty"],
    )[:5]

    # orders by status
    status_map = {}
    for o in orders_30:
        status_map[o.status] = status_map.get(o.status, 0) + 1

    return {
        "total_revenue": round(total_revenue, 2),
        "total_orders": total_orders,
        "customer_count": customer_count,
        "low_stock_count": len(low_stock),
        "sales_chart": sales_chart,
        "top_products": top_products,
        "status_breakdown": [{"status": k, "count": v} for k, v in status_map.items()],
    }


@api.get("/admin/reports/sales")
async def sales_report(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), days: int = 30):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    orders = (await db.execute(select(M.Order).where(M.Order.created_at >= since))).scalars().all()
    by_day = {}
    by_channel = {}
    total_paid = 0.0
    for o in orders:
        d = o.created_at.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0.0) + (o.total if o.payment_status == "paid" else 0)
        by_channel[o.source] = by_channel.get(o.source, 0.0) + (o.total if o.payment_status == "paid" else 0)
        if o.payment_status == "paid":
            total_paid += o.total
    # expenses
    exp = (await db.execute(select(M.Expense).where(M.Expense.expense_date >= since))).scalars().all()
    total_expense = sum(e.amount for e in exp)
    return {
        "total_paid_revenue": round(total_paid, 2),
        "total_expenses": round(total_expense, 2),
        "profit": round(total_paid - total_expense, 2),
        "by_day": [{"date": k, "revenue": round(v, 2)} for k, v in sorted(by_day.items())],
        "by_channel": [{"channel": k, "revenue": round(v, 2)} for k, v in by_channel.items()],
    }


# ========== MARKETING ==========
class CampaignIn(BaseModel):
    name: str
    channel: str
    status: str = "draft"
    spend: float = 0.0
    revenue: float = 0.0
    reach: int = 0
    clicks: int = 0
    conversions: int = 0
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


@api.get("/admin/marketing/campaigns")
async def list_campaigns(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.MarketingCampaign).order_by(desc(M.MarketingCampaign.created_at)))).scalars().all()
    return [{
        "id": c.id, "name": c.name, "channel": c.channel, "status": c.status,
        "spend": c.spend, "revenue": c.revenue, "reach": c.reach, "clicks": c.clicks,
        "conversions": c.conversions,
        "roi": round((c.revenue - c.spend) / c.spend * 100, 2) if c.spend else 0,
    } for c in rows]


@api.post("/admin/marketing/campaigns")
async def create_campaign(payload: CampaignIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.MarketingCampaign(**payload.model_dump())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": c.id}


@api.put("/admin/marketing/campaigns/{cid}")
async def update_campaign(cid: str, payload: CampaignIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.MarketingCampaign).where(M.MarketingCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    await db.commit()
    return {"ok": True}


@api.delete("/admin/marketing/campaigns/{cid}")
async def delete_campaign(cid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.MarketingCampaign).where(M.MarketingCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@api.get("/admin/notifications")
async def list_notifications(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), limit: int = 50):
    rows = (await db.execute(select(M.NotificationLog).order_by(desc(M.NotificationLog.created_at)).limit(limit))).scalars().all()
    return [{"id": n.id, "channel": n.channel, "to": n.to_address, "subject": n.subject,
             "body": n.body, "related_order": n.related_order, "created_at": n.created_at.isoformat()} for n in rows]


# ========== HEALTH ==========
@api.get("/")
async def root():
    return {"app": "Threadline SaaS ERP", "status": "ok"}


# ========== PAGE BUILDER ==========
class SectionIn(BaseModel):
    section_type: str
    sort_order: int = 0
    visible: bool = True
    config: dict = {}


class SectionUpdate(BaseModel):
    sort_order: Optional[int] = None
    visible: Optional[bool] = None
    config: Optional[dict] = None


class ThemeIn(BaseModel):
    config: dict


def _section_to_dict(s: M.PageSection):
    return {
        "id": s.id,
        "page": s.page,
        "section_type": s.section_type,
        "sort_order": s.sort_order,
        "visible": s.visible,
        "config": s.config or {},
    }


@api.get("/page/{page}")
async def get_page(page: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(M.PageSection).where(and_(M.PageSection.page == page, M.PageSection.visible == True)).order_by(M.PageSection.sort_order)
    )).scalars().all()
    theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
    return {
        "sections": [_section_to_dict(s) for s in rows],
        "theme": (theme.config if theme else DEFAULT_THEME),
    }


@api.get("/admin/page/{page}")
async def admin_get_page(page: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(
        select(M.PageSection).where(M.PageSection.page == page).order_by(M.PageSection.sort_order)
    )).scalars().all()
    return {"sections": [_section_to_dict(s) for s in rows]}


@api.post("/admin/page/{page}/sections")
async def add_section(page: str, payload: SectionIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    # default sort_order to end if not provided
    if payload.sort_order is None or payload.sort_order == 0:
        max_order = (await db.execute(
            select(func.max(M.PageSection.sort_order)).where(M.PageSection.page == page)
        )).scalar_one() or 0
        payload.sort_order = int(max_order) + 10
    s = M.PageSection(
        page=page,
        section_type=payload.section_type,
        sort_order=payload.sort_order,
        visible=payload.visible,
        config=payload.config,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _section_to_dict(s)


@api.put("/admin/page/sections/{sid}")
async def update_section(sid: str, payload: SectionUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.PageSection).where(M.PageSection.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    if payload.sort_order is not None:
        s.sort_order = payload.sort_order
    if payload.visible is not None:
        s.visible = payload.visible
    if payload.config is not None:
        s.config = payload.config
    s.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _section_to_dict(s)


@api.delete("/admin/page/sections/{sid}")
async def delete_section(sid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = (await db.execute(select(M.PageSection).where(M.PageSection.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Not found")
    await db.delete(s)
    await db.commit()
    return {"ok": True}


class ReorderIn(BaseModel):
    ids: list[str]


@api.post("/admin/page/{page}/reorder")
async def reorder_sections(page: str, payload: ReorderIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    for i, sid in enumerate(payload.ids):
        s = (await db.execute(select(M.PageSection).where(and_(M.PageSection.id == sid, M.PageSection.page == page)))).scalar_one_or_none()
        if s:
            s.sort_order = i * 10
    await db.commit()
    return {"ok": True}


@api.get("/theme")
async def get_theme(db: AsyncSession = Depends(get_db)):
    theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
    return theme.config if theme else DEFAULT_THEME


@api.put("/admin/theme")
async def update_theme(payload: ThemeIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
    if not theme:
        theme = M.ThemeSetting(id="default", config=payload.config)
        db.add(theme)
    else:
        theme.config = payload.config
        theme.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return theme.config


# ---- Media ----
class MediaUpload(BaseModel):
    data_base64: str
    mime_type: str = "image/png"
    filename: Optional[str] = None


@api.post("/admin/media")
async def upload_media(payload: MediaUpload, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    m = M.Media(
        data_base64=payload.data_base64,
        mime_type=payload.mime_type,
        filename=payload.filename,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return {"id": m.id, "url": f"/api/media/{m.id}", "mime_type": m.mime_type}


@api.get("/media/{mid}")
async def stream_media(mid: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(M.Media.data_base64, M.Media.mime_type).where(M.Media.id == mid)
    )).first()
    if not row:
        raise HTTPException(404, "Not found")
    try:
        raw = _b64.b64decode(row.data_base64)
    except Exception:
        raise HTTPException(500, "Corrupt")
    return _Response(
        content=raw,
        media_type=row.mime_type or "image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@api.delete("/admin/media/{mid}")
async def delete_media(mid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    m = (await db.execute(select(M.Media).where(M.Media.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Not found")
    await db.delete(m)
    await db.commit()
    return {"ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
