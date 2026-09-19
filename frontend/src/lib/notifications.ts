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

export const NOTIF_PROMPTED_KEY = "azo_notif_prompted";

export const CHANNELS = {
  jobRing: "job-ring",
  bookings: "bookings",
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

export async function markPrompted() {
  await storage.setItem(NOTIF_PROMPTED_KEY, "1");
}

export async function wasPrompted(): Promise<boolean> {
  return (await storage.getItem(NOTIF_PROMPTED_KEY)) === "1";
}

export function isRealDevice() {
  return Device.isDevice;
}
