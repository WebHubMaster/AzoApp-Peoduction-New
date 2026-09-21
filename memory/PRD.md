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

## 2026-06 — WEB PUSH fixed end-to-end + CLEARTEXT image bug fixed
DEVICE LOG (Samsung SM-E146B, Android 15) on "Fix" tap revealed:
  java.net.UnknownServiceException: CLEARTEXT communication to api.webhubmaster.shop
  not permitted by network security policy  → ALL logo/media images broken on APK.
Cause: backend built media URLs from x-forwarded-proto=http. FIX:
  - backend/routes/media_routes.py _abs_base(): force https for any non-local host.
  - frontend/src/api/client.ts mediaUrl() + BrandContext.tsx absUrl(): upgrade any
    absolute http:// (non-local) → https:// so already-stored http URLs also load.
  Verified: upload with x-forwarded-proto:http now returns https URL.

WEB PUSH gap found + fixed: notification_service.notify() fired BOTH channels, but
the JOB-RING dispatch + every test-push endpoint called fcm_service.send_to_user
ONLY → web-push (VAPID) subscribers never got job rings or the admin "Send test push".
FIX: new backend/services/push_dispatch.py push_to_user() sends via BOTH
webpush_service + fcm_service (merged {success,failure,skipped,error,channels};
drop-in compatible). Routed through it:
  - booking_controller.py new-job dispatch (~1119) + job_taken cancel (~2497)
  - admin_controller.send_test_ring (~2812)
  - notification_admin_controller: send_campaign + test_push (aliased import)
  - notification_routes /test-self (also removed FCM-only hard gate; web push works
    without Firebase). 
Verified locally (partner +919000000003): SW /firebase-messaging-sw.js 200; VAPID
public-key enabled(87 chars); POST /webpush/subscribe stores → my-devices count=1,
webpush_count=1; /partner/test-ring now dispatches to webpush channel.
NOTE: real browser push DELIVERY can't be tested headless (Chromium disables push);
must be confirmed on the admin's real Chrome (desktop/Android): login → allow →
PushRegistrar auto-subscribes → job/test push arrives via the service worker.
APK push still needs a fresh EAS build (dual-path token + always-report from prior
change). Deploy backend for web-push + cleartext fixes to take effect on prod.

## 2026-06 — Offline gate (No Internet screen) added
User: jab internet na ho to full-screen "No Internet Connection" screen dikhe
(reference design), app aage kuch na kare, aur "Go Offline (Limited Access)" button
NA ho. (No existing offline component in codebase — reference was a mockup.)
Built:
  - frontend/src/lib/connectivity.ts — useConnectivity(): active reachability ping to
    ${API_BASE}/notifications/push-config (any HTTP status = online) + optional
    @react-native-community/netinfo (12.0.1, installed) for instant change events +
    AppState re-check. Self-scheduling poll: 4s offline / 20s online. Works in native
    build, Expo Go and web (netinfo optional/guarded).
  - frontend/src/components/OfflineGate.tsx — full-screen overlay (zIndex/elevation
    99999) matching the reference: red wifi-off icon in pink circle, "No Internet
    Connection" title + subtitle, 3 tip cards (Check Mobile Data / Connect to Wi-Fi /
    Turn Off Airplane Mode), blue "Try Again" (shows Checking… spinner). NO Go-Offline
    button. Blocks ALL interaction until back online; auto-recovers or via Try Again.
    testIDs: offline-gate, offline-try-again.
  - Mounted globally in app/_layout.tsx (after <Stack/>, inside ToastProvider) so it
    covers every screen.
Verified: babel compile OK for all 3 files; all MDI icon names valid; netinfo installed.
Needs the SAME fresh APK rebuild to appear on device (native dep). Also renders in web/
Expo Go via fetch-ping fallback.

## 2026-06 — JOB RING in background/closed/locked FIXED (Android 14 FGS type)
User: push works now, but job-ring alert only fires when app is OPEN — not when
closed or phone locked.
ROOT CAUSE (high confidence): job ring is data-only → runs RNFB
setBackgroundMessageHandler → displayJobRing() → Notifee foreground service. The
Notifee FGS was declared android:foregroundServiceType="phoneCall|mediaPlayback".
On Android 14+, starting a `phoneCall` FGS from a background FCM message is REJECTED
(app is not a Telecom calling app) → SecurityException → ring silently fails when
closed/locked. In FOREGROUND the FGS start is allowed (app visible) → ring works.
That exactly matches "only rings when app open". Regular pushes still worked in bg
because they carry a `notification` block (system-rendered, no FGS).
FIX:
  - plugins/withJobRingAndroid.js: FGS type "phoneCall|mediaPlayback" → "mediaPlayback"
    (allowed to start from a high-priority FCM bg message); removed
    FOREGROUND_SERVICE_PHONE_CALL permission.
  - src/lib/notifications.ts displayJobRing(): try FGS ring; on ANY failure retry
    WITHOUT foreground service (loopSound/ongoing off) so the full-screen ring still
    appears (rings once) — alert never swallowed.
