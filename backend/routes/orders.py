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


# ========== ORDERS / CHECKOUT ==========
class OrderItemIn(BaseModel):
    variant_id: str
    quantity: int


class CheckoutIn(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_district: Optional[str] = None
    shipping_city: Optional[str] = None
    items: List[OrderItemIn]
    coupon_code: Optional[str] = None
    payment_method: str = "cod"
    notes: Optional[str] = None
    source: str = "online"
    store_id: Optional[str] = None
    cash_tendered: Optional[float] = None  # POS: amount paid in cash
    card_last4: Optional[str] = None        # POS: card terminal last 4
    cash_account_id: Optional[str] = None   # which drawer/account received money
    manual_discount_percent: Optional[float] = None  # POS-only: cashier-entered discount %
    manual_discount_amount: Optional[float] = None   # POS-only: cashier-entered fixed discount


async def _resolve_brand_name(db: AsyncSession) -> str:
    cs = (await db.execute(select(M.CompanySettings).where(M.CompanySettings.id == "default"))).scalar_one_or_none()
    return (cs.company_name if cs else "") or "Our Store"


async def _build_payhere_redirect(db: AsyncSession, order: M.Order, payload, origin: str):
    """Look up the active PayHere PaymentMethod row, sign the request, and
    return a payload the frontend posts (hidden form) to PayHere's hosted
    checkout. Returns None when PayHere isn't configured so checkout falls
    back to 'order received' instead of crashing.
    """
    import hashlib
    pm = (await db.execute(
        select(M.PaymentMethod).where(
            M.PaymentMethod.code == "payhere",
            M.PaymentMethod.active == True,  # noqa: E712
        )
    )).scalars().first()
    if not pm:
        logger.warning("PayHere payment method not configured/active")
        return None
    cfg = pm.config or {}
    merchant_id = (cfg.get("merchant_id") or "").strip()
    merchant_secret = (cfg.get("secret") or cfg.get("merchant_secret") or "").strip()
    sandbox = bool(cfg.get("sandbox"))
    if not (merchant_id and merchant_secret):
        logger.warning("PayHere missing merchant_id/secret in PaymentMethod.config")
        return None
    endpoint = "https://sandbox.payhere.lk/pay/checkout" if sandbox else "https://www.payhere.lk/pay/checkout"
    amount_str = f"{order.total:.2f}"
    currency = "LKR"
    # PayHere request hash:
    #   md5( merchant_id + order_id + amount(2dp) + currency + UPPER(md5(secret)) ).upper()
    secret_md5 = hashlib.md5(merchant_secret.encode("utf-8")).hexdigest().upper()
    raw = f"{merchant_id}{order.order_number}{amount_str}{currency}{secret_md5}"
    sig = hashlib.md5(raw.encode("utf-8")).hexdigest().upper()
    # Public URLs — derive from frontend origin (Origin/Referer header).
    base = origin or os.environ.get("PUBLIC_BASE_URL", "")
    if base and base.endswith("/"):
        base = base.rstrip("/")
    return_url = f"{base}/order/{order.order_number}" if base else f"/order/{order.order_number}"
    cancel_url = f"{base}/checkout?cancelled=1" if base else "/checkout?cancelled=1"
    notify_url = f"{base}/api/payhere/notify" if base else "/api/payhere/notify"
    # Customer name → first/last best-effort split
    name = (order.customer_name or payload.customer_name or "Customer").strip()
    parts = name.split(maxsplit=1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""
    items_label = f"Order {order.order_number}"
    return {
        "endpoint": endpoint,
        "fields": {
            "merchant_id": merchant_id,
            "return_url": return_url,
            "cancel_url": cancel_url,
            "notify_url": notify_url,
            "order_id": order.order_number,
            "items": items_label,
            "currency": currency,
            "amount": amount_str,
            "first_name": first_name,
            "last_name": last_name,
            "email": (order.customer_email or payload.customer_email or ""),
            "phone": (order.customer_phone or payload.customer_phone or ""),
            "address": (order.shipping_address or payload.shipping_address or ""),
            "city": (order.shipping_city or payload.shipping_city or ""),
            "country": "Sri Lanka",
            "hash": sig,
        },
    }




async def _log_notification(db, channel, to, subject, body, order_id=None,
                            status="mocked", provider=None, event_key=None,
                            ctx=None):
    """Best-effort live dispatch + structured log row.

    If `event_key` is provided, the merchant's NotificationTemplate for that
    event + channel is loaded and rendered (placeholders like {{order_number}}
    are substituted from `ctx`). If no active template exists, the hardcoded
    `subject` / `body` passed in act as the fallback.

    If the merchant has configured a default provider for `channel` (via
    Marketing → Email/SMS Setup), the message is actually sent and the row's
    status reflects the result. If no provider is configured, status='mocked'
    so order flow keeps working in dev.
    """
    from dispatcher import dispatch, render_template_for_event
    # Resolve final subject/body from configured template (if any)
    if event_key:
        try:
            subject, body = await render_template_for_event(
                db, event_key, channel, ctx or {}, subject, body,
            )
        except Exception as e:
            logger.warning("_log_notification template render failed: %s", e)
    if to and status == "mocked":
        try:
            sent_status, sent_provider = await dispatch(db, channel, to, subject, body)
            status = sent_status
            provider = sent_provider
        except Exception as e:
            # Never let a broken provider block an order — fall back to mocked log.
            logger.warning("_log_notification dispatch failed: %s", e)
            status = "failed"
            provider = "exception"
    db.add(M.NotificationLog(channel=channel, to_address=to, subject=subject, body=body,
                              related_order=order_id, status=status, provider=provider))


async def _build_order_response(o: M.Order, db: AsyncSession):
    items = (await db.execute(select(M.OrderItem).where(M.OrderItem.order_id == o.id))).scalars().all()
    return {
        "id": o.id, "order_number": o.order_number, "status": o.status,
        "payment_method": o.payment_method, "payment_status": o.payment_status,
        "subtotal": o.subtotal, "discount": o.discount, "coupon_code": o.coupon_code,
        "shipping": o.shipping, "tax": o.tax, "total": o.total,
        "cash_tendered": o.cash_tendered, "cash_change": o.cash_change, "card_last4": o.card_last4,
        "customer_name": o.customer_name, "customer_email": o.customer_email,
        "customer_phone": o.customer_phone, "customer_id": o.customer_id,
        "shipping_address": o.shipping_address,
        "shipping_district": o.shipping_district, "shipping_city": o.shipping_city,
        "store_id": o.store_id,
        "source": o.source, "notes": o.notes, "created_at": o.created_at.isoformat(),
        "items": [{"id": i.id, "product_name": i.product_name, "variant_label": i.variant_label,
                   "unit_price": i.unit_price, "quantity": i.quantity, "subtotal": i.subtotal} for i in items],
    }


async def _resolve_shipping_fee(db, district, city, subtotal):
    rules = (await db.execute(select(M.ShippingRule).where(M.ShippingRule.active == True).order_by(M.ShippingRule.sort_order))).scalars().all()
    matched = None
    for r in rules:
        if r.district and r.city and r.district == district and r.city == city:
            matched = r; break
    if not matched:
        for r in rules:
            if r.district and not r.city and r.district == district:
                matched = r; break
    if not matched:
        for r in rules:
            if not r.district and not r.city:
                matched = r; break
    if not matched:
        return 0.0
    fee = matched.fee
    if matched.free_above is not None and subtotal >= matched.free_above:
        fee = 0.0
    return fee


@router.post("/checkout")
async def checkout(payload: CheckoutIn, request: Request, db: AsyncSession = Depends(get_db)):
    if not payload.items:
        raise HTTPException(400, "Empty cart")
    store = await _ensure_default_store(db)
    store_id = payload.store_id or store.id
    user = await get_current_user_optional(request, db)
    # Normalise phone for SL → +94 E.164 so SMS delivery works downstream.
    if payload.customer_phone:
        payload.customer_phone = normalize_phone_lk(payload.customer_phone)
    customer = None
    # Only auto-attach to the logged-in user's existing Customer record when
    # the caller IS that customer. POS / admin staff make sales for OTHER
    # buyers, so we must not reuse the cashier's own customer record.
    if user and user.role == "customer":
        customer = (await db.execute(select(M.Customer).where(M.Customer.user_id == user.user_id))).scalar_one_or_none()
    if not customer and payload.customer_phone:
        customer = (await db.execute(select(M.Customer).where(M.Customer.phone == payload.customer_phone))).scalar_one_or_none()
    if not customer and payload.customer_email:
        customer = (await db.execute(select(M.Customer).where(M.Customer.email == payload.customer_email))).scalar_one_or_none()
    if not customer:
        # POS customers don't get linked to the staff user_id — only logged-in
        # customer-role checkouts associate to a User account.
        link_user_id = user.user_id if (user and user.role == "customer") else None
        customer = M.Customer(user_id=link_user_id,
                              name=payload.customer_name or "Walk-in",
                              email=payload.customer_email,
                              phone=payload.customer_phone, address=payload.shipping_address,
                              district=payload.shipping_district, city=payload.shipping_city)
        db.add(customer); await db.flush()
    else:
        # Update customer profile with latest info
        if payload.customer_name and not customer.name:
            customer.name = payload.customer_name
        if payload.customer_email and not customer.email:
            customer.email = payload.customer_email
        if payload.customer_phone and not customer.phone:
            customer.phone = payload.customer_phone
        if payload.shipping_district:
            customer.district = payload.shipping_district
        if payload.shipping_city:
            customer.city = payload.shipping_city

    # Active sitewide / category / product discount campaigns auto-apply per item.
    active_discounts = await _select_active_discounts(db)

    subtotal = 0.0
    auto_discount_total = 0.0
    order_items_data = []
    for it in payload.items:
        v = (await db.execute(select(M.Variant).where(M.Variant.id == it.variant_id))).scalar_one_or_none()
        if not v:
            raise HTTPException(400, f"Invalid variant: {it.variant_id}")
        p = (await db.execute(select(M.Product).where(M.Product.id == v.product_id))).scalar_one()
        inv = (await db.execute(select(M.Inventory).where(and_(M.Inventory.variant_id == v.id, M.Inventory.store_id == store_id)))).scalar_one_or_none()
        if not inv or inv.quantity < it.quantity:
            raise HTTPException(400, f"Insufficient stock for {p.name}")
        price = v.price_override if v.price_override is not None else p.base_price
        save_per_unit, applied_d = _best_discount_for(p, price, active_discounts)
        line_save = round(save_per_unit * it.quantity, 2)
        line_subtotal = round(price * it.quantity, 2)
        subtotal += line_subtotal
        auto_discount_total += line_save
        variant_label = f"{v.size or ''} / {v.color or ''}".strip(" /")
        order_items_data.append((v, p, inv, price, it.quantity, line_subtotal, variant_label))

    discount = 0.0
    coupon = None
    if payload.coupon_code:
        coupon = (await db.execute(select(M.Coupon).where(M.Coupon.code == payload.coupon_code.upper()))).scalar_one_or_none()
        if not coupon or not coupon.active:
            raise HTTPException(400, "Invalid coupon")
        if coupon.expires_at:
            exp = coupon.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                raise HTTPException(400, "Coupon expired")
        if coupon.usage_limit and coupon.used_count >= coupon.usage_limit:
            raise HTTPException(400, "Coupon usage limit reached")
        if subtotal < coupon.min_order:
            raise HTTPException(400, f"Minimum order {coupon.min_order} required")
        # Coupon scope: only discount the eligible portion (products or categories)
        eligible_subtotal = subtotal
        scope = (coupon.scope or "all")
        if scope == "products":
            allowed = set(coupon.scope_product_ids or [])
            eligible_subtotal = sum(line_sub for v, p, inv, price, qty, line_sub, vlabel in order_items_data if p.id in allowed)
        elif scope == "categories":
            allowed = set(coupon.scope_category_ids or [])
            eligible_subtotal = sum(line_sub for v, p, inv, price, qty, line_sub, vlabel in order_items_data if p.category_id in allowed)
        if eligible_subtotal <= 0:
            raise HTTPException(400, "Coupon does not apply to any item in cart")
        discount = round(eligible_subtotal * (coupon.value / 100.0), 2) if coupon.type == "percent" else min(eligible_subtotal, coupon.value)

    if payload.source == "pos":
        shipping_fee = 0.0
    else:
        shipping_fee = await _resolve_shipping_fee(db, payload.shipping_district, payload.shipping_city, subtotal)
    # Auto-applied discount campaigns stack with manual coupon code, but only if both apply.
    discount = round(discount + auto_discount_total, 2)
    # POS may pass a manual discount (percent or fixed) that the cashier punched in.
    pos_extra_discount = 0.0
    if payload.source == "pos":
        if getattr(payload, "manual_discount_percent", None):
            pos_extra_discount = round((subtotal - discount) * (float(payload.manual_discount_percent) / 100.0), 2)
        elif getattr(payload, "manual_discount_amount", None):
            pos_extra_discount = round(min(max(0.0, subtotal - discount), float(payload.manual_discount_amount)), 2)
        discount = round(discount + pos_extra_discount, 2)
    total = max(0.0, subtotal - discount + shipping_fee)

    # Resolve payment status by method.
    # Card / instant methods are auto-paid AND auto-completed (final state).
    # COD / pending gateways stay in pending until manually marked received.
    # PayHere is NOT instant-paid here — it only becomes 'paid' after the
    # webhook (/api/payhere/notify) verifies the signed callback.
    instant_paid = {"cash", "card_pos", "card", "stripe", "koko", "mintpay", "koko_pos", "mintpay_pos"}
    if payload.payment_method in instant_paid:
        payment_status = "paid"; order_status = "completed"
    elif payload.payment_method == "payhere":
        payment_status = "pending"; order_status = "pending_payment"
    else:
        payment_status = "pending"; order_status = "pending"

    # Auto-pick a cash/bank account if the caller didn't supply one (POS source) or for COD
    # (so admins don't need to remember when accounting is enforced).
    target_account_id = payload.cash_account_id
    if not target_account_id:
        wanted_kind = "cash" if payload.payment_method == "cash" else "bank"
        # 1) account bound to the chosen store
        if store_id:
            cand = (await db.execute(select(M.CashAccount).where(and_(
                M.CashAccount.store_id == store_id, M.CashAccount.kind == wanted_kind,
                M.CashAccount.active == True,
            )))).scalars().first()
            if cand:
                target_account_id = cand.id
        # 2) for online orders, account bound to the online store
        if not target_account_id and payload.source == "online":
            online = (await db.execute(select(M.Store).where(M.Store.is_online == True))).scalars().first()
            if online:
                cand = (await db.execute(select(M.CashAccount).where(and_(
                    M.CashAccount.store_id == online.id, M.CashAccount.kind == wanted_kind,
                    M.CashAccount.active == True,
                )))).scalars().first()
                if cand:
                    target_account_id = cand.id
    # Pre-flight: instant-paid orders REQUIRE a destination account so we can credit it.
    # Pending COD orders may proceed without one (admin completes via Cash Received later).
    if payment_status == "paid" and not target_account_id:
        store_label = "the selected store"
        if payload.source == "online":
            store_label = "the online store"
        elif store_id:
            st = (await db.execute(select(M.Store).where(M.Store.id == store_id))).scalar_one_or_none()
            if st: store_label = st.name
        raise HTTPException(400, f"No active cash/bank account configured for {store_label}. Add one in Cash & Bank first.")

    cash_tendered = payload.cash_tendered
    cash_change = None
    if payload.payment_method == "cash" and cash_tendered is not None:
        cash_change = max(0.0, cash_tendered - max(0.0, subtotal - discount + (0.0 if payload.source == "pos" else 0.0)))

    order = M.Order(
        order_number=new_order_number(), customer_id=customer.id,
        customer_name=(payload.customer_name or customer.name or "Walk-in"),
        customer_email=(payload.customer_email or customer.email),
        customer_phone=(payload.customer_phone or customer.phone),
        shipping_address=payload.shipping_address,
        shipping_district=payload.shipping_district, shipping_city=payload.shipping_city,
        status=order_status, payment_method=payload.payment_method, payment_status=payment_status,
        subtotal=subtotal, discount=discount, coupon_code=coupon.code if coupon else None,
        shipping=shipping_fee, total=total, store_id=store_id,
        cash_tendered=cash_tendered, cash_change=cash_change,
        card_last4=payload.card_last4, cash_account_id=target_account_id,
        created_by=user.user_id if user else None, source=payload.source, notes=payload.notes,
    )
    db.add(order); await db.flush()
    for v, p, inv, price, qty, line_sub, vlabel in order_items_data:
        db.add(M.OrderItem(order_id=order.id, variant_id=v.id, product_id=p.id,
                            product_name=p.name, variant_label=vlabel, unit_price=price,
                            quantity=qty, subtotal=line_sub))
        inv.quantity = max(0, inv.quantity - qty)
        db.add(M.StockMovement(variant_id=v.id, store_id=store_id, type="sale", quantity=qty,
                                reason=f"Order {order.order_number}", reference=order.order_number,
                                user_id=user.user_id if user else None))
    if coupon:
        coupon.used_count += 1
    customer.total_orders += 1
    customer.total_spent += total
    # Cash ledger: log instant-paid orders to cash account if specified
    if payment_status == "paid" and target_account_id:
        ca = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == target_account_id))).scalar_one_or_none()
        if ca:
            ca.balance += total
            db.add(M.CashLedger(cash_account_id=ca.id, direction="in", amount=total,
                                 source_kind="order", source_id=order.id,
                                 notes=f"Order {order.order_number}",
                                 created_by=user.user_id if user else None))
    # Build receipt URL for SMS
    receipt_path = f"/receipt/{order.order_number}"
    notif_ctx = {
        "order_number": order.order_number,
        "customer_name": payload.customer_name or customer.name or "",
        "first_name": (payload.customer_name or customer.name or "").split()[0] if (payload.customer_name or customer.name) else "",
        "total": f"{total:.2f}",
        "subtotal": f"{subtotal:.2f}",
        "discount": f"{discount:.2f}",
        "shipping": f"{shipping_fee:.2f}",
        "tracking_url": receipt_path,
        "receipt_url": receipt_path,
        "brand_name": (await _resolve_brand_name(db)),
        "payment_method": payload.payment_method,
    }
    if payload.customer_email:
        await _log_notification(db, "email", payload.customer_email,
                                 f"Order {order.order_number} confirmed",
                                 f"Thank you {payload.customer_name}! Order {order.order_number} total {total:.2f}. Receipt: {receipt_path}",
                                 order.id, event_key="order_placed", ctx=notif_ctx)
    if payload.customer_phone:
        await _log_notification(db, "sms", payload.customer_phone, "Order Confirmed",
                                 f"Order {order.order_number} confirmed. Total {total:.2f}. Receipt: {receipt_path}",
                                 order.id, event_key="order_placed", ctx=notif_ctx)
    await db.commit()
    await db.refresh(order)
    response_data = await _build_order_response(order, db)
    # If this order used PayHere, attach the hidden-form payload so the
    # frontend can auto-redirect the customer to PayHere's hosted checkout.
    if payload.payment_method == "payhere":
        try:
            origin = request.headers.get("origin") or request.headers.get("referer") or ""
            if origin and origin.endswith("/"):
                origin = origin.rstrip("/")
            ph_payload = await _build_payhere_redirect(db, order, payload, origin)
            if ph_payload:
                response_data["payhere_redirect"] = ph_payload
        except Exception as e:
            logger.exception("payhere redirect build failed: %s", e)
    return response_data


