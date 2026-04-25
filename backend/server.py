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

import base64 as _b64
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from database import get_db, engine, Base
import models as M
from auth import (
    hash_password, verify_password,
    make_session_jwt, set_session_cookie, clear_session_cookie, get_session_token,
    get_current_user, get_current_user_optional, require_admin, require_roles,
    check_lockout, record_failed_login, clear_login_attempts,
    fetch_emergent_profile, create_db_session, gen_reset_token,
    ADMIN_ROLES,
)
from sl_locations import SL_DISTRICT_CITIES, all_districts, cities_for

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="ERP Storefront")
api = APIRouter(prefix="/api")


# ========== STARTUP ==========
async def _ensure_rls(conn):
    from sqlalchemy import text
    rows = (await conn.execute(text(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false"
    ))).fetchall()
    for (t,) in rows:
        await conn.execute(text(f'ALTER TABLE public."{t}" ENABLE ROW LEVEL SECURITY;'))
        await conn.execute(text(f'ALTER TABLE public."{t}" FORCE ROW LEVEL SECURITY;'))
        await conn.execute(text(
            f'CREATE POLICY service_role_all ON public."{t}" FOR ALL TO service_role USING (true) WITH CHECK (true);'
        ))
        await conn.execute(text(
            f'CREATE POLICY deny_public ON public."{t}" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);'
        ))


DEFAULT_THEME = {
    "primary_color": "#FF3B30",
    "primary_color_hover": "#D92D23",
    "background_color": "#09090B",
    "marquee_phrases": ["NEW DROP", "EST. 2026"],
    "marquee_separator": "//",
}

DEFAULT_HEADER_CONFIG = {
    "menu": [
        {"label": "Home", "url": "/"},
        {"label": "Shop", "url": "/shop"},
        {"label": "Account", "url": "/account"},
    ],
    "show_search": True,
    "show_cart": True,
    "show_login": True,
    "style": "minimal",  # minimal, bold, classic
    "sticky": True,
}

DEFAULT_FOOTER_CONFIG = {
    "tagline": "",
    "support_email": "",
    "support_phone": "",
    "columns": [
        {"title": "Shop", "links": [{"label": "All Products", "url": "/shop"}, {"label": "Featured", "url": "/shop?featured=1"}]},
        {"title": "Support", "links": [{"label": "Shipping Policy", "url": "/page/shipping-policy"}, {"label": "Returns & Refunds", "url": "/page/returns-policy"}]},
        {"title": "Account", "links": [{"label": "Sign In", "url": "/login"}, {"label": "My Orders", "url": "/account"}]},
    ],
    "social_links": [],
    "copyright": "All rights reserved.",
    "show_marquee": True,
}

DEFAULT_HOME_SECTIONS = [
    {"section_type": "hero", "config": {
        "badge_text": "NEW SEASON IN STOCK",
        "headline_line1": "Welcome to your store.",
        "headline_line2": "Edit me anytime.",
        "headline_line2_accent": True,
        "headline_size": "lg",
        "subheading": "Tell your story here. Customize from Page Builder in your admin panel.",
        "cta_primary_label": "Shop The Collection",
        "cta_primary_link": "/shop",
        "cta_secondary_label": "View Our Story",
        "cta_secondary_link": "/page/about",
        "image_url": "",
        "image_id": None,
        "image_position": "right",
        "overlay_opacity": 60,
        "height": "tall",
    }},
    {"section_type": "featured", "config": {
        "eyebrow": "Featured", "heading": "Best Sellers", "max_items": 8,
        "category_slug": None, "show_view_all_button": True,
        "view_all_label": "Shop All", "view_all_link": "/shop",
    }},
    {"section_type": "brand", "config": {
        "eyebrow": "About Us", "headline": "Built right.\nWorn easy.\nMade to last.",
        "paragraph": "Tell customers what makes your brand different.",
        "stats": [{"value": "100%", "label": "Quality"}],
        "image_url": "", "image_id": None, "image_side": "right", "tagline": "",
    }},
]

DEFAULT_PRODUCT_PAGE_SECTIONS = [
    {"section_type": "featured", "config": {
        "eyebrow": "You May Also Like", "heading": "Same Category", "max_items": 4,
        "category_slug": "_same_category", "show_view_all_button": False,
    }},
]

DEFAULT_POLICY_SHIPPING = [
    {"section_type": "custom", "config": {
        "block_type": "heading_text", "eyebrow": "POLICIES",
        "heading": "Shipping Policy",
        "text": "Edit this page from Admin → Page Builder → Shipping Policy. Customize text, add sections, link products to it.",
        "alignment": "left", "max_width": "narrow", "padding": "lg",
    }},
]

DEFAULT_POLICY_RETURNS = [
    {"section_type": "custom", "config": {
        "block_type": "heading_text", "eyebrow": "POLICIES",
        "heading": "Returns & Refunds",
        "text": "Edit this page from Admin → Page Builder → Returns & Refunds.",
        "alignment": "left", "max_width": "narrow", "padding": "lg",
    }},
]

DEFAULT_PAYMENT_METHODS = [
    {"code": "cod", "label": "Cash on Delivery", "scope": "online", "active": True, "sort_order": 0,
     "description": "Pay with cash when your order is delivered."},
    {"code": "payhere", "label": "PayHere (Card / Bank)", "scope": "online", "active": False, "sort_order": 10,
     "description": "Secure online payment via PayHere gateway.",
     "config": {"merchant_id": "", "merchant_secret": "", "sandbox": True}},
    {"code": "cash", "label": "Cash", "scope": "pos", "active": True, "sort_order": 0},
    {"code": "card_pos", "label": "Card (POS Terminal)", "scope": "pos", "active": True, "sort_order": 10},
]

