# AzoApp — Home Service Platform

## Overview
Monorepo:
- `backend/` — FastAPI + MongoDB (motor). Entry `server.py`. Env: MONGO_URL, DB_NAME, CORS_ORIGINS.
- `web_panel/` — React (CRA + craco) web app (customer storefront + admin/partner/merchant). Deployed on **AWS Amplify** (appRoot = `web_panel`).
- `frontend/` — Expo React Native mobile app.

## Local / Preview run (this environment)
- Backend: supervisor `backend` on :8001.
- Web app: supervisor `frontend` slot repointed to `/app/web_panel` (craco start) on :3000.
- MongoDB local :27017, DB_NAME=azoapp.
- Local-only env (gitignored): `backend/.env`, `web_panel/.env.local`.

## 2026-10-04 (v2) — Amplify fix moved to TRACKED files
First attempt used `web_panel/.env.production` (DISABLE_ESLINT_PLUGIN) but root `.gitignore`
(`.env`, `.env.*`, `*.env`) ignores it → never reached GitHub/Amplify → same error repeated.
Final fix (both git-tracked, will deploy):
1. `web_panel/craco.config.js` — `eslint: { enable: isDevServer, ... }` disables CRA ESLint
   during production build (NODE_ENV=production on Amplify); dev linting unchanged.
2. `/app/.eslintrc.json` — removed the hardcoded absolute `parser` line (portable now).
Verified: `CI=true yarn build` succeeds with NO `.env.production` present (mimics Amplify).
USER MUST: Save to GitHub + redeploy on Amplify for the fix to take effect.

## 2026-10-04 — AWS Amplify build fix (DONE, verified)
Error: `[eslint] Failed to load parser '/app/frontend/node_modules/@typescript-eslint/parser/dist/index.js' declared in '../.eslintrc.json'`.

Root cause: CRA ESLint walked up from `web_panel/` and read repo-root `/app/.eslintrc.json`,
which hardcoded a non-portable absolute parser path missing on Amplify's build server.

Fix (committed, inside `web_panel/`):
1. `web_panel/.eslintrc.json` = `{ "root": true, "rules": {} }` — stops ESLint from reading the broken root config.
2. `web_panel/.env.production` = `DISABLE_ESLINT_PLUGIN=true` — Amplify sets `CI=true` (lint warnings become build errors); disabling the plugin in prod builds matches original intent (root had empty rules).

Verified: `CI=true yarn build` in `web_panel/` completes successfully ("build folder is ready to be deployed").

## Amplify action for user
- Set `REACT_APP_BACKEND_URL` in Amplify console env to the production backend origin (else `web_panel/src/lib/api.js` falls back to panel window origin).
- `.env.local` (preview URL) is gitignored → won't leak to Amplify.
- Commit via "Save to Github": `web_panel/.eslintrc.json`, `web_panel/.env.production`.

## 2026-10-04 — Partner/Merchant app UI cleanup (Expo app in /app/frontend)
User: fonts too big + remove page Header/Subheader from all screens; buttons across from a header go full width.
- src/theme.ts: reduced global fontSize tokens (xs11→10, sm13→12, md15→13, lg17→15, xl20→17, xxl26→21, hero32→26).
- src/components/Screen.tsx AppHeader: removed the whole title/subtitle/back bar on all screens; non-embedded renders only a safe-area spacer+StatusBar (embedded → null). Props kept for compat.
- src/components/invoice.tsx PageHeader: removed title + subtitle; kept small shopName chip.
- src/components/merchant/ReferralShared.tsx MModuleHeader: removed gradient title/subtitle banner; renders `right` full-width if provided, else null.
Verified: all 4 edited files parse clean (no syntax errors). Native screens are auth-gated → not screenshot-able in this web preview env; verify via Expo Go / EAS build.

