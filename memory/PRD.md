# AzoApp — PRD / Working Notes

## Problem statement (this session)
User (Hindi): Customer Web Panel & Customer App — (1) subscription (maid) booking me date & time par
proper custom date/time **picker** aana chahiye; (2) **payment nahi ho raha** — "bina payment ke
subscription purchase ho jata hai, payment pending rehta hai". User: test karo & fix karo.

## Architecture (monorepo)
- `/app/backend` — FastAPI + MongoDB (auto-seeds on startup). API prefix `/api`.
- `/app/web_panel` — CRA React web app (Customer + Admin + Partner web panel). **Served on :3000** (supervisor `frontend` → `cd /app/web_panel && yarn start`).
- `/app/Customer` — Expo customer app (not served in preview).
- `/app/frontend` (symlink PartnerApp) — Expo partner app.

## Root cause found (2026-10-06)
- `.env` files were MISSING (pod reset) → backend crashed on import with `KeyError: MONGO_URL`.
  The WHOLE backend was down → that is why "payment nahi ho raha / sab pending". The DB was also empty.

## Done (2026-10-06)
- Restored `/app/backend/.env` (MONGO_URL, DB_NAME=test_database, JWT_SECRET, PUBLIC_APP_URL) and
  `/app/web_panel/.env` (REACT_APP_BACKEND_URL) and `/app/Customer/.env` (EXPO_PUBLIC_BACKEND_URL).
- Backend restarted → auto-seeded (incl. Full-time Maid: Daily ₹400 / Weekly ₹2200 / Monthly ₹8000).
- Installed `/app/web_panel` node_modules (craco) — frontend now compiles & serves.
- **Bug fix:** backend rejected the `daily` plan ("Invalid plan type"). Added `daily` in
  `controllers/subscription_controller.py` (create_subscription) and `services/subscription_service.py`
  (plan_preview). Daily subscriptions now create + are returned by `/subscriptions/plans`. Verified via curl.
- Date/time picker: already a **custom calendar + time-slot picker** (`SchedulePicker`) in both web panel
  (`components/site/SchedulePicker.jsx`) and Customer app. NOT native inputs. Verified by testing agent on
  mobile (390) + desktop.