DEFAULT_SYSTEM_PAGES = [
    {"slug": "home", "title": "Home", "is_system": True, "show_in_header_menu": False, "sort_order": 0},
    {"slug": "_header", "title": "Site Header", "is_system": True, "show_in_header_menu": False, "sort_order": -100},
    {"slug": "_footer", "title": "Site Footer", "is_system": True, "show_in_header_menu": False, "sort_order": -90},
    {"slug": "_product_page", "title": "Product Page Layout", "is_system": True, "show_in_header_menu": False, "sort_order": -80},
    {"slug": "shipping-policy", "title": "Shipping Policy", "is_system": True, "show_in_header_menu": False, "sort_order": 100},
    {"slug": "returns-policy", "title": "Returns & Refunds", "is_system": True, "show_in_header_menu": False, "sort_order": 110},
]


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_rls(conn)
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        # Default store
        store = (await db.execute(select(M.Store))).scalars().first()
        if not store:
            db.add(M.Store(name="Online Store", is_online=True, active=True, address="Online"))
            await db.commit()
        # Theme
        theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
        if not theme:
            db.add(M.ThemeSetting(id="default", config=DEFAULT_THEME))
            await db.commit()
        # Company settings
        cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
        if not cs:
            db.add(M.CompanySettings(id="default", company_name="My Brand", currency="LKR"))
            await db.commit()
        # System pages
        existing_pages = {p.slug for p in (await db.execute(select(M.CustomPage))).scalars().all()}
        for sp in DEFAULT_SYSTEM_PAGES:
            if sp["slug"] not in existing_pages:
                db.add(M.CustomPage(**sp))
        await db.commit()
        # Default sections
        async def _seed_page(slug, sections):
            existing = (await db.execute(select(M.PageSection).where(M.PageSection.page == slug))).scalars().first()
            if not existing:
                for i, sec in enumerate(sections):
                    db.add(M.PageSection(page=slug, section_type=sec["section_type"],
                                         sort_order=i * 10, visible=True, config=sec["config"]))
        await _seed_page("home", DEFAULT_HOME_SECTIONS)
        await _seed_page("_product_page", DEFAULT_PRODUCT_PAGE_SECTIONS)
        await _seed_page("shipping-policy", DEFAULT_POLICY_SHIPPING)
        await _seed_page("returns-policy", DEFAULT_POLICY_RETURNS)
        # Header/footer config: stored as a single 'config_block' section
        for slug, default_cfg in [("_header", DEFAULT_HEADER_CONFIG), ("_footer", DEFAULT_FOOTER_CONFIG)]:
            existing = (await db.execute(select(M.PageSection).where(M.PageSection.page == slug))).scalars().first()
            if not existing:
                db.add(M.PageSection(page=slug, section_type="config_block", sort_order=0, visible=True, config=default_cfg))
        # Payment methods
        if not (await db.execute(select(M.PaymentMethod))).scalars().first():
            for pm in DEFAULT_PAYMENT_METHODS:
                db.add(M.PaymentMethod(**pm))
        await db.commit()


# ========== UTILS ==========
def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


def new_order_number() -> str:
    return "ORD-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _public_user(u: M.User) -> dict:
    return {"user_id": u.user_id, "email": u.email, "name": u.name, "picture": u.picture,
            "role": u.role, "phone": u.phone}