## 2026-10-04 — Customer app UI cleanup (Expo app in /app/Customer)
Same treatment as Partner/Merchant: smaller fonts + remove page heading/subheading; header-adjacent buttons go full-width.
- src/lib/globalFont.ts: global font scale FS 1.09 → 0.92 (app-wide smaller text; native only).
- Removed page-title + subtitle from (customer) screens: invoices, wallet, referral, alerts, [tab], refunds, subscriptions.
- Removed heading/subheading AND made the header action button full-width: orders (Booking), addresses (Booking), profile (Booking), support (New Ticket), custom_jobs (Service + refresh row).
- Global top shell (CustomerShell avatar/location/bell/theme) + bottom nav kept.
Verified: all 13 edited files parse clean (no syntax errors). Verify visually via Expo Go / EAS build.
## Customer App — UI change session (2026-10-04)
Scope: /app/Customer (Expo RN) only. Partner/Merchant/web_panel untouched.

Changes done (per user screenshots 1-5):
1. Header icons uniform 40x40: membership crown square r6 (crown 24px), location/cart square r6; profile avatar kept round (r20). Category grid already 3/row (CategoriesGrid).
2. All Services (services.tsx ServiceCard): removed name minHeight:36 and reduced price marginTop 12->8 (tighter name<->price).
3. Customer dashboard Explore Services (HomeView.tsx): category tiles now image-fills (aspectRatio 1, no card padding/border) like homepage.
4. Global square: swept ALL card/button/chip/pill radii -> 6 across 60 Customer tsx files; round avatars (r20) + decorative blobs preserved. BookingCard Chip now r6. Category name already shown next to Order Id.
5. Booking Details (BookingDrawers PartnerCheckin): 'Within 50m of address' + 'View arrival location' hidden when status completed/paid (new done prop).

Verification: esbuild tsx parse OK on all 60 swept files. (Expo app not on running web preview; no browser test.)

## Customer App — UI change session 2 (2026-10-04)
1. Invoice logo (BookingDrawers InvoiceDrawer): ab colored logo (logo_light) prefer karta hai taaki white invoice par visible rahe. Header logo already isDark-aware (light->logo_light colored, dark->logo_dark white) — admin ko dark white logo upload karna hoga.
2. Subscriptions browse card (subscriptions.tsx): richer full-width card — icon + name + category + plans badge + full-width 'Choose a plan' button.
3. Tab buttons square: SegTabs radius 5->6; refunds/subscriptions/services tabs already 6 from prior sweep.
4. Refer & Earn (referral.tsx): top duplicate gradient hero card hata diya (code/copy/share neeche share-card me already hai).
5. Support chat (SupportThread.tsx): full-height chat panel (viewport fill) with composer bottom; ticket details/attachments/other-tickets ab header ke (i) Info button se Modal me khulte hain; real-time polling (3s) + auto-scroll to latest intact.
Verified: esbuild tsx parse OK (8/8). Expo app not on running web preview; no browser test.

## Customer App — session 3 (2026-10-04)
2. WebSocket/Real-time chat: SupportThread ab app ke SSE realtime channel (useRealtime subscribe) par — backend already emits 'support_message' & 'support_typing' (actor=agent) via rt.emit_user. On support_message -> instant refresh; on support_typing -> instant typing indicator (5s auto-clear). Polling 3s -> 15s safety net; __resync__ triggers refresh. (Transport = SSE, app ka true realtime channel.)
3. Subscription empty state: Browse Plans khali -> rich card (CalendarHeart illustration + 3 benefit rows + 'Explore all services' CTA -> /(site)/services).
1. Live Preview: NOT possible in this web preview — Customer is a native Expo app (node_modules absent, port 3000 = web_panel). Verify via Expo Go QR (expo_customer_qr.png) / dev build / deploy. All changes esbuild tsx parse-verified.

## Customer App — session 4 (2026-10-04)
Chat Sound (done): SupportThread.notifyNewReply() — new agent reply (realtime support_message) par expo-haptics Success haptic + job-ring.wav ko 0.4 volume par 1.2s ka short blip (web-guarded, try/catch). subscribe branch me refresh se pehle call hota hai.
Typing Echo (done/verified): customer keystroke par pingTyping -> POST /support/tickets/:id/typing -> backend rt.emit_admin('support_typing', actor:user) (symmetric). Throttle 3s->2s for snappier echo. Admin->customer typing session-3 me wire ho chuka. (Admin-side display web_panel me hai, already event receive karta hai — Customer app scope ke bahar.)
Verified: esbuild tsx parse OK.

