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
