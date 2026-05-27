import os
import logging
from pathlib import Path
from dotenv import load_dotenv

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import select

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from database import engine, Base
import models as M

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


# Idempotent column additions for evolving schema (run on startup).
COLUMN_MIGRATIONS = [
    ('users', 'permissions', 'JSONB'),
    ('products', 'supplier_id', 'VARCHAR(64)'),
    ('products', 'cost_price', 'DOUBLE PRECISION'),
    ('coupons', 'scope', "VARCHAR(16) DEFAULT 'all'"),
    ('coupons', 'scope_product_ids', 'JSONB'),
    ('coupons', 'scope_category_ids', 'JSONB'),
    ('expenses', 'store_id', 'VARCHAR(64)'),
    ('expenses', 'method', "VARCHAR(16) DEFAULT 'cash'"),
    ('expenses', 'cash_account_id', 'VARCHAR(64)'),
    ('orders', 'cash_tendered', 'DOUBLE PRECISION'),
    ('orders', 'cash_change', 'DOUBLE PRECISION'),
    ('orders', 'card_last4', 'VARCHAR(8)'),
    ('orders', 'cash_account_id', 'VARCHAR(64)'),
    ('company_settings', 'meta_title', 'VARCHAR(255)'),
    ('company_settings', 'meta_description', 'TEXT'),
    ('company_settings', 'meta_keywords', 'TEXT'),
    ('company_settings', 'og_image_id', 'VARCHAR(64)'),
    ('company_settings', 'google_analytics_id', 'VARCHAR(64)'),
    ('company_settings', 'google_site_verification', 'VARCHAR(128)'),
    ('company_settings', 'facebook_pixel_id', 'VARCHAR(64)'),
    ('company_settings', 'instagram_url', 'VARCHAR(255)'),
    ('company_settings', 'facebook_url', 'VARCHAR(255)'),
    ('company_settings', 'tiktok_url', 'VARCHAR(255)'),
    ('company_settings', 'twitter_url', 'VARCHAR(255)'),
    ('company_settings', 'youtube_url', 'VARCHAR(255)'),
    # ---- Iter11: Auth/Logo/Branding flexibility ----
    ('company_settings', 'auth_google_enabled', 'BOOLEAN DEFAULT FALSE'),
    ('company_settings', 'auth_google_client_id', 'VARCHAR(255)'),
    ('company_settings', 'auth_google_client_secret', 'VARCHAR(255)'),
    ('company_settings', 'header_logo_height', 'INTEGER DEFAULT 32'),
    ('company_settings', 'footer_logo_height', 'INTEGER DEFAULT 40'),
    ('company_settings', 'logo_display_mode', "VARCHAR(16) DEFAULT 'auto'"),  # auto | fit-height | fit-width
    # ---- Phase B: multi-tenancy scaffold ----
    # Every business-row table gets a tenant_id column. Backfilled to the
    # 'default' tenant by _seed_default_tenant() on first boot. Column is
    # nullable for now so single-tenant deployments keep working; Phase B
    # cut-over flips MULTITENANT_ENFORCE=true and adds NOT NULL + RLS.
    ('users', 'tenant_id', 'VARCHAR(64)'),
    ('products', 'tenant_id', 'VARCHAR(64)'),
    ('categories', 'tenant_id', 'VARCHAR(64)'),
    ('orders', 'tenant_id', 'VARCHAR(64)'),
    ('customers', 'tenant_id', 'VARCHAR(64)'),
    ('coupons', 'tenant_id', 'VARCHAR(64)'),
    ('discounts', 'tenant_id', 'VARCHAR(64)'),
    ('stores', 'tenant_id', 'VARCHAR(64)'),
    ('expenses', 'tenant_id', 'VARCHAR(64)'),
    ('income', 'tenant_id', 'VARCHAR(64)'),
    ('cash_accounts', 'tenant_id', 'VARCHAR(64)'),
    ('suppliers', 'tenant_id', 'VARCHAR(64)'),
    ('payment_methods', 'tenant_id', 'VARCHAR(64)'),
    ('shipping_rules', 'tenant_id', 'VARCHAR(64)'),
    ('custom_pages', 'tenant_id', 'VARCHAR(64)'),
    ('page_sections', 'tenant_id', 'VARCHAR(64)'),
    ('integration_settings', 'tenant_id', 'VARCHAR(64)'),
    ('marketing_campaigns', 'tenant_id', 'VARCHAR(64)'),
    ('payroll', 'tenant_id', 'VARCHAR(64)'),
    # ---- Iter12: PayHere + templates ----
    ('notification_templates', 'body_html', 'TEXT'),
    # ---- Iter13: Barcode + header/footer + receipt + cart recovery ----
    ('variants', 'barcode', 'VARCHAR(64)'),
    ('company_settings', 'header_layout', "VARCHAR(32) DEFAULT 'classic'"),
    ('company_settings', 'header_bg_color', 'VARCHAR(16)'),
    ('company_settings', 'header_text_color', 'VARCHAR(16)'),
    ('company_settings', 'header_hover_color', 'VARCHAR(16)'),
    ('company_settings', 'footer_layout', "VARCHAR(32) DEFAULT 'columns'"),
    ('company_settings', 'footer_bg_color', 'VARCHAR(16)'),
    ('company_settings', 'footer_text_color', 'VARCHAR(16)'),
    ('company_settings', 'footer_hover_color', 'VARCHAR(16)'),
    ('company_settings', 'receipt_size', "VARCHAR(16) DEFAULT '80mm'"),
    ('company_settings', 'receipt_header_text', 'TEXT'),
    ('company_settings', 'receipt_footer_text', 'TEXT'),
    ('company_settings', 'receipt_show_logo', 'BOOLEAN DEFAULT TRUE'),
    ('company_settings', 'receipt_show_qr', 'BOOLEAN DEFAULT TRUE'),
    ('company_settings', 'receipt_show_barcode', 'BOOLEAN DEFAULT FALSE'),
    ('company_settings', 'receipt_show_tax', 'BOOLEAN DEFAULT FALSE'),
    ('company_settings', 'cart_recovery_enabled', 'BOOLEAN DEFAULT FALSE'),
    ('company_settings', 'cart_recovery_after_min', 'INTEGER DEFAULT 60'),
    ('company_settings', 'cart_recovery_channels', "VARCHAR(32) DEFAULT 'email,sms'"),
    # Per-channel marketing opt-in for customers (used by bulk-send + cart recovery)
    ('customers', 'marketing_opt_in', 'BOOLEAN DEFAULT TRUE'),
    ('customers', 'email_opt_in', 'BOOLEAN DEFAULT TRUE'),
    ('customers', 'sms_opt_in', 'BOOLEAN DEFAULT TRUE'),
]