---
## [2026-06] UI: 6px corner radius on all buttons / inputs / search boxes (Customer, Partner/Merchant, Web Panel)
Request: Make every button, input field and search box square-ish with a 6px corner radius across the whole app; leave cards/containers unchanged.

Implemented:
- Customer App (Expo): already standardized at borderRadius 6 — no change needed.
- Partner/Merchant App (/app/frontend, Expo): set theme tokens radius.sm & radius.md = 6 (feed shared Button + inputs; cards use radius.lg/xl, left as-is). Fixed hardcoded control radii in shared primitives (ui.tsx Button, reg/Fields, invoice.tsx tabs/buttons/SearchBox, AppShell, MerchantTopBar, HelpSOS, AdditionalWork, PosterControls, OtpFlow, OtpLogin, FilterSheet, support chat input). Page-level sweep set inline <TextInput> and centered filled <Pressable>/<TouchableOpacity> buttons to borderRadius 6.
- Web Panel (/app/web_panel, React/Tailwind): base ui components (button/input/textarea/select + Premium pickers) rounded-lg -> rounded-md (=6px). Page sweep converted all raw <button>/<input>/<textarea>/<select> tags' rounded-lg & rounded-xl -> rounded-md. Cards (<div>/<View>) untouched.
- Installed missing web_panel node_modules (craco) so the supervised preview runs.

Verification: web_panel preview compiles & loads (200); buttons, search boxes and inputs render at 6px, cards keep their rounding. frontend tsc shows only pre-existing type warnings (no new errors).

## [2026-06] UI follow-up: fully uniform 6px (cards, sheets, chips/pills) + shared token + focus ring
- Shared radius token: web_panel `--radius` -> 6px and tailwind borderRadius scale (DEFAULT/sm/md/lg/xl/2xl/3xl) all = var(--radius); `rounded-full` kept for circles. Native: theme.ts radius sm/md/lg/xl = 6 (pill kept 999). => future screens stay 6px automatically.
- Card Corners: all cards & sheets now 6px (token + circle-aware literal sweep of borderRadius 7–16 and sheet top-corner radii in RN; web cards via token).
- Pill Buttons: status chips & filter pills -> 6px. RN: pill-radius chips (paddingHorizontal + alignSelf flex-start) -> 6. Web: `rounded-full` -> `rounded-md` only on pill-like class strings (has px-, not a circle). Avatars/dots/icon-circles (equal w/h, grid, aspect) preserved.
- Focus Styles: web_panel input/textarea/select get a crisper 2px focus ring (ring-primary-300) that follows the 6px radius.
- Verified on web preview: uniform 6px across cards, chips, inputs, buttons; circles intact. frontend tsc: no new errors.

## [2026-06] Customer app: stat-card sliders + notifications page
- Added reusable horizontal `StatSlider` + `CARD_W` in src/components/customer/ux.tsx (snapping carousel, ~2 cards + peek).
- Invoices (app/(customer)/invoices.tsx): KPI cards now a swipeable slider (KpiCard gained optional `w` prop).
- Bookings (app/(customer)/orders.tsx): KPIs now a slider; removed the "Total Spent" card (and unused spent/fmtC/IndianRupee).
- Home (src/components/customer/HomeView.tsx): 5 quick-stat cards now a slider.
- Notifications: new full page app/(customer)/notifications.tsx (Clear all + per-item X delete via DELETE /notifications[/{id}]; opening marks all read via azo_notif_seen). NotificationBell.tsx now navigates to the page (no modal) and marks read; AppHeader bell repointed from ?notif=1 to /(customer)/notifications.
- Verification: static (transpile/syntax clean; reuses existing endpoints/components). Customer Expo app is not served in this env, so no live run/screenshot was possible.

---
## Update — 2026-10-04 (Custom Job visibility + Additional-work tax)

### Feature 1: Custom Job service visibility
- Admin can choose, per Custom-Job request, whether the converted+activated service is:
  - **all** (default): live for every customer in its category, like a normal service, OR
  - **requester_only**: private to the customer who requested it (hidden from everyone else).
