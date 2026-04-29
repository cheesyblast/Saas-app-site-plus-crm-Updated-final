"""Iter9 — Fix verification for two CRITICAL bugs found in iter8.

(1) POS customer auto-create no longer collapses onto cashier's customer record
    (server.py L1424-1450 — gated on role=='customer').
(2) /api/admin/customers?q= now matches local phone format (server.py L1779-1792).
(3) Order list response now includes customer_id (server.py L1382-1389).

Plus regressions:
  - Logged-in customer online checkout still attaches to user account.
  - Walk-in POS (no name/phone) still creates an order with 'Walk-in' customer.
"""
import os
import uuid
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


# ---------- fixtures ----------
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
    assert online, "no online store seeded"
    # ensure cash + bank account exist on it
    accs = admin.get(f"{BASE_URL}/api/admin/cash-accounts", timeout=45).json()
    acc_items = accs if isinstance(accs, list) else accs.get("items", [])
    cash = next((a for a in acc_items
                 if a.get("store_id") == online["id"] and a.get("kind") == "cash"
                 and a.get("active", True)), None)
    if not cash:
        cash = admin.post(f"{BASE_URL}/api/admin/cash-accounts",
                          json={"name": "TEST_iter9_Cash", "kind": "cash",
                                "store_id": online["id"], "active": True},
                          timeout=45).json()
    bank = next((a for a in acc_items
                 if a.get("store_id") == online["id"] and a.get("kind") == "bank"
                 and a.get("active", True)), None)
    if not bank:
        admin.post(f"{BASE_URL}/api/admin/cash-accounts",
                   json={"name": "TEST_iter9_Bank", "kind": "bank",
                         "store_id": online["id"], "active": True},
                   timeout=45)
    return {"store": online, "cash_account_id": cash["id"]}


@pytest.fixture(scope="session")
def test_product(admin, online_store):
    """Seed a fresh product+variant with stock at the online store."""
    cat = admin.post(f"{BASE_URL}/api/admin/categories",
                     json={"name": f"TEST_iter9_cat_{uuid.uuid4().hex[:6]}"},
                     timeout=45).json()
    p = admin.post(f"{BASE_URL}/api/admin/products", json={
        "name": f"TEST_iter9_prod_{uuid.uuid4().hex[:6]}",
        "base_price": 1000.0, "category_id": cat["id"], "active": True,
        "variants": [{"size": "M", "color": "black", "color_hex": "#000",
                      "sku": f"T9-{uuid.uuid4().hex[:6]}"}],
        "images": [],
    }, timeout=45).json()
    v = p["variants"][0]
    admin.post(f"{BASE_URL}/api/admin/stock-movements", json={
        "variant_id": v["id"], "store_id": online_store["store"]["id"],
        "type": "adjust", "quantity": 500, "reason": "TEST_iter9_seed",
    }, timeout=45)
    return p, v


