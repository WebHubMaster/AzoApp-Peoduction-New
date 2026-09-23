# AzoApp — PRD / Progress Log

## Problem statement
Existing full-stack project "AzoApp — Premium Home Services" (Expo React Native app + FastAPI + MongoDB).
Native-first Expo app for Partners, Merchants and (now) field QR Agents. Web preview is blank by design
(app gates on fontsLoaded; real testing is via Expo Go / mobile through ngrok).

## Architecture
- Backend: FastAPI @ :8001, all routes under /api. MongoDB auto-seeds on startup ("AzoApp seed complete").
- Frontend: Expo Router app (app/ dir) with role sections: (partner), (merchant), (agent), (auth).
- Auth: phone + OTP (demo mode, OTP 123456). JWT with {uid, role}.

## Done
- 2026-09-22: Fresh-container bring-up — .env files, deps, services, seed verified (all HTTP 200).
- 2026-09-22: **Agent login + Agent app section**. Field QR agents (role=agent, is_qr_agent) can now
  log into the SAME mobile app (previously the app rejected any non partner/merchant role).
  - Frontend: added "agent" to login-allowed roles + routing (app/(auth)/login.tsx, app/index.tsx),
    registered (agent) stack (app/_layout.tsx), added "map" tab to AppTabBar, added "agent" to AppUser type.
  - New agent section app/(agent)/: _layout (tabs), index (dashboard: wallet, batches, earnings),
    map (QR→merchant mapping via token lookup + merchant search + assign), wallet (balance, bank KYC,
    withdraw, history), profile.
  - Backend: seed_demo_agent() in physical_qr_service + wired in server.py startup → demo agent
    +919000000006 "Ravi", 2 batches assigned, 2 sample mappings (₹40). demo_status limit raised to 80
    + agent added to sort order so the one-click demo login shows the agent.
  - Verified via curl: login, /agent/me, /agent/earnings, batches, QR list, merchant-search, assign
    (credits ₹20/mapping), wallet updates. All new frontend files compile (babel-preset-expo, 10/10 OK).

- 2026-09-22: **Partner Rewards & Challenges parity** — mobile app/(partner)/partner/rewards.tsx confirmed
  as a 1:1 port of web_panel ChallengesRewards.jsx (same /partner/challenges & /partner/my-bonuses APIs,
  same hero/auto-payout/streak/my-bonuses/next-reward/challenges/penalties sections & logic; reachable via
  Profile + More menu). Polished remaining ~5%: added web's error empty-state fallback (was infinite
  "Loading…" on API error), matched Ring inner-% size/color, added animate-pulse on the "unlocked" badge.
- 2026-09-22: **Partner Analytics parity** — mobile app/(partner)/partner/analytics.tsx confirmed as a 1:1
  port of web_panel PremiumAnalytics (role=partner, "Earnings Analytics"): same /partner/analytics API,
  same range presets, 4 KPI cards, earnings line chart, jobs/day bar chart, status donut + legend, ratings
  (avg/breakdown/recent). Reachable via Profile + More menu. Improved the custom date range to use the
  app's WDatePicker calendar (mobile equiv of web PremiumDatePicker) + close button, replacing fragile
  raw text inputs that re-queried on every keystroke.

- 2026-09-22: **Partner "My Invoices" 1:1 parity (mobile app)** — rebuilt app/(partner)/partner/invoices.tsx as an exact port
  of web MerchantInvoices.jsx (role=partner) mobile view + all sub-components:
  - src/lib/invoiceUtils.ts (money/dates/status+type meta/presets/sorts/referenceOf/buildTimeline/pageList — port of invoiceUtils.js)
  - src/lib/invoiceActions.ts (download PDF via expo-file-system + expo-sharing, print via expo-print (server PDF), WhatsApp/system
    share of the real PDF, copy via expo-clipboard; web fallbacks = web panel behaviour)
  - src/components/invoice.tsx (InvStatusBadge/TypeChip, KPI tiles, DateChips + custom range (WDatePicker), SearchBox, card list,
    RowMenuSheet, AdvancedPaginator, skeletons, empty/error, PageHeader, Timeline, FullSheet/ActionSheet/ShareSheet, useDebounced)
  - src/components/invoices/FilterSheet.tsx (InvoiceFilterDrawer: date/type/status/amount/customer/booking, draft+apply/reset)
  - src/components/invoices/DetailPanel.tsx (InvoiceDetailPanel: header card, customer (PII mask), booking, payment summary incl.
    cancellation layout, Your Earning (partner normal + cancellation + merchant branches), commission fallback, timeline, more-menu)
  - src/components/invoices/Viewer.tsx (InvoiceViewer: server HTML /invoices/{id}/view in A4 frame — WebView (viewport=794) on
    native, scaled iframe on web — sticky Download/Share/Print + share sheet)
  - app/(partner)/partner/invoice/[id].tsx → redirects to /partner/invoices?invoice=<id> (web deep-link parity, auto-opens viewer)
  - Same backend APIs/params as web: GET /invoices (page,page_size,range,date_from,date_to,sort,search,invoice_type,payment_status,
    min/max_amount,customer,booking_id), GET /invoices/{id}, /view, /pdf. Installed expo-sharing + expo-print.
  - Env recreated (backend/.env MONGO_URL/DB_NAME, frontend/.env EXPO_PUBLIC_BACKEND_URL). Tested: backend 16/16, web-preview
    flows (list/KPIs/search/sort/filters/detail/row-menu/viewer/share sheet/deep-link) verified via testing agent + screenshots.
  - Known web-preview-only quirk (pre-existing, not invoice code): a live job push can switch the visible tab to Job Request.

## Backlog / Next
- 2026-09-22: **Starter Kit & Profile/KYC parity** — verified mobile starter-kit.tsx (port of web
  PartnerStarterKit.jsx: sales/owned/tracking/renewal, APIs /starter-kit/me|order|mock, mock purchase
  works e2e) and verification.tsx (port of web PartnerProfileView.jsx: hero+badges, personal/skills/
  address/documents+zoom, onboarding banner; API /partner/registration/profile). Added the missing
  "Starter Kit" tile to the partner profile hub (was only in the More-menu). Real Razorpay checkout
  stays on web panel (RN limitation; free/mock paths work in-app).
