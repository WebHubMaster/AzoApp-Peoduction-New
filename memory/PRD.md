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

## Public site (Landing) — added 2026-09-25
- App now OPENS on the public Landing (`app/(site)/index.tsx`) = 1:1 port of `web_panel/src/pages/customer/Landing.jsx` mobile view.
- `app/(site)/_layout.tsx` = `SiteNavbar` (logo · membership crown · search modal · cart · profile/login · menu w/ LocationButton) + `MobileBottomNav` (Home/Services/Booking/Orders/Profile; Orders/Profile → login if logged out, else /(customer)).
- Sections (all dynamic): HomeHero (+hero banners / category tiles, stats from /site/config), TrustBar, LocationHint, MemberSavingsBanner (/memberships/me), /site/homepage sections (categories / featured / trending / banners), Promotions (/site/promotions: offers, membership banner, coupons w/ copy→azo_coupon), Reviews (/content/testimonials), GrowCta, FAQ (/content/faqs/grouped), Blog (/content/blogs), SiteFooter, LocationGate (expo-location + /serviceability + /geo/reverse), CategoryServicesSheet (/catalog/services?category_id=).
- `src/lib/location.ts` = azo_location store (+ useCity) mirroring web localStorage/event. `src/components/site/*` = ui, SiteNavbar, ServiceSearch, HomeSections, HomeBlocks.
- Login has "← Back to home"; logout returns to landing. Placeholders: `app/(site)/[...page].tsx` (services, book, membership, service/:id, blog, about, contact).
- VERIFIED testing agent iteration_120: 100% backend + frontend.

## App Home redesign + CMS + Booking flow — 2026-09-25 (later session)
- Home = reference-screenshot design, ALL content from `GET /api/app/home` (single request, AsyncStorage cache, progressive FlatList). Blocks: header (dynamic logo only if uploaded, location pill → premium top LocationSheet, bell muted when permission denied, avatar), search + voice (Web Speech / expo-speech-recognition — not in Expo Go), poster hero slider (autoplay 4.5s, admin slides), 3-col category tiles (uploaded image) → `/(site)/category/[id]` (incremental 8/scroll), offer banner (copy code), quick features, Most Booked, Why Choose Us, Trending, Salon tabs (needs salon categories/tabs), Offers row, admin **custom sections** (`custom:<id>` — services / category / banner).
- Admin CMS: web_panel → **Mobile App → Customer App Home** (`AppHomeManager.jsx`, `/admin?tab=app_home`) ↔ `GET/PUT /api/admin/app-home` (`backend/controllers/app_home_controller.py`, cache bust on save).
- Bottom nav: Home · My Bookings · Book Now FAB (→ /services) · Membership (→ `/(site)/membership`, port of web Membership.jsx incl. mock/Razorpay-WebView buy) · Account. Hidden on `/service/*` and `/book`.
- Booking flow (port of web): `/(site)/services` (search + category chips, incremental), `/(site)/service/[id]` (tiers, add-ons, qty, sticky add bar), `/(site)/book` checkout (cart w/ upsell `/catalog/upsell`, schedule + slots `/bookings/slot-availability`, address w/ GPS + saved addresses, coupon `/bookings/validate-coupon`, wallet/online pay, `/bookings/grouped` + `/payments/order|mock`, confirm). CartContext = port of web (AsyncStorage `azo_cart_v1`).
- Offers page `/(site)/offers`. Placeholders: blog/about/contact/privacy/terms/refund/faq (explicit routes — NEVER re-add a `(site)/[...page]` catch-all: it swallows `/(customer)/orders`).
- Startup permissions: location + notifications (`src/lib/permissions.ts`).
- Verified by testing agent iterations 121–126 (all pass).

## Bookings · Wallet · Live Tracking · Push — 2026-09-25 (latest)
- `/(customer)/orders` = port of web BookingsView: KPIs, search, tabs, `BookingCard` (OTP banners, current-step, Track Live, timeline, reschedule pending accept/reject/withdraw, additional-work pay, spare parts) + dialogs (Cancel w/ cancellation-preview & reasons, Review, Reschedule request, Details sheet, Additional pay). `src/lib/payments.ts` = runPayment (mock gateway path).
- `/(customer)/wallet` = balance card + top-up (presets/amount → /payments/order purpose wallet → mock) + stats + filters + transactions.
- `/(customer)/track/[id]` = live status hero, partner card (call), OTP code, progress steps, address; 5s polling. Home LiveBookingCard → track.
- Push: `src/lib/push.ts` registers ExponentPushToken via POST /notifications/devices (works in dev/prod builds; Expo Go remote push unsupported → silent). Backend `services/expo_push_service.py` added to `notification_service.notify()` (FCM skips Expo tokens). Customer alerts in `booking_controller._advance` (arrived_shop / arrived_customer / started) + completion. NEW partner routes: `POST /bookings/{id}/on-my-way` (→arrived_shop), `POST /bookings/{id}/arrived` (→arrived_customer); start-otp now also allowed from arrived_customer.
- Verified: iteration_127 (orders/wallet/track 100%; push registration + in-app alerts) + manual on-my-way/arrived flow.
- NOTE: create_file tool truncates very large files — write big files in chunks (create + search_replace markers).

## Custom Requests · Refunds — 2026-09-26
- `/(customer)/custom_jobs` = port of MyCustomJobs.jsx + CustomJobWizard.jsx (5-step bottom sheet: About You (OTP or prefilled when logged in) → Category → The Work → Budget & Area (serviceability) → Review → POST /custom-jobs; success screen w/ request id).
- `/(customer)/refunds` = port of RefundsView (KPIs, search, date presets, tabs, cards, refund timeline). StatTile values auto-shrink.
- Verified iteration_128 (100%). Remaining customer tabs: invoices, addresses, profile, referral, support, ai (placeholders).

