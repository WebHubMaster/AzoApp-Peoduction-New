/** Push registration for the Customer app.
 *
 * PRIMARY: a RAW FCM device token (needs the bundled google-services.json for
 * package app.azoapp.customer) so the backend's data-only full-screen reschedule
 * ring (push_dispatch → fcm_service) reaches the app when backgrounded / closed.
 * FALLBACK: an Expo push token (ExponentPushToken) when the raw FCM token can't be
 * minted yet — delivered as a best-effort tray notification via expo_push_service.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "../api/client";
import { storage } from "../utils/storage";
import { registerFcmDeviceToken } from "./notifications";

let Notifications: any = null;
try { Notifications = require("expo-notifications"); } catch { Notifications = null; } // eslint-disable-line @typescript-eslint/no-require-imports

async function deviceId() {
  let id = await storage.getItem("azo_device_id");
  if (!id) { id = `cust-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; await storage.setItem("azo_device_id", id); }
  return id;
}

/** Registers this device for push. Silent no-op on web / Expo Go. */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Notifications) return null;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") return null;

    // 1) Preferred: raw FCM device token (enables the killed-app full-screen ring).
    const fcm = await registerFcmDeviceToken();
    if (fcm.ok) return "fcm";

    // 2) Fallback: Expo push token (best-effort tray alert while FCM isn't available).
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Booking updates", importance: Notifications.AndroidImportance.MAX, sound: "default" });
    }
    const projectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId || (Constants as any)?.easConfig?.projectId;
    const tok = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tok?.data;
    if (!token) return null;
    await api.post("/notifications/devices", { token, device_id: await deviceId(), platform: `expo-${Platform.OS}`, user_agent: "azoapp-customer", permission: "granted" });
    return token;
  } catch {
    return null;
  }
}

/** Foreground handler: show banners while the app is open. */
export function setupNotificationHandler() {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
  } catch {}
}

/** Returns an unsubscribe fn; calls cb(link) when the user taps a notification. */
export function onNotificationTap(cb: (link: string, data: any) => void) {
  if (Platform.OS === "web" || !Notifications) return () => {};
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((resp: any) => {
      const data = resp?.notification?.request?.content?.data || {};
      cb(String(data.link || "/account?tab=orders"), data);
    });
    return () => sub.remove();
  } catch { return () => {}; }
}
