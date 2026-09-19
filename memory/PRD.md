# AzoApp — Home Service Platform (Multi-app)

## Apps
- /app/backend  — FastAPI on 8001, MongoDB `azoapp`, auto-seeds demo data. Emergent LLM key set.
- /app/web_panel — React CRA/craco web app, default preview on port 3000 (supervisor `webpanel`).
- /app/frontend — Expo (React Native) app for **Partner & Merchant only** (Expo Go tunnel, port 8081).

## Mobile app (Expo) — Partner & Merchant Auth + Registration
Source of truth = the web panel flows; mobile is a functional 1:1 port against the SAME backend.

### Login / Auth (DONE & verified)
- `app/(auth)/login.tsx` + `src/components/auth/{OtpLogin,ForgotPasswordSheet,AuthKit}.tsx`.
- Flows: OTP login (send/verify), new-user signup with role pick (Partner/Merchant), email login, forgot/reset password, one-click demo login (Partner/Merchant only).
- Role gate: only partner & merchant admitted; admin/customer rejected (token never stored). Customer auth fully excluded.
- Backend: `/auth/{config,demo-status,send-otp,verify-otp,email,forgot-password,reset-password,me}` — all verified (4 demo roles + fresh partner/merchant OTP signup work).

### Registration (DONE & verified)
- Partner wizard `app/partner/register.tsx` (5 steps: Basic, Work, Documents/KYC, Address, Review) → `/partner/registration/*`.
- Merchant wizard `app/merchant/register.tsx` (4 steps: Owner, Shop, Address, Review) → `/merchant/registration/*`.
- Shared kit `src/components/RegKit.tsx`: score ring, stepper, status banners, under-review card, dynamic pickers (searchable), photo capture (camera/gallery) with upload, shop GPS photo, pincode serviceability, current-location detect, review rows.
- Dynamic data from backend: educations, experiences, categories, shop_types, geo cascade (states→districts→cities→villages), serviceability. Nothing hardcoded.
- Verified against real backend: fresh signup → meta/profile load → PUT sections increment score (partner 4→26, merchant 8→22→52) → dynamic `missing` list → geo cascade + serviceability all working.
- Bank/UPI/KYC collected later at first withdrawal (matches web) via FinanceKyc / payouts screens.

### Registration UI — pixel-parity rebuild (Jun 2026)
- Both wizards rebuilt to match the web panel's mobile view 1:1 (design, copy, icons, validation, API calls).
- New kit `src/components/reg/`: `tokens.ts` (Tailwind hexes, primary palette), `Shell.tsx` (gradient brand bar + Logout, score ring banner, white card, footer), `Fields.tsx` (Field/WInput/WTextarea/Combo/WSelect/WButton/steppers/pills/banners/ReviewCard/RegNav/useServiceability), `DatePicker.tsx` (PremiumDatePicker port, bottom-sheet calendar), `Photo.tsx` (Uploader & GpsPhotoCapture: camera + gallery; LivePhotoCapture: CAMERA ONLY — gallery removed on user request, same as web), `MapPreview.tsx` (OSM WebView embed).
- Icons now `lucide-react-native` (same set as web). Old `RegKit.tsx` removed.
- Partner: 5-step stepper (round icons), validation identical to web, submit = POST /submit only. Merchant: compact "Step x of 4" progress bar, plain text City/District/State/Pincode inputs, "📍 Use Current Location" + map, submit disabled until score 100, approved → view-only nav.
- Verified via Expo web (localhost:8081) side-by-side with web panel at 412px: all steps of both wizards render & save correctly.

### Fix applied earlier
- `app/index.tsx` cold-start auto-login now mirrors login `home()`: incomplete / under-review partners & merchants route to their registration wizard instead of the dashboard.

### Verification notes
- App bundles for Expo Go (Android bundle HTTP 200, ~12.6 MB). `tsc --noEmit` clean.
- Flows verified at API-contract + bundle level via curl (Expo Go UI can't be browser-automated).

## Demo Accounts (OTP 123456)
Admin +919000000000 · Merchant +919000000002 · Partner +919000000003 · Customer +919000000004

## Deliverables
- Web panel: https://registration-cleanup-1.preview.emergentagent.com
- Expo Go tunnel (changes on restart): exp://up1acxk-anonymous-8081.exp.direct

## Backlog / Next
- Optional: onboarding-status guard inside (partner)/(merchant) tab layouts (defense-in-depth).
- Optional: Expo web build for automated UI regression.
