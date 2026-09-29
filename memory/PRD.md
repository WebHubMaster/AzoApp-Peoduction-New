# AzoApp — Payment/Payout Gateway Routing Fix

## Original Problem
In Admin → Integration Center, multiple payment gateways can be configured. The rule:
whichever gateway is marked **Active** (and whichever mode — Test/Live — is set for it)
must be used for EVERY pay-in and payout, with no exceptions.

- PROBLEM 1: Payments showed a "Dev Mode Payment" placeholder instead of opening the
  real gateway checkout.
- PROBLEM 2: Payouts used a simulated bypass instead of the active gateway.
- ROOT CAUSE: the app was not honouring the Active gateway/mode and fell back to a
  dev-mode bypass whenever the gateway's separate enable toggle was off.

## Architecture
- Backend: FastAPI + MongoDB. Gateway selection centralised in
  `services/gateway_resolver.py` (single source of truth). Provider calls in
  `payment_gateways.py` (pay-in) and `payout_gateways.py` (payout). Dispatchers:
  `payment_service.py`, `payout_service.py`.
- Frontends: `web_panel` (admin + customer + partner web), `Customer` (Expo), and
  `frontend`/PartnerApp (Expo). Shared checkout helpers: `web_panel/src/lib/payments.js`,
  `Customer/src/lib/payments.ts`.

## What was implemented (2026-06)
1. **Root cause** — `gateway_resolver.resolve()` now treats the ACTIVE gateway as
   enabled for routing (`enabled = toggle OR is_active`). A saved-but-untoggled active
   gateway can no longer trigger a silent dev-mock bypass. `configured` still requires
   the active mode's own credentials.
2. **Pay-in (PROBLEM 1)** — `payment_service.create_order()` now always returns a real
   gateway order or raises `GatewayConfigError`; it never returns a mock. Every pay-in
   touchpoint updated: booking / booking_group / wallet (payment_controller),
   membership, subscription, starter kit, partner registration fee. All map
   `GatewayConfigError` → HTTP 409 with a clear message. Free (₹0) items still activate
   without a gateway.
3. **Removed the dev-mode bypass completely** — deleted `/payments/mock`,
   `/memberships/mock`, `/starter-kit/mock`, `/subscriptions/{id}/pay/mock` (all 404 now)
   and the corresponding controller/service functions and frontend mock branches.
   Added hosted-checkout confirm endpoints for membership (`/memberships/confirm`),
   starter kit (`/starter-kit/confirm`) and subscription (`/subscriptions/{id}/pay/confirm`)
   so Cashfree/Juspay/Easebuzz work alongside Razorpay.
4. **Payout (PROBLEM 2)** — `payout_service.create_payout()` removed the
   simulate-when-unconfigured path. It uses the active payout gateway/mode; on a real
   gateway-API failure (e.g. payout sandbox not enabled) it records **intent**
   (`status: processing, intent: true`) and logs the exact endpoint; when the active
   payout mode is unconfigured it fails with a clear error. Every payout record carries
   `gateway`, `gateway_mode`, `env`, `api`. Extended to partner, merchant, and agent
   withdrawals (previously only partner routed through a gateway).
5. **Frontend** — `payments.js`/`payments.ts` no longer have any mock branch;
   Membership, Subscriptions, Starter Kit and Partner Registration now open the ACTIVE
   gateway's real checkout via `openCheckout` (Razorpay SDK + Cashfree SDK + hosted).
6. **Pod restore** — recreated the missing `.env` files (backend `MONGO_URL`/`DB_NAME`,
   frontend/web_panel/Customer `*_BACKEND_URL`) and fixed the ESLint fallback configs in
   `web_panel`/`Customer` that crashed ESLint 9 when their node_modules are absent.

## Verification
- Active = Cashfree TEST (keys saved). `POST /api/payments/order` returns a REAL Cashfree
  sandbox order (`payment_session_id`, `cf_mode: sandbox`, `mock:false`).
- 12/12 backend tests pass (see `backend/tests/test_gateway_active_routing_iter156.py`).
- All 4 mock endpoints return 404. Payout returns a non-simulated record with the exact
  Cashfree payout endpoint.

## Config state / notes
- `active_payin_gateway = cashfree`, `active_payout_gateway = cashfree`, `cashfree_mode = test`.
- Cashfree TEST **pay-in** keys are set. Cashfree **payout** keys are NOT set → payouts
  currently return a clear "payout not configured" record. Add
  `cashfree_test_payout_client_id/secret` in the Integration Center to enable real
  sandbox payouts.

## Backlog / Next
- P1: Add Cashfree payout sandbox keys and re-verify a live sandbox payout.
- P2: Build + serve `web_panel` and `Customer` web for full browser E2E of the checkout UI
  (this pod's public port serves the Expo PartnerApp).
- P2: Razorpay TEST keys path (not exercised; user chose Cashfree).
