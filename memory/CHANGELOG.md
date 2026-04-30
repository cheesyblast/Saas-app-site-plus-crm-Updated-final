# Changelog

## Iteration 11 (2026-04-30): Theme/Auth/Branding/Marketing overhaul + live dispatch

### Theme editor (full fix)
- `applyTheme()` now sets CSS vars on `:root` AND classes the `<html>` element with `theme-admin` when the saved theme has `apply_to_admin: true`.
- New `index.css` rules: `.storefront-shell` (every storefront page), `html.theme-admin .admin-shell` (admin shell when admin theming enabled). `body` defaults pull from CSS vars so font/bg/text actually flow through.
- `StorefrontLayout` no longer hardcodes `bg-zinc-950 text-white`; `AdminLayout` adds `.admin-shell` class + reads theme on mount.
- Builder.jsx Theme dialog has a new `apply_to_admin` toggle (default OFF).

### Authentication (Google OAuth gated)
- New CompanySettings columns: `auth_google_enabled` (bool, default false), `auth_google_client_id`, `auth_google_client_secret`.
- Default state: Google sign-in disabled. NO Google button on customer Login/Register/Checkout or admin Login.
- New `Settings → Authentication` tab (super_admin only): toggle + Client ID/Secret inputs + step-by-step Google Cloud Console instructions. Secret is never echoed back from the GET response.
- Customer Login/Register/Checkout pages render the Google button only when `company.auth_google_enabled === true`.
- Admin login is JWT-only forever (no Google option ever).

### Logo flexibility (Branding tab)
- New CompanySettings columns: `header_logo_height` (int, default 32), `footer_logo_height` (default 40), `logo_display_mode` ('auto' | 'fit-height' | 'fit-width').
- New `Settings → Branding` tab with sliders (24–80px header, 32–96px footer) + display-mode dropdown + live preview thumbnail.
- Navbar + Footer apply the height inline; `.object-contain` vs `.object-cover` picks based on display mode.

### Marketing consolidation (no sub-routes)
- Marketing.jsx rewritten with 6 horizontal tabs: **Campaigns / Email Setup / SMS Setup / Templates / Bulk Send / Logs**.
- Email/SMS/Notifications tabs REMOVED from Settings.
- New `NotificationTemplate` model + CRUD at `/api/admin/marketing/templates` for per-event email/SMS templates (`order_placed`, `order_paid`, `order_shipped`, `order_delivered`, `order_cancelled`, `order_refunded`, `marketing_blast`).
- New bulk-send endpoint `/api/admin/marketing/bulk-send` with: customer_ids manual select, district filter, marketing_opt_in_only toggle, `{{customer_name}}`/`{{first_name}}` substitution.

### Live email/SMS dispatch
- New `/app/backend/dispatcher.py` with provider implementations: SMTP, SendGrid, Brevo, Twilio, Notify.lk.
- `_log_notification()` in routes/orders.py now calls `dispatcher.dispatch(...)`. If a provider is configured (Marketing → Email/SMS Setup) it's actually sent; otherwise falls back to `status='mocked'` so the order flow keeps working.
- The flip from MOCKED → LIVE happens automatically the moment the merchant pastes a valid API key and saves the integration. No code changes needed.

### Quality of life
- Removed "Made with Emergent" badge from `index.html` (storefront + admin).
- IntegrationTab exported from Settings.jsx for reuse from Marketing.

### Tests
- 7/7 new pytests in `test_iter11_branding_marketing.py` GREEN.
- 19/19 across iter9 + iter10 + iter11 GREEN.
- Frontend e2e: 16/16 explicit assertions GREEN per testing agent (iter10 report).