# ========== SETUP WIZARD ==========
class SetupInit(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    tagline: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_address: Optional[str] = None
    currency: str = "LKR"
    admin_email: EmailStr
    admin_name: str = Field(..., min_length=1)
    admin_password: str = Field(..., min_length=8)


@api.get("/setup/status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    return {"setup_complete": bool(cs and cs.setup_complete),
            "company_name": cs.company_name if cs else None}


@api.post("/setup/init")
async def setup_init(payload: SetupInit, response: Response, db: AsyncSession = Depends(get_db)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    if cs and cs.setup_complete:
        raise HTTPException(409, "Setup already completed")
    # Create the super_admin
    email = payload.admin_email.lower()
    existing = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if existing:
        existing.password_hash = hash_password(payload.admin_password)
        existing.name = payload.admin_name
        existing.role = "super_admin"
        existing.active = True
        existing.auth_provider = "password"
        admin = existing
    else:
        admin = M.User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email, name=payload.admin_name, role="super_admin",
            password_hash=hash_password(payload.admin_password),
            auth_provider="password", active=True,
        )
        db.add(admin)
    if not cs:
        cs = M.CompanySettings(id="default")
        db.add(cs)
    cs.company_name = payload.company_name
    cs.tagline = payload.tagline
    cs.email = payload.company_email
    cs.phone = payload.company_phone
    cs.address = payload.company_address
    cs.currency = payload.currency or "LKR"
    cs.setup_complete = True
    cs.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(admin)
    token = make_session_jwt(admin.user_id)
    set_session_cookie(response, token)
    return {"ok": True, "user": _public_user(admin), "token": token}


# ========== AUTH ==========
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str
    phone: Optional[str] = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


@api.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    ident = f"{_client_ip(request)}:{email}"
    await check_lockout(db, ident)
    user = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        await record_failed_login(db, ident)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disabled")
    await clear_login_attempts(db, ident)
    token = make_session_jwt(user.user_id)
    set_session_cookie(response, token)
    return {"user": _public_user(user), "token": token}


@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    existing = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = M.User(
        user_id=f"user_{uuid.uuid4().hex[:12]}",
        email=email, name=payload.name, phone=payload.phone,
        password_hash=hash_password(payload.password),
        auth_provider="password", role="customer", active=True,
    )
    db.add(user)
    await db.flush()
    db.add(M.Customer(user_id=user.user_id, name=user.name, email=user.email, phone=user.phone))
    await db.commit()
    await db.refresh(user)
    token = make_session_jwt(user.user_id)
    set_session_cookie(response, token)
    return {"user": _public_user(user), "token": token}


@api.get("/auth/me")
async def auth_me(user: M.User = Depends(get_current_user)):
    return _public_user(user)


@api.post("/auth/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = await get_session_token(request)
    if token:
        # If this is a DB-backed session (Google OAuth), remove it
        sess = (await db.execute(select(M.UserSession).where(M.UserSession.session_token == token))).scalar_one_or_none()
        if sess:
            await db.delete(sess)
            await db.commit()
    clear_session_cookie(response)
    return {"ok": True}


@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: M.User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.auth_provider = "password"
    await db.commit()
    return {"ok": True}


# ---- Google OAuth (customer-only) ----
class SessionRequest(BaseModel):
    session_id: str


@api.post("/auth/session")
async def auth_session(payload: SessionRequest, response: Response, db: AsyncSession = Depends(get_db)):
    profile = await fetch_emergent_profile(payload.session_id)
    email = (profile.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")
    user = (await db.execute(select(M.User).where(M.User.email == email))).scalar_one_or_none()
    if user:
        # Existing user - update profile picture/name only
        if profile.get("name"):
            user.name = profile["name"]
        if profile.get("picture"):
            user.picture = profile["picture"]
    else:
        # Brand new user via Google = always customer (admins must use password)
        user = M.User(
            user_id=f"user_{uuid.uuid4().hex[:12]}",
            email=email, name=profile.get("name", email.split("@")[0]),
            picture=profile.get("picture"), role="customer",
            auth_provider="google", active=True,
        )
        db.add(user)
        await db.flush()
        db.add(M.Customer(user_id=user.user_id, name=user.name, email=user.email))
    await db.commit()
    await db.refresh(user)
    # Use DB-backed session for Google flow (matches their session_token)
    sess_token = profile.get("session_token") or uuid.uuid4().hex
    await create_db_session(db, user, sess_token)
    set_session_cookie(response, sess_token)
    return {"user": _public_user(user)}


# ========== COMPANY / SETTINGS ==========
def _company_dict(cs: M.CompanySettings):
    return {
        "company_name": cs.company_name, "tagline": cs.tagline,
        "email": cs.email, "phone": cs.phone, "address": cs.address,
        "currency": cs.currency,
        "logo_light_id": cs.logo_light_id, "logo_dark_id": cs.logo_dark_id,
        "favicon_id": cs.favicon_id, "setup_complete": cs.setup_complete,
    }


@api.get("/company")
async def get_company(db: AsyncSession = Depends(get_db)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    if not cs:
        return {"company_name": "My Brand", "currency": "LKR", "setup_complete": False}
    return _company_dict(cs)


class CompanyUpdate(BaseModel):
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    currency: Optional[str] = None
    logo_light_id: Optional[str] = None
    logo_dark_id: Optional[str] = None
    favicon_id: Optional[str] = None


@api.put("/admin/company")
async def update_company(payload: CompanyUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    if not cs:
        cs = M.CompanySettings(id="default")
        db.add(cs)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cs, k, v)
    cs.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _company_dict(cs)


# ========== INTEGRATION SETTINGS (SMTP/SendGrid/Brevo/Twilio/Notify.lk) ==========
class IntegrationIn(BaseModel):
    kind: str  # email, sms
    provider: str
    label: Optional[str] = None
    config: dict = {}
    active: bool = False
    is_default: bool = False


def _integration_dict(i: M.IntegrationSetting):
    return {"id": i.id, "kind": i.kind, "provider": i.provider, "label": i.label,
            "config": i.config or {}, "active": i.active, "is_default": i.is_default,
            "created_at": i.created_at.isoformat()}


@api.get("/admin/integrations")
async def list_integrations(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.IntegrationSetting).order_by(M.IntegrationSetting.kind, M.IntegrationSetting.created_at))).scalars().all()
    return [_integration_dict(i) for i in rows]


@api.post("/admin/integrations")
async def create_integration(payload: IntegrationIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    if payload.is_default:
        existing = (await db.execute(select(M.IntegrationSetting).where(M.IntegrationSetting.kind == payload.kind))).scalars().all()
        for e in existing:
            e.is_default = False
    i = M.IntegrationSetting(**payload.model_dump())
    db.add(i)
    await db.commit()
    await db.refresh(i)
    return _integration_dict(i)


@api.put("/admin/integrations/{iid}")
async def update_integration(iid: str, payload: IntegrationIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    i = (await db.execute(select(M.IntegrationSetting).where(M.IntegrationSetting.id == iid))).scalar_one_or_none()
    if not i:
        raise HTTPException(404, "Not found")
    if payload.is_default:
        for e in (await db.execute(select(M.IntegrationSetting).where(and_(M.IntegrationSetting.kind == payload.kind, M.IntegrationSetting.id != iid)))).scalars().all():
            e.is_default = False
    for k, v in payload.model_dump().items():
        setattr(i, k, v)
    await db.commit()
    return _integration_dict(i)


@api.delete("/admin/integrations/{iid}")
async def delete_integration(iid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    i = (await db.execute(select(M.IntegrationSetting).where(M.IntegrationSetting.id == iid))).scalar_one_or_none()
    if not i:
        raise HTTPException(404, "Not found")
    await db.delete(i)
    await db.commit()
    return {"ok": True}


# ========== CATEGORIES ==========
class CategoryIn(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0


def cat_to_dict(c):
    return {"id": c.id, "name": c.name, "slug": c.slug, "description": c.description, "sort_order": c.sort_order}


@api.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db), q: Optional[str] = None):
    query = select(M.Category).order_by(M.Category.sort_order, M.Category.name)
    if q:
        query = query.where(M.Category.name.ilike(f"%{q}%"))
    rows = (await db.execute(query)).scalars().all()
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
    shipping_note: Optional[str] = None
    returns_note: Optional[str] = None
    variants: List[VariantIn] = []


async def product_to_dict(p: M.Product, db: AsyncSession, include_details: bool = True):
    data = {
        "id": p.id, "name": p.name, "slug": p.slug, "description": p.description,
        "category_id": p.category_id, "base_price": p.base_price, "compare_price": p.compare_price,
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
                            "price_override": v.price_override, "sku": v.sku, "stock": inv_map.get(v.id, 0)}
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


@api.get("/products")
async def list_products(
    db: AsyncSession = Depends(get_db),
    category: Optional[str] = None, featured: Optional[bool] = None,
    search: Optional[str] = None, limit: int = 50, exclude_id: Optional[str] = None,
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
    if exclude_id:
        q = q.where(M.Product.id != exclude_id)
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
async def admin_list_products(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None):
    query = select(M.Product).order_by(desc(M.Product.created_at))
    if q:
        query = query.where(or_(M.Product.name.ilike(f"%{q}%"), M.Product.sku.ilike(f"%{q}%")))
    rows = (await db.execute(query)).scalars().all()
    return [await product_to_dict(p, db, include_details=True) for p in rows]


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
    return FastResponse(content=raw, media_type=row.mime_type or "image/png",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


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


@api.post("/admin/products")
async def create_product(payload: ProductIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    store = await _ensure_default_store(db)
    slug = slugify(payload.name) + "-" + uuid.uuid4().hex[:4]
    p = M.Product(
        name=payload.name, slug=slug, description=payload.description,
        category_id=payload.category_id, base_price=payload.base_price,
        compare_price=payload.compare_price, sku=payload.sku,
        status=payload.status, featured=payload.featured,
        shipping_note=payload.shipping_note, returns_note=payload.returns_note,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    for v in payload.variants:
        variant = M.Variant(product_id=p.id, size=v.size, color=v.color, color_hex=v.color_hex,
                            price_override=v.price_override, sku=v.sku)
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
    p.name = payload.name; p.description = payload.description
    p.category_id = payload.category_id; p.base_price = payload.base_price
    p.compare_price = payload.compare_price; p.sku = payload.sku
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
            ev.price_override = v.price_override; ev.sku = v.sku
            inv = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == ev.id, M.Inventory.store_id == store.id)))).scalar_one_or_none()
            if inv:
                inv.quantity = v.stock
            else:
                db.add(M.Inventory(variant_id=ev.id, store_id=store.id, quantity=v.stock))
            incoming_ids.add(v.id)
        else:
            nv = M.Variant(product_id=p.id, size=v.size, color=v.color, color_hex=v.color_hex,
                          price_override=v.price_override, sku=v.sku)
            db.add(nv); await db.flush()
            db.add(M.Inventory(variant_id=nv.id, store_id=store.id, quantity=v.stock))
            incoming_ids.add(nv.id)
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
    color: Optional[str] = None  # bind to a specific color variant


@api.post("/admin/products/{pid}/images")
async def add_product_image(pid: str, payload: ImagePayload, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Product).where(M.Product.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
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


@api.put("/admin/products/images/{img_id}")
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
async def list_inventory(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None, store_id: Optional[str] = None):
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
        })
    return out


class StockMoveIn(BaseModel):
    variant_id: str
    store_id: Optional[str] = None
    type: str
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


@api.post("/admin/inventory/transfer")
async def transfer_stock(payload: TransferIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
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


@api.get("/admin/stock-movements")
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


# ========== STORES ==========
class StoreIn(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    is_online: bool = False
    active: bool = True


@api.get("/admin/stores")
async def list_stores(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.Store).order_by(desc(M.Store.is_online), M.Store.name))).scalars().all()
    return [{"id": s.id, "name": s.name, "address": s.address, "phone": s.phone, "is_online": s.is_online, "active": s.active} for s in rows]


@api.post("/admin/stores")
async def create_store(payload: StoreIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    s = M.Store(**payload.model_dump())
    db.add(s); await db.commit(); await db.refresh(s)
    return {"id": s.id}


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
    await db.delete(s); await db.commit()
    return {"ok": True}


# ========== SHIPPING & PAYMENTS ==========
@api.get("/locations")
async def get_locations():
    return {"districts": all_districts(), "by_district": SL_DISTRICT_CITIES}


@api.get("/shipping/quote")
async def shipping_quote(district: Optional[str] = None, city: Optional[str] = None, subtotal: float = 0.0, db: AsyncSession = Depends(get_db)):
    rules = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.active == True).order_by(M.ShippingRule.sort_order))).scalars().all()
    # Most specific (district+city) > district-only > default fallback (district null)
    matched = None
    for r in rules:
        if r.district and r.city and r.district == district and r.city == city:
            matched = r; break
    if not matched:
        for r in rules:
            if r.district and not r.city and r.district == district:
                matched = r; break
    if not matched:
        for r in rules:
            if not r.district and not r.city:
                matched = r; break
    fee = matched.fee if matched else 0.0
    if matched and matched.free_above is not None and subtotal >= matched.free_above:
        fee = 0.0
    return {"fee": fee, "matched_rule_id": matched.id if matched else None,
            "label": matched.label if matched else None}


def _shipping_rule_dict(r):
    return {"id": r.id, "district": r.district, "city": r.city, "fee": r.fee,
            "free_above": r.free_above, "label": r.label, "active": r.active, "sort_order": r.sort_order}


@api.get("/admin/shipping/rules")
async def list_shipping_rules(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.ShippingRule).order_by(M.ShippingRule.sort_order, M.ShippingRule.district, M.ShippingRule.city))).scalars().all()
    return [_shipping_rule_dict(r) for r in rows]


