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

## 2026-06 — APK upload "Failed to fetch" on self-hosted live (VPS/Nginx/Cloudflare), APK >150MB
- Root cause: 4MB chunks > Nginx default client_max_body_size 1MB (413 w/o CORS → "Failed to fetch"); sync /finish on big APK hit proxy timeout; chunks in container /tmp.
- Fix: 768KB chunks, 4 parallel, auto-retry w/ backoff; chunks stored in Mongo `apk_upload_chunks` (idempotent, TTL 6h); /finish starts background job (`apk_upload_jobs`), UI polls /status/{job_id}; APK parsed from disk; S3 multipart upload_file; .apk via /api/media/s3 → 302 presigned URL; unique apk name per upload.
- Verified: 160MB APK e2e byte-identical; iteration_236 13/13 backend + UI pass. Test APK generator: backend/tests/make_test_apk.py

## 2026-06 — Resumable APK upload + Storage badge
- Resume: upload_id = fingerprint(platform,size,lastModified,name); pending state in localStorage `azo_apk_pending_{platform}`; GET /api/app-mgmt/admin/apk/{platform}/received/{upload_id} → skip sent chunks; offline → waits for `online` event; reload during Processing auto-resumes polling; resume banner (Resume/Discard). Chunks kept 6h (TTL).
- Storage badge: GET /api/app-mgmt/admin/storage → {mode: s3|local, bucket, region}; badge in App Management header.
- Verified iteration_237 (8/8 backend, UI resume after reload + offline drop).

## 2026-06 — Single active session (all roles) + Partner in-app proof camera
- Login anywhere (OTP/email/google) → `issue_token` sets users.current_sid + JWT `sid`; older tokens get 401 {code:"device_revoked"}. Web panel: interceptor event + 20s /auth/me poll → toast + logout. Partner apps already handle device_revoked. (iteration_238 pass)
- Partner before/after proof: new `frontend/src/components/partner/ProofCamera.tsx` (expo-camera CameraView photo + video ≤30s, 720p/4Mbps, mute if mic denied); fallback to system camera with getPendingResultAsync recovery; "Uploading…" only after capture. expo-camera plugin recordAudioAndroid=true. Needs NEW APK build (native config). /app/PartnerApp is an older copy — not updated.
