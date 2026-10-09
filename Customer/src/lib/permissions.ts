/** App-open permissions: location + notifications. Notification state is shared so the header bell can show muted. */
import { useEffect, useState } from "react";
import { Platform, Linking } from "react-native";
import * as Location from "expo-location";
import { detectLocation, getLocationName } from "./location";

export type NotifState = "unknown" | "granted" | "denied" | "undetermined";
let _notif: NotifState = "unknown";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const setNotif = (s: NotifState) => { _notif = s; emit(); };

function notifMod(): any {
  try { return require("expo-notifications"); } catch { return null; } // eslint-disable-line @typescript-eslint/no-require-imports
}

export async function refreshNotifPermission(): Promise<NotifState> {
  if (Platform.OS === "web") {
    const N = (globalThis as any).Notification;
    if (!N) { setNotif("denied"); return "denied"; }
    const s = N.permission === "granted" ? "granted" : N.permission === "denied" ? "denied" : "undetermined";
    setNotif(s); return s;
  }
  const M = notifMod();
  if (!M) { setNotif("denied"); return "denied"; }
  try {
    const p = await M.getPermissionsAsync();
    const s: NotifState = p.granted ? "granted" : p.canAskAgain === false ? "denied" : "undetermined";
    setNotif(s); return s;
  } catch { setNotif("denied"); return "denied"; }
}

export async function requestNotifPermission(): Promise<NotifState> {
  if (Platform.OS === "web") {
    const N = (globalThis as any).Notification;
    if (!N) { setNotif("denied"); return "denied"; }
    try { const r = await N.requestPermission(); const s = r === "granted" ? "granted" : r === "denied" ? "denied" : "undetermined"; setNotif(s); return s; } catch { return refreshNotifPermission(); }
  }
  const M = notifMod();
  if (!M) { setNotif("denied"); return "denied"; }
  try {
    const p = await M.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    const s: NotifState = p.granted ? "granted" : p.canAskAgain === false ? "denied" : "undetermined";
    setNotif(s); return s;
  } catch { return refreshNotifPermission(); }
}

/** Denied & can't ask again → send the user to system settings (they can enable there). */
export async function enableNotifications(): Promise<NotifState> {
  const cur = await refreshNotifPermission();
  if (cur === "granted") return cur;
  if (cur === "undetermined") return requestNotifPermission();
  if (Platform.OS !== "web") { try { await Linking.openSettings(); } catch {} }
  return cur;
}

export function useNotifPermission() {
  const [s, setS] = useState<NotifState>(_notif);
  useEffect(() => { const f = () => setS(_notif); subs.add(f); if (_notif === "unknown") refreshNotifPermission(); return () => { subs.delete(f); }; }, []);
  return s;
}

/** All permissions are asked together on the one-time /permissions screen. */
export const PERMS_DONE_KEY = "azo_cust_perms_done";
export async function needsPermissionSetup(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { storage } = require("@/src/utils/storage"); // eslint-disable-line @typescript-eslint/no-require-imports
  return (await storage.getItem(PERMS_DONE_KEY)) !== "1";
}

/** App open: NEVER prompts — only auto-detects the city if location was already allowed. */
export async function requestStartupPermissions() {
  try {
    if (Platform.OS !== "web") {
      const cur = await Location.getForegroundPermissionsAsync();
      if (cur.granted && !getLocationName()) await detectLocation();
    } else if (!getLocationName()) {
      await detectLocation();
    }
  } catch {}
  refreshNotifPermission().catch(() => {});
}
