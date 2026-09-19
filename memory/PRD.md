# PRD — AzoApp Partner + Merchant Mobile App (PartnerApp)

## Problem statement
Existing "AzoApp" home-service platform (FastAPI + MongoDB + React web panels for Customer/Partner/Merchant/Admin). Build ONE unified Expo (React Native) mobile app for BOTH Partner and Merchant roles — role auto-detected from the authenticated user. Reuse the existing backend/business logic (no duplication). The mobile UI must mirror the **web panel design** (appMode: floating glass bottom-nav + "All Menu" sheet, #F8F7FA bg, white rounded cards, primary #0D47A1 gradient active states).

## Stack (user-confirmed)
Expo SDK 57, React Native 0.86, TypeScript, expo-router. TanStack Query for data. expo-secure-store for token (auto-login). FCM (existing backend) for push/job-ring (build-only). Branding dynamic from GET /api/site/config.

## Architecture / setup notes
- Mobile Expo app lives at **/app/frontend** (served on port 3000 by the platform). `/app/PartnerApp` is a symlink to it (user-requested folder). Original web panel preserved at **/app/web_panel** (untouched, not served here).
- Created **/app/backend/.env** (was missing on import): MONGO_URL, DB_NAME=azoapp, JWT_SECRET, EMERGENT_LLM_KEY. Installed backend requirements (incl. litellm wheel + emergentintegrations --no-deps). Backend seeds demo data on startup.
- Same JWT backend as web; token as Bearer. Roles: partner/merchant/customer/admin (app supports partner+merchant only).

## Implemented (2026-06 · milestone 1)
- Splash (branded, dynamic) → Notification permission onboarding → Login/Register.
- Auth: Phone OTP (+91), Email/Password (if enabled), Register as Partner/Merchant, one-tap Demo logins. Auto-login persists; Logout clears secure token.
- Role routing: partner → (partner) tabs, merchant → (merchant) tabs, others → unsupported screen.
- **Web-style shell**: floating glass bottom-nav (gradient active icon squares) + "All Menu" bottom-sheet grid + Logout, on both roles.
- Partner: Home (wallet hero, earnings stat cards, online toggle, quick actions, active/new jobs), Jobs (Requests/Active/Missed chip row), Wallet (balance, ledger, withdrawals, withdraw modal), Profile (account, KYC, tools, support, logout), Booking Detail (pricing breakdown, timeline, Accept/Reject, call).
- Merchant: Home (wallet, commission stats, recent activity), Customers (search + list with tags), Wallet (commission ledger, withdraw), Profile (shop, KYC, tools, support, logout).
- Theme tokens from /api/site/config (admin-controlled branding/colors).
- Notification channels incl. loud "Job Ring" channel (Android).

## Verified
Backend 28/28 pytest pass (milestone 2). Frontend: all Partner + Merchant feature screens render live backend data, More-sheet navigation, and primary actions (PAN, add bank, availability set, support ticket create/reply/close) work. Invoices show real amounts; merchant network resilient; auto-login/role isolation intact.

## Milestone 2 (2026-06) — feature parity screens added
- Partner: Earnings Ledger, Bank & KYC (PAN + bank CRUD + primary), Availability (14-day calendar + online toggle), Invoices (+detail), Rewards (Challenges/Leaderboard/Bonuses), Analytics (KPIs+trend), Profile & KYC verification stages.
- Merchant: Commission (summary+history), My Network (stats+members), Analytics, Bank & KYC (shared component), My QR/Code (+copy/share), Reminders, Profile & KYC.
- Shared: Help & Support (tickets list + create + chat thread + close), Notifications list.
- Web-style floating glass bottom-nav + "All Menu" sheet wires every module.

## Remaining (next increment)
- Active-job lifecycle actions: start-OTP, complete, evidence upload, spare parts, additional items, live track, in-job chat.
- Reschedule / cancellation-preview / refund flows.
- Partner Starter Kit purchase, merchant customer history detail + tag edit + repeat-service, poster/QR config.
- FCM device registration + full-screen Job Ring alert (needs native build).

## Backlog (P1/P2 — remaining web feature parity)
- Full sub-screens for: Bank & KYC (PAN + bank add/verify), Availability/working hours, Invoices (list + PDF), Rewards & Challenges, Analytics charts, Starter Kit, Partner KYC wizard.
- Merchant: Scan QR (camera), Partner network tree, Commission analytics charts, Reminders/CRM, Referral.
- Active job lifecycle actions (arrived/start-OTP/complete/spare parts/evidence), Reschedule/Cancellation/Refund flows.
- FCM device token registration + job-ring full-screen alert (needs native build).
- In-app notifications list, chat, settings, dark mode toggle.

## Test credentials
See /app/memory/test_credentials.md (Partner 9000000003, Merchant 9000000002, OTP 123456).


## Session (2026-06 fork) — Partner Dashboard pixel-match to partner.png
- Header: notification bell with REAL unread count badge + theme toggle + settings cog + square initials profile chip
- Greeting card: Partner ID (partner_code AZP...) + city + Live, square avatar with green online dot
- Growth card: trophy + "Your growth" + "New Partner" pill, "% to Bronze" with "N jobs to go", green progress bar, "Completed X. Reach 10 to unlock Bronze."
- Accept Streak card: THIS WEEK label, accepted/missed row, reward box with detailed "Accept N more in a row" text
- Missed Requests: subtitle "Jobs you did not answer in time"
- Alert Check: "Background push: ON/OFF (device not registered)" + orange Fix link (requests notification permission)
- File: frontend/app/(partner)/index.tsx. Data all from real backend. Verified by testing_agent (frontend) — ALL PASS, no issues.


## Session (2026-06 fork) — 5 features shipped (all tested PASS, iter 56)
- Active Job flow + new "Active Job" bottom tab: navigate → before photo → start OTP → spare parts → after photo → complete OTP. File: app/(partner)/active.tsx. Backend: demo_otps added to /bookings/partner/active for demo partner.
- Job History: app/(partner)/jobs.tsx new "History" chip + search + All/Completed/Cancelled filters. Backend new GET /bookings/partner/history?status=.
- Payouts & Bank: app/partner/payouts.tsx (PAN + bank add/edit/delete/set-primary, eligibility). Wallet withdraw now bank-only with eligibility gate + payout banner.
- Invoice viewer: app/partner/invoice/[id].tsx renders exact web HTML template via WebView/iframe (GET /invoices/{id}/view). Linked from My Invoices.
- Merchant Dashboard overhaul: app/(merchant)/index.tsx rebuilt to match Partner design (header, commission navy hero w/ range chips, wallet card, stats grid, quick actions, recent activity).
- Bottom nav relabelled Dashboard/Job Request/Active Job/Wallet/More (matches partner.png). AppTabBar supports hideTabs.


## Session (2026-06 fork) — Registration Wizards (native) — tested PASS, iter 58
- Shared kit `frontend/src/components/RegKit.tsx`: ScoreRing/ScoreBanner (svg), Stepper, StatusBanner, UnderReviewCard, Field/PickRow/Rev, PickerSheet (searchable), PhotoField (camera/gallery choice + front-cam + optional GPS, uploads multipart), useServiceability + PincodeBadge, detectLocation (expo-location + /geo/reverse).
- Partner wizard `app/partner/register.tsx` rebuilt to full web parity: 5 steps (Basic/Work/Documents/Address/Review). Live photo REQUIRED (front camera + gallery), single-select category + experience, 12-digit Aadhaar + front/back upload with OCR feedback, education certificate when education set, merchant code + village, state/district/city cascade, pincode serviceability badge + out-of-area block, use-current-location for address, score banner, Rejected banner + Under-Review status screen.
- Merchant wizard `app/merchant/register.tsx` NEW: 4 steps (Owner/Shop/Address/Review). Owner live photo REQUIRED, shop name + type picker + single category, GST optional + upload, shop verification GPS photo (PUT /shop-photo), manual address + use-current-location + pincode badge, score banner, Under-Review screen. Submit gated on score=100.
- Added dep `expo-location` (+ app.json iOS location usage string, android FINE/COARSE_LOCATION, expo-location plugin).
- login.tsx already routes new partner→/partner/register, new merchant→/merchant/register.
- Backend: hardened both `/registration/upload` routes to catch OSError (PIL UnidentifiedImageError) → 400 instead of 500.
- Verified iter 58: backend 20/20 pytest PASS (score progression, submit→under_review, serviceability), frontend wizards render + validation + approved→Under-Review screen. Test report: /app/test_reports/iteration_58.json.

## Remaining after iter 58
- Cancellation & Refund flow (cancel job → cancellation fee + refund preview end-to-end) — NEXT P1.
- FCM push + full-screen Job Ring alert — needs native build + google-services.json (Future).

## Session (2026-06 fork) — Registration bug-fixes + app-wide keyboard UX
- **State/District/City cascade fixed (partner wizard)**: root cause (a) backend `/geo/*` returns `[{id,name}]` objects but mobile treated them as `string[]` → picker rendered/stored wrong; (b) picker cfg captured a STALE snapshot of `districts`/`cities` (empty during async load). Fix: partner register now uses public `/api/geo/states|districts|cities|villages` (like web), stores `o.name`, and `PickerSheet` receives LIVE options via `optionsKey` resolution on every render. Verified via screenshot: Bihar → districts list populates.
- **Photo-upload preview fixed (both wizards + active-job evidence)**: backend returns RELATIVE media URLs (`/api/media/file/...webp`). Browsers resolve them but RN `<Image>` cannot. Added `mediaUrl()` helper in `src/api/client.ts` (absolutises via `EXPO_PUBLIC_BACKEND_URL` origin). Applied in RegKit `PhotoField`, partner/merchant register review images, active-job before/after photos. NOTE: camera/gallery capture only works on device/Expo Go, not headless web — user must verify preview render on device.
- **App-wide keyboard fix** (`react-native-keyboard-controller` 1.21.9, already in deps): root wrapped in `KeyboardProvider`. Login + partner/merchant register now use `KeyboardAwareScrollView` (bottomOffset 24). Bottom-sheet modals with inputs (partner/merchant payouts AddBank, partner/merchant wallet withdraw, active-job reschedule + spare-parts) wrapped in nested `KeyboardProvider` + `KeyboardAvoidingView` (RN Modal breaks root provider). Bottom inputs now stay visible above keyboard.
- Verified iter 61 (testing agent) + main-agent screenshot: state loads, district cascade works, typing works, zero red-box. Files: app/(auth)/login.tsx, app/partner/register.tsx, app/merchant/register.tsx, src/components/RegKit.tsx, src/api/client.ts, app/_layout.tsx, app/(partner)/{active,wallet}.tsx, app/(merchant)/wallet.tsx, app/{partner,merchant}/payouts.tsx.

## Remaining (user-requested, Phase B — next)
- A-Z Web-Mobile-View ↔ Mobile-App UI/UX parity audit (fonts/weights/colors/icons/spacing/buttons/toasts/empty-error-loading states) screen-by-screen.
- Hunt & remove any hardcoded dynamic content (categories/services/prices/charges/tax/platform-fee/visiting-emergency-charge) → keep 100% backend-driven.

## Session (2026-06 fork) — SDK-57 latest + Global Public Sans font + Merchant cascade + hardcoded audit
- **SDK bumped to latest 57** via `npx expo install --fix` (expo 57.0.23, expo-* patches, react-native-web 0.21.2, typescript 6). app.json auto-added expo-font/expo-image config plugins. No runtime break.
- **Global "Public Sans" font (matches web)**: downloaded 5 static weights (400/500/600/700/800) to `assets/fonts/`, loaded via `useFonts`. `src/lib/globalFont.ts` → NATIVE: patches `Text`/`TextInput`.render to inject the correct PublicSans weight family (skips elements with explicit fontFamily so MDI icons untouched). WEB: RN-Web ignores the render-patch, so we inject a `<style>` mapping loaded per-weight faces into one `PublicSansX` family via `local()` + `#root * { font-family: PublicSansX,... }`. Verified web computed font = PublicSansX, icons still MaterialDesignIcons, zero crash. (Earlier crash `CSSStyleDeclaration indexed property` fixed by not passing array style to cloneElement.)
- **Merchant address cascade (NEW, beyond web parity per user ask)**: `app/merchant/register.tsx` step 3 now has State→District→City dropdown cascade (public `/geo/*`, live `optionsKey` PickerSheet), same pattern as partner. Photo-gated steps (owner photo) block reaching it on headless web — verify on device.
- **Hardcoded content audit**: only real hardcoded price was the partner dashboard test-job-ring demo string ("Wiring & Fitting · ₹1,200") → made generic. Everything else (categories/shop_types via /meta, prices/charges/tax via booking breakdown + invoice, rating via user.rating) already 100% backend-driven. `CHARGE_LABEL` in invoice is a key→label map (amounts still from backend) — kept.

## Session (2026-06 fork) — Expo Go crash fix (notifications) — tested PASS, iter 59/60
- Bug: red-box on Expo Go from `src/lib/notifications.ts` top-level `import * as Notifications from "expo-notifications"` (SDK 53+ removed remote push from Expo Go).
- Fix: expo-notifications is now lazily `require()`d ONLY on real dev/prod builds. `pushSupported = Platform.OS !== "web" && Constants.executionEnvironment !== StoreClient`. In Expo Go AND on web every notif call is a safe no-op (channels/permissions/scheduleJobRing return gracefully). Removed direct expo-notifications import from notifications.ts and app/(partner)/index.tsx (now use getPermissionStatus/requestNotificationPermission/scheduleJobRing helpers).
- Verified iter 60: test-job-ring shows info toast (no crash), 0 boot errors, dashboards + wizards load.

## Session (2026-06 fork) — Partner Web-Mobile-View 1:1 parity (user screenshots) — tested PASS, iter 63
- NEW `src/components/AppShell.tsx`: `AppShellHeader` (web PanelLayout appMode header: floating glass card, brand wordmark/logo + tagline, bell w/ unread badge (30s poll), sun/moon theme toggle, divider, profile chip → dropdown Edit Profile/Logout), plus web kit primitives: `StatusBadge` (kit.jsx tone map), `Surface`, `KitEmpty`, `SegTabs`, `KV`, `money()`, `shortDate()`.
- `AppTabBar`: circular gradient active icon (44px), labels Dashboard / Job Request / Active Job / Wallet & Withdraw / More, red ring badges via `badges` prop (partner `_layout` feeds open-request + active counts). More sheet = web NAV order (My Availability, Bank & KYC, Earnings Ledger, Job History, My Invoice, Rewards & Challenges, Analytics, Profile & KYC, Notifications, Help & Support).
- `app/(partner)/jobs.tsx` REBUILT = web `JobRequest.jsx`: online status bar + Refresh, radar empty card w/ "Live dispatch connected · Updated HH:MM", request cards (accent strip, Est. earning, SVG countdown ring from /auth/config job_auto_expiry_minutes, Distance/Travel/Payment/Requested chips, itemised services/add-ons, coupon note, Accept Job / Decline). Old History chip → `app/partner/history.tsx` (More → Job History).
- `app/(partner)/active.tsx` REBUILT = web `ActiveJob`/`CompletedJob`: Active/Completed chips (primary/emerald), dashed Empty, CompletedJob (green gradient header, status badge, address, Customer/Job value, YOU EARNED, timeline collapse), ActiveJob (state banner, header, address+distance, JobStepper, demo OTP hint, Navigate, Call/Chat, collapsible details w/ services + earning + masked phone, timeline, Before/After PhotoBlock 3/3, 4-box OtpBoxes, Verify & Start / Complete Job, Reject, Request Reschedule, reschedule pending card, Additional work/spare parts). All existing mutations preserved.
- `app/(partner)/wallet.tsx` REBUILT = web `PartnerWalletV2.jsx`: blue hero (AVAILABLE BALANCE, trend pill, 3 boxes, white Withdraw Money, Secured payouts), amber KYC blocker, KPI grid, SegTabs overview/transactions/withdrawals, TxRow/WdRow, tx & withdrawal detail bottom sheets (KV + timeline), multi-step WithdrawFlow (amount + quick chips → bank select → review → confirm → success) using /partner/wallet/config.
- Dashboard `index.tsx`: header swapped to AppShellHeader, greeting "👋", Withdraw button icon.
- Verified iter 63 (testing agent, frontend): all tabs/flows PASS, zero console errors. Merchant screens NOT yet re-skinned to this shell (next when user shares merchant screenshots).

## Session (2026-06 fork) — Partner More sub-pages web parity — tested PASS, iter 64
- `app/partner/invoices.tsx` = web MerchantInvoices(role=partner): AppShellHeader, "My Invoices" title + subtitle + name chip, search + filter/sort/refresh icon buttons, range chips, horizontal stat cards (INVOICES/TOTAL AMOUNT/PAID), cards w/ View / Download (→ detail `?download=1` auto-opens print sheet) / ⋯ Share, client-side pagination (10/25 per page).
- `app/partner/earnings.tsx` = web EarningsLedger: blue hero Total Earnings + WALLET BALANCE (GET /wallet/partner/earnings), TODAY/THIS WEEK/THIS MONTH/LIFETIME cards, Earnings Trend LineChart (earnings-summary.daily), Payout History (completed withdrawals), Earnings Ledger rows (#code · Gross · Comm · +net) with tap-to-expand commission breakdown + pagination.
- `app/partner/payouts.tsx` (Bank & KYC) = web BankKyc: blue hero (Complete KYC to withdraw / Pending pill / blockers / PAN Card + Bank Account chips / KYC DONE ring), PAN Card card w/ inline PAN input + image + Submit + lock note, Bank Accounts card w/ "+ Add bank" + empty state + bank rows (PRIMARY tag, status, set primary/remove). PanModal removed (inline). ProgressRing gained `trackColor`/`light` props.
- `app/partner/availability.tsx` = web AvailabilitySection: light-blue info card w/ AVAILABLE DATES x/7 progress, full month calendar (prev/next, S-S header, past greyed, today ring, Available/Not avail./Awaiting cells, tap toggles via POST /partner/availability/calendar/set, max-7 guard), legend, "Next available dates" list.
- Known minor: invoice filter & sort icons both open the sort tray; ledger page-size fixed 25; API can't revert a day to "awaiting".
- Earnings Ledger: tap row → bottom sheet 'Earning Details' (web Sheet 1:1: NET EARNING, status badge, partner/platform split bar + legend, Job / Service Cost / Partner Commission % / Platform Commission % / Est. Govt. Taxes / Net Earning rows). Verified via screenshot.

## Session (2026-06 fork) — More menu + Starter Kit / Rewards / Analytics / Profile&KYC parity — tested PASS, iter 65
- More sheet (AppTabBar) = web AppMoreSheet: "All Menu" + X, 3-col rounded-20 tiles w/ 56px circle icons, active tile blue gradient, pink Logout. Partner items fixed to web NAV (9): My Availability, Bank & KYC, Earnings Ledger, My Invoice, Rewards & Challenges, Analytics, Starter Kit, Profile & KYC, Help & Support. (Job History/Notifications tiles removed; /partner/history route still exists.)
- NEW `app/partner/starter-kit.tsx` = web PartnerStarterKit (sales hero, What's inside, Why partners love it; owned view w/ delivery tracking + renewal). Purchase: /starter-kit/order → free/mock handled; real gateway → info toast (Razorpay checkout not wired in mobile).
- `app/partner/rewards.tsx` = web ChallengesRewards (hero, Auto Payout, 5★ Streak, My Bonuses, Closest reward ring, Your Challenges, Penalties).
- `app/partner/analytics.tsx` = web PremiumAnalytics(partner): preset chips + custom range, 4 gradient KPIs, Earnings Trend, Jobs per Day bars (SVG), Status Split donut (SVG), Average rating, Rating Breakdown, Recent Reviews.
- `app/partner/verification.tsx` = web PartnerProfileView (approved) with onboarding banner → /partner/register when not approved; doc zoom modal.

## Session (2026-06 fork) — Global nav, theme #0659B2, Support parity, interactive charts — tested PASS, iter 66
- All partner sub-pages moved to `app/(partner)/partner/*` (hidden Tabs.Screen href:null) so floating bottom nav is on every page; `/partner/support(/[id])` & `/partner/notifications` are re-export wrappers of shared screens. More sheet tiles get `active` from usePathname. `app/partner/register.tsx` stays outside (no nav).
- Theme: BASE_BRAND primary #0659B2; `palette()` in theme.ts mirrors web genPalette (HSL 50–900 → hex): primarySubtle=P50 (#F0F7FE), secondary=P600 (#097CF6), primaryHover=P700, primaryDark=P800. Backend DEFAULT_SETTINGS + DB settings.theme updated to #0659B2/#1E7AD6. Hardcoded #0D47A1/#1565C0/#0A387E in partner screens replaced with colors.primary/secondary/primaryDark.
- Support list (`app/support/index.tsx`) = web SupportCenter header: title + ticket count line, green New Ticket, search + All time / All statuses / Newest first dropdowns (client filters), dashed empty card.
- Charts: LineChart tap tooltip (date + value, marker line) — used on Dashboard & Analytics; Analytics BarChart tap tooltip; Status Split legend tap highlights slice + center label.
- Known gaps vs web (partner): Razorpay checkout for Starter Kit (mobile shows info toast for real gateway), SSE live dispatch (mobile polls 10s), onboarding tour, web-push. History chip removed from Job Request (still at /partner/history).

## Session (2026-06 fork) — Live SSE dispatch + full-screen Job Ring — tested PASS, iter 67
- `src/context/RealtimeContext.tsx` (RealtimeProvider in root _layout inside AuthProvider): react-native-sse → GET /realtime/stream?token=JWT, backoff reconnect, `__resync__` on reconnect, close on background / reconnect on foreground, `subscribe()`, `playRing()/stopRing()` (expo-audio, looped `assets/sounds/job-ring.wav`) + haptics.
- `src/components/JobRingOverlay.tsx` mounted in partner Tabs layout: `job_request` → full-screen ring (sound loop + Vibration pattern, 45s countdown, Accept → /bookings/{id}/accept → Active Job; View → Job Request; Decline → /reject). `job_taken` clears; job_accepted/booking_update/__resync__ refetch; reschedule_request → toast. Test rings (is_test) just dismiss.
- Dashboard "Send me a test job ring" → POST /partner/test-ring (server SSE emit) with local-notification fallback. Jobs polling 60s when SSE connected (10–15s otherwise). Footer "Live dispatch connected" driven by SSE state.
- Deps added: expo-audio ~57.0.5, react-native-sse ^1.2.1. Sound/vibration/notification only on real device build (Expo Go: overlay works, sound may work, push doesn't).

## Session (2026-06 fork) — Partner Dashboard = WEB PANEL parity (deep port) — tested PASS, iter 68
- Studied web `PartnerDashboard.jsx` home tab + `PartnerHomeV2.jsx` + `PartnerAlertsPanel.jsx` + `MissedRingRecovery.jsx` + `TestRingCard.jsx` + `lib/ringPrefs.js`; rebuilt `app/(partner)/index.tsx` with the SAME section order, copy, colours (Tailwind hexes in `home/tw.ts`), icons (MDI equivalents of lucide) and Public Sans font.
- New files: `src/components/partner/home/{HomeSections,EarningsHero,AlertsPanel,MissedRingRecovery,HomeBanners,tw}.tsx`, `src/lib/ringPrefs.ts`.
- Sections: MissedRingRecovery (GET /bookings/partner/missed, Grab now → POST accept) → Pro perks (premium/kit) → Onboarding banner → Header (initials gradient avatar, Pro badge, partner_code, city, Live=SSE connected, Online toggle → PUT /auth/partner/online-status) → Priority action (KYC/active/requests/starter kit) → Earnings hero (slate-900 + radial gradients + grid, 7D/30D/90D/1Y/All + Custom calendar range sheet, Today/Week/Month, sparkline) → Wallet → 8 KPI tiles → Earnings trend → Performance rings → Growth (+alerts list) → Recent jobs → Quick actions → Alert check (POST /partner/test-ring, device state via /notifications/my-devices, result row w/ "You accepted it in Xs") → Smart Snooze (local+server /partner/alert-prefs snoozeUntil, countdown, resume; ring overlay skips non-emergency while snoozed) → Accept Streak card (/partner/stats, badge tiers, week bar, reward payout) → Missed Requests (device-local, Re-grab re-opens ring).
- Business logic added: GPS ping while online → POST /partner/location (expo-location watch), SSE job_request toast + invalidation, /bookings/{id}/seen on ring, timeout → local missed store.
- Follow-up (same session): matched WEB MOBILE VIEW (360px) exactly — hero range chips horizontally scrollable, Today/Week/Month labels wrap like web, rating pill never clipped, online toggle shows Switch only (web hides text < sm), streak card stacked single-column, alert-check button auto-width. Theme colours come from admin /site/config palette (primary-700 = P[700], primary-600 = P[600], primary-50 = P[50]) exactly like web genPalette.

---
## 2026-06 — Merge: AzoAppLiveWithApp → AzoApp-Peoduction (missing files)
- Imported NodewapTechnology/AzoAppLiveWithApp and compared against production (/app).
- Finding: application source (backend/frontend/web_panel) was ALREADY identical between the two repos. Only env/URL-config files differed, where production's values were preserved (not overwritten).
- Action: copied 298 files that were MISSING in production (root-level test/QA scripts, seed_rate_cards.py, memory docs, screenshots, test_reports). Additive only — nothing removed or overwritten (rsync --ignore-existing). Skipped .git/.emergent/.gitconfig to protect platform config.
- Restored empty backend/.env (MONGO_URL, DB_NAME) and frontend/.env (EXPO_PUBLIC_BACKEND_URL) so the app boots. Backend /api/ → 200; seeds ran; Expo Metro live on :3000.

## Session (2026-06) — Partner Earnings hero fix (native/Expo Go)
- Root cause: HeroBackdrop Svg used `width="100%"`/`inset:0` → on native it resolved against the padding box, leaving the right/bottom edge of the hero without dark background (white text/cards became invisible = "clipped").
- Fix: EarningsHero measures itself (onLayout) and draws backdrop in real pixels + solid slate900 fallback bg. Sparkline got 6px side padding so the end dot isn't clipped.
- Range change no longer shows skeleton: `placeholderData: keepPreviousData` on partner-dashboard query + small spinner in hero while updating.
- Expo Go URL: exps://live-app-staging.preview.emergentagent.com (QR at /app/memory/expo_qr.png).
