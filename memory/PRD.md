# AzoApp — Home Services Platform (PRD / working notes)

## Overview
Multi-app on-demand home-services platform (like UrbanClap), 4 parts:
- `/app/frontend` — Partner + Merchant app (Expo / React Native, expo-router). **Served on port 3000 (preview URL).**
- `/app/Customer` — Customer app (Expo / React Native). Not served in preview.
- `/app/backend` — FastAPI + MongoDB (`azoapp` db). Served on 8001, `/api` prefix.
- `/app/web_panel` — Admin + Customer web panel (CRA/craco). Not served in preview.

Auth: mobile-OTP only (demo mode → OTP `123456`). Branding/theme/gateways admin-driven (Integration Center + Branding & Theme). Nothing hardcoded — always from admin config.

Preview URL / backend base: https://31fec3ec-c8cd-4ab8-98e6-0f99711c37f0.preview.emergentagent.com

## Session log

### 2026-06 (current session) — Environment restore + core-flow verification
**CRITICAL environment restore (was fully down)**
- ALL `.env` files were MISSING on import → backend crashed (`KeyError: MONGO_URL`), nothing ran.
- Recreated: `backend/.env` (MONGO_URL, DB_NAME=azoapp, JWT_SECRET, CORS_ORIGINS=*, valid Fernet CACHE_ENCRYPTION_KEY + FCM_CONFIG_ENCRYPTION_KEY), `frontend/.env` + `Customer/.env` (EXPO_PUBLIC_BACKEND_URL=preview), `web_panel/.env` (REACT_APP_BACKEND_URL=preview).
- Backend now boots + seeds; `GET /api/` → ok. Partner app serves on :3000 (HTTP 200).

**Verified working (curl, backend)**
- B1 booking/login OTP flow: send-otp → verify-otp(create_if_new=false) → brand-new number returns `{new_user:true}` → then name → verify(create_if_new=true) creates account. Confirmed in code for both Customer app (`login.tsx`, `OtpInline.tsx`) and web (`OtpLogin.jsx`).
- B2 phone 10-digit lock: `onlyDigits(v,10)` / `tenDigits()` + maxLength=10 in all phone inputs (app + web). Already implemented.
- B3 payment gateway per-mode: `gateway_resolver.py` + `payment_service.py` fully implement active-gateway + test/live mode resolution (no test/live mixing, no silent fallback). Verified: enabling Razorpay TEST with keys makes `/payments/order` attempt the Razorpay test gateway (not mock); enabling guard blocks activation unless active mode configured. **User just needs to save valid test/live keys in Integration Center.** Currently no gateway configured → mock path.

## Findings — most backlog items appear ALREADY implemented (prior batches 1–3)
B1, B2, B3 confirmed. Others need per-screen audit on the (unserved) Customer app/web_panel.

## Backlog (from problem statement)
### Partner app (`/app/frontend`) — served/testable
- [P1] A1 Job-Complete selfie capture (needs device camera).
- [P1] A2 keyboard slide-up on typing screens (KeyboardProvider wired; audit per-screen).
- [P2] A3 dark-mode accent cards (starter-kit item image bg, streak-freeze).

### Customer app + web panel (need serving to verify)
- B1 ✅ / B2 ✅ (code verified).
- B3 ✅ backend; verify frontend checkout launches gateway once real keys saved.
- B4 Globe icon in Customer panel → opens front (mode+logo aware).
- B5 "Book Now" outline buttons uniform (some say "Add").
- B6 search box square (3–5px radius) + larger single-line font.
- B7 Profile click when logged-in → panel home.
- B8 keyboard slide-up (app).
- B9 full dark mode (home blocks, service detail, checkout — remove #fff).
- B10 Wallet: Reward & Cashback menu → scratch cards (rewards route exists in app).
- B11 View Invoice preview + Download PDF + Open/Print.
- B12 booking tabs square (3–5px radius).
- B13 profile pic reflect in top nav after save.

### Common
- C1 larger input fonts (app + web).
- C2 Admin Branding&Theme Primary color drives whole app (dynamic).
- C3 live gateway (Razorpay test) end-to-end on device build.

## Notes for next session
- Only Partner app is served on :3000. To verify Customer app/web_panel UI, they must be served (separate port/preview) or tested via device build.
- Screenshot tool may time out on the ~16MB Expo web bundle.

### 2026-06 (session 2) — UI batch: B5/B6/B12/C1 + A3
Implemented + validated (babel transform + eslint, root exit 0; Partner files 0 errors):
- **B5 Book Now (outline, uniform)**: web_panel `Services.jsx` card, `ServiceDetail.jsx` (desktop + mobile bar), `home/HomeSections.jsx` chip → outline "Book Now"; Customer app `site/HomeSections.tsx` + `(site)/service/[id].tsx` → outline "Book Now" (services.tsx/category already had it).
- **B6 square search + larger font**: web_panel `Services.jsx` search, `site/ServiceSearch.jsx` (hero+navbar rounded-[5px], text-base), `CustomerDashboard.jsx` home-search; Customer app `site/ServiceSearch.tsx` (radius 5, fontSize 16). App AppSearchBar was already square.
- **B12 square booking tabs**: web_panel `components/customer/ux.jsx` SegTabs rounded-[4px]. Customer app SegTabs already square (radius 5).
- **C1 larger input fonts (web)**: `components/ui/input.jsx` + `ux.jsx` SearchInput → text-base.
- **A3 Partner dark accents**: `starter-kit.tsx` item-image placeholder + lock notice now dark-aware; `rewards.tsx` streak-freeze card dark-aware.

Verification constraint: web_panel + Customer have NO node_modules here and aren't served; their edits are compile+lint verified only (not live-screenshot). Partner app is served but 16MB bundle makes screenshots unreliable.

Discovery: B1, B2, B3, and much of B5/B6/B12 in the **Customer app** were already implemented in prior batches; gaps were mostly in web_panel (now filled).

### 2026-06 (session 3) — Customer items audit + Partner A2
Audited the Customer **app** (Expo) — the following are ALREADY implemented (verified in code):
- B4 Globe icon: `CustomerShell.tsx` line 82-83 (`m-goto-site` → `/(site)`, dark-aware).
- B7 profile→panel: site `AppHeader` avatar → `/(customer)` when logged in.
- B9 dark mode: checkout `#fff` are white-on-color (legit); CheckoutUi uses dark detection for card bg.
- B10 Reward & Cashback: `wallet.tsx` ScratchCardsPanel + onViewAll → `/rewards`; nav has "Reward & Cashback".
- B11 View Invoice: `invoices.tsx` has View (WebView preview modal) + Download.
- B13 profile pic in nav: `AppHeader`/`CustomerShell` avatar use `user.photo`.

**Partner A2 (keyboard slide-up)** — most screens already had in-modal `KeyboardAvoidingView`/`KeyboardProvider` (wallet Sheet, payouts, chat, support, active, reg). Filled the 3 genuine gaps (babel + eslint verified, 0 errors):
- `(partner)/partner/subscriptions.tsx`: wrapped OTP + complete-note modals in `KeyboardAvoidingView`.
- `merchant/scanqr.tsx`: wrapped share-message modal in `KeyboardAvoidingView`.
- `merchant/bankkyc.tsx`: full KYC form `ScrollView` → `KeyboardAwareScrollView` (bottomOffset 100).
(history.tsx TextInput is just a top search bar — no fix needed.)

STILL TODO (need web_panel served to implement+verify): web-panel versions of B4/B7/B9/B10/B11/B13. Partner A2 device verification (keyboard behavior can't be tested in web preview).