- Payment behaviour: with no gateway, subscription stays `pending_payment` and a clear error toast shows;
  **no silent activation** (user's bug not reproducible now). Verified by testing agent.
- Mobile UX: removed the floating Custom-Job FAB + "Turn on alerts" push-nudge from `/service/:id` and
  `/book` so they no longer cover the "Book Now" / "Confirm & Pay" CTA (`CustomJobFAB.jsx`, `PushRegistrar.jsx`, `App.js`).
- Verified Admin → Integration Center gateway-save path: saving Razorpay test keys flips resolver to
  `configured:true` (then reverted so preview is clean). User will add their own Razorpay/Cashfree keys.

## Pending / Next
- USER ACTION: Admin → Integration Center me Razorpay (ya Cashfree) TEST keys daalein to real payment
  preview me chale. (User chose to configure themselves.)
- Optional: "Complete payment" retry CTA on a pending subscription card in Account → Subscriptions.
- Optional: harden `pay_mock` with an explicit dev/admin guard (never auto-activate in prod).
- Note: CRA dev server compiles lazy route chunks on-demand (first open of /service/:id can be slow in
  preview). Not an issue in a production build.

## Credentials
See /app/memory/test_credentials.md. Dev OTP = 123456. Admin phone +919000000000. Customer any 10-digit.


## Session (2026-06) — Subscription orders are admin-assigned (no partner ring)
Problem (Hindi): Recurring Subscription Service order par partner ko full-screen job alert NAHI
jana chahiye. Order admin me aaye aur admin manually partner assign kare. Normal (non-recurring)
bookings ka full-screen job alert pehle jaisa hi fully working rahe (web + app dono).

Root-cause of broken env: `.env` files again MISSING (pod reset) → backend KeyError MONGO_URL,
web_panel `node_modules` wiped (craco not found). Restored:
- `/app/backend/.env` (MONGO_URL, DB_NAME=test_database, JWT_SECRET, PUBLIC_APP_URL)
- `/app/web_panel/.env`, `/app/Customer/.env`, `/app/frontend/.env` (backend URL)
- `yarn install` in `/app/web_panel` → craco serves on :3000 (supervisor `frontend`).

Code changes (`backend/controllers/subscription_controller.py`):
- `_activate()` now calls new `_queue_subscription_for_admin()` instead of `_broadcast_subscription()`.
  A paid subscription → `dispatch_status="awaiting_assignment"`, `offered_partner_ids=[]`, NO partner
  ring/push. Emits admin SSE `subscription_new` + inserts admin notification
  (`kind="subscription_awaiting_assignment"`).
- `admin_assign_partner()` now sets `dispatch_status="assigned"` and notifies the assigned partner
  (in-app + push, NOT a full-screen ring) and the customer.
- `accept_subscription()` now returns 403 (partners can't self-accept; old body kept as
  `_legacy_accept_subscription`). `_broadcast_subscription()` left in place but unused.
- Normal booking dispatch (`booking_controller.py`) UNCHANGED → one-off bookings still ring partners.

Verified (curl + DB + admin UI screenshot): create+mock-pay subscription → awaiting_assignment, no
partner offered, admin notification created; admin `/subscriptions/admin/all` shows it Unassigned;
admin `/assign` → assigned + partner/customer notified; partner `/accept` → 403.
App side (Expo partner) needs no change — backend simply stops sending subscription rings.



## Session (2026-06) — Subscription = normal-booking commission/tax/invoice/cancel
User: maid subscription me bhi commission, tax, billing invoice & cancel system normal
service booking jaisa pura breakdown ho.

Changes:
- `subscription_controller.create_subscription`: stores `commission_config`
  `{commission: <category block>, gst_pct}` snapshot + guarantees a full `customer_pricing`
  object (Service Amount, fees, GST, commissionable_base) even if the live quote fails.
- New `subscription_controller._sub_booking_shape(sub, status)` → booking-shaped dict so a
  subscription flows through the SAME invoice + cancellation engines as a normal booking.
- `_ensure_payment_invoice` now calls `invoice_service.ensure_booking_invoice(...)` (full GST
  Tax Invoice + Partner Receipt PDF, line items, commission, GST block) instead of a flat
  transaction invoice.
- `subscription_lifecycle_service`: new `_scale_pricing` (scale pricing to UNUSED fraction),
  `_cancel_pseudo`, `cancel_preview`; `cancel()` rewritten to use the normal
  `booking_controller._compute_cancellation` policy (partner-assigned → Customer Refund % of
  service + proportional GST, Partner Cancellation % retained & split; no partner → full
  refund of unused value) applied to the unused working days, then generates the normal
  Cancellation/Adjustment credit-note via `ensure_booking_invoice` + a refund record via
  `refund_service.initiate_refund`.
- Route `GET /subscriptions/admin/{id}/cancel-quote` → `life.cancel_preview` (full breakdown).
- Web admin `SubLifecycle.jsx` CancelDialog shows full normal breakdown (Service refund %,
  Cancellation fee, GST on fee, final refund).

Verified (curl + Mongo + admin UI + PDF extract): payment invoice = booking type with
subtotal/tax/fees/commission(32%)/GST block/line items; PDF = GST TAX INVOICE + PARTNER
RECEIPT (CGST/SGST 9%+9%, SAC codes, QR). Cancel (partner assigned, future dates) → 80%
service refund, 20% (₹) cancellation fee to maid, GST retained, refund record processed,
Cancellation/Adjustment credit-note invoice created. Commission stays category-wise %.


## Session (2026-06) — Tiered Pro/Free job alerts + rating-risk automation
Added ON TOP of the existing (unchanged) dispatch. All backend tests 100% (iter219).
- **Pro/Free alert delay**: `business_config.free_partner_alert_delay_sec` (admin, Integration Center → Business Settings). Pro partners (premium_partner / starter_kit.purchased) alerted immediately in rating-desc order; Free partners held (`free_alert_pending_ids` + `free_alert_release_at`) and released after the delay via in-process asyncio task. If no Pro eligible → Free immediate. Escalation sweep re-includes Free once release_at passes (crash-safe net). Code: booking_controller.py `_broadcast_new_job`, `_split_pro_free`, `_release_free_alerts*`, `_next_wave_targets`, `_dispatch_settings`.
- **Rating-based order**: within each group highest rating first (`_split_pro_free` sorts rating desc).
- **Rating-risk banner** (<=4.6 'Your ID is at risk'): `rating_at_risk` added in rbac_service.enrich_user → /auth/me. Web panel PartnerDashboard.jsx banner + Partner App HomeBanners.RiskBanner.
- **Auto-suspend** (<=4.4): booking_controller `_apply_rating_actions` (called from add_review) sets suspended+rating_suspended+suspend_until (business_config.rating_suspension_days, default 7). suspend sweep now every 60s, auto-reactivates + unsets rating_suspended.
- **Suspended Partners admin page**: GET /api/admin/partners/suspended (all suspended, auto flag). web_panel SuspendedPartners.jsx (nav key suspended_partners under Partners) + manual reactivate via existing POST /admin/partners/{pid}/unsuspend.
- **Env restored again** (pod reset): backend/.env, web_panel/.env, frontend/.env; web_panel `yarn install` (craco). Services up.

## Session (2026-06) — Starter Kit Upsell Popup for Free partners
Additive, no existing behaviour changed.
- Backend: `GET /api/partner/starter-kit-upsell` → {show, reminder_days, offer}; `POST /api/partner/starter-kit-upsell/dismiss`. Logic in services/partner_service.py (`starter_kit_upsell_state`, `dismiss_starter_kit_upsell`): show when partner KYC-approved + NOT Pro (premium_partner/starter_kit.purchased) + (never dismissed OR now >= dismissed_at + reminder_days). Stores `starter_kit_upsell_dismissed_at`. reminder_days = business_config.starter_kit_offer_reminder_days (default 7).
- Admin field "Starter Kit Offer Reminder (days)" added to Integration Center → Business Settings (adminTemplateIntegration.jsx, testid biz-starter-kit-reminder-days).
- Web panel popup: components/partner/StarterKitUpsellPopup.jsx (premium dark + amber, headline "Get Jobs Before Others", benefit bullets, "Upgrade to Pro" CTA → starterkit tab, dismiss → /dismiss). Rendered in PartnerDashboard.jsx. Verified via screenshot (free partner +919000000005).
- Partner App popup: src/components/partner/home/StarterKitUpsell.tsx (RN Modal), rendered in app/(partner)/index.tsx; CTA → /partner/starter-kit. (Expo app not served in preview.)
- Verified via curl: free+approved → show:true, Pro → show:false, dismiss → false, after interval → true again, admin field saves + drives reminder_days.

---
## Update — Maid Subscription Calculation Fix (2026-06)
**Problem:** Maid subscription pricing was wrong — tax & platform share did not match a normal service booking.

**Root causes found & fixed:**
1. Customer checkout sent the subscription plan to `/bookings/cart-quote` as a *zero-labour custom line* (`labour_charge: 0`), so platform commission collapsed to ~0 and GST became ~₹0 — while a separate (wrong) service-tax was deducted from the maid's allocation.
2. Backend resolved subscription commission from `platform_pct` (32%) while a normal booking uses `100 − partner_pct` (40%) → the total shown at checkout ≠ the amount charged.

**Fix (now identical to a normal booking):**
- `compute_financials()` reuses `PricingEngine.finalize()`: commission on the FULL plan amount, maid earns `gross − commission` (never taxed), Platform Fee (₹10) + GST (only on `commission + platform fee`) collected on top; `total_payable = gross + platform_fee + GST`.
- `commission_pct_for()` now returns `100 − partner_pct` (same as normal booking; still honors `subscription_commission_pct` override).
- `create_subscription` stores a full normal-booking pricing object (`customer_pricing`) + `platform_fee`; invoice & cancellation reuse it.
- Frontend: web_panel `Checkout.jsx` + Customer RN `CartContext.tsx` `toReqItem` send `labour_charge = plan_price` (fully commissionable). Admin `SubDrawer.jsx` & customer `Subscriptions.jsx` now show Platform Fee + GST + Total Payable.

**Verified (testing agent, backend 100%):** Monthly ₹8000 → commission 3200 (40%), maid 4800, platform fee 10, GST 577.80 (on 3210), total 8587.80. Backend snapshot == checkout cart-quote (shown == charged). Invoice reflects same.

**Env note:** `.env` files were missing from the upload; recreated `backend/.env` (MONGO_URL=mongodb://localhost:27017, DB_NAME=azoapp). Ran `seed_maid_subscription.py`.

## Update — Subscription Invoice PDF Download Fix (2026-06)
**Bug:** Customer app/web subscription invoice "download" opened the raw backend public URL in the browser (inline), exposing the backend URL instead of downloading the PDF.
**Fix (web & app):** All subscription invoice downloads now fetch the PDF from the AUTHORISED `GET /api/invoices/{invoice_id}/pdf` endpoint (ownership-checked) as a blob/file and trigger a real download (web) or open it in the native PDF viewer / Save sheet (Customer RN app) — the backend URL is never navigated to.
- web_panel: new `downloadInvoicePdf()` in `lib/invoiceShare.js`; wired into customer `components/customer/Subscriptions.jsx` and admin `pages/admin/SubscriptionsAdmin.jsx`.
- Customer RN: `app/(customer)/subscriptions.tsx` now uses `downloadInvoicePdf()` from `src/lib/invoiceActions.ts` (replaced `Linking.openURL(backendUrl)`).
**Verified:** testing agent iteration_221 — 5/5 pass (valid %PDF, owner-only 403 for others, no-auth rejected, pricing regression intact). Invoice PDF visually checked: platform Tax Invoice (taxable ₹3210 = commission 3200 + fee 10, GST ₹577.80) + Partner Receipt ₹4800 = total ₹8587.80 — identical to a normal booking.

### Backlog (user-requested, next)
- P1 Cancellation Refund Preview: polish proportional (remaining-days) refund breakdown UI on subscription cancel.
- P2 Plan Savings Badge: comparison badge across daily/weekly/monthly plans to nudge longer subscriptions.

## Update — Subscription UX: Savings Badge, Invoice Email, Download Toast (2026-06)
1. **Plan Savings Badge** (web + app): plan picker shows "Save X%" (and "Best value" on the cheapest per-day plan), computed client-side from price ÷ duration_days vs the costliest per-day plan. Files: web_panel `components/customer/Subscriptions.jsx` (SubscriptionPlansPanel), Customer RN `app/(site)/service/[id].tsx`.
2. **Invoice Email** (web + app): one-tap "Email Invoice" button on each subscription card → resolves invoice_id → POST /api/invoices/{id}/email. Backend verified 100% (iteration_222): clean 400s (no-email / invalid / not-configured), 403 ownership. ⚠️ NEEDS CONFIG: actual delivery requires SMTP/SendGrid in Admin → Integrations (not set in this env); button surfaces the backend's guidance message until then. Files: web_panel `lib/invoiceShare.js` (emailInvoicePdf), `components/customer/Subscriptions.jsx`, `pages/admin/SubscriptionsAdmin.jsx`; Customer RN `src/lib/invoiceActions.ts` (emailInvoice), `app/(customer)/subscriptions.tsx`.
3. **Download Toast + Open** (web + app): after invoice download, a toast "Invoice saved" with an "Open" action opens the PDF (new tab on web; native share/viewer on app). Added action support to Customer RN `src/components/Toast.tsx`; web uses sonner action in `lib/invoiceShare.js` downloadInvoicePdf; Customer RN `invoiceActions.ts` gained saveInvoicePdf/openInvoicePdf.

Note: web_panel & Customer RN are not run under supervisor here (only PartnerApp Expo is), so their UI was verified by code review against existing patterns; all backend contracts were verified by the testing agent.

## Session (2026-06) — Customer app: real-time status + invoice PDF open/share (pdf-share-safe)
Env restored again (pod reset): backend/.env (MONGO_URL, DB_NAME=test_database, JWT_SECRET, PUBLIC_APP_URL, REACT_APP_BACKEND_URL=https://alert-lock-screen.preview.emergentagent.com), web_panel/.env, Customer/.env, frontend/.env. Only web_panel runs on :3000; Customer & Partner Expo apps are source-only (not served) → Customer verified via tsc + backend contract tests.

Scope: Customer app ONLY (/app/Customer). Partner app (/app/frontend) UNCHANGED.

1) Near-real-time job status (polling chosen): `src/context/CustomerDataContext.tsx` rewritten — adaptive /bookings poll (3s while a job is active, 6s idle; was fixed 8s), wallet/refunds slow-poll (20s), AND instant refresh via existing SSE (`useRealtime().subscribe` → reloads bookings on booking_update/booking_confirmed/booking_completed/reschedule_resolved/__resync__). Backend `booking_controller.py` complete-job now also emits `rt.emit_user(customer_id, "booking_update", _job_brief(out))` (shared backend; partner app untouched). Backend 6/6 tests pass, no completion regression.

2) Invoice auto-open after download (replicate partner): `src/lib/invoiceActions.ts` — `downloadInvoicePdf` now returns {status, openUri}; added `openLocalFile` (Android IntentLauncher VIEW / iOS Sharing). Callers `app/(customer)/invoices.tsx` (downloadById) and `components/customer/BookingDrawers.tsx` (InvoiceDrawer.downloadInvoice) open the PDF right after download — same UX as partner `invoices.tsx`.

3) Secure invoice share (no raw backend URL): added `shareInvoicePdf(inv, channel)` to invoiceActions — fetches the authorised backend PDF internally and shares the ACTUAL PDF file via WhatsApp/native intent (web: downloads + wa.me text only, no URL). Replaced URL-sharing in `invoices.tsx` shareInvoice() and `BookingDrawers.tsx` shareOnWhatsApp() (removed publicUrl('pdf')/publicPdf backend-URL builders). Preview-modal "print" button no longer Linking.openURL(backend page) — opens the downloaded PDF instead. Email still uses backend POST /invoices/{id}/email (server sends PDF, no URL). Backend PDF endpoint verified owner-only: 200 application/pdf %PDF for owner, 403 non-owner, 401 no-auth.

