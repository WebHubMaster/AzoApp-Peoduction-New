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

## Help & Support · Refer & Earn · AI Assistant · Profile shortcuts — 2026-09-26 (latest)
- `/(customer)/support` = port of SupportCenter.jsx: list (search, range/status/sort OptionMenus, 6s poll), NewTicket form (POST `/support/tickets`), `SupportThread` (3s poll, day separators, own/admin bubbles, attachments via expo-image-picker → multipart POST `/support/upload` (api client now supports FormData), typing ping, close ticket w/ CenterDialog, lightbox, info panel: details / attachments / other tickets). Helpers in `supportShared.tsx`.
- `/(customer)/referral` = port of ReferralView + ReferralShareCard: hero (code, copy/share), 4 StatTiles, branded card rendered as View + react-native-view-shot (Share card via expo-sharing / RN Share; Save image → web anchor download / native expo-media-library lazily required), WhatsApp wa.me link, apply friend's code (`POST /referral/apply`), history, How it works. Data: `GET /growth/referral`.
- `/(customer)/ai` = port of AiChat.jsx (session_id reuse, POST `/ai/chat`). Backend AI provider not configured → stub reply (expected).
- Profile page gained `profile-shortcuts` (Addresses / Wallet / Bookings).
- Metro now runs with `CI=1` (start-expo.sh) because inotify watcher limit (12288) was exceeded after new packages → **restart `customer_expo` after every code change**.
- Verified: testing agent iteration_132 (backend 9/9, frontend 100%).

## Booking flow 1:1 re-port (Services · Service detail · Checkout · Guest booking) — 2026-09-26 (latest)
- `/(site)/services` = web Services.jsx: grouped by category, ServiceCard (3:4 image, % OFF, quick Add→Added), rate-card search results (`/ratecards/search`, addCustom → /book), floating "View your booking" bar.
- `/(site)/service/[id]` gained gallery thumbnails, tier rating/review count, `RateCardBar` (`/ratecards/by-service/{id}` → bottom sheet with groups/rows, Add + live qty stepper via `cart.addCustom`).
- `/(site)/book` = full Checkout.jsx port: `CheckoutUi.tsx` (Stepper, Qty, SectionCard, PriceRows, Steps 1–3) + `CheckoutSteps.tsx` (Steps 4–6, SuccessScreen). Live `/bookings/cart-quote` (guest OK, debounced, retry, keeps last pricing), upsell (`/catalog/upsell`), coupon validate/remove, **guest booking via `OtpInline`** (send/verify/new-user signup, customer-only guard) at step "Your Info", saved addresses w/ Pinned badge + OSM map, new AddressForm + GPS, payment online(mock)/wallet, grouped idempotent `/bookings/grouped` per category + `pay-wallet-group`/`booking_group`, new address auto-saved, success screen w/ order-group summary.
- CartContext: `addCustom`, `minLabourCharge` (from `/auth/config`), `toReqItem` includes category_name.
- Verified: testing agent iteration_133 (backend 12/12, frontend 100%: guest single + multi-category orders, partner blocked, new-user signup, empty cart).

## Status
- 2026-09-25: Page 1 (Login + Dashboard Home + common shell) DONE & VERIFIED by testing agent (iteration_118: backend 14/14, frontend 13/13).
  Fixed both `.env` files (were empty on this pod → backend crash-loop).

## Learnings
- Expo dev server runs WITH CI=1 (no file watching — inotify limit). Run `sudo supervisorctl restart customer_expo` after ANY code change or package install.
- Web panel dev server for admin UI testing: `cd /app/web_panel && PORT=3002 BROWSER=none REACT_APP_BACKEND_URL=http://localhost:8001 nohup yarn start &` (node_modules installed).
- Metro runs in CI (no-watch) mode under supervisor: after ANY `yarn add`/node_modules change run `sudo supervisorctl restart customer_expo`, else Expo Go gets a 500 ENOENT bundle error (stale file map).

## Backlog (page-by-page, in web NAV order)
- P0: ~~My Bookings~~ DONE (iteration_129).
- P0: ~~Services page, Service detail, Booking cart + Checkout (guest booking, coupons, schedule picker, address, payment)~~ DONE 1:1 (iteration_133).
- P1: Membership page, Blog list/detail, About/Contact static pages; cart count in navbar (CartContext port).
- P1: ~~Wallet, My Invoices (InvoiceCenter), Refunds, Custom Requests (MyCustomJobs), My Addresses (AddressBook), My Profile (ProfileEditor)~~ DONE (iterations 128–131).
- P1: ~~Refer & Earn (ReferralView), Help & Support (SupportCenter), AI Assistant (AiChat)~~ DONE (iteration_132). All web customer NAV tabs are now ported.
- P2: OnboardingTour, ScheduleAlerts, RescheduleRing, SearchingStatus polling, push notifications, brand logo dark/light from admin.

