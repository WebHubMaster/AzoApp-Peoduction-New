/** Background-safe APK update download (module singleton, survives screen remounts).
 *  Android: a Notifee foreground service with a progress notification keeps the
 *  process alive while the app is minimised; if the OS still kills the process the
 *  partial file is resumed (HTTP Range) on next launch. UI subscribes via useApkUpdate. */
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { notifee, NotifeeApi, pushSupported } from "@/src/lib/notifications";
import { setUpdateFgsActive, isBgListenerActive } from "@/src/lib/ringState";

export type ApkState = { status: "idle" | "downloading" | "ready" | "error"; pct: number; got: number; total: number; uri: string; error: string; versionCode: number };
type Job = { url: string; dest: string; versionCode: number; expected: number };

const META_KEY = "azo_apk_update_job";
const NOTIF_ID = "azo-apk-update";
const CHANNEL = "azo-update-v1";

function FS(): any { try { return require("expo-file-system/legacy"); } catch { try { return require("expo-file-system"); } catch { return null; } } } // eslint-disable-line @typescript-eslint/no-require-imports
function IL(): any { try { return require("expo-intent-launcher"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports

let state: ApkState = { status: "idle", pct: 0, got: 0, total: 0, uri: "", error: "", versionCode: 0 };
const subs = new Set<(s: ApkState) => void>();
let running = false;
let lastNotifPct = -1;
let pendingInstall = false;

function set(p: Partial<ApkState>) { state = { ...state, ...p }; subs.forEach((f) => f(state)); }
export const getApkState = () => state;

export function useApkUpdate() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); setS(state); return () => { subs.delete(setS); }; }, []);
  return s;
}

const fgsSupported = () => pushSupported && Platform.OS === "android" && !!NotifeeApi();

async function notify(title: string, body: string, pct: number | null, ongoing: boolean) {
  if (!fgsSupported()) return;
  const n = NotifeeApi(); const mod = notifee();
  try {
    await n.createChannel({ id: CHANNEL, name: "App updates", importance: mod.AndroidImportance.LOW, vibration: false });
    const fgsType = mod.AndroidForegroundServiceType?.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
    await n.displayNotification({
      id: NOTIF_ID, title, body,
      android: {
        channelId: CHANNEL, smallIcon: "ic_notification", color: "#0D47A1", onlyAlertOnce: true, ongoing,
        ...(ongoing ? { asForegroundService: true, ...(fgsType != null ? { foregroundServiceTypes: [fgsType] } : {}) } : {}),
        ...(pct != null ? { progress: { max: 100, current: pct, indeterminate: pct <= 0 } } : {}),
        pressAction: { id: "default", launchActivity: "default" },
      },
    } as any);
  } catch { /* notification optional — download still runs */ }
}

async function endService() {
  setUpdateFgsActive(false);
  const n = NotifeeApi();
  if (n && !isBgListenerActive()) { try { await n.stopForegroundService(); } catch { /* ignore */ } }
}

const fileSize = async (dest: string) => { const i = await FS()?.getInfoAsync(dest).catch(() => null); return i?.exists ? Number(i.size || 0) : 0; };

