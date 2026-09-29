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
