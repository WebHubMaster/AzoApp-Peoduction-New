/**
 * FCM-INDEPENDENT background alert listener for the CUSTOMER app (the reliable
 * "other method", ported 1:1 from the Partner app).
 *
 * The full-screen, call-style alert must fire even when the phone is LOCKED or the
 * app is CLOSED / backgrounded. Historically the customer relied ONLY on an FCM
 * data push — but FCM token registration fails on many devices, which silently
 * killed every background alert (so it only ever showed with the app OPEN).
 *
 * While the customer is logged in and the app is backgrounded we start an Android
 * FOREGROUND SERVICE (via Notifee) that keeps the process alive and holds open the
 * SAME realtime SSE stream the app uses in the foreground. When a partner
 * reschedule_request or a booking_confirmed (partner assigned) event arrives we
 * render the ring locally with Notifee + play the admin ring tone — no push token
 * required. ONLY these two events ring the customer (per product rule).
 *
 * iOS / web are no-ops (they can't run a long-lived background service like this).
 */
import { Platform } from "react-native";
import { API_BASE, getToken } from "@/src/api/client";
import {
  pushSupported, notifee, NotifeeApi, CHANNELS,
  setupAndroidChannels, displayRescheduleRing, displayBookingRing,
  cancelRescheduleRing, cancelBookingRing, startRingSound,
} from "@/src/lib/notifications";
import { setBgListenerActive } from "@/src/lib/ringState";

const ONLINE_FGS_ID = "azo-cust-online-fgs";
// ONLY a partner reschedule + a partner-assigned (booking_confirmed) ring the customer.
const RING_TYPES = new Set(["reschedule_request", "booking_confirmed"]);
const CLEAR_TYPES = new Set(["reschedule_resolved", "reschedule_accepted", "reschedule_rejected", "reschedule_cancelled", "booking_cancelled", "job_cancelled"]);

let _wantRunning = false;
let _es: any = null;
let _retry = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _stopResolve: (() => void) | null = null;

const canRun = () => pushSupported && Platform.OS === "android";

function _forceOpenApp() {
  // Android auto-launches a full-screen intent ONLY when the screen is LOCKED.
  // When the phone is UNLOCKED but the app is backgrounded, bring the app to the
  // FOREGROUND so the in-app full-screen CustomerAlertOverlay pops like a call.
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
    if (!bid) return;
    // A reschedule only rings the customer when a PARTNER initiated it.
    if (type === "reschedule_request") {
      const role = d.requester_role || d.requested_by_role;
      if (role && role !== "partner") return;
      displayRescheduleRing({ ...d, type, booking_id: bid }, "bg", "sse").catch(() => {});
    } else {
      displayBookingRing({ ...d, type, booking_id: bid }, "bg", "sse").catch(() => {});
    }
    startRingSound().catch(() => {});
    _forceOpenApp();
  } else if (CLEAR_TYPES.has(type)) {
    const bid = String(d.booking_id || d.id || "");
    cancelRescheduleRing(bid).catch(() => {});
    cancelBookingRing(bid).catch(() => {});
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
 *  (pushBackground.ts). Keeps the process alive while the background alert
 *  listener runs. Resolves when the listener is stopped. */
export function backgroundRingServiceTask(): Promise<void> {
  return new Promise<void>((resolve) => { _stopResolve = resolve; });
}

/** Start listening for reschedule / partner-assigned alerts in the background. */
export async function startBackgroundAlertListener(): Promise<void> {
  if (!canRun() || _wantRunning) return;
  const n = NotifeeApi();
  const mod = notifee();
  if (!n || !mod) return;
  _wantRunning = true;
  setBgListenerActive(true);
  try {
    await setupAndroidChannels();
    // Start an Android FOREGROUND SERVICE to keep the JS process + SSE stream alive
    // while the app is backgrounded / the screen is locked / the app is swiped away
    // (aggressive OEMs like MIUI/Xiaomi kill plain background JS otherwise — which is
    // exactly why the full-screen alert previously only worked with the app OPEN).
    // Android LEGALLY requires a notification for an FGS, so we post the MINIMAL
    // possible one on the MIN-importance "online" channel with SECRET visibility
    // (no status-bar icon, hidden from the lock screen, collapsed at the bottom of the
    // shade) — the customer is NOT disturbed, yet the ring works in every state.
    // Mirrors the Partner app's startBackgroundJobListener exactly.
    const n2 = NotifeeApi();
    const mod2 = notifee();
    const fgsType = mod2?.AndroidForegroundServiceType?.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
    await n2.displayNotification({
      id: ONLINE_FGS_ID,
      title: "AzoApp",
      body: "Keeping you updated",
      android: {
        channelId: CHANNELS.online,
        asForegroundService: true,
        ...(fgsType != null ? { foregroundServiceTypes: [fgsType] } : {}),
        ongoing: true,
        smallIcon: "ic_notification",
        color: "#0D47A1",
        importance: mod2.AndroidImportance.MIN,
        visibility: mod2.AndroidVisibility.SECRET,
        showTimestamp: false,
        pressAction: { id: "default", launchActivity: "default" },
      },
    } as any);
  } catch { /* FGS may be rejected on some OEMs — SSE below still tries */ }
  _connect();
}

/** Stop the background listener (app returns to foreground / logout). */
export async function stopBackgroundAlertListener(): Promise<void> {
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
