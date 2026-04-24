# THREADLINE — SaaS T-Shirt Brand ERP/CRM + Storefront

## Original Problem Statement
Build a full-stack online modern shopping website and ERP/CRM backend for a T-shirt brand. SaaS-ready so the founder can use for their own shop and later sell to others. Streetwear/bold & edgy (dark, urban) aesthetic. Supabase Postgres database (user provided connection). Emergent Google OAuth auth. Mock payment (Payhere.lk integration deferred). Nano Banana for AI product images. Single-tenant MVP first.

## Architecture
- **Backend**: FastAPI + SQLAlchemy async + asyncpg, Supabase PostgreSQL (Transaction Pooler port 6543)
- **Frontend**: React + Tailwind + shadcn/ui + Recharts + Sonner, "Threadline" streetwear aesthetic (Unbounded heading font, IBM Plex Sans body, safety-orange #FF3B30 accent on near-black #09090B)
- **Auth**: Emergent Google OAuth, httpOnly session_token cookie, session stored in Postgres. First user becomes `super_admin`; subsequent users are `customer`. Staff pre-provisioned by super_admin with email + role; on first Google login role is auto-applied.
- **Image gen**: Gemini Nano Banana (emergentintegrations) → base64 stored in `product_images` table
- **Payment**: Mock pay only (demo). Payhere.lk / LankaPay scheduled for next phase.

## User Personas
1. **Brand owner (super_admin)** — runs full ERP, manages team
2. **Store manager** — operations, orders, products
3. **Sales staff / cashier** — POS, order fulfillment
4. **Inventory staff** — stock in/out, variants
5. **Accountant** — expenses, payroll, sales reports
6. **Customer** — shops online

## What's Been Implemented (2026-02)
### Page Builder (Tier 1) — NEW
- `/admin/builder` admin module with section list (reorder via up/down, visibility toggle, edit, delete, add)
- 6 section types: Hero, Featured Products (+ View All button below), Brand (with stats), Story, Reviews/Testimonials, Custom (heading+text / image hero / image+text)
- Per-type editors with type-aware fields (Hero: headline size + height + image position + overlay opacity; Featured: max items + category filter + view-all button; Brand: stats + side image; Reviews: ratings + author; Custom: alignment + max width + padding)
- MediaUploader component (file upload to /api/admin/media, returns CDN-style URL via /api/media/{id})
- Theme settings: primary color, hover color, footer marquee phrases (live across storefront)
- Storefront Home is now fully dynamic (`/api/page/home` → PageRenderer → section components)
- Theme injected as CSS variables (`--theme-primary`, `--theme-primary-hover`) — buttons, eyebrows, accent borders all reactive

### Storefront (customer-facing)
- Home with streetwear hero + featured drops + brand story
- Shop listing with category filter + search
- Product detail with image gallery, size/color variants, stock indicator
- Cart drawer (localStorage persistence)
- Checkout (mock pay, coupon, shipping calc)
- Order confirmation + customer order history
- Google OAuth login + account page

### Admin ERP (role-based)
- KPI dashboard (revenue 30d, orders, customers, low stock, top products, status breakdown, revenue chart, order status chart)
- Products CRUD + inline variants + image manager (upload OR Nano Banana AI generation)
- Categories CRUD
- Inventory grid with low-stock warning + manual stock movements
- Stock movements history log
- Orders list with status workflow + detailed view + mocked email/SMS notifications
- Customers list + CRM notes
- Multi-store Stores CRUD
- Multi-store POS (product search → cart → quick checkout for walk-in customers)
- Coupons CRUD (percent/fixed, min order, usage limit)
- Expenses log
- Payroll (per-staff, monthly, bonus/deduction, mark paid)
- Staff management (super_admin only, role-based access with pre-provisioned Google OAuth identities)
- Sales Reports (revenue / expenses / profit, per-day and per-channel charts)
- Marketing Campaigns (spend, revenue, ROI, channel tracking)
- Notifications log (mocked SMS/email send — real provider in next phase)

### Seed data
- 3 categories (Tees, Longsleeves, Hoodies)
- 6 products with 30+ variants + AI-generated product imagery

## P0 Backlog (next iteration)
- Real **Payhere.lk** sandbox payment integration (user will provide Merchant ID/Secret)
- **Bulk CSV inventory upload** (asked for by user; deferred for MVP speed)
- SMS/Email provider integration (Twilio / Resend / SendGrid) — currently mocked log only
- Multi-tenant SaaS phase (tenant signup, data isolation, per-tenant admin, super-admin to operate platform)

## P1 Backlog
- Product reviews + ratings
- Wishlist
- Refunds/returns workflow
- Abandoned cart recovery email
- Advanced reports (AOV, repeat customer rate, inventory turnover)
- Stock transfers between stores

## P2 Backlog
- Tax/VAT engine (country-specific)
- Multi-currency
- Customer loyalty program
- Affiliate/referral system
- Custom email templates + branded invoice PDF