---

## Customer App Expo CI/CD (June 2026)
Replicated the Partner/Merchant (`frontend/`) Expo EAS + GitHub Actions setup for the Customer app.

- Created Expo project `@emergent_chandan/azoapp-customer` via `eas init` (projectId: `14a48255-07fc-4879-9d63-cab47ed22a0c`, owner `emergent_chandan` — same account as frontend, so a single `EXPO_TOKEN` secret serves both apps).
- `Customer/app.json`: added `extra.eas.projectId` + `owner`.
- `Customer/eas.json`: `production-apk` profile (apk buildType, channel `preview`, `EXPO_PUBLIC_BACKEND_URL=https://api.webhubmaster.shop` — same backend as frontend).
- `.github/workflows/customer.yml`: triggers on push to `main` with `paths: Customer/**` (+ manual `workflow_dispatch`); runs `eas build --platform android --profile production-apk --non-interactive --no-wait` using `secrets.EXPO_TOKEN`.
- `Customer/.eas/workflows/send-updates.yml`: EAS-side build workflow mirror of frontend.
- Verified with `eas project:info` and `eas config` — profile, projectId, owner, backend URL, buildType all resolve correctly.

## Customer Booking Card UI — Premium Refresh (June 2026)
`Customer/src/components/customer/BookingCard.tsx` ka layout compact lag raha tha; spacing/typography premium banaya:
- Card: radius 16→20, padding 16→18, gap between cards 12→16, added `shadowElev` depth.
- Header: service icon 44→50 (radius 18 + shadowBtn), row gap 12→14.
- Service name 16→17.5 weight 800 w/ tighter letter-spacing; meta row marginTop 4→6, gap 6→8.
- Price 18→21 (letterSpacing -0.4); pay label 11→11.5 weight 700.
- Action row gap 8→10, marginTop 12→14.
- Logic untouched. Lint: 0 errors. Live screenshot skip — preview serves Partner app (3000), Customer app (3001) not publicly mapped.

---

## Update — 2026-06: Customer App public-site Top Nav & Bottom Menu = Web parity
- **Goal:** Mobile Customer app ka public `(site)` area ka Top Nav aur Bottom Menu ko web customer panel (`web_panel`) jaisa exact banaya — same icons, design, border-radius, bg, aur same dynamic data via same backend APIs.
- **Top Nav:** Home page (`app/(site)/index.tsx`) ka `AppHeader` + `AppSearchBar` (floating pill header) ko web-style `SiteNavbar` (port of `web_panel/.../SiteNavbar.jsx`) se replace kiya — logo + membership crown + search-icon popup (ServiceSearch) + cart (badge) + account/login + hamburger (Location, All Services, Membership).
- **Bottom Menu:** `app/(site)/_layout.tsx` ka floating-pill `AppBottomNav` (Book Now FAB) ko web-style flat 5-tab `MobileBottomNav` se replace kiya — Home · Services · Booking(cart badge) · Orders · Profile (icons: Home, LayoutGrid, ShoppingBag, CalendarCheck, User), active=primary-700 / inactive=slate-400, white/95 bg + top border.
- **Dynamic data fix:** `SiteNavbar` me `cartCount` pehle hardcoded `0` tha — ab `useCart()` se live count aata hai (navbar cart badge + bottom-nav Booking badge). Orders/Profile tabs auth-gated (`!user → /login`), theme-aware logo.
- **Verification:** Code review (Customer app is not supervisor-managed in this pod — runs via Expo tunnel against production backend; no live screenshot/testing possible here).

---

## Update — 2026-06: Partner/Merchant App (frontend/) — Auth redesign (Welcome → Login → Register)
- **User request:** Mockup-based 3-screen auth flow, 100% same UI/font/theme/icons; dynamic logo from Admin → Branding; NO "Register as Agent", NO "Continue with Google", NO language pill, NO demo-login buttons; Get Started screen comes AFTER existing 3-slide intro.
- **Flow:** index → onboarding/intro → onboarding/notifications → `/(auth)/welcome` (Get Started: hero + Log In / Create New Account) → `/(auth)/login` (Welcome Back, +91 mobile → Send OTP → 6-box verify; new number → toast + redirect to register) · `/(auth)/register` (Join pill, Partner (Popular) & Merchant role cards w/ bullets + hero, Need Help card → role-themed phone → OTP → name → create account; existing number logs in directly).
- **Files:** `app/(auth)/{welcome,login,register}.tsx`, `src/components/auth/OtpFlow.tsx` (shared send/verify/name logic + `homeFor` + `LOGIN_ROLES` guard), `src/components/auth/AuthUi.tsx` (AUTH palette, ROLE_ACCENT, BrandRow dynamic logo, BackButton, NeedHelpLink/Card → tel:/mailto: from site config, SafeSecureCard). Assets: `auth-login-illustration.png`, `hero-partner-arms.png`, `hero-merchant-apron.png`, `auth-welcome-bg.png`.
- All logout targets now `router.replace("/(auth)/welcome")`. `_layout.tsx` registers the 3 auth screens.
- Pod fixes: recreated `/app/backend/.env` (was missing → crash loop) and `/app/frontend/.env` (`EXPO_PUBLIC_BACKEND_URL` = preview URL). Expo for frontend runs manually: `cd /app/frontend && yarn start` (port 3000, CI=1 → restart after code changes). Expo Go: `exp://mobile-customer-nav.preview.emergentagent.com` (QR: `/app/frontend/expo_partner_qr.png`).
- Verified: testing agent iteration_136 — backend 8/8, frontend 10/10 (partner/merchant login, customer blocked, new-number → register, merchant signup, existing-number register → login, logout → welcome).

