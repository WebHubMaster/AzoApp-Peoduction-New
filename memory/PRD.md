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
