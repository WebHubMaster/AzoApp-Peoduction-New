# AzoApp — Billing, Tax & Commission Correction (PRD)

## Problem statement (verbatim intent)
Billing/Tax/Commission/Invoice calculations were wrong in many places. All pricing is
dynamic and admin-controlled; calculation must be server-side. Required formula per booking:
1. service_cost
2. if service_cost < city "Min Service Amount for Visiting" → add city Visiting Charge
3. if Quick/Emergency booking → add city Quick/Emergency Fee
4. commission = (service + visiting + quick) × category commission% (category-wise)
5. tax_base = commission + city platform_fee
6. GST = tax_base × gst%
7. customer total = service_net + platform_fee + GST
- Partner invoice shows ONLY the partner's amount (no tax line).
- Rate-card: commission ONLY on labour charge (never on product/service cost); no labour → city Minimum Labour Charge (fresh booking).
- During-job rate-card work: commission only on labour, product 100% to partner, NO platform fee.
- Merchant commission is CITY-wise (Price Manager → Fee & Charges), out of platform-side commission.

## User choices
- Category commission is GLOBAL per category (NOT city-wise).
- Quick Service Fee = city-wise emergency/quick fee (Price Manager → Fee & Charges).
- Merchant commission is CITY-wise (Price Manager).
- Priority: backend engine + Admin config FIRST, then Customer/Partner apps.
- Apply new logic to NEW bookings only (no recompute of old invoices).

## Architecture
- Backend: FastAPI (/app/backend), engine in services/engines.py (PricingEngine, CommissionEngine),
  city config in services/city_pricing_service.py, category commission in category_commission_service.py.
- Admin/Customer web: /app/web_panel (React). Partner app: /app/frontend (Expo). Customer app: /app/Customer (Expo).
- DB: MongoDB (DB_NAME=azoapp). Dev OTP 123456. City via X-City header.

## Done (2026-06, Phase 1 — backend + admin) — TESTED 10/10
- PricingEngine.finalize(): added `commission_base` override so rate-card/custom items are
  commissioned on LABOUR ONLY; stores commissionable_base + pass_through. Normal bookings
  byte-identical (backward compatible).
- CommissionEngine.split(): added pass_through (non-commissionable → 100% partner);
  _commissionable_and_passthrough() feeds compute_split()/settle().
- booking_controller: custom bookings pass commission_base=eff_labour; pure rate-card carts
  pass commission_base=labour_total; min-labour fallback defensive fix.
- Merchant commission is CATEGORY-wise only (Commission by Service Category →
  merchant_partner_referral_pct, merchant_customer_pct). City-wise merchant commission was
  removed per user request — no city override anywhere; it comes out of platform-side commission.
- _recompute_additional (during-job add-ons) now uses full commission rate (100−partner_pct),
  not platform_pct; product cost 100% to partner; GST only on labour commission; no platform fee.
- Admin Price Manager → Fee & Charges UI (web_panel CityFees.jsx): added city-wise merchant
  commission % fields (merchant_partner_referral_pct, merchant_customer_pct).
- Verified live: Fan Installation / Patna / Electrician(20%) → commission 79.8, tax_base 104.8,
  GST 18.86, total 442.86 (matches user example exactly).

## Backlog / Next
- P2: web_panel customer invoice — add the same rate-card additional-work section post-payment (app parity).
- P2: Merchant wallet crediting for during-job additional labour commission (currently platform vs partner only).
- P2: Mixed carts (normal + rate-card) labour-only handling (currently full override only for pure rate-card carts).

## Done (2026-06, Phase 2 — Customer & Partner app invoices)
- Customer App invoice (Customer/src/components/customer/BookingDrawers.tsx + ServiceBreakdown.tsx):
  already renders the corrected bill from the server `breakdown` (services, visiting, quick/emergency
  fee, platform fee, GST, total). ADDED a "Additional Work (Rate Card)" section in InvoiceDrawer that
  shows each added rate-card item (labour/parts split), its GST and additional total, plus a combined
  Grand Total (incl. additional) once the additional work is paid.
- Partner App invoice (frontend/src/components/invoices/DetailPanel.tsx): already hides tax
  (role_earning "Excluded", payment summary "Not applicable") and now reflects the labour-only
  commission automatically because invoice_service reads pricing.commissionable_base (engine Phase 1).
- Partner App during-job rate-card add-ons (frontend/src/components/partner/AdditionalWork.tsx):
  already lists items with parts (no tax/commission) vs service+labour (commission applies), GST and total.
- NOTE: Expo apps cannot be run/screenshotted in this preview pod (only backend + web served). The app
  invoice edits are lint-clean (eslint pass) but were NOT runtime-verified in a live app; backend
  correctness IS verified.

## Notes
- .env files were missing in this preview pod; created /app/backend/.env (local Mongo). Prod uses remote DB.

