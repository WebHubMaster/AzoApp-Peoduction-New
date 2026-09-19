import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  LifeBuoy, Plus, Send, Paperclip, X, ArrowLeft, FileText, Loader2, CheckCircle2,
  MessageSquare, ShieldCheck, Search, Inbox, MoreVertical, Hash, CalendarDays, Clock,
  Check, CheckCheck, CalendarRange, ArrowUpDown, Tag, AlertCircle,
} from "lucide-react";

const STATUS_STYLE = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  closed: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};
const STATUS_LABEL = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };
const PRIORITY_STYLE = {
  low: "bg-slate-100 text-slate-600", medium: "bg-sky-100 text-sky-700",
  high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700",
};
const STATUSES = ["open", "in_progress", "resolved", "closed"];

const timeStr = (t) => t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const dateFull = (t) => t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const dayKey = (t) => t ? new Date(t).toDateString() : "";
const daySep = (t) => {
  if (!t) return "";
  const d = new Date(t), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === y.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};
const ago = (t) => {
  if (!t) return "";
  const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `about ${Math.floor(s / 3600)} hour${Math.floor(s / 3600) > 1 ? "s" : ""} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) > 1 ? "s" : ""} ago`;
};

const Badge = ({ cls, children }) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`}>{children}</span>;

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2 py-1.5">
    <Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
    <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
    <span className="text-xs font-medium text-slate-800 dark:text-slate-100 break-words flex-1">{value || "—"}</span>
  </div>
);

const AttachmentView = ({ a, onOpen }) => {
  if (a.kind === "pdf") {
    return (
      <a href={a.url} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs hover:border-primary-400 max-w-[220px]">
        <FileText className="h-4 w-4 text-red-500 shrink-0" />
        <span className="truncate text-slate-700 dark:text-slate-200">{a.name || "Document.pdf"}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={() => onOpen?.(a.url)}
      className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-90">
      <img src={a.thumb_url || a.url} alt={a.name || "attachment"} className="h-24 w-24 object-cover" loading="lazy" />
    </button>
  );
};

/* -------- new ticket form -------- */
const NewTicket = ({ meta, onCreated, onCancel }) => {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("medium");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!subject.trim()) return toast.error("Please enter a subject");
    if (!message.trim()) return toast.error("Please describe your issue");
    setBusy(true);
    try {
      const { data } = await api.post("/support/tickets", { subject, category, priority, message });
      toast.success(`Ticket ${data.code} created`);
      onCreated?.(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create ticket"); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl mx-auto" data-testid="support-new-form">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"><ArrowLeft className="h-4 w-4" /> Back</button>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="font-heading font-bold text-lg flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-primary-600" /> Raise a new ticket</h3>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Subject *</label>
          <Input data-testid="support-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly, what's the issue?" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Category</label>
            <PremiumSelect data-testid="support-category" value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg capitalize">
              {(meta?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </PremiumSelect>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Priority</label>
            <PremiumSelect data-testid="support-priority" value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg capitalize">
              {(meta?.priorities || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </PremiumSelect>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Describe your issue *</label>
          <textarea data-testid="support-message" value={message} onChange={(e) => setMessage(e.target.value)}
            rows={5} placeholder="Tell us what happened…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
        </div>
        <Button data-testid="support-submit" onClick={submit} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
        </Button>
        <p className="text-[11px] text-slate-400 text-center">You can attach screenshots inside the ticket chat after creating it.</p>
      </div>
    </div>
  );
};

/* -------- chat thread (advanced, 3-pane) -------- */
const Thread = ({ ticket, myId, tickets, onBack, onChanged }) => {
  const [t, setT] = useState(ticket);
  const [text, setText] = useState("");
  const [pending, setPending] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const lastTypingSent = useRef(0);
  const closed = t.status === "closed";

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`/support/tickets/${ticket.id}`);
      setT((prev) => {
        const a = prev || {};
        const sameMsgs = (a.messages?.length || 0) === (data.messages?.length || 0);
        const sameTyping = !!a.agent_typing === !!data.agent_typing;
        const sameStatus = a.status === data.status;
        const sameLast = a.last_message_at === data.last_message_at;
        if (sameMsgs && sameTyping && sameStatus && sameLast) return a;
        return data;
      });
    } catch (_) { /* ignore */ }
  }, [ticket.id]);

  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 3000) return;
    lastTypingSent.current = now;
    api.post(`/support/tickets/${ticket.id}/typing`).catch(() => {});
  }, [ticket.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const iv = setInterval(refresh, 3000); return () => clearInterval(iv); }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [t.messages?.length, t.agent_typing]);

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    setUploading(true);
    for (const f of files) {
      const fd = new FormData(); fd.append("file", f);
      try { const { data } = await api.post("/support/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }); setPending((p) => [...p, data]); }
      catch (err) { toast.error(err?.response?.data?.detail || `Could not upload ${f.name}`); }
    }
    setUploading(false);
  };

  const send = async () => {
    if (!text.trim() && pending.length === 0) return;
    setSending(true);
    try {
      const { data } = await api.post(`/support/tickets/${ticket.id}/messages`, { text, attachments: pending });
      setT(data); setText(""); setPending([]); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send"); }
    finally { setSending(false); }
  };

  const closeTicket = async () => {
    setMenuOpen(false);
    if (!window.confirm("Close this ticket? You won't be able to reply after closing — you'd need to raise a new ticket.")) return;
    try { const { data } = await api.post(`/support/tickets/${ticket.id}/close`); setT(data); onChanged?.(); toast.success("Ticket closed"); }
    catch { toast.error("Could not close"); }
  };

  const allAttachments = (t.messages || []).flatMap((m) => m.attachments || []);
  const others = (tickets || []).filter((x) => x.id !== ticket.id);
  let lastDay = null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4" data-testid="support-thread">
      {/* ---- main conversation ---- */}
      <div className="flex flex-col h-[calc(100vh-230px)] min-h-[480px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <button onClick={onBack} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></button>
          <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate flex items-center gap-2"><span className="text-slate-400 font-mono text-xs">{t.code}</span><span className="truncate">{t.subject}</span></p>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">Updated {ago(t.updated_at)}
              <span className="inline-flex items-center gap-1 text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Live</span>
            </p>
          </div>
          <Badge cls={STATUS_STYLE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          {!closed && (
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><MoreVertical className="h-4 w-4" /></button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl py-1.5 text-sm">
                  <button data-testid="support-close-btn" onClick={closeTicket} className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><X className="h-3.5 w-3.5" /> Close ticket</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-slate-50/60 dark:bg-slate-950/30">
          {(t.messages || []).map((m) => {
            const sep = dayKey(m.at) !== lastDay ? daySep(m.at) : null;
            lastDay = dayKey(m.at);
            const block = [];
            if (sep) block.push(<div key={`sep-${m.id}`} className="flex justify-center my-2"><span className="text-[10px] font-bold tracking-wider text-slate-400 bg-slate-200/70 dark:bg-slate-800 rounded-full px-3 py-1">{sep}</span></div>);
            if (m.system) {
              block.push(<div key={m.id} className="flex justify-center"><span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">{m.text}</span></div>);
              return block;
            }
            const mine = m.sender_id === myId;
            const isAdmin = m.sender_role === "admin";
            block.push(
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <div className="h-7 w-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0"><ShieldCheck className="h-3.5 w-3.5" /></div>}
                <div className={`max-w-[76%] flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                  {!mine && <span className="text-[11px] font-semibold text-slate-500 px-1">{isAdmin ? "Support" : m.sender_name}</span>}
                  {(m.attachments || []).length > 0 && <div className="flex flex-wrap gap-2">{m.attachments.map((a, i) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</div>}
                  {m.text && (
                    <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                      mine ? "bg-emerald-500 text-white rounded-br-sm"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-bl-sm"}`}>
                      {m.text}
                      <span className={`block text-[10px] mt-1 flex items-center gap-1 ${mine ? "text-white/80 justify-end" : "text-slate-400"}`}>
                        {timeStr(m.at)}
                        {mine && (t.unread_admin === 0 ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
            return block;
          })}
          {t.agent_typing && (
            <div className="flex justify-start" data-testid="support-agent-typing">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3.5 py-2.5">
                <span className="text-[11px] font-semibold text-primary-600 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Support is typing</span>
                <span className="flex gap-1 ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* composer */}
        {closed ? (
          <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center">
            <p className="text-sm text-slate-500 flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> This ticket is closed. Please raise a new ticket for further help.</p>
          </div>
        ) : (
          <div className="border-t border-slate-100 dark:border-slate-800 p-3">
            <div className="flex items-center justify-end mb-1.5"><span className="text-[11px] text-slate-400">Enter to send · Shift+Enter for newline</span></div>
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pending.map((a, i) => (
                  <div key={i} className="relative">
                    {a.kind === "pdf" ? <div className="h-16 w-16 rounded-lg border flex items-center justify-center bg-slate-50"><FileText className="h-6 w-6 text-red-500" /></div>
                      : <img src={a.thumb_url || a.url} alt="" className="h-16 w-16 object-cover rounded-lg border" />}
                    <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-2">
              <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={pickFiles} data-testid="support-file-input" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <textarea data-testid="support-reply-input" value={text} onChange={(e) => { setText(e.target.value); pingTyping(); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder="Type a message…" className="flex-1 resize-none bg-transparent px-1 py-2 text-sm max-h-28 focus:outline-none" />
              <Button data-testid="support-send-btn" onClick={send} disabled={sending || (!text.trim() && pending.length === 0)} className="h-9 px-4 shrink-0 bg-emerald-600 hover:bg-emerald-700">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Send</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---- info side panel ---- */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto max-h-[calc(100vh-230px)]" data-testid="support-ticket-info">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">Ticket details</p>
          <InfoRow icon={Hash} label="Ticket ID" value={t.code} />
          <InfoRow icon={Tag} label="Department" value={<span className="capitalize">{t.category}</span>} />
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 w-24 shrink-0">Priority</span>
            <Badge cls={PRIORITY_STYLE[t.priority]}>{t.priority}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 w-24 shrink-0">Status</span>
            <Badge cls={STATUS_STYLE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          </div>
          <InfoRow icon={CalendarDays} label="Created" value={dateFull(t.created_at)} />
          <InfoRow icon={Clock} label="Updated" value={dateFull(t.updated_at)} />
          {t.assigned_name && <InfoRow icon={ShieldCheck} label="Agent" value={t.assigned_name} />}
        </div>

        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Attachments · {allAttachments.length}</p>
          {allAttachments.length === 0
            ? <p className="text-xs text-slate-400">No attachments yet — use the clip icon to add screenshots.</p>
            : <div className="flex flex-wrap gap-2">{allAttachments.map((a, i) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</div>}
        </div>

        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Your other tickets · {others.length}</p>
          {others.length === 0
            ? <p className="text-xs text-slate-400">This is your only ticket.</p>
            : <div className="space-y-1.5">{others.slice(0, 12).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-1.5">
                  <span className="truncate">{p.subject}</span>
                  <Badge cls={STATUS_STYLE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </div>
              ))}</div>}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
          <button className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/20 text-white flex items-center justify-center"><X className="h-5 w-5" /></button>
        </div>
      )}
    </div>
  );
};

/* -------- main -------- */
export default function SupportCenter({ title = "Help & Support" }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [view, setView] = useState("list"); // list | new | thread
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ status: "", q: "" });
  const [range, setRange] = useState("all");
  const [sort, setSort] = useState("newest");

  const loadList = useCallback(async () => {
    try { const { data } = await api.get("/support/tickets"); setTickets(data); } catch (_) { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    api.get("/support/meta").then((r) => setMeta(r.data)).catch(() => {});
    loadList();
  }, [loadList]);
  useEffect(() => { if (view !== "list") return; const iv = setInterval(loadList, 6000); return () => clearInterval(iv); }, [view, loadList]);

  const openTicket = (t) => { setActive(t); setView("thread"); };

  const view_rows = useMemo(() => {
    let out = [...tickets];
    if (f.status) out = out.filter((r) => r.status === f.status);
    if (f.q) {
      const q = f.q.toLowerCase();
      out = out.filter((r) => (r.subject || "").toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q));
    }
    if (range !== "all") {
      const cut = Date.now() - (range === "today" ? 1 : Number(range)) * 86400000;
      out = out.filter((r) => new Date(r.created_at).getTime() >= (range === "today" ? new Date().setHours(0, 0, 0, 0) : cut));
    }
    out.sort((a, b) => sort === "newest" ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at));
    return out;
  }, [tickets, f, range, sort]);

  return (
    <div className="max-w-6xl mx-auto" data-testid="support-center">
      {view === "list" && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="font-heading font-extrabold text-2xl flex items-center gap-2"><LifeBuoy className="h-6 w-6 text-primary-600" /> {title}</h2>
              <p className="text-sm text-slate-500">{view_rows.length} ticket{view_rows.length !== 1 ? "s" : ""} · chat with our support team, attach screenshots, track status.</p>
            </div>
            <Button data-testid="support-new-btn" onClick={() => setView("new")} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> New Ticket</Button>
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input data-testid="support-list-search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search your tickets…" className="pl-9" />
            </div>
            <PremiumSelect data-testid="support-range" value={range} onChange={(e) => setRange(e.target.value)} searchable={false} className="!w-auto min-w-[140px] rounded-lg">
              <option value="all">All time</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
            </PremiumSelect>
            <PremiumSelect data-testid="support-filter-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" className="!w-auto min-w-[150px] rounded-lg">
              <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </PremiumSelect>
            <PremiumSelect data-testid="support-sort" value={sort} onChange={(e) => setSort(e.target.value)} searchable={false} className="!w-auto min-w-[140px] rounded-lg">
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
            </PremiumSelect>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
          ) : view_rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
              <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No tickets found</p>
              <p className="text-sm text-slate-400 mb-4">Need help? Raise your first support ticket.</p>
              <Button onClick={() => setView("new")} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> New Ticket</Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="hidden sm:grid grid-cols-[120px_1fr_120px_110px_110px_130px] gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <span>Ticket #</span><span>Subject</span><span>Category</span><span>Priority</span><span>Status</span><span>Created</span>
              </div>
              {view_rows.map((tk) => (
                <button key={tk.id} data-testid={`support-ticket-${tk.code}`} onClick={() => openTicket(tk)}
                  className="w-full text-left grid grid-cols-2 sm:grid-cols-[120px_1fr_120px_110px_110px_130px] gap-2 sm:gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 items-center">
                  <span className="font-mono text-xs text-slate-500 flex items-center gap-1.5">
                    {tk.unread_user > 0 && <span className="h-2 w-2 rounded-full bg-red-500" />}{tk.code}
                  </span>
                  <span className="text-sm font-medium truncate col-span-2 sm:col-span-1 order-last sm:order-none">{tk.subject}</span>
                  <span className="text-xs text-slate-500 capitalize truncate hidden sm:block">{tk.category}</span>
                  <span><Badge cls={PRIORITY_STYLE[tk.priority]}>{tk.priority}</Badge></span>
                  <span><Badge cls={STATUS_STYLE[tk.status]}>{STATUS_LABEL[tk.status]}</Badge></span>
                  <span className="text-xs text-slate-400 hidden sm:block">{ago(tk.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === "new" && <NewTicket meta={meta} onCancel={() => setView("list")} onCreated={(t) => { loadList(); openTicket(t); }} />}

      {view === "thread" && active && (
        <Thread ticket={active} myId={user?.id} tickets={tickets}
          onBack={() => { setView("list"); loadList(); }} onChanged={loadList} />
      )}
    </div>
  );
}
