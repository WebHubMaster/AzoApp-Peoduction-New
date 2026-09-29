# AzoApp — PRD / Working Notes

## Product
Home-services marketplace. Components:
- `backend/` — FastAPI + MongoDB (shared by all clients)
- `web_panel/` — React (admin + customer/partner/merchant web) — runs on :3000 via craco
- `frontend/` (symlink `PartnerApp`) — Expo React Native Partner/Merchant app
- `Customer/` — Expo React Native Customer app

## Task (this session) — Full-Screen Alert system parity
Original ask (Hindi): Partner & Customer apps dono mein Full-Screen Alert improve karo.
1. New booking / reschedule / reminder → full-screen alert on lock screen, app closed, background.
2. Customer app mein Partner-initiated reschedule ka full-screen alert nahi aata — fix karo.
3. Reliable on Android 8+ → latest.

User choices (locked):
- Full parity: port the Partner ring stack to the Customer app.
- Customer full-screen ring triggers on **partner reschedule request** only.
- Add an **Admin → Integration Center → Firebase Settings** upload slot for the **Customer app** google-services.json (mirrors Partner).
- Native lock-screen ring tested on-device by the user (EAS build). Backend/realtime tested in-pod.

## Implemented (this session)
### Backend (verified in-pod)
- `booking_controller.request_reschedule`: the full-screen **data-only ring push** now goes to
  **both** parties (previously partner-only) — fixes the missing Customer reschedule alert.
  `notify(push=False)` for both; ring data now carries `title`/`body` so the web SW renders a
  proper tray notification when the browser is closed.
- `push_dispatch.push_to_user`: added Expo-push fallback for ExponentPushToken devices.
- `fcm_service`: google-services.json stored **per app** — Partner (`google_services`, default,
  unchanged) & Customer (`google_services_customer`); customer upload does not overwrite web-push
  config. `save/status/get` take an `app` param.
- Routes `PUT/GET /admin/partner-reg/fcm-config/google-services?app=customer` (+ download).

### Admin web (compiles)
- Firebase Settings modal: new "Customer app google-services.json" upload/download card
  (`adminTemplateIntegration.jsx`, testids `fb-cs-gs-file` / `fb-cs-gs-download`).

### Customer app (code-complete; on-device build by user)
- New: `src/lib/notifications.ts`, `src/lib/pushBackground.ts`, `src/lib/ringState.ts`,
  `src/context/RealtimeContext.tsx`, `src/components/customer/RescheduleAlertOverlay.tsx`,
  `plugins/withJobRingAndroid.js`, `plugins/withFirebaseBomPin.js`.
- Wired: `index.js`, `app/_layout.tsx`, `src/lib/push.ts` (prefers raw FCM token, Expo fallback).
- `app.json`: FCM plugins, full-screen-intent/foreground-service perms, `googleServicesFile`,
  iOS background modes. `package.json`: notifee, RNFB, expo-audio, expo-task-manager, react-native-sse, etc.
- Assets: `assets/sounds/job-ring.wav`, `assets/notification-icon.png`. Doc: `GOOGLE_SERVICES_SETUP.md`.

## Blocker / user action
- Customer killed-app FCM needs `Customer/google-services.json` for package `app.azoapp.customer`
  (Firebase project `azo-project-9f857`). Uploadable/downloadable via Admin; place in repo before build.

## Environment note
- `.env` files were missing in this pod and were recreated: `backend/.env` (MONGO_URL, DB_NAME=azoapp),
  `web_panel/.env`, `frontend/.env`, `Customer/.env` (preview URL).

## Backlog / next
- On-device verification of the Customer full-screen ring (lock screen / app closed).
- Optional: richer web SW `reschedule_request` branch.
