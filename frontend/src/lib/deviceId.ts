import { Platform } from "react-native";
import { secureStorage } from "@/src/utils/storage";

/**
 * A stable, per-install unique device id used for single-device login.
 * Stored in secure storage so it survives app restarts (a fresh install / reinstall
 * mints a new one — that's fine: the partner then registers the new device, or an
 * admin resets the lock). Kept tiny and dependency-free.
 */
const KEY = "azo_device_uid";
let _cached: string | null = null;

export async function getDeviceUid(): Promise<string> {
  if (_cached) return _cached;
  try {
    let id = await secureStorage.getItem(KEY);
    if (!id) {
      id = `dev-${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      await secureStorage.setItem(KEY, id);
    }
    _cached = id;
    return id;
  } catch {
    // Storage unavailable — fall back to an ephemeral id (login still works, just not persisted).
    if (!_cached) _cached = `dev-${Platform.OS}-eph-${Math.random().toString(36).slice(2, 12)}`;
    return _cached;
  }
}

/**
 * A human-readable device label shown to admins next to "Reset Device", e.g.
 * "Galaxy S21 · Android 13" or "iPhone 14 · iOS 17". Best-effort — falls back to the OS.
 */
export function getDeviceName(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require("expo-device");
    const model = Device.deviceName || Device.modelName || Device.designName || "";
    const os = [Device.osName || (Platform.OS === "ios" ? "iOS" : "Android"), Device.osVersion].filter(Boolean).join(" ");
    return [model, os].filter(Boolean).join(" · ") || os || Platform.OS;
  } catch {
    return Platform.OS === "ios" ? "iPhone" : "Android device";
  }
}
