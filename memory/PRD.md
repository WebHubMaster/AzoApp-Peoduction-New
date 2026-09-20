# AzoApp Partner — Job Ring System

## Problem statement
Make the Job Ring 100% reliable so an ONLINE partner receives a call-style ring for
every new job — when the app is open, backgrounded, fully closed, or the phone is
locked. Same UI/logic as the web panel. Take all permissions on app open with a
well-designed UI. Web + mobile both must ring. User builds the APK themselves.

## Architecture
- Backend: FastAPI + MongoDB (shared by web panel + mobile). Prod: api.webhubmaster.shop
- Web panel: React (web_panel/) — IncomingJobRing.jsx (already working)
- Mobile: Expo React Native (frontend/) — EAS/dev-client build with native modules

## Job Ring pipeline (already implemented, verified wired)
- Dispatch: booking_controller `_alert_partners` → SSE `job_request` + FCM data-only
  high-priority push (`_push_job_request`, channel `job-ring`).
- Ring stop: on accept/reject/expire → SSE `job_taken` + FCM data push `job_taken`
  to all other partners; accept/reject/expire cancel the ring (no duplicate ringing).
- Mobile:
  - `src/lib/notifications.ts` — Notifee channels, full-screen call-style ring
    (`displayJobRing`, category CALL, fullScreenAction, foreground service, looped
    sound job_ring.wav), FCM token registration.
  - `src/lib/pushBackground.ts` (loaded in index.js) — headless FCM background +
    Notifee background handlers → ring on closed/locked; Accept/Reject from lock screen.
  - `src/components/JobRingOverlay.tsx` — in-app full-screen ring (1:1 web port),
    mounted in `app/(partner)/_layout.tsx`.
  - `src/context/RealtimeContext.tsx` — SSE + playRing/stopRing + 6s ring-pending poll.
  - `plugins/withJobRingAndroid.js` — permissions, foreground service, showWhenLocked,
    copies ring sound + notification icon into res/.

## Implemented this session (2026-06)
- NEW comprehensive permission gate on app open — `app/onboarding/notifications.tsx`
  rewritten: premium gradient hero (call icon + pulsing rings), status cards for
  Notifications / Full-Screen Call Alert / Run in Background (battery) / Location,
  "Allow all permissions" one-tap flow, re-checks on return from Settings.
- Permission helpers added to `src/lib/notifications.ts`: notifState, batteryState,
  fullScreenState, locationState, allPermissionStates, requestLocationPermission,
  requestBatteryExemption, shouldShowPermissionGate.
- `app/index.tsx` splash gate now routes to the permission screen on every app open
  until notifications are granted.
- `frontend/google-services.json` PLACEHOLDER added so the APK builds out of the box
  (must be replaced with the real Firebase file — see PUSH_SETUP.md).
- Metro fix: `package.json` start script runs with `CI=1` (container inotify limit is
  read-only; CI mode avoids the ENOSPC watcher crash). Preview live.

## Verified
- Full Metro bundle compiles (HTTP 200, 16.8MB) incl. new screen.
- Permission screen renders correctly on the preview.
- Backend ring dispatch + ring-stop code confirmed present & unchanged.

## Not testable here (needs real APK + Firebase — user does this)
- Remote push to a CLOSED/KILLED or LOCKED device (needs real google-services.json +
  service-account JSON in Admin → Integrations → Firebase). Notifee/FCM no-op in Expo
  Go and on web. In Expo Go the SSE in-app ring works while the app is open.

## CI/CD fix (2026-06)
Root cause: project was yarn-based but `.github/workflows/mobile.yml` uses `npm ci`.
- `package-lock.json` was stale → regenerated via full `npm install` (in sync now).
- Made it a clean npm project: removed `yarn.lock` (single lock file).
- `expo doctor` fixes: added `expo-asset` (expo-audio peer) + `expo-notifications` +
  `expo-intent-launcher`; deduped `react-native-screens` → 4.28.0 via `resolutions`;
  removed deprecated app.json fields (`newArchEnabled`, top-level `splash`,
  `android.edgeToEdgeEnabled`); added `expo.doctor` exclusions + `expo.install.exclude`.
- Verified: `npm ci --dry-run` exit 0 (no sync error); `npx expo-doctor` 21/21 pass;
  Metro bundle compiles (17MB); testing_agent frontend regression 4/4 PASS.

## Backlog / Next
- Optional: iOS APNs key upload in Firebase for iOS push (Android is primary).

## 2026-06 — CRITICAL push/ring fix (background/closed/locked was dead)
Root cause: `frontend/google-services.json` had been DELETED (empty) and `app.json`
declared package `com.azoapp.partner`, which does NOT exist in the user's Firebase
project. So `@react-native-firebase` never initialised → no FCM token → backend had
no device to push to. Result: foreground ring worked (SSE), but background / closed /
locked did NOT (that path is 100% FCM). All other pushes were dead in the background
too, for the same reason.

Fixes shipped:
- Added the REAL `frontend/google-services.json` (project azo-project-9f857; clients
  for `app.azoapp.homeservice` + `app.azoapp.partner`).
- Aligned `app.json` android.package + iOS bundleIdentifier → `app.azoapp.homeservice`
  (matches a google-services client). Updated default-package fallbacks in
  `src/lib/notifications.ts`.
- All-notification click-through: added `onFcmNotificationOpen` (FCM tray taps for
  reschedule / reminder / booking updates) + unified router in `ChatNotifier.tsx`
  → opens exact job ring / chat / booking; Notifee taps still handled for job/chat.
- Permission Dashboard (spec #5): new `app/(partner)/partner/permissions.tsx`
  (real-time status ✓ Allowed / ⚠ Not allowed, per-permission Why + Allow +
  Open Settings when permanently denied) + `PermissionBanner` on the dashboard when a
  critical alert permission is off + "Alerts & Permissions" item in the More menu.
- Admin: new "Upload google-services.json" in Integration Center → Firebase Settings.
  Backend `services/fcm_service.py` (`save_google_services`/`google_services_status`/
  `get_google_services_json`) + routes in `routes/partner_reg_admin_routes.py`
  (`GET/PUT/GET download /admin/partner-reg/fcm-config/google-services`). On upload it
  parses the file, auto-fills the web-push config (apiKey/projectId/appId/senderId/…)
  into `settings.integrations.fcm_web_config`, and stores the raw file for download.
- Docs: `frontend/PUSH_SETUP.md` rewritten (package rule + full pipeline + build cmd).

Verified locally:
- Backend up (200); new 3 endpoints pass over HTTP with admin auth (save→derive,
  status, download 200, invalid-JSON rejected). `save_google_services` writes the
  correct web_config into settings.
- Expo web bundle compiles (3673 modules, HTTP 200) with all new mobile screens.

NOT testable in-pod (needs the user's real APK + Firebase, as designed):
- Remote FCM push / call-style ring to a CLOSED/KILLED/LOCKED device. This is the
  user's on-device validation step after `eas build -p android --profile production-apk`.

User's remaining steps:
1. In Admin → Integration Center → Firebase Settings: keep the Service Account JSON
   uploaded (already done); optionally upload google-services.json there too.
2. Build the APK: `cd frontend && npx expo prebuild --clean && eas build -p android
   --profile production-apk`. Install on a real device and test the ring in all states.

