/** Expo push registration → POST /notifications/devices (same device registry the web/partner apps use). */
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "../api/client";
import { storage } from "../utils/storage";

let Notifications: any = null;
try { Notifications = require("expo-notifications"); } catch { Notifications = null; } // eslint-disable-line @typescript-eslint/no-require-imports

async function deviceId() {
  let id = await storage.getItem("azo_device_id");
  if (!id) { id = `cust-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; await storage.setItem("azo_device_id", id); }
  return id;
}

/** Registers this device's Expo push token for the logged-in customer. Silent no-op on web / Expo Go (remote push unsupported). */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Notifications) return null;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== "granted") return null;
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
