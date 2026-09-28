# AzoApp — Home Services Platform (PRD / working notes)

## Overview
Multi-app on-demand home-services platform (like UrbanClap), imported from another account.
- `/app/frontend` — Partner + Merchant app (Expo / React Native, expo-router). Preview: https://keyboard-fix-suite.preview.emergentagent.com
- `/app/Customer` — Customer app (Expo / React Native).
- `/app/backend` — FastAPI + MongoDB (`azoapp` db). ~150 iterations of history.
- `/app/web_panel` — Admin + Customer web panel (CRA/craco).

Auth: mobile-OTP (demo mode → OTP `123456`). Branding/theme/gateways are admin-driven (Integration Center + Branding & Theme).

## Session log

### 2026-06 (current session) — Partner app first
**CRITICAL environment fix**
- `backend/.env` was MISSING (import lost it) → backend crashed on `KeyError: 'MONGO_URL'`; nothing ran.
  Recreated `backend/.env` (MONGO_URL=mongodb://localhost:27017, DB_NAME=azoapp, JWT_SECRET, CORS_ORIGINS=*,
  CACHE/FCM encryption keys). Backend now boots + seeds.
- Added `frontend/.env` → `EXPO_PUBLIC_BACKEND_URL=<preview origin>` so the Expo web preview talks to the
  local backend SAME-ORIGIN (no CORS). Native EAS builds are unaffected (eas.json pins the prod backend).

**Dark mode (app-wide) — FIXED & verified**
- Root cause: `src/theme.ts` ThemeProvider initialised `override` from `forcedMode` once and never re-synced.
  `forcedMode` (admin default_mode) arrives late (after /site/config), so dark mode applied inconsistently
  (some screens light, some dark — the user's "dark mode not working" complaint).
- Fix: useEffect syncs `override` to `forcedMode` (gated by a `userPinned` ref so manual toggle wins),
  persist manual choice to storage (`azo_theme_override`) + hydrate on mount, and toggle reads latest via a
  ref (fixes first-click no-op). Verified via headless-chrome harness + testing_agent: dashboard, Rewards &
  Challenges, My Availability, Starter Kit all render dark uniformly; first click flips; survives reload.

**Verified already-done items (Partner)**
- Welcome screen: one-screen fit, dynamic admin logo, realistic man in navy polo w/ AzoApp logo, consistent FS font scale.
- Login/Register: OTP flow works end-to-end (send-otp demo → verify-otp → dashboard). Phone input capped at 10 digits.

## Verification tooling
- Screenshot tool times out on the ~16MB Expo web bundle. Use headless chrome:
  `/app/scripts/pshot.js` (login + capture partner screens) and `pshot_dark.js` (dark toggle/persistence),
  run with `node` after `npm i puppeteer-core` in /tmp. RN `testID` → DOM `data-testid`.

## Backlog (from user; Partner → Customer → common)
### Partner app
- [DONE] Welcome/login/signup scroll-fit + consistent font + character/logo dynamic.
- [DONE] Dark mode across Reward&Challenge / My Availability / Starter Kit (+ everywhere).
- [P1] Job Complete wizard: selfie capture not opening (was working) — device/camera; needs device verify.
- [P1] Keyboard slide-up: input rises above keyboard on every typing screen (KeyboardProvider already wired; audit per-screen).
- [P2] Minor dark-mode polish: a few hardcoded light accent cards (starter-kit item image bg, streak-freeze card).

### Customer app (priority #2)
- Booking flow: ask mobile → OTP verify → if new user also ask name, then proceed.
- Login/signup phone input: keep first 10 digits (don't drop leading digit past 10).
- Payment gateway: honor admin Integration Center active gateway + test/live mode (all gateways).
- Global icon beside notification → opens customer web front (mode-aware, dynamic logo).
- All service cards: uniform size + "Book Now" (outline/border button, not filled) everywhere.
- Search box: square-ish (3–5px radius), larger single-line font.
- Booking tabs (Active/Searching…): square-ish (3–5px radius).
- Profile click when logged-in → customer panel home (not profile screen).
- Keyboard slide-up on all typing screens.
- Full dark mode (home blocks, service detail, checkout — remove hardcoded #fff).
- Wallet: move top scratch cards into a dedicated "Reward & Cashback" menu (View all → new screen).
- View Invoice: show preview + Download PDF + Open/Print.
- Profile pic: reflect in top nav after save.
- Inputs: larger font everywhere.

### Common / infra
- Admin Branding&Theme Primary color must drive the whole app's primary (dynamic).
- Live gateway (Razorpay test) end-to-end on a device build.