## Done (2026-06, Customer app — Live Map + Help chat)
- LiveTrackCard (Customer/src/components/customer/LiveTrackCard.tsx): switched from OpenStreetMap
  to REAL Google Maps (Maps JS on native, Embed API on web) with partner + customer markers and a
  driving route; OSM kept as fallback only when no Google key is set. Backend /track now returns
  `maps_key` (from geo_service._google_key — Admin Integration Center or GOOGLE_MAPS_API_KEY env).
- Exact distance/ETA already computed server-side via geo_service.road_eta (Google Routes/Distance
  Matrix) with estimate fallback.
- Google Maps key saved in preview settings.integrations.google_maps_api_key.
- HelpSOS chat (booking Help): added bottom safe-area padding + WhatsApp-style keyboard handling via
  react-native-keyboard-controller (sheet lifts above keyboard, composer sits on top). Removed the
  Android-broken KeyboardAvoidingView(behavior=undefined).

## Google Cloud action needed (project 960503871336) for FULL live-map fidelity
- Enabled & working: Maps JavaScript API, Maps Embed API, Geocoding API → the Google map RENDERS.
- DISABLED (must enable for exact ETA + native route line): Routes API (backend exact ETA) and
  Directions API (native route polyline). Until enabled: ETA/distance = estimate, native map shows
  both pins without the route line (graceful fallback). Web route (Embed directions) already works.

## 2026-06 — Partner App: work-proof camera & upload hardening
- captureProofVideo now STREAMS the recording from disk one ~525KB chunk at a time
  (FileHandle.readBytes + base64-js fromByteArray) instead of loading the whole file
  into a base64 string → flat memory, works on low-RAM devices, first chunk uploads
  immediately. Each chunk is independently base64-encoded; verified byte-for-byte
  compatible with backend /evidence/chunk assembly (incl. 25MB → 49 chunks).
- Added microphone permission (expo-camera) before video capture (ensureVideoPermissions)
  so Android OEMs reliably launch the recorder.
- Chunk upload retries transient failures incl. timeouts (status 0/408/502/503/504/413).
- uploadAsset (Photo.tsx) now has a 60s timeout (native + web) so photo uploads can
  never hang forever on "Uploading…".
- NOTE: native camera/upload UI cannot be exercised by the browser testing agent, and
  the local backend is not runnable in this source repo (no MONGO_URL; targets prod).
  Verified via tsc + eslint + a byte-exact chunk-encoding compatibility test.
  Needs on-device confirmation.

## 2026-06 — Partner App: OTP box hidden behind keyboard (job wizard)
- app/(partner)/partner/job/[id].tsx: the Complete/Start OTP card sits in a
  KeyboardAwareScrollView with an absolutely-positioned KeyboardStickyView footer.
  bottomOffset was a fixed 96px — smaller than the footer height on gesture-nav
  devices, so the focused OTP box ended up hidden behind the footer at the keyboard
  edge.
- Fix: measure the sticky footer height via onLayout (footerH) and set
  bottomOffset={footerH + 16} + contentContainerStyle paddingBottom={footerH + 28}.
  Now the focused OTP box always auto-scrolls above the footer + keyboard on every
  device (WhatsApp-style).
- NOTE: native keyboard behavior can't be exercised by the browser testing agent and
  the local backend isn't runnable here; verified via tsc (clean) + eslint (0 errors).
  Needs on-device confirmation.

## 2026-06 — Rate-card additional work: tax only on labour commission (not on item cost)
- BUG: partner app + web panel sent a rate-card row as part_charge:0 /
  labour_charge:(service_charge + labour_charge), so commission + GST hit the FULL
  amount (incl. the item/product cost).
- FIX (UI only — backend _recompute_additional was already correct):
  - PartnerApp/src/components/partner/AdditionalWork.tsx addAdditionalRow
  - web_panel/src/components/partner/JobWizard.jsx addRow
  Now map rate-card service_charge -> part_charge (item cost: 100% partner, tax-free,
  commission-free) and labour_charge -> labour_charge (platform commission; GST only on
  that commission). Partner-app summary hides the "Service & labour" line when ₹0.
- Verified backend math with the real _recompute_additional via
  backend/tests/test_additional_split_logic.py (user example 300+100@20%/18% → total
  403.6, partner 380, gst 3.6; no-labour 149 → all partner, no tax). Both apps tsc/eslint clean.
- NOTE: native app + web E2E not run here (no running local backend; source monorepo).

