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
import { pushSupported, notifee, NotifeeApi, messaging, displayJobRing, cancelJobRing, scheduleChatNotification } from "@/src/lib/notifications";

export async function handleRemoteData(d: Record<string, any> | undefined, isBackground: boolean) {
  if (!d || !d.type) return;
  if (d.type === "job_request") { await displayJobRing(d); return; }
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
