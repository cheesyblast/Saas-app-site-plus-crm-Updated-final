"""Super-admin (platform owner) endpoints.

These endpoints sit OUTSIDE per-tenant isolation. Only users with role
`super_admin` may call them. They manage the global list of tenants, suspend
billing-delinquent tenants, and let the platform owner view aggregate health.

All routes are mounted at /api/super-admin/*.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
import models as M
from auth import require_roles

logger = logging.getLogger(__name__)
router = APIRouter()


def _tenant_dict(t: M.Tenant) -> dict:
    return {
        "id": t.id,
        "slug": t.slug,
        "name": t.name,
        "custom_domain": t.custom_domain,
        "plan": t.plan,
        "status": t.status,
        "owner_user_id": t.owner_user_id,
        "settings": t.settings or {},
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


class TenantCreate(BaseModel):
    slug: str = Field(..., min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
    name: str = Field(..., min_length=1, max_length=255)
    plan: str = "trial"
    custom_domain: Optional[str] = None
    owner_user_id: Optional[str] = None
    settings: Optional[dict] = None


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None  # active | suspended | deleted
    custom_domain: Optional[str] = None
    owner_user_id: Optional[str] = None
    settings: Optional[dict] = None


@router.get("/super-admin/tenants")
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_roles("super_admin")),
    q: Optional[str] = None,
    status: Optional[str] = None,
):
    query = select(M.Tenant).order_by(desc(M.Tenant.created_at))
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import or_, func as _f
        query = query.where(or_(_f.lower(M.Tenant.name).like(like), _f.lower(M.Tenant.slug).like(like)))
    if status:
        query = query.where(M.Tenant.status == status)
    rows = (await db.execute(query)).scalars().all()
    return [_tenant_dict(t) for t in rows]


@router.post("/super-admin/tenants")
async def create_tenant(
    payload: TenantCreate,
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_roles("super_admin")),
):
    existing = (await db.execute(select(M.Tenant).where(M.Tenant.slug == payload.slug))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Tenant slug '{payload.slug}' is taken")
    if payload.custom_domain:
        clash = (await db.execute(select(M.Tenant).where(M.Tenant.custom_domain == payload.custom_domain))).scalar_one_or_none()
        if clash:
            raise HTTPException(409, f"Custom domain '{payload.custom_domain}' already mapped to another tenant")
    t = M.Tenant(
        slug=payload.slug,
        name=payload.name,
        plan=payload.plan,
        custom_domain=payload.custom_domain,
        owner_user_id=payload.owner_user_id,
        settings=payload.settings,
        status="active",
    )
    db.add(t); await db.commit(); await db.refresh(t)
    logger.info("super_admin created tenant slug=%s id=%s", t.slug, t.id)
    return _tenant_dict(t)


@router.get("/super-admin/tenants/{tid}")
async def get_tenant(
    tid: str,
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_roles("super_admin")),
):
    t = (await db.execute(select(M.Tenant).where(M.Tenant.id == tid))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tenant not found")
    return _tenant_dict(t)


@router.put("/super-admin/tenants/{tid}")
async def update_tenant(
    tid: str,
    payload: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_roles("super_admin")),
):
    t = (await db.execute(select(M.Tenant).where(M.Tenant.id == tid))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tenant not found")
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(t, field, val)
    t.updated_at = datetime.now(timezone.utc)
    await db.commit(); await db.refresh(t)
    return _tenant_dict(t)


@router.delete("/super-admin/tenants/{tid}")
async def delete_tenant(
    tid: str,
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_roles("super_admin")),
):
    """Soft-delete: marks status='deleted'. Keeps row + rows referencing it intact
    so super-admin can audit. Hard-delete is intentionally not exposed."""
    t = (await db.execute(select(M.Tenant).where(M.Tenant.id == tid))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tenant not found")
    if t.slug == "default":
        raise HTTPException(400, "Cannot delete the default tenant")
    t.status = "deleted"
    t.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "tenant_id": tid, "status": t.status}


@router.get("/super-admin/stats")
async def platform_stats(
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_roles("super_admin")),
):
    """Aggregate platform health snapshot for the super-admin landing page."""
    total_tenants = (await db.execute(select(func.count(M.Tenant.id)))).scalar_one()
    active = (await db.execute(select(func.count(M.Tenant.id)).where(M.Tenant.status == "active"))).scalar_one()
    suspended = (await db.execute(select(func.count(M.Tenant.id)).where(M.Tenant.status == "suspended"))).scalar_one()
    deleted = (await db.execute(select(func.count(M.Tenant.id)).where(M.Tenant.status == "deleted"))).scalar_one()
    total_orders = (await db.execute(select(func.count(M.Order.id)))).scalar_one()
    total_users = (await db.execute(select(func.count(M.User.user_id)))).scalar_one()
    return {
        "tenants": {"total": total_tenants, "active": active, "suspended": suspended, "deleted": deleted},
        "orders_total": total_orders,
        "users_total": total_users,
    }
