# AzoApp — Migration Setup (Run Existing Code)

## Goal
Bring migrated AzoApp (home services platform) up on a new account and deliver 3 URLs:
Admin panel, Customer Expo app, Partner Expo app. No new features — run existing code only.

## BASE_URL
https://reg-payment-redesign.preview.emergentagent.com

## Architecture
- backend/  -> FastAPI, port 8001 (supervisor), auto-seeds demo data on startup. Serves web_panel at /api/panel and Customer web export at /api/customer.
- web_panel/ -> React (CRA) Admin+Customer+Partner WEB panel. Built with PUBLIC_URL=/api/panel -> served at {BASE_URL}/api/panel/.
- Customer/  -> Expo/React Native customer app (slug customerapp).
- frontend/ (== PartnerApp/) -> Expo/React Native partner app (slug partnerapp).

## What was done (2026-09-29)
- Created backend/.env (MONGO_URL, DB_NAME=azoapp, fresh JWT_SECRET, fresh Fernet CACHE_ENCRYPTION_KEY, CORS_ORIGINS=*, APP_URL/BACKEND_URL/BACKEND_BASE_URL/PUBLIC_APP_URL/REACT_APP_BACKEND_URL all = BASE_URL).
- pip install -r backend/requirements.txt (razorpay etc were missing) + restart backend. /api/ = ok, "AzoApp seed complete" in logs.
- web_panel: yarn install + PUBLIC_URL=/api/panel CI=false GENERATE_SOURCEMAP=false REACT_APP_BACKEND_URL=BASE_URL yarn build -> served at {BASE_URL}/api/panel/. Verified login + demo admin OTP.
- Replaced stale domain service-hub-1622 in frontend/package.json start script with BASE_URL.
- Customer/.env and frontend/.env: EXPO_PUBLIC_BACKEND_URL=BASE_URL.
- Customer Expo: `npx expo start --tunnel --port 3001` -> exp://lsu05vk-anonymous-3001.exp.direct
- Partner Expo: stopped supervisor `frontend`, `CI=1 npx expo start --tunnel --port 3000` -> exp://op_vtw8-anonymous-3000.exp.direct

## Deliverables
1. Admin: {BASE_URL}/api/panel/login  (Login as Admin button / +919000000000 OTP 123456)
2. Customer Expo: exp://lsu05vk-anonymous-3001.exp.direct
3. Partner Expo:  exp://op_vtw8-anonymous-3000.exp.direct

## Notes / Caveats
- Expo tunnels run via nohup (NOT supervisor). The .exp.direct host is stable per project (partner op_vtw8-anonymous-3000, customer lsu05vk-anonymous-3001) but the tunnel process may stop on pod resume/inactivity — re-run `CI=1 npx expo start --tunnel --port 3000` (partner, in /app/frontend) and `npx expo start --tunnel --port 3001` (customer, in /app/Customer).

## Feature: Partner Registration Fee payment wizard (mobile) — 2026-09-29
- Bug: Partner mobile app (frontend/) submitted the registration directly even when the admin's one-time Registration Fee was ACTIVE, so the payment wizard never showed (backend returned 402 "complete the registration fee").
- Fix (mobile parity with web PartnerRegistration.jsx):
  - New component src/components/reg/PartnerFeePayment.tsx — full-screen payment page matching the "Complete Your Registration / Pay ₹X & Continue" design.
  - app/partner/register.tsx: loads GET /partner/registration/fee; Review submit button = "Pay & Submit" when fee.enabled && !already_paid, opens the payment screen; else "Submit Application" submits directly. After successful payment → auto-submits.
  - Checkout: razorpay_sdk → Razorpay Standard Checkout in a WebView (bridge posts payment_id/signature → POST /pay/confirm); redirect/form_post → WebView + "I've completed the payment" verify (POST /pay/confirm order status). No dev-mock bypass.
- Verified: admin PUT /admin/settings {partner_reg_fee:{enabled,original_price:999,discount_type:fixed,discount_value:500}} → partner GET /fee returns enabled=true final_amount=499; POST /pay/create-order returns a live Razorpay TEST order (gateway razorpay_sdk, rzp_test key). Mobile bundle compiles (HTTP 200).
- Active gateway in this pod = Razorpay TEST mode (already configured in Integration Center). The final in-app Razorpay checkout + signature verify must be validated on a real device via Expo Go (cannot be driven headlessly here).

