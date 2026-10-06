# AzoApp — PRD / Working Notes

## Problem statement (this session)
User (Hindi): Customer Web Panel & Customer App — (1) subscription (maid) booking me date & time par
proper custom date/time **picker** aana chahiye; (2) **payment nahi ho raha** — "bina payment ke
subscription purchase ho jata hai, payment pending rehta hai". User: test karo & fix karo.

## Architecture (monorepo)
- `/app/backend` — FastAPI + MongoDB (auto-seeds on startup). API prefix `/api`.
- `/app/web_panel` — CRA React web app (Customer + Admin + Partner web panel). **Served on :3000** (supervisor `frontend` → `cd /app/web_panel && yarn start`).
- `/app/Customer` — Expo customer app (not served in preview).
- `/app/frontend` (symlink PartnerApp) — Expo partner app.

## Root cause found (2026-10-06)
- `.env` files were MISSING (pod reset) → backend crashed on import with `KeyError: MONGO_URL`.
  The WHOLE backend was down → that is why "payment nahi ho raha / sab pending". The DB was also empty.

## Done (2026-10-06)
- Restored `/app/backend/.env` (MONGO_URL, DB_NAME=test_database, JWT_SECRET, PUBLIC_APP_URL) and
  `/app/web_panel/.env` (REACT_APP_BACKEND_URL) and `/app/Customer/.env` (EXPO_PUBLIC_BACKEND_URL).
- Backend restarted → auto-seeded (incl. Full-time Maid: Daily ₹400 / Weekly ₹2200 / Monthly ₹8000).
- Installed `/app/web_panel` node_modules (craco) — frontend now compiles & serves.
- **Bug fix:** backend rejected the `daily` plan ("Invalid plan type"). Added `daily` in
  `controllers/subscription_controller.py` (create_subscription) and `services/subscription_service.py`
  (plan_preview). Daily subscriptions now create + are returned by `/subscriptions/plans`. Verified via curl.
- Date/time picker: already a **custom calendar + time-slot picker** (`SchedulePicker`) in both web panel
  (`components/site/SchedulePicker.jsx`) and Customer app. NOT native inputs. Verified by testing agent on
  mobile (390) + desktop.
- Payment behaviour: with no gateway, subscription stays `pending_payment` and a clear error toast shows;
  **no silent activation** (user's bug not reproducible now). Verified by testing agent.
- Mobile UX: removed the floating Custom-Job FAB + "Turn on alerts" push-nudge from `/service/:id` and
  `/book` so they no longer cover the "Book Now" / "Confirm & Pay" CTA (`CustomJobFAB.jsx`, `PushRegistrar.jsx`, `App.js`).
- Verified Admin → Integration Center gateway-save path: saving Razorpay test keys flips resolver to
  `configured:true` (then reverted so preview is clean). User will add their own Razorpay/Cashfree keys.

## Pending / Next
- USER ACTION: Admin → Integration Center me Razorpay (ya Cashfree) TEST keys daalein to real payment
  preview me chale. (User chose to configure themselves.)
- Optional: "Complete payment" retry CTA on a pending subscription card in Account → Subscriptions.
- Optional: harden `pay_mock` with an explicit dev/admin guard (never auto-activate in prod).
- Note: CRA dev server compiles lazy route chunks on-demand (first open of /service/:id can be slow in
  preview). Not an issue in a production build.

## Credentials
See /app/memory/test_credentials.md. Dev OTP = 123456. Admin phone +919000000000. Customer any 10-digit.
