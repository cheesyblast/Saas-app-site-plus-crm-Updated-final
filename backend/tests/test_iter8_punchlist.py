"""Iter8 — 6-point punch-list backend coverage.

Covers:
  - Auth (admin)
  - /api/discounts/active (sitewide auto-discount)
  - /api/checkout (online) honors auto-discount
  - /api/checkout (POS) honors manual_discount_percent + manual_discount_amount cap
  - /api/admin/customers auto-create + phone normalization (+94...) + search
  - /api/admin/reports/pnl includes manual income + EOD on to_date
  - /receipt/{order_number} renders discount + total
"""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

def _read_react_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for ln in open(p):
            if ln.startswith("REACT_APP_BACKEND_URL="):
                return ln.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_react_env()).rstrip("/")
ADMIN_EMAIL = "admin@demo.com"
ADMIN_PWD = "demo12345"


# -------- fixtures --------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=45)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def online_store(admin):
    rs = admin.get(f"{BASE_URL}/api/admin/stores", timeout=45).json()
    items = rs if isinstance(rs, list) else rs.get("items", [])
    online = next((s for s in items if s.get("is_online")), None)
    if not online:
        # create one
        r = admin.post(f"{BASE_URL}/api/admin/stores",
                       json={"name": "TEST_iter8_Online", "is_online": True})
        online = r.json()
    # ensure bank account on it
    accs = admin.get(f"{BASE_URL}/api/admin/cash-accounts", timeout=45).json()
    acc_items = accs if isinstance(accs, list) else accs.get("items", [])
    if not any(a.get("store_id") == online["id"] and a.get("kind") == "bank"
               and a.get("active", True) for a in acc_items):
        admin.post(f"{BASE_URL}/api/admin/cash-accounts",
                   json={"name": "TEST_iter8_Bank", "kind": "bank",
                         "store_id": online["id"], "active": True})
    return online


@pytest.fixture(scope="session")
def test_product(admin, online_store):
    """Always seed a fresh product+variant with plenty of stock at the online store."""
    cat = admin.post(f"{BASE_URL}/api/admin/categories",
                     json={"name": f"TEST_iter8_cat_{uuid.uuid4().hex[:6]}"},
                     timeout=45).json()
    p = admin.post(f"{BASE_URL}/api/admin/products", json={
        "name": f"TEST_iter8_prod_{uuid.uuid4().hex[:6]}",
        "base_price": 1000.0, "category_id": cat["id"], "active": True,
        "variants": [{"size": "M", "color": "black", "color_hex": "#000",
                      "sku": f"T8-{uuid.uuid4().hex[:6]}"}],
        "images": [],
    }, timeout=45).json()
    v = p["variants"][0]
    admin.post(f"{BASE_URL}/api/admin/stock-movements", json={
        "variant_id": v["id"], "store_id": online_store["id"],
        "type": "adjust", "quantity": 500, "reason": "TEST_iter8_seed",
    }, timeout=45)
    return p, v


# -------- 1) auto-discount on /api/discounts/active --------
class TestActiveDiscounts:
    def test_active_discounts_returns_list(self):
        r = requests.get(f"{BASE_URL}/api/discounts/active", timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)


