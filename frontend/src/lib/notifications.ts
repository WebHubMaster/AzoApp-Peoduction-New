/**
 * Notifications for AzoApp Partner/Merchant — Notifee (display / channels /
 * permission / full-screen "incoming job" ring) + React Native Firebase
 * Messaging (FCM token + remote messages).
 *
 * IMPORTANT: neither library runs in **Expo Go** or on web. Every native call
 * is lazily required behind `pushSupported` so the app stays usable there
 * (no-ops). On a real dev/production build everything works: FCM token
 * registration, WhatsApp-style chat pushes and the call-like job ring that
 * fires even when the app is closed or the phone is locked.
 */
import { Platform, Linking } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api/client";

export const NOTIF_PROMPTED_KEY = "azo_notif_prompted";
const DEVICE_ID_KEY = "azo_device_id";

export const CHANNELS = {
  jobRing: "job-ring",
  bookings: "bookings",
  chat: "chat",
  account: "account",
  default: "default",
} as const;

/** Raw Android sound resource copied by plugins/withJobRingAndroid.js */
export const JOB_RING_SOUND = "job_ring";

// Expo Go (StoreClient) and web don't support the native modules — no-op there.
export const pushSupported =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let _notifee: any | null = null;
let _messaging: any | null = null;

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

/** Lazily require @react-native-firebase/messaging ONLY when supported. */
export function messaging(): any | null {
  if (!pushSupported) return null;
  if (_messaging === null) {
    try { _messaging = require("@react-native-firebase/messaging").default; } catch { _messaging = false; }
  }
  // _messaging() throws when the native module isn't linked / Firebase [DEFAULT]
  // app failed to init. NEVER let that bubble up (it used to silently kill the
  // whole registration before anything could be reported). Return null instead.
  try { return _messaging ? _messaging() : null; } catch { return null; }
}

/**
 * expo-notifications native DEVICE push token — on Android this is the RAW FCM
 * token (firebase-admin can send to it directly). This is a SECOND, independent
 * path to obtain a token that works even when @react-native-firebase/messaging
 * fails to instantiate, as long as google-services.json is bundled. Returns "".
 */
async function expoDeviceToken(): Promise<string> {
  const EN = expoNotif();
  if (!EN || Platform.OS === "web") return "";
  try {
    const t = await EN.getDevicePushTokenAsync();
    const val = typeof t === "string" ? t : t?.data;
    return typeof val === "string" ? val : "";
  } catch { return ""; }
}

