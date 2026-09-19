# AzoApp — PRD / Project Memory

## Original problem statement (2026-06)
Forked AzoApp multi-app repo. Two goals:
1. Make partner & merchant registration flow in the **mobile (Expo) app** fully bug-free, matching the working web panel flow. Screenshots showed errors: "Unsupported FormDataPart implementation" and "Property 'Platform' doesn't exist" during registration.
2. Fully set up & run the forked project: backend (FastAPI, 8001, seeds demo data), web_panel (React/craco) on port 3000 as default preview, and frontend (Expo) via Expo Go tunnel. OTP-based dev auth, OTP=123456.

## Architecture
- **/app/backend** — FastAPI on 8001 (supervisor `backend`). Seeds demo data on startup. Mongo `azoapp`.
- **/app/web_panel** — React + craco. Served on 3000 via supervisor `webpanel`. `.env` keeps `REACT_APP_BACKEND_URL` EMPTY → api.js falls back to same-origin `/api` (avoids CORS on demo login).
- **/app/frontend** — Expo (React Native, SDK 57). Runs via nohup Metro on 8081 + ngrok v3 tunnel. Reads `EXPO_PUBLIC_BACKEND_URL`.

## Preview / URLs
- Preview domain: https://ce6ee84e-4364-4302-a059-c1bb9f1f8795.preview.emergentagent.com
- Web panel: same URL (port 3000)
- Expo Go: `exp://squander-prodigy-affiliate.ngrok-free.dev` (ngrok-free URL; changes on tunnel restart)

## Done (2026-06)
- Created missing .env files (backend, frontend, web_panel) + webpanel supervisor conf.
- Backend restarted, demo seeded, `/api/` = 200.
- Web panel live on 3000; testing agent verified **4/4 one-click demo logins** (admin/partner/customer/merchant) — no CORS / no "Demo login failed".
- **Registration bug fixed** in `/app/frontend/src/components/reg/Photo.tsx`:
  - `Platform`, `File as FsFile`, `UploadType` were used but never imported → caused "Property 'Platform' doesn't exist" & the FormDataPart error. Added imports.
  - Fixed native multipart upload to use `expo-file-system` `File.upload({ httpMethod, uploadType: UploadType.MULTIPART, fieldName:'file', parameters })`.
  - Validated: Android bundle builds cleanly (4163 modules, no errors) via tunnel.
- Expo tunnel: bundled `@expo/ngrok` agent v2.3.41 is rejected by ngrok (ERR_NGROK_121, needs v3.20+). Downloaded ngrok v3.39 (`/root/ngrok3`), configured user's authtoken, run `ngrok3 http 8081` + Metro with `EXPO_PACKAGER_PROXY_URL` so exp:// points at the tunnel.

## Notes / gotchas
- ngrok anonymous tunnels are disabled; a user authtoken is required. Old `expo start --tunnel` fails because its bundled agent is too old — use external ngrok v3 + `EXPO_PACKAGER_PROXY_URL`.
- Backend upload endpoints: `/api/partner/registration/upload` and `/api/merchant/registration/upload` (field `file`, form `doc_type`, optional `aadhaar_number`).

## Backlog / next
- P2: Silence Recharts width/height=-1 warnings on admin dashboard (wrap ResponsiveContainer with fixed min-height).
- P2: Investigate two 403 asset loads after customer login (console cleanliness).
- Consider a persistent tunnel (supervisor) if a stable Expo URL is needed across restarts.