Verification: Customer Expo app can't run in preview → verified by `tsc --noEmit` (clean on all edited files) + backend contract tests (iteration_223, 6/6). Live on-device WhatsApp/native-share + Android PDF viewer open not exercisable here.

## Session (2026-06) — Full-screen alerts (background/locked/closed) + reschedule alert/refresh
Scope: Customer app background alerts = Customer app ONLY. Reschedule fixes = BOTH apps. Partner app full-screen infra UNCHANGED except the two surgical reschedule fixes in JobRingOverlay.

ROOT CAUSES FOUND (by comparing /app/frontend partner vs /app/Customer):
1) Task1 — Customer full-screen alerts only worked with app OPEN because `Customer/src/lib/backgroundRing.ts` `startBackgroundAlertListener` had the Android FOREGROUND SERVICE removed ("per product decision"), so background JS+SSE got killed by the OS → no ring when backgrounded/locked/closed. Partner `startBackgroundJobListener` posts a MIN-importance/SECRET FGS to keep the process+SSE alive. FIX: replicated the partner FGS exactly (channel CHANNELS.online, asForegroundService, foregroundServiceTypes DATA_SYNC, importance MIN, visibility SECRET). FCM data-push path (pushBackground.ts) was already present for reschedule_request/booking_confirmed.
2) Task2A — Partner foreground reschedule ring never showed: `JobRingOverlay.enqueue` dedups by booking id, but a reschedule always targets an ALREADY-accepted booking whose id is in handledRef (added on accept) → enqueue returned early. FIX: `if (handledRef.has(id) && !job._resched) return;` (reschedules bypass dedup). Customer side: `CustomerAlertOverlay.enqueueReschedule(d, fresh)` now clears the `resched-<id>` handled key for a freshly-pushed SSE/FCM request so a new/second reschedule re-rings.
3) Task2B — Partner never refreshed on reschedule resolve: `JobRingOverlay` SSE handler ignored `reschedule_resolved`. FIX: added `reschedule_resolved` to the refetch branch (invalidates partner-jobs/active/dashboard/missed). Customer requester already reloads via CustomerDataContext SSE subscription (prev session); customer responder updates via the 3s adaptive bookings poll.

