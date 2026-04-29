"""Phase B multi-tenancy scaffold tests.

Verifies the new platform-owner endpoints and the tenant context dependency
without requiring multi-tenancy enforcement to be turned on.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@demo.com")
ADMIN_PASS = os.environ.get("TEST_ADMIN_PASS", "demo12345")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=45)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}",
                      "Content-Type": "application/json"})
    return s


# ---------- Authorisation gating ----------
def test_super_admin_endpoints_require_auth():
    """Anonymous requests must be rejected by every super-admin route."""
    for path in ("/super-admin/tenants", "/super-admin/stats"):
        r = requests.get(f"{API}{path}", timeout=15)
        assert r.status_code in (401, 403), f"{path} should reject anon"


# ---------- Tenants table & default seed ----------
def test_default_tenant_seeded_on_startup(admin):
    """The 'default' tenant must exist after first boot."""
    r = admin.get(f"{API}/super-admin/tenants", timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    slugs = {t["slug"] for t in rows}
    assert "default" in slugs, f"default tenant missing — got slugs {slugs}"
    default = next(t for t in rows if t["slug"] == "default")
    assert default["status"] == "active"
    assert default["plan"] in ("enterprise", "starter", "pro", "trial")


# ---------- CRUD ----------
def test_create_get_update_soft_delete_tenant(admin):
    import uuid as _u
    slug = f"test-iter10-{_u.uuid4().hex[:8]}"

    # Create
    r = admin.post(f"{API}/super-admin/tenants",
                   json={"slug": slug, "name": "ACME Corp", "plan": "trial"}, timeout=15)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["status"] == "active"
    assert r.json()["plan"] == "trial"

    # Duplicate slug should 409
    r = admin.post(f"{API}/super-admin/tenants",
                   json={"slug": slug, "name": "x"}, timeout=15)
    assert r.status_code == 409

    # Get
    r = admin.get(f"{API}/super-admin/tenants/{tid}", timeout=15)
    assert r.status_code == 200
    assert r.json()["slug"] == slug

    # Update — change plan and status
    r = admin.put(f"{API}/super-admin/tenants/{tid}",
                  json={"plan": "pro", "status": "suspended"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["plan"] == "pro"
    assert r.json()["status"] == "suspended"

    # Soft-delete
    r = admin.delete(f"{API}/super-admin/tenants/{tid}", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"

    # Default tenant cannot be deleted
    r = admin.get(f"{API}/super-admin/tenants", params={"q": "default"}, timeout=15)
    default_id = next(t for t in r.json() if t["slug"] == "default")["id"]
    r = admin.delete(f"{API}/super-admin/tenants/{default_id}", timeout=15)
    assert r.status_code == 400


# ---------- Platform stats ----------
def test_platform_stats_shape(admin):
    r = admin.get(f"{API}/super-admin/stats", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "tenants" in body and "orders_total" in body and "users_total" in body
    assert body["tenants"]["total"] >= 1
    assert body["tenants"]["active"] >= 1


# ---------- Tenant column migration ran ----------
def test_business_tables_have_tenant_id_column():
    """Smoke-check the migration by hitting the regular CRUD endpoints — they
    should not blow up on the new tenant_id column even though we're not yet
    using it."""
    for path in ("/company", "/products", "/categories", "/discounts/active",
                 "/payment-methods?scope=online"):
        r = requests.get(f"{API}{path}", timeout=15)
        assert r.status_code in (200, 401), f"{path} -> {r.status_code} {r.text[:200]}"
