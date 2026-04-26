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
**Theme** — Global background color, body text color, muted text color, eyebrow/heading/body fonts (12 Google Font choices), heading-scale slider, body line-height slider. Applied via CSS variables.

**Per-Section Style** — Every Page Builder section gets its own background color, text color, padding (none/sm/md/lg/xl), and overlay opacity slider. Hero supports separate per-line size for headline 1 + headline 2 (xs → 2xl).

**Hero Video** — Hero accepts an MP4 background (recommended 1920×1080, ≤15MB, 10–20s). Autoplays muted with viewer-controllable mute & play/pause buttons.

**Unlimited-depth Subcategories** — `Category.parent_id` (recursive). Admin Categories table indents children. Storefront `/api/products?category={parent_slug}` includes ALL descendants.

**SHOP Section in Page Builder** — New section type. Shows all products OR products in a selected category (incl. sub-cats). Configurable max items + 2-5 column grid.

**Reviews Carousel** — Reviews section toggles between Grid and auto-scroll Carousel with direction (LTR/RTL), speed (slow/medium/fast), autoplay on/off. Pause-on-hover.

**Cart Bug Fix** — Adding two different colored variants of the same product now shows the correct color-bound image per cart row.

**Payment Lifecycle Rebuild**
- Card / instant gateways → checkout sets `payment_status=paid` AND `status=completed` immediately.
- COD → checkout sets `payment_status=pending` `status=pending`.
- Admin Orders page shows a **"Cash Received"** button on COD pending rows. Clicking it flips to `paid` + `completed` and revenue updates.
- Once `completed`, the status is **locked**: the status select is replaced by a green "Completed" badge with a lock icon. PUT /status returns 400.
- Orders filter dropdown gained a "Completed" option.

**Pagination (50 / page, recent first)** — Orders, Products, Inventory, Coupons, Expenses now return `{items, total, page, page_size}` and render a Prev/Next + "Page X / Y" footer. Categories paginates client-side over the recursive tree.

## Mocked / Pending
- Email/SMS sending (provider configs save fine; payloads logged to `notification_logs`)
- PayHere live charge

## Test Results
- Iteration 3: 23/23 backend + 12/12 frontend ✅
- Iteration 4: 17/17 backend + frontend smoke ✅ — no bugs found.
- Test files: `/app/backend/tests/test_iter4_saas.py`, `/app/test_reports/iteration_4.json`.

## Backlog
- P1: PayHere live charge integration
- P1: Wire SendGrid/Brevo/Twilio/Notify.lk live dispatch
- P1: Bulk CSV import (products + inventory)
- P2: ~400×500 thumbnail variants
- P2: Multi-tenancy (tenants table, tenant_id everywhere, super-admin panel)
- P2: Split server.py (~2080 lines) into routers
- P2: Stricter Pydantic models for ThemeConfig (currently dict)
