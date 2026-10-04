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

---
## 2026-06 — Premium "All Services" Page Redesign (web_panel)
**Scope:** Frontend-only visual redesign of `web_panel/src/pages/customer/Services.jsx` (customer All Services marketplace page). No API/data/route/logic changes.

**Env note:** backend `.env` (MONGO_URL=mongodb://localhost:27017, DB_NAME=azoapp, JWT_SECRET, CORS_ORIGINS) and `web_panel/.env` (REACT_APP_BACKEND_URL) were MISSING and were restored; DB re-seeded on boot (16 services / 7 categories).

**What changed (visual layer only):**
- Widened content container to max-w-[1440px]; eliminated empty right-side; full-width responsive grid (2 / md:3 / lg:4 / 2xl:5 columns).
- Premium hero band (white) with large heading + subtitle + big 56px search bar (icon + clear button).
- Icon-based category navigation (admin `category.icon` mapped to lucide icons); horizontal scroll on mobile; selected = blue.
- Redesigned service cards: 4:3 landscape image, premium icon placeholder for missing images, rating badge, review count (only when data>0), duration, "Starting from" price, OFF badge, full-width solid-blue "Book Now →" CTA with hover elevation + entrance animation.
- Category section headers with icon chip, admin description subtitle, and "View all" link (All view).
- Premium shimmer skeleton grid (`.shimmer-block` in index.css), premium empty state with "Clear filters".
- Full dark-mode styling.

**Preserved (verified by testing agent, 100% pass):** card click → /service/:id, Book Now quick-add → cart + view-booking-bar, live search, rate-card search (/ratecards/search), category filtering, pricing/ratings, SEO, cart bar, MobileBottomNav. Shared SiteNavbar/SiteFooter untouched.

---
## Update 2026-10-04 — Partner Growth Module Premium Upgrade + Payout Log Removal

### Scope
Upgraded the Super Admin "Partner Growth" module (web_panel) to a premium, unified, production-ready experience and fully removed the deprecated "Payout Log" feature.

### Payout Log — fully removed
- Frontend: sidebar nav item, KNOWN route key, title map, render switch (AdminDashboard.jsx); PayoutLog component + KIND_META (partnerAdminSections.jsx); unused icon imports cleaned.
- Backend: `/admin/partner/payout-log` route (partner_admin_routes.py) + `admin_payout_log()` service (partner_service.py).
- No shared payout/wallet/finance/incentive/commission logic touched. No lingering references.

### Premium redesign (web_panel/src/pages/admin/partnerGrowthPro.jsx — rewritten)
Unified component system: PageHeader (icon/title/desc/last-updated/refresh/export), KpiCard + KpiSkeleton, SectionCard, EmptyState, ErrorState (retry, preserves filters), server-side Pager (rows/first/prev/next/last/total), responsive FilterToolbar (desktop inline → mobile bottom-sheet drawer w/ active count + reset), TableSkeleton, SlideOver (partner detail), Avatar, StatusPill/KycPill, FormSection/Field.
- **Performance**: KPIs, real analytics charts (rating distribution + top earners via recharts, powered by new backend `analytics` field; empty states when no data), sortable enterprise table (desktop) / cards (mobile), row click → partner detail drawer, CSV export.
- **Incentives**: KPIs, premium challenge cards w/ award-coverage progress, multi-section create/edit form w/ inline validation + loading, award leaderboard w/ skeletons, delete confirm dialog.
- **Penalties**: KPIs, filterable table (desktop) / cards (mobile), Apply Penalty 2-step form (sections + validation + review/confirm + loading, submit disabled while processing), Reverse penalty AlertDialog w/ full detail + consequence.

### Backend additive change (non-breaking)
`admin_performance()` now returns an extra `analytics` key (rating_buckets, status_mix, kyc_mix, top_earners, top_performers) computed fleet-wide from real data. Existing fields/routes unchanged.

### Verification
- web_panel production build: PASS (zero warnings on Partner Growth files; only pre-existing unrelated warning in AdminDashboard.jsx:289).
- ESLint: clean on all 3 modified files.
- Service-level checks against seeded DB: admin_performance (analytics shape correct), incentives_overview, penalties_board all return valid data; backend boots 200.
- NOT run: full browser E2E — this fork's supervisor serves the PartnerApp (/app/frontend), not web_panel, so the admin panel isn't reachable at the preview URL here.

### Next
- P1: wire web_panel into preview serving for full browser E2E of the redesigned flows.
