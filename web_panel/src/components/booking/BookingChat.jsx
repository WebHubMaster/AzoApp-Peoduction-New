import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageCircle, Phone, Send, Check, CheckCheck } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRealtime } from "@/context/RealtimeContext";
import { useChats } from "@/context/ChatContext";

const QUICK = {
  customer: ["I'm at home, please come in", "Please call me", "Reaching the spot in 5 min", "Door is open", "Please share your live location"],
  partner: ["I'm on the way", "Reaching in 5 min", "I'm at the gate", "Please share exact location", "Running 10 min late, sorry"],
};

/** WhatsApp-style ticks: ✓ sent · ✓✓ (blue) seen. */
export const Ticks = ({ status, testId }) => (
  status === "seen"
    ? <CheckCheck data-testid={testId} className="h-3.5 w-3.5 text-sky-300" aria-label="Seen" />
    : <Check data-testid={testId} className="h-3.5 w-3.5 text-white/70" aria-label="Sent" />
);

/**
 * Shared booking chat between the customer and the assigned partner.
 * Reused on both the customer tracking card and the partner active-job card.
 * Renders a Chat + Call action bar (only when the thread is enabled) and a
 * slide-in conversation sheet with tap-to-send quick replies.
 * Real-time: SSE booking_message / booking_seen / booking_typing + read receipts,
 * presence heartbeat (suppresses push while open) and `?chat=<id>` deep link.
 */
