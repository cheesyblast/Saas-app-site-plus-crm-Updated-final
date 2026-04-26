"""
Iteration 5 backend tests — Massive 6-phase SaaS batch:
- Suppliers + supplier-invoices + supplier-payments (+ cash account ledger)
- Income / Cash Accounts / Cash Ledger
- P&L report + xlsx export
- Public /receipt/{order_number} (no auth)
- CSV import dry-run + commit (variants + inventory aggregation)
- Coupon scope (products / categories) — discount only eligible items
- Staff permissions JSON (default OFF)
- POS cash checkout: cash_tendered / cash_change + CashLedger 'in' entry
- /admin/products still returns paginated envelope
- SMS notification body includes /receipt/{order_number}
"""
import os, time, uuid, pytest, requests


def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL required"
ADMIN_EMAIL = "admin@demo.com"
ADMIN_PASSWORD = "demo12345"


@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------- Sanity ----------
class TestSanity:
    def test_admin_products_paginated_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/products")
        assert r.status_code == 200
        d = r.json()
        for k in ("items", "total", "page", "page_size"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["items"], list)


# ---------- Suppliers ----------
class TestSuppliers:
    @pytest.fixture(scope="class")
    def supplier_id(self, admin_client):
        name = f"TEST_Supplier_{uuid.uuid4().hex[:6]}"
        r = admin_client.post(f"{BASE_URL}/api/admin/suppliers",
                              json={"name": name, "phone": "0771234567", "email": "sup@test.com"})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        yield sid
        admin_client.delete(f"{BASE_URL}/api/admin/suppliers/{sid}")

    def test_list_suppliers_paginated(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/suppliers")
        assert r.status_code == 200
        d = r.json()
        assert {"items", "total", "page", "page_size"} <= set(d.keys())

    def test_update_supplier(self, admin_client, supplier_id):
        r = admin_client.put(f"{BASE_URL}/api/admin/suppliers/{supplier_id}",
                             json={"name": "TEST_Supplier_Updated", "phone": "0779999999"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Supplier_Updated"

    def test_invoice_increases_balance_owed(self, admin_client, supplier_id):
        r = admin_client.post(f"{BASE_URL}/api/admin/supplier-invoices",
                              json={"supplier_id": supplier_id, "amount": 5000.0,
                                    "reference": "TEST-INV-1"})
        assert r.status_code == 200, r.text
        # Verify supplier balance_owed += 5000
        lst = admin_client.get(f"{BASE_URL}/api/admin/suppliers").json()["items"]
        sup = next(s for s in lst if s["id"] == supplier_id)
        assert sup["balance_owed"] >= 5000.0
        assert sup["total_purchases"] >= 5000.0

    def test_payment_decreases_balance_with_cash_ledger(self, admin_client, supplier_id):
        # create a cash account
        ca = admin_client.post(f"{BASE_URL}/api/admin/cash-accounts",
                               json={"name": f"TEST_CA_{uuid.uuid4().hex[:4]}",
                                     "kind": "cash", "balance": 10000.0}).json()
        ca_id = ca["id"]
        before = next(s for s in admin_client.get(f"{BASE_URL}/api/admin/suppliers").json()["items"]
                      if s["id"] == supplier_id)
        r = admin_client.post(f"{BASE_URL}/api/admin/supplier-payments",
                              json={"supplier_id": supplier_id, "amount": 2000.0,
                                    "method": "cash", "cash_account_id": ca_id})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["balance_owed"] == round(before["balance_owed"] - 2000.0, 2)
        # cash ledger entry
        ledger = admin_client.get(f"{BASE_URL}/api/admin/cash-ledger",
                                  params={"cash_account_id": ca_id}).json()
        assert any(e["source_kind"] == "supplier" and e["direction"] == "out" and e["amount"] == 2000.0
                   for e in ledger)
        # cash account balance debited
        accts = admin_client.get(f"{BASE_URL}/api/admin/cash-accounts").json()
        ca_after = next(a for a in accts if a["id"] == ca_id)
        assert ca_after["balance"] == 8000.0
        admin_client.delete(f"{BASE_URL}/api/admin/cash-accounts/{ca_id}")


# ---------- Income / Cash Accounts ----------
class TestIncomeCashAccounts:
    def test_income_with_cash_account_credits(self, admin_client):
        ca = admin_client.post(f"{BASE_URL}/api/admin/cash-accounts",
                               json={"name": f"TEST_INC_CA_{uuid.uuid4().hex[:4]}",
                                     "kind": "bank", "balance": 0.0}).json()
        ca_id = ca["id"]
        r = admin_client.post(f"{BASE_URL}/api/admin/income",
                              json={"category": "Service Fee", "amount": 1500.0,
                                    "description": "TEST_income",
                                    "method": "cash", "cash_account_id": ca_id})
        assert r.status_code == 200, r.text
        income_id = r.json()["id"]
        # GET list
        lst = admin_client.get(f"{BASE_URL}/api/admin/income").json()
        assert {"items", "total", "page", "page_size"} <= set(lst.keys())
        assert any(i["id"] == income_id for i in lst["items"])
        # ledger
        ledger = admin_client.get(f"{BASE_URL}/api/admin/cash-ledger",
                                  params={"cash_account_id": ca_id}).json()
        assert any(e["source_kind"] == "income" and e["direction"] == "in" and e["amount"] == 1500.0
                   for e in ledger)
        # account balance
        accts = admin_client.get(f"{BASE_URL}/api/admin/cash-accounts").json()
        assert next(a for a in accts if a["id"] == ca_id)["balance"] == 1500.0
        # delete
        assert admin_client.delete(f"{BASE_URL}/api/admin/income/{income_id}").status_code == 200
        admin_client.delete(f"{BASE_URL}/api/admin/cash-accounts/{ca_id}")

    def test_cash_accounts_crud(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/cash-accounts",
                              json={"name": "TEST_CA_CRUD", "kind": "cash", "balance": 100.0})
        assert r.status_code == 200
        aid = r.json()["id"]
        u = admin_client.put(f"{BASE_URL}/api/admin/cash-accounts/{aid}",
                             json={"name": "TEST_CA_CRUD_U", "kind": "cash", "balance": 250.0})
        assert u.status_code == 200
        accts = admin_client.get(f"{BASE_URL}/api/admin/cash-accounts").json()
        a = next(x for x in accts if x["id"] == aid)
        assert a["name"] == "TEST_CA_CRUD_U" and a["balance"] == 250.0
        assert admin_client.delete(f"{BASE_URL}/api/admin/cash-accounts/{aid}").status_code == 200


# ---------- P&L ----------
class TestPnL:
    def test_pnl_report_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/reports/pnl",
                             params={"group_by": "day"})
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_revenue", "total_income", "total_expense", "profit", "series", "by_outlet"):
            assert k in d, f"missing {k}"
        assert isinstance(d["series"], list)
        assert isinstance(d["by_outlet"], list)

    def test_pnl_group_by_month(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/reports/pnl",
                             params={"group_by": "month"})
        assert r.status_code == 200
        assert r.json()["group_by"] == "month"

    def test_pnl_xlsx_export(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/reports/pnl/export",
                             params={"group_by": "day"})
        assert r.status_code == 200
        assert "spreadsheetml.sheet" in r.headers.get("content-type", ""), r.headers
        assert r.content[:2] == b"PK"  # xlsx is a zip


# ---------- Public Receipt + SMS link ----------
class TestPublicReceipt:
    def test_receipt_public_and_sms_log(self, admin_client):
        # Create a POS cash order to obtain order number
        prods = admin_client.get(f"{BASE_URL}/api/admin/products", params={"page_size": 100}).json()["items"]
        variant = None; chosen_p = None
        for p in prods:
            full = admin_client.get(f"{BASE_URL}/api/products/{p['slug']}").json()
            for v in full.get("variants", []):
                inv_total = v.get("stock", 0)
                if inv_total > 0:
                    variant = v; chosen_p = full
                    break
            if variant:
                break
        if not variant:
            pytest.skip("No in-stock variant for checkout")

        co = requests.post(f"{BASE_URL}/api/checkout", json={
            "items": [{"variant_id": variant["id"], "quantity": 1}],
            "customer_name": "TEST_Receipt_Buyer",
            "customer_phone": "0770000001",
            "customer_email": "TEST_receipt@example.com",
            "payment_method": "cash",
            "source": "pos",
            "cash_tendered": variant.get("price_override") or chosen_p["base_price"] + 100,
        })
        assert co.status_code == 200, co.text
        order = co.json()
        on = order["order_number"]

        # cash_tendered + change + status
        assert order["payment_status"] == "paid"
        assert order["status"] == "completed"
        assert order["cash_tendered"] is not None
        assert order["cash_change"] is not None
        assert order["cash_change"] >= 0
        assert "store_id" in order

        # public, no auth
        pub = requests.get(f"{BASE_URL}/api/receipt/{on}")
        assert pub.status_code == 200, pub.text
        body = pub.json()
        assert body["order_number"] == on
        assert "items" in body and len(body["items"]) >= 1
        assert "company" in body
        assert body["cash_tendered"] is not None

        # SMS log contains /receipt/{n}
        notes = admin_client.get(f"{BASE_URL}/api/admin/notifications", params={"channel": "sms"}).json()
        items = notes if isinstance(notes, list) else notes.get("items", [])
        match = [n for n in items if on in (n.get("body") or "")]
        assert match, f"no SMS log for order {on}"
        assert f"/receipt/{on}" in match[0]["body"]


# ---------- POS cash checkout cash_account credit ----------
class TestPOSCashLedger:
    def test_pos_cash_creates_ledger_in(self, admin_client):
        ca = admin_client.post(f"{BASE_URL}/api/admin/cash-accounts",
                               json={"name": f"TEST_POS_CA_{uuid.uuid4().hex[:4]}",
                                     "kind": "cash", "balance": 0.0}).json()
        ca_id = ca["id"]
        prods = admin_client.get(f"{BASE_URL}/api/admin/products", params={"page_size": 100}).json()["items"]
        variant = None; price = 0
        for p in prods:
            full = admin_client.get(f"{BASE_URL}/api/products/{p['slug']}").json()
            for v in full.get("variants", []):
                inv_total = v.get("stock", 0)
                if inv_total > 0:
                    variant = v; price = v.get("price_override") or full["base_price"]
                    break
            if variant: break
        if not variant:
            pytest.skip("No stock")
        tendered = price + 50
        co = requests.post(f"{BASE_URL}/api/checkout", json={
            "items": [{"variant_id": variant["id"], "quantity": 1}],
            "customer_name": "TEST_POS_CA",
            "payment_method": "cash", "source": "pos",
            "cash_tendered": tendered, "cash_account_id": ca_id,
        })
        assert co.status_code == 200, co.text
        ledger = admin_client.get(f"{BASE_URL}/api/admin/cash-ledger",
                                  params={"cash_account_id": ca_id}).json()
        assert any(e["source_kind"] == "order" and e["direction"] == "in" for e in ledger)
        admin_client.delete(f"{BASE_URL}/api/admin/cash-accounts/{ca_id}")


# ---------- CSV import ----------
class TestCsvImport:
    def test_template_endpoint(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/import/products/template")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert b"name,sku,base_price" in r.content

    def test_dry_run_then_commit_with_variants(self, admin_client):
        nm = f"TEST_CSV_{uuid.uuid4().hex[:6]}"
        sku = f"TCSV-{uuid.uuid4().hex[:5]}"
        rows = [
            {"name": nm, "sku": sku, "base_price": 1200, "size": "S", "color": "Black",
             "color_hex": "#000000", "stock": 5, "status": "active"},
            {"name": nm, "sku": sku, "base_price": 1200, "size": "M", "color": "Black",
             "color_hex": "#000000", "stock": 7, "status": "active"},
        ]
        # dry-run
        dr = admin_client.post(f"{BASE_URL}/api/admin/import/products",
                               json={"rows": rows, "commit": False})
        assert dr.status_code == 200, dr.text
        d = dr.json()
        assert d["committed"] is False
        assert "preview" in d and len(d["preview"]) == 2
        # not yet persisted
        listed = admin_client.get(f"{BASE_URL}/api/admin/products",
                                  params={"q": nm}).json()["items"]
        assert not any(p["name"] == nm for p in listed), "dry-run should not persist"

        # commit
        cm = admin_client.post(f"{BASE_URL}/api/admin/import/products",
                               json={"rows": rows, "commit": True})
        assert cm.status_code == 200, cm.text
        cd = cm.json()
        assert cd["committed"] is True
        assert cd["summary"]["created"] + cd["summary"]["updated"] >= 1

        listed = admin_client.get(f"{BASE_URL}/api/admin/products",
                                  params={"q": nm}).json()["items"]
        assert any(p["name"] == nm for p in listed), "product not persisted after commit"
        prod = next(p for p in listed if p["name"] == nm)
        # cleanup
        admin_client.delete(f"{BASE_URL}/api/admin/products/{prod['id']}")


# ---------- Coupon scope ----------
class TestCouponScope:
    def test_coupon_scope_products_and_rejects_non_eligible(self, admin_client):
        # Seed two products via CSV import to ensure stock available
        seeded_ids = []
        for tag in ("A", "B"):
            nm = f"TEST_SCOPE_{tag}_{uuid.uuid4().hex[:5]}"
            sku = f"TSC{tag}-{uuid.uuid4().hex[:5]}"
            admin_client.post(f"{BASE_URL}/api/admin/import/products", json={
                "rows": [{"name": nm, "sku": sku, "base_price": 1000, "size": "M",
                          "color": "Blue", "color_hex": "#0000FF", "stock": 5,
                          "status": "active"}],
                "commit": True,
            })
            listed = admin_client.get(f"{BASE_URL}/api/admin/products",
                                      params={"q": nm}).json()["items"]
            assert listed, f"failed to seed {nm}"
            seeded_ids.append(listed[0]["id"])

        chosen = []
        for pid in seeded_ids:
            full = next(p for p in admin_client.get(f"{BASE_URL}/api/admin/products",
                                                    params={"page_size": 200}).json()["items"]
                        if p["id"] == pid)
            full = admin_client.get(f"{BASE_URL}/api/products/{full['slug']}").json()
            for v in full.get("variants", []):
                if v.get("stock", 0) > 0:
                    chosen.append((full, v))
                    break
        assert len(chosen) == 2, f"need 2 in-stock seeded products, got {len(chosen)}"
        eligible_p, eligible_v = chosen[0]
        other_p, other_v = chosen[1]

        code = f"TESTSCOPE{uuid.uuid4().hex[:4].upper()}"
        cr = admin_client.post(f"{BASE_URL}/api/admin/coupons", json={
            "code": code, "type": "percent", "value": 50, "min_order": 0,
            "scope": "products", "scope_product_ids": [eligible_p["id"]],
            "active": True,
        })
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]

        # checkout WITHOUT eligible product → 400
        bad = requests.post(f"{BASE_URL}/api/checkout", json={
            "items": [{"variant_id": other_v["id"], "quantity": 1}],
            "customer_name": "TEST_Scope_Bad", "customer_phone": "0770000099",
            "payment_method": "cash", "source": "pos", "coupon_code": code,
        })
        assert bad.status_code == 400, f"expected 400, got {bad.status_code}: {bad.text}"

        # checkout WITH eligible: discount only on eligible
        ep = eligible_v.get("price_override") or eligible_p["base_price"]
        op = other_v.get("price_override") or other_p["base_price"]
        good = requests.post(f"{BASE_URL}/api/checkout", json={
            "items": [
                {"variant_id": eligible_v["id"], "quantity": 1},
                {"variant_id": other_v["id"], "quantity": 1},
            ],
            "customer_name": "TEST_Scope_Good", "customer_phone": "0770000098",
            "payment_method": "cash", "source": "pos", "coupon_code": code,
        })
        assert good.status_code == 200, good.text
        body = good.json()
        # Expected discount = 50% of eligible price only (rounded)
        expected_discount = round(ep * 0.5, 2)
        assert abs(body["discount"] - expected_discount) < 0.01, \
            f"discount {body['discount']} != expected {expected_discount}"
        # cleanup
        admin_client.delete(f"{BASE_URL}/api/admin/coupons/{cid}")
        for pid in seeded_ids:
            admin_client.delete(f"{BASE_URL}/api/admin/products/{pid}")


# ---------- Staff permissions ----------
class TestStaffPermissions:
    def test_new_staff_defaults_off_and_update(self, admin_client):
        email = f"TEST_staff_{uuid.uuid4().hex[:6]}@test.com"
        # POST without permissions → defaults all OFF
        r = admin_client.post(f"{BASE_URL}/api/admin/staff", json={
            "email": email, "name": "TEST Staff", "role": "staff",
            "password": "testpass123",
        })
        assert r.status_code == 200, r.text
        uid = r.json()["user_id"]
        listed = admin_client.get(f"{BASE_URL}/api/admin/staff").json()
        u = next(x for x in listed if x["user_id"] == uid)
        perms = u["permissions"]
        assert isinstance(perms, dict) and len(perms) > 0, "permissions dict missing/empty"
        assert all(v is False for v in perms.values()), f"expected all OFF, got {perms}"
        # PUT to enable some
        new_perms = {k: True for k in perms.keys()}
        up = admin_client.put(f"{BASE_URL}/api/admin/staff/{uid}", json={
            "email": email, "name": "TEST Staff", "role": "staff",
            "permissions": new_perms,
        })
        assert up.status_code == 200, up.text
        listed = admin_client.get(f"{BASE_URL}/api/admin/staff").json()
        u = next(x for x in listed if x["user_id"] == uid)
        assert all(v is True for v in u["permissions"].values())
        # cleanup
        admin_client.delete(f"{BASE_URL}/api/admin/staff/{uid}")
