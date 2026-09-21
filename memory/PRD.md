# AzoApp — Premium Home Services Website & Admin Panel

## Architecture
- **Backend**: FastAPI (`/app/backend`) on port 8001, MongoDB (`azoapp_database`). Auto-seeds demo data on startup.
- **web_panel** (`/app/web_panel`): React (CRACO) website + customer/partner/merchant/admin panels. Runs on port 3000 → served at the preview URL. Managed by supervisor program `webpanel` (`/etc/supervisor/conf.d/webpanel.conf`, polling watchers to stay under the pod inotify cap).
- **frontend / PartnerApp** (`/app/frontend`): Expo (React Native) partner+merchant mobile app. Supervisor `frontend` program runs it on 3000 by default but is STOPPED so web_panel can use 3000.

## Preview URL
https://partner-panel-kyc.preview.emergentagent.com  → web_panel (LIVE)

## Demo login (OTP always 123456, demo_mode ON)
- Admin +919000000000 · Merchant +919000000002 (Sharma Electricals, code 3L6MKM3) · Partner +919000000003 · Customer +919000000004

## Work log
- 2026-06: Fresh-container restore — created backend/.env + frontend/.env, installed deps, seeded DB. All endpoints 200.
- 2026-06: **Removed the Partner "Payment Summary" block** (`PartnerEarningSummary`) from the Active Job screen — web (`web_panel/src/pages/partner/PartnerDashboard.jsx`) + mobile (`frontend/app/(partner)/active.tsx`). "Services to do" (`ServiceBreakdown`) and everything above it kept intact.
- 2026-06: **Aligned partner reschedule calendar to the customer's** `SchedulePicker` — mobile `frontend/src/components/CalendarSlotPicker.tsx`: rounded day cells (was circular), 3-column slot grid (was 4), removed the extra "X left / Past / Full" caption line (customer doesn't show it), append "·Full" to full slots. Partner WEB already uses the identical `SchedulePicker` component + font (Public Sans), so no web change needed.

## Constraints from user
- Do NOT touch any notification-related code without explicit permission.
- Do only what is asked, no extra features.

## Known environment limitation
- Single public port (3000). web_panel occupies it (user's choice). A phone-scannable Expo Go QR needs a public tunnel; the bundled `@expo/ngrok@4.1.3` errors in this pod. Options: temporarily flip the preview URL to Expo to grab a QR, or run Expo LAN + external tunnel.

- 2026-06: **Partner Wallet & Withdraw (mobile)** — confirmed `frontend/app/(partner)/wallet.tsx` is a faithful 1:1 port of web `PartnerWalletV2.jsx` (same APIs `/partner/wallet`, `/wallet/config`, `/withdrawals`, `/finance-kyc` + POST withdraw; same hero/KPI/SegTabs/tx+wd cards/detail sheets/5-step WithdrawFlow). Fixes: set `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to the preview backend (was falling back to prod `api.webhubmaster.shop`, so the phone app wasn't hitting this backend/demo data); added the missing 2nd hero decorative blob for pixel-parity. Backend APIs verified 200 for partner +919000000003 (balance ₹449.25).

## Backlog / Next
- Provide a reliable Expo Go device preview (tunnel or temporary preview-URL flip).
- Optional: remove now-dead `PartnerEarningSummary`/`EarnRow` inline definitions in mobile `active.tsx` and the unused `PartnerEarningSummary.jsx` (kept for now to minimize edits).
