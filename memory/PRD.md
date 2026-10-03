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

## Feature — Subscription booked like a normal service + maid broadcast (2026-06)
Goal (user, Hinglish): Maid subscription ka booking flow bilkul normal service jaisa; backend subscription hi rahe; payment ke baad us category ke SABHI eligible maids ko new-job ring jaaye (first-accept-wins), jaise normal booking me hota hai.

Implemented:
- Removed leftover "Pay upfront"/"upfront" wording from the DB service description (svc-maid-fulltime), seed_maid_subscription.py, and all My-Subscriptions cards (web + Customer app "Paid upfront" -> "Total"/"Amount paid").
- WEB: subscription now flows through the normal cart + /book checkout.
  - CartContext.addSubscription(svc, plan) -> single subscription cart line (booked alone; addService clears a sub line and vice-versa).
  - Subscriptions.jsx SubscriptionPlansPanel: plan picker + "Book Now" -> addSubscription + navigate('/book') (removed the old inline date/time/address dialog).
  - Checkout.jsx: if cart is a single subscription line -> renders new SubscriptionCheckout.jsx (plan summary, start date, preferred time, saved-address picker, Confirm & Pay -> POST /subscriptions -> /subscriptions/{id}/pay/order -> openCheckout -> verify/confirm). cart-quote effect skipped for subscription carts. Normal booking flow untouched. Verified 100% by testing agent (iteration_162).
- CUSTOMER APP: mirrored — CartContext.addSubscription; service/[id].tsx SubscriptionPanel -> addSubscription + push('/(site)/book'); book.tsx renders src/components/site/SubscriptionCheckout.tsx; PaymentWebViewHost + payments.ts extended with purpose 'subscription' (verify -> /subscriptions/{id}/pay/verify, confirm -> /subscriptions/{id}/pay/confirm) + openPreparedOrder helper.
- BACKEND (subscription_controller.py): on payment success (_activate) -> _broadcast_subscription(sub): rings EVERY eligible category/skill maid (SSE job_request + data-only FCM full-screen ring + in-app link), marks dispatch_status='searching', records offered_partner_ids. New endpoints: GET /subscriptions/partner/ring-pending, POST /subscriptions/{id}/accept (first-accept-wins, atomic; others get job_taken; customer gets 'Maid assigned'). Admin manual assign still works as fallback. Verified via script + HTTP (broadcast -> ring-pending -> accept -> others cleared).
- PARTNER APP (JobRingOverlay.tsx): reuses the existing incoming-job ring for kind='subscription' rings — Accept -> /subscriptions/{id}/accept then routes to /(partner)/partner/subscriptions; Reject just dismisses locally; subscription ring-pending added to the 6s reliability poll.

NOT verifiable in preview: native full-screen lock-screen rings (Notifee/@react-native-firebase) require an EAS build + uploaded google-services.json. Payment gateway is not configured in this env, so Confirm & Pay surfaces a graceful "gateway not configured" toast (no crash) — same as normal bookings.

## Update — Subscription fully merged into the normal /book checkout (2026-06)
User asked: booking a Maid subscription must look/run EXACTLY like a normal service booking (same multi-step /book checkout with calendar+time-SLOT picker, address, review, pay), with a green "Recurring Subscription" badge on ALL plans (Daily/Weekly/Monthly), web + app both. Backend stays subscription (on payment → broadcast to category maids, first-accept-wins).

Implemented (replaces the earlier standalone SubscriptionCheckout page, now DELETED on both platforms):
- WEB Checkout.jsx: detects a single subscription cart line (isSub). Reuses the SAME stepper/steps; the "Details" (tiers/add-ons) step is dropped for subscriptions (activeSteps). Key-based step rendering + canNext/next. Flat pricing injected into cart-quote effect (no server quote). placeSubscription() → POST /subscriptions → /subscriptions/{id}/pay/order → openCheckout (verify/confirm). New shared SubscriptionHeader badge (green pill + name + "Monthly plan · 26 working days · 30-day period · Sun off"). Coupon + emergency hidden for subs; success screen + CTA point to /account?tab=subscriptions.
- CUSTOMER app book.tsx + CheckoutUi.tsx + CheckoutSteps.tsx: same merge — Stepper accepts steps; StepServices/StepSchedule/StepSummary/StepReview are isSub-aware (badge, no coupon, no emergency); placeSubscription() uses openPreparedOrder(purpose 'subscription'); PaymentWebViewHost already routes subscription verify/confirm.
- Service detail already shows the subscription-badge; "Book Now" → addSubscription → /book (home 'Book Now' → service detail → plan → Book Now, i.e. normal flow).

