# AzoApp — Product Requirements & Progress

## Original problem statement (7 asks, Hindi/Hinglish)
1. Booking par automatic **surge charge** permanently remove karo.
2. Customer & Partner app me hamesha dikhne wala **persistent notification** ("Waiting for booking updates") hatao — internally kaam kare, push (FCM) server-side chalta rahe.
3. Partner & Customer app me **tax calculation + invoice** bilkul web jaise ho (web ke code ko single source banao).
4. Tax aur Platform Fee ke paas **ⓘ info icon** — hover/click par admin-configured info dikhe, hata do par auto-hide. Content admin se (General Settings).
5. Booking accept hone par assigned **partner ka photo + name + rating** dikhe; profile par click → non-confidential detailed info + ratings/reviews (web + app).
6. Partner active-job aur Customer booking (job start ke baad) me **Help & SOS** button → support team se **real-time chat** (WhatsApp-style typing). Existing admin SupportInbox ko real-time banao.
7. Customer panel me partner arrive ka **ETA & distance** galat — Google Maps jaisa real data dikhao.

## User choices
- Order: as written (1→7). Surge: remove from code completely. Support: make existing SupportInbox real-time. Info content: 2 fields in General Settings. Google Maps key provided (stored in backend/.env + web_panel/.env + integration center).

## Architecture
- `backend/` FastAPI + MongoDB (db `azoapp`), `/api` prefix. Single pricing source: `services/engines.py` PricingEngine (+ `build_breakdown`). All panels/apps render the server `breakdown`.
- `web_panel/` React (craco) on :3000 — admin + customer web + partner web.
- `Customer/` & `frontend/`(PartnerApp) Expo apps — render the SAME backend breakdown/invoice (OUT OF SCOPE for preview/automated testing here).
- Auth: OTP, demo OTP `123456`. Admin +919000000000, Customer +919000000004, Partner +919000000003.

## Implemented (this iteration — 2026-06)
- **P1 Surge removed (backend):** `PricingEngine._surge` always returns (0, None); "Surge Charge" removed from `CHARGE_LABELS`. Verified: quote/cart-quote never return surge; breakdown has no surge line.
- **P2 Persistent notification removed (both apps):** `Customer/src/lib/backgroundRing.ts` & `frontend/src/lib/backgroundRing.ts` no longer display the ongoing foreground-service notification; SSE still connects for in-app realtime, FCM push handles background alerts. (Mobile build not previewable here.)
- **P3 Tax/invoice parity:** Satisfied by backend single source of truth — web + both apps render `booking.breakdown` and fetch the same `/api/invoices/{id}/pdf`. With surge gone, numbers match everywhere.
- **P4 Fee info (ⓘ):** `general.tax_info` + `general.platform_fee_info` editable in Admin → General Settings → new **Fees & Taxes** tab; exposed at `GET /api/site/config` → `fee_info`. Web `FeeInfoTip` shows hover/click tooltip next to Tax & Platform Fee in Checkout + Customer order breakdown.
- **P5 Partner card + profile (web + backend):** `GET /api/bookings/{id}/partner-card` → non-confidential profile (photo, name, rating, jobs, reviews, skills, member_since), no phone/email/bank. `track` returns partner photo+rating. Web `LiveTrack` shows clickable partner card → `PartnerProfileModal` with reviews.
- **P6 Help & SOS + realtime support (web + backend):** `support_service` emits SSE `support_message`/`support_typing`/`support_ticket_new`. Web `HelpSOS` real-time chat modal (typing indicator) on customer started-booking (LiveTrack) & partner active job (PartnerDashboard). SupportCenter thread upgraded to live SSE updates.
- **P7 Real ETA/distance (backend):** `geo_service.road_eta()` = Google Routes API → legacy Distance Matrix → haversine estimate fallback; key from settings/env. `track_booking` uses it, returns `eta_source`.

## Testing
- Backend: `/app/backend/tests/test_iter_azo_feats.py` — 8/8 pass. Report `/app/test_reports/iteration_190.json`.
- Web compiled with no errors (warnings only).

## Known / action needed
- **Google Maps key:** supplied key's GCP project has NEITHER Routes API NOR Distance Matrix API enabled → ETA currently uses haversine **estimate** fallback (graceful). Enable "Routes API" (recommended) or "Distance Matrix API" for the project → real road ETA flows automatically.

## Backlog / deferred (P1/P2)
- **Mobile UI mirrors** for P4 (ⓘ tooltip), P5 (partner card + profile screen), P6 (Help & SOS + realtime support thread) in Customer/Partner Expo apps. Backend endpoints ready; needs Expo screens wired (not previewable here).
- Admin SupportInbox: add live subscription to `support_message`/`support_typing` for instant agent view (customer side already live).
- Optional: remove now-inert admin "Surge Rules" config UI.