FILES CHANGED: Customer/src/lib/backgroundRing.ts, Customer/src/components/customer/CustomerAlertOverlay.tsx, frontend/src/components/JobRingOverlay.tsx. All typecheck clean (tsc --noEmit) in both apps.

VERIFIED (backend contract via curl, Expo apps not runnable in preview): customer→partner reschedule request HTTP200 (reschedule_request stored, requested_by_role=customer); partner SSE /realtime/stream received `reschedule_request` live; GET /bookings/partner/reschedule-pending returns it; partner accept HTTP200 → scheduled_at moved + timeline reschedule_accepted + reschedule_request cleared. backend emits reschedule_resolved to requester (code + iter215/216 tests). Env (.env x4) restored after pod reset.

## Session (2026-06) — Permission Nudge card (Customer app, lock-screen alerts)
Customer app only. Added the missing "Display over other apps" (SYSTEM_ALERT_WINDOW) permission helpers to Customer/src/lib/notifications.ts (`overlayState`, `requestOverlayPermission`, OVERLAY_ASKED_KEY), extended PermKey + allAlertStates to include "overlay" (was notifications/fullscreen/battery only — the partner app already had overlay). This perm is what lets the background ring launch the full-screen alert when the phone is UNLOCKED/in another app.

New component Customer/src/components/customer/AlertSetupNudge.tsx: compact Android-only card shown on the customer Home (mounted top of HomeView). Shows only when Full-Screen Alert OR Display-Over-Other-Apps is not yet allowed; hides once both granted; dismiss snoozes 3 days (storage key azo_alert_nudge_dismissed_at). Two one-tap "Allow" chips (alert-nudge-fullscreen → openFullScreenIntentSettings, alert-nudge-overlay → requestOverlayPermission) that flip to a green check once allowed; re-checks on AppState active. Link (alert-nudge-open) → /(customer)/alerts full setup + ring test. testids: alert-nudge, alert-nudge-fullscreen, alert-nudge-overlay, alert-nudge-open, alert-nudge-dismiss.

