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

## 2026-06 — One-tap Full-Screen + Run-in-Background grant on dashboard
User wants easy granting of "Full-Screen Call Alert" + "Run in Background" (the
missing grants for lock-screen ring on Android 14+). Added to the dashboard "Alert
check" card (AlertsPanel TestRingCard), Android-only block "ring-permissions":
  - Full-Screen Call Alert row → always shows Allow/Open (openFullScreenIntentSettings);
    FSI detection is unreliable on OEMs so the button is always offered.
  - Run in Background row → Allow (requestBatteryExemption) when not granted.
  - Re-checks on AppState 'active' (after returning from system settings).
  testIDs: ring-permissions, alert-allow-fsi, alert-allow-battery.
Native UI → appears only in a rebuilt APK; can't be tested from web/here. Compiles OK.

## 2026-06 — Job ring FINAL hardening (all-conditions, glitch-free)
Discovered: FOREGROUND ring = React JobRingOverlay (SSE/onMessage) — NOT Notifee.
So the stale Notifee CHANNEL was never exercised in foreground → background ring was
SILENT. Root fixes this pass:
  1. Channel version bump: jobRing "job-ring"→"azo-job-ring-v3", chat→"azo-chat-v3";
     setupAndroidChannels() deletes LEGACY_CHANNELS first (immutable-channel fix →
     the "silent notification, koi ring nahi" glitch).
  2. setupAndroidChannels() now also runs at app ENTRY (pushBackground module init),
     so the loud channel exists before the first background/killed message.
  3. Loud KILLED-app fallback: new-job _notify now passes ctx._data
     {android_channel:"azo-job-ring-v3", type:"job_available", tag:"new-job"} → the
     system-rendered tray push (works even when app can't wake) is now LOUD on the ring
     channel. type "job_available" (NOT job_request) so foreground consumers
     (ChatNotifier L64, JobRingOverlay L184 both guard type==="job_request") do NOT
     double-ring.
  (Earlier this session: FGS phoneCall→mediaPlayback, displayJobRing FGS fallback,
   dual-path token, dashboard one-tap FSI+battery grants, ring_state diagnostics.)
CONDITION COVERAGE (after user grants Notifications+Full-Screen+Run-in-Background):
  open ✓ (overlay) | background ✓ | locked ✓ (fullScreenIntent+showWhenLocked) |
  closed/killed+battery-exempt ✓ (high-priority data wakes handler→Notifee) |
  killed+OEM-throttled → LOUD tray heads-up (fallback) + tap opens ring |
  force-stopped / switched-off → not possible (Android limit; user excluded off).
All files compile. NATIVE → needs fresh APK to verify; cannot test ring from server.

## 2026-06 — FULL-SCREEN INTENT false-positive fixed (THE cause of heads-up-not-fullscreen)
User screenshot: gets "New job available" heads-up; tapping opens ring; wants AUTO
full-screen call screen (no tap). Root cause FOUND in fullScreenState() — when Notifee
can't introspect the FSI setting (common on Android 14/15), it returned granted:TRUE.
So the app thought USE_FULL_SCREEN_INTENT was allowed, NEVER prompted the user, and the
fullScreenAction silently degraded to a heads-up notification (Android 14+ denies FSI by
default for non-calling apps).
FIX (src/lib/notifications.ts):
  - fullScreenState(): on sdk>=34 when undetectable, granted = (FSI_ASKED_KEY set) —
    i.e. NOT granted until the user has been sent to the FSI settings screen once. No
    more false-positive → the dashboard "Full-Screen Call Alert" row + onboarding now
    correctly show "Allow", and ring_state.fsi reports false until granted.
  - openFullScreenIntentSettings(): sets FSI_ASKED_KEY + fallback to openSettings().
After rebuild: dashboard "Alert check" → "Allow" on Full-Screen Call Alert → toggle ON
in system settings → next job auto-opens the full-screen ring over the lock screen
(MainActivity already has showWhenLocked/turnScreenOn via withJobRingAndroid).
All compiles. Native → verify on fresh APK.

## 2026-06 — Onboarding: ask ALL 4 permissions + "Continue" when done
User: first open par Full-Screen + Run-in-Background pehle se green (bina maange)
dikhte the; sirf location+notification maangta tha. Aur sab allow hone par button
"Continue" banna chahiye.
FIX:
  - fullScreenState(): already fixed to granted=asked (not false-positive).
  - batteryState(): now granted=asked (removed "!optimized" pre-tick that many OEMs
    report by default). requestBatteryExemption() sets BATTERY_ASKED_KEY FIRST (before
    the already-exempt early-return) so the card reliably turns green after one tap.
  → On first open all of Notifications / Full-Screen / Run-in-Background / Location
    show "Allow" and are actually requested.
  - app/onboarding/notifications.tsx: main CTA now becomes green "Continue" (→ finish)
    once every AVAILABLE permission is granted; "Maybe later" hides at that point.
    "X/4 ready" badge now accurate.
All compiles. Native permission behavior → verify on fresh APK.

## 2026-06 — ROOT CAUSE PROVEN via diagnostic: Firebase native not initializing (no_fcm_module)
Admin Live Dispatch Feed showed EVERY dispatch = PUSH "skip: no_devices" for partner
Kundan (+919693488222). Foreground ring worked ONLY via SSE (live conn), masking that
FCM never worked. My ring/push diagnostic (deployed) captured the exact device reason:
  push_state: reason="no_fcm_module", error="no token from RNFirebase or expo-notifications",
  permission=granted, ua="AzoApp/1.0.0 (android vivo V2303 15)".
Meaning: messaging() returned null on device → @react-native-firebase native module NOT
linked/initialized in the APK → no FCM token → all background/closed/locked pushes skip
(no_devices) → ring fails 100% when app closed/locked. NOT a full-screen/permission issue.
Config verified correct: app.json googleServicesFile set, google-services.json tracked in
git (EAS gets it), package app.azoapp.partner matches project azo-project-9f857, plugins
present + ordered. Stack: Expo SDK 57.0.23, RN 0.86.3, RNFB 26.4.0.
LIKELY CAUSE: New Architecture (default ON in SDK 57) + RNFB v26 native module not linking
under bridgeless. FIX APPLIED: app.json "newArchEnabled": false (RNFB v26 works reliably on
old arch). Needs FRESH APK (expo prebuild --clean + EAS build).
If still no_fcm_module after this build: (a) run `npx expo install @react-native-firebase/app
@react-native-firebase/messaging` to get SDK-57-matched versions; (b) `expo prebuild --clean`;
(c) confirm EAS build logs show google-services.json applied + Firebase gradle plugin.
Verify success: admin health devices.total includes the partner; ring_state ok:true ctx:bg.

## 2026-06 — REAL ring root cause + reliable fix (no RNFB needed)
Production diagnostic (admin/notifications/health + people overview push_state) proved:
- Token NOW registers (devices.total:1) and BOTH "New job available" + data-only
  "New job request" deliver success:1 to the partner device.
- BUT partner push_state = no_fcm_module on Xiaomi POCO M2 Pro (A12): messaging()
  (@react-native-firebase/messaging) returns null → RNFB native module not linking
  (New Arch on AND off both fail; RNFB v26 is TurboModule-first). Token comes from the
  expo-notifications fallback, which is why plain notifications arrive.
ROOT CAUSE of "no ring": pushBackground.ts does `const m = messaging(); if (m)
m.setBackgroundMessageHandler(...)`. messaging()==null → background ring handler NEVER
registers → the data-only ring message has NO JS handler → silently dropped → only the
OS-rendered "New job available" notification shows. Notifee itself works (foreground ring
via SSE works); only RNFB messaging is dead.
FIX (backend, works with CURRENT APK — only needs backend deploy, no rebuild):
- controllers/booking_controller.py _push_job_request: data_only=True→False,
  android_channel "job-ring"(legacy/deleted)→"azo-job-ring-v3", tag→"new-job".
- routes/notification_routes.py test-self ring: same (azo-job-ring-v3, data_only=False).
Now Android ITSELF renders the ring as a LOUD heads-up notification on the Notifee-created
azo-job-ring-v3 channel (HIGH importance + JOB_RING_SOUND + bypassDnd) — loud lock-screen
ring with NO RNFB/JS. Tapping opens the full-screen ring UI.
Reverted app.json newArchEnabled:false (user built it, RNFB still failed → no benefit;
kept SDK-57 default).
HONEST LIMIT: a TRUE auto-launching full-screen CALL activity on a locked/killed phone
needs RNFB+Notifee+FGS+full-screen-intent all working; RNFB messaging isn't linking in this
Expo build, so auto-takeover can't be guaranteed. The LOUD ring notification is the reliable
deliverable. To pursue true full-screen later: fix RNFB autolinking (needs device/EAS build
logs) OR wire expo-notifications BACKGROUND_NOTIFICATION_TASK → Notifee displayJobRing.
NEXT: deploy backend → test closed/locked on current APK → verify loud ring. Then check
production people-overview for ring_state / delivery success.

## 2026-06 — TRUE auto full-screen ring: removed RNFB messaging, went pure expo-notifications + Notifee
User demanded auto-launch full-screen call ring (no tap) as the #1 feature. RNFB messaging
module wasn't linking (messaging()==null) AND its native FirebaseMessagingService likely
intercepts FCM in background (higher manifest priority) then drops it (no JS handler) — so
the data-only ring never reached any JS handler.
FIX (needs FRESH EAS build to take effect):
- REMOVED @react-native-firebase/messaging (yarn remove + app.json plugin). KEPT
  @react-native-firebase/app (applies google-services / Firebase init). google-services also
  covered by android.googleServicesFile.
- frontend/src/lib/notifications.ts: messaging() now a null stub (no RNFB require → no Metro
  break). onForegroundPush + onFcmNotificationOpen rewritten on expo-notifications
  (addNotificationReceivedListener / addNotificationResponseReceivedListener /
  getLastNotificationResponseAsync). Token already had expo-notifications fallback.
- frontend/src/lib/pushBackground.ts: added expo-notifications BACKGROUND task
  (expo-task-manager defineTask "AZO_BG_NOTIF_TASK" + Notifications.registerTaskAsync). It
  fires for DATA-ONLY FCM when backgrounded/locked/killed → _extractFcmData(data) (FCM data
  at data.notification.data per expo RemoteMessageSerializer) → handleRemoteData → Notifee
  displayJobRing (fullScreenAction + FGS) = TRUE auto full-screen ring, no RNFB.
  RNFB setBackgroundMessageHandler block now no-ops (messaging()==null). Notifee FGS +
  onBackgroundEvent (Accept/Reject) kept (Notifee is independent of RNFB).
- installed expo-task-manager@57.0.19.
- backend controllers/booking_controller.py _push_job_request: back to data_only=True
  (data-only REQUIRED to trigger expo background task; notification msg backgrounded → tray
  only, no task), channel azo-job-ring-v3, unique tag job-{id}. notification_routes test-ring
  same (data_only=True, unique tag). "New job available" _notify stays as the loud tray
  fallback if the task can't run (force-stopped app / OEM doze).
VALIDATION: backend syntax+health 200; tsc clean for edited files; Metro bundled all 4018
modules with NO resolution errors (hermesc step fails only in sandbox — env limit, not code).
LIMITATION: still needs a real EAS build + device test to confirm the full-screen ring fires
from killed/locked. If a device force-stops the app (MIUI), even this can't run until reopen —
the loud tray fallback still shows. NEXT: EAS build → deploy backend → test closed/locked →
verify via production people-overview ring_state (ok:true, ctx:bg).

## 2026-06 — Ring SOUND = admin custom upload + looped until action (background/locked)
User: the sound in background was the bundled default, not the admin-uploaded tone
(Integration Center → Alert Sound & Ring, stored as alert_config.custom_sound_url, served
via /api/partner/alert-prefs → ringPrefs customSoundUrl). Foreground already played the
custom tone looped (RealtimeContext.playRing via expo-audio). Background used the Notifee
channel's bundled `job_ring` sound (Android channel sound can't be a remote URL + played
once). FIX (needs fresh EAS build + backend deploy):
- notifications.ts: new SILENT Notifee channel `azo-ring-silent-v1` (HIGH importance, NO
  `sound` prop = plays no channel sound; keeps vibration/lights/bypassDnd). displayJobRing now
  uses this silent channel (removed sound/loopSound) and, after showing the full-screen
  notification, calls new startRingSound() which plays the admin custom tone (from cached
  azo_ring_prefs.customSoundUrl via mediaUrl, else bundled fallback) on LOOP via expo-audio
  createAudioPlayer (+ setAudioModeAsync shouldPlayInBackground:true). cancelJobRing() calls
  stopRingSound() → ring stops on Accept/Reject/dismiss/job_taken. displayJobRing now returns
  early if AppState==="active" (foreground handled by JobRingOverlay+RealtimeContext → no
  double sound).