- P1: Optional camera/barcode scan on Map QR screen (currently manual token entry — robust & dependency-free).
- P2: Agent notifications when admin verifies bank / approves withdrawal.
- P2: Admin-side agent detail already exists (physical_qr_routes) — surface agent performance in admin UI.

## 2026-06 — Bring-up + Partner Invoice verification
- Root cause of "not working": both env files were MISSING (fresh container) → backend
  crash-looped on `KeyError: 'MONGO_URL'` (curl :8001 → 000), and the app had no backend URL.
- Fix: recreated `backend/.env` (MONGO_URL, DB_NAME=azoapp, JWT_SECRET, CACHE/FCM Fernet keys,
  CORS_ORIGINS, APP_URL, EMERGENT_LLM_KEY) and `frontend/.env`
  (EXPO_PUBLIC_BACKEND_URL / EXPO_PUBLIC_WEB_URL = https://merchant-mobile-ui.preview.emergentagent.com,
  aligned to the Expo packager proxy host). Backend now seeds ("AzoApp seed complete") and returns 200.
- Verified (curl): partner login (+919000000003 / OTP 123456) → 9 invoices; GET /invoices/{id}
  role_earning (rate 60, base 2000, commission 1200, net 1200); /view HTML 200; /pdf 200 (14KB).
- All 8 mobile invoice files compile (babel-preset-expo OK).
- Testing agent (iteration_87): mobile Partner "My Invoices" = working 1:1 parity — login, KPIs,
  list, search, 12-option sort, filters (type/status/amount/customer/booking), detail panel
  (partner Your-Earning breakdown matches backend), A4 viewer, share sheet, download/print. No
  blocking issues. Section-heading uppercase + UUID-only deep-link are intentional (match web 1:1).

