import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { usePathname, useRouter } from "expo-router";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useAuth } from "@/src/context/AuthContext";
import { scheduleChatNotification, registerPushToken, onNotificationTap, onFcmNotificationOpen } from "@/src/lib/notifications";
import { respondToJob } from "@/src/lib/pushBackground";
import { emitRing } from "@/src/lib/ringPrefs";
import { useQueryClient } from "@tanstack/react-query";

/** Route params for a chat deep link built from push/SSE payload data. */
export function chatRouteFromData(d: Record<string, any>, myRole?: string) {
  const id = String(d.booking_id || "");
  if (!id) return null;
  const role = myRole === "customer" ? "customer" : d.sender_role === "customer" ? "partner" : "customer";
  return { pathname: "/chat/[id]" as const, params: { id, role, service: String(d.service_name || "") } };
}

/**
 * App-wide chat + push bootstrap (no UI):
 *  • registers this device's native push token after login (real builds; no-op in Expo Go)
 *  • foreground: SSE `booking_message` from the other party → WhatsApp-style local
 *    notification "Sender / text · Service • Booking #CODE" unless that chat is open
 *  • tap on any chat notification (foreground, background or cold start) → opens
 *    the exact conversation.
 */
export function ChatNotifier() {
  const { subscribe } = useRealtime();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const lastRef = useRef<string>("");
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const qc = useQueryClient();
  const lastRegRef = useRef(0);
  useEffect(() => {
    if (!user?.id) return undefined;
    let unsub: (() => void) | undefined;
    // Register (or refresh) this device's FCM token, and KEEP it registered:
    //  • on login / app launch,
    //  • every time the app returns to the foreground (late permission grant),
    //  • on network reconnect (a token that failed while offline now succeeds),
    //  • when the server asks (push_reregister — e.g. API key just un-blocked).
    // Throttled to at most one attempt / 20s (force=true bypasses for real events)
    // so we never spam the backend, closing the #1 gap where a device silently
    // stayed unregistered after a transient failure.
    const ensure = (force = false) => {
      const t = Date.now();
      if (!force && t - lastRegRef.current < 20000) return;
      lastRegRef.current = t;
      registerPushToken().then((r) => { if (r.unsubscribe) unsub = r.unsubscribe; }).catch(() => {});
    };
    ensure(true);
    const appSub = AppState.addEventListener("change", (s) => { if (s === "active") ensure(); });
    let wasConnected = true;
    const netUnsub = NetInfo.addEventListener((st) => {
      const conn = !!(st?.isConnected && st?.isInternetReachable !== false);
      if (conn && !wasConnected) ensure(true);   // just came back online → retry now
      wasConnected = conn;
    });
    return () => { unsub?.(); appSub.remove(); try { netUnsub(); } catch { /* ignore */ } };
  }, [user?.id]);

  // Server-triggered silent re-registration (RealtimeContext SSE).
  useEffect(() => subscribe((ev) => {
    if (ev?.type === "push_reregister") registerPushToken().catch(() => {});
  }), [subscribe]);

  useEffect(() => {
    if (!user?.id) return undefined;
    // Shared router for a notification tap coming from EITHER Notifee (job/chat
    // full-screen + local alerts) OR a remote FCM tray notification (reschedule,
    // reminder, booking update…). Always opens the exact related screen.
    const route = (d: Record<string, any>, action: string) => {
      if (!d) return;
      const bid = String(d.booking_id || "");
      if (d.type === "chat_message") {
        const r = chatRouteFromData(d, user.role);
        if (r) setTimeout(() => router.push(r), 50);
        return;
      }
      if (d.type === "job_request") {
        if (action === "accept" || action === "reject") {
          respondToJob(bid, action).then(() => { qc.invalidateQueries({ queryKey: ["partner-jobs"] }); qc.invalidateQueries({ queryKey: ["partner-active"] }); if (action === "accept") router.push("/(partner)/active"); });
        } else if (bid) {
          emitRing("open-ring", { id: bid, service_name: d.service_name, city: d.city, address_line: d.address_line, total: d.total, services_total: d.services_total, partner_amount: d.partner_amount, service_image: d.image, schedule_type: d.schedule_type, scheduled_date: d.scheduled_date, scheduled_time: d.scheduled_time, is_scheduled: !!d.scheduled_date, code: d.code });
        }
        return;
      }
      // Generic notifications (booking update / reschedule / reminder / account):
      // open the specific booking when we know it, else the notifications inbox.
      if (bid) setTimeout(() => router.push({ pathname: "/(partner)/booking/[id]", params: { id: bid } }), 50);
      else setTimeout(() => router.push("/notifications"), 50);
    };
    const offNotifee = onNotificationTap(route);
    const offFcm = onFcmNotificationOpen((d) => route(d, "default"));
    return () => { offNotifee(); offFcm(); };
  }, [user?.id, user?.role, router, qc]);

  useEffect(() => subscribe((ev) => {
    if (ev?.type !== "booking_message") return;
    const m = ev.data || {};
    if (!m.id || m.id === lastRef.current) return;      // de-dupe
    if (user?.id && m.sender_id === user.id) return;     // don't notify my own message
    if (pathRef.current === `/chat/${m.booking_id}`) return; // already reading this thread
    lastRef.current = m.id;
    const who = m.sender_name || "Customer";
    const body = `${String(m.text || "").slice(0, 140)}\n${m.service_name || "Service"} • Booking #${m.code || ""}`;
    scheduleChatNotification(who, body, { type: "chat_message", booking_id: m.booking_id, code: m.code, service_name: m.service_name, sender_role: m.sender_role, sender_name: who }).catch(() => {});
  }), [subscribe, user?.id]);
  return null;
}

export default ChatNotifier;
