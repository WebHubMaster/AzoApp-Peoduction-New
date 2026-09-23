# "FCM Registration failed!" — full diagnosis & fix

## Exactly where the error comes from (traced in native code)
`frontend/src/lib/notifications.ts` → `getDevicePushTokenAsync()` runs
`node_modules/expo-notifications/.../PushTokenModule.kt`:
```kotlin
val instance = FirebaseMessaging.getInstance()   // SUCCEEDS -> google-services.json IS bundled + Firebase init OK
instance.token.addOnCompleteListener { task ->
  if (!task.isSuccessful)
    promise.reject("E_REGISTRATION_FAILED", "Fetching the token failed: ${task.exception?.message}") // <-- here
}
```
So `task.exception.message == "FCM Registration failed!"`. `getInstance()` did NOT throw
(so the bundled `google-services.json` is fine). The **`.token` network call was rejected by
Google's servers** — i.e. a **Firebase project / Google-Cloud-API problem, not the RN module**
(it failed both WITH and WITHOUT `@react-native-firebase/messaging`).

## Important: the "dynamic" admin Firebase config does NOT drive native registration
Native `getDevicePushTokenAsync()` only uses (1) the `google-services.json` **baked into the
APK at build time** and (2) the **project's Google-Cloud APIs**. The dynamic config in
Admin → Integration Center → Firebase is for WEB push + the backend SENDER. It can NOT make
native token registration succeed. Only the bundled file + enabled Cloud APIs can.

## Live probe result (real project azo-project-9f857 + real Android key from google-services.json)
Run from the backend against Google:
- **Firebase Installations API → 200 (ENABLED, key NOT restricted)**
- **FCM Registration API → reachable**

So the API key restriction / Installations API are NOT the blocker. Remaining possible causes,
now each covered by a definitive check or a fix:

| Cause | How it's handled now |
|---|---|
| **Firebase Cloud Messaging API (V1) disabled** for the project | Backend now does a **dry-run send probe with the service account** and the Admin health card reports `fcm_v1: enabled/disabled` + an enable link. |
| **firebase-messaging 25.1+ FID breaking change** disabling legacy `getToken()` | Added manifest meta-data `firebase_messaging_installation_id_enabled=false` (`tools:replace`) in `plugins/withJobRingAndroid.js` — forces the legacy path expo-notifications uses. |
| **APK bundled a different/placeholder google-services.json** | Admin diagnostic probes the EXACT project+key from the stored google-services.json; must match the APK. |
| **Firebase App Check enforced for Cloud Messaging** | Called out in the hint — must be OFF (or the app must implement App Check). |
| **Device Google Play services outdated** | App classifies + shows `play_services`; token fetch retries with backoff. |

## Code changes in this round
1. **Backend `services/fcm_service.py`**
   - `android_registration_diagnostic()` — probes Firebase Installations API + FCM Registration
     API with the app's real Android key/project and returns a precise reason + one-line fix + enable URL.
   - `fcm_v1_send_probe()` — dry-run send with the service account to detect if FCM V1 API is disabled.
2. **Backend `controllers/notification_admin_controller.py`** — `notification_health` now returns
   `android_push` (with `fcm_v1`) and adds a `reasons.android_registration` line; gates `ready_for_push`.
3. **Backend `routes/notification_routes.py`** — `/notifications/my-devices` now returns `push_state`
   (the exact native error) so the app can display it.
4. **App `src/components/partner/home/AlertsPanel.tsx`**
   - The **"Fix"** button no longer shows a false "enabled" toast — it now runs the real
     `registerPushToken()`, shows a spinner, and surfaces the exact failure reason.
   - A red **"Why push is off"** card shows the exact native error string (e.g. `FCM Registration
     failed!`) with a plain-language explanation + tap-to-copy detail.
5. **App `src/lib/notifications.ts`** (prev round) — POST_NOTIFICATIONS-gated fetch, exponential
   backoff (1/2/4/8s), `classifyTokenError()` reporting the real reason to the backend.