## Payment screen redesign (mobile) — 2026-09-29
- src/components/reg/PartnerFeePayment.tsx redesigned to match the "Complete Your Registration" reference:
  - Header now renders the ADMIN Branding & Theme logo (useBrand().branding.logo = blue AzoApp wordmark SVG) instead of hardcoded text; falls back to site_name+tagline text if no logo.
  - Added hero provider image assets/partner-hero.png (man in #0D47A1 polo with the white AzoApp stacked logo on the chest near the pocket) inside a light-blue circle, top-right, responsive (useWindowDimensions).
  - Added payment-methods strip assets/pay-methods.png (UPI/Visa/Mastercard/RuPay/Paytm) under the Pay button + "Secure Payment" line.
  - Wording changed "Provider" → "Partner" (account activation, dashboard access, description).
  - Primary/theme colour #0D47A1 throughout; fully responsive layout.
- Assets bundled under /app/frontend/assets/ (partner-hero.png, pay-methods.png). Hero built by keying the generated image bg to transparent + compositing the user's white stacked logo on the polo. Bundle recompiles HTTP 200.

## Notes / Caveats (setup)
- supervisor `frontend` program is STOPPED (port 3000 is used by partner Expo tunnel instead).
- Payments run in dev MOCK mode (no live gateway keys). Configure in Admin -> Integration Center for real payments.
- Mongo is local (DB_NAME=azoapp); startup seed recreates all demo data.

---

## Session — June 2026 · UI fixes + Legal/CMS + Hero logo

### Delivered
1. **Registration payment screen** (`frontend/src/components/reg/PartnerFeePayment.tsx`)
   - "Complete Your Registration" now 2 lines, smaller font (23px).
   - Fee card redesigned to a centered, self-contained card; "Registration Fee" + "One-time payment / No monthly charges" chips wrap and never overflow the screen width.
2. **Rate-card quantity** (`frontend/src/components/partner/AdditionalWork.tsx`)
   - Repeated services no longer create duplicate line items; grouped with `×qty`.
   - Rate-card sheet shows a −/number/+ quantity control once a service is added; sheet stays open. +/- map to add / remove-one-instance (backend unchanged; frontend groups by `ratecard_row_id`).
3. **Keyboard handling** (`frontend/app/_layout.tsx` + auth/kyc screens)
   - Removed the global `KeyboardAvoidingView behavior="padding"` at root (root cause of leftover white space + double-compensation).
   - Converted the remaining plain-ScrollView form screens to `KeyboardAwareScrollView`: `(auth)/login.tsx`, `(auth)/register.tsx`, `merchant/profilekyc.tsx`. OTP job screen already used KeyboardAwareScrollView (auto scroll-up + restore). RegShell & modal screens already keyboard-safe → now free of double padding.
4. **Hero logo on t-shirt** (partner welcome screen)
   - Replaced chest logo on `frontend/assets/welcome-person.webp` with the user-provided AzoApp emblem (generative edit + background cutout → transparent webp). `PERSON_RATIO` updated to 682/1255.
5. **Privacy/Terms consent + dynamic CMS** 
   - Consent checkbox already existed & is mandatory in Partner/Merchant (`OtpFlow.tsx`, now also disables the Create button) and Customer (`login.tsx`, `OtpInline.tsx`). Webviews point to `/api/legal/{doc}`.
   - `backend/routes/legal_routes.py`: `/api/legal/{terms|privacy}` now renders admin CMS content from the `pages` collection (saved via `PUT /api/admin/pages/{key}`, edited in Website/CMS). Falls back to built-in default only when admin has saved nothing. Verified live (dynamic + fallback).

### Testing status / notes
- Native Expo app → keyboard behavior & UI verified by code + clean `tsc` and full Metro android bundle (HTTP 200, no errors). Could NOT run browser/testing-agent (native app + app targets remote backend via EXPO_PUBLIC_BACKEND_URL).
- Backend `/api/legal/{doc}` tested live on local backend (dynamic CMS + default fallback both pass).
- Created a local `backend/.env` (MONGO_URL/DB_NAME) — env files were absent in the workspace; needed to run/verify the backend.
- Legal fallback text remains as a default ONLY; admin CMS content always overrides it.
