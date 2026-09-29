// Register headless FCM push handlers (full-screen reschedule ring even when the app
// is backgrounded / closed) BEFORE the app entry, so they exist at process start.
import "./src/lib/pushBackground";
import "expo-router/entry";
