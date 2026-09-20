import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useRealtime } from "@/src/context/RealtimeContext";

/**
 * Server-driven chat summary (latest message + unread per booking) — mirrors web
 * ChatContext.jsx. Refreshes instantly on SSE booking_message / booking_seen so
 * badges stay in sync with the web panel (read on web → cleared here too).
 */
export type ChatRow = { booking_id: string; code: string; service_name: string; status: string; counterpart_name: string; enabled: boolean; unread: number; last_message: any; updated_at: string };
type Ctx = { chats: ChatRow[]; totalUnread: number; refresh: () => Promise<void>; unreadFor: (id: string) => number; lastFor: (id: string) => any };

const ChatCtx = createContext<Ctx>({ chats: [], totalUnread: 0, refresh: async () => {}, unreadFor: () => 0, lastFor: () => null });

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [total, setTotal] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !["customer", "partner"].includes(user.role)) return;
    try {
      const data = await api.get<any>("/bookings/chats/summary");
      setChats(data?.chats || []);
      setTotal(data?.total_unread || 0);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!user) return undefined;
    const iv = setInterval(refresh, 30000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => { clearInterval(iv); sub.remove(); };
  }, [user, refresh]);
  useEffect(() => subscribe((ev) => {
    if (["booking_message", "booking_seen", "booking_update", "job_accepted", "__resync__"].includes(ev?.type)) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 150);
    }
  }), [subscribe, refresh]);

  const value = useMemo<Ctx>(() => ({
    chats, totalUnread: total, refresh,
    unreadFor: (id) => chats.find((c) => c.booking_id === id)?.unread || 0,
    lastFor: (id) => chats.find((c) => c.booking_id === id)?.last_message || null,
  }), [chats, total, refresh]);
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export const useChats = () => useContext(ChatCtx);
export const useChatUnread = (bookingId: string) => useChats().unreadFor(bookingId);
