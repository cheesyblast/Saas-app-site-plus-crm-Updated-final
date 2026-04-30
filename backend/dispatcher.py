"""Live email + SMS dispatch.

Reads the merchant-configured default integration (from /admin/integrations)
and calls the provider's REST API. If no active provider is configured the
notification is logged as 'mocked' so order flow keeps working.

Providers supported (client-self-config — merchant pastes API keys in the
Marketing → Email/SMS Setup tab):
  - Email: smtp, sendgrid, brevo
  - SMS:   twilio, notify-lk

Phase-B note: this module reads from the global IntegrationSetting table; once
multi-tenancy enforcement is on, callers MUST pass tenant_id and the lookup
should scope by that.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from typing import Optional, Tuple

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models as M

logger = logging.getLogger(__name__)


async def _get_default_provider(db: AsyncSession, kind: str) -> Optional[M.IntegrationSetting]:
    """Return the active default integration for the given kind ('email'/'sms'),
    or any active one if no default is set, or None if none exist."""
    rows = (await db.execute(
        select(M.IntegrationSetting).where(
            M.IntegrationSetting.kind == kind,
            M.IntegrationSetting.active == True,  # noqa: E712
        )
    )).scalars().all()
    if not rows:
        return None
    for r in rows:
        if r.is_default:
            return r
    return rows[0]


def _send_email_smtp(cfg: dict, to: str, subject: str, body: str) -> Tuple[bool, str]:
    """Generic SMTP send. cfg keys: host, port, username, password, from, use_tls (bool)."""
    host = cfg.get("host"); port = int(cfg.get("port") or 587)
    user = cfg.get("username"); pwd = cfg.get("password")
    sender = cfg.get("from") or user
    if not (host and sender):
        return False, "Missing host/from"
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject or ""
    msg["From"] = sender
    msg["To"] = to
    try:
        if cfg.get("use_tls", True):
            ctx = ssl.create_default_context()
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.starttls(context=ctx)
                if user and pwd:
                    s.login(user, pwd)
                s.sendmail(sender, [to], msg.as_string())
        else:
            with smtplib.SMTP_SSL(host, port, timeout=15) as s:
                if user and pwd:
                    s.login(user, pwd)
                s.sendmail(sender, [to], msg.as_string())
        return True, "sent"
    except Exception as e:
        return False, f"smtp: {e}"


def _send_email_sendgrid(cfg: dict, to: str, subject: str, body: str) -> Tuple[bool, str]:
    """SendGrid v3 mail/send. cfg keys: api_key, from."""
    api_key = cfg.get("api_key"); sender = cfg.get("from")
    if not (api_key and sender):
        return False, "Missing api_key/from"
    try:
        r = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "personalizations": [{"to": [{"email": to}]}],
                "from": {"email": sender},
                "subject": subject or "",
                "content": [{"type": "text/plain", "value": body}],
            },
            timeout=15,
        )
        if r.status_code in (200, 202):
            return True, "sent"
        return False, f"sendgrid {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, f"sendgrid: {e}"


def _send_email_brevo(cfg: dict, to: str, subject: str, body: str) -> Tuple[bool, str]:
    """Brevo (formerly Sendinblue) v3 smtp/email. cfg keys: api_key, from, from_name."""
    api_key = cfg.get("api_key"); sender = cfg.get("from")
    if not (api_key and sender):
        return False, "Missing api_key/from"
    try:
        r = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": api_key, "Content-Type": "application/json", "accept": "application/json"},
            json={
                "sender": {"email": sender, "name": cfg.get("from_name") or sender},
                "to": [{"email": to}],
                "subject": subject or "",
                "textContent": body,
            },
            timeout=15,
        )
        if r.status_code in (200, 201, 202):
            return True, "sent"
        return False, f"brevo {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, f"brevo: {e}"


def _send_sms_twilio(cfg: dict, to: str, body: str) -> Tuple[bool, str]:
    """Twilio Programmable Messaging. cfg keys: account_sid, auth_token, from."""
    sid = cfg.get("account_sid"); tok = cfg.get("auth_token"); sender = cfg.get("from")
    if not (sid and tok and sender):
        return False, "Missing account_sid/auth_token/from"
    try:
        r = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data={"From": sender, "To": to, "Body": body},
            auth=(sid, tok),
            timeout=15,
        )
        if r.status_code in (200, 201):
            return True, "sent"
        return False, f"twilio {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, f"twilio: {e}"


def _send_sms_notify_lk(cfg: dict, to: str, body: str) -> Tuple[bool, str]:
    """Notify.lk Sri Lanka SMS. cfg keys: user_id, api_key, sender_id."""
    uid = cfg.get("user_id"); key = cfg.get("api_key"); sender = cfg.get("sender_id") or "NotifyDEMO"
    if not (uid and key):
        return False, "Missing user_id/api_key"
    # Notify.lk wants the recipient in 947XXXXXXXX format (no +).
    msisdn = to.lstrip("+")
    try:
        r = httpx.get(
            "https://app.notify.lk/api/v1/send",
            params={"user_id": uid, "api_key": key, "sender_id": sender, "to": msisdn, "message": body},
            timeout=15,
        )
        if r.status_code == 200:
            data = r.json()
            if data.get("status") == "success":
                return True, "sent"
            return False, f"notify.lk: {data.get('message') or data}"
        return False, f"notify.lk {r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, f"notify.lk: {e}"


async def dispatch(db: AsyncSession, channel: str, to: str, subject: Optional[str], body: str) -> Tuple[str, str]:
    """Pick the merchant's configured provider for `channel` and send.

    Returns (status, provider_name) — status is one of:
        sent      — provider returned 2xx
        failed    — provider rejected or threw
        mocked    — no active provider configured; nothing sent (caller logs)
    """
    if not to:
        return "failed", "no-recipient"
    integ = await _get_default_provider(db, channel)
    if not integ:
        return "mocked", "none"
    cfg = integ.config or {}
    provider = integ.provider
    try:
        if channel == "email":
            if provider == "smtp":
                ok, msg = _send_email_smtp(cfg, to, subject or "", body)
            elif provider == "sendgrid":
                ok, msg = _send_email_sendgrid(cfg, to, subject or "", body)
            elif provider == "brevo":
                ok, msg = _send_email_brevo(cfg, to, subject or "", body)
            else:
                return "failed", f"unknown:{provider}"
        elif channel == "sms":
            if provider == "twilio":
                ok, msg = _send_sms_twilio(cfg, to, body)
            elif provider == "notify-lk":
                ok, msg = _send_sms_notify_lk(cfg, to, body)
            else:
                return "failed", f"unknown:{provider}"
        else:
            return "failed", f"unknown-channel:{channel}"
    except Exception as e:
        logger.exception("dispatch crashed: %s", e)
        return "failed", f"{provider}: crash"
    if not ok:
        logger.warning("dispatch %s/%s failed for %s: %s", channel, provider, to, msg)
    return ("sent" if ok else "failed"), provider
