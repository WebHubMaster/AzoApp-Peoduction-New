# AzoApp — Home Service Platform (PRD / Run Notes)

## Problem statement
Run the existing multi-part project: backend, web panel, Partner app (Expo) and Customer app (Expo).
Provide Expo Go tunnel URLs for the two mobile apps. Backend + web panel must be running.

## Architecture (4 parts)
- **backend/** — FastAPI + MongoDB (motor). Port 8001 (supervisor). Prefix `/api`.
- **frontend/** (= `PartnerApp`) — Expo / React Native (partner + merchant). Port 3000 (supervisor). Served on the main preview URL.
- **Customer/** — Expo / React Native customer app. Port 3001 (run via tunnel).
- **web_panel/** — React (CRA + CRACO) admin/web panel. Port 3002 (local dev server).

## Environment / run state (2026-09-28)
- Preview endpoint: https://payment-flow-restore-1.preview.emergentagent.com
- Recreated all missing `.env` files (backend, frontend, Customer, web_panel) with dev/demo defaults.
  - backend/.env: MONGO_URL, DB_NAME=azoapp, JWT_SECRET, Fernet keys (CACHE/FCM), preview URLs.
  - frontend/.env & Customer/.env: EXPO_PUBLIC_BACKEND_URL = preview URL.
  - web_panel/.env: REACT_APP_BACKEND_URL = preview URL.
- Backend + PartnerApp are supervisor-managed (auto-restart). Customer + web_panel run as nohup.

## URL allocation (only port 3000 is public → given to the admin web app)
- **Admin panel (web_panel)** → runs on port 3000 → PUBLIC preview URL.
  - Site/store: https://payment-flow-restore-1.preview.emergentagent.com
  - Login: `/login`   Admin dashboard: `/admin`
- **PartnerApp** → `expo start --tunnel` on port 3005 → Expo Go: `exp://vfdmm4o-anonymous-3005.exp.direct`
- **Customer app** → `expo start --tunnel` on port 3001 → Expo Go: `exp://1n0jmdo-anonymous-3001.exp.direct`
- Backend: 8001 (supervisor), external `/api` OK, DB seeded.
- NOTE: supervisor `frontend` (PartnerApp on 3000) is STOPPED so web_panel can own port 3000.

## How to (re)start (after pod restart)
- Backend: `sudo supervisorctl restart backend`
- Admin web_panel on public 3000: `sudo supervisorctl stop frontend; lsof -ti:3000|xargs -r kill -9; cd /app/web_panel && BROWSER=none PORT=3000 HOST=0.0.0.0 WDS_SOCKET_PORT=443 nohup yarn start > /tmp/webpanel.log 2>&1 &`
- PartnerApp tunnel: `cd /app/frontend && CI=1 nohup npx expo start --port 3005 --tunnel > /tmp/partner_tunnel.log 2>&1 &`
- Customer tunnel: `cd /app/Customer && CI=1 nohup npx expo start --port 3001 --tunnel > /tmp/customer_run.log 2>&1 &`
- Read tunnel URLs: `curl -s http://localhost:4040/api/tunnels` and `curl -s http://localhost:4041/api/tunnels`

## Notes / backlog
- Expo tunnel subdomains regenerate on every restart; re-fetch after restart.
- Expo authtoken (/root/.expo/ngrok.yml) is ACL-locked to expo's exp.direct hostnames — cannot bind an arbitrary ngrok domain for a non-expo app.
- Login: phone + OTP `123456` (see test_credentials.md).

## Update (Jun 2026) — CMS/App-home section editing
- Customer App Home (web_panel/src/pages/admin/AppHomeManager.jsx):
  - Added Delete (Trash) button per row in "Sections — order & visibility" (removeSection, with confirm; also removes matching custom_sections entry).
  - Removed the "Branding (header)" card from the page.
- Website/CMS → Homepage Builder (web_panel/src/pages/admin/adminSectionsPro.jsx):
  - Added Customer-App-Home-style custom sections: "Hand-picked services" (service_collection, multi-select service_ids), "Category services" (category_services, pick a category), "Promo banner" (promo_banner, image + link). Config editors shown in both Add form and each row.
- Backend (backend/controllers/site_controller.py _homepage): renders category_services (all services of cfg.category_id), hand-picked keeps admin order, and promo_banner supports inline cfg.image + cfg.link (synthetic banner).
- Public site (web_panel/src/pages/customer/Landing.jsx): category_services rendered as a services row.
- NOTE: This pod is code-only (backend/frontend not running here, web_panel node_modules absent → builds on deploy). Changes verified by backend logic simulation + syntax check; not e2e-screenshot verified in-pod.

## Update (Jun 2026) — Partner Registration Fee
- Admin Integration Center card 'Partner Registration Fee' (adminTemplateIntegration.jsx → PartnerRegFeeCard): toggle Active/Inactive, Original Price, Discount Type (percentage/fixed), Discount Value, auto Final Payable. Saves to /admin/settings.partner_reg_fee (SettingsUpdate model updated).
- Backend (partner_reg_service.py + partner_reg_routes.py): GET /partner/registration/fee, POST /pay/create-order, POST /pay/confirm. submit_profile gates on paid fee when active (402 if unpaid), snapshots reg_fee_payment='not_required' when inactive. Reuses payment_service active gateway; dev MOCK auto-success when no gateway configured.
- Partner flow (PartnerRegistration.jsx): after Review, if fee active & unpaid, 'Pay & Submit' opens full-screen payment page (#0D47A1, What's Included, Pay ₹XXX & Continue). Success → confirm → submit → under_review (NOT auto-approved). Fail → stays with retry. Inactive → straight to submit.
- Admin partner detail (partnerRegAdminSections.jsx KycDetail): 'Registration Fee' section shows Paid (amount/date/txn/gateway) / Unpaid / Not Required.
- Verified: testing_agent iteration_155 backend 5/5, frontend 100%. Payment overlay UI not driven headlessly (needs live selfie to reach Review) — verified via API flow + build.
- NOTE: partner reg-fee payment is MOCKED in this pod (no live gateway). Configure a gateway in Integration Center for real charges.
