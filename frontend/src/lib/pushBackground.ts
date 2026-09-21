/**
 * Headless push handlers — MUST be registered at app entry (index.js), outside
 * any React component, so they run when the app is backgrounded or fully closed.
 *
 *  • FCM data message `job_request` → call-style full-screen ring (looping sound,
 *    foreground service) even on a locked phone.
 *  • FCM data message `job_taken` → stop the ring on this device.
 *  • FCM data message `chat_message` → WhatsApp-style chat notification.
 *  • Notification actions Accept / Reject pressed from the lock screen → hit the
 *    API directly (token from secure storage) and stop the ring.
 */
import { api } from "@/src/api/client";
import { pushSupported, notifee, NotifeeApi, messaging, displayJobRing, cancelJobRing, scheduleChatNotification, setupAndroidChannels } from "@/src/lib/notifications";

/** expo-notifications background task — this is the PRIMARY background path now
 * (RNFB messaging is disabled). It fires for data-only FCM messages when the app
 * is backgrounded, locked or killed, and renders the full-screen Notifee ring.
 * The FCM data payload arrives at `data.notification.data` (see expo's
 * RemoteMessageSerializer); we defensively check the common shapes. */
const BG_NOTIF_TASK = "AZO_BG_NOTIF_TASK";
function _extractFcmData(data: any): Record<string, any> {
  if (!data) return {};
  const candidates = [data?.notification?.data, data?.data, data?.notification, data];
  for (const c of candidates) { if (c && typeof c === "object" && c.type) return c; }
  // Fallback: recursively hunt for an object carrying our `type` field.
  const seen = new Set<any>();
  const walk = (o: any): Record<string, any> | null => {
    if (!o || typeof o !== "object" || seen.has(o)) return null;
    seen.add(o);
    if (o.type && (o.booking_id || o.type === "job_taken" || o.type === "job_cancelled")) return o;
    for (const v of Object.values(o)) { const r = walk(v); if (r) return r; }
    return null;
  };
  return walk(data) || {};
}
if (pushSupported) {
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
  } catch { /* expo-task-manager / expo-notifications unavailable (web / Expo Go) */ }
}

export async function handleRemoteData(d: Record<string, any> | undefined, isBackground: boolean) {
  if (!d || !d.type) return;
  if (d.type === "job_request") { await displayJobRing(d, "bg"); return; }
  if (d.type === "job_taken" || d.type === "job_cancelled") { await cancelJobRing(String(d.booking_id || "")); return; }
  if (d.type === "chat_message" && isBackground) {
    const body = `${d.body || ""}${d.body && d.service_name ? `\n${d.service_name} • Booking #${d.code || ""}` : ""}`;
    await scheduleChatNotification(d.sender_name || d.title || "New message", body || d.title || "", d);
  }
}

export async function respondToJob(bookingId: string, action: "accept" | "reject") {
  if (!bookingId) return;
  try {
    if (action === "accept") await api.post(`/bookings/${bookingId}/accept`, {});
    else await api.post(`/bookings/${bookingId}/reject`, { reason: "" });
  } catch { /* taken / offline — the app refreshes on open */ }
  await cancelJobRing(bookingId);
}

if (pushSupported) {
  // Create the (fresh, high-importance) channels at app entry so the loud ring
  // channel exists before the very first background/killed message arrives.
  setupAndroidChannels().catch(() => {});
  const m = messaging();
  const n = NotifeeApi();
  const mod = notifee();
  if (m) m.setBackgroundMessageHandler(async (rm: any) => { await handleRemoteData(rm?.data, true); });
  if (n && mod) {
    // Keeps the process alive while the ring notification is displayed.
    n.registerForegroundService(() => new Promise<void>(() => { /* resolved by stopForegroundService() */ }));
    n.onBackgroundEvent(async ({ type, detail }: any) => {
      const { EventType } = mod;
      const data = detail?.notification?.data || {};
      const bid = String(data.booking_id || "");
      if (type === EventType.ACTION_PRESS && data.type === "job_request") {
        const id = detail?.pressAction?.id;
        if (id === "accept" || id === "reject") await respondToJob(bid, id);
      } else if (type === EventType.DISMISSED && data.type === "job_request") {
        await cancelJobRing(bid);
      }
    });
  }
}