Verification: WEB tested by testing agent iteration_163 → 100% (10/10, incl. normal-booking regression: full 6 steps + coupon preserved). Customer app: tsc + eslint clean (native pay/lock-screen ring verifiable only on EAS build). Preview has no payment gateway → final pay surfaces a graceful toast (no crash).

## Fix — Subscription pricing now uses the SAME engine as normal booking (GST + charges) (2026-06)
User feedback: subscription par GST/service charge nahi aa raha tha; "pura same to same normal booking ki tarah karo, sirf ek chhoti condition lgao ki agar Recurring Subscription service hai to subscription ki tarah kaam kare". Root cause: earlier the checkout injected a FLAT price for subscriptions (bypassing the pricing engine) → no GST/charges.
Fix (web + Customer app + backend):
- toReqItem() now maps a subscription cart line to a CUSTOM line (custom_price = plan price) so it is priced by the exact same /bookings/cart-quote engine → GST, service/visiting/surge charges all computed identically. Flat-injection removed. The existing GST rows (totals.gst>0 → "Est. Govt. Taxes") now render for subs.
- backend subscription_controller.create_subscription computes customer total via booking_controller.cart_quote (same engine) with the resolved address; stores gst_pct/gst_amount/total_payable/customer_pricing. pay_order + payment invoice now charge/record total_payable (GST on top). Maid earning still on plan gross (allocation unchanged) — GST collected on top for govt.
- Only difference from a normal booking = placement: an isSub cart creates a subscription (charging the quoted total) instead of a booking; then backend behaves as subscription (broadcast to category maids, first-accept-wins, attendance/settlement).
Verified: cart_quote curl (base 2200 → GST 396 no-addr / with saved address taxable 2530 → GST 455.4 → total 2985.4); create_subscription stores total_payable=2985.4; testing agent iteration_164 = 100% (6/6) — GST line + higher total shown in Price details, Your order box and Confirm; display == charged total. Customer app mirrors same code path (tsc+eslint clean; native pay verifiable on EAS build). Preview has no gateway → graceful toast on pay.

## Removed legacy "Pricing Rules" admin section (2026-06)
Context: A legacy 15% "Patna Peak Surge" rule lived in the `pricing_rules` collection (read by PricingEngine._active_surge_rules alongside surge_rules) and was silently inflating every Patna quote (₹2,200 → ₹2,530 taxable). User deleted the rule via the admin Pricing Rules trash button, then asked to remove the whole feature.
Change: Removed the `{active === "pricing" && <S.CmsManager endpoint="collection/pricing_rules" .../>}` render block and the `pricing: "Pricing Rules"` TITLES label from web_panel/src/pages/admin/AdminDashboard.jsx. The section had no sidebar nav entry (reachable only via ?tab=pricing). Surge Rules section (surge_rules collection) is untouched and remains the supported way to manage surge.
Verified: pricing_rules & surge_rules collections both 0 docs; webpack compiled 0 errors/24 std warnings; screenshot of /admin?tab=pricing confirms no "Add Pricing Rule" form / no Pricing Rules table.