- Backend: `custom_job_service.set_visibility` + `PATCH /api/custom-jobs/{id}/visibility`; service stores `custom_job_customer_id` + `custom_job_visibility`; catalog `list_services`/`get_service` are user-aware (via `get_current_user_optional`); `_service_visible` hides requester_only from public lists.
- Web admin: visibility toggle added in `CustomJobsAdmin.jsx` detail → Actions.
- Verified e2e (guest/other hidden, requester visible; detail 404/404/200; 'all' visible to all).

### Feature 2: Additional-work (rate-card) tax — matches normal billing
- `_recompute_additional` (booking_controller): product/part cost → NO GST, NO commission, 100% to partner. Service/labour charge → platform commission applies, and GST charged ONLY on the commission portion (like normal billing). Rate card `service_charge` + `labour_charge` are BOTH commissionable+taxable (frontend mapping fixed in Partner app `AdditionalWork.tsx` and web `JobWizard.jsx`; product cost entered separately).
- Verified: parts=500,labour=1000 → commission 320, gst 57.6, total 1557.6, partner 1180, platform 377.6. Product-only → gst 0, 100% partner.

### Backlog / follow-up
- Embed additional-work line items into the FORMAL generated PDF/Invoice Center documents (currently additional work shows in the in-app booking breakdown of all apps with correct tax, not yet in the 2-page GST PDF).
- Optional: add a manual product-cost entry field in the rate-card add sheet.

---
## Customer App — UI/UX fixes + custom-job flow (June 2026)
Scope: all changes in /app/Customer (Expo RN app).

Done:
- Home (HomeView): Explore Services redesigned as 3-col cards (space-between, no lone-card stretch); StatTile label forced single-line so Total Bookings card height matches siblings.
- Bookings (orders.tsx) & Profile (profile.tsx): "+ Booking" CTA changed from full-width to compact left-aligned pill (New Booking, radius 12, press-scale).
- Wallet, Refunds, Refer&Earn: 2x2 stat grids converted to swipeable StatSlider with uniform CARD_W tiles (fixes uneven last card).
- Profile photo: ProfilePhotoPicker now resolves stored path via mediaUrl() (was passing raw path -> blank circle).
- Support: "New Ticket" button no longer stretches full width; compact pill.
- All customer pages: CustomerShell scroll paddingBottom 112 -> 140 (extra bottom space).
- Site navbar: profile icon borderRadius 20 -> 6 to match the other squared nav icons.
- Site categories (Blocks CategoriesGrid): proper bordered cards, 3 per row.
- Site Services page search: added mic + VoiceSearchOverlay (same voice behavior as home AppSearchBar).
- Custom job: "View my requests" now routes to /(customer)/custom_jobs. Guest OTP+auto-login verified already working in wizard (verify-otp create_if_new default true -> token -> login()).

Open / needs repro:
- Custom-job -> service visibility on web panel. Backend (catalog_controller) already treats a converted custom-job service with custom_job_visibility="all" + status active + approved as a NORMAL service in all public list/detail endpoints both frontends use. No backend code bug found. Could not reproduce here (pod DB empty, backend/.env missing). Likely cause: service visibility left as requester_only, or stale web-panel cache.

Env note: this pod has empty Mongo + missing backend/.env, so backend/web-panel can't serve data here; Customer Expo app runs on device via EXPO_PUBLIC_BACKEND_URL. Verification was static (eslint clean on all 14 edited files).

## Customer App — filter/layout iteration 2 (June 2026)
- Support: filter buttons (All time / All statuses / Newest first) ab ek hi horizontal-scroll line me (flexWrap hटाया).
- Refunds: alag date-range row हटाई; status tabs ki line me ek Date filter (SlidersHorizontal OptionMenu) add kiya — sab ek scrollable line me. Stat cards slider (pehle se).
- Invoices: card-in-card हटाया — ab har invoice ek direct standalone card (border + shadow), Paginator neeche.
- Wallet: top-up amount input + Add Money ab dono flex:1 same size (h44); search+All types+All time ab ek line me (no wrap).
- Home: hero ke quick-action chips (Bookings/Wallet/Addresses/Support) हटाए; StatTile label single-line (Total Bookings ek line me).
Verification: eslint clean (only pre-existing warnings); Android bundle compiles (HTTP 200, no resolve/syntax errors). Preview served via Expo on port 3000; URL exp://5e34fdf6-...preview.emergentagent.com (open in Expo Go).
