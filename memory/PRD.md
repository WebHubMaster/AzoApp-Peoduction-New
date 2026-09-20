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

## WhatsApp-style chat system — Web + Mobile (2026-09-20)
Shared backend (booking_controller.py / booking_routes.py):
- `booking_messages.seen_at`; message `status` sent|seen. `GET /bookings/{id}/messages` → + unread, counterpart_online, service_name, code.
- `POST /bookings/{id}/messages/seen` (read receipt + presence heartbeat; emits `booking_seen` to both parties).
- `POST /bookings/{id}/typing` {typing, present} → SSE `booking_typing`; present:false clears presence on chat close.
- `GET /bookings/chats/summary` → per-thread last_message + unread, total_unread (badges).
- send_message: SSE `booking_message` to both parties (incl. service_name/code); push+in-app via notify() ONLY if recipient not present (25s TTL). Payload: title=sender, body="text\nService • Booking #CODE", link `/partner?tab=active&chat=<id>` | `/account?tab=orders&chat=<id>`, data{type:chat_message, booking_id, code, service_name, sender_role, tag, android_channel:chat}. fcm_service: AndroidConfig(channel/tag/collapse) + APNs thread_id.
Web: ChatContext.jsx (summary + SSE refresh, useChatUnread, UnreadPill); BookingChat.jsx typing… + bubble, ticks (✓/✓✓ blue), auto-seen on open/new msg, heartbeat, `?chat=` deep link; unread pills on partner ActiveJob + customer BookingCard; SW firebase-messaging-sw.js chat_message branch (tag per thread, click → link).
Mobile: ChatContext.tsx; chat/[id].tsx typing/ticks/seen/presence; ChatNotifier at root (registerPushToken on login [real build], foreground local notif WhatsApp-style, tap → /chat/[id] incl. cold start); notifications.ts (chat channel, registerPushToken, onNotificationTap); active.tsx badge from server; chatSeen.ts removed. app.json expo-notifications plugin. Setup doc: frontend/PUSH_SETUP.md (google-services.json + FCM service account in Admin).
Tested: iteration_79 — backend 8/8, web dual-session + mobile web build 100%. Remote FCM push untested here (needs real build + Firebase).

## Preview URL
https://efe0ed0e-e1d0-48f8-9dbe-d1a67b540ef3.preview.emergentagent.com

## Backlog / Notes
- Low-priority: /api/partner/alert-prefs returns 403 under Customer session (client hook not role-gated). Non-blocking console noise.
- Expo tunnel URL changes on each `expo start`; regenerate QR if restarted.
