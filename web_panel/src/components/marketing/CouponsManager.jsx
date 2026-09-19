import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ticket, CheckCircle2, CalendarX, Repeat, TrendingDown, Wallet, Plus, Eye, Pencil, Copy,
  Power, Trash2, X, RefreshCw, ClipboardCopy, ShoppingBag, Users, Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import {
  Card, KpiCard, Field, Input, Select, Toggle, SaveBtn, StatusBadge, SectionHeader,
  inp, fmt, fmtNum, dt, cn, FilterChip, EmptyState,
} from "@/components/growth/admin/kit";
import DataTable from "@/components/growth/admin/DataTable";
import DateRangePicker from "@/components/growth/admin/DateRangePicker";
import AdvancedFilters, { FilterBtn } from "@/components/growth/admin/AdvancedFilters";

const isExpired = (c) => { const v = (c.valid_till || "").slice(0, 10); return v && v < new Date().toISOString().slice(0, 10); };
const dispStatus = (c) => (isExpired(c) ? "Expired" : (c.status === "active" ? "Active" : "Inactive"));
const discLabel = (c) => (c.discount_type === "percentage" ? `${c.discount_value}% OFF` : `${fmt(c.discount_value)} OFF`);

export default function CouponsManager() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);     // coupon object or {} for new
  const [detail, setDetail] = useState(null);      // coupon id for drawer
  const [filters, setFilters] = useState({ status: "", type: "", range: {}, drawer: {} });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/admin/coupons").then((r) => setRows(r.data || [])),
      api.get("/admin/coupons/stats").then((r) => setStats(r.data || {})),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return;
    try { await api.delete(`/admin/coupons/${c.id}`); toast.success("Coupon deleted"); load(); } catch { toast.error("Delete failed"); }
  };
  const toggle = async (c) => {
    try { await api.put(`/admin/coupons/${c.id}`, { status: c.status === "active" ? "inactive" : "active" }); toast.success("Status updated"); load(); } catch { toast.error("Failed"); }
  };
  const duplicate = async (c) => {
    const { id, _id, created_at, used, redemptions, discount_given, revenue, unique_customers, remaining, ...rest } = c;
    try { await api.post("/admin/coupons", { ...rest, code: `${c.code}COPY`, status: "inactive" }); toast.success("Coupon duplicated"); load(); } catch { toast.error("Duplicate failed"); }
  };

  const filtered = useMemo(() => {
    let d = rows;
    if (filters.status) d = d.filter((c) => dispStatus(c).toLowerCase() === filters.status.toLowerCase());
    if (filters.type) d = d.filter((c) => c.discount_type === filters.type);
    if (filters.range?.from) d = d.filter((c) => (c.created_at || "").slice(0, 10) >= filters.range.from);
    if (filters.range?.to) d = d.filter((c) => (c.created_at || "").slice(0, 10) <= filters.range.to);
    const dr = filters.drawer || {};
    if (dr.code) d = d.filter((c) => (c.code || "").toLowerCase().includes(dr.code.toLowerCase()));
    if (dr.disc_min) d = d.filter((c) => Number(c.discount_value || 0) >= Number(dr.disc_min));
    if (dr.disc_max) d = d.filter((c) => Number(c.discount_value || 0) <= Number(dr.disc_max));
    return d;
  }, [rows, filters]);

  const chips = [];
  if (filters.status) chips.push({ k: "status", label: `Status: ${filters.status}` });
  if (filters.type) chips.push({ k: "type", label: `Type: ${filters.type}` });
  if (filters.range?.from) chips.push({ k: "range", label: `${filters.range.from} → ${filters.range.to}` });

  const columns = [
    { key: "code", label: "Coupon", sortable: true, render: (c) => (
        <div className="min-w-0"><p className="font-heading font-bold text-primary-700 dark:text-primary-300">{c.code}</p>{c.title && <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{c.title}</p>}</div>) },
    { key: "discount_value", label: "Discount", sortable: true, render: (c) => <span className="font-semibold">{discLabel(c)}</span>, sortValue: (c) => Number(c.discount_value || 0) },
    { key: "min_order", label: "Min Order", align: "right", render: (c) => fmt(c.min_order) },
    { key: "max_discount", label: "Max Discount", align: "right", render: (c) => (c.max_discount ? fmt(c.max_discount) : "—") },
    { key: "redemptions", label: "Usage", align: "right", sortable: true, render: (c) => `${fmtNum(c.redemptions)}${c.usage_limit ? ` / ${fmtNum(c.usage_limit)}` : ""}`, sortValue: (c) => Number(c.redemptions || 0) },
    { key: "remaining", label: "Remaining", align: "right", render: (c) => (c.remaining == null ? "∞" : fmtNum(c.remaining)) },
    { key: "valid_from", label: "Valid From", render: (c) => (c.valid_from ? dt(c.valid_from) : "—") },
    { key: "valid_till", label: "Valid Until", render: (c) => (c.valid_till ? dt(c.valid_till) : "—") },
    { key: "status", label: "Status", render: (c) => <StatusBadge status={dispStatus(c)} /> },
    { key: "revenue", label: "Revenue", align: "right", render: (c) => fmt(c.revenue), exportValue: (c) => c.revenue },
    { key: "__actions", label: "", exportable: false, render: (c) => (
        <div className="flex items-center gap-0.5 justify-end">
          <IconBtn title="View" onClick={() => setDetail(c.id)}><Eye className="h-4 w-4" /></IconBtn>
          <IconBtn title="Edit" onClick={() => setEditor(c)}><Pencil className="h-4 w-4" /></IconBtn>
          <IconBtn title="Duplicate" onClick={() => duplicate(c)}><Copy className="h-4 w-4" /></IconBtn>
          <IconBtn title={c.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggle(c)}><Power className="h-4 w-4" /></IconBtn>
          <IconBtn title="Delete" danger onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></IconBtn>
        </div>) },
  ];

  const mobileCard = (c) => (
    <div>
      <div className="flex items-center justify-between">
        <div><p className="font-heading font-bold text-primary-700">{c.code}</p><p className="text-xs text-slate-400">{c.title}</p></div>
        <StatusBadge status={dispStatus(c)} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div><span className="block text-slate-400">Discount</span><b className="text-slate-700">{discLabel(c)}</b></div>
        <div><span className="block text-slate-400">Usage</span><b className="text-slate-700">{fmtNum(c.redemptions)}{c.usage_limit ? `/${fmtNum(c.usage_limit)}` : ""}</b></div>
        <div><span className="block text-slate-400">Revenue</span><b className="text-slate-700">{fmt(c.revenue)}</b></div>
      </div>
      <div className="mt-2 flex gap-1">
        <IconBtn title="View" onClick={() => setDetail(c.id)}><Eye className="h-4 w-4" /></IconBtn>
        <IconBtn title="Edit" onClick={() => setEditor(c)}><Pencil className="h-4 w-4" /></IconBtn>
        <IconBtn title="Duplicate" onClick={() => duplicate(c)}><Copy className="h-4 w-4" /></IconBtn>
        <IconBtn title={c.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggle(c)}><Power className="h-4 w-4" /></IconBtn>
        <IconBtn title="Delete" danger onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></IconBtn>
      </div>
    </div>
  );

  return (
    <div data-testid="coupons-manager" className="w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900 dark:text-white">Coupons</h1>
          <p className="text-sm text-slate-500 mt-1">Create, manage and monitor promotional coupon codes.</p>
        </div>
        <button data-testid="create-coupon-btn" onClick={() => setEditor({})} className="h-11 px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold inline-flex items-center gap-2 transition-colors"><Plus className="h-4.5 w-4.5" /> Create Coupon</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KpiCard label="Total Coupons" value={loading ? "…" : fmtNum(stats.total)} icon={Ticket} tone="primary" />
        <KpiCard label="Active" value={loading ? "…" : fmtNum(stats.active)} icon={CheckCircle2} tone="green" />
        <KpiCard label="Expired" value={loading ? "…" : fmtNum(stats.expired)} icon={CalendarX} tone="slate" />
        <KpiCard label="Redemptions" value={loading ? "…" : fmtNum(stats.redemptions)} icon={Repeat} tone="sky" />
        <KpiCard label="Discount Given" value={loading ? "…" : fmt(stats.discount_given)} icon={TrendingDown} tone="amber" />
        <KpiCard label="Revenue Generated" value={loading ? "…" : fmt(stats.revenue)} icon={Wallet} tone="violet" />
      </div>

      <AbsorptionReport />

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {chips.map((c) => <FilterChip key={c.k} label={c.label} onRemove={() => setFilters((p) => ({ ...p, [c.k]: c.k === "range" ? {} : "" }))} />)}
          <button onClick={() => setFilters({ status: "", type: "", range: {}, drawer: {} })} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Clear all</button>
        </div>
      )}

      <DataTable
        testId="coupons-table"
        columns={columns}
        rows={filtered}
        loading={loading}
        getRowId={(c) => c.id}
        searchKeys={["code", "title", "description"]}
        searchPlaceholder="Search coupon…"
        exportFilename="coupons.csv"
        emptyTitle="No coupons yet"
        emptyHint="Create your first promotional coupon to get started."
        emptyIcon={Ticket}
        mobileCard={mobileCard}
        toolbar={
          <>
            <Select className="!h-10 !w-auto" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              <option value="">All statuses</option>{["Active", "Inactive", "Expired"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Select className="!h-10 !w-auto" value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}>
              <option value="">All types</option><option value="percentage">Percentage</option><option value="fixed">Fixed</option>
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
        fields={[
          { key: "code", label: "Coupon Code", type: "text", placeholder: "SAVE…" },
          { key: "disc", label: "Discount Value Range", type: "numrange" },
        ]}
        onApply={(v) => setFilters((p) => ({ ...p, drawer: v }))}
        onReset={() => setFilters((p) => ({ ...p, drawer: {} }))}
        savedFilters={[{ name: "Active Coupons", values: {} }]}
        onSaveFilter={() => toast.success("Filter saved")}
      />

      {editor && <CouponEditor coupon={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
      {detail && <CouponDrawer couponId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

const IconBtn = ({ children, onClick, title, danger }) => (
  <button title={title} onClick={onClick} className={cn("h-8 w-8 grid place-items-center rounded-lg text-slate-400 transition-colors", danger ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-primary-600 hover:bg-primary-50")}>{children}</button>
);

/* ------------------------------------------------------------ editor modal */
function randomCode(prefix = "", suffix = "") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${s}${suffix}`.toUpperCase();
}

function CouponEditor({ coupon, onClose, onSaved }) {
  const isNew = !coupon.id;
  const [f, setF] = useState({
    code: coupon.code || "", title: coupon.title || "", discount_type: coupon.discount_type || "percentage",
    discount_value: coupon.discount_value ?? 10, min_order: coupon.min_order ?? 0, max_discount: coupon.max_discount ?? 0,
    usage_limit: coupon.usage_limit ?? 1000, per_user_limit: coupon.per_user_limit ?? 0,
    valid_from: (coupon.valid_from || "").slice(0, 10), valid_till: (coupon.valid_till || "").slice(0, 10),
    target_audience: coupon.target_audience || "all", description: coupon.description || "", status: coupon.status || "active",
  });
  const [busy, setBusy] = useState(false);
  const [prefix, setPrefix] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.code.trim()) return toast.error("Coupon code required");
    setBusy(true);
    const payload = {
      ...f, code: f.code.toUpperCase(), discount_value: Number(f.discount_value), min_order: Number(f.min_order),
      max_discount: Number(f.max_discount), usage_limit: Number(f.usage_limit), per_user_limit: Number(f.per_user_limit),
    };
    try {
      if (isNew) await api.post("/admin/coupons", payload);
      else await api.put(`/admin/coupons/${coupon.id}`, payload);
      toast.success(isNew ? "Coupon created" : "Coupon updated"); onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };
  const copyCode = () => { navigator.clipboard?.writeText(f.code); toast.success("Code copied"); };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-slate-900 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white">{isNew ? "Create Coupon" : `Edit ${coupon.code}`}</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* code + generate */}
            <Field label="Coupon Code" hint="Customers enter this at checkout">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="SAVE100" data-testid="coupon-code" />
                  {f.code && <button onClick={copyCode} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary-600"><ClipboardCopy className="h-4 w-4" /></button>}
                </div>
                <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="Prefix" className={cn(inp, "!w-24")} />
                <button onClick={() => set("code", randomCode(prefix))} className="h-10 px-3 rounded-xl bg-primary-50 text-primary-700 font-semibold text-sm inline-flex items-center gap-1.5 shrink-0 hover:bg-primary-100"><RefreshCw className="h-4 w-4" /> Generate</button>
              </div>
            </Field>
            <Field label="Title / Internal name"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Monsoon Sale" /></Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Discount Type"><Select value={f.discount_type} onChange={(e) => set("discount_type", e.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option></Select></Field>
              <Field label={f.discount_type === "percentage" ? "Discount (%)" : "Discount (₹)"}><Input type="number" value={f.discount_value} onChange={(e) => set("discount_value", e.target.value)} /></Field>
              <Field label="Max Discount (₹)" hint="0 = no cap"><Input type="number" value={f.max_discount} onChange={(e) => set("max_discount", e.target.value)} /></Field>
              <Field label="Minimum Order (₹)"><Input type="number" value={f.min_order} onChange={(e) => set("min_order", e.target.value)} /></Field>
              <Field label="Usage Limit" hint="Total redemptions allowed"><Input type="number" value={f.usage_limit} onChange={(e) => set("usage_limit", e.target.value)} /></Field>
              <Field label="Usage Per Customer" hint="0 = unlimited"><Input type="number" value={f.per_user_limit} onChange={(e) => set("per_user_limit", e.target.value)} /></Field>
              <Field label="Start Date"><PremiumDatePicker value={f.valid_from} onChange={(e) => set("valid_from", e.target.value)} /></Field>
              <Field label="End Date"><PremiumDatePicker value={f.valid_till} onChange={(e) => set("valid_till", e.target.value)} /></Field>
              <Field label="Target Audience"><Select value={f.target_audience} onChange={(e) => set("target_audience", e.target.value)}><option value="all">All customers</option><option value="new">New only</option><option value="repeat">Repeat only</option></Select></Field>
            </div>
            <div className="flex items-center gap-6">
              <Toggle checked={f.status === "active"} onChange={(v) => set("status", v ? "active" : "inactive")} label={f.status === "active" ? "Active" : "Inactive"} />
            </div>
          </div>
          {/* live preview */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Live Preview</p>
            <div className="rounded-2xl border-2 border-dashed border-primary-200 dark:border-primary-900/50 bg-primary-50/40 dark:bg-primary-900/10 p-4">
              <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300"><Sparkles className="h-4 w-4" /><span className="font-heading font-black tracking-wide">{f.code || "YOURCODE"}</span></div>
              <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{f.discount_type === "percentage" ? `${f.discount_value || 0}% OFF` : `${fmt(f.discount_value)} OFF`}</p>
              {f.title && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{f.title}</p>}
              <div className="mt-3 text-xs text-slate-500 space-y-1">
                {Number(f.min_order) > 0 && <p>Minimum order {fmt(f.min_order)}</p>}
                {Number(f.max_discount) > 0 && <p>Up to {fmt(f.max_discount)} off</p>}
                <p>{f.valid_till ? `Valid until ${dt(f.valid_till)}` : "No expiry"}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
          <SaveBtn onClick={save} busy={busy} testId="coupon-save">{isNew ? "Create Coupon" : "Save Changes"}</SaveBtn>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ view drawer */
function CouponDrawer({ couponId, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/admin/coupons/${couponId}/usage`).then((r) => setData(r.data)).catch(() => setData({ coupon: null, orders: [], customers: [] })); }, [couponId]);
  const c = data?.coupon;
  const orders = data?.orders || [];
  const customers = data?.customers || [];
  const totalDisc = orders.reduce((s, o) => s + (o.discount || 0), 0);
  const totalRev = orders.reduce((s, o) => s + (o.amount || 0), 0);
  return (
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div><h3 className="font-heading font-black text-primary-700 dark:text-primary-300">{c?.code || "…"}</h3><p className="text-xs text-slate-400">{c?.title || "Coupon details"}</p></div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        {!data ? <div className="p-10 text-center text-slate-400">Loading…</div> : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Redemptions" value={fmtNum(orders.length)} icon={Repeat} tone="sky" />
              <KpiCard label="Customers" value={fmtNum(customers.length)} icon={Users} tone="primary" />
              <KpiCard label="Discount Cost" value={fmt(totalDisc)} icon={TrendingDown} tone="amber" />
              <KpiCard label="Revenue" value={fmt(totalRev)} icon={Wallet} tone="violet" />
            </div>
            {c && (
              <Card className="p-4">
                <SectionHeader icon={Ticket} title="Details" />
                <div className="space-y-2 text-sm">
                  {[["Discount", discLabel(c)], ["Min order", fmt(c.min_order)], ["Max discount", c.max_discount ? fmt(c.max_discount) : "—"],
                    ["Usage limit", c.usage_limit ? fmtNum(c.usage_limit) : "∞"], ["Per customer", c.per_user_limit ? fmtNum(c.per_user_limit) : "∞"],
                    ["Valid from", c.valid_from ? dt(c.valid_from) : "—"], ["Valid until", c.valid_till ? dt(c.valid_till) : "—"], ["Status", dispStatus(c)]].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800 dark:text-slate-100">{v}</span></div>
                  ))}
                </div>
              </Card>
            )}
            <div>
              <SectionHeader icon={ShoppingBag} title="Orders generated" />
              {orders.length === 0 ? <EmptyState icon={ShoppingBag} title="No orders yet" hint="This coupon hasn't been redeemed on any booking." />
                : (
                  <div className="space-y-2">
                    {orders.slice(0, 50).map((o) => (
                      <div key={o.booking_id} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
                        <div><p className="font-semibold text-slate-800 dark:text-slate-100">{o.customer_name}</p><p className="text-[11px] text-slate-400 font-mono">{o.booking_code || "—"}</p></div>
                        <div className="text-right"><p className="font-semibold">{fmt(o.amount)}</p><p className="text-[11px] text-amber-600">−{fmt(o.discount)}</p></div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Platform Absorption Report ─────────
   Commission is split on the PRE-coupon service amount (partner earns as if no
   coupon), so every rupee of coupon discount is absorbed by the platform. */
function AbsorptionReport() {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get("/admin/coupons/absorption-report", { params: { date_from: from || undefined, date_to: to || undefined } });
      setData(r.data || {});
    } catch { toast.error("Could not load absorption report"); } finally { setBusy(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);
  const t = data?.totals || {};
  const rows = data?.coupons || [];
  const orders = data?.orders || [];
  return (
    <Card className="mb-5 p-4 sm:p-5" data-testid="coupon-absorption-report">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><TrendingDown className="h-4 w-4 text-amber-500" /> Platform Absorption Report</h2>
          <p className="text-xs text-slate-500 mt-0.5">Partner is paid on the pre-coupon amount — the platform bears every coupon discount. Completed/paid bookings only.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PremiumDatePicker value={from} onChange={(e) => setFrom(e.target.value)} className="!h-9 !w-36 text-xs rounded-lg" data-testid="absorb-from" />
          <span className="text-xs text-slate-400">to</span>
          <PremiumDatePicker value={to} onChange={(e) => setTo(e.target.value)} className="!h-9 !w-36 text-xs rounded-lg" data-testid="absorb-to" />
          <button onClick={load} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 grid place-items-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800" title="Refresh"><RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /></button>
          <button onClick={() => setOpen((o) => !o)} className="h-9 px-3 rounded-lg text-xs font-semibold text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20">{open ? "Hide" : "Show"}</button>
        </div>
      </div>
      {open && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
            <KpiCard label="Discount Absorbed" value={fmt(t.discount_absorbed || 0)} icon={TrendingDown} tone="amber" />
            <KpiCard label="Coupon Bookings" value={fmtNum(t.bookings || 0)} icon={ShoppingBag} tone="sky" />
            <KpiCard label="Service Value (pre-coupon)" value={fmt(t.service_value || 0)} icon={Wallet} tone="primary" />
            <KpiCard label="Customer Paid (excl. tax)" value={fmt(t.customer_paid_excl_tax || 0)} icon={Users} tone="violet" />
            <KpiCard label="Partner + Merchant Paid" value={fmt((t.partner_paid || 0) + (t.merchant_paid || 0))} icon={Repeat} tone="green" />
            <KpiCard label="Platform Net" value={fmt(t.platform_net || 0)} icon={Sparkles} tone={(t.platform_net || 0) < 0 ? "amber" : "slate"} />
          </div>
          {rows.length === 0 ? (
            <div className="mt-4"><EmptyState icon={Ticket} title="No coupon bookings completed yet" hint="Once customers complete bookings with a coupon, the per-coupon absorption appears here." /></div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm" data-testid="absorb-table">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    {["Coupon", "Bookings", "Service Value", "Discount Absorbed", "% of Service", "Customer Paid", "Partner Paid", "Merchant Paid", "Platform Net"].map((h) => <th key={h} className="py-2.5 px-3 font-bold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <React.Fragment key={r.coupon_code}>
                      <tr onClick={() => setExpanded(expanded === r.coupon_code ? null : r.coupon_code)} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer" data-testid={`absorb-row-${r.coupon_code}`}>
                        <td className="py-3 px-3"><span className="font-mono font-bold text-slate-800 dark:text-slate-100">{r.coupon_code}</span>{r.title ? <p className="text-[11px] text-slate-400">{r.title}</p> : null}</td>
                        <td className="py-3 px-3 tabular-nums">{r.bookings}</td>
                        <td className="py-3 px-3 tabular-nums">{fmt(r.service_value)}</td>
                        <td className="py-3 px-3 tabular-nums font-bold text-amber-600">−{fmt(r.discount_absorbed)}</td>
                        <td className="py-3 px-3 tabular-nums">{r.absorb_pct_of_service}%</td>
                        <td className="py-3 px-3 tabular-nums">{fmt(r.customer_paid_excl_tax)}</td>
                        <td className="py-3 px-3 tabular-nums text-emerald-600">{fmt(r.partner_paid)}</td>
                        <td className="py-3 px-3 tabular-nums">{fmt(r.merchant_paid)}</td>
                        <td className={cn("py-3 px-3 tabular-nums font-bold", r.platform_net < 0 ? "text-rose-600" : "text-slate-800 dark:text-slate-100")}>{fmt(r.platform_net)}</td>
                      </tr>
                      {expanded === r.coupon_code && (
                        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                          <td colSpan={9} className="px-3 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Bookings using {r.coupon_code}</p>
                            <div className="space-y-1.5">
                              {orders.filter((o) => o.coupon_code === r.coupon_code).map((o) => (
                                <div key={o.booking_id} className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-2">
                                  <span className="font-mono font-semibold">#{o.booking_code}<span className="block text-[10px] text-slate-400 font-sans">{dt(o.created_at)} · {o.customer_name}</span></span>
                                  <span>Service <b>{fmt(o.service_value)}</b></span>
                                  <span className="text-amber-600">Absorbed <b>−{fmt(o.discount_absorbed)}</b></span>
                                  <span>Customer paid <b>{fmt(o.customer_paid_excl_tax)}</b></span>
                                  <span className="text-emerald-600">Partner <b>{fmt(o.partner_paid)}</b></span>
                                  <span className={o.platform_net < 0 ? "text-rose-600" : ""}>Platform net <b>{fmt(o.platform_net)}</b></span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-100">
                    <td className="py-3 px-3">Total · {t.coupons || 0} coupon(s)</td>
                    <td className="py-3 px-3 tabular-nums">{t.bookings || 0}</td>
                    <td className="py-3 px-3 tabular-nums">{fmt(t.service_value || 0)}</td>
                    <td className="py-3 px-3 tabular-nums text-amber-600">−{fmt(t.discount_absorbed || 0)}</td>
                    <td className="py-3 px-3 tabular-nums">{t.service_value ? Math.round((t.discount_absorbed / t.service_value) * 1000) / 10 : 0}%</td>
                    <td className="py-3 px-3 tabular-nums">{fmt(t.customer_paid_excl_tax || 0)}</td>
                    <td className="py-3 px-3 tabular-nums text-emerald-600">{fmt(t.partner_paid || 0)}</td>
                    <td className="py-3 px-3 tabular-nums">{fmt(t.merchant_paid || 0)}</td>
                    <td className={cn("py-3 px-3 tabular-nums", (t.platform_net || 0) < 0 ? "text-rose-600" : "")}>{fmt(t.platform_net || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