export async function setupAndroidChannels() {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || Platform.OS !== "android") return;
  const { AndroidImportance, AndroidVisibility } = mod;
  await n.createChannel({
    id: CHANNELS.jobRing, name: "Job Ring Alerts",
    description: "Incoming job requests ring like a call",
    importance: AndroidImportance.HIGH, sound: JOB_RING_SOUND,
    vibration: true, vibrationPattern: [400, 250, 400, 250],
    lights: true, lightColor: "#0D47A1", bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
  await n.createChannel({ id: CHANNELS.chat, name: "Chat Messages", importance: AndroidImportance.HIGH, sound: "default", vibration: true, vibrationPattern: [200, 100, 200, 100], visibility: AndroidVisibility.PUBLIC });
  await n.createChannel({ id: CHANNELS.bookings, name: "Booking Updates", importance: AndroidImportance.HIGH, vibration: true, vibrationPattern: [250, 250, 250, 250] });
  await n.createChannel({ id: CHANNELS.account, name: "Account Alerts", importance: AndroidImportance.DEFAULT });
  await n.createChannel({ id: CHANNELS.default, name: "General", importance: AndroidImportance.DEFAULT });
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
    await Linking.sendIntent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", [{ key: "android.provider.extra.APP_PACKAGE", value: pkg }]);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Unified permission hub — everything the Job Ring needs, requested   */
/*  the moment the app opens (see app/onboarding/permissions.tsx).      */
/* ------------------------------------------------------------------ */
export type PermKey = "notifications" | "location" | "battery" | "fullscreen";
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

/* Battery optimisation exemption — required so a killed app can still ring. */
export async function batteryState(): Promise<PermState> {
  if (Platform.OS !== "android") return { key: "battery", granted: Platform.OS === "ios", canAskAgain: false, available: false };
  const asked = (await storage.getItem(BATTERY_ASKED_KEY)) === "1";
  const n = NotifeeApi();
  if (n) {
    try {
      const optimized = await n.isBatteryOptimizationEnabled();
      // Truly exempt → granted. Otherwise, if the user already completed the request
      // flow, treat as satisfied: many OEM skins (MIUI/OneUI/ColorOS…) never report
      // the exemption via PowerManager even after the user allows background usage,
      // so the card must not stay stuck on "Allow".
      return { key: "battery", granted: !optimized || asked, canAskAgain: true, available: true };
    } catch { /* fall through */ }
  }
  // Expo Go / no notifee: reflect whether the user ran the request at least once.
  return { key: "battery", granted: asked, canAskAgain: true, available: true };
}
export async function requestBatteryExemption() {
  const n = NotifeeApi();
  if (Platform.OS !== "android") return;
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
  // Cannot introspect on this OS/Notifee build → treat as satisfied (the manifest
  // declares USE_FULL_SCREEN_INTENT and the ring uses category CALL). Never leaves
  // the card stuck "not granted".
  return { key: "fullscreen", granted: true, canAskAgain: true, available: true };
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
  const [notif, battery, fullscreen, location] = await Promise.all([
    notifState(), batteryState(), fullScreenState(), locationState(),
  ]);
  return { notifications: notif, battery, fullscreen, location };
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

/**
 * Show the full-screen, looping "incoming job" alert. Works from the FCM
 * background handler (app closed / locked) and from the foreground.
 * `asForegroundService` keeps the process alive so the ring keeps playing.
 */
export async function displayJobRing(d: Record<string, any>): Promise<boolean> {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || !d?.booking_id) return false;
  const { AndroidImportance, AndroidCategory, AndroidVisibility } = mod;
  const isEmergency = d.schedule_type === "emergency";
  await setupAndroidChannels();
  // `asFgs` = keep the process alive + loop the ringtone. Starting a foreground
  // service from a background FCM message can be rejected on Android 14+; if that
  // happens we retry WITHOUT the service so the full-screen ring still appears
  // (sound plays once instead of looping) — the alert must never be swallowed.
  const build = (asFgs: boolean) => ({
    id: `job-${d.booking_id}`,
    title: isEmergency ? "\u{1F6A8} Emergency job request" : "\u{1F514} New job request",
    subtitle: d.partner_amount ? `You earn ${inr(d.partner_amount)}` : d.service_name || undefined,
    body: jobRingBody(d),
    data: { ...d, type: "job_request" },
    android: {
      channelId: CHANNELS.jobRing,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      smallIcon: "ic_notification",
      color: "#0D47A1",
      colorized: true,
      largeIcon: d.image || undefined,
      sound: JOB_RING_SOUND,
      loopSound: asFgs,
      vibrationPattern: [400, 250, 400, 250],
      lightUpScreen: true,
      ongoing: asFgs,
      autoCancel: false,
      asForegroundService: asFgs,
      timeoutAfter: 120000,
      showTimestamp: true,
      style: { type: mod.AndroidStyle.BIGTEXT, text: jobRingBody(d) },
      fullScreenAction: { id: "default", launchActivity: "default" },
      pressAction: { id: "default", launchActivity: "default" },
      actions: [
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
  } catch {
    try { await n.displayNotification(build(false) as any); }
    catch { return false; }
  }
  return true;
}

export async function cancelJobRing(bookingId?: string) {
  const n = NotifeeApi();
  if (!n) return;
  try {
    if (bookingId) await n.cancelNotification(`job-${bookingId}`);
    else {
      const list: any[] = await n.getDisplayedNotifications();
      await Promise.all(list.filter((x) => String(x?.id || "").startsWith("job-")).map((x) => n.cancelNotification(x.id)));
    }
  } catch { /* ignore */ }
  try { await n.stopForegroundService(); } catch { /* ignore */ }
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

    const m = messaging();
    let token = "";
    let lastErr: any = null;
    let source = "";

    // Path 1 — React Native Firebase (preferred: also gives token-refresh events).
    // getToken() often fails transiently on Android (Play Services / network not
    // ready right after launch), so retry a few times with backoff.
    if (m) {
      if (Platform.OS === "ios") { try { await m.registerDeviceForRemoteMessages(); } catch { /* ignore */ } }
      for (let i = 0; i < 4 && !token; i += 1) {
        try { token = await m.getToken(); }  // eslint-disable-line no-await-in-loop
        catch (e) { lastErr = e; }
        if (!token && i < 3) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));  // eslint-disable-line no-await-in-loop
      }
      if (token) source = "rnfirebase";
    }

    // Path 2 — expo-notifications native device token. Independent of RNFB, so it
    // rescues the (common) case where the Firebase messaging module fails to load.
    if (!token) {
      for (let i = 0; i < 3 && !token; i += 1) {
        token = await expoDeviceToken();  // eslint-disable-line no-await-in-loop
        if (!token && i < 2) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));  // eslint-disable-line no-await-in-loop
      }
      if (token) source = "expo";
    }

    if (!token) {
      const reason = m ? "getToken_failed" : "no_fcm_module";
      report(false, reason, String(lastErr?.message || lastErr || "no token from RNFirebase or expo-notifications"));
      return { ok: false, reason };
    }

    await postToken(token);
    report(true, `registered:${source}`);

    let unsubscribe: (() => void) | undefined;
    if (m) { try { unsubscribe = m.onTokenRefresh((t: string) => { postToken(t).catch(() => {}); }); } catch { /* ignore */ } }
    return { ok: true, unsubscribe };
  } catch (e: any) {
    report(false, "exception", String(e?.message || e));
    return { ok: false, reason: String(e?.message || e) };
  }
}

/* ------------------------------------------------------------------ */
/*  Foreground events: remote messages + notification taps              */
/* ------------------------------------------------------------------ */
/** Remote FCM data messages while the app is in the foreground. */
export function onForegroundPush(cb: (data: Record<string, any>) => void): () => void {
  const m = messaging();
  if (!m) return () => {};
  return m.onMessage(async (rm: any) => { cb(rm?.data || {}); });
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
 * Tap on a REMOTE FCM *notification* (title/body messages the OS shows in the
 * tray for background/closed apps — e.g. reschedule, reminder, booking updates).
 * These are NOT rendered by Notifee, so their taps arrive via Firebase Messaging.
 * Fires for background taps (onNotificationOpenedApp) and cold-start taps
 * (getInitialNotification). Returns an unsubscribe fn.
 */
export function onFcmNotificationOpen(cb: (data: Record<string, any>) => void): () => void {
  const m = messaging();
  if (!m) return () => {};
  const unsub = m.onNotificationOpenedApp((rm: any) => { if (rm?.data) cb(rm.data); });
  m.getInitialNotification().then((rm: any) => { if (rm?.data) cb(rm.data); }).catch(() => {});
  return unsub;
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
