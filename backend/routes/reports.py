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


# ========== REPORTS / DASHBOARD ==========
@router.get("/admin/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    now = datetime.now(timezone.utc); d30 = now - timedelta(days=30); d14 = now - timedelta(days=14)
    orders_30 = (await db.execute(select(M.Order).where(M.Order.created_at >= d30))).scalars().all()
    total_revenue = sum(o.total for o in orders_30 if o.payment_status == "paid")
    customer_count = (await db.execute(select(func.count(M.Customer.id)))).scalar_one()
    low_rows = (await db.execute(select(M.Inventory))).scalars().all()
    low_stock = [x for x in low_rows if x.quantity <= x.low_stock_threshold]
    daily_orders = (await db.execute(select(M.Order).where(M.Order.created_at >= d14))).scalars().all()
    daily = {}
    for o in daily_orders:
        if o.payment_status != "paid":
            continue
        d = o.created_at.strftime("%Y-%m-%d")
        daily[d] = daily.get(d, 0) + o.total
    sales_chart = [{"date": k, "revenue": round(v, 2)} for k, v in sorted(daily.items())]
    items = (await db.execute(select(M.OrderItem))).scalars().all()
    top_map = {}
    for i in items:
        top_map[i.product_name] = top_map.get(i.product_name, 0) + i.quantity
    top_products = sorted([{"name": k, "qty": v} for k, v in top_map.items()], key=lambda x: -x["qty"])[:5]
    status_map = {}
    for o in orders_30:
        status_map[o.status] = status_map.get(o.status, 0) + 1
    return {"total_revenue": round(total_revenue, 2), "total_orders": len(orders_30),
            "customer_count": customer_count, "low_stock_count": len(low_stock),
            "sales_chart": sales_chart, "top_products": top_products,
            "status_breakdown": [{"status": k, "count": v} for k, v in status_map.items()]}


@router.get("/admin/reports/sales")
async def sales_report(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin), days: int = 30):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    orders = (await db.execute(select(M.Order).where(M.Order.created_at >= since))).scalars().all()
    by_day = {}; by_channel = {}; total_paid = 0.0
    for o in orders:
        d = o.created_at.strftime("%Y-%m-%d")
        by_day[d] = by_day.get(d, 0.0) + (o.total if o.payment_status == "paid" else 0)
        by_channel[o.source] = by_channel.get(o.source, 0.0) + (o.total if o.payment_status == "paid" else 0)
        if o.payment_status == "paid":
            total_paid += o.total
    exp = (await db.execute(select(M.Expense).where(M.Expense.expense_date >= since))).scalars().all()
    total_expense = sum(e.amount for e in exp)
    return {"total_paid_revenue": round(total_paid, 2), "total_expenses": round(total_expense, 2),
            "profit": round(total_paid - total_expense, 2),
            "by_day": [{"date": k, "revenue": round(v, 2)} for k, v in sorted(by_day.items())],
            "by_channel": [{"channel": k, "revenue": round(v, 2)} for k, v in by_channel.items()]}