### Backlog opened
- Live PayHere/KOKO/Mintpay redirect+webhook (currently still mocked as instant_paid — needs sandbox creds to test).
- Server.py modularisation backlog still open (now 309 lines but several routes/* files growing — consider further splits).
- Email/SMS dispatch is synchronous in-request — for high-volume bulk sends, move to a background worker (RQ / Celery / arq).

## Iteration 10 (2026-04-29): server.py refactor + Dockerization + Multi-tenancy scaffold
(see PRD.md for full details)

## Iteration 9 (2026-02-27): Fix verification + walk-in NOT-NULL fix
(see PRD.md)

## Iteration 8 (2026-02-27): Brand-flash fix + 6-point punch list
(see PRD.md)

### Major refactor
- **server.py: 3110 → 309 lines.** Split into `deps.py` (shared utilities) + 27 focused route modules under `/app/backend/routes/` (auth, products, orders, reports, suppliers, csv_import, discounts, page builder, etc.). server.py now only contains startup, default-data seeding, and router mounting. Each module owns its own `APIRouter()`. All existing endpoints preserved verbatim (decorator change only). Cross-module helpers (`_ensure_default_store`, `_descendant_ids`) moved to `deps.py` to avoid circular imports.
- **Migration runner**: each ALTER TABLE now wrapped in its own SAVEPOINT (`begin_nested`), so a single missing-table error no longer poisons the whole startup transaction.

### Dockerization (P0 — production stack)
- `/app/backend/Dockerfile` — Python 3.11-slim multi-stage (builder venv → runtime). Runs `gunicorn server:app -k uvicorn.workers.UvicornWorker` with 4 workers + healthcheck against `/api/company`.
- `/app/frontend/Dockerfile` — Node 20-alpine build → nginx-alpine runtime. CRA build with `REACT_APP_BACKEND_URL` injected via `ARG`. SPA fallback nginx config with long-cache hashed assets.
- `/app/docker-compose.yml` — backend + frontend + reverse-proxy nginx + certbot. ACME via webroot challenge. Auto-renewal loop every 12h.
- `/app/deploy/nginx/nginx.conf` — TLS termination, HTTP→HTTPS redirect, `$tenant_slug` extracted from leftmost Host label and forwarded to backend as `X-Tenant-Slug` header (Phase B-ready).
- `/app/deploy/init-letsencrypt.sh` — idempotent first-time SSL bootstrap (wildcard + apex + admin subdomain).
- `/app/deploy/README.md` — full operations guide for self-hosted Supabase Postgres on a separate VPS (custom DB host, no `supabase.co` assumption).
- `.env.production.example` templates at repo root + backend.

### Multi-tenancy scaffold (Phase B kick-off)
- New `Tenant` model (`models.py`): `slug`, `name`, `custom_domain`, `plan` (trial/starter/pro/enterprise), `status` (active/suspended/deleted), `owner_user_id`, `settings` JSON.
- `tenant_id VARCHAR(64)` column added (idempotently, nullable for back-compat) to: users, products, categories, orders, customers, coupons, discounts, stores, expenses, income, cash_accounts, suppliers, payment_methods, shipping_rules, custom_pages, page_sections, integration_settings, marketing_campaigns, payroll.
- Default tenant (slug=`default`, plan=`enterprise`) seeded on first boot. All single-tenant rows are implicitly attached to it.
- `tenant.py`: `get_current_tenant` FastAPI dependency reads `X-Tenant-Slug` header (set by reverse-proxy nginx) → falls back to query param → falls back to `default`. Feature-flagged via `MULTITENANT_ENFORCE` env var (off by default for back-compat). Returns 404/402/410 for unknown/suspended/deleted tenants when flag is on.
- New super-admin router (`routes/super_admin.py`) at `/api/super-admin/*`: list, create, get, update, soft-delete tenants + platform stats (`/super-admin/stats` returns tenant counts + total orders + total users). All gated on `role == 'super_admin'`. Default tenant is undeletable.
- Footer brand-flash fix: same skeleton placeholder pattern as Navbar/AdminLayout.

### Tests
- 5/5 new pytests in `/app/backend/tests/test_iter10_multitenancy.py` GREEN: super-admin auth gating, default tenant seeded, full CRUD lifecycle (with random slug per run), platform stats shape, business tables migrated.
- All 7 iter9 + 8 iter8 regression pytests still GREEN after refactor.

### Backlog opened
- Phase B cut-over: actually inject `tenant_id` into every business query (currently the column exists but isn't enforced). Flip `MULTITENANT_ENFORCE=true` once all routes are tenant-scoped.
- Build a super-admin frontend (separate React route at `/super-admin` or a dedicated subdomain).
- Tenant-aware seeding: `setup_complete` is currently global; move to per-tenant.
- Wildcard SSL automation: certbot DNS-01 plugin to provision `*.example.com` without manual subdomain provisioning.

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
(see PRD.md for full feature list)

## Iteration 7 (2026-04-28): Discounts, SEO/GA, Payments+Shipping module, KOKO/Mintpay, Customer export
(see PRD.md)

## Iterations 1–6
(see PRD.md)

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
