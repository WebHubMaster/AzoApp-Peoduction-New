# FCM Push-Token Registration Fix (partner "NO_TOKEN" / "FCM Registration failed!")

## Root cause (confirmed, not guessed)
`frontend/src/lib/notifications.ts` fetches the native FCM device token via
`expo-notifications` `getDevicePushTokenAsync()` (RNFB messaging is intentionally
disabled). That native call was throwing **"FCM Registration failed!"** because the
**`expo-notifications` config plugin was MISSING from `app.json` → `plugins`** — only
`@react-native-firebase/app` was present. Without the `expo-notifications` plugin, the
Android FCM setup that expo-notifications needs was not bundled into the EAS build, so
the device could never register an FCM token → backend push had 0 devices → SKIPPED 0/0
→ no full-screen job ring when the phone was locked / app closed.

## What changed (project / sender / plugin)
- **Project / sender (UNCHANGED):** `azo-project-9f857`, sender `960503871336`. The app
  keeps using `frontend/google-services.json` which already contains BOTH Android
  packages `app.azoapp.homeservice` and `app.azoapp.partner`. `android.googleServicesFile`
  is confirmed bundled (verified via `npx expo config` — see below).
- **PLUGIN (THE FIX):** Added the `expo-notifications` config plugin to
  `frontend/app.json` `plugins`:
  ```json
  [
    "expo-notifications",
    {
      "icon": "./assets/notification-icon.png",
      "color": "#0D47A1",
      "enableBackgroundRemoteNotifications": true
    }
  ]
  ```
  (Sounds are intentionally NOT declared here — the job-ring tone is copied to
  `res/raw/job_ring.wav` by `plugins/withJobRingAndroid.js`; adding `job-ring.wav` via the
  expo plugin would create an invalid hyphenated Android resource name and break the build.)
- **Token fetch hardened** (`notifications.ts` `registerPushToken`):
  - POST_NOTIFICATIONS is confirmed granted BEFORE `getDevicePushTokenAsync` (Android 13+).
  - Exponential backoff retry: 1s, 2s, 4s, 8s (5 attempts) for transient native failures.
  - New `classifyTokenError()` maps the raw native error to a stable reason
    (`play_services` / `fcm_registration_failed` / `network` / `no_token`) and reports the
    exact reason + a fix hint to the backend, so the Admin panel shows the real cause.
- **Backend sender-mismatch surfaced** (`services/fcm_service.py` `send_to_user`):
  detects `messaging/mismatched-credential` / SenderId-mismatch on send, does NOT
  deactivate the (valid) token, and logs a clear "upload the service-account for
  azo-project-9f857" delivery reason.
- **Admin diagnostics** (`controllers/notification_admin_controller.py` `notification_health`):
  now compares the uploaded service-account project vs the app's google-services project
  and returns `sender_mismatch` + a `reasons.sender_mismatch` message; `ready_for_push`
  is false when they differ. New `google_services` block is included in the response.

## Manual steps you must still do (console + build + device)
These cannot be done from the code sandbox:

1. **Google Cloud Console → project `azo-project-9f857`** → APIs & Services → Enable:
   - **Firebase Cloud Messaging API (V1)**
   - **Firebase Installations API**
   - **FCM Registration API** + **Firebase Installations API** must ALSO be allowed on the
     Web/Browser API key restrictions (the Admin → Notifications health card flags this as
     `web_api_key` if blocked).
   If the legacy FCM API is disabled/expired, that is fine — only **V1** is required.
2. **Backend FCM service account (SENDER MATCH):** In Admin → upload the Firebase
   **service-account JSON for `azo-project-9f857`**. If a service-account from a different
   project is uploaded, the Admin health card now shows `sender_mismatch` and pushes are
   rejected even with a valid token.
3. **EAS build** (`eas build -p android --profile production-apk`) — confirm the build logs
   show `google-services.json` processing. Install the fresh APK.
4. **On-device acceptance:** partner login → Admin → Notifications: device shows REGISTERED
   (not NO_TOKEN); "Send test push" → DELIVERED 1/1; new booking rings full-screen with
   sound on locked / closed / background; reschedule + 30-min reminder ring the same way.

## Verified in sandbox
- `npx expo config --type public` resolves cleanly with `expo-notifications` plugin +
  `googleServicesFile: ./google-services.json` + `withJobRingAndroid` all present.
- `eslint src/lib/notifications.ts` → 0 errors.
- Backend `notification_health()` runs against the live DB and correctly reports
  `sender_mismatch` (proven with a simulated mismatched service-account).
