import AssignConfirm, { busyLabel } from "@/components/admin/AssignConfirm";
import PremiumSelect from "@/components/ui/PremiumSelect";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import api, { fmt } from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Radio, RefreshCw, Users, Layers, MapPin, Search, Bell, Volume2, ShieldCheck,
  Briefcase, CheckCircle2, Clock, XCircle, Star, Filter, X, ChevronLeft, ChevronRight,
  SlidersHorizontal, AlertTriangle, UserPlus, BellRing, Loader2,
  Gauge, Timer, Info, Wifi, WifiOff, Send, Eye, Activity, Radar, ChevronDown, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import DispatchInspector from "@/components/admin/DispatchInspector";
import { AssignDrawer } from "@/components/admin/LiveOpsSearching";

/* ================= shared bits ================= */
const LiveDot = ({ connected }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md border"
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
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${m.cls}`}>{m.label}</span>;
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
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.schedule_type === "emergency" ? <span className="text-red-600 font-semibold">Quick Service</span> : "Scheduled"}</td>
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
          className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-slate-600 dark:text-slate-300 font-medium">Page {page} / {totalPages}</span>
        <button data-testid={`${testid}-next`} disabled={page >= totalPages} onClick={onNext}
          className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight className="h-4 w-4" /></button>
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
                  <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-md capitalize ${KYC_PILL[p.kyc_status] || "bg-slate-100 text-slate-500"}`}>{(p.kyc_status || "pending").replace("_", " ")}</span></td>
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
/* ── Dispatch Control Center: premium live sliders ── */
const JK_FONT = "'Inter',system-ui,sans-serif";
const ControlCard = ({ k, icon: Icon, label, min, max, step = 1, unit, help, value, disabled, onDrag, onCommit }) => {
  const pct = Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
  return (
    <div className="rounded-2xl border border-[#E5EAF0] dark:border-[#1F2937] bg-white dark:bg-[#111827] p-4 transition-shadow hover:shadow-[0_10px_28px_-12px_rgba(13,71,161,.25)]" style={{ fontFamily: JK_FONT }}>
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#334155] dark:text-[#F8FAFC]">
          <span className="h-8 w-8 rounded-lg bg-[#E6EDF8] dark:bg-[#0D47A1]/20 text-[#0D47A1] dark:text-[#3B82F6] grid place-items-center"><Icon className="h-4 w-4" /></span>
          {label}
        </span>
        <span className="text-[20px] font-extrabold text-[#0D47A1] dark:text-[#3B82F6] tabular-nums leading-none">{value}<span className="text-[12px] font-bold text-[#64748B] ml-0.5">{unit}</span></span>
      </div>
      <input data-testid={`tune-${k}`} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onDrag(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number(e.target.value))}
        onTouchEnd={(e) => onCommit(Number(e.target.value))}
        disabled={disabled} className="azo-range" aria-label={label}
        style={{ background: `linear-gradient(90deg,#0D47A1 ${pct}%, #E5EAF0 ${pct}%)` }} />
      <div className="flex justify-between text-[10px] text-[#94A3B8] mt-1.5"><span>{min}{unit}</span><span>{max}{unit}</span></div>
      <p className="text-[11.5px] text-[#64748B] dark:text-[#94A3B8] mt-2 leading-relaxed">{help}</p>
    </div>
  );
};

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
    <div className="rounded-2xl border border-[#E5EAF0] dark:border-[#1F2937] bg-white dark:bg-[#111827] p-5 mb-5" data-testid="dispatch-tuning" style={{ fontFamily: JK_FONT }}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-[#E6EDF8] dark:bg-[#0D47A1]/20 text-[#0D47A1] dark:text-[#3B82F6] grid place-items-center shrink-0"><SlidersHorizontal className="h-5 w-5" /></span>
          <div>
            <h3 className="text-[17px] font-extrabold text-[#172033] dark:text-[#F8FAFC] leading-tight">Dispatch Control Center</h3>
            <p className="text-[12.5px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">Configure how new bookings are distributed to nearby partners</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#15803D] bg-[#E9F8EF] px-2.5 py-1 rounded-md">
          <span className="h-2 w-2 rounded-full bg-[#16A34A] azo-live-dot" /> Live configuration
        </span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ControlCard k="dispatch_wave_size" icon={Users} label="Wave Size" min={1} max={10} unit=" partner"
          help="How many nearest eligible partners are alerted in each dispatch wave." value={cfg.dispatch_wave_size}
          disabled={saving} onDrag={drag("dispatch_wave_size")} onCommit={commit("dispatch_wave_size")} />
        <ControlCard k="dispatch_offer_ttl_sec" icon={Timer} label="Ring Timeout" min={10} max={180} step={5} unit="s"
          help="How long a dispatch wave waits for a partner response before escalating." value={cfg.dispatch_offer_ttl_sec}
          disabled={saving} onDrag={drag("dispatch_offer_ttl_sec")} onCommit={commit("dispatch_offer_ttl_sec")} />
        <ControlCard k="dispatch_max_waves" icon={Radio} label="Max Waves" min={1} max={20} unit=" waves"
          help="Maximum number of dispatch waves before manual escalation." value={cfg.dispatch_max_waves}
          disabled={saving} onDrag={drag("dispatch_max_waves")} onCommit={commit("dispatch_max_waves")} />
        <ControlCard k="nearby_assign_radius_km" icon={MapPin} label="Nearby Assign Radius" min={2} max={50} unit=" km"
          help="Fallback search radius when no partner is available in the customer's primary area." value={cfg.nearby_assign_radius_km}
          disabled={saving} onDrag={drag("nearby_assign_radius_km")} onCommit={commit("nearby_assign_radius_km")} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#E5EAF0] dark:border-[#1F2937] bg-[#F5F7FB] dark:bg-[#0B1220] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-[#334155] dark:text-[#F8FAFC]">Auto-ring nearby-area partners as the final wave</span>
          <span className="relative group shrink-0" data-testid="tune-nearby-info">
            <Info className="h-3.5 w-3.5 text-[#94A3B8] cursor-help" />
            <span className="pointer-events-none absolute left-0 bottom-full mb-2 w-max max-w-[260px] rounded-lg bg-[#172033] text-white text-[11.5px] leading-snug px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg">
              Automatically search nearby service areas when no eligible partner is available within the customer's primary zone.
            </span>
          </span>
        </div>
        <Switch data-testid="tune-nearby-wave-toggle" checked={cfg.dispatch_nearby_wave} disabled={saving}
          onCheckedChange={(v) => save({ dispatch_nearby_wave: v })} />
      </div>
    </div>
  );
}