- backend booking_controller.py: fallback "New job available" _notify channel changed
  azo-job-ring-v3 → azo-ring-silent-v1 (both call sites) so the bundled tone never competes
  with the custom loop.
EDGE: if the phone force-stops the app, neither the task nor expo-audio runs → the silent
fallback notification shows without sound until app reopens (Android limitation).
VALIDATION: backend health 200; tsc clean for edited files (only a pre-existing unrelated
RealtimeContext "ready" SSE type warning). Needs device build to confirm background audio.

## 2026-06 — BREAKTHROUGH: ring handler FIRES; fixed Notifee dataString bug + restored loud sound
Device diagnostic ("Last job ring on this phone") finally captured: App closed/locked =
"NOT shown ✗", error: notifee.displayNotification 'notification.data' value for key
'dataString' is invalid, expected a string value.
MEANING: the expo-notifications BACKGROUND TASK IS FIRING on the killed/locked device (the
architecture works!) and reaches displayJobRing → Notifee, but Notifee rejected the payload
because notification.data must be all-STRING and the FCM data (data.notification.data from
expo's RemoteMessageSerializer) carries a `dataString` key + possibly non-string values.
FIX (frontend, needs new build):
- notifications.ts displayJobRing: build a sanitized `cleanData` (drop `dataString`, coerce
  every value to String) and use it as notification.data. This resolves the exact error.
- REVERTED the earlier silent-channel + expo-audio experiment (it broke sound on the current
  build). Ring notification back on CHANNELS.jobRing (azo-job-ring-v3) with sound:JOB_RING_SOUND
  + loopSound:asFgs → OS/Notifee loops the bundled ring reliably until action (Swiggy/Rapido
  style), stops on accept/reject/timeout/cancelJobRing. No fragile expo-audio.
- backend booking_controller.py: fallback "New job available" channel reverted
  azo-ring-silent-v1 → azo-job-ring-v3 (both sites) so sound plays on the CURRENT build too
  (backend deploy). This undoes the silent-channel regression.
- Production alert_config is EMPTY (no admin custom sound uploaded) → default bundled
  job-ring.wav plays. To use a custom tone reliably it must be BUNDLED as
  assets/sounds/job-ring.wav (Android channel sound can't be a runtime URL); admin upload at
  runtime is not reliable for background.
startRingSound/stopRingSound left defined but unused (harmless). Confidence now HIGH: handler
proven to fire; fixed the exact validation error. Needs new EAS build + backend deploy.
VALIDATION: backend health 200; tsc clean for edited files.

## 2026-06 — Ring polish: admin sound only (no default), no extra push; unlocked full-screen = Android limit
User (after full-screen ring working on LOCK screen): (1) unlocked screen shows heads-up not
full-screen; (2) default tone plays then admin tone — wants admin only; (3) no separate push
alongside the ring.
FIXES (need new EAS build + backend deploy):
- notifications.ts displayJobRing: ring notification back on SILENT channel
  (CHANNELS.jobRingSilent, no channel sound) + startRingSound() plays the ADMIN custom tone
  (azo_ring_prefs.customSoundUrl via expo-audio, looped) — the ONLY sound, so no bundled
  "default" plays first. cancelJobRing()→stopRingSound(). Kept the dataString sanitize fix.
- backend booking_controller.py dispatch: REMOVED the per-partner `_notify("New job available")`
  push — the full-screen ring IS the alert now (no extra heads-up/push). Kept rt.emit_user
  (SSE foreground) + _push_job_request (data-only ring → expo task → Notifee full-screen).
- Confirmed expo-notifications does NOT present data-only messages in background
  (ExpoHandlingDelegate.shouldPresent()=false when title+body empty) → no expo default push.
- Sound source = azo_ring_prefs.customSoundUrl (same as foreground RealtimeContext.playRing,
  which user confirmed works). Read directly from AsyncStorage so it works in headless bg.
ISSUE #1 (unlocked full-screen) — Android LIMITATION: fullScreenIntent auto-launches the
full activity only when the device is LOCKED/screen-off; when unlocked & interactive Android
shows a heads-up (by design, system-controlled). Guaranteed full-screen-over-apps when
unlocked requires SYSTEM_ALERT_WINDOW ("Display over other apps") + a native overlay activity
(Rapido/Truecaller style) — a separate native feature, not yet built. Offered to user.
VALIDATION: backend health 200; tsc clean for edited files.

## 2026-06 — Unlocked full-screen ring (Rapido/Truecaller style, NO custom native module)
notifee fullScreenAction only auto-launches on LOCK screen; unlocked = heads-up (confirmed).
Solution WITHOUT a native module: JobRingOverlay already polls /bookings/partner/ring-pending
and shows the full-screen ring whenever the app becomes ACTIVE (AppState listener). So we just
bring the app to the FOREGROUND when a ring arrives; the overlay does the rest.
CHANGES (need new EAS build; user MUST grant "Display over other apps"):
- plugins/withJobRingAndroid.js: added android.permission.SYSTEM_ALERT_WINDOW (allows the
  background activity launch even when unlocked / in another app). MainActivity already has
  showWhenLocked/turnScreenOn/showOnLockScreen + launchMode singleTask.
- src/lib/pushBackground.ts handleRemoteData: on job_request in background, after displayJobRing,
  if AppState!=="active" → Linking.openURL(Linking.createURL("/")) to foreground the app →
  JobRingOverlay's AppState-active poll shows the full-screen ring (unlocked too).
- src/lib/notifications.ts: added PermKey "overlay" + overlayState() + requestOverlayPermission()
  (IntentLauncher ACTION_MANAGE_OVERLAY_PERMISSION, package: data). Added to allPermissionStates.
- app/onboarding/notifications.tsx: added "Display Over Other Apps" card + runOne/handleAll wiring.
- src/components/partner/home/AlertsPanel.tsx: added "Full-Screen on Unlocked" row (Allow/Open).
Scheme = azoapppartner (app.json). VALIDATION: tsc clean for all edited files.
LIMITATION: if the user doesn't grant "Display over other apps", unlocked stays as heads-up
(locked still full-screen). Background-launch via Linking relies on that permission (BAL
exemption) — needs device confirmation.
Backend from prior round (silent ring channel + removed "New job available" push) still needs
deploy for the sound/no-extra-push behaviour.

## 2026-06 — Ring sound single-source + reschedule ring + Active Job UI + date/time picker
1) SOUND: removed startRingSound() from displayJobRing. The app is always brought to the
   foreground on a ring, so RealtimeContext.playRing (JobRingOverlay) is the SINGLE sound
   source — no more "default plays first then admin" overlap/restart. notifications.ts.
2) CUSTOMER RESCHEDULE → PARTNER FULL-SCREEN RING: backend request_reschedule now also sends
   a data-only ring (push_dispatch, type "reschedule_request", silent channel, tag resched-<id>)
   to the partner when the requester is the customer → expo bg task → Notifee full-screen ring +
   brings app to front. pushBackground handleRemoteData handles "reschedule_request" like
   job_request. displayJobRing shows reschedule title/subtitle/body ("Reschedule request",
   "New: <date> · <time>") and preserves cleanData.type (was hard-coded job_request). On
   foreground the Active Job screen's existing pending-reschedule card handles accept/reject.