class ShippingRuleIn(BaseModel):
    district: Optional[str] = None
    city: Optional[str] = None
    fee: float = 0.0
    free_above: Optional[float] = None
    label: Optional[str] = None
    active: bool = True
    sort_order: int = 0


@api.post("/admin/shipping/rules")
async def create_shipping_rule(payload: ShippingRuleIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    r = M.ShippingRule(**payload.model_dump())
    db.add(r); await db.commit(); await db.refresh(r)
    return _shipping_rule_dict(r)


@api.put("/admin/shipping/rules/{rid}")
async def update_shipping_rule(rid: str, payload: ShippingRuleIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    r = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.id == rid))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(r, k, v)
    await db.commit()
    return _shipping_rule_dict(r)


@api.delete("/admin/shipping/rules/{rid}")
async def delete_shipping_rule(rid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    r = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.id == rid))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Not found")
    await db.delete(r); await db.commit()
    return {"ok": True}


def _payment_dict(p):
    return {"id": p.id, "code": p.code, "label": p.label, "description": p.description,
            "scope": p.scope, "active": p.active, "sort_order": p.sort_order, "config": p.config or {}}


@api.get("/payment-methods")
async def public_payment_methods(scope: str = "online", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(M.PaymentMethod).where(and_(M.PaymentMethod.scope == scope, M.PaymentMethod.active == True)).order_by(M.PaymentMethod.sort_order))).scalars().all()
    # Don't leak provider config publicly
    return [{"id": p.id, "code": p.code, "label": p.label, "description": p.description, "scope": p.scope} for p in rows]


@api.get("/admin/payment-methods")
async def list_payment_methods(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.PaymentMethod).order_by(M.PaymentMethod.scope, M.PaymentMethod.sort_order))).scalars().all()
    return [_payment_dict(p) for p in rows]


class PaymentMethodIn(BaseModel):
    code: str
    label: str
    description: Optional[str] = None
    scope: str = "online"
    active: bool = True
    sort_order: int = 0
    config: dict = {}