## My Bookings full re-port — 2026-09-26 (latest)
- `/(customer)/orders` re-created 1:1 from web `BookingsView`/`BookingCard` (CustomerDashboard.jsx 428–751, 1061–1693):
  SectionHeader + "Booking" btn, 5 KPI tiles (2-col), SearchInput (clear ×) + FilterButton (badge) → FilterSheet (DateRangePicker presets + custom MiniCalendar, Payment status, Sort), SegTabs w/ counts, 10/page Paginator (mobile), EmptyStates.
- Card: icon tile, status/payment chips, copy-id (expo-clipboard), items list, OtpBanner, CurrentStepCard, **ScheduledCard** (countdown, lock pills), reschedule-pending (accept/reject/withdraw), additional-work due/paid, PremiumTimeline (ping dot, 5 steps), action chips (Pay / Call / Chat+unread / Track Live / View Details / Invoice / Book Again / Rate / Request Reschedule / Cancel / rated), spare parts approve/reject.
- Dialogs: CancelDialog (centered, cancellation-preview breakdown rows + reason buttons), ReviewDialog, AdditionalPayDialog (amber header), RescheduleDialog (**SchedulePicker** port: calendar + `/bookings/slot-availability` slots), BookingDetailsDrawer (DBlocks, ServiceBreakdown, WorkProof lightbox, PaymentSummary from `breakdown`, Cancellation & Refund), InvoiceDrawer (brand logo, breakdown w/ charges, totals, coupon note; Download/WhatsApp via `/invoices?booking_id` → `/invoices/{id}/share-link` public PDF URL), BookingChat (full-screen, 5s polling, quick replies, seen/typing posts; unread via `/bookings/chats/summary` 30s).
- New files: `src/components/customer/{BookingDrawers,BookingChat,SchedulePicker,ServiceBreakdown}.tsx`; `ux.tsx` gained SearchInput/SegTabs/DateRangePicker/OptionMenu/FilterSheet/Paginator/BottomSheet/PlainList. BrandContext now exposes `cancellation_reasons` + `email_logo`.
- FIX: "VirtualizedLists should never be nested" — pages inside CustomerShell ScrollView must NOT use FlatList; orders/wallet/refunds/custom_jobs now use `PlainList`.
- Verified: testing agent iteration_129 (backend 9/9, frontend 100%) + manual Rate / Reschedule request / Chat sheet flows.

## My Profile · My Addresses — 2026-09-26 (latest)
- `/(customer)/profile` = port of ProfileEditor (photo picker via expo-image-picker + expo-image-manipulator → 512px JPEG data URL <2MB, completion bar, fields gated by `/auth/config.profile_fields`, PUT `/auth/profile`, then `refresh()`) + DeleteAccount (CenterDialog → POST `/auth/delete-account`; logout if `status === "deleted"`).
- `/(customer)/addresses` = port of AddressBook (GET `/auth/addresses`, POST/PUT `/auth/address`, DELETE, POST `/{id}/default`) with BottomSheet Add/Edit → `AddressForm` port (GPS detect via expo-location → `/geo/reverse`, OSM embed map (iframe on web / WebView native) only when lat/lng set, label chips, pincode serviceability `/geo/serviceability`, property type, wing/floor/flat, landmark/instructions — all gated by `address_config`).
- New: `src/components/customer/{FormControls,AddressForm,ProfilePhotoPicker}.tsx` (PField/FInput/FSelect/DateField/Checkbox). `MiniCalendar` gained `initialView`.
- Verified: testing agent iteration_131 (backend 8/8, frontend 100%).

## Status
- 2026-09-25: Page 1 (Login + Dashboard Home + common shell) DONE & VERIFIED by testing agent (iteration_118: backend 14/14, frontend 13/13).
  Fixed both `.env` files (were empty on this pod → backend crash-loop).

## Learnings
- Expo dev server runs WITHOUT CI=1 now (file watching works → hot reload). After installing new packages still run `sudo supervisorctl restart customer_expo`.
- Web panel dev server for admin UI testing: `cd /app/web_panel && PORT=3002 BROWSER=none REACT_APP_BACKEND_URL=http://localhost:8001 nohup yarn start &` (node_modules installed).
- Metro runs in CI (no-watch) mode under supervisor: after ANY `yarn add`/node_modules change run `sudo supervisorctl restart customer_expo`, else Expo Go gets a 500 ENOENT bundle error (stale file map).

## Backlog (page-by-page, in web NAV order)
- P0: ~~My Bookings~~ DONE (iteration_129).
- P0: Services page (`/services` w/ ?q ?category), Service detail (`/service/:id`), Booking cart (`/book`) + Checkout (guest booking, coupons azo_coupon, schedule picker, address, payment) — placeholders now.
- P1: Membership page, Blog list/detail, About/Contact static pages; cart count in navbar (CartContext port).
- P1: ~~Wallet, My Invoices (InvoiceCenter), Refunds, Custom Requests (MyCustomJobs), My Addresses (AddressBook), My Profile (ProfileEditor)~~ DONE (iterations 128–131).
- P1: Refer & Earn (ReferralView), Help & Support (SupportCenter), AI Assistant (AiChat).
- P2: OnboardingTour, ScheduleAlerts, RescheduleRing, SearchingStatus polling, push notifications, brand logo dark/light from admin.
