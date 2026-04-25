"""
Backend tests for Page Builder (iteration 2).
Covers: /api/page/{page}, /api/theme, /api/admin/page/*, /api/admin/theme,
/api/admin/media, /api/media/{id}, reorder and visibility behaviour.
Also smoke-checks that prior-iteration endpoints (products, dashboard, checkout) still work.
"""
import os
import base64
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://polo-shop-2.preview.emergentagent.com").rstrip("/")
ADMIN_TOKEN = "test_session_abc"
HEADERS_ADMIN = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"}

# 1x1 transparent PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# ---- Public endpoints ----

def test_public_get_theme():
    r = requests.get(f"{BASE_URL}/api/theme")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)


def test_public_get_page_home_returns_sections_and_theme():
    r = requests.get(f"{BASE_URL}/api/page/home")
    assert r.status_code == 200
    data = r.json()
    assert "sections" in data and "theme" in data
    assert isinstance(data["sections"], list)
    assert isinstance(data["theme"], dict)
    # default sections seeded: hero, featured, brand, story, reviews, custom
    types = {s["section_type"] for s in data["sections"]}
    expected = {"hero", "featured", "brand", "story", "reviews", "custom"}
    missing = expected - types
    assert not missing, f"Missing default sections: {missing}. Got: {types}"
    # all returned should be visible=True
    for s in data["sections"]:
        assert s["visible"] is True
        assert "config" in s and isinstance(s["config"], dict)
    # order is ascending sort_order
    orders = [s["sort_order"] for s in data["sections"]]
    assert orders == sorted(orders), f"Sections not ordered: {orders}"


# ---- Admin auth checks ----

def test_admin_page_home_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/page/home")
    assert r.status_code == 401


def test_admin_page_home_with_auth():
    r = requests.get(f"{BASE_URL}/api/admin/page/home", headers=HEADERS_ADMIN)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "sections" in data
    # admin view includes hidden sections too
    assert len(data["sections"]) >= 6


def test_admin_theme_update_requires_auth():
    r = requests.put(f"{BASE_URL}/api/admin/theme", json={"config": {"primary": "#111"}})
    assert r.status_code == 401


def test_admin_media_upload_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/media", json={"data_base64": TINY_PNG_B64, "mime_type": "image/png"})
    assert r.status_code == 401


# ---- CRUD flow: create section -> update -> visibility -> reorder -> delete ----

def test_section_full_lifecycle():
    # Create a custom section
    payload = {
        "section_type": "custom",
        "sort_order": 0,  # endpoint auto-places at end
        "visible": True,
        "config": {"title": "TEST_Section", "body": "hello"},
    }
    r = requests.post(f"{BASE_URL}/api/admin/page/home/sections", json=payload, headers=HEADERS_ADMIN)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["section_type"] == "custom"
    assert s["config"]["title"] == "TEST_Section"
    assert s["visible"] is True
    sid = s["id"]
    pytest.test_section_id = sid

    # Verify public page shows it
    pub = requests.get(f"{BASE_URL}/api/page/home").json()
    assert any(x["id"] == sid for x in pub["sections"]), "Newly created section not visible publicly"

    # Update config + visibility
    up = {"visible": False, "config": {"title": "TEST_Section_Updated", "body": "hi"}}
    r = requests.put(f"{BASE_URL}/api/admin/page/sections/{sid}", json=up, headers=HEADERS_ADMIN)
    assert r.status_code == 200, r.text
    assert r.json()["visible"] is False
    assert r.json()["config"]["title"] == "TEST_Section_Updated"

    # Public should no longer include this section (hidden)
    pub2 = requests.get(f"{BASE_URL}/api/page/home").json()
    assert not any(x["id"] == sid for x in pub2["sections"]), "Hidden section leaked to public"

    # Admin view still shows it
    admin_view = requests.get(f"{BASE_URL}/api/admin/page/home", headers=HEADERS_ADMIN).json()
    assert any(x["id"] == sid for x in admin_view["sections"])

    # Re-enable for reorder test
    r = requests.put(f"{BASE_URL}/api/admin/page/sections/{sid}", json={"visible": True}, headers=HEADERS_ADMIN)
    assert r.status_code == 200


