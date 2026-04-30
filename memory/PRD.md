# Product Requirements Document

## Original Problem Statement
Full-stack SaaS online clothing store + ERP/CRM. Storefront, admin ERP/CRM, dynamic Page Builder, Supabase Postgres, JWT email/password auth (admin) + Emergent Google OAuth (customer), Mock + PayHere checkout. Sri Lankan store with district/city addresses & shipping rules. Multi-tenancy is a future phase.

## Implemented Features

### Iteration 1-2 (2026-02-25): Foundation
- JWT auth + first-run Setup Wizard, full Settings page, light/dark logos auto-applied.
- Page Builder editing Home, Header, Footer, Product Page Layout, Shipping Policy, Returns Policy + custom pages.
- Inline product image manager with per-color image binding + per-product policy notes.
- Search bars + auto-numbered orders + POS quick-search/auto-register.
- Inventory transfers between stores.
- Email/SMS provider settings (SMTP, SendGrid, Brevo, Twilio, Notify.lk) — sending MOCKED.
- Customer Email+Password & Google login + checkout autofill.
- Sri Lanka 25-district/300-city checkout + admin shipping rules + per-scope (online/POS) payment methods.

### Iteration 3 (2026-02-26): SaaS expansion
- Theme builder, per-section style, Hero video, unlimited subcategories, SHOP section in builder, Reviews carousel, payment lifecycle rebuild (card auto-completes, COD locks via "Cash Received"), pagination on lists.

### Iteration 4 (2026-02-26): SaaS polish
- 17/17 backend tested. All Phase A-H verified.

### Iteration 5 (2026-04-26): Massive 6-phase batch (single batch as requested)
**Bug fixes**
- POS crash on mount fixed (was reading paginated `/admin/products` as array; now reads `data.items`).
- Hero font theme application fixed: `index.css` `.font-heading` and `body` now use `var(--font-heading)` / `var(--font-body)` so Theme Builder font choices actually apply.

**POS upgrades (Phase 2)**
- Cash tendered + auto change calculation (POS only).
- Card last-4 capture for non-cash methods.
- Cash drawer / bank account picker on POS that auto-credits the chosen account on instant-paid orders.
- Public `/receipt/{order_number}` page (no auth) with 80mm thermal layout (`@page size: 80mm auto`) + native `window.print()` (auto-falls back to A4 because browser uses any available paper).
- POS auto-opens the receipt in a new tab on checkout; "Print Receipt" + "SMS Link" actions on the last-order panel.
- Coupons renamed to "Coupon & Discount". New `scope` field with three modes: `all`, `products` (pick specific products), `categories` (pick categories incl. sub-cats). Discount only applies to the eligible portion; checkout returns 400 if cart has no eligible items.

**Full Accounting Engine (Phase 3)**
- New `Income` table with category, amount, store_id, method (cash/bank), cash_account_id, description.
- Expenses extended with store_id, method, cash_account_id.
- Old "Expenses" page replaced with "Inc & Exp" — tabbed UI for both Expense and Income, per-outlet filter, cash/bank account picker that auto-debits/credits balances.
- New `CashAccount` table (cash drawer or bank account, optionally bound to a store) with running `balance`.
- New `CashLedger` audit trail (`in/out`, source_kind: order, expense, income, supplier).
- New `/admin/cash-accounts` page: create cash drawers + bank accounts, sees totals.
- New `GET /admin/reports/pnl` endpoint: from_date, to_date, store_id, group_by (day/month). Returns total_revenue, total_income, total_expense, profit, time series, by_outlet split.
- New `GET /admin/reports/pnl/export` endpoint: Excel xlsx via `openpyxl`.
- Reports page rewritten: date pickers, daily/monthly toggle, per-outlet filter, multi-line P&L chart (revenue / income / expense / profit), monthly sales-growth bar chart, by-outlet table, Excel export.

**Suppliers Module (Phase 4)**
- New `Supplier`, `SupplierInvoice`, `SupplierPayment` tables.
- Optional `Product.supplier_id` and `Product.cost_price`.
- New `/admin/suppliers` page: paginated CRUD, "Stock-In Invoice" (creates a payable, increments balance_owed), "Pay Supplier" (decrements balance_owed, debits chosen cash/bank account, logs CashLedger 'out' entry).
- Supplier balance owed visible on each row.

**Granular RBAC (Phase 5)**
- `User.permissions` JSON column with granular flags: products, orders, pos, inventory, customers, suppliers, reports, accounting, marketing, settings.
- Backend helper `require_perm("name")` (super_admin always passes).
- Staff form upgraded: permission checklist + "All on" / "All off" toggles + password field. New staff defaults to all-OFF (per user choice).
- Admin sidebar nav now hides items the user lacks permission for (super_admin sees everything).