---

## Subscription-based Recurring Booking Module (added 2026-09-27)

### What it does
Recurring subscription bookings for the **Maid** category (architecture is generic → reusable for Cook, Nanny, Babysitter, Caretaker, Driver, Housekeeping). Customer pays the FULL plan amount UPFRONT; the partner (maid) is settled only from ACTUAL completed working days. Absent days' allocated earning is retained by the platform.

### Financial model (decimal-safe via services/money)
- commission_amount = price × commission_pct  (dynamic; from settings.commission.subscription_commission_pct, else platform_pct)
- tax_amount = price × tax_pct (service.tax_pct)
- partner_allocation = price − commission_amount − tax_amount  (MAX maid earning)
- per_day_earning = partner_allocation / working_days
- All the above + working_days are **SNAPSHOTTED** on the subscription at booking time → future admin rate changes never affect active/past subscriptions.
- Daily accrual: completed→maid earns per_day; maid_absent→per_day to platform (absent_adjustment); weekly_off→no earning/no deduction; customer_cancel→neutral; replacement_completed→replacement maid earns, original does not (no duplicate per date).

### Flow
Customer selects plan (Daily/Weekly/Monthly/Yearly) → pays full upfront → subscription activates → daily schedule generated → maid marks each working day completed (or admin overrides absent/customer_cancel/replacement) → period ends → auto-finalize (hourly sweep) or admin Finalize → settlement pending → admin review → approve → pay (credits maid wallet + records subscription_settlements + transaction).

### Backend (all mounted under /api/subscriptions)
- models/subscription.py, services/subscription_service.py, controllers/subscription_controller.py, routes/subscription_routes.py
- ServiceCreate extended with is_subscription + subscription_plans (models/catalog.py)
- Startup sweep `_subscription_finalize_sweep` (hourly) in server.py
- Collections: subscriptions, subscription_settlements
- Key endpoints: GET plans/{service_id}; POST "" (create); GET mine; POST {id}/pay/{order|verify|mock}; GET partner/mine; POST {id}/days/{date}/complete; admin: GET admin/stats, admin/all, admin/{id}/partners; POST admin/{id}/assign, admin/{id}/days/{date}, admin/{id}/finalize, admin/{id}/settlement

### Frontend
- Admin web (web_panel): SubscriptionsAdmin.jsx (list + stats + detail drawer: assign maid, day overrides, finalize + review/approve/pay). Service wizard (adminSectionsPro.jsx) got a "Recurring Subscription Service" toggle + per-plan editor (price, duration, working days, weekly-offs).
- Customer app (/app/Customer): app/(customer)/subscriptions.tsx (browse plans, pick plan/date/time/address, pay upfront, My Subscriptions). Nav item added.
- Partner app (/app/frontend): app/(partner)/partner/subscriptions.tsx (assigned subscriptions, summary matching spec, daily schedule + Mark done, earnings). Nav "Maid Subscriptions" added.

### Status
Backend: fully tested (testing agent 12/12, 100%). Admin web UI verified via screenshot (₹10,000/26/20% reconciliation → earned ₹7,384.56, absent adj ₹615.38). Customer & Partner Expo screens implemented (compile OK); deep e2e mobile screenshotting deferred.
Payment is MOCKED (no live gateway configured) via /pay/mock.

