/**
 * Headless push handlers for the CUSTOMER app — MUST be registered at app entry
 * (index.js), OUTSIDE any React component, so they run when the app is backgrounded
 * or fully closed.
 *
 *  • FCM data message `reschedule_request` → call-style full-screen ring (works on a
 *    locked / closed phone) + brings the app to the front.
 *  • FCM data message `reschedule_accepted|rejected|cancelled` → dismiss the ring.
 *  • Accept / Keep-time actions pressed from the lock screen → hit the API directly
 *    and stop the ring.
 */
import { api } from "@/src/api/client";
import {
  pushSupported, notifee, NotifeeApi, messaging,
  displayRescheduleRing, cancelRescheduleRing, setupAndroidChannels,
} from "@/src/lib/notifications";

const RING_TYPES = new Set(["reschedule_request"]);
const CLEAR_TYPES = new Set(["reschedule_accepted", "reschedule_rejected", "reschedule_cancelled", "reschedule_resolved", "booking_cancelled"]);

const BG_NOTIF_TASK = "AZO_CUST_BG_NOTIF_TASK";

function _extractFcmData(data: any): Record<string, any> {
  if (!data) return {};
  const candidates = [data?.notification?.data, data?.data, data?.notification, data];
  for (const c of candidates) { if (c && typeof c === "object" && c.type) return c; }
  const seen = new Set<any>();
  const walk = (o: any): Record<string, any> | null => {
    if (!o || typeof o !== "object" || seen.has(o)) return null;
    seen.add(o);
    if (o.type && (o.booking_id || CLEAR_TYPES.has(o.type))) return o;
    for (const v of Object.values(o)) { const r = walk(v); if (r) return r; }
    return null;
  };
  return walk(data) || {};
}

export async function handleRemoteData(d: Record<string, any> | undefined, isBackground: boolean) {
  if (!d || !d.type) return;
  if (RING_TYPES.has(d.type)) {
    await displayRescheduleRing(d, "bg", "fcm");
    // Bring the app to the FOREGROUND so the in-app full-screen overlay shows even
    // when the phone is UNLOCKED / in another app (fullScreenAction only auto-launches
    // over the LOCK screen). Needs the "Display over other apps" permission.
    try {
      const { AppState } = require("react-native");
      if (isBackground && AppState.currentState !== "active") {
        const Linking = require("expo-linking");
        Linking.openURL(Linking.createURL("/")).catch(() => {});
      }
    } catch { /* ignore */ }
    return;
  }
  if (CLEAR_TYPES.has(d.type)) { await cancelRescheduleRing(String(d.booking_id || "")); return; }
}

export async function respondToReschedule(bookingId: string, action: "accept" | "reject") {
  if (!bookingId) return;
  try { await api.post(`/bookings/${bookingId}/reschedule/respond`, { action }); }
  catch { /* stale / offline — the app refreshes on open */ }
  await cancelRescheduleRing(bookingId);
}

if (pushSupported) {
  // expo-notifications background task (data-only FCM messages, backgrounded/killed).
  try {
    const TaskManager = require("expo-task-manager");
    const Notifications = require("expo-notifications");
    TaskManager.defineTask(BG_NOTIF_TASK, async ({ data, error }: any) => {
      if (error) return;
      try {
        const fcm = _extractFcmData(data);
        if (fcm.type) await handleRemoteData(fcm, true);
      } catch { /* ignore */ }
    });
    Notifications.registerTaskAsync(BG_NOTIF_TASK).catch(() => {});
  } catch { /* unavailable (web / Expo Go) */ }

  try {
    setupAndroidChannels().catch(() => {});
    const m = messaging();
    const n = NotifeeApi();
    const mod = notifee();
    if (m) m.setBackgroundMessageHandler(async (rm: any) => { await handleRemoteData(rm?.data, true); });
    if (n && mod) {
      n.onBackgroundEvent(async ({ type, detail }: any) => {
        const { EventType } = mod;
        const data = detail?.notification?.data || {};
        const bid = String(data.booking_id || "");
        if (type === EventType.ACTION_PRESS && data.type === "reschedule_request") {
          const id = detail?.pressAction?.id;
          if (id === "accept" || id === "reject") await respondToReschedule(bid, id);
        } else if (type === EventType.DISMISSED && data.type === "reschedule_request") {
          await cancelRescheduleRing(bid);
        }
      });
    }
  } catch { /* never let push init crash app launch */ }
}
