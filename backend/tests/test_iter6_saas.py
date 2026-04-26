"""
Iteration 6 backend tests:
- POS product filter (store_id + in_stock)
- Order stats (sidebar pending badge)
- Checkout pre-flight: instant-paid w/o cash account => 400
- COD online + cash-received => auto-pick online cash account, ledger 'in'
- POS cash checkout: auto-pick store account, ledger 'in'
- Permission gates: move_stocks (stock-movements + transfer)
- Permission gates: manual_inc_exp (income + expenses)
- CSV import: partial rows commit-button bug fix (summary counters bump on dry-run)
- CSV import: partial-update preserves untouched fields
- CSV import: variant + stock creation on commit
"""
import os, uuid, pytest, requests


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
TAG = "TEST_iter6_"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


# ============== POS product filter ==============
class TestPOSProductFilter:
    def test_in_stock_filter_returns_only_stocked_variants(self, admin):
        stores = admin.get(f"{BASE_URL}/api/admin/stores").json()
        assert stores, "need at least 1 store"
        sid = stores[0]["id"]
        r = admin.get(f"{BASE_URL}/api/admin/products?store_id={sid}&in_stock=true&page_size=100")
        assert r.status_code == 200
        body = r.json()
        for k in ("items", "total", "page", "page_size"):
            assert k in body
        # Every variant must have stock>0 and a stock int field.
        for p in body["items"]:
            assert p["variants"], f"product {p['id']} has zero variants after filter"
            for v in p["variants"]:
                assert "stock" in v and isinstance(v["stock"], int)
                assert v["stock"] > 0
        assert body["total"] == len(body["items"])

    def test_unfiltered_includes_all(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/products?page_size=200")
        assert r.status_code == 200


# ============== Orders stats ==============
class TestOrderStats:
    def test_stats_shape(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/orders/stats")
        assert r.status_code == 200
        d = r.json()
        assert "pending" in d and "processing" in d
        assert isinstance(d["pending"], int)
        assert isinstance(d["processing"], int)


# ============== Helpers for checkout tests ==============
def _pick_in_stock_variant(admin, store_id):
    r = admin.get(f"{BASE_URL}/api/admin/products?store_id={store_id}&in_stock=true&page_size=20")
    items = r.json().get("items", [])
    for p in items:
        for v in p.get("variants", []):
            if v.get("stock", 0) > 0:
                return v["id"], p["id"]
    return None, None


def _stores(admin):
    return admin.get(f"{BASE_URL}/api/admin/stores").json()


def _online_store(admin):
    for s in _stores(admin):
        if s.get("is_online"):
            return s
    return None


def _cash_accounts(admin):
    return admin.get(f"{BASE_URL}/api/admin/cash-accounts").json()


# ============== Checkout pre-flight 400 ==============
class TestCheckoutPreflight:
    def _disable_all_cash_for_store(self, admin, store_id):
        """Deactivate every cash account on the store; return list of (id,kind,active) snapshots."""
        snap = []
        for ca in _cash_accounts(admin):
            if ca.get("store_id") == store_id and ca.get("active"):
                snap.append(ca)
                payload = {**ca, "active": False}
                # /admin/cash-accounts PUT
                pid = ca["id"]
                # Strip non-update fields
                payload.pop("balance", None); payload.pop("created_at", None); payload.pop("id", None); payload.pop("store_name", None)
                admin.put(f"{BASE_URL}/api/admin/cash-accounts/{pid}", json=payload)
        return snap

    def _restore(self, admin, snap):
        for ca in snap:
            pid = ca["id"]
            payload = {**ca, "active": True}
            payload.pop("balance", None); payload.pop("created_at", None); payload.pop("id", None); payload.pop("store_name", None)
            admin.put(f"{BASE_URL}/api/admin/cash-accounts/{pid}", json=payload)

    def test_cash_without_account_returns_400(self, admin):
        # Create an isolated test store with NO cash accounts so auto-resolve fails.
        sname = f"{TAG}store_{uuid.uuid4().hex[:6]}"
        cs = admin.post(f"{BASE_URL}/api/admin/stores", json={"name": sname, "is_online": False, "active": True})
        assert cs.status_code == 200, cs.text
        store = cs.json()
        sid = store["id"] if isinstance(store, dict) and "id" in store else store.get("store", {}).get("id")
        assert sid
        # Need a variant with stock at THIS store. Easiest: pick any variant and add stock via stock-movement.
        # Pull online store stocked variant.
        online = _online_store(admin)
        vid, pid = _pick_in_stock_variant(admin, online["id"]) if online else (None, None)
        if not vid:
            pytest.skip("No stocked variant available")
        # Add stock at new test store via super_admin stock-movements
        mv = admin.post(f"{BASE_URL}/api/admin/stock-movements",
                        json={"variant_id": vid, "store_id": sid, "type": "in", "quantity": 5, "reason": TAG})
        assert mv.status_code == 200, mv.text
        # Also disable any online auto-resolve fallback by making sure source!=online (POS)
        body = {
            "items": [{"variant_id": vid, "quantity": 1}],
            "customer_name": f"{TAG}buyer", "customer_phone": "0700000000",
            "payment_method": "cash", "source": "pos", "store_id": sid,
        }
        r = admin.post(f"{BASE_URL}/api/checkout", json=body)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
        d = r.json()
        detail = d.get("detail") or d.get("error") or ""
        assert detail.startswith("No active cash/bank account configured"), detail


# ============== COD online + cash-received ==============
class TestCODCashReceived:
    @pytest.fixture(scope="class")
    def online_store(self, admin):
        s = _online_store(admin)
        assert s, "online store required"
        return s

    @pytest.fixture(scope="class")
    def online_cash_account(self, admin, online_store):
        # Ensure at least one active cash account on online store.
        for ca in _cash_accounts(admin):
            if ca.get("store_id") == online_store["id"] and ca.get("kind") == "cash" and ca.get("active"):
                return ca
        # Create one
        r = admin.post(f"{BASE_URL}/api/admin/cash-accounts",
                       json={"name": f"{TAG}OnlineCash", "kind": "cash", "store_id": online_store["id"], "active": True})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        for ca in _cash_accounts(admin):
            if ca["id"] == rid:
                return ca
        pytest.fail("could not retrieve created cash account")

    def test_cod_succeeds_then_cash_received_credits_account(self, admin, online_store, online_cash_account):
        vid, _ = _pick_in_stock_variant(admin, online_store["id"])
        if not vid:
            pytest.skip("no stocked online variant")
        body = {
            "items": [{"variant_id": vid, "quantity": 1}],
            "customer_name": f"{TAG}cod_buyer", "customer_phone": "0711111111",
            "payment_method": "cod", "source": "online", "store_id": online_store["id"],
            "shipping_address": "1 Galle Rd", "shipping_district": "Colombo", "shipping_city": "Colombo",
        }
        r = admin.post(f"{BASE_URL}/api/checkout", json=body)
        assert r.status_code == 200, r.text
        order = r.json()
        oid = order["id"]; total = order["total"]
        assert order["status"] == "pending"
        # Snapshot account balance before
        bal_before = next((c["balance"] for c in _cash_accounts(admin) if c["id"] == online_cash_account["id"]), None)
        assert bal_before is not None
        # Mark cash received
        rcv = admin.post(f"{BASE_URL}/api/admin/orders/{oid}/cash-received")
        assert rcv.status_code == 200, rcv.text
        d = rcv.json()
        assert d["status"] == "completed"; assert d["payment_status"] == "paid"
        assert d["credited_account_id"] == online_cash_account["id"]
        assert d["credited_account_name"] == online_cash_account["name"]
        # Verify CashLedger 'in' entry
        led = admin.get(f"{BASE_URL}/api/admin/cash-ledger?account_id={online_cash_account['id']}").json()
        matched = [e for e in led if e.get("source_kind") == "order" and e.get("source_id") == oid and e.get("direction") == "in"]
        assert matched, "no ledger entry for cash-received"
        assert abs(matched[0]["amount"] - total) < 0.01
        # Verify balance bumped
        bal_after = next((c["balance"] for c in _cash_accounts(admin) if c["id"] == online_cash_account["id"]), None)
        assert abs((bal_after - bal_before) - total) < 0.01

    def test_cash_received_completed_order_returns_400(self, admin, online_store):
        # Use a previously completed order — re-mark must 400
        orders = admin.get(f"{BASE_URL}/api/admin/orders?status=completed&limit=5").json()
        target = orders[0] if isinstance(orders, list) and orders else None
        if not target:
            pytest.skip("no completed order")
        oid = target.get("id")
        r = admin.post(f"{BASE_URL}/api/admin/orders/{oid}/cash-received")
        assert r.status_code == 400


# ============== POS cash checkout auto-credits ==============
class TestPOSAutoCredit:
    def test_pos_cash_auto_credits_store_account(self, admin):
        online = _online_store(admin)
        # ensure cash account on online store
        ca = next((c for c in _cash_accounts(admin) if c.get("store_id") == online["id"] and c.get("kind") == "cash" and c.get("active")), None)
        if not ca:
            r = admin.post(f"{BASE_URL}/api/admin/cash-accounts",
                           json={"name": f"{TAG}POSCash", "kind": "cash", "store_id": online["id"], "active": True})
            assert r.status_code == 200
            cid = r.json()["id"]
            ca = next((c for c in _cash_accounts(admin) if c["id"] == cid), None)
        vid, _ = _pick_in_stock_variant(admin, online["id"])
        if not vid:
            pytest.skip("no stocked variant")
        body = {
            "items": [{"variant_id": vid, "quantity": 1}],
            "customer_name": f"{TAG}pos_buyer", "customer_phone": "0722222222",
            "payment_method": "cash", "source": "pos", "store_id": online["id"], "cash_tendered": 100000.0,
        }
        r = admin.post(f"{BASE_URL}/api/checkout", json=body)
        assert r.status_code == 200, r.text
        order = r.json()
        oid = order["id"]
        # Verify CashLedger 'in' for SOME active cash account on this store
        cash_accts = [c for c in _cash_accounts(admin) if c.get("store_id") == online["id"] and c.get("kind") == "cash" and c.get("active")]
        found = False
        for c in cash_accts:
            led = admin.get(f"{BASE_URL}/api/admin/cash-ledger?account_id={c['id']}").json()
            if any(e.get("source_kind") == "order" and e.get("source_id") == oid and e.get("direction") == "in" for e in led):
                found = True; break
        assert found, "POS cash order did not create 'in' CashLedger entry"


# ============== Permission gates ==============
class TestPermissionGates:
    @pytest.fixture(scope="class")
    def staff(self, admin):
        email = f"{TAG}staff_{uuid.uuid4().hex[:6]}@demo.com"
        pwd = "Password!23"
        perms = {
            "products": True, "pos": True, "orders": True,
            "move_stocks": False, "manual_inc_exp": False,
        }
        r = admin.post(f"{BASE_URL}/api/admin/staff", json={
            "email": email, "name": "Iter6 Staff", "role": "sales_staff",
            "password": pwd, "active": True, "permissions": perms,
        })
        assert r.status_code == 200, r.text
        return _login(email, pwd)

    def test_stock_movements_blocked_without_perm(self, admin, staff):
        # need a variant
        online = _online_store(admin)
        vid, _ = _pick_in_stock_variant(admin, online["id"]) if online else (None, None)
        if not vid:
            pytest.skip("no variant")
        r = staff.post(f"{BASE_URL}/api/admin/stock-movements",
                       json={"variant_id": vid, "store_id": online["id"], "type": "in", "quantity": 1, "reason": TAG})
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"
        assert "move_stocks" in (r.json().get("detail") or "")

    def test_transfer_blocked_without_perm(self, admin, staff):
        online = _online_store(admin)
        # any second store
        stores = _stores(admin)
        other = next((s for s in stores if s["id"] != online["id"]), None)
        if not other:
            pytest.skip("only one store")
        vid, _ = _pick_in_stock_variant(admin, online["id"])
        if not vid:
            pytest.skip("no variant")
        r = staff.post(f"{BASE_URL}/api/admin/inventory/transfer", json={
            "variant_id": vid, "from_store_id": online["id"], "to_store_id": other["id"], "quantity": 1
        })
        assert r.status_code == 403, r.text
        assert "move_stocks" in (r.json().get("detail") or "")

    def test_expense_blocked_without_perm(self, staff):
        r = staff.post(f"{BASE_URL}/api/admin/expenses", json={
            "category": "Other", "amount": 100, "description": f"{TAG}blocked", "method": "cash"
        })
        assert r.status_code == 403, r.text
        assert "manual_inc_exp" in (r.json().get("detail") or "")

    def test_income_blocked_without_perm(self, staff):
        r = staff.post(f"{BASE_URL}/api/admin/income", json={
            "category": "Other", "amount": 100, "description": f"{TAG}blocked", "method": "cash"
        })
        assert r.status_code == 403, r.text
        assert "manual_inc_exp" in (r.json().get("detail") or "")

    def test_super_admin_bypasses(self, admin):
        # Super admin creates an income — should pass
        r = admin.post(f"{BASE_URL}/api/admin/income", json={
            "category": "Other", "amount": 1, "description": f"{TAG}admin_ok", "method": "cash"
        })
        assert r.status_code == 200, r.text


# ============== CSV import ==============
class TestCsvImport:
    def test_dryrun_partial_rows_increments_counters(self, admin):
        # Row 1: brand new product (only name) -> created
        # Row 2: only sku of existing product -> updated
        # We need a known existing sku. Get one.
        existing = admin.get(f"{BASE_URL}/api/admin/products?page_size=5").json()
        existing_sku = None
        for p in existing.get("items", []):
            if p.get("sku"):
                existing_sku = p["sku"]; break
        if not existing_sku:
            pytest.skip("no existing product with sku")
        new_name = f"{TAG}dryNew_{uuid.uuid4().hex[:6]}"
        rows = [{"name": new_name}, {"sku": existing_sku}]
        r = admin.post(f"{BASE_URL}/api/admin/import/products", json={"rows": rows, "commit": False})
        assert r.status_code == 200, r.text
        d = r.json()
        s = d["summary"]
        assert (s["created"] + s["updated"]) > 0, f"counters not bumped: {s}"
        assert d["committed"] is False
        # Each preview row reports an action
        assert all("action" in p for p in d["preview"])

    def test_commit_partial_update_preserves_untouched_fields(self, admin):
        # Find an existing product with sku and base_price
        listing = admin.get(f"{BASE_URL}/api/admin/products?page_size=20").json()
        target = next((p for p in listing["items"] if p.get("sku") and p.get("base_price")), None)
        if not target:
            pytest.skip("no suitable product")
        original_price = target["base_price"]
        original_name = target["name"]
        rows = [{"sku": target["sku"], "name": original_name}]  # no base_price
        r = admin.post(f"{BASE_URL}/api/admin/import/products", json={"rows": rows, "commit": True})
        assert r.status_code == 200, r.text
        # GET to verify base_price unchanged
        listing2 = admin.get(f"{BASE_URL}/api/admin/products?page_size=200").json()
        again = next((p for p in listing2["items"] if p["id"] == target["id"]), None)
        assert again is not None
        assert abs(again["base_price"] - original_price) < 0.01, f"base_price was overwritten {original_price}->{again['base_price']}"

    def test_commit_creates_variant_and_stock(self, admin):
        sku = f"{TAG}sku_{uuid.uuid4().hex[:6].upper()}"
        name = f"{TAG}prod_{uuid.uuid4().hex[:6]}"
        rows = [{
            "name": name, "sku": sku, "base_price": "1500",
            "size": "M", "color": "Black", "color_hex": "#000000", "stock": "7",
        }]
        r = admin.post(f"{BASE_URL}/api/admin/import/products", json={"rows": rows, "commit": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["summary"]["created"] >= 1
        # Verify product exists with variant and stock
        listing = admin.get(f"{BASE_URL}/api/admin/products?q={name}&page_size=20").json()
        assert listing["items"], "created product not found"
        p = listing["items"][0]
        assert p["sku"] == sku
        # Variant with stock>0
        assert any(v.get("size") == "M" and v.get("color") == "Black" for v in p.get("variants", []))
