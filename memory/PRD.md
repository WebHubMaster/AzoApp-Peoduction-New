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
  (EXPO_PUBLIC_BACKEND_URL / EXPO_PUBLIC_WEB_URL = https://partner-ui-mirror.preview.emergentagent.com,
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
