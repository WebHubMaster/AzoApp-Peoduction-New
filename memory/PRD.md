# AzoApp — PRD / Working Notes

AzoApp: home-services marketplace. Apps in repo:
- `backend/` — FastAPI + MongoDB (`/api` prefix, supervised on :8001)
- `frontend/` — Partner Expo app (supervised on :3000)
- `Customer/` — Customer Expo app
- `web_panel/` — Admin + Partner + Customer web panel (React/CRACO)

## Recent work

### 2026-06 — Partner "Maid Subscriptions" menu visibility
- Hidden the "Maid Subscriptions" menu for non-maid partners (skills does not include "maid")
  in both web panel (`web_panel/src/pages/partner/PartnerDashboard.jsx`) and partner app
  (`frontend/app/(partner)/_layout.tsx`). Maids continue to see it; incentives stays hidden for maids.

### 2026-06 — Customer App Home: Video "Stories" section (admin-controlled)
Extended the existing Customer App Home CMS (`Admin → Customer App Home`, backed by
`GET/PUT /api/admin/app-home` and public `GET /api/app/home`).
- New custom-section type **"stories"** (alongside services / category / banner).
  Admin adds story cards, each with: title, avatar, poster/thumbnail, a video
  (upload via new `POST /api/media/upload-video`, MP4/MOV/WebM ≤25MB, or paste a URL),
  optional CTA label + link, and a per-story on/off toggle.
- Every section (built-in + custom stories/banner) has an on/off toggle and ordering in
  "Sections — order & visibility"; only enabled sections are returned by `/app/home`.
- Backend: `app_home_controller._public_home` resolves the stories section (skips disabled /
  media-less stories). Verified end-to-end via curl (scripts/test_stories.py — PASS).
- Customer app: `Customer/src/components/apphome/Stories.tsx`
  - `StoriesRow` — Instagram-style horizontal story cards (poster + avatar ring + title).
  - `StoryViewer` — full-screen modal, plays the short video via `react-native-webview`
    (autoplay, mute toggle, progress bars, tap left/right to navigate, CTA button).
  - Wired into `Customer/app/(site)/index.tsx`.

Files changed:
- backend/routes/media_routes.py (+ /media/upload-video)
- backend/controllers/app_home_controller.py (stories resolution)
- web_panel/src/pages/admin/AppHomeManager.jsx (stories editor + VideoUpload)
- Customer/src/components/apphome/Stories.tsx (new)
- Customer/app/(site)/index.tsx (wire stories row + viewer)

### 2026-06 — Auto Play Next + UI verification (testing_agent iter 150/151)
- Story viewer now **auto-advances** to the next story when the video ends, plus a
  **live progress bar** (per-story segment fills with playback) and an **onError fallback**
  (broken/unplayable video still advances after 5s so it never freezes on the poster).
- Cross-platform video split: `StoryVideo.tsx` (native WebView, posts `ended`/progress) and
  `StoryVideo.web.tsx` (real DOM `<video>` for react-native-web) — so it works on device AND web.
- Verified via testing_agent (frontend) on the Customer app served on :3000:
  stories row (3 cards), viewer open, mute/close/prev/next/CTA, and the full auto-advance
  chain (story 1→2→3→close) — 100% of observable acceptance criteria pass, no UI bugs.
  (Note: Playwright's Chromium lacks the H.264 codec so video pixels don't decode in that
  test browser; real browsers/devices play H.264 and the onError fallback covers the rest.)

## Backlog / Next

### 2026-06 — Customer app: signup + Book Now flow (testing_agent iter 152)
- Root cause of "signup nahi ho raha": the backend was down because all `.env` files were
  missing on the pod — restored them, backend healthy, OTP signup/login verified working
  end-to-end (new number -> OTP 123456 -> name step -> account created & logged in; existing
  number logs straight in).
- Book Now fix: category card 'Book Now' (testID `category-book-N`) now opens the service
  detail with `?book=1` which **auto-adds** the service to the booking (once, `autoAddRef`
  guard) and shows checkout immediately — no second 'Add to Booking' tap. Card body tap
  (`category-open-N`) still opens detail without adding. Files: `Customer/app/(site)/category/[id].tsx`,
  `Customer/app/(site)/service/[id].tsx`. Verified 5/5 flows pass incl. checkout reaches /book.

- P2: Circle-style story avatars variant (round bubbles) as an admin layout choice.
- P2: Turn recurring subscriptions on for Cook/Nanny/Driver/Housekeeping.
