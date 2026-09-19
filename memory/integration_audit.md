# Integration Center — Consumption Audit (#4)  ·  2026-06

Policy required by user: **not configured → demo/mock behavior; configured/active → real API.**
Result: the architecture ALREADY implements this policy correctly for every integration. One
real gap (OTP leak) was found and fixed.

| Integration | Config gate | Not configured (demo) | Configured (real) | Status |
|---|---|---|---|---|
| SMS / OTP (Fast2SMS) | `sms_service.sms_configured()` = sms_enabled + api_key | fixed OTP 123456 returned in API response (app usable) | random OTP sent via Fast2SMS; NOT returned in response | ✅ (fixed leak) |
| Pay-in (Razorpay + Cashfree/PayU/Easebuzz/Juspay) | `payment_service.is_configured()` / `payment_gateways.*_live()` = enabled + keys | dev mock order (order.mock=true) | real gateway order + server-side signature verify | ✅ |
| Payouts (RazorpayX + others) | `payout_service.is_live()` = enabled + account+key+secret | `pout_sim_*` simulated payout (status processed) | real Contact→Fund→Payout + webhook status sync | ✅ |
| Email (SMTP / SendGrid) | `email_enabled` + creds | graceful skip `{ok:false, skipped:"email_not_configured"}` | real SMTP/SendGrid send | ✅ |
| Push (FCM) | service-account JSON present | `{skipped:"not_configured"}` (no-op) | real FCM multicast to device tokens | ✅ |
| Storage (AWS S3) | `aws_s3_enabled` + keys | local disk `/media/file/...` | S3 upload + authenticated proxy `/media/s3/...` | ✅ (prior fork) |
| Maps / Geocoding | `integrations.google_maps_api_key` | OpenStreetMap Nominatim fallback | Google Geocoding | ✅ |
| Cache (Upstash) | upstash url+token | in-process / DB read-through | Upstash Redis REST | ✅ |
| OCR (Aadhaar) | `ocr_enabled` + Gemini (Emergent key) | disabled → manual entry | Gemini OCR extract/verify | ✅ |

## Fix applied
`auth_service.send_otp`: previously, when SMS **was** configured but Fast2SMS delivery
FAILED (or the OTP SMS event was disabled), it fell through and returned the real OTP in the
API response (`dev_otp`) — a production leak + "active but demo" behavior. Now: when the SMS
gateway is configured (non-demo number), a failed send returns `{sent:false, error:"sms_failed"}`
and NEVER leaks the OTP. The `dev_otp` response is returned ONLY when no gateway is configured
(or a demo account). Frontend `OtpLogin.jsx` + `AuthSheet.jsx` now handle `sent:false` (stay on
the phone step, show a retry error) instead of advancing to OTP entry.
Verified: unit test (3 branches: configured+fail no-leak / configured+success sms / unconfigured
dev_otp) + curl e2e demo login (admin & partner still work with 123456).

## Note on demo accounts
Demo accounts (+9190000000xx, is_demo=True) always use OTP 123456 while `demo_mode` is ON,
regardless of SMS config — this is the admin's own testing convenience and short-circuits BEFORE
the real-SMS branch. Real phone numbers always get real Fast2SMS OTPs (SMS is currently LIVE).
Turning `demo_mode` OFF disables the demo shortcut (real users unaffected).

## Cannot be auto-tested (need real credentials/devices)
- Real Fast2SMS OTP delivery to a phone (would send real SMS / cost money).
- A completed LIVE Razorpay pay-in / payout (needs a real card / bank).
- Real FCM background push to a physical device (needs a registered device token).
Only the GATING (configured→real vs unconfigured→demo) is auto-verified.
