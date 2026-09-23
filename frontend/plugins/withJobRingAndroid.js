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
    // Firebase Messaging 25.1+ ships FID-based registration; if any (transitive)
    // SDK flips `firebase_messaging_installation_id_enabled` to true, the LEGACY
    // FirebaseMessaging.getToken() that expo-notifications' getDevicePushTokenAsync
    // relies on gets DISABLED and throws "FCM Registration failed!". Force it back
    // to the legacy path so token registration works. `tools:replace` wins over
    // whatever a library merged in.
    app["meta-data"] = app["meta-data"] || [];
    const FID_FLAG = "firebase_messaging_installation_id_enabled";
    app["meta-data"] = app["meta-data"].filter((m) => m.$["android:name"] !== FID_FLAG);
    app["meta-data"].push({ $: {
      "android:name": FID_FLAG,
      "android:value": "false",
      "tools:replace": "android:value",
    } });
    app.service = app.service || [];
    if (!app.service.some((s) => s.$["android:name"] === "app.notifee.core.ForegroundService")) {
      app.service.push({ $: {
        "android:name": "app.notifee.core.ForegroundService",
        // mediaPlayback = looping ring; dataSync = the always-on background job
        // listener that holds the SSE stream open (FCM-independent ring path).
        "android:foregroundServiceType": "mediaPlayback|dataSync",
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
