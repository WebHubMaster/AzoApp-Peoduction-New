import PremiumSelect from "@/components/ui/PremiumSelect";
const DND_TIME_OPTS = Array.from({ length: 48 }, (_, i) => { const h = Math.floor(i / 2); const m = i % 2 ? "30" : "00"; const v = `${String(h).padStart(2, "0")}:${m}`; const hr12 = h % 12 === 0 ? 12 : h % 12; const ap = h < 12 ? "AM" : "PM"; return { value: v, label: `${hr12}:${m} ${ap}` }; });
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Mail, MessageSquare, Bell, Plus, Pencil, Copy, Send, Trash2, Eye, Loader2,
  Power, Settings2, KeyRound, Percent, GraduationCap, Award, CheckCircle2, Check,
  Cloud, CreditCard, Chrome, Phone, ScanLine, X, Save, Coins, Globe, Wallet, Banknote, MapPin, Download,
  Volume2, Music, Play, Moon, Upload, Gift, Zap, Calendar, UserPlus, Wrench, AlertTriangle, Star, Search, QrCode, Sparkles,
} from "lucide-react";
import { TONE_LABELS, previewTone } from "@/lib/ringPrefs";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { toast } from "sonner";

const CHANNELS = [
  { key: "sms", label: "SMS Templates", icon: MessageSquare },
  { key: "email", label: "Email Templates", icon: Mail },
  { key: "push", label: "Push Templates", icon: Bell },
];

// Icon palette for Trigger Events (name must match backend defaults in template_service._default_meta)
const EVENT_ICONS = {
  Bell, Wallet, CheckCircle2, UserPlus, Calendar, MessageSquare, CreditCard,
  Gift, Wrench, Send, AlertTriangle, Star, Phone, Mail, Zap,
};
const EVENT_ICON_NAMES = Object.keys(EVENT_ICONS);
const EVENT_COLORS = ["#64748b", "#2563eb", "#16a34a", "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#e11d48", "#d97706", "#0ea5e9"];
// Small rounded icon chip used in the events list
const EventIcon = ({ name, color, size = "h-8 w-8" }) => {
  const Ic = EVENT_ICONS[name] || Bell;
  const c = color || "#64748b";
  return (
    <span className={`${size} shrink-0 rounded-lg flex items-center justify-center`} style={{ backgroundColor: `${c}1a`, color: c }}>
      <Ic className="h-4 w-4" />
    </span>
  );
};

/* ============================ TEMPLATE MANAGER ============================ */
export function TemplateManager() {
  const [channel, setChannel] = useState("sms");
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // template object or {} for new
  const [showEvents, setShowEvents] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/partner-reg/templates?channel=${channel}`)
      .then((r) => setRows(r.data)).finally(() => setLoading(false));
  }, [channel]);
  useEffect(() => { load(); }, [load]);
  const loadEvents = useCallback(() => {
    api.get("/admin/partner-reg/template-events").then((r) => setEvents(r.data)).catch(() => {});
  }, []);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  const toggle = async (t) => { await api.post(`/admin/partner-reg/templates/${t.id}/toggle`); load(); };
  const del = async (t) => { if (!window.confirm("Delete this template?")) return; await api.delete(`/admin/partner-reg/templates/${t.id}`); toast.success("Deleted"); load(); };
  const dup = async (t) => { const { id, created_at, ...rest } = t; await api.post("/admin/partner-reg/templates", { ...rest, name: t.name + " (copy)" }); toast.success("Duplicated"); load(); };
  const test = async (t) => { try { await api.post(`/admin/partner-reg/templates/${t.id}/test`); toast.success("Test sent to your account (in-app + configured channels)"); } catch { toast.error("Test failed"); } };

  return (
    <div data-testid="template-manager">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900">Template Manager</h1>
          <p className="text-slate-500 text-sm">Reusable SMS (DLT), Email &amp; Push templates · event-driven · toggle to activate</p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="tpl-manage-events" variant="outline" onClick={() => setShowEvents(true)} className="border-primary-200 text-primary-700 hover:bg-primary-50">
            <Zap className="h-4 w-4 mr-1" /> Trigger Events
          </Button>
          <Button data-testid="tpl-new" onClick={() => setEdit({ channel, active: true, event: "general", category: "general" })} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1" /> New {channel.toUpperCase()} Template
          </Button>
        </div>
      </div>

      <div className="inline-flex bg-slate-100 rounded-xl p-1 my-5">
        {CHANNELS.map((c) => (
          <button key={c.key} data-testid={`tpl-tab-${c.key}`} onClick={() => setChannel(c.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition
              ${channel === c.key ? "bg-white shadow text-primary-700" : "text-slate-500"}`}>
            <c.icon className="h-4 w-4" /> {c.label}
          </button>
        ))}
      </div>

      {loading ? <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.length === 0 && <div className="col-span-full bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center text-slate-400">No {channel} templates yet.</div>}
          {rows.map((t) => {
            const ev = events.find((e) => e.key === t.event);
            const evColor = ev?.color || "#2563eb";
            return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col" data-testid={`tpl-card-${t.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <EventIcon name={ev?.icon} color={evColor} />
                  <p className="font-semibold text-slate-800 truncate">{t.name}</p>
                </div>
                <Switch data-testid={`tpl-toggle-${t.id}`} checked={t.active} onCheckedChange={() => toggle(t)} />
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                <Badge className="border-0" style={{ backgroundColor: `${evColor}1a`, color: evColor }} data-testid={`tpl-event-badge-${t.id}`}>{ev?.label || t.event}</Badge>
                <Badge className="bg-slate-100 text-slate-600 border-0">{t.category}</Badge>
                {t.dlt_template_id && <Badge className="bg-amber-50 text-amber-700 border-0">DLT: {t.dlt_template_id}</Badge>}
              </div>
              {t.channel === "email" && <p className="text-sm font-medium text-slate-700 mt-2">{t.subject}</p>}
              {t.channel === "push" && <p className="text-sm font-medium text-slate-700 mt-2">{t.title}</p>}
              <p className="text-sm text-slate-500 mt-1.5 line-clamp-3 flex-1" dangerouslySetInnerHTML={{ __html: (t.body || "").slice(0, 200) }} />
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 text-slate-400">
                <button onClick={() => setEdit(t)} data-testid={`tpl-edit-${t.id}`} title="Edit" className="hover:text-primary-600"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => dup(t)} title="Duplicate" className="hover:text-primary-600"><Copy className="h-4 w-4" /></button>
                <button onClick={() => test(t)} data-testid={`tpl-test-${t.id}`} title="Send test" className="hover:text-emerald-600"><Send className="h-4 w-4" /></button>
                <button onClick={() => del(t)} title="Delete" className="ml-auto hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {edit && <TemplateEditor tpl={edit} events={events} onEventsChanged={loadEvents} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {showEvents && <TriggerEventsManager events={events} onChanged={loadEvents} onClose={() => setShowEvents(false)} />}
    </div>
  );
}

/* Create + manage UNLIMITED custom Trigger Events. Each event can carry any
   channel template (push/sms/email) that fires when the app raises the event. */
