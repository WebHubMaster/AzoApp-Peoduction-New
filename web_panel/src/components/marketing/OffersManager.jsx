import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgePercent, CalendarClock, CalendarX, MousePointerClick, TrendingUp, Wallet, Plus, Eye,
  Pencil, Copy, Power, Trash2, X, Monitor, Smartphone, ArrowRight, Image as ImageIcon,
} from "lucide-react";
import api, { fmt } from "@/lib/api";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import {
  Card, KpiCard, Field, Input, Select, Toggle, SaveBtn, StatusBadge, SectionHeader,
  inp, fmtNum, dt, cn, FilterChip,
} from "@/components/growth/admin/kit";
import DataTable from "@/components/growth/admin/DataTable";
import DateRangePicker from "@/components/growth/admin/DateRangePicker";
import AdvancedFilters, { FilterBtn } from "@/components/growth/admin/AdvancedFilters";

const EP = "/admin/collection/offers";
const today = () => new Date().toISOString().slice(0, 10);
const dispStatus = (o) => {
  const vf = (o.valid_from || "").slice(0, 10), vt = (o.valid_till || "").slice(0, 10), t = today();
  if (o.status === "draft") return "Draft";
  if (o.status === "paused") return "Paused";
  if (vt && vt < t) return "Expired";
  if (vf && vf > t) return "Scheduled";
  return o.status === "active" ? "Active" : "Inactive";
};