6. **`app.json`** (prev round) — added the `expo-notifications` config plugin.

## What YOU must do (cannot be done from code) — in priority order
1. **Admin → Notifications → health card** now shows `android_push` + `fcm_v1`. Read it:
   - If `fcm_v1: disabled` → open the enable link → **Enable "Firebase Cloud Messaging API"** for
     `azo-project-9f857`, wait 2–3 min.
   - If `android_registration: installations_api_blocked` → enable Installations API / un-restrict the key.
2. **Firebase Console → App Check** → make sure Cloud Messaging is **NOT enforced** (or configure App Check).
3. **Rebuild** the APK (`eas build -p android --profile production-apk`) so the manifest FID fix +
   expo-notifications plugin ship. Confirm build logs show `google-services.json` processing, and that
   the bundled file is the `azo-project-9f857` one.
4. Install → partner login → Dashboard → **Alert check** card now shows the exact error if it still
   fails; tap **Fix** and read it. When it succeeds it flips to "Background push: ON".

## Verified in sandbox
- `npx expo config` resolves (expo-notifications plugin + withJobRing + googleServicesFile).
- `node -c` on the plugin OK; eslint 0 new errors.
- Backend `android_registration_diagnostic()` + `notification_health()` run live against
  azo-project-9f857 and correctly report Installations=200 / FCM Registration reachable, with the
  `fcm_v1` service-account probe wired in.
- **On-device (APK) FCM token registration cannot be executed from this sandbox** — needs an EAS
  build + a real phone.

---
# Issue 2: Full-screen ring stopped firing when phone LOCKED / app CLOSED (booking + reschedule + reminder)

## This ring is NOT Firebase/FCM — it's the FCM-independent SSE + foreground-service path
`src/lib/backgroundRing.ts` keeps a Notifee **foreground service** alive and holds open the
same realtime **SSE** stream (`/api/realtime/stream`). When a `job_request` /
`reschedule_request` / `scheduled_reminder` event arrives it renders the full-screen Notifee
ring locally — no push token required. This is the "other method" that worked 100% before.

## Root cause of the regression
`RealtimeContext.tsx` started that foreground-service listener **only on `AppState → background`**.
On Android 12+ (the app targets SDK 36), you **cannot start a foreground service from the
background** (`ForegroundServiceStartNotAllowedException`). The start was wrapped in a
`try/catch` that swallowed the exception, so the service never actually started → the process
got killed on lock/close → the SSE died → NO ring for booking, reschedule OR reminder. (This
broke when the target SDK was raised; it "worked before" on the older target.)

## Fix (robust, won't regress)
`RealtimeContext.tsx` now starts the listener **the moment a partner is ONLINE, while the app
is still in the FOREGROUND** (never from the background):
```ts
const partnerOnline = user?.role === "partner" && user?.partner_status === "online";
useEffect(() => {
  if (Platform.OS === "web") return;
  if (partnerOnline) startBackgroundJobListener();   // FGS starts in foreground → always allowed
  else stopBackgroundJobListener();                  // offline / logout
}, [partnerOnline]);
```
Because the foreground service is already running before the phone is locked / the app is
swiped (`android:stopWithTask="false"`), it survives and keeps the SSE alive → the full-screen
ring fires in all three cases (booking, reschedule, 30-min reminder), locked or closed, with
NO dependency on FCM.

- `backgroundRing.ts`: also declares the explicit `dataSync` `foregroundServiceTypes` for
  Android 14+ so the service is accepted.
- Backend `services/realtime.py` confirmed to support MULTIPLE concurrent SSE connections per
  user (each gets its own queue), so the foreground stream + the background-listener stream
  coexist with no disconnect thrashing. `displayJobRing` no-ops when the app is active, so there
  is no double ring.

## Verified in sandbox
Metro bundles cleanly, eslint 0 errors, tsc 0 errors in the changed files. Backend broker
multi-subscriber behaviour verified by reading `services/realtime.py`. On-device lock/close
behaviour must be confirmed on the rebuilt APK.
