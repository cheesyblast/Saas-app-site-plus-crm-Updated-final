# Changelog

## Iteration 7 (2026-04-28): Discounts, SEO/GA, Payments+Shipping module, KOKO/Mintpay, Customer export
### New
- **Discount promotions** model + CRUD + storefront marquee + product badge config. Public `/api/discounts/active` returns currently-running promotions for the rolling marquee (every storefront page) and badge overlays. Admin UI: Coupon & Discount page split into two tabs — Coupons (codes) and Discounts (promotions).
- **KOKO + Mintpay** — included in `DEFAULT_PAYMENT_METHODS` (online + POS). Treated as instant-paid (`instant_paid` set) so checkout completes and books to bank. Merchant ID / API key / Secret / Sandbox fields surface in the new Payments & Shipping page for live wire-up.
- **Payments & Shipping** — extracted to its own sidebar item at `/admin/payments-shipping` with Payments + Shipping sub-tabs.
- **Settings page reshuffle** — removed "Shipping" + "Payments" tabs. Added new tabs: SEO & Analytics, Notifications (embeds Notifications page), Staff (super_admin only), Payroll. Existing Email/SMS/Account tabs kept.
- **SEO/GA** — full suite of meta fields in CompanySettings: meta_title, meta_description, meta_keywords, og_image_id, google_analytics_id (G-XXXXXXXXXX), google_site_verification, facebook_pixel_id + 5 social URLs. StorefrontLayout dynamically injects all meta tags + GA4 gtag.js + FB Pixel into `<head>` on mount.
- **Customer export** — `GET /api/admin/customers/export.csv` and `.xlsx` for marketing list downloads. Buttons on Customers page.
- **Order auto-complete on Delivered** — paid card / KOKO / Mintpay / non-COD orders auto-transition to `completed` when admin marks them `delivered`, and the order total is auto-credited to a configured BANK account via `CashLedger`.
- **COD `Cash Received` now banks to BANK account** of online store first (with cash account fallback).

### Tests
- 16 pytests in `/app/backend/tests/test_iter7_saas.py` — 16/16 pass after the marketing_opt_in fix.

### Known caveats / backlog
- DEFAULT_PAYMENT_METHODS only seeds on first-tenant init; existing tenants must add KOKO/Mintpay manually via Payments & Shipping → Add Method.
- `update_order_status` doesn't validate the status string against an enum; future improvement.
- `/api/discounts/active` filters in Python; could push start/end window into SQL for larger tenants.

## Iteration 6 (2026-04-26): Accounting integrity, sidebar groups, stricter perms
(see earlier entries)

## Iteration 5 (2026-04-26): 6-phase mega batch
(see PRD.md)
