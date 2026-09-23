/**
 * Notifications for AzoApp Partner/Merchant — Notifee (display / channels /
 * permission / full-screen "incoming job" ring) + expo-notifications (FCM device
 * token + killed/locked background delivery via pushBackground.ts).
 *
 * IMPORTANT: Notifee + expo-notifications don't run in **Expo Go** or on web.
 * Every native call is lazily required behind `pushSupported` so the app stays
 * usable there (no-ops). On a real dev/production build everything works: FCM
 * device-token registration, WhatsApp-style chat pushes and the call-like job
 * ring that fires even when the app is closed or the phone is locked.
 *
 * NOTE: @react-native-firebase/messaging was removed on purpose — it broke FCM
 * token registration (java.io.IOException: FCM Registration failed) which killed
 * device registration and the background ring. See messaging() below.
 */
import { Platform, Linking, AppState } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { storage } from "@/src/utils/storage";
import { api, mediaUrl } from "@/src/api/client";
import { isBgListenerActive } from "@/src/lib/ringState";

export const NOTIF_PROMPTED_KEY = "azo_notif_prompted";
const DEVICE_ID_KEY = "azo_device_id";

export const CHANNELS = {
  // NOTE: Android notification channels are IMMUTABLE after first creation — you
  // cannot upgrade importance/sound of an existing id. Any old build that created
  // "job-ring"/"chat" with wrong settings would keep them (silent ring). Bump the
  // id (…-v3) + delete the old ids in setupAndroidChannels to force fresh channels.
  jobRing: "azo-job-ring-v3",
  jobRingSilent: "azo-ring-silent-v1",
  bookings: "bookings",
  chat: "azo-chat-v3",
  account: "account",
  default: "default",
  online: "azo-online-v1",
} as const;

/** Old channel ids to delete so their stale (silent) settings can't linger. */
const LEGACY_CHANNELS = ["job-ring", "job-ring-v2", "chat"];

/** Raw Android sound resource copied by plugins/withJobRingAndroid.js */
export const JOB_RING_SOUND = "job_ring";

// Expo Go (StoreClient) and web don't support the native modules — no-op there.
export const pushSupported =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let _notifee: any | null = null;

/** Lazily require @notifee/react-native ONLY when supported (never in Expo Go). */
export function notifee(): any | null {
  if (!pushSupported) return null;
  if (_notifee === null) {
    try { _notifee = require("@notifee/react-native"); } catch { _notifee = false; }
  }
  return _notifee || null;
}
export const NotifeeApi = () => notifee()?.default || null;

/** Lazily require expo-notifications — this ONE works in Expo Go (and web), so it
 * powers the permission request/status + Android channel when Notifee is absent. */
let _expoNotif: any | null = null;
export function expoNotif(): any | null {
  if (_expoNotif === null) {
    try { _expoNotif = require("expo-notifications"); } catch { _expoNotif = false; }
  }
  return _expoNotif || null;
}

async function setupExpoChannels() {
  const EN = expoNotif();
  if (!EN || Platform.OS !== "android") return;
  try {
    await EN.setNotificationChannelAsync(CHANNELS.jobRing, {
      name: "Job Ring Alerts", importance: EN.AndroidImportance.MAX,
      sound: "default", vibrationPattern: [400, 250, 400, 250],
      lightColor: "#0D47A1", bypassDnd: true, lockscreenVisibility: 1,
    });
    await EN.setNotificationChannelAsync(CHANNELS.chat, { name: "Chat Messages", importance: EN.AndroidImportance.HIGH, sound: "default" });
  } catch { /* ignore */ }
}

/** React Native Firebase Messaging — INTENTIONALLY DISABLED.
 *
 * WHY: adding `@react-native-firebase/messaging` made RNFB own the native
 * Firebase init + FCM token path. On real devices that path started failing with
 *   `[messaging/unknown] java.io.IOException: FCM Registration failed!`
 * (and older builds reported NO_FCM_MODULE), so NO device could register a push
 * token → the backend push never reached the phone → the full-screen job ring
 * stopped appearing when the app was closed / the phone was locked.
 *
 * The KNOWN-GOOD path (what shipped and worked before) is pure
 * `expo-notifications` for the FCM device token + the expo background task in
 * `pushBackground.ts` for killed/locked delivery, with Notifee rendering the
 * call-style full-screen ring. We keep this helper returning `null` (single
 * source of truth) so every RNFB code path below cleanly no-ops. Do NOT re-add
 * the `require("@react-native-firebase/messaging")` here — it reintroduces the
 * FCM Registration failure and also forces the native module back into the build. */
