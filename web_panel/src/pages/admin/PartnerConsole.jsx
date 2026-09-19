import PremiumSelect from "@/components/ui/PremiumSelect";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import api, { fmt } from "@/lib/api";
import { onlyDigits } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DataTable from "@/components/admin/DataTable";
import { SBadge } from "@/pages/admin/adminSections";
import {
  ArrowLeft, Phone, Mail, MapPin, Star, Wallet, Package, FileText, Award, Activity,
  ShieldCheck, ShieldAlert, Ban, Pencil, Send, MessageSquare, Bell, X, ZoomIn,
  CheckCircle2, XCircle, Loader2, Navigation, Calendar, ScrollText, User as UserIcon,
  Search, Check, ChevronDown, Lock, Zap, TrendingUp, Languages as LangIcon, Briefcase, CreditCard, Crown,
} from "lucide-react";
import { toast } from "sonner";

/* --------------------------- form controls --------------------------- */
function SelectBox({ value, onChange, options, placeholder = "Select…", testId }) {
  return (
    <div className="relative">
      <PremiumSelect data-testid={testId} value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 appearance-none rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 pl-3 pr-9 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 transition">
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </PremiumSelect>
      <ChevronDown className="h-4 w-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

function MultiSelect({ values = [], onChange, options, placeholder = "Select…", testId, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const toggle = (v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative" data-testid={testId}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 px-2.5 py-1.5 text-left flex items-center flex-wrap gap-1.5 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40 transition">
        {values.length === 0 && <span className="text-sm text-slate-400 flex items-center gap-1.5">{Icon && <Icon className="h-4 w-4" />}{placeholder}</span>}
        {values.map((v) => {
          const o = options.find((x) => x.value === v);
          return (
            <span key={v} className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 rounded-lg pl-2 pr-1 py-0.5 text-xs font-semibold">
              {o?.label || v}
              <button type="button" onClick={(e) => { e.stopPropagation(); toggle(v); }} className="hover:bg-primary-100 dark:hover:bg-primary-800 rounded p-0.5"><X className="h-3 w-3" /></button>
            </span>
          );
        })}
        <ChevronDown className={`h-4 w-4 text-slate-400 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-100 dark:border-slate-700 relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="w-full h-9 rounded-lg bg-slate-50 dark:bg-slate-800 pl-8 pr-3 text-sm focus:outline-none" />
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">No options</p>}
              {filtered.map((o) => {
                const sel = values.includes(o.value);
                return (
                  <button key={o.value} type="button" onClick={() => toggle(o.value)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${sel ? "text-primary-700 dark:text-primary-300 font-semibold" : "text-slate-700 dark:text-slate-200"}`}>
                    {o.label}
                    <span className={`h-4 w-4 rounded border grid place-items-center ${sel ? "bg-primary-600 border-primary-600" : "border-slate-300 dark:border-slate-600"}`}>{sel && <Check className="h-3 w-3 text-white" />}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- helpers --------------------------- */
const fmtDate = (v) => v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDay = (v) => v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—";

const DocLightbox = ({ url, label, onClose }) => {
  const [scale, setScale] = useState(1);
  if (!url) return null;
  const isPdf = String(url).toLowerCase().includes(".pdf");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" data-testid="doc-lightbox" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        {!isPdf && (
          <>
            <button data-testid="doc-zoom-out" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} className="h-10 w-10 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xl font-bold grid place-items-center">−</button>
            <span className="text-white text-sm font-semibold w-14 text-center">{Math.round(scale * 100)}%</span>
            <button data-testid="doc-zoom-in" onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))} className="h-10 w-10 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xl font-bold grid place-items-center">+</button>
          </>
        )}
        <a href={url} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-semibold grid place-items-center">Open ↗</a>
        <button data-testid="doc-close" onClick={onClose} className="h-10 w-10 rounded-lg bg-white/15 hover:bg-white/25 text-white grid place-items-center"><X className="h-5 w-5" /></button>
      </div>
      {label && <div className="absolute top-5 left-5 text-white/80 text-sm font-medium z-10">{label}</div>}
      <div className="relative max-w-[92vw] max-h-[88vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {isPdf
          ? <iframe title={label || "document"} src={url} className="w-[85vw] h-[85vh] rounded-lg bg-white" />
          : <img src={url} alt={label || "document"} className="rounded-lg shadow-2xl transition-transform duration-150 select-none" style={{ transform: `scale(${scale})`, transformOrigin: "center" }} />}
      </div>
    </div>
  );
};

