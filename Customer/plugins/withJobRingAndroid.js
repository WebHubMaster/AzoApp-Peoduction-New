/* eslint-disable */
/**
 * Expo config plugin — Android bits needed for the call-like Job Ring:
 *  • permissions (full-screen intent, foreground service, wake lock, vibrate, boot)
 *  • Notifee foreground service declaration (keeps the ring alive when app is closed)
 *  • copies the ring tone to res/raw/job_ring.wav and the status-bar icon to
 *    res/drawable/ic_notification.png
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PERMS = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.WAKE_LOCK",
  "android.permission.VIBRATE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
];

function withManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    // `tools:` namespace is needed for the meta-data override below.
    manifest.manifest.$ = manifest.manifest.$ || {};
    if (!manifest.manifest.$["xmlns:tools"]) {
      manifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }
    manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"] || [];
    for (const p of PERMS) {
      if (!manifest.manifest["uses-permission"].some((x) => x.$["android:name"] === p)) {
        manifest.manifest["uses-permission"].push({ $: { "android:name": p } });
      }
    }
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    // FCM token registration flag. firebase-messaging 25.x (RNFB v26 → BoM 34.x)
    // DEPRECATED FirebaseMessaging.getToken(): with FID-based registration ENABLED
    // (flag=true / default) getToken() throws "API disabled. Please use register()".
    // BOTH expo-notifications' getDevicePushTokenAsync AND RNFB messaging().getToken()
    // still call getToken(), so we MUST keep the legacy path enabled → flag=false.
    // (The 400 INVALID_ARGUMENT we saw with a fresh device is a STALE Firebase
    // Installation ID, which the app clears + retries at runtime — see
    // resetFirebaseInstallation() in notifications.ts.)
    app["meta-data"] = app["meta-data"] || [];
    const FID_FLAG = "firebase_messaging_installation_id_enabled";
    app["meta-data"] = app["meta-data"].filter((m) => m.$["android:name"] !== FID_FLAG);
    app["meta-data"].push({ $: {
      "android:name": FID_FLAG,
      "android:value": "false",
      "tools:replace": "android:value",
    } });
    // Manifest merger conflict fix: expo-notifications injects the Firebase
    // Messaging default notification color/icon meta-data with OUR values
    // (@color/notification_icon_color, @drawable/notification_icon), while the
    // [:react-native-firebase_messaging] library ships the SAME meta-data with
    // its own defaults (@color/white). The merger fails because two libraries
    // set the same attribute to different values. We re-declare these meta-data
    // with `tools:replace` so OUR value wins instead of aborting the build.
    // This keeps the notification colour/icon exactly as configured — the
    // ring / reminder / push behaviour is untouched.
    const RES_META = [
      { name: "com.google.firebase.messaging.default_notification_color", res: "@color/notification_icon_color" },
      { name: "com.google.firebase.messaging.default_notification_icon", res: "@drawable/notification_icon" },
    ];
    for (const { name, res } of RES_META) {
      // keep whatever resource value expo-notifications already set (if present)
      const prev = app["meta-data"].find((m) => m.$["android:name"] === name);
      const resource = (prev && prev.$["android:resource"]) || res;
      app["meta-data"] = app["meta-data"].filter((m) => m.$["android:name"] !== name);
      app["meta-data"].push({ $: {
        "android:name": name,
        "android:resource": resource,
        "tools:replace": "android:resource",
      } });
    }
    app.service = app.service || [];
    if (!app.service.some((s) => s.$["android:name"] === "app.notifee.core.ForegroundService")) {
      app.service.push({ $: {
        "android:name": "app.notifee.core.ForegroundService",
        // dataSync ONLY: keeps the process alive + holds the always-on SSE job
        // listener open. We deliberately do NOT use "mediaPlayback" — on Android
        // 14+ starting a mediaPlayback foreground service without an active
        // MediaSession throws and CRASHES the app (the "toggle online / ring →
        // app closes" bug). The ring tone plays via expo-audio (its own audio
        // focus), so dataSync is all we need.
        "android:foregroundServiceType": "dataSync",
        "android:stopWithTask": "false",
        "android:exported": "false",
      } });
    }
    // Launch over the lock screen when the full-screen intent fires.
    const act = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    act.$["android:showWhenLocked"] = "true";
    act.$["android:turnScreenOn"] = "true";
    act.$["android:showOnLockScreen"] = "true";
    return cfg;
  });
}

function withResources(config) {
  return withDangerousMod(config, ["android", (cfg) => {
    const res = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res");
    const copies = [
      [path.join(cfg.modRequest.projectRoot, "assets", "sounds", "job-ring.wav"), path.join(res, "raw", "job_ring.wav")],
      [path.join(cfg.modRequest.projectRoot, "assets", "notification-icon.png"), path.join(res, "drawable", "ic_notification.png")],
    ];
    for (const [src, dst] of copies) {
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    }
    return cfg;
  }]);
}

module.exports = function withJobRingAndroid(config) {
  return withResources(withManifest(config));
};