## Customer app: removed Wallet "Scratch Cards & Cashback" panel + fixed Additional-work online payment (2026-06)
1) Wallet screen (Customer/app/(customer)/wallet.tsx): removed <ScratchCardsPanel/> block + its import and the now-unused useRouter/router. Scratch cards still available on the Rewards screen; only the Wallet-top panel was dropped per user request. tsc clean.
2) Additional-work "Pay now" not redirecting to the active gateway — ROOT CAUSE: POST /payments/order (payment_controller.create_order) had no `purpose == "additional"` branch, so it fell into the wallet `else` with amount=None → "Invalid amount" (400), gateway never opened. FIX (payment_controller.py):
   - create_order: added `additional` branch — validates booking ownership + additional.status!=paid, amt = additional.total, receipt "ADDL-<code>"; links a `pay_addl_order_id` snapshot to the booking.
   - _apply (SDK verify path /payments/verify): added `additional` branch → calls booking_controller.pay_additional(user, booking_id, method="online") to mark additional paid + notify partner.
   - confirm_return (hosted-redirect path /payments/confirm-return): matches order by `pay_addl_order_id` first and applies the additional payment (so Cashfree/PayU/Easebuzz/Juspay returns work too).
   Verified via curl: purpose "additional" now reaches the gateway (returns the SAME "Razorpay TEST MODE not fully configured" as a normal booking in preview — i.e. identical path). On a properly configured gateway it redirects exactly like a normal booking. NOTE: SDK verify + hosted-return apply-paths could not be e2e tested in preview (no live gateway); logic mirrors the wallet-method pay_additional which is proven.

## Customer app: "Alert Health Check" diagnostics screen (2026-06)
Partner app already had a full permission/diagnostics screen (app/(partner)/partner/permissions.tsx). Added the equivalent for the CUSTOMER app.
- NEW screen Customer/app/(customer)/alerts.tsx — 3 permission cards (Notifications [required], Full-Screen Alert, Run in Background/battery [required]) each with live status + Allow/Open Settings, a critical-missing warning banner, and a "Push & Ring Diagnostics" card (server push configured?, this phone registered?) with real self-tests: "Test Alert Ring" (kind=ring) + "Test Notification" (kind=push) via /notifications/test-self. Renders inside CustomerShell (Slot) like other customer screens; uses customer theme (useTheme→c, PRIMARY) + lucide icons.
- Customer/src/lib/notifications.ts: added BATTERY_ASKED_KEY, exported PermKey/PermState types + notifState()/fullScreenState()/batteryState()/allAlertStates(); requestBatteryExemption now marks BATTERY_ASKED_KEY so the card turns green after the flow (mirrors Partner).
- Customer/src/components/customer/nav.ts: added `alerts` NavKey + NAV item (BellRing icon, route /(customer)/alerts) → appears in the "More" sheet.
- Backend routes/notification_routes.py test_self: kind="ring" now branches by role — non-partner (customer) gets a call-style `booking_confirmed` SSE test event + data-only push with link /(customer)/orders (partner path unchanged) so the customer's CustomerAlertOverlay/full-screen ring is genuinely exercised.
Verified: backend curl as the customer — push-config/my-devices/test-self(ring→ok:true,sse:true / push→correct not_configured message in preview). Customer app tsc + eslint clean (0 errors). NOTE: the native screen itself can't be rendered in the web preview (Notifee/RNFB native modules) — visual + on-device permission flows must be verified on an EAS build.

## Partner app: Work Start Wizard fixes — correct-service + reliable OTP flow (2026-06)
Reported bugs: (1) wrong/mixed service wizard opening with multiple active bookings, (2) after Start OTP the job didn't mark "started" (looked like "Work Not Started"), (3) Complete OTP didn't mark "completed" immediately.
RCA: BACKEND is correct (verified via curl: assigned→start-otp→started→complete→completed, per-id service_name correct, both responses return id+status). Bugs were FRONTEND state/timing in Customer... no — in frontend/app/(partner)/partner/job/[id].tsx:
- Wizard local step/otp state could carry over when the [id] screen is reused for a different booking, and a stale cached booking could briefly render → wrong service. Verify relied on a non-awaited refetch so the UI lagged behind server truth (tap Complete while cache still "assigned" → "Job not started yet").
Fixes (frontend only):
- Reset step/otp/busy/progress on `id` change (useEffect [id]).
- Hard guard: never render unless `String(b.id) === String(id)` (else spinner) → wrong-service wizard can't show.
- verify(): now uses the mutation's returned booking (contains id+new status) to `qc.setQueryData` merge, then optimistically `setStep(3)` (start) / `setStep(4)` (complete) so the next step / Done screen shows instantly; still refetch in background for full enrichment.
- Render + footer treat `step >= 4` as done (instant "Job completed" screen).
Verified: backend full flow via curl (2 bookings, distinct services + OTPs) — per-service detail correct, start→started, complete→completed, responses include id. Frontend tsc + eslint clean (0 errors). NOTE: the native wizard UI itself can't run in web preview (Notifee/RNFB native modules) — the on-device tap-through must be verified on an EAS build.

