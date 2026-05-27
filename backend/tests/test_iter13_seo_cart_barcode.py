"""Iteration 13 — SEO, prebuilt templates, cart-abandonment, header/footer/receipt
settings, barcode/POS, image upload guards, PayHere regression, bulk-send counters."""
import os
import uuid
import hashlib
import pytest
import requests

# Use the public preview URL (REACT_APP_BACKEND_URL); same value works from inside
# the cluster because the Nginx ingress routes /api to backend on :8001.
BASE = (
    os.environ.get("TEST_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@demo.com")
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASS", "demo12345")


# ---------- Auth fixture ----------
@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {r.json()['token']}",
        "Content-Type": "application/json",
    })
    return s


# =========================================================================
# 1. SEO — sitemap + robots
# =========================================================================
class TestSEO:
    def test_sitemap_xml(self):
        r = requests.get(f"{API}/sitemap.xml", timeout=90)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "xml" in ct.lower(), ct
        body = r.text
        assert body.startswith("<?xml"), body[:80]
        assert "<urlset" in body
        assert "<loc>" in body
        # Should always include the homepage static route
        assert "</urlset>" in body

    def test_robots_txt(self):
        r = requests.get(f"{API}/robots.txt", timeout=15)
        assert r.status_code == 200, r.text
        assert "text/plain" in r.headers.get("content-type", "")
        body = r.text
        assert "User-agent: *" in body
        assert "Sitemap:" in body
        assert "/sitemap.xml" in body


