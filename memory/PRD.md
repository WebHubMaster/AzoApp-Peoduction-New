# AzoApp — Home Service Platform (Fork Setup)

## Original Problem
Set up the forked AzoApp multi-app repo end-to-end, exactly like the prior setup.
- /app/backend  → FastAPI (supervisor, port 8001). Auto-seeds demo data on startup.
- /app/web_panel → React CRA/craco web app. Default preview on port 3000.
- /app/frontend → Expo (React Native) app, run via Expo Go tunnel (QR + exp:// URL).
- Auth: OTP-based (dev mode), OTP for all demo accounts = 123456.

## Architecture
- Backend FastAPI on 8001, MongoDB (db `azoapp`), Emergent LLM key configured.
- Web panel served via supervisor program `webpanel` (yarn start, CRA) on port 3000 → default preview.
- Expo app served via `npx expo start --tunnel` (uses @expo/ngrok + watchman) on 8081, public exp.direct tunnel.
- web_panel/.env keeps REACT_APP_BACKEND_URL EMPTY → api.js falls back to same-origin `/api` (no CORS).

## Setup completed (2026-06)
- Created missing .env files: backend, frontend (Expo), web_panel.
- Preview domain: https://7e3e2caf-95d8-4562-bfac-b594af4eebfa.preview.emergentagent.com
- Backend restarted, /api/ returns 200, demo data seeded.
- Stopped default `frontend` (Expo) supervisor program; added `/etc/supervisor/conf.d/webpanel.conf`; web panel on 3000 returns 200 and renders landing page.
- Installed `watchman` + `@expo/ngrok` to fix Expo ENOSPC file-watcher limit; Expo tunnel live.
- Verified all 4 one-click demo logins (Admin/Partner/Customer/Merchant) via testing agent — 100% pass, no CORS / "Demo login failed".

## Demo Accounts (OTP 123456)
Admin +919000000000 · Merchant +919000000002 · Partner +919000000003 · Customer +919000000004

## Notes / Backlog
- Expo tunnel URL (exp.direct) changes on each `expo start` restart — regenerate QR if restarted.
- Minor non-blocking: recharts width/height warnings + 2x 403 (notifications permission) on admin dashboard.
