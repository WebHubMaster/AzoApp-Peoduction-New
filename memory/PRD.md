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
  (EXPO_PUBLIC_BACKEND_URL / EXPO_PUBLIC_WEB_URL = https://invoice-sync-mobile-1.preview.emergentagent.com,
  aligned to the Expo packager proxy host). Backend now seeds ("AzoApp seed complete") and returns 200.
- Verified (curl): partner login (+919000000003 / OTP 123456) → 9 invoices; GET /invoices/{id}
  role_earning (rate 60, base 2000, commission 1200, net 1200); /view HTML 200; /pdf 200 (14KB).
- All 8 mobile invoice files compile (babel-preset-expo OK).
- Testing agent (iteration_87): mobile Partner "My Invoices" = working 1:1 parity — login, KPIs,
  list, search, 12-option sort, filters (type/status/amount/customer/booking), detail panel
  (partner Your-Earning breakdown matches backend), A4 viewer, share sheet, download/print. No
  blocking issues. Section-heading uppercase + UUID-only deep-link are intentional (match web 1:1).
