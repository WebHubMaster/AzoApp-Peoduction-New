import { useEffect, useState, useCallback, useMemo } from "react";
import { Percent, Search, AlertTriangle, CheckCircle2, Pencil, Loader2, Plus, Trash2, Layers, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const COMM = [
  ["partner_pct", "Partner Commission %", "bg-emerald-500"],
  ["platform_pct", "Platform Commission %", "bg-blue-600"],
  ["merchant_partner_referral_pct", "Merchant · Partner Referral %", "bg-amber-500"],
  ["merchant_customer_pct", "Merchant · Customer %", "bg-violet-500"],
];
const CANC = [["customer_refund_pct", "Customer Refund %"], ["partner_cancellation_pct", "Partner Cancellation %"]];
const EMPTY = { partner_pct: "", platform_pct: "", merchant_partner_referral_pct: "", merchant_customer_pct: "", customer_refund_pct: "", partner_cancellation_pct: "" };
const sum = (f, keys) => keys.reduce((s, [k]) => s + (Number(f[k]) || 0), 0);
const ok100 = (n) => Math.abs(n - 100) < 0.01;
const errMsg = (e) => { const d = e?.response?.data?.detail; return typeof d === "string" ? d : "Save failed"; };

export default function CategoryCommissions() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api.get("/admin/category-commissions").then((r) => setData(r.data)).catch(() => toast.error("Could not load categories")), []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.categories || []).filter((c) =>
    c.name?.toLowerCase().includes(q.toLowerCase()) &&
    (filter === "all" || (filter === "pending" ? !c.configured : c.configured))), [data, q, filter]);

  if (!data) return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  const pending = data.total - data.configured;

  return (
    <div className="space-y-6" data-testid="category-commission-page">
      <Header data={data} pending={pending} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="cc-search" className="pl-9" placeholder="Search category" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold">
          {[["all", "All"], ["pending", "Rate required"], ["done", "Configured"]].map(([k, l]) => (
            <button key={k} data-testid={`cc-filter-${k}`} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full transition-colors ${filter === k ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3" data-testid="cc-list">
        {rows.length === 0 && <p className="text-sm text-slate-400 py-10 text-center">No categories found. Create categories in Services → Service Categories.</p>}
        {rows.map((c) => <CategoryRow key={c.id} c={c} onEdit={() => setEditing(c)} />)}
      </div>
      <CancellationReasons />
      {editing && <RateDialog cat={editing} others={(data.categories || []).filter((x) => x.id !== editing.id)}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function Header({ data, pending }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-emerald-50 grid place-items-center shrink-0"><Percent className="h-5 w-5 text-emerald-600" /></div>
        <div>
          <h2 className="font-heading text-xl font-bold text-slate-800">Commission &amp; Refund</h2>
          <p className="text-sm text-slate-500">Set commission split and cancellation refund for every service category. New bookings use their category&apos;s rate; existing bookings keep the rate captured at booking time.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-xl">
        <Stat label="Categories" value={data.total} tid="cc-stat-total" />
        <Stat label="Configured" value={data.configured} tid="cc-stat-configured" tone="text-emerald-600" />
        <Stat label="Rate required" value={pending} tid="cc-stat-pending" tone={pending ? "text-rose-600" : "text-slate-800"} />
      </div>
      {pending > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" data-testid="cc-pending-banner">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span><b>{pending} {pending === 1 ? "category needs" : "categories need"} a commission rate.</b> Commission is mandatory for every category — until set, bookings in it fall back to the platform default split.</span>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value, tid, tone = "text-slate-800" }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
    <p className={`text-2xl font-bold tabular-nums ${tone}`} data-testid={tid}>{value}</p>
  </div>
);

function CategoryRow({ c, onEdit }) {
  const r = c.commission;
  return (
    <div className={`bg-white rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center gap-4 transition-shadow hover:shadow-sm ${c.configured ? "border-slate-200" : "border-rose-200"}`} data-testid={`cc-row-${c.id}`}>
      <div className="flex items-center gap-3 lg:w-64 shrink-0 min-w-0">
        {c.image ? <img src={c.image} alt="" className="h-11 w-11 rounded-xl object-cover shrink-0" /> : <div className="h-11 w-11 rounded-xl bg-slate-100 grid place-items-center shrink-0"><Layers className="h-5 w-5 text-slate-400" /></div>}
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate" data-testid={`cc-name-${c.id}`}>{c.name}</p>
          <p className="text-xs text-slate-400">{c.service_count} services{c.status && c.status !== "active" ? ` · ${c.status}` : ""}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {r ? <RateSummary r={r} id={c.id} /> : <p className="text-sm text-rose-600 font-medium" data-testid={`cc-missing-${c.id}`}>No commission set for this category</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {c.configured
          ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1" data-testid={`cc-status-${c.id}`}><CheckCircle2 className="h-3.5 w-3.5" /> Configured</span>
          : <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700" data-testid={`cc-status-${c.id}`}>Rate required</span>}
        <Button size="sm" variant={c.configured ? "outline" : "default"} className={c.configured ? "" : "bg-emerald-600 hover:bg-emerald-700"} data-testid={`cc-edit-${c.id}`} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> {c.configured ? "Edit" : "Set rate"}
        </Button>
      </div>
    </div>
  );
}

function RateSummary({ r, id }) {
  return (
    <div className="space-y-2" data-testid={`cc-rates-${id}`}>
      <div className="flex h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
        {COMM.map(([k, , bg]) => <div key={k} style={{ width: `${Number(r[k]) || 0}%` }} className={bg} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {COMM.map(([k, label, bg]) => (
          <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${bg}`} />{label.replace(" %", "")} <b className="tabular-nums text-slate-800">{r[k]}%</b></span>
        ))}
        <span className="flex items-center gap-1.5 text-slate-500"><RotateCcw className="h-3 w-3" /> Refund <b className="tabular-nums text-slate-800">{r.customer_refund_pct}%</b> · Partner cancel <b className="tabular-nums text-slate-800">{r.partner_cancellation_pct}%</b></span>
      </div>
    </div>
  );
}

function RateDialog({ cat, others, onClose, onSaved }) {
  const [f, setF] = useState(cat.commission ? { ...cat.commission } : EMPTY);
  const [applyIds, setApplyIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const commTotal = sum(f, COMM);
  const cancTotal = sum(f, CANC);
  const filled = Object.keys(EMPTY).every((k) => f[k] !== "" && f[k] !== null && f[k] !== undefined);
  const valid = filled && ok100(commTotal) && ok100(cancTotal);
  const toggle = (id) => setApplyIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const save = async () => {
    if (!valid) return toast.error("Fill all fields — each split must total 100%");
    setBusy(true);
    const rates = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, Number(f[k])]));
    try {
      await api.put(`/admin/category-commissions/${cat.id}`, rates);
      if (applyIds.length) await api.post("/admin/category-commissions/bulk", { category_ids: applyIds, rates });
      toast.success(`Rates saved for ${cat.name}${applyIds.length ? ` + ${applyIds.length} more` : ""}`);
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto" data-testid="cc-modal">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-emerald-600" /> {cat.name} · Commission &amp; Refund</DialogTitle></DialogHeader>
        <SplitSection title="Commission Split" hint="(of service cost, GST excluded)" total={commTotal} tid="cc-comm-total">
          {COMM.map(([k, label]) => <Field key={k} k={k} label={label} f={f} set={set} />)}
        </SplitSection>
        <Simulator f={f} />
        <SplitSection title="Cancellation & Refund" hint="(before work starts)" total={cancTotal} tid="cc-canc-total">
          {CANC.map(([k, label]) => <Field key={k} k={k} label={label} f={f} set={set} />)}
        </SplitSection>
        {others.length > 0 && <ApplyOthers others={others} ids={applyIds} toggle={toggle} />}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="cc-cancel">Cancel</Button>
          <Button onClick={save} disabled={busy || !valid} className="bg-emerald-600 hover:bg-emerald-700" data-testid="cc-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save rates"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SplitSection({ title, hint, total, tid, children }) {
  const good = ok100(total);
  return (
    <div className="space-y-1 pt-3 border-t border-slate-100 first:border-0 first:pt-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-700">{title} <span className="font-normal text-slate-400">{hint}</span></p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${good ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`} data-testid={tid}>Total {Math.round(total * 100) / 100}%</span>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1">{children}</div>
      {!good && <p className="text-xs text-rose-600 mt-1">Must total 100%.</p>}
    </div>
  );
}

const Field = ({ k, label, f, set }) => (
  <div className="min-w-0">
    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
    <Input type="number" min="0" max="100" step="0.01" data-testid={`cc-${k}`} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} placeholder="0" />
  </div>
);

function Simulator({ f }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-testid="cc-simulator">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-600">Live split preview</p>
        <span className="text-[11px] text-slate-400">on a <b className="text-slate-600">₹100</b> service</span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full mb-2.5 bg-slate-200">
        {COMM.map(([k, , bg]) => <div key={k} style={{ width: `${Math.max(0, Number(f[k]) || 0)}%` }} className={`${bg} transition-[width] duration-300`} />)}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
        {COMM.map(([k, label, bg]) => (
          <span key={k} className="flex items-center gap-1.5 text-slate-600" data-testid={`cc-sim-${k}`}>
            <span className={`h-2.5 w-2.5 rounded-sm shrink-0 ${bg}`} /><span className="truncate">{label.replace(" %", "")}</span>
            <b className="ml-auto tabular-nums text-slate-800">₹{Number(f[k]) || 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function ApplyOthers({ others, ids, toggle }) {
  return (
    <div className="pt-3 border-t border-slate-100 space-y-2" data-testid="cc-apply-others">
      <p className="text-sm font-bold text-slate-700">Also apply to <span className="font-normal text-slate-400">(optional)</span></p>
      <div className="max-h-36 overflow-y-auto grid grid-cols-2 gap-2 pr-1">
        {others.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <Checkbox checked={ids.includes(o.id)} onCheckedChange={() => toggle(o.id)} data-testid={`cc-apply-${o.id}`} />
            <span className="truncate">{o.name}</span>
            {!o.configured && <span className="text-[10px] text-rose-600 font-semibold">required</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

function CancellationReasons() {
  const [reasons, setReasons] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/settings").then((r) => setReasons(r.data?.cancellation_reasons || [])).catch(() => setReasons([])); }, []);
  const setAt = (i, v) => setReasons((o) => o.map((x, idx) => (idx === i ? v : x)));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/settings", { cancellation_reasons: reasons.map((r) => r.trim()).filter(Boolean) });
      toast.success("Cancellation reasons saved");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (reasons === null) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 max-w-2xl" data-testid="cancel-reasons-editor">
      <div className="flex items-center justify-between">
        <p className="font-bold text-slate-700">Cancellation Reasons <span className="font-normal text-slate-400 text-sm">(all categories)</span></p>
        <Button type="button" variant="outline" size="sm" data-testid="add-cancel-reason" onClick={() => setReasons((o) => [...o, ""])}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
      </div>
      <p className="text-xs text-slate-400">Customers pick one of these when cancelling. An &quot;Other&quot; free-text option is always added automatically.</p>
      <div className="space-y-2">
        {reasons.length === 0 && <p className="text-xs text-slate-400 italic">No reasons yet.</p>}
        {reasons.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input data-testid={`cancel-reason-input-${i}`} value={r} onChange={(e) => setAt(i, e.target.value)} placeholder={`Reason ${i + 1}`} />
            <Button type="button" variant="ghost" size="icon" className="text-rose-500 shrink-0" data-testid={`remove-cancel-reason-${i}`} onClick={() => setReasons((o) => o.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end"><Button onClick={save} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" data-testid="cancel-reasons-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save reasons"}</Button></div>
    </div>
  );
}
