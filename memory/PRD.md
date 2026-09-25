# AzoApp Customer Mobile App (Expo SDK 57) — PRD

## Problem statement (original, verbatim summary)
Build a separate **Customer** mobile app in `/app/Customer` (React Native / Expo SDK 57, expo-router) that is a
same-to-same port of the **Customer Web Panel's mobile view** — UI + components + APIs + business logic — using the
SAME FastAPI backend. App opens on Login; only `role === "customer"` may log in (Partner/Merchant/Admin/Agent blocked);
session persists until manual logout. Develop **page-by-page** (explore web page → understand → port → test → next).
Provide a working Expo preview URL + QR for Expo Go.

## Repo map
- `/app/backend` — FastAPI + Mongo (shared by all panels/apps). `.env`: MONGO_URL, DB_NAME=azoapp, JWT_SECRET, CORS_ORIGINS, REACT_APP_BACKEND_URL.
- `/app/web_panel` — CRA web panel (reference design; not run on pod — no node_modules).
- `/app/frontend` (= PartnerApp) — existing Partner/Merchant Expo app (port 3000, supervisor `frontend`).
- `/app/Customer` — **Customer Expo app (this work)**, port 3001, supervisor `customer_expo` (tunnel mode).

## Customer app architecture
- `app/_layout.tsx` — fonts (Public Sans, same as web), Theme/Brand/Auth/Toast providers, Stack (index, login, (customer)).
- `app/index.tsx` — auth gate (restores `azo_token` from SecureStore/localStorage → home, else login).
- `app/login.tsx` — port of `web_panel/src/pages/auth/Login.jsx` + `components/OtpLogin.jsx` (mobile view):
  BrandLogo, "Sign in to continue", OTP steps 1→2→3 (new number → name → create customer), email login (if `auth_config.email_login`),
  demo "Login as Customer" (customer only). **Role guard**: `finish()` rejects non-customers with toast and resets to step 1.
- `src/context/AuthContext.tsx` — persistent session; `refresh()` drops token only on 401 or if `/auth/me` role != customer.
- `app/(customer)/_layout.tsx` — guard + `CustomerDataProvider` (polls `/bookings`, `/wallet`, `/payments/refunds` every 8s like web; loads `/auth/config`, `/catalog/categories`, `/catalog/services`, `/referral/summary`) + `CustomerShell`.
- `src/components/customer/CustomerShell.tsx` — mobile header (avatar→profile, Deliver-to city / brand logo, NotificationBell `/notifications` 20s poll + mark-all-read, theme toggle), bottom nav (home, orders w/ active badge, wallet, invoices, More), More sheet (other NAV + Logout).
- `app/(customer)/index.tsx` + `src/components/customer/HomeView.tsx` — 1:1 port of `HomeView` + `LiveBookingCard` (hero mesh gradient, search w/ service matches, quick chips, 5 StatTiles, live booking progress, Explore Services 3-col, Popular Services, Refer & Earn promo, Recent Bookings/EmptyState).
- `app/(customer)/[tab].tsx` — "Coming next" placeholder for pages not yet ported (orders, wallet, invoices, custom_jobs, refunds, addresses, profile, referral, support, ai, services).
- `src/theme.tsx` — exact web palette (--p-50…900, slate/emerald/amber/rose/…); dark mode persisted.
- `src/components/Toast.tsx` — sonner top-center richColors look.

## Expo preview
- Supervisor program `customer_expo` → `/app/Customer/scripts/start-expo.sh` (`expo start --port 3001 --tunnel`).
  Conf copy: `/app/Customer/scripts/customer_expo.supervisor.conf` (re-copy to `/etc/supervisor/conf.d/` + `supervisorctl reread && update` if the pod is rebuilt).
- Tunnel URL (stable via `.expo/settings.json` urlRandomness): **exp://yjnus5m-anonymous-3001.exp.direct** · QR: `/app/Customer/expo_qr.png`.
- Web preview for testing: http://localhost:3001 (first bundle 30–60s).

## Status
- 2026-09-25: Page 1 (Login + Dashboard Home + common shell) DONE & VERIFIED by testing agent (iteration_118: backend 14/14, frontend 13/13).
  Fixed both `.env` files (were empty on this pod → backend crash-loop).

## Backlog (page-by-page, in web NAV order)
- P0: My Bookings (`BookingsView` + BookingCard, cancel/review/pay/repeat dialogs) — `orders` tab (supports `?focus=CODE`).
- P0: Services / booking flow (web `/services`, `/service/:id`, checkout) — currently placeholder `services` route.
- P1: Wallet, My Invoices (InvoiceCenter), Refunds, Custom Requests (MyCustomJobs), My Addresses (AddressBook), My Profile (ProfileEditor).
- P1: Refer & Earn (ReferralView), Help & Support (SupportCenter), AI Assistant (AiChat).
- P2: OnboardingTour, ScheduleAlerts, RescheduleRing, SearchingStatus polling, push notifications, brand logo dark/light from admin.
