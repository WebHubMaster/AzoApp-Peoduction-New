/* eslint-disable @typescript-eslint/no-require-imports */
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
  "android.permission.WAKE_LOCK",
  "android.permission.VIBRATE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
];

function withManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    manifest.manifest["uses-permission"] = manifest.manifest["uses-permission"] || [];
    for (const p of PERMS) {
      if (!manifest.manifest["uses-permission"].some((x) => x.$["android:name"] === p)) {
        manifest.manifest["uses-permission"].push({ $: { "android:name": p } });
      }
    }
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service || [];
    if (!app.service.some((s) => s.$["android:name"] === "app.notifee.core.ForegroundService")) {
      app.service.push({ $: {
        "android:name": "app.notifee.core.ForegroundService",
        "android:foregroundServiceType": "mediaPlayback",
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
