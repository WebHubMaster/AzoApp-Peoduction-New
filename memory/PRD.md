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

## Running services
- Backend: http://localhost:8001 → external `/api` OK, DB seeded.
- PartnerApp (web + Expo Go): main preview URL. Expo Go: `exp://4b2b757c-174d-4e86-8978-913ed47569a4.preview.emergentagent.com`
- Customer (Expo Go tunnel): `exp://1n0jmdo-anonymous-3001.exp.direct` (tunnel URL changes on restart)
- web_panel: http://localhost:3002 (local only — not on public preview)

## How to (re)start (after pod restart)
- Backend/PartnerApp: `sudo supervisorctl restart backend frontend`
- Customer (tunnel): `cd /app/Customer && CI=1 npx expo start --port 3001 --tunnel &` then read tunnel URL from `curl -s http://localhost:4040/api/tunnels`
- web_panel: `cd /app/web_panel && BROWSER=none PORT=3002 HOST=0.0.0.0 yarn start &`

## Notes / backlog
- web_panel is not publicly reachable in this preview (only port 3000 is exposed). To make it public, either deploy it or place it on the preview URL instead of PartnerApp.
- Customer tunnel subdomain regenerates on each restart; re-fetch after restart.
- Login: phone + OTP `123456` (see test_credentials.md).
