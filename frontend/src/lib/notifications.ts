/**
 * Notification permission + Android channels for AzoApp Partner/Merchant.
 *
 * IMPORTANT: `expo-notifications` remote/push functionality was removed from
 * **Expo Go** (SDK 53+). Importing/using it inside Expo Go throws a red-box
 * "Uncaught Error". To keep the app fully usable in Expo Go we NEVER import
 * expo-notifications there — every native call is guarded and becomes a safe
 * no-op. On a real dev/production build the module loads normally and push +
 * the loud "Job Ring" channel work as intended.
 */
import { Platform } from "react-native";
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

// Expo Go (StoreClient) and web don't support the native push module — no-op there.
export const pushSupported =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let _N: any | null = null;
/** Lazily require expo-notifications ONLY when supported (never in Expo Go). */
function N(): any | null {
  if (!pushSupported) return null;
  if (_N === null) {
    try {
      _N = require("expo-notifications");
      _N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    } catch {
      _N = false; // mark as unavailable so we don't retry
    }
  }
  return _N || null;
}

export async function setupAndroidChannels() {
  const n = N();
  if (!n || Platform.OS !== "android") return;
  await n.setNotificationChannelAsync(CHANNELS.jobRing, {
    name: "Job Ring Alerts",
    importance: n.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 400, 250, 400, 250, 400],
    lightColor: "#0D47A1",
    bypassDnd: true,
    lockscreenVisibility: n.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
  await n.setNotificationChannelAsync(CHANNELS.bookings, {
    name: "Booking Updates",
    importance: n.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0D47A1",
  });
  await n.setNotificationChannelAsync(CHANNELS.chat, {
    name: "Chat Messages",
    importance: n.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 200, 100, 200],
    lightColor: "#0D47A1",
    lockscreenVisibility: n.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
  await n.setNotificationChannelAsync(CHANNELS.account, {
    name: "Account Alerts",
    importance: n.AndroidImportance.DEFAULT,
  });
  await n.setNotificationChannelAsync(CHANNELS.default, {
    name: "General",
    importance: n.AndroidImportance.DEFAULT,
  });
}

export async function getPermissionStatus(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const n = N();
  if (!n) return { granted: false, canAskAgain: true };
  const s = await n.getPermissionsAsync();
  return { granted: s.granted, canAskAgain: s.canAskAgain };
}

export async function requestNotificationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const n = N();
  if (!n) return { granted: false, canAskAgain: false };
  await setupAndroidChannels();
  const current = await n.getPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: current.canAskAgain };
  const req = await n.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return { granted: req.granted, canAskAgain: req.canAskAgain };
}

/** Fire a loud "Job Ring" style local notification. Returns false if unsupported. */
export async function scheduleJobRing(title: string, body: string): Promise<boolean> {
  const n = N();
  if (!n) return false;
  await n.scheduleNotificationAsync({
    content: { title, body, sound: "default" },
    trigger: { seconds: 1, channelId: CHANNELS.jobRing } as any,
  });
  return true;
}

/** WhatsApp-style chat notification (foreground path). `data` is handed back on tap. */
export async function scheduleChatNotification(title: string, body: string, data: Record<string, any>): Promise<boolean> {
  const n = N();
  if (!n) return false;
  await n.scheduleNotificationAsync({
    identifier: `chat-${data.booking_id || "x"}`,
    content: { title, body, sound: "default", data, ...(Platform.OS === "android" ? { channelId: CHANNELS.chat } : {}) },
    trigger: null,
  });
  return true;
}

async function deviceId(): Promise<string> {
  let id = await storage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await storage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Register THIS device's native push token (FCM on Android / APNs on iOS) with
 * the backend so `notify()` → firebase-admin can reach the app when it is in the
 * background or fully closed. Real builds only — silently skipped in Expo Go.
 */
export async function registerPushToken(): Promise<{ ok: boolean; reason?: string }> {
  const n = N();
  if (!n) return { ok: false, reason: "unsupported" };
  try {
    const perm = await n.getPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: "permission" };
    await setupAndroidChannels();
    const tok = await n.getDevicePushTokenAsync();
    const token = String(tok?.data || "");
    if (!token) return { ok: false, reason: "no_token" };
    await api.post("/notifications/devices", {
      token, device_id: await deviceId(), platform: Platform.OS,
      browser: `${Device.manufacturer || ""} ${Device.modelName || ""}`.trim(),
      user_agent: `AzoApp/${Constants.expoConfig?.version || "1.0"} (${Platform.OS} ${Device.osVersion || ""})`,
      permission: "granted",
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

/** Subscribe to notification taps (foreground/background) + cold-start tap. */
export function onNotificationTap(cb: (data: Record<string, any>) => void): () => void {
  const n = N();
  if (!n) return () => {};
  const sub = n.addNotificationResponseReceivedListener((r: any) => {
    cb(r?.notification?.request?.content?.data || {});
  });
  n.getLastNotificationResponseAsync?.().then((r: any) => {
    const d = r?.notification?.request?.content?.data;
    if (d) cb(d);
  }).catch(() => {});
  return () => sub.remove();
}

export async function dismissChatNotification(bookingId: string) {
  const n = N();
  if (!n) return;
  try { await n.dismissNotificationAsync(`chat-${bookingId}`); } catch { /* ignore */ }
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
