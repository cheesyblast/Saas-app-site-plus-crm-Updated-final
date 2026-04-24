import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, Index
)
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


# ---- Users & Sessions ----
class User(Base):
    __tablename__ = "users"
    user_id = Column(String(64), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    picture = Column(Text, nullable=True)
    phone = Column(String(32), nullable=True)
    # Role: customer, super_admin, manager, sales_staff, inventory_staff, accountant
    role = Column(String(32), nullable=False, default="customer", index=True)
    base_salary = Column(Float, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"
    session_token = Column(String(255), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.user_id", ondelete="CASCADE"), index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Catalog ----
class Category(Base):
    __tablename__ = "categories"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(128), nullable=False)
    slug = Column(String(128), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Product(Base):
    __tablename__ = "products"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    category_id = Column(String(64), ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True)
    base_price = Column(Float, nullable=False, default=0.0)
    compare_price = Column(Float, nullable=True)
    sku = Column(String(64), nullable=True)
    status = Column(String(16), default="active", nullable=False, index=True)  # active, draft, archived
    featured = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ProductImage(Base):
    __tablename__ = "product_images"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    product_id = Column(String(64), ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False)
    data_base64 = Column(Text, nullable=False)  # base64 string
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
    type = Column(String(16), nullable=False)  # in, out, adjust, sale
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
    phone = Column(String(32), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    total_orders = Column(Integer, default=0, nullable=False)
    total_spent = Column(Float, default=0.0, nullable=False)
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
    status = Column(String(32), default="pending", nullable=False, index=True)  # pending, paid, processing, shipped, delivered, cancelled
    payment_method = Column(String(32), default="mock", nullable=False)
    payment_status = Column(String(32), default="pending", nullable=False)
    subtotal = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    coupon_code = Column(String(64), nullable=True)
    shipping = Column(Float, nullable=False, default=0.0)
    tax = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)
    store_id = Column(String(64), ForeignKey("stores.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(String(64), nullable=True)  # staff user_id for POS
    source = Column(String(16), default="online", nullable=False)  # online or pos
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
    type = Column(String(16), default="percent", nullable=False)  # percent, fixed
    value = Column(Float, nullable=False)
    min_order = Column(Float, default=0.0, nullable=False)
    usage_limit = Column(Integer, default=0, nullable=False)  # 0 = unlimited
    used_count = Column(Integer, default=0, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Expenses & Payroll ----
class Expense(Base):
    __tablename__ = "expenses"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    category = Column(String(64), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
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
    status = Column(String(16), default="pending", nullable=False)  # pending, paid
    paid_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Marketing ----
class MarketingCampaign(Base):
    __tablename__ = "marketing_campaigns"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(128), nullable=False)
    channel = Column(String(32), nullable=False)  # email, sms, social, ads
    status = Column(String(16), default="draft", nullable=False)  # draft, active, completed
    spend = Column(Float, default=0.0, nullable=False)
    revenue = Column(Float, default=0.0, nullable=False)
    reach = Column(Integer, default=0, nullable=False)
    clicks = Column(Integer, default=0, nullable=False)
    conversions = Column(Integer, default=0, nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---- Notifications (SMS/email log, mocked) ----
class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id = Column(String(64), primary_key=True, default=gen_uuid)
    channel = Column(String(16), nullable=False)  # sms, email
    to_address = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=True)
    body = Column(Text, nullable=False)
    related_order = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
