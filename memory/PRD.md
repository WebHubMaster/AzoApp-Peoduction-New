# AzoApp — Migration Setup (Run Existing Code)

## Goal
Bring migrated AzoApp (home services platform) up on a new account and deliver 3 URLs:
Admin panel, Customer Expo app, Partner Expo app. No new features — run existing code only.

## BASE_URL
https://smart-slot-matcher.preview.emergentagent.com

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

---

## Session — June 2026 · Homepage Builder video sections (Website CMS)
- `web_panel` HomepageBuilder (adminSectionsPro.jsx): added **"video"** section type. Config supports a pasted **Video URL** OR **file upload** via new `VideoUpload` (client validates ≤100MB & ≤60s, shows a clear error and blocks; uploads to `/api/media/upload-homepage-video`) + optional poster. CRUD/reorder/enable already existed for all types.
- Backend: `storage_service.save_video(..., max_bytes)`; new admin route `POST /api/media/upload-homepage-video` (100MB cap, folder `homepage_videos`); `site_controller._homepage` resolves `type=="video"` → `data:{video,poster,autoplay}`.
- Website `Landing.jsx`: renders `video` sections with click-to-play (poster → tap → `<video controls autoplay>`); works for URL or uploaded file via `mediaSrc()`.
- Verified live: inserting a video section surfaces it in `/api/site/homepage`; upload route registered (401 w/o admin). Server has no ffprobe, so the 60s duration check is enforced in the admin browser; 100MB size enforced both client and server.

---
## Homepage Builder (Website/CMS) — verified 2026-09-29
Dynamic homepage section builder in Admin (Website / CMS → Homepage Builder), mirroring the Customer App Home builder.
- Backend: `homepage_sections` collection; CRUD + reorder via `/api/admin/homepage-sections` (GET/POST/PUT/DELETE). Public feed `/api/site/homepage` resolves ordered enabled sections incl. `video` type.
- Section types incl. video (URL or uploaded file), banners, service collections, categories, coupons, faq, blog.
- Video file upload: `/api/media/upload-homepage-video` — server enforces MP4/MOV/WebM + 100MB; browser enforces 100MB + 60s duration (adminSectionsPro.jsx VideoUpload). Clear error toasts on limit breach.
- Public storefront renders + plays video sections on click (customer/Landing.jsx VideoSection).
- ENV note: `/app/backend/.env` (MONGO_URL, DB_NAME) and `/app/web_panel/.env` (REACT_APP_BACKEND_URL) were missing on import and had to be recreated.
- App layout: admin+storefront = `/app/web_panel` (CRA/craco); `/app/frontend` = Expo Partner app (supervisor `frontend`, port 3000).

---
## Maid booking improvements — 2026-09-29
Built on the existing recurring-subscription engine.
1. Maid category → Recurring Subscription plan picker (Daily/Weekly/Monthly) with weekly-offs; schedule built per selected plan. Seeded via backend/seed_maid_subscription.py (wired into server startup). Service id svc-maid-fulltime.
2. Maid notifications: a maid already booked in a time slot is excluded from new job alerts/assignment for that overlapping slot — subscription_service.busy_partner_ids_for() + admin_eligible_partners filter.
3. Attendance via location (no OTP): partner "I Have Arrived" button captures GPS; POST /subscriptions/{id}/days/{date}/arrive; success only within 200m of the customer's home; blocked if either GPS missing. Arrival & Complete remain separate steps.
4. Earnings: on arrival the day's per-day earning is INSTANTLY & finally credited to the maid wallet (transactions kind subscription_daily_earning) + a daily leaderboard bucket (db.daily_earnings). GET /subscriptions/partner/daily-leaderboard. No admin approval; no double-pay at settlement (earning_credited flag skips accrual). Silent to customer.
5. Customer attendance view: subscription_service.customer_view() strips ALL rate/earning fields and returns an attendance list (maid name · date · arrival time). Applied to /subscriptions/mine and /subscriptions/{id} for customers. UI updated in web_panel Subscriptions.jsx + Customer app subscriptions.tsx (OTP banner + earnings removed, Attendance card added).

