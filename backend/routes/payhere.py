"""PayHere webhook handler.

The customer is redirected to PayHere's hosted checkout (built by
`routes/orders._build_payhere_redirect`). After they pay (or cancel) PayHere
performs a server-to-server POST to /api/payhere/notify with the final result.
We verify the `md5sig` field, then mark the order paid + credit the cash
ledger + fire the order_paid notification template.

Reference: https://developers.payhere.co/docs/checkout/ (md5sig formula).
"""
from __future__ import annotations

import hashlib
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
import models as M
from routes.orders import _log_notification, _resolve_brand_name

logger = logging.getLogger(__name__)
router = APIRouter()


async def _get_payhere_config(db: AsyncSession) -> Optional[dict]:
    pm = (await db.execute(
        select(M.PaymentMethod).where(
            M.PaymentMethod.code == "payhere",
            M.PaymentMethod.active == True,  # noqa: E712
        )
    )).scalars().first()
    if not pm:
        return None
    cfg = pm.config or {}
    return {
        "merchant_id": (cfg.get("merchant_id") or "").strip(),
        "merchant_secret": (cfg.get("secret") or cfg.get("merchant_secret") or "").strip(),
    }


def _compute_md5sig(merchant_id: str, order_id: str, payhere_amount: str,
                    payhere_currency: str, status_code: str,
                    merchant_secret: str) -> str:
    secret_md5 = hashlib.md5(merchant_secret.encode("utf-8")).hexdigest().upper()
    raw = f"{merchant_id}{order_id}{payhere_amount}{payhere_currency}{status_code}{secret_md5}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest().upper()


# Map PayHere status codes to our internal order/payment status.
# 2 = success, 0 = pending, -1 = cancelled, -2 = failed, -3 = chargedback.
_STATUS_MAP = {
    "2": ("paid", "completed"),
    "0": ("pending", "pending_payment"),
    "-1": ("cancelled", "cancelled"),
    "-2": ("failed", "cancelled"),
    "-3": ("refunded", "refunded"),
}


@router.post("/payhere/notify", response_class=PlainTextResponse)
async def payhere_notify(
    db: AsyncSession = Depends(get_db),
    merchant_id: str = Form(...),
    order_id: str = Form(...),                # we sent order_number here
    payhere_amount: str = Form(...),
    payhere_currency: str = Form(...),
    status_code: str = Form(...),
    md5sig: str = Form(...),
    payment_id: Optional[str] = Form(None),
    status_message: Optional[str] = Form(None),
    card_holder_name: Optional[str] = Form(None),
    card_no: Optional[str] = Form(None),
    method: Optional[str] = Form(None),
):
    """PayHere server-to-server callback. Must be HTTPS-reachable from PayHere.
    Returns a plain `OK` on success (anything else makes PayHere retry).
    """
    cfg = await _get_payhere_config(db)
    if not cfg or not cfg["merchant_secret"]:
        logger.error("payhere notify received but no active config")
        raise HTTPException(status_code=503, detail="PayHere not configured")
    if cfg["merchant_id"] and merchant_id != cfg["merchant_id"]:
        logger.warning("payhere notify merchant_id mismatch: got=%s want=%s", merchant_id, cfg["merchant_id"])
        raise HTTPException(status_code=400, detail="Invalid merchant")

    expected = _compute_md5sig(merchant_id, order_id, payhere_amount,
                               payhere_currency, status_code,
                               cfg["merchant_secret"])
    if expected != md5sig.upper():
        logger.warning("payhere notify md5sig mismatch for order=%s", order_id)
        raise HTTPException(status_code=400, detail="Invalid signature")

    o = (await db.execute(
        select(M.Order).where(M.Order.order_number == order_id)
    )).scalar_one_or_none()
    if not o:
        logger.warning("payhere notify for unknown order=%s", order_id)
        # Acknowledge with 200 so PayHere doesn't retry forever; we don't
        # want stuck retries for already-deleted orders.
        return "OK"

    pay_status, ord_status = _STATUS_MAP.get(status_code, ("pending", "pending_payment"))

    # Idempotency: don't double-credit if webhook is replayed.
    already_paid = (o.payment_status == "paid")

    o.payment_status = pay_status
    o.status = ord_status
    o.payment_method = "payhere"
    if card_no and len(card_no) >= 4:
        o.card_last4 = card_no[-4:]

    if pay_status == "paid" and not already_paid:
        # Credit a bank cash account (PayHere settles to bank).
        target = None
        if o.cash_account_id:
            target = (await db.execute(select(M.CashAccount).where(M.CashAccount.id == o.cash_account_id))).scalar_one_or_none()
        if not target and o.store_id:
            target = (await db.execute(select(M.CashAccount).where(and_(
                M.CashAccount.store_id == o.store_id, M.CashAccount.kind == "bank",
                M.CashAccount.active == True,  # noqa: E712
            )))).scalars().first()
        if not target:
            online = (await db.execute(select(M.Store).where(M.Store.is_online == True))).scalars().first()  # noqa: E712
            if online:
                target = (await db.execute(select(M.CashAccount).where(and_(
                    M.CashAccount.store_id == online.id, M.CashAccount.kind == "bank",
                    M.CashAccount.active == True,  # noqa: E712
                )))).scalars().first()
        if target:
            target.balance += o.total
            o.cash_account_id = target.id
            db.add(M.CashLedger(
                cash_account_id=target.id, direction="in", amount=o.total,
                source_kind="order", source_id=o.id,
                notes=f"PayHere · {o.order_number}" + (f" · {payment_id}" if payment_id else ""),
            ))
        else:
            logger.warning("payhere paid but no bank cash account to credit for order=%s", order_id)

        # Fire order_paid notification (templates if configured).
        notif_ctx = {
            "order_number": o.order_number,
            "customer_name": o.customer_name or "",
            "first_name": (o.customer_name or "").split()[0] if o.customer_name else "",
            "total": f"{o.total:.2f}",
            "tracking_url": f"/receipt/{o.order_number}",
            "receipt_url": f"/receipt/{o.order_number}",
            "brand_name": await _resolve_brand_name(db),
            "payment_method": "payhere",
        }
        if o.customer_email:
            await _log_notification(
                db, "email", o.customer_email,
                f"Payment received · Order {o.order_number}",
                f"Thank you! We received your payment for order {o.order_number}.",
                o.id, event_key="order_paid", ctx=notif_ctx,
            )
        if o.customer_phone:
            await _log_notification(
                db, "sms", o.customer_phone, None,
                f"Payment received for order {o.order_number}. Thank you!",
                o.id, event_key="order_paid", ctx=notif_ctx,
            )

    await db.commit()
    return "OK"