export default function BookingChat({ booking, role = "customer", open: controlledOpen, onOpenChange, hideBar = false }) {
  const [chat, setChat] = useState(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen != null;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (v) => { if (onOpenChange) onOpenChange(v); else setUncontrolledOpen(v); };
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const stopTimer = useRef(null);
  const { subscribe } = useRealtime();
  const { refresh: refreshChats, unreadFor } = useChats();
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    if (!booking?.id) return;
    try { const { data } = await api.get(`/bookings/${booking.id}/messages`); setChat(data); } catch { /* ignore */ }
  }, [booking?.id]);
  const markSeen = useCallback(async () => {
    if (!booking?.id) return;
    try { await api.post(`/bookings/${booking.id}/messages/seen`); refreshChats(); } catch { /* ignore */ }
  }, [booking?.id, refreshChats]);

  useEffect(() => { load(); }, [load]);

  // Deep link from a push notification: /partner?tab=active&chat=<booking_id>
  useEffect(() => {
    if (searchParams.get("chat") && searchParams.get("chat") === booking?.id) {
      setOpen(true);
      const next = new URLSearchParams(searchParams); next.delete("chat");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time: new message → refresh (and mark seen if the sheet is open);
  // read receipt → refresh ticks; typing → indicator.
  useEffect(() => subscribe((ev) => {
    const d = ev?.data || {};
    if (!booking?.id || d.booking_id !== booking.id) return;
    if (ev.type === "booking_message") { load(); if (open && d.sender_id !== chat?.me) markSeen(); setTyping(false); }
    else if (ev.type === "booking_seen") load();
    else if (ev.type === "booking_typing") {
      setTyping(!!d.typing);
      clearTimeout(typingTimer.current);
      if (d.typing) typingTimer.current = setTimeout(() => setTyping(false), 4000);
    }
  }), [subscribe, booking?.id, load, markSeen, open, chat?.me]);

  // While open: mark seen on open, poll as a fallback, heartbeat presence every 15s.
  useEffect(() => {
    if (!open) return undefined;
    load(); markSeen();
    const iv = setInterval(load, 5000);
    const hb = setInterval(markSeen, 15000);
    return () => { clearInterval(iv); clearInterval(hb); };
  }, [open, load, markSeen]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [chat, open, typing]);

  const sendTyping = (isTyping) => {
    if (!booking?.id) return;
    api.post(`/bookings/${booking.id}/typing`, { typing: isTyping }).catch(() => {});
  };
  const onType = (v) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2500) { lastTypingSent.current = now; sendTyping(true); }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => { lastTypingSent.current = 0; sendTyping(false); }, 2000);
  };

  const send = async (t) => {
    const msg = (t != null ? t : text).trim();
    if (!msg || sending) return;
    setSending(true);
    clearTimeout(stopTimer.current); lastTypingSent.current = 0;
    try { await api.post(`/bookings/${booking.id}/messages`, { text: msg }); setText(""); await load(); }
    catch { /* ignore */ }
    setSending(false);
  };

  if (!hideBar && !chat?.enabled) return null;
  const enabled = !!chat?.enabled;
  const counterpart = role === "customer" ? chat?.partner : chat?.customer;
  const otherLabel = role === "customer" ? "partner" : "customer";
  const quick = QUICK[role] || QUICK.customer;
  const subtitle = role === "customer" ? "On the way" : "Your customer";
  const unread = unreadFor(booking.id) || chat?.unread || 0;

  return (
    <>
      {!hideBar && (
      <div className="flex gap-2 p-3 border-t border-primary-100 dark:border-primary-800/50">
        <Button onClick={() => setOpen(true)} data-testid={`chat-open-${booking.code}`} className="flex-1 bg-primary-700 hover:bg-primary-800 rounded-xl h-11">
          <MessageCircle className="h-4 w-4 mr-1.5" /> Chat
          {unread ? <span data-testid={`chat-unread-${booking.code}`} className="ml-1.5 text-[11px] bg-red-500 rounded-full px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center font-bold">{unread > 9 ? "9+" : unread}</span> : null}
        </Button>
        {counterpart?.phone && (
          <a href={`tel:${counterpart.phone}`} data-testid={`call-${otherLabel}-${booking.code}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl h-11 border border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-300 font-semibold azo-press">
            <Phone className="h-4 w-4" /> Call
          </a>
        )}
      </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0 flex flex-col w-full h-full sm:h-full sm:max-w-md" data-testid={`chat-sheet-${booking.code}`}>
          <SheetHeader className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-row items-center gap-3 space-y-0">
            <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 grid place-items-center font-bold overflow-hidden">
              {counterpart?.photo ? <img src={counterpart.photo} alt="" className="h-full w-full object-cover" /> : (counterpart?.name || "?")[0]}
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate">{counterpart?.name || (role === "customer" ? "Your partner" : "Customer")}</SheetTitle>
              {typing ? (
                <p data-testid="chat-typing" className="text-xs text-primary-600 dark:text-primary-300 italic">typing…</p>
              ) : (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${chat?.counterpart_online ? "bg-emerald-500" : "bg-slate-300"}`} /> {chat?.counterpart_online ? "Online" : subtitle} · {booking.service_name}</p>
              )}
            </div>
            {counterpart?.phone && (
              <a href={`tel:${counterpart.phone}`} className="ml-auto h-9 w-9 grid place-items-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600" aria-label="Call"><Phone className="h-4 w-4" /></a>
            )}
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50 dark:bg-slate-950" data-testid="chat-messages">
            {!enabled && (
              <div className="text-center text-sm text-slate-400 mt-10 px-6">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                {chat?.comm_locked ? "Chat unlocks 30 minutes before your scheduled time." : "Chat opens once your booking is paid and a partner is on the way."}
              </div>
            )}
            {enabled && (!chat.messages || chat.messages.length === 0) && (
              <p className="text-center text-sm text-slate-400 mt-10">No messages yet. Say hello 👋</p>
            )}
            {enabled && (chat.messages || []).map((m) => {
              const mine = m.sender_id === chat.me;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={mine ? "chat-msg-mine" : "chat-msg-other"}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-primary-700 text-white rounded-br-md" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-md border border-slate-200 dark:border-slate-700"}`}>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p className={`text-[10px] mt-0.5 flex items-center justify-end gap-1 ${mine ? "text-white/70" : "text-slate-400"}`}>
                      {new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      {mine && <Ticks status={m.status} testId={`tick-${m.status}`} />}
                    </p>
                  </div>
                </div>
              );
            })}
            {enabled && typing && (
              <div className="flex justify-start" data-testid="chat-typing-bubble">
                <div className="rounded-2xl rounded-bl-md px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                  {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
          </div>

          {/* Quick replies */}
          {enabled && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900" data-testid="chat-quick">
            {quick.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={sending} data-testid={`quick-${q.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                className="whitespace-nowrap text-xs font-semibold px-3 h-9 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800 azo-press hover:bg-primary-100">
                {q}
              </button>
            ))}
          </div>
          )}

          {enabled && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-900">
            <Input data-testid="chat-input" value={text} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Type a message…" className="flex-1 rounded-xl" />
            <Button data-testid="chat-send" onClick={() => send()} disabled={sending || !text.trim()} className="bg-primary-700 hover:bg-primary-800 rounded-xl h-10 w-10 p-0 shrink-0"><Send className="h-4 w-4" /></Button>
          </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
