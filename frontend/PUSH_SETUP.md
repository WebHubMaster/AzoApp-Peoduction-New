# Push notifications (real build) — setup

Chat push (background / closed app) needs a real build + Firebase. Expo Go cannot receive remote push.

## 1. Firebase
1. Firebase console → project → **Project settings → Service accounts → Generate new private key** (JSON).
   Upload this JSON in **Admin panel → Integrations → Firebase (FCM)** and enable FCM. (Backend sends via firebase-admin.)
2. **Add Android app** with package `com.azoapp.partner` → download `google-services.json` → place it at `frontend/google-services.json`.
3. In `app.json` add under `expo.android`:
   ```json
   "googleServicesFile": "./google-services.json"
   ```
4. iOS (optional): upload your APNs key in Firebase → Cloud Messaging, add iOS app with bundle id `com.azoapp.partner`.

## 2. Build
```bash
cd frontend
npx expo prebuild --clean
eas build -p android --profile preview   # or: npx expo run:android
```

## 3. How it works
- On login the app calls `getDevicePushTokenAsync()` (native FCM token) → `POST /api/notifications/devices` (`src/lib/notifications.ts → registerPushToken`).
- Backend `send_message` → `notify()` → FCM push **only when the recipient is not currently viewing that chat** (presence heartbeat via `POST /bookings/{id}/messages/seen`).
- Payload: title = sender name, body = `message\nService • Booking #CODE`, Android channel `chat`, collapse key `chat-<booking_id>`, data `{type: chat_message, booking_id, code, service_name, sender_role}`.
- Tap (foreground / background / cold start) → `ChatNotifier.onNotificationTap` → `/chat/[id]?role=…&service=…`.
- Foreground: SSE `booking_message` → local notification (same format) unless that chat screen is open.
