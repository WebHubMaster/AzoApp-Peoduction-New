import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  LifeBuoy, Send, Paperclip, X, FileText, Loader2, Search, Inbox,
  ShieldCheck, User, Clock, RefreshCw, CheckCircle2, ArrowLeft, MoreVertical,
  Mail, Phone, Building2, CalendarDays, Hash, Check, CheckCheck, StickyNote,
  MessageSquare, ChevronDown, ArrowUpDown, CalendarRange,
} from "lucide-react";

const STATUS_STYLE = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  closed: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};
const STATUS_LABEL = { open: "Open", in_progress: "Pending", resolved: "Resolved", closed: "Closed" };
const PRIORITY_STYLE = {
  low: "bg-slate-100 text-slate-600", medium: "bg-sky-100 text-sky-700",
  high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700",
};
const PRIORITIES = ["low", "medium", "high", "urgent"];
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
const initials = (n) => (n || "U").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();

const Badge = ({ cls, children }) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`}>{children}</span>;

const StatCard = ({ label, value, tone }) => (
  <div className={`rounded-xl border p-3 ${tone}`}>
    <p className="text-2xl font-heading font-extrabold">{value}</p>
    <p className="text-[11px] font-medium opacity-70">{label}</p>
  </div>
);

const AttachmentView = ({ a, onOpen }) => {
  if (a.kind === "pdf") {
    return (
      <a href={a.url} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-xs hover:border-primary-400 max-w-[200px]">
        <FileText className="h-4 w-4 text-red-500 shrink-0" /><span className="truncate">{a.name || "Document.pdf"}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={() => onOpen?.(a.url)} className="block rounded-lg overflow-hidden border hover:opacity-90">
      <img src={a.thumb_url || a.url} alt="" className="h-24 w-24 object-cover" loading="lazy" />
    </button>
  );
};

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2 py-1.5">
    <Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
    <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
    <span className="text-xs font-medium text-slate-800 dark:text-slate-100 break-words flex-1">{value || "—"}</span>
  </div>
);

/* ---------------- conversation thread ---------------- */
const Thread = ({ tid, onChanged, onBack }) => {
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("chat"); // chat | note
  const [pending, setPending] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const lastTypingSent = useRef(0);
  const closed = t?.status === "closed";

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/support/tickets/${tid}`);
      setT((prev) => {
        const a = prev || {};
        const sameMsgs = (a.messages?.length || 0) === (data.messages?.length || 0);
        const sameTyping = !!a.user_typing === !!data.user_typing;
        const sameStatus = a.status === data.status;
        const samePriority = a.priority === data.priority;
        const sameLast = a.last_message_at === data.last_message_at;
        const sameAssign = a.assigned_name === data.assigned_name;
        if (sameMsgs && sameTyping && sameStatus && samePriority && sameLast && sameAssign) return a;
        return data;
      });
    } catch (_) { /* ignore */ }
  }, [tid]);

  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 3000) return;
    lastTypingSent.current = now;
    api.post(`/admin/support/tickets/${tid}/typing`).catch(() => {});
  }, [tid]);

  useEffect(() => { setT(null); refresh(); }, [refresh]);
  useEffect(() => { const iv = setInterval(refresh, 3000); return () => clearInterval(iv); }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [t?.messages?.length, t?.user_typing]);

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
      const { data } = await api.post(`/admin/support/tickets/${tid}/messages`, { text, attachments: pending, internal: mode === "note" });
      setT(data); setText(""); setPending([]); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send"); }
    finally { setSending(false); }
  };

  const setStatus = async (status) => {
    setMenuOpen(false);
    try { const { data } = await api.put(`/admin/support/tickets/${tid}/status`, { status }); setT(data); onChanged?.(); toast.success(`Marked ${STATUS_LABEL[status]}`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not update"); }
  };
  const setPriority = async (priority) => {
    try { const { data } = await api.put(`/admin/support/tickets/${tid}/priority`, { priority }); setT(data); onChanged?.(); }
    catch (e) { toast.error("Could not update priority"); }
  };
  const assignToMe = async () => {
    try { const { data } = await api.post(`/admin/support/tickets/${tid}/assign`, {}); setT(data); onChanged?.(); toast.success("Assigned to you"); }
    catch { toast.error("Could not assign"); }
  };

  if (!t) return <div className="py-24 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>;

  const info = t.user_info || {};
  const allAttachments = (t.messages || []).flatMap((m) => m.attachments || []);

  let lastDay = null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4" data-testid="admin-support-thread">
      {/* ---------- main conversation ---------- */}
      <div className="flex flex-col h-[calc(100vh-190px)] min-h-[520px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <button onClick={onBack} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></button>
          <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">{initials(info.name)}</div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate flex items-center gap-2">
              <span className="text-slate-400 font-mono text-xs">{t.code}</span>
              <span className="truncate">{t.subject}</span>
            </p>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">Updated {ago(t.updated_at)}
              <span className="inline-flex items-center gap-1 text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Live</span>
            </p>
          </div>
          <Badge cls={STATUS_STYLE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          <Badge cls={PRIORITY_STYLE[t.priority]}>{t.priority} Priority</Badge>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} data-testid="admin-ticket-menu" className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><MoreVertical className="h-4 w-4" /></button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl py-1.5 text-sm">
                <button onClick={() => setStatus("resolved")} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">Mark Resolved</button>
                <button onClick={() => setStatus("in_progress")} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">Mark Pending</button>
                <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                <button onClick={() => setStatus("closed")} className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><X className="h-3.5 w-3.5" /> Close permanently</button>
              </div>
            )}
          </div>
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
            const mine = m.sender_role === "admin";
            const note = m.internal;
            block.push(
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <div className="h-7 w-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold shrink-0">{initials(m.sender_name)}</div>}
                <div className={`max-w-[76%] flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                  <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 px-1">
                    {mine ? <><ShieldCheck className="h-3 w-3 text-primary-600" /> {note ? "Internal note" : "Support"}</> : <>{m.sender_name}</>}
                  </span>
                  {(m.attachments || []).length > 0 && <div className="flex flex-wrap gap-2">{m.attachments.map((a, i) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</div>}
                  {m.text && (
                    <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                      note ? "bg-amber-100 text-amber-900 border border-amber-200 rounded-br-sm"
                        : mine ? "bg-emerald-500 text-white rounded-br-sm"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-bl-sm"}`}>
                      {m.text}
                      <span className={`block text-[10px] mt-1 flex items-center gap-1 ${note ? "text-amber-700/70" : mine ? "text-white/80 justify-end" : "text-slate-400"}`}>
                        {timeStr(m.at)}
                        {mine && !note && (t.unread_user === 0 ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                      </span>
                    </div>
                  )}
                </div>
                {mine && <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">{note ? <StickyNote className="h-3 w-3" /> : "S"}</div>}
              </div>
            );
            return block;
          })}
          {t.user_typing && (
            <div className="flex justify-start" data-testid="admin-user-typing">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3.5 py-2.5">
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1"><User className="h-3 w-3" /> Customer is typing</span>
                <span className="flex gap-1 ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* composer */}
        {closed ? (
          <div className="px-4 py-4 border-t text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Ticket closed. Set status back to re-open for replies.
          </div>
        ) : (
          <div className="border-t border-slate-100 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
                <button data-testid="admin-tab-chat" onClick={() => setMode("chat")} className={`px-3 py-1 rounded-md flex items-center gap-1 ${mode === "chat" ? "bg-white dark:bg-slate-900 shadow text-primary-700" : "text-slate-500"}`}><MessageSquare className="h-3.5 w-3.5" /> Chat</button>
                <button data-testid="admin-tab-note" onClick={() => setMode("note")} className={`px-3 py-1 rounded-md flex items-center gap-1 ${mode === "note" ? "bg-white dark:bg-slate-900 shadow text-amber-700" : "text-slate-500"}`}><StickyNote className="h-3.5 w-3.5" /> Note</button>
              </div>
              <span className="text-[11px] text-slate-400">Enter to send · Shift+Enter for newline</span>
            </div>
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pending.map((a, i) => (
                  <div key={i} className="relative">
                    {a.kind === "pdf" ? <div className="h-14 w-14 rounded-lg border flex items-center justify-center bg-slate-50"><FileText className="h-5 w-5 text-red-500" /></div>
                      : <img src={a.thumb_url || a.url} alt="" className="h-14 w-14 object-cover rounded-lg border" />}
                    <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className={`flex items-end gap-2 rounded-xl border p-2 ${mode === "note" ? "border-amber-300 bg-amber-50/40" : "border-slate-200 dark:border-slate-700"}`}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={pickFiles} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <textarea data-testid="admin-reply-input" value={text} onChange={(e) => { setText(e.target.value); pingTyping(); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder={mode === "note" ? "Add an internal note (only staff can see this)…" : `Reply to ${info.name || "customer"}…`}
                className="flex-1 resize-none bg-transparent px-1 py-2 text-sm max-h-28 focus:outline-none" />
              <Button data-testid="admin-send-btn" onClick={send} disabled={sending || (!text.trim() && pending.length === 0)}
                className={`h-9 px-4 shrink-0 ${mode === "note" ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> {mode === "note" ? "Add note" : "Send"}</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- info side panel ---------- */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto max-h-[calc(100vh-190px)]" data-testid="admin-ticket-info">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold">{initials(info.name)}</div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 dark:text-white truncate">{info.name}</p>
              <p className="text-xs text-slate-500 truncate">{info.company || "—"}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{info.role}</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">User information</p>
          <InfoRow icon={Mail} label="Email" value={info.email} />
          <InfoRow icon={Phone} label="Phone" value={info.phone} />
          <InfoRow icon={Building2} label="Company" value={info.company} />
          <InfoRow icon={Hash} label="User ID" value={(info.id || "").slice(0, 8)} />
          <InfoRow icon={CalendarDays} label="Registered" value={info.registered_at ? new Date(info.registered_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
        </div>

        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">Ticket details</p>
          <InfoRow icon={Hash} label="Ticket ID" value={t.code} />
          <InfoRow icon={CalendarDays} label="Created" value={dateFull(t.created_at)} />
          <InfoRow icon={Clock} label="Updated" value={dateFull(t.updated_at)} />
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-slate-500 w-24 shrink-0">Status</span>
            <PremiumSelect data-testid="admin-status-select" value={t.status} onChange={(e) => setStatus(e.target.value)}
              className="flex-1 !h-9 rounded-lg">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </PremiumSelect>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-24 shrink-0">Priority</span>
            <PremiumSelect data-testid="admin-priority-select" value={t.priority} onChange={(e) => setPriority(e.target.value)}
              className="flex-1 !h-9 rounded-lg capitalize">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </PremiumSelect>
          </div>
          <InfoRow icon={Inbox} label="Department" value={<span className="capitalize">{t.department || t.category}</span>} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-24 shrink-0">Assigned</span>
            {t.assigned_name
              ? <span className="text-xs font-medium flex-1">{t.assigned_name}</span>
              : <button data-testid="admin-assign-me" onClick={assignToMe} className="text-xs font-semibold text-primary-700 hover:underline flex-1 text-left">Unassigned · Assign to me</button>}
          </div>
        </div>

        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Attachments · {allAttachments.length}</p>
          {allAttachments.length === 0
            ? <p className="text-xs text-slate-400">No attachments yet — use the clip icon in the composer to add.</p>
            : <div className="flex flex-wrap gap-2">{allAttachments.map((a, i) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</div>}
        </div>

        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Previous conversations · {(t.previous_conversations || []).length}</p>
          {(t.previous_conversations || []).length === 0
            ? <p className="text-xs text-slate-400">No other tickets from this user.</p>
            : <div className="space-y-1.5">{t.previous_conversations.map((p) => (
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
        </div>
      )}
    </div>
  );
};

/* ---------------- inbox (list) ---------------- */
export default function SupportInbox() {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [f, setF] = useState({ status: "", q: "" });
  const [range, setRange] = useState("all"); // all | today | 7 | 30
  const [sort, setSort] = useState("newest");

  const loadStats = useCallback(() => { api.get("/admin/support/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);
  const loadList = useCallback(async () => {
    const p = new URLSearchParams();
    if (f.status) p.set("status", f.status);
    if (f.q) p.set("q", f.q);
    try { const { data } = await api.get(`/admin/support/tickets?${p.toString()}`); setRows(data); }
    catch (_) { /* ignore */ }
    setLoading(false);
  }, [f]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const id = setTimeout(loadList, 250); return () => clearTimeout(id); }, [loadList]);
  useEffect(() => { if (active) return; const iv = setInterval(loadList, 5000); return () => clearInterval(iv); }, [active, loadList]);

  const refreshAll = () => { loadList(); loadStats(); };

  const view = useMemo(() => {
    let out = [...rows];
    if (range !== "all") {
      const cut = Date.now() - (range === "today" ? 1 : Number(range)) * 86400000;
      out = out.filter((r) => new Date(r.created_at).getTime() >= (range === "today" ? new Date().setHours(0, 0, 0, 0) : cut));
    }
    out.sort((a, b) => sort === "newest"
      ? new Date(b.created_at) - new Date(a.created_at)
      : new Date(a.created_at) - new Date(b.created_at));
    return out;
  }, [rows, range, sort]);

  if (active) {
    return (
      <div data-testid="support-inbox">
        <Thread tid={active} onChanged={refreshAll} onBack={() => { setActive(null); refreshAll(); }} />
      </div>
    );
  }

  return (
    <div data-testid="support-inbox">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-heading font-extrabold text-2xl flex items-center gap-2"><LifeBuoy className="h-6 w-6 text-primary-600" /> Support Tickets</h2>
          <p className="text-sm text-slate-500">{view.length} ticket{view.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <StatCard label="Total" value={stats.total} tone="bg-slate-50 border-slate-200 text-slate-700" />
          <StatCard label="Open" value={stats.by_status?.open || 0} tone="bg-blue-50 border-blue-200 text-blue-700" />
          <StatCard label="Pending" value={stats.by_status?.in_progress || 0} tone="bg-amber-50 border-amber-200 text-amber-700" />
          <StatCard label="Resolved" value={stats.by_status?.resolved || 0} tone="bg-emerald-50 border-emerald-200 text-emerald-700" />
          <StatCard label="Unread" value={stats.unread || 0} tone="bg-red-50 border-red-200 text-red-700" />
        </div>
      )}

      {/* toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input data-testid="support-search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search code, subject, name, phone…" className="pl-9" />
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
        <Button onClick={refreshAll} variant="outline" size="sm"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_120px_110px_110px_140px] gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <span>Ticket #</span><span>Subject</span><span>Category</span><span>Priority</span><span>Status</span><span>Created</span>
        </div>
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
        ) : view.length === 0 ? (
          <div className="py-16 text-center text-slate-400"><Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" /> No tickets found</div>
        ) : view.map((tk) => (
          <button key={tk.id} data-testid={`admin-ticket-${tk.code}`} onClick={() => setActive(tk.id)}
            className="w-full text-left grid grid-cols-[120px_1fr_120px_110px_110px_140px] gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 items-center">
            <span className="font-mono text-xs text-slate-500 flex items-center gap-1.5">
              {tk.unread_admin > 0 && <span className="h-2 w-2 rounded-full bg-red-500" />}{tk.code}
            </span>
            <span className="text-sm font-medium truncate">{tk.subject}</span>
            <span className="text-xs text-slate-500 capitalize truncate">{tk.category}</span>
            <span><Badge cls={PRIORITY_STYLE[tk.priority]}>{tk.priority}</Badge></span>
            <span><Badge cls={STATUS_STYLE[tk.status]}>{STATUS_LABEL[tk.status]}</Badge></span>
            <span className="text-xs text-slate-400">{ago(tk.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