3) ACTIVE JOB UI (app/(partner)/active.tsx): removed "Share Location" button; Reject Job +
   Request Reschedule now flex:1 (clean 2-up row). shareLocation/sharing left as dead code.
4) RESCHEDULE PICKER: installed @react-native-community/datetimepicker@9.1.0 (config plugin
   added). Replaced the manual "YYYY-MM-DD HH:MM" TextInput with a native date→time picker:
   minimumDate=now (past disabled, future only), minuteInterval=30 (matches slot grid),
   12-hour. Sends local wall-clock YYYY-MM-DDTHH:MM (matches booking slot validation).
NEEDS new EAS build (native: datetimepicker + prior overlay/permission changes) + backend
deploy. VALIDATION: backend health 200; tsc clean for edited files.

## 2026-06 (2) — Faster dispatch + reschedule full-screen ring + calendar picker + login redesign
1) DISPATCH SPEED (Task 1): DISPATCH_WAVE_SIZE 3 → 50 in booking_controller.py so wave-1
   rings ALL online+free eligible partners at once (no 30s-per-wave staggering). Still
   admin-tunable via business_config.dispatch_wave_size. NOTE: cold-start SPLASH before the
   ring is inherent to launching the RN app — only a native overlay window removes it (flagged).
2) RESCHEDULE FULL-SCREEN RING (Task 2): JobRingOverlay now presents a full-screen amber ring
   for reschedule_request (SSE + foreground FCM). Shows requester name, service, code, old→new
   time; Accept → /reschedule/respond {accept}, Reject → {reject}. Reschedule items skip /seen,
   bypass snooze (force), and are protected from the 15s ring-pending prune (_resched flag).
   Backend already sends the data-only ring + SSE (prev turn). pushBackground handles it (locked).