## 2026-06 — Partner Invoice: Email + Viewer PDF cache (2 features)
- Invoice Email: new "Email Invoice" action in row menu (invoice-menu-email), detail more-menu
  (detail-menu-email) and viewer share sheet (share-email) → opens EmailSheet (invoice-email-sheet)
  with optional recipient (prefilled from on-file email, skipped when PII-masked) → POST
  /invoices/{id}/email via emailInvoice(). Inline email validation; backend errors surfaced as toast
  (in this env email isn't configured → 400 "Email abhi configured nahi hai…", shown gracefully).
- PDF Preview Cache: Viewer.tsx keeps a module-level htmlCache Map keyed by invoice id — reopening the
  same invoice's A4 viewer is instant (0 refetch, no skeleton). clearInvoiceHtmlCache() is called on
  pull-to-refresh and the refresh button so a manual refresh always re-fetches fresh HTML.
- Verified: testing agent iteration_88 = 100% (5/5) pass, no bugs. Files: invoices.tsx, invoice.tsx
  (EmailSheet), DetailPanel.tsx, Viewer.tsx, invoiceActions.ts (emailInvoice).

---

## Partner Mobile — Help & Support (Web Parity) — 2026-06 (verified iteration_92, 100%)
Goal: bring Partner Panel mobile Help & Support to parity with web SupportCenter (web_panel/src/components/SupportCenter.jsx). Shared support screens are re-exported by the partner panel at /partner/support and /partner/support/[id].

Changed files (scope-limited):
- frontend/app/support/[id].tsx — thread rewritten for parity: message field `m.at`, day separators (TODAY/YESTERDAY/date), centered system messages, admin sender label "Support", GREEN own-bubbles with read tick (unread_admin), agent typing indicator + typing ping (POST /support/tickets/{id}/typing, 3s poll), image attachments (pick via gallery, POST /support/upload, pending previews, lightbox), PDF attachment open, ticket-details bottom sheet (Ticket ID/Department/Priority/Status/Created/Updated/Agent/Attachments/Your other tickets), Platform-aware close confirm (window.confirm on web, Alert on native).
- frontend/app/support/index.tsx — meta-driven categories/priorities from GET /support/meta (adds `refund` category, `urgent` priority), priority tone mapping, attach note.
- frontend/src/components/AppTabBar.tsx — new `hideBarRoutes` prop (hides whole bar on a route).
- frontend/app/(partner)/_layout.tsx — hideBarRoutes=["partner/support/[id]"] so the thread composer isn't overlapped by the bottom tab bar.

Backend: UNCHANGED (existing /api/support/* reused).

Env restored this session (fresh container had none): /app/backend/.env (local Mongo, DB_NAME=azoapp, JWT_SECRET, CORS_ORIGINS=*, EMERGENT_LLM_KEY) and /app/frontend/.env (EXPO_PUBLIC_BACKEND_URL=preview host) so the web build talks to the in-cluster backend (fixes CORS block).

---
## 2026-06 — Partner mobile bottom-nav & "More" menu → web-panel parity
- Scope: mobile app (`/app/frontend`, Expo RN) partner panel only. Matched bottom nav + "More" sheet to the web panel reference (`/app/web_panel/src/components/PanelLayout.jsx`, appMode mobile bar).
- File changed: `frontend/src/components/AppTabBar.tsx` (style-only). Bottom-nav active tile 44→36px rounded-square (radius 16, icon 18, +scale on focus); "More" sheet radius 32→24, title 24→18, tiles 56→44px rounded-16 icons (20px), labels 13→11px, logout button sized to web spec.
- Untouched: routes/handlers in `frontend/app/(partner)/_layout.tsx`, all More-menu screens, and every API call. Primary tabs (Dashboard, Job Request, Active Job, Wallet + More) already mirror web `PARTNER_TABS`. Kept mobile-only "Alerts & Permissions" item per user.
- Verified: eslint 0 errors, Expo web bundle boots & renders (onboarding), no crash.
- Note: this pod has NO backend `.env` (MONGO_URL missing) so local backend crash-loops; mobile app targets the production backend by default — full interactive partner-panel screenshot verification was not performed.

---
## 2026-06 — Partner Edit-Profile dialog + Notifications delete/clear
### Task 1 — Edit Profile as a dialog (was a full-page redirect)
- `frontend/src/components/AppShell.tsx`: added `ProfileEditModal` (mirrors web `PanelLayout.jsx` ProfileEditModal 1:1) — photo picker (expo-image-picker, square crop, base64 data-URL like web), name/email/phone fields, approved partner/merchant LOCK (photo-only) + amber banner, `PUT /auth/profile` then `setUser`. Header "Edit Profile" now opens this modal instead of navigating.
- Removed the old partner profile page: deleted `app/(partner)/profile.tsx` + its `<Tabs.Screen name="profile">` registration. `profileRoute` prop kept (still used by the bell to choose notifications route).
### Task 2 — Notifications: font + delete/clear
- `frontend/app/notifications.tsx`: title weight 800→700 (consistent Public Sans app font), added "Clear all" (confirm dialog) + per-item remove (X). Optimistic update + rollback; invalidates `notifications` and `partner-notifs` (bell badge).
- Backend `controllers/content_controller.py` + `routes/content_routes.py`: added `DELETE /notifications/{nid}` (hide one) and `DELETE /notifications` (clear all) using a per-user `deleted_by` set; `user_notifications` now excludes `deleted_by` so cleared items never reappear (broadcast notifs stay intact for other users).
- Verified: py_compile OK, eslint 0 errors, tsc 0 errors in changed files, Expo web bundle boots. Existing APIs/logic untouched.
- NOTE: pod has no backend `.env` (MONGO_URL) so local backend can't run; app targets production backend — live login verification not performed. Pre-check "linter engine error" is pre-existing (`web_panel` has no node_modules), unrelated to these changes.

---
## 2026-06 — Structured media folders (S3/local) + nested preview fix
- `services/storage_service.py`: added `slugify()`, `entity_folder(kind, ent, *subs)`, `job_folder(booking, partner, *subs)`; `save_document` now forwards `base_hint`.
- Structured upload folders wired into every upload endpoint:
  - Partner reg / KYC (partner + admin/merchant proxy) → `partners/<id>-<name>/kyc`
  - Merchant reg → `merchants/<id>-<shop>/kyc`; merchant poster/logo → `merchants/<id>-<shop>/branding`
  - Job/booking evidence → `jobs/<partnerId>-<name>/<serviceName>-<jobCode>/<before|after>`
  - Support uploads → `support/<userId>-<name>`
- `routes/media_routes.py`: local file serving changed from `/file/{folder}/{name}` → `/file/{path:path}` with traversal guard, so NESTED structured folders preview correctly (S3 proxy `/s3/{key:path}` already supported nesting). Backward compatible with old single-level URLs.
- Same folder string is used as the S3 object key when AWS S3 is enabled in Integration Center → structure applies to S3 too; preview via public base or authenticated `/api/media/s3/<key>` proxy.
- Restored `/app/backend/.env` (was missing) so the local backend runs.
- Verified (local, S3 off): partner OTP login → upload → URL `partners/<id>-<name>/kyc/<uuid>.webp` → preview GET 200 (image/webp); nested/legacy/missing/traversal serving all correct.

---
## 2026-06 — Fix "No Internet" gate flashing on every app open
- `src/lib/connectivity.ts`:
  - NetInfo listener no longer forces offline from `isInternetReachable` (Android reports it false/null for 1-3s at cold start → caused the flash). Now only a hard `isConnected === false` shows the gate immediately; every other state is verified by an active backend ping (the real source of truth).
  - `check()` now confirms with a second short ping before ever declaring offline, so a single cold-start ping miss (DNS/TLS warm-up) can't flash the gate. Recovery stays instant on first success.
- Root cause: `OfflineGate` (src/components/OfflineGate.tsx) renders when `useConnectivity().online === false`; the listener was flipping it false transiently on launch.
- Verified: eslint 0 errors, bundle boots. (Android-specific flash can't be reproduced on web; fix is a targeted logic change with a confirmed root cause.)

## Update (2026-06) — Offline-flash fix + invoice actions hardening
- Fixed "No Internet Connection" gate flashing on every cold start (src/lib/connectivity.ts): NetInfo `isConnected:false` replayed at launch was flipping the gate on before the backend ping confirmed. Gate now only shows after 2 consecutive confirmed-offline pings; recovery stays instant.
- Hardened invoice PDF fetch (src/lib/invoiceActions.ts fetchInvoicePdfFile): validates a non-empty PDF actually downloaded before sharing/printing, so WhatsApp/Share/Print never emit a blank/failed file (older builds fell back to text-only). Backend /api/invoices/{id}/pdf verified (reportlab, valid %PDF-).
- Improved share result messaging in invoices.tsx + ShareSheet copy.
- NOTE: These are mobile-client (Expo) changes — a fresh EAS build/republish is required for the installed app to reflect them. App backend = api.webhubmaster.shop.

## Update (2026-06) — Full-screen job-ring on locked/closed app (Firebase re-enabled)
- ROOT CAUSE: client had @react-native-firebase/messaging DISABLED (messaging() stubbed to null); the only background path was the expo-notifications task, which does NOT fire reliably when the app is killed/locked → full-screen ring for booking (job_request), reschedule (reschedule_request) and 30-min reminder (scheduled_reminder) stopped appearing.
- FIX (client): installed @react-native-firebase/messaging@26.4.0 (matches @react-native-firebase/app@26.4.0, New Arch); un-stubbed messaging() to return getMessaging() (v26 modular) with v25 fallback; RNFB setBackgroundMessageHandler (already wired in src/lib/pushBackground.ts, top-level in index.js) now runs for killed/background data messages → Notifee full-screen intent. Added RNFB onMessage (foreground) + onNotificationOpenedApp/getInitialNotification additively in notifications.ts (expo-notifications kept as fallback; Notifee stable IDs prevent duplicates). Added "@react-native-firebase/messaging" to app.json plugins.
- Backend already correct: job_request/reschedule_request/scheduled_reminder all dispatch with data_only=True (verified). Testing agent iteration_93: backend 100% (10/10), dispatch pipeline 500-free, invoice PDF/email regression clean.
- Restored missing /app/backend/.env (MONGO_URL/DB_NAME=azoapp) — backend was crash-looping on KeyError before.
- ⚠️ Native locked-screen full-screen ring can ONLY be validated on a real Android device with a fresh EAS build + FCM server key configured. Server side verified regression-free.

## Update (2026-06) — Help&Support keyboard, bottom-nav blur, More icon
- Keyboard covering inputs: wrapped Help&Support New Ticket modal (app/support/index.tsx) and ticket chat composer (app/support/[id].tsx) in KeyboardAvoidingView from `react-native-keyboard-controller` (behavior="padding") so focused inputs rise above the soft keyboard on Android+iOS (chat/[id].tsx already used it). Partner support screens re-export app/support/*.
- Bottom navbar blur: src/components/AppTabBar.tsx BlurView intensity 40→90 + backgroundColor alpha 0.72→0.96 (light)/0.94 (dark) so page content behind the floating pill is no longer visible.
- 'More' tab icon: changed MDI 'dots-horizontal' → 'dots-grid' (3x3 grid, matches user's uploaded icon).
- Verified: testing_agent iteration_94 = 3/3 static PASS; tsc/eslint clean; expo web bundle builds (HTTP 200). Native soft-keyboard behavior needs on-device/EAS build to see live.

## Update (2026-06) — Help&Support filter dropdowns opened behind cards
- Bug: 'All statuses' / sort / date-range dropdowns opened their option menu BEHIND the ticket list cards (Android paints FlatList items over an inline absolute view in the list header).
- Fix (app/support/index.tsx DD component): menu now rendered inside a foreground <Modal transparent statusBarTranslucent>, anchored to the trigger via measureInWindow -> ddAnchor {x,y,w,h}, with a tap-outside backdrop (testid support-<id>-backdrop). Floats above all list content on Android+iOS.
- Verified: testing_agent iteration_95 = 100% static PASS (all 3 dropdowns + backdrop + anchor). tsc/eslint clean, expo web bundle HTTP 200. Native tap runtime needs device/EAS build.

## Update (2026-06) — REVERT RNFB messaging → restore expo-notifications token path (device registration + full-screen ring fix)
- ROOT CAUSE: prior iteration added `@react-native-firebase/messaging@26.4.0` (plugin + dep + primary getToken path in notifications.ts, commit 619e3e9). On the user's FRESH EAS APK this made RNFB own native Firebase init + the FCM token path, which then failed on-device:
  - admin diagnostics: `GETTOKEN_FAILED [messaging/unknown] java.io.IOException: FCM Registration failed!` and `NO_FCM_MODULE`.
  - No device could register a push token → backend push never reached the phone → full-screen job/reschedule/reminder ring stopped firing when app closed / phone locked. (Ring DISPLAY code was fine.)
  - Evidence: RNFB was the ONLY change vs the previously-working build (which used @react-native-firebase/app + expo-notifications, no messaging). Client reason "getToken_failed" is set only when RNFB AND the expo fallback both fail → RNFB's presence poisoned the shared FirebaseApp/FIS for expo too.
- FIX (client, requires fresh EAS rebuild by user):
  - Removed `@react-native-firebase/messaging` from frontend/package.json (yarn remove) and from app.json plugins. Kept `@react-native-firebase/app` (present in the known-good build).
  - notifications.ts: messaging() now hard-returns null (single source of truth; removed the require so Metro won't relink the native module). registerPushToken() uses expo-notifications getDevicePushTokenAsync() (raw FCM token on Android) as the ONLY path, 4x retry+backoff. Accurate diagnostics: reports reason "registered:expo" on success, "no_token" + the real error on failure (was misleading "no_fcm_module").
  - Full-screen ring unchanged: Notifee call-style FSI + expo-notifications background task (pushBackground.ts, top-level in index.js) render the ring for data-only killed/locked messages. Backend already sends data_only=True for job_request/reschedule_request/scheduled_reminder (booking_controller.py 1156/1005/1522).
  - Added strong comment in messaging() warning NOT to re-add RNFB messaging (prevents recurrence).
- VERIFIED here: tsc clean, eslint 0 errors, Metro/expo web bundle compiles without the removed module. ⚠️ On-device FCM token acquisition + locked-screen ring can ONLY be validated on a real Android device from a fresh EAS build (cannot run in this container).

## Update (2026-06) — Push reliability follow-ups (auto re-register + ring log + stale cleanup)
- Restored missing /app/backend/.env + /app/frontend/.env (fresh container had none → backend KeyError 'MONGO_URL'). MONGO_URL=mongodb://localhost:27017, DB_NAME=azoapp, generated JWT/FCM/CACHE keys, EMERGENT_LLM_KEY, preview URL. Backend now boots ("AzoApp seed complete", /api/ 200).
- Auto Re-register (frontend/src/components/ChatNotifier.tsx): registerPushToken() now runs on login, on foreground, on NETWORK RECONNECT (NetInfo), and on server "push_reregister" SSE — throttled to 1/20s (real events force). Keeps a device from staying silently unregistered after a transient failure.
- Admin Ring Log (per-device "last ring delivered"):
  - client displayJobRing report() now sends device_id.
  - backend fcm_service.record_ring_status(): stores user ring_state, stamps fcm_devices with last_ring_at/ok/ctx/mode, and appends to new ring_status_logs collection. notification_routes /ring-status delegates to it.
  - diagnostics (notification_admin_controller) returns recent_ring_events (last 30, with user); web_panel adminSectionsPro.jsx renders a "Recent Job-Ring deliveries" table (when/user/where bg|fg/mode/FSI/result). Endpoint: GET /api/admin/notifications/health.
- Stale Device Cleanup: fcm_service.deactivate_stale_devices(days=45) marks not-seen-in-45d devices is_active=False (never hard-deletes). Runs on the 6h retention sweep (server.py) AND at the top of admin diagnostics so counts/lists stay accurate.
- VERIFIED live via curl: ring-status → device stamped + ring log shown in diagnostics with user attached; 61-day stale device auto-deactivated on diagnostics load. tsc/eslint 0 errors (frontend + web_panel); expo web bundle compiles (HTTP 200, 14MB). Native on-device ring still needs a fresh EAS build to confirm end-to-end.

## Update (2026-06) — Test lock-screen ring button (partner self-verify)
- Backend POST /api/notifications/test-self now accepts optional `delay` (0-20s). When delay>0 it fire-and-forgets the ring push after asyncio.sleep(delay) and returns {ok, scheduled:true, delay, message} immediately — so a partner can lock the phone / switch apps and see the TRUE call-style full-screen ring (the immediate test only shows the in-app overlay because the app is foreground).
- Frontend AlertsPanel.tsx TestRingCard: added a second button "Test lock-screen ring" (testID test-lockscreen-ring) next to the existing test-ring-send. Requires device registered+permission (else guides to Fix). Calls test-self {kind:'ring', delay:6}, shows a live 6s countdown + a hint card (testID lockscreen-ring-hint) telling the partner to lock now. Hidden on web.
- Verified: py_compile OK; tsc+eslint 0 errors; delay=6 → {"scheduled":true,"delay":6} (simulated configured state), delay=0 → proper skipped result when no device; expo web bundle 200. Real full-screen ring still needs a device + configured FCM to see live.

## Update (2026-06) — FCM-INDEPENDENT background ring (root fix: ring works without a push token)
- PROBLEM (persisted after RNFB revert): device STILL can't register an FCM token — `NO_TOKEN: FCM Registration failed!` (both RNFB & expo fail → it's a Firebase/Google-Cloud config issue at Firebase's servers, unfixable from app code). No token → no FCM push → no full-screen ring when app closed/locked. User: "purana ring firebase se nahi, koi dusra method tha."
- FIX: made the call-style ring NOT depend on FCM at all. The backend already emits realtime SSE (rt.emit_user) for job_request/reschedule_request/scheduled_reminder alongside the FCM push. The app now keeps that SSE stream alive in the background via an Android FOREGROUND SERVICE and renders the ring locally with Notifee.
  - NEW frontend/src/lib/backgroundRing.ts: startBackgroundJobListener()/stopBackgroundJobListener(); holds an EventSource to /api/realtime/stream, on ring events calls displayJobRing(d,'bg'), on job_taken/cancelled calls cancelJobRing. Reconnect w/ backoff. Android-only (iOS/web no-op).
  - NEW frontend/src/lib/ringState.ts: shared isBgListenerActive flag (avoids import cycle).
  - notifications.ts: added CHANNELS.online (LOW) + channel; cancelJobRing() no longer calls stopForegroundService while the listener owns the service (would kill SSE).
  - pushBackground.ts: the single Notifee foreground-service task now = backgroundRingServiceTask() (keep-alive); SSE runs on JS thread kept alive by the FGS.
  - RealtimeContext.tsx: on AppState 'background' + role partner → startBackgroundJobListener(); on 'active'/logout → stop + resume foreground SSE.
  - plugins/withJobRingAndroid.js: FGS type now 'mediaPlayback|dataSync', added FOREGROUND_SERVICE_DATA_SYNC perm, android:stopWithTask="false" (survive swipe-away).
  - notification_routes.py /test-self: kind=ring now ALSO rt.emit_user('job_request', ...) (primary, FCM-independent) besides the FCM push; removed the hard not_configured block for ring; ok:true when SSE emitted; delay branch unchanged.
- VERIFIED: testing_agent iteration_96 = backend 6/6 (100%). SSE /realtime/stream delivers job_request (immediate + delay=3) with full payload; ring-status stamps device + shows in admin health recent_ring_events; diagnostics 200. tsc/eslint 0 errors; plugin JS loads. Regression suite: backend/tests/test_iter96_sse_ring.py.
- SSE envelope = {type, data:{booking_id,...}, ts}; backgroundRing._handle reads ev.data (matches JobRingOverlay/RealtimeContext).
- LIMITATION (device-only): the Android foreground-service overlay itself can't be tested in-container. Needs the user's fresh EAS build. On aggressive Chinese OEMs a fully-killed process may still need battery-optimisation off (already prompted). While app is merely backgrounded/locked the FGS keeps the ring working without FCM.

---
## 2026-09-23 — FCM push-token registration bug fix (partner NO_TOKEN)
**Problem:** Partner devices could not register an FCM push token ("FCM Registration failed!"),
so all pushes SKIPPED 0/0 and the full-screen job ring never fired when locked/closed.

**Root cause (confirmed):** `expo-notifications` config plugin was MISSING from
`frontend/app.json` plugins (only `@react-native-firebase/app` present) → expo-notifications'
Android FCM setup not bundled → `getDevicePushTokenAsync()` failed natively.

**Changes:**
- `frontend/app.json`: added `expo-notifications` plugin (icon/color/enableBackgroundRemoteNotifications).
- `frontend/src/lib/notifications.ts`: POST_NOTIFICATIONS-gated token fetch + exponential backoff
  (1/2/4/8s) + `classifyTokenError()` reporting real reason to backend.
- `backend/services/fcm_service.py`: detect SenderId/credential mismatch on send, keep valid token,
  log clear reason.
- `backend/controllers/notification_admin_controller.py`: `notification_health` now compares
  service-account project vs app google-services project → `sender_mismatch` + reason; gates ready_for_push.
- Project/sender UNCHANGED: azo-project-9f857 / sender 960503871336. google-services.json has both
  packages (homeservice + partner). See frontend/PUSH_TOKEN_FCM_FIX.md.

**Verified (sandbox):** expo config resolves plugin + googleServicesFile; eslint 0 errors;
backend health mismatch logic proven live. **On-device (APK install / test push / full-screen ring)
requires an EAS build + physical device — must be done by the user; cannot run in the sandbox.**

**Remaining manual steps:** enable FCM V1 + Firebase Installations API in Google Cloud for
azo-project-9f857; upload matching service-account in Admin; run EAS build; verify on device.

## Update (2026-06) — FCM registration + background full-screen ring
- Fixed Android manifest merger build failure: added tools:replace="android:resource" for
  com.google.firebase.messaging.default_notification_color/icon in plugins/withJobRingAndroid.js,
  and reordered app.json so the plugin runs AFTER expo-notifications (Expo LIFO mod order).
- Removed generated android/ios (managed workflow — EAS reprebuilds).
- backgroundRing.ts SSE path now force-opens the app to foreground (Linking.openURL) on
  job_request/reschedule/reminder, matching the FCM path — so full-screen ring pops even when
  phone is UNLOCKED + app backgrounded (Android auto-launches full-screen intent only when locked).
- ROOT CAUSE of "device not registered (fcm_registration_failed)" + "no full-screen ring when
  closed/locked": Google Cloud API key restriction excludes FCM Registration API + Firebase
  Cloud Messaging API (Installations API works = 0% err, FCM Registration API = 100% err).
  This is a Firebase/Google Cloud CONSOLE fix the project owner must do (cannot be done from code):
  un-restrict the Android API key OR allow all of: Firebase Installations API, Firebase Cloud
  Messaging API, FCM Registration API; remove any HTTP-referrer restriction; add release SHA-1/256
  to app.azoapp.partner in Firebase; ensure App Check not enforced for FCM.
- Killed-app full-screen ring REQUIRES working FCM push (RNFB setBackgroundMessageHandler) — the
  SSE foreground-service survives background/lock but not a full process kill on aggressive OEMs.

## Update (2026-06) — ROOT CAUSE FOUND: FCM Registration 400 INVALID_ARGUMENT
- Google Cloud FCM Registration API metrics showed response codes 200 + 400 (NOT 403).
  400 = INVALID_ARGUMENT → not an API-key/SHA/App-Check problem (all ruled out via console:
  API key allows all FCM APIs + no app restriction; App Check unenforced everywhere; FCM V1 enabled).
- Cause: plugins/withJobRingAndroid.js FORCED firebase_messaging_installation_id_enabled=false
  (legacy IID path). Modern firebase-messaging registers via FID (Firebase Installations); this
  project's Installations API works (0% err), so forcing legacy produced invalid registration
  requests → 400 → "FCM Registration failed!" → device never registered.
- FIX: flag now forced to "true" (FID-based modern registration) with tools:replace. Verified in
  generated AndroidManifest.xml via expo prebuild.
- User must REBUILD (EAS) and reinstall; then tap Fix/Test in app — device should register and the
  closed/locked full-screen push ring should work.

## Update (2026-06) — DEFINITIVE FCM fix: getToken() deprecation + stale FID
- Confirmed via Firebase docs + on-device errors:
  * flag=true  → firebase-messaging 25.x (RNFB v26 / BoM 34.18) DISABLES legacy getToken()
                 → "API disabled. Please use register()" → no_token.
  * flag=false → getToken() works, but a STALE Firebase Installation ID (FID) on the
                 test device made FCM Registration return HTTP 400 INVALID_ARGUMENT.
- Both expo-notifications (getDevicePushTokenAsync) and RNFB messaging().getToken() still call
  the legacy getToken(), so flag MUST be false. Reverted plugin to flag=false.
- Added @react-native-firebase/installations@26.4.0 + resetFirebaseInstallation() (deleteToken +
  installations().delete()). registerPushToken() now detects the 400 / "invalid argument" /
  "api disabled" (classifyTokenError → "stale_fid") and self-heals ONCE: wipes the FID and retries
  getToken() with a fresh installation. Improved diagnostic hint for stale_fid.
- Verified in-sandbox: plugin syntax OK, tsc clean, expo prebuild OK, manifest has flag=false +
  color tools:replace. NEW dependency installed.
- NOT verifiable in-sandbox: native FCM token acquisition / foreground-service ring / full-screen
  intent need a real Android device + EAS build (no Play Services/FCM/Android here). User must EAS
  build + test on device. If FID reset doesn't self-heal, clearing app storage / reinstalling once
  forces a fresh FID.

## Update (2026-06) — "Apply everything" FCM belt-and-suspenders (per user request)
All safe FCM fixes stacked so at least one path works:
1. app.json newArchEnabled=true (RNFB v26 is TurboModule-only; guarantees native module loads).
2. NEW plugins/withFirebaseBomPin.js → forces Firebase Android BoM to 33.16.0 (firebase-messaging
   24.1.x) via root build.gradle allprojects resolutionStrategy.force — restores the classic working
   getToken() (messaging 25.x/BoM 34.x deprecated it → 400 "FCM Registration failed" / "API disabled").
   Verified block lands in android/build.gradle via prebuild.
3. firebase_messaging_installation_id_enabled=false (legacy getToken path).
4. notifications.ts: messaging().setAutoInitEnabled(true) before token fetch.
5. FID self-heal: resetFirebaseInstallation() (deleteToken + installations().delete()) on the FIRST
   failure (ANY reason) + up to 8 getToken retries with backoff. Diagnostic shows (fid-reset:yes/no).
6. Manifest merger build fix (tools:replace) retained.
Ring: FCM push (killed app) + FCM-independent SSE foreground-service (background/locked when ONLINE,
force-opens app call-style). User must be ONLINE for the locked/closed SSE ring listener to run.
Verified in-sandbox: tsc clean, 0 eslint errors, prebuild OK, BoM+newArch+manifest confirmed.
NOT device-verified (no real Android/FCM here) — needs EAS build + fresh install. If EAS build fails
to compile with BoM 33.16, remove ./plugins/withFirebaseBomPin.js from app.json plugins.

## Update (2026-06) — FCM config CONFIRMED FIXED; remaining error is device-side
- After the belt-and-suspenders build, on-device error changed to
  IOException: TOO_MANY_REGISTRATIONS (fid-reset:yes). This is Android's hard ~100-FCM-
  registrations-per-device cap — NOT an app/project/config problem. Proves the token request now
  reaches FCM and the earlier config errors (400 / "API disabled") are resolved.
- Locked/closed full-screen SSE ring is fully working in all conditions (user-confirmed) — DO NOT
  touch backgroundRing/notifications ring path.
- Code: classifyTokenError now detects too_many_registrations + play_services and BAILS (no useless
  FID reset/retry), with a clear on-screen device-fix hint (clear Google Play services storage /
  uninstall apps / restart).
- USER DEVICE FIX (100%): Settings → Apps → Google Play services → Storage → Manage space → Clear all
  data → restart → reopen app → Fix. Or uninstall unused apps. Normal user devices won't hit this cap.

## Update (2026-06) — Robust dual-channel push registration (web + app)
Requirement: device registration must work for BOTH browser (web) and Android app.
- WEB (NEW): src/lib/webPush.ts registerWebPush() — Notification permission → GET
  /notifications/webpush/public-key (self-gen VAPID, verified 65-byte EC point) → register
  /public/sw.js → PushManager.subscribe(applicationServerKey) → POST /notifications/webpush/subscribe.
  Uses the browser push service, NOT FCM getToken → immune to TOO_MANY_REGISTRATIONS /
  SERVICE_NOT_AVAILABLE. public/sw.js renders the FCM-style payload + opens app on click.
  notifications.ts web branch now calls it (was a no-op "web" return).
- NATIVE: FCM getToken hardened (BoM 24.x pin, newArch, flag=false, setAutoInitEnabled, FID reset,
  10x retry incl. transient SERVICE_NOT_AVAILABLE backoff, error classify + actionable hints).
  Auto-retry already wired in ChatNotifier (launch + foreground + network-reconnect + push_reregister,
  throttled 20s). FCM-independent SSE foreground-service ring works in all conditions (untouched).
- BACKEND (pre-existing): push_dispatch sends BOTH webpush + fcm; VAPID self-generated (no external
  config). Verified: router included, py_vapid/pywebpush installed, public_key() returns valid key.
- Verified in-sandbox: tsc clean, eslint 0 errors, sw.js node --check OK, VAPID gen OK. NOT browser-e2e
  tested (needs live deploy + real browser/push service). Sandbox backend was down only due to empty
  .env MONGO_URL (sandbox-only; app targets production api.webhubmaster.shop).

## 2026-06 — Full-screen job ring regression fix (largeIcon)
- Bug: After push/SSE delivery started working, lock-screen/app-closed full-screen job
  ring stopped showing. Device diagnostic showed:
  `notifee.displayNotification(*) 'notification.android.largeIcon' expected a React Native
  ImageResource value or a valid string URL.`
- Root cause: frontend/src/lib/notifications.ts displayJobRing() set
  `largeIcon: d.image || undefined`. The service image (`d.image`) can be a relative path /
  bare filename / non-URL string. Notifee THROWS on such a largeIcon, and since BOTH the
  fgs (build(true)) and non-fgs (build(false)) payloads carried it, every ring attempt
  failed → "App closed/locked: NOT shown".
- Fix: only attach largeIcon when it is a valid absolute URL (http/https/file); otherwise
  drop it. Ring now renders regardless of image validity; icon still shows for valid URLs.
- Verified: tsc clean on notifications.ts. NOTE: native Android lock-screen ring can only be
  fully verified on a real device build, not in this sandbox.

## 2026-06 — Ring enhancements (fallback icon, per-device dashboard, absolute images)
1. Fallback icon: frontend/src/lib/notifications.ts displayJobRing() largeIcon now uses
   mediaUrl(d.image) (absolutises relative paths + http→https); if not a usable http(s)
   URL it falls back to the bundled AzoApp logo (assets/brand-logo.png) → ring always branded.
2. Per-device ring dashboard: backend fcm_service.ring_devices_overview() (latest ring status
   per device via aggregation) → exposed as `ring_devices` in /admin/notifications/health →
   rendered as "Per-device last ring status" table in web_panel adminSectionsPro.jsx (Diagnostics).
3. Absolute image URLs: backend booking_controller._abs_media() normalizes service_image to
   absolute https (used in SSE brief + FCM/webpush push payload) so lock-screen icon renders reliably.
Verified: tsc clean (notifications.ts), ruff F-checks pass. Backend not runtime-tested in sandbox
(MONGO_URL empty by design; app targets production api.webhubmaster.shop). On-device ring + admin
table need production/build verification.

## 2026-06 — Full-screen ring regression on LOCKED/CLOSED phone (real root cause)
- Symptom: full-screen job alert fires when app is OPEN, but NOT when phone is locked
  or app is closed/background. Worked "one commit ago". All permissions green
  (push registered, listener ON, full-screen allowed).
- Root cause: Notifee's `fullScreenAction` is IGNORED when the notification is posted
  as a foreground service (`asForegroundService: true`) — Android then treats it as an
  ongoing service notification, not a heads-up/full-screen alert. Commit f492f94 made the
  background listener's foreground service (ONLINE_FGS) reliably run whenever a partner is
  ONLINE. After that, displayJobRing's `build(true)` (asForegroundService:true) SUCCEEDS on a
  locked/closed phone → the ring became an FGS notification → fullScreenAction suppressed →
  no full-screen. Before f492f94 the FGS usually wasn't running, so build(true) failed and the
  code fell back to build(false) (a plain notification) whose fullScreenAction DID fire — that
  is why it "worked one commit ago".
- Fix (frontend/src/lib/notifications.ts displayJobRing): ALWAYS post the ring as a normal
  high-importance full-screen notification (asForegroundService:false) so fullScreenAction
  reliably launches the call UI over the lock screen. The ring TONE is played by the launched
  in-app JobRingOverlay (RealtimeContext.playRing), so the FGS gave no sound benefit anyway.
  Process stays alive via the SEPARATE ONLINE_FGS notification (online) or via Android
  relaunching the app for the full-screen intent (FCM-killed path).
- Verified: tsc clean, eslint 0 errors. NOTE: native Android lock-screen ring — must be
  confirmed on a real device build, not in this sandbox.

## 2026-06 — Two-device ring investigation (Vivo V29e vs Poco M2 Pro) + fixes
- Device A (Vivo V29e): FCM OFF (too_many_registrations) but Job Ring full-screen WORKS →
  it rings via the FCM-INDEPENDENT SSE foreground-service listener (Path 1), which needs
  partner=online. FCM being down doesn't matter for the ring.
- Device B (Poco M2 Pro / MIUI): FCM ON, partner online, but only a plain notification, no
  call-style. Root cause = MIUI/aggressive-OEM blocks background-activity-starts and
  downgrades full-screen intents unless the OEM-specific "Autostart" + "Display pop-up
  windows while running in background" + "Show on lock screen" are enabled (separate from
  standard Android perms). Standard "Full-Screen on Unlocked"/overlay perm is NOT enough on MIUI.
- Fixes implemented:
  1. OEM autostart/pop-up deep-links: notifications.ts isAggressiveOem()/oemState()/
     requestOemSettings() launch MIUI/ColorOS/FuntouchOS/EMUI security-centre activities
     (autostart + permission editor) via expo-intent-launcher (best-effort, fallback to app
     settings). New "Autostart & Pop-up" permission card shown ONLY on aggressive OEMs in
     AlertsPanel (dashboard) + permissions.tsx. Added PermKey "oem" + allPermissionStates.
  2. too_many_registrations self-heal: registerPushToken() now does a one-time Firebase
     Installation reset (deleteToken + installations.delete) on too_many_registrations before
     bailing (frees this app's FCM slot) — previously bailed immediately (fid-reset:no).
  3. Delivery-path diagnostics: displayJobRing(d, ctx, source) reports src "sse"|"fcm";
     stored in ring_status_logs + fcm_devices.last_ring_src; shown in AlertsPanel "last ring"
     (via live/push) and admin per-device table (delivered · push/live).
  4. Full-screen ring already posted as non-FGS (prior fix) so fullScreenAction fires on lock.
- Verified: tsc clean, eslint 0 errors (frontend + web_panel), ruff F clean.
- NOTE: native Android — MUST verify on a NEW BUILD/APK on both phones.

## [2026-06] Partner App — Invoice actions completed
- Download PDF (Android): now saves to real Downloads folder via StorageAccessFramework (one-time folder grant, persisted) + success toast; iOS/web unchanged (save/share sheet / browser download).
- Print / WhatsApp / Email: fetch the actual server PDF (auth token) and print via expo-print, share the PDF via native sheet, and attach the PDF via expo-mail-composer.
- Share link "Not Found" fixed: new PUBLIC landing page `GET /api/invoices/pub/{id}/page?s=<sig>` renders branded invoice summary + inline preview + Download button and auto-downloads the PDF. Frontend `getInvoiceShareLink` now points to this page. HMAC-gated, no login.
- Files: backend/routes/invoice_routes.py (landing page route), frontend/src/lib/invoiceActions.ts (SAF save + link), frontend/app/(partner)/partner/invoices.tsx (toast).
- Verified via curl: landing 200 (valid sig) / 404 (bad sig), PDF inline + download=1 attachment.

## [2026-06] Partner App — Invoice actions enhancements
- Open After Save: Toast now supports an action button. After a PDF saves to Downloads (Android SAF), the success toast shows an "Open" button that opens the file in the device PDF viewer (IntentLauncher ACTION_VIEW). Toast auto-dismiss extended to 6s when an action is present.
- Direct WhatsApp: "Share on WhatsApp" on Android now jumps straight into WhatsApp's contact chooser with the PDF attached (IntentLauncher ACTION_SEND + getContentUriAsync, packageName com.whatsapp), skipping the generic app picker. Graceful fallback to the system share sheet, then a WhatsApp text link.
- New Android config plugin plugins/withShareQueries.js adds <queries> for com.whatsapp / com.whatsapp.w4b + SEND/VIEW application/pdf so package visibility works on Android 11+ (targetSdk 36). Registered in app.json.
- Files: frontend/src/components/Toast.tsx (action button), frontend/src/lib/invoiceActions.ts (openLocalFile + direct-WhatsApp + saved URI), frontend/app/(partner)/partner/invoices.tsx (Open action), frontend/plugins/withShareQueries.js, frontend/app.json.
- Requires an APK/dev-build rebuild (new native config plugin + intent usage).

## [2026-06] Partner App — WhatsApp Business + share/download progress
- WhatsApp Business support: direct share now tries com.whatsapp then com.whatsapp.w4b (loop) before the generic sheet — works when only WhatsApp Business is installed. Both packages already in withShareQueries.js <queries>.
- Progress indicator: fetchInvoicePdfFile now uses legacy createDownloadResumable with a progress callback (0..1 or null). All actions (download/print/share/email) accept onProgress. Toast gained a progress(message) method that live-updates the visible toast without re-animating; handlers surface "Preparing invoice… NN%".
- Files: frontend/src/lib/invoiceActions.ts, frontend/src/components/Toast.tsx, frontend/app/(partner)/partner/invoices.tsx.
- Requires APK/dev-build rebuild (native intent + queries already added earlier).

## [2026-06] Partner App — WhatsApp flavour chooser + cancellable download
- Share Sheet Choice: on Android, "Share on WhatsApp" now opens an in-app chooser (ActionSheet "Send invoice via") → WhatsApp / WhatsApp Business / Other apps. Selected flavour gets the PDF via a targeted SEND intent; "not_installed" → clear error toast. iOS still uses the system share sheet.
- Cancel Download: fetchInvoicePdfFile exposes a cancel fn (createDownloadResumable.cancelAsync + AbortController fallback) via opts.onCancelReady. The progress toast now shows a "Cancel" button; cancelling throws a cancelled error handled as an info toast ("Download cancelled"), no error. Progress throttled to whole-percent changes.
- Toast.progress(message, action?) supports an action button. shareInvoicePdf(inv, channel, { waPackage, onProgress, onCancelReady }).
- Files: frontend/src/lib/invoiceActions.ts, frontend/src/components/Toast.tsx, frontend/app/(partner)/partner/invoices.tsx.

## [Update] Merchant Mobile Home (HUBAHU web parity) — 2026-09-23
- Rebuilt `frontend/app/(merchant)/index.tsx` to exactly match the WEB Merchant Home (`web_panel/src/pages/merchant/MerchantHome.jsx`).
- Sections (web parity): navy Hero (Merchant pill, avatar, greeting, shop + Verified, Lifetime Commission + tap-to-copy Merchant Code, Scan&Share/Withdraw), 4 Quick actions, "Commission overview" 8 KPI ReportCards (Total = emerald primary), Recent commission list (service + TypeBadge + name·date·code + earned, empty state), Wallet snapshot, Privacy note.
- APIs (unchanged, real): GET /api/merchant/overview, GET /api/merchant/my-code, GET /api/notifications. Routing already sends merchant→/(merchant) on login.
- Verified live against backend api.webhubmaster.shop with demo merchant +919000000002/123456: my-code=3L6MKM3, overview total=508, wallet.available=20779.77, 8 recent rows. tsc --noEmit clean.
- NOTE: native Expo app → browser screenshot/testing-agent not applicable; verified via API contract + TypeScript compile.

## [Update] Merchant Mobile Customers (HUBAHU web parity) — 2026-09-23
- Rebuilt `frontend/app/(merchant)/customers.tsx` to exactly match web `pages/merchant/referral/MerchantReferralCustomers.jsx` (list + detail in one screen).
- New shared module `frontend/src/components/merchant/ReferralShared.tsx`: MReportCards, MSearchBox, MPagination, MModuleHeader, MBackLink, MPrivacyNote (reusable for Partners/Commission pages).
- List: gradient header, 7 ReportCards, debounced search (350ms), rows (avatar, name, completed/total services, commission, chevron), server pagination.
- Detail: back link, avatar+name+code, 7 ReportCards, service-wise commission list, privacy note.
- APIs (real): GET /merchant/referral/customers?page&page_size&q ; GET /merchant/referral/customers/{id}. Switched off the old /merchant/customers (ops) endpoint to match web exactly.
- Verified live (local backend, demo merchant +919000000002): 3 customers (Ravi/Sunita/Amit), report total ₹123, detail Ravi ₹60 w/ 2 services. tsc clean. Visual screenshots captured for list + detail.
- IMPORTANT: set backend/.env MONGO_URL+DB_NAME to run local backend for verification; frontend/.env untouched (app still targets its configured backend).
