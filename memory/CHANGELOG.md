# Changelog

## Iteration 9 (2026-02-27): Fix verification + walk-in NOT-NULL fix
### Fixed (CRITICAL from iter8)
- **POS customer collapse**: `/api/checkout` previously matched the auth user's Customer record before checking `payload.customer_phone/email`, so every POS sale by an authenticated cashier was attached to the cashier's own customer row. Now gated on `user.role == 'customer'`.
- **Local-phone customer search**: `/api/admin/customers?q=` now ORs against `normalize_phone_lk(q)` so cashiers can search by `0771234567` and find the stored `+94771234567`.
- **Order.customer_name NOT NULL violation**: walk-in POS / customer-self-checkout that omitted `customer_name` crashed on insert. Now falls back to `customer.name` ("Walk-in" default) + same for email/phone.
- **Order JSON exposes customer_id**: was the iter8 minor finding.

### Tests
- 7/7 new pytests in `/app/backend/tests/test_iter9_fixes.py` GREEN.
- 8/8 iter8 punch-list regression GREEN (was 7/8).

## Iteration 8 (2026-02-27): Brand-flash fix + 6-point punch list
### New
- **Brand logo no-flash**: `/app/frontend/src/lib/company.jsx` now caches `/api/company` in `localStorage[threadline_company_cache]` so the logo/brand renders on first paint of subsequent reloads. Navbar + AdminLayout fall back to a skeleton placeholder while loading instead of the legacy 'Brand' text.
- **Cart hydration fix**: `cart.jsx` uses a `hydrated` ref to avoid wiping `localStorage[threadline_cart]` before initial read.
- **ProductDetail color thumb strip**: ALL color images visible at the bottom (5-col grid), non-matching colors dimmed to opacity-40.
- **POS variant picker**: clicking a product image opens a Radix Dialog with all variants + stock counts; tapping a variant adds to cart and closes.
- **POS manual discount**: cashier-entered `%` or fixed `LKR` discount stacks on top of auto-promotions; flows through to `/api/checkout` as `manual_discount_percent` / `manual_discount_amount`.
- **Phone normalisation**: `frontend/src/lib/phone.js` + `backend/normalize_phone_lk` convert SL formats to `+94...` E.164 before save.
- **Reports EOD boundary**: `/api/admin/reports/pnl` extends a date-only `to_date` to 23:59:59.999. Supplier payments now included in expense totals + by-outlet breakdown.
- **Checkout auto-discounts**: storefront `Checkout.jsx` shows per-line strikethrough + Discount row in the order summary.

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
