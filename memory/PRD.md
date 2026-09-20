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
- Replace placeholder google-services.json + upload FCM service account, then EAS build.
- Optional: in-app "Fix alerts" banner on partner dashboard when a critical permission
  is revoked later.