## App Update & Maintenance Mode — Admin + backend + both mobile apps (2026-06)
Goal: Admin manages, per app (customer/partner independently), APK/version/force-update/maintenance; apps gate on launch (maintenance > mandatory update); APK is self-hosted (S3/object storage), NEVER Play Store.
Backend (routes/app_management_routes.py, mounted in server.py; collection `app_config` keyed by platform):
- Admin (require_role admin): GET /api/app-mgmt/admin/config (both), PUT /api/app-mgmt/admin/config/{platform} (version_code[int], latest_version, playstore_url, update_enabled, force_update, release_notes, maintenance_* incl. image/icon as data-URL → materialized to S3), resumable APK upload: POST .../apk/{platform}/chunk (raw body, X-Upload-Id/X-Chunk-Index) + POST .../apk/{platform}/finish (assembles, validates via pyaxmlparser that package == app.azoapp.{platform} else 400 "does not belong to the … App", stores in S3 via storage_service._put, auto-fills version_code/name).
- Public: GET /api/app-mgmt/config/{platform} → app-facing config for launch gate.
- Added deps: pyaxmlparser + lxml (requirements.txt frozen).
Web panel (src/pages/admin/AppManagement.jsx + AdminDashboard nav "App Management" under System, ?tab=app_mgmt): Customer/Partner tabs, Update Settings (version name/code, Play Store link, chunked APK upload w/ live % progress + current-APK info, Update Enabled & Force Update switches, release notes), Maintenance Mode (toggle → title/description/image/icon uploads). Screenshot-verified.
Mobile (Customer/src/components/AppUpdateGate.tsx + frontend[partner]/src/components/AppUpdateGate.tsx, mounted in each app/_layout.tsx): on launch reads /app-mgmt/config/{platform}; priority maintenance > update. Maintenance → blocking full-screen (admin title/image/icon/description + Retry). Update → blocking when force_update (else "Later") popup with release notes; "Update Now" downloads the admin APK via expo-file-system createDownloadResumable (live %/MB progress + resume on drop), then installs via expo-intent-launcher INSTALL_PACKAGE (content:// URI). Version compare uses expo-application nativeBuildVersion (Android versionCode, int) vs admin version_code. Web/Expo-Go: native modules lazy-required → gate no-ops for update (installedVersionCode=MAX); maintenance still shows. Added deps: expo-application (both apps) + expo-file-system (Customer).
Verified: backend admin GET/PUT + public config via curl; chunked upload assembles + rejects non-APK ("AndroidManifest.xml missing"); admin page screenshot; both apps tsc + eslint clean (0 errors). NOTE: real-APK wrong-package rejection, on-device download/resume/auto-install, and versionCode gate are verifiable ONLY on an EAS build (not web preview). Play Store link is reference-only — download source is always the admin-uploaded S3 APK.

## Admin Live Logs & Monitoring System — MVP (2026-06)
Stack-adapted (FastAPI + supervisor + MongoDB; NOT Laravel/PM2). Production-safe, low-overhead.
Backend:
- services/logbus.py: structured async logger. record() is non-blocking (in-mem asyncio.Queue), a single background _flusher batches insert_many (~1/sec, ≤200 docs) → no per-request DB write. Live fan-out to realtime broker topic "logs" for SSE. TTL index on ts (7-day retention → auto-rotation). Sensitive keys (password/otp/token/card/...) redacted. Helpers: log_request(), log_client() (mobile crash), new_request_id().
- middleware/log_middleware.py (raw ASGI, added after PerfMiddleware): assigns/echoes X-Request-ID, times every /api request, logs level INFO/WARNING(4xx|slow≥2s)/ERROR(5xx|exception w/ file+line+stack). Decodes JWT for user_id. Skips /api/admin/logs*, streams.
- routes/logs_routes.py: POST /api/logs/client (mobile ingest, optional auth); ADMIN GET /api/admin/logs (filter app/level/service/status/q/rng + before-cursor), /summary (level + errors_by_app counters), /health (psutil cpu/ram/disk + supervisor process table via supervisorctl + memory via psutil + db ping), /export?fmt=txt|csv|json, DELETE /api/admin/logs (clear stored), GET /admin/logs/stream (SSE, token query, app/level filter), GET /admin/logs/{id}. user_id masked in all responses.
- server.py: startup calls logbus.start(); LogMiddleware added. Deps added: psutil (requirements.txt frozen).
Web panel: src/pages/admin/LogsMonitor.jsx + AdminDashboard nav "Logs & Monitoring" (System group, ?tab=logs_monitor). Summary cards, Server Health (CPU/RAM/Disk bars + service dots + process table), filter chips (app/level/status/range), search, Live SSE stream (EventSource) with Pause/Resume/Auto-scroll/Clear-Screen, TXT/CSV/JSON export (blob download), Delete Stored (confirm), severity-coloured rows, click → detail drawer (all fields + stack trace). Clear Screen = UI only; Delete Stored = server.
Mobile: Customer/src/lib/crashReporter.ts + frontend[partner]/src/lib/crashReporter.ts → initCrashReporter() sets ErrorUtils global handler + reportError() from each ErrorBoundary.componentDidCatch → POST /api/logs/client (app/version/versionCode/device/os/screen/stack), no-op on web, never sends secrets. Wired in both app/_layout.tsx.
Verified: backend list/summary/health/detail/export(csv,json)/filter/search/client-ingest + redaction (password/otp NOT stored) via curl; web Logs page LIVE via screenshot (real-time stream + health + process table). Both apps tsc + eslint clean. NOTE: mobile crash reporter runs only on device/EAS build (web preview no-op). Deferred (backlog): email/WhatsApp/Telegram critical alerts, admin-configurable retention UI, per-permission granularity (currently admin-gated; delete = admin).

## Fix: GitHub Actions "Deploy to EC2" Docker build failure (2026-06)
Symptom: deploy.yml Docker build step exit 1 (~53s) after push. RCA: an earlier `pip freeze > requirements.txt` (during App Update + Logs features) accidentally added `emergentintegrations==0.2.1` to backend/requirements.txt. That package is NOT on PyPI — it installs ONLY from the custom --extra-index-url, which the Dockerfile already does in a SEPARATE step. So `pip install -r requirements.txt` in the image build failed. Last known-good requirements (e11e402) had no such line.
Fix: removed the single `emergentintegrations==0.2.1` line from backend/requirements.txt (psutil/pyaxmlparser/lxml — the legitimately-needed new deps — kept; litellm URL line was pre-existing and fine). Dockerfile's separate `pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/` still provides it in the image.
Verified: testing_agent iter165 — 14/14 backend tests pass, backend boots, emergentintegrations still importable at runtime, ai/chat + app-mgmt + logs + admin regression all green; grep confirms no Python source imports emergentintegrations directly (LLM path uses litellm). Note (non-blocking, pre-existing): JWT_SECRET in backend/.env is short (<32 bytes) — HS256 InsecureKeyLength warning.

## Fix: EAS build failures (Partner bundle + Customer prebuild) (2026-06)
Partner (azoapp-partner) "Bundle JavaScript" failed: `SyntaxError src/lib/crashReporter.ts: Invalid call at line 7: require(name)`. Metro's production bundler (export:embed --dev false) forbids dynamic `require(variable)`; only string-literal require() is allowed. My lazy `req(name)` helper in crashReporter.ts + AppUpdateGate.tsx (BOTH apps) used a variable → build fail.
Fix: replaced the generic `req(name)` with explicit literal-string helpers — expoApplication()/expoFileSystem()/expoIntentLauncher() (each `try{require("expo-...")}catch{}`). Files: Customer & frontend(partner) src/lib/crashReporter.ts + src/components/AppUpdateGate.tsx. tsc + eslint 0 errors.
Customer (azoapp-customer) "Prebuild" failed: `google-services.json missing` (ENOENT). Added the user-provided Customer google-services.json to /app/Customer/google-services.json. Its Firebase clients are ['app.azoapp.homeservice','app.azoapp.partner'] (project azo-project-9f857) — NO app.azoapp.customer client. Per user confirmation, changed the Customer app's Android package from app.azoapp.customer → app.azoapp.homeservice to match the Firebase json (else the Google-Services gradle plugin would fail on missing package). Updated: Customer/app.json android.package, Customer AppUpdateGate EXPECTED_PACKAGE, backend app_management_routes EXPECTED_PACKAGE["customer"], Customer notifications.ts battery-exemption fallback pkg. Partner package (app.azoapp.partner) left unchanged (user said it's correct). iOS bundleIdentifier left as-is (no iOS build in play). google-services.json is NOT gitignored → will be uploaded by EAS once the user does "Save to Github".
Verified: package↔json MATCH ✓, app.json valid, backend app-mgmt healthy (apk_package default now homeservice), both apps tsc+eslint 0 errors, no dynamic require remains. NOTE: actual EAS build success can only be confirmed by re-running both builds after "Save to Github".