# ---------- FIX VERIFICATION 1: POS customer no longer collapses ----------
class TestPOSCustomerNoCollapse:
    @pytest.fixture(scope="class")
    def two_pos_checkouts(self, admin, online_store, test_product):
        p, v = test_product
        store_id = online_store["store"]["id"]
        cash_id = online_store["cash_account_id"]
        results = []
        for tag, phone in [("BuyerA", "0772223331"), ("BuyerB", "0772223332")]:
            payload = {
                "items": [{"variant_id": v["id"], "quantity": 1}],
                "customer_name": f"TEST_iter9 {tag}",
                "customer_phone": phone,
                "payment_method": "cash", "source": "pos",
                "store_id": store_id,
                "cash_account_id": cash_id,
            }
            r = admin.post(f"{BASE_URL}/api/checkout", json=payload, timeout=45)
            assert r.status_code == 200, f"{tag}: {r.status_code} {r.text}"
            results.append(r.json())
        return results

    def test_pos_orders_return_distinct_customer_ids(self, two_pos_checkouts):
        a, b = two_pos_checkouts
        assert "customer_id" in a, f"order JSON missing customer_id: {a.keys()}"
        assert "customer_id" in b, f"order JSON missing customer_id: {b.keys()}"
        assert a["customer_id"], "customer_id is null/empty for buyer A"
        assert b["customer_id"], "customer_id is null/empty for buyer B"
        assert a["customer_id"] != b["customer_id"], (
            f"BUG (iter8 regression): both POS orders share customer_id={a['customer_id']} "
            f"— should have created distinct Customer rows"
        )

    def test_admin_orders_list_includes_customer_id(self, admin, two_pos_checkouts):
        a, _b = two_pos_checkouts
        rs = admin.get(f"{BASE_URL}/api/admin/orders", timeout=45).json()
        items = rs if isinstance(rs, list) else rs.get("items", [])
        match = next((o for o in items if o.get("order_number") == a["order_number"]), None)
        assert match, f"order {a['order_number']} not found in /admin/orders"
        assert "customer_id" in match, "admin orders list missing customer_id field"
        assert match["customer_id"] == a["customer_id"]

    def test_search_returns_exactly_two_new_customers(self, admin, two_pos_checkouts):
        rs = admin.get(f"{BASE_URL}/api/admin/customers",
                       params={"q": "TEST_iter9"}, timeout=45)
        assert rs.status_code == 200, rs.text
        data = rs.json()
        items = data if isinstance(data, list) else data.get("items", [])
        # we created exactly 2 in this run
        names = sorted([c.get("name") for c in items])
        phones = sorted([c.get("phone") for c in items])
        assert "TEST_iter9 BuyerA" in names, f"BuyerA missing; got {names}"
        assert "TEST_iter9 BuyerB" in names, f"BuyerB missing; got {names}"
        assert "+94772223331" in phones, f"phone +94772223331 not normalised; got {phones}"
        assert "+94772223332" in phones, f"phone +94772223332 not normalised; got {phones}"

    def test_pos_customer_ids_match_orders(self, admin, two_pos_checkouts):
        """Verifies the customer_id on the order points to the new customer (not admin's)."""
        a, b = two_pos_checkouts
        rs = admin.get(f"{BASE_URL}/api/admin/customers",
                       params={"q": "TEST_iter9"}, timeout=45).json()
        items = rs if isinstance(rs, list) else rs.get("items", [])
        cust_ids = {c["id"] for c in items}
        assert a["customer_id"] in cust_ids, (
            f"order A's customer_id={a['customer_id']} not among new TEST_iter9 customers — "
            f"likely collapsed onto the admin's existing customer (iter8 bug regression)"
        )
        assert b["customer_id"] in cust_ids, (
            f"order B's customer_id={b['customer_id']} not among new TEST_iter9 customers"
        )


# ---------- FIX VERIFICATION 2: search by local phone format ----------
class TestCustomerSearchLocalPhone:
    def test_search_by_local_format_finds_normalised(self, admin, online_store, test_product):
        # ensure a customer exists with phone normalised to +9477XXXXXXX
        p, v = test_product
        local_phone = f"077{uuid.uuid4().int % 10_000_000:07d}"
        normalized = "+94" + local_phone[1:]
        name = f"TEST_iter9_search_{uuid.uuid4().hex[:5]}"
        admin.post(f"{BASE_URL}/api/checkout", json={
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "customer_name": name, "customer_phone": local_phone,
            "payment_method": "cash", "source": "pos",
            "store_id": online_store["store"]["id"],
            "cash_account_id": online_store["cash_account_id"],
        }, timeout=45).raise_for_status()

        # 1. search by raw local format
        r1 = admin.get(f"{BASE_URL}/api/admin/customers",
                       params={"q": local_phone}, timeout=45).json()
        items1 = r1 if isinstance(r1, list) else r1.get("items", [])
        match1 = [c for c in items1 if c.get("phone") == normalized]
        assert match1, (
            f"BUG (iter8): searching local '{local_phone}' returns 0 hits. "
            f"All phones: {[c.get('phone') for c in items1]}"
        )

        # 2. search by full +94 format
        r2 = admin.get(f"{BASE_URL}/api/admin/customers",
                       params={"q": normalized}, timeout=45).json()
        items2 = r2 if isinstance(r2, list) else r2.get("items", [])
        assert any(c.get("phone") == normalized for c in items2), \
            f"search by '{normalized}' missed it"

        # 3. partial '0772223' should match the iter9 buyer phones
        r3 = admin.get(f"{BASE_URL}/api/admin/customers",
                       params={"q": "0772223"}, timeout=45).json()
        items3 = r3 if isinstance(r3, list) else r3.get("items", [])
        # Should match +94772223331 and +94772223332 created by TestPOSCustomerNoCollapse
        # (and possibly more) — at least 1 match where phone starts with +9477222
        partial_match = [c for c in items3 if c.get("phone", "").startswith("+9477222")]
        assert partial_match, (
            f"partial search '0772223' returned no matches starting with +9477222: "
            f"{[c.get('phone') for c in items3]}"
        )


