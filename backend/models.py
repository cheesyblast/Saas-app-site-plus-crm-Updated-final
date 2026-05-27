import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, Index, JSON
)
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


# ---- Users & Sessions ----
class Tenant(Base):
    """Multi-tenant root. Phase B (multi-tenancy) — every business-row table will
    eventually carry a `tenant_id` FK to this table. RLS policies + per-request
    `X-Tenant-Slug` header (set by the reverse-proxy) gate cross-tenant access.

    Phase B status: scaffold only. The model + idempotent migration exist so the
    column is present in DB; the per-query injection lives behind a feature flag
    (`MULTITENANT_ENFORCE` env var) until we cut over.
    """
    __tablename__ = "tenants"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    slug = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    custom_domain = Column(String(255), nullable=True, unique=True)  # optional vanity domain
    plan = Column(String(32), default="trial", nullable=False)        # trial | starter | pro | enterprise
    status = Column(String(16), default="active", nullable=False)     # active | suspended | deleted
    owner_user_id = Column(String(64), nullable=True)                 # who can admin this tenant (tenant_admin)
    settings = Column(JSON, nullable=True)                            # arbitrary per-tenant config bag
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class User(Base):
    __tablename__ = "users"
    user_id = Column(String(64), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    picture = Column(Text, nullable=True)
    phone = Column(String(32), nullable=True)
    password_hash = Column(String(255), nullable=True)  # bcrypt; null for OAuth-only customers
    auth_provider = Column(String(16), default="password", nullable=False)  # password, google
    role = Column(String(32), nullable=False, default="customer", index=True)
    permissions = Column(JSON, nullable=True)  # {products:bool, orders:bool, pos:bool, inventory:bool, reports:bool, accounting:bool, settings:bool, suppliers:bool}
    base_salary = Column(Float, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"
    session_token = Column(String(255), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.user_id", ondelete="CASCADE"), index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    identifier = Column(String(255), nullable=False, index=True)  # ip:email
    attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    token = Column(String(128), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Company / Settings ----
class CompanySettings(Base):
    __tablename__ = "company_settings"
    id = Column(String(16), primary_key=True, default="default")
    company_name = Column(String(255), nullable=False, default="My Brand")
    tagline = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(32), nullable=True)
    address = Column(Text, nullable=True)
    currency = Column(String(8), default="LKR", nullable=False)
    logo_light_id = Column(String(64), nullable=True)  # for dark backgrounds
    logo_dark_id = Column(String(64), nullable=True)   # for light backgrounds
    favicon_id = Column(String(64), nullable=True)
    # SEO / marketing
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(Text, nullable=True)
    meta_keywords = Column(Text, nullable=True)
    og_image_id = Column(String(64), nullable=True)
    google_analytics_id = Column(String(64), nullable=True)  # G-XXXXXXXXXX
    google_site_verification = Column(String(128), nullable=True)
    facebook_pixel_id = Column(String(64), nullable=True)
    instagram_url = Column(String(255), nullable=True)
    facebook_url = Column(String(255), nullable=True)
    tiktok_url = Column(String(255), nullable=True)
    twitter_url = Column(String(255), nullable=True)
    youtube_url = Column(String(255), nullable=True)
    # ---- Auth integrations (client-self-config) ----
    auth_google_enabled = Column(Boolean, default=False, nullable=False)
    auth_google_client_id = Column(String(255), nullable=True)
    auth_google_client_secret = Column(String(255), nullable=True)
    # ---- Branding / Logo flexibility ----
    header_logo_height = Column(Integer, default=32, nullable=False)
    footer_logo_height = Column(Integer, default=40, nullable=False)
    logo_display_mode = Column(String(16), default="auto", nullable=False)  # auto | fit-height | fit-width
    # ---- Header / Footer customisation (set by Page Builder) ----
    header_layout = Column(String(32), default="classic", nullable=False)  # classic | centered | split
    header_bg_color = Column(String(16), nullable=True)
    header_text_color = Column(String(16), nullable=True)
    header_hover_color = Column(String(16), nullable=True)
    footer_layout = Column(String(32), default="columns", nullable=False)   # columns | minimal | brand
    footer_bg_color = Column(String(16), nullable=True)
    footer_text_color = Column(String(16), nullable=True)
    footer_hover_color = Column(String(16), nullable=True)
    # ---- Customisable receipt template ----
    receipt_size = Column(String(16), default="80mm", nullable=False)  # 80mm | 58mm | a4
    receipt_header_text = Column(Text, nullable=True)
    receipt_footer_text = Column(Text, nullable=True)
    receipt_show_logo = Column(Boolean, default=True, nullable=False)
    receipt_show_qr = Column(Boolean, default=True, nullable=False)
    receipt_show_barcode = Column(Boolean, default=False, nullable=False)
    receipt_show_tax = Column(Boolean, default=False, nullable=False)
    # ---- Cart abandonment recovery ----
    cart_recovery_enabled = Column(Boolean, default=False, nullable=False)
    cart_recovery_after_min = Column(Integer, default=60, nullable=False)
    cart_recovery_channels = Column(String(32), default="email,sms", nullable=False)
    setup_complete = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Discount(Base):
    """Storefront-visible promotion. Optionally renders a top marquee + product badges."""
    __tablename__ = "discounts"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(String(16), default="percent", nullable=False)  # percent | fixed
    value = Column(Float, default=0.0, nullable=False)
    scope = Column(String(16), default="sitewide", nullable=False)  # sitewide | products | categories
    scope_product_ids = Column(JSON, nullable=True)
    scope_category_ids = Column(JSON, nullable=True)
    show_badge_on_products = Column(Boolean, default=True, nullable=False)
    badge_label = Column(String(32), nullable=True)
    badge_color = Column(String(16), default="#FF3B30", nullable=False)
    show_marquee = Column(Boolean, default=True, nullable=False)
    marquee_size = Column(String(8), default="sm", nullable=False)   # xs | sm | md
    marquee_speed = Column(String(8), default="normal", nullable=False)
    marquee_bg = Column(String(16), default="#FF3B30", nullable=False)
    marquee_fg = Column(String(16), default="#FFFFFF", nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class IntegrationSetting(Base):
    """SMTP / SendGrid / Brevo / Twilio / Notify.lk creds + active flag."""
    __tablename__ = "integration_settings"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    kind = Column(String(16), nullable=False)  # email, sms
    provider = Column(String(32), nullable=False)  # smtp, sendgrid, brevo, twilio, notifylk
    label = Column(String(128), nullable=True)
    config = Column(JSON, nullable=False, default=dict)  # provider-specific
    active = Column(Boolean, default=False, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)  # one per kind = default sender
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Catalog ----
class Category(Base):
    __tablename__ = "categories"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(128), nullable=False)
    slug = Column(String(128), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    parent_id = Column(String(64), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Product(Base):
    __tablename__ = "products"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    category_id = Column(String(64), ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True)
    supplier_id = Column(String(64), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    base_price = Column(Float, nullable=False, default=0.0)
    compare_price = Column(Float, nullable=True)
    cost_price = Column(Float, nullable=True)
    sku = Column(String(64), nullable=True)
    status = Column(String(16), default="active", nullable=False, index=True)
    featured = Column(Boolean, default=False, nullable=False, index=True)
    shipping_note = Column(Text, nullable=True)
    returns_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ProductImage(Base):
    __tablename__ = "product_images"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    product_id = Column(String(64), ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False)
    color = Column(String(64), nullable=True, index=True)  # null = applies to all colors
    data_base64 = Column(Text, nullable=False)
    mime_type = Column(String(32), default="image/png", nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Variant(Base):
    __tablename__ = "variants"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    product_id = Column(String(64), ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False)
    size = Column(String(16), nullable=True)
    color = Column(String(32), nullable=True)
    color_hex = Column(String(16), nullable=True)
    price_override = Column(Float, nullable=True)
    sku = Column(String(64), nullable=True)
    # Scannable barcode (EAN-13, UPC, CODE128 — we don't constrain the format).
    # Indexed because the POS scanner queries by exact match.
    barcode = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Store(Base):
    __tablename__ = "stores"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(128), nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(String(32), nullable=True)
    is_online = Column(Boolean, default=False, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Inventory(Base):
    __tablename__ = "inventory"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    variant_id = Column(String(64), ForeignKey("variants.id", ondelete="CASCADE"), index=True, nullable=False)
    store_id = Column(String(64), ForeignKey("stores.id", ondelete="CASCADE"), index=True, nullable=False)
    quantity = Column(Integer, default=0, nullable=False)
    low_stock_threshold = Column(Integer, default=5, nullable=False)
    __table_args__ = (Index("uq_inv_variant_store", "variant_id", "store_id", unique=True),)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    variant_id = Column(String(64), ForeignKey("variants.id", ondelete="CASCADE"), index=True, nullable=False)
    store_id = Column(String(64), ForeignKey("stores.id", ondelete="CASCADE"), index=True, nullable=False)
    type = Column(String(16), nullable=False)  # in, out, adjust, sale, transfer_in, transfer_out
    quantity = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=True)
    reference = Column(String(255), nullable=True)
    user_id = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# ---- Customers & Orders ----
class Customer(Base):
    __tablename__ = "customers"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    user_id = Column(String(64), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(32), nullable=True, index=True)
    address = Column(Text, nullable=True)
    district = Column(String(64), nullable=True)
    city = Column(String(128), nullable=True)
    notes = Column(Text, nullable=True)
    total_orders = Column(Integer, default=0, nullable=False)
    total_spent = Column(Float, default=0.0, nullable=False)
    # Per-channel opt-in flags for marketing blasts + abandonment recovery.
    # Default ON for new sign-ups; admin can flip them off from the customer
    # detail page or the storefront preferences page (when wired).
    marketing_opt_in = Column(Boolean, default=True, nullable=False)
    email_opt_in = Column(Boolean, default=True, nullable=False)
    sms_opt_in = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Order(Base):
    __tablename__ = "orders"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    order_number = Column(String(32), unique=True, nullable=False, index=True)
    customer_id = Column(String(64), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255), nullable=True)
    customer_phone = Column(String(32), nullable=True)
    shipping_address = Column(Text, nullable=True)
    shipping_district = Column(String(64), nullable=True)
    shipping_city = Column(String(128), nullable=True)
    status = Column(String(32), default="pending", nullable=False, index=True)
    payment_method = Column(String(32), default="cod", nullable=False)
    payment_status = Column(String(32), default="pending", nullable=False)
    subtotal = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    coupon_code = Column(String(64), nullable=True)
    shipping = Column(Float, nullable=False, default=0.0)
    tax = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)
    cash_tendered = Column(Float, nullable=True)
    cash_change = Column(Float, nullable=True)
    card_last4 = Column(String(8), nullable=True)
    store_id = Column(String(64), ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    cash_account_id = Column(String(64), nullable=True)
    created_by = Column(String(64), nullable=True)
    source = Column(String(16), default="online", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    order_id = Column(String(64), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    variant_id = Column(String(64), nullable=True)
    product_id = Column(String(64), nullable=True)
    product_name = Column(String(255), nullable=False)
    variant_label = Column(String(128), nullable=True)
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    subtotal = Column(Float, nullable=False)


# ---- Coupons ----
class Coupon(Base):
    __tablename__ = "coupons"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    code = Column(String(64), unique=True, nullable=False, index=True)
    type = Column(String(16), default="percent", nullable=False)
    value = Column(Float, nullable=False)
    min_order = Column(Float, default=0.0, nullable=False)
    usage_limit = Column(Integer, default=0, nullable=False)
    used_count = Column(Integer, default=0, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    scope = Column(String(16), default="all", nullable=False)  # all, products, categories
    scope_product_ids = Column(JSON, nullable=True)  # list of product ids
    scope_category_ids = Column(JSON, nullable=True)  # list of category ids
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Suppliers (B2B / Vendors) ----
class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    contact_person = Column(String(128), nullable=True)
    phone = Column(String(32), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    balance_owed = Column(Float, default=0.0, nullable=False)  # outstanding payable
    total_purchases = Column(Float, default=0.0, nullable=False)
    total_paid = Column(Float, default=0.0, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class SupplierInvoice(Base):
    """Stock-in events that produce a payable."""
    __tablename__ = "supplier_invoices"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    supplier_id = Column(String(64), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    reference = Column(String(64), nullable=True)
    amount = Column(Float, nullable=False)
    paid = Column(Float, default=0.0, nullable=False)
    notes = Column(Text, nullable=True)
    invoice_date = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    created_by = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class SupplierPayment(Base):
    __tablename__ = "supplier_payments"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    supplier_id = Column(String(64), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id = Column(String(64), ForeignKey("supplier_invoices.id", ondelete="SET NULL"), nullable=True)
    amount = Column(Float, nullable=False)
    method = Column(String(16), default="cash", nullable=False)  # cash, bank
    cash_account_id = Column(String(64), nullable=True)
    notes = Column(Text, nullable=True)
    paid_date = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    created_by = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Accounting: Income, expanded Expenses, CashAccounts ----
class Income(Base):
    __tablename__ = "income"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    category = Column(String(64), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    store_id = Column(String(64), ForeignKey("stores.id", ondelete="SET NULL"), nullable=True, index=True)
    method = Column(String(16), default="cash", nullable=False)  # cash, bank
    cash_account_id = Column(String(64), nullable=True)
    income_date = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    created_by = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class CashAccount(Base):
    """Per-store cash drawer or bank account."""
    __tablename__ = "cash_accounts"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(128), nullable=False)
    kind = Column(String(16), default="cash", nullable=False)  # cash, bank
    store_id = Column(String(64), ForeignKey("stores.id", ondelete="SET NULL"), nullable=True, index=True)
    balance = Column(Float, default=0.0, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class CashLedger(Base):
    """Every cash/bank movement: order_paid, expense_paid, income_received, supplier_paid, transfer."""
    __tablename__ = "cash_ledger"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    cash_account_id = Column(String(64), ForeignKey("cash_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    direction = Column(String(8), nullable=False)  # in, out
    amount = Column(Float, nullable=False)
    source_kind = Column(String(32), nullable=False)  # order, expense, income, supplier, manual
    source_id = Column(String(64), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# ---- Expenses & Payroll ----
class Expense(Base):
    __tablename__ = "expenses"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    category = Column(String(64), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    store_id = Column(String(64), ForeignKey("stores.id", ondelete="SET NULL"), nullable=True, index=True)
    method = Column(String(16), default="cash", nullable=False)  # cash, bank
    cash_account_id = Column(String(64), nullable=True)
    expense_date = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    created_by = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Payroll(Base):
    __tablename__ = "payroll"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    staff_user_id = Column(String(64), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    base_salary = Column(Float, nullable=False, default=0.0)
    bonus = Column(Float, nullable=False, default=0.0)
    deduction = Column(Float, nullable=False, default=0.0)
    net = Column(Float, nullable=False, default=0.0)
    status = Column(String(16), default="pending", nullable=False)
    paid_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Marketing ----
class MarketingCampaign(Base):
    __tablename__ = "marketing_campaigns"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(128), nullable=False)
    channel = Column(String(32), nullable=False)
    status = Column(String(16), default="draft", nullable=False)
    spend = Column(Float, default=0.0, nullable=False)
    revenue = Column(Float, default=0.0, nullable=False)
    reach = Column(Integer, default=0, nullable=False)
    clicks = Column(Integer, default=0, nullable=False)
    conversions = Column(Integer, default=0, nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    channel = Column(String(16), nullable=False)
    to_address = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=True)
    body = Column(Text, nullable=False)
    related_order = Column(String(64), nullable=True)
    status = Column(String(16), default="sent", nullable=False)  # sent, failed, mocked
    provider = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# ---- Page Builder / Pages ----
class Media(Base):
    __tablename__ = "media"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    filename = Column(String(255), nullable=True)
    data_base64 = Column(Text, nullable=False)
    mime_type = Column(String(64), default="image/png", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class CustomPage(Base):
    """Metadata for a builder-driven page. Sections live in PageSection keyed by `page` slug."""
    __tablename__ = "custom_pages"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    slug = Column(String(64), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)  # home/header/footer/product/policies
    show_in_header_menu = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    visible = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class PageSection(Base):
    __tablename__ = "page_sections"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    page = Column(String(64), default="home", nullable=False, index=True)
    section_type = Column(String(32), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    visible = Column(Boolean, default=True, nullable=False)
    config = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ThemeSetting(Base):
    __tablename__ = "theme_settings"
    id = Column(String(32), primary_key=True, default="default")
    config = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class NotificationTemplate(Base):
    """Reusable email/sms templates the merchant edits in Marketing → Templates.

    `event_key` is the trigger ("order_placed", "order_paid", "order_shipped",
    "order_delivered", "order_cancelled", "order_refunded", "marketing_blast").
    `channel` is "email" or "sms". Subject is only meaningful for email.

    Variables in subject/body use {{order_number}}, {{customer_name}},
    {{total}}, {{tracking_url}}, {{brand_name}} — rendered by simple .replace
    at dispatch time so we don't pull in jinja2 just for this.
    """
    __tablename__ = "notification_templates"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    event_key = Column(String(64), nullable=False, index=True)
    channel = Column(String(16), nullable=False)  # email | sms
    name = Column(String(128), nullable=False)
    subject = Column(String(255), nullable=True)
    body = Column(Text, nullable=False)
    # Optional rich HTML body for branded emails. When set + channel=='email',
    # dispatcher sends a multipart message with this as the html part.
    body_html = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class CartSession(Base):
    """Server-side mirror of an open cart, used for abandonment recovery.

    The storefront upserts a row whenever a customer with contactable info
    (email or phone) updates their cart. Once they place an order we mark
    `converted_at`; if they go silent for `abandon_after_min` minutes, the
    `cart_recovery` worker dispatches the `abandoned_cart` template and
    flips `reminded_at` so we never spam twice.
    """
    __tablename__ = "cart_sessions"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    customer_id = Column(String(64), nullable=True, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_email = Column(String(255), nullable=True, index=True)
    customer_phone = Column(String(32), nullable=True)
    items_json = Column(JSON, nullable=False, default=list)
    items_count = Column(Integer, default=0, nullable=False)
    estimated_total = Column(Float, default=0.0, nullable=False)
    last_seen_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    reminded_at = Column(DateTime(timezone=True), nullable=True)
    reminded_channel = Column(String(16), nullable=True)
    converted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Shipping & Payments (Sri Lanka) ----
class ShippingRule(Base):
    __tablename__ = "shipping_rules"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    district = Column(String(64), nullable=True, index=True)  # null = default fallback
    city = Column(String(128), nullable=True, index=True)     # null = applies to all cities in district
    fee = Column(Float, nullable=False, default=0.0)
    free_above = Column(Float, nullable=True)  # subtotal threshold for free shipping
    label = Column(String(128), nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class PaymentMethod(Base):
    __tablename__ = "payment_methods"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    code = Column(String(32), nullable=False)  # cod, payhere, cash, card_pos, bank_transfer
    label = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    scope = Column(String(16), default="online", nullable=False, index=True)  # online, pos
    active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    config = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
