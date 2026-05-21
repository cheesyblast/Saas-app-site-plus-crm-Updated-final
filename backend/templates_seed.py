"""Library of professionally-worded notification templates that the
merchant can install with one click. Each template is text-only (works
for both email and SMS) plus an optional HTML email body for events
where rich formatting is worth it (order_placed, order_paid, etc).

Placeholders supported by `dispatcher.render_template_for_event`:
    {{customer_name}}   {{first_name}}
    {{order_number}}    {{total}}     {{subtotal}}     {{discount}}
    {{shipping}}        {{tracking_url}}   {{receipt_url}}
    {{brand_name}}      {{payment_method}}

The library is split by event_key so the admin sees them grouped.
"""
from __future__ import annotations

# Brand-style email HTML — minimal inline-CSS so it survives Gmail/Outlook.
_EMAIL_HTML = """<!doctype html><html><body style="margin:0;padding:0;background:#f5f3ef;font-family:'Helvetica Neue',Arial,sans-serif;color:#1c1c1c;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e1d8;">
      <tr><td style="padding:32px 40px 16px 40px;">
        <div style="font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:#8a8275;">{{brand_name}}</div>
        <h1 style="font-size:24px;font-weight:700;margin:8px 0 0 0;letter-spacing:-.01em;">__HEADLINE__</h1>
      </td></tr>
      <tr><td style="padding:8px 40px 24px 40px;font-size:15px;line-height:1.65;color:#3a3a3a;">__BODY_HTML__</td></tr>
      <tr><td style="padding:0 40px 32px 40px;">__CTA__</td></tr>
      <tr><td style="border-top:1px solid #ece8de;padding:18px 40px;font-size:11px;color:#8a8275;letter-spacing:.15em;text-transform:uppercase;">
        {{brand_name}} &middot; Need help? Reply to this email and our team will get back to you.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""


def _h(headline: str, body_html: str, cta_text: str = "", cta_url: str = "") -> str:
    cta = ""
    if cta_text and cta_url:
        cta = (f'<a href="{cta_url}" style="display:inline-block;background:#1c1c1c;color:#fff;'
               f'text-decoration:none;padding:14px 22px;font-size:12px;letter-spacing:.2em;'
               f'text-transform:uppercase;">{cta_text}</a>')
    return _EMAIL_HTML.replace("__HEADLINE__", headline)\
                       .replace("__BODY_HTML__", body_html)\
                       .replace("__CTA__", cta)


TEMPLATES = [
    # ---------- Transactional ----------
    {
        "event_key": "order_placed", "channel": "email", "is_default": True,
        "name": "Order placed — Professional",
        "subject": "Order {{order_number}} received · {{brand_name}}",
        "body_html": _h(
            "Thank you, {{first_name}}.",
            "We've received your order <strong>{{order_number}}</strong> and our team is preparing it now. "
            "You'll get another email the moment it ships. Total paid today: <strong>{{total}}</strong>.",
            "View receipt", "{{receipt_url}}",
        ),
        "body": "Hi {{first_name}}, thank you for shopping with {{brand_name}}!\n\nOrder {{order_number}} is confirmed. Total: {{total}}.\nView your receipt: {{receipt_url}}\n\nWe'll email you again the moment your order ships.",
    },
    {
        "event_key": "order_placed", "channel": "sms", "is_default": True,
        "name": "Order placed — SMS",
        "subject": None,
        "body": "{{brand_name}}: Hi {{first_name}}, order {{order_number}} confirmed. Total {{total}}. Receipt: {{receipt_url}}",
    },
    {
        "event_key": "order_paid", "channel": "email", "is_default": True,
        "name": "Payment received — Professional",
        "subject": "Payment received · Order {{order_number}}",
        "body_html": _h(
            "Payment received — thank you!",
            "We've received your payment of <strong>{{total}}</strong> for order <strong>{{order_number}}</strong>. "
            "Your order is now in our fulfillment queue and will ship within 1–2 business days.",
            "Track order", "{{tracking_url}}",
        ),
        "body": "Hi {{first_name}}, we've received your payment of {{total}} for order {{order_number}}. We'll ship within 1–2 business days.\n\nTrack: {{tracking_url}}",
    },
    {
        "event_key": "order_paid", "channel": "sms", "is_default": True,
        "name": "Payment received — SMS",
        "subject": None,
        "body": "{{brand_name}}: Payment of {{total}} received for {{order_number}}. Shipping soon. Thank you!",
    },
    {
        "event_key": "order_shipped", "channel": "email", "is_default": True,
        "name": "Order shipped — Professional",
        "subject": "Your order is on the way · {{order_number}}",
        "body_html": _h(
            "Good news — your order has shipped.",
            "Order <strong>{{order_number}}</strong> just left our warehouse. "
            "You'll usually receive it within 2–4 business days within Sri Lanka.",
            "Track shipment", "{{tracking_url}}",
        ),
        "body": "Hi {{first_name}}, order {{order_number}} has shipped! Expected delivery: 2–4 business days.\nTrack: {{tracking_url}}",
    },
    {
        "event_key": "order_shipped", "channel": "sms", "is_default": True,
        "name": "Order shipped — SMS",
        "subject": None,
        "body": "{{brand_name}}: Order {{order_number}} shipped. Track: {{tracking_url}}",
    },
    {
        "event_key": "order_delivered", "channel": "email", "is_default": True,
        "name": "Order delivered — Professional",
        "subject": "Your order has arrived · {{order_number}}",
        "body_html": _h(
            "Welcome to the {{brand_name}} family.",
            "Your order <strong>{{order_number}}</strong> has been delivered. We'd love to hear what you think — "
            "your review helps other shoppers and helps us keep getting better.",
            "Leave a review", "{{tracking_url}}",
        ),
        "body": "Hi {{first_name}}, your order {{order_number}} has been delivered. Enjoy! Let us know what you think.",
    },
    {
        "event_key": "order_delivered", "channel": "sms", "is_default": True,
        "name": "Order delivered — SMS",
        "subject": None,
        "body": "{{brand_name}}: Order {{order_number}} delivered. Thank you for shopping with us!",
    },
    {
        "event_key": "order_cancelled", "channel": "email", "is_default": True,
        "name": "Order cancelled — Professional",
        "subject": "Order {{order_number}} cancelled",
        "body_html": _h(
            "Your order has been cancelled.",
            "Order <strong>{{order_number}}</strong> has been cancelled. If the payment was charged, "
            "the refund will reach you within 5–7 business days. "
            "If this was a mistake, please reply to this email and we'll help you restore it.",
            "Shop again", "{{receipt_url}}",
        ),
        "body": "Hi {{first_name}}, order {{order_number}} has been cancelled. Refunds (if any) reach you within 5–7 business days. Reply if this was unintended.",
    },
    {
        "event_key": "order_cancelled", "channel": "sms", "is_default": True,
        "name": "Order cancelled — SMS",
        "subject": None,
        "body": "{{brand_name}}: Order {{order_number}} cancelled. Refunds reach you in 5–7 working days.",
    },
    # ---------- Recovery ----------
    {
        "event_key": "abandoned_cart", "channel": "email", "is_default": True,
        "name": "Abandoned cart — Friendly nudge",
        "subject": "You left something behind · {{brand_name}}",
        "body_html": _h(
            "Did you forget something?",
            "Hi {{first_name}}, your cart is still waiting for you at <strong>{{brand_name}}</strong>. "
            "Items run out quickly — we've saved your selection but can't promise it'll stay in stock.",
            "Complete checkout", "{{tracking_url}}",
        ),
        "body": "Hi {{first_name}}, your cart at {{brand_name}} is still waiting. Complete your checkout: {{tracking_url}}",
    },
    {
        "event_key": "abandoned_cart", "channel": "sms", "is_default": True,
        "name": "Abandoned cart — SMS",
        "subject": None,
        "body": "{{brand_name}}: Hi {{first_name}}, you left items in your cart. Complete order: {{tracking_url}}",
    },
    # ---------- Marketing blasts (use {{first_name}} only — no order context) ----------
    {
        "event_key": "marketing_promo", "channel": "email", "is_default": False,
        "name": "Marketing — Seasonal promo",
        "subject": "A little something for you · {{brand_name}}",
        "body_html": _h(
            "A token of our thanks.",
            "Hi {{first_name}}, we wanted to thank you for being part of <strong>{{brand_name}}</strong>. "
            "For the next 48 hours, here's an early-access drop just for you.",
            "Shop the drop", "/shop",
        ),
        "body": "Hi {{first_name}}, a little something from {{brand_name}} — early access to our new drop. Just for you.",
    },
    {
        "event_key": "marketing_promo", "channel": "sms", "is_default": False,
        "name": "Marketing — SMS",
        "subject": None,
        "body": "{{brand_name}}: Hi {{first_name}}, our new drop is live with early-access pricing for 48h.",
    },
    {
        "event_key": "winback", "channel": "email", "is_default": False,
        "name": "Win-back — We miss you",
        "subject": "We miss you, {{first_name}}",
        "body_html": _h(
            "It's been a while.",
            "Hi {{first_name}}, we noticed you haven't shopped with {{brand_name}} in a while. "
            "We've been busy adding new designs we think you'll love.",
            "See what's new", "/shop",
        ),
        "body": "Hi {{first_name}}, we miss you! Come see what's new at {{brand_name}}.",
    },
]