@api.post("/admin/payment-methods")
async def create_payment_method(payload: PaymentMethodIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = M.PaymentMethod(**payload.model_dump())
    db.add(p); await db.commit(); await db.refresh(p)
    return _payment_dict(p)


@api.put("/admin/payment-methods/{pid}")
async def update_payment_method(pid: str, payload: PaymentMethodIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.PaymentMethod).where(M.PaymentMethod.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    await db.commit()
    return _payment_dict(p)


@api.delete("/admin/payment-methods/{pid}")
async def delete_payment_method(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.PaymentMethod).where(M.PaymentMethod.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    await db.delete(p); await db.commit()
    return {"ok": True}


# ========== ORDERS / CHECKOUT ==========
class OrderItemIn(BaseModel):
    variant_id: str
    quantity: int


class CheckoutIn(BaseModel):
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_district: Optional[str] = None
    shipping_city: Optional[str] = None
    items: List[OrderItemIn]
    coupon_code: Optional[str] = None
    payment_method: str = "cod"
    notes: Optional[str] = None
    source: str = "online"
    store_id: Optional[str] = None


async def _log_notification(db, channel, to, subject, body, order_id=None, status="mocked", provider=None):
    db.add(M.NotificationLog(channel=channel, to_address=to, subject=subject, body=body,
                              related_order=order_id, status=status, provider=provider))


async def _build_order_response(o: M.Order, db: AsyncSession):
    items = (await db.execute(select(M.OrderItem).where(M.OrderItem.order_id == o.id))).scalars().all()
    return {
        "id": o.id, "order_number": o.order_number, "status": o.status,
        "payment_method": o.payment_method, "payment_status": o.payment_status,
        "subtotal": o.subtotal, "discount": o.discount, "coupon_code": o.coupon_code,
        "shipping": o.shipping, "tax": o.tax, "total": o.total,
        "customer_name": o.customer_name, "customer_email": o.customer_email,
        "customer_phone": o.customer_phone, "shipping_address": o.shipping_address,
        "shipping_district": o.shipping_district, "shipping_city": o.shipping_city,
        "source": o.source, "notes": o.notes, "created_at": o.created_at.isoformat(),
        "items": [{"id": i.id, "product_name": i.product_name, "variant_label": i.variant_label,
                   "unit_price": i.unit_price, "quantity": i.quantity, "subtotal": i.subtotal} for i in items],
    }


async def _resolve_shipping_fee(db, district, city, subtotal):
    rules = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.active == True).order_by(M.ShippingRule.sort_order))).scalars().all()
    matched = None
    for r in rules:
        if r.district and r.city and r.district == district and r.city == city:
            matched = r; break
    if not matched:
        for r in rules:
            if r.district and not r.city and r.district == district:
                matched = r; break
    if not matched:
        for r in rules:
            if not r.district and not r.city:
                matched = r; break
    if not matched:
        return 0.0
    fee = matched.fee
    if matched.free_above is not None and subtotal >= matched.free_above:
        fee = 0.0
    return fee


@api.post("/checkout")
async def checkout(payload: CheckoutIn, request: Request, db: AsyncSession = Depends(get_db)):
    if not payload.items:
        raise HTTPException(400, "Empty cart")
    store = await _ensure_default_store(db)
    store_id = payload.store_id or store.id
    user = await get_current_user_optional(request, db)
    customer = None
    if user:
        customer = (await db.execute(select(M.Customer).where(M.Customer.user_id == user.user_id))).scalar_one_or_none()
    if not customer and payload.customer_phone:
        customer = (await db.execute(select(M.Customer).where(M.Customer.phone == payload.customer_phone))).scalar_one_or_none()
    if not customer and payload.customer_email:
        customer = (await db.execute(select(M.Customer).where(M.Customer.email == payload.customer_email))).scalar_one_or_none()
    if not customer:
        customer = M.Customer(user_id=user.user_id if user else None,
                              name=payload.customer_name, email=payload.customer_email,
                              phone=payload.customer_phone, address=payload.shipping_address,
                              district=payload.shipping_district, city=payload.shipping_city)
        db.add(customer); await db.flush()
    else:
        # Update customer profile with latest info
        if payload.customer_name and not customer.name:
            customer.name = payload.customer_name
        if payload.customer_email and not customer.email:
            customer.email = payload.customer_email
        if payload.shipping_district:
            customer.district = payload.shipping_district
        if payload.shipping_city:
            customer.city = payload.shipping_city

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
            raise HTTPException(400, f"Minimum order {coupon.min_order} required")
        discount = round(subtotal * (coupon.value / 100.0), 2) if coupon.type == "percent" else min(subtotal, coupon.value)

    if payload.source == "pos":
        shipping_fee = 0.0
    else:
        shipping_fee = await _resolve_shipping_fee(db, payload.shipping_district, payload.shipping_city, subtotal)
    total = max(0.0, subtotal - discount + shipping_fee)

    # Resolve payment status by method
    paid_methods = {"cash", "card_pos"}
    payment_status = "paid" if payload.payment_method in paid_methods else "pending"
    order_status = "paid" if payment_status == "paid" else "pending"

    order = M.Order(
        order_number=new_order_number(), customer_id=customer.id,
        customer_name=payload.customer_name, customer_email=payload.customer_email,
        customer_phone=payload.customer_phone, shipping_address=payload.shipping_address,
        shipping_district=payload.shipping_district, shipping_city=payload.shipping_city,
        status=order_status, payment_method=payload.payment_method, payment_status=payment_status,
        subtotal=subtotal, discount=discount, coupon_code=coupon.code if coupon else None,
        shipping=shipping_fee, total=total, store_id=store_id,
        created_by=user.user_id if user else None, source=payload.source, notes=payload.notes,
    )
    db.add(order); await db.flush()
    for v, p, inv, price, qty, line_sub, vlabel in order_items_data:
        db.add(M.OrderItem(order_id=order.id, variant_id=v.id, product_id=p.id,
                            product_name=p.name, variant_label=vlabel, unit_price=price,
                            quantity=qty, subtotal=line_sub))
        inv.quantity = max(0, inv.quantity - qty)
        db.add(M.StockMovement(variant_id=v.id, store_id=store_id, type="sale", quantity=qty,
                                reason=f"Order {order.order_number}", reference=order.order_number,
                                user_id=user.user_id if user else None))
    if coupon:
        coupon.used_count += 1
    customer.total_orders += 1
    customer.total_spent += total
    if payload.customer_email:
        await _log_notification(db, "email", payload.customer_email,
                                 f"Order {order.order_number} confirmed",
                                 f"Thank you {payload.customer_name}! Order {order.order_number} total {total:.2f}.",
                                 order.id)
    if payload.customer_phone:
        await _log_notification(db, "sms", payload.customer_phone, "Order Confirmed",
                                 f"Order {order.order_number} confirmed. Total {total:.2f}.",
                                 order.id)
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
async def admin_orders(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), status: Optional[str] = None, q: Optional[str] = None, limit: int = 100):
    query = select(M.Order).order_by(desc(M.Order.created_at))
    if status:
        query = query.where(M.Order.status == status)
    if q:
        query = query.where(or_(
            M.Order.order_number.ilike(f"%{q}%"),
            M.Order.customer_name.ilike(f"%{q}%"),
            M.Order.customer_phone.ilike(f"%{q}%"),
            M.Order.customer_email.ilike(f"%{q}%"),
        ))
    rows = (await db.execute(query.limit(limit))).scalars().all()
    return [await _build_order_response(o, db) for o in rows]


