# AzoApp — Merchant Mobile App (PartnerApp / Expo) — PRD

## Problem statement
Merchant panel mobile app (Expo/React Native, expo-router). Goal: mobile "Profile & KYC"
page must be a same-to-same copy of the **web panel's** Profile & KYC (mobile view),
with all features working end-to-end against the SAME FastAPI backend.

## Architecture
- Mobile app: `/app/frontend` (Expo Router, react-native, react-native-web). Talks to backend via `EXPO_PUBLIC_BACKEND_URL` + `/api`.
- Web panel (reference design): `/app/web_panel` (CRA/craco + Tailwind).
- Backend: `/app/backend` (FastAPI + MongoDB/Motor). Auto-seeds demo data on startup.

## Profile & KYC — mapping
- Web page = `web_panel/src/pages/merchant/MerchantRegistration.jsx` (embedded in MerchantDashboard "onboarding" tab).
- Mobile page = `frontend/app/merchant/profilekyc.tsx` + shared kit `frontend/src/components/reg/*`
  (Fields, Photo, DatePicker, MapPreview, Shell, tokens).
- 4-step wizard: Owner → Shop → Address → Review. Same endpoints:
  - GET `/merchant/registration/profile` | `/meta`
  - PUT `/merchant/registration/{basic|shop|address|shop-photo}`
  - POST `/merchant/registration/upload` (multipart) | `/submit`
  - GET `/geo/serviceability?pincode=` | `/geo/reverse`

## Status (2026-09-24)
- Mobile Profile & KYC page is a faithful 1:1 port of the web page — VERIFIED working.
- Root cause of "not working / design mismatch": both `.env` files were empty on this
  fresh pod → backend crash-looped (KeyError MONGO_URL) → app loaded no data.
- FIX: restored `backend/.env` (MONGO_URL, DB_NAME=azoapp, JWT_SECRET, CORS_ORIGINS)
  and `frontend/.env` (EXPO_PUBLIC_BACKEND_URL=preview URL). Backend re-seeded.
- Verified: all 4 steps render with seeded demo merchant (Sharma Electricals, approved,
  view-only) via web screenshots; editable flow via curl (score 8→22→52→82,
  serviceability, submit 400-gated when photos missing).
- Note: on RN-web preview the Address map shows "WebView not supported on this platform" —
  this is web-only; on a real phone (Expo Go / native) the OSM map renders like the web iframe.

## My Partners (2026-09-24)
- Web = `web_panel/src/pages/merchant/referral/MerchantPartners.jsx` + `ReferralShared.jsx`.
- Mobile = `frontend/app/merchant/partners.tsx` + `frontend/src/components/merchant/ReferralShared.tsx`.
- Faithful 1:1 port — VERIFIED working: list (6 KPI cards, status tabs, search, rows, pagination)
  + detail (avatar, KPIs, service-wise commission, privacy note). APIs:
  GET `/merchant/referral/partners` (list) + `/merchant/referral/partners/{id}` (detail).
- Seeded demo: 1 partner "Raj Kumar" (PTR-4AC0BB, active, ₹385, 4 services) under +919000000002.

## Backlog / next
- P2: Optionally hide the top score-ring card on the approved/embedded view to match the web
  panel's embedded layout exactly (web shows score card only in the standalone registration Shell).
- Verify on a physical device via Expo Go.

## Merchant chrome: top navbar + lucide icons (2026-09-24)
- New `src/components/merchant/MerchantTopBar.tsx` (lucide) = persistent web-style top nav
  (A badge + dynamic page title + MERCHANT + NotificationBell(/notifications, unread badge,
  dropdown) + ProfileChip(name/phone, Edit Profile via PUT /auth/profile, Logout)).
- Wired into BOTH `app/merchant/_layout.tsx` and `app/(merchant)/_layout.tsx` → shows on EVERY merchant page.
- Removed the per-page `AppShellHeader` duplicates from (merchant) index/wallet/customers + merchant/scanqr.
- `MerchantBottomNav.tsx` + `ReferralShared.tsx` (MModuleHeader/search/pagination/back/privacy/calendar)
  + partners/customers/commission icons all switched from MDI → web lucide (LayoutDashboard, Users,
  QrCode, Wallet, MoreHorizontal, Store, Network, TrendingUp, CreditCard, Sparkles, LifeBuoy…).
- AppHeader got an `embedded` prop (no top-inset) so gradient page heroes sit under the top bar.
- VERIFIED via screenshots: single top bar on home/wallet/partners/profilekyc; lucide bottom nav + More sheet.
- Remaining (P2): home quick-action cards + some other stack pages still use MDI icons internally.

## Image preview fix — absolute media URLs (2026-09-24)
- Root cause: local-storage uploads returned RELATIVE urls (/api/media/file/..) because
  REACT_APP_BACKEND_URL env was missing AND reg/branding/support/proxy upload endpoints
  did not pass base_hint. Relative urls break RN <Image> + web admin (panel host != backend host).
  Also mediaUrl() mangled base64 data: urls (profile photos).
- Fix: added REACT_APP_BACKEND_URL to backend/.env; added storage_service.request_base(request)
  + base_hint to ALL upload endpoints (merchant_reg, partner_reg, support, merchant poster-logo,
  partner/merchant reg proxy). mediaUrl() now passes data:/blob:/file:/content: through unchanged.
  MerchantTopBar profile chip now renders the photo.
- VERIFIED by testing_agent iter110: 100% backend (5/5) — every upload returns absolute https url
  serving a 200 image; profile-photo data: url preserved; live/shop photos render on profilekyc;
  top-bar profile-chip-photo renders. test_credentials: partner +919000555001 / OTP 123456.
- Note: S3 not configured on pod (local fallback). For legacy pre-fix relative urls already in DB,
  a data migration would be needed (out of scope) — new uploads are all absolute now.

