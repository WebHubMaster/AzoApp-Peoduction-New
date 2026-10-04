import React, { useEffect, useRef, useState, useCallback } from "react";
import { LifeBuoy, AlertTriangle, X, Send, ShieldCheck, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useRealtime } from "@/context/RealtimeContext";

/**
 * Help & SOS — shown on a customer's active booking (after the job has started) and
 * on a partner's active job. Opens a real-time, WhatsApp-style chat with the support
 * team (same tickets backend the admin Support Inbox uses). SOS raises an URGENT
 * ticket; Help raises a normal one. Live messages + "Support is typing" via SSE.
 */
export default function HelpSOS({ booking, role = "customer", compact = false, idPrefix = "" }) {
  const tid = (k) => `${idPrefix}${k}`;
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const endRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTyping = useRef(0);
  const { subscribe } = useRealtime();

  const code = booking?.code || "";

  const openChat = async (kind) => {
    setOpen(true);
    if (ticket) return;
    setLoading(true);
    try {
      // Reuse an existing open ticket for this booking if present.
      const list = await api.get("/support/tickets").then((r) => r.data).catch(() => []);
      const existing = (list || []).find(
        (t) => t.booking_code === code && t.status !== "closed");
      if (existing) {
        const { data } = await api.get(`/support/tickets/${existing.id}`);
        setTicket(data);
      } else {
        const subject = `${kind === "sos" ? "SOS" : "Help"} · Booking ${code}`;
        const message = kind === "sos"
          ? `I need urgent help with my ongoing ${booking?.service_name || "service"} (Booking ${code}).`
          : `I need help with my ${booking?.service_name || "service"} (Booking ${code}).`;
        const { data } = await api.post("/support/tickets", {
          subject, category: "booking", priority: kind === "sos" ? "urgent" : "medium",
          message, booking_code: code,
        });
        setTicket(data);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not reach support");
      setOpen(false);
    } finally { setLoading(false); }
  };

  const refresh = useCallback(async () => {
    if (!ticket?.id) return;
    try {
      const { data } = await api.get(`/support/tickets/${ticket.id}`);
      setTicket(data);
      if (data.agent_typing) setAgentTyping(true);
    } catch { /* ignore */ }
  }, [ticket?.id]);

  useEffect(() => {
    if (!open || !ticket?.id) return undefined;
    const iv = setInterval(refresh, 4000);
    return () => clearInterval(iv);
  }, [open, ticket?.id, refresh]);

  useEffect(() => {
    if (!subscribe || !ticket?.id) return undefined;
    const off1 = subscribe("support_message", (d) => { if (d?.ticket_id === ticket.id) refresh(); });
    const off2 = subscribe("support_typing", (d) => {
      if (d?.ticket_id === ticket.id && d.actor === "agent") {
        setAgentTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setAgentTyping(false), 4000);
      }
    });
    return () => { off1 && off1(); off2 && off2(); };
  }, [subscribe, ticket?.id, refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [ticket?.messages?.length, agentTyping]);

  const pingTyping = () => {
    const now = Date.now();
    if (!ticket?.id || now - lastTyping.current < 3000) return;
    lastTyping.current = now;
    api.post(`/support/tickets/${ticket.id}/typing`).catch(() => {});
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !ticket?.id) return;
    setSending(true);
    try {
      const { data } = await api.post(`/support/tickets/${ticket.id}/messages`, { text: body });
      setTicket(data); setText("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send"); }
    finally { setSending(false); }
  };

  const msgs = (ticket?.messages || []).filter((m) => !m.internal);

  return (
    <>
      <div className={`flex items-center gap-2 ${compact ? "" : "mt-2"}`}>
        <button data-testid={tid("help-btn")} onClick={() => openChat("help")}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 px-3 py-2 text-sm font-bold hover:bg-primary-100 transition">
          <LifeBuoy className="h-4 w-4" /> Help
        </button>
        <a data-testid={tid("sos-btn")} href="tel:112" onClick={(e) => { if (!window.confirm("Call emergency number 112?")) e.preventDefault(); }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 text-white px-3 py-2 text-sm font-bold hover:bg-red-700 transition">
          <AlertTriangle className="h-4 w-4" /> SOS · 112
        </a>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setOpen(false)} data-testid="help-sos-modal">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-primary-600 grid place-items-center text-white"><ShieldCheck className="h-5 w-5" /></div>
                <div>
                  <p className="font-heading font-bold text-slate-900 dark:text-white leading-tight">Support Team</p>
                  <p className="text-[11px] text-slate-400">{ticket?.code ? `${ticket.code} · ` : ""}Booking {code}</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} data-testid="help-sos-close" className="h-8 w-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5 text-slate-500" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50 dark:bg-slate-950/40">
              {loading && <div className="py-10 grid place-items-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}
              {msgs.map((m, i) => {
                const mine = m.sender_role === role || (m.sender_id && ticket && m.sender_id === ticket.user_id);
                const system = m.system || m.sender_role === "system";
                if (system) {
                  return <p key={m.id || i} className="text-center text-[11px] text-slate-400">{m.text}</p>;
                }
                return (
                  <div key={m.id || i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary-600 text-white rounded-br-sm" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-sm border border-slate-100 dark:border-slate-700"}`}>
                      {!mine && <p className="text-[10px] font-bold text-primary-600 mb-0.5">{m.sender_name || "Support"}</p>}
                      {m.text}
                    </div>
                  </div>
                );
              })}
              {agentTyping && (
                <div className="flex justify-start" data-testid="help-sos-agent-typing">
                  <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3 py-2">
                    <span className="text-[11px] font-semibold text-primary-600 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Support is typing…</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <input data-testid="help-sos-input" value={text}
                onChange={(e) => { setText(e.target.value); pingTyping(); }}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="Type your message…" disabled={!ticket || sending}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              <button data-testid="help-sos-send" onClick={send} disabled={!text.trim() || sending}
                className="h-11 w-11 grid place-items-center rounded-xl bg-primary-600 text-white disabled:opacity-40">
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
