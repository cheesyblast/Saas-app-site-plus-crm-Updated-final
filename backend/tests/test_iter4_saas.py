"""
Iteration 4 backend tests — SaaS feature batch:
- Categories tree + descendants product filter
- Pagination shape on /admin/products, /orders, /inventory, /coupons, /expenses
- Payment lifecycle: card_pos auto-completed, cod pending, cash-received endpoint, completed lock
- Dashboard total_revenue counts paid only
- Theme PUT/GET round-trip with new keys
"""
import os
import time
import pytest
import requests

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
assert BASE_URL, "REACT_APP_BACKEND_URL is required"
ADMIN_EMAIL = "admin@demo.com"
ADMIN_PASSWORD = "demo12345"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def category_tree(admin_client):
    """Create TEST_Parent + TEST_Child sub-category. Yields (parent, child)."""
    parent = admin_client.post(f"{BASE_URL}/api/admin/categories",
                               json={"name": f"TEST_ParentCat_{int(time.time())}"}).json()
    child = admin_client.post(f"{BASE_URL}/api/admin/categories",
                              json={"name": f"TEST_ChildCat_{int(time.time())}",
                                    "parent_id": parent["id"]}).json()
    yield parent, child
    # cleanup
    admin_client.delete(f"{BASE_URL}/api/admin/categories/{child['id']}")
    admin_client.delete(f"{BASE_URL}/api/admin/categories/{parent['id']}")


@pytest.fixture(scope="session")
def child_product(admin_client, category_tree):
    """Create one product attached to the child category, with a stocked variant."""
    parent, child = category_tree
    payload = {
        "name": f"TEST_Prod_{int(time.time())}",
        "base_price": 1000.0,
        "category_id": child["id"],
        "status": "active",
        "variants": [{"size": "M", "color": "Red", "color_hex": "#ff0000", "stock": 5}],
    }
    p = admin_client.post(f"{BASE_URL}/api/admin/products", json=payload).json()
    yield p
    admin_client.delete(f"{BASE_URL}/api/admin/products/{p['id']}")


# ---------- Categories ----------
class TestCategoriesTree:
    def test_tree_returns_nested(self, admin_client, category_tree):
        parent, child = category_tree
        r = requests.get(f"{BASE_URL}/api/categories?tree=true")
        assert r.status_code == 200
        tree = r.json()
        assert isinstance(tree, list)
        node = next((n for n in tree if n["id"] == parent["id"]), None)
        assert node is not None, "Parent category not in tree response"
        child_ids = [c["id"] for c in node.get("children", [])]
        assert child["id"] in child_ids, "Child not nested under parent"

    def test_create_subcategory_with_parent(self, admin_client, category_tree):
        parent, child = category_tree
        assert child["parent_id"] == parent["id"]

    def test_put_can_move_parent(self, admin_client, category_tree):
        parent, child = category_tree
        # Move child to root (parent_id=None) then put back
        r = admin_client.put(f"{BASE_URL}/api/admin/categories/{child['id']}",
                             json={"name": child["name"], "parent_id": None})
        assert r.status_code == 200
        assert r.json()["parent_id"] in (None, "")
        # restore
        r2 = admin_client.put(f"{BASE_URL}/api/admin/categories/{child['id']}",
                              json={"name": child["name"], "parent_id": parent["id"]})
        assert r2.status_code == 200
        assert r2.json()["parent_id"] == parent["id"]


class TestProductsByParentSlug:
    def test_parent_slug_returns_descendant_products(self, admin_client, category_tree, child_product):
        parent, child = category_tree
        # request products by PARENT slug — must return product attached to CHILD
        r = requests.get(f"{BASE_URL}/api/products", params={"category": parent["slug"]})
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert child_product["id"] in ids, \
            f"Parent-slug query should include child-cat product. got={ids}"


