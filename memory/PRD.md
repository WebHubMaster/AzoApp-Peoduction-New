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

## Partner app — Notifications screen missing top nav (Jun 2026)
- Symptom: tapping the bell → Notifications screen had NO top navigation header (brand + bell + theme + profile); user wanted the top nav visible like other screens.
- Root cause: `app/notifications.tsx` used `<AppHeader/>` from `src/components/Screen.tsx`, which was gutted app-wide (now renders only an invisible safe-area spacer).
- Fix: `app/notifications.tsx` now renders `<AppShellHeader profileRoute={role==='merchant' ? '/(merchant)/profile' : '/(partner)/profile'} />` (the real top nav), matching Dashboard/Active Job/Wallet.
- Verified: testing agent iteration_260 — backend /api/notifications 4/4 PASS; static RN verification confirms AppShellHeader now renders at top of the Notifications screen. retest_needed=false.
- NOTE (not changed, intentional product decision): other partner sub-screens still use the gutted AppHeader (Job History, Booking details, Bank & KYC) — these show no title bar by design. Flag if the user wants the top nav there too.

## Partner app — top nav extended to Job History / Booking details / Bank & KYC (Jun 2026)
- Applied the same AppShellHeader top nav (brand + bell + theme + profile) to 3 more partner screens that were using the gutted AppHeader:
  - app/(partner)/partner/history.tsx (Job History)
  - app/(partner)/booking/[id].tsx (Booking details)
  - src/components/FinanceKyc.tsx (Bank & KYC; profileRoute derived from `base` → merchant vs partner)
- TS compile clean. Reuses the component already verified in iteration_260. Native Expo app → static verification (no web preview).

## Partner app — rate-card additional work on invoice + OTP keyboard + message (Jun 2026)
- Feature (user choice: merge as extra line items on the MAIN booking invoice, generated at job completion):
  - Backend services/invoice_service.py `_merge_additional_into_invoice(inv, booking)` folds PAID booking['additional'] into the booking invoice: appends parts/labour line_items + breakdown.service_items, bumps subtotal/tax/taxable/total_amount/commission, stores breakdown.additional_work + inv.additional_work.
  - Billing rules preserved (from _recompute_additional): product/parts = NO GST / NO commission (100% partner); service/labour = platform commission; GST = commission_on_labour * gst_pct.
  - Partner view: _attach_role_earning adds the 'additional_work' commission_ledger partner_earning to role_earning.net (+ exposes role_earning.additional_earning); platform fees/commission stay hidden.
  - Verified: testing agent iteration_261 — 5/5 backend pytests PASS (merge, customer total, partner net w/o leakage, idempotency). test file: tests/test_additional_merge_into_invoice.py.
- UI fixes (native; static-verified, not browser-testable):
  - OTP boxes now scroll above the keyboard: OtpBoxes (src/components/partner/JobProof.tsx) gained an onFocus prop; job/[id].tsx passes scrollOtpIntoView (scrollToEnd) to Start/Work step OTPs via a KeyboardAwareScrollView ref.
  - Reworded the additional-work payment-collect message in src/components/partner/AdditionalWork.tsx to a professional/trust tone.
