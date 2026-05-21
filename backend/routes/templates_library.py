"""Install professionally-worded prebuilt notification templates.

Endpoints:
  GET  /api/admin/templates-library         → list available templates
  POST /api/admin/templates-library/install → seed missing ones into the DB

We never overwrite existing rows. The merchant can install once and then
freely edit each template; re-running install is a no-op so the button is
safe to click multiple times.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import require_admin
import models as M
from templates_seed import TEMPLATES

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/admin/templates-library")
async def list_library(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    out = []
    for t in TEMPLATES:
        existing = (await db.execute(
            select(M.NotificationTemplate).where(and_(
                M.NotificationTemplate.event_key == t["event_key"],
                M.NotificationTemplate.channel == t["channel"],
                M.NotificationTemplate.name == t["name"],
            ))
        )).scalar_one_or_none()
        out.append({
            "event_key": t["event_key"], "channel": t["channel"],
            "name": t["name"], "subject": t.get("subject"),
            "preview": (t.get("body") or "")[:160],
            "installed": existing is not None, "id": existing.id if existing else None,
        })
    return out


@router.post("/admin/templates-library/install")
async def install_library(
    db: AsyncSession = Depends(get_db),
    _: M.User = Depends(require_admin),
    overwrite: Optional[bool] = False,
):
    """Install all library templates that aren't already in the DB.
    If `overwrite=true`, also refresh existing rows (use carefully — wipes
    any edits the merchant made)."""
    installed = 0
    updated = 0
    skipped = 0
    for t in TEMPLATES:
        existing = (await db.execute(
            select(M.NotificationTemplate).where(and_(
                M.NotificationTemplate.event_key == t["event_key"],
                M.NotificationTemplate.channel == t["channel"],
                M.NotificationTemplate.name == t["name"],
            ))
        )).scalar_one_or_none()
        if existing and not overwrite:
            skipped += 1
            continue
        if existing and overwrite:
            existing.subject = t.get("subject")
            existing.body = t.get("body") or ""
            existing.body_html = t.get("body_html")
            existing.is_default = bool(t.get("is_default"))
            existing.active = True
            updated += 1
            continue
        row = M.NotificationTemplate(
            event_key=t["event_key"], channel=t["channel"], name=t["name"],
            subject=t.get("subject"), body=t.get("body") or "",
            body_html=t.get("body_html"),
            active=True, is_default=bool(t.get("is_default")),
        )
        db.add(row)
        installed += 1
    await db.commit()
    return {"ok": True, "installed": installed, "updated": updated, "skipped": skipped,
            "total_in_library": len(TEMPLATES)}
