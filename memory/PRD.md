# AzoApp — PRD / Progress Log

## Problem statement
Existing full-stack project "AzoApp — Premium Home Services" (Expo React Native app + FastAPI + MongoDB).
Native-first Expo app for Partners, Merchants and (now) field QR Agents. Web preview is blank by design
(app gates on fontsLoaded; real testing is via Expo Go / mobile through ngrok).

## Architecture
- Backend: FastAPI @ :8001, all routes under /api. MongoDB auto-seeds on startup ("AzoApp seed complete").
- Frontend: Expo Router app (app/ dir) with role sections: (partner), (merchant), (agent), (auth).
- Auth: phone + OTP (demo mode, OTP 123456). JWT with {uid, role}.

## Done
- 2026-09-22: Fresh-container bring-up — .env files, deps, services, seed verified (all HTTP 200).
- 2026-09-22: **Agent login + Agent app section**. Field QR agents (role=agent, is_qr_agent) can now
  log into the SAME mobile app (previously the app rejected any non partner/merchant role).
  - Frontend: added "agent" to login-allowed roles + routing (app/(auth)/login.tsx, app/index.tsx),
    registered (agent) stack (app/_layout.tsx), added "map" tab to AppTabBar, added "agent" to AppUser type.
  - New agent section app/(agent)/: _layout (tabs), index (dashboard: wallet, batches, earnings),
    map (QR→merchant mapping via token lookup + merchant search + assign), wallet (balance, bank KYC,
    withdraw, history), profile.
  - Backend: seed_demo_agent() in physical_qr_service + wired in server.py startup → demo agent
    +919000000006 "Ravi", 2 batches assigned, 2 sample mappings (₹40). demo_status limit raised to 80
    + agent added to sort order so the one-click demo login shows the agent.
  - Verified via curl: login, /agent/me, /agent/earnings, batches, QR list, merchant-search, assign
    (credits ₹20/mapping), wallet updates. All new frontend files compile (babel-preset-expo, 10/10 OK).

## Backlog / Next
- P1: Optional camera/barcode scan on Map QR screen (currently manual token entry — robust & dependency-free).
- P2: Agent notifications when admin verifies bank / approves withdrawal.
- P2: Admin-side agent detail already exists (physical_qr_routes) — surface agent performance in admin UI.
