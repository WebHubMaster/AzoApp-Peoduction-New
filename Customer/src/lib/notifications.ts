/**
 * Full-screen alert system for the AzoApp CUSTOMER app — a 1:1 port of the Partner
 * app's reliable ring stack, trimmed to what the customer needs (the partner's
 * reschedule request → call-style full-screen alert).
 *
 * Delivery paths (same as the Partner app):
 *  • Notifee renders the call-style full-screen intent (channel + fullScreenAction),
 *    which auto-launches OVER the lock screen even when the app is closed.
 *  • expo-notifications + @react-native-firebase/messaging mint the RAW FCM device
 *    token and deliver the data-only push to a backgrounded / locked / killed app
 *    (see pushBackground.ts).
 *  • In the foreground, RealtimeContext (SSE) drives the in-app RescheduleAlertOverlay.
 *
 * Every native call is lazily required behind `pushSupported` so the app stays
 * usable in Expo Go / on web (no-ops there).
 */
import { Platform, Linking, AppState } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api/client";

const DEVICE_ID_KEY = "azo_device_id";
const FSI_ASKED_KEY = "azo_fsi_asked";

export const CHANNELS = {
  // Silent high-importance channel for the call-style ring: NO channel sound so the
  // custom looped tone (expo-audio) plays instead. Matches the backend android_channel.
  ringSilent: "azo-ring-silent-v1",
  ring: "azo-job-ring-v3",
  chat: "azo-chat-v3",
  bookings: "bookings",
  default: "default",
} as const;

const LEGACY_CHANNELS = ["job-ring", "job-ring-v2", "chat"];

/** Bundled AzoApp logo used as the ring's largeIcon fallback. */
const APP_LOGO_ICON = require("../../assets/brand-logo.png");

export const pushSupported =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let _notifee: any | null = null;
export function notifee(): any | null {
  if (!pushSupported) return null;
  if (_notifee === null) {
    try { _notifee = require("@notifee/react-native"); } catch { _notifee = false; }
  }
  return _notifee || null;
}
export const NotifeeApi = () => notifee()?.default || null;

let _expoNotif: any | null = null;
export function expoNotif(): any | null {
  if (_expoNotif === null) {
    try { _expoNotif = require("expo-notifications"); } catch { _expoNotif = false; }
  }
  return _expoNotif || null;
}

/** @react-native-firebase/messaging — the reliable killed-app FCM path. */
let _rnfbMessaging: any = null;
export function messaging(): any | null {
  if (!pushSupported) return null;
  if (_rnfbMessaging === null) {
    try { _rnfbMessaging = require("@react-native-firebase/messaging").default; }
    catch { _rnfbMessaging = false; }
  }
  try { return _rnfbMessaging ? _rnfbMessaging() : null; } catch { return null; }
}

let _installations: any = null;
function installations(): any | null {
  if (!pushSupported || Platform.OS === "web") return null;
  if (_installations === null) {
    try { _installations = require("@react-native-firebase/installations").default; }
    catch { _installations = false; }
  }
  try { return _installations ? _installations() : null; } catch { return null; }
}
async function resetFirebaseInstallation(): Promise<void> {
  try { const m = messaging(); if (m?.deleteToken) await m.deleteToken(); } catch { /* ignore */ }
  try { const inst = installations(); if (inst?.delete) await inst.delete(); } catch { /* ignore */ }
}

