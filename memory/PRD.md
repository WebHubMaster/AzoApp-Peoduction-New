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
