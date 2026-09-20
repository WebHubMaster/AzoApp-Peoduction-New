import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useAuth } from "@/src/context/AuthContext";
import { scheduleChatNotification, registerPushToken, onNotificationTap } from "@/src/lib/notifications";
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
  useEffect(() => {
    if (!user?.id) return undefined;
    let unsub: (() => void) | undefined;
    registerPushToken().then((r) => { unsub = r.unsubscribe; }).catch(() => {});
    return () => { unsub?.(); };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    return onNotificationTap((d, action) => {
      if (d?.type === "chat_message") {
        const route = chatRouteFromData(d, user.role);
        if (route) setTimeout(() => router.push(route), 50);
      } else if (d?.type === "job_request") {
        const bid = String(d.booking_id || "");
        if (action === "accept" || action === "reject") {
          respondToJob(bid, action).then(() => { qc.invalidateQueries({ queryKey: ["partner-jobs"] }); qc.invalidateQueries({ queryKey: ["partner-active"] }); if (action === "accept") router.push("/(partner)/active"); });
        } else if (bid) {
          emitRing("open-ring", { id: bid, service_name: d.service_name, city: d.city, address_line: d.address_line, total: d.total, services_total: d.services_total, partner_amount: d.partner_amount, service_image: d.image, schedule_type: d.schedule_type, scheduled_date: d.scheduled_date, scheduled_time: d.scheduled_time, is_scheduled: !!d.scheduled_date, code: d.code });
        }
      }
    });
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