/* ── Action Required: bookings stuck with no reachable partner + premium assign drawer ── */
function NoPartnerAlerts() {
  const { subscribe } = useRealtime();
  const [rows, setRows] = useState([]);
  const [assignBk, setAssignBk] = useState(null);
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

  const handleAssigned = useCallback((bookingId) => {
    setRows((r) => r.filter((x) => x.id !== bookingId));
  }, []);

  if (!rows.length) return null;
  return (
    <>
      {assignBk && <AssignDrawer booking={assignBk} onClose={() => setAssignBk(null)} onAssigned={handleAssigned} />}
      <div className="rounded-2xl border border-[#DC2626]/25 bg-gradient-to-br from-[#FEF2F2] to-[#FFF7F7] dark:border-[#7F1D1D]/40 dark:from-[#1C1114] dark:to-[#1A0F12] p-5 mb-5" data-testid="no-partner-alerts" style={{ fontFamily: JK_FONT }}>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="h-9 w-9 rounded-xl bg-[#FDECEC] dark:bg-[#7F1D1D]/30 text-[#DC2626] grid place-items-center shrink-0 azo-search-dot"><AlertTriangle className="h-5 w-5" /></span>
          <div>
            <h3 className="text-[15px] font-extrabold text-[#991B1B] dark:text-[#FCA5A5] leading-tight flex items-center gap-2">
              Action Required
              <span className="text-[11px] font-bold text-white bg-[#DC2626] px-2 py-0.5 rounded-md" data-testid="attention-count">{rows.length}</span>
            </h3>
            <p className="text-[12.5px] text-[#B91C1C]/80 dark:text-[#FCA5A5]/70">No partner available — manual assignment required</p>
          </div>
        </div>
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rows.map((b) => (
              <motion.div key={b.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.22 } }}
                data-testid={`attention-${b.code}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white dark:bg-[#111827] border border-[#FADCDC] dark:border-[#7F1D1D]/30 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12px] font-bold text-[#0D47A1] dark:text-[#3B82F6]">#{b.code}</span>
                    <span className="text-[14px] font-bold text-[#172033] dark:text-[#F8FAFC]">{b.service_name}</span>
                    {b.category_name && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#EEF2F7] dark:bg-[#1F2937] text-[#64748B] dark:text-[#94A3B8]">{b.category_name}</span>}
                  </div>
                  <div className="text-[12px] text-[#64748B] dark:text-[#94A3B8] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{b.customer_name || "Customer"}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[b.city, b.pincode].filter(Boolean).join(" ") || "—"}</span>
                    <span className="font-semibold text-[#172033] dark:text-[#F8FAFC]">{fmt(b.total)}</span>
                    <span className="inline-flex items-center gap-1"><Radio className="h-3 w-3" />Wave {b.wave}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#FEF5E7] text-[#B45309]">Manual Assignment Required</span>
                  </div>
                </div>
                <button data-testid={`assign-${b.code}`} onClick={() => setAssignBk({ id: b.id, code: b.code, service_name: b.service_name })}
                  className="h-10 px-5 rounded-md bg-[#0D47A1] hover:bg-[#083A87] text-white text-[13px] font-bold inline-flex items-center gap-2 transition-colors shrink-0">
                  <UserPlus className="h-4 w-4" /> Assign a Partner <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
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

const STAGE_PILL = {
  pending: { label: "Pending", cls: "bg-[#FEF5E7] text-[#B45309]" },
  sent: { label: "Sent", cls: "bg-[#E8F1FD] text-[#1D4ED8]" },
  seen: { label: "Seen", cls: "bg-[#EEF0FE] text-[#4F46E5]" },
  accepted: { label: "Accepted", cls: "bg-[#E9F8EF] text-[#15803D]" },
  rejected: { label: "Rejected", cls: "bg-[#FDECEC] text-[#DC2626]" },
  timeout: { label: "Expired", cls: "bg-[#EEF2F7] text-[#64748B]" },
  superseded: { label: "Taken", cls: "bg-[#EEF2F7] text-[#64748B]" },
};
const stageOf = (r) => {
  if (["accepted", "rejected", "timeout", "superseded"].includes(r.response)) return r.response;
  if (r.seen_at) return "seen";
  if ((r.push_success || 0) > 0) return "sent";
  return "pending";
};
const KPI_T = {
  blue: { fg: "#0D47A1", bg: "#E6EDF8" }, amber: { fg: "#B45309", bg: "#FEF5E7" },
  green: { fg: "#15803D", bg: "#E9F8EF" }, red: { fg: "#DC2626", bg: "#FDECEC" },
  violet: { fg: "#4F46E5", bg: "#EEF0FE" },
};
const DispatchKpi = ({ label, value, icon: Icon, tone = "blue", onClick, active }) => {
  const t = KPI_T[tone];
  return (
    <button type="button" onClick={onClick} data-testid={`dispatch-kpi-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      className={`text-left rounded-2xl bg-white dark:bg-[#111827] border p-4 flex items-start justify-between transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(13,71,161,.25)] ${active ? "ring-2 ring-[#0D47A1]/30" : ""}`}
      style={{ fontFamily: JK_FONT, borderColor: active ? t.fg : "#E5EAF0" }}>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B] dark:text-[#94A3B8]">{label}</p>
        <p key={value} className="azo-kpi-pop text-[28px] font-extrabold leading-none mt-2 text-[#172033] dark:text-[#F8FAFC]">{value}</p>
      </div>
      <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: t.bg, color: t.fg }}><Icon className="h-5 w-5" /></span>
    </button>
  );
};