Also added the "Display Over Other Apps" card to the full Alert Health Check screen (app/(customer)/alerts.tsx) so it's covered there too.

No backend changes. tsc --noEmit clean for notifications.ts, alerts.tsx, HomeView.tsx, AlertSetupNudge.tsx. Expo app not runnable in preview → verified by TypeScript compile + code review.

## Session (2026-06) — OEM Autostart guide + First-booking alert walkthrough (Customer app)
Customer app only. No backend changes.

1) OEM Autostart guide: added aggressive-OEM helpers to Customer/src/lib/notifications.ts (ported from partner): `isAggressiveOem()`, `oemLabel()`, `oemState()`, `requestOemSettings()` (deep-links MIUI/ColorOS/FuntouchOS/EMUI Autostart+pop-up activities with app-settings fallback), OEM_ASKED_KEY, expo-device import. Extended PermKey → +"oem" and allAlertStates to include it. Added the "Autostart & Background Pop-ups" card to app/(customer)/alerts.tsx (only renders when available=true i.e. on Xiaomi/Redmi/Poco/Oppo/Realme/Vivo/iQOO/Huawei/Honor) with a requestOemSettings handler.

2) First-booking walkthrough: new Customer/src/components/customer/AlertPermissionWalkthrough.tsx — a one-time guided stepper (bottom-sheet Modal) that walks a NEW customer through notifications → full-screen → display-over-apps → run-in-background → OEM autostart. Android only; shown once when bookingCount>0 and not previously completed (storage key azo_alert_walkthrough_done); auto-skips steps already granted / not applicable; per-step Allow (+Open Settings when permanently denied) / Skip, progress bar, re-checks on AppState active, Finish on last step. Mounted at top of HomeView with bookingCount={bookings.length} so it triggers after the first booking (on the Home tab). testids: alert-walkthrough, alert-walkthrough-progress, alert-walkthrough-allow-<key>, alert-walkthrough-next, alert-walkthrough-skip, walkthrough-granted-<key>.

