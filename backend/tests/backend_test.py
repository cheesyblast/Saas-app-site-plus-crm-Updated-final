"""
Backend API tests for Threadline SaaS ERP.
Covers: public storefront (categories/products/checkout/orders/coupons),
auth (session via Bearer token), admin CRUD (categories, products, stock,
inventory, orders, reports, dashboard, coupons), POS checkout, coupon apply.
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clothing-erp-preview.preview.emergentagent.com").rstrip("/")
ADMIN_TOKEN = "test_session_abc"  # pre-seeded via DB insert (see conftest)

HEADERS_ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"}
HEADERS_JSON = {"Content-Type": "application/json"}


# ----------------------- Public: catalog -----------------------

def test_health():
    r = requests.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_list_categories_has_three():
    r = requests.get(f"{BASE_URL}/api/categories")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    names = {c["name"].lower() for c in data}
    assert {"tees", "longsleeves", "hoodies"}.issubset(names), f"Got: {names}"
    for c in data:
        assert "id" in c and "slug" in c


def test_list_products_six_with_images():
    r = requests.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    products = r.json()
    assert len(products) == 6, f"Expected 6 products, got {len(products)}"
    # Each product in list view should have at least one image entry
    for p in products:
        assert "slug" in p and "base_price" in p
        assert isinstance(p.get("images"), list)
        assert len(p["images"]) >= 1, f"Product {p['slug']} has no image"


def test_get_product_detail_includes_variants_and_inventory():
    # grab first product slug dynamically (task ref "merch-hub-54" is the hostname not a slug)
    products = requests.get(f"{BASE_URL}/api/products").json()
    slug = products[0]["slug"]
    r = requests.get(f"{BASE_URL}/api/products/{slug}")
    assert r.status_code == 200
    p = r.json()
    assert p["slug"] == slug
    assert isinstance(p.get("variants"), list) and len(p["variants"]) > 0
    for v in p["variants"]:
        assert "id" in v and "stock" in v
    assert isinstance(p.get("images"), list) and len(p["images"]) >= 1
    assert p.get("category") is not None


def test_get_product_404():
    r = requests.get(f"{BASE_URL}/api/products/nonexistent-slug-xyz")
    assert r.status_code == 404


def test_coupon_validate_404_for_missing():
    r = requests.get(f"{BASE_URL}/api/coupons/validate/NOPE_{uuid.uuid4().hex[:6].upper()}")
    assert r.status_code == 404


# ----------------------- Auth -----------------------

def test_admin_dashboard_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/dashboard")
    assert r.status_code == 401


def test_auth_me_with_bearer():
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == "test.admin@example.com"
    assert data["role"] == "super_admin"


def test_auth_me_invalid_token():
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer bogus_xxx"})
    assert r.status_code == 401


# ----------------------- Public checkout & order -----------------------

@pytest.fixture(scope="module")
def sample_variant():
    """Pick a product variant that has inventory stock for checkout tests."""
    products = requests.get(f"{BASE_URL}/api/products").json()
    for p in products:
        detail = requests.get(f"{BASE_URL}/api/products/{p['slug']}").json()
        for v in detail["variants"]:
            if v["stock"] >= 5:
                return {"product": detail, "variant": v}
    pytest.skip("No variant with stock >= 5 found")


def test_guest_checkout_and_get_order(sample_variant):
    v = sample_variant["variant"]
    payload = {
        "customer_name": "TEST_Guest",
        "customer_email": "TEST_guest@example.com",
        "customer_phone": "+15550001",
        "shipping_address": "TEST 1 Test St",
        "items": [{"variant_id": v["id"], "quantity": 1}],
        "payment_method": "mock",
        "source": "online",
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["customer_name"] == "TEST_Guest"
    assert order["status"] == "paid"
    assert order["payment_status"] == "paid"
    assert len(order["items"]) == 1
    # pytest-friendly: stash order_number for next test via request.config
    pytest.guest_order_number = order["order_number"]
    pytest.guest_variant_id = v["id"]
    pytest.guest_initial_stock = v["stock"]


def test_get_order_by_number():
    order_number = getattr(pytest, "guest_order_number", None)
    assert order_number, "previous test did not set order number"
    r = requests.get(f"{BASE_URL}/api/orders/{order_number}")
    assert r.status_code == 200
    assert r.json()["order_number"] == order_number


def test_stock_deducted_after_checkout(sample_variant):
    """After guest checkout (-1), variant stock should be initial-1 and a 'sale' stock movement logged."""
    slug = sample_variant["product"]["slug"]
    detail = requests.get(f"{BASE_URL}/api/products/{slug}").json()
    new_stock = next(x["stock"] for x in detail["variants"] if x["id"] == sample_variant["variant"]["id"])
    assert new_stock == pytest.guest_initial_stock - 1

    # sale movement visible via admin endpoint
    r = requests.get(f"{BASE_URL}/api/admin/stock-movements", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    moves = r.json()
    assert any(m["type"] == "sale" for m in moves), "No sale stock movement logged"


# ----------------------- Admin CRUD -----------------------

def test_admin_list_products():
    r = requests.get(f"{BASE_URL}/api/admin/products", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    assert len(r.json()) >= 6


def test_admin_dashboard():
    r = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    d = r.json()
    for key in ("total_revenue", "total_orders", "customer_count", "low_stock_count", "sales_chart", "top_products"):
        assert key in d


def test_admin_sales_report():
    r = requests.get(f"{BASE_URL}/api/admin/reports/sales?days=30", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    assert "profit" in r.json()


def test_admin_create_category_and_product_with_variant():
    # Create category
    cat_payload = {"name": f"TEST_CAT_{uuid.uuid4().hex[:6]}", "description": "t", "sort_order": 99}
    r = requests.post(f"{BASE_URL}/api/admin/categories", json=cat_payload, headers=HEADERS_ADMIN)
    assert r.status_code == 200, r.text
    cat = r.json()
    assert cat["name"] == cat_payload["name"]
    pytest.test_cat_id = cat["id"]

    # Create product with a low-stock variant (stock=2, threshold default 5 -> low=true)
    prod_payload = {
        "name": f"TEST_PROD_{uuid.uuid4().hex[:6]}",
        "description": "test product",
        "category_id": cat["id"],
        "base_price": 29.99,
        "status": "active",
        "featured": False,
        "variants": [
            {"size": "M", "color": "Black", "color_hex": "#000", "sku": "T-M-BLK", "stock": 2}
        ],
    }
    r = requests.post(f"{BASE_URL}/api/admin/products", json=prod_payload, headers=HEADERS_ADMIN)
    assert r.status_code == 200, r.text
    prod = r.json()
    assert prod["name"] == prod_payload["name"]
    assert len(prod["variants"]) == 1
    v = prod["variants"][0]
    assert v["stock"] == 2
    pytest.test_prod_id = prod["id"]
    pytest.test_variant_id = v["id"]
    pytest.test_prod_slug = prod["slug"]


def test_admin_stock_movement_in_increments_inventory():
    vid = pytest.test_variant_id
    r = requests.post(
        f"{BASE_URL}/api/admin/stock-movements",
        json={"variant_id": vid, "type": "in", "quantity": 10, "reason": "TEST restock"},
        headers=HEADERS_ADMIN,
    )
    assert r.status_code == 200, r.text
    assert r.json()["new_quantity"] == 12


def test_admin_inventory_shows_low_flag():
    # After +10, stock=12, threshold default 5 -> low=False
    r = requests.get(f"{BASE_URL}/api/admin/inventory", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    matched = [x for x in r.json() if x["variant_id"] == pytest.test_variant_id]
    assert matched, "new variant inventory missing"
    assert matched[0]["quantity"] == 12
    assert matched[0]["low"] is False

    # Now adjust down to 3 -> low=True
    r = requests.post(
        f"{BASE_URL}/api/admin/stock-movements",
        json={"variant_id": pytest.test_variant_id, "type": "adjust", "quantity": 3},
        headers=HEADERS_ADMIN,
    )
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/admin/inventory", headers=HEADERS_ADMIN)
    matched = [x for x in r.json() if x["variant_id"] == pytest.test_variant_id]
    assert matched[0]["quantity"] == 3
    assert matched[0]["low"] is True

    # Dashboard low_stock_count should include this
    d = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=HEADERS_ADMIN).json()
    assert d["low_stock_count"] >= 1


def test_admin_list_orders_and_update_status():
    r = requests.get(f"{BASE_URL}/api/admin/orders", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    orders = r.json()
    assert len(orders) >= 1
    oid = orders[0]["id"]
    r = requests.put(
        f"{BASE_URL}/api/admin/orders/{oid}/status",
        json={"status": "shipped"},
        headers=HEADERS_ADMIN,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "shipped"


# ----------------------- Coupons -----------------------

def test_admin_create_coupon_and_validate_public():
    code = f"TEST{uuid.uuid4().hex[:4].upper()}"
    r = requests.post(
        f"{BASE_URL}/api/admin/coupons",
        json={"code": code, "type": "percent", "value": 10, "min_order": 0, "active": True},
        headers=HEADERS_ADMIN,
    )
    assert r.status_code == 200, r.text
    pytest.test_coupon_code = code

    # Public validate endpoint
    r = requests.get(f"{BASE_URL}/api/coupons/validate/{code.lower()}")  # validate lowercases->uppercases server side
    assert r.status_code == 200
    data = r.json()
    assert data["code"] == code
    assert data["value"] == 10


def test_checkout_with_coupon_applies_discount(sample_variant):
    v_id = sample_variant["variant"]["id"]
    base_price = sample_variant["variant"].get("price_override") or sample_variant["product"]["base_price"]
    qty = 1
    payload = {
        "customer_name": "TEST_Coupon",
        "customer_email": "TEST_coupon@example.com",
        "items": [{"variant_id": v_id, "quantity": qty}],
        "coupon_code": pytest.test_coupon_code,
        "payment_method": "mock",
        "source": "online",
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    expected_subtotal = round(base_price * qty, 2)
    expected_discount = round(expected_subtotal * 0.10, 2)
    assert o["coupon_code"] == pytest.test_coupon_code
    assert abs(o["discount"] - expected_discount) < 0.02, f"expected ~{expected_discount}, got {o['discount']}"


# ----------------------- POS -----------------------

def test_pos_cash_checkout_creates_paid_order(sample_variant):
    v_id = sample_variant["variant"]["id"]
    payload = {
        "customer_name": "TEST_Walkin",
        "items": [{"variant_id": v_id, "quantity": 1}],
        "payment_method": "cash",
        "source": "pos",
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "paid"
    assert o["payment_method"] == "cash"
    assert o["source"] == "pos"
    assert o["shipping"] == 0.0  # POS: no shipping fee


# ----------------------- Cleanup -----------------------

def test_cleanup_created_entities():
    # Delete created product
    pid = getattr(pytest, "test_prod_id", None)
    if pid:
        r = requests.delete(f"{BASE_URL}/api/admin/products/{pid}", headers=HEADERS_ADMIN)
        assert r.status_code == 200
    cid = getattr(pytest, "test_cat_id", None)
    if cid:
        r = requests.delete(f"{BASE_URL}/api/admin/categories/{cid}", headers=HEADERS_ADMIN)
        assert r.status_code == 200
    # Delete created coupon
    code = getattr(pytest, "test_coupon_code", None)
    if code:
        coupons = requests.get(f"{BASE_URL}/api/admin/coupons", headers=HEADERS_ADMIN).json()
        match = next((c for c in coupons if c["code"] == code), None)
        if match:
            r = requests.delete(f"{BASE_URL}/api/admin/coupons/{match['id']}", headers=HEADERS_ADMIN)
            assert r.status_code == 200
