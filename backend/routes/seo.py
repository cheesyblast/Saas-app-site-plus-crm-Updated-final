"""SEO endpoints: dynamic sitemap.xml + robots.txt.

Both are public, unauthenticated, and cacheable. The sitemap is generated
live from active products + custom CMS pages so it stays accurate without
any cron job. Search engines re-crawl it on their schedule.

Reference: https://www.sitemaps.org/protocol.html
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional, Tuple
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
import models as M

router = APIRouter()

# Static storefront routes worth indexing (high crawl priority).
_STATIC_ROUTES = [
    ("", 1.0, "weekly"),
    ("shop", 0.9, "daily"),
    ("about", 0.5, "monthly"),
    ("contact", 0.5, "monthly"),
]

# Simple per-origin in-memory cache. The first crawler hit pays the DB cost;
# subsequent requests (including our own monitors) get an instant 200. Five
# minutes is short enough that newly-published products show up reasonably
# quickly without hammering the DB on every Googlebot hit.
_SITEMAP_CACHE: dict[str, Tuple[float, str]] = {}
_SITEMAP_TTL_SEC = 300


def _public_origin(request: Request) -> str:
    """Best-effort origin for the customer-facing storefront.
    Prefers x-forwarded-* (set by Nginx in prod) then falls back to the
    request's own scheme+host. Strips a trailing slash for consistency.
    """
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    if not host:
        host = request.url.netloc
    base = f"{proto}://{host}"
    return base.rstrip("/")


def _iso(dt: Optional[datetime]) -> str:
    if not dt:
        return datetime.now(timezone.utc).date().isoformat()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.date().isoformat()


@router.get("/sitemap.xml")
async def sitemap_xml(request: Request, db: AsyncSession = Depends(get_db)):
    base = _public_origin(request)
    # Return cached body if still fresh.
    cached = _SITEMAP_CACHE.get(base)
    now = time.time()
    if cached and (now - cached[0]) < _SITEMAP_TTL_SEC:
        return Response(content=cached[1], media_type="application/xml",
                        headers={"Cache-Control": "public, max-age=900",
                                 "X-Cache": "HIT"})
    urls = []
    today = datetime.now(timezone.utc).date().isoformat()

    for path, prio, freq in _STATIC_ROUTES:
        urls.append({"loc": f"{base}/{path}".rstrip("/"), "lastmod": today,
                     "priority": prio, "changefreq": freq})

    # Active products
    prods = (await db.execute(
        select(M.Product).where(M.Product.status == "active")
    )).scalars().all()
    for p in prods:
        urls.append({
            "loc": f"{base}/product/{p.slug}",
            "lastmod": _iso(getattr(p, "updated_at", None) or getattr(p, "created_at", None)),
            "priority": 0.8,
            "changefreq": "weekly",
        })

    # Categories
    cats = (await db.execute(select(M.Category))).scalars().all()
    for c in cats:
        urls.append({
            "loc": f"{base}/shop?category={escape(c.slug)}",
            "lastmod": _iso(getattr(c, "created_at", None)),
            "priority": 0.6,
            "changefreq": "weekly",
        })

    # Published custom pages
    try:
        pages = (await db.execute(
            select(M.Page).where(M.Page.status == "published")
        )).scalars().all()
    except Exception:
        pages = []
    for pg in pages:
        slug = (pg.slug or "").strip("/")
        # Hidden "internal" pages used by the page-builder (_header/_footer/home)
        if slug.startswith("_"):
            continue
        loc = f"{base}/{slug}" if slug else f"{base}/"
        urls.append({
            "loc": loc, "lastmod": _iso(getattr(pg, "updated_at", None) or getattr(pg, "created_at", None)),
            "priority": 0.5, "changefreq": "monthly",
        })

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{escape(u['loc'])}</loc>")
        lines.append(f"    <lastmod>{u['lastmod']}</lastmod>")
        lines.append(f"    <changefreq>{u['changefreq']}</changefreq>")
        lines.append(f"    <priority>{u['priority']:.1f}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    body = "\n".join(lines)
    _SITEMAP_CACHE[base] = (now, body)
    return Response(content=body, media_type="application/xml",
                    headers={"Cache-Control": "public, max-age=900",
                             "X-Cache": "MISS"})


@router.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt(request: Request):
    """Standard robots.txt — block admin/api, point to sitemap."""
    base = _public_origin(request)
    body = "\n".join([
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /admin/",
        "Disallow: /api/",
        "Disallow: /checkout",
        "Disallow: /account",
        "",
        f"Sitemap: {base}/sitemap.xml",
        "",
    ])
    return PlainTextResponse(body, headers={"Cache-Control": "public, max-age=3600"})
