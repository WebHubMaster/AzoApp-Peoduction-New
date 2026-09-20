import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRealtime } from "@/context/RealtimeContext";

const ChatCtx = createContext(null);

/**
 * Server-driven chat summary (latest message + unread per booking thread).
 * Refreshes instantly on SSE `booking_message` / `booking_seen`, so unread
 * badges stay in sync across web + mobile (read on one device clears everywhere).
 */
export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const [chats, setChats] = useState([]);
  const [total, setTotal] = useState(0);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    if (!user || !["customer", "partner"].includes(user.role)) return;
    try {
      const { data } = await api.get("/bookings/chats/summary");
      setChats(data?.chats || []);
      setTotal(data?.total_unread || 0);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!user) return undefined;
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [user, refresh]);
  useEffect(() => subscribe((ev) => {
    if (["booking_message", "booking_seen", "booking_update", "job_accepted", "__resync__"].includes(ev?.type)) {
      clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 150);
    }
  }), [subscribe, refresh]);

  const value = useMemo(() => ({
    chats, totalUnread: total, refresh,
    unreadFor: (bookingId) => (chats.find((c) => c.booking_id === bookingId) || {}).unread || 0,
    lastFor: (bookingId) => (chats.find((c) => c.booking_id === bookingId) || {}).last_message || null,
  }), [chats, total, refresh]);
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
};

export const useChats = () => useContext(ChatCtx) || { chats: [], totalUnread: 0, refresh: () => {}, unreadFor: () => 0, lastFor: () => null };
export const useChatUnread = (bookingId) => useChats().unreadFor(bookingId);

/** Small red unread pill used next to Chat buttons (partner + customer). */
export const UnreadPill = ({ count, testId }) => {
  if (!count) return null;
  return (
    <span data-testid={testId} className="ml-1 h-[18px] min-w-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10.5px] font-bold inline-flex items-center justify-center leading-none">
      {count > 9 ? "9+" : count}
    </span>
  );
};