def test_reorder_sections_by_ids():
    # Get admin section list
    admin = requests.get(f"{BASE_URL}/api/admin/page/home", headers=HEADERS_ADMIN).json()
    ids = [s["id"] for s in admin["sections"]]
    assert len(ids) >= 2
    # Reverse order
    new_order = list(reversed(ids))
    r = requests.post(
        f"{BASE_URL}/api/admin/page/home/reorder",
        json={"ids": new_order},
        headers=HEADERS_ADMIN,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # Verify admin list order reflects new order (only among reordered ids)
    admin2 = requests.get(f"{BASE_URL}/api/admin/page/home", headers=HEADERS_ADMIN).json()
    new_ids_sorted = [s["id"] for s in admin2["sections"]]
    # The first N should match new_order where they exist
    assert new_ids_sorted[: len(new_order)] == new_order, (
        f"Expected {new_order}, got {new_ids_sorted[: len(new_order)]}"
    )

    # Restore original order to keep seed intact
    r = requests.post(
        f"{BASE_URL}/api/admin/page/home/reorder",
        json={"ids": ids},
        headers=HEADERS_ADMIN,
    )
    assert r.status_code == 200


def test_delete_test_section():
    sid = getattr(pytest, "test_section_id", None)
    assert sid
    r = requests.delete(f"{BASE_URL}/api/admin/page/sections/{sid}", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    # 404 after delete
    r = requests.put(f"{BASE_URL}/api/admin/page/sections/{sid}", json={"visible": False}, headers=HEADERS_ADMIN)
    assert r.status_code == 404


# ---- Theme ----

def test_theme_update_and_reflect():
    original = requests.get(f"{BASE_URL}/api/theme").json()
    new_cfg = dict(original) if isinstance(original, dict) else {}
    marker = f"#{uuid.uuid4().hex[:6]}"
    new_cfg["primary"] = marker
    new_cfg["marquee_phrases"] = ["TEST_PHRASE_A", "TEST_PHRASE_B"]

    r = requests.put(f"{BASE_URL}/api/admin/theme", json={"config": new_cfg}, headers=HEADERS_ADMIN)
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["primary"] == marker
    assert saved["marquee_phrases"] == ["TEST_PHRASE_A", "TEST_PHRASE_B"]

    # Public reflects
    pub = requests.get(f"{BASE_URL}/api/theme").json()
    assert pub["primary"] == marker
    assert pub["marquee_phrases"] == ["TEST_PHRASE_A", "TEST_PHRASE_B"]

    # Reflected inside /page/home too
    home = requests.get(f"{BASE_URL}/api/page/home").json()
    assert home["theme"]["primary"] == marker

    # Restore original theme (best-effort)
    if isinstance(original, dict) and original:
        requests.put(f"{BASE_URL}/api/admin/theme", json={"config": original}, headers=HEADERS_ADMIN)


# ---- Media ----

def test_media_upload_and_fetch():
    r = requests.post(
        f"{BASE_URL}/api/admin/media",
        json={"data_base64": TINY_PNG_B64, "mime_type": "image/png", "filename": "TEST_tiny.png"},
        headers=HEADERS_ADMIN,
    )
    assert r.status_code == 200, r.text
    m = r.json()
    assert "id" in m and "url" in m
    assert m["mime_type"] == "image/png"
    assert m["url"].startswith("/api/media/")
    mid = m["id"]
    pytest.test_media_id = mid

    # Fetch binary
    r = requests.get(f"{BASE_URL}/api/media/{mid}")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")
    cc = r.headers.get("cache-control", "")
    # NOTE: preview Cloudflare proxy may override Cache-Control to no-store. Backend sets it correctly.
    assert cc, "Cache-Control header should be present"
    # Bytes match decoded png
    assert r.content == base64.b64decode(TINY_PNG_B64)


def test_media_fetch_404():
    r = requests.get(f"{BASE_URL}/api/media/does_not_exist_xyz")
    assert r.status_code == 404


def test_delete_test_media():
    mid = getattr(pytest, "test_media_id", None)
    if mid:
        r = requests.delete(f"{BASE_URL}/api/admin/media/{mid}", headers=HEADERS_ADMIN)
        assert r.status_code == 200


# ---- Regression: prior endpoints still work ----

def test_regression_products_still_list_with_images():
    r = requests.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    products = r.json()
    assert len(products) >= 1
    for p in products:
        assert isinstance(p.get("images"), list)


def test_regression_admin_dashboard():
    r = requests.get(f"{BASE_URL}/api/admin/dashboard", headers=HEADERS_ADMIN)
    assert r.status_code == 200
    for key in ("total_revenue", "total_orders", "customer_count", "low_stock_count"):
        assert key in r.json()


def test_regression_guest_checkout():
    products = requests.get(f"{BASE_URL}/api/products").json()
    variant_id = None
    for p in products:
        detail = requests.get(f"{BASE_URL}/api/products/{p['slug']}").json()
        for v in detail["variants"]:
            if v["stock"] >= 2:
                variant_id = v["id"]
                break
        if variant_id:
            break
    if not variant_id:
        pytest.skip("no variant in stock")
    r = requests.post(
        f"{BASE_URL}/api/checkout",
        json={
            "customer_name": "TEST_Regression",
            "customer_email": "TEST_regression@example.com",
            "shipping_address": "TEST 1 St",
            "items": [{"variant_id": variant_id, "quantity": 1}],
            "payment_method": "mock",
            "source": "online",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"
