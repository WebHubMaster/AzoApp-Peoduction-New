# AzoApp — Home Services Platform (PRD / working notes)

## Overview
Multi-app on-demand home-services platform (like UrbanClap), 4 parts:
- `/app/frontend` — Partner + Merchant app (Expo / React Native, expo-router). **Served on port 3000 (preview URL).**
- `/app/Customer` — Customer app (Expo / React Native). Not served in preview.
- `/app/backend` — FastAPI + MongoDB (`azoapp` db). Served on 8001, `/api` prefix.
- `/app/web_panel` — Admin + Customer web panel (CRA/craco). Not served in preview.

Auth: mobile-OTP only (demo mode → OTP `123456`). Branding/theme/gateways admin-driven (Integration Center + Branding & Theme). Nothing hardcoded — always from admin config.

Preview URL / backend base: https://customer-app-web-1.preview.emergentagent.com

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

### 2026-06 (session 4) — Brand logo + C2 audit
**Logo applied (dynamic):** User uploaded a white emblem (HalfIcon.png, 500×500, transparent). Hosted two variants under `backend/uploads/branding/` and set in `settings.branding`:
- `logo_light` = navy (#0659B2 recolor) `…/api/media/file/branding/azo_logo_light.png` (visible on light bg)
- `logo_dark` = white `…/azo_logo_dark.png` (for dark bg)
`/api/site/config` reflects them immediately → shows in all dynamic logo slots (welcome header, app/panel headers, login) across Partner + Customer app + web panel, theme-aware.
NOTE: the "A" on the character's shirt in the Partner welcome hero is BAKED INTO `welcome-person.webp` (a photo, not an overlay) — not changed by branding config. Would need image regeneration to swap.

**C2 audit — primary color is FULLY DYNAMIC** across all surfaces:
- web_panel: `SiteConfigContext.applySiteTheme()` → `genPalette(theme.primary)` sets `--p-50..900` + `--primary`; tailwind `primary-*` consume them.
- Customer app: `_layout` passes `theme.primary` → `applyBrandPrimary()` regenerates PRIMARY scale in place.
- Partner app: `theme.ts palette(brand.primary)` builds all shades from admin color.
Fixed one hardcode: Partner dark `primarySubtle` rgba now derived from `P[500]` (was fixed #0659B2).

---
## Update — June 2026: Customer App & Web 8-point fixes
Existing AzoApp codebase (Customer Expo app `/app/Customer`, Partner/Merchant Expo app `/app/frontend`, FastAPI `/app/backend`, web_panel).

### Implemented
1. **Site header order** (`Customer/.../site/SiteNavbar.tsx`): logo → membership (→ subscriptions) → location icon (opens location/pincode picker) → cart → profile. Removed hamburger + separate search icon.
2. **Search placeholder** single-line (`HomeView.tsx` `home-search`: numberOfLines=1, multiline=false, shorter text).
3. **Wizard re-add/re-toast** fixed (`service/[id].tsx`): after `?book=1` auto-add, `router.setParams({book:"0"})` so returning never re-adds/re-toasts.
4. **OTP resend 60s timer** everywhere (Customer `login.tsx`, `OtpInline.tsx`; Partner `OtpFlow.tsx`, `OtpLogin.tsx`) + backend default cooldown 30→60 (`auth_service.py`).
5. **Profile photo in top nav** (`CustomerShell.tsx` Avatar now uses `mediaUrl(user.photo)`).
6. **Wallet scratch cards**: hidden when none in Wallet (`ScratchCardsPanel hideWhenEmpty`); full list stays on Reward & Cashback screen.
7. **Invoice preview** (`invoices.tsx` + backend): new public `GET /api/invoices/pub/{id}/html` renders the full invoice HTML inline in the WebView (no forced auto-download). Verified end-to-end.
8. **Terms & Privacy consent** required checkbox on account create for Customer + Partner + Merchant; opens `GET /api/legal/{terms|privacy}` in an in-app WebView (`LegalConsent` components + `backend/routes/legal_routes.py`).

### Env note
All `.env` files were lost in this pod and were regenerated: `backend/.env` (MONGO_URL, DB_NAME=azoapp, APP_URL), `Customer/.env`, `frontend/.env` (EXPO_PUBLIC_BACKEND_URL=https://customer-app-web-1.preview.emergentagent.com). DB reseeded on startup; invoices seeded for testing.

### Verified
- Backend: `/api/legal/terms|privacy` → 200; invoice HTML preview renders real invoice; OTP send/verify OK. Partner web bundles cleanly (3822 modules, 0 errors).
- Not visually verifiable in this env: Expo RN-Web UI renders blank under the screenshot tool (10s load-timeout vs heavy bundle); Customer app deps not installed / not supervisor-served.