export default function OffersManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [filters, setFilters] = useState({ status: "", sort: "priority", range: {}, drawer: {} });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiStats, setApiStats] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(EP).then((r) => setRows(Array.isArray(r.data) ? r.data : (r.data?.items || []))).catch(() => setRows([])).finally(() => setLoading(false));
    api.get("/admin/offers/stats").then((r) => setApiStats(r.data)).catch(() => setApiStats(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const s = { active: 0, scheduled: 0, expired: 0 };
    rows.forEach((o) => { const d = dispStatus(o); if (d === "Active") s.active++; else if (d === "Scheduled") s.scheduled++; else if (d === "Expired") s.expired++; });
    return s;
  }, [rows]);

  const remove = async (o) => { if (!window.confirm(`Delete offer "${o.title}"?`)) return; try { await api.delete(`${EP}/${o.id}`); toast.success("Offer deleted"); load(); } catch { toast.error("Delete failed"); } };
  const toggle = async (o) => { try { await api.put(`${EP}/${o.id}`, { ...o, status: o.status === "active" ? "paused" : "active" }); toast.success("Status updated"); load(); } catch { toast.error("Failed"); } };
  const duplicate = async (o) => { const { id, _id, created_at, ...rest } = o; try { await api.post(EP, { ...rest, title: `${o.title} (copy)`, status: "draft" }); toast.success("Offer duplicated"); load(); } catch { toast.error("Failed"); } };

  const filtered = useMemo(() => {
    let d = [...rows];
    if (filters.status) d = d.filter((o) => dispStatus(o).toLowerCase() === filters.status.toLowerCase());
    if (filters.range?.from) d = d.filter((o) => (o.created_at || "").slice(0, 10) >= filters.range.from);
    if (filters.range?.to) d = d.filter((o) => (o.created_at || "").slice(0, 10) <= filters.range.to);
    const dr = filters.drawer || {};
    if (dr.coupon) d = d.filter((o) => (o.coupon_code || "").toLowerCase().includes(dr.coupon.toLowerCase()));
    const s = filters.sort;
    d.sort((a, b) => s === "priority" ? (a.order || 0) - (b.order || 0)
      : s === "newest" ? String(b.created_at || "").localeCompare(String(a.created_at || ""))
      : s === "oldest" ? String(a.created_at || "").localeCompare(String(b.created_at || ""))
      : (a.title || "").localeCompare(b.title || ""));
    return d;
  }, [rows, filters]);

  const chips = [];
  if (filters.status) chips.push({ k: "status", label: `Status: ${filters.status}` });
  if (filters.range?.from) chips.push({ k: "range", label: `${filters.range.from} → ${filters.range.to}` });

  const columns = [
    { key: "title", label: "Offer", sortable: true, render: (o) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-11 w-16 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 grid place-items-center">
            {o.image ? <img src={o.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-slate-300" />}
          </span>
          <div className="min-w-0"><p className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[220px]">{o.title}</p><p className="text-[11px] text-slate-400 truncate max-w-[220px]">{o.subtitle || ""}</p></div>
        </div>) },
    { key: "discount_label", label: "Discount", render: (o) => o.discount_label ? <span className="font-semibold text-primary-700 dark:text-primary-300">{o.discount_label}</span> : "—" },
    { key: "coupon_code", label: "Coupon", render: (o) => o.coupon_code ? <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{o.coupon_code}</span> : "—" },
    { key: "validity", label: "Validity", render: (o) => (o.valid_from || o.valid_till) ? `${o.valid_from ? dt(o.valid_from) : "—"} – ${o.valid_till ? dt(o.valid_till) : "—"}` : "No expiry" },
    { key: "clicks", label: "Clicks", align: "right", render: (o) => <span className="tabular-nums text-slate-600 dark:text-slate-300">{fmtNum(o.clicks || 0)}</span> },
    { key: "claims", label: "Claims", align: "right", render: (o) => <span className="tabular-nums font-semibold text-amber-600">{fmtNum(o.claims || 0)}</span> },
    { key: "conversions", label: "Conversions", align: "right", render: (o) => (
        <div className="text-right">
          <span className="tabular-nums font-semibold text-violet-600">{fmtNum(o.conversions || 0)}</span>
          {o.claims > 0 && <span className="block text-[10px] text-slate-400">{Math.round((o.conversions / o.claims) * 100)}% conv</span>}
        </div>) },
    { key: "order", label: "Priority", align: "center", sortable: true, render: (o) => <span className="inline-block h-6 min-w-6 px-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold leading-6">{o.order ?? 0}</span> },
    { key: "status", label: "Status", render: (o) => <StatusBadge status={dispStatus(o)} /> },
    { key: "__actions", label: "", exportable: false, render: (o) => (
        <div className="flex items-center gap-0.5 justify-end">
          <IconBtn title="Preview" onClick={() => setPreview(o)}><Eye className="h-4 w-4" /></IconBtn>
          <IconBtn title="Edit" onClick={() => setEditor(o)}><Pencil className="h-4 w-4" /></IconBtn>
          <IconBtn title="Duplicate" onClick={() => duplicate(o)}><Copy className="h-4 w-4" /></IconBtn>
          <IconBtn title={o.status === "active" ? "Pause" : "Activate"} onClick={() => toggle(o)}><Power className="h-4 w-4" /></IconBtn>
          <IconBtn title="Delete" danger onClick={() => remove(o)}><Trash2 className="h-4 w-4" /></IconBtn>
        </div>) },
  ];

  const mobileCard = (o) => (
    <div>
      <div className="flex items-center gap-3">
        <span className="h-12 w-16 rounded-lg bg-slate-100 overflow-hidden shrink-0">{o.image && <img src={o.image} alt="" className="h-full w-full object-cover" />}</span>
        <div className="min-w-0 flex-1"><p className="font-semibold truncate">{o.title}</p><p className="text-xs text-primary-700">{o.discount_label}</p></div>
        <StatusBadge status={dispStatus(o)} />
      </div>
      <div className="mt-2 flex gap-1">
        <IconBtn title="Preview" onClick={() => setPreview(o)}><Eye className="h-4 w-4" /></IconBtn>
        <IconBtn title="Edit" onClick={() => setEditor(o)}><Pencil className="h-4 w-4" /></IconBtn>
        <IconBtn title="Duplicate" onClick={() => duplicate(o)}><Copy className="h-4 w-4" /></IconBtn>
        <IconBtn title="Toggle" onClick={() => toggle(o)}><Power className="h-4 w-4" /></IconBtn>
        <IconBtn title="Delete" danger onClick={() => remove(o)}><Trash2 className="h-4 w-4" /></IconBtn>
      </div>
    </div>
  );

  return (
    <div data-testid="offers-manager" className="w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900 dark:text-white">Offers</h1>
          <p className="text-sm text-slate-500 mt-1">Create attractive promotional campaigns for customers.</p>
        </div>
        <button data-testid="create-offer-btn" onClick={() => setEditor({})} className="h-11 px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold inline-flex items-center gap-2"><Plus className="h-4.5 w-4.5" /> Create Offer</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KpiCard label="Active Offers" value={apiStats ? fmtNum(apiStats.active) : (loading ? "…" : fmtNum(stats.active))} icon={BadgePercent} tone="green" />
        <KpiCard label="Scheduled" value={apiStats ? fmtNum(apiStats.scheduled) : (loading ? "…" : fmtNum(stats.scheduled))} icon={CalendarClock} tone="sky" />
        <KpiCard label="Expired" value={apiStats ? fmtNum(apiStats.expired) : (loading ? "…" : fmtNum(stats.expired))} icon={CalendarX} tone="slate" />
        <KpiCard label="Total Claims" value={apiStats ? fmtNum(apiStats.total_claims) : "…"} icon={MousePointerClick} tone="amber" sub={apiStats ? `CTR ${apiStats.ctr}%` : ""} />
        <KpiCard label="Conversions" value={apiStats ? fmtNum(apiStats.conversions) : "…"} icon={TrendingUp} tone="violet" sub={apiStats ? `${apiStats.conversion_rate}% rate` : ""} />
        <KpiCard label="Revenue Generated" value={apiStats ? fmt(apiStats.revenue) : "…"} icon={Wallet} tone="primary" />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {chips.map((c) => <FilterChip key={c.k} label={c.label} onRemove={() => setFilters((p) => ({ ...p, [c.k]: c.k === "range" ? {} : "" }))} />)}
        </div>
      )}

      <DataTable
        testId="offers-table"
        columns={columns}
        rows={filtered}
        loading={loading}
        getRowId={(o) => o.id}
        searchKeys={["title", "subtitle", "coupon_code", "discount_label"]}
        searchPlaceholder="Search offers…"
        exportFilename="offers.csv"
        emptyTitle="No offers yet"
        emptyHint="Create your first promotional campaign."
        emptyIcon={BadgePercent}
        mobileCard={mobileCard}
        toolbar={
          <>
            <Select className="!h-10 !w-auto" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              <option value="">All statuses</option>{["Active", "Scheduled", "Expired", "Draft", "Paused"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Select className="!h-10 !w-auto" value={filters.sort} onChange={(e) => setFilters((p) => ({ ...p, sort: e.target.value }))}>
              <option value="priority">Priority</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title A–Z</option>
            </Select>
          </>
        }
        toolbarRight={
          <>
            <DateRangePicker value={filters.range} onChange={(v) => setFilters((p) => ({ ...p, range: v }))} />
            <FilterBtn onClick={() => setDrawerOpen(true)} count={Object.values(filters.drawer || {}).filter(Boolean).length} />
          </>
        }
      />

      <AdvancedFilters
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters.drawer}
        fields={[{ key: "coupon", label: "Coupon Code", type: "text" }]}
        onApply={(v) => setFilters((p) => ({ ...p, drawer: v }))}
        onReset={() => setFilters((p) => ({ ...p, drawer: {} }))}
        savedFilters={[{ name: "Expiring Offers", values: {} }]}
        onSaveFilter={() => toast.success("Filter saved")}
      />

      {editor && <OfferEditor offer={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
      {preview && <OfferPreviewModal offer={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

const IconBtn = ({ children, onClick, title, danger }) => (
  <button title={title} onClick={onClick} className={cn("h-8 w-8 grid place-items-center rounded-lg text-slate-400 transition-colors", danger ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-primary-600 hover:bg-primary-50")}>{children}</button>
);

function OfferCard({ o, compact }) {
  return (
    <div className={cn("rounded-2xl overflow-hidden text-white shadow-lg relative", compact ? "" : "")} style={{ background: o.bg_color || "#0D47A1" }}>
      {o.image && <img src={o.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
      <div className="relative p-4">
        {o.subtitle && <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">{o.subtitle}</p>}
        <p className={cn("font-black leading-tight mt-1", compact ? "text-base" : "text-xl")}>{o.title || "Offer title"}</p>
        {o.discount_label && <span className="inline-block mt-2 rounded-lg bg-white/20 px-2 py-1 text-sm font-bold">{o.discount_label}</span>}
        {o.description && !compact && <p className="text-xs opacity-90 mt-2 line-clamp-2">{o.description}</p>}
        <div className="mt-3"><span className="inline-flex items-center gap-1 rounded-lg bg-white text-slate-900 px-3 py-1.5 text-xs font-bold">{o.cta_text || "Grab Offer"} <ArrowRight className="h-3.5 w-3.5" /></span></div>
      </div>
    </div>
  );
}

function OfferPreviewModal({ offer, onClose }) {
  const [mode, setMode] = useState("desktop");
  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 dark:text-white">Offer Preview</h3>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button onClick={() => setMode("desktop")} className={cn("h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1", mode === "desktop" ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500")}><Monitor className="h-3.5 w-3.5" /> Desktop</button>
            <button onClick={() => setMode("mobile")} className={cn("h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1", mode === "mobile" ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500")}><Smartphone className="h-3.5 w-3.5" /> Mobile</button>
            <button onClick={onClose} className="ml-1 h-8 w-8 grid place-items-center rounded-lg text-slate-400"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {mode === "desktop"
          ? <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-800/40"><OfferCard o={offer} /></div>
          : <div className="mx-auto w-[260px] rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 p-2"><div className="rounded-[1.4rem] bg-white p-3"><OfferCard o={offer} compact /></div></div>}
      </div>
    </div>
  );
}

function OfferEditor({ offer, onClose, onSaved }) {
  const isNew = !offer.id;
  const [f, setF] = useState({
    title: offer.title || "", subtitle: offer.subtitle || "", description: offer.description || "",
    discount_label: offer.discount_label || "", coupon_code: offer.coupon_code || "", image: offer.image || "",
    cta_text: offer.cta_text || "Grab Offer", link: offer.link || "/services", bg_color: offer.bg_color || "#0D47A1",
    order: offer.order ?? 1, target_audience: offer.target_audience || "all",
    valid_from: (offer.valid_from || "").slice(0, 10), valid_till: (offer.valid_till || "").slice(0, 10), status: offer.status || "active",
  });
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("desktop");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.title.trim()) return toast.error("Offer title required");
    setBusy(true);
    const payload = { ...f, order: Number(f.order) };
    try {
      if (isNew) await api.post(EP, payload); else await api.put(`${EP}/${offer.id}`, payload);
      toast.success(isNew ? "Offer created" : "Offer updated"); onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white">{isNew ? "Create Offer" : "Edit Offer"}</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Field label="Offer Title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="First Booking? Get 50% OFF" data-testid="offer-title" /></Field>
            <Field label="Subtitle"><Input value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="NEW USER OFFER" /></Field>
            <Field label="Description"><textarea className={inp + " h-20 py-2"} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Discount Label"><Input value={f.discount_label} onChange={(e) => set("discount_label", e.target.value)} placeholder="50% OFF" /></Field>
              <Field label="Coupon Code"><Input value={f.coupon_code} onChange={(e) => set("coupon_code", e.target.value.toUpperCase())} placeholder="AZO50" /></Field>
              <Field label="CTA Text"><Input value={f.cta_text} onChange={(e) => set("cta_text", e.target.value)} /></Field>
              <Field label="Destination"><Input value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="/services" /></Field>
              <Field label="Priority"><Input type="number" value={f.order} onChange={(e) => set("order", e.target.value)} /></Field>
              <Field label="Background"><input type="color" className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer" value={f.bg_color} onChange={(e) => set("bg_color", e.target.value)} /></Field>
              <Field label="Start Date"><PremiumDatePicker value={f.valid_from} onChange={(e) => set("valid_from", e.target.value)} /></Field>
              <Field label="End Date"><PremiumDatePicker value={f.valid_till} onChange={(e) => set("valid_till", e.target.value)} /></Field>
              <Field label="Target Audience"><Select value={f.target_audience} onChange={(e) => set("target_audience", e.target.value)}><option value="all">All customers</option><option value="new">New only</option><option value="repeat">Repeat only</option></Select></Field>
            </div>
            <Field label="Offer Image URL"><Input value={f.image} onChange={(e) => set("image", e.target.value)} placeholder="https://…" /></Field>
            <Toggle checked={f.status === "active"} onChange={(v) => set("status", v ? "active" : "paused")} label={f.status === "active" ? "Active" : "Paused"} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500">Live Preview</p>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button onClick={() => setMode("desktop")} className={cn("h-7 px-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1", mode === "desktop" ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500")}><Monitor className="h-3.5 w-3.5" /> Desktop</button>
                <button onClick={() => setMode("mobile")} className={cn("h-7 px-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1", mode === "mobile" ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500")}><Smartphone className="h-3.5 w-3.5" /> Mobile</button>
              </div>
            </div>
            {mode === "desktop"
              ? <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 bg-slate-50 dark:bg-slate-800/40"><OfferCard o={f} /></div>
              : <div className="mx-auto w-[240px] rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 p-2"><div className="rounded-[1.4rem] bg-white p-2.5"><OfferCard o={f} compact /></div></div>}
          </div>
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
          <SaveBtn onClick={save} busy={busy} testId="offer-save">{isNew ? "Create Offer" : "Save Changes"}</SaveBtn>
        </div>
      </div>
    </div>
  );
}