## Partner google-services.json updated + verified (2026-06)
User re-uploaded the partner google-services.json (project azo-project-9f857). Replaced /app/frontend/google-services.json with it. Diff vs old: the new file ADDS the Android OAuth clients (client_type 1, with android_info.certificate_hash SHA-1) for BOTH app.azoapp.homeservice (9ffffa1a…) and app.azoapp.partner (dd248b2a…) — the old partner file lacked these (needed for Google Sign-In/OAuth on Android). Core FCM fields (project_number 960503871336, app_ids, api_key) unchanged. Partner package app.azoapp.partner matches app.json + is present in json ✓. Customer/google-services.json already had both OAuth certs (no change needed). Both apps' google-services.json now complete & package-matched.
Verified: testing_agent iter166 — 10/10 backend regression pass (customer public apk_package=app.azoapp.homeservice, partner=app.azoapp.partner, admin GET/PUT, Live Logs, admin login all green; flags reset). NOTE: google-services.json is a native EAS-build asset — actual FCM/OAuth on-device behaviour only verifiable after an EAS build + device test. Backlog (from review): add a Pydantic model to app-mgmt PUT to guard field types/keys.

## Session (2026-06) — Verify 5 reported tasks + env recovery
Pod had been reset: ALL `.env` files were empty → backend crashed (`KeyError: MONGO_URL`) and Mongo was empty. Recreated `backend/.env` (MONGO_URL, DB_NAME=azoapp, JWT_SECRET, CORS_ORIGINS), `web_panel/.env` (REACT_APP_BACKEND_URL=preview), `Customer/.env` + `frontend/.env` (EXPO_PUBLIC_BACKEND_URL=preview). Backend now boots + seeds (16 services, demo accounts).