# =========================================================================
# 2. Prebuilt notification templates library
# =========================================================================
class TestTemplatesLibrary:
    def test_install_is_idempotent(self, admin):
        # First call may install or skip depending on prior state.
        r1 = admin.post(f"{API}/admin/templates-library/install", timeout=30)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["ok"] is True
        assert "installed" in d1 and "skipped" in d1
        total = d1.get("total_in_library")
        assert isinstance(total, int) and total >= 1
        # Second call MUST be a no-op (everything already installed)
        r2 = admin.post(f"{API}/admin/templates-library/install", timeout=30)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["installed"] == 0
        assert d2["skipped"] == total

    def test_library_listing_marks_installed(self, admin):
        # Ensure installed
        admin.post(f"{API}/admin/templates-library/install", timeout=30)
        r = admin.get(f"{API}/admin/templates-library", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # After install every entry must show installed=true
        assert all(t["installed"] is True for t in data), [t for t in data if not t["installed"]]


# =========================================================================
# 3. Cart abandonment recovery
# =========================================================================
class TestCartRecovery:
    def test_cart_sync_no_contact_skips(self):
        r = requests.post(f"{API}/cart/sync", json={"items": []}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("id") is None
        assert "no contact" in (d.get("skipped") or "").lower() or "empty" in (d.get("skipped") or "").lower()

    def test_cart_sync_creates_session_and_upserts(self, admin):
        email = f"TEST_iter13_{uuid.uuid4().hex[:6]}@example.com"
        payload = {
            "customer_email": email,
            "customer_name": "Iter13 Tester",
            "items": [{"variant_id": "v-test", "quantity": 2, "name": "Shirt", "price": 1500}],
            "estimated_total": 3000,
        }
        r1 = requests.post(f"{API}/cart/sync", json=payload, timeout=15)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["ok"] is True
        assert d1.get("id"), d1
        sid = d1["id"]
        # Second sync for the same email must return the same id (upsert)
        r2 = requests.post(f"{API}/cart/sync", json=payload, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["id"] == sid, f"Expected upsert; got new id {r2.json()['id']}"
        # Admin can list it under 'open'
        rl = admin.get(f"{API}/admin/cart-sessions?state=open", timeout=15)
        assert rl.status_code == 200, rl.text
        rows = rl.json()
        assert any(r.get("id") == sid for r in rows), \
            f"Created session {sid} not in open list"

    def test_run_worker_returns_counters(self, admin):
        # Enable cart recovery so the worker actually iterates
        admin.put(f"{API}/admin/company",
                  json={"cart_recovery_enabled": True,
                        "cart_recovery_after_min": 60,
                        "cart_recovery_channels": "email,sms"}, timeout=15)
        r = admin.post(f"{API}/admin/cart-sessions/run-worker", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        # Must expose checked + sent_email + sent_sms + skipped keys
        for k in ("checked", "sent_email", "sent_sms", "skipped"):
            assert k in d, f"missing key {k} in run-worker response: {d}"
        # restore default off
        admin.put(f"{API}/admin/company", json={"cart_recovery_enabled": False}, timeout=15)


# =========================================================================
# 4. Company settings — new layout / receipt / cart fields persist
# =========================================================================
class TestCompanyNewFields:
    NEW_FIELDS = {
        "header_layout": "centered",
        "header_bg_color": "#101010",
        "footer_layout": "minimal",
        "receipt_size": "58mm",
        "receipt_header_text": "Thank you for shopping",
        "cart_recovery_enabled": True,
        "cart_recovery_after_min": 90,
        "cart_recovery_channels": "email",
    }

    def test_put_then_get_round_trip(self, admin):
        r = admin.put(f"{API}/admin/company", json=self.NEW_FIELDS, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k, v in self.NEW_FIELDS.items():
            assert d.get(k) == v, f"PUT response missing/wrong key {k}: got {d.get(k)}"
        # Public GET /api/company must also expose them
        rg = requests.get(f"{API}/company", timeout=15)
        assert rg.status_code == 200, rg.text
        g = rg.json()
        for k, v in self.NEW_FIELDS.items():
            assert g.get(k) == v, f"GET /api/company missing/wrong key {k}: got {g.get(k)}"
        # Reset (so cart-recovery worker doesn't keep firing for other tests)
        admin.put(f"{API}/admin/company",
                  json={"header_layout": "classic", "footer_layout": "columns",
                        "receipt_size": "80mm", "cart_recovery_enabled": False}, timeout=15)


# =========================================================================
# 5. Variant.barcode + barcode lookup + labels
# =========================================================================
@pytest.fixture(scope="module")
def sample_product(admin):
    """Create a fresh product with one variant carrying a known barcode."""
    barcode = f"TEST{uuid.uuid4().hex[:10].upper()}"
    payload = {
        "name": f"TEST_iter13_barcode_{uuid.uuid4().hex[:6]}",
        "slug": f"test-iter13-{uuid.uuid4().hex[:6]}",
        "base_price": 1234,
        "status": "active",
        "variants": [{"size": "M", "color": "Blue", "color_hex": "#0000ff",
                      "sku": f"SKU-{uuid.uuid4().hex[:6]}", "barcode": barcode, "stock": 5}],
    }
    r = admin.post(f"{API}/admin/products", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    yield {"id": pid, "barcode": barcode}
    # cleanup
    try:
        admin.delete(f"{API}/admin/products/{pid}", timeout=15)
    except Exception:
        pass


class TestBarcode:
    def test_variant_barcode_roundtrips_in_product_detail(self, admin, sample_product):
        # Admin list endpoint returns variants including the barcode field.
        r = admin.get(f"{API}/admin/products?q=TEST_iter13_barcode&limit=10", timeout=20)
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        prod = next((p for p in items if p["id"] == sample_product["id"]), None)
        assert prod, f"created product not found in /admin/products list"
        variants = prod.get("variants") or []
        assert variants, "Product has no variants"
        bcs = [v.get("barcode") for v in variants]
        assert sample_product["barcode"] in bcs, f"barcode missing from variant detail: {bcs}"

    def test_lookup_known_barcode(self, admin, sample_product):
        r = admin.get(f"{API}/admin/barcode/lookup/{sample_product['barcode']}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["barcode"] == sample_product["barcode"]
        assert d["product_id"] == sample_product["id"]
        assert "variant_id" in d and "price" in d

    def test_lookup_unknown_barcode_404(self, admin):
        r = admin.get(f"{API}/admin/barcode/lookup/NOPENOPE_{uuid.uuid4().hex[:8]}", timeout=15)
        assert r.status_code == 404

    def test_lookup_falls_back_to_sku(self, admin, sample_product):
        # Find the SKU of the seeded variant via admin list
        items = admin.get(f"{API}/admin/products?q=TEST_iter13_barcode&limit=10", timeout=20).json().get("items", [])
        prod = next((p for p in items if p["id"] == sample_product["id"]), None)
        assert prod, "created product not found"
        sku = prod["variants"][0]["sku"]
        r = admin.get(f"{API}/admin/barcode/lookup/{sku}", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("sku") == sku

    def test_labels_endpoint(self, admin, sample_product):
        r = admin.get(f"{API}/admin/barcode/labels", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        sample = rows[0]
        for k in ("variant_id", "product_name", "barcode", "price"):
            assert k in sample, f"label row missing {k}: {sample}"
        # Our seeded barcode must appear
        assert any(row.get("barcode") == sample_product["barcode"] for row in rows)


# =========================================================================
# 6. Image upload size guards
# =========================================================================
class TestImageUploadGuards:
    def test_product_image_too_large_413(self, admin, sample_product):
        big = "A" * (4 * 1024 * 1024 + 100)  # > 4MB base64 chars
        r = admin.post(f"{API}/admin/products/{sample_product['id']}/images",
                       json={"data_base64": big, "mime_type": "image/png"}, timeout=60)
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"

    def test_product_image_small_ok(self, admin, sample_product):
        # 1x1 PNG base64
        tiny = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+AKjQugAAAABJRU5ErkJggg=="
        )
        r = admin.post(f"{API}/admin/products/{sample_product['id']}/images",
                       json={"data_base64": tiny, "mime_type": "image/png", "is_primary": True},
                       timeout=15)
        assert r.status_code == 200, r.text
        assert "id" in r.json()

    def test_media_too_large_413(self, admin):
        big = "B" * (5 * 1024 * 1024 + 100)
        r = admin.post(f"{API}/admin/media",
                       json={"data_base64": big, "mime_type": "image/png"}, timeout=60)
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"


# =========================================================================
# 7. PayHere — checkout regression + notify md5sig
# =========================================================================
class TestPayHere:
    @pytest.fixture(scope="class")
    def payhere_cfg(self, admin):
        # Find or upsert PayHere PaymentMethod with sandbox creds.
        merchant_id = "1212121"
        merchant_secret = "iter13-secret"
        r = admin.get(f"{API}/admin/payment-methods", timeout=15)
        if r.status_code != 200:
            pytest.skip("payment-methods endpoint unavailable")
        existing = next((p for p in r.json() if p.get("code") == "payhere"), None)
        body = {
            "code": "payhere",
            "label": "PayHere (Card / Bank)",
            "description": "Secure online payment via PayHere gateway.",
            "scope": "online",
            "active": True,
            "sort_order": 10,
            "config": {"merchant_id": merchant_id, "secret": merchant_secret, "sandbox": True},
        }
        if existing:
            rr = admin.put(f"{API}/admin/payment-methods/{existing['id']}", json=body, timeout=15)
        else:
            rr = admin.post(f"{API}/admin/payment-methods", json=body, timeout=15)
        assert rr.status_code in (200, 201), rr.text
        return {"merchant_id": merchant_id, "secret": merchant_secret}

    def test_checkout_returns_payhere_redirect(self, admin, sample_product, payhere_cfg):
        # Look up the seeded variant via admin list (no /admin/products/{id} GET exists)
        items = admin.get(f"{API}/admin/products?q=TEST_iter13_barcode&limit=10", timeout=20).json().get("items", [])
        prod = next((p for p in items if p["id"] == sample_product["id"]), None)
        assert prod, "created product not found"
        v = prod["variants"][0]
        order_payload = {
            "items": [{"variant_id": v["id"], "quantity": 1}],
            "customer_name": "Iter13 Buyer",
            "customer_email": "iter13buyer@example.com",
            "customer_phone": "+94770000000",
            "shipping_address": "1 Test St",
            "shipping_city": "Colombo",
            "payment_method": "payhere",
        }
        r = requests.post(f"{API}/checkout", json=order_payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "payhere_redirect" in d, f"expected payhere_redirect in: {d.keys()}"
        ph = d["payhere_redirect"]
        assert "endpoint" in ph and "fields" in ph and "payhere.lk" in ph["endpoint"]
        fields = ph["fields"]
        assert fields.get("merchant_id"), "merchant_id should not be empty"
        assert fields.get("hash"), "hash missing"
        assert fields.get("order_id"), "order_id missing"
        # Stash order_number for the notify test
        TestPayHere._last_order = {"order_number": fields["order_id"],
                                   "amount": fields["amount"],
                                   "currency": fields["currency"]}

    def test_notify_invalid_signature_400(self, payhere_cfg):
        ord_no = getattr(TestPayHere, "_last_order", {}).get("order_number")
        if not ord_no:
            pytest.skip("no prior order to notify against")
        form = {
            "merchant_id": payhere_cfg["merchant_id"],
            "order_id": ord_no,
            "payment_id": "TESTPAY1",
            "payhere_amount": TestPayHere._last_order["amount"],
            "payhere_currency": TestPayHere._last_order["currency"],
            "status_code": "2",
            "md5sig": "DEADBEEFDEADBEEFDEADBEEFDEADBEEF",
        }
        r = requests.post(f"{API}/payhere/notify", data=form, timeout=15)
        assert r.status_code == 400, f"expected 400 for bad sig, got {r.status_code}: {r.text[:200]}"

    def test_notify_valid_signature_flips_paid(self, admin, payhere_cfg):
        ord_no = getattr(TestPayHere, "_last_order", {}).get("order_number")
        if not ord_no:
            pytest.skip("no prior order to notify against")
        merchant_id = payhere_cfg["merchant_id"]
        secret = payhere_cfg["secret"]
        amount = TestPayHere._last_order["amount"]
        currency = TestPayHere._last_order["currency"]
        secret_md5 = hashlib.md5(secret.encode()).hexdigest().upper()
        raw = f"{merchant_id}{ord_no}{amount}{currency}2{secret_md5}"
        sig = hashlib.md5(raw.encode()).hexdigest().upper()
        form = {
            "merchant_id": merchant_id, "order_id": ord_no,
            "payment_id": "TESTPAY2", "payhere_amount": amount,
            "payhere_currency": currency, "status_code": "2", "md5sig": sig,
        }
        r = requests.post(f"{API}/payhere/notify", data=form, timeout=20)
        assert r.status_code == 200, r.text
        # Verify the order moved to paid
        # Use admin orders listing or detail
        r2 = admin.get(f"{API}/admin/orders?q={ord_no}", timeout=15)
        if r2.status_code == 200:
            arr = r2.json()
            # arr may be a list of orders or a dict containing orders
            rows = arr if isinstance(arr, list) else arr.get("items", [])
            hit = next((x for x in rows if x.get("order_number") == ord_no), None)
            if hit:
                assert hit.get("payment_status") == "paid", hit


# =========================================================================
# 8. Bulk-send returns sent/failed/skipped (not just queued)
# =========================================================================
class TestBulkSend:
    def test_bulk_send_response_shape(self, admin):
        payload = {
            "channel": "email", "subject": "TEST_iter13 subject",
            "body": "Hi {{first_name}}, TEST_iter13 body.",
            "customer_ids": [],
            # NOTE: default marketing_opt_in_only=True path 500s because
            # `Customer.marketing_opt_in` column does not exist on the model.
            # Reported as a backend bug — passing False so this test verifies
            # the response shape on the happy path.
            "marketing_opt_in_only": False,
        }
        r = admin.post(f"{API}/admin/marketing/bulk-send", json=payload, timeout=20)
        assert r.status_code in (200, 400), r.text
        if r.status_code == 200:
            d = r.json()
            for k in ("sent", "failed", "skipped"):
                assert k in d, f"missing key {k} in bulk-send response: {d}"

    def test_bulk_send_opt_in_filter_does_not_500(self, admin):
        """Regression for bug discovered in iter13: when marketing_opt_in_only is
        True (the default), the query references Customer.marketing_opt_in which
        is NOT a column on the Customer model → AttributeError → 500.
        """
        payload = {
            "channel": "email", "subject": "TEST", "body": "TEST",
            "customer_ids": [],
            "marketing_opt_in_only": True,
        }
        r = admin.post(f"{API}/admin/marketing/bulk-send", json=payload, timeout=20)
        assert r.status_code != 500, \
            ("BUG: Customer.marketing_opt_in column missing → bulk_send 500s "
             "when marketing_opt_in_only=True (default in UI). Response: "
             + r.text[:300])
