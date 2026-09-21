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

## Update (2026-06): Partner Bank & KYC — mobile↔web parity
- Mobile partner Bank & KYC screen = `frontend/app/(partner)/partner/payouts.tsx` (screen in user's screenshot).
- Web reference = `web_panel/src/pages/partner/modules/BankKyc.jsx`.
- Rebuilt mobile page to full parity with web (logic + UI + API + spacing):
  - Hero: removed extra vertical gap; status chip now inline with title; "PAN Card" / "Bank Account" chips on ONE responsive wrapping row (was stacked/2-line); hero turns green when eligible.
  - PAN: added approved (locked+View), pending (under review+View), rejected (reason banner + resubmit) states; Submit now requires PAN image (backend mandates pan_url).
  - Banks: added View Passbook, UPI display, rejected reason; Set primary only when approved.
  - Add-bank sheet: added "Confirm account number" (mismatch guard) + UPI.
  - Added DocViewer modal (image/pdf lightbox).
- Web: hero step chips polished to one tidy non-wrapping-internally row.

## Update (2026-06 #2): Partner Bank & KYC — completed remaining web-parity gaps
- Fixed the main missed item: mobile now uploads PAN/passbook images via the SAME backend flow as web — POST /partner/registration/upload (multipart via uploadAsset) → stores returned {url}, instead of raw base64. New UploadTile shows uploading/upload-done states + preview.
- Add-bank sheet now uses uppercase field labels + validation identical to web (holder/account/ifsc/passbook required, confirm-number must match; bank name optional).
- Bank card subtitle now mirrors web exactly: "{holder} · A/C {account_number} · {ifsc} · UPI {upi}".
- Ring label "KYC done" (matches web wording).
- Routing fix: partner Profile → "Bank & KYC" now opens /partner/payouts (rich parity screen) instead of the old simple FinanceKyc screen. All partner entry points (dashboard/more/wallet/profile) now land on the same screen.
- tsc: 0 errors.

## Update (2026-06 #3): Bank & KYC upload — camera + live % bar
- UploadTile (payouts.tsx) now offers Camera OR Gallery via shared SourceSheet + pickImage (back camera, permission handling).
- Real upload progress: switched to XMLHttpRequest (RN upload.onprogress) → shows "Uploading… N%" + a brand-colored progress bar, same as web. Web platform falls back to uploadAsset. Same /partner/registration/upload endpoint.
- tsc: 0 errors.

## Update (2026-06 #4): Partner Earnings Ledger — mobile↔web full parity
- Web ref: web_panel/src/pages/partner/modules/EarningsLedger.jsx (+ kit.jsx, charts.jsx, lib/api fmt/fmtC).
- Mobile: frontend/app/(partner)/partner/earnings.tsx rebuilt to match web mobile view 1:1:
  - Hero gradient primary-800→700→600 (primaryDark/primaryHover/secondary); Total Earnings fmtC + jobs + wallet chip.
  - KPIs use full fmt() numbers (was fmtC), removed underline.
  - Earnings Trend: added 7/14/30-day range segmented + daily.slice(-range).
  - Payout History now from sum.payouts (all statuses) with amount+method+date+StatusBadge; removed separate /partner/withdrawals query.
  - Ledger net = net_earning ?? partner_earning; web-accurate Pagination (page-size menu 10/25/50/100 + page-number window).
  - Earning Details sheet 1:1 (split bar + rows).
- Endpoints: GET /wallet/partner/earnings, GET /partner/earnings-summary. tsc: 0 errors.