/** React Native Firebase Messaging — RE-ENABLED (the reliable "RNBC" killed-app path).
 *
 * WHY back: on a FULLY CLOSED / swiped / force-stopped app the JS runtime is dead,
 * so the SSE foreground-service listener can't run. The ONLY thing that reliably
 * wakes a killed app is RNFB's native FirebaseMessagingService, which delivers the
 * FCM data message to `setBackgroundMessageHandler` (see pushBackground.ts) → we
 * launch the Notifee full-screen ring (fullScreenAction) and the app auto-opens —
 * exactly the behaviour that worked before it was removed.
 *
 * REQUIREMENT: this needs a working FCM device token, which needs the Firebase
 * project's Cloud Messaging API (V1) + Installations API enabled and App Check NOT
 * enforced. RNFB and expo-notifications both mint the token via the SAME
 * FirebaseMessaging.getToken(), so the project-side fix is still required for
 * delivery — but with RNFB the killed-app HANDLER is reliable again. */
let _rnfbMessaging: any = null;
export function messaging(): any | null {
  if (!pushSupported) return null;
  if (_rnfbMessaging === null) {
    try { _rnfbMessaging = require("@react-native-firebase/messaging").default; }
    catch { _rnfbMessaging = false; }
  }
  try { return _rnfbMessaging ? _rnfbMessaging() : null; } catch { return null; }
}

/**
 * expo-notifications native DEVICE push token — on Android this is the RAW FCM
 * token (firebase-admin can send to it directly). This is a SECOND, independent
 * path to obtain a token that works even when @react-native-firebase/messaging
 * fails to instantiate, as long as google-services.json is bundled. Returns "".
 */
let _lastExpoTokenErr = "";
async function expoDeviceToken(): Promise<string> {
  const EN = expoNotif();
  if (!EN || Platform.OS === "web") return "";
  try {
    const t = await EN.getDevicePushTokenAsync();
    const val = typeof t === "string" ? t : t?.data;
    return typeof val === "string" ? val : "";
  } catch (e: any) { _lastExpoTokenErr = String(e?.message || e || ""); return ""; }
}

/** RNFB native FCM token — the "RNBC" path. Same underlying FirebaseMessaging.getToken()
 * as expo, but preferred because RNFB's service is what delivers to a killed app. */
async function rnfbDeviceToken(): Promise<string> {
  if (Platform.OS === "web") return "";
  try {
    const m = messaging();
    if (!m?.getToken) return "";
    const t = await m.getToken();
    return typeof t === "string" ? t : "";
  } catch (e: any) { _lastExpoTokenErr = String(e?.message || e || ""); return ""; }
}

/** Classify the raw native FCM token error into a stable reason the admin panel
 * can act on. "FCM Registration failed!" / FIS auth / installations => the
 * Firebase project APIs (FCM V1 + Installations) or the bundled expo-notifications
 * FCM setup are the problem; SERVICE_NOT_AVAILABLE / play services => the device. */
function classifyTokenError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (!m) return "no_token";
  if (m.includes("service_not_available") || m.includes("play services") || m.includes("playservices") || m.includes("missing_instanceid_service") || m.includes("api_unavailable")) return "play_services";
  if (m.includes("fcm registration failed") || m.includes("fis_auth") || m.includes("authentication") || m.includes("installations") || m.includes("sender")) return "fcm_registration_failed";
  if (m.includes("network") || m.includes("timeout") || m.includes("unavailable") || m.includes("connection")) return "network";
  return "no_token";
}

