"""Tenant context for Phase B (multi-tenancy).

The reverse-proxy nginx extracts the leftmost label of the Host header and
forwards it as `X-Tenant-Slug`. This module provides a FastAPI dependency
that resolves it into a Tenant row.

Phase B is FEATURE-FLAGGED. While `MULTITENANT_ENFORCE` is unset/false the
dependency is a no-op (returns the implicit `default` tenant), so existing
single-tenant code keeps working. When the flag flips on, missing/invalid
slugs raise 404 and routes that should be tenant-scoped MUST query
`Model.tenant_id == current.id`.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
import models as M


def is_multitenant_enforced() -> bool:
    """Phase-B feature flag. Set MULTITENANT_ENFORCE=true to require X-Tenant-Slug
    on every business request and reject mismatches. Default OFF for back-compat."""
    return os.environ.get("MULTITENANT_ENFORCE", "").strip().lower() in ("1", "true", "yes")


async def get_current_tenant(
    request: Request,
    x_tenant_slug: Optional[str] = Header(None, alias="X-Tenant-Slug"),
    db: AsyncSession = Depends(get_db),
) -> M.Tenant:
    """Resolve the active tenant for the current request.

    Resolution order:
      1. X-Tenant-Slug header (set by reverse-proxy nginx from subdomain).
      2. ?tenant=<slug> query param (admin tooling / debugging only).
      3. Fallback to the 'default' tenant.

    When MULTITENANT_ENFORCE=true, missing/unknown slugs raise 404.
    """
    slug = (x_tenant_slug or "").strip().lower()
    if not slug:
        slug = (request.query_params.get("tenant") or "").strip().lower()

    if not slug:
        if is_multitenant_enforced():
            raise HTTPException(status_code=400, detail="Missing X-Tenant-Slug header")
        slug = "default"

    # Empty subdomain (apex domain hit) — treat as default unless enforcement is on.
    if slug in ("", "www", "admin") and not is_multitenant_enforced():
        slug = "default"

    tenant = (await db.execute(select(M.Tenant).where(M.Tenant.slug == slug))).scalar_one_or_none()
    if tenant is None:
        if is_multitenant_enforced():
            raise HTTPException(status_code=404, detail=f"Tenant '{slug}' not found")
        # Fallback: ensure the default tenant exists (created by startup) and use it.
        tenant = (await db.execute(select(M.Tenant).where(M.Tenant.slug == "default"))).scalar_one_or_none()
        if tenant is None:
            raise HTTPException(status_code=500, detail="Default tenant missing — startup did not seed it")

    if tenant.status == "suspended":
        raise HTTPException(status_code=402, detail="Tenant is suspended (payment required)")
    if tenant.status == "deleted":
        raise HTTPException(status_code=410, detail="Tenant has been deleted")

    return tenant