async def _migrate_columns(conn):
    """Run each ALTER TABLE inside its own savepoint so a single failure
    (missing table during initial create_all) doesn't poison the whole
    transaction and abort startup."""
    from sqlalchemy import text
    for table, col, ddl in COLUMN_MIGRATIONS:
        try:
            async with conn.begin_nested():  # SAVEPOINT
                await conn.execute(text(
                    f'ALTER TABLE public."{table}" ADD COLUMN IF NOT EXISTS "{col}" {ddl}'
                ))
        except Exception as e:
            logger.warning(f"Migration skipped {table}.{col}: {e}")


DEFAULT_THEME = {
    "primary_color": "#FF3B30",
    "primary_color_hover": "#D92D23",
    "background_color": "#09090B",
    "text_color": "#FFFFFF",
    "text_muted_color": "#A1A1AA",
    "font_eyebrow": "'Space Grotesk', sans-serif",
    "font_heading": "'Archivo Black', sans-serif",
    "font_body": "'Inter', sans-serif",
    "heading_scale": 1.0,
    "line_height": 1.5,
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
    {"code": "koko", "label": "KOKO — Pay in 3 (Online)", "scope": "online", "active": False, "sort_order": 20,
     "description": "Buy now, pay in 3 interest-free instalments via KOKO.",
     "config": {"merchant_id": "", "api_key": "", "secret": "", "sandbox": True,
                 "_setup_help": "Add your KOKO merchant credentials. Until live SDK is wired, orders mark as paid."}},
    {"code": "mintpay", "label": "Mintpay — Buy Now Pay Later", "scope": "online", "active": False, "sort_order": 30,
     "description": "Split your order into instalments with Mintpay.",
     "config": {"merchant_id": "", "api_key": "", "secret": "", "sandbox": True,
                 "_setup_help": "Add your Mintpay merchant credentials. Until live SDK is wired, orders mark as paid."}},
    {"code": "cash", "label": "Cash", "scope": "pos", "active": True, "sort_order": 0},
    {"code": "card_pos", "label": "Card (POS Terminal)", "scope": "pos", "active": True, "sort_order": 10},
    {"code": "koko_pos", "label": "KOKO — Pay in 3 (POS)", "scope": "pos", "active": False, "sort_order": 20,
     "description": "Customer pays via KOKO QR on the POS counter.",
     "config": {"merchant_id": "", "api_key": "", "secret": "", "sandbox": True}},
    {"code": "mintpay_pos", "label": "Mintpay (POS)", "scope": "pos", "active": False, "sort_order": 30,
     "config": {"merchant_id": "", "api_key": "", "secret": "", "sandbox": True}},
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
        await _migrate_columns(conn)
        await _ensure_rls(conn)
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        # ---- Phase B scaffold: ensure a 'default' tenant exists ----
        # All single-tenant rows are implicitly attached to this tenant. When
        # MULTITENANT_ENFORCE flips on, queries will require X-Tenant-Slug.
        default_tenant = (await db.execute(select(M.Tenant).where(M.Tenant.slug == "default"))).scalar_one_or_none()
        if not default_tenant:
            default_tenant = M.Tenant(slug="default", name="Default Tenant", plan="enterprise", status="active")
            db.add(default_tenant); await db.commit(); await db.refresh(default_tenant)
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




# ---------- Mount route modules ----------
from routes import (
    setup as _setup,
    auth_routes as _auth,
    company as _company,
    integrations as _integrations,
    categories as _categories,
    products as _products,
    inventory as _inventory,
    stores as _stores,
    shipping_payments as _shipping_payments,
    orders as _orders,
    customers as _customers,
    coupons as _coupons,
    expenses as _expenses,
    payroll as _payroll,
    staff as _staff,
    reports as _reports,
    marketing as _marketing,
    pages as _pages,
    health as _health,
    suppliers as _suppliers,
    income as _income,
    cash_accounts as _cash_accounts,
    receipt as _receipt,
    csv_import as _csv_import,
    discounts as _discounts,
    customer_export as _customer_export,
    super_admin as _super_admin,
    payhere as _payhere,
    seo as _seo,
    templates_library as _templates_library,
    cart_recovery as _cart_recovery,
    barcode as _barcode,
)

for _mod in (
    _setup, _auth, _company, _integrations, _categories, _products, _inventory,
    _stores, _shipping_payments, _orders, _customers, _coupons, _expenses,
    _payroll, _staff, _reports, _marketing, _pages, _health, _suppliers,
    _income, _cash_accounts, _receipt, _csv_import, _discounts, _customer_export,
    _super_admin, _payhere, _seo, _templates_library, _cart_recovery, _barcode,
):
    api.include_router(_mod.router)

app.include_router(api)
# Also mount SEO routes at the bare root so deployments behind Nginx can
# serve them at https://shop.example/sitemap.xml without a rewrite rule.
# (In the preview/Kubernetes environment only /api/* reaches the backend,
# so use /api/sitemap.xml + /api/robots.txt; in production add an Nginx
# `location = /sitemap.xml { proxy_pass ... /api/sitemap.xml; }` block.)
app.include_router(_seo.router)


@app.on_event("startup")
async def _start_cart_recovery_worker():
    """Spawn the cart-abandonment background loop after FastAPI is up."""
    try:
        _cart_recovery.start_worker(app)
    except Exception as e:
        logger.warning("could not start cart recovery worker: %s", e)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