const clockOf = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }) : "—";

export function AdminDispatchFeed() {
  const { subscribe, connected } = useRealtime();
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");                 // "" | pending | accepted | rejected
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [openId, setOpenId] = useState(null);
  const [lastSync, setLastSync] = useState(Date.now());
  const [, setNowTick] = useState(0);
  const [pendingNew, setPendingNew] = useState(0);
  const pageRef = React.useRef(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/dispatch-feed?limit=200${tab ? `&status=${tab}` : ""}`);
      setRows(data.rows || []);
      setTotals(data.totals || {});
      setLastSync(Date.now());
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load dispatch feed");
    } finally { setLoading(false); setRefreshing(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load, refreshTick]);
  useEffect(() => { const t = setInterval(() => setNowTick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  useEffect(() => { setPage(1); }, [q, tab, perPage]);

  // Live SSE — merge in new / updated rows without a full refetch.
  useEffect(() => {
    const off1 = subscribe("dispatch_new", (r) => {
      if (tab && tab !== "pending") return;
      setRows((prev) => [{ ...r, __new: true }, ...prev.filter((x) => x.id !== r.id)].slice(0, 300));
      setTotals((t) => ({ ...t, total: (t.total || 0) + 1, pending: (t.pending || 0) + 1,
        pushed: (t.pushed || 0) + ((r.push_success || 0) > 0 ? 1 : 0) }));
      setLastSync(Date.now());
      if (pageRef.current > 1) setPendingNew((n) => n + 1);
      else toast("New dispatch attempt", { description: `${r.booking_code || ""} · ${r.partner_name || ""}`, icon: "📡" });
    });
    const off2 = subscribe("dispatch_response", (r) => {
      setRows((prev) => {
        const idx = prev.findIndex((x) => x.id === r.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...prev[idx], ...r, __flash: r.response };
        return next;
      });
      setTotals((t) => ({ ...t, pending: Math.max(0, (t.pending || 0) - 1), [r.response]: (t[r.response] || 0) + 1 }));
      setLastSync(Date.now());
      if (r.response === "accepted") toast.success("Partner accepted", { description: `${r.partner_name || "Partner"} accepted ${r.booking_code || "the job"}` });
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

  const ql = q.trim().toLowerCase();
  const filtered = ql ? rows.filter((r) => [r.booking_code, r.service_name, r.partner_name, r.partner_phone, SOURCE_LABEL[r.source] || r.source]
    .some((v) => String(v || "").toLowerCase().includes(ql))) : rows;
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const cur = Math.min(page, pageCount);
  useEffect(() => { pageRef.current = cur; if (cur === 1 && pendingNew) setPendingNew(0); }, [cur, pendingNew]);
  const from = filtered.length === 0 ? 0 : (cur - 1) * perPage + 1;
  const to = Math.min(cur * perPage, filtered.length);
  const pageRows = filtered.slice((cur - 1) * perPage, cur * perPage);

  const doRefresh = () => { setRefreshing(true); setRefreshTick((n) => n + 1); };

  const KPIS = [
    { label: "Total Dispatches", value: totals.total ?? 0, icon: Radio, tone: "blue", t: "" },
    { label: "Pending", value: totals.pending ?? 0, icon: Clock, tone: "amber", t: "pending" },
    { label: "Accepted", value: totals.accepted ?? 0, icon: CheckCircle2, tone: "green", t: "accepted" },
    { label: "Rejected", value: totals.rejected ?? 0, icon: XCircle, tone: "red", t: "rejected" },
    { label: "Avg Response", value: totals.avg_response_ms ? `${(totals.avg_response_ms / 1000).toFixed(1)}s` : "—", icon: Zap, tone: "violet", t: null },
  ];

  return (
    <div data-testid="admin-dispatch-feed" style={{ fontFamily: JK_FONT }}>
      {openId && <DispatchInspector bookingId={openId} onClose={() => setOpenId(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 rounded-xl grid place-items-center bg-[#E6EDF8] dark:bg-[#0D47A1]/20 text-[#0D47A1] dark:text-[#3B82F6] shrink-0"><Radio className="h-5 w-5" /></span>
          <div>
            <h2 className="text-[24px] font-extrabold text-[#172033] dark:text-[#F8FAFC] leading-tight">Live Dispatch Feed</h2>
            <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">Real-time partner dispatch activity and response monitoring · <span className="text-[#94A3B8]">SSE-powered</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="dispatch-live" className="inline-flex items-center gap-2 h-9 px-3 rounded-md border text-[12.5px] font-bold"
            style={{ borderColor: connected ? "#A7F3D0" : "#FDE68A", color: connected ? "#15803D" : "#B45309", background: connected ? "#ECFDF5" : "#FFFBEB" }}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-[#16A34A] azo-live-dot" : "bg-[#F59E0B] animate-pulse"}`} />
            {connected ? "Live" : "Reconnecting…"}
          </span>
          <span className="hidden sm:inline text-[12px] text-[#94A3B8]" data-testid="dispatch-updated">Updated {timeAgo(new Date(lastSync).toISOString())}</span>
          <button onClick={doRefresh} disabled={refreshing} title="Refresh dispatch feed" data-testid="dispatch-refresh"
            className="h-9 w-9 rounded-md border border-[#E5EAF0] dark:border-[#1F2937] text-[#64748B] hover:text-[#0D47A1] hover:bg-[#F5F7FB] dark:hover:bg-[#1F2937] grid place-items-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {!connected && !loading && (
        <div className="mb-4 rounded-xl border border-[#F59E0B]/40 bg-[#FFFBEB] px-4 py-2.5 flex items-center gap-2 text-[13px] text-[#B45309]" data-testid="dispatch-disconnected">
          <WifiOff className="h-4 w-4 shrink-0" /> Connection interrupted — attempting to reconnect. Showing last known data.
          <button onClick={doRefresh} className="ml-auto font-bold underline underline-offset-2">Reconnect</button>
        </div>
      )}

      <NoPartnerAlerts />
      <DispatchTuning />

      {/* KPI command center */}
      {loading && rows.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="azo-skeleton rounded-2xl h-[92px]" />)}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {KPIS.map((k) => <DispatchKpi key={k.label} {...k} onClick={k.t === null ? undefined : () => setTab(k.t)} active={k.t !== null && tab === k.t} />)}
        </div>
      )}

      {/* Dispatch Activity table */}
      <div className="rounded-2xl border border-[#E5EAF0] dark:border-[#1F2937] bg-white dark:bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#EEF2F7] dark:border-[#1F2937]">
          <div>
            <h3 className="text-[15px] font-extrabold text-[#172033] dark:text-[#F8FAFC]">Dispatch Activity</h3>
            <p className="text-[12px] text-[#64748B] dark:text-[#94A3B8]">Every partner-alert attempt in real time</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <input data-testid="dispatch-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search booking, partner or service…"
                className="h-10 w-full sm:w-64 pl-9 pr-3 rounded-md border border-[#E5EAF0] dark:border-[#1F2937] bg-white dark:bg-[#0B1220] text-[13.5px] text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30 focus:border-[#0D47A1]" />
            </div>
            <Select value={tab || "all"} onValueChange={(v) => setTab(v === "all" ? "" : v)}>
              <SelectTrigger data-testid="dispatch-status-filter" className="h-10 w-36 rounded-xl"><SelectValue placeholder="All status" /></SelectTrigger>
              <SelectContent>
                {["all", "pending", "accepted", "rejected"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All status" : s}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={doRefresh} title="Refresh" className="h-10 w-10 rounded-md border border-[#E5EAF0] dark:border-[#1F2937] text-[#64748B] hover:text-[#0D47A1] hover:bg-[#F5F7FB] dark:hover:bg-[#1F2937] grid place-items-center transition-colors">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {pendingNew > 0 && cur > 1 && (
          <button onClick={() => setPage(1)} data-testid="dispatch-new-banner"
            className="w-full bg-[#E6EDF8] dark:bg-[#0D47A1]/20 text-[#0D47A1] dark:text-[#3B82F6] text-[13px] font-bold py-2 flex items-center justify-center gap-2 hover:bg-[#dbe6f6] transition-colors">
            <Zap className="h-4 w-4" /> {pendingNew} new dispatch attempt{pendingNew > 1 ? "s" : ""} · View latest
          </button>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#F5F7FB] dark:bg-[#0B1220] text-[#64748B] dark:text-[#94A3B8] text-[11px] uppercase tracking-wider">
              <tr>
                {["When", "Booking", "Partner", "Source", "Push", "Seen", "Response", "Speed", "Status"].map((h) => (
                  <th key={h} className="text-left font-bold px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] dark:divide-[#1F2937]">
              {loading && rows.length === 0 && [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="azo-skeleton h-8 rounded-lg" /></td></tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-16 text-center" data-testid="dispatch-empty">
                  <span className="h-16 w-16 rounded-2xl bg-[#E6EDF8] dark:bg-[#0D47A1]/20 text-[#0D47A1] dark:text-[#3B82F6] grid place-items-center mx-auto mb-4"><Radar className="h-8 w-8" /></span>
                  <h4 className="text-[16px] font-extrabold text-[#172033] dark:text-[#F8FAFC]">No dispatch attempts yet</h4>
                  <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-1.5 max-w-sm mx-auto">Dispatch activity will appear here automatically when a booking starts searching for a partner.</p>
                </td></tr>
              )}
              {!loading && pageRows.map((r) => {
                const pill = RESP_PILL[r.response] || RESP_PILL.pending;
                const st = STAGE_PILL[stageOf(r)];
                const pushBadge = (r.push_success || 0) > 0
                  ? <span className="inline-flex items-center gap-1 text-[#15803D] text-[12px] font-semibold"><Send className="h-3 w-3" />Sent</span>
                  : r.push_skipped ? <span className="text-[#94A3B8] text-[11px]">{r.push_skipped}</span>
                    : (r.push_failure || 0) > 0 ? <span className="text-[#DC2626] text-[12px] font-semibold">Failed</span>
                      : <span className="text-[#94A3B8] text-[11px]">SSE</span>;
                return (
                  <tr key={r.id} onClick={() => r.booking_id && setOpenId(r.booking_id)} data-testid={`dispatch-row-${r.id}`}
                    className={`cursor-pointer transition-colors hover:bg-[#F5F7FB] dark:hover:bg-[#1F2937]/50 ${r.__new ? "azo-row-new bg-[#E6EDF8]/40" : ""} ${r.__flash === "accepted" ? "bg-[#E9F8EF]/50" : r.__flash === "rejected" ? "bg-[#FDECEC]/50" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">{clockOf(r.dispatched_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[12px] font-bold text-[#0D47A1] dark:text-[#3B82F6]">{r.booking_code}</div>
                      <div className="text-[11.5px] text-[#64748B] dark:text-[#94A3B8] truncate max-w-[160px]">{r.service_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#172033] dark:text-[#F8FAFC] text-[13px] flex items-center gap-1.5">
                        {r.partner_name || "—"}
                        {r.partner_id && r.booking_id && <span onClick={(e) => e.stopPropagation()}><RingAgainButton bookingId={r.booking_id} bookingCode={r.booking_code} partnerId={r.partner_id} partnerName={r.partner_name} onDone={load} /></span>}
                      </div>
                      <div className="text-[11px] text-[#94A3B8]">{r.partner_phone}{r.distance_km != null ? ` · ${r.distance_km} km` : ""}</div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap">{SOURCE_LABEL[r.source] || r.source}</td>
                    <td className="px-4 py-3">{pushBadge}</td>
                    <td className="px-4 py-3">{r.seen_at
                      ? <span className="inline-flex items-center gap-1 text-[#4F46E5] text-[12px] font-semibold" title={new Date(r.seen_at).toLocaleString()}><Eye className="h-3.5 w-3.5" />Seen</span>
                      : <span className="text-[#CBD5E1] text-[12px]">—</span>}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${pill.cls}`}>{pill.label}</span></td>
                    <td className="px-4 py-3 text-[12px] text-[#64748B] dark:text-[#94A3B8] whitespace-nowrap tabular-nums">{r.response_ms ? `${(r.response_ms / 1000).toFixed(1)}s` : "—"}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-[#EEF2F7] dark:border-[#1F2937]">
            <div className="flex items-center gap-3 text-[12.5px] text-[#64748B] dark:text-[#94A3B8]">
              <span>Showing <b className="text-[#172033] dark:text-[#F8FAFC]">{from}–{to}</b> of {filtered.length} attempts</span>
              <span className="flex items-center gap-2">· Rows
                <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
                  <SelectTrigger data-testid="dispatch-perpage" className="h-8 w-[72px] rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>{[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </span>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button data-testid="dispatch-prev" disabled={cur <= 1} onClick={() => setPage(cur - 1)}
                  className="h-9 min-w-[44px] px-3 rounded-md border border-[#E5EAF0] dark:border-[#1F2937] text-[13px] font-semibold text-[#64748B] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F5F7FB] dark:hover:bg-[#1F2937] inline-flex items-center gap-1"><ChevronLeft className="h-4 w-4" /> Prev</button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).filter((n) => n === 1 || n === pageCount || Math.abs(n - cur) <= 1).map((n, i, arr) => (
                  <React.Fragment key={n}>
                    {i > 0 && arr[i - 1] !== n - 1 && <span className="px-1 text-[#94A3B8]">…</span>}
                    <button data-testid={`dispatch-page-${n}`} onClick={() => setPage(n)}
                      className={`h-9 w-9 rounded-md text-[13px] font-bold transition-colors ${n === cur ? "bg-[#0D47A1] text-white" : "bg-white dark:bg-[#111827] border border-[#E5EAF0] dark:border-[#1F2937] text-[#64748B] hover:bg-[#F5F7FB] dark:hover:bg-[#1F2937]"}`}>{n}</button>
                  </React.Fragment>
                ))}
                <button data-testid="dispatch-next" disabled={cur >= pageCount} onClick={() => setPage(cur + 1)}
                  className="h-9 min-w-[44px] px-3 rounded-md border border-[#E5EAF0] dark:border-[#1F2937] text-[13px] font-semibold text-[#64748B] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F5F7FB] dark:hover:bg-[#1F2937] inline-flex items-center gap-1">Next <ChevronRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