Verified: source files tsc-clean (only 2 pre-existing tsconfig.json toolchain warnings remain, unrelated). Expo app not runnable in preview → verified by TypeScript compile + code review.

## Update (Jun 2026) — Hide commission/fee split percentages
Removed all "how much %" split indicators shown to customers, partners & merchants (apps + web) and in generated invoices. Amounts (₹) retained; only the % annotations/rows removed.
Changed:
- Backend: invoice_html_service.py, invoice_pdf_service.py (Commission Rate / Share rows, Customer Refund (x%)), booking_controller.py (cancellation preview message "20% cancellation fee" → "cancellation fee").
- Customer app: BookingDialogs, BookingDrawers, invoices, refunds.
- Customer web: CustomerDashboard (cancel preview, refunds, refund rows).
- Partner app: earnings.tsx, active.tsx, DetailPanel.tsx.
- Partner web: EarningsLedger.jsx.
- Merchant app: commission.tsx, partners.tsx, (merchant)/customers.tsx.
- Merchant web: finance InvoiceDetailPanel.jsx, referral MerchantCommission/MerchantPartners/MerchantReferralCustomers.
- Shared: InvoiceCenter.jsx, InvoiceDocument.jsx.
Kept (intentional): GST/CGST/SGST tax rates (legal), promotional "% off"/"SAVE %" discounts, progress/completion/performance stats, and admin config screens (admins still set rates).

## Update (Jun 2026) — Invoice logo + Profile avatars
1. Invoice logo now shows on ALL invoice surfaces, pulled from admin Branding & Theme "Email & Invoice Logo" (email_logo):
   - Backend PDF/HTML/email already embedded it.
   - Added logo to in-app invoice detail drawers: Customer app (invoices.tsx) & web (InvoiceCenter.jsx).
   - Hardened web logo <img> to use mediaSrc() (InvoiceDocument.jsx, merchant InvoiceDetailPanel.jsx) so relative media paths resolve cross-host.