export async function setupAndroidChannels() {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || Platform.OS !== "android") return;
  const { AndroidImportance, AndroidVisibility } = mod;
  // Delete stale channels first (their old importance/sound can't be upgraded).
  for (const id of LEGACY_CHANNELS) { try { await n.deleteChannel(id); } catch { /* ignore */ } }
  await n.createChannel({
    id: CHANNELS.jobRing, name: "Job Ring Alerts",
    description: "Incoming job requests ring like a call",
    importance: AndroidImportance.HIGH, sound: JOB_RING_SOUND,
    vibration: true, vibrationPattern: [400, 250, 400, 250],
    lights: true, lightColor: "#0D47A1", bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
  // Silent, high-importance channel for the call-style ring: NO channel sound
  // (omitting `sound` = play no sound) so the admin's CUSTOM uploaded tone plays
  // via expo-audio (looped until action) instead of the bundled default.
  await n.createChannel({
    id: CHANNELS.jobRingSilent, name: "Incoming Job (custom ring)",
    description: "Incoming job requests — plays your uploaded ring tone",
    importance: AndroidImportance.HIGH,
    vibration: true, vibrationPattern: [400, 250, 400, 250],
    lights: true, lightColor: "#0D47A1", bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
  await n.createChannel({ id: CHANNELS.chat, name: "Chat Messages", importance: AndroidImportance.HIGH, sound: "default", vibration: true, vibrationPattern: [200, 100, 200, 100], visibility: AndroidVisibility.PUBLIC });
  await n.createChannel({ id: CHANNELS.bookings, name: "Booking Updates", importance: AndroidImportance.HIGH, vibration: true, vibrationPattern: [250, 250, 250, 250] });
  await n.createChannel({ id: CHANNELS.account, name: "Account Alerts", importance: AndroidImportance.DEFAULT });
  await n.createChannel({ id: CHANNELS.default, name: "General", importance: AndroidImportance.DEFAULT });
  await n.createChannel({ id: CHANNELS.online, name: "Online — job listener", importance: AndroidImportance.LOW, visibility: AndroidVisibility.PUBLIC });
}

export async function getPermissionStatus(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const n = NotifeeApi();
  if (n) {
    const s = await n.getNotificationSettings();
    const { AuthorizationStatus } = notifee();
    const granted = s.authorizationStatus === AuthorizationStatus.AUTHORIZED || s.authorizationStatus === AuthorizationStatus.PROVISIONAL;
    return { granted, canAskAgain: s.authorizationStatus !== AuthorizationStatus.DENIED };
  }
  // Expo Go / web → expo-notifications reports the real OS permission.
  const EN = expoNotif();
  if (EN) {
    try {
      const s = await EN.getPermissionsAsync();
      return { granted: s.granted === true || s.status === "granted", canAskAgain: s.canAskAgain !== false };
    } catch { /* ignore */ }
  }
  return { granted: false, canAskAgain: true };
}

export async function requestNotificationPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const n = NotifeeApi();
  if (n) {
    await setupAndroidChannels();
    const s = await n.requestPermission({ alert: true, badge: true, sound: true, criticalAlert: true });
    const { AuthorizationStatus } = notifee();
    const granted = s.authorizationStatus === AuthorizationStatus.AUTHORIZED || s.authorizationStatus === AuthorizationStatus.PROVISIONAL;
    return { granted, canAskAgain: s.authorizationStatus !== AuthorizationStatus.DENIED };
  }
  // Expo Go / web → expo-notifications shows the real system permission dialog.
  const EN = expoNotif();
  if (EN) {
    await setupExpoChannels();
    try {
      const s = await EN.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true } });
      return { granted: s.granted === true || s.status === "granted", canAskAgain: s.canAskAgain !== false };
    } catch { /* ignore */ }
  }
  return { granted: false, canAskAgain: false };
}

/**
 * Android reliability for a call-like ring when the app is closed / phone locked:
 * ask to exclude the app from battery optimisation and (OEMs) allow auto-start.
 * Best-effort — opens the system screens only when needed.
 */
export async function ensureRingReliability() {
  const n = NotifeeApi();
  if (!n || Platform.OS !== "android") return;
  try {
    if (await n.isBatteryOptimizationEnabled()) await n.openBatteryOptimizationSettings();
  } catch { /* ignore */ }
  try {
    const pm = await n.getPowerManagerInfo();
    if (pm?.activity) await n.openPowerManagerSettings();
  } catch { /* ignore */ }
}

