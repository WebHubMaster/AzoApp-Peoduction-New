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

## 2026-06 — In-app APK update fix (Customer + Partner)
- Root cause: AppUpdateGate used legacy APIs (createDownloadResumable/cacheDirectory/getContentUriAsync) from `expo-file-system` main export — throws on SDK 54+ → "Unable to download the update". Fixed: require("expo-file-system/legacy"), documentDirectory, 5x resume retry, size verification, reuse already-downloaded APK, ACTION_VIEW installer intent with GRANT_READ|NEW_TASK, mediaUrl() for apk_url, "Install unknown apps" hint.
- app.json (frontend + Customer): android.permission.REQUEST_INSTALL_PACKAGES.
- Backend: upload always sets version_code/latest_version (+apk_version_code) from the APK; public config uses APK code + absolute apk_url; /api/media/file serves .apk with HTTP Range (206) for resume.
- Needs ONE manual install of a new build (old installs carry the broken updater).

## 2026-06 — Customer app splash = Partner splash
- Customer/app/index.tsx: branded animated splash (blue gradient, admin logo / site name+tagline, caption, spinner, 1.5s) → /(site).
- Customer/app.json: expo-splash-screen dark block (#0D47A1) + android.backgroundColor — fixes dark-grey native splash in phone dark mode. Needs new APK build. Verified by code review only (iteration_239).

## 2026-06 — Partner "small gestures" card (customer booking details)
- PartnerGestures card (web CustomerDashboard BookingDetailsDrawer + Customer app BookingDrawers) after Partner Information; only when partner_id & status in assigned/arrived_shop/arrived_customer/started. iteration_240 pass (web); RN by code review.

## Rate Service (2026-10-07)
- Backend: `GET /api/bookings/my/pending-reviews` (latest completed first), `POST /api/bookings/{id}/review-prompt-dismiss`; rating/dismiss silences auto-popup for older unrated jobs (no chain popups).
- Web: `web_panel/src/components/customer/RateService.jsx` (mounted in App.js) — small pill above bottom nav (right) only on `/` and `/account` home; auto popup on new completion (SSE + 20s poll + tab focus); hides while keyboard open.
- Expo app: `Customer/src/components/customer/RateService.tsx` — provider in root layout, button in (site) home layout + CustomerShell home; pinned via KeyboardFixedBottom.
- Seed: `backend/seed_rate_service_demo.py`. Tested iteration_241 (backend 6/6, web 14/14). Expo app code-reviewed only.
- Backlog: show partner photo in popup; quick-tag chips; rating reminder push after 24h.

## In-app APK Update fix + Auto version (2026-10-07)
- Root cause: older installed builds used `require("expo-file-system")` (new API) whose legacy `createDownloadResumable` throws → generic "Unable to download" error. Current gate uses `expo-file-system/legacy`, retry+resume, size check, real error messages, installer fallback (VIEW → INSTALL_PACKAGE). Both apps.
- Backend: `GET /api/app-mgmt/download/{platform}` (stable direct install link, shown in Admin → App Management with Copy). S3 presign now regional endpoint + SigV4.
- Auto version: `plugins/withAutoVersionName.js` (Partner=frontend, Customer) → versionName = `<major>.<minor>.<versionCode>`; EAS remote autoIncrement bumps versionCode every build. CI/eas.json untouched.
- Tested iteration_242 (backend 10/10, admin UI pass; native install code-reviewed only).

## Partner reminder full-screen fix (2026-10-07)
- JobRingOverlay: reminders deduped with `rem:<id>` key (accepting a job no longer blocks its 30-min reminder while app is open). backgroundRing: skips ring/sound when app is foreground (overlay owns it). Tested iteration_243 (backend + code review).

## 2026-06 — Active Jobs time-ordering
- Partner App (`/api/bookings/partner/active`) and Partner Web Panel Active tab now sort jobs by booking date + time slot (earliest first); instant jobs use booking creation time.

## 2026-06 — City-disabled categories hidden (Customer App + Web)
- Root cause: Customer app public calls (auth:false) never sent X-City, and first calls fired before saved city loaded → all services/rate cards/search shown.
- Fix: X-City on every request (waits for saved location); query cache refetch on city change; web pages reload on location change; backend subcategories + upsell also city-filtered.
- Tested: iteration_244 — backend 12/12, both frontends pass.

## 2026-06 — Web payments + city-aware banners + coming soon
- Payments (web panel + Customer web build, all gateways): added PayU/Easebuzz callback routes, client-aware return URLs (X-Pay-Return: panel/customer), PayU status check + Easebuzz parsing fix, no fake success on redirect gateways (sessionStorage pending + return page), Customer web in-page checkout (webCheckout.ts) + /payment/return route.
- Banners/offers/hero slides hidden when their linked category (category_id or link) is disabled in the city.
- "Coming soon in <city>" notice on disabled category pages (web + Customer app).
- Tested: iteration_245 (15/15 backend, 4/4 UI). Real gateway completion not testable (no keys in env).

## 2026-06 — Merchant fixes (App + Web)
- DOB: future dates disabled (app + web) + backend 400 on future DOB.
- Merchant can't enter dashboard until admin approval (Under Review screen) — app routing + layout guards; web MerchantRoot already gated.
- Referral customer detail shows cancellation commission KPI + "Booking cancelled" badges (also partner detail & commission history); cancellation ledger now stores customer_id + rates (old rows resolved via booking).
- Merchant app top bar = partner-style brand header (no page title); bottom nav docked full-width like partner.
- QA-only provider app web preview route /api/provider (frontend/dist-web).
- Tested: iteration_246 all pass.

## 2026-06 — Approval push alert (Merchant + Partner)
- On admin approval (all approve paths) user gets "Account Approved 🎉 … Tap to log in" via in-app + SSE + push (Expo/FCM/WebPush) with data.type=account_approved, role.
- App (ChatNotifier): push tap or live SSE → refresh user → open merchant/partner dashboard. Web panel RealtimeContext does the same.
- Tested: iteration_247 backend 3/3; frontend auto-redirect verified by code review only (no real devices).

## Update (Jun 2026) – Merchant app UI tweaks
- Removed page title/subtitle headers from Wallet, Analytics, Bank & KYC, Help & Support, Scan QR (other pages already headerless)
- Bottom nav: Wallet tab replaced by "My Network" (/merchant/partners); Wallet moved into More sheet
- Safe-area + keyboard: bottom nav hides when keyboard open; Edit Profile, Withdraw & Share modals use KeyboardProvider+KeyboardAvoidingView; Support uses KeyboardAwareScrollView

## Update (Jun 2026) – Customer app instant rating popup
- RateServiceProvider (Customer/src/components/customer/RateService.tsx): opens rating popup instantly on live `booking_update` (status completed/paid) and on foreground/tapped push with booking_id; verifies via /bookings/my/pending-reviews; poll reduced 20s→10s
- Thank-you celebration (ThanksBurst) after rating submit: pop-in check, star/confetti burst, auto-close 2.2s

## Update (Jun 2026) – Performance pass (Customer + Partner apps)
- Partner: per-second timers isolated (useNow hook, CountdownRing/Elapsed leaf components, React.memo RequestCard) → Jobs/Active/Job wizard screens no longer re-render every second
- Both: react-query focusManager ↔ AppState (pause polling in background, refresh on resume)
- Customer: CustomerDataContext only updates on changed payloads, memoized value, slower + foreground-only polling (SSE keeps it live); overlay/rating polls gated by AppState

## Update (Jun 2026) – Smooth lists + Instant home
- Customer Orders: memoized BookingCard + stable Proxy actions (server paging 10/page unchanged)
- Partner Job History: memoized HistoryRow + FlatList windowing props
- Customer instant home: CustomerDataContext AsyncStorage snapshot per user (cust_home_cache_v1_{id})
- Partner instant home: usePersistHomeQueries (src/lib/queryPersist.ts) persists dashboard/stats/starter-kit/maid-subs/active per user; job requests not cached

## Update (Jun 2026) – Logout privacy + refresh feedback
- Logout (Customer + Partner/Merchant): clears all saved home snapshots (cust_home_cache_v1_*/partner_home_cache_v1_*) + react-query cache
- RefreshNote.tsx (both apps): drop-in RefreshControl + RefreshNoteHost → "Updated just now" pill after pull-to-refresh (all partner screens, customer shell + site home)
- Refresh feedback: soft tick (assets/sounds/refresh-tick.wav, vol 0.35) + light haptic in RefreshNoteHost (both apps)

## Fix (Jun 2026) – Admin booking details images
- web_panel WorkProof.jsx: proofSrc() resolves relative/old-host /api/media URLs to current backend (selfie, before/after, KYC, lightbox); adminSections item image + partner photo too
- backend media_routes: /media/file ↔ /media/s3 cross-fallback (local missing → S3, S3 missing → local)

## Fix (Jun 2026) – Custom Job services visible in category
- convert_to_service now creates ACTIVE+approved service (visibility default 'all') → shows in its category on web & apps; requester_only stays private
- One-time startup migration publish_converted_drafts (app_meta flag custom_job_autolive_v1) activates previously converted drafts
- Tests: backend/tests/run_custom_job_visibility.py (25/25 pass)


---
## Platform Earning module (2026-10-08)
### Problem statement
New admin main menu "Platform Earning" — enterprise financial-intelligence dashboard that READS existing
financial sources (no changes to calculation engine, APIs, DB structure or permissions).
User choices: code already in /app; seed realistic demo data; reuse existing admin auth/RBAC.

### Implemented
- Backend `routes/platform_earning_routes.py` + `services/platform_earning_service.py` (prefix /api/admin/platform-earning):
  meta, summary (KPIs + prev-period, P&L, revenue sources, reconciliation, health), trend (day/week/month/auto),
  breakdown (service/category/city/partner/merchant/method/source, server sort+pagination), top, commission, fees,
  payouts, gateway, anomalies (dup txn ref, negative earning, variance, unusual gateway fee, failed refund, high refund,
  failed payout, missing settlement), records (+detail with audit trail), CSV streaming export. Single Mongo
  $unionWith fact pipeline over commission_ledger/refunds/payment_transactions/starter_kit/membership/withdrawal fees;
  45s param-keyed cache; indexes ensured. RBAC: path segment "platform-earning" → finance module.
- Opex: read from `platform_expenses` if it ever exists; otherwise "Expense data not configured" (net profit null).
- Frontend `web_panel/src/pages/admin/earning/*`; sidebar item right below Dashboard (module finance).
  PremiumDateRangePicker gained year navigation + Today button.
- Seed: `backend/seed_platform_earning_demo.py` (tag _seed=platform_earning, real CommissionEngine.split).
- Tested: iteration_255 — backend 52/52, frontend core flows pass; export states fixed afterwards.

### Backlog
- P1: Operating-expense entry UI (platform_expenses) to unlock Net Profit
- P1: Fee-level refund tracking in refund records
- P2: Saved views / scheduled email of Platform Earning report; PDF export
- P2: Pre-aggregated daily rollups for >1M records

## Vision AI config fix (2026-10-08)
- Integration Center "Aadhaar OCR" card renamed "Vision AI (OCR & Face Match)"; shows Connected only when an API key is saved
- 5-step setup guide inside the config popup + "Test Vision AI" button (POST /api/admin/integrations/vision-test)
- Deep link /admin?tab=integration_center&intg=ocr; Work Proof face panel links straight to it
- Face match reason text now names the exact card. Tested: iteration_256 (all pass)

## Dashboard ↔ Platform Earning data parity (Oct 2026)
Problem: Admin Dashboard and Platform Earning showed different money figures; user wants only real (non-dummy) data.
Done:
- Dashboard money KPIs/series/earnings now come from the same engine as Platform Earning (`platform_earning_service.finance` + `derive`), same date window and filters.
- Dashboard "Total Revenue" → "Gross Platform Revenue", "Platform Fee" → "Net Platform Revenue"; Revenue vs Earnings panel shows settled revenue, all-bookings revenue, incl.-GST collection, payouts, refunds, commission, net revenue.
- Seeded/demo rows (`_seed`, `seed_source`, `demo`, `is_demo`, ledger/refunds with no real booking, `pout_DEMO` withdrawals) excluded from both pages.
- Verified with a parity script: all 11 money figures match exactly (with and without filters).
Backlog: remove/flag one-time startup demo bookings (seed_demo_activity, seed_merchant_demo, seed_merchant_referral_commission) from production DB; admin "purge demo data" tool.

## Background APK update download — Customer & Partner apps (Oct 2026)
- New `src/lib/apkUpdate.ts` (both apps): module-level download store; Notifee foreground service + progress notification keeps download alive when app minimised; auto-resume partial file (HTTP Range) after process kill; status restored on reopen (downloading/ready/error); auto-opens installer when user returns.
- AppUpdateGate uses the store; buttons: Update Now / Resume Download / Install Update; refreshes on AppState active.
- Shared FGS guarded via `isUpdateFgsActive` (ringState) so job-listener/ring teardown doesn't kill the download.
- Needs a new APK build to ship; verified by TypeScript only (no device test).

## Invoice email logo fix (Oct 2026)
- Root cause: emailed PDF was built inside the event loop and fetched the logo from the backend's own URL (/api/media/s3/...) synchronously → self-deadlock/timeout → no logo. Failures were also cached.
- Fix: `invoice_html_service.resolve_logo_data_uri` (async; S3 logos read directly via storage_service, others off-loop) used in `fill_live_branding`; email PDF built in threadpool; failed lookups no longer cached.
- Logo source: Admin → Branding → "Email & Invoice Logo" (email_logo) → fallbacks logo_light/logo.

## Partner app permission screen — partner only (Oct 2026)
- Permission screen (/onboarding/notifications) no longer shown before login or for merchants.
- `goHome()` in OtpFlow.tsx: partner login/signup → permission screen (if notifications not granted / not yet prompted) → `next` (partner home/register). Merchant → straight to merchant home/register.
- Splash: logged-in partner gets the same gate; logged-out users go to welcome.

## Customer app — all permissions in one place (Oct 2026)
- New `Customer/app/permissions.tsx`: one-time screen after splash (Android/iOS, not web) with Location, Notifications, Photos, Microphone, Full-screen alert, Display over apps, Background battery, OEM autostart; "Allow all" + per-item Allow; Continue/Skip sets `azo_cust_perms_done`.
- Removed scattered auto prompts: root layout notification request, home location/notification prompt, post-booking AlertPermissionWalkthrough + AlertSetupNudge on HomeView. Alerts screen in profile remains for later changes.

## Notification tap → correct screen (Oct 2026)
- Backend: booking `_notify` now puts real booking_id + code + type in push data; FCM click_action OPEN_CHAT removed (tray chat taps did nothing).
- Apps: new `src/lib/notifTap.ts` (both apps) — unified tap handling (Notifee fg/bg/cold start, FCM, expo), de-dupe, waits for splash (markNavReady).
- Partner: chat → /chat/[id]; booking → /(partner)/booking/[id]; merchant/other → /notifications. Customer: chat → orders?chat=id (opens chat), booking → orders?open=id (opens details), else notifications.
- Tested: backend pytest 5/5 (iteration_258) + static TS review; needs new app builds + device check.

## Face match fix (Oct 2026)
- Root cause: check-in face match used only a vision LLM whose prompt said "ignore beard/hair changes" → different people reported as matched.
- Fix: `services/face_embed.py` — OpenCV YuNet + SFace (ONNX in backend/ml_models, opencv-python-headless) multi-scale/rotation detection + cosine similarity. ≥0.42 match, <0.30 mismatch, between → strict LLM tie-break (if configured) else "unverified". Works even without Vision AI key.
- Tests: backend/tests/test_face_match.py 12/12 (iteration_259). Existing bookings keep old verdict until admin taps Re-check.

## Partner app — "Active Job" stuck loading after completing a job (Jun 2026)
- Symptom: after completing a job, opening Active Job showed a spinner for ~1-2 min every time, then self-loaded.
- Root cause: `app/(partner)/active.tsx` wired native `RefreshControl.refreshing` to `activeQ.isFetching`, so the pull-to-refresh spinner lit up for EVERY background refetch — the 15s poll AND the burst of cache-invalidations fired on completion (`refreshPartnerLive` + SSE `finance_update`/`booking_update`). On slow network/backend after completion the spinner stuck on screen though the user never pulled.
- Fix (frontend only):
  - `active.tsx`: `refreshing` now reflects ONLY a genuine user pull via local `pulling` state + `onPull` (awaits `activeQ.refetch()`+`doneQ.refetch()`); background polling/invalidations update silently.
  - `partner/job/[id].tsx`: on completion, optimistically remove the finished booking from the `partner-active` cache so the Active screen is correct instantly instead of waiting for the next poll.
- Verification: TS compile clean for both files (no new errors). Backend endpoints confirmed cheap/async (not the bottleneck). Native Expo app not exercisable by the browser testing agent here — needs a device check after rebuild.