**Bulk CSV Import (Phase 6)**
- New `/admin/import` page: Download template button (`/api/admin/import/products/template`), file picker, "Preview" (dry-run) and "Commit Import".
- Backend `POST /api/admin/import/products` accepts rows (parsed client-side) and supports `commit=false` for dry-run with full row-by-row summary (created/updated/errors). With commit=true, creates products + variants + initial inventory; multiple rows with same name+sku create distinct variants by size/color.

**Admin Layout**
- Sidebar collapse toggle (icon-only mode), persists in localStorage.
- New nav items: Suppliers, Bulk Import, Cash & Bank, Inc & Exp.

**Hero Builder upgrades**
- Per-element alignment toggles (eyebrow / heading / paragraph / buttons) — left/center/right.
- Optional Foreground Image (left or right of text) for product/lifestyle photo treatments.

**Schema migrations**
- Added idempotent `_migrate_columns()` on startup to ALTER existing tables for new columns (users.permissions, products.supplier_id/cost_price, coupons.scope*, expenses.store_id/method/cash_account_id, orders.cash_tendered/cash_change/card_last4/cash_account_id).

## Mocked / Pending
- Email/SMS sending (provider configs save fine; payloads logged to `notification_logs` with the receipt link)
- PayHere live charge

## Test Results
- Iteration 5: 16/16 backend pytest pass + frontend smoke pass. Test file: `/app/backend/tests/test_iter5_saas.py`. Report: `/app/test_reports/iteration_5.json`.

## Test Credentials
- Admin (super_admin): `admin@demo.com` / `demo12345`

## Code Architecture
```
backend/
  server.py               (~309 lines — startup + router mount only)
  deps.py                 (shared util helpers)
  tenant.py               (Phase B tenant context dependency)
  models.py               (+ Tenant model)
  auth.py
  database.py
  sl_locations.py
  routes/                 (27 route modules)
    auth_routes.py, setup.py, company.py, integrations.py, categories.py,
    products.py, inventory.py, stores.py, shipping_payments.py, orders.py,
    customers.py, coupons.py, expenses.py, payroll.py, staff.py, reports.py,
    marketing.py, pages.py, health.py, suppliers.py, income.py, cash_accounts.py,
    receipt.py, csv_import.py, discounts.py, customer_export.py, super_admin.py
  Dockerfile              (multi-stage Python 3.11-slim → gunicorn+uvicorn)
  .env.production.example
deploy/
  nginx/nginx.conf        (reverse-proxy with X-Tenant-Slug forwarding)
  init-letsencrypt.sh
  README.md               (operations guide)
docker-compose.yml        (backend + frontend + reverse-proxy + certbot)
.env.production.example
frontend/
  Dockerfile              (Node 20 build → nginx-alpine)
  nginx.conf              (SPA fallback + asset cache)
  src/pages/admin/POS.jsx, AdminLayout.jsx, ...
  src/pages/storefront/Receipt.jsx (public /receipt/:orderNumber)
  src/components/storefront/Navbar.jsx (skeleton placeholder, no brand flash)
  src/lib/company.jsx (localStorage cache → no flash on reload)
  src/lib/cart.jsx    (hydration ref, no empty-on-reload)
```

## Backlog
- **P0 (Phase B cut-over — IN PROGRESS, scaffold ready)**: actually inject `tenant_id` into every business query. `Tenant` model + `tenant_id` columns + super-admin CRUD + `X-Tenant-Slug` header (set by reverse-proxy nginx) + `MULTITENANT_ENFORCE` feature flag are all in place. Final step: refactor each route in `/app/backend/routes/*.py` to scope by `current_tenant.id` and flip the flag on.
- **P0**: Build a super-admin frontend (separate React route at `/super-admin` or a dedicated `admin.<domain>` subdomain) that consumes `/api/super-admin/tenants` + `/api/super-admin/stats`.
- **P0**: Live PayHere/KOKO/Mintpay charge — redirect to gateway hosted page + signature verification + webhook (`/api/payment/<provider>/notify` + `/api/payment/<provider>/return`). Currently still mocked as `instant_paid` until sandbox creds are available.
- **P1**: Tenant-aware seeding (`setup_complete` is currently global; move to per-tenant once cut-over happens).
- **P1**: Wildcard SSL automation via certbot DNS-01 plugin so new tenant subdomains don't need manual cert provisioning.
- **P1**: Email/SMS dispatch is currently synchronous (blocks the order request). Move to a background worker for bulk-send + transactional notifications.
- **P2**: `sitemap.xml` + `robots.txt` from active products + page builder pages
- **P2**: Customer-cache invalidation on PUT /api/admin/company (admins editing brand name see stale cached value until refresh; key cache by company.id+updated_at)
- **P2**: `/api/admin/customers` response should include `user_id` + `last_order_at` for the upcoming customer detail view
- **P2**: ~400×500 thumbnail variants
- **P2**: Auto-allocate supplier payments against oldest invoices first
- **P2**: Recharts width/height(-1) console warning on /admin/reports first paint