# ========== ACCOUNTING REPORTS (P&L) ==========
@router.get("/admin/reports/pnl")
async def pnl_report(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                      from_date: Optional[str] = None, to_date: Optional[str] = None,
                      store_id: Optional[str] = None, group_by: str = "day"):
    """Profit & Loss with optional store filter and grouping (day or month)."""
    now = datetime.now(timezone.utc)
    start = datetime.fromisoformat(from_date) if from_date else now - timedelta(days=30)
    end = datetime.fromisoformat(to_date) if to_date else now
    if start.tzinfo is None: start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None: end = end.replace(tzinfo=timezone.utc)
    # If the caller passed a date-only "to" (00:00 of the day) extend to end-of-day so that
    # entries logged later that same day still fall inside the window.
    if end.hour == 0 and end.minute == 0 and end.second == 0:
        end = end.replace(hour=23, minute=59, second=59, microsecond=999999)

    o_q = select(M.Order).where(and_(M.Order.created_at >= start, M.Order.created_at <= end, M.Order.payment_status == "paid"))
    if store_id:
        o_q = o_q.where(M.Order.store_id == store_id)
    orders = (await db.execute(o_q)).scalars().all()

    e_q = select(M.Expense).where(and_(M.Expense.expense_date >= start, M.Expense.expense_date <= end))
    if store_id:
        e_q = e_q.where(M.Expense.store_id == store_id)
    expenses = (await db.execute(e_q)).scalars().all()

    i_q = select(M.Income).where(and_(M.Income.income_date >= start, M.Income.income_date <= end))
    if store_id:
        i_q = i_q.where(M.Income.store_id == store_id)
    incomes = (await db.execute(i_q)).scalars().all()

    # Supplier payouts within window — they drain cash so count as expense.
    sp_q = select(M.SupplierPayment).where(and_(M.SupplierPayment.paid_date >= start, M.SupplierPayment.paid_date <= end))
    supplier_payments = (await db.execute(sp_q)).scalars().all()

    fmt = "%Y-%m" if group_by == "month" else "%Y-%m-%d"
    daily = {}
    def _b(d):
        return daily.setdefault(d, {"revenue": 0.0, "income": 0.0, "expense": 0.0})
    for o in orders:
        _b(o.created_at.strftime(fmt))["revenue"] += o.total
    for i in incomes:
        _b(i.income_date.strftime(fmt))["income"] += i.amount
    for e in expenses:
        _b(e.expense_date.strftime(fmt))["expense"] += e.amount
    # Supplier payouts roll into the expense bucket per their paid_date
    for sp in supplier_payments:
        _b(sp.paid_date.strftime(fmt))["expense"] += sp.amount
    series = []
    for k in sorted(daily.keys()):
        d = daily[k]
        series.append({"date": k, "revenue": round(d["revenue"], 2), "income": round(d["income"], 2),
                       "expense": round(d["expense"], 2),
                       "profit": round(d["revenue"] + d["income"] - d["expense"], 2)})
    total_rev = round(sum(o.total for o in orders), 2)
    total_inc = round(sum(i.amount for i in incomes), 2)
    total_exp = round(sum(e.amount for e in expenses) + sum(sp.amount for sp in supplier_payments), 2)
    total_supplier = round(sum(sp.amount for sp in supplier_payments), 2)
    # By outlet
    stores = {s.id: s.name for s in (await db.execute(select(M.Store))).scalars().all()}
    by_outlet = {}
    for o in orders:
        sid = o.store_id or "_unassigned"
        b = by_outlet.setdefault(sid, {"name": stores.get(sid, "Online/Unassigned"), "revenue": 0.0, "expense": 0.0, "income": 0.0})
        b["revenue"] += o.total
    for e in expenses:
        sid = e.store_id or "_unassigned"
        b = by_outlet.setdefault(sid, {"name": stores.get(sid, "Online/Unassigned"), "revenue": 0.0, "expense": 0.0, "income": 0.0})
        b["expense"] += e.amount
    for sp in supplier_payments:
        # Supplier payments aren't bound to a store; bucket as Unassigned.
        sid = "_unassigned"
        b = by_outlet.setdefault(sid, {"name": stores.get(sid, "Online/Unassigned"), "revenue": 0.0, "expense": 0.0, "income": 0.0})
        b["expense"] += sp.amount
    for i in incomes:
        sid = i.store_id or "_unassigned"
        b = by_outlet.setdefault(sid, {"name": stores.get(sid, "Online/Unassigned"), "revenue": 0.0, "expense": 0.0, "income": 0.0})
        b["income"] += i.amount
    by_outlet_arr = []
    for sid, v in by_outlet.items():
        by_outlet_arr.append({"store_id": sid, "store_name": v["name"], "revenue": round(v["revenue"], 2),
                               "income": round(v["income"], 2), "expense": round(v["expense"], 2),
                               "profit": round(v["revenue"] + v["income"] - v["expense"], 2)})
    return {
        "total_revenue": total_rev, "total_income": total_inc, "total_expense": total_exp,
        "supplier_payments": total_supplier,
        "profit": round(total_rev + total_inc - total_exp, 2),
        "series": series, "by_outlet": by_outlet_arr,
        "from": start.isoformat(), "to": end.isoformat(), "group_by": group_by,
    }


@router.get("/admin/reports/pnl/export")
async def pnl_export(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                      from_date: Optional[str] = None, to_date: Optional[str] = None,
                      store_id: Optional[str] = None, group_by: str = "day"):
    """Excel xlsx export of P&L."""
    import io
    from openpyxl import Workbook
    data = await pnl_report(db, _=_, from_date=from_date, to_date=to_date, store_id=store_id, group_by=group_by)
    wb = Workbook()
    ws = wb.active
    ws.title = "P&L Summary"
    ws.append(["Period", data["from"], "to", data["to"]])
    ws.append([])
    ws.append(["Total Revenue", data["total_revenue"]])
    ws.append(["Total Income", data["total_income"]])
    ws.append(["Total Expense", data["total_expense"]])
    ws.append(["Net Profit", data["profit"]])
    ws.append([])
    ws.append([group_by.capitalize(), "Revenue", "Income", "Expense", "Profit"])
    for s in data["series"]:
        ws.append([s["date"], s["revenue"], s["income"], s["expense"], s["profit"]])
    ws2 = wb.create_sheet("By Outlet")
    ws2.append(["Outlet", "Revenue", "Income", "Expense", "Profit"])
    for o in data["by_outlet"]:
        ws2.append([o["store_name"], o["revenue"], o["income"], o["expense"], o["profit"]])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return FastResponse(content=buf.getvalue(),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="pnl_{group_by}.xlsx"'})


