import AssignConfirm, { busyLabel } from "@/components/admin/AssignConfirm";
import PremiumSelect from "@/components/ui/PremiumSelect";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import api, { fmt } from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Radio, RefreshCw, Users, Layers, MapPin, Search, Bell, Volume2, ShieldCheck,
  Briefcase, CheckCircle2, Clock, XCircle, Star, Filter, X, ChevronLeft, ChevronRight,
  SlidersHorizontal, AlertTriangle, UserPlus, BellRing, Loader2,
} from "lucide-react";
import { toast } from "sonner";

/* ================= shared bits ================= */
const LiveDot = ({ connected }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
    style={{ borderColor: connected ? "#a7f3d0" : "#e2e8f0", color: connected ? "#047857" : "#94a3b8", background: connected ? "#ecfdf5" : "#f8fafc" }}
    data-testid="admin-live-indicator">
    <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
    {connected ? "Live" : "Reconnecting…"}
  </span>
);

const STATUS_MAP = {
  pending_payment: { label: "Awaiting Payment", cls: "bg-slate-100 text-slate-600" },
  searching: { label: "Sent to Partners", cls: "bg-amber-100 text-amber-700" },
  assigned: { label: "Assigned", cls: "bg-blue-100 text-blue-700" },
  arrived_shop: { label: "In Progress", cls: "bg-indigo-100 text-indigo-700" },
  arrived_customer: { label: "In Progress", cls: "bg-indigo-100 text-indigo-700" },
  started: { label: "In Progress", cls: "bg-indigo-100 text-indigo-700" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  paid: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
};
const StatusPill = ({ s }) => {
  const m = STATUS_MAP[s] || { label: s || "—", cls: "bg-slate-100 text-slate-500" };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}>{m.label}</span>;
};

const KpiCard = ({ label, value, icon: Icon, tone = "slate", onClick, active }) => {
  const tones = { slate: "text-slate-700 bg-slate-100", amber: "text-amber-700 bg-amber-100", blue: "text-blue-700 bg-blue-100", emerald: "text-emerald-700 bg-emerald-100", red: "text-red-700 bg-red-100" };
  return (
    <div onClick={onClick} data-testid={onClick ? `jobreq-tab-${(label || "").toLowerCase().replace(/[^a-z]+/g, "-")}` : undefined}
      className={`rounded-2xl border bg-white dark:bg-slate-800 p-4 flex items-center gap-3 transition-all ${onClick ? "cursor-pointer hover:shadow-card" : ""} ${active ? "border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800" : "border-slate-200 dark:border-slate-700"}`}>
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-2xl font-heading font-extrabold text-slate-900 dark:text-white leading-none">{value}</p><p className="text-xs text-slate-500 mt-1">{label}</p></div>
    </div>
  );
};

