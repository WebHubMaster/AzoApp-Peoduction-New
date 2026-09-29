# AzoApp — Migration Setup (Run Existing Code)

## Goal
Bring migrated AzoApp (home services platform) up on a new account and deliver 3 URLs:
Admin panel, Customer Expo app, Partner Expo app. No new features — run existing code only.

## BASE_URL
https://f0d86221-daec-4487-98fb-5b815df15e56.preview.emergentagent.com

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

## Notes / Caveats (setup)
- supervisor `frontend` program is STOPPED (port 3000 is used by partner Expo tunnel instead).
- Payments run in dev MOCK mode (no live gateway keys). Configure in Admin -> Integration Center for real payments.
- Mongo is local (DB_NAME=azoapp); startup seed recreates all demo data.
