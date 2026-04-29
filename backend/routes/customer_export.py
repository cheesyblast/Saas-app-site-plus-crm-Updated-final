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


# ========== CUSTOMER CSV / EXCEL EXPORT ==========
@router.get("/admin/customers/export.csv")
async def export_customers_csv(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    import io, csv as _csv
    rows = (await db.execute(select(M.Customer).order_by(desc(M.Customer.created_at)))).scalars().all()
    buf = io.StringIO()
    w = _csv.writer(buf)
    w.writerow(["name", "email", "phone", "address", "district", "city",
                "total_orders", "total_spent", "created_at"])
    for c in rows:
        w.writerow([c.name or "", c.email or "", c.phone or "", c.address or "",
                    c.district or "", c.city or "",
                    c.total_orders or 0, c.total_spent or 0,
                    c.created_at.isoformat() if c.created_at else ""])
    return FastResponse(content=buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="customers.csv"'})


@router.get("/admin/customers/export.xlsx")
async def export_customers_xlsx(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    import io
    from openpyxl import Workbook
    rows = (await db.execute(select(M.Customer).order_by(desc(M.Customer.created_at)))).scalars().all()
    wb = Workbook(); ws = wb.active; ws.title = "Customers"
    ws.append(["Name", "Email", "Phone", "Address", "District", "City",
               "Orders", "Total Spent", "Marketing Opt-in", "Joined"])
    for c in rows:
        ws.append([c.name or "", c.email or "", c.phone or "", c.address or "",
                   c.district or "", c.city or "",
                   c.total_orders or 0, c.total_spent or 0,
                   "yes" if c.marketing_opt_in else "no",
                   c.created_at.isoformat() if c.created_at else ""])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return FastResponse(content=buf.getvalue(),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": 'attachment; filename="customers.xlsx"'})

