import { useEffect, useState, useCallback } from "react";
import api, { fmt } from "@/lib/api";
import {
  Crown, Plus, Pencil, Trash2, Copy, Eye, Power, X, Users, BarChart3, Layers,
  Check, IndianRupee, ShieldCheck, TrendingUp, RefreshCw, Search, Monitor, Smartphone,
  GripVertical, Sparkles, Clock, Wallet, Repeat,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import {
  PageHeader, KpiCard, Card, SectionTitle, Field, PInput, PTextarea, PSelect,
  BtnPrimary, BtnGhost, Tabs, Badge, Skeleton, EmptyState,
} from "@/components/marketing/mkit";

const BRAND = "#0D47A1";
const BLANK = {
  name: "", tagline: "", description: "", price: 0, original_price: 0, duration_days: 365,
  discount_pct: 0, max_discount_per_booking: 0, free_visits: 0, priority_support: false,
  benefits: [], badge: "", color: BRAND, icon: "crown", sort_order: 0, status: "active",
};

/* ============ Customer-facing plan card preview ============ */
function PlanPreviewCard({ plan, device = "desktop" }) {
  const p = plan || {};
  const save = (p.original_price || 0) - (p.price || 0);
  const pct = p.original_price > 0 ? Math.round((save / p.original_price) * 100) : 0;
  return (
    <div className={`mx-auto ${device === "mobile" ? "max-w-[280px]" : "max-w-[340px]"}`}>
      <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="p-5 text-white relative" style={{ background: `linear-gradient(135deg, ${p.color || BRAND}, ${p.color || BRAND}dd)` }}>
          {p.badge && <span className="absolute top-3 right-3 text-[10px] font-bold bg-white/25 backdrop-blur px-2 py-0.5 rounded-full">{p.badge}</span>}
          <Crown className="h-6 w-6 mb-2 opacity-90" />
          <p className="font-heading font-extrabold text-lg leading-tight">{p.name || "Plan name"}</p>
          <p className="text-xs opacity-80">{p.tagline || "Your catchy tagline"}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="font-heading font-black text-3xl">{fmt(p.price || 0)}</span>
            {save > 0 && <span className="text-sm line-through opacity-70 mb-1">{fmt(p.original_price)}</span>}
            <span className="text-[11px] opacity-80 mb-1">/ {p.duration_days || 0}d</span>
          </div>
          {pct > 0 && <span className="inline-block mt-1 text-[11px] font-bold bg-white/25 px-2 py-0.5 rounded-full">Save {pct}%</span>}
        </div>
        <div className="p-5 space-y-2.5">
          {(p.discount_pct > 0) && <Benefit text={`${p.discount_pct}% off every booking${p.max_discount_per_booking > 0 ? ` (up to ${fmt(p.max_discount_per_booking)})` : ""}`} />}
          {(p.free_visits > 0) && <Benefit text={`${p.free_visits} free visiting charges`} />}
          {p.priority_support && <Benefit text="Priority customer support" />}
          {(p.benefits || []).filter(Boolean).map((b, i) => <Benefit key={i} text={b} />)}
          <button className="w-full mt-3 h-10 rounded-xl text-white text-sm font-bold" style={{ background: p.color || BRAND }}>
            Get {p.name || "Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
const Benefit = ({ text }) => (
  <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> <span>{text}</span>
  </div>
);

export default function MembershipManager() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [newBenefit, setNewBenefit] = useState("");
  const [dragIdx, setDragIdx] = useState(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/admin/memberships/plans"); setPlans(data || []); }
    catch { toast.error("Failed to load plans"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => {
    if (tab === "subscribers" && !subs) api.get("/admin/memberships/subscribers").then((r) => setSubs(r.data)).catch(() => {});
    if (tab === "analytics" && !analytics) api.get("/admin/memberships/analytics").then((r) => setAnalytics(r.data)).catch(() => {});
  }, [tab, subs, analytics]);

  const openNew = () => { setForm(BLANK); setEditing({}); };
  const openEdit = (p) => { setForm({ ...BLANK, ...p, benefits: p.benefits || [] }); setEditing(p); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return toast.error("Plan name is required");
    if (Number(form.duration_days) <= 0) return toast.error("Duration must be greater than 0");
    if (Number(form.discount_pct) < 0 || Number(form.discount_pct) > 100) return toast.error("Discount % must be 0–100");
    setSaving(true);
    const payload = {
      ...form,
      price: Number(form.price) || 0, original_price: Number(form.original_price) || 0,
      duration_days: Number(form.duration_days) || 365, discount_pct: Number(form.discount_pct) || 0,
      max_discount_per_booking: Number(form.max_discount_per_booking) || 0,
      free_visits: Number(form.free_visits) || 0, sort_order: Number(form.sort_order) || 0,
      benefits: (form.benefits || []).map((b) => String(b).trim()).filter(Boolean),
    };
    try {
      if (editing && editing.id) await api.put(`/admin/memberships/plans/${editing.id}`, payload);
      else await api.post("/admin/memberships/plans", payload);
      toast.success(editing && editing.id ? "Plan updated" : "Plan created");
      setEditing(null); setSubs(null); setAnalytics(null); loadPlans();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); } finally { setSaving(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete plan "${p.name}"? Existing members keep their benefits until expiry.`)) return;
    try { await api.delete(`/admin/memberships/plans/${p.id}`); toast.success("Plan deleted"); loadPlans(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };
  const duplicate = async (p) => {
    const { id, _id, created_at, slug, ...rest } = p;
    try { await api.post("/admin/memberships/plans", { ...rest, name: `${p.name} (copy)`, status: "inactive" }); toast.success("Plan duplicated"); loadPlans(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Duplicate failed"); }
  };
  const toggle = async (p) => {
    try { await api.put(`/admin/memberships/plans/${p.id}`, { status: p.status === "active" ? "inactive" : "active" }); toast.success("Status updated"); loadPlans(); }
    catch { toast.error("Failed"); }
  };

  // benefits builder helpers
  const addBenefit = () => { if (!newBenefit.trim()) return; set("benefits", [...(form.benefits || []), newBenefit.trim()]); setNewBenefit(""); };
  const removeBenefit = (i) => set("benefits", form.benefits.filter((_, x) => x !== i));
  const onDrop = (i) => {
    if (dragIdx === null || dragIdx === i) return;
    const arr = [...form.benefits];
    const [m] = arr.splice(dragIdx, 1); arr.splice(i, 0, m);
    set("benefits", arr); setDragIdx(null);
  };

  /* ---------------- Editor ---------------- */
  if (editing) {
    return (
      <div className="space-y-5" data-testid="membership-editor">
        <button onClick={() => setEditing(null)} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white"><X className="h-4 w-4" /> Back to plans</button>
        <div className="grid lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3 p-6 space-y-5">
            <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white flex items-center gap-2"><Crown className="h-5 w-5" style={{ color: BRAND }} /> {editing.id ? "Edit Plan" : "New Membership Plan"}</h2>

            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Plan information</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Plan name" required><PInput data-testid="mp-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Gold Plus" /></Field>
                <Field label="Tagline"><PInput value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Short catchy line" /></Field>
              </div>
              <div className="mt-4"><Field label="Description"><PTextarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes this plan great" /></Field></div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Pricing</p>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Price (₹)" required><PInput data-testid="mp-price" type="number" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
                <Field label="Original price (₹)" hint="Shown struck-through"><PInput type="number" value={form.original_price} onChange={(e) => set("original_price", e.target.value)} /></Field>
                <Field label="Duration (days)" required><PInput type="number" value={form.duration_days} onChange={(e) => set("duration_days", e.target.value)} /></Field>
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Benefits</p>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Discount % on bookings"><PInput data-testid="mp-discount" type="number" value={form.discount_pct} onChange={(e) => set("discount_pct", e.target.value)} /></Field>
                <Field label="Max discount / booking (₹)" hint="0 = no cap"><PInput type="number" value={form.max_discount_per_booking} onChange={(e) => set("max_discount_per_booking", e.target.value)} /></Field>
                <Field label="Free visiting charges"><PInput type="number" value={form.free_visits} onChange={(e) => set("free_visits", e.target.value)} /></Field>
              </div>
              {/* Dynamic benefits builder */}
              <div className="mt-4">
                <Field label="Additional benefits" hint="Drag to reorder · these appear on the customer card" />
                <div className="space-y-2 mt-1" data-testid="mp-benefits-builder">
                  {(form.benefits || []).map((b, i) => (
                    <div key={i} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                      <GripVertical className="h-4 w-4 text-slate-300 cursor-grab shrink-0" />
                      <input value={b} onChange={(e) => set("benefits", form.benefits.map((x, xi) => xi === i ? e.target.value : x))}
                        className="flex-1 bg-transparent text-sm focus:outline-none text-slate-700 dark:text-slate-200" />
                      <button onClick={() => removeBenefit(i)} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <PInput placeholder="Add a benefit…" value={newBenefit} onChange={(e) => setNewBenefit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBenefit())} />
                    <BtnGhost onClick={addBenefit} data-testid="mp-add-benefit"><Plus className="h-4 w-4" /> Add</BtnGhost>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Badge" hint="e.g. Most Popular"><PInput value={form.badge} onChange={(e) => set("badge", e.target.value)} /></Field>
              <Field label="Accent colour"><input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer" /></Field>
              <Field label="Sort order"><PInput type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} /></Field>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={!!form.priority_support} onChange={(e) => set("priority_support", e.target.checked)} className="h-4 w-4 rounded" /> Priority support
              </label>
              <div className="flex items-center gap-3">
                <PSelect value={form.status} onChange={(e) => set("status", e.target.value)} className="!w-auto">
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </PSelect>
                <BtnPrimary data-testid="mp-save" onClick={save} disabled={saving}>{saving ? "Saving…" : editing.id ? "Update Plan" : "Create Plan"}</BtnPrimary>
              </div>
            </div>
          </Card>

          {/* Live preview */}
          <div className="lg:col-span-2">
            <Card className="p-5 sticky top-4">
              <SectionTitle icon={Sparkles} title="Live preview" sub="How members will see this plan" />
              <PlanPreviewCard plan={form} />
              <p className="text-center text-[11px] text-slate-400 mt-3">Updates instantly as you edit</p>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Main ---------------- */
  return (
    <div className="space-y-6" data-testid="membership-manager">
      <PageHeader icon={Crown} title="Membership Plans" subtitle="Create and manage customer membership programs.">
        <BtnPrimary data-testid="mp-new" onClick={openNew}><Plus className="h-4 w-4" /> New Plan</BtnPrimary>
      </PageHeader>

      <Tabs tabs={[["plans", "Plans", Layers], ["subscribers", "Subscribers", Users], ["analytics", "Analytics", BarChart3]]} active={tab} onChange={setTab} />

      {tab === "plans" && (
        loading ? <Skeleton rows={4} />
        : plans.length === 0 ? <EmptyState icon={Crown} title="No plans yet" hint="Create your first membership plan to start growing recurring revenue." action={<BtnPrimary onClick={openNew}><Plus className="h-4 w-4" /> New Plan</BtnPrimary>} />
        : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="mp-plan-grid">
            {plans.map((p) => (
              <Card key={p.id} data-testid={`mp-plan-${p.id}`} className="p-0 overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                <div className="p-5 text-white relative" style={{ background: `linear-gradient(135deg, ${p.color || BRAND}, ${p.color || BRAND}dd)` }}>
                  {p.badge && <span className="absolute top-3 right-3 text-[10px] font-bold bg-white/25 px-2 py-0.5 rounded-full">{p.badge}</span>}
                  <div className="flex items-center gap-2"><Crown className="h-5 w-5" /><p className="font-heading font-bold">{p.name}</p></div>
                  <p className="text-[11px] opacity-80 mt-0.5">{p.tagline}</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-heading font-black text-2xl">{fmt(p.price)}</span>
                    {p.original_price > p.price && <span className="text-xs line-through opacity-70 mb-0.5">{fmt(p.original_price)}</span>}
                    <span className="text-[11px] opacity-80 mb-0.5">/ {p.duration_days}d</span>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex flex-wrap gap-1.5 text-[11px] mb-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{p.discount_pct}% off</span>
                    {p.free_visits > 0 && <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">{p.free_visits} free visits</span>}
                    {p.priority_support && <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">Priority</span>}
                    <Badge status={p.status === "active" ? "active" : "inactive"} />
                  </div>
                  <ul className="space-y-1.5 flex-1">
                    {(p.benefits || []).slice(0, 4).map((b, i) => <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300"><Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" /> {b}</li>)}
                  </ul>
                  <div className="mt-4 flex items-center gap-1 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <IconBtn title="Edit" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Duplicate" onClick={() => duplicate(p)}><Copy className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Preview" onClick={() => setPreview(p)}><Eye className="h-4 w-4" /></IconBtn>
                    <IconBtn title={p.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggle(p)}><Power className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Delete" danger onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></IconBtn>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === "subscribers" && (!subs ? <Skeleton rows={6} /> : <Subscribers subs={subs} />)}
      {tab === "analytics" && (!analytics ? <Skeleton rows={6} /> : <Analytics a={analytics} />)}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setPreview(null)} data-testid="mp-preview-modal">
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 max-w-3xl w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white">Customer preview · {preview.name}</h3>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <div><p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> Desktop</p><PlanPreviewCard plan={preview} device="desktop" /></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> Mobile</p><PlanPreviewCard plan={preview} device="mobile" /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const IconBtn = ({ children, title, danger, ...rest }) => (
  <button {...rest} title={title}
    className={`h-8 w-8 grid place-items-center rounded-lg transition ${danger ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
    {children}
  </button>
);

/* ============ Subscribers ============ */
function Subscribers({ subs }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const rows = (subs.rows || []).filter((r) => {
    if (q && !((r.name || "").toLowerCase().includes(q.toLowerCase()) || (r.phone || "").includes(q))) return false;
    if (status && r.status !== status) return false;
    return true;
  });
  const expBadge = (r) => {
    if (r.status !== "active") return null;
    if (r.days_left <= 0) return <Badge status="expired">Expired</Badge>;
    if (r.days_left <= 3) return <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Expires in {r.days_left}d</span>;
    if (r.days_left <= 7) return <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Expires in {r.days_left}d</span>;
    return null;
  };
  return (
    <div className="space-y-4" data-testid="mp-subscribers">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Subscribers" value={subs.total} icon={Users} tone="brand" />
        <KpiCard label="Active" value={subs.active} icon={ShieldCheck} tone="emerald" />
        <KpiCard label="Expiring Soon" value={subs.expiring_soon} icon={Clock} tone="amber" />
        <KpiCard label="Expired" value={subs.expired} icon={X} tone="red" />
        <KpiCard label="Revenue" value={fmt(subs.revenue)} icon={Wallet} tone="violet" />
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <PInput placeholder="Search subscriber…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <PSelect value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
            <option value="">All status</option><option value="active">Active</option><option value="expired">Expired</option>
          </PSelect>
        </div>
        {rows.length === 0 ? <EmptyState icon={Users} title="No subscribers" hint="Members appear here after they purchase a plan." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 sticky top-0">
                <tr>{["Customer", "Plan", "Amount", "Discount", "Started", "Expires", "Auto-renew", "Payment", "Status"].map((h) => <th key={h} className="text-left font-semibold px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3"><p className="font-medium text-slate-800 dark:text-slate-100">{r.name}</p><p className="text-[11px] text-slate-400">{r.phone}</p></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.plan_name}</td>
                    <td className="px-4 py-3 font-medium">{fmt(r.amount_paid)}</td>
                    <td className="px-4 py-3 text-emerald-600">{r.discount_pct}%</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{(r.started_at || "").slice(0, 10)}</td>
                    <td className="px-4 py-3 text-xs"><div className="flex flex-col gap-1"><span className="text-slate-400">{(r.expires_at || "").slice(0, 10)}</span>{expBadge(r)}</div></td>
                    <td className="px-4 py-3">{r.auto_renew ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><Repeat className="h-3 w-3" /> On</span> : <span className="text-[11px] text-slate-400">Off</span>}</td>
                    <td className="px-4 py-3 capitalize text-xs text-slate-500">{r.payment_status}</td>
                    <td className="px-4 py-3"><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============ Analytics ============ */
function Analytics({ a }) {
  return (
    <div className="space-y-4" data-testid="mp-analytics">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Revenue" value={fmt(a.revenue)} icon={IndianRupee} tone="emerald" />
        <KpiCard label="Purchases" value={a.total_purchases} icon={TrendingUp} tone="brand" />
        <KpiCard label="Active Members" value={a.active_members} icon={ShieldCheck} tone="sky" />
        <KpiCard label="Expired" value={a.expired_members} icon={X} tone="red" />
        <KpiCard label="Renewal Rate" value={`${a.renewal_rate}%`} icon={RefreshCw} tone="violet" />
        <KpiCard label="Avg. Value" value={fmt(a.avg_membership_value)} icon={Wallet} tone="amber" />
        <KpiCard label="Discount Given" value={fmt(a.discount_given)} icon={IndianRupee} tone="slate" />
        <KpiCard label="Savings Delivered" value={fmt(a.savings_delivered)} icon={Sparkles} tone="emerald" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <SectionTitle icon={BarChart3} title="Revenue by Plan" />
          {(a.by_plan || []).length === 0 ? <EmptyState icon={BarChart3} title="No purchases yet" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={a.by_plan} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="plan" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="revenue" fill={BRAND} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle icon={TrendingUp} title="Membership Purchases" sub="Last 6 months" />
          {(a.series || []).length === 0 ? <EmptyState icon={TrendingUp} title="No data yet" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={a.series} margin={{ left: -10 }}>
                <defs><linearGradient id="mpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity={0.35} /><stop offset="100%" stopColor={BRAND} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="purchases" stroke={BRAND} strokeWidth={2} fill="url(#mpg)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800"><h3 className="font-heading font-bold text-slate-900 dark:text-white">Plan comparison</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>{["Plan", "Subscribers", "Revenue", "Renewals", "Renewal Rate", "Avg. Revenue"].map((h) => <th key={h} className="text-left font-semibold px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {(a.by_plan || []).map((p, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{p.plan}</td>
                  <td className="px-4 py-3">{p.subscribers}</td>
                  <td className="px-4 py-3 text-emerald-600 font-semibold">{fmt(p.revenue)}</td>
                  <td className="px-4 py-3">{p.renewals}</td>
                  <td className="px-4 py-3">{p.renewal_rate}%</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmt(p.avg_revenue)}</td>
                </tr>
              ))}
              {(a.by_plan || []).length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No plan data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
