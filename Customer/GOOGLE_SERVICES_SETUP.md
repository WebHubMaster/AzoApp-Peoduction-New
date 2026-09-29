# Customer app — Firebase (google-services.json) setup

The full-screen reschedule alert on a **closed / locked** phone is delivered via a raw
FCM push. That needs the Firebase Android config for this app's package bundled into
the build.

## What you must do before building the Customer app (EAS / `expo run:android`)

1. In the Firebase console for project **`azo-project-9f857`**, add an Android app with
   package name **`app.azoapp.customer`** (if it isn't there already).
2. Download that project's **`google-services.json`** (it will contain the
   `app.azoapp.customer` client).
3. Place it at **`/app/Customer/google-services.json`** (referenced by `app.json` →
   `android.googleServicesFile`).

You can also upload/keep it on record from **Admin → Integration Center → Firebase
Settings → "Customer app google-services.json"**, and download it from there.

## Notes
- The backend already sends to the **same** Firebase project + service account, so no
  server change is needed once the Customer app registers a raw FCM token.
- Until this file is present, the app still works: foreground reschedule alerts arrive
  over SSE, and a best-effort Expo tray notification is used as a fallback — but the
  reliable **closed-app / lock-screen full-screen ring requires this file**.
- Android 14+ users must allow "Full screen intents" and "Display over other apps" the
  first time (the app deep-links them to the settings).
