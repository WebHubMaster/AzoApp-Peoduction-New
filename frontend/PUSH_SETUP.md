# Push notifications (real build) — setup

Remote push + the call-style Job Ring on a **background / closed / locked** phone
needs a **real build** (dev-client or APK) + Firebase. Expo Go cannot receive
remote FCM push — in Expo Go the in-app SSE ring works only while the app is open.

## Package name (IMPORTANT)
- Android `applicationId` / iOS bundle id: **`app.azoapp.partner`**
- `frontend/google-services.json` MUST contain a client for this exact package.
  The bundled file has clients for `app.azoapp.partner` (and `app.azoapp.partner`).
- If these two ever disagree the Android build fails at `processGoogleServices`
  ("No matching client found for package name …") and FCM never initialises →
  push works in the foreground (SSE) but NOT in background/closed. This was the
  original bug — now fixed.

## 1. Firebase
1. Firebase console → project → **Project settings → Service accounts → Generate
   new private key** (JSON). Upload this JSON in **Admin panel → Integration Center
   → Firebase Settings** and enable FCM. (Backend sends via firebase-admin.)
2. `google-services.json` (Android app config) is already bundled at
   `frontend/google-services.json`. You can also upload it in **Admin → Integration
   Center → Firebase Settings → google-services.json** — the web-push config
   (apiKey/projectId/appId/senderId…) is then auto-filled from it.
3. iOS (optional): upload your APNs key in Firebase → Cloud Messaging, add an iOS
   app with bundle id `app.azoapp.partner`.

## 2. Build
```bash
cd frontend
npx expo prebuild --clean
eas build -p android --profile production-apk   # or: npx expo run:android
```

## 3. How it works
- On login the app registers its native FCM token → `POST /api/notifications/devices`
  (`src/lib/notifications.ts → registerPushToken`). Multi-device + token-refresh safe.
- New job (ONLINE partner): backend `_push_job_request` sends a **data-only,
  high-priority** FCM message `{type: job_request}` → `pushBackground.ts`
  `setBackgroundMessageHandler` → `displayJobRing` (Notifee full-screen call alert,
  looping sound, foreground service) rings even when closed / locked.
- Accept/Reject from the lock screen → Notifee background event → hits the API →
  ring stops. Accept/Reject/expire/cancel → backend broadcasts `{type: job_taken}`
  data push → other devices stop ringing (no duplicate/infinite ring).
- Tap a job/chat/booking notification (foreground, background or cold start) →
  `ChatNotifier.onNotificationTap` → opens the exact job ring / chat / screen.
- All other pushes (bookings, chat, account) go through `send_to_user` with a
  `notification` block so Android shows them in every state.