Verification of the 5 tasks (all found ALREADY IMPLEMENTED in code by a prior session):
1. Booking login inline — Checkout/`book.tsx` "Your Info" step renders OTP inline (StepContact/OtpInline); no dashboard bounce. Verified: `/auth/verify-otp` returns token in-flow.
2. Partner reg-fee — `_record_reg_fee_txn` writes a `payment_transactions` doc (purpose=partner_registration_fee); admin **Registration Fee** menu (`RegistrationFeeReport.jsx`) with status/search/date/gateway/mode filters reads it; Person360 shows Reg. Fee Paid/Unpaid. Verified end-to-end via API (report summary + txn row + partner overview reg_fee.paid).
3. Add-on selector removed from service detail (web `ServiceDetail.jsx` + mobile `service/[id].tsx`) — only qty/tier remain; add-ons live in the checkout "details" step.
4. Integration keys persist — stored in `settings.integrations` (DB), read fresh each call; FCM key persisted in `db.app_secrets` (survives redeploy). Verified save→read-back of an integration key.
5. Image loading — backend compresses+thumbnails to WebP; web uses lazy `SmartImage`. ENHANCED mobile: added `cachePolicy="memory-disk"`/`transition`/`recyclingKey`/`priority` to Customer home category & popular-service images (`HomeView.tsx`) and AppHome hero/promo/deal banners (`apphome/Blocks.tsx`).

