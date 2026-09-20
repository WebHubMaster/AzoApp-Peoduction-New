# AzoApp — Multi-App Repo (Forked Setup)

## Overview
Multi-app repo restored & running on a fresh fork.
- /app/backend   → FastAPI (supervisor, port 8001). Auto-seeds demo data on startup.
- /app/web_panel → React (CRA/craco) web app. Served on default preview (port 3000) via supervisor `webpanel` program.
- /app/frontend  → Expo (React Native) app. Runs over Expo tunnel for Expo Go.

## Auth
OTP-based (dev mode). OTP = 123456 for all demo accounts.
Admin +919000000000 | Merchant +919000000002 | Partner +919000000003 | Customer +919000000004

## Setup done (2026-09-20)
- Created missing .env files: backend/.env, frontend/.env, web_panel/.env (REACT_APP_BACKEND_URL left EMPTY → same-origin /api fallback in api.js to avoid CORS).
- Backend started via supervisor, GET /api/ = 200, demo seed complete.
- web_panel: yarn install; frontend(Expo) stopped off 3000; /etc/supervisor/conf.d/webpanel.conf created; reread+update → serving on 3000 (200).
- Expo tunnel: `npx expo start --tunnel --port 8081` (nohup, /tmp/expo.log). Tunnel URL exp://xhg4tdi-anonymous-8081.exp.direct.
- Verified all 4 demo logins via external URL (curl) and via testing agent UI (4/4 one-click demo logins pass, no CORS/Demo login failed).

## Preview URL
https://efe0ed0e-e1d0-48f8-9dbe-d1a67b540ef3.preview.emergentagent.com

## Backlog / Notes
- Low-priority: /api/partner/alert-prefs returns 403 under Customer session (client hook not role-gated). Non-blocking console noise.
- Expo tunnel URL changes on each `expo start`; regenerate QR if restarted.