export async function setupAndroidChannels() {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || Platform.OS !== "android") return;
  const { AndroidImportance, AndroidVisibility } = mod;
  for (const id of LEGACY_CHANNELS) { try { await n.deleteChannel(id); } catch { /* ignore */ } }
  await n.createChannel({
    id: CHANNELS.ringSilent, name: "Booking alerts (custom ring)",
    description: "Reschedule & booking alerts ring like a call",
    importance: AndroidImportance.HIGH,
    vibration: true, vibrationPattern: [400, 250, 400, 250],
    lights: true, lightColor: "#1666D3", bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
  await n.createChannel({
    id: CHANNELS.ring, name: "Booking Alerts",
    description: "Booking updates ring like a call",
    importance: AndroidImportance.HIGH, sound: "default",
    vibration: true, vibrationPattern: [400, 250, 400, 250],
    lights: true, lightColor: "#1666D3", bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
  await n.createChannel({ id: CHANNELS.chat, name: "Chat Messages", importance: AndroidImportance.HIGH, sound: "default", vibration: true, visibility: AndroidVisibility.PUBLIC });
  await n.createChannel({ id: CHANNELS.bookings, name: "Booking Updates", importance: AndroidImportance.HIGH, vibration: true });
  await n.createChannel({ id: CHANNELS.default, name: "General", importance: AndroidImportance.DEFAULT });
}

async function setupExpoChannels() {
  const EN = expoNotif();
  if (!EN || Platform.OS !== "android") return;
  try {
    await EN.setNotificationChannelAsync(CHANNELS.ringSilent, {
      name: "Booking alerts (custom ring)", importance: EN.AndroidImportance.MAX,
      vibrationPattern: [400, 250, 400, 250], lightColor: "#1666D3",
      bypassDnd: true, lockscreenVisibility: 1,
    });
    await EN.setNotificationChannelAsync(CHANNELS.default, { name: "Booking updates", importance: EN.AndroidImportance.MAX, sound: "default" });
  } catch { /* ignore */ }
}

/* ------------------------- permissions ------------------------- */
export async function getPermissionStatus(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const n = NotifeeApi();
  if (n) {
    const s = await n.getNotificationSettings();
    const { AuthorizationStatus } = notifee();
    const granted = s.authorizationStatus === AuthorizationStatus.AUTHORIZED || s.authorizationStatus === AuthorizationStatus.PROVISIONAL;
    return { granted, canAskAgain: s.authorizationStatus !== AuthorizationStatus.DENIED };
  }
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

const _androidSdk = (): number => Number(Platform.OS === "android" ? (Platform.Version as number) : 0);

/** Android 14+ full-screen-intent permission screen for this app. */
export async function openFullScreenIntentSettings() {
  if (Platform.OS !== "android") return;
  const pkg = Constants.expoConfig?.android?.package || "app.azoapp.customer";
  try {
    await storage.setItem(FSI_ASKED_KEY, "1");
    await Linking.sendIntent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", [{ key: "android.provider.extra.APP_PACKAGE", value: pkg }]);
  } catch {
    try { await Linking.openSettings(); } catch { /* ignore */ }
  }
}

/** Best-effort: exclude from battery optimisation so a killed app can still ring. */
export async function requestBatteryExemption() {
  const n = NotifeeApi();
  if (Platform.OS !== "android") return;
  const pkg = Constants.expoConfig?.android?.package || "app.azoapp.customer";
  try {
    if (n && !(await n.isBatteryOptimizationEnabled())) return;
  } catch { /* ignore */ }
  try {
    const IntentLauncher = require("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", { data: `package:${pkg}` });
  } catch {
    try { if (n) await n.openBatteryOptimizationSettings(); } catch { /* ignore */ }
  }
}

/* ------------------------- FCM device token ------------------------- */
async function deviceId(): Promise<string> {
  let id = await storage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `cust-${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await storage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

let _lastTokenErr = "";
async function rnfbDeviceToken(): Promise<string> {
  if (Platform.OS === "web") return "";
  try {
    const m = messaging();
    if (!m?.getToken) return "";
    const t = await m.getToken();
    return typeof t === "string" ? t : "";
  } catch (e: any) { _lastTokenErr = String(e?.message || e || ""); return ""; }
}
async function expoDeviceToken(): Promise<string> {
  const EN = expoNotif();
  if (!EN || Platform.OS === "web") return "";
  try {
    const t = await EN.getDevicePushTokenAsync();
    const val = typeof t === "string" ? t : t?.data;
    return typeof val === "string" ? val : "";
  } catch (e: any) { _lastTokenErr = String(e?.message || e || ""); return ""; }
}

async function postToken(token: string) {
  await api.post("/notifications/devices", {
    token, device_id: await deviceId(), platform: Platform.OS,
    user_agent: `AzoAppCustomer/${Constants.expoConfig?.version || "1.0"} (${Platform.OS})`,
    permission: "granted",
  });
}

/**
 * Register THIS device's RAW FCM token (needs the bundled google-services.json for
 * package app.azoapp.customer) so the backend data-only reschedule ring reaches the
 * app when it is backgrounded / closed. Best-effort — silently no-ops in Expo Go.
 */
export async function registerFcmDeviceToken(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!pushSupported) return { ok: false, reason: "expo_go" };
    const perm = await getPermissionStatus();
    if (!perm.granted) return { ok: false, reason: "permission" };
    await setupAndroidChannels().catch(() => {});
    try { const m = messaging(); if (m?.setAutoInitEnabled) await m.setAutoInitEnabled(true); } catch { /* ignore */ }
    _lastTokenErr = "";
    let token = "";
    let didReset = false;
    for (let i = 0; i < 8 && !token; i += 1) {
      token = await rnfbDeviceToken();
      if (!token) token = await expoDeviceToken();
      if (!token) {
        const why = _lastTokenErr.toLowerCase();
        if (why.includes("play services") || why.includes("service_not_available")) {
          // transient / device — keep retrying with backoff
        } else if (!didReset) {
          didReset = true;
          await resetFirebaseInstallation();
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (i < 7) await new Promise((r) => setTimeout(r, Math.min(1500 * 2 ** i, 12000)));
      }
    }
    if (!token) return { ok: false, reason: _lastTokenErr || "no_token" };
    await postToken(token);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

/* ------------------------- reschedule ring ------------------------- */
function rescheduleBody(d: Record<string, any>): string {
  const who = d.requester_name || "Your partner";
  const svc = d.service_name || "your service";
  const when = [d.new_date, d.new_time].filter(Boolean).join(" · ");
  return `${who} wants to move ${svc}${when ? ` to ${when}` : ""}`.trim();
}

/**
 * Show the full-screen, call-style reschedule alert. Works from the FCM background
 * handler (app closed / locked) and from the foreground. Suppressed when the app is
 * already ACTIVE (the in-app RescheduleAlertOverlay shows instead — single source).
 */
export async function displayRescheduleRing(d: Record<string, any>, ctx: "fg" | "bg" = "fg", source: "sse" | "fcm" | "" = ""): Promise<boolean> {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || !d?.booking_id) return false;
  if (AppState.currentState === "active") return false;
  const { AndroidImportance, AndroidCategory, AndroidVisibility } = mod;
  await setupAndroidChannels();

  let fsi: boolean | undefined;
  try { fsi = (await fullScreenGranted()); } catch { /* ignore */ }
  let did = "";
  try { did = await deviceId(); } catch { /* ignore */ }
  const report = (ok: boolean, m2: string, error = "") => {
    api.post("/notifications/ring-status", { ok, mode: m2, ctx, error, booking_id: d.booking_id, fsi, device_id: did, src: source }).catch(() => {});
  };

  const cleanData: Record<string, string> = {};
  for (const [k, v] of Object.entries(d || {})) {
    if (k === "dataString" || v == null) continue;
    cleanData[k] = typeof v === "string" ? v : String(v);
  }
  cleanData.type = "reschedule_request";
  const body = rescheduleBody(d);
  try {
    await n.displayNotification({
      id: `resched-${d.booking_id}`,
      title: "\u{1F504} Reschedule request",
      subtitle: d.new_date ? `New: ${d.new_date} \u00b7 ${d.new_time || ""}` : undefined,
      body,
      data: cleanData,
      android: {
        channelId: CHANNELS.ringSilent,
        category: AndroidCategory.CALL,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        smallIcon: "ic_notification",
        color: "#1666D3",
        colorized: true,
        largeIcon: APP_LOGO_ICON,
        vibrationPattern: [400, 250, 400, 250],
        lightUpScreen: true,
        ongoing: false,
        autoCancel: false,
        timeoutAfter: 120000,
        showTimestamp: true,
        style: { type: mod.AndroidStyle.BIGTEXT, text: body },
        fullScreenAction: { id: "default", launchActivity: "default" },
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "\u2705 Accept", pressAction: { id: "accept", launchActivity: "default" } },
          { title: "\u274C Keep time", pressAction: { id: "reject" } },
        ],
      },
      ios: {
        categoryId: "reschedule_request",
        critical: true, criticalVolume: 1.0,
        interruptionLevel: "timeSensitive",
        foregroundPresentationOptions: { banner: true, sound: true, list: true, badge: true },
      },
    } as any);
    report(true, "fs");
  } catch (e2: any) {
    report(false, "failed", String(e2?.message || e2));
    return false;
  }
  return true;
}

export async function cancelRescheduleRing(bookingId?: string) {
  const n = NotifeeApi();
  if (!n) return;
  try {
    if (bookingId) await n.cancelNotification(`resched-${bookingId}`);
    else {
      const list: any[] = await n.getDisplayedNotifications();
      await Promise.all(list.filter((x) => String(x?.id || "").startsWith("resched-")).map((x) => n.cancelNotification(x.id)));
    }
  } catch { /* ignore */ }
}

/**
 * Full-screen, call-style "Booking confirmed" alert — fires the instant a partner
 * accepts the customer's booking. Same delivery path as the reschedule ring.
 */
export async function displayBookingRing(d: Record<string, any>, ctx: "fg" | "bg" = "fg", source: "sse" | "fcm" | "" = ""): Promise<boolean> {
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || !d?.booking_id) return false;
  if (AppState.currentState === "active") return false;
  const { AndroidImportance, AndroidCategory, AndroidVisibility } = mod;
  await setupAndroidChannels();

  let did = "";
  try { did = await deviceId(); } catch { /* ignore */ }
  const report = (ok: boolean, m2: string, error = "") => {
    api.post("/notifications/ring-status", { ok, mode: m2, ctx, error, booking_id: d.booking_id, device_id: did, src: source }).catch(() => {});
  };

  const cleanData: Record<string, string> = {};
  for (const [k, v] of Object.entries(d || {})) {
    if (k === "dataString" || v == null) continue;
    cleanData[k] = typeof v === "string" ? v : String(v);
  }
  cleanData.type = "booking_confirmed";
  const when = [d.scheduled_date, d.scheduled_time].filter(Boolean).join(" \u00b7 ");
  const body = `${d.partner_name || "A partner"} accepted your ${d.service_name || "booking"}${when ? ` \u2014 ${when}` : ""}`.trim();
  try {
    await n.displayNotification({
      id: `booking-${d.booking_id}`,
      title: "\u2705 Booking confirmed",
      subtitle: d.partner_name ? `${d.partner_name} is on the way` : undefined,
      body,
      data: cleanData,
      android: {
        channelId: CHANNELS.ringSilent,
        category: AndroidCategory.CALL,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        smallIcon: "ic_notification",
        color: "#10B981",
        colorized: true,
        largeIcon: APP_LOGO_ICON,
        vibrationPattern: [300, 200, 300],
        lightUpScreen: true,
        ongoing: false,
        autoCancel: false,
        timeoutAfter: 120000,
        showTimestamp: true,
        style: { type: mod.AndroidStyle.BIGTEXT, text: body },
        fullScreenAction: { id: "default", launchActivity: "default" },
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "\u{1F44D} Got it", pressAction: { id: "default", launchActivity: "default" } },
        ],
      },
      ios: {
        categoryId: "booking_confirmed",
        critical: true, criticalVolume: 1.0,
        interruptionLevel: "timeSensitive",
        foregroundPresentationOptions: { banner: true, sound: true, list: true, badge: true },
      },
    } as any);
    report(true, "fs");
  } catch (e2: any) {
    report(false, "failed", String(e2?.message || e2));
    return false;
  }
  return true;
}

export async function cancelBookingRing(bookingId?: string) {
  const n = NotifeeApi();
  if (!n) return;
  try {
    if (bookingId) await n.cancelNotification(`booking-${bookingId}`);
  } catch { /* ignore */ }
}

async function fullScreenGranted(): Promise<boolean | undefined> {
  if (Platform.OS !== "android") return undefined;
  if (_androidSdk() < 34) return true;
  const n = NotifeeApi();
  try {
    if (n?.getNotificationSettings) {
      const s = await n.getNotificationSettings();
      const fsi = s?.android?.fullScreenAction ?? s?.fullScreenAction;
      if (typeof fsi === "boolean") return fsi;
      if (typeof fsi === "number") return fsi === 1;
    }
  } catch { /* ignore */ }
  return (await storage.getItem(FSI_ASKED_KEY)) === "1";
}

/* ------------------------- foreground events ------------------------- */
/** Remote FCM data messages while the app is in the FOREGROUND. */
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

/** Notification tap / action press while foregrounded + cold-start tap. */
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

/** Tap on a REMOTE FCM notification the OS showed in the tray (background/closed). */
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