Note: the user's deployed (EC2) app likely predates this code → a redeploy is needed to see these fixes live. Web `/service/:id` deep-link shows a brief spinner in preview = dev-server cold-compiling the lazy chunk (not a product bug).

## Session cont. — Registration Fee report: custom calendar + pagination
- Swapped the two native `<input type=date>` (dd/mm/yyyy) in `RegistrationFeeReport.jsx` for the shared `@/components/ui/PremiumDatePicker` (same calendar used in TransactionsHub / people / starter-kit etc.) → consistent date-range UX.
- Added client-side pagination (PAGE_SIZE 10) to BOTH the Paid and Unpaid tables via a small `Pager` (prev/next + "x–y of N"), auto-resets to page 1 on any filter change. Headers still show full totals. Webpack compiled 0 errors.

---
## Session (2026-06) — 4 reported tasks

### 1. Customer full-screen alert on locked/closed/background + admin sound (MOST IMPORTANT)
Root cause (see push_notification_rootcause.md): the Customer app relied ONLY on FCM for background alerts, but FCM getToken() is blocked by an EXTERNAL Google Cloud API-key restriction, so no background full-screen alert ever fired (only worked in-app via SSE). The Partner app works because it also has an FCM-INDEPENDENT foreground-service SSE listener.
Fix (Customer app only — Partner untouched): ported the Partner's proven mechanism.
- New `Customer/src/lib/backgroundRing.ts`: foreground-service SSE listener started when app backgrounds; rings ONLY for `reschedule_request` (partner-initiated) + `booking_confirmed` (partner assigned).
- `notifications.ts`: added admin custom ring tone (`startRingSound/stopRingSound/_loadRingSource`), `syncAlertConfig()` (fetches admin sound), `online` low-importance channel.
- `pushBackground.ts`: registers Notifee foreground service + plays admin tone on FCM delivery.
- `RealtimeContext.tsx`: starts/stops the bg listener on background/active; plays admin tone; syncs alert-config on login.
- Backend: new `GET /api/notifications/alert-config` returns admin alert sound/volume (reuses partner `admin_alert_config`).
NOTE: native full-screen push behaviour is only verifiable on an EAS device build.

### 2. "Instant / Emergency" → "Quick Services"
Replaced all user-facing occurrences in Customer app (CheckoutSteps/CheckoutUi) and web_panel (Checkout.jsx, adminTemplateIntegration.jsx). Underlying schedule_type "emergency" unchanged.

### 3. Faster load on slow networks (Customer + Partner)
Tuned React Query defaults in both `app/_layout.tsx`: staleTime 2m, gcTime 24h, retry 1 with capped retryDelay (fail fast instead of long backoff), refetchOnWindowFocus off → instant cached screens + snappier failures on slow networks.

### 4. Maintenance-mode logo cropped (Customer)
`AppUpdateGate.tsx`: maintenance image changed from contentFit="cover" (cropped the wide logo) to "contain" with a wider box; icon fallback also "contain".

---
## Session (2026-06) — App Management "Failed to fetch" + package names
ROOT CAUSE: pod reset lost `/app/backend/.env` (→ MONGO_URL KeyError, backend crash-loop → every /api = 502 → panel "Failed to fetch") and `web_panel/node_modules`.
FIX (verified 100% by testing agent, iteration_168):
- Restored `/app/backend/.env` (MONGO_URL local, DB_NAME=azoapp_database, JWT_SECRET, CACHE_ENCRYPTION_KEY, CORS, REACT_APP_BACKEND_URL). Startup seed() rebuilt admin + demo data.
- Reinstalled web_panel deps; admin panel serving on :3000.
- APK upload path already targets S3 via storage_service (Integration Center AWS config) with local fallback; verified chunk=200, finish=400-validation (reachable, no more Failed to fetch).
- Panel Customer APK label corrected app.azoapp.customer → app.azoapp.homeservice (AppManagement.jsx). app.json packages already correct (customer=app.azoapp.homeservice, partner=app.azoapp.partner) — no change needed.
DATA NOTE: DB reset wiped Integration Center settings incl. AWS S3 — user must re-enter AWS S3 config for uploads to land in S3 (else local disk).