---
## Update (2026-06 / job): Pulled missing feature-set from AzoApp-Peoduction-New
- Source: https://github.com/WebHubMaster/AzoApp-Peoduction-New.git (a strict superset / continuation of this project, iterations 97→110).
- Existing repo (AzoApp-Peoduction) already matched /app exactly; the *New* repo held the missing work.
- Pulled WITHOUT removing any existing feature (New repo contained all of /app's source + more):
  - NEW backend: services/qr_poster_service.py, services/qr_share_page_service.py, assets/fonts/PublicSans-*.ttf
  - NEW frontend: components/qr/* (PosterControls, QrAnalytics, QrBookingPoster, qrKit), components/merchant/{FinanceKit,MerchantTopBar}.tsx, MerchantBottomNav.tsx, app/merchant/_layout.tsx, lib/posterActions.ts, pages/merchant/qrData.ts
  - UPDATED to newer versions: 7 merchant/partner route files + storage_service.py; merchant frontend pages (index/wallet/scanqr redesign) + AppShell/theme/globalFont/api client/ReferralShared
- Dependencies added: backend `segno==1.6.6`; frontend `react-native-share`, `react-native-view-shot`; app.json react-native-share plugin.
- Feature set = Merchant QR Booking Poster + QR Share Page + Finance Kit + Merchant top/bottom navbar + web-parity redesign + image-preview fixes.

### IMPORTANT env note
- On this pod, backend/.env and frontend/.env were MISSING (pre-existing, not caused by the pull). Recreated them:
  - backend/.env: MONGO_URL (local), DB_NAME="azo_app", fresh JWT_SECRET, URLs = pod preview URL.
  - frontend/.env: EXPO_PUBLIC_BACKEND_URL / EXPO_PUBLIC_WEB_URL = pod preview URL.
- Local MongoDB is EMPTY (fresh) — no seeded users yet. Run seed_*.py scripts to populate demo/admin data before testing authenticated flows.

---
## Update — 2026-06 · Merchant Mobile Commission page parity

- Recreated missing env files: `backend/.env` (MONGO_URL, DB_NAME, JWT_SECRET, CORS_ORIGINS) and `frontend/.env` (EXPO_PUBLIC_BACKEND_URL) — backend was crashing on boot (KeyError: MONGO_URL) and DB was empty.
- Reworked `frontend/app/merchant/commission.tsx` list-row layout to mirror the WEB panel's mobile/responsive grid (`web_panel/src/pages/merchant/referral/MerchantCommission.jsx`): Row1 = Date + booking code (left) · type badge (right); Row2 = Service + referred name (full width); Row3 = "Eligible ₹x" + "₹earned" (emerald, right-aligned left col) · "%" (right col). Added tabular-nums.
- Verified end-to-end on mobile width (412px) with real seeded data via merchant +919000000002:
  - Gradient header, green primary KPI + 2-col KPI grid, All/Customer/Partner tabs, search, date filter, pagination — all match web.
  - Type filter (Partner → 1–4 of 4), date-filter bottom sheet (presets + custom calendar), pagination sizes all functional.
  - Same API: GET /api/merchant/referral/commission (summary + items + pagination).

Backlog / next: replicate any remaining merchant panel pages the user wants ported from web (same shared-component approach).

## Update — 2026-06 · Merchant Mobile Bank & KYC page parity (DONE, tested iteration_114 — 100%)
- `/app/frontend/app/merchant/bankkyc.tsx` rewritten as 1:1 RN port of `web_panel/src/pages/merchant/MerchantFinanceKyc.jsx` (mobile view): page header + LockedCard gate, gradient progress hero (blue → emerald when eligible, X/2 verified), PAN card (approved/pending/form + upload w/ progress, preview/replace/delete, submit/resubmit), Bank Accounts (cards w/ PRIMARY chip, StatusBadge, masked acc, Set primary / Remove with confirm, add-bank form with confirm-acc + IFSC live validation, Savings/Current PremiumSelect, passbook upload), SecurityNote, fullscreen preview modal.
- APIs: `GET/POST /merchant/panel/finance-kyc[/pan|/banks|/banks/{id}/primary]`, `DELETE /banks/{id}`, upload → `POST /merchant/registration/upload` (web: XHR w/ % progress; native: expo-file-system upload).
- `FinanceKit.tsx` now exports `SecurityNote` + `LockedCard` (moved out of wallet.tsx).
- Old generic `src/components/FinanceKyc.tsx` still used by partner finance-kyc only.
- Demo merchant left in approved state (PAN ABCDE1234F + primary HDFC bank) by testing agent.

## Update — 2026-06 · Merchant Mobile Analytics page parity (DONE, tested iteration_115 — 100%)
- `/app/frontend/app/merchant/analytics.tsx` rewritten as 1:1 RN port of `web_panel/src/pages/merchant/MerchantAnalytics.jsx`: page header + LockedCard gate, blue→violet gradient hero (title, range label w/ customers/partners, Today/7/30/90 Days/This Month/Custom pills, custom RangeCalendar box w/ Apply + X), 4 gradient KPI tiles (fmtC), Commission Trend area chart, Customer vs Partner stacked bars + legend, Commission Split donut + legend, loading spinner, empty state.
- Charts: new `src/components/merchant/AnalyticsCharts.tsx` (react-native-svg ports of recharts Area/Bar/Pie w/ nice ticks, dashed grid, dark tap tooltips). `RangeCalendar` now exported from `ReferralShared.tsx`.
- API: `GET /merchant/analytics?date_from&date_to` (unchanged backend).
- NOTE: Metro (expo web) serves a stale bundle after edits — run `sudo supervisorctl restart frontend` before screenshot/testing.
