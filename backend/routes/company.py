import os
import re
import uuid
import random
import string
import logging
import base64 as _b64
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import Response as FastResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc

from database import get_db
import models as M
from auth import (
    hash_password, verify_password,
    make_session_jwt, set_session_cookie, clear_session_cookie, get_session_token,
    get_current_user, get_current_user_optional, require_admin, require_roles, require_perm,
    check_lockout, record_failed_login, clear_login_attempts,
    fetch_emergent_profile, create_db_session, gen_reset_token,
    ADMIN_ROLES, ALL_PERMISSIONS,
)
from sl_locations import SL_DISTRICT_CITIES, all_districts, cities_for
from deps import (
    slugify, new_order_number, normalize_phone_lk,
    _select_active_discounts, _best_discount_for, _client_ip, _public_user,
    _descendant_ids, _ensure_default_store,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ========== COMPANY / SETTINGS ==========
def _company_dict(cs: M.CompanySettings):
    return {
        "company_name": cs.company_name, "tagline": cs.tagline,
        "email": cs.email, "phone": cs.phone, "address": cs.address,
        "currency": cs.currency,
        "logo_light_id": cs.logo_light_id, "logo_dark_id": cs.logo_dark_id,
        "favicon_id": cs.favicon_id, "setup_complete": cs.setup_complete,
        "meta_title": cs.meta_title, "meta_description": cs.meta_description,
        "meta_keywords": cs.meta_keywords, "og_image_id": cs.og_image_id,
        "google_analytics_id": cs.google_analytics_id,
        "google_site_verification": cs.google_site_verification,
        "facebook_pixel_id": cs.facebook_pixel_id,
        "instagram_url": cs.instagram_url, "facebook_url": cs.facebook_url,
        "tiktok_url": cs.tiktok_url, "twitter_url": cs.twitter_url, "youtube_url": cs.youtube_url,
        # Auth (Google client_secret intentionally omitted from public response)
        "auth_google_enabled": bool(cs.auth_google_enabled),
        "auth_google_client_id": cs.auth_google_client_id,
        # Branding
        "header_logo_height": cs.header_logo_height or 32,
        "footer_logo_height": cs.footer_logo_height or 40,
        "logo_display_mode": cs.logo_display_mode or "auto",
    }


class CompanyUpdate(BaseModel):
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    currency: Optional[str] = None
    logo_light_id: Optional[str] = None
    logo_dark_id: Optional[str] = None
    favicon_id: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    og_image_id: Optional[str] = None
    google_analytics_id: Optional[str] = None
    google_site_verification: Optional[str] = None
    facebook_pixel_id: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    tiktok_url: Optional[str] = None
    twitter_url: Optional[str] = None
    youtube_url: Optional[str] = None
    # Auth integrations
    auth_google_enabled: Optional[bool] = None
    auth_google_client_id: Optional[str] = None
    auth_google_client_secret: Optional[str] = None
    # Branding
    header_logo_height: Optional[int] = None
    footer_logo_height: Optional[int] = None
    logo_display_mode: Optional[str] = None


@router.get("/company")
async def get_company(db: AsyncSession = Depends(get_db)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    if not cs:
        return {"company_name": "My Brand", "currency": "LKR", "setup_complete": False}
    return _company_dict(cs)


@router.put("/admin/company")
async def update_company(payload: CompanyUpdate, db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    if not cs:
        cs = M.CompanySettings(id="default")
        db.add(cs)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cs, k, v)
    cs.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _company_dict(cs)


