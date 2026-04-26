# Changelog

## Iteration 6 (2026-04-26): Accounting integrity, sidebar groups, stricter perms

### Bug fixes
- **POS crash** (was reading paginated /admin/products as array) — fixed (iter 5).
- **Hero theme fonts** — fixed via CSS variables (iter 5).
- **Bulk Import "Commit" button never enabled** — root cause: dry-run never incremented summary.created/updated. Fix: counters increment on both code paths; commit button now only requires non-empty rows.
- **Bulk Import partial fields** — empty CSV cells are treated as "not provided"; existing products get partial updates. New products only need `name`; everything else can be filled in later in Products page.

### Accounting integrity
- Online COD `Cash Received` action now auto-credits the **online store cash account** with proper CashLedger 'in' entry. Refuses to complete if no account configured.
- Checkout pre-flight rejects instant-paid orders when no resolvable cash/bank account exists for the destination store. Auto-resolves account from store first, then online store.
- POS cash checkout auto-resolves the store's cash account if the cashier didn't pick one explicitly.

### POS upgrades
- `/admin/products?store_id=X&in_stock=true` returns only products with stocked variants at that store. Each variant carries its `stock` count which the POS shows on the variant button.
- POS re-fetches its product list whenever the cashier switches stores.

### Sidebar restructure
- Collapsible nav groups with chevron toggle (state persisted to localStorage):
  - **Inventory** parent → Products, Categories, Bulk Import
  - **Inc & Exp** parent → Cash & Bank, Reports
  - **Staff** parent → Payroll
- Clicking parent label navigates to its main page; chevron only toggles children panel (event.stopPropagation).
- Auto-opens the group containing the active route.
- New `Orders` pending badge — red pill shows count of `status='pending'` orders, polled every 30s from `/admin/orders/stats`.

### Granular RBAC additions
- New permission **move_stocks** gates `POST /admin/stock-movements` and `POST /admin/inventory/transfer`.
- New permission **manual_inc_exp** gates `POST /admin/income` and `POST /admin/expenses`.
- Both default OFF for new staff. super_admin bypasses all permission checks.
- Staff edit dialog includes the new toggles with human-readable labels.

### New endpoints
- `GET /admin/orders/stats` → `{pending, processing}` counts.

### Tests
- `/app/backend/tests/test_iter6_saas.py` — 14 passed / 1 skipped.

## Iteration 5 (2026-04-26): 6-phase mega batch
(See PRD.md — all phases shipped: receipts, accounting engine, suppliers, RBAC, CSV import, alignments, sidebar collapse.)
