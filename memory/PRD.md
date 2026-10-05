# AzoApp PRD

Original: Customer App, Partner App (Expo), Customer Web panel, FastAPI backend.

## Jun 2026 - UI fixes batch
- Removed 'Call, Chat & your Start OTP are now available.' (Customer app + web)
- Partner proof Photo/Video tiles centered
- Refund timeline text wraps (Customer app)
- Compact single-line 9-option rating row (Customer app + web)
- Backend ReviewRequest.rating float (4.5 allowed)

## Backlog
- Rebuild Expo apps + redeploy backend so fixes reach devices/production

## Jun 2026 - batch 2
- Real Google map embed on booking address (Customer app + web fallback)
- In-app expo-camera selfie (fallback ImagePicker + pending result recovery)
- Partner fee checkout bottom safe area
- Welcome title 2 lines medium
- Web incoming job image circular (keep-round)
- Login unregistered number -> Account not found panel

## Jun 2026 - Selfie face guide
- Oval face guide overlay (SVG mask + dashed ellipse + hint) in web CameraCapture (faceGuide prop, selfie only) and Expo SelfieCamera

## Jun 2026 - Selfie smart checks
- Web: MediaPipe face detection (green oval + shutter enabled only with face), luma low-light warning, 3s countdown, fallback when detector unavailable
- App: ML Kit (@infinitered/react-native-mlkit-face-detection) via silent probe frames, EXIF low-light, 3s countdown, fallback

## Jun 2026 - Selfie Face Match
- services/face_match_service.py: vision LLM (admin OCR config) compares KYC live photo vs check-in selfie in background; booking.checkin.face_match + face_mismatch flag; admin notifications on mismatch; users.face_mismatch_count
- POST /api/admin/bookings/{id}/face-match re-check; admin-only (stripped for customer/partner)
- Admin web: FaceMatchPanel in Work Proof; deep link /admin?tab=bookings&booking=<id>
- Backlog: mismatch filter/chip in admin bookings list; partner-level mismatch report