Backend payload already correct (data_only=True, priority=high, no notification block).
FSI grant flow already exists (openFullScreenIntentSettings in onboarding/permissions).
NEEDS the fresh APK rebuild (native plugin + prebuild) to take effect; verify on a
locked/closed phone. Not device-verified from here.

## 2026-06 — Job-ring bg still failing: added GROUND-TRUTH ring diagnostics
User still reports: closed/locked pe full-screen call alert nahi aata, sirf normal
push aata hai. (Note: for every new job backend sends TWO msgs — _notify "New job
available" notification-block [shows in tray] + _push_job_request data_only ring.
So the tray push the user sees is the _notify one; the data-only ring is what must
trigger the full-screen handler.)
Foreground ring uses the SAME displayJobRing+channel and WORKS → channel + FSI-grant
+ display path are fine when app is open. So bg failure is either: FGS start rejected
(phoneCall fix already applied, needs rebuild) OR USE_FULL_SCREEN_INTENT not granted
(Android 14+) OR handler not running (Samsung battery kill) OR user testing an OLD APK.
Cannot resolve/verify from server — full-screen ring is 100% client-side native.
ADDED (definitive, no more guessing):
  - backend POST /api/notifications/ring-status → stores users.ring_state
    {ok, ctx(bg|fg), mode(fgs|no_fgs|failed), error, fsi, booking_id, at}; also
    returned by GET /api/notifications/my-devices. Verified locally.
  - displayJobRing(d, ctx="fg"|"bg") now REPORTS outcome + fsi(full-screen-intent
    granted) to backend on every ring; background handler passes ctx="bg".
  - AlertsPanel "Alert check" card shows "Last job ring on this phone" with the
    exact result + an ⚠ hint when full-screen permission is OFF (testID ring-diagnostic).
NEXT: user must DEPLOY backend + BUILD FRESH APK, then send a test ring with app
closed/locked, reopen app → the card (and admin) will show EXACTLY why (fgs error /
fsi off / not shown). Fix the specific reason it reports. Do NOT claim fixed until
ring_state shows ok:true ctx:bg.

## 2026-06 — Push IMAGE bug FIXED+VERIFIED + ring FSI action + webpanel restored
BUG (user): admin push with image attached → recipient sees only text, no image.
ROOT CAUSE: notification_admin_controller passed image INSIDE the data dict, so
fcm_service's image= param stayed None → notification.image never set.
FIX (verified by testing_agent iteration_82, 4/4 backend pytest PASS):
  - send_campaign: send_to_user(..., dict(meta), image=(image or None))
  - test_push: reads body.image, stores it in the in-app notification + SSE, passes image=
  - fcm_service.send_to_user: AndroidNotification(image=...) added + http→https upgrade
  - webpush_service.send_to_user: http→https upgrade (already had notification.image)
  - web SW firebase-messaging-sw.js already renders showNotification image
  Verified: image persists in in-app notification + campaign record; dual-channel
  dispatch; no-image regression OK. (Live FCM/browser render can't be tested here w/o
  real config+device; API/DB/SW chain confirmed.) Deploys with backend.
RING (still pending user device test of the DIAGNOSTIC build):
  - User reported: closed/locked pe silent notification only, no ring; and the
    "Full-Screen Call Alert" option "dikhta hi nahi" → because the dashboard "Fix"
    only handles notifications; FSI lives on the Alerts&Permissions screen. On Android
    14+ without USE_FULL_SCREEN_INTENT granted, NO full-screen ring — very likely THE
    missing grant.
  - Added: AlertsPanel ring-diagnostic now shows an "Allow full-screen" button
    (openFullScreenIntentSettings) when ring_state.fsi===false. displayJobRing reports
    ok/mode/error/fsi/ctx to /notifications/ring-status; my-devices returns ring_state.
  - NEXT (user): rebuild APK + deploy backend → open Alerts&Permissions → grant
    "Full-Screen Call Alert" + "Run in Background" → test job with app closed/locked →
    read "Last job ring on this phone" line in the Alert check card. It will show the
    exact reason (fgs error / fsi off / not shown).
ENV: restored web_panel on supervisor port 3000 (stopped Expo 'frontend' which had
grabbed 3000). Admin panel now serves at preview /admin.
