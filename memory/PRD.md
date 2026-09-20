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


## 2026-06 — Fork setup + Onboarding/Login/Logo revamp
Setup (fork): recreated backend/.env (DB=azoapp), frontend/.env, web_panel/.env
(REACT_APP_BACKEND_URL empty → same-origin). web_panel now runs on port 3000 via
new supervisor program `webpanel` (default preview). Expo runs via `--tunnel` on 8081
(CI=1 to avoid inotify limit). Backend self-seeds demo data.
- Web preview: https://job-ring-notify.preview.emergentagent.com
- Expo Go: exp://nvmeila-anonymous-8081.exp.direct
- Verified: web_panel one-click demo logins 4/4 (Admin/Partner/Customer/Merchant), no CORS.

Mobile UI:
- App icon / splash / adaptive-icon regenerated from the uploaded AzoApp logo
  (assets/*.png) + bundled assets/brand-logo.png as in-app fallback. Native splash
  imageWidth 240 on brand blue (fixes the small "box" look).
- Splash-gate (app/index.tsx): shows dynamic branding logo (logo_dark||logo_light||logo),
  falls back to bundled AzoApp logo (removed the "A" letter box).
- NEW first-run onboarding: app/onboarding/intro.tsx — 3 creative swipe slides with
  dots + Skip + Next/Next/Get Started; sets `azo_onboarding_done`; then → permission
  gate → login. Routed from index.tsx; registered in app/_layout.tsx.
- Login redesigned (app/(auth)/login.tsx) to match the uploaded screenshot: hero header
  (dynamic logo + tagline + trust pill + generated worker hero image with 3 floating
  badges), "Login to Get Started", mobile +91 OTP card (Send OTP → Verify), Register as
  Partner/Merchant cards, One-Click Demo Login (Partner/Merchant) with "Demo OTP: 123456",
  4 feature icons, footer. Logo is dynamic from Admin → Branding & Theme (not hardcoded).
- Android bundle compiles clean (4233 modules). On-device visual check = user via Expo Go.

## 2026-06 — Iteration: package fix + login polish + push diagnostics + SVG
- Package/bundle set to **app.azoapp.partner** (matches a client in the uploaded
  google-services.json which has both app.azoapp.partner & app.azoapp.homeservice).
  A mismatched applicationId crashes @react-native-firebase at init → app dies on
  launch → BOTH ring (SSE) and push die; this alignment is the core fix.
- google-services.json re-synced from the newly uploaded file. notifications.ts
  fallbacks + PUSH_SETUP.md updated to app.azoapp.partner.
- Login (app/(auth)/login.tsx): logo now uses ANY available slot
  (logo_light||logo_dark||logo) and shows the image ONLY (no text logo) when set;
  mobile input fits one line (compact +91, placeholder "Mobile number"); OTP is now
  6 segmented boxes (web-style); Register as Partner/Merchant is ONE split row.
- Permission warning: PermissionBanner rewritten — clear English warning
  ("...you will NOT be notified about new bookings once the app is closed or your
  screen is locked"), one-tap "Turn On Alerts", easily dismissible (re-shows after 12h).
- NEW on-device diagnostics in Alerts & Permissions screen: shows "Server push
  service: Configured/Not configured" + "This phone registered: Yes/No", plus
  "Test Job Ring" and "Test Notification" buttons that send a REAL push to the
  partner's own device via new endpoint POST /api/notifications/test-self.
  → This is how the partner verifies push/ring on the real device and sees the exact
  failure reason if it still doesn't work.
- SVG upload: web_panel upload timeout raised to 120s (fixes false "Connection issue/
  Upload failed" on slow S3 on live); S3 proxy (GET /api/media/s3/{key}) now forces
  image/svg+xml (and other types) by extension so logos always render. Verified
  end-to-end locally (upload → GET 200, content-type image/svg+xml).
- Verified: Android bundle 4233 modules clean; backend endpoints (test-self, my-devices,
  media) respond correctly. On-device FCM push/ring is verified by the user via the
  new Test buttons (cannot be tested inside the pod).

## 2026-06 — SVG upload + broken media preview (live server) FIXED
Root causes found by probing the LIVE hosts:
- Panel is at webhubmaster.shop but backend is at api.webhubmaster.shop. Backend
  stored media URLs were RELATIVE ("/api/media/s3/..."), so <img> resolved them
  against the panel origin (404) → broken preview for ALL formats (incl. sidebar logo).
- SVG upload "Connection issue/Upload failed" = live WAF/Cloudflare XSS rule blocks
  raw SVG markup in the request body (a trivial SVG reached the backend as 401, but
  real logo SVGs get blocked).
Fixes:
- web_panel: new mediaSrc() (api.js) prefixes relative media URLs with the backend
  origin; applied to branding preview (adminSectionsPro) + sidebar logo (PanelLayout)
  → fixes existing + new previews instantly.
- backend: storage_service now emits ABSOLUTE URLs for new uploads — _put/_public_url/
  save_image take a base_hint; media upload route derives it from X-Forwarded-Host/Proto
  (used only when REACT_APP_BACKEND_URL env is empty, as on their live backend).
- web_panel imageUpload.js: SVG is now RASTERISED to PNG client-side (canvas, up to
  1024px) before upload → bypasses the WAF, uploads as a normal image, preview works,
  and it's Gmail/invoice-safe. Falls back to raw SVG only if rasterisation fails.
- mobile BrandContext: logo URLs absolutised with EXPO_PUBLIC_BACKEND_URL so relative
  URLs still render on the phone.
Action for user after deploy: re-upload the logo once (existing relative URLs are
fixed in admin by mediaSrc, but re-uploading stores absolute URLs for mobile/website/
emails too). Verified: web panel compiles + serves; mobile bundle clean (4233 modules);
local media upload returns an absolute URL; SVG upload works end-to-end.

## 2026-06 — PUSH ROOT CAUSE PROVEN (native token never obtained)
Verified against LIVE prod (api.webhubmaster.shop, admin +919000000000 OTP 123456):
- /api/admin/notifications/health → ready_for_push:true, service_account configured
  (project azo-project-9f857), web_api_key NOT blocked (Firebase Installations 200),
  vapid set, fcm_enabled true. SERVER IS 100% HEALTHY.
- devices.total = 0 across ALL roles → NOT ONE FCM token ever stored.
- partners_no_device have push_state = null → app never even REPORTED an outcome,
  which is why admin shows the misleading "never tapped Allow in this browser".
CONCLUSION: failure is 100% on-device — the native app never obtains an FCM token.
Most likely: installed APK is an OLD build (from when google-services.json was
empty/missing) OR RNFB messaging module fails to instantiate. google-services.json
NOW correct (project azo-project-9f857, pkg app.azoapp.partner appid ...f447c0dd).
FIX APPLIED (frontend/src/lib/notifications.ts):
- messaging() no longer throws (wrapped) — used to silently kill registration.
- registerPushToken() now: (1) dual token path — RNFB getToken() w/ retries THEN
  expo-notifications getDevicePushTokenAsync() fallback; (2) ALWAYS reports the exact
  reason to /notifications/push-status (expo_go / permission / no_fcm_module /
  getToken_failed+error / exception / registered:<source>).
- AlertsPanel "Fix" now calls registerPushToken() right after permission grant.
REQUIRES A NEW APK BUILD (eas profile production-apk, EXPO_PUBLIC_BACKEND_URL baked =
https://api.webhubmaster.shop). CANNOT be verified from server/preview — physical
device only. After rebuild+install+login+allow, admin health.devices.total must be >0
and push_state.reason must show registered:<rnfirebase|expo>. NOT YET DEVICE-VERIFIED.
KNOWN SECONDARY (web push): web_config.appId is derived from the homeservice ANDROID
client (…11f5) not partner (…f447), and FCM web push needs a real Firebase WEB app
appId (…:web:…) which google-services.json does not contain → browser AbortError.
Web panel should use the VAPID webpush_service path instead. Not fixed (out of scope).