2. Profile picture (user.photo) now renders wherever own-profile shows:
   - Customer checkout contact chip (CheckoutSteps.tsx) — was initials only.
   - Partner home header (HomeSections.tsx) — was initials only.
   - Other shells/headers/chat already rendered photo.
Known gap: partner's "Customer details" avatar on job/[id] still shows initial — backend job payload does not include customer photo (needs API field to add).

## Update (Jun 2026) — Customer photo to partner + Maid subscription sheet
1. Partner "Customer details" (job screen) now shows the customer's profile photo:
   - Backend: partner_job_detail() adds b["customer_photo"] from users.photo.
   - Partner app job/[id].tsx renders customer_photo (fallback to initial).
2. Maid subscription sheet (Customer app subscriptions.tsx):
   - Validation errors now show as an inline red banner at the TOP of the sheet (was a toast hidden behind the modal).
   - Added "Use current location" button in Service Address → requests GPS, reverse-geocodes (/geo/reverse), saves it as an address (/auth/address) and auto-selects it; address rows now show city · pincode and lat/lng.
   - Removed the green "verified maid… attendance captured by location" note.

## Session (2026-06) — Customer App login screen redesign (premium trust UI)
- Rewrote `Customer/app/login.tsx` UI (OTP logic unchanged) + new `Customer/src/components/login/LoginParts.tsx`.
- Sections: back + Need Help (→ /contact), DYNAMIC admin logo (branding.logo_light/dark, text fallback),
  "Home Services You Can Trust" hero, customer photo in blue disc, 3 verified service snapshots (AC/plumber/cleaner,
  AzoApp logo on uniforms), "100% Verified Professionals" badge, OTP card, trust stats, security strip, living-room trust area.
- AI images in `Customer/assets/login/*.webp`.
- Preview: Customer web export served at `/api/customer/login` (cd Customer && npx expo export -p web).
- Restored missing .env files (backend, Customer, frontend). Set branding.logo_light to /api/media/file/branding/azo_logo_light.png.
## Next
- Optional horizontal wordmark logo variant for login; dark-mode variant of new login.
- (v2) Login rebuilt as a SAME-TO-SAME clone of the reference on a fixed, NON-SCROLL canvas (reference px → pt geometry in
  `makeGeom`, overflow hidden). Hero + room photos cropped from reference (`Customer/assets/login/hero.webp`, `room.webp`).
  Preview logo set to reference wordmark `/api/media/file/branding/azo_wordmark.png` (admin can change any time).
  Stats hidden on name/email steps so the taller card never overlaps. Tested 100% at 390x844, 360x740, 412x915.
- (v3) Logo back to admin dynamic logo (azo_logo_light.png), larger slot. Headline/card title weight → 600 (medium).
  Trust stats now from site config `stats` (Admin → Website/CMS → Homepage Builder → Homepage Trust Stats):
  LIVE = DB counts (customers, verified_partners, rating), MANUAL = admin values. Verified both modes.
- (2026-06) Subscriptions: check icon inline next to price (overlap fix); Monthly plan shows BEST VALUE pill + 'Save ₹X (Y%) vs Daily' (monthlySaving in subscriptions.tsx).
- (2026-06) Subscription plan sheet pre-selects Monthly (fallback first plan).
- (2026-06) Customer AlertPermissionWalkthrough: bottom safe-area padding; notifications+battery auto-requested via system dialogs (no step); walkthrough shows only force/settings permissions (full-screen, overlay, OEM autostart) still missing.

---

## [2026-06] Full-screen alert reliability fix (Customer app) + Partner ring-sound fix

### Problem
- CUSTOMER app: full-screen call-style alert did NOT fire when the phone was locked / app closed / backgrounded (only worked with app OPEN). Partner app worked in all states.
- PARTNER app: on a new booking the full-screen job alert's ring SOUND played only intermittently ("sometimes sound, sometimes not") across devices.

### Root cause
- CUSTOMER: `Customer/src/context/RealtimeContext.tsx` started the Notifee foreground-service background listener (`startBackgroundAlertListener`) only AFTER the app transitioned to `background`. Android 12+ blocks starting a foreground service from the background (`ForegroundServiceStartNotAllowedException`), so the process/SSE died and no alert rang when locked/closed. The Partner app starts its listener while still in the FOREGROUND (the moment the partner is online) — the correct pattern.
- PARTNER sound: background path posted the ring on a SILENT channel and relied on the app force-opening to the foreground so the overlay's separate `useAudioPlayer` could play — flaky on many OEMs. Foreground player also used `shouldPlayInBackground:false`.

