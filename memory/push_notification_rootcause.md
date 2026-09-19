# Push Notification — Verified Root Cause (2026-09)

## Verdict
AzoApp push CODE + Firebase CONFIG are correct and complete. Push does NOT deliver because of
an EXTERNAL Google Cloud restriction that cannot be fixed in code.

## Live diagnostic evidence (GET /api/admin/notifications/health)
- service_account: configured (project azo-project-9f857) ✅
- web_config: all fields set ✅
- vapid_key: set ✅
- fcm_enabled: true ✅
- web_api_key probe:
  - Firebase Installations API → **BLOCKED (HTTP 403 API_KEY_SERVICE_BLOCKED)**
  - FCM Registration API → allowed
- ready_for_push: false, reasons.web_api_key set.

Browser symptom this causes: `installations/request-failed` → getToken() fails →
`AbortError: Registration failed - push service error` → device never registers → no delivery.

## THE FIX (user must do this in Google Cloud Console — not a code change)
1. Google Cloud Console → APIs & Services → Credentials, project **azo-project-9f857**.
2. Open the **Browser API key** matching the Firebase web `apiKey` (AIzaSyBuKczsXZoHwAbvBPPaU-f2npa0KkapbxE).
3. Under **API restrictions** either pick **Don't restrict key**, OR allow: **Firebase Installations API** +
   **Firebase Cloud Messaging API** + **FCM Registration API**.
4. Also ensure those APIs are ENABLED (APIs & Services → Library) for the project.
5. Save, wait ~1 min, press Refresh in Admin → Notifications → Diagnostics. When the probe turns
   green the backend auto-emits `push_reregister` (SSE) so every open app silently re-registers.

## App-side status: ALREADY complete (do not rebuild)
- push.js: single-flight, permission auto-continue, SW-ready wait, AbortError/stale-subscription
  recovery, 5-attempt exp backoff, idempotent backend register (device_id), staged error reasons.
- PushRegistrar.jsx: auto-recovery on push_reregister/visibility/online/focus/pageshow.
- fcm_service.py: encrypted SA, idempotent multi-device register, dead-token deactivation, web-api-key probe.
- NotificationDiagnostics UI: shows exact failed stage + Google Cloud fix steps (verified in browser).
