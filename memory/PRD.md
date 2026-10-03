# AzoApp Super Admin — PRD / Progress

## Problem statement
Redesign 5 Super Admin modules into ONE premium, enterprise-grade design system, and standardize
typography + form controls across the whole admin — WITHOUT changing any backend/API/business logic.
Modules: Ratings & Reviews, Sub-Categories, Service Categories, Custom Job Requests, Add-on Services.

## Architecture
- Admin panel = React (CRA + CRACO) at `/app/web_panel`, served on port 3000 (supervisor `frontend`).
- Backend = FastAPI at `/app/backend` (port 8001), Mongo DB `azoapp_database`.
- Shared UI: Radix + shadcn components in `src/components/ui/*`, premium controls `PremiumSelect`,
  `PremiumDatePicker`, `PremiumDateRangePicker`.

## Implemented (Jun 2026)
1. **Shared premium Module Kit** — `src/components/admin/ModuleKit.jsx`
   (PageHeader, KpiCard, StarRating, SectionCard, Field, CharCounter, Toolbar, SearchInput,
   FilterChip/ChipBar, StatusBadge, CountBadge, action icon buttons w/ tooltips, DataPanel/Th/Td/Tr,
   Pagination (first/prev/pages/next/last + rows-per-page), EmptyState, ErrorState, skeletons, ConfirmDialog,
   Primary/Secondary buttons).
2. **Ratings & Reviews** (`RatingsReviews.jsx`) — premium KPI cards, star pills, service list, review
   cards, debounced search + clear, filter chips, premium pagination, skeletons, empty states.
3. **Custom Job Requests** (`CustomJobsAdmin.jsx`) — premium filter command bar (search, status, category,
   pincode, From/To custom date pickers), filter chips + Reset, premium table, empty/loading states,
   client-side pagination. Detail view preserved unchanged.
4. **Service Categories / Sub-Categories / Add-on Services** (`adminSectionsPro.jsx`) — SectionCard forms,
   premium tables with image + count badges + clickable status toggle, icon action buttons, ConfirmDialog
   deletes (replaced window.confirm), table search + pagination, SEO char counters.
5. **Global typography + control standardization** — font switched to **Inter** everywhere
   (`index.css`, `tailwind.config.js`), CSS design tokens added; shared controls standardized to
   42px height / 8px radius / 14px text: `ui/input`, `ui/textarea` (110px), `ui/button` (default 42px),
   `ui/select`, `PremiumSelect`, `PremiumDatePicker`, `PremiumDateRangePicker`, ModuleKit SearchInput,
   sidebar menu-search + top-bar global-search.

## Verified
- Testing agent iteration_188: all 5 modules pass, no JS errors, no native date inputs.
- Testing agent iteration_189: Inter applied everywhere (incl. dark mode), all form controls 42px,
  textareas 110px, CRUD/search/filter/pagination/ConfirmDialog work, 100% pass.

## NOT changed (per requirement)
- Backend, APIs, routes, models, permissions, validation, pagination/sorting/filter/SEO/date logic.

## Backlog / Next
- Optional: sidebar menu re-grouping (IA proposal shared with user; awaiting go-ahead).
- Optional: extend the premium design system to the remaining admin modules (Bookings, Partners, Finance, etc.).

## Env note
- Restored `/app/backend/.env`: `MONGO_URL=mongodb://localhost:27017`, `DB_NAME=azoapp_database`, `CORS_ORIGINS=*`.
- `web_panel` node_modules were reinstalled (yarn) to start the dev server.