### Customer WEB panel UI + dummy maids — 2026-09-27
- NEW `web_panel/src/components/customer/Subscriptions.jsx`: `SubscriptionPlansPanel` (plan picker + booking dialog: start date/time/address → POST /subscriptions → /pay/mock → /account?tab=subscriptions) + `MySubscriptions` (cards w/ paid-upfront, days completed, maid earned, absent adj, maid name, schedule dot-strip + legend).
- `ServiceDetail.jsx`: subscription services render SubscriptionPlansPanel (replaces add-to-cart card), "Recurring Subscription" badge, mobile add-bar hidden. `CustomerDashboard.jsx`: NAV "Subscriptions" tab (CalendarHeart icon).
- `backend/seed_maid_partners.py`: 5 maid partners (+919000000020-24: Sunita Devi, Geeta Sharma, Lakshmi Bai, Anita Kumari, Meena Devi; skills maid+cleaning), activates Home Maid (image/description/highlights), deactivates TEST_* subscription services, seeds 2 attendance-history subs (monthly→Sunita: 6/25 done, earned ₹1,920, absent ₹320; weekly→Geeta: 5/6 done, earned ₹1,666.65). Idempotent (seed="maid_demo").
- Verified E2E via screenshots: login → /services (Home Maid card) → plan picker → dialog → pay ₹10,000 → My Subscriptions (new sub SUBZXRGVG active, unassigned). Admin /partners lists all 5 maids; maid login (+919000000020) sees earned/max-allocation/absent.

### Maid panel upgrades + full-cycle demos — 2026-09-27 (latest)
- Partner app (frontend/): maid-focused changes —
  - `(partner)/_layout.tsx`: "Rewards & Challenges" More-menu item HIDDEN when partner skills include "maid".
  - `partner/subscriptions.tsx`: SubDetail gained "Customer & work details" card (customer, tappable phone, address, work, preferred time, duration, weekly off, notes); pending-banner for unmarked past days (backdated marking already allowed by API — UI surfaces it); list view gained "Upcoming work · next 7 days" strip.
  - NEW `src/components/partner/home/MaidTasksCard.tsx` on partner home: Today/Missed/Upcoming tasks (next 7 days) with per-day ₹ + quick "Mark done" (past days markable). Rendered in `(partner)/index.tsx` after PriorityAction.
- Demos verified via screenshots: Sunita login → home tasks card → backdated "Missed" day marked done (SUBSXENO3 earned ₹400) → sub detail customer card → More menu w/o Rewards. Admin web: SUBZXRGVG assigned Lakshmi Bai via drawer; SUBOI7PPF finalize→review→approve→pay (Sunita wallet ₹0→₹1,920, subscription_settlements record written); UI-only settle cycle retested on SUBHL09NP (paid ₹2,080).
- Partner Expo runs manually on port 3005 for web screenshots (`cd /app/frontend && CI=1 npx expo start --port 3005`); web panel still on 3000.

### Premium Customer My-Subscriptions redesign + Subscription Invoice — 2026-09-27 (latest)
- Full user spec (25 sections) received; core engine already existed → this turn = premium UI redesign + invoice + gap notes.
- WEB `web_panel/src/components/customer/Subscriptions.jsx` MySubscriptions rewritten: full-width premium cards (icon tile, plan chip, StatusChip, dates, copyable ID, maid+time, big Paid-upfront price), 4 separate overview stat cards (Paid/Working days/Completed/Absent w/ colored icons), progress bar (emerald completed + rose absent segments), actions (View Details / View Schedule→scroll / Download Invoice), expanded section = Service Calendar grid (status-colored day cells + legend), Payment & subscription details (commission/tax SNAPSHOTS, partner max allocation, per-day earning, weekly off, status), Maid details card (name, tel: phone, time, address). Brand #0D47A1 = theme primary. downloadInvoice pre-opens about:blank tab (popup-blocker safe).
- MOBILE `Customer/app/(customer)/subscriptions.tsx` SubCard rewritten 1:1 (overview chips 2x2, progress bar, expand → calendar + payment snapshot + maid card, invoice via Linking → API_BASE+path). tsc clean.
- BACKEND invoice: `_activate` records upfront payment in shared `transactions` ledger (kind=subscription_payment, ref_id=sub.id, idempotent) + `invoice_service.ensure_transaction_invoice` (label "Subscription Payment"/paid added to _TXN_KIND_LABEL); subscription.invoice_id stored; NEW `GET /api/subscriptions/{id}/invoice` → signed public path `/invoices/pub/{id}?s=...` (lazy-generates for older paid subs; customer/admin only — partner 403).
- GOTCHA: backend watchfiles hot-reload gets STUCK ("Waiting for connections to close") when ws/poll connections are open after code edits → run `sudo supervisorctl restart backend` if curl returns 000.
- Verified: testing agent iteration_140 — backend pytest 6/6, frontend 100% (full-width 1592px@1920, expanded calendar/payment/maid cards, invoice signed PDF 200 + idempotent + authz, regressions: one-time services unaffected, orders/wallet tabs fine).
- GAPS noted for later: admin per-plan cancellation/refund/replacement rule fields in service wizard (engine uses global policy), partner Start/Complete service-session flow (currently attendance-only), customer pause/cancel subscription UI, customer notifications on absent/replacement.