Files: backend models/subscription.py, services/subscription_service.py, controllers/subscription_controller.py, routes/subscription_routes.py, seed_maid_subscription.py, server.py; web_panel/src/components/customer/Subscriptions.jsx; frontend (Partner app) app/(partner)/partner/subscriptions.tsx + src/components/partner/home/MaidTasksCard.tsx; Customer/app/(customer)/subscriptions.tsx.

Verification: backend fully curl/script-verified (arrival 200m pass/fail, no-GPS block, instant wallet credit, daily leaderboard, no double-pay, busy-slot filter, customer_view no earning leaks, plans per selected days). web_panel compiles + plan picker screenshot verified. Mobile app edits are code-complete but NOT runtime-verified (preview currently serves web_panel, not the Expo apps).

---
## 2026-06 — Job-ring slot fix + Responsive audit (E1 session)
### Job ring / partner availability (backend) — DONE & VERIFIED
- Fixed slot-based availability in services/engines.py: `available_targets(partner_ids, booking, settings)` now excludes a partner ONLY if they have an accepted booking (assigned/arrived_shop/arrived_customer/started) whose time slot OVERLAPS the new booking's date+time slot. Added `slot_window()`, `ACCEPTED_STATUSES`, `partner_free_for()`.
- Accepting a future booking no longer blocks the partner for other slots (root bug fixed). Instant/emergency jobs occupy "now"; scheduled jobs occupy their scheduled slot only.
- Call sites updated to pass booking context: booking_controller `_next_wave_targets`, `_nearby_candidates`, `dispatch_pending_to_partner`, `partner_ring_pending`, `partner_jobs` (per-job slot filter), `accept_job` (slot-conflict guard, 409), admin_controller `dispatch_attention`. Applies to Partner mobile app + web panel (same backend endpoints).
- Verified with synthetic partner: free for today + other future slots, busy only for the exact overlapping slot.

### Responsiveness (web_panel + Expo audit)
- App is already mobile-first/responsive. Verified clean at 390px: Customer/Partner/Merchant home dashboards, customer Wallet/Invoices, public Landing/Services. Data-dense partner/merchant modules use `hidden md:block overflow-x-auto` tables + mobile card fallbacks.
- FIXED: web_panel/src/pages/merchant/MerchantPanels.jsx — 3 tables (Recent Activity, My Customers, Payout History) were in `overflow-hidden` (clipped on mobile) → now `overflow-x-auto` + `min-w`.
- FIXED (app-wide): web_panel/src/components/ui/dialog.jsx — DialogContent now has mobile side gutter + `max-h-[90dvh] overflow-y-auto` so tall dialogs scroll on small screens (dropdowns portal to body, unaffected).
- Env note: container restore lost .env files; recreated backend/.env (MONGO_URL, DB_NAME=azoapp_database, JWT_SECRET, CORS, Fernet keys, APP_URL/REACT_APP_BACKEND_URL=smart-slot-matcher preview) + frontend/.env + web_panel/.env. Web_panel node_modules reinstalled (yarn).
- Tooling limit: screenshot harness only renders 390 (mobile) & 1920 (desktop); 320/768/1440 not visually captured.

### Deep Screen Sweep (mobile 390px) — 2026-06
- Swept via bottom-nav `tab-{key}` + `tab-more`/`more-{key}`. Verified NO horizontal overflow:
  - Partner: jobs, active, wallet, earnings, invoices, analytics, availability, bankkyc, subscriptions (9 clean).
  - Merchant: customers, wallet, network, earnings, analytics (clean) + Scan QR fixed.
- FIXED: Merchant Scan QR (pages/merchant/scanqr/ScanQRModule.jsx) — off-screen full-res 1080px poster capture node (position:fixed left:0) caused horizontal scroll on phones; wrapped in a 0x0 `overflow:hidden` box (html2canvas still captures posterRef, so share/print unaffected). Verified document.scrollWidth==innerWidth (390), canScrollX=false.