class OrderStatusIn(BaseModel):
    status: str


@api.put("/admin/orders/{oid}/status")
async def update_order_status(oid: str, payload: OrderStatusIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    o = (await db.execute(select(M.Order).where(M.Order.id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    o.status = payload.status
    if o.customer_email:
        await _log_notification(db, "email", o.customer_email, f"Order {o.order_number} {payload.status}",
                                 f"Your order {o.order_number} status: {payload.status}.", o.id)
    await db.commit()
    return {"ok": True, "status": o.status}


# ========== CUSTOMERS ==========
@api.get("/admin/customers")
async def list_customers(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None, limit: int = 200):
    query = select(M.Customer).order_by(desc(M.Customer.created_at))
    if q:
        # Search by name, phone, email, or order_number
        # First check if a matching order_number exists
        order_match = (await db.execute(select(M.Order).where(M.Order.order_number.ilike(f"%{q}%")))).scalars().first()
        if order_match and order_match.customer_id:
            query = query.where(M.Customer.id == order_match.customer_id)
        else:
            query = query.where(or_(
                M.Customer.name.ilike(f"%{q}%"),
                M.Customer.phone.ilike(f"%{q}%"),
                M.Customer.email.ilike(f"%{q}%"),
            ))
    rows = (await db.execute(query.limit(limit))).scalars().all()
    return [{"id": c.id, "name": c.name, "email": c.email, "phone": c.phone, "address": c.address,
             "district": c.district, "city": c.city,
             "notes": c.notes, "total_orders": c.total_orders, "total_spent": c.total_spent,
             "created_at": c.created_at.isoformat()} for c in rows]


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None


class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None


@api.post("/admin/customers")
async def create_customer(payload: CustomerCreate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    # Auto-deduplicate by phone or email
    existing = None
    if payload.phone:
        existing = (await db.execute(select(M.Customer).where(M.Customer.phone == payload.phone))).scalar_one_or_none()
    if not existing and payload.email:
        existing = (await db.execute(select(M.Customer).where(M.Customer.email == payload.email))).scalar_one_or_none()
    if existing:
        return {"id": existing.id, "name": existing.name, "phone": existing.phone, "email": existing.email,
                "address": existing.address, "district": existing.district, "city": existing.city, "deduplicated": True}
    c = M.Customer(**payload.model_dump())
    db.add(c); await db.commit(); await db.refresh(c)
    return {"id": c.id, "name": c.name, "phone": c.phone, "email": c.email,
            "address": c.address, "district": c.district, "city": c.city}


@api.put("/admin/customers/{cid}")
async def update_customer(cid: str, payload: CustomerUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = (await db.execute(select(M.Customer).where(M.Customer.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await db.commit()
    return {"ok": True}


# Logged-in customer fetch own profile (for autofill)
@api.get("/my/profile")
async def my_profile(user: M.User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    customer = (await db.execute(select(M.Customer).where(M.Customer.user_id == user.user_id))).scalar_one_or_none()
    if not customer:
        return {"name": user.name, "email": user.email, "phone": user.phone}
    return {"name": customer.name, "email": customer.email, "phone": customer.phone,
            "address": customer.address, "district": customer.district, "city": customer.city}


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
async def list_coupons(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None):
    query = select(M.Coupon).order_by(desc(M.Coupon.created_at))
    if q:
        query = query.where(M.Coupon.code.ilike(f"%{q}%"))
    rows = (await db.execute(query)).scalars().all()
    return [{"id": c.id, "code": c.code, "type": c.type, "value": c.value, "min_order": c.min_order,
             "usage_limit": c.usage_limit, "used_count": c.used_count, "active": c.active,
             "expires_at": c.expires_at.isoformat() if c.expires_at else None} for c in rows]


@api.post("/admin/coupons")
async def create_coupon(payload: CouponIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.Coupon(**payload.model_dump()); c.code = c.code.upper()
    db.add(c); await db.commit(); await db.refresh(c)
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
    await db.delete(c); await db.commit()
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
async def list_expenses(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None):
    query = select(M.Expense).order_by(desc(M.Expense.expense_date))
    if q:
        query = query.where(or_(M.Expense.category.ilike(f"%{q}%"), M.Expense.description.ilike(f"%{q}%")))
    rows = (await db.execute(query)).scalars().all()
    return [{"id": e.id, "category": e.category, "amount": e.amount, "description": e.description,
             "expense_date": e.expense_date.isoformat()} for e in rows]


@api.post("/admin/expenses")
async def create_expense(payload: ExpenseIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
    e = M.Expense(**payload.model_dump(exclude_unset=True))
    e.created_by = user.user_id
    if not e.expense_date:
        e.expense_date = datetime.now(timezone.utc)
    db.add(e); await db.commit(); await db.refresh(e)
    return {"id": e.id}


@api.delete("/admin/expenses/{eid}")
async def delete_expense(eid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    e = (await db.execute(select(M.Expense).where(M.Expense.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Not found")
    await db.delete(e); await db.commit()
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
        out.append({"id": p.id, "staff_user_id": p.staff_user_id, "staff_name": u.name if u else "",
                    "month": p.month, "year": p.year, "base_salary": p.base_salary, "bonus": p.bonus,
                    "deduction": p.deduction, "net": p.net, "status": p.status,
                    "paid_date": p.paid_date.isoformat() if p.paid_date else None})
    return out


@api.post("/admin/payroll")
async def create_payroll(payload: PayrollIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    net = payload.base_salary + payload.bonus - payload.deduction
    p = M.Payroll(**payload.model_dump(), net=net)
    if payload.status == "paid":
        p.paid_date = datetime.now(timezone.utc)
    db.add(p); await db.commit(); await db.refresh(p)
    return {"id": p.id}


@api.put("/admin/payroll/{pid}/pay")
async def mark_payroll_paid(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.Payroll).where(M.Payroll.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    p.status = "paid"; p.paid_date = datetime.now(timezone.utc)
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
    password: Optional[str] = None  # Optional initial password


@api.get("/admin/staff")
async def list_staff(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), q: Optional[str] = None):
    query = select(M.User).where(M.User.role != "customer").order_by(desc(M.User.created_at))
    if q:
        query = query.where(or_(M.User.name.ilike(f"%{q}%"), M.User.email.ilike(f"%{q}%")))
    rows = (await db.execute(query)).scalars().all()
    return [{"user_id": u.user_id, "email": u.email, "name": u.name, "phone": u.phone,
             "role": u.role, "base_salary": u.base_salary, "active": u.active,
             "auth_provider": u.auth_provider,
             "created_at": u.created_at.isoformat()} for u in rows]


@api.post("/admin/staff")
async def create_staff(payload: StaffIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    existing = (await db.execute(select(M.User).where(M.User.email == payload.email.lower()))).scalar_one_or_none()
    if existing:
        existing.role = payload.role; existing.name = payload.name
        existing.phone = payload.phone; existing.base_salary = payload.base_salary
        existing.active = payload.active
        if payload.password:
            existing.password_hash = hash_password(payload.password)
            existing.auth_provider = "password"
        await db.commit()
        return {"user_id": existing.user_id}
    u = M.User(user_id=f"user_{uuid.uuid4().hex[:12]}", email=payload.email.lower(), name=payload.name,
               phone=payload.phone, role=payload.role, base_salary=payload.base_salary,
               active=payload.active, auth_provider="password",
               password_hash=hash_password(payload.password) if payload.password else None)
    db.add(u); await db.commit(); await db.refresh(u)
    return {"user_id": u.user_id}


@api.put("/admin/staff/{uid}")
async def update_staff(uid: str, payload: StaffIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_roles("super_admin"))):
    u = (await db.execute(select(M.User).where(M.User.user_id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Not found")
    u.email = payload.email.lower(); u.name = payload.name; u.phone = payload.phone
    u.role = payload.role; u.base_salary = payload.base_salary; u.active = payload.active
    if payload.password:
        u.password_hash = hash_password(payload.password)
        u.auth_provider = "password"
    await db.commit()
    return {"ok": True}


@api.delete("/admin/staff/{uid}")
async def delete_staff(uid: str, db: AsyncSession = Depends(get_db), current: M.User = Depends(require_roles("super_admin"))):
    if uid == current.user_id:
        raise HTTPException(400, "Cannot delete yourself")
    u = (await db.execute(select(M.User).where(M.User.user_id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Not found")
    u.active = False; u.role = "customer"
    await db.commit()
    return {"ok": True}


# ========== REPORTS / DASHBOARD ==========
@api.get("/admin/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    now = datetime.now(timezone.utc); d30 = now - timedelta(days=30); d14 = now - timedelta(days=14)
    orders_30 = (await db.execute(select(M.Order).where(M.Order.created_at >= d30))).scalars().all()
    total_revenue = sum(o.total for o in orders_30 if o.payment_status == "paid")
    customer_count = (await db.execute(select(func.count(M.Customer.id)))).scalar_one()
    low_rows = (await db.execute(select(M.Inventory))).scalars().all()
    low_stock = [x for x in low_rows if x.quantity <= x.low_stock_threshold]
    daily_orders = (await db.execute(select(M.Order).where(M.Order.created_at >= d14))).scalars().all()
    daily = {}
    for o in daily_orders:
        if o.payment_status != "paid":
            continue
        d = o.created_at.strftime("%Y-%m-%d")
        daily[d] = daily.get(d, 0) + o.total
    sales_chart = [{"date": k, "revenue": round(v, 2)} for k, v in sorted(daily.items())]
    items = (await db.execute(select(M.OrderItem))).scalars().all()
    top_map = {}
    for i in items:
        top_map[i.product_name] = top_map.get(i.product_name, 0) + i.quantity
    top_products = sorted([{"name": k, "qty": v} for k, v in top_map.items()], key=lambda x: -x["qty"])[:5]
    status_map = {}
    for o in orders_30:
        status_map[o.status] = status_map.get(o.status, 0) + 1
    return {"total_revenue": round(total_revenue, 2), "total_orders": len(orders_30),
            "customer_count": customer_count, "low_stock_count": len(low_stock),
            "sales_chart": sales_chart, "top_products": top_products,
            "status_breakdown": [{"status": k, "count": v} for k, v in status_map.items()]}


@api.get("/admin/reports/sales")
async def sales_report(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), days: int = 30):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    orders = (await db.execute(select(M.Order).where(M.Order.created_at >= since))).scalars().all()
    by_day = {}; by_channel = {}; total_paid = 0.0
    for o in orders:
        d = o.created_at.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0.0) + (o.total if o.payment_status == "paid" else 0)
        by_channel[o.source] = by_channel.get(o.source, 0.0) + (o.total if o.payment_status == "paid" else 0)
        if o.payment_status == "paid":
            total_paid += o.total
    exp = (await db.execute(select(M.Expense).where(M.Expense.expense_date >= since))).scalars().all()
    total_expense = sum(e.amount for e in exp)
    return {"total_paid_revenue": round(total_paid, 2), "total_expenses": round(total_expense, 2),
            "profit": round(total_paid - total_expense, 2),
            "by_day": [{"date": k, "revenue": round(v, 2)} for k, v in sorted(by_day.items())],
            "by_channel": [{"channel": k, "revenue": round(v, 2)} for k, v in by_channel.items()]}


# ========== MARKETING ==========
class CampaignIn(BaseModel):
    name: str; channel: str; status: str = "draft"
    spend: float = 0.0; revenue: float = 0.0; reach: int = 0
    clicks: int = 0; conversions: int = 0
    start_date: Optional[datetime] = None; end_date: Optional[datetime] = None


@api.get("/admin/marketing/campaigns")
async def list_campaigns(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.MarketingCampaign).order_by(desc(M.MarketingCampaign.created_at)))).scalars().all()
    return [{"id": c.id, "name": c.name, "channel": c.channel, "status": c.status,
             "spend": c.spend, "revenue": c.revenue, "reach": c.reach, "clicks": c.clicks,
             "conversions": c.conversions,
             "roi": round((c.revenue - c.spend) / c.spend * 100, 2) if c.spend else 0} for c in rows]


@api.post("/admin/marketing/campaigns")
async def create_campaign(payload: CampaignIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    c = M.MarketingCampaign(**payload.model_dump())
    db.add(c); await db.commit(); await db.refresh(c)
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
    await db.delete(c); await db.commit()
    return {"ok": True}


@api.get("/admin/notifications")
async def list_notifications(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), limit: int = 50):
    rows = (await db.execute(select(M.NotificationLog).order_by(desc(M.NotificationLog.created_at)).limit(limit))).scalars().all()
    return [{"id": n.id, "channel": n.channel, "to": n.to_address, "subject": n.subject,
             "body": n.body, "related_order": n.related_order, "status": n.status,
             "provider": n.provider, "created_at": n.created_at.isoformat()} for n in rows]


# ========== PAGES & PAGE BUILDER ==========
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


def _section_to_dict(s):
    return {"id": s.id, "page": s.page, "section_type": s.section_type,
            "sort_order": s.sort_order, "visible": s.visible, "config": s.config or {}}


def _page_to_dict(p):
    return {"id": p.id, "slug": p.slug, "title": p.title, "is_system": p.is_system,
            "show_in_header_menu": p.show_in_header_menu, "sort_order": p.sort_order,
            "visible": p.visible}


@api.get("/page/{page}")
async def get_page(page: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(M.PageSection).where(and_(M.PageSection.page == page, M.PageSection.visible == True)).order_by(M.PageSection.sort_order)
    )).scalars().all()
    theme = (await db.execute(select(M.ThemeSetting).where(M.ThemeSetting.id == "default"))).scalar_one_or_none()
    meta = (await db.execute(select(M.CustomPage).where(M.CustomPage.slug == page))).scalar_one_or_none()
    return {"sections": [_section_to_dict(s) for s in rows],
            "theme": (theme.config if theme else DEFAULT_THEME),
            "meta": _page_to_dict(meta) if meta else None}


@api.get("/pages")
async def list_public_pages(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(M.CustomPage).where(and_(
        M.CustomPage.visible == True, M.CustomPage.is_system == False
    )).order_by(M.CustomPage.sort_order, M.CustomPage.title))).scalars().all()
    return [_page_to_dict(p) for p in rows]


@api.get("/admin/pages")
async def admin_list_pages(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(select(M.CustomPage).order_by(M.CustomPage.is_system.desc(), M.CustomPage.sort_order, M.CustomPage.title))).scalars().all()
    return [_page_to_dict(p) for p in rows]


class PageIn(BaseModel):
    slug: Optional[str] = None
    title: str
    show_in_header_menu: bool = False
    sort_order: int = 0
    visible: bool = True


@api.post("/admin/pages")
async def create_page(payload: PageIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    slug = (payload.slug and slugify(payload.slug)) or slugify(payload.title)
    if (await db.execute(select(M.CustomPage).where(M.CustomPage.slug == slug))).scalar_one_or_none():
        slug = slug + "-" + uuid.uuid4().hex[:4]
    p = M.CustomPage(slug=slug, title=payload.title, show_in_header_menu=payload.show_in_header_menu,
                      sort_order=payload.sort_order, visible=payload.visible, is_system=False)
    db.add(p); await db.commit(); await db.refresh(p)
    # Seed an initial empty heading_text section
    db.add(M.PageSection(page=slug, section_type="custom", sort_order=0, visible=True,
                          config={"block_type": "heading_text", "eyebrow": "", "heading": payload.title,
                                  "text": "Edit this page from Page Builder.", "alignment": "left",
                                  "max_width": "narrow", "padding": "lg"}))
    await db.commit()
    return _page_to_dict(p)


@api.put("/admin/pages/{pid}")
async def update_page(pid: str, payload: PageIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.CustomPage).where(M.CustomPage.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    p.title = payload.title; p.show_in_header_menu = payload.show_in_header_menu
    p.sort_order = payload.sort_order; p.visible = payload.visible
    await db.commit()
    return _page_to_dict(p)


@api.delete("/admin/pages/{pid}")
async def delete_page(pid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    p = (await db.execute(select(M.CustomPage).where(M.CustomPage.id == pid))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Not found")
    if p.is_system:
        raise HTTPException(400, "Cannot delete system page")
    # delete sections too
    for s in (await db.execute(select(M.PageSection).where(M.PageSection.page == p.slug))).scalars().all():
        await db.delete(s)
    await db.delete(p); await db.commit()
    return {"ok": True}


@api.get("/admin/page/{page}")
async def admin_get_page(page: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    rows = (await db.execute(
        select(M.PageSection).where(M.PageSection.page == page).order_by(M.PageSection.sort_order)
    )).scalars().all()
    return {"sections": [_section_to_dict(s) for s in rows]}


@api.post("/admin/page/{page}/sections")
async def add_section(page: str, payload: SectionIn, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    if payload.sort_order is None or payload.sort_order == 0:
        max_order = (await db.execute(select(func.max(M.PageSection.sort_order)).where(M.PageSection.page == page))).scalar_one() or 0
        payload.sort_order = int(max_order) + 10
    s = M.PageSection(page=page, section_type=payload.section_type, sort_order=payload.sort_order,
                      visible=payload.visible, config=payload.config)
    db.add(s); await db.commit(); await db.refresh(s)
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
    await db.delete(s); await db.commit()
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
        theme = M.ThemeSetting(id="default", config=payload.config); db.add(theme)
    else:
        theme.config = payload.config; theme.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return theme.config


# ---- Media ----
class MediaUpload(BaseModel):
    data_base64: str
    mime_type: str = "image/png"
    filename: Optional[str] = None


@api.post("/admin/media")
async def upload_media(payload: MediaUpload, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    m = M.Media(data_base64=payload.data_base64, mime_type=payload.mime_type, filename=payload.filename)
    db.add(m); await db.commit(); await db.refresh(m)
    return {"id": m.id, "url": f"/api/media/{m.id}", "mime_type": m.mime_type}


@api.get("/media/{mid}")
async def stream_media(mid: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(M.Media.data_base64, M.Media.mime_type).where(M.Media.id == mid))).first()
    if not row:
        raise HTTPException(404, "Not found")
    try:
        raw = _b64.b64decode(row.data_base64)
    except Exception:
        raise HTTPException(500, "Corrupt")
    return FastResponse(content=raw, media_type=row.mime_type or "image/png",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


@api.delete("/admin/media/{mid}")
async def delete_media(mid: str, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    m = (await db.execute(select(M.Media).where(M.Media.id == mid))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Not found")
    await db.delete(m); await db.commit()
    return {"ok": True}


# ========== HEALTH ==========
@api.get("/")
async def root():
    return {"app": "ERP Storefront", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