@router.get("/orders/{order_number}")
async def get_order(order_number: str, db: AsyncSession = Depends(get_db)):
    o = (await db.execute(select(M.Order).where(M.Order.order_number == order_number))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    return await _build_order_response(o, db)


@router.get("/my/orders")
async def my_orders(user: M.User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    customer = (await db.execute(select(M.Customer).where(M.Customer.user_id == user.user_id))).scalar_one_or_none()
    if not customer:
        return []
    rows = (await db.execute(select(M.Order).where(M.Order.customer_id == customer.id).order_by(desc(M.Order.created_at)))).scalars().all()
    return [await _build_order_response(o, db) for o in rows]


@router.get("/admin/orders")
async def admin_orders(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin),
                        status: Optional[str] = None, q: Optional[str] = None,
                        page: int = 1, page_size: int = 50):
    base = select(M.Order)
    if status:
        base = base.where(M.Order.status == status)
    if q:
        base = base.where(or_(
            M.Order.order_number.ilike(f"%{q}%"),
            M.Order.customer_name.ilike(f"%{q}%"),
            M.Order.customer_phone.ilike(f"%{q}%"),
            M.Order.customer_email.ilike(f"%{q}%"),
        ))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    page_size = min(max(1, page_size), 100); page = max(1, page)
    rows = (await db.execute(base.order_by(desc(M.Order.created_at)).offset((page-1)*page_size).limit(page_size))).scalars().all()
    items = [await _build_order_response(o, db) for o in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


class OrderStatusIn(BaseModel):
    status: str


@router.put("/admin/orders/{oid}/status")
async def update_order_status(oid: str, payload: OrderStatusIn, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
    o = (await db.execute(select(M.Order).where(M.Order.id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    if o.status == "completed":
        raise HTTPException(400, "Completed orders are locked and cannot be changed.")
    new_status = payload.status
    # Pre-paid orders (card / KOKO / Mintpay / stripe / etc.) auto-complete on Delivered
    # and credit the destination BANK account if not already credited.
    prepaid_methods = {"card", "card_pos", "stripe", "koko", "mintpay", "paid"}
    if new_status == "delivered" and o.payment_status == "paid" and o.payment_method in prepaid_methods:
        # If we already wrote to a cash ledger (e.g. POS card), don't double-credit. We mark only when no entry exists.
        existing_ledger = (await db.execute(select(M.CashLedger).where(and_(
            M.CashLedger.source_kind == "order", M.CashLedger.source_id == o.id
        )))).scalars().first()
        if not existing_ledger:
            target = None
            if o.cash_account_id:
                target = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == o.cash_account_id))).scalar_one_or_none()
            # Prefer BANK account on the order's store
            if not target and o.store_id:
                target = (await db.execute(select(M.CashAccount).where(and_(
                    M.CashAccount.store_id == o.store_id, M.CashAccount.kind == "bank", M.CashAccount.active == True,
                )))).scalars().first()
            # Fallback to BANK on online store
            if not target:
                online = (await db.execute(select(M.Store).where(M.Store.is_online == True))).scalars().first()
                if online:
                    target = (await db.execute(select(M.CashAccount).where(and_(
                        M.CashAccount.store_id == online.id, M.CashAccount.kind == "bank", M.CashAccount.active == True,
                    )))).scalars().first()
            if target:
                target.balance += o.total
                o.cash_account_id = target.id
                db.add(M.CashLedger(cash_account_id=target.id, direction="in", amount=o.total,
                                     source_kind="order", source_id=o.id,
                                     notes=f"{o.payment_method.upper()} payout · {o.order_number}",
                                     created_by=user.user_id))
        new_status = "completed"
    o.status = new_status
    if o.customer_email:
        ctx = {"order_number": o.order_number, "customer_name": o.customer_name or "",
               "total": f"{o.total:.2f}", "tracking_url": f"/receipt/{o.order_number}",
               "brand_name": await _resolve_brand_name(db)}
        event_map = {"shipped": "order_shipped", "delivered": "order_delivered",
                     "completed": "order_delivered", "cancelled": "order_cancelled",
                     "refunded": "order_refunded"}
        await _log_notification(db, "email", o.customer_email, f"Order {o.order_number} {new_status}",
                                 f"Your order {o.order_number} status: {new_status}.", o.id,
                                 event_key=event_map.get(new_status), ctx=ctx)
        if o.customer_phone:
            await _log_notification(db, "sms", o.customer_phone, None,
                                     f"Order {o.order_number} is now {new_status}.",
                                     o.id, event_key=event_map.get(new_status), ctx=ctx)
    await db.commit()
    return {"ok": True, "status": o.status}


@router.post("/admin/orders/{oid}/cash-received")
async def mark_cash_received(oid: str, db: AsyncSession = Depends(get_db), user: M.User = Depends(require_admin)):
    o = (await db.execute(select(M.Order).where(M.Order.id == oid))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Not found")
    if o.status == "completed":
        raise HTTPException(400, "Order already completed.")
    # COD cash received → goes to BANK account of the store (delivery person banks the cash).
    # Order of preference:
    #   1) The cash_account_id already attached to the order (usually nothing for COD)
    #   2) BANK account bound to the order's store
    #   3) BANK account on the online store
    #   4) CASH account on the online store (last-resort fallback if no bank account exists)
    target = None
    if o.cash_account_id:
        target = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == o.cash_account_id))).scalar_one_or_none()
    if not target and o.store_id:
        target = (await db.execute(select(M.CashAccount).where(and_(
            M.CashAccount.store_id == o.store_id, M.CashAccount.kind == "bank", M.CashAccount.active == True
        )))).scalars().first()
    online = (await db.execute(select(M.Store).where(M.Store.is_online == True))).scalars().first()
    if not target and online:
        target = (await db.execute(select(M.CashAccount).where(and_(
            M.CashAccount.store_id == online.id, M.CashAccount.kind == "bank", M.CashAccount.active == True
        )))).scalars().first()
    if not target and online:
        target = (await db.execute(select(M.CashAccount).where(and_(
            M.CashAccount.store_id == online.id, M.CashAccount.kind == "cash", M.CashAccount.active == True
        )))).scalars().first()
    if not target:
        raise HTTPException(400, "No active bank or cash account configured for the online store. Add one in Cash & Bank first.")
    o.payment_status = "paid"
    o.status = "completed"
    o.cash_account_id = target.id
    target.balance += o.total
    db.add(M.CashLedger(cash_account_id=target.id, direction="in", amount=o.total,
                         source_kind="order", source_id=o.id,
                         notes=f"COD banked · {o.order_number}", created_by=user.user_id))
    if o.customer_email:
        ctx = {"order_number": o.order_number, "customer_name": o.customer_name or "",
               "total": f"{o.total:.2f}", "tracking_url": f"/receipt/{o.order_number}",
               "brand_name": await _resolve_brand_name(db)}
        await _log_notification(db, "email", o.customer_email, f"Order {o.order_number} completed",
                                 f"Cash received. Order {o.order_number} is now complete. Thank you.", o.id,
                                 event_key="order_paid", ctx=ctx)
    await db.commit()
    return {"ok": True, "status": o.status, "payment_status": o.payment_status,
            "credited_account_id": target.id, "credited_account_name": target.name}




# ========== ORDER STATS (sidebar badge) ==========
@router.get("/admin/orders/stats")
async def order_stats(db: AsyncSession = Depends(get_db), _: M.User = Depends(require_admin)):
    pending = (await db.execute(select(func.count()).select_from(
        select(M.Order).where(M.Order.status == "pending").subquery()))).scalar_one()
    processing = (await db.execute(select(func.count()).select_from(
        select(M.Order).where(M.Order.status == "processing").subquery()))).scalar_one()
    return {"pending": pending or 0, "processing": processing or 0}