### Fix
- CUSTOMER `RealtimeContext.tsx`: start `startBackgroundAlertListener()` the moment the user is signed in (while foreground); keep it running; only stop on logout. On background just drop the foreground SSE (listener already alive). 1:1 with Partner.
- CUSTOMER `notifications.ts`: `online` FGS channel bumped `azo-cust-online-v1`→`v2` with MIN importance + SECRET visibility (unobtrusive persistent notification), old id deleted via LEGACY_CHANNELS.
- PARTNER `RealtimeContext.tsx`: `playRing/stopRing` now use the SINGLE shared `startRingSound/stopRingSound` player (expo-audio, `shouldPlayInBackground:true`, admin tone from `azo_ring_prefs`) instead of a separate `useAudioPlayer` — reliable in every state, never doubles.
- PARTNER `backgroundRing.ts` + `pushBackground.ts`: play the ring tone directly in the background handlers (DND-aware via `isDndActive`, emergency bypasses DND) so sound is audible even if Android keeps the app backgrounded.

### Verification
- Static/logic verified against the working Partner reference. Full-screen lock-screen/FCM/OEM behavior must be verified on a real Android device (per user). Partner app full-screen DISPLAY mechanism was intentionally left unchanged.

### [2026-06] Hide the always-on background-service status-bar icon (both apps)
- Issue: the persistent foreground-service notification showed a small status-bar icon (irritating; user may uninstall).
- Fix: FGS notification now uses a fully TRANSPARENT small icon (`ic_fgs_transparent`) + MIN importance + SECRET visibility, so no visible glyph is drawn while the service keeps running 100%. Android legally requires an FGS notification, so it can't be removed entirely — but it's now invisible on stock Android and most OEMs. Transparent PNG added to `assets/fgs-transparent.png` and copied to `res/drawable/ic_fgs_transparent.png` by `plugins/withJobRingAndroid.js` in both apps. Requires a fresh native build. (Note: some MIUI/ColorOS builds may still force-show FGS notifications at OS level.)

### [2026-06] Customer invoice "Share on WhatsApp" fails — fixed
- Symptom: tapping "Share on WhatsApp" in the Customer app invoice sheet errored; PDF never reached WhatsApp.
- Root cause (client-side, not backend): `Customer/src/lib/invoiceActions.ts` `shareInvoicePdf()` used a direct `IntentLauncher.startActivityAsync(ACTION_SEND)` with `android.intent.extra.STREAM` passed as a plain string — WhatsApp didn't get a FileProvider read grant, so the attach failed.
- Fix: route the real PDF file through `expo-sharing` `Sharing.shareAsync(fileUri, {mimeType:"application/pdf"})` (proper content:// URI + read grant). WhatsApp appears in the system share sheet and attaches the PDF reliably on all devices; wa.me text fallback only if sharing is unavailable.
- Verification: testing_agent backend run 100% pass — OTP login, GET /api/invoices, GET /api/invoices/{id}/pdf returns valid %PDF for owner and 403 for non-owner. Native WhatsApp attach to be confirmed on-device. (Local backend/.env restored: MONGO_URL, DB_NAME; invoices seeded via backend/seed_pro_and_invoices.py.)

### [2026-06] Maid subscription "Use current location" created duplicate addresses — fixed
- Symptom: in the subscription Plan sheet, each tap of "Use current location" created a brand-new "Current location" address (duplicates).
- Root cause: client `Customer/app/(customer)/subscriptions.tsx` useCurrentLocation() always POSTed /auth/address, and backend controllers/auth_controller.py add_address() appended unconditionally (no de-dupe). (The booking flow book.tsx only fills a form, so it was unaffected.)
- Fix (2 layers):
  - Client: useCurrentLocation() now checks already-loaded addresses first; if the same address exists (near-equal coords ~11m, or same normalized line+city+pincode) it just selects it — no POST.
  - Backend: add_address() de-dupes server-side — identical address (close coords OR same normalized line+city+pincode) is reused (moved to end + returned) instead of appended. Guards against rapid double-taps/stale state and fixes it for every caller.
- Verification: testing_agent backend run 100% (7/7) — JWT login, add-new (+1), 3x identical idempotent, near-equal-coord dup, line+city+pincode dup, and a different address still adds. Client UX guard verified on-device by user.
