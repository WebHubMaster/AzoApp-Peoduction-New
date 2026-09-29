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

## Feature — Single Device Login (Partner app)
User choices: Partner role only; Support button opens support contact (tel/mailto from brand); stable per-install device id in secure storage; old device shows a "logged out on another device" message; Admin Reset Device on the partner 360 profile.

Backend (verified: testing agent 7/7 backend tests pass):
- `verify_otp(..., device_id)`: partner first login (or first login post-reset) binds `registered_device_id`; a different device → `{ok:False, reason:'device_mismatch'}`.
- `auth_controller.verify_otp`: 403 `detail={code:'device_mismatch', message}`; `create_token(uid, role, did=device_id)` adds a `did` claim.
- `middleware.get_current_user`: for partners, if token `did` != `registered_device_id` → 401 `detail={code:'device_revoked'}` (old device auto-logout).
- `POST /admin/people/{role}/{uid}/reset-device` → `people_admin_service.reset_device` unsets the binding + logs + notifies.
- Non-partner roles are NOT locked. Backward-compatible (no device_id + no binding still logs in).

Partner app (frontend/, tsc+eslint clean):
- `src/lib/deviceId.ts` (stable secure-store uid); `api/client.ts` injects device_id into /auth/verify-otp, parses `{code,message}` errors, and on 401 `device_revoked` clears the token + fires a force-logout handler.
- `AuthContext`: `sessionEndedReason` + force-logout wiring.
- `components/auth/DeviceLockedModal.tsx` (blocking notice + Contact Support); `OtpFlow` shows it on `device_mismatch`; `(auth)/login.tsx` shows the auto-logout banner.

Admin web (compiles): Person360 "Reset Device" button (partner only) + confirm modal → reset-device endpoint.

### Update — Device Info on admin profile
- verify-otp now also accepts `device_name`; stored as `registered_device_name` on bind (and kept fresh on same-device login). Partner app sends it via `getDeviceName()` (expo-device: model · OS version).
- reset_device also unsets `registered_device_name`.
- Person360 shows a device-info panel next to Reset Device: device name, registered-on and last-login timestamps (or "No device registered yet"). Verified: login with device_name → overview returns it; reset clears it.

### Update — Device History (audit)
- User doc keeps a capped `device_history` (last 15) with entries: `registered` (on bind), `blocked` (login attempt from an unregistered device), `reset` (admin, with `by`). Pushed from `auth_service.verify_otp` and `people_admin_service.reset_device`.
- Person360 renders a "Device history" panel (last 6, newest first) with per-event colour/icon, device name, actor and timestamp. Verified in-pod: register → blocked → reset all logged and returned in overview.

## Update — Booking Ring (partner accept → customer full-screen confirmation)
- Backend `accept_job`: after assigning the partner, now emits SSE `booking_confirmed` + a
  data-only full-screen ring push to the CUSTOMER (partner name/rating/schedule, `title`/`body`
  for the web SW). Verified in-pod: accept → 200, customer gets in-app "Partner assigned" +
  a "Booking confirmed" ring dispatch (skipped only because no Firebase creds in this pod).
- Customer app: `notifications.ts` `displayBookingRing`/`cancelBookingRing`; `pushBackground.ts`
  handles `booking_confirmed`; unified `src/components/customer/CustomerAlertOverlay.tsx`
  (replaces RescheduleAlertOverlay) renders BOTH the amber reschedule ring and a green
  "Booking confirmed" ring (Call / View booking). One-time (never re-rings; not polled).

## Feature — Recurring Subscription (maid) + Custom Service in Customer app
- Customer service detail (Customer/app/(site)/service/[id].tsx): when `svc.is_subscription`, now renders a "Choose your plan" panel (Daily/Weekly/Monthly from `/subscriptions/plans/{id}`) with start date/time + address, a single **"Book Now"** button (NO "pay upfront" wording, NO green attendance note), and hides the normal add-to-booking card + sticky bar. Book → create `/subscriptions` then pay/mock (fallback pay/order) → go to subscriptions.
- Added a "Need a Custom Service?" entry on every service detail → `/(customer)/custom_jobs?new=1`, which now auto-opens the existing custom-job wizard.
- Verified: tsc + eslint clean; backend `svc-maid-fulltime` returns is_subscription + 3 plans. Native UI to be confirmed on an EAS build.
