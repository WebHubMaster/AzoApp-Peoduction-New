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
- City-wise merchant commission override (city_pricing_service.merchant_commission) applied in
  _build_booking commission snapshot.
- _recompute_additional (during-job add-ons) now uses full commission rate (100−partner_pct),
  not platform_pct; product cost 100% to partner; GST only on labour commission; no platform fee.
- Admin Price Manager → Fee & Charges UI (web_panel CityFees.jsx): added city-wise merchant
  commission % fields (merchant_partner_referral_pct, merchant_customer_pct).
- Verified live: Fan Installation / Patna / Electrician(20%) → commission 79.8, tax_base 104.8,
  GST 18.86, total 442.86 (matches user example exactly).

## Backlog / Next
- P1: Customer app (/app/Customer) + Partner app (/app/frontend) invoice screens — surface the
  corrected breakdown (customer: full incl platform fee + GST; partner: only partner amount, no tax;
  rate-card add-ons & labour line after payment).
- P1: web_panel customer/partner/merchant invoice views reflect labour-only commission + merchant city split.
- P2: Merchant wallet crediting for during-job additional labour commission (currently platform vs partner only).
- P2: Mixed carts (normal + rate-card) labour-only handling (currently full override only for pure rate-card carts).

## Notes
- .env files were missing in this preview pod; created /app/backend/.env (local Mongo). Prod uses remote DB.