/* ================= Admin: Live Job Requests ================= */
export function AdminJobRequests({ onOpen }) {
  const { subscribe, connected, playSound } = useRealtime();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState(null);
  const [tab, setTab] = useState("all");

  const load = useCallback(() => {
    return api.get("/admin/job-requests", { params: { status: "all" } })
      .then((r) => setRows(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((ev) => {
    if (ev.type === "job_new") {
      playSound();
      const d = ev.data || {};
      setFlash(d.id);
      setTimeout(() => setFlash(null), 4000);
      toast.success("🔔 New job request", { description: `${d.service_name || ""}${d.city ? " · " + d.city : ""}` });
      load();
    } else if (["job_update", "__resync__"].includes(ev.type)) {
      load();
    }
  }), [subscribe, load, playSound]);

  const counts = useMemo(() => {
    const c = { total: rows.length, searching: 0, progress: 0, completed: 0, cancelled: 0 };
    rows.forEach((r) => {
      if (r.status === "searching") c.searching++;
      else if (["assigned", "arrived_shop", "arrived_customer", "started"].includes(r.status)) c.progress++;
      else if (["completed", "paid"].includes(r.status)) c.completed++;
      else if (r.status === "cancelled") c.cancelled++;
    });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const inTab = (r) => {
      if (tab === "all") return true;
      if (tab === "searching") return r.status === "searching";
      if (tab === "progress") return ["assigned", "arrived_shop", "arrived_customer", "started"].includes(r.status);
      if (tab === "completed") return ["completed", "paid"].includes(r.status);
      if (tab === "cancelled") return r.status === "cancelled";
      return true;
    };
    let list = rows.filter((r) => inTab(r) && (!q || [r.code, r.service_name, r.customer_name, r.city, r.partner_name].some((v) => (v || "").toLowerCase().includes(q.toLowerCase()))));
    if (tab === "searching") {
      // oldest waiting request first — longest-waiting customer gets attention first
      list = [...list].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    }
    return list;
  }, [rows, q, tab]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <LiveDot connected={connected} />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input data-testid="jobreq-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, service, customer…" className="pl-9 h-10 w-64" />
          </div>
          <Button variant="outline" onClick={load} className="h-10"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Total Requests" value={counts.total} icon={Briefcase} onClick={() => setTab("all")} active={tab === "all"} />
        <KpiCard label="Searching" value={counts.searching} icon={Radio} tone="amber" onClick={() => setTab("searching")} active={tab === "searching"} />
        <KpiCard label="In Progress" value={counts.progress} icon={Clock} tone="blue" onClick={() => setTab("progress")} active={tab === "progress"} />
        <KpiCard label="Completed" value={counts.completed} icon={CheckCircle2} tone="emerald" onClick={() => setTab("completed")} active={tab === "completed"} />
        <KpiCard label="Cancelled" value={counts.cancelled} icon={XCircle} tone="red" onClick={() => setTab("cancelled")} active={tab === "cancelled"} />
      </div>

      {tab === "searching" && (
        <p className="-mt-2 mb-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5" data-testid="searching-hint">
          <Clock className="h-3.5 w-3.5" /> Requests waiting for a partner — oldest first. Open one to assign a professional manually.
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                {["Code", "Service", "Customer", "City", "Schedule", "Partner", "Eligible", "Total", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading live requests…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No job requests yet. New customer bookings will appear here instantly.</td></tr>}
              {filtered.map((r) => (
                <tr key={r.id} data-testid={`jobreq-${r.code}`} onClick={() => onOpen?.(r.id)}
                  className={`cursor-pointer transition-colors ${flash === r.id ? "bg-amber-50 dark:bg-amber-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-900/30"}`}>
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">#{r.code}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.service_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.customer_name}<br /><span className="text-xs text-slate-400">{r.customer_phone}</span></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.city || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.schedule_type === "emergency" ? <span className="text-red-600 font-semibold">Emergency</span> : "Scheduled"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.partner_name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{r.eligible_count}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{fmt(r.total)}</td>
                  <td className="px-4 py-3"><StatusPill s={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================= Admin: Area Partner ================= */
const KYC_PILL = {
  approved: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700",
  under_review: "bg-amber-100 text-amber-700", rejected: "bg-red-100 text-red-700",
};

function Pager({ page, totalPages, total, size, onPrev, onNext, testid }) {
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <div data-testid={testid} className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-sm">
      <span className="text-slate-500 dark:text-slate-400">Showing <b className="text-slate-700 dark:text-slate-200">{from}–{to}</b> of {total}</span>
      <div className="flex items-center gap-2">
        <button data-testid={`${testid}-prev`} disabled={page <= 1} onClick={onPrev}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-slate-600 dark:text-slate-300 font-medium">Page {page} / {totalPages}</span>
        <button data-testid={`${testid}-next`} disabled={page >= totalPages} onClick={onNext}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function AreaPartners({ onView }) {
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState({ summary: {}, matrix: [], partners: [], filter_options: { cities: [], categories: [] } });
  const [loading, setLoading] = useState(true);
  const [mPage, setMPage] = useState(1);
  const [pPage, setPPage] = useState(1);
  const M_SIZE = 8, P_SIZE = 10;

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/area-partners", { params: { city, category } })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load area partners"))
      .finally(() => setLoading(false));
  }, [city, category]);
  useEffect(() => { load(); }, [load]);
  // reset to first page whenever filters change
  useEffect(() => { setMPage(1); setPPage(1); }, [city, category]);

  const { summary = {}, matrix = [], partners = [], filter_options = { cities: [], categories: [] } } = data;
  const hasFilter = city || category;
  const mTotalPages = Math.max(1, Math.ceil(matrix.length / M_SIZE));
  const pTotalPages = Math.max(1, Math.ceil(partners.length / P_SIZE));
  const mSafe = Math.min(mPage, mTotalPages);
  const pSafe = Math.min(pPage, pTotalPages);
  const matrixPage = matrix.slice((mSafe - 1) * M_SIZE, mSafe * M_SIZE);
  const partnersPage = partners.slice((pSafe - 1) * P_SIZE, pSafe * P_SIZE);

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Registered Partners" value={loading ? "…" : summary.registered ?? 0} icon={Users} tone="blue" />
        <KpiCard label="Active Partners" value={loading ? "…" : summary.active ?? 0} icon={ShieldCheck} tone="emerald" />
        <KpiCard label="Cities" value={loading ? "…" : summary.cities ?? 0} icon={MapPin} tone="amber" />
        <KpiCard label="Categories" value={loading ? "…" : summary.categories ?? 0} icon={Layers} />
      </div>

      {/* Mirrors Services Config → Service Areas: only zone cities appear here */}
      {!loading && (summary.service_area_cities || []).length === 0 && (
        <div data-testid="area-no-zones" className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 mb-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-100">No Service Areas created yet. Add zones in Services Config → Service Areas — partners are grouped here by those zones.</p>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 mb-5">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200"><Filter className="h-4 w-4 text-primary-700" /> Filters</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">City</label>
            <PremiumSelect data-testid="area-city" value={city} onChange={(e) => setCity(e.target.value)}
              className="w-full h-10 mt-1 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm">
              <option value="">All cities</option>
              {(filter_options.cities || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </PremiumSelect>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Category</label>
            <PremiumSelect data-testid="area-category" value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 mt-1 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm">
              <option value="">All categories</option>
              {(filter_options.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </PremiumSelect>
          </div>
          <div className="flex items-end">
            {hasFilter && (
              <Button data-testid="area-clear" variant="outline" onClick={() => { setCity(""); setCategory(""); }} className="h-10"><X className="h-4 w-4 mr-1" /> Clear filters</Button>
            )}
          </div>
        </div>
      </div>

      {/* City × Category matrix */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 font-heading font-bold text-slate-900 dark:text-white text-sm">City-wise · Category-wise partners</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-xs uppercase tracking-wider">
              <tr>{["City", "Category", "Registered", "Active"].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!loading && matrix.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No partners match these filters.</td></tr>}
              {matrixPage.map((m, i) => (
                <tr key={(mSafe - 1) * M_SIZE + i} data-testid={`area-row-${(mSafe - 1) * M_SIZE + i}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{m.city}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.category}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700 font-bold">{m.registered}</span></td>
                  <td className="px-4 py-3"><span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold">{m.active}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && <Pager testid="area-matrix-pager" page={mSafe} totalPages={mTotalPages} total={matrix.length} size={M_SIZE} onPrev={() => setMPage((p) => Math.max(1, p - 1))} onNext={() => setMPage((p) => Math.min(mTotalPages, p + 1))} />}
      </div>

      {/* Partner list (reused row style, click -> existing profile) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 font-heading font-bold text-slate-900 dark:text-white text-sm flex items-center justify-between">
          Partner list <span className="text-xs font-normal text-slate-400">{partners.length} partner{partners.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-xs uppercase tracking-wider">
              <tr>{["Partner", "City", "Category", "Contact", "Availability", "KYC"].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {!loading && partners.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No partners found for the selected filters.</td></tr>}
              {partnersPage.map((p) => (
                <tr key={p.id} data-testid={`area-partner-${p.id}`} onClick={() => onView?.(p.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.photo ? <img src={p.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <span className="h-8 w-8 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center">{(p.name || "P")[0]}</span>}
                      <div><p className="font-medium text-slate-800 dark:text-slate-200 leading-tight">{p.name}</p>
                        {p.rating ? <span className="text-xs text-slate-400 flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating}</span> : null}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    <div className="leading-tight">{p.city || "—"}</div>
                    {(p.service_pincodes?.length > 0 || p.service_area_name) && (
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]" title={(p.service_pincodes || []).join(", ")}>
                        {p.service_area_name ? `${p.service_area_name} · ` : ""}{(p.service_pincodes || []).slice(0, 3).join(", ")}{(p.service_pincodes || []).length > 3 ? ` +${p.service_pincodes.length - 3}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.skills || []).slice(0, 2).map((s, i) => <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">{s}</span>)}
                      {(p.skills || []).length > 2 && <span className="text-[10px] text-slate-400">+{p.skills.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${p.partner_status === "online" ? "text-emerald-600" : "text-slate-400"}`}>
                      <span className={`h-2 w-2 rounded-full ${p.partner_status === "online" ? "bg-emerald-500" : "bg-slate-300"}`} />{p.partner_status || "offline"}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${KYC_PILL[p.kyc_status] || "bg-slate-100 text-slate-500"}`}>{(p.kyc_status || "pending").replace("_", " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && <Pager testid="area-list-pager" page={pSafe} totalPages={pTotalPages} total={partners.length} size={P_SIZE} onPrev={() => setPPage((p) => Math.max(1, p - 1))} onNext={() => setPPage((p) => Math.min(pTotalPages, p + 1))} />}
      </div>
    </div>
  );
}

/* ================= Admin: Real-time & Alerts settings ================= */
export function RealtimeSettings() {
  const { config, refreshConfig, connected } = useRealtime();
  const [local, setLocal] = useState(config);
  const [saving, setSaving] = useState(false);
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  useEffect(() => { setLocal(config); }, [config]);

  const save = async (patch) => {
    const next = { ...local, ...patch };
    setLocal(next); setSaving(true);
    try { await api.put("/realtime/config", patch); await refreshConfig(); toast.success("Real-time settings saved"); }
    catch { toast.error("Could not save settings"); }
    setSaving(false);
  };

  const askPerm = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setPerm(p));
  };

  const Toggle = ({ k, label, desc, icon: Icon }) => (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-slate-700 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary-700 dark:text-primary-300" /></div>
        <div><p className="font-semibold text-slate-900 dark:text-white">{label}</p><p className="text-xs text-slate-500 mt-0.5 max-w-md">{desc}</p></div>
      </div>
      <Switch data-testid={`rt-toggle-${k}`} checked={!!local[k]} onCheckedChange={(v) => save({ [k]: v })} disabled={saving} />
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center"><Radio className="h-5 w-5 text-emerald-600" /></div>
          <div><p className="font-heading font-bold text-slate-900 dark:text-white">Real-time connection</p><p className="text-xs text-slate-500">Live job dispatch via Server-Sent Events</p></div>
        </div>
        <LiveDot connected={connected} />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5">
        <Toggle k="enabled" label="Real-time notifications" desc="Push new job requests & status updates to partner and admin dashboards instantly (no page refresh)." icon={Radio} />
        <Toggle k="sound" label="Sound alert" desc="Play an audible chime on the partner dashboard when a new job request arrives." icon={Volume2} />
        <Toggle k="browser_notifications" label="Browser notifications" desc="Show a desktop notification for new job requests when the tab is in the background." icon={Bell} />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 mt-4">
        <div className="flex items-center justify-between">
          <div><p className="font-semibold text-slate-900 dark:text-white">Browser notification permission</p>
            <p className="text-xs text-slate-500 mt-0.5">Current status: <span className="font-semibold capitalize">{perm}</span></p></div>
          {perm === "default" && <Button data-testid="rt-ask-perm" onClick={askPerm} className="bg-primary-700 hover:bg-primary-800 h-10">Enable notifications</Button>}
          {perm === "granted" && <span className="text-emerald-600 text-sm font-semibold flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Enabled</span>}
          {perm === "denied" && <span className="text-red-500 text-sm font-semibold">Blocked in browser</span>}
        </div>
      </div>
    </div>
  );
}


/* ================= Admin: Live Dispatch Feed =================
   Real-time log of every partner-alert attempt for every booking. Rows are
   pushed via SSE (`dispatch_new`, `dispatch_response`) so the admin can watch
   dispatch happening frame-by-frame. */
const RESP_PILL = {
  pending: { label: "Ringing", cls: "bg-amber-100 text-amber-700" },
  accepted: { label: "Accepted", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700" },
  timeout: { label: "Timed out", cls: "bg-orange-100 text-orange-700" },
  superseded: { label: "Taken by other", cls: "bg-slate-100 text-slate-500" },
};
const SOURCE_LABEL = {
  auto_broadcast: "Wave 1 (nearest)",
  partner_online: "Partner came online",
  partner_reject_reoffer: "Re-offer after reject",
  auto_escalation_timeout: "Escalated (timeout)",
  auto_escalation_reject: "Escalated (reject)",
  auto_escalation_no_local: "Escalated (no local partner)",
  auto_escalation_pool_refresh: "Re-matched (new eligible partner)",
  auto_nearby_wave: "Nearby-area ring",
  auto_escalation_assigned_reject: "Re-dispatch (drop-off)",
  admin_redispatch: "Admin redispatch",
  admin_ring: "Admin rang again",
};
function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const s = Math.max(1, Math.round((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}
/* ── Dispatch Tuning: live sliders for wave size / ring timeout / max waves ── */
const TuneSlider = ({ k, label, min, max, step = 1, unit, help, value, disabled, onDrag, onCommit }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
      <span className="text-sm font-extrabold text-primary-700 dark:text-primary-300">{value}{unit}</span>
    </div>
    <input data-testid={`tune-${k}`} type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onDrag(Number(e.target.value))}
      onMouseUp={(e) => onCommit(Number(e.target.value))}
      onTouchEnd={(e) => onCommit(Number(e.target.value))}
      className="w-full accent-primary-600 cursor-pointer" disabled={disabled} />
    <p className="text-[11px] text-slate-500 mt-1.5">{help}</p>
  </div>
);

function DispatchTuning() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/settings");
      const bc = data.business_config || {};
      setCfg({
        dispatch_wave_size: Number(bc.dispatch_wave_size ?? 2),
        dispatch_offer_ttl_sec: Number(bc.dispatch_offer_ttl_sec ?? 25),
        dispatch_max_waves: Number(bc.dispatch_max_waves ?? 12),
        nearby_assign_radius_km: Number(bc.nearby_assign_radius_km ?? 15),
        dispatch_nearby_wave: bc.dispatch_nearby_wave !== false,
      });
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch) => {
    setCfg((c) => ({ ...c, ...patch }));
    setSaving(true);
    try {
      await api.put("/admin/settings", { business_config: patch });
      toast.success("Dispatch settings saved — applies to new bookings instantly");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save");
      load();
    } finally { setSaving(false); }
  }, [load]);

  if (!cfg) return null;
  const drag = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));
  const commit = (k) => (v) => save({ [k]: v });
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-4 mb-5" data-testid="dispatch-tuning">
      <div className="flex items-center gap-2 mb-3 text-sm font-heading font-bold text-slate-900 dark:text-white">
        <SlidersHorizontal className="h-4 w-4 text-primary-700" /> Dispatch Tuning
        <span className="text-[11px] font-normal text-slate-400">— live, applies to new bookings</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <TuneSlider k="dispatch_wave_size" label="Wave size" min={1} max={10} unit=" partners"
          help="How many nearest partners are alerted per wave." value={cfg.dispatch_wave_size}
          disabled={saving} onDrag={drag("dispatch_wave_size")} onCommit={commit("dispatch_wave_size")} />
        <TuneSlider k="dispatch_offer_ttl_sec" label="Ring timeout" min={10} max={180} step={5} unit="s"
          help="Seconds a wave rings before auto-escalating to the next ring." value={cfg.dispatch_offer_ttl_sec}
          disabled={saving} onDrag={drag("dispatch_offer_ttl_sec")} onCommit={commit("dispatch_offer_ttl_sec")} />
        <TuneSlider k="dispatch_max_waves" label="Max waves" min={1} max={20} unit=" waves"
          help="Safety cap on how many rings we escalate through." value={cfg.dispatch_max_waves}
          disabled={saving} onDrag={drag("dispatch_max_waves")} onCommit={commit("dispatch_max_waves")} />
        <div className="flex flex-col gap-1.5">
          <TuneSlider k="nearby_assign_radius_km" label="Nearby assign radius" min={2} max={50} unit=" km"
            help="Fallback zone when nobody in the customer's own pincode is free."
            value={cfg.nearby_assign_radius_km} disabled={saving}
            onDrag={drag("nearby_assign_radius_km")} onCommit={commit("nearby_assign_radius_km")} />
          <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none px-1" data-testid="tune-nearby-wave-toggle">
            <input type="checkbox" className="h-3.5 w-3.5 accent-primary-700" checked={cfg.dispatch_nearby_wave}
              disabled={saving} onChange={(e) => save({ dispatch_nearby_wave: e.target.checked })} />
            Auto-ring nearby-area partners as the last wave
          </label>
        </div>
      </div>
    </div>
  );
}

/* ── No-Partner Alert: bookings stuck with no reachable partner + one-tap assign ── */
// Online & free first, then on-a-job, then offline; within a group in-area before nearby, then fastest ETA.
const AVAIL_RANK = { online: 0, busy: 1, offline: 2 };
const sortAssignable = (list) => [...list].sort((a, b) =>
  (AVAIL_RANK[a.availability] ?? 3) - (AVAIL_RANK[b.availability] ?? 3)
  || (a.nearby ? 1 : 0) - (b.nearby ? 1 : 0)
  || (a.eta_min ?? 1e9) - (b.eta_min ?? 1e9)
  || (b.rating || 0) - (a.rating || 0));
function NoPartnerAlerts() {
  const { subscribe } = useRealtime();
  const [rows, setRows] = useState([]);
  const [assigning, setAssigning] = useState("");
  const [confirm, setConfirm] = useState(null); // {booking, partner}
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/dispatch-attention");
      setRows(data.rows || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const off = subscribe("dispatch_waiting", () => { load(); });
    const off2 = subscribe("job_update", () => { load(); });
    const iv = setInterval(load, 15000);
    return () => { off?.(); off2?.(); clearInterval(iv); };
  }, [subscribe, load]);

  const pick = useCallback((b, partnerId) => {
    if (!partnerId) return;
    const p = (b.eligible_partners || []).find((x) => x.id === partnerId);
    setConfirm({ booking: b, partner: p || { id: partnerId } });
  }, []);
  const assign = useCallback(async (bookingId, partnerId) => {
    if (!partnerId) return;
    setAssigning(bookingId);
    try {
      await api.post(`/admin/bookings/${bookingId}/assign`, { partner_id: partnerId });
      toast.success("Partner assigned");
      setConfirm(null);
      setRows((r) => r.filter((x) => x.id !== bookingId));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not assign");
    } finally { setAssigning(""); }
  }, []);

  if (!rows.length) return null;
  return (
    <>
    {confirm && <AssignConfirm partner={confirm.partner} booking={confirm.booking} busy={assigning === confirm.booking.id}
      onConfirm={() => assign(confirm.booking.id, confirm.partner.id)} onCancel={() => setConfirm(null)} />}
    <div className="rounded-2xl border-2 border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-900/10 p-4 mb-5" data-testid="no-partner-alerts">
      <div className="flex items-center gap-2 mb-3 text-sm font-heading font-bold text-red-700 dark:text-red-300">
        <AlertTriangle className="h-4 w-4" /> No partner available — needs manual assignment ({rows.length})
      </div>
      <div className="space-y-2">
        {rows.map((b) => (
          <div key={b.id} data-testid={`attention-${b.code}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/30 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">#{b.code} · {b.service_name}{b.category_name ? <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 align-middle">{b.category_name}</span> : null}</p>
              <p className="text-[11px] text-slate-500">{b.customer_name || "Customer"} · {[b.city, b.pincode].filter(Boolean).join(" ") || "—"} · {fmt(b.total)} · wave {b.wave}</p>
            </div>
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-400" />
              <PremiumSelect data-testid={`assign-${b.code}`} defaultValue="" placeholder="Assign a partner…" searchable
                onChange={(e) => pick(b, e.target.value)} disabled={assigning === b.id}
                className="h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm w-full sm:w-[560px]"
                options={[
                  { value: "", label: assigning === b.id ? "Assigning…" : "Assign a partner…" },
                  ...sortAssignable(b.eligible_partners || []).map((p) => {
                    const avail = p.availability === "busy" ? (busyLabel(p) || "On a job") : p.availability === "online" ? "Online" : "Offline";
                    const cls = p.availability === "busy" ? "bg-amber-100 text-amber-700" : p.availability === "online" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
                    const eta = p.eta_min != null ? `~${p.eta_min} min` : (p.distance_km != null ? `${p.distance_km} km` : "");
                    const cat = p.category || (p.categories || []).slice(0, 2).join("/") || "—";
                    return {
                      value: p.id,
                      label: `${p.name} · ${cat} · ${p.area || "—"}${p.nearby ? " (nearby)" : ""} · ${avail}${eta ? ` · ${eta}` : ""}`,
                      keywords: `${p.phone || ""} ${p.city || ""}`,
                      node: (
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${p.availability === "online" ? "bg-emerald-500" : p.availability === "busy" ? "bg-amber-500" : "bg-slate-400"}`} />
                          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{p.name}</span>
                          <span className="text-slate-500 truncate">· {cat} · {p.area || "—"}</span>
                          {p.nearby && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">Nearby</span>}
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${cls}`}>{avail}</span>
                          {eta && <span className="text-xs text-primary-700 dark:text-primary-300 shrink-0">{eta}</span>}
                        </span>
                      ),
                    };
                  }),
                ]} />
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}

/** Admin: ring ONE partner again with the REAL job from a Live Dispatch Feed row. */
export function RingAgainButton({ bookingId, bookingCode, partnerId, partnerName, onDone, className = "" }) {
  const [busy, setBusy] = useState(false);
  const fire = async (e) => {
    e?.stopPropagation?.();
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${bookingId}/ring-partner/${partnerId}`);
      const p = data.push || {};
      const pushTxt = (p.push_success || 0) > 0 ? `push sent` : p.push_skipped === "no_devices" ? "push skipped — no registered device" : p.push_skipped ? `push: ${p.push_skipped}` : "";
      toast.success(`Ring sent to ${partnerName || "Partner"} for ${data.booking?.service_name || bookingCode || "job"}`, {
        description: `Real job ${data.booking?.code || ""} · screen ring live${pushTxt ? ` · ${pushTxt}` : ""}${data.partner?.partner_status !== "online" ? " · partner OFFLINE (ring dikhega jab app khulega)" : ""}`, duration: 7000 });
      onDone?.();
    } catch (err) { toast.error(err?.response?.data?.detail || "Ring failed"); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" data-testid={`ring-again-${bookingId}-${partnerId}`} onClick={fire} disabled={busy} title="Ring this partner again with this real job"
      className={`inline-flex items-center gap-1 rounded-md border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-primary-100 disabled:opacity-50 ${className}`}>
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />} Ring again
    </button>
  );
}

/** Admin: fire the uploaded ring / test job alert at ONE partner's device(s). */
export function TestRingButton({ partnerId, partnerName, className = "" }) {
  const [busy, setBusy] = useState(false);
  const fire = async (e) => {
    e?.stopPropagation?.();
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/partners/${partnerId}/test-ring`);
      const p = data.push || {};
      const pushTxt = (p.success || 0) > 0 ? `push sent to ${p.success} device(s)` : p.skipped === "no_devices" ? "push skipped — no registered device" : p.error ? `push failed: ${p.error}` : "push not sent";
      toast.success(`Test ring sent to ${partnerName || "partner"}`, { description: `Screen ring via live connection · ${pushTxt}${data.partner?.partner_status !== "online" ? " · partner is OFFLINE (ring shows only if app open)" : ""}`, duration: 7000 });
    } catch (err) { toast.error(err?.response?.data?.detail || "Test ring failed"); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" data-testid={`test-ring-${partnerId}`} onClick={fire} disabled={busy} title="Ring this partner's device with the test alert"
      className={`inline-flex items-center gap-1 rounded-md border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-primary-100 disabled:opacity-50 ${className}`}>
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />} Ring
    </button>
  );
}

export function AdminDispatchFeed() {
  const { subscribe, connected } = useRealtime();
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");                 // "" | pending | accepted | rejected
  const [refreshTick, setRefreshTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/dispatch-feed?limit=200${tab ? `&status=${tab}` : ""}`);
      setRows(data.rows || []);
      setTotals(data.totals || {});
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load dispatch feed");
    } finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load, refreshTick]);

  // Live SSE — merge in new / updated rows without a full refetch.
  useEffect(() => {
    const off1 = subscribe("dispatch_new", (r) => {
      if (tab && tab !== "pending") return;         // filter tab respects live pushes
      setRows((prev) => [{ ...r, __new: true }, ...prev.filter((x) => x.id !== r.id)].slice(0, 300));
      setTotals((t) => ({
        ...t, total: (t.total || 0) + 1,
        pending: (t.pending || 0) + 1,
        pushed: (t.pushed || 0) + ((r.push_success || 0) > 0 ? 1 : 0),
      }));
    });
    const off2 = subscribe("dispatch_response", (r) => {
      setRows((prev) => {
        const idx = prev.findIndex((x) => x.id === r.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...prev[idx], ...r, __flash: r.response };
        return next;
      });
      setTotals((t) => ({
        ...t,
        pending: Math.max(0, (t.pending || 0) - 1),
        [r.response]: (t[r.response] || 0) + 1,
      }));
    });
    const off3 = subscribe("dispatch_seen", (r) => {
      setRows((prev) => {
        const idx = prev.findIndex((x) => x.id === r.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...prev[idx], seen_at: r.seen_at };
        return next;
      });
    });
    return () => { off1?.(); off2?.(); off3?.(); };
  }, [subscribe, tab]);

  return (
    <div data-testid="admin-dispatch-feed">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-heading font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary-700" /> Live Dispatch Feed
          </h2>
          <p className="text-xs text-slate-500 mt-1">Real-time log of every partner-alert attempt · SSE-powered</p>
        </div>
        <div className="flex items-center gap-2">
          <LiveDot connected={connected} />
          <button onClick={() => setRefreshTick((n) => n + 1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4 text-slate-500" /></button>
        </div>
      </div>

      <NoPartnerAlerts />
      <DispatchTuning />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiCard label="Total dispatches" value={totals.total ?? 0} icon={Radio} tone="slate" onClick={() => setTab("")} active={tab === ""} />
        <KpiCard label="Pending" value={totals.pending ?? 0} icon={Clock} tone="amber" onClick={() => setTab("pending")} active={tab === "pending"} />
        <KpiCard label="Accepted" value={totals.accepted ?? 0} icon={CheckCircle2} tone="emerald" onClick={() => setTab("accepted")} active={tab === "accepted"} />
        <KpiCard label="Rejected" value={totals.rejected ?? 0} icon={XCircle} tone="red" onClick={() => setTab("rejected")} active={tab === "rejected"} />
        <KpiCard label="Avg response" value={totals.avg_response_ms ? `${(totals.avg_response_ms / 1000).toFixed(1)}s` : "—"} icon={Bell} tone="blue" />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-4 py-3">When</th>
                <th className="text-left font-semibold px-4 py-3">Booking</th>
                <th className="text-left font-semibold px-4 py-3">Partner</th>
                <th className="text-left font-semibold px-4 py-3">Source</th>
                <th className="text-left font-semibold px-4 py-3">Push</th>
                <th className="text-left font-semibold px-4 py-3">Seen</th>
                <th className="text-left font-semibold px-4 py-3">Response</th>
                <th className="text-left font-semibold px-4 py-3">Speed</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400"><RefreshCw className="h-5 w-5 mx-auto animate-spin" /></td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No dispatch attempts yet. Book something to see the feed light up.</td></tr>
              )}
              {rows.map((r) => {
                const pill = RESP_PILL[r.response] || RESP_PILL.pending;
                const pushBadge = (r.push_success || 0) > 0
                  ? <span className="text-emerald-700 text-xs font-semibold">✓ {r.push_success}</span>
                  : r.push_skipped
                    ? <span className="text-slate-400 text-xs">skip: {r.push_skipped}</span>
                    : (r.push_failure || 0) > 0
                      ? <span className="text-red-600 text-xs font-semibold">✗ {r.push_failure}</span>
                      : <span className="text-slate-400 text-xs">SSE only</span>;
                return (
                  <tr key={r.id} className={`border-t border-slate-50 dark:border-slate-800 hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition ${r.__new ? "bg-amber-50/50 animate-pulse-slow" : ""} ${r.__flash === "accepted" ? "bg-emerald-50/40" : r.__flash === "rejected" ? "bg-red-50/40" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-slate-500">{timeAgo(r.dispatched_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-100 text-xs">{r.booking_code}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{r.service_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
                        {r.partner_name || "—"}
                        {r.partner_id && r.booking_id && <RingAgainButton bookingId={r.booking_id} bookingCode={r.booking_code} partnerId={r.partner_id} partnerName={r.partner_name} onDone={load} />}
                      </div>
                      <div className="text-[11px] text-slate-500">{r.partner_phone} · was {r.partner_status_at_dispatch}</div>
                      {(r.eta_min != null || r.distance_km != null) && (
                        <div className="text-[11px] text-primary-600 font-semibold">
                          {r.eta_min != null ? `~${r.eta_min} min` : ""}{r.distance_km != null ? ` · ${r.distance_km} km` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{SOURCE_LABEL[r.source] || r.source}</td>
                    <td className="px-4 py-3">{pushBadge}</td>
                    <td className="px-4 py-3">
                      {r.seen_at
                        ? <span className="text-emerald-600 text-xs font-semibold" title={new Date(r.seen_at).toLocaleString()}>👁 Seen</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {r.response_ms ? `${(r.response_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
