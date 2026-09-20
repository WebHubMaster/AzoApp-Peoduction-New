# AzoApp — PRD / Setup Notes

## Problem statement (this session)
1. Fix SVG upload ("Upload failed") and ensure ALL image uploads across the app route to the
   Integration-Center-connected storage (AWS S3) when configured, else local disk.
2. Fully set up the forked multi-app repo like the previous working setup:
   - /app/backend  → FastAPI (supervisor, port 8001), auto-seeds demo data on startup.
   - /app/web_panel → React (CRA/craco), served on default preview (port 3000).
   - /app/frontend → Expo (React Native), run via Expo Go using tunnel exp:// URL.
   Auth OTP-based (dev mode), OTP 123456 for all demo accounts.

## Architecture
- Backend FastAPI on :8001, MongoDB (DB_NAME=azoapp). Uploads go through services/storage_service.py.
- storage_service: S3 if Integration Center has aws_s3_enabled + keys+bucket, else local /app/backend/uploads
  served via GET /api/media/file/{...}. SVG stored as-is (no raster compression). Content sniffing handles
  missing/octet-stream MIME (e.g. SVG from Windows). Private buckets served via /api/media/s3/{key} proxy.
- All UploadFile endpoints (media, merchant, partner_reg, support, merchant_reg, booking evidence, crm) use storage_service.
- web_panel/.env keeps REACT_APP_BACKEND_URL EMPTY → api.js falls back to same-origin /api (avoids CORS on demo login).

## What's been implemented / done (2026-09-20)
- Created missing .env files: backend, frontend (Expo), web_panel.
- Restarted backend (200, demo data seeded). 
- Set up /etc/supervisor/conf.d/webpanel.conf → web_panel on port 3000 (RUNNING, 200).
- Expo tunnel started (@expo/ngrok) → exp://hxph7ra-anonymous-8081.exp.direct.
- SVG upload fix: verified backend save_image handles SVG (image/svg+xml + octet-stream). Client imageUpload.js
  now special-cases SVG (skip 2MB raster shrink cap; served as-is up to backend 12MB cap).
- Verified via testing agent (frontend 100%): 4 one-click demo logins (Admin/Partner/Customer/Merchant) with no
  CORS/'Demo login failed'; SVG + PNG upload in Admin Branding & Theme works end-to-end.

## Credentials
See /app/memory/test_credentials.md (OTP 123456 for all).

## Backlog / known minor (pre-existing, out of scope)
- P2: GET /api/partner/alert-prefs returns 403 for demo partner (non-blocking).
- P3: Recharts ResponsiveContainer size warnings on admin analytics (cosmetic).
- Note: Expo tunnel exp:// URL regenerates on restart; re-run `npx expo start --tunnel --port 8081` and read from ngrok 4040.

## Mobile Active Job Panel parity (2026-09-20)
Goal: Mobile (Expo) `/(partner)/active` = Web `PartnerDashboard.jsx` ActiveJob (mobile view), same UI/UX + APIs.
File: /app/frontend/app/(partner)/active.tsx (rewritten, reuses theme + AppShell + ui + Icon).
Brought to parity with web:
- Additional work now uses the web rate-card flow: GET /ratecards/by-category/{category_id} + POST /bookings/{id}/additional + DELETE /additional/{item_id}; itemised parts/labour/GST/total, Paid/Payment-pending badge; complete blocked while additional payment pending (addlPending). (Replaced old spare_parts/SpareModal.)
- New RateCardSheet (RN mirror of web RateCardModal): grouped rows, search, warranty badge, service_charge + labour, Add.
- Full ServiceBreakdown (breakdown.service_items: qty, rate×qty, nested add-ons, services subtotal, additional charges, Total Service Amount excl. taxes).
- Full PartnerEarningSummary (Payment Summary, Customer-only charges, Your earning shares, Net Earning, cancelled/refund block) from breakdown.
- ScheduledCard with live countdown + lock chips (schedule.seconds_to_start/comm_locked/phase).
- Share Location button (expo-location) -> POST /bookings/{id}/location, for assigned/arrived_customer/started.
Unchanged parity already present: state banner + elapsed timer, header, location, JobStepper, reschedule pending/request/respond/cancel, Navigate, Call/Chat, before/after PhotoBlock + Start/Complete OTP, timeline, CompletedJob.
Verified: tsc --noEmit passes; Metro bundles router entry (HTTP 200, expo-location resolved, 0 unresolved); /bookings/partner/active returns breakdown.service_items+earning+customer_only_charges+schedule+category_id; rate-card + /additional + pending-gate tested via curl as demo partner (+919000000003, OTP 123456).
Note: native Expo Go app can't be driven by the browser (Playwright) testing agent; verification was tsc + Metro bundle + backend endpoint checks + line-by-line web parity.