# ---------- Pagination shape ----------
class TestPaginationShape:
    @pytest.mark.parametrize("path", [
        "/api/admin/products",
        "/api/admin/orders",
        "/api/admin/inventory",
        "/api/admin/coupons",
        "/api/admin/expenses",
    ])
    def test_pagination_shape(self, admin_client, path):
        r = admin_client.get(f"{BASE_URL}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
        body = r.json()
        assert isinstance(body, dict), f"{path} returned non-dict: {type(body)}"
        for key in ("items", "total", "page", "page_size"):
            assert key in body, f"{path} missing key {key}: {list(body.keys())}"
        assert body["page"] == 1
        assert body["page_size"] == 50, f"{path} default page_size != 50 (got {body['page_size']})"
        assert isinstance(body["items"], list)

    def test_orders_recent_first(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/orders")
        items = r.json()["items"]
        if len(items) >= 2:
            assert items[0]["created_at"] >= items[1]["created_at"]

    def test_page_param_works(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/orders?page=2")
        assert r.status_code == 200
        assert r.json()["page"] == 2


# ---------- Checkout payment lifecycle ----------
def _checkout_payload(method, prod, variant_id):
    return {
        "items": [{"variant_id": variant_id, "quantity": 1}],
        "customer_name": "TEST Lifecycle",
        "customer_email": "tl@example.com",
        "customer_phone": "+94770000000",
        "shipping_address": "1 Test Rd",
        "shipping_district": "Colombo",
        "shipping_city": "Colombo 03",
        "payment_method": method,
        "source": "online",
    }


class TestPaymentLifecycle:
    def test_card_pos_instant_completed(self, admin_client, child_product):
        v_id = child_product["variants"][0]["id"]
        r = requests.post(f"{BASE_URL}/api/checkout",
                          json=_checkout_payload("card_pos", child_product, v_id))
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["payment_status"] == "paid"
        assert o["status"] == "completed"

    def test_cod_pending(self, admin_client, child_product):
        v_id = child_product["variants"][0]["id"]
        r = requests.post(f"{BASE_URL}/api/checkout",
                          json=_checkout_payload("cod", child_product, v_id))
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["payment_status"] == "pending"
        assert o["status"] == "pending"

    def test_completed_status_locked(self, admin_client, child_product):
        # create a card_pos completed order then try changing status
        v_id = child_product["variants"][0]["id"]
        o = requests.post(f"{BASE_URL}/api/checkout",
                          json=_checkout_payload("card_pos", child_product, v_id)).json()
        r = admin_client.put(f"{BASE_URL}/api/admin/orders/{o['id']}/status",
                             json={"status": "shipped"})
        assert r.status_code == 400, f"Expected lock, got {r.status_code} {r.text}"

    def test_cash_received_flow(self, admin_client, child_product):
        v_id = child_product["variants"][0]["id"]
        o = requests.post(f"{BASE_URL}/api/checkout",
                          json=_checkout_payload("cod", child_product, v_id)).json()
        assert o["payment_status"] == "pending" and o["status"] == "pending"
        # mark cash received
        r = admin_client.post(f"{BASE_URL}/api/admin/orders/{o['id']}/cash-received")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["payment_status"] == "paid"
        assert body["status"] == "completed"
        # second call must 400
        r2 = admin_client.post(f"{BASE_URL}/api/admin/orders/{o['id']}/cash-received")
        assert r2.status_code == 400, f"Second cash-received should fail, got {r2.status_code}"


# ---------- Dashboard ----------
class TestDashboardRevenue:
    def test_total_revenue_paid_only(self, admin_client, child_product):
        # Snapshot baseline
        base = admin_client.get(f"{BASE_URL}/api/admin/dashboard").json()
        baseline = base["total_revenue"]
        # Create a COD pending order (should NOT increment revenue)
        v_id = child_product["variants"][0]["id"]
        o = requests.post(f"{BASE_URL}/api/checkout",
                          json=_checkout_payload("cod", child_product, v_id)).json()
        mid = admin_client.get(f"{BASE_URL}/api/admin/dashboard").json()
        # COD pending should NOT have moved revenue
        assert mid["total_revenue"] == baseline, \
            f"COD pending bumped revenue {baseline} -> {mid['total_revenue']}"
        # Mark cash received
        admin_client.post(f"{BASE_URL}/api/admin/orders/{o['id']}/cash-received")
        post = admin_client.get(f"{BASE_URL}/api/admin/dashboard").json()
        assert post["total_revenue"] > baseline, \
            f"After cash-received revenue did not increase: {baseline} -> {post['total_revenue']}"


# ---------- Theme ----------
class TestThemeRoundTrip:
    def test_put_get_new_keys(self, admin_client):
        cur = requests.get(f"{BASE_URL}/api/theme").json()
        new_cfg = dict(cur)
        new_cfg.update({
            "text_color": "#EEEEEE",
            "font_eyebrow": "'Space Grotesk', sans-serif",
            "font_heading": "'Archivo Black', sans-serif",
            "font_body": "'Inter', sans-serif",
            "heading_scale": 1.25,
            "line_height": 1.6,
        })
        r = admin_client.put(f"{BASE_URL}/api/admin/theme", json={"config": new_cfg})
        assert r.status_code == 200, r.text
        out = r.json()
        for k in ("text_color", "font_eyebrow", "font_heading", "font_body",
                  "heading_scale", "line_height"):
            assert out.get(k) == new_cfg[k], f"theme key {k} not persisted: {out.get(k)}"
        # round-trip via GET
        g = requests.get(f"{BASE_URL}/api/theme").json()
        assert g["heading_scale"] == 1.25
        assert g["line_height"] == 1.6
        assert g["text_color"] == "#EEEEEE"
