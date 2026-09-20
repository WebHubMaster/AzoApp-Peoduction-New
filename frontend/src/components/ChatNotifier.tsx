import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useAuth } from "@/src/context/AuthContext";
import { scheduleJobRing } from "@/src/lib/notifications";

/**
 * App-wide chat notifier. Listens to the realtime `booking_message` stream and,
 * for messages NOT sent by me, fires a WhatsApp-style local notification while
 * the app is foregrounded (Expo Go can't do remote/closed-app push — that path
 * is served by the backend FCM `notify()` on a real build). No UI.
 */
export function ChatNotifier() {
  const { subscribe } = useRealtime();
  const { user } = useAuth();
  const router = useRouter();
  const lastRef = useRef<string>("");
  useEffect(() => subscribe((ev) => {
    if (ev?.type !== "booking_message") return;
    const m = ev.data || {};
    if (!m.id || m.id === lastRef.current) return;      // de-dupe
    if (user?.id && m.sender_id === user.id) return;     // don't notify my own message
    lastRef.current = m.id;
    const who = m.sender_name || "Customer";
    scheduleJobRing(`New message from ${who}`, String(m.text || "").slice(0, 140)).catch(() => {});
  }), [subscribe, user?.id, router]);
  return null;
}

export default ChatNotifier;
