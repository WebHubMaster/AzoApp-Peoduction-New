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
- Preview endpoint: https://4b2b757c-174d-4e86-8978-913ed47569a4.preview.emergentagent.com
- Recreated all missing `.env` files (backend, frontend, Customer, web_panel) with dev/demo defaults.
  - backend/.env: MONGO_URL, DB_NAME=azoapp, JWT_SECRET, Fernet keys (CACHE/FCM), preview URLs.
  - frontend/.env & Customer/.env: EXPO_PUBLIC_BACKEND_URL = preview URL.
  - web_panel/.env: REACT_APP_BACKEND_URL = preview URL.
- Backend + PartnerApp are supervisor-managed (auto-restart). Customer + web_panel run as nohup.

## URL allocation (only port 3000 is public → given to the admin web app)
- **Admin panel (web_panel)** → runs on port 3000 → PUBLIC preview URL.
  - Site/store: https://4b2b757c-174d-4e86-8978-913ed47569a4.preview.emergentagent.com
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