const StatMini = ({ label, value, tone = "slate" }) => {
  const tones = {
    slate: "text-slate-900 dark:text-white", green: "text-emerald-600", blue: "text-primary-700 dark:text-primary-300",
    amber: "text-amber-600", red: "text-red-500",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      <p className={`font-heading font-extrabold text-2xl mt-1 ${tones[tone]}`}>{value}</p>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-slate-800 dark:text-slate-100 mt-0.5 break-words">{value || "—"}</p>
  </div>
);

const KV = ({ k, v }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm">
    <span className="text-slate-400 shrink-0">{k}</span>
    <span className="text-slate-800 dark:text-slate-100 font-medium text-right break-words">{v ?? "—"}</span>
  </div>
);
const FLabel = ({ children }) => <label className="text-xs font-semibold text-slate-500 mb-1 block">{children}</label>;

/* --------------------------- Edit modal --------------------------- */
function EditPartnerModal({ user, onClose, onSaved }) {
  const [f, setF] = useState({
    name: user.name || "", phone: user.phone || "", email: user.email || "",
    alternate_mobile: user.alternate_mobile || "", gender: user.gender || "",
    languages: Array.isArray(user.languages) ? user.languages : (user.language ? [user.language] : []),
    skills: Array.isArray(user.skills) ? user.skills : [],
    state: user.state || "", district: user.district || "", city: user.city || "",
    village: user.village || "", pincode: user.pincode || "",
  });
  const [langOpts, setLangOpts] = useState([]);
  const [skillOpts, setSkillOpts] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  useEffect(() => {
    api.get("/admin/settings").then((r) => {
      const langs = (r.data?.languages || []).filter((l) => l.active !== false);
      setLangOpts(langs.map((l) => ({ value: l.name, label: `${l.name} (${l.code})` })));
    }).catch(() => {});
    api.get("/catalog/categories").then((r) => {
      setSkillOpts((r.data || []).map((c) => ({ value: c.name, label: c.name })));
    }).catch(() => {});
  }, []);
  const save = async () => {
    if (!f.name?.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      await api.put(`/admin/partners/${user.id}`, { ...f, language: f.languages[0] || "" });
      toast.success("Provider updated"); onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); } finally { setBusy(false); }
  };
  const L = FLabel;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="edit-partner-modal">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary-600" /> Edit Provider</DialogTitle></DialogHeader>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-2 mb-1">
          <Lock className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-500">Provider Code</span>
          <span className="font-mono font-bold text-primary-700 dark:text-primary-300">{user.partner_code || "—"}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-400">Permanent · not editable</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><L>Full Name</L><Input data-testid="edit-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><L>Mobile Number</L><Input data-testid="edit-phone" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => set("phone", onlyDigits(e.target.value, 10))} /></div>
          <div><L>Email</L><Input data-testid="edit-email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><L>Alternate Mobile</L><Input data-testid="edit-alt" inputMode="numeric" maxLength={10} value={f.alternate_mobile} onChange={(e) => set("alternate_mobile", onlyDigits(e.target.value, 10))} /></div>
          <div><L>Gender</L><SelectBox testId="edit-gender" value={f.gender} onChange={(v) => set("gender", v)} placeholder="Select gender" options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }]} /></div>
          <div><L>Languages</L><MultiSelect testId="edit-languages" icon={LangIcon} values={f.languages} onChange={(v) => set("languages", v)} options={langOpts} placeholder="Select languages" /></div>
          <div className="sm:col-span-2"><L>Skills (service categories)</L><MultiSelect testId="edit-skills" icon={Award} values={f.skills} onChange={(v) => set("skills", v)} options={skillOpts} placeholder="Select skills" /></div>
          <div><L>State</L><Input data-testid="edit-state" value={f.state} onChange={(e) => set("state", e.target.value)} /></div>
          <div><L>District</L><Input data-testid="edit-district" value={f.district} onChange={(e) => set("district", e.target.value)} /></div>
          <div><L>City</L><Input data-testid="edit-city" value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div><L>Village</L><Input data-testid="edit-village" value={f.village} onChange={(e) => set("village", e.target.value)} /></div>
          <div><L>Pincode</L><Input data-testid="edit-pincode" value={f.pincode} onChange={(e) => set("pincode", e.target.value)} maxLength={6} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="edit-partner-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Suspend modal --------------------------- */
