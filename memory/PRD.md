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

## Partner booking chat — mobile parity with web (2026-09-20)
- New full-screen route `/app/frontend/app/chat/[id].tsx` (root Stack, slide_from_right) — outside tabs so bottom nav never overlaps composer. Old `(partner)/chat/[id]` removed.
- UI mirrors web `BookingChat.jsx` mobile sheet: white header (back, avatar initial/photo, name, green dot "Your customer · service"), emerald round Call; slate-50 thread; mine=primary bubble/white=other; quick-reply pills; rounded input + primary send; locked/empty states.
- Same APIs: GET/POST `/bookings/{id}/messages`, realtime `booking_message` + 5s poll, `markChatSeen` → unseen badge on Active Job card.
- active.tsx pushes `{pathname:"/chat/[id]", params:{id, role:"partner", service}}`.
- Seed: demo "assigned"/"started" bookings now `payment_status: paid` so chat is enabled out of the box (existing AZO970E07 / AZO4A0D87 patched in DB).
- Verified via Metro web build through tunnel (login → Active Job → Chat → send typed + quick reply → back).

## Preview URL
https://efe0ed0e-e1d0-48f8-9dbe-d1a67b540ef3.preview.emergentagent.com

## Backlog / Notes
- Low-priority: /api/partner/alert-prefs returns 403 under Customer session (client hook not role-gated). Non-blocking console noise.
- Expo tunnel URL changes on each `expo start`; regenerate QR if restarted.