async function run(job: Job) {
  if (running) return;
  running = true;
  const fs = FS();
  const total = job.expected || 0;
  set({ status: "downloading", error: "", versionCode: job.versionCode, total, uri: "" });
  setUpdateFgsActive(true);
  lastNotifPct = -1;
  await notify("Downloading AzoApp update", "Starting…", 0, true);
  const onProgress = (p: any) => {
    const exp = p.totalBytesExpectedToWrite || 0;
    const offset = total > 0 && exp > 0 && exp < total ? total - exp : 0;
    const t = total || exp || 1;
    const got = (p.totalBytesWritten || 0) + offset;
    const pct = Math.min(99, Math.round((got / t) * 100));
    set({ got, pct, total: t });
    if (pct - lastNotifPct >= 2) { lastNotifPct = pct; notify("Downloading AzoApp update", `${pct}% · ${(got / 1048576).toFixed(1)} / ${(t / 1048576).toFixed(1)} MB`, pct, true); }
  };
  try {
    let have = await fileSize(job.dest);
    if (!(total > 0 && have === total)) {
      if (total > 0 && have > total) { await fs.deleteAsync(job.dest, { idempotent: true }).catch(() => {}); have = 0; }
      let result: any = null; let lastErr: any = null;
      for (let attempt = 0; attempt < 8 && !result?.uri; attempt++) {
        have = await fileSize(job.dest);
        try {
          const r = fs.createDownloadResumable(job.url, job.dest, {}, onProgress, have > 0 ? String(have) : undefined);
          result = have > 0 ? await r.resumeAsync() : await r.downloadAsync();
          if (result?.status === 416) { await fs.deleteAsync(job.dest, { idempotent: true }).catch(() => {}); result = null; }
        } catch (e) { lastErr = e; result = null; await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); }
      }
      if (!result?.uri) throw new Error(`Download failed${lastErr?.message ? ` (${lastErr.message})` : ""}. Please check your internet and try again.`);
      if (result.status && (result.status < 200 || result.status >= 300)) {
        await fs.deleteAsync(job.dest, { idempotent: true }).catch(() => {});
        throw new Error(`Download failed (server error ${result.status}). Please try again in a moment.`);
      }
      have = await fileSize(job.dest);
      if (have < 1024 * 100 || (total > 0 && have !== total)) {
        await fs.deleteAsync(job.dest, { idempotent: true }).catch(() => {});
        throw new Error("Downloaded file is incomplete. Please try again.");
      }
    }
    set({ status: "ready", pct: 100, got: have, uri: job.dest });
    await endService();
    await notify("Update downloaded", "Tap to open AzoApp and install the update", null, false);
    if (AppState.currentState === "active") installApk(); else pendingInstall = true;
  } catch (e: any) {
    set({ status: "error", error: String(e?.message || "Unable to download the update.") });
    await endService();
    await notify("Update download paused", "Open AzoApp to continue the download", null, false);
  } finally { running = false; }
}

/** Start (or resume) the download for this config. */
export async function startApkDownload(url: string, versionCode: number, expected: number, platform: string) {
  const fs = FS();
  const dest = `${fs.documentDirectory || fs.cacheDirectory}azoapp-${platform}-${versionCode}.apk`;
  const job: Job = { url, dest, versionCode, expected };
  await AsyncStorage.setItem(META_KEY, JSON.stringify(job)).catch(() => {});
  run(job);
}

/** On launch / return to app: reflect the real status (finished, partial → auto-resume). */
export async function restoreApkDownload(versionCode: number) {
  if (Platform.OS !== "android" || running || !FS()) return;
  const raw = await AsyncStorage.getItem(META_KEY).catch(() => null);
  const job: Job | null = raw ? JSON.parse(raw) : null;
  if (!job) return;
  if (job.versionCode !== versionCode) { await FS().deleteAsync(job.dest, { idempotent: true }).catch(() => {}); await AsyncStorage.removeItem(META_KEY).catch(() => {}); return; }
  const have = await fileSize(job.dest);
  if (job.expected > 0 && have === job.expected) { set({ status: "ready", pct: 100, got: have, total: have, uri: job.dest, versionCode, error: "" }); return; }
  if (have > 0) { set({ got: have, total: job.expected, pct: job.expected ? Math.min(99, Math.round((have / job.expected) * 100)) : 0 }); run(job); }
}

export async function installApk() {
  pendingInstall = false;
  const fs = FS(); const il = IL();
  if (!state.uri || !fs || !il) return;
  try { NotifeeApi()?.cancelNotification(NOTIF_ID); } catch { /* ignore */ }
  try {
    const contentUri = await fs.getContentUriAsync(state.uri);
    // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK → system package installer.
    const opts = { data: contentUri, flags: 0x1 | 0x10000000, type: "application/vnd.android.package-archive" };
    try { await il.startActivityAsync("android.intent.action.VIEW", opts); }
    catch { await il.startActivityAsync("android.intent.action.INSTALL_PACKAGE", opts); }
  } catch (e: any) {
    set({ error: `Could not open the installer${e?.message ? ` (${e.message})` : ""}. Allow "Install unknown apps" for this app in Settings and tap Install again.` });
  }
}

AppState.addEventListener("change", (s) => { if (s === "active" && pendingInstall && state.status === "ready") installApk(); });