### Service Session Flow (Start → OTP → Complete + photo proof) — 2026-09-27 (latest)
- Backend: every working schedule day gets a 4-digit start OTP (`build_schedule`; `ensure_day_otps` lazy-backfills older subs on customer read). New day status `in_progress`. NEW `POST /subscriptions/{id}/days/{date}/start {otp}` (assigned partner only, day must be scheduled & not future, OTP via hmac.compare_digest) → in_progress + started_at. `POST .../complete` now takes optional `{note, photo}` — photo = base64 data URL (≤8MB) materialized via `storage_service.materialize_data_url` to `/media/file/subscriptions/{id}/...webp` stored as `day.proof_photo`; day → completed + completed_at + earning accrues. RULES: today must be started first (OTP); past days = direct complete (backdated, user-asked); future = 400; unassigned partner = 403. OTP secrecy: `strip_otps_for_partner` removes otp from partner_list/get_one payloads; customer/admin see it.
- Partner app (subscriptions.tsx): today row = Start → OTP modal (sub-otp-input/confirm); in_progress = Complete → modal with expo-image-picker photo + note; past = Mark done. MaidTasksCard: today row → "Start service" (navigates to subscriptions), past → Mark done.
- Partner web (PartnerSubscriptions.jsx): inline OTP input row + photo file row per day.
- Customer web + mobile: amber "Today's service OTP: XXXX — share with your maid" banner on active cards (my-sub-otp-{id}); in_progress added to calendar DAY_META.
- Verified: testing agent iteration_141 — backend pytest 8/8 (wrong OTP, complete-before-start, future block, 403, photo→https URL, accrual, backdated regression, admin absent regression) + web smoke (OTP banner). NOTE: on Sundays (Home Maid weekly_off) no natural "today" scheduled day exists — tests DB-patch the day.