3) RESCHEDULE CALENDAR PICKER (Task 3): new src/components/CalendarSlotPicker.tsx — month grid
   (past dates disabled, prev-month disabled at current month) + 30-min time-slot chips
   (8:00 AM–7:30 PM, past slots disabled for today) + "Scheduled for …" summary, matching the
   booking screenshot. Replaced the native DateTimePicker in active.tsx reschedule modal
   (wrapped in a maxHeight ScrollView). datetimepicker dep left installed but unused.
4) LOGIN REDESIGN + BUG FIX (Task 4, app/(auth)/login.tsx):
   - FIX: entering an unknown mobile no longer auto-creates a CUSTOMER. verify-otp now uses
     create_if_new:false; new_user + no role → "No Partner/Merchant account found" step with
     full-width Register buttons; role chosen → name step → create as partner/merchant.
     Verified via curl (new_user:true, no token, no account created).
   - Register buttons are full-width, one per line (Register as Partner / Register as Merchant);
     demo logins likewise full-width one per line.
   - Mobile input moved OUT of the white card (open/free layout).
   - Dynamic heading: "Login to Get Started" vs "Create your Partner/Merchant account"; subtitle
     changes per step (phone/otp/name/noaccount).
   - Hero (man) image enlarged (210×262) and anchored to the bottom of the hero card.
VALIDATION: backend health 200; account-creation curl pass; tsc + eslint 0 errors on all edited
files. All UI changes need a new EAS build to verify on device.