function TriggerEventsManager({ events, onChanged, onClose }) {
  const [label, setLabel] = useState("");
  const [vars, setVars] = useState("");
  const [icon, setIcon] = useState("Bell");
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [editKey, setEditKey] = useState(null);   // key being edited (null = create new)
  const [confirmKey, setConfirmKey] = useState(null);
  const resetForm = () => { setEditKey(null); setLabel(""); setVars(""); setIcon("Bell"); setColor(EVENT_COLORS[0]); };
  const startEdit = (e) => {
    setEditKey(e.key); setLabel(e.label || e.key);
    setVars((e.vars || []).join(", ")); setIcon(e.icon || "Bell"); setColor(e.color || EVENT_COLORS[0]);
  };
  const create = async () => {
    if (!label.trim()) return toast.error("Enter an event name");
    setBusy(true);
    try {
      // When editing a built-in, keep its original key so the override maps correctly.
      const body = editKey ? { key: editKey, label: label.trim(), vars, icon, color } : { label: label.trim(), vars, icon, color };
      const r = await api.post("/admin/partner-reg/template-events", body);
      if (r.data?.ok) { toast.success(editKey ? "Event updated" : `Event created: ${r.data.key}`); resetForm(); onChanged?.(); }
      else toast.error(r.data?.error || "Could not save event");
    } catch { toast.error("Could not save event"); } finally { setBusy(false); }
  };
  const del = async (key) => {
    try {
      const r = await api.delete(`/admin/partner-reg/template-events/${key}`);
      if (r.data?.ok) { toast.success(r.data.hidden ? "Built-in event deleted (disabled)" : "Event deleted"); setConfirmKey(null); if (editKey === key) resetForm(); onChanged?.(); }
      else toast.error(r.data?.error || "Cannot delete");
    } catch { toast.error("Cannot delete"); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="trigger-events-manager">
        <DialogHeader><DialogTitle>Trigger Events</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-2">Create unlimited events, or edit / delete any event (built-in too). Pick an icon &amp; colour so the list is easy to scan. Any push / SMS / email template attached to an event fires automatically when that event happens in the app. Deleting a built-in disables its trigger — re-create it any time to restore.</p>
        {editKey && (
          <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-3 py-1.5 text-[12px] text-primary-700 font-semibold" data-testid="event-edit-banner">
            <span>Editing: <span className="font-mono">{editKey}</span></span>
            <button onClick={resetForm} className="text-primary-600 hover:text-primary-800 underline">Cancel edit</button>
          </div>
        )}
        <div className="bg-slate-50 rounded-xl p-3 space-y-3">
          <div className="grid sm:grid-cols-[auto_1fr_1fr_auto] gap-2 items-end">
            <L label="Preview"><EventIcon name={icon} color={color} /></L>
            <L label="New event name *"><Input data-testid="event-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Job Reminder 1 Hour" /></L>
            <L label="Variables (comma separated)"><Input data-testid="event-vars" value={vars} onChange={(e) => setVars(e.target.value)} placeholder="name, booking_id, amount" /></L>
            <Button data-testid="event-create" onClick={create} disabled={busy} className={`h-10 ${editKey ? "bg-primary-600 hover:bg-primary-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editKey ? <><Check className="h-4 w-4 mr-1" /> Update</> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
            </Button>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Icon</p>
            <div className="flex flex-wrap gap-1.5" data-testid="event-icon-picker">
              {EVENT_ICON_NAMES.map((n) => {
                const Ic = EVENT_ICONS[n];
                const sel = n === icon;
                return (
                  <button key={n} type="button" onClick={() => setIcon(n)} title={n} data-testid={`event-icon-${n}`}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center border transition ${sel ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
                    style={sel ? { backgroundColor: color } : undefined}>
                    <Ic className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Colour</p>
            <div className="flex flex-wrap gap-1.5" data-testid="event-color-picker">
              {EVENT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} title={c} data-testid={`event-color-${c}`}
                  className={`h-7 w-7 rounded-full border-2 transition ${c === color ? "border-slate-900 scale-110" : "border-white shadow-sm"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 bg-white">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input data-testid="event-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search events by name or key…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          {q && <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
        </div>
        <div className="mt-2 space-y-1.5 max-h-[46vh] overflow-y-auto">
          {(() => {
            const needle = q.trim().toLowerCase();
            const filtered = needle
              ? events.filter((e) => (e.label || "").toLowerCase().includes(needle) || (e.key || "").toLowerCase().includes(needle))
              : events;
            if (filtered.length === 0) return <p className="text-center text-sm text-slate-400 py-6">No events match “{q}”.</p>;
            return filtered.map((e) => (
            <div key={e.key} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2" data-testid={`event-row-${e.key}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <EventIcon name={e.icon} color={e.color} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{e.label} {e.builtin && <Badge className="bg-slate-100 text-slate-500 border-0 ml-1">built-in</Badge>}</p>
                  <p className="text-[11px] font-mono text-slate-400 truncate">{e.key}{(e.vars || []).length ? ` · ${(e.vars || []).join(", ")}` : ""}</p>
                </div>
              </div>
              {confirmKey === e.key ? (
                <div className="shrink-0 flex items-center gap-1.5" data-testid={`event-confirm-${e.key}`}>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">{e.builtin ? "Delete & disable?" : "Delete?"}</span>
                  <button onClick={() => del(e.key)} data-testid={`event-confirm-yes-${e.key}`} className="text-[12px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-md px-2 py-1">Delete</button>
                  <button onClick={() => setConfirmKey(null)} className="text-[12px] font-semibold text-slate-500 hover:text-slate-700 rounded-md px-2 py-1">Cancel</button>
                </div>
              ) : (
                <div className="shrink-0 flex items-center gap-1">
                  <button onClick={() => startEdit(e)} title="Edit" data-testid={`event-edit-${e.key}`} className="text-slate-400 hover:text-primary-600 p-1"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setConfirmKey(e.key)} title="Delete" data-testid={`event-del-${e.key}`} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
            ));
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({ tpl, events, onEventsChanged, onClose, onSaved }) {
  const [f, setF] = useState({ subject: "", title: "", body: "", sender_id: "", dlt_template_id: "", category: "general", event: "general", active: true, ...tpl });
  const [busy, setBusy] = useState(false);
  const textRef = useRef(null);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const isNew = !tpl.id;
  const isEmail = f.channel === "email";
  const addEvent = async () => {
    const label = window.prompt("New Trigger Event name (e.g. Job Reminder):");
    if (!label || !label.trim()) return;
    try {
      const r = await api.post("/admin/partner-reg/template-events", { label: label.trim() });
      if (r.data?.ok) { await onEventsChanged?.(); set("event", r.data.key); toast.success(`Event created: ${r.data.key}`); }
      else toast.error(r.data?.error || "Could not create event");
    } catch { toast.error("Could not create event"); }
  };
  const save = async () => {
    if (!f.name?.trim()) return toast.error("Name is required");
    if (isEmail && !f.subject?.trim()) return toast.error("Subject is required");
    if (f.channel === "push" && !f.title?.trim()) return toast.error("Title is required");
    if (!f.body?.trim()) return toast.error("Body is required");
    setBusy(true);
    try {
      if (isNew) await api.post("/admin/partner-reg/templates", f);
      else await api.put(`/admin/partner-reg/templates/${tpl.id}`, f);
      toast.success("Template saved"); onSaved();
    } catch { toast.error("Save failed"); } finally { setBusy(false); }
  };
  const ev = events.find((e) => e.key === f.event);
  const commonVars = ["name", "business", "phone", "booking_id", "amount", "otp", "reason"];
  const vars = Array.from(new Set([...(ev?.vars || []), ...commonVars]));

  // Insert a {{var}} token — into the WYSIWYG (keeps focus via mousedown) for
  // email, or at the cursor of the textarea for sms / push.
  const insertVar = (v) => {
    const token = `{{${v}}}`;
    if (isEmail) {
      document.execCommand("insertText", false, token);
      // execCommand fires onInput, which updates f.body via RichTextEditor.
      return;
    }
    const el = textRef.current;
    if (!el) { set("body", (f.body || "") + token); return; }
    const s = el.selectionStart ?? (f.body || "").length;
    const e = el.selectionEnd ?? s;
    const next = (f.body || "").slice(0, s) + token + (f.body || "").slice(e);
    set("body", next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length; });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={`${isEmail ? "max-w-3xl" : "max-w-2xl"} max-h-[92vh] overflow-y-auto`} data-testid="tpl-editor">
        <DialogHeader><DialogTitle>{isNew ? "New" : "Edit"} {f.channel.toUpperCase()} Template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <L label="Name *"><Input data-testid="tpl-name" value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></L>
            <L label="Trigger Event"><div className="flex gap-1.5">
              <PremiumSelect data-testid="tpl-event" value={f.event} onChange={(e) => set("event", e.target.value)} className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm">
                {events.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </PremiumSelect>
              <button type="button" data-testid="tpl-event-new" onClick={addEvent} title="Create new trigger event"
                className="shrink-0 h-10 w-10 grid place-items-center rounded-md border border-primary-200 text-primary-700 hover:bg-primary-50"><Plus className="h-4 w-4" /></button>
            </div></L>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <L label="Category"><Input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="general / otp / booking …" /></L>
            {f.channel === "sms" && <L label="Sender ID (DLT header)"><Input value={f.sender_id} onChange={(e) => set("sender_id", e.target.value)} placeholder="AZOHOM" /></L>}
          </div>
          {f.channel === "sms" && <L label="Fast2SMS Message / DLT Template ID"><Input value={f.dlt_template_id} onChange={(e) => set("dlt_template_id", e.target.value)} placeholder="e.g. 220032" /></L>}
          {isEmail && <L label="Subject * ({{name}} variables supported)"><Input data-testid="tpl-subject" value={f.subject} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Welcome to {{business}}, {{name}}!" /></L>}
          {f.channel === "push" && <L label="Title *"><Input data-testid="tpl-title" value={f.title} onChange={(e) => set("title", e.target.value)} /></L>}

          <div>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <label className="text-xs font-semibold text-slate-500">Body *</label>
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[11px] text-slate-400 mr-1">Insert variable:</span>
                {vars.map((v) => (
                  <button key={v} type="button" data-testid={`tpl-var-${v}`}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v)}
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 hover:bg-primary-100">
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
            {isEmail ? (
              <RichTextEditor value={f.body} onChange={(html) => set("body", html)}
                placeholder="Design your email — use the toolbar. Insert variables like {{name}}, {{business}}, {{otp}}." />
            ) : (
              <textarea ref={textRef} data-testid="tpl-body" value={f.body} onChange={(e) => set("body", e.target.value)} rows={4}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:border-primary-400"
                placeholder={f.channel === "sms" ? "Use {{name}} / [[name]] or DLT {#VAR#}" : "Push message. Use {{name}}, {{booking_id}}…"} />
            )}
          </div>

          <div className="flex items-center gap-2"><Switch data-testid="tpl-active" checked={!!f.active} onCheckedChange={(v) => set("active", v)} /><span className="text-sm text-slate-600">Active — this template fires on its trigger event only when ON</span></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="tpl-save" onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save Template</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ INTEGRATION CENTER ============================ */
const CARDS = [
  { key: "email", icon: Mail, title: "SMTP Email", desc: "Transactional + template emails", flag: "email_enabled", provider: "smtp",
    fields: [["smtp_host", "SMTP Host"], ["smtp_port", "Port"], ["smtp_user", "Username"], ["smtp_password", "Password", "password"], ["smtp_from_email", "From Email"], ["smtp_from_name", "From Name"]] },
  { key: "sms", icon: MessageSquare, title: "Fast2SMS", desc: "DLT-compliant SMS gateway", flag: "sms_enabled",
    fields: [["fast2sms_api_key", "API Key", "password"], ["fast2sms_sender_id", "Sender ID"], ["fast2sms_route", "Route (dlt · otp · q for custom)"], ["fast2sms_otp_template_id", "OTP Message ID (Fast2SMS DLT)"], ["sms_brand_name", "Brand name in OTP SMS (custom route)"], ["sms_app_hash", "Android App Hash (11-char, for OTP autofill)"]] },
  { key: "ocr", icon: ScanLine, title: "Aadhaar OCR", desc: "Extract & verify Aadhaar number", flag: "ocr_enabled",
    fields: [["ocr_provider", "AI Provider", "select", [["gemini", "Google Gemini"], ["openai", "OpenAI"], ["anthropic", "Anthropic (Claude)"]]], ["ocr_model", "Model (optional)"], ["ocr_api_key", "API Key for the selected provider", "password"]],
    guide: "Pick your vision AI provider and paste that provider's own API key (Gemini: aistudio.google.com · OpenAI: platform.openai.com · Anthropic: console.anthropic.com). Optionally override the default model. Aadhaar OCR starts working the moment a valid key is saved." },
  { key: "ai", icon: Sparkles, title: "AI Assistant", desc: "Customer / partner / admin chat assistant", flag: "ai_enabled",
    fields: [["ai_provider", "AI Provider", "select", [["anthropic", "Anthropic (Claude)"], ["openai", "OpenAI"], ["gemini", "Google Gemini"]]], ["ai_model", "Model (optional)"], ["ai_api_key", "API Key for the selected provider", "password"]],
    guide: "Powers the in-app chat assistant. Pick a provider and paste that provider's own API key (Anthropic: console.anthropic.com · OpenAI: platform.openai.com · Gemini: aistudio.google.com). Optionally override the default model (e.g. claude-3-5-sonnet-20241022, gpt-4o, gemini-2.5-flash). The assistant starts replying the moment a valid key is saved." },
  { key: "s3", icon: Cloud, title: "AWS S3 Storage", desc: "Media & document storage", flag: "aws_s3_enabled", test: "s3",
    fields: [
      ["aws_provider", "Provider", "select", [["aws_s3", "AWS S3 (recommended for media & PDFs)"]]],
      ["aws_access_key_id", "Access Key ID", "password"],
      ["aws_secret_access_key", "Secret Access Key", "password"],
      ["aws_region", "Region"],
      ["aws_bucket", "Bucket"],
      ["aws_folder", "Folder (optional prefix)"],
      ["aws_public_base", "Public Base URL (optional — CDN / CloudFront)"],
    ],
    guide: "Create an IAM user with s3:PutObject, s3:GetObject, s3:ListBucket & s3:DeleteObject on this bucket. Enter its Access Key ID & Secret Key, the bucket name and its exact AWS region (e.g. ap-south-1). Click Save, then Test Connection. Images display on your site through a secure backend proxy — so the bucket can stay private (public access blocked) and pictures still show. Optionally set Public Base URL to a CloudFront/public domain for CDN delivery." },
  { key: "razorpay", icon: CreditCard, title: "Razorpay (Pay-in & Payout)", desc: "Test & Live payments, refunds & auto-payouts — one gateway", flag: "razorpay_enabled",
    fields: [
      ["razorpay_mode", "Environment", "select", [["test", "Test / Sandbox"], ["live", "Live / Production"]]],
      ["__section", "Test keys — sandbox payments (used in Test mode)"],
      ["razorpay_test_key_id", "Test Key ID (rzp_test_…)"], ["razorpay_test_key_secret", "Test Key Secret", "password"],
      ["razorpay_test_webhook_secret", "Test Webhook Secret (refund.* events)", "password"],
      ["__section", "Live keys — real payments & RazorpayX payout (used in Live mode)"],
      ["razorpay_live_key_id", "Live Key ID (rzp_live_…)"], ["razorpay_live_key_secret", "Live Key Secret", "password"],
      ["razorpay_live_webhook_secret", "Live Webhook Secret (refund.* events)", "password"],
      ["__section", "Payout — RazorpayX auto-pay withdrawals (Live only)"],
      ["razorpayx_account_number", "RazorpayX Account Number"],
      ["razorpayx_webhook_secret", "Payout Webhook Secret (payout.* events)", "password"],
    ],
    guide: "Razorpay Dashboard → Settings → API Keys. Pick the Environment above: Test uses your rzp_test_ keys (sandbox — safe to place real test bookings with Razorpay test cards); Live uses rzp_live_ keys for real money. Enter the keys for whichever mode(s) you want active — the system uses exactly the selected mode. Add a pay-in Webhook on refund.* events (first URL below). For payouts (Live), enter your RazorpayX Account Number (My Account & Settings → Banking) and register the payout webhook (second URL).",
    guideLink: "https://dashboard.razorpay.com/app/keys",
    webhook: "/api/payments/webhooks/razorpay-refund",
    webhook2: "/api/payments/webhooks/razorpayx-payout" },
  { key: "cashfree", icon: Banknote, title: "Cashfree Payments (Pay-in & Payout)", desc: "UPI, cards & payouts to bank/UPI", flag: "cashfree_enabled",
    fields: [
      ["cashfree_mode", "Active Environment", "select", [["test", "Test / Sandbox"], ["live", "Live / Production"]]],
      ["__section", "TEST / Sandbox — pay-in keys"],
      ["cashfree_test_pg_app_id", "Test PG App ID (x-client-id)"], ["cashfree_test_pg_secret_key", "Test PG Secret Key", "password"],
      ["__section", "TEST — payout keys"],
      ["cashfree_test_payout_client_id", "Test Payout Client ID"], ["cashfree_test_payout_client_secret", "Test Payout Client Secret", "password"],
      ["__section", "LIVE / Production — pay-in keys"],
      ["cashfree_live_pg_app_id", "Live PG App ID (x-client-id)"], ["cashfree_live_pg_secret_key", "Live PG Secret Key", "password"],
      ["__section", "LIVE — payout keys"],
      ["cashfree_live_payout_client_id", "Live Payout Client ID"], ["cashfree_live_payout_client_secret", "Live Payout Client Secret", "password"],
    ],
    guide: "Cashfree Dashboard → Payment Gateway → Developers → API Keys for the PG App ID + Secret (pay-in). Payouts → Developers → API Keys for the separate Payout Client ID + Secret. Enter TEST and LIVE keys separately — they are NEVER mixed. Pick the Active Environment above; only that mode's keys are used. Register the webhooks below.",
    guideLink: "https://merchant.cashfree.com/merchants/login",
    webhook: "/api/payments/webhooks/cashfree-pg", webhook2: "/api/payments/webhooks/cashfree-payout" },
  { key: "payu", icon: Wallet, title: "PayU (Pay-in & Payout)", desc: "Hosted checkout + payouts to bank/UPI", flag: "payu_enabled",
    fields: [
      ["payu_mode", "Active Environment", "select", [["test", "Test"], ["live", "Live"]]],
      ["__section", "TEST — pay-in Merchant key & salt"],
      ["payu_test_merchant_key", "Test Merchant Key"], ["payu_test_salt", "Test Merchant Salt", "password"],
      ["__section", "TEST — payout credentials"],
      ["payu_test_payout_merchant_id", "Test Payout Merchant ID (pid)"],
      ["payu_test_payout_client_id", "Test Payout Client ID"], ["payu_test_payout_client_secret", "Test Payout Client Secret", "password"],
      ["__section", "LIVE — pay-in Merchant key & salt"],
      ["payu_live_merchant_key", "Live Merchant Key"], ["payu_live_salt", "Live Merchant Salt", "password"],
      ["__section", "LIVE — payout credentials"],
      ["payu_live_payout_merchant_id", "Live Payout Merchant ID (pid)"],
      ["payu_live_payout_client_id", "Live Payout Client ID"], ["payu_live_payout_client_secret", "Live Payout Client Secret", "password"],
    ],
    guide: "PayU Dashboard → Developer → API Details for the Merchant Key + Salt (pay-in). PayU Payouts dashboard for the Payout Merchant ID (pid) + client id/secret. Enter TEST (UAT) and LIVE credentials separately — the system uses only the Active Environment's set.",
    guideLink: "https://onboarding.payu.in/app/account",
    webhook: "/api/payments/webhooks/payu-callback" },
  { key: "easebuzz", icon: Zap, title: "Easebuzz (Pay-in & Payout)", desc: "Hosted checkout + Wire payouts", flag: "easebuzz_enabled",
    fields: [
      ["easebuzz_mode", "Active Environment", "select", [["test", "Test"], ["live", "Live"]]],
      ["__section", "TEST — pay-in Merchant key & salt"],
      ["easebuzz_test_key", "Test Merchant Key"], ["easebuzz_test_salt", "Test Merchant Salt", "password"],
      ["__section", "TEST — Wire payout credentials"],
      ["easebuzz_test_wire_base", "Test Wire Base URL"],
      ["easebuzz_test_wire_key", "Test Wire Key"], ["easebuzz_test_wire_salt", "Test Wire Salt", "password"],
      ["__section", "LIVE — pay-in Merchant key & salt"],
      ["easebuzz_live_key", "Live Merchant Key"], ["easebuzz_live_salt", "Live Merchant Salt", "password"],
      ["__section", "LIVE — Wire payout credentials"],
      ["easebuzz_live_wire_base", "Live Wire Base URL"],
      ["easebuzz_live_wire_key", "Live Wire Key"], ["easebuzz_live_wire_salt", "Live Wire Salt", "password"],
    ],
    guide: "Easebuzz dashboard for the pay-in Merchant Key + Salt. For payouts use the Wire base URL, key and salt from your Wire onboarding pack. Enter TEST (testpay.easebuzz.in) and LIVE separately — only the Active Environment's keys are used.",
    guideLink: "https://dashboard.easebuzz.in/",
    webhook: "/api/payments/webhooks/easebuzz-callback" },
  { key: "juspay", icon: Coins, title: "Juspay (Pay-in & Payout)", desc: "Hosted payment page + payouts", flag: "juspay_enabled",
    fields: [
      ["juspay_mode", "Active Environment", "select", [["test", "Sandbox / Test"], ["live", "Live"]]],
      ["__section", "TEST / Sandbox — API credentials"],
      ["juspay_test_api_key", "Test API Key", "password"], ["juspay_test_merchant_id", "Test Merchant ID"],
      ["juspay_test_payment_page_client_id", "Test Payment Page Client ID"],
      ["__section", "TEST — Webhook Basic Auth"],
      ["juspay_test_webhook_username", "Test Webhook Username"], ["juspay_test_webhook_password", "Test Webhook Password", "password"],
      ["__section", "LIVE — API credentials"],
      ["juspay_live_api_key", "Live API Key", "password"], ["juspay_live_merchant_id", "Live Merchant ID"],
      ["juspay_live_payment_page_client_id", "Live Payment Page Client ID"],
      ["__section", "LIVE — Webhook Basic Auth"],
      ["juspay_live_webhook_username", "Live Webhook Username"], ["juspay_live_webhook_password", "Live Webhook Password", "password"],
    ],
    guide: "Juspay dashboard for the API Key, Merchant ID and Payment Page Client ID. Configure a webhook using the Basic-auth username/password entered here. Enter Sandbox (sandbox.juspay.in) and Live separately — only the Active Environment's keys are used.",
    guideLink: "https://dashboard.juspay.in/",
    webhook: "/api/payments/webhooks/juspay-payin", webhook2: "/api/payments/webhooks/juspay-payout" },
  { key: "google", icon: Chrome, title: "Google Sign-In", desc: "Social login (OAuth)", flag: null,
    fields: [["google_client_id", "Client ID"], ["google_client_secret", "Client Secret", "password"]] },
  { key: "maps", icon: MapPin, title: "Google Maps", desc: "Live partner tracking on admin map", flag: null,
    fields: [["google_maps_api_key", "Google Maps API Key", "password"]],
    guide: "Google Cloud Console → APIs & Services → Credentials → Create API key. Enable 'Maps JavaScript API' + 'Geocoding API'. Restrict the key to your domain. Paste the key here to activate the live partner map.",
    guideLink: "https://console.cloud.google.com/google/maps-apis/credentials" },
];

function ReferralCard({ onNavigate }) {
  const [f, setF] = useState({ enabled: true, reward_amount: 100, referee_discount: 100 });
  useEffect(() => {
    api.get("/admin/settings").then((r) => { const rf = r.data?.referral || {}; setF({ enabled: rf.enabled !== false, reward_amount: rf.reward_amount ?? 100, referee_discount: rf.referee_discount ?? 100 }); }).catch(() => {});
  }, []);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-referral">
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-xl bg-pink-50 grid place-items-center"><Gift className="h-5 w-5 text-pink-600" /></div>
        <Switch data-testid="intg-toggle-referral" checked={!!f.enabled} onCheckedChange={async (v) => { setF({ ...f, enabled: v }); await api.put("/admin/settings", { referral: { enabled: v } }); toast.success(v ? "Referral enabled" : "Referral disabled"); }} />
      </div>
      <p className="font-heading font-bold text-slate-800 mt-3">Refer &amp; Earn</p>
      <p className="text-sm text-slate-500 flex-1">Friend&apos;s first-booking discount &amp; referrer reward</p>
      <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Earn ₹{f.reward_amount} · Friend gets ₹{f.referee_discount} off</p>
      <p className="text-[11px] text-slate-400 mt-2">Full referral settings (rewards, eligibility, expiry, share-card design) now live in <span className="font-semibold text-slate-600">Growth Center → Referral</span>.</p>
      <Button variant="outline" size="sm" data-testid="intg-config-referral" className="mt-3" onClick={() => onNavigate?.("growth")}><Settings2 className="h-4 w-4 mr-1" /> Open in Growth Center</Button>
    </div>
  );
}

const PAYMENT_GATEWAYS = [
  ["razorpay", "Razorpay"], ["cashfree", "Cashfree Payments"], ["payu", "PayU"],
  ["easebuzz", "Easebuzz"], ["juspay", "Juspay"],
];

function ActiveGatewayCard({ integ, options, onSaved }) {
  const [payin, setPayin] = useState(integ.active_payin_gateway || "razorpay");
  const [payout, setPayout] = useState(integ.active_payout_gateway || "razorpay");
  const [status, setStatus] = useState(null);
  const loadStatus = useCallback(() => {
    api.get("/admin/payments/status").then((r) => setStatus(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    setPayin(integ.active_payin_gateway || "razorpay");
    setPayout(integ.active_payout_gateway || "razorpay");
    loadStatus();
  }, [integ, loadStatus]);

  const save = async (field, value, setter) => {
    setter(value);
    try {
      await api.put("/admin/settings", { integrations: { [field]: value } });
      toast.success("Active gateway updated");
      loadStatus();
      onSaved?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };

  const labels = Object.fromEntries(PAYMENT_GATEWAYS);
  const opts = options || [];
  const sel = "w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300";
  const renderSelect = (value, field, setter, testid) => {
    const inList = opts.some(([v]) => v === value);
    return (
      <PremiumSelect data-testid={testid} className={`${sel} rounded-md`} value={value}
        onChange={(e) => save(field, e.target.value, setter)}>
        {!inList && <option value={value}>{labels[value] || value} · not live</option>}
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </PremiumSelect>
    );
  };
  // Live mode-indicator pill: shows the EXACT environment each direction runs in.
  const modePill = (s, testid) => {
    if (!s) return null;
    const live = s.mode === "live";
    const bad = s.incomplete || (!s.configured && s.enabled);
    const cls = bad ? "bg-red-100 text-red-700"
      : live ? "bg-red-50 text-red-700 border border-red-200"
      : "bg-emerald-50 text-emerald-700 border border-emerald-200";
    return (
      <span data-testid={testid} className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-red-500" : "bg-emerald-500"}`} />
        {live ? "🔴 LIVE MODE" : "🧪 TEST MODE"}
        {!s.configured && <span className="opacity-70">· not live</span>}
      </span>
    );
  };
  return (
    <div className="bg-white rounded-2xl border-2 border-primary-200 p-5 flex flex-col" data-testid="intg-card-active-gateway">
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-xl bg-primary-50 grid place-items-center"><Zap className="h-5 w-5 text-primary-600" /></div>
        <Badge className="bg-primary-100 text-primary-700 border-0 text-[10px]">Router</Badge>
      </div>
      <p className="font-heading font-bold text-slate-800 mt-3">Active Payment Gateway</p>
      <p className="text-sm text-slate-500 flex-1">Only gateways that are <b>enabled &amp; fully keyed</b> appear here — the selected one handles all real pay-in &amp; payout in exactly the mode shown. Others stay idle.</p>
      {status?.payin?.mode === "live" && status?.payin?.configured && (
        <p data-testid="active-live-warning" className="text-[11px] text-red-600 mt-2 font-semibold">⚠ LIVE MODE is active — real customer money will be charged.</p>
      )}
      {opts.length === 0 && (
        <p data-testid="active-gateway-empty" className="text-[11px] text-amber-600 mt-2 font-semibold">No live gateway yet. Enable &amp; configure a gateway (API keys required) — only then it shows up here and processes real payments.</p>
      )}
      <div className="mt-3 space-y-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Pay-in gateway</p>
            {modePill(status?.payin, "active-payin-mode")}
          </div>
          {renderSelect(payin, "active_payin_gateway", setPayin, "active-payin-select")}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Payout gateway</p>
            {modePill(status?.payout, "active-payout-mode")}
          </div>
          {renderSelect(payout, "active_payout_gateway", setPayout, "active-payout-select")}
        </div>
      </div>
    </div>
  );
}

function AgentPayoutConfigCard() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("/admin/settings").then((r) => setCfg(r.data?.agent_config || {
      enabled: true, commission_per_mapping: 20, min_withdrawal: 100, max_withdrawal: 25000,
    })).catch(() => setCfg({ enabled: true, commission_per_mapping: 20, min_withdrawal: 100, max_withdrawal: 25000 }));
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/settings", { agent_config: {
        enabled: !!cfg.enabled,
        commission_per_mapping: Number(cfg.commission_per_mapping) || 0,
        min_withdrawal: Number(cfg.min_withdrawal) || 0,
        max_withdrawal: Number(cfg.max_withdrawal) || 0,
      } });
      toast.success("Agent payout settings saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setSaving(false); }
  };
  if (!cfg) return null;
  const f = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });
  return (
    <div className="bg-white rounded-2xl border border-primary-200 p-5 mb-5" data-testid="agent-payout-config">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary-50 grid place-items-center"><QrCode className="h-5 w-5 text-primary-600" /></div>
          <div>
            <h3 className="font-heading font-bold text-slate-900">Agent Payouts (Physical QR)</h3>
            <p className="text-slate-500 text-xs">Commission a field agent earns per successful QR→merchant mapping, plus withdrawal limits.</p>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-testid="agent-cfg-enabled" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
          <span className="text-slate-600">Enabled</span>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div>
          <label className="text-xs text-slate-500">Payout per mapping (₹)</label>
          <input type="number" min={0} value={cfg.commission_per_mapping} onChange={f("commission_per_mapping")}
            data-testid="agent-cfg-commission"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Min withdrawal (₹)</label>
          <input type="number" min={0} value={cfg.min_withdrawal} onChange={f("min_withdrawal")}
            data-testid="agent-cfg-min"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Max withdrawal (₹)</label>
          <input type="number" min={0} value={cfg.max_withdrawal} onChange={f("max_withdrawal")}
            data-testid="agent-cfg-max"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        </div>
      </div>
      <button onClick={save} disabled={saving} data-testid="agent-cfg-save"
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save agent payout settings
      </button>
    </div>
  );
}


export function IntegrationCenter({ onNavigate }) {
  const [data, setData] = useState(null);
  const [integ, setInteg] = useState({});
  const [configuring, setConfiguring] = useState(null);
  const [commission, setCommission] = useState(null);

  const load = useCallback(() => {
    api.get("/admin/partner-reg/integration-center").then((r) => { setData(r.data); setInteg(r.data.integrations || {}); setCommission(r.data.commission); });
  }, []);
  useEffect(() => { load(); }, [load]);

  // A card is "Connected" only when its essential credentials are actually present.
  const REQ = {
    email: ["smtp_host", "smtp_password"],
    sendgrid: ["sendgrid_api_key", "sendgrid_sender_email"],
    sms: ["fast2sms_api_key"],
    ocr: ["ocr_enabled"],
    ai: ["ai_api_key"],
    s3: ["aws_access_key_id", "aws_secret_access_key", "aws_bucket"],
    razorpay: ["__rzp"],
    cashfree: ["cashfree_pg_app_id", "cashfree_pg_secret_key"],
    payu: ["payu_merchant_key", "payu_salt"],
    easebuzz: ["easebuzz_key", "easebuzz_salt"],
    juspay: ["juspay_api_key", "juspay_merchant_id", "juspay_payment_page_client_id"],
    google: ["google_client_id", "google_client_secret"],
    whatsapp: ["whatsapp_from"],
  };
  const present = (k) => { const v = integ[k]; return v !== undefined && v !== null && String(v).trim() !== ""; };
  // Per-gateway ACTIVE mode + the pay-in fields that mode requires (legacy single
  // fields count ONLY as a TEST fallback — never live), mirroring the backend resolver.
  const GW_KEYS = ["razorpay", "cashfree", "payu", "easebuzz", "juspay"];
  const LEGACY_TEST = {
    cashfree_test_pg_app_id: "cashfree_pg_app_id", cashfree_test_pg_secret_key: "cashfree_pg_secret_key",
    payu_test_merchant_key: "payu_merchant_key", payu_test_salt: "payu_salt",
    easebuzz_test_key: "easebuzz_key", easebuzz_test_salt: "easebuzz_salt",
    juspay_test_api_key: "juspay_api_key", juspay_test_merchant_id: "juspay_merchant_id",
    juspay_test_payment_page_client_id: "juspay_payment_page_client_id",
  };
  const presentC = (k) => present(k) || (LEGACY_TEST[k] && present(LEGACY_TEST[k]));
  const modeOf = (key) => (String(integ[`${key}_mode`] || "test").toLowerCase() === "live" ? "live" : "test");
  const gwPayinReq = (key, mode) => ({
    razorpay: mode === "live" ? ["razorpay_live_key_id", "razorpay_live_key_secret"] : ["razorpay_test_key_id", "razorpay_test_key_secret"],
    cashfree: [`cashfree_${mode}_pg_app_id`, `cashfree_${mode}_pg_secret_key`],
    payu: [`payu_${mode}_merchant_key`, `payu_${mode}_salt`],
    easebuzz: [`easebuzz_${mode}_key`, `easebuzz_${mode}_salt`],
    juspay: [`juspay_${mode}_api_key`, `juspay_${mode}_merchant_id`, `juspay_${mode}_payment_page_client_id`],
  }[key] || []);
  const isConfigured = (card) => {
    if (card.fcm) return data?.fcm_configured;
    if (GW_KEYS.includes(card.key)) {
      // Configured = the ACTIVE mode's own credentials are fully present (no mixing).
      return gwPayinReq(card.key, modeOf(card.key)).every((k) => presentC(k));
    }
    const req = REQ[card.key] || card.fields.map(([k]) => k);
    return req.every((k) => present(k));
  };
  // Toggles that require real API keys before they can be activated.
  const KEY_GUARDED = new Set(["razorpay", "cashfree", "payu", "easebuzz", "juspay", "sms", "s3", "email", "sendgrid", "google", "whatsapp"]);

  const toggleFlag = async (card) => {
    const flag = card?.flag;
    if (!flag) return;
    const turningOn = !integ[flag];
    // Guard: cannot activate a keyed integration until its credentials are saved.
    if (turningOn && KEY_GUARDED.has(card.key) && !isConfigured(card)) {
      toast.error("Configure the API keys first — activation is only available after that");
      setConfiguring(card);
      return;
    }
    const next = { ...integ, [flag]: !integ[flag] };
    setInteg(next);
    await api.put("/admin/settings", { integrations: { [flag]: next[flag] } });
    toast.success(`${next[flag] ? "Enabled" : "Disabled"}`);
  };

  if (!data) return <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>;

  // Active-router options: only gateways that are BOTH enabled AND fully configured.
  const gwCardOf = (key) => CARDS.find((c) => c.key === key);
  const activeGatewayOptions = PAYMENT_GATEWAYS.filter(([v]) => {
    const c = gwCardOf(v);
    return c && !!integ[`${v}_enabled`] && isConfigured(c);
  });

  return (
    <div data-testid="integration-center">
      <div className="flex items-center gap-2 mb-1"><KeyRound className="h-6 w-6 text-primary-600" />
        <h1 className="font-heading font-extrabold text-2xl text-slate-900">Integration Center</h1></div>
      <p className="text-slate-500 text-sm mb-5">All third-party services &amp; system config — each configured independently.</p>

      <AgentPayoutConfigCard />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {CARDS.map((card) => {
          const configured = isConfigured(card);
          const on = card.flag ? !!integ[card.flag] : configured;
          return (
            <div key={card.key} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid={`intg-card-${card.key}`}>
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-xl bg-primary-50 grid place-items-center"><card.icon className="h-5 w-5 text-primary-600" /></div>
                {card.flag ? <Switch data-testid={`intg-toggle-${card.key}`} checked={on} onCheckedChange={() => toggleFlag(card)} />
                  : <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px]">Auto</Badge>}
              </div>
              <p className="font-heading font-bold text-slate-800 mt-3">{card.title}</p>
              <p className="text-sm text-slate-500 flex-1">{card.desc}</p>
              <p className={`text-xs mt-2 flex items-center gap-1 ${configured ? "text-emerald-600" : "text-slate-400"}`}>
                {configured ? <><CheckCircle2 className="h-3.5 w-3.5" /> Connected{card.fcm && data.fcm_project_id ? ` · ${data.fcm_project_id}` : ""}</> : "Not configured"}
              </p>
              {card.key === "s3" && integ.aws_s3_health && (
                (() => {
                  const h = integ.aws_s3_health;
                  const tone = h.ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200";
                  const label = h.ok ? "Storage: S3 connected" : "Storage: S3 error";
                  return <span data-testid="s3-health-badge" className={`mt-1 inline-flex items-center gap-1 w-fit text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tone}`}>
                    {h.ok ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />} {label}
                  </span>;
                })()
              )}
              <Button variant="outline" size="sm" data-testid={`intg-config-${card.key}`} className="mt-3" onClick={() => setConfiguring(card)}>
                <Settings2 className="h-4 w-4 mr-1" /> Configure
              </Button>
            </div>
          );
        })}

        {/* Active gateway router */}
        <ActiveGatewayCard integ={integ} options={activeGatewayOptions} onSaved={load} />

        {/* Commission card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-commission">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 grid place-items-center"><Percent className="h-5 w-5 text-emerald-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Commission &amp; Refund</p>
          <p className="text-sm text-slate-500 flex-1">Commission split &amp; cancellation refund %</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Partner {commission?.partner_pct}% · Platform {commission?.platform_pct}% · Refund {commission?.customer_refund_pct}%</p>
          <Button variant="outline" size="sm" data-testid="intg-config-commission" className="mt-3" onClick={() => setConfiguring({ key: "commission" })}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
        </div>

        {/* Referral Program card */}
        <ReferralCard onNavigate={onNavigate} />

        {/* Payouts & Rewards (moved from Finance) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-payouts">
          <div className="h-10 w-10 rounded-xl bg-blue-50 grid place-items-center"><CreditCard className="h-5 w-5 text-blue-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Payouts &amp; Rewards</p>
          <p className="text-sm text-slate-500 flex-1">Auto-payout &amp; streak bonus automation</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Configurable</p>
          <Button variant="outline" size="sm" data-testid="intg-config-payouts" className="mt-3" onClick={() => onNavigate?.("payout_config")}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
        </div>

        {/* Invoice Configuration (moved from Finance) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-invoice">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 grid place-items-center"><Coins className="h-5 w-5 text-indigo-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Invoice Configuration</p>
          <p className="text-sm text-slate-500 flex-1">Business &amp; invoice details — legal name, GSTIN, address, number series</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Configurable</p>
          <Button variant="outline" size="sm" data-testid="intg-config-invoice" className="mt-3" onClick={() => onNavigate?.("invoice_config")}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
        </div>

        {/* Tax card (multiple taxes) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-tax">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 grid place-items-center"><Coins className="h-5 w-5 text-indigo-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Taxes</p>
          <p className="text-sm text-slate-500 flex-1">Create &amp; manage multiple taxes (GST, cess…)</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Configurable</p>
          <Button variant="outline" size="sm" data-testid="intg-config-tax" className="mt-3" onClick={() => setConfiguring({ key: "tax" })}><Settings2 className="h-4 w-4 mr-1" /> Manage Taxes</Button>
        </div>

        {/* Firebase Settings card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-firebase">
          <div className="h-10 w-10 rounded-xl bg-amber-50 grid place-items-center"><Bell className="h-5 w-5 text-amber-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Firebase Settings</p>
          <p className="text-sm text-slate-500 flex-1">Web push config (FCM) — project, keys &amp; service account</p>
          <p className={`text-xs mt-2 flex items-center gap-1 ${data.fcm_configured || integ.fcm_project_id ? "text-emerald-600" : "text-slate-400"}`}>{data.fcm_configured || integ.fcm_project_id ? <><CheckCircle2 className="h-3.5 w-3.5" /> Connected{integ.fcm_project_id ? ` · ${integ.fcm_project_id}` : ""}</> : "Not configured"}</p>
          <Button variant="outline" size="sm" data-testid="intg-config-firebase" className="mt-3" onClick={() => setConfiguring({ key: "firebase" })}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
        </div>

        {/* Alert Sound & Ring Settings card (applies to every partner) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-alertsound">
          <div className="h-10 w-10 rounded-xl bg-rose-50 grid place-items-center"><Volume2 className="h-5 w-5 text-rose-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Alert Sound &amp; Ring</p>
          <p className="text-sm text-slate-500 flex-1">Partner job-ring tone, custom audio upload, volume &amp; quiet hours</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {data.alert_config?.custom_sound_url ? `Custom audio · ${data.alert_config.custom_sound_name || "uploaded"}` : `Tone · ${TONE_LABELS[data.alert_config?.tone] || "Classic Ring"}`}</p>
          <Button variant="outline" size="sm" data-testid="intg-config-alertsound" className="mt-3" onClick={() => setConfiguring({ key: "alertsound" })}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
        </div>

        {/* Business Settings card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-business">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 grid place-items-center"><Settings2 className="h-5 w-5 text-emerald-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Business Settings</p>
          <p className="text-sm text-slate-500 flex-1">Visiting charge, min amount, serviceable distance &amp; time zone</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Configurable</p>
          <Button variant="outline" size="sm" data-testid="intg-config-business" className="mt-3" onClick={() => setConfiguring({ key: "business" })}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
        </div>

        {/* Languages card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-languages">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 grid place-items-center"><Globe className="h-5 w-5 text-indigo-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Languages</p>
          <p className="text-sm text-slate-500 flex-1">Manage languages (with code) shown in provider profile selects</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Configurable</p>
          <Button variant="outline" size="sm" data-testid="intg-config-languages" className="mt-3" onClick={() => setConfiguring({ key: "languages" })}><Settings2 className="h-4 w-4 mr-1" /> Manage</Button>
        </div>

        {/* Wallet & Withdrawal Rules card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid="intg-card-wallet">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 grid place-items-center"><Wallet className="h-5 w-5 text-emerald-600" /></div>
          <p className="font-heading font-bold text-slate-800 mt-3">Wallet &amp; Withdrawal Rules</p>
          <p className="text-sm text-slate-500 flex-1">Min/max withdrawal, processing fee, methods &amp; frequency</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Configurable</p>
          <Button variant="outline" size="sm" data-testid="intg-config-wallet" className="mt-3" onClick={() => setConfiguring({ key: "wallet" })}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
        </div>

        {/* Education & Experience shortcuts */}
        {[["educations", "Education Options", GraduationCap, "reg_education"], ["experiences", "Experience Options", Award, "reg_experience"]].map(([k, label, Ic, nav]) => (
          <div key={k} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col" data-testid={`intg-card-${k}`}>
            <div className="h-10 w-10 rounded-xl bg-amber-50 grid place-items-center"><Ic className="h-5 w-5 text-amber-600" /></div>
            <p className="font-heading font-bold text-slate-800 mt-3">{label}</p>
            <p className="text-sm text-slate-500 flex-1">Master list shown to partners</p>
            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {data.counts[k]} options</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => onNavigate?.(nav)}><Settings2 className="h-4 w-4 mr-1" /> Manage</Button>
          </div>
        ))}
      </div>

      {configuring && configuring.key === "commission" && (
        <CommissionModal commission={commission} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />
      )}
      {configuring && configuring.key === "tax" && (
        <TaxModal onClose={() => setConfiguring(null)} />
      )}
      {configuring && configuring.key === "apikeys" && (
        <ApiKeysModal integ={integ} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />
      )}
      {configuring && configuring.key === "firebase" && (
        <FirebaseModal integ={integ} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />
      )}
      {configuring && configuring.key === "business" && (
        <BusinessModal biz={data.business_config || {}} defaultEmergencyFee={data.emergency_fee} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />
      )}
      {configuring && configuring.key === "languages" && (
        <LanguagesModal onClose={() => setConfiguring(null)} />
      )}
      {configuring && configuring.key === "wallet" && (
        <WalletRulesModal onClose={() => setConfiguring(null)} />
      )}
      {configuring && configuring.key === "alertsound" && (
        <AlertSoundModal cfg={data.alert_config || {}} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />
      )}
      {configuring && !["commission", "tax", "apikeys", "firebase", "business", "languages", "wallet", "alertsound"].includes(configuring.key) && (
        <ConfigModal card={configuring} integ={integ} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />
      )}
    </div>
  );
}

function ConfigModal({ card, integ, onClose, onSaved }) {
  const [f, setF] = useState(() => Object.fromEntries(card.fields.map(([k]) => [k, integ[k] ?? ""])));
  const [saJson, setSaJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);
  const [smsPhone, setSmsPhone] = useState("");
  const [smsTesting, setSmsTesting] = useState(false);
  const [smsResult, setSmsResult] = useState(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const backend = process.env.REACT_APP_BACKEND_URL || "";
  const webhookUrl = card.webhook ? `${backend}${card.webhook}` : "";
  const set = (k, v) => { setF((o) => ({ ...o, [k]: v })); setTestResult(null); };
  const runTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const payload = Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith("__")));
      const { data } = await api.post("/admin/integrations/s3-test", payload);
      setTestResult(data);
      if (data.ok) toast.success(data.repaired_refs > 0
        ? `S3 connected — images will display on your site (fixed ${data.repaired_refs} link${data.repaired_refs > 1 ? "s" : ""})`
        : "S3 connected — images will display on your site");
      else toast.error(data.error || "S3 connection failed");
    } catch (e) {
      setTestResult({ ok: false, steps: [], error: e?.response?.data?.detail || "Test failed" });
      toast.error("S3 connection test failed");
    } finally { setTesting(false); }
  };
  const runSmsTest = async () => {
    const digits = (smsPhone || "").replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) { toast.error("Enter a valid 10-digit mobile number"); return; }
    setSmsTesting(true); setSmsResult(null);
    try {
      const { data } = await api.post("/admin/integrations/sms-test", { phone: digits });
      setSmsResult(data);
      if (data.ok) toast.success("Test OTP sent — check the phone");
      else toast.error(data.message || data.error || "Gateway rejected the request");
    } catch (e) {
      const msg = e?.response?.data?.detail || "SMS test failed";
      setSmsResult({ ok: false, error: msg });
      toast.error(msg);
    } finally { setSmsTesting(false); }
  };
  const runEmailTest = async () => {
    const to = (emailTo || "").trim();
    if (!to || !to.includes("@")) { toast.error("Enter a valid recipient email"); return; }
    setEmailTesting(true); setEmailResult(null);
    try {
      // Send using the CURRENTLY-EDITED form values so config can be verified
      // before (or right after) saving.
      const config = Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith("__")));
      if (card.provider) config.email_provider = card.provider;
      const { data } = await api.post("/admin/integrations/email-test", { to_email: to, config });
      setEmailResult(data);
      if (data.ok) toast.success(`Test email sent to ${to}`);
      else toast.error(data.error || "Email test failed");
    } catch (e) {
      const msg = e?.response?.data?.detail || "Email test failed";
      setEmailResult({ ok: false, error: msg });
      toast.error(msg);
    } finally { setEmailTesting(false); }
  };
  const runMigrate = async () => {    setMigrating(true); setMigrateResult(null);
    try {
      const { data } = await api.post("/admin/integrations/s3-migrate");
      setMigrateResult(data);
      if (data.ok) toast.success(`Migrated ${data.migrated} file(s) to S3 · ${data.updated_refs} reference(s) updated`);
      else if (data.needs_public) toast.warning("Make the bucket public before migrating");
      else toast.error(data.error || `Migration finished with ${(data.errors || []).length} error(s)`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Migration failed");
    } finally { setMigrating(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      // strip UI-only section markers before saving
      const payload = Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith("__")));
      if (card.provider) { payload.email_provider = card.provider; payload.email_enabled = true; }
      // Razorpay: Test & Live both supported. Payout (RazorpayX) follows the active
      // pay-in mode with its own per-mode fields (never mixed).
      if (card.key === "razorpay") {
        if (!payload.razorpay_mode) payload.razorpay_mode = "test";
        const m = String(payload.razorpay_mode).toLowerCase() === "live" ? "live" : "test";
        const kid = m === "live" ? payload.razorpay_live_key_id : payload.razorpay_test_key_id;
        const ksec = m === "live" ? payload.razorpay_live_key_secret : payload.razorpay_test_key_secret;
        payload.razorpayx_mode = m;
        payload.razorpayx_key_id = kid;
        payload.razorpayx_key_secret = ksec;
        payload[`razorpayx_${m}_key_id`] = kid;
        payload[`razorpayx_${m}_key_secret`] = ksec;
        payload[`razorpayx_${m}_account_number`] = payload.razorpayx_account_number;
        payload[`razorpayx_${m}_webhook_secret`] = payload.razorpayx_webhook_secret;
        payload.razorpayx_enabled = !!(String(ksec || "").trim() && String(payload.razorpayx_account_number || "").trim());
      }
      // New gateways: auto-enable ONLY when the ACTIVE mode's essential keys are present
      // (so we never send enabled=true with an incomplete active mode → backend 400).
      const GW_MODE_REQ = {
        cashfree: (m) => [`cashfree_${m}_pg_app_id`, `cashfree_${m}_pg_secret_key`],
        payu: (m) => [`payu_${m}_merchant_key`, `payu_${m}_salt`],
        easebuzz: (m) => [`easebuzz_${m}_key`, `easebuzz_${m}_salt`],
        juspay: (m) => [`juspay_${m}_api_key`, `juspay_${m}_merchant_id`, `juspay_${m}_payment_page_client_id`],
      };
      if (GW_MODE_REQ[card.key]) {
        const m = String(payload[`${card.key}_mode`] || "test").toLowerCase() === "live" ? "live" : "test";
        const has = (k) => String(payload[k] ?? f[k] ?? "").trim() !== "";
        payload[`${card.key}_enabled`] = GW_MODE_REQ[card.key](m).every(has);
      }
      await api.put("/admin/settings", { integrations: payload });
      if (card.fcm && saJson.trim()) {
        const { data } = await api.put("/admin/partner-reg/fcm-config", { service_account_json: saJson });
        toast.success(`FCM configured: ${data.project_id}`);
      }
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden" data-testid={`intg-modal-${card.key}`}>
        <DialogHeader><DialogTitle className="flex items-center gap-2 min-w-0"><card.icon className="h-5 w-5 text-primary-600 shrink-0" /> <span className="truncate">Configure {card.title}</span></DialogTitle></DialogHeader>
        <div className="space-y-3 min-w-0">
          {card.fields.map(([k, label, type, options]) => (
            k === "__section"
              ? <p key={label} className="text-[11px] uppercase tracking-wider font-bold text-primary-600 pt-2 border-b border-slate-100 pb-1">{label}</p>
              : type === "select"
                ? <L key={k} label={label}>
                    <PremiumSelect value={f[k] || (options?.[0]?.[0] ?? "")} onChange={(e) => set(k, e.target.value)}
                      className="w-full rounded-md">
                      {(options || []).map(([ov, ol]) => <option key={ov} value={ov}>{ol}</option>)}
                    </PremiumSelect>
                  </L>
                : <L key={k} label={label}><Input type={type || "text"} value={f[k]} onChange={(e) => set(k, e.target.value)} /></L>
          ))}
          {card.fcm && (
            <>
              <p className="text-xs text-slate-400">Also set the public web config (apiKey/authDomain/projectId/etc.) — for MVP these can go into the VAPID/web fields via API. Paste the service-account JSON below:</p>
              <L label="Service Account JSON (encrypted at rest)">
                <textarea data-testid="intg-fcm-sa" value={saJson} onChange={(e) => setSaJson(e.target.value)} rows={4}
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono focus:outline-none focus:border-primary-400" placeholder="Paste Firebase service-account JSON…" />
              </L>
            </>
          )}
        </div>
        {(card.guide || card.webhook) && (
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-2 min-w-0" data-testid={`intg-guide-${card.key}`}>
            {card.guide && (
              <p className="text-xs text-slate-600 leading-relaxed">
                <span className="font-bold text-blue-700">Setup guide: </span>{card.guide}
                {card.guideLink && <> {" "}<a href={card.guideLink} target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium">Open dashboard →</a></>}
              </p>
            )}
            {card.webhook && (
              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">{card.webhook2 ? "Pay-in webhook (refund.* events)" : "Webhook URL — paste this in the provider dashboard"}</p>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="flex-1 min-w-0 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 truncate" data-testid={`intg-webhook-${card.key}`}>{webhookUrl}</code>
                  <Button type="button" size="sm" variant="outline" data-testid={`intg-webhook-copy-${card.key}`}
                    onClick={() => { navigator.clipboard?.writeText(webhookUrl); toast.success("Webhook URL copied"); }}>Copy</Button>
                </div>
              </div>
            )}
            {card.webhook2 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Payout webhook (payout.* events)</p>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="flex-1 min-w-0 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 truncate" data-testid={`intg-webhook2-${card.key}`}>{`${backend}${card.webhook2}`}</code>
                  <Button type="button" size="sm" variant="outline" data-testid={`intg-webhook2-copy-${card.key}`}
                    onClick={() => { navigator.clipboard?.writeText(`${backend}${card.webhook2}`); toast.success("Payout webhook URL copied"); }}>Copy</Button>
                </div>
              </div>
            )}
          </div>
        )}
        {card.key === "sms" && (
          <div className="mt-3 space-y-2" data-testid="sms-test-block">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Send a test OTP</p>
            <div className="flex items-center gap-2">
              <Input value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} placeholder="10-digit mobile number" data-testid="sms-test-phone" className="flex-1" />
              <Button type="button" variant="outline" className="border-primary-200 text-primary-700 hover:bg-primary-50 shrink-0"
                data-testid="sms-test-btn" onClick={runSmsTest} disabled={smsTesting}>
                {smsTesting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />} Send test
              </Button>
            </div>
            {smsResult && (
              <div className={`rounded-xl border overflow-hidden text-xs ${smsResult.ok ? "border-emerald-200" : "border-rose-200"}`} data-testid="sms-test-result">
                <div className={`flex items-center gap-2 px-3 py-2 font-bold ${smsResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {smsResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {smsResult.ok ? `Test OTP sent (route: ${smsResult.route})` : "Gateway rejected"}
                </div>
                <div className="p-3 bg-white space-y-1">
                  <p className="text-slate-600 break-words">{smsResult.message || smsResult.error}</p>
                  {smsResult.response && <pre className="text-[10px] bg-slate-50 rounded p-2 overflow-x-auto text-slate-500">{JSON.stringify(smsResult.response, null, 1)}</pre>}
                </div>
              </div>
            )}
          </div>
        )}
        {(card.key === "email" || card.key === "sendgrid") && (
          <div className="mt-3 space-y-2" data-testid="email-test-block">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Send a test email</p>
            <div className="flex items-center gap-2">
              <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="you@example.com" data-testid="email-test-to" className="flex-1" />
              <Button type="button" variant="outline" className="border-primary-200 text-primary-700 hover:bg-primary-50 shrink-0"
                data-testid="email-test-btn" onClick={runEmailTest} disabled={emailTesting}>
                {emailTesting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />} Send test
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">Tip: Gmail/Workspace me normal password nahi — 2-Step Verification on karke <b>App Password</b> banayein aur wahi Password field me daalein. Save karke test karein.</p>
            {emailResult && (
              <div className={`rounded-xl border overflow-hidden text-xs ${emailResult.ok ? "border-emerald-200" : "border-rose-200"}`} data-testid="email-test-result">
                <div className={`flex items-center gap-2 px-3 py-2 font-bold ${emailResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {emailResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {emailResult.ok ? `Test email sent (${emailResult.provider})` : "Email failed"}
                </div>
                <div className="p-3 bg-white space-y-1">
                  <p className="text-slate-600 break-words">{emailResult.message || emailResult.error}</p>
                  {emailResult.hint && <p className="text-amber-700 break-words">{emailResult.hint}</p>}
                </div>
              </div>
            )}
          </div>
        )}
        {card.test === "s3" && (
          <div className="mt-3 space-y-2" data-testid="s3-test-block">
            {testResult && (
              <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid="s3-test-result">
                <div className={`flex items-center gap-2 px-3 py-2 text-xs font-bold ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {testResult.ok ? "Connection healthy" : "Connection failed"}
                  {testResult.bucket && <span className="ml-auto font-medium text-slate-400 truncate max-w-[45%]">{testResult.bucket} · {testResult.region}</span>}
                </div>
                <div className="p-3 space-y-2 bg-white">
                  {(testResult.steps || []).map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs leading-snug">
                      {s.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />}
                      <span className="min-w-0 break-words"><span className="font-semibold text-slate-700">{s.label}:</span> <span className="text-slate-500">{s.detail}</span></span>
                    </div>
                  ))}
                  {testResult.error && (!testResult.steps || testResult.steps.length === 0) && (
                    <div className="flex items-start gap-2 text-xs"><X className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" /><span className="text-rose-700 break-words">{testResult.error}</span></div>
                  )}
                  {testResult.ok && testResult.repaired_refs > 0 && (
                    <p className="text-[11px] text-emerald-600 font-medium pt-0.5">Fixed {testResult.repaired_refs} existing image link(s) to display via secure proxy.</p>
                  )}
                </div>
              </div>
            )}
            <Button type="button" variant="outline" className="w-full border-primary-200 text-primary-700 hover:bg-primary-50"
              data-testid="s3-test-btn" onClick={runTest} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />} Test Connection
            </Button>
            {testResult?.ok && (
              <>
                <Button type="button" className="w-full bg-slate-800 hover:bg-slate-900 text-white"
                  data-testid="s3-migrate-btn" onClick={runMigrate} disabled={migrating}>
                  {migrating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />} Migrate local files to S3
                </Button>
                <p className="text-[11px] text-slate-400 leading-snug">Moves every file currently stored on the server into this bucket and re-points all references. Images keep displaying via the secure proxy.</p>
              </>
            )}
            {migrateResult && (
              <div className={`rounded-xl border p-3 text-xs space-y-1 ${migrateResult.ok ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`} data-testid="s3-migrate-result">
                {migrateResult.ok ? (
                  <p className="font-semibold text-slate-700">Migrated {migrateResult.migrated}/{migrateResult.total} file(s) · {migrateResult.updated_refs} reference(s) updated · {migrateResult.removed_local} local file(s) removed</p>
                ) : (
                  <p className="font-semibold text-amber-700 break-words">{migrateResult.error || "Migration could not complete."}</p>
                )}
                {(migrateResult.errors || []).map((er, i) => <p key={i} className="text-rose-600 break-words">{er}</p>)}
                {migrateResult.ok && migrateResult.migrated === 0 && (migrateResult.errors || []).length === 0 && <p className="text-slate-500">No local files to migrate — everything is already on S3.</p>}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="intg-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommissionModal({ commission, onClose, onSaved }) {
  const init = {
    platform_pct: commission?.platform_pct ?? 32,
    partner_pct: commission?.partner_pct ?? 60,
    merchant_partner_referral_pct: commission?.merchant_partner_referral_pct ?? 5,
    merchant_customer_pct: commission?.merchant_customer_pct ?? 3,
    customer_refund_pct: commission?.customer_refund_pct ?? 80,
    partner_cancellation_pct: commission?.partner_cancellation_pct ?? 20,
  };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState([]);
  useEffect(() => {
    api.get("/admin/settings").then((r) => setReasons(r.data?.cancellation_reasons || [])).catch(() => {});
  }, []);
  const set = (k, v) => setF((o) => ({ ...o, [k]: Number(v) || 0 }));
  const setReason = (i, v) => setReasons((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addReason = () => setReasons((o) => [...o, ""]);
  const removeReason = (i) => setReasons((o) => o.filter((_, idx) => idx !== i));

  const commFields = [
    ["partner_pct", "Partner Commission %"],
    ["platform_pct", "Platform Commission %"],
    ["merchant_partner_referral_pct", "Merchant · Partner Referral %"],
    ["merchant_customer_pct", "Merchant · Customer %"],
  ];
  const commTotal = commFields.reduce((s, [k]) => s + (Number(f[k]) || 0), 0);
  const cancTotal = (Number(f.customer_refund_pct) || 0) + (Number(f.partner_cancellation_pct) || 0);
  const commOk = Math.abs(commTotal - 100) < 0.01;
  const cancOk = Math.abs(cancTotal - 100) < 0.01;

  const save = async () => {
    if (!commOk) return toast.error("Commission split must total 100%");
    if (!cancOk) return toast.error("Cancellation split must total 100%");
    setBusy(true);
    try {
      await api.put("/admin/settings", { commission: f, cancellation_reasons: reasons.map((r) => r.trim()).filter(Boolean) });
      toast.success("Commission & refund settings saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto" data-testid="intg-modal-commission">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-emerald-600" /> Commission &amp; Refund Settings</DialogTitle></DialogHeader>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">Commission Split <span className="font-normal text-slate-400">(of service cost, GST excluded)</span></p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${commOk ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`} data-testid="comm-total">Total {commTotal}%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            {commFields.map(([k, label]) => <L key={k} label={label}><Input type="number" data-testid={`comm-${k}`} value={f[k] ?? 0} onChange={(e) => set(k, e.target.value)} /></L>)}
          </div>
          {!commOk && <p className="text-xs text-rose-600 mt-1">Must total 100%. Platform absorbs any commission a merchant is not eligible for.</p>}

          {/* Live split simulator — on a ₹100 service (GST excluded) */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-testid="commission-simulator">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-600">Live split preview</p>
              <span className="text-[11px] text-slate-400">on a <b className="text-slate-600">₹100</b> service (GST excluded)</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full mb-2.5 bg-slate-200" data-testid="sim-bar">
              <div style={{ width: `${Math.max(0, Number(f.partner_pct) || 0)}%` }} className="bg-emerald-500 transition-all duration-300" />
              <div style={{ width: `${Math.max(0, Number(f.platform_pct) || 0)}%` }} className="bg-blue-600 transition-all duration-300" />
              <div style={{ width: `${Math.max(0, Number(f.merchant_partner_referral_pct) || 0)}%` }} className="bg-amber-500 transition-all duration-300" />
              <div style={{ width: `${Math.max(0, Number(f.merchant_customer_pct) || 0)}%` }} className="bg-violet-500 transition-all duration-300" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
              {[["bg-emerald-500", "Partner", f.partner_pct, "sim-partner"],
                ["bg-blue-600", "Platform", f.platform_pct, "sim-platform"],
                ["bg-amber-500", "Merchant · Partner Referral", f.merchant_partner_referral_pct, "sim-mref"],
                ["bg-violet-500", "Merchant · Customer", f.merchant_customer_pct, "sim-mcust"]].map(([c, label, val, tid]) => (
                <span key={tid} data-testid={tid} className="flex items-center gap-1.5 text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-sm shrink-0 ${c}`} />
                  <span className="truncate">{label}</span>
                  <b className="ml-auto tabular-nums text-slate-800">₹{Number(val) || 0}</b>
                </span>
              ))}
            </div>
            <p className="text-[10.5px] text-slate-400 mt-2.5 leading-snug">Partner always earns their %. If a merchant referral isn&apos;t applicable, that ₹ share is absorbed by Platform.</p>
          </div>
        </div>

        <div className="space-y-1 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">Cancellation &amp; Refund <span className="font-normal text-slate-400">(before work starts)</span></p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cancOk ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`} data-testid="canc-total">Total {cancTotal}%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <L label="Customer Refund %"><Input type="number" data-testid="comm-customer_refund_pct" value={f.customer_refund_pct ?? 0} onChange={(e) => set("customer_refund_pct", e.target.value)} /></L>
            <L label="Partner Cancellation %"><Input type="number" data-testid="comm-partner_cancellation_pct" value={f.partner_cancellation_pct ?? 0} onChange={(e) => set("partner_cancellation_pct", e.target.value)} /></L>
          </div>
          {!cancOk && <p className="text-xs text-rose-600 mt-1">Customer Refund % + Partner Cancellation % must total 100%.</p>}
        </div>

        <div className="space-y-2 pt-3 border-t border-slate-100" data-testid="cancel-reasons-editor">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">Cancellation Reasons <span className="font-normal text-slate-400">(shown to customers)</span></p>
            <Button type="button" variant="outline" size="sm" data-testid="add-cancel-reason" onClick={addReason}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
          </div>
          <p className="text-xs text-slate-400">Customers pick one of these when cancelling. An &quot;Other&quot; free-text option is always added automatically.</p>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {reasons.length === 0 && <p className="text-xs text-slate-400 italic">No reasons yet — add a few so customers can pick one.</p>}
            {reasons.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input data-testid={`cancel-reason-input-${i}`} value={r} onChange={(e) => setReason(i, e.target.value)} placeholder={`Reason ${i + 1}`} />
                <Button type="button" variant="ghost" size="icon" className="text-rose-500 shrink-0" data-testid={`remove-cancel-reason-${i}`} onClick={() => removeReason(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !commOk || !cancOk} className="bg-emerald-600 hover:bg-emerald-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const L = ({ label, children }) => <div className="min-w-0"><label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>{children}</div>;

function TaxModal({ onClose }) {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: "", percentage: "", applies_to: "services", status: "active" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.get("/admin/collection/taxes").then((r) => setRows(r.data)); }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!f.name.trim() || f.percentage === "") return toast.error("Name and % required");
    setBusy(true);
    try { await api.post("/admin/collection/taxes", { ...f, percentage: Number(f.percentage) }); toast.success("Tax added"); setF({ name: "", percentage: "", applies_to: "services", status: "active" }); load(); }
    catch { toast.error("Failed"); } finally { setBusy(false); }
  };
  const toggle = async (t) => { await api.put(`/admin/collection/taxes/${t.id}`, { ...t, status: t.status === "active" ? "inactive" : "active" }); load(); };
  const del = async (t) => { await api.delete(`/admin/collection/taxes/${t.id}`); toast.success("Deleted"); load(); };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="intg-modal-tax">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-indigo-600" /> Manage Taxes</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end bg-slate-50 rounded-xl p-3">
          <L label="Name"><Input data-testid="tax-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="GST" /></L>
          <L label="Percentage"><Input data-testid="tax-pct" type="number" value={f.percentage} onChange={(e) => setF({ ...f, percentage: e.target.value })} placeholder="18" /></L>
          <L label="Applies To"><PremiumSelect value={f.applies_to} onChange={(e) => setF({ ...f, applies_to: e.target.value })} className="w-full h-10 rounded-md border border-slate-200 px-2 text-sm">
            <option value="services">Services</option><option value="spare_parts">Spare Parts</option><option value="all">All</option></PremiumSelect></L>
          <Button data-testid="tax-add" onClick={add} disabled={busy} className="bg-primary-700 hover:bg-primary-800 h-10"><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
        <div className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {rows.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">No taxes yet.</p>}
          {rows.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3" data-testid={`tax-row-${t.id}`}>
              <div><span className="font-medium text-slate-800">{t.name} · {t.percentage}%</span><span className="text-xs text-slate-400 ml-2">{t.applies_to}</span></div>
              <div className="flex items-center gap-3">
                <Switch checked={t.status === "active"} onCheckedChange={() => toggle(t)} />
                <button onClick={() => del(t)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}


function CopyRow({ label, value, hint }) {
  const copy = () => { navigator.clipboard?.writeText(value || ""); toast.success("Copied"); };
  return (
    <L label={label}>
      <div className="flex items-stretch gap-2">
        <Input readOnly value={value || ""} className="bg-slate-50 font-mono text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0"><Copy className="h-4 w-4" /></Button>
      </div>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </L>
  );
}

function ApiKeysModal({ integ, onClose, onSaved }) {
  const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const [f, setF] = useState({ google_maps_key: integ.google_maps_key || "", google_places_key: integ.google_places_key || "" });
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState({});
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { await api.put("/admin/settings", { integrations: f }); toast.success("API keys saved"); onSaved(); }
    catch { toast.error("Save failed"); } finally { setBusy(false); }
  };
  const KeyField = ({ k, label }) => (
    <L label={label}>
      <div className="flex items-stretch gap-2">
        <Input type={show[k] ? "text" : "password"} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder="Paste API key" />
        <Button type="button" variant="outline" size="sm" onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} className="shrink-0"><Eye className="h-4 w-4" /></Button>
      </div>
    </L>
  );
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="intg-modal-apikeys">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-sky-600" /> Api Key Settings</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm font-bold text-primary-700">Client API Keys</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <CopyRow label="API link for Customer App" value={`${base}/api`} hint="Use this as the API base in the customer app." />
            <CopyRow label="API link for Provider App" value={`${base}/api`} hint="Use this as the API base in the provider app." />
          </div>
          <p className="text-sm font-bold text-primary-700 pt-2">Google API keys</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <KeyField k="google_maps_key" label="Google API key for Map" />
            <KeyField k="google_places_key" label="Google API key for Places" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="apikeys-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save changes</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FB_FIELDS = [
  ["fcm_api_key", "apiKey"], ["fcm_auth_domain", "authDomain"],
  ["fcm_project_id", "projectId"], ["fcm_storage_bucket", "storageBucket"],
  ["fcm_messaging_sender_id", "messagingSenderId"], ["fcm_app_id", "appId"],
  ["fcm_measurement_id", "measurementId"], ["fcm_vapid_key", "vapidKey"],
];

function FirebaseModal({ integ, onClose, onSaved }) {
  const [f, setF] = useState(Object.fromEntries(FB_FIELDS.map(([k]) => [k, integ[k] || ""])));
  const [saJson, setSaJson] = useState("");
  const [saName, setSaName] = useState("");
  const [saStatus, setSaStatus] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [gsJson, setGsJson] = useState("");
  const [gsName, setGsName] = useState("");
  const [gsStatus, setGsStatus] = useState(null);
  const [gsDownloading, setGsDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  useEffect(() => {
    api.get("/admin/partner-reg/fcm-config").then((r) => setSaStatus(r.data)).catch(() => {});
    api.get("/admin/partner-reg/fcm-config/google-services").then((r) => setGsStatus(r.data)).catch(() => {});
  }, []);
  // Parse an uploaded google-services.json → auto-fill the web-push config fields.
  const onGsFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGsName(file.name);
    const r = new FileReader();
    r.onload = () => {
      const txt = String(r.result || "");
      setGsJson(txt);
      try {
        const gs = JSON.parse(txt);
        const pinfo = gs.project_info || {};
        const clients = gs.client || [];
        const chosen = clients.find((c) => c?.client_info?.android_client_info?.package_name === "app.azoapp.homeservice") || clients[0] || {};
        const apiKey = chosen?.api_key?.[0]?.current_key || "";
        const appId = chosen?.client_info?.mobilesdk_app_id || "";
        const pid = pinfo.project_id || "";
        setF((o) => ({
          ...o,
          fcm_api_key: apiKey || o.fcm_api_key,
          fcm_project_id: pid || o.fcm_project_id,
          fcm_auth_domain: pid ? `${pid}.firebaseapp.com` : o.fcm_auth_domain,
          fcm_storage_bucket: pinfo.storage_bucket || o.fcm_storage_bucket,
          fcm_messaging_sender_id: pinfo.project_number || o.fcm_messaging_sender_id,
          fcm_app_id: appId || o.fcm_app_id,
        }));
        toast.success("google-services.json parsed — web config auto-filled");
      } catch { toast.error("That file is not a valid google-services.json"); }
    };
    r.readAsText(file);
  };
  const downloadGs = async () => {
    setGsDownloading(true);
    try {
      const res = await api.get("/admin/partner-reg/fcm-config/google-services/download", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "google-services.json";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Could not download google-services.json"); }
    finally { setGsDownloading(false); }
  };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaName(file.name);
    const r = new FileReader();
    r.onload = () => setSaJson(String(r.result || ""));
    r.readAsText(file);
  };
  const downloadSa = async () => {
    setDownloading(true);
    try {
      const res = await api.get("/admin/partner-reg/fcm-config/download", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = (saStatus && saStatus.filename) || "firebase-service-account.json";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Could not download service account"); }
    finally { setDownloading(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      // Also persist the canonical nested shape the push-config endpoint reads
      // (fcm_web_config + fcm_vapid_key) so web-push works regardless of which
      // admin screen was used to enter the credentials.
      const web_config = {};
      FB_FIELDS.forEach(([k, label]) => { if (label !== "vapidKey") web_config[label] = f[k] || ""; });
      await api.put("/admin/settings", {
        integrations: {
          ...f,
          fcm_web_config: web_config,
          fcm_vapid_key: f.fcm_vapid_key || "",
          fcm_enabled: true,
        },
      });
      if (saJson.trim()) {
        try {
          const { data } = await api.put("/admin/partner-reg/fcm-config", { service_account_json: saJson });
          toast.success(`Service account saved: ${data.project_id || "ok"}`);
        } catch (err) {
          // Surface the actual backend detail so the admin knows WHY the JSON
          // was rejected (BOM, missing field, bad private_key, wrong project, etc.).
          const msg = err?.response?.data?.detail || err?.message || "Service account JSON invalid";
          toast.error(msg, { duration: 6000 });
          return; // don't show the generic "Firebase settings saved" success below
        }
      }
      if (gsJson.trim()) {
        try {
          const { data } = await api.put("/admin/partner-reg/fcm-config/google-services", { google_services_json: gsJson, package_name: "app.azoapp.homeservice" });
          toast.success(`google-services.json saved: ${data.project_id || "ok"}`);
          setGsStatus({ configured: true, project_id: data.project_id, packages: data.packages, updated_at: new Date().toISOString() });
        } catch (err) {
          const msg = err?.response?.data?.detail || err?.message || "google-services.json invalid";
          toast.error(msg, { duration: 6000 });
          return;
        }
      }
      toast.success("Firebase settings saved"); onSaved();
    } catch { toast.error("Save failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="intg-modal-firebase">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-600" /> Firebase Settings</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-400 -mt-2">Web push config for browser & app notifications (with or without image, and scheduled).</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          {FB_FIELDS.map(([k, label]) => (
            <L key={k} label={<span>{label}<span className="text-red-500"> *</span></span>}>
              <Input data-testid={`fb-${k}`} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={label} />
            </L>
          ))}
        </div>
        <div className="mt-3">
          <L label="Service Account JSON (for server-side push, encrypted at rest)">
            {saStatus && saStatus.configured && !saJson && (
              <div data-testid="fb-sa-existing" className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-800 truncate">Service account already uploaded</p>
                    <p className="text-[11px] text-emerald-700/80 truncate">Project: {saStatus.project_id || "—"} · updated {saStatus.updated_at ? new Date(saStatus.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" data-testid="fb-sa-download" onClick={downloadSa} disabled={downloading} className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-1" /> Download</>}
                </Button>
              </div>
            )}
            <input type="file" accept="application/json,.json" onChange={onFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium" />
            <p className="text-[11px] text-slate-400 mt-1">{saStatus && saStatus.configured ? "Choose a new file only if you want to replace the current one." : "No file uploaded yet."}</p>
          </L>
          {saJson && <p className="text-[11px] text-emerald-600 mt-1">New service account file loaded: {saName} ({saJson.length} chars).</p>}
        </div>
        <div className="mt-3">
          <L label="google-services.json (Android app config — auto-fills the web config above)">
            {gsStatus && gsStatus.configured && !gsJson && (
              <div data-testid="fb-gs-existing" className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-blue-800 truncate">google-services.json uploaded</p>
                    <p className="text-[11px] text-blue-700/80 truncate">Project: {gsStatus.project_id || "—"} · {(gsStatus.packages || []).join(", ") || "—"}</p>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" data-testid="fb-gs-download" onClick={downloadGs} disabled={gsDownloading} className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100">
                  {gsDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-1" /> Download</>}
                </Button>
              </div>
            )}
            <input type="file" accept="application/json,.json" data-testid="fb-gs-file" onChange={onGsFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium" />
            <p className="text-[11px] text-slate-400 mt-1">This is the Firebase Android config (not the service account). The mobile app bundles it at build time; uploading here keeps it on record and auto-fills the web-push fields.</p>
          </L>
          {gsJson && <p className="text-[11px] text-blue-600 mt-1">New google-services.json loaded: {gsName} ({gsJson.length} chars).</p>}
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="firebase-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save changes</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Karachi", "Asia/Dhaka", "Asia/Kathmandu", "UTC", "America/New_York", "Europe/London"];

function AlertSoundModal({ cfg, onClose, onSaved }) {
  const [f, setF] = useState({
    tone: cfg.tone || "classic",
    volume: cfg.volume ?? 0.7,
    dnd_enabled: !!cfg.dnd_enabled,
    dnd_start: cfg.dnd_start || "22:00",
    dnd_end: cfg.dnd_end || "07:00",
    custom_sound_url: cfg.custom_sound_url || "",
    custom_sound_name: cfg.custom_sound_name || "",
  });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("folder", "alerts");
      const { data } = await api.post("/media/upload-audio", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setF((o) => ({ ...o, custom_sound_url: data.url, custom_sound_name: file.name }));
      toast.success("Audio uploaded — press Test to hear it");
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/settings", { alert_config: f });
      toast.success("Alert sound settings saved — applies to all partners"); onSaved();
    } catch { toast.error("Save failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto" data-testid="intg-modal-alertsound">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5 text-rose-600" /> Alert Sound &amp; Ring Settings</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-400 -mt-2">{`These settings apply to every partner's incoming-job ring. This control is no longer available in the partner dashboard.`}</p>

        <div className="mt-2 rounded-xl border border-slate-200 p-3.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Music className="h-3.5 w-3.5" /> Custom ring audio</p>
          {f.custom_sound_url ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2" data-testid="alert-custom-sound">
              <div className="min-w-0"><p className="text-sm font-semibold text-emerald-800 truncate">{f.custom_sound_name || "Custom audio"}</p><p className="text-[11px] text-emerald-700/80">This audio will play (looped) for every job alert.</p></div>
              <button type="button" data-testid="alert-remove-sound" onClick={() => setF((o) => ({ ...o, custom_sound_url: "", custom_sound_name: "" }))} className="text-xs text-red-600 hover:underline shrink-0">Remove</button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">No custom audio — the built-in tone below is used.</p>
          )}
          <label className="mt-2 inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary-50 text-primary-700 text-sm font-medium cursor-pointer hover:bg-primary-100">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {f.custom_sound_url ? "Replace audio" : "Upload audio (MP3/WAV/OGG)"}
            <input data-testid="alert-sound-file" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end mt-3">
          <L label="Built-in ringtone (used when no custom audio)">
            <PremiumSelect data-testid="alert-tone" value={f.tone} onChange={(e) => set("tone", e.target.value)} disabled={!!f.custom_sound_url}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm">
              {Object.entries(TONE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </PremiumSelect>
          </L>
          <Button type="button" data-testid="alert-test-sound" onClick={() => previewTone(f.tone, f.volume, f.custom_sound_url)} className="h-10 bg-primary-700 hover:bg-primary-800"><Play className="h-4 w-4 mr-1" /> Test</Button>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between"><label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" /> Volume</label><span className="text-sm font-semibold text-slate-700">{Math.round((f.volume || 0) * 100)}%</span></div>
          <input data-testid="alert-volume" type="range" min="0.05" max="1" step="0.05" value={f.volume} onChange={(e) => set("volume", parseFloat(e.target.value))} className="mt-1 w-full accent-primary-600" />
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 p-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-sm text-slate-800"><Moon className="h-4 w-4 text-indigo-500" /> Do Not Disturb (quiet hours)</span>
            <Switch data-testid="alert-dnd" checked={f.dnd_enabled} onCheckedChange={(v) => set("dnd_enabled", v)} />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Ring stays silent in this window — emergency bookings still ring.</p>
          {f.dnd_enabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <L label="From"><PremiumSelect data-testid="alert-dnd-start" value={f.dnd_start} onChange={(e) => set("dnd_start", e.target.value)} options={DND_TIME_OPTS} placeholder="Select time" className="rounded-md" /></L>
              <L label="To"><PremiumSelect data-testid="alert-dnd-end" value={f.dnd_end} onChange={(e) => set("dnd_end", e.target.value)} options={DND_TIME_OPTS} placeholder="Select time" className="rounded-md" /></L>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Note: browser push notifications (browser closed) use the phone&apos;s system notification sound + vibration; the custom audio plays for the in-app full-screen ring.</p>

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="alert-sound-save" onClick={save} disabled={busy || uploading} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save changes</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BusinessModal({ biz, defaultEmergencyFee, onClose, onSaved }) {
  const [f, setF] = useState({
    timezone: biz.timezone || "Asia/Kolkata",
    global_visiting_charge: biz.global_visiting_charge ?? "",
    min_service_amount_for_visiting: biz.min_service_amount_for_visiting ?? "",
    emergency_fee: defaultEmergencyFee ?? "",
    max_distance_km: biz.max_distance_km ?? "",
    apply_convenience_fee: !!biz.apply_convenience_fee,
    convenience_fee_pct: biz.convenience_fee_pct ?? "",
    apply_platform_fee: !!biz.apply_platform_fee,
    platform_fee: biz.platform_fee ?? "",
    min_labour_charge: biz.min_labour_charge ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/settings", {
        emergency_fee: Number(f.emergency_fee) || 0,
        business_config: {
          timezone: f.timezone,
          global_visiting_charge: Number(f.global_visiting_charge) || 0,
          min_service_amount_for_visiting: Number(f.min_service_amount_for_visiting) || 0,
          max_distance_km: Number(f.max_distance_km) || 0,
          apply_convenience_fee: !!f.apply_convenience_fee,
          convenience_fee_pct: Number(f.convenience_fee_pct) || 0,
          apply_platform_fee: !!f.apply_platform_fee,
          platform_fee: Number(f.platform_fee) || 0,
          min_labour_charge: Number(f.min_labour_charge) || 0,
        },
      });
      toast.success("Business settings saved"); onSaved();
    } catch { toast.error("Save failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="intg-modal-business">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-emerald-600" /> Business Settings</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <L label="Select Time Zone">
            <PremiumSelect data-testid="biz-timezone" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}
              className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm">
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </PremiumSelect>
          </L>
          <div className="grid sm:grid-cols-2 gap-3">
            <L label="Global Visiting Charge (₹)"><Input data-testid="biz-visiting-charge" type="number" value={f.global_visiting_charge} onChange={(e) => set("global_visiting_charge", e.target.value)} /></L>
            <L label="Min Service Amount for Visiting Charge (₹)"><Input data-testid="biz-min-service" type="number" value={f.min_service_amount_for_visiting} onChange={(e) => set("min_service_amount_for_visiting", e.target.value)} /></L>
          </div>
          <p className="text-[11px] text-slate-400 -mt-1">Visiting charge applies only when the cart's total service amount is below the min amount above.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <L label="Instant / Emergency Charge (₹)"><Input data-testid="biz-emergency-fee" type="number" value={f.emergency_fee} onChange={(e) => set("emergency_fee", e.target.value)} placeholder="e.g. 199" /></L>
            <L label="Max Serviceable Distance (km)"><Input data-testid="biz-max-distance" type="number" value={f.max_distance_km} onChange={(e) => set("max_distance_km", e.target.value)} /></L>
          </div>
          <p className="text-[11px] text-slate-400 -mt-1">Instant / Emergency charge is added when a customer books an Instant / Emergency service.</p>

          <div className="pt-3 border-t border-slate-100">
            <L label="Minimum Labor Charge (₹)"><Input data-testid="biz-min-labour" type="number" min="0" value={f.min_labour_charge} onChange={(e) => set("min_labour_charge", e.target.value)} placeholder="e.g. 100" /></L>
            <p className="text-[11px] text-slate-400 mt-1">Applied only when a customer books a Rate Card service that has NO labour charge (product-only). If the rate-card row already includes a labour charge, this is not applied.</p>
          </div>

          {/* Extra booking fees (optional) */}
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Extra Booking Fees</p>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-700">Apply Convenience Fee</span>
              <input type="checkbox" data-testid="biz-apply-convenience" checked={f.apply_convenience_fee} onChange={(e) => set("apply_convenience_fee", e.target.checked)} />
            </div>
            {f.apply_convenience_fee && (
              <L label="Convenience Fee (% of order)"><Input data-testid="biz-convenience-pct" type="number" value={f.convenience_fee_pct} onChange={(e) => set("convenience_fee_pct", e.target.value)} placeholder="e.g. 2" /></L>
            )}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-700">Apply Platform Fee</span>
              <input type="checkbox" data-testid="biz-apply-platform" checked={f.apply_platform_fee} onChange={(e) => set("apply_platform_fee", e.target.checked)} />
            </div>
            {f.apply_platform_fee && (
              <L label="Platform Fee (₹ flat)"><Input data-testid="biz-platform-fee" type="number" value={f.platform_fee} onChange={(e) => set("platform_fee", e.target.value)} placeholder="e.g. 20" /></L>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="business-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save changes</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
// ---- Languages manager (Integration Center) ----
function LanguagesModal({ onClose }) {
  const [langs, setLangs] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/settings").then((r) => setLangs(r.data?.languages || [])).catch(() => setLangs([])); }, []);
  const addRow = () => setLangs((l) => [...l, { code: "", name: "", active: true }]);
  const upd = (i, k, v) => setLangs((l) => l.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const del = (i) => setLangs((l) => l.filter((_, idx) => idx !== i));
  const save = async () => {
    const clean = (langs || []).filter((x) => x.name?.trim() && x.code?.trim())
      .map((x) => ({ code: x.code.trim().toLowerCase(), name: x.name.trim(), active: x.active !== false }));
    if (clean.length === 0) return toast.error("Add at least one language with name and code");
    setBusy(true);
    try { await api.put("/admin/settings", { languages: clean }); toast.success("Languages saved"); onClose(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="intg-modal-languages">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-indigo-600" /> Manage Languages</DialogTitle></DialogHeader>
        {langs === null ? <div className="py-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary-600" /></div> : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_110px_70px_36px] gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
              <span>Language</span><span>Code</span><span>Active</span><span></span>
            </div>
            {langs.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_70px_36px] gap-2 items-center">
                <Input data-testid={`lang-name-${i}`} value={l.name} onChange={(e) => upd(i, "name", e.target.value)} placeholder="e.g. Punjabi" />
                <Input data-testid={`lang-code-${i}`} value={l.code} onChange={(e) => upd(i, "code", e.target.value)} placeholder="pa" />
                <button type="button" onClick={() => upd(i, "active", !(l.active !== false))} className={`h-6 w-11 rounded-full transition-colors relative ${l.active !== false ? "bg-primary-600" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${l.active !== false ? "left-5" : "left-0.5"}`} />
                </button>
                <button type="button" onClick={() => del(i)} className="h-9 w-9 grid place-items-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button variant="outline" size="sm" data-testid="lang-add" onClick={addRow} className="mt-1"><Plus className="h-4 w-4 mr-1" /> Add language</Button>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="languages-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Module-level numeric field for wallet rules (avoids remount/focus-loss).
const WNum = ({ label, k, suffix, cfg, set }) => (
  <div><label className="text-xs font-semibold text-slate-500 mb-1 block">{label}</label>
    <div className="relative"><Input data-testid={`wallet-${k}`} type="number" value={cfg[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}</div></div>
);

// ---- Wallet & Withdrawal rules (Integration Center) ----
function WalletRulesModal({ onClose }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/partner/wallet-config").then((r) => setCfg(r.data || {})).catch(() => setCfg({})); }, []);
  const set = (k, v) => setCfg((o) => ({ ...o, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/partner/wallet-config", {
        min_withdrawal: Number(cfg.min_withdrawal) || 0, max_withdrawal: Number(cfg.max_withdrawal) || 0,
        processing_fee_pct: Number(cfg.processing_fee_pct) || 0, processing_fee_flat: Number(cfg.processing_fee_flat) || 0,
        frequency_days: Number(cfg.frequency_days) || 0, upi_enabled: !!cfg.upi_enabled, bank_enabled: !!cfg.bank_enabled,
      });
      toast.success("Wallet rules saved"); onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="intg-modal-wallet">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-600" /> Wallet &amp; Withdrawal Rules</DialogTitle></DialogHeader>
        {cfg === null ? <div className="py-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary-600" /></div> : (
          <div className="grid grid-cols-2 gap-3">
            <WNum label="Min Withdrawal" k="min_withdrawal" suffix="₹" cfg={cfg} set={set} />
            <WNum label="Max Withdrawal" k="max_withdrawal" suffix="₹" cfg={cfg} set={set} />
            <WNum label="Processing Fee" k="processing_fee_pct" suffix="%" cfg={cfg} set={set} />
            <WNum label="Flat Fee" k="processing_fee_flat" suffix="₹" cfg={cfg} set={set} />
            <WNum label="Frequency (days)" k="frequency_days" cfg={cfg} set={set} />
            <div className="col-span-2 flex items-center gap-6 pt-1">
              {[["upi_enabled", "UPI payouts"], ["bank_enabled", "Bank payouts"]].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <button type="button" data-testid={`wallet-${k}`} onClick={() => set(k, !cfg[k])} className={`h-6 w-11 rounded-full transition-colors relative ${cfg[k] ? "bg-primary-600" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${cfg[k] ? "left-5" : "left-0.5"}`} />
                  </button>{label}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="wallet-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save changes</>}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
