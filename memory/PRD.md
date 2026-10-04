# AzoApp — Home Service Platform

## Overview
Monorepo:
- `backend/` — FastAPI + MongoDB (motor). Entry `server.py`. Env: MONGO_URL, DB_NAME, CORS_ORIGINS.
- `web_panel/` — React (CRA + craco) web app (customer storefront + admin/partner/merchant). Deployed on **AWS Amplify** (appRoot = `web_panel`).
- `frontend/` — Expo React Native mobile app.

## Local / Preview run (this environment)
- Backend: supervisor `backend` on :8001.
- Web app: supervisor `frontend` slot repointed to `/app/web_panel` (craco start) on :3000.
- MongoDB local :27017, DB_NAME=azoapp.
- Local-only env (gitignored): `backend/.env`, `web_panel/.env.local`.

## 2026-10-04 — AWS Amplify build fix (DONE, verified)
Error: `[eslint] Failed to load parser '/app/frontend/node_modules/@typescript-eslint/parser/dist/index.js' declared in '../.eslintrc.json'`.

Root cause: CRA ESLint walked up from `web_panel/` and read repo-root `/app/.eslintrc.json`,
which hardcoded a non-portable absolute parser path missing on Amplify's build server.

Fix (committed, inside `web_panel/`):
1. `web_panel/.eslintrc.json` = `{ "root": true, "rules": {} }` — stops ESLint from reading the broken root config.
2. `web_panel/.env.production` = `DISABLE_ESLINT_PLUGIN=true` — Amplify sets `CI=true` (lint warnings become build errors); disabling the plugin in prod builds matches original intent (root had empty rules).

Verified: `CI=true yarn build` in `web_panel/` completes successfully ("build folder is ready to be deployed").

## Amplify action for user
- Set `REACT_APP_BACKEND_URL` in Amplify console env to the production backend origin (else `web_panel/src/lib/api.js` falls back to panel window origin).
- `.env.local` (preview URL) is gitignored → won't leak to Amplify.
- Commit via "Save to Github": `web_panel/.eslintrc.json`, `web_panel/.env.production`.
