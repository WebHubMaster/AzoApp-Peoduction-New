# AzoApp — Finance Module Upgrade (Enterprise Finance Operations)

## Problem statement
Upgrade the entire AzoApp admin Finance module (Withdrawal Requests, Transactions,
Withdrawal Request Details, Transaction Details) into a premium, enterprise-grade
financial-operations console — without breaking existing business/gateway rules.

## Architecture
- Admin panel: React (CRA + craco) at `/app/web_panel`, served on :3000 (supervisor `frontend` delegates here).
- Backend: FastAPI at `/app/backend` on :8001, Mongo (`DB_NAME=test_database`). All admin routes under `/api/admin`.
- Payout gateway: existing `payout_service.create_payout` (RazorpayX when configured, else safe simulate mode). KEPT AS-IS per user choice.
- Auth: OTP-based; admin `+919000000000` / dev OTP 123456.

## User choices (gathered)
1. Unify Partner + Merchant withdrawals into ONE premium console (badges/filter).
2. Keep existing payout gateway as-is (simulate mode).
3. Transactions = full unified ledger across all real transaction types.
4. Deliver everything in one pass.

## Implemented (2026-10-07)
### Backend — `controllers/finance_ops_controller.py` + routes in `admin_routes.py`
- `GET /api/admin/finance/withdrawals` — unified partner+merchant list; server-side filter
  (account_type, status, method, q, date_from/to), pagination, KPIs + status counts. Account/UPI masked.
- `GET /api/admin/finance/withdrawals/{account_type}/{wid}` — 360 investigation
  (partner reuses finance_intel_service; merchant built in controller). Same contract for both.
- `POST .../{account_type}/{wid}/action` (approve|reject) → delegates to existing services
  (idempotent status check = double-payment + concurrent-admin protection; gateway decides Paid/Failed).
- `POST .../{account_type}/{wid}/retry` — partner only.
- `GET /api/admin/finance/ledger` — unified ledger from payment_transactions, partner/merchant
  withdrawals, refunds, partner/merchant wallet ledgers. Category tabs + credit/debit, filters,
  pagination, summary KPIs. Real data only (no fabrication).
- `GET /api/admin/finance/ledger/{source}/{tid}` — rich detail (payments reuse 360 payment_detail).

### Frontend — `web_panel/src/pages/admin/finance/`
- `FinanceWithdrawals.jsx` — premium console: 7 KPI cards, status tabs w/ counts, enterprise
  table, mobile cards, advanced filters (desktop inline + mobile bottom-sheet), debounced search,
  page-size 10/25/50/100 + first/prev/next/last, Approve&Pay confirm modal, Reject reason modal,
  CSV export, refresh.
- `TransactionsLedger.jsx` — full ledger: 6 KPI cards, dynamic category tabs, enterprise table
  (credit/debit distinct), mobile cards, filters, pagination, export; detail view with
  Financial Breakdown + Payment Journey + Related Records (payments) and normalized detail
  (refund/wallet). Withdrawal rows deep-link to the 360 investigation.
- `DateRangeControl.jsx` — premium date-range with presets + From/To custom pickers.
- `WithdrawalInvestigation.jsx` — upgraded to accept `accountType`, unified endpoints,
  Partner/Merchant badge, Approve&Pay modal shows balance-after-payout.
- Wired in `AdminDashboard.jsx`: `pm_withdrawals` → FinanceWithdrawals, `ledger` → TransactionsLedger.

### Env restore
- `backend/.env` and `web_panel/.env` were missing on pod restart (gitignored) → recreated.

## Backlog / next
- P1: Merchant investigation exercised with real merchant_withdrawals (currently 0 seeded).
- P1: Reveal-masked-details action gated by permission; bulk export/review selection.
- P2: Registration-fee / starter-kit ledger categories when those payment records exist.
- P2: Real-time websocket refresh of withdrawal/payout status.

## Invoice Management polish (2026-10-07)
Enhanced existing `components/invoices/InvoiceCenter.jsx` (shared by admin/merchant/customer)
WITHOUT touching invoice generation/numbering/GST/relationships/APIs:
- Debounced global search (350ms) via `searchInput` → `search`; no API call per keystroke.
- Request cancellation (AbortController) so only the latest invoices fetch updates the UI (no stale data / request storms).
- Guarded global axios interceptor (`lib/api.js`) to stay silent on intentional `ERR_CANCELED` (no false "Connection issue" toast).
- Removable active-filter chips row (Date/Type/Status/Min/Max/Search) + "Clear all" (§41).
Verified: list, date presets, chips add/remove, debounce, KPIs, server-side pagination/sort,
detail drawer, full server-rendered preview (Print/Share/Email/PDF), empty/error/skeleton states — all intact.

## Financial Reports redesign (2026-10-07)
Rewrote `pages/admin/FinancialReports.jsx` — premium analytics, consuming ONLY existing
`/admin/finance/report` fields (no backend/calc changes):
- Real recharts AreaChart (gradient fills) replacing broken CSS bars; custom tooltip
  (Collected/Refunds/Net), series toggle, auto granularity (Daily≤62 / Weekly≤186 / Monthly),
  ₹k Y-axis, responsive.
- Data-driven Insights strip: Top Category / Top Service / Top Method / Best Revenue Day /
  Largest Refund Day (computed from real rows, no fabrication).
- 12 KPI cards + per-section skeleton loaders; request cancellation (AbortController);
  removable date-range chip; full preset set incl. Yesterday / Last Month / All Time;
  custom range via shared DateRangeControl; Top-3 ranking emphasis in Top Services;
  sticky-header daily table with rows-per-page (10/25/50/100) + first/prev/next/last;
  localized error + Retry preserving filters; refunds shown as negative.
Verified live: chart renders, series toggle, insights, chips, KPIs, pagination.