function SuspendModal({ user, onClose, onSaved }) {
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reason.trim()) return toast.error("Please add a reason");
    if (!days || days < 1) return toast.error("Days must be at least 1");
    setBusy(true);
    try { await api.post(`/admin/partners/${user.id}/suspend`, { days: Number(days), reason }); toast.success(`Suspended for ${days} day(s)`); onSaved(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="suspend-modal">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><Ban className="h-5 w-5" /> Suspend Provider</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">The provider cannot log in or receive jobs during the suspension. The account auto-reactivates when the period ends.</p>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Suspend for (days)</label>
            <Input data-testid="suspend-days" type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Reason (shown to provider on login)</label>
            <textarea data-testid="suspend-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-3 text-sm focus:outline-none focus:border-red-400" placeholder="e.g. Repeated late arrivals / policy violation" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="suspend-confirm" onClick={save} disabled={busy} className="bg-red-600 hover:bg-red-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suspend"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Notify modal (template based) --------------------------- */
// Auto-filled server-side from the partner record — hidden from the admin form.
const AUTO_VARS = ["name", "business", "partner_code"];
const extractVars = (text) => {
  const set = new Set();
  const re = /\{\{\s*([\w.]+)\s*\}\}|\[\[\s*([\w.]+)\s*\]\]/g;
  let m;
  while ((m = re.exec(String(text || "")))) set.add(m[1] || m[2]);
  return [...set];
};
const prettyVar = (k) => String(k).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
// Renders a template into the final message. Filled variables show their value;
// UNFILLED variables are NEVER shown as raw {{tags}} — they become an editor-style
// highlighted placeholder chip (html) or a bracketed label (plain text).
const fillPreview = (text, vars, html = false) =>
  String(text || "").replace(/\{\{\s*([\w.]+)\s*\}\}|\[\[\s*([\w.]+)\s*\]\]/g, (full, a, b) => {
    const k = a || b;
    const v = vars[k];
    if (v != null && v !== "") return v;
    return html
      ? `<span style="display:inline-block;padding:0 8px;border-radius:9999px;background:#FEF3C7;color:#92400E;font-size:12px;font-weight:600;line-height:1.6;">${prettyVar(k)}</span>`
      : `[${prettyVar(k)}]`;
  });

function NotifyModal({ user, channel, onClose }) {
  const meta = { sms: { label: "SMS", icon: MessageSquare }, email: { label: "Email", icon: Mail }, push: { label: "Push Notification", icon: Bell } }[channel];
  const [templates, setTemplates] = useState(null);
  const [selId, setSelId] = useState("");
  const [vars, setVars] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/admin/partners/notify-templates?channel=${channel}`)
      .then((r) => setTemplates(r.data || [])).catch(() => setTemplates([]));
  }, [channel]);
  const sel = (templates || []).find((t) => t.id === selId);
  // fields the admin must fill = placeholders in body/subject minus the auto-filled ones
  const autoDefaults = { name: user.name || "Partner", business: "AzoApp", partner_code: user.partner_code || "" };
  const fields = sel ? extractVars(`${sel.body || ""} ${sel.subject || ""} ${sel.title || ""}`).filter((v) => !AUTO_VARS.includes(v)) : [];
  const previewCtx = { ...autoDefaults, ...vars };
  const onPick = (id) => { setSelId(id); setVars({}); };
  const send = async () => {
    if (!selId) return toast.error("Please select a template");
    const missing = fields.filter((f) => !vars[f]);
    if (missing.length) return toast.error(`Please fill: ${missing.join(", ")}`);
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/partners/${user.id}/notify`, { channel, template_id: selId, variables: vars });
      if (data.note) toast.warning(data.note); else toast.success(`${meta.label} sent`);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const Icon = meta.icon;
  const prettyLabel = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid={`notify-modal-${channel}`}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary-600" /> Send {meta.label}</DialogTitle></DialogHeader>
        {templates === null ? (
          <div className="py-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary-600" /></div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 p-4 text-sm text-amber-700">
            No active {meta.label} templates. Create & activate one in <b>Communication → Notification Templates</b>.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Choose an active {meta.label} template</label>
              <PremiumSelect data-testid="notify-template" value={selId} onChange={(e) => onPick(e.target.value)} placeholder={`Select ${meta.label} template`}
                className="w-full rounded-xl">
                <option value="">{`Select ${meta.label} template`}</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{`${t.name}${t.category ? ` · ${t.category}` : ""}`}</option>)}
              </PremiumSelect>
            </div>

            {sel && fields.length > 0 && (
              <div className="space-y-2" data-testid="notify-vars">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Fill the details</p>
                {fields.map((k) => (
                  <div key={k}>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">{prettyLabel(k)}</label>
                    {k === "reason" || k === "message" || k === "note"
                      ? <Textarea data-testid={`var-${k}`} rows={2} value={vars[k] || ""} placeholder={`Enter ${prettyLabel(k).toLowerCase()}`} onChange={(e) => setVars((p) => ({ ...p, [k]: e.target.value }))} />
                      : <Input data-testid={`var-${k}`} value={vars[k] || ""} placeholder={`Enter ${prettyLabel(k).toLowerCase()}`} onChange={(e) => setVars((p) => ({ ...p, [k]: e.target.value }))} />}
                  </div>
                ))}
              </div>
            )}

            {sel && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3" data-testid="notify-preview">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Preview — final {channel === "email" ? "email" : "message"}</p>
                {channel === "email" ? (
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    {sel.subject && <p className="text-sm font-semibold text-slate-800 dark:text-white mb-2 pb-2 border-b border-slate-100 dark:border-slate-800">{fillPreview(sel.subject, previewCtx)}</p>}
                    {/* render HTML like an email client (tags shown as formatting, not raw text) */}
                    <div className="text-sm text-slate-600 dark:text-slate-300 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: fillPreview(sel.body || sel.title, previewCtx, true) }} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{fillPreview(sel.body || sel.title, previewCtx)}</p>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="notify-send" onClick={send} disabled={busy || !selId} className="bg-primary-700 hover:bg-primary-800"><Send className="h-4 w-4 mr-1" />{busy ? "Sending…" : "Send"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Record popup --------------------------- */
function RecordPopup({ title, rows, onClose }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="record-popup">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="mt-1">{rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}</div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================== MAIN =========================== */
const TABS = [
  ["overview", "Overview", UserIcon],
  ["bookings", "Bookings", Package],
  ["transactions", "Transactions", Wallet],
  ["withdrawals", "Withdrawals", Wallet],
  ["finance", "Bank & PAN", CreditCard],
  ["activity", "Activity", Activity],
  ["logs", "Logs", ScrollText],
];

export default function PartnerConsole({ userId, onBack }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("overview");
  const [zoom, setZoom] = useState(null);
  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [notify, setNotify] = useState(null);
  const [popup, setPopup] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [fin, setFin] = useState(null);
  const [kycReject, setKycReject] = useState(false);
  const [kycReason, setKycReason] = useState("");
  const [kycBusy, setKycBusy] = useState(false);

  const reload = useCallback(() => api.get(`/admin/users/${userId}/detail`).then((r) => setD(r.data)).catch(() => {}), [userId]);
  useEffect(() => { setD(null); reload(); }, [userId, reload]);
  const loadFin = useCallback(() => api.get(`/admin/partner/finance-requests?partner_id=${userId}`).then((r) => setFin(r.data)).catch(() => setFin({ banks: [], pans: [] })), [userId]);
  useEffect(() => {
    if (tab === "logs") {
      setLogsLoading(true);
      api.get(`/admin/partners/${userId}/logs`).then((r) => setLogs(r.data || [])).catch(() => setLogs([])).finally(() => setLogsLoading(false));
    }
    if (tab === "finance") loadFin();
  }, [tab, userId, loadFin]);

  const reviewPan = async (action) => {
    const reason = action === "reject" ? (window.prompt("Reason for rejecting PAN?") || "") : "";
    if (action === "reject" && !reason.trim()) return;
    try { await api.post(`/admin/partner/${userId}/finance/pan/action`, { action, reason }); toast.success(`PAN ${action}d`); loadFin(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const reviewBank = async (bankId, action) => {
    const reason = action === "reject" ? (window.prompt("Reason for rejecting this bank account?") || "") : "";
    if (action === "reject" && !reason.trim()) return;
    try { await api.post(`/admin/partner/finance/banks/${bankId}/action`, { action, reason }); toast.success(`Bank ${action}d`); loadFin(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const unsuspend = async () => {
    try { await api.post(`/admin/partners/${userId}/unsuspend`); toast.success("Provider re-activated"); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const withdrawalAction = async (wid, action) => {
    const reason = action === "reject" ? (window.prompt("Reason for rejecting this withdrawal?") || "") : "";
    if (action === "reject" && !reason.trim()) return;
    try { await api.post(`/admin/partner/withdrawals/${wid}/action`, { action, reason }); toast.success(`Withdrawal ${action}d`); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const BackBar = (
    <button data-testid="ud-back" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-700 mb-4">
      <ArrowLeft className="h-4 w-4" /> Back to list
    </button>
  );
  if (!d) return <div data-testid="partner-console">{BackBar}<div className="py-20 text-center text-slate-400">Loading provider…</div></div>;

  const u = d.user;
  const profile = d.profile || {};
  const addr = profile.address || {};
  const lat = addr.lat, lng = addr.lng;
  const bookings = d.bookings || [];
  const txns = d.transactions || [];
  const withdrawals = d.withdrawals || [];
  const rejReason = u.kyc_rejection_reason || profile.rejection_reason;

  const doKycApprove = async () => {
    setKycBusy(true);
    try { await api.post(`/admin/partners/${userId}/kyc-action`, { action: "approve" }); toast.success("KYC approved"); setKycReject(false); setKycReason(""); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed to approve"); } finally { setKycBusy(false); }
  };
  const doKycReject = async () => {
    if (!kycReason.trim()) { toast.error("Please add a rejection reason"); return; }
    setKycBusy(true);
    try { await api.post(`/admin/partners/${userId}/kyc-action`, { action: "reject", reason: kycReason.trim() }); toast.success("KYC rejected"); setKycReject(false); setKycReason(""); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed to reject"); } finally { setKycBusy(false); }
  };
  const verified = u.kyc_status === "approved";

  const bStats = {
    total: bookings.length,
    completed: bookings.filter((b) => ["completed", "paid"].includes(b.status)).length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
    revenue: bookings.filter((b) => ["completed", "paid"].includes(b.status)).reduce((s, b) => s + (b.pricing?.total || 0), 0),
  };
  const tStats = {
    total: txns.length,
    credit: txns.filter((t) => t.type === "credit").reduce((s, t) => s + (t.amount || 0), 0),
    debit: txns.filter((t) => t.type !== "credit").reduce((s, t) => s + (t.amount || 0), 0),
  };

  const initials = (u.name || "P").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div data-testid="partner-console">
      {BackBar}

      {/* ---- Header (premium cover + glass avatar + stat chips) ---- */}
      <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-5 shadow-sm">
        <div className="relative h-36 bg-gradient-to-br from-primary-700 via-fuchsia-600 to-sky-500">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.5) 0, transparent 45%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.35) 0, transparent 40%)" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
          <div className="absolute top-4 right-5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white text-xs font-mono font-bold tracking-wide" data-testid="provider-code">
              <Lock className="h-3 w-3" /> {u.partner_code || "—"}
            </span>
          </div>
        </div>
        <div className="px-6 pb-5">
          {/* Avatar (overlaps cover) + actions — kept on the banner boundary */}
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
            <div className="relative shrink-0">
              <div className="h-24 w-24 rounded-2xl ring-4 ring-white dark:ring-slate-900 bg-gradient-to-br from-primary-600 to-primary-800 overflow-hidden grid place-items-center text-white text-3xl font-extrabold shadow-lg">
                {u.photo ? <img src={u.photo} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
              <span className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full ring-2 ring-white dark:ring-slate-900 grid place-items-center ${verified ? "bg-emerald-500" : u.kyc_status === "rejected" ? "bg-red-500" : "bg-amber-500"}`}>
                {verified ? <ShieldCheck className="h-3.5 w-3.5 text-white" /> : <ShieldAlert className="h-3.5 w-3.5 text-white" />}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button data-testid="btn-edit-partner" size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              {u.suspended
                ? <Button data-testid="btn-unsuspend" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={unsuspend}><CheckCircle2 className="h-4 w-4 mr-1" /> Re-activate</Button>
                : <Button data-testid="btn-suspend" size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setSuspending(true)}><Ban className="h-4 w-4 mr-1" /> Suspend</Button>}
              <Button data-testid="btn-send-sms" size="sm" variant="outline" onClick={() => setNotify("sms")}><MessageSquare className="h-4 w-4 mr-1" /> SMS</Button>
              <Button data-testid="btn-send-email" size="sm" variant="outline" onClick={() => setNotify("email")}><Mail className="h-4 w-4 mr-1" /> Email</Button>
              <Button data-testid="btn-send-push" size="sm" variant="outline" onClick={() => setNotify("push")}><Bell className="h-4 w-4 mr-1" /> Push</Button>
            </div>
          </div>
          {/* Identity — placed on the white surface below the cover for full readability */}
          <div className="mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{u.name}</h1>
              <Badge className="bg-primary-50 text-primary-700 border-0 capitalize dark:bg-primary-900/30 dark:text-primary-300">{u.role}</Badge>
              {verified
                ? <Badge className="bg-emerald-100 text-emerald-700 border-0">KYC approved</Badge>
                : <Badge className={`border-0 ${u.kyc_status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>KYC {u.kyc_status || "pending"}</Badge>}
              {u.suspended && <Badge className="bg-red-100 text-red-700 border-0 flex items-center gap-1"><Ban className="h-3 w-3" /> Suspended</Badge>}
              {u.premium_partner && <Badge data-testid="admin-partner-premium-badge" className="bg-gradient-to-r from-amber-400 to-amber-500 text-white border-0 flex items-center gap-1"><Crown className="h-3 w-3" /> {u.partner_badge || "AzoApp Pro"}</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><Phone className="h-4 w-4" />{u.phone}</span>
              {u.email && <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{u.email}</span>}
              {(u.city || u.state) && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{[u.city, u.state].filter(Boolean).join(", ")}</span>}
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />Joined {fmtDay(u.created_at)}</span>
            </div>
          </div>
          {/* stat chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-amber-600"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><span className="text-[11px] uppercase tracking-wider font-bold">Rating</span></div>
              <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-0.5">{u.rating ?? 5}</p>
            </div>
            <div className="rounded-xl bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-primary-600"><Briefcase className="h-4 w-4" /><span className="text-[11px] uppercase tracking-wider font-bold">Jobs Done</span></div>
              <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-0.5">{u.jobs_completed || bStats.completed || 0}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-emerald-600"><Wallet className="h-4 w-4" /><span className="text-[11px] uppercase tracking-wider font-bold">Wallet</span></div>
              <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-0.5">{fmt(d.wallet?.balance || u.wallet_balance || 0)}</p>
            </div>
            <div className="rounded-xl bg-sky-50 dark:bg-sky-900/10 border border-sky-100 dark:border-sky-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-sky-600"><Zap className="h-4 w-4" /><span className="text-[11px] uppercase tracking-wider font-bold">Status</span></div>
              <p className="font-heading font-extrabold text-xl capitalize text-slate-900 dark:text-white mt-0.5">{u.suspended ? "Suspended" : (u.partner_status || "offline")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Banners ---- */}
      {u.suspended && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 mb-4 flex items-start gap-2" data-testid="suspend-banner">
          <Ban className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-700">Account suspended</p>
            <p className="text-red-600/90">{u.suspend_reason || "No reason provided"} · Auto re-activates on <b>{fmtDate(u.suspend_until)}</b>{u.suspended_by ? ` · by ${u.suspended_by}` : ""}</p>
          </div>
        </div>
      )}
      {u.kyc_status === "rejected" && rejReason && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 mb-4 flex items-start gap-2" data-testid="reject-banner">
          <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="text-sm"><p className="font-semibold text-red-700">KYC rejected</p><p className="text-red-600/90">{rejReason}</p></div>
        </div>
      )}

      {/* ---- KYC decision bar (pending / re-decide) ---- */}
      {u.kyc_status !== "approved" && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-4 mb-4" data-testid="kyc-action-bar">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <p className="font-heading font-bold text-slate-800 dark:text-white">
              {u.kyc_status === "rejected" ? "KYC rejected — you can re-approve or update the decision" : "KYC pending — approve or reject this provider"}
            </p>
          </div>
          {!kycReject ? (
            <div className="flex flex-wrap gap-3">
              <Button data-testid="profile-kyc-approve" onClick={doKycApprove} disabled={kycBusy} className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-700">
                {kycBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Approve KYC</>}
              </Button>
              <Button data-testid="profile-kyc-reject-open" onClick={() => setKycReject(true)} disabled={kycBusy} variant="outline" className="flex-1 min-w-[140px] border-red-200 text-red-600 hover:bg-red-50">
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea data-testid="profile-kyc-reason" value={kycReason} onChange={(e) => setKycReason(e.target.value)} rows={2}
                placeholder="Reason for rejection (shown to the provider in their panel)…"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-3 text-sm focus:outline-none focus:border-red-400" />
              <div className="flex gap-2">
                <Button data-testid="profile-kyc-reject-confirm" onClick={doKycReject} disabled={kycBusy} className="flex-1 bg-red-600 hover:bg-red-700">
                  {kycBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Rejection"}
                </Button>
                <Button variant="outline" onClick={() => { setKycReject(false); setKycReason(""); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Tabs ---- */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-5 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} data-testid={`ptab-${key}`} onClick={() => setTab(key)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === key ? "border-primary-600 text-primary-700 dark:text-primary-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ---- OVERVIEW ---- */}
      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-6" data-testid="tab-overview">
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="font-heading font-bold mb-4 text-slate-900 dark:text-white">About</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Name" value={u.name} />
                <Field label="Partner Code" value={u.partner_code} />
                <Field label="Mobile" value={u.phone} />
                <Field label="Alt. Mobile" value={u.alternate_mobile} />
                <Field label="Email" value={u.email} />
                <Field label="Gender" value={u.gender} />
                <Field label="Language" value={(Array.isArray(u.languages) && u.languages.length ? u.languages.join(", ") : u.language)} />
                <Field label="Joined" value={fmtDay(u.created_at)} />
                <Field label="Skills" value={(u.skills || []).join(", ")} />
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="font-heading font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Award className="h-5 w-5 text-primary-700" /> Skills & Certificates</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {(d.skills || []).length === 0 && <p className="text-sm text-slate-400">No skills added</p>}
                {(d.skills || []).map((s, i) => <Badge key={i} className={`border-0 ${s.verified ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{s.skill_name || s.name || "Skill"}{s.verified ? " ✓" : ""}</Badge>)}
              </div>
              {(d.certificates || []).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm border border-slate-100 dark:border-slate-700 rounded-lg p-2.5 mb-2">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{c.title || c.name || "Certificate"}</span>
                  <Badge className={`border-0 ${c.status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{c.status || "pending"}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold flex items-center gap-2 text-slate-900 dark:text-white"><FileText className="h-5 w-5 text-primary-700" /> Registration Details</h3>
                {!verified && (
                  <span className="text-xs text-amber-600 flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Verification pending — use SMS/Email/Push above</span>
                )}
              </div>
              {!d.profile ? <p className="text-sm text-slate-400">No registration profile submitted yet.</p> : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Field label="Full name" value={profile.basic?.full_name} />
                    <Field label="DOB" value={profile.basic?.dob} />
                    <Field label="Email" value={profile.basic?.email} />
                    <Field label="Education" value={profile.basic?.education_name} />
                    <Field label="State" value={profile.basic?.state} />
                    <Field label="District" value={profile.basic?.district} />
                    <Field label="City" value={profile.basic?.city} />
                    <Field label="Village" value={profile.basic?.village} />
                    <Field label="Pincode" value={profile.basic?.pincode} />
                    <Field label="Aadhaar no." value={profile.documents?.aadhaar_number} />
                    <Field label="Completion" value={profile.completion_score != null ? `${profile.completion_score}%` : "—"} />
                    <Field label="Status" value={profile.status} />
                  </div>
                  {(profile.work?.categories || []).length > 0 && (
                    <>
                      <h4 className="font-heading font-bold text-sm mt-6 mb-2 text-slate-900 dark:text-white">Service Categories & Experience</h4>
                      <div className="flex flex-wrap gap-2">
                        {(profile.work?.categories || []).map((c, i) => <Badge key={i} className="bg-primary-50 text-primary-700 border-0">{c.category_name}{c.experience_label ? ` · ${c.experience_label}` : ""}</Badge>)}
                      </div>
                    </>
                  )}
                  <h4 className="font-heading font-bold text-sm mt-6 mb-3 text-slate-900 dark:text-white">Documents & KYC</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[["Live photo", profile.basic?.live_photo_url],
                      ["Aadhaar front", profile.documents?.aadhaar_front_url],
                      ["Aadhaar back", profile.documents?.aadhaar_back_url],
                      ["Education cert", profile.documents?.education_certificate_url]].map(([label, url]) => (
                      <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {url ? (
                          <button type="button" data-testid={`doc-zoom-${label.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => setZoom({ url, label })} className="relative block w-full group">
                            <img src={url} alt={label} className="h-28 w-full object-cover" />
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"><ZoomIn className="h-6 w-6 text-white" /></span>
                          </button>
                        ) : <div className="h-28 w-full grid place-items-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800">Not uploaded</div>}
                        <p className="text-[11px] text-slate-500 px-2 py-1.5 border-t border-slate-100 dark:border-slate-700">{label}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Location + map */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <h3 className="font-heading font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><MapPin className="h-5 w-5 text-primary-700" /> Current Location</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{addr.manual_address || addr.location_address || "No address on file"}</p>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <Field label="Latitude" value={lat} />
                <Field label="Longitude" value={lng} />
              </div>
              {lat && lng ? (
                <a data-testid="map-navigate" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold">
                  <Navigation className="h-4 w-4" /> Navigate on Map
                </a>
              ) : <p className="text-sm text-slate-400">No GPS coordinates captured.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ---- BOOKINGS ---- */}
      {tab === "bookings" && (
        <div className="space-y-4" data-testid="tab-bookings">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatMini label="Total Bookings" value={bStats.total} />
            <StatMini label="Completed" value={bStats.completed} tone="green" />
            <StatMini label="Cancelled" value={bStats.cancelled} tone="red" />
            <StatMini label="Revenue" value={fmt(bStats.revenue)} tone="blue" />
          </div>
          <DataTable
            title="Booking History" rows={bookings} searchPlaceholder="Search bookings…"
            searchKeys={["code", "service_name", "status"]} exportName="partner-bookings" emptyText="No bookings yet"
            onRowClick={(b) => setPopup({ title: `Booking ${b.code || ""}`, rows: [
              ["Code", b.code], ["Service", b.service_name], ["Status", b.status],
              ["Customer", b.customer_name], ["Amount", fmt(b.pricing?.total || 0)],
              ["Scheduled", fmtDate(b.scheduled_at)], ["Created", fmtDate(b.created_at)],
              ["Address", b.address?.line || b.address_text], ["Payment", b.payment_status || b.payment_method],
            ] })}
            columns={[
              { key: "code", label: "Code", sortable: true, render: (b) => <span className="font-mono text-primary-700">{b.code}</span> },
              { key: "service_name", label: "Service", render: (b) => b.service_name || "—" },
              { key: "status", label: "Status", render: (b) => <SBadge s={b.status} /> },
              { key: "amount", label: "Amount", sortable: true, render: (b) => <span className="font-semibold">{fmt(b.pricing?.total || 0)}</span>, exportValue: (b) => b.pricing?.total || 0 },
              { key: "created_at", label: "Date", render: (b) => fmtDate(b.created_at) },
              { key: "_action", label: "", render: () => <span className="text-primary-700 text-xs font-semibold flex items-center gap-1"><Eyeish /> View</span> },
            ]}
          />
        </div>
      )}

      {/* ---- TRANSACTIONS ---- */}
      {tab === "transactions" && (
        <div className="space-y-4" data-testid="tab-transactions">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatMini label="Total Transactions" value={tStats.total} />
            <StatMini label="Total Credited" value={fmt(tStats.credit)} tone="green" />
            <StatMini label="Total Debited" value={fmt(tStats.debit)} tone="red" />
          </div>
          <DataTable
            title="Transactions" rows={txns} searchPlaceholder="Search transactions…"
            searchKeys={["kind", "note", "type"]} exportName="partner-transactions" emptyText="No transactions yet"
            onRowClick={(t) => setPopup({ title: "Transaction", rows: [
              ["Type", t.type], ["Kind", t.kind], ["Amount", fmt(t.amount || 0)],
              ["Note", t.note], ["Booking", t.booking_code], ["Date", fmtDate(t.created_at)],
            ] })}
            columns={[
              { key: "kind", label: "Kind", render: (t) => <span className="capitalize">{t.kind}</span> },
              { key: "note", label: "Note", render: (t) => t.note || "—" },
              { key: "type", label: "Type", render: (t) => <Badge className={`border-0 ${t.type === "credit" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{t.type}</Badge> },
              { key: "amount", label: "Amount", sortable: true, render: (t) => <span className={`font-semibold ${t.type === "credit" ? "text-emerald-600" : "text-slate-700 dark:text-slate-200"}`}>{t.type === "credit" ? "+" : "-"}{fmt(t.amount || 0)}</span>, exportValue: (t) => t.amount || 0 },
              { key: "created_at", label: "Date", render: (t) => fmtDate(t.created_at) },
              { key: "_action", label: "", render: () => <span className="text-primary-700 text-xs font-semibold flex items-center gap-1"><Eyeish /> View</span> },
            ]}
          />
        </div>
      )}

      {/* ---- WITHDRAWALS ---- */}
      {tab === "withdrawals" && (
        <div className="space-y-4" data-testid="tab-withdrawals">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatMini label="Wallet Balance" value={fmt(d.wallet?.balance || u.wallet_balance || 0)} tone="blue" />
            <StatMini label="Total Earned" value={fmt(d.wallet?.earned || 0)} tone="green" />
            <StatMini label="Withdrawals" value={withdrawals.length} />
            <StatMini label="Paid Out" value={fmt(withdrawals.filter((w) => ["approved", "paid"].includes(w.status)).reduce((s, w) => s + (w.amount || 0), 0))} />
          </div>
          <DataTable
            title="Withdrawal Requests" rows={withdrawals} searchPlaceholder="Search…"
            searchKeys={["status", "method"]} exportName="partner-withdrawals" emptyText="No withdrawal requests"
            onRowClick={(w) => setPopup({ title: "Withdrawal", rows: [
              ["Amount", fmt(w.amount || 0)], ["Status", w.status], ["Method", w.method],
              ["Note", w.note || w.reason], ["Requested", fmtDate(w.created_at)],
            ] })}
            columns={[
              { key: "amount", label: "Amount", sortable: true, render: (w) => <span className="font-semibold">{fmt(w.amount || 0)}</span> },
              { key: "method", label: "Method", render: (w) => <span className="capitalize">{w.method || "—"}</span> },
              { key: "status", label: "Status", render: (w) => <SBadge s={w.status} /> },
              { key: "created_at", label: "Requested", render: (w) => fmtDate(w.created_at) },
              { key: "_action", label: "Action", render: (w) => (
                (w.status === "pending" || w.status === "requested") ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button data-testid={`wd-approve-${w.id}`} onClick={() => withdrawalAction(w.id, "approve")} className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">Approve</button>
                    <button data-testid={`wd-reject-${w.id}`} onClick={() => withdrawalAction(w.id, "reject")} className="h-7 px-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold">Reject</button>
                  </div>
                ) : <span className="text-primary-700 text-xs font-semibold flex items-center gap-1"><Eyeish /> View</span>
              ) },
            ]}
          />
        </div>
      )}

      {/* ---- BANK & PAN VERIFICATION (Point 7) ---- */}
      {tab === "finance" && (
        <div className="space-y-4" data-testid="tab-finance">
          {!fin ? <p className="text-slate-400 py-8 text-center">Loading…</p> : (
            <>
              {/* PAN */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                <h3 className="font-heading font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><CreditCard className="h-5 w-5 text-primary-700" /> PAN Card</h3>
                {(fin.pans || []).length === 0 ? <p className="text-sm text-slate-400">No PAN submitted.</p> : fin.pans.map((p) => (
                  <div key={p.partner_id} className="flex items-center justify-between gap-3 flex-wrap border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                    <div>
                      <p className="font-mono font-semibold text-slate-800 dark:text-white">{p.pan_number}</p>
                      {p.pan_url && <a href={p.pan_url} target="_blank" rel="noreferrer" className="text-xs text-primary-700 underline">View PAN image</a>}
                      {p.status === "rejected" && p.reason && <p className="text-xs text-red-600 mt-1">Rejected: {p.reason}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <SBadge s={p.status} />
                      {p.status === "pending" && (
                        <>
                          <button data-testid="pan-approve" onClick={() => reviewPan("approve")} className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">Approve</button>
                          <button data-testid="pan-reject" onClick={() => reviewPan("reject")} className="h-7 px-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold">Reject</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Banks */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                <h3 className="font-heading font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Wallet className="h-5 w-5 text-primary-700" /> Bank Accounts</h3>
                {(fin.banks || []).length === 0 ? <p className="text-sm text-slate-400">No bank accounts submitted.</p> : (
                  <div className="space-y-2">
                    {fin.banks.map((b) => (
                      <div key={b.id} className="border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white">{b.bank_name} {b.is_primary && <span className="text-[10px] bg-primary-100 text-primary-700 rounded px-1.5 py-0.5">PRIMARY</span>}</p>
                            <p className="text-xs text-slate-500">{b.account_holder} · A/C {b.account_number} · {b.ifsc}{b.upi_id ? ` · UPI ${b.upi_id}` : ""}</p>
                            {b.passbook_url && <a href={b.passbook_url} target="_blank" rel="noreferrer" className="text-xs text-primary-700 underline">View passbook</a>}
                            {b.status === "rejected" && b.reason && <p className="text-xs text-red-600 mt-1">Rejected: {b.reason}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <SBadge s={b.status} />
                            {b.status === "pending" && (
                              <>
                                <button data-testid={`bank-approve-${b.id}`} onClick={() => reviewBank(b.id, "approve")} className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">Approve</button>
                                <button data-testid={`bank-reject-${b.id}`} onClick={() => reviewBank(b.id, "reject")} className="h-7 px-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold">Reject</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- ACTIVITY ---- */}
      {tab === "activity" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6" data-testid="tab-activity">
          <h3 className="font-heading font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Activity className="h-5 w-5 text-primary-700" /> Recent Activity</h3>
          {(d.notifications || []).length === 0 && <p className="text-sm text-slate-400">No recent activity</p>}
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {(d.notifications || []).map((n, i) => (
              <div key={i} className="text-sm border-l-2 border-primary-200 pl-3 py-1">
                <p className="text-slate-700 dark:text-slate-200 font-medium">{n.title}</p>
                <p className="text-[11px] text-slate-400">{n.body} · {fmtDate(n.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- LOGS ---- */}
      {tab === "logs" && (
        <div data-testid="tab-logs">
          <DataTable
            title="Activity Logs" subtitle="Auto-deleted after 30 days" rows={logs} loading={logsLoading}
            searchPlaceholder="Search logs…" searchKeys={["action", "detail", "actor_name"]} exportName="partner-logs"
            emptyText="No logs yet"
            columns={[
              { key: "created_at", label: "When", sortable: true, render: (l) => fmtDate(l.created_at) },
              { key: "actor_name", label: "By", render: (l) => <span>{l.actor_name} <Badge className="bg-slate-100 text-slate-500 border-0 ml-1 capitalize">{l.actor_role}</Badge></span> },
              { key: "action", label: "Action", render: (l) => <span className="font-mono text-xs text-primary-700">{l.action}</span> },
              { key: "detail", label: "Detail", render: (l) => l.detail || "—" },
            ]}
          />
        </div>
      )}

      {/* ---- modals ---- */}
      {editing && <EditPartnerModal user={u} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {suspending && <SuspendModal user={u} onClose={() => setSuspending(false)} onSaved={() => { setSuspending(false); reload(); }} />}
      {notify && <NotifyModal user={u} channel={notify} onClose={() => setNotify(null)} />}
      {popup && <RecordPopup title={popup.title} rows={popup.rows} onClose={() => setPopup(null)} />}
      <DocLightbox url={zoom?.url} label={zoom?.label} onClose={() => setZoom(null)} />
    </div>
  );
}

// tiny inline eye glyph to avoid extra import churn
const Eyeish = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
);