---
## Session (2026-06) — App Management: Delete APK button
Added a Delete button (Customer + Partner) so admins can remove an uploaded APK — this also deletes the large local/S3 file so the GitHub push is not blocked by the >100MB APK.
- Backend: DELETE /api/app-mgmt/admin/apk/{platform} → storage_service.delete_stored() removes the file (local /api/media/file or S3), clears apk_url/apk_size/apk_package/apk_version_name/apk_key, sets update_enabled=false. Upload now also stores apk_key.
- storage_service.delete_stored(ref): deletes by stored URL (local/S3 proxy/public-base) or bare name.
- Panel (AppManagement.jsx): red trash Delete button shown when apk_url set (data-testid apk-delete-btn-customer/partner), window.confirm, refresh on success.
- Verified 100% by testing agent (iteration_169): delete works + persists for both platforms.

---
## Session (2026-06) — Customer app: All Services card image too tall
Fixed image height on the "All Services" (Services tab) screen. services.tsx ServiceCard image container used aspectRatio 3/4 (~220px tall); changed to fixed height:120 to match the category detail screen (category/[id].tsx line 61). Native Expo app — verify on EAS build.

---
## Session (2026-06) — Home service cards image height aligned to 120
For app-wide consistency, set service-card image height to 120:
- HomeSections.tsx ServiceCard (Popular/Trending, width 240): 170 → 120.
- Blocks.tsx ServiceTile (non-compact): 116 → 120.
Now Home, All Services (services.tsx) and Category ([id].tsx) all use height 120. Native Expo — verify on build.

## Feature — Category-wise Commission & Refund (2026-06)
Ask (Hindi): Integration Center ke Commission & Refund Settings ko category-wise banao; alag admin menu; har dynamic category ka apna Partner/Platform/Merchant·Partner Referral/Merchant·Customer % + Cancellation & Refund (customer refund / partner cancellation).
User choices: standalone sidebar menu over existing catalog categories; rate mandatory per category (unconfigured = "Rate required"; backend falls back to global settings.commission); cancellation reasons stay global in the new menu; old bookings unaffected.
Implemented:
- Backend: `services/category_commission_service.py` (collection `category_commissions`, validate both splits = 100, resolve/settings_for_category), `routes/category_commission_routes.py` (GET /admin/category-commissions, PUT /{category_id}, POST /bulk). `_build_booking` snapshots category rates into `commission_config.commission` (source category|global) → completion split + cancellation refund use it. invoice_service uses booking snapshot; subscriptions use category rates; deleting a category deletes its rate.
- Admin web: `CategoryCommissions.jsx` (stats, required banner, search/filter, per-category rows, edit modal with live split preview + "Also apply to", global Cancellation Reasons). Nav key `category_commission` (module finance). Commission card/modal removed from Integration Center.
- Tested: iteration_170 — backend 12/12, frontend 100%.
Env: recreated backend/.env, web_panel/.env, frontend/.env, Customer/.env; installed backend reqs + web_panel node_modules.
Backlog: show category rates to partners in job offer earning preview; audit log for rate changes; require rate when creating a category.

## Update — Premium redesign of Commission & Refund + global admin density (2026-06)
- Page split into `pages/admin/commission/` (HeaderStats, CategoryTable, CommissionDrawer (right Sheet; single/bulk/platform-default modes, live ₹ calc), PolicySection, CancellationReasons (table, status toggle, drag reorder, add/edit modal, delete confirm), SplitBar, shared).
- Reasons now also stored as `settings.cancellation_reasons_meta` [{id,text,active,updated_at}]; `cancellation_reasons` = active texts only (consumers unchanged). Model field added in models/finance.py.
- Global admin design system: `html.admin-ds` (toggled by AdminDashboard mount) in index.css — compact type scale (text-base→14 … text-5xl→32 incl. responsive variants), 14px controls, 42px max control height, trimmed p-6/p-8/gap/space-y, compact sidebar, 20/24px content padding. Customer site unaffected.
- Late Cancellation / No-show cards are placeholders ("Coming soon") — no backend rule yet.
- Tested: iteration_171 — 100% frontend flows.
