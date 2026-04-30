"""Iteration 11 — branding/auth/templates/bulk-send tests."""
import os, uuid, pytest, requests

BASE = os.environ.get("TEST_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"
ADMIN = (os.environ.get("TEST_ADMIN_EMAIL", "admin@demo.com"),
         os.environ.get("TEST_ADMIN_PASS", "demo12345"))


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=30)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


# ---------- Branding fields exposed ----------
def test_company_exposes_branding_fields():
    r = requests.get(f"{API}/company", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("auth_google_enabled", "auth_google_client_id",
              "header_logo_height", "footer_logo_height", "logo_display_mode"):
        assert k in d, f"missing key {k}"
    assert isinstance(d["header_logo_height"], int)
    assert d["logo_display_mode"] in ("auto", "fit-height", "fit-width")


def test_can_update_branding(admin):
    payload = {"header_logo_height": 56, "footer_logo_height": 72, "logo_display_mode": "fit-height"}
    r = admin.put(f"{API}/admin/company", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["header_logo_height"] == 56
    assert d["footer_logo_height"] == 72
    assert d["logo_display_mode"] == "fit-height"
    # restore defaults so other tests aren't affected
    admin.put(f"{API}/admin/company", json={"header_logo_height": 32, "footer_logo_height": 40, "logo_display_mode": "auto"}, timeout=15)


def test_google_auth_toggle(admin):
    # Initially expect either False or whatever was set; flip ON, verify, flip OFF
    r = admin.put(f"{API}/admin/company", json={"auth_google_enabled": True, "auth_google_client_id": "test-iter11.apps.googleusercontent.com", "auth_google_client_secret": "GOCSPX-iter11-secret"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["auth_google_enabled"] is True
    assert d["auth_google_client_id"] == "test-iter11.apps.googleusercontent.com"
    assert "auth_google_client_secret" not in d, "secret must NOT be echoed back"
    # flip off
    admin.put(f"{API}/admin/company", json={"auth_google_enabled": False}, timeout=15)


# ---------- Notification templates ----------
def test_template_crud(admin):
    sfx = uuid.uuid4().hex[:6]
    payload = {"event_key": "order_paid", "channel": "email", "name": f"iter11-{sfx}",
               "subject": "Payment received {{order_number}}", "body": "Hi {{customer_name}}, total {{total}}",
               "active": True, "is_default": True}
    r = admin.post(f"{API}/admin/marketing/templates", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]

    # invalid event_key rejected
    bad = admin.post(f"{API}/admin/marketing/templates",
                     json={**payload, "name": f"iter11-bad-{sfx}", "event_key": "bogus_event"}, timeout=15)
    assert bad.status_code == 400

    # update
    r = admin.put(f"{API}/admin/marketing/templates/{tid}",
                  json={**payload, "subject": "Updated subject"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["subject"] == "Updated subject"

    # listing returns the row
    r = admin.get(f"{API}/admin/marketing/templates?event_key=order_paid&channel=email", timeout=15)
    assert any(t["id"] == tid for t in r.json())

    # delete
    r = admin.delete(f"{API}/admin/marketing/templates/{tid}", timeout=15)
    assert r.status_code == 200


# ---------- Bulk send ----------
def test_bulk_send_validation(admin):
    # Bad channel rejected
    r = admin.post(f"{API}/admin/marketing/bulk-send",
                   json={"channel": "carrier-pigeon", "body": "x"}, timeout=15)
    assert r.status_code == 400


def test_bulk_send_queues_to_opt_in_customers(admin):
    """Marketing blast queues NotificationLog rows for each opted-in customer."""
    # Create a couple of test customers with marketing_opt_in=True
    sfx = uuid.uuid4().hex[:6]
    created = []
    for i in range(2):
        r = admin.post(f"{API}/admin/customers", json={
            "name": f"iter11 bulk {sfx}-{i}",
            "email": f"iter11-{sfx}-{i}@example.com",
            "phone": f"+94771119{sfx[:3]}{i}",
            "marketing_opt_in": True,
        }, timeout=15)
        assert r.status_code == 200, r.text
        created.append(r.json()["id"])

    # Bulk-send by IDs (avoid spamming the rest of the customer base)
    r = admin.post(f"{API}/admin/marketing/bulk-send", json={
        "channel": "email", "subject": f"iter11-{sfx}",
        "body": "Hi {{customer_name}}, this is a test.",
        "customer_ids": created, "marketing_opt_in_only": True,
    }, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["queued"] == 2

    # Cleanup
    for cid in created:
        admin.delete(f"{API}/admin/customers/{cid}", timeout=15)


# ---------- Theme can include apply_to_admin ----------
def test_theme_apply_to_admin_persists(admin):
    cfg = (admin.get(f"{API}/theme", timeout=15)).json() or {}
    new_cfg = {**cfg, "apply_to_admin": True}
    r = admin.put(f"{API}/admin/theme", json={"config": new_cfg}, timeout=15)
    assert r.status_code == 200
    after = (requests.get(f"{API}/theme", timeout=15)).json()
    assert after.get("apply_to_admin") is True
    # restore
    admin.put(f"{API}/admin/theme", json={"config": {**new_cfg, "apply_to_admin": False}}, timeout=15)
