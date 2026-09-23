/**
 * FCM-INDEPENDENT background job ring (the reliable "other method").
 *
 * The call-style full-screen ring must fire even when the phone is LOCKED or the
 * app is CLOSED/swiped away. Historically that relied on an FCM push — but FCM
 * token registration fails on some devices ("FCM Registration failed"), which
 * silently kills every background ring (booking, reschedule AND reminder).
 *
 * This module removes that single point of failure. While the partner is
 * backgrounded we start an Android FOREGROUND SERVICE (via Notifee) that keeps the
 * app process alive and holds open the SAME realtime SSE stream the app uses in the
 * foreground. When a job_request / reschedule_request / scheduled_reminder event
 * arrives we render the ring locally with Notifee — no push token required.
 *
 * iOS / web are no-ops (they can't run a long-lived background service like this).
 */
import { Platform } from "react-native";
import { API_BASE, getToken } from "@/src/api/client";
import {
  pushSupported, notifee, NotifeeApi, CHANNELS,
  setupAndroidChannels, displayJobRing, cancelJobRing,
} from "@/src/lib/notifications";
import { setBgListenerActive } from "@/src/lib/ringState";

const ONLINE_FGS_ID = "azo-online-fgs";
const RING_TYPES = new Set(["job_request", "reschedule_request", "scheduled_reminder"]);

let _wantRunning = false;                              // partner backgrounded → should listen
let _es: any = null;
let _retry = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _stopResolve: (() => void) | null = null;

const canRun = () => pushSupported && Platform.OS === "android";

function _forceOpenApp() {
  // Android auto-launches a full-screen intent ONLY when the screen is LOCKED.
  // When the phone is UNLOCKED but the app is backgrounded / in another app, the
  // ring would otherwise show only as a heads-up. Bring the app to the FOREGROUND
  // so the in-app full-screen JobRingOverlay pops exactly like an incoming call —
  // mirrors the FCM path in pushBackground.ts. Needs the "Display over other apps"
  // (SYSTEM_ALERT_WINDOW) permission for the background activity launch to succeed.
  try {
    const { AppState } = require("react-native");
    if (AppState.currentState !== "active") {
      const Linking = require("expo-linking");
      Linking.openURL(Linking.createURL("/")).catch(() => {});
    }
  } catch { /* ignore */ }
}

function _handle(ev: any) {
  const type = ev?.type;
  const d = ev?.data || {};
  if (RING_TYPES.has(type)) {
    const bid = String(d.booking_id || d.id || "");
    if (bid) {
      displayJobRing({ ...d, type, booking_id: bid }, "bg").catch(() => {});
      _forceOpenApp();
    }
  } else if (type === "job_taken" || type === "job_cancelled") {
    cancelJobRing(String(d.booking_id || d.id || "")).catch(() => {});
  }
}

function _clearRetry() { if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; } }

function _scheduleRetry() {
  if (!_wantRunning) return;
  _retry += 1;
  const wait = Math.min(30000, 1000 * 2 ** Math.min(_retry, 5));
  _clearRetry();
  _retryTimer = setTimeout(() => { _connect(); }, wait);
}

async function _connect() {
  if (!_wantRunning) return;
  _clearRetry();
  try { if (_es) { _es.removeAllEventListeners(); _es.close(); } } catch { /* ignore */ }
  _es = null;
  const token = await getToken();
  if (!token) { _scheduleRetry(); return; }
  try {
    const EventSource = require("react-native-sse").default;
    const es = new EventSource(`${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`, { pollingInterval: 0 });
    _es = es;
    es.addEventListener("open", () => { _retry = 0; });
    es.addEventListener("message", (e: any) => {
      if (!e?.data) return;
      try { _handle(JSON.parse(e.data)); } catch { /* keepalive frame */ }
    });
    es.addEventListener("error", () => {
      try { es.close(); } catch { /* ignore */ }
      if (_wantRunning) _scheduleRetry();
    });
  } catch { _scheduleRetry(); }
}

/** The single Notifee foreground-service task, registered once at app entry
 *  (pushBackground.ts). Its only job is to keep the process alive; the SSE loop
 *  runs on the normal JS thread (kept alive by the service). Resolves when the
 *  listener is stopped. Also used by displayJobRing's ongoing ring. */
export function backgroundRingServiceTask(): Promise<void> {
  return new Promise<void>((resolve) => { _stopResolve = resolve; });
}

/** Start listening for jobs in the background (call when a partner backgrounds the
 *  app). Displays an ongoing foreground-service notification and opens the stream. */
export async function startBackgroundJobListener(): Promise<void> {
  if (!canRun() || _wantRunning) return;
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || !mod) return;
  _wantRunning = true;
  setBgListenerActive(true);
  try {
    await setupAndroidChannels();
    const fgsType = mod.AndroidForegroundServiceType?.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
    await n.displayNotification({
      id: ONLINE_FGS_ID,
      title: "AzoApp — you're online",
      body: "Listening for new job requests",
      android: {
        channelId: CHANNELS.online,
        asForegroundService: true,
        ...(fgsType != null ? { foregroundServiceTypes: [fgsType] } : {}),
        ongoing: true,
        smallIcon: "ic_notification",
        color: "#0D47A1",
        importance: mod.AndroidImportance.LOW,
        pressAction: { id: "default", launchActivity: "default" },
      },
    } as any);
  } catch { /* FGS may be rejected on some OEMs — SSE below still tries */ }
  _connect();   // drive the stream directly (kept alive by the service above)
}

/** Stop the background listener (call when the app returns to the foreground or the
 *  partner logs out). Foreground RealtimeContext takes over the live stream again. */
export async function stopBackgroundJobListener(): Promise<void> {
  if (!_wantRunning) return;
  _wantRunning = false;
  setBgListenerActive(false);
  _clearRetry();
  try { if (_es) { _es.removeAllEventListeners(); _es.close(); } } catch { /* ignore */ }
  _es = null;
  if (_stopResolve) { try { _stopResolve(); } catch { /* ignore */ } _stopResolve = null; }
  const n = NotifeeApi();
  if (n) {
    try { await n.cancelNotification(ONLINE_FGS_ID); } catch { /* ignore */ }
    try { await n.stopForegroundService(); } catch { /* ignore */ }
  }
}