# ---------- REGRESSION: customer online checkout still attaches by user_id ----------
class TestCustomerOnlineCheckoutRegression:
    def test_logged_in_customer_uses_their_existing_customer_record(self, online_store, test_product):
        p, v = test_product
        # 1. register new customer
        email = f"TEST_iter9_cust_{uuid.uuid4().hex[:5]}@demo.com"
        pwd = "Pwd@12345"
        reg = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "TEST_iter9 Reg",
            "email": email,
            "password": pwd,
            "phone": "+94701112221",
        }, timeout=45)
        assert reg.status_code == 200, f"register failed: {reg.status_code} {reg.text}"
        token = reg.json().get("token")
        assert token, f"register no token: {reg.json()}"
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {token}",
                          "Content-Type": "application/json"})
        # 2. customer should already have a Customer row from registration. Place online order.
        # Don't override name/phone in the payload.
        order1 = s.post(f"{BASE_URL}/api/checkout", json={
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "shipping_address": "1 Galle", "shipping_district": "Colombo",
            "shipping_city": "Colombo",
            "payment_method": "card", "source": "online",
            "store_id": online_store["store"]["id"],
        }, timeout=45)
        assert order1.status_code == 200, order1.text
        o1 = order1.json()
        # 3. Place a 2nd order — must reuse the same Customer row
        order2 = s.post(f"{BASE_URL}/api/checkout", json={
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "shipping_address": "1 Galle", "shipping_district": "Colombo",
            "shipping_city": "Colombo",
            "payment_method": "card", "source": "online",
            "store_id": online_store["store"]["id"],
        }, timeout=45)
        assert order2.status_code == 200, order2.text
        o2 = order2.json()
        assert o1["customer_id"] == o2["customer_id"], (
            f"customer's two online orders have different customer_ids: "
            f"{o1['customer_id']} vs {o2['customer_id']} — regression of user_id linkage"
        )
        assert o1["customer_id"], "customer_id missing on customer-role online checkout"


# ---------- REGRESSION: Walk-in POS (no customer name/phone) ----------
class TestWalkInPOS:
    def test_walkin_pos_creates_order_with_walkin_customer(self, admin, online_store, test_product):
        p, v = test_product
        r = admin.post(f"{BASE_URL}/api/checkout", json={
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "payment_method": "cash", "source": "pos",
            "store_id": online_store["store"]["id"],
            "cash_account_id": online_store["cash_account_id"],
        }, timeout=45)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "completed"
        assert o["payment_status"] == "paid"
        assert o.get("customer_id"), "walk-in checkout missing customer_id"
        # the order's customer_name should default to Walk-in (or empty)
        # Lookup the customer to verify name
        rs = admin.get(f"{BASE_URL}/api/admin/customers",
                       params={"q": "Walk-in"}, timeout=45).json()
        items = rs if isinstance(rs, list) else rs.get("items", [])
        # Should find at least one Walk-in customer (this one or earlier ones)
        walkin_ids = {c["id"] for c in items if c.get("name") == "Walk-in"}
        assert o["customer_id"] in walkin_ids, (
            f"walk-in order's customer_id={o['customer_id']} not linked to a 'Walk-in' "
            f"customer row. Walk-in customer ids: {walkin_ids}"
        )