/** Android 14+: full-screen intent permission screen for this app. */
export async function openFullScreenIntentSettings() {
  if (Platform.OS !== "android") return;
  const pkg = Constants.expoConfig?.android?.package || "app.azoapp.partner";
  try {
    await storage.setItem(FSI_ASKED_KEY, "1");
    await Linking.sendIntent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", [{ key: "android.provider.extra.APP_PACKAGE", value: pkg }]);
  } catch {
    try { await Linking.openSettings(); } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Unified permission hub — everything the Job Ring needs, requested   */
/*  the moment the app opens (see app/onboarding/permissions.tsx).      */
/* ------------------------------------------------------------------ */
export type PermKey = "notifications" | "location" | "battery" | "fullscreen" | "overlay";
export type PermState = {
  key: PermKey;
  granted: boolean;      // true = fully satisfied
  canAskAgain: boolean;  // false = must open system Settings
  available: boolean;    // false = not applicable on this platform / Expo Go
};

const _androidSdk = (): number => Number(Platform.OS === "android" ? (Platform.Version as number) : 0);

/* Notifications — real OS permission via Notifee (build) or expo-notifications
 * (Expo Go / web). Always actionable so it never shows a dead "Build only". */
export async function notifState(): Promise<PermState> {
  const s = await getPermissionStatus();
  const available = !!(NotifeeApi() || expoNotif());
  return { key: "notifications", granted: s.granted, canAskAgain: s.canAskAgain, available };
}

const BATTERY_ASKED_KEY = "azo_battery_asked";
const FSI_ASKED_KEY = "azo_fsi_asked";
const OVERLAY_ASKED_KEY = "azo_overlay_asked";

/* Display over other apps (SYSTEM_ALERT_WINDOW) — lets the app launch the
 * full-screen ring OVER other apps / on an UNLOCKED screen (Rapido/Truecaller
 * style). Can't be introspected from JS, so we treat it as satisfied once the
 * user has been sent to the setting. */
export async function overlayState(): Promise<PermState> {
  if (Platform.OS !== "android") return { key: "overlay", granted: Platform.OS === "ios", canAskAgain: false, available: false };
  const asked = (await storage.getItem(OVERLAY_ASKED_KEY)) === "1";
  return { key: "overlay", granted: asked, canAskAgain: true, available: true };
}
export async function requestOverlayPermission() {
  if (Platform.OS !== "android") return;
  try { await storage.setItem(OVERLAY_ASKED_KEY, "1"); } catch { /* ignore */ }
  const pkg = Constants.expoConfig?.android?.package || "app.azoapp.partner";
  try {
    const IntentLauncher = require("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      "android.settings.action.MANAGE_OVERLAY_PERMISSION",
      { data: `package:${pkg}` },
    );
  } catch {
    try { await Linking.openSettings(); } catch { /* ignore */ }
  }
}

/* Battery optimisation exemption — required so a killed app can still ring. */
export async function batteryState(): Promise<PermState> {
  if (Platform.OS !== "android") return { key: "battery", granted: Platform.OS === "ios", canAskAgain: false, available: false };
  const asked = (await storage.getItem(BATTERY_ASKED_KEY)) === "1";
  const n = NotifeeApi();
  if (n) {
    try {
      await n.isBatteryOptimizationEnabled();
      // Require the user to explicitly run the "Run in Background" flow once (many
      // OEMs report "not optimized" by default which wrongly pre-ticked the card).
      return { key: "battery", granted: asked, canAskAgain: true, available: true };
    } catch { /* fall through */ }
  }
  // Expo Go / no notifee: reflect whether the user ran the request at least once.
  return { key: "battery", granted: asked, canAskAgain: true, available: true };
}
export async function requestBatteryExemption() {
  const n = NotifeeApi();
  if (Platform.OS !== "android") return;
  // Mark asked FIRST so the card turns green even when the device is already exempt
  // (the early-return below used to skip this → button stayed stuck on "Allow").
  try { await storage.setItem(BATTERY_ASKED_KEY, "1"); } catch { /* ignore */ }
  try {
    if (n && !(await n.isBatteryOptimizationEnabled())) return; // already exempt
  } catch { /* ignore */ }
  const pkg = Constants.expoConfig?.android?.package || "app.azoapp.partner";
  // Preferred: the DIRECT system dialog ("Allow app to run in background? Yes"),
  // one tap — via REQUEST_IGNORE_BATTERY_OPTIMIZATIONS with a package: data URI.
  try {
    const IntentLauncher = require("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      { data: `package:${pkg}` },
    );
  } catch {
    // Fallback: open the battery-optimization list (Notifee build) or the general
    // settings screen so the user can allow it manually.
    try { if (n) await n.openBatteryOptimizationSettings(); } catch { /* ignore */ }
  }
  try { await storage.setItem(BATTERY_ASKED_KEY, "1"); } catch { /* ignore */ }
}

/* Full-screen intent — Android 14+ (SDK 34) needs the user to allow call-style
 * screens. On older Android it is granted by the manifest permission. */
export async function fullScreenState(): Promise<PermState> {
  if (Platform.OS !== "android") return { key: "fullscreen", granted: Platform.OS === "ios", canAskAgain: false, available: false };
  const sdk = _androidSdk();
  if (sdk < 34) return { key: "fullscreen", granted: true, canAskAgain: false, available: true };
  const n = NotifeeApi();
  // Notifee (recent versions) can report the FSI setting on Android 14+.
  try {
    if (n?.getNotificationSettings) {
      const s = await n.getNotificationSettings();
      const fsi = s?.android?.fullScreenAction ?? s?.fullScreenAction;
      if (typeof fsi === "boolean") return { key: "fullscreen", granted: fsi, canAskAgain: true, available: true };
      if (typeof fsi === "number") return { key: "fullscreen", granted: fsi === 1, canAskAgain: true, available: true };
    }
  } catch { /* fall through */ }
  // Cannot introspect → on Android 14+ FSI is DENIED BY DEFAULT for non-calling
  // apps, so we must NOT assume it's granted (that false-positive is exactly why
  // the app never prompted and the ring degraded to a tap-to-open heads-up).
  // Treat as satisfied only AFTER the user has been sent to the FSI settings once.
  const asked = (await storage.getItem(FSI_ASKED_KEY)) === "1";
  return { key: "fullscreen", granted: asked, canAskAgain: true, available: true };
}

/* Location — used for distance / ETA on the ring (foreground is enough). */
export async function locationState(): Promise<PermState> {
  try {
    const Location = require("expo-location");
    const s = await Location.getForegroundPermissionsAsync();
    return { key: "location", granted: s.status === "granted", canAskAgain: s.canAskAgain !== false, available: true };
  } catch {
    return { key: "location", granted: false, canAskAgain: true, available: false };
  }
}
export async function requestLocationPermission(): Promise<PermState> {
  try {
    const Location = require("expo-location");
    const s = await Location.requestForegroundPermissionsAsync();
    return { key: "location", granted: s.status === "granted", canAskAgain: s.canAskAgain !== false, available: true };
  } catch {
    return { key: "location", granted: false, canAskAgain: false, available: false };
  }
}

/** Snapshot of every permission the Job Ring relies on. */
export async function allPermissionStates(): Promise<Record<PermKey, PermState>> {
  const [notif, battery, fullscreen, location, overlay] = await Promise.all([
    notifState(), batteryState(), fullScreenState(), locationState(), overlayState(),
  ]);
  return { notifications: notif, battery, fullscreen, location, overlay };
}

/** True when the app should show the full-screen permission gate on open. */
export async function shouldShowPermissionGate(): Promise<boolean> {
  const notif = await notifState();
  if (notif.available && !notif.granted) return true;  // notifications are mandatory
  return !(await wasPrompted());                        // otherwise show once, then remember
}

/* ------------------------------------------------------------------ */
/*  Incoming JOB RING — call-style full-screen, looping sound           */
/* ------------------------------------------------------------------ */
const inr = (v: any) => { const x = Number(v); return isNaN(x) || !x ? "" : "\u20b9" + x.toLocaleString("en-IN"); };

export function jobRingBody(d: Record<string, any>): string {
  let items: any[] = [];
  try { items = d.items_json ? JSON.parse(d.items_json) : []; } catch { items = []; }
  const lines = items.filter((it) => it?.name).map((it) => `\u2022 ${it.name}${it.qty > 1 ? ` \u00d7${it.qty}` : ""}${it.price ? ` \u2014 ${inr(it.price)}` : ""}`);
  if (!lines.length) lines.push([d.service_name, d.services_total ? inr(d.services_total) : ""].filter(Boolean).join(" \u00b7 ") || "Tap to view the request");
  if (d.scheduled_date) lines.push(`\u23F0 ${d.scheduled_date} ${d.scheduled_time || ""}`.trim());
  if (d.city || d.address_line) lines.push(`\u{1F4CD} ${d.address_line || d.city}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Custom ring SOUND (admin-uploaded) — looped until an action, works  */
/*  in background/locked via expo-audio while the Notifee foreground     */
/*  service keeps the process alive. Android notification channels can't  */
/*  use a remote URL as their sound, so we play it ourselves.             */
/* ------------------------------------------------------------------ */
let _ringPlayer: any = null;
async function _loadRingSource(): Promise<{ src: any; volume: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fallback = require("../../assets/sounds/job-ring.wav");
  try {
    const raw = await storage.getItem("azo_ring_prefs");
    const p = raw ? JSON.parse(raw) : {};
    const vol = Math.max(0.05, Math.min(1, typeof p?.volume === "number" ? p.volume : 0.7));
    if (p?.customSoundUrl) {
      const uri = mediaUrl(p.customSoundUrl) || p.customSoundUrl;
      if (uri) return { src: { uri }, volume: vol };
    }
    return { src: fallback, volume: vol };
  } catch { return { src: fallback, volume: 0.7 }; }
}
/** Start the looping ring tone (admin custom upload, else bundled fallback). */
export async function startRingSound(_bookingId = "") {
  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AA = require("expo-audio");
    await AA.setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
    const { src, volume } = await _loadRingSource();
    if (!_ringPlayer) _ringPlayer = AA.createAudioPlayer(src);
    else { try { _ringPlayer.replace(src); } catch { _ringPlayer = AA.createAudioPlayer(src); } }
    _ringPlayer.loop = true;
    _ringPlayer.volume = volume;
    try { _ringPlayer.seekTo(0); } catch { /* ignore */ }
    _ringPlayer.play();
  } catch { /* ignore */ }
}
/** Stop the looping ring tone (on Accept / Reject / dismiss / job taken). */
export function stopRingSound() {
  try { _ringPlayer?.pause?.(); _ringPlayer?.seekTo?.(0); } catch { /* ignore */ }
}

/**
 * Show the full-screen, looping "incoming job" alert. Works from the FCM
 * background handler (app closed / locked) and from the foreground.
 * `asForegroundService` keeps the process alive so the ring keeps playing.
 */
export async function displayJobRing(d: Record<string, any>, ctx: "fg" | "bg" = "fg"): Promise<boolean> {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || !d?.booking_id) return false;
  // When the app is OPEN, the in-app JobRingOverlay + RealtimeContext.playRing
  // already show the ring and play the custom tone — don't double up here.
  if (AppState.currentState === "active") return false;
  const { AndroidImportance, AndroidCategory, AndroidVisibility } = mod;
  const isEmergency = d.schedule_type === "emergency";
  const isResched = d.type === "reschedule_request";
  const isReminder = d.type === "scheduled_reminder";
  await setupAndroidChannels();
  // Report the ring outcome to the server so we can SEE (in admin/diagnostics)
  // whether the call-style ring actually rendered when closed/locked, and why not.
  let fsi: boolean | undefined;
  try { fsi = (await fullScreenState()).granted; } catch { /* ignore */ }
  let did = "";
  try { did = await deviceId(); } catch { /* ignore */ }
  const report = (ok: boolean, m2: string, error = "") => {
    api.post("/notifications/ring-status", { ok, mode: m2, ctx, error, booking_id: d.booking_id, fsi, device_id: did }).catch(() => {});
  };
  // Notifee requires EVERY notification.data value to be a STRING. The FCM
  // payload from expo (data.notification.data) carries a `dataString` key and may
  // include non-string values → sanitize to strings and drop `dataString`.
  const cleanData: Record<string, string> = {};
  for (const [k, v] of Object.entries(d || {})) {
    if (k === "dataString" || v == null) continue;
    cleanData[k] = typeof v === "string" ? v : String(v);
  }
  cleanData.type = isReminder ? "scheduled_reminder" : isResched ? "reschedule_request" : "job_request";
  const reschedBody = `${d.requester_name || "The customer"} wants to move ${d.service_name || "the job"} to ${d.new_date || ""} · ${d.new_time || ""}`.trim();
  const reminderBody = `${d.service_name || "Your scheduled job"} starts at ${d.scheduled_time || "soon"}${d.scheduled_label ? ` (${d.scheduled_label})` : ""}. Get ready to start.`.trim();
  const ringBody = isReminder ? reminderBody : isResched ? reschedBody : jobRingBody(d);
  // `asFgs` = keep the process alive + loop the ringtone. Starting a foreground
  // service from a background FCM message can be rejected on Android 14+; if that
  // happens we retry WITHOUT the service so the full-screen ring still appears
  // (sound plays once instead of looping) — the alert must never be swallowed.
  const build = (asFgs: boolean) => ({
    id: `job-${d.booking_id}`,
    title: isReminder ? "\u{1F514} Work starting soon" : isResched ? "\u{1F504} Reschedule request" : (isEmergency ? "\u{1F6A8} Emergency job request" : "\u{1F514} New job request"),
    subtitle: isReminder ? (d.scheduled_time ? `Starts at ${d.scheduled_time}` : undefined) : isResched ? (d.new_date ? `New: ${d.new_date} · ${d.new_time || ""}` : undefined) : (d.partner_amount ? `You earn ${inr(d.partner_amount)}` : d.service_name || undefined),
    body: ringBody,
    data: cleanData,
    android: {
      channelId: CHANNELS.jobRingSilent,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      smallIcon: "ic_notification",
      color: "#0D47A1",
      colorized: true,
      largeIcon: d.image || undefined,
      vibrationPattern: [400, 250, 400, 250],
      lightUpScreen: true,
      ongoing: asFgs,
      autoCancel: false,
      asForegroundService: asFgs,
      timeoutAfter: 120000,
      showTimestamp: true,
      style: { type: mod.AndroidStyle.BIGTEXT, text: ringBody },
      fullScreenAction: { id: "default", launchActivity: "default" },
      pressAction: { id: "default", launchActivity: "default" },
      actions: isReminder ? [
        { title: "\u{1F44D} Got it", pressAction: { id: "default", launchActivity: "default" } },
      ] : [
        { title: "\u2705 Accept", pressAction: { id: "accept", launchActivity: "default" } },
        { title: "\u274C Reject", pressAction: { id: "reject" } },
      ],
    },
    ios: {
      categoryId: "job_request",
      sound: `${JOB_RING_SOUND}.wav`,
      critical: true,
      criticalVolume: 1.0,
      interruptionLevel: "timeSensitive",
      foregroundPresentationOptions: { banner: true, sound: true, list: true, badge: true },
    },
  });
  try {
    await n.displayNotification(build(true) as any);
    report(true, "fgs");
  } catch (e1: any) {
    try {
      await n.displayNotification(build(false) as any);
      report(true, "no_fgs", String(e1?.message || e1));
    } catch (e2: any) {
      report(false, "failed", String(e2?.message || e2));
      return false;
    }
  }
  // NOTE: sound is played by the in-app JobRingOverlay (RealtimeContext.playRing)
  // once the app comes to the foreground — a SINGLE source, so it never overlaps
  // or restarts. Do not start a second player here.
  return true;
}

export async function cancelJobRing(bookingId?: string) {
  stopRingSound();
  const n = NotifeeApi();
  if (!n) return;
  try {
    if (bookingId) await n.cancelNotification(`job-${bookingId}`);
    else {
      const list: any[] = await n.getDisplayedNotifications();
      await Promise.all(list.filter((x) => String(x?.id || "").startsWith("job-")).map((x) => n.cancelNotification(x.id)));
    }
  } catch { /* ignore */ }
  // Don't tear down the shared foreground service if the background job listener
  // owns it — that would kill the SSE stream and stop all future rings. When the
  // listener isn't active this is a plain ring, so stopping the service is correct.
  if (!isBgListenerActive()) { try { await n.stopForegroundService(); } catch { /* ignore */ } }
}

/** Compat: simple local job alert (used when the full data payload isn't available). */
export async function scheduleJobRing(title: string, body: string): Promise<boolean> {
  const n = NotifeeApi();
  if (!n) return false;
  await setupAndroidChannels();
  await n.displayNotification({ title, body, android: { channelId: CHANNELS.jobRing, smallIcon: "ic_notification", color: "#0D47A1", sound: JOB_RING_SOUND, pressAction: { id: "default", launchActivity: "default" } } });
  return true;
}

/* ------------------------------------------------------------------ */
/*  CHAT — WhatsApp-style message notification                         */
/* ------------------------------------------------------------------ */
export async function scheduleChatNotification(title: string, body: string, data: Record<string, any>): Promise<boolean> {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n) return false;
  await setupAndroidChannels();
  await n.displayNotification({
    id: `chat-${data.booking_id || "x"}`,
    title, body,
    data: { ...data, type: "chat_message" },
    android: {
      channelId: CHANNELS.chat, smallIcon: "ic_notification", color: "#0D47A1",
      category: mod.AndroidCategory.MESSAGE, importance: mod.AndroidImportance.HIGH,
      groupId: `chat-${data.booking_id || "x"}`, sound: "default",
      style: { type: mod.AndroidStyle.BIGTEXT, text: body },
      pressAction: { id: "default", launchActivity: "default" },
    },
    ios: { sound: "default", threadId: `chat-${data.booking_id || "x"}` },
  });
  return true;
}

export async function dismissChatNotification(bookingId: string) {
  const n = NotifeeApi();
  if (!n) return;
  try { await n.cancelNotification(`chat-${bookingId}`); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  FCM token registration                                              */
/* ------------------------------------------------------------------ */
async function deviceId(): Promise<string> {
  let id = await storage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await storage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function postToken(token: string) {
  await api.post("/notifications/devices", {
    token, device_id: await deviceId(), platform: Platform.OS,
    browser: `${Device.manufacturer || ""} ${Device.modelName || ""}`.trim(),
    user_agent: `AzoApp/${Constants.expoConfig?.version || "1.0"} (${Platform.OS} ${Device.osVersion || ""})`,
    permission: "granted",
  });
}

/**
 * Register THIS device's FCM token so backend `notify()` / job dispatch reaches
 * the app when backgrounded or closed. Also keeps it fresh on token rotation.
 * Real builds only — silently skipped in Expo Go. Returns an unsubscribe fn.
 */
export async function registerPushToken(): Promise<{ ok: boolean; reason?: string; unsubscribe?: () => void }> {
  // Report the NATIVE registration outcome to the backend so it shows in the app's
  // "Alert check" card and the admin Diagnostics (previously only the browser
  // reported → admin always showed a stale "never attempted in this browser").
  // We now report on EVERY path — including "no module" — so the admin panel shows
  // the real on-device reason instead of a misleading browser default.
  const report = (ok: boolean, reason = "", error = "") => {
    api.post("/notifications/push-status", {
      ok, reason, error, permission: ok ? "granted" : reason === "permission" ? "denied" : "granted",
      platform: Platform.OS,
      user_agent: `AzoApp/${Constants.expoConfig?.version || "1.0"} (${Platform.OS} ${Device.manufacturer || ""} ${Device.modelName || ""} ${Device.osVersion || ""})`.trim(),
    }).catch(() => {});
  };
  try {
    if (Platform.OS === "web") return { ok: false, reason: "web" };
    if (!pushSupported) { report(false, "expo_go"); return { ok: false, reason: "expo_go" }; }
    const perm = await getPermissionStatus();
    if (!perm.granted) { report(false, "permission"); return { ok: false, reason: "permission" }; }
    await setupAndroidChannels().catch(() => {});

    // expo-notifications native DEVICE push token = the RAW FCM token on Android
    // (firebase-admin can target it directly). This is the SINGLE, known-good path
    // (RNFB messaging is disabled — see messaging() above). getDevicePushTokenAsync
    // can fail transiently right after launch (Play Services / network not ready),
    // so retry a few times with backoff before giving up.
    // POST_NOTIFICATIONS is already granted above (perm.granted) — required on
    // Android 13+ BEFORE fetching the token. getDevicePushTokenAsync hits native
    // FCM which can fail transiently right after launch (Play Services / network /
    // Firebase Installations not ready), so retry with EXPONENTIAL backoff.
    _lastExpoTokenErr = "";
    let token = "";
    for (let i = 0; i < 5 && !token; i += 1) {
      token = await rnfbDeviceToken();               // RNBC path (owns killed-app delivery)
      if (!token) token = await expoDeviceToken();   // fallback
      if (!token && i < 4) await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); // 1s, 2s, 4s, 8s
    }

    if (!token) {
      const kind = classifyTokenError(_lastExpoTokenErr);
      const hint =
        kind === "play_services"
          ? "Google Play services is unavailable/outdated on this device."
          : kind === "fcm_registration_failed"
            ? "Native FCM registration failed — enable 'Firebase Cloud Messaging API (V1)' + 'Firebase Installations API' for project azo-project-9f857 (sender 960503871336) and ship a build that bundles google-services.json + the expo-notifications plugin."
            : "Could not obtain an FCM device token (check Play services / network / google-services.json).";
      report(false, kind, `${_lastExpoTokenErr || "no token"} — ${hint}`);
      return { ok: false, reason: kind };
    }

    await postToken(token);
    report(true, "registered:expo");
    return { ok: true };
  } catch (e: any) {
    report(false, "exception", String(e?.message || e));
    return { ok: false, reason: String(e?.message || e) };
  }
}

/* ------------------------------------------------------------------ */
/*  Foreground events: remote messages + notification taps              */
/* ------------------------------------------------------------------ */
/** Remote FCM data messages while the app is in the FOREGROUND arrive via the
 * expo-notifications received-listener (RNFB messaging is disabled — messaging()
 * is a no-op). The messaging() branch below is kept null-guarded only so the code
 * still compiles if RNFB is ever re-enabled. */
export function onForegroundPush(cb: (data: Record<string, any>) => void): () => void {
  const subs: (() => void)[] = [];
  const EN = expoNotif();
  if (EN) {
    const sub = EN.addNotificationReceivedListener((n: any) => { cb(n?.request?.content?.data || {}); });
    subs.push(() => { try { sub.remove(); } catch { /* ignore */ } });
  }
  const m = messaging();
  if (m?.onMessage) {
    try { const un = m.onMessage((rm: any) => { cb(rm?.data || {}); }); subs.push(() => { try { un(); } catch { /* ignore */ } }); }
    catch { /* ignore */ }
  }
  return () => { subs.forEach((f) => f()); };
}

/** Notification tap / action press while app is foregrounded + cold-start tap. */
export function onNotificationTap(cb: (data: Record<string, any>, action: string) => void): () => void {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n) return () => {};
  const { EventType } = mod;
  const unsub = n.onForegroundEvent(({ type, detail }: any) => {
    if (type === EventType.PRESS) cb(detail?.notification?.data || {}, "default");
    else if (type === EventType.ACTION_PRESS) cb(detail?.notification?.data || {}, detail?.pressAction?.id || "default");
  });
  n.getInitialNotification?.().then((init: any) => {
    if (init?.notification?.data) cb(init.notification.data, init.pressAction?.id || "default");
  }).catch(() => {});
  return unsub;
}

/**
 * Tap on a REMOTE FCM notification the OS shows in the tray (background/closed
 * apps). Handled by BOTH RNFB (now the primary FCM receiver: onNotificationOpenedApp
 * for a background tap + getInitialNotification for a cold-start tap) and
 * expo-notifications (fallback for expo-delivered notifications). Returns an
 * unsubscribe fn.
 */
export function onFcmNotificationOpen(cb: (data: Record<string, any>) => void): () => void {
  const subs: (() => void)[] = [];
  const EN = expoNotif();
  if (EN) {
    const sub = EN.addNotificationResponseReceivedListener((resp: any) => {
      const d = resp?.notification?.request?.content?.data;
      if (d && Object.keys(d).length) cb(d);
    });
    EN.getLastNotificationResponseAsync?.().then((resp: any) => {
      const d = resp?.notification?.request?.content?.data;
      if (d && Object.keys(d).length) cb(d);
    }).catch(() => {});
    subs.push(() => { try { sub.remove(); } catch { /* ignore */ } });
  }
  const m = messaging();
  if (m) {
    try {
      const un = m.onNotificationOpenedApp?.((rm: any) => { const d = rm?.data; if (d && Object.keys(d).length) cb(d); });
      if (typeof un === "function") subs.push(() => { try { un(); } catch { /* ignore */ } });
    } catch { /* ignore */ }
    try { m.getInitialNotification?.().then((rm: any) => { const d = rm?.data; if (d && Object.keys(d).length) cb(d); }).catch(() => {}); } catch { /* ignore */ }
  }
  return () => { subs.forEach((f) => f()); };
}

export async function markPrompted() {
  await storage.setItem(NOTIF_PROMPTED_KEY, "1");
}

export async function wasPrompted(): Promise<boolean> {
  return (await storage.getItem(NOTIF_PROMPTED_KEY)) === "1";
}

export function isRealDevice() {
  return Device.isDevice;
}