- Env note: /app/backend/.env & /app/frontend/.env were missing after a pod restart; testing agent recreated them (MONGO_URL=mongodb://localhost:27017, DB_NAME=azoapp_database, REACT_APP_BACKEND_URL=preview). Services healthy (backend 200).

---

## 2026-10-09 — Performance fix: fast booking cancellation & rating (Customer App)
- Problem: Customer-app booking cancellation took ~10–15s every time; rating sometimes slow.
- Root cause: `backend/controllers/booking_controller.py` ran ALL side-effects synchronously on
  the request path — refund processing (with push notifications), partner/merchant wallet credits,
  commission-ledger writes, GST + refund invoice PDF generation, and multi-channel push/SMS/email
  notifications (WebPush + FCM + Expo + SMS + Email each hit the network).
- Fix (mirrors existing `_post_complete()` pattern): status flip (→`cancelled`) and review save stay
  synchronous (retry-safe); everything else moved into one `asyncio.create_task(...)` background task:
  - `cancel_booking` → `_post_cancel()`; COS path → `_post_cancel_cos()`.
  - `add_review` → `_post_review()` (rating recompute, auto-suspend, 5★ streak, incentives).
- Also: recreated missing `/app/backend/.env` (MONGO_URL, DB_NAME=test_database) which blocked backend start.
- Verified via `backend/perf_cancel_rating_test.py`: cancel ~4ms, rating ~2ms; background refund +
  invoices + partner rating all confirmed to complete.
- NOTE: Customer/Partner apps are Expo/React Native — not runnable in this pod; validated at the
  backend controller level. Recommend on-device e2e verification.

## 2026-10-09 — Fix: Partner Rewards & Challenges counts COMPLETED jobs only
- Problem: Challenge "Complete 20 jobs this month" counted rejected/cancelled jobs too.
- Root cause: `services/partner_service.py::_incentive_progress` counted EVERY `commission_ledger`
  row for the partner (including `cancellation` / `cancellation_cos` entries from cancelled jobs).
- Fix: whitelist `kind in {completion, completion_cos}` before counting `job_count` and summing
  `revenue`. Cancelled & `additional_work` rows no longer inflate challenge/incentive progress.
- Verified: testing_agent backend 100% (service layer + GET /api/partner/challenges & /api/partner/incentives,
  OTP partner +919000000003 / 123456). Tests: backend/challenge_count_test.py, backend/tests/test_challenge_count_api.py.

## 2026-10-09 — Feature: Milestone Celebration (challenge unlock)
- When a Partner challenge/incentive bonus is credited (auto-payout or admin award), the backend
  now emits a realtime `challenge_unlocked` event `{name, amount, bonus_amount, auto}` to that
  partner (services/partner_service.py::_credit_incentive_award, only when amount>0 → idempotent).
- Partner app (Expo): new global component src/components/partner/ChallengeCelebration.tsx, mounted
  in app/_layout.tsx inside Realtime+Toast providers. Subscribes to `challenge_unlocked` and shows a
  confetti burst + congratulations card (trophy, challenge name, +₹amount) + a wallet-credit toast,
  and invalidates partner-challenges/bonuses/wallet queries. Auto-dismiss ~4s / tap to close.
- Verified: testing_agent backend 100% (emit + wallet credit + idempotency + challenge-count regression).
  Tests: backend/challenge_unlock_event_test.py, backend/tests/test_challenge_unlock_celebration.py.
  Frontend typechecked (tsc) — no new errors; Expo app not runnable in pod so UI is pending on-device check.

## 2026-10-09 — Feature: Report a Bug (Customer, Partner, Admin)
- Backend: new `bug_reports` collection + controllers/bug_controller.py + routes/bug_routes.py.
  - Reporter (customer/partner/merchant): POST /api/bugs {title, description, screenshot_url?},
    GET /api/bugs/my, DELETE /api/bugs/{id} (allowed ONLY after status solved/closed).
  - Admin: GET /api/admin/bugs (filters status/role/q, pagination, counts), POST /api/admin/bugs/{id}/resolve
    {note} (status→solved, stores resolution_note + notifies reporter in-app/push/SSE), POST .../reopen.
  - Screenshot reuses existing POST /api/support/upload. RBAC seg 'bugs'→'communication'.
- Customer app (Expo /app/Customer): new screen app/(customer)/report-bug.tsx + "Report a Bug" item in
  the More menu (src/components/customer/nav.ts). Form (title+desc+optional screenshot), my-reports list
  with live status, resolution note, delete (only when solved).
- Partner app (Expo /app/frontend): new screen app/(partner)/partner/report-bug.tsx + "Report a Bug" in the
  More menu (app/(partner)/_layout.tsx). Same UX; uses uploadAsset + react-query + Toast.
- Admin panel (CRA /app/web_panel): new page src/pages/admin/ReportedBugs.jsx wired into AdminDashboard NAV
  as "Reported Bugs" (key bug_reports). KPIs, status/app tabs, search, screenshot preview, Mark Solved
  dialog with note, Reopen.
- Verified: testing_agent backend 100% (21/21). Clients are Expo/CRA — not runnable in pod; RN typechecked
  (tsc) and admin JSX babel-parsed clean. NOTE: rebuild/redeploy the web_panel to see the admin menu.

---
## Update 2026-10-09 — Bug Categories added to Report-a-Bug

Added a `category` dimension to the existing Report-a-Bug feature (Customer, Partner, Admin).
Allowed values: payment, booking, login, account, other (default "other").

Implemented:
- Backend (`controllers/bug_controller.py`, `routes/bug_routes.py`): `BUG_CATEGORIES` + `_norm_category()`; `create_bug` saves `category`; `_public` normalizes it (legacy rows → "other"); `admin_list` accepts a `category` filter and returns `category_counts` (all + per-category). `BugCreate` model gained optional `category`.
- Customer app (`/app/Customer/app/(customer)/report-bug.tsx`): category chips selector, sent on submit, badge in My Reports.
- Partner app (`/app/frontend/app/(partner)/partner/report-bug.tsx`): same chips + badge.
- Admin panel (`/app/web_panel/src/pages/admin/ReportedBugs.jsx`): category filter tabs with counts + category badge per report.

Verified: backend 26/26 tests pass (iteration_265); both Expo apps tsc-clean on changed files. Nothing existing broken.
Note: Expo apps + CRA admin panel need rebuild/redeploy to see UI changes.

---
## Update 2026-10-09 — Fix: admin profile images intermittently broken (permanent)

Bug: In the admin panel, partner/user profile images sometimes showed, sometimes broke (broken-image icon).
Root cause: App-uploaded profile photos are stored as RELATIVE URLs ('/api/media/file/.../profile/<uuid>.webp')
by auth_controller.update_profile; the backend serves them fine (200, image/webp), but the admin React panel
rendered them raw — no backend-origin resolution and no error fallback. So they only loaded when the panel host
matched the backend host, and any failed load left a permanent broken icon.

Fix (frontend-only, /app/web_panel):
- New resilient component `src/components/SmartImg.jsx` (resolves via mediaSrc() + falls back to initials/placeholder on error).
- Shared People `Avatar` (`pages/admin/people/ui.jsx`) now uses mediaSrc() + onError fallback.
- All admin profile/avatar/document images now resolve via mediaSrc()/proofSrc(): PartnersHub, MerchantsHub,
  CustomersHub, UserDetail, PartnerConsole, MerchantConsole, adminSections, adminRealtimeSections,
  people/Person360, livemap/PartnerDrawer.

Verified: backend photo/serving contract 100% (iteration_266); web_panel `yarn build` compiles clean.
Note: admin panel (CRA) + Expo apps don't run in this env — rebuild/redeploy to see the change.

---
## Update 2026-10-09 — Merchant Bank & KYC + Support redesigned to match Partner app

Request: Make the Merchant app's Bank & KYC and Support Ticket screens look exactly like the Partner app's.

Done (frontend-only, /app/frontend):
- Extracted the partner Bank & KYC screen (`app/(partner)/partner/payouts.tsx`) into a shared, parameterized component `src/components/BankKycScreen.tsx` (props: financeBase, uploadBase, profileRoute, queryPrefix, embedded). Partner `payouts.tsx` and merchant `app/merchant/bankkyc.tsx` are now thin wrappers → pixel-identical design. Merchant points at `/merchant/panel/finance-kyc` + `/merchant/registration` uploads; `embedded` hides the inner header since the merchant stack already shows MerchantTopBar.
- Support: added an optional `embedded` prop to the shared `app/support/index.tsx` (partner/customer design) and made `app/merchant/support.tsx` render `<SupportList embedded />` → merchant Support now matches partner exactly (New Ticket, search, filters, chat thread). Ticket detail opens `/support/[id]` (shared).

Verified: `tsc --noEmit` clean on all changed files (only a pre-existing tsconfig baseUrl deprecation remains); backend API contracts confirmed (finance-kyc returns pan/banks/eligible/blockers; support meta/tickets shapes). Backend unchanged — merchant endpoints already existed and are used as-is.
Note: Expo apps don't run in this environment — rebuild the Merchant/Partner apps to see the screens.

## 2026-06 Updates
- PartnerApp Help chat: composer respects bottom safe-area inset (HelpSOS.tsx).
- Checkout payment failure (Customer app + web panel): if payment cancelled/failed, bookings are voided via POST /api/bookings/abandon-unpaid (status cancelled, payment_status failed, cancellation.by=payment_failed), cart kept, "Payment failed · order not placed" screen with Try again. Late gateway success revives voided bookings (_revive_failed in payment_controller).
- Backlog: show "Payment failed" label in My Bookings for payment_failed orders; hide them from customer list.
- Customer Refund Receipt now uses the same layout as the booking GST invoice (gst_invoice_service.build_refund_html, routed from build_invoice_html for invoice_type=refund) — applies to app, web panel, PDF.
- Perf: booking notifications (push/SMS/email gateways) now fire in background (booking_controller._notify, partner_service.notify, notification_service.notify_bg) so Complete-Job OTP and all booking actions return instantly. Added indexes bookings.code, commission_ledger, refunds.
- Partner Complete Job: celebratory DoneStep (confetti, job earning, today's earnings + jobs via completion_summary / GET /api/bookings/partner/today-summary); weak-network safe completion queue (PartnerApp/src/lib/completeQueue.ts, AsyncStorage + backoff + NetInfo kick); backend complete_job idempotent + atomic `completing` lock (stale 60s). Web customer dashboard reloads bookings on realtime booking_update; rating prompt reload 150ms.
- Partner web JobWizard: celebratory DoneCard (confetti, earning, today's earnings/jobs) shown instantly from completion_summary.
- Customer thank-you card (Expo + web RateService): partner photo + one-tap tip ₹20/50/100 (wallet if balance else online gateway purpose "tip"). Backend add_tip now debits customer wallet atomically, one tip per booking, partner_ledger "tip"; payments purpose "tip" (create_order/_apply/confirm_return using stored pay_tip_amount). pending-reviews returns partner_photo, tip_amount.
- CI fix: backend/requirements.txt must NOT include emergentintegrations or litellm url lines (Dockerfile installs emergentintegrations separately via extra index).

## 2026-06 — Rate-card Additional Work on Customer Invoice (Customer App + Customer Web)
- Problem: Additional work added from the rate card was missing from the customer invoice.
- User choices: show it as separate line items with recalculated total; update the SAME invoice; show balance due if unpaid; no customer approval needed.
- Backend: `engines.merge_additional_breakdown` adds the additional work lines and totals to the customer booking breakdown (`balance_due` while unpaid). `invoice_service.refresh_booking_invoice_additional` updates an existing invoice in place (same id/number, idempotent) on ensure/get/public. The GST invoice block (`_gst_block_for`) now includes the additional work: commission and GST on the platform page, partner share on the partner receipt, and in the grand total. The completion notification total includes the additional work.
- Frontend: web `CustomerDashboard.jsx` and Expo `BookingDrawers.tsx` show additional lines through ServiceBreakdown, Balance Due rows and Paid Amount = total − balance due. The separate additional block was removed from the app.
- Tested: iteration_273 passed (backend + web). Expo app changes were only code-reviewed.
- Backlog: partner-side regression test with a partner-assigned seed booking; sanitize quotes in build_panel.sh.

## 2026-06 — Invoice Update Alert
- Customers get a notification with the NEW invoice total whenever rate-card additional work changes it:
  - Partner adds work → one combined notification "Additional work added · Invoice updated" (new total + balance due, event additional_work_added)
  - Partner removes an item → "Invoice updated" with the recalculated total (event invoice_updated)
  - Customer pays the additional work → "Invoice updated … (fully paid)"
  - An existing invoice updated in place → a single "Invoice updated" with invoice number + total (guarded by modified_count, so it doesn't repeat)
- New admin template event `invoice_updated` (vars: booking_id, amount, total). Push taps open the booking (type booking_update).
- Tests: backend/tests/test_invoice_update_notifications.py (iteration_274: 5/5 passed)

## 2026-06 — Rate Service sheet: tip removed + keyboard fix
- Removed the tip / thank-you card from the Rate Service sheet (Expo customer app + customer web). The backend tip endpoint was left unchanged.
- Expo app: Keyboard listeners now lift the sheet by the keyboard height so the comment box stays above the keyboard. Web: a visualViewport keyboard-inset hook does the same.
- iteration_275: web 100% passed; Expo changes were only code-reviewed.
