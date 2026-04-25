# Product Requirements Document

## Original Problem Statement
Full-stack SaaS online clothing store + ERP/CRM backend. Storefront (home, shop, cart, checkout), admin ERP/CRM (products, inventory, POS, orders, staff), dynamic Page Builder, Supabase Postgres, JWT email/password auth (admin) + Emergent Google OAuth (customer), Mock + PayHere checkout. Sri Lankan store with district/city addresses & shipping rules. Multi-tenancy is a future phase.

## Current Architecture
- **Backend**: FastAPI async + SQLAlchemy 2 + Supabase Postgres (Transaction Pooler). RLS enabled on every table. JWT (HS256) sessions in httponly samesite=none cookies for password auth, DB-backed sessions for Google OAuth flow.
- **Frontend**: React 19 + Tailwind + shadcn/ui + axios. Custom Page Builder routes.
- **Storage**: Images stored as base64 BYTEA in Postgres, streamed via `/api/images/{id}` and `/api/media/{id}`.
- **Theme**: CSS variables `--theme-primary` etc., editable from Page Builder.

## Implemented Features (this session, 2026-02-25)
### Phase A — Auth Pivot + Setup + Settings
- JWT email+password auth with bcrypt + brute-force lockout (5 attempts/15 min).
- Idempotent first-run Setup Wizard at `/setup` (3 steps: company → contacts → admin).
- Admin can change own password from Settings → My Account.
- Settings page (`/admin/settings`) with tabs: Company, My Account, Email providers, SMS providers, Shipping, Payments.
- Company logo upload (light + dark variants, ≤1 MB) auto-applied to storefront navbar/footer + admin sidebar.
- `/api/auth/login`, `/auth/register`, `/auth/me`, `/auth/logout`, `/auth/change-password`. Google OAuth retained at `/auth/session` (customer-only).

### Phase B — Page Builder Extensions
- Editable: Home (`home`), Site Header (`_header`), Site Footer (`_footer`), Product Page Layout (`_product_page`), Shipping Policy (`shipping-policy`), Returns & Refunds (`returns-policy`).
- Custom Pages: admins can create new builder-driven pages (`/page/{slug}`).
- Header builder: editable menu items, style (minimal/bold/classic), toggles for search/cart/login/sticky.
- Footer builder: tagline, support contacts, columns of links, marquee toggle, copyright.
- Product page tail-sections render below product detail (e.g. "Same Category" smart slot).

### Phase C — Products Overhaul
- Inline image management inside product modal (was separate before).
- Per-color image binding: each image can be tagged to a specific color; storefront swaps main image when shopper picks color.
- Admin "Set Main" toggle per image.
- Per-product Shipping & Returns notes — short blurb + auto "Read more →" link to policy pages.

### Phase D — Search & UX
- Search bars on Products, Categories, Inventory, Orders, Customers, Coupons, Expenses.
- Customers searchable by name/phone/email/order number.
- Auto-numbered orders: `ORD-YYYYMMDD-XXXXX`.
- POS: customer quick-search (debounced) + auto-register when entering name+phone for a new walk-in.
- POS payment methods are now driven by `/admin/payment-methods` (scope=pos).

### Phase E — Inventory Transfers
- New `/api/admin/inventory/transfer` endpoint moves stock between stores atomically; logs `transfer_in` / `transfer_out` movements with shared reference.
- Inventory page has "Transfer" button per row; store filter dropdown.

### Phase F — SMS / Email Settings
- Configurable providers in Settings: SMTP, SendGrid, Brevo (email); Twilio, Notify.lk (SMS).
- Each provider stored in `integration_settings` with provider-specific JSON config.
- One default per channel used for sending. (Sending itself remains MOCKED in `notification_logs` until provider client code is wired.)

### Phase G — Storefront Customer Auth
- Customers can sign up / sign in via Email+Password OR Google.
- `/login` (customer) and `/register` pages. `/admin/login` is dedicated admin entry.
- Checkout shows "Sign in for autofill" CTA when logged out; toggle "Auto-fill from my profile" when logged in.

### Phase H — Sri Lanka Checkout + Shipping & Payment Rules
- Sri Lanka districts (25) + town/city dropdown (300+) wired in checkout.
- Admin Settings → Shipping Rules: configurable fee per district / district+city, optional free-shipping threshold, default fallback rule.
- Admin Settings → Payment Methods: separate **Online** and **POS** lists. Each method (Cash on Delivery, PayHere, Cash, Card POS, Bank Transfer, Custom) is independently active/sortable. Storefront checkout fetches `scope=online`; POS fetches `scope=pos`.
- PayHere config (merchant_id / secret / sandbox toggle) saved per method (gateway not yet executed live).

## Known Gaps / Mocked
- Email/SMS sending is logged to `notification_logs` only (no real provider client wired).
- PayHere live charge flow not yet implemented; saved config only.
- Inventory bulk CSV upload not yet implemented.
- AI image generation (Gemini Nano Banana) was disabled in the new product modal; can be re-added later.

## Next Action Items / Backlog
- P1: Real PayHere live integration (sandbox/live).
- P1: Bulk product/inventory CSV import.
- P1: Wire SendGrid/Brevo/Twilio/Notify.lk live sending using saved configs.
- P2: ~400×500 thumbnails for product images.
- P2: Multi-tenancy (tenants table, tenant_id everywhere, super-admin panel).

## Auth & Test Accounts
See `/app/memory/test_credentials.md`.
