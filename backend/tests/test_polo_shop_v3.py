"""
Backend tests for Polo Shop v3 (iteration 3): JWT auth, setup wizard, shipping rules,
payment methods, customer dedup, expenses, coupons, page builder, integrations,
authorization checks. Uses httpOnly cookie session via /api/auth/login.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://polo-shop-2.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@demo.com"
ADMIN_PASSWORD = "demo12345"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"]["email"] == ADMIN_EMAIL
    assert body["user"]["role"] == "super_admin"
    assert "token" in body
    return s


@pytest.fixture(scope="module")
def customer_session():
    s = requests.Session()
    email = f"testcust{uuid.uuid4().hex[:8]}@example.com"
    pw = "custpass123"
    r = s.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": pw, "name": "TEST Customer", "phone": "+94770000001"
    })
    assert r.status_code in (200, 201), r.text
    return s, email


# ----- Setup -----

def test_setup_status_complete():
    r = requests.get(f"{BASE_URL}/api/setup/status")
    assert r.status_code == 200
    assert r.json()["setup_complete"] is True


def test_setup_init_idempotent_returns_409():
    r = requests.post(f"{BASE_URL}/api/setup/init", json={
        "company_name": "X",
        "admin_email": "another@x.com",
        "admin_password": "abc12345",
        "admin_name": "X",
    })
    assert r.status_code == 409, r.text


# ----- Auth -----

def test_login_invalid_password_401():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_auth_me_unauthenticated_401():
    r = requests.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 401


def test_admin_endpoints_require_auth():
    r = requests.get(f"{BASE_URL}/api/admin/dashboard")
    assert r.status_code == 401


def test_logout_clears_cookie(admin_session):
    s = requests.Session()
    s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    r = s.post(f"{BASE_URL}/api/auth/logout")
    assert r.status_code == 200
    r2 = s.get(f"{BASE_URL}/api/auth/me")
    assert r2.status_code == 401


def test_customer_register_creates_customer(customer_session):
    s, email = customer_session
    r = s.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == email
    assert me["role"] == "customer"


def test_customer_blocked_from_admin(customer_session):
    s, _ = customer_session
    r = s.get(f"{BASE_URL}/api/admin/dashboard")
    assert r.status_code == 403


# ----- Locations & Shipping -----

def test_locations_25_districts():
    r = requests.get(f"{BASE_URL}/api/locations")
    assert r.status_code == 200
    data = r.json()
    assert len(data["districts"]) == 25
    assert "Colombo" in data["districts"]
    cities = data.get("by_district") or data.get("cities")
    assert cities and "Colombo" in cities and len(cities["Colombo"]) > 0


def test_shipping_rule_crud_and_quote(admin_session):
    s = admin_session
    # Create most-specific rule (Colombo + Colombo 03)
    rule_payload = {
        "district": "Colombo",
        "city": "Colombo 03",
        "fee": 250.0,
        "free_above": 5000.0,
        "active": True,
    }
    r = s.post(f"{BASE_URL}/api/admin/shipping/rules", json=rule_payload)
    assert r.status_code in (200, 201), r.text
    rule = r.json()
    rid = rule["id"]

    # List
    r = s.get(f"{BASE_URL}/api/admin/shipping/rules")
    assert r.status_code == 200
    assert any(x["id"] == rid for x in r.json())

    # Quote: subtotal under threshold -> fee=250
    q = requests.get(f"{BASE_URL}/api/shipping/quote",
                     params={"district": "Colombo", "city": "Colombo 03", "subtotal": 1000})
    assert q.status_code == 200, q.text
    assert q.json()["fee"] == 250.0

    # Quote: subtotal over free_above -> 0
    q = requests.get(f"{BASE_URL}/api/shipping/quote",
                     params={"district": "Colombo", "city": "Colombo 03", "subtotal": 6000})
    assert q.status_code == 200
    assert q.json()["fee"] == 0.0

    # Cleanup
    r = s.delete(f"{BASE_URL}/api/admin/shipping/rules/{rid}")
    assert r.status_code in (200, 204)


# ----- Payment methods -----

def test_payment_method_crud_and_scope(admin_session):
    s = admin_session
    code = f"TEST_PM_{uuid.uuid4().hex[:5]}"
    payload = {"code": code, "label": "Test Card POS", "scope": "pos", "active": True, "instructions": "Swipe"}
    r = s.post(f"{BASE_URL}/api/admin/payment-methods", json=payload)
    assert r.status_code in (200, 201), r.text
    pm = r.json()
    pmid = pm["id"]

    # Public scope filter
    r = requests.get(f"{BASE_URL}/api/payment-methods", params={"scope": "pos"})
    assert r.status_code == 200
    codes = [x["code"] for x in r.json()]
    assert code in codes

    r = requests.get(f"{BASE_URL}/api/payment-methods", params={"scope": "online"})
    assert r.status_code == 200
    assert code not in [x["code"] for x in r.json()]

    s.delete(f"{BASE_URL}/api/admin/payment-methods/{pmid}")


# ----- Categories & Products & Inventory -----

@pytest.fixture(scope="module")
def category(admin_session):
    s = admin_session
    payload = {"name": f"TEST_CAT_{uuid.uuid4().hex[:5]}", "description": "t"}
    r = s.post(f"{BASE_URL}/api/admin/categories", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def product(admin_session, category):
    s = admin_session
    payload = {
        "name": f"TEST_PROD_{uuid.uuid4().hex[:5]}",
        "description": "test",
        "category_id": category["id"],
        "base_price": 1500.0,
        "status": "active",
        "variants": [
            {"size": "M", "color": "Black", "color_hex": "#000000", "sku": f"T-M-{uuid.uuid4().hex[:4]}", "stock": 20},
            {"size": "L", "color": "Black", "color_hex": "#000000", "sku": f"T-L-{uuid.uuid4().hex[:4]}", "stock": 10},
        ],
    }
    r = s.post(f"{BASE_URL}/api/admin/products", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_admin_products_search(admin_session, product):
    r = admin_session.get(f"{BASE_URL}/api/admin/products", params={"q": product["name"][:8]})
    assert r.status_code == 200
    assert any(p["id"] == product["id"] for p in r.json())


def test_inventory_listing_and_filter(admin_session, product):
    r = admin_session.get(f"{BASE_URL}/api/admin/inventory", params={"q": product["name"][:8]})
    assert r.status_code == 200
    items = r.json()
    assert any(i.get("product_name", "").startswith("TEST_PROD") for i in items) or \
           any(i.get("product_id") == product["id"] for i in items)


# ----- Customer dedup -----

def test_customer_create_dedup_by_phone(admin_session):
    s = admin_session
    phone = f"+9477{uuid.uuid4().hex[:7]}"
    payload = {"name": "TEST_Walkin1", "phone": phone, "email": f"TEST_w_{uuid.uuid4().hex[:5]}@x.com"}
    r = s.post(f"{BASE_URL}/api/admin/customers", json=payload)
    assert r.status_code in (200, 201), r.text
    c1 = r.json()
    # second create with same phone returns existing
    r = s.post(f"{BASE_URL}/api/admin/customers", json={"name": "TEST_Walkin2", "phone": phone})
    assert r.status_code in (200, 201)
    c2 = r.json()
    assert c1["id"] == c2["id"], "customer not deduplicated by phone"

    # search by phone
    r = s.get(f"{BASE_URL}/api/admin/customers", params={"q": phone[-6:]})
    assert r.status_code == 200
    assert any(x["id"] == c1["id"] for x in r.json())


# ----- Coupons -----

def test_coupon_create_validate_search(admin_session):
    s = admin_session
    code = f"TESTC{uuid.uuid4().hex[:4].upper()}"
    r = s.post(f"{BASE_URL}/api/admin/coupons", json={
        "code": code, "type": "percent", "value": 15, "min_order": 0, "active": True
    })
    assert r.status_code in (200, 201), r.text

    r = requests.get(f"{BASE_URL}/api/coupons/validate/{code}")
    assert r.status_code == 200
    assert r.json()["value"] == 15

    r = s.get(f"{BASE_URL}/api/admin/coupons", params={"q": code[:6]})
    assert r.status_code == 200
    assert any(c["code"] == code for c in r.json())


# ----- Checkout w/ shipping rule -----

def test_checkout_online_with_shipping(admin_session, product):
    # create a rule
    rule = admin_session.post(f"{BASE_URL}/api/admin/shipping/rules", json={
        "district": "Kandy", "fee": 400, "free_above": 50000, "active": True
    }).json()

    variant = product["variants"][0]
    payload = {
        "customer_name": "TEST_Order",
        "customer_phone": "+94770000222",
        "shipping_address": "TEST 99 Lane",
        "shipping_district": "Kandy",
        "shipping_city": "Kandy",
        "items": [{"variant_id": variant["id"], "quantity": 2}],
        "payment_method": "cod",
        "source": "online",
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["shipping"] == 400.0
    assert o["payment_method"] == "cod"
    assert o["payment_status"] in ("pending", "unpaid")
    assert o["order_number"].startswith("ORD-")
    admin_session.delete(f"{BASE_URL}/api/admin/shipping/rules/{rule['id']}")


def test_checkout_pos_cash_paid(admin_session, product):
    variant = product["variants"][1]
    payload = {
        "customer_name": "TEST_POS",
        "items": [{"variant_id": variant["id"], "quantity": 1}],
        "payment_method": "cash",
        "source": "pos",
    }
    r = requests.post(f"{BASE_URL}/api/checkout", json=payload)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["payment_status"] == "paid"
    assert o["shipping"] == 0


# ----- Page builder & custom pages -----

def test_get_polo_shop_2_pages_public():
    for slug in ["home", "_header", "_footer", "shipping-policy", "returns-policy"]:
        r = requests.get(f"{BASE_URL}/api/page/{slug}")
        assert r.status_code == 200, f"{slug}: {r.status_code} {r.text[:200]}"


def test_admin_custom_page_create(admin_session):
    slug = f"test-page-{uuid.uuid4().hex[:5]}"
    r = admin_session.post(f"{BASE_URL}/api/admin/pages", json={"slug": slug, "title": "TEST Page"})
    assert r.status_code in (200, 201), r.text

    r = requests.get(f"{BASE_URL}/api/pages")
    assert r.status_code == 200
    assert any(p["slug"] == slug for p in r.json())


# ----- Integrations (super_admin) -----

def test_integration_settings_list(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/integrations")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ----- Stores -----

def test_stores_crud(admin_session):
    s = admin_session
    payload = {"name": f"TEST_STORE_{uuid.uuid4().hex[:4]}", "type": "warehouse"}
    r = s.post(f"{BASE_URL}/api/admin/stores", json=payload)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    r = s.get(f"{BASE_URL}/api/admin/stores")
    assert r.status_code == 200
    assert any(x["id"] == sid for x in r.json())
    s.delete(f"{BASE_URL}/api/admin/stores/{sid}")


# ----- Expenses -----

def test_expense_crud(admin_session):
    s = admin_session
    r = s.post(f"{BASE_URL}/api/admin/expenses", json={
        "title": "TEST_EXP", "amount": 500, "category": "office", "date": "2026-01-15"
    })
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    r = s.get(f"{BASE_URL}/api/admin/expenses")
    assert r.status_code == 200
    assert any(x["id"] == eid for x in r.json())
    s.delete(f"{BASE_URL}/api/admin/expenses/{eid}")


# ----- Cleanup -----

def test_cleanup(admin_session, product, category):
    s = admin_session
    s.delete(f"{BASE_URL}/api/admin/products/{product['id']}")
    s.delete(f"{BASE_URL}/api/admin/categories/{category['id']}")