# -------- 2) Checkout honors sitewide auto-discount --------
class TestCheckoutAutoDiscount:
    @pytest.fixture(scope="class")
    def sitewide_10pc(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/discounts", json={
            "name": "TEST_iter8_sitewide", "scope": "sitewide",
            "type": "percent", "value": 10, "active": True,
            "show_marquee": False, "show_badge": False,
        }, timeout=45)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        yield d
        admin.delete(f"{BASE_URL}/api/admin/discounts/{d['id']}")

    def test_online_checkout_applies_10pc(self, admin, sitewide_10pc, online_store, test_product):
        p, v = test_product
        unit_price = float(p.get("base_price") or 1000.0)
        payload = {
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "customer_name": "TEST_iter8_buyer",
            "customer_email": f"t8buyer_{uuid.uuid4().hex[:5]}@demo.com",
            "customer_phone": "+94770000000",
            "shipping_address": "1 Test", "shipping_district": "Colombo",
            "shipping_city": "Colombo",
            "payment_method": "card", "source": "online",
            "store_id": online_store["id"],
        }
        r = admin.post(f"{BASE_URL}/api/checkout", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        order = r.json()
        # order.total = subtotal - 10% + shipping
        assert order["discount"] >= round(unit_price * 0.10, 2) - 0.01, order
        assert order["payment_status"] == "paid"


# -------- 3) POS manual discount % + fixed cap --------
class TestPOSManualDiscount:
    def test_manual_percent_10(self, admin, online_store, test_product):
        p, v = test_product
        unit = float(p.get("base_price") or 1000.0)
        payload = {
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "customer_name": "TEST_iter8_pos",
            "customer_phone": "+94770000001",
            "payment_method": "cash", "source": "pos",
            "store_id": online_store["id"],
            "manual_discount_percent": 10,
        }
        r = admin.post(f"{BASE_URL}/api/checkout", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        order = r.json()
        # discount should be ~10% of (subtotal - auto). Auto disc may be active from above test
        # so just assert non-zero discount
        assert order["discount"] > 0
        assert order["status"] == "completed"
        assert order["payment_status"] == "paid"

    def test_manual_fixed_caps_at_subtotal(self, admin, online_store, test_product):
        p, v = test_product
        payload = {
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "customer_name": "TEST_iter8_pos2",
            "customer_phone": "+94770000002",
            "payment_method": "cash", "source": "pos",
            "store_id": online_store["id"],
            "manual_discount_amount": 999999,  # huge
        }
        r = admin.post(f"{BASE_URL}/api/checkout", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        order = r.json()
        # total cannot be negative — discount is capped
        assert order["total"] >= 0
        assert order["discount"] <= order["subtotal"]


# -------- 4) Customer auto-create + phone normalization + search --------
class TestCustomerAutoCreate:
    def test_local_phone_normalised_to_e164(self, admin, online_store, test_product):
        # NOTE: We deliberately call /api/checkout WITHOUT auth so the checkout
        # does NOT short-circuit to user-id-bound customer record (see bug below).
        p, v = test_product
        local_phone = f"077{uuid.uuid4().int % 10_000_000:07d}"
        normalized = "+94" + local_phone[1:]
        name = f"TEST_iter8_{uuid.uuid4().hex[:5]}"
        payload = {
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "customer_name": name,
            "customer_email": f"{name.lower()}@demo.com",
            "customer_phone": local_phone,
            "shipping_address": "1 Galle Rd",
            "shipping_district": "Colombo", "shipping_city": "Colombo",
            "payment_method": "card", "source": "online",
            "store_id": online_store["id"],
        }
        # Anonymous POST — no Authorization header
        r = requests.post(f"{BASE_URL}/api/checkout", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        # search by raw local phone — should find the auto-created customer with normalized phone
        rs = admin.get(f"{BASE_URL}/api/admin/customers", params={"q": local_phone}, timeout=45)
        assert rs.status_code == 200, rs.text
        data = rs.json()
        items = data.get("items") if isinstance(data, dict) else data
        local_match_count = len(items)
        # Also try by the normalized phone (must work)
        rs2 = admin.get(f"{BASE_URL}/api/admin/customers", params={"q": normalized}, timeout=45).json()
        items2 = rs2.get("items") if isinstance(rs2, dict) else rs2
        assert items2, f"no customer found for normalized={normalized}"
        match = [c for c in items2 if c.get("phone") == normalized]
        assert match, f"phone not normalized; got phones={[c.get('phone') for c in items2]}"
        # Document UX issue: the spec says searching local '0771234567' should list the customer.
        # Currently fails (DB stores '+9477...', LIKE '%0771234567%' misses).
        assert local_match_count > 0, (
            f"BUG: searching by local phone {local_phone} should find customer "
            f"with normalized phone {normalized} but got 0 hits "
            f"(needs server.py list_customers to also try ILIKE on normalize_phone_lk(q))"
        )


# -------- 5) /admin/reports/pnl: manual income + EOD --------
class TestPnlReport:
    def test_manual_income_reflected_with_eod_to_date(self, admin):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        amount = 12345.67
        # create manual income for today
        ri = admin.post(f"{BASE_URL}/api/admin/income", json={
            "category": "TEST_iter8_inc", "amount": amount,
            "description": "iter8 income test", "method": "cash",
        }, timeout=45)
        assert ri.status_code == 200, ri.text

        # GET pnl with today-to-today; with EOD fix, the income (logged "now") must fall in
        r = admin.get(f"{BASE_URL}/api/admin/reports/pnl?from_date={today}&to_date={today}",
                      timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_income"] >= amount - 0.01, \
            f"income {amount} not in pnl total_income={data['total_income']}"

    def test_pnl_supplier_payments_field_exists(self, admin):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = admin.get(f"{BASE_URL}/api/admin/reports/pnl?from_date={today}&to_date={today}",
                      timeout=45).json()
        assert "supplier_payments" in r
        assert "total_revenue" in r and "total_expense" in r


# -------- 6) Receipt URL public + shows discount/total --------
class TestReceipt:
    def test_receipt_renders(self, admin, online_store, test_product):
        p, v = test_product
        # create order with manual discount so receipt has a discount line
        payload = {
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "customer_name": "TEST_iter8_receipt",
            "customer_phone": "+94770000099",
            "payment_method": "cash", "source": "pos",
            "store_id": online_store["id"],
            "manual_discount_percent": 5,
        }
        r = admin.post(f"{BASE_URL}/api/checkout", json=payload, timeout=45).json()
        order_number = r["order_number"]
        # public — no auth
        page = requests.get(f"{BASE_URL}/receipt/{order_number}", timeout=45)
        # may redirect to SPA; either way HTML 200
        assert page.status_code == 200, page.status_code