## 2026-06 — Partner App: 6px radius, safe-area & keyboard sweep
- Corner radius 12→6: all 5 box/button occurrences in
  app/(partner)/partner/availability.tsx. Kept the 24x24 circle step-dot in
  starter-kit.tsx round (design-correct; it's a circle, not a 12px corner).
- Keyboard (WhatsApp-style auto-scroll) EVERYWHERE: converted the shared ScreenScroll
  (src/components/Screen.tsx) from plain ScrollView → KeyboardAwareScrollView
  (bottomOffset 24, keyboardShouldPersistTaps). This fixes keyboard-hidden inputs on
  all ~15 screens that use ScreenScroll (incl. Bank & KYC form). Other input screens
  already handled it (RegShell, job wizard, wallet, payouts, support, chat, AppShell).
- Safe area: partner screens already receive insets via shared shells
  (AppHeader/AppShell/RegShell); the "N" partner routes are re-exports of safe screens
  or redirects. SelfieCamera already insets-aware. Fixed one hardcoded top:44 →
  insets.top+12 on the work-proof video-player close button (JobProof.tsx).
- Verified: tsc clean, eslint 0 errors. Native keyboard/safe-area needs on-device confirm.

## 2026-06 — Customer App: support chat → full-screen, WhatsApp-style keyboard
- src/components/customer/SupportThread.tsx: was an embedded fixed-height "panel"
  inside the customer shell (app header + bottom nav visible + wasted space below input).
- Now renders as a full-screen Modal (statusBarTranslucent, slide) with its own
  KeyboardProvider + KeyboardAvoidingView (behavior padding/height). Layout: safe-area
  top padding → header → messages ScrollView (flex:1) → composer (paddingBottom
  insets.bottom). Input now rises with the keyboard like a real chat app; no leftover
  gap. Removed old winH/kbH/panelH manual height math.
- Verified: Customer app tsc clean. Native keyboard needs on-device confirm.

## Bug Fix — One support ticket per booking (2026-06)
- Issue: Help/SOS button on an active booking created a NEW ticket on every click (Customer app, Partner app, web panel).
- Root cause: `GET /api/support/tickets` summary (`_summary` in backend/services/support_service.py) omitted `booking_code`, so each client's dedup lookup (`t.booking_code === code`) never matched → always created a new ticket.
- Fix (backend only, shared by all 3 apps):
  1. `create_ticket()` is now idempotent per booking — if a non-closed ticket already exists for the same user + booking_code, it is reused instead of creating a duplicate.
  2. Added `booking_code` to `_summary()` so client-side dedup + ticket lists work correctly.
- Behaviour preserved: different booking → separate ticket; a closed ticket → a new click opens a fresh ticket; SOS path unchanged (already deduped).
- Verified directly against the service layer: 3 clicks → 1 ticket.

## Feature — Partner single-device login (last-login-wins) (2026-06)
- Change: `backend/services/auth_service.py verify_otp()` — a partner logging in on a NEW device now REBINDS the account to it instead of being blocked (`device_mismatch` removed from the normal path). The old device's JWT `did` no longer matches `registered_device_id`, so `middleware/auth.get_current_user` returns 401 `device_revoked` on its next request → old device auto-logs-out. No admin "Reset Device" needed.
- Partner app (frontend) already handles `device_revoked` → force logout (client.ts / AuthContext).
- Verified via real API: Device A login OK → Device B login OK → Device A `/auth/me` = 401 device_revoked.

## Feature — Rate-card direct booking: commission on labour + visiting + quick-service fee (2026-06)
- "Quick Service Fee" = the ASAP/emergency fee (`emergency_fee`, shown as "Quick Services" in UI).
- For rate-card / custom bookings the commissionable base is now LABOUR + VISITING (if applicable) + QUICK/EMERGENCY fee (if applicable), using that category's commission %. The product/service cost stays a 0-commission pass-through to the partner. Normal (non-rate-card) bookings unchanged.
- Files: `backend/services/engines.py compute()` (single service) and `backend/controllers/booking_controller.py cart_quote()` (cart). Both feed `PricingEngine.finalize`, where `tax_base = commission + platform_fee` and `gst = tax_base × gst%`.
- Backend is the single source of truth; Customer app, Partner app and web all render the same breakdown → fixed everywhere at once.
- Verified: product ₹1000 + labour ₹200 + quick ₹150 → base ₹350, commission 40% = ₹140, GST base ₹150 (140+10 platform fee), GST ₹27; partner gets ₹1210 incl. ₹1000 pass-through.

## Feature — Cash On Service (COS) payment method (2026-06)
Customer can pay a NON-REFUNDABLE token online and the rest as cash to the partner on service.
- Token model (user-confirmed): token = platform's ENTIRE cut = commission + platform fee + GST = total − partner_share. Cash collected by partner = partner_share exactly → ZERO wallet reconciliation.
- Backend (all shared by Customer app, Partner app, Web):
  - `engines.PricingEngine.cos_split(pricing)` → {token_amount, cash_to_collect, token_pct}; token+cash==total, cash==partner_share.
  - `engines.CommissionEngine.settle(..., cash_mode=True)`: on COS completion the partner's earning is NOT credited to wallet (already collected in cash); recorded in partner_ledger as `cos_cash_earning`; ledger kind `completion_cos`.
  - `create_direct` & `create_grouped_booking`: when payment_method=='cos', `_attach_cos()` stores payment_method+cos block (gated by admin `business_config.cos_enabled`, default ON).
  - `payment_controller.create_order`: COS bookings (single & group) charge the TOKEN, not the full total.
  - `confirm_booking`: sets `cos.token_paid` when COS token is paid.
  - `complete_job`: COS → cash_mode settlement + records `cos.cash_collected`/`collected_amount`.
  - `cancel_booking`: COS branch → token non-refundable, retained & split platform(commission+fee)+govt(GST), partner share 0; refund 0; ledger kind `cancellation_cos`.
  - `site_controller`: GET /api/site/config exposes `cos_enabled`. quote & cart_quote return `cos` + `cos_enabled`.
- Frontend:
  - Customer app (Customer/app/(site)/book.tsx + CheckoutSteps.tsx) and Customer web (web_panel Checkout.jsx): 3rd payment option "Cash on Service" with token/cash + non-refundable note; sends payment_method:"cos".
  - Partner app (frontend/.../job/[id].tsx WorkStep): cash-collection card (token paid + cash to collect) + "Payment Received · Complete Job" button; JobRingOverlay.tsx shows a "CASH ON SERVICE · collect ₹X" badge on the job alert.
  - Admin web (adminSections.jsx Business Settings): "Cash on Service" master toggle (data-testid biz-cos-enabled), persisted via business_config deep-merge; added to AdminDashboard sidebar.
- Verified: direct engine tests (exact numbers), live API (create COS booking token 270.93 + cash 329.40 = total 600.33, cash==partner_share), and testing agent 4/4 web UI scenarios PASS (admin toggle persist, customer checkout COS option gated by toggle, no regression).
- Env note: this stripped pod was missing backend/.env and web_panel/.env — both recreated; web_panel deps installed.

## COS follow-ups (2026-06)
1. Partner receipt line (frontend/app/(partner)/partner/job/[id].tsx DoneStep): completed COS job shows "Token already paid online" + "Cash collected from customer" (data-testid done-cos-receipt / done-cos-cash). Also recorded in partner_ledger as `cos_cash_earning`.
2. Admin COS report: backend GET /api/admin/bookings-cos-report (admin_controller.cos_report) → {bookings, count, totals{token_paid, cash_to_collect, cash_collected, cash_pending}}. Web: BookingsPro "Cash on Service" filter button (bk-cos-filter) + totals strip (bk-cos-totals). Tested 100% (3 backend + 3 frontend).
3. Partner cash reminder: booking_controller.partner_set_travel_status — on "On my way" (arrived_shop) for a COS booking, sends a `cos_cash_reminder` notification with the exact cash to collect.

## COS admin UI relocation (2026-06)
- Removed the extra standalone "Business Settings" sidebar tab (reverted AdminDashboard nav link + removed COS toggle from adminSections.jsx standalone page).
- Cash on Service toggle + Partner Reminder Lead Time now live inside the Integration Center → Business Settings modal (adminTemplateIntegration.jsx BusinessModal): fields cos_enabled (default ON) + reminder_lead_minutes (default 30), saved via PUT /admin/settings business_config (deep-merge, verified). data-testid: biz-cos-enabled, biz-reminder-lead.
- Commission (confirmed, no change needed): category_commission_service.resolve() already uses the per-category "Commission & Refund" config when set, else falls back to the global commission block. COS token (= total − partner_share) therefore automatically uses the correct category-or-global commission.

## 2026-06 Update
- Customer app main Home (app/(site)/index.tsx -> CategoriesGrid in src/components/apphome/Blocks.tsx): service categories now always 3 per row on all devices (percentage columns, max-width 640 centered on large screens).
- 2026-06: Customer app pagination removed (Bookings, Wallet, Invoices) -> infinite scroll. ux.tsx: emitScrollEnd/useOnScrollEnd/useInfiniteList/LoadMoreFooter; CustomerShell ScrollView emits near-end. Invoices fetch server pages of 10 (60s timeout + 1 retry, Retry button on failure).
- Bottom navs pinned behind keyboard via src/components/KeyboardFixedBottom.tsx.
- 2026-06: Server-side paging: GET /api/bookings/my/paged (tab,payment,search,date_from,date_to,sort,page,page_size -> items,total,counts) and GET /api/wallet/transactions (type,search,date_from,date_to,page,page_size -> items,total,balance,credits,debits,count). Customer hook src/lib/useServerList.ts. Pull-to-refresh in CustomerShell (useOnPullRefresh) on Bookings/Wallet/Invoices.