### Partner/Merchant Welcome screen — premium redesign — 2026-09-27 (latest)
- User: welcome hero image low-quality + make UI more premium/arranged. Shared screen `frontend/app/(auth)/welcome.tsx` serves both partner & merchant (role chosen at register).
- Regenerated hero character (Gemini high-quality) → rembg u2netp cutout → clean transparent PNG `frontend/assets/welcome-person.png` (457×1205, replaces the old low-res 620×983). Old backup moved to /app/.tmp_assets (out of bundle).
- Hero recomposed: person aspect ratio fixed (457/1205); added a designed circular gradient "stage" disc + white ring behind the professional (no longer floating) + soft ground shadow; added a "TRUSTED BY THOUSANDS" pill above the title; feature items turned into neat white rounded pills. tsc clean; verified via expo-web screenshot (crisp image, arranged premium layout).
- V2 (user: "apne according premium luxury fresh"): welcome.tsx fully rewritten DARK-LUXURY — deep navy night gradient (#060C22→#0A1E63→#0C2E7D) + faint champagne aurora glow; champagne-gold palette (#D9B45B); serif display title ("Doorstep." in gold italic; Platform serif/Georgia); gold-letterspaced "PREMIUM HOME SERVICES" kicker w/ gold rule; glass feature pills (white 8% + gold icon chips); professional stands on champagne disc + gold ring (blob/house/leaves assets dropped for minimalism); white Get Started sheet w/ gold-gradient Log In + outlined Create Account + gold shield secure line w/ hairline dividers; StatusBar light. Same testIDs (welcome-hero/title/login-btn/register-btn/get-started-card/app-brand-logo). tsc clean; verified via expo-web screenshot.
- V3 (user: "same to same is reference image jaisa", light theme, headline "Reliable Home Services"): welcome.tsx rewritten to a 1:1 recreation of the user's reference mock — light #F6F9FE bg, header (top-left logo DYNAMIC from admin: `branding.logo_light || logo || logo_dark` rendered as `app-brand-logo-dynamic`; fallback = bundled "A" icon + site_name + tagline), white "English" pill, navy 900 title, gray sub, 3 round-icon feature rows (blue shield / blue bolt / amber ₹), light-blue blob discs behind the professional, person overlapped by white Get Started card (blue-gradient Log In + outlined Create New Account), shield "Your data is secure & encrypted" footer. StatusBar dark.
- New hero asset `frontend/assets/welcome-person.webp` (600×1093, 84KB — fast load): arms-crossed navy-polo technician w/ tool belt and small AzoApp chest branding, generated from the reference crop (Gemini) → rembg u2net_human_seg cutout → webp. Old welcome-person.png deleted. PERSON_RATIO constant = 600/1093.
- Gotcha: Metro file watcher on this pod does NOT pick up new/changed files reliably → `sudo supervisorctl restart frontend` after editing welcome.tsx/assets, else bundle 500s "Unable to resolve" / serves stale code.
- Verified: expo-web screenshots (390×844) fallback logo + dynamic logo (temporarily set logo_light via PUT /api/admin/settings, then reverted to ""), Log In → /login navigation. Admin currently has NO logo uploaded; user's uploaded logo is WHITE-on-transparent → for this light screen admin should upload a dark/navy variant in "Logo (Light mode)".


### Web ↔ App parity: Partner web panel gets Maid Subscriptions — 2026-09-27 (latest)
- User asked full parity ("jo kaam app me hoga wo web me bhi & vice versa"). Web partner panel was MISSING the Maid Subscriptions screen that the mobile app had.
- NEW `web_panel/src/pages/partner/PartnerSubscriptions.jsx`: 1:1 web port of mobile `partner/subscriptions.tsx` — assigned-subscriptions list, "Upcoming work · next 7 days" strip, detail view (hero working/completed/absent, Customer & work details card w/ tappable phone + address + duration + weekly-off + notes, Earnings breakdown, Daily schedule with backdated "Mark done" via POST /subscriptions/{id}/days/{date}/complete).
- `PartnerDashboard.jsx`: NAV gained "Maid Subscriptions" (CalendarHeart); render `active === "subscriptions"`; "Rewards & Challenges" NAV item HIDDEN when `user.skills` includes "maid" (parity with mobile _layout.tsx).
- Verified via screenshots (Sunita web login): list + upcoming strip render, Rewards hidden in sidebar, customer/work details card, backdated Mark done → "Marked completed" toast, Completed 1, Earned ₹400, settlement ₹400.
- Parity matrix now: Customer subscriptions (web ✓ / app ✓), Partner/maid subscriptions (web ✓ / app ✓), Admin subscriptions (web ✓).
- FIX (user-reported): partner subscriptions page showed the title TWICE (panel header + component's own header) and was constrained to max-w-3xl. PartnerSubscriptions.jsx now has NO local header (panel header is the single title) and uses w-full + responsive grids (cards sm:2/xl:3 cols, detail cards lg:2 cols, schedule sm:2/xl:3 cols). Verified by testing agent iteration_139 (frontend 100%): single title, full-width 1600px grid at 1920px, maid sidebar hides Rewards, non-maid sees all, customer tab unaffected.

### Partner Active Job → step WIZARD (mobile + web) — 2026-09-27 (latest)
- User flow (Hinglish spec): Active Job card = basic info (name, #id, status, timing, Navigate/Call/Chat/Reject/Reschedule) → tap card / "Continue" → full-screen wizard (bottom tab bar HIDDEN): Details → Continue → Selfie + live location check-in → Before proof (photo/video, max 5, LIVE camera only) + Start OTP → After proof (max 5) + Completion OTP → Done. User choices: location recorded only (distance shown, `far` warning >0.5km, never blocks; check-in marks job Arrived); video ≤30s / ≤25MB; old before/after blocks REMOVED from card.
- BACKEND: `POST /api/bookings/{id}/checkin/upload` (multipart file+lat+lng → booking.checkin {selfie_url,lat,lng,distance_km,far,at}, status→arrived_customer, also pushes partner location); `POST /api/bookings/{id}/evidence/chunk` (JSON base64 chunks {stage,upload_id,index,total,content_type,data} staged in /tmp/azo_evidence_chunks, assembled → storage_service.save_video); `/evidence/upload` now accepts video/* too; MAX_EVIDENCE_FILES=5 per stage (upload/chunk/json paths); `/start-otp` now ALSO requires booking.checkin ("Please complete the selfie check-in first."); partner_job_detail now returns demo_otps for demo partners. storage_service: VIDEO_ALLOWED (mp4/mov/webm/3gp/mkv), MAX_VIDEO_BYTES 25MB, save_video, is_video_url.
- RESCHEDULE relaxed: request_reschedule no longer requires a scheduled booking — instant "Now" jobs can be moved (old label "Now/ASAP"); on accept `schedule_type` is set to "schedule". Partner card shows "Request Reschedule" for every assigned/arrived job (mobile + web).
- MOBILE: NEW `frontend/app/(partner)/partner/job/[id].tsx` (wizard; registered in _layout + hideBarRoutes), `src/components/partner/JobProof.tsx` (OtpBoxes, ProofGrid photo+video tiles, captureProofPhoto multipart, captureProofVideo = expo-image-picker videos ≤30s → FsFile.base64 → chunked upload), `src/components/partner/AdditionalWork.tsx` (rate-card extras + RateCardSheet moved out of active.tsx). `active.tsx` trimmed: header row is a Pressable `job-card-{code}`, CTA `open-job-{code}` ("Continue · Check-in & Start / Start Job / Complete Job"). app.json: microphone permission strings.
- WEB: NEW `web_panel/src/components/partner/JobWizard.jsx` (portal overlay, same steps/testids), `VideoCapture.jsx` (MediaRecorder ≤30s, REC timer, re-record), CameraCapture `initialFacing` prop (selfie = "user"). `WorkProof.jsx`: video tiles/lightbox `<video>` + `CheckinProof` (selfie + distance + maps link) — admin booking detail passes `checkin`. PartnerDashboard ActiveJob trimmed (PhotoBlock/OtpBoxes/RateCardModal removed) + wizard wiring.
- WEB PANEL PREVIEW: backend now serves the built panel at `{BACKEND_URL}/api/panel/` (server.py `serve_web_panel`, SPA fallback; BrowserRouter basename=PUBLIC_URL). Rebuild after web_panel changes: `bash /app/web_panel/build_panel.sh` (~60s). Dev server alternative still :3002.
- Dev helper: `python3 /app/backend/dev_reset_job.py <booking_id>` resets a job to assigned (clears checkin/evidence) to replay the wizard. Demo job: AZOAF1BBB (ba936117-834f-40a2-a19c-65d3d4628050), partner Raj Kumar, demo OTPs 1234/1234.
- Verified: testing agent iteration_142 — backend pytest 11/11 (gates, checkin, chunk video, 5-cap, remove, start/complete, 403), web-panel + Expo-web wizard flows + admin checkin-proof. Reschedule + demo_otps + /api/panel verified via curl/screenshots afterwards.

- 2026-09-27 fix (user: "job ka timing nahi dikh raha"): `schedule_state()` now returns `is_instant` + scheduled_date/time (booking time from accepted_at/created_at, APP_TZ) + label "Now · booked <date> at <time>" + phase due/active for instant bookings. Partner ScheduledCard (mobile + web) renders for instant jobs too, titled "Instant Service · Booked", countdown "now". Wizard Details KV "Job timing" uses schedule.scheduled_label. Customer-side cards still gated by is_scheduled (unchanged). Verified: testing agent iteration_143 (backend + Expo-web + /api/panel mobile & desktop, no overflow).

- 2026-09-27 UI: Partner/Merchant/Agent bottom tab bar is now FIXED full-width & flat (top border, no rounded pill / side margins) like the customer app — `frontend/src/components/AppTabBar.tsx` (BlurView, paddingBottom insets+4) and web `PanelLayout.jsx` appMode nav (`fixed bottom-0 inset-x-0 bg-white/95 border-t`). Icons/labels/active gradient unchanged. Verified via screenshots (Expo-web + /api/panel).

- 2026-09-27 UI fix: ScheduledCard header no longer wraps "Ready to start / now" under the date — right column `shrink-0`/`flexShrink:0`, left `min-w-0 flex-1`, title shortened to "Instant Service"; date/time wrap inside the left block on narrow screens (web `ScheduledCard.jsx` + mobile `active.tsx`). Web panel rebuilt.

- 2026-09-27 Customer app HOME (logged-out `(site)/index.tsx`): navbar search button removed (`SiteNavbar hideSearch` prop) and the existing-but-unused `AppSearchBar` (AppHeader.tsx) now sits right below the navbar as a white pill (search icon · "Search for services (e.g. AC Repair, Cleaning, Salon)" · navy mic). Typeahead GET /catalog/services?q= dropdown → service page / "See all results" → /(site)/services?q=; mic opens the YouTube-style `VoiceSearchOverlay` (Web Speech API on web, expo-speech-recognition on native builds; not in Expo Go) and submits the transcript to the same search. Verified via screenshots on Expo-web :3001 (bar, results, overlay). Only the customer app changed.

- 2026-09-27 Customer app LOGIN redesign (`Customer/app/login.tsx`, reference mock): back chip (no language pill), DYNAMIC brand logo from admin (`logo_light` in light theme / `logo_dark` in dark theme via useTheme; fallback bolt icon + site_name + tagline), "Sign In to {site_name}" (brand in blue), subtitle, hero = EXACT crop of the user's reference mock (girl + blue disc, `Customer/assets/login-hero.webp` 449×596, page-bg pixels made transparent, HERO_RATIO 449/596) placed flush right (right:-18, top:34*S) with the card starting at its bottom; colors sampled from mock (NAVY #000A35, BLUE #0572EE, BTN #1160C2, CHIP_BG #E6F3FE); bottom light-blue waves, 3 feature chips, white card: "Mobile Number" · tricolor flag +91 ▾ · input · "Send OTP →" · lock note → OTP boxes → name step; email login/demo login blocks kept. All testIDs unchanged (login-phone-input, send-otp-button, otp-boxes, verify-otp-button, …). Verified via Expo-web screenshots (step 1 + OTP step).
- 2026-09-27 AI Assistant REMOVED from customer panel: mobile `Customer/src/components/customer/nav.ts` (key "ai" + type) and `app/(customer)/ai.tsx` deleted; web `CustomerDashboard.jsx` nav item + section + AiChat import and `CustomerShell.jsx` menu-ai removed. `components/AiChat.jsx` kept for other roles. Web panel rebuilt.
- 2026-09-27 Guest OTP (OtpInline.tsx) paste fix: maxLength 10 → 16 so "+91 98765 43210" normalises to last 10 digits (testing agent iteration_144 finding).

- 2026-09-28 Welcome (partner/merchant app) fit-to-screen: no scroll on short Android screens — vertical scale `V = clamp(avail/800, 0.72, 1)` shrinks header/hero/features/card/button spacing; `heroH` = whatever remains after header + estimated card + footer (min 280). Verified 360×640 + 390×844: no overflowing scroller, footer visible.

- 2026-09-28 Wizard/login fixes (testing agent iteration_145 all pass): partner login OTP Verify button no longer hidden under keyboard (KeyboardAwareScrollView bottomOffset 230); wizard scroll is KeyboardAwareScrollView (bottomOffset 240) so OTP boxes stay above keyboard; VIDEO chunk upload 700KB base64 parts + retry (mobile JobProof.tsx, web JobWizard.jsx), backend total ≤120 parts; Details step = full job info (category/status/timing/booked on/value/payment/check-in) + customer card + collapsible Job timeline (default closed; `wizard-timeline-toggle`/`-list`) on mobile + web.

- 2026-09-28 Customer app fixes (testing agent iteration_146 pass): Support chat panel shrinks while keyboard is open (`useKeyboardState` → panelH = winH - kb - 190, min 240) so composer stays visible; guest checkout OtpInline now 6 OTP BOXES (`otp-boxes`, `otp-box-N`, hidden `otp-code`) with manual "Verify OTP & continue" only (no auto-verify); login: demo-login block removed, feature chips smaller + width-constrained (no overlap with hero), subtitle width tightened, placeholder single-line "Enter mobile number".

- 2026-09-28 Features (testing agent iteration_147 all pass): (1) Customer Selfie View — customer booking detail shows "Partner Check-in" block (mobile `PartnerCheckin` in BookingDrawers.tsx: selfie thumb → fullscreen modal, arrived text, time, distance (amber if far), map link; web reuses `CheckinProof` DBlock in CustomerDashboard.jsx) when `booking.checkin` exists. (2) Recent Searches — `AppSearchBar` remembers last 6 submitted queries (AsyncStorage `azo_recent_searches_v1`), chips `recent-{slug}` under the bar while <2 chars typed, X removes, `recent-clear` clears; voice/typed/"See all" all remembered. (3) Active Job Card polish — partner mobile + web header: tinted band (blue / emerald when started), gradient icon tile, #code chip, category, big `status-pill-{code}` + job amount. Demo job AZOAF1BBB currently arrived_customer with a check-in (distance 2.2 km) for demos.

- 2026-09-28 Features (testing agent iteration_148 all pass): (1) Live Partner Tracking — customer booking detail "Live Tracking" block while assigned/arrived_*/started: mobile `LiveTrackCard.tsx` (polls GET /bookings/{id}/track 15s; native = Leaflet+OSM tiles in WebView with partner/customer pins, web = OSM embed iframe; ETA text, distance, min chip) and web wires existing `LiveTrack.jsx` into CustomerDashboard. Partner mobile `active.tsx` restores GPS sharing while travelling (assigned/arrived_shop, not comm_locked): expo-location watch → POST /bookings/{id}/location every 20s/40m (native only). (2) Inline video playback — shared `InlineVideo.tsx` (web <video>, native WebView <video>) in both mobile apps; partner ProofGrid (mobile `video-player-modal`/`inline-video`, web portal modal) and customer lightboxes (`lightbox-video`) play work-proof clips in-app; web WorkProof lightbox already inline. Demo booking AZOAF1BBB has a sample before-video URL (w3schools mov_bbb.mp4) for demos.

- 2026-06 (fork) Health check: user asked "sab working hai na?" → full regression via testing agent iteration_149: backend pytest 21/21 (auth all roles, catalog, subscription create→pay→invoice, maid partner OTP-stripped, admin stats/assign, one-time JobWizard checkin→before proof→start OTP→chunked video→complete→track, customer endpoints) + web panel (customer/partner/admin/maid), Partner Expo-web, Customer Expo-web — 100%, ZERO bugs. Fixes done: LiveTrackCard.tsx react-compiler memoization lint error; stale `EXPO_PACKAGER_PROXY_URL` in frontend/package.json updated to current preview URL. Reusable regression suite: `backend/tests/test_iter149_regression.py`.

### Env note
backend/.env, frontend/.env, Customer/.env were MISSING on this pod and were recreated (DB_NAME=azoapp, MONGO_URL local, EXPO_PUBLIC_BACKEND_URL / REACT_APP_BACKEND_URL = preview URL).
