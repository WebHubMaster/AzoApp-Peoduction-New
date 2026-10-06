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

