import React, { useEffect, useState, useCallback } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, Cell,
} from "recharts";
import { AnimatePresence, motion } from "framer-motion";
import {
  TrendingUp, Users, Star, Wallet, Search, Download, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, ArrowUpDown, Gift, Plus, Trash2, Trophy, Award,
  AlertTriangle, ShieldAlert, Target, Sparkles, IndianRupee, RotateCcw, Percent,
  SlidersHorizontal, X, RefreshCw, AlertCircle, Inbox, Phone, BadgeCheck,
  CheckCircle2, Activity, Loader2, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { toast } from "sonner";

/* ================================================================== TOKENS */
const TINTS = {
  primary: { bg: "bg-primary-50", fg: "text-primary-700", solid: "bg-primary-600", ring: "ring-primary-100" },
  emerald: { bg: "bg-emerald-50", fg: "text-emerald-700", solid: "bg-emerald-600", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", fg: "text-amber-700", solid: "bg-amber-500", ring: "ring-amber-100" },
  rose: { bg: "bg-rose-50", fg: "text-rose-700", solid: "bg-rose-600", ring: "ring-rose-100" },
  violet: { bg: "bg-violet-50", fg: "text-violet-700", solid: "bg-violet-600", ring: "ring-violet-100" },
  slate: { bg: "bg-slate-100", fg: "text-slate-700", solid: "bg-slate-700", ring: "ring-slate-100" },
  blue: { bg: "bg-blue-50", fg: "text-blue-700", solid: "bg-blue-600", ring: "ring-blue-100" },
};

const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

/* ================================================================== HELPERS */
const useDebounced = (value, delay = 400) => {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
};

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const avatarTone = (name = "") => {
  const palette = ["primary", "emerald", "amber", "violet", "blue", "rose"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
};

const timeAgo = (iso) => {
  if (!iso) return "just now";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtDate(iso);
};

/* ================================================================== PRIMITIVES */
const PageHeader = ({ icon: Icon, tone = "primary", title, desc, updatedAt, onRefresh, refreshing, children }) => {
  const t = TINTS[tone];
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`h-11 w-11 rounded-xl ${t.bg} ${t.fg} flex items-center justify-center shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading font-bold text-xl text-slate-900 leading-tight truncate">{title}</h2>
          <p className="text-sm text-slate-500 truncate">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {updatedAt !== undefined && (
          <span className="hidden md:inline text-xs text-slate-400 mr-1">Updated {timeAgo(updatedAt)}</span>
        )}
        {onRefresh && (
          <Button variant="outline" size="icon" onClick={onRefresh} data-testid="pg-refresh" title="Refresh" className="h-9 w-9">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
        {children}
      </div>
    </div>
  );
};

const KpiCard = ({ icon: Icon, label, value, sub, tone = "primary", trend }) => {
  const t = TINTS[tone];
  return (
    <div className="group bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between gap-2">
        <div className={`h-10 w-10 rounded-xl ${t.bg} ${t.fg} flex items-center justify-center shrink-0 transition-transform group-hover:scale-105`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend != null && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${trend >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-[13px] text-slate-500 mt-3 truncate">{label}</p>
      <p className="text-2xl font-heading font-bold text-slate-900 leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 truncate mt-0.5">{sub}</p>}
    </div>
  );
};

const KpiSkeleton = () => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
    <Skeleton className="h-10 w-10 rounded-xl" />
    <Skeleton className="h-3 w-20 mt-4" />
    <Skeleton className="h-6 w-16 mt-2" />
  </div>
);

const SectionCard = ({ className = "", children }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

const EmptyState = ({ icon: Icon = Inbox, title, desc, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-4" data-testid="empty-state">
    <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
      <Icon className="h-7 w-7" />
    </div>
    <p className="font-heading font-semibold text-slate-700">{title}</p>
    {desc && <p className="text-sm text-slate-400 mt-1 max-w-sm">{desc}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-4" data-testid="error-state">
    <div className="h-14 w-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
      <AlertCircle className="h-7 w-7" />
    </div>
    <p className="font-heading font-semibold text-slate-700">Couldn't load data</p>
    <p className="text-sm text-slate-400 mt-1 max-w-sm">Something went wrong while fetching. Your filters are preserved.</p>
    {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry} data-testid="error-retry"><RefreshCw className="h-4 w-4 mr-1" /> Retry</Button>}
  </div>
);

const Pager = ({ page, pages, total, pageSize, onPage, onSize }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="hidden sm:inline">Rows</span>
      <div className="w-20">
        <PremiumSelect value={String(pageSize)} onChange={(e) => onSize(Number(e.target.value))}
          options={[10, 20, 50].map((n) => ({ value: String(n), label: String(n) }))} className="!h-9" data-testid="pg-size" />
      </div>
      <span className="text-slate-400">·</span>
      <span data-testid="pg-total">{total} total</span>
    </div>
    <div className="flex items-center gap-1">
      <button disabled={page <= 1} onClick={() => onPage(1)} className="h-9 w-9 rounded-md border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50" data-testid="pg-first"><ChevronsLeft className="h-4 w-4" /></button>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-9 w-9 rounded-md border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50" data-testid="pg-prev"><ChevronLeft className="h-4 w-4" /></button>
      <span className="text-sm font-medium px-3 tabular-nums">{page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-9 w-9 rounded-md border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50" data-testid="pg-next"><ChevronRight className="h-4 w-4" /></button>
      <button disabled={page >= pages} onClick={() => onPage(pages)} className="h-9 w-9 rounded-md border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50" data-testid="pg-last"><ChevronsRight className="h-4 w-4" /></button>
    </div>
  </div>
);

const Avatar = ({ name, rank }) => {
  const t = TINTS[avatarTone(name)];
  return (
    <div className="relative shrink-0">
      <div className={`h-9 w-9 rounded-full ${t.bg} ${t.fg} flex items-center justify-center text-xs font-bold`}>{initials(name)}</div>
      {rank && rank <= 3 && (
        <span className="absolute -top-1.5 -right-1.5 text-[11px]">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</span>
      )}
    </div>
  );
};

const StatusPill = ({ s }) => {
  const map = { online: "bg-emerald-100 text-emerald-700", offline: "bg-slate-100 text-slate-500", break: "bg-amber-100 text-amber-700", emergency: "bg-rose-100 text-rose-700", leave: "bg-violet-100 text-violet-700" };
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md capitalize ${map[s] || "bg-slate-100 text-slate-500"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${s === "online" ? "bg-emerald-500" : "bg-current opacity-50"}`} />{s || "offline"}</span>;
};
const KycPill = ({ s }) => {
  const map = { approved: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700", under_review: "bg-blue-100 text-blue-700", rejected: "bg-rose-100 text-rose-700" };
  return <span className={`text-xs font-medium px-2 py-1 rounded-md capitalize ${map[s] || "bg-slate-100 text-slate-500"}`}>{(s || "pending").replace("_", " ")}</span>;
};

const Bar2 = ({ pct, className = "bg-primary-600" }) => (
  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
    <div className={`h-full rounded-full ${className} transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%` }} />
  </div>
);

/* ---- Responsive filter toolbar: inline on desktop, drawer on mobile ---- */
const FilterToolbar = ({ activeCount, onReset, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex flex-wrap items-center gap-2">{children}</div>
      {/* Mobile trigger */}
      <div className="md:hidden">
        <Button variant="outline" className="w-full justify-between" onClick={() => setOpen(true)} data-testid="filter-open">
          <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Filters</span>
          {activeCount > 0 && <Badge className="bg-primary-600 text-white border-0">{activeCount}</Badge>}
        </Button>
      </div>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-[120] bg-black/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div className="fixed inset-x-0 bottom-0 z-[121] bg-white rounded-t-3xl p-5 md:hidden max-h-[80vh] overflow-y-auto"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }} data-testid="filter-drawer">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold text-lg flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary-600" /> Filters {activeCount > 0 && <Badge className="bg-primary-600 text-white border-0">{activeCount}</Badge>}</h3>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-slate-100"><X className="h-5 w-5 text-slate-400" /></button>
              </div>
              <div className="space-y-3">{children}</div>
              <div className="flex gap-2 mt-5">
                <Button variant="outline" className="flex-1" onClick={() => { onReset(); }} data-testid="filter-reset-mobile">Reset</Button>
                <Button className="flex-1 bg-primary-700 hover:bg-primary-800" onClick={() => setOpen(false)}>Show results</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

const TableSkeleton = ({ rows = 6, cols = 8 }) => (
  <div className="p-4 space-y-3" data-testid="table-skeleton">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-4 flex-1" />
        {Array.from({ length: cols - 2 }).map((_, j) => <Skeleton key={j} className="h-4 w-12 hidden md:block" />)}
      </div>
    ))}
  </div>
);

/* ---- Right slide-over drawer ---- */
const SlideOver = ({ open, onClose, title, children }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div className="fixed inset-0 z-[130] bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <motion.div className="fixed right-0 top-0 bottom-0 z-[131] w-full sm:w-[440px] bg-white shadow-2xl flex flex-col"
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 320 }} data-testid="detail-drawer">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-heading font-bold text-lg text-slate-900">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" data-testid="detail-close"><X className="h-5 w-5 text-slate-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

/* ============================================================ PERFORMANCE */
export function PerformanceManager() {
  const [data, setData] = useState({ summary: {}, analytics: {}, items: [], total: 0, page: 1, pages: 1, page_size: 10 });
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [statusF, setStatusF] = useState("");
  const [kycF, setKycF] = useState("");
  const [minRating, setMinRating] = useState("");
  const [sort, setSort] = useState("jobs_done");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.get("/admin/partner/performance", { params: { q: dq, status: statusF, kyc: kycF, min_rating: minRating || 0, sort, order, page, page_size: pageSize } })
      .then((r) => { setData(r.data); setUpdatedAt(new Date().toISOString()); })
      .catch(() => setError(true)).finally(() => setLoading(false));
  }, [dq, statusF, kycF, minRating, sort, order, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dq, statusF, kycF, minRating, pageSize]);

  const toggleSort = (key) => {
    if (sort === key) setOrder((o) => (o === "desc" ? "asc" : "desc"));
    else { setSort(key); setOrder("desc"); }
  };

  const exportCsv = () => {
    const rows = data.items || [];
    if (!rows.length) return toast.error("Nothing to export");
    const cols = ["rank", "name", "phone", "jobs_done", "rating", "earnings", "acceptance_rate", "completion_rate", "cancellations", "incentives_earned", "penalties", "status", "kyc_status"];
    const csv = [cols.join(",")].concat(rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "provider-performance.csv"; a.click(); URL.revokeObjectURL(url);
    toast.success("Exported current view");
  };

  const s = data.summary || {};
  const an = data.analytics || {};
  const activeFilters = [statusF, kycF, minRating].filter(Boolean).length + (dq ? 1 : 0);
  const resetFilters = () => { setQ(""); setStatusF(""); setKycF(""); setMinRating(""); };

  const sortTh = (label, k) => (
    <th onClick={() => toggleSort(k)} className="px-3 py-2.5 cursor-pointer select-none hover:text-slate-900 text-right whitespace-nowrap">
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className={`h-3 w-3 ${sort === k ? "text-primary-600" : "text-slate-300"}`} /></span>
    </th>
  );

  const statusFilter = (
    <PremiumSelect value={statusF} onChange={(e) => setStatusF(e.target.value)} data-testid="perf-status" className="md:w-40"
      options={[{ value: "", label: "All status" }, { value: "online", label: "Online" }, { value: "offline", label: "Offline" }, { value: "break", label: "Break" }, { value: "emergency", label: "Emergency" }]} />
  );
  const kycFilter = (
    <PremiumSelect value={kycF} onChange={(e) => setKycF(e.target.value)} data-testid="perf-kyc" className="md:w-40"
      options={[{ value: "", label: "All KYC" }, { value: "approved", label: "Approved" }, { value: "pending", label: "Pending" }, { value: "under_review", label: "Under review" }, { value: "rejected", label: "Rejected" }]} />
  );
  const ratingFilter = (
    <PremiumSelect value={minRating} onChange={(e) => setMinRating(e.target.value)} className="md:w-36"
      options={[{ value: "", label: "Any rating" }, { value: "4.5", label: "4.5★ +" }, { value: "4", label: "4★ +" }, { value: "3", label: "3★ +" }]} />
  );

  return (
    <div data-testid="performance-manager">
      <PageHeader icon={TrendingUp} tone="primary" title="Provider Performance"
        desc="Fleet analytics — jobs, ratings, earnings & reliability." updatedAt={updatedAt} onRefresh={load} refreshing={loading}>
        <Button variant="outline" onClick={exportCsv} data-testid="perf-export"><Download className="h-4 w-4 mr-1.5" /> Export</Button>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {loading && !data.items.length
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : <>
            <KpiCard icon={Users} tone="primary" label="Total Partners" value={s.total_partners ?? 0} sub={`${s.active_partners ?? 0} online now`} />
            <KpiCard icon={Star} tone="amber" label="Avg Rating" value={`${s.avg_rating ?? 0} ★`} sub="across the fleet" />
            <KpiCard icon={Target} tone="violet" label="Total Jobs" value={s.total_jobs ?? 0} sub={`${s.avg_acceptance ?? 0}% avg acceptance`} />
            <KpiCard icon={Wallet} tone="emerald" label="Partner Earnings" value={fmt(s.total_earnings || 0)} sub={`${fmt(s.total_incentives || 0)} bonuses`} />
          </>}
      </div>

      {/* Analytics */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <SectionCard className="p-4">
          <p className="font-heading font-semibold text-slate-800 mb-3 flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Rating distribution</p>
          {(an.rating_buckets || []).some((b) => b.count > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={an.rating_buckets} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <RTooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {(an.rating_buckets || []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={Activity} title="No rating data yet" desc="Ratings appear once partners complete rated jobs." />}
        </SectionCard>

        <SectionCard className="p-4">
          <p className="font-heading font-semibold text-slate-800 mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-500" /> Top earners</p>
          {(an.top_earners || []).length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart layout="vertical" data={an.top_earners} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                <RTooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="earnings" radius={[0, 6, 6, 0]} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={Wallet} title="No earnings yet" desc="Top earners show up once partners start earning." />}
        </SectionCard>
      </div>

      {/* Table card */}
      <SectionCard>
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="perf-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…" className="pl-9" />
          </div>
          <FilterToolbar activeCount={activeFilters} onReset={resetFilters}>
            {statusFilter}{kycFilter}{ratingFilter}
            {activeFilters > 0 && <Button variant="ghost" className="hidden md:inline-flex text-slate-500" onClick={resetFilters} data-testid="perf-reset"><X className="h-4 w-4 mr-1" /> Clear</Button>}
          </FilterToolbar>
        </div>

        {error ? <ErrorState onRetry={load} />
          : loading && !data.items.length ? <TableSkeleton cols={9} />
            : (data.items || []).length === 0 ? <EmptyState icon={Users} title="No partners match these filters" desc="Try adjusting your search or filters." action={activeFilters ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : null} />
              : <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="px-3 py-2.5 text-left">Provider</th>
                        {sortTh("Jobs", "jobs_done")}{sortTh("Rating", "rating")}{sortTh("Earnings", "earnings")}
                        {sortTh("Accept %", "acceptance_rate")}{sortTh("Complete %", "completion_rate")}
                        {sortTh("Bonus", "incentives_earned")}{sortTh("Penalty", "penalties")}
                        <th className="px-3 py-2.5 text-left">Status</th><th className="px-3 py-2.5 text-left">KYC</th>
                      </tr>
                    </thead>
                    <tbody data-testid="perf-rows">
                      {(data.items || []).map((r) => (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/70 cursor-pointer transition-colors" onClick={() => setDetail(r)} data-testid={`perf-row-${r.id}`}>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.name} rank={r.rank} />
                              <div className="min-w-0"><p className="font-medium text-slate-800 truncate">{r.name}</p><p className="text-xs text-slate-400">{r.phone}</p></div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.jobs_done}</td>
                          <td className="px-3 py-3 text-right">{r.rating > 0 ? <span className="inline-flex items-center gap-0.5 text-amber-600">{r.rating}<Star className="h-3 w-3 fill-current" /></span> : "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{fmt(r.earnings)}</td>
                          <td className="px-3 py-3 text-right"><span className="inline-flex flex-col items-end gap-1 w-16"><span className="text-xs">{r.acceptance_rate}%</span><Bar2 pct={r.acceptance_rate} className="bg-blue-500" /></span></td>
                          <td className="px-3 py-3 text-right"><span className="inline-flex flex-col items-end gap-1 w-16"><span className="text-xs">{r.completion_rate}%</span><Bar2 pct={r.completion_rate} className="bg-emerald-500" /></span></td>
                          <td className="px-3 py-3 text-right text-emerald-600 font-medium">{r.incentives_earned ? fmt(r.incentives_earned) : "—"}</td>
                          <td className="px-3 py-3 text-right text-rose-600 font-medium">{r.penalties ? `-${fmt(r.penalties)}` : "—"}</td>
                          <td className="px-3 py-3"><StatusPill s={r.status} /></td>
                          <td className="px-3 py-3"><KycPill s={r.kyc_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-100" data-testid="perf-rows-mobile">
                  {(data.items || []).map((r) => (
                    <button key={r.id} onClick={() => setDetail(r)} className="w-full text-left p-4 hover:bg-slate-50 transition-colors" data-testid={`perf-card-${r.id}`}>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} rank={r.rank} />
                        <div className="min-w-0 flex-1"><p className="font-medium text-slate-800 truncate">{r.name}</p><p className="text-xs text-slate-400">{r.phone}</p></div>
                        <div className="text-right"><p className="font-semibold">{r.jobs_done} jobs</p>{r.rating > 0 && <p className="text-xs text-amber-600">{r.rating}★</p>}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                        <div><p className="text-slate-400">Earnings</p><p className="font-semibold text-slate-700">{fmt(r.earnings)}</p></div>
                        <div><p className="text-slate-400">Accept</p><p className="font-semibold text-blue-600">{r.acceptance_rate}%</p></div>
                        <div><p className="text-slate-400">Complete</p><p className="font-semibold text-emerald-600">{r.completion_rate}%</p></div>
                      </div>
                      <div className="flex items-center gap-2 mt-3"><StatusPill s={r.status} /><KycPill s={r.kyc_status} /></div>
                    </button>
                  ))}
                </div>
                <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onSize={setPageSize} />
              </>}
      </SectionCard>

      <SlideOver open={!!detail} onClose={() => setDetail(null)} title="Partner details">
        {detail && <PartnerDetail r={detail} />}
      </SlideOver>
    </div>
  );
}

function PartnerDetail({ r }) {
  const Row = ({ label, value, tone }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium ${tone || "text-slate-800"}`}>{value}</span>
    </div>
  );
  return (
    <div className="p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className={`h-14 w-14 rounded-2xl ${TINTS[avatarTone(r.name)].bg} ${TINTS[avatarTone(r.name)].fg} flex items-center justify-center text-lg font-bold`}>{initials(r.name)}</div>
        <div className="min-w-0">
          <p className="font-heading font-bold text-lg text-slate-900 truncate">{r.name}</p>
          <p className="text-sm text-slate-400 flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {r.phone || "—"}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Fleet rank</p><p className="font-heading font-bold text-xl text-slate-900">#{r.rank}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Rating</p><p className="font-heading font-bold text-xl text-amber-600">{r.rating > 0 ? `${r.rating}★` : "—"}</p></div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Performance</p>
      <Row label="Jobs completed" value={r.jobs_done} />
      <Row label="Acceptance rate" value={`${r.acceptance_rate}%`} tone="text-blue-600" />
      <Row label="Completion rate" value={`${r.completion_rate}%`} tone="text-emerald-600" />
      <Row label="Cancellations" value={r.cancellations ?? 0} />
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 mt-5">Earnings</p>
      <Row label="Total earnings" value={fmt(r.earnings)} />
      <Row label="Bonuses earned" value={fmt(r.incentives_earned || 0)} tone="text-emerald-600" />
      <Row label="Penalties" value={r.penalties ? `-${fmt(r.penalties)}` : fmt(0)} tone={r.penalties ? "text-rose-600" : ""} />
      <Row label="Wallet balance" value={fmt(r.wallet_balance || 0)} />
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 mt-5">Status</p>
      <div className="flex items-center gap-2"><StatusPill s={r.status} /><KycPill s={r.kyc_status} /></div>
    </div>
  );
}

/* ============================================================ INCENTIVES */
export function IncentivesManagerPro() {
  const [ov, setOv] = useState({ items: [], stats: {} });
  const [edit, setEdit] = useState(null);
  const [board, setBoard] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  const [statusF, setStatusF] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.get("/admin/partner/incentives/overview")
      .then((r) => { setOv(r.data); setUpdatedAt(new Date().toISOString()); })
      .catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const blank = { name: "", description: "", job_target: 0, revenue_target: 0, rating_min: 0, bonus_amount: 0, start_date: "", end_date: "", status: "active" };
  const del = async () => {
    if (!delTarget) return;
    try { await api.delete(`/admin/partner/incentives/${delTarget.id}`); toast.success("Incentive deleted"); }
    catch { toast.error("Delete failed"); }
    finally { setDelTarget(null); load(); }
  };

  const st = ov.stats || {};
  let items = ov.items || [];
  if (statusF) items = items.filter((i) => (i.status || "active") === statusF);
  if (q) items = items.filter((i) => (i.name || "").toLowerCase().includes(q.toLowerCase()));
  const activeFilters = (statusF ? 1 : 0) + (q ? 1 : 0);
  const resetFilters = () => { setQ(""); setStatusF(""); };

  return (
    <div data-testid="incentives-manager-pro">
      <PageHeader icon={Gift} tone="primary" title="Partner Incentives"
        desc="Design bonus challenges that keep your fleet motivated." updatedAt={updatedAt} onRefresh={load} refreshing={loading}>
        <Button className="bg-primary-700 hover:bg-primary-800" data-testid="new-incentive-btn" onClick={() => setEdit(blank)}><Plus className="h-4 w-4 mr-1.5" /> New Incentive</Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {loading && !ov.items.length
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : <>
            <KpiCard icon={Sparkles} tone="violet" label="Active Challenges" value={st.active ?? 0} sub={`${st.total ?? 0} total`} />
            <KpiCard icon={Target} tone="primary" label="Live Bonus Budget" value={fmt(st.total_budget || 0)} sub="across active challenges" />
            <KpiCard icon={Award} tone="amber" label="Bonuses Awarded" value={st.total_awards ?? 0} sub="partners rewarded" />
            <KpiCard icon={Wallet} tone="emerald" label="Total Paid Out" value={fmt(st.total_paid || 0)} sub="lifetime payouts" />
          </>}
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search incentives…" className="pl-9" data-testid="incentive-search" />
        </div>
        <FilterToolbar activeCount={activeFilters} onReset={resetFilters}>
          <PremiumSelect value={statusF} onChange={(e) => setStatusF(e.target.value)} className="md:w-40" data-testid="incentive-status-filter"
            options={[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
        </FilterToolbar>
      </div>

      {error ? <SectionCard><ErrorState onRetry={load} /></SectionCard>
        : loading && !ov.items.length ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        ) : items.length === 0 ? (
          <SectionCard><EmptyState icon={Gift} title="No incentives yet" desc="Create a bonus challenge to motivate your partners."
            action={<Button className="bg-primary-700 hover:bg-primary-800" onClick={() => setEdit(blank)}><Plus className="h-4 w-4 mr-1.5" /> New Incentive</Button>} /></SectionCard>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="incentives-grid">
            {items.map((i) => {
              const coverage = i.eligible_count > 0 ? Math.round((i.awarded_count / i.eligible_count) * 100) : 0;
              return (
                <div key={i.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                  <div className="p-5 bg-primary-700 text-white relative">
                    <div className="absolute right-4 top-4"><Badge className={`border-0 capitalize ${i.status === "active" ? "bg-emerald-400/90 text-emerald-950" : "bg-white/20 text-white"}`}>{i.status || "active"}</Badge></div>
                    <Trophy className="h-6 w-6 mb-2 opacity-90" />
                    <p className="font-heading font-bold text-lg leading-tight pr-16">{i.name}</p>
                    <p className="text-primary-100 text-sm mt-1 line-clamp-2 min-h-[2.5rem]">{i.description}</p>
                    <p className="font-heading font-extrabold text-3xl mt-3">{fmt(i.bonus_amount)}</p>
                  </div>
                  <div className="p-4 flex-1">
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {i.job_target > 0 && <span className="px-2 py-1 rounded-md bg-violet-50 text-violet-700 flex items-center gap-1"><Target className="h-3 w-3" /> {i.job_target} jobs</span>}
                      {i.revenue_target > 0 && <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 flex items-center gap-1"><IndianRupee className="h-3 w-3" /> {fmt(i.revenue_target)}</span>}
                      {i.rating_min > 0 && <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 flex items-center gap-1"><Star className="h-3 w-3" /> {i.rating_min}★+</span>}
                    </div>
                    {i.eligible_count > 0 && (
                      <div className="mt-4">
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1"><span>Award coverage</span><span>{i.awarded_count}/{i.eligible_count}</span></div>
                        <Bar2 pct={coverage} className="bg-emerald-500" />
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div><p className="text-lg font-bold text-emerald-600">{i.eligible_count}</p><p className="text-[11px] text-slate-400">Eligible</p></div>
                      <div><p className="text-lg font-bold text-primary-600">{i.awarded_count}</p><p className="text-[11px] text-slate-400">Awarded</p></div>
                      <div><p className="text-lg font-bold text-slate-700">{fmt(i.total_paid)}</p><p className="text-[11px] text-slate-400">Paid</p></div>
                    </div>
                  </div>
                  <div className="p-3 border-t border-slate-100 flex items-center gap-2">
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setBoard(i)} data-testid="incentive-award-btn"><Award className="h-4 w-4 mr-1" /> Award</Button>
                    <Button size="sm" variant="outline" onClick={() => setEdit(i)} data-testid="incentive-edit-btn">Edit</Button>
                    <button onClick={() => setDelTarget(i)} className="h-9 w-9 rounded-md border border-slate-200 flex items-center justify-center text-rose-400 hover:bg-rose-50" data-testid="incentive-delete-btn"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <IncentiveEditDialog inc={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />
      <LeaderboardDialog inc={board} onClose={() => setBoard(null)} onAwarded={load} />
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this incentive?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{delTarget?.name}</strong> will be removed. Partners already awarded keep their bonuses — only the challenge is deleted. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={del} data-testid="incentive-delete-confirm">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormSection({ title, desc, children }) {
  return (
    <div className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
      <p className="font-heading font-semibold text-sm text-slate-800">{title}</p>
      {desc && <p className="text-xs text-slate-400 mb-3">{desc}</p>}
      <div className={desc ? "" : "mt-3"}>{children}</div>
    </div>
  );
}
const Field = ({ label, error, children }) => (
  <div>
    <label className="text-xs font-medium text-slate-500">{label}</label>
    <div className="mt-1">{children}</div>
    {error && <p className="text-xs text-rose-500 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
  </div>
);

function IncentiveEditDialog({ inc, onClose, onDone }) {
  const [f, setF] = useState(inc);
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF(inc); setErrs({}); }, [inc]);
  if (!f) return null;

  const validate = () => {
    const e = {};
    if (!f.name?.trim()) e.name = "Name is required";
    if (!(Number(f.bonus_amount) > 0)) e.bonus_amount = "Bonus must be greater than 0";
    if (!(Number(f.job_target) > 0) && !(Number(f.revenue_target) > 0) && !(Number(f.rating_min) > 0))
      e.target = "Set at least one target (jobs, revenue or rating)";
    if (f.start_date && f.end_date && f.end_date < f.start_date) e.end_date = "End date must be after start date";
    setErrs(e); return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return toast.error("Please fix the highlighted fields");
    setSaving(true);
    const p = { name: f.name.trim(), description: f.description || "", status: f.status || "active",
      job_target: Number(f.job_target) || 0, revenue_target: Number(f.revenue_target) || 0,
      rating_min: Number(f.rating_min) || 0, bonus_amount: Number(f.bonus_amount) || 0,
      start_date: f.start_date || "", end_date: f.end_date || "" };
    try {
      if (f.id) await api.put(`/admin/partner/incentives/${f.id}`, p);
      else await api.post("/admin/partner/incentives", p);
      toast.success(f.id ? "Incentive updated successfully" : "Incentive created successfully");
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!inc} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{f.id ? "Edit" : "New"} Incentive</DialogTitle>
          <DialogDescription>Set the goals partners must hit and the bonus they earn.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <FormSection title="Basic information">
            <div className="space-y-3">
              <Field label="Name" error={errs.name}>
                <Input placeholder="e.g. Weekend Warrior" value={f.name} data-testid="incentive-name" onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <Input placeholder="Short description shown to partners" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Eligibility & targets" desc="Partners qualify once they meet these. Set at least one.">
            {errs.target && <p className="text-xs text-rose-500 mb-2 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errs.target}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Job target"><Input type="number" min="0" value={f.job_target} onChange={(e) => setF({ ...f, job_target: e.target.value })} /></Field>
              <Field label="Revenue target (₹)"><Input type="number" min="0" value={f.revenue_target} onChange={(e) => setF({ ...f, revenue_target: e.target.value })} /></Field>
              <Field label="Min rating"><Input type="number" step="0.1" min="0" max="5" value={f.rating_min} onChange={(e) => setF({ ...f, rating_min: e.target.value })} /></Field>
            </div>
          </FormSection>

          <FormSection title="Reward">
            <Field label="Bonus amount (₹)" error={errs.bonus_amount}>
              <Input type="number" min="0" value={f.bonus_amount} data-testid="incentive-bonus" onChange={(e) => setF({ ...f, bonus_amount: e.target.value })} />
            </Field>
          </FormSection>

          <FormSection title="Validity" desc="Optional window the challenge runs for.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><DatePicker value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} placeholder="Optional" /></Field>
              <Field label="End date" error={errs.end_date}><DatePicker value={f.end_date} onChange={(v) => setF({ ...f, end_date: v })} placeholder="Optional" minDate={f.start_date ? new Date(f.start_date) : undefined} /></Field>
            </div>
          </FormSection>

          <FormSection title="Status">
            <PremiumSelect value={f.status || "active"} onChange={(e) => setF({ ...f, status: e.target.value })}
              options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
          </FormSection>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} data-testid="incentive-save" disabled={saving} className="bg-primary-700 hover:bg-primary-800">
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{f.id ? "Save changes" : "Create incentive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaderboardDialog({ inc, onClose, onAwarded }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [awarding, setAwarding] = useState(null);

  const load = useCallback(() => {
    if (!inc) return;
    setLoading(true); setError(false);
    api.get(`/admin/partner/incentives/${inc.id}/eligible`).then((r) => setRows(r.data.partners || [])).catch(() => setError(true)).finally(() => setLoading(false));
  }, [inc]);
  useEffect(() => { load(); }, [load]);

  const award = async (pid) => {
    setAwarding(pid);
    try { await api.post(`/admin/partner/incentives/${inc.id}/award/${pid}`); toast.success(`Incentive awarded — ${fmt(inc.bonus_amount)} credited!`); load(); onAwarded?.(); }
    catch (e) { toast.error(e.response?.data?.detail || "Award failed"); }
    finally { setAwarding(null); }
  };
  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null);

  return (
    <Dialog open={!!inc} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> {inc?.name} — Leaderboard</DialogTitle>
          <DialogDescription>Ranked by progress. Award {fmt(inc?.bonus_amount)} to eligible partners.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto" data-testid="incentive-leaderboard">
          {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          {error && <ErrorState onRetry={load} />}
          {!loading && !error && rows.map((p, idx) => (
            <div key={p.id} className="border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-center">{medal(idx) || <span className="text-slate-300 text-xs">#{idx + 1}</span>}</span>
                  <div className="min-w-0"><p className="font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.jobs_done} jobs · {p.rating}★ · {fmt(p.revenue)}</p></div>
                </div>
                {p.claim_status === "paid"
                  ? <Badge className="bg-emerald-100 text-emerald-700 border-0 shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" />Awarded</Badge>
                  : <Button size="sm" disabled={!p.eligible || awarding === p.id} onClick={() => award(p.id)} className={p.eligible ? "bg-emerald-600 hover:bg-emerald-700 shrink-0" : "shrink-0"} data-testid={`award-${p.id}`}>
                    {awarding === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : p.eligible ? "Award" : "Not eligible"}</Button>}
              </div>
              <div className="mt-2"><Bar2 pct={p.progress_pct} className={p.eligible ? "bg-emerald-500" : "bg-primary-500"} /></div>
            </div>
          ))}
          {!loading && !error && rows.length === 0 && <EmptyState icon={Users} title="No partners found" desc="No partners are being tracked for this challenge yet." />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ PENALTIES */
export function PenaltiesManagerPro() {
  const [data, setData] = useState({ stats: {}, items: [], total: 0, page: 1, pages: 1 });
  const [partners, setPartners] = useState([]);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [typeF, setTypeF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reversing, setReversing] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.get("/admin/partner/penalties/board", { params: { q: dq, type: typeF, status: statusF, page, page_size: pageSize } })
      .then((r) => { setData(r.data); setUpdatedAt(new Date().toISOString()); })
      .catch(() => setError(true)).finally(() => setLoading(false));
  }, [dq, typeF, statusF, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/admin/users?role=partner").then((r) => setPartners(r.data)).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [dq, typeF, statusF, pageSize]);

  const doReverse = async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try { await api.post(`/admin/partner/penalties/${reverseTarget.id}/reverse`); toast.success("Penalty reversed & refunded"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Reverse failed"); }
    finally { setReversing(false); setReverseTarget(null); }
  };

  const st = data.stats || {};
  const activeFilters = (typeF ? 1 : 0) + (statusF ? 1 : 0) + (dq ? 1 : 0);
  const resetFilters = () => { setQ(""); setTypeF(""); setStatusF(""); };

  const typeBadge = (t) => {
    const map = { fixed: "bg-slate-100 text-slate-600", percentage: "bg-blue-50 text-blue-700", score: "bg-violet-50 text-violet-700" };
    return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md capitalize ${map[t] || "bg-slate-100 text-slate-600"}`}>{t === "percentage" ? <Percent className="h-3 w-3" /> : null}{t}</span>;
  };

  return (
    <div data-testid="penalties-manager-pro">
      <PageHeader icon={ShieldAlert} tone="rose" title="Partner Penalties"
        desc="Enforce quality standards with transparent, reversible deductions." updatedAt={updatedAt} onRefresh={load} refreshing={loading}>
        <Button className="bg-rose-600 hover:bg-rose-700" data-testid="new-penalty-btn" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Apply Penalty</Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {loading && !data.items.length
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : <>
            <KpiCard icon={AlertTriangle} tone="slate" label="Total Penalties" value={st.total ?? 0} sub="all-time records" />
            <KpiCard icon={ShieldAlert} tone="rose" label="Active" value={st.active ?? 0} sub="currently applied" />
            <KpiCard icon={RotateCcw} tone="violet" label="Reversed" value={st.reversed ?? 0} sub="refunded to partners" />
            <KpiCard icon={IndianRupee} tone="amber" label="Amount Deducted" value={fmt(st.total_deducted || 0)} sub="active deductions" />
          </>}
      </div>

      <SectionCard>
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search partner or reason…" className="pl-9" data-testid="penalty-search" />
          </div>
          <FilterToolbar activeCount={activeFilters} onReset={resetFilters}>
            <PremiumSelect value={typeF} onChange={(e) => setTypeF(e.target.value)} className="md:w-40" data-testid="penalty-type-filter"
              options={[{ value: "", label: "All types" }, { value: "fixed", label: "Fixed ₹" }, { value: "percentage", label: "Percentage" }, { value: "score", label: "Score only" }]} />
            <PremiumSelect value={statusF} onChange={(e) => setStatusF(e.target.value)} className="md:w-40" data-testid="penalty-status-filter"
              options={[{ value: "", label: "All status" }, { value: "active", label: "Active" }, { value: "reversed", label: "Reversed" }]} />
            {activeFilters > 0 && <Button variant="ghost" className="hidden md:inline-flex text-slate-500" onClick={resetFilters}><X className="h-4 w-4 mr-1" /> Clear</Button>}
          </FilterToolbar>
        </div>

        {error ? <ErrorState onRetry={load} />
          : loading && !data.items.length ? <TableSkeleton cols={7} />
            : (data.items || []).length === 0 ? <EmptyState icon={BadgeCheck} title="No penalties — your fleet is behaving! 🎉" desc="Penalties you apply will appear here. You can always reverse them." />
              : <>
                {/* Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-400 border-b border-slate-100">
                      <tr><th className="px-3 py-2.5 text-left">Partner</th><th className="px-3 py-2.5 text-left">Reason</th><th className="px-3 py-2.5 text-left">Type</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5 text-left">Date</th><th className="px-3 py-2.5 text-left">Status</th><th className="px-3 py-2.5 text-right">Action</th></tr>
                    </thead>
                    <tbody data-testid="penalty-rows">
                      {(data.items || []).map((p) => (
                        <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                          <td className="px-3 py-3"><div className="flex items-center gap-2.5"><Avatar name={p.partner_name} /><span className="font-medium text-slate-800">{p.partner_name}</span></div></td>
                          <td className="px-3 py-3 text-slate-600 max-w-[220px] truncate">{p.reason}</td>
                          <td className="px-3 py-3">{typeBadge(p.type)}</td>
                          <td className={`px-3 py-3 text-right font-semibold tabular-nums ${p.status === "reversed" ? "text-slate-400 line-through" : "text-rose-600"}`}>{p.type === "score" ? "—" : `-${fmt(p.amount)}`}</td>
                          <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                          <td className="px-3 py-3">{p.status === "active" ? <Badge className="bg-rose-100 text-rose-700 border-0">Active</Badge> : <Badge className="bg-slate-100 text-slate-500 border-0">Reversed</Badge>}</td>
                          <td className="px-3 py-3 text-right">{p.status === "active" && <Button size="sm" variant="outline" onClick={() => setReverseTarget(p)} data-testid={`penalty-reverse-${p.id}`}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reverse</Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile */}
                <div className="md:hidden divide-y divide-slate-100" data-testid="penalty-rows-mobile">
                  {(data.items || []).map((p) => (
                    <div key={p.id} className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.partner_name} />
                        <div className="min-w-0 flex-1"><p className="font-medium text-slate-800 truncate">{p.partner_name}</p><p className="text-xs text-slate-400 truncate">{p.reason}</p></div>
                        <p className={`font-semibold shrink-0 ${p.status === "reversed" ? "text-slate-400 line-through" : "text-rose-600"}`}>{p.type === "score" ? "—" : `-${fmt(p.amount)}`}</p>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">{typeBadge(p.type)}{p.status === "active" ? <Badge className="bg-rose-100 text-rose-700 border-0">Active</Badge> : <Badge className="bg-slate-100 text-slate-500 border-0">Reversed</Badge>}</div>
                        <span className="text-xs text-slate-400">{fmtDate(p.created_at)}</span>
                      </div>
                      {p.status === "active" && <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => setReverseTarget(p)} data-testid={`penalty-reverse-m-${p.id}`}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reverse</Button>}
                    </div>
                  ))}
                </div>
                <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onSize={setPageSize} />
              </>}
      </SectionCard>

      <PenaltyDialog open={open} partners={partners} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />

      <AlertDialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-violet-600" /> Reverse this penalty?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p className="text-slate-500">This refunds the deducted amount back to the partner's wallet and marks the penalty as reversed.</p>
                <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Partner</span><span className="font-medium text-slate-800">{reverseTarget?.partner_name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Reason</span><span className="font-medium text-slate-800 text-right max-w-[60%] truncate">{reverseTarget?.reason}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Amount refunded</span><span className="font-semibold text-emerald-600">{reverseTarget?.type === "score" ? "—" : `+${fmt(reverseTarget?.amount)}`}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Current status</span><Badge className="bg-rose-100 text-rose-700 border-0">Active</Badge></div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-violet-600 hover:bg-violet-700" onClick={(e) => { e.preventDefault(); doReverse(); }} data-testid="penalty-reverse-confirm">
              {reversing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Reverse & refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PenaltyDialog({ open, partners, onClose, onDone }) {
  const [f, setF] = useState({ partner_id: "", reason: "", type: "fixed", amount: 0, note: "" });
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (open) { setF({ partner_id: "", reason: "", type: "fixed", amount: 0, note: "" }); setErrs({}); setConfirm(false); } }, [open]);

  const partner = partners.find((p) => p.id === f.partner_id);
  const validate = () => {
    const e = {};
    if (!f.partner_id) e.partner_id = "Select a partner";
    if (!f.reason?.trim()) e.reason = "Reason is required";
    if (f.type !== "score" && !(Number(f.amount) > 0)) e.amount = "Enter an amount greater than 0";
    setErrs(e); return Object.keys(e).length === 0;
  };
  const proceed = () => { if (!validate()) return toast.error("Please fix the highlighted fields"); setConfirm(true); };
  const save = async () => {
    setSaving(true);
    try { await api.post("/admin/partner/penalties", { ...f, amount: Number(f.amount) || 0 }); toast.success("Penalty applied successfully"); onDone(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed to apply penalty"); setConfirm(false); }
    finally { setSaving(false); }
  };

  const amountLabel = f.type === "percentage" ? "Percentage (%)" : f.type === "score" ? "No wallet deduction" : "Amount (₹)";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply Penalty</DialogTitle>
          <DialogDescription>Deducts from the partner wallet with a transparent ledger entry &amp; notification.</DialogDescription>
        </DialogHeader>

        {!confirm ? (
          <div className="space-y-5">
            <FormSection title="Partner">
              <Field label="Select partner" error={errs.partner_id}>
                <PremiumSelect value={f.partner_id} data-testid="penalty-partner" searchable
                  onChange={(e) => setF({ ...f, partner_id: e.target.value })}
                  placeholder="Select partner…"
                  options={partners.map((p) => ({ value: p.id, label: `${p.name} (${p.phone})` }))} />
              </Field>
            </FormSection>
            <FormSection title="Violation">
              <Field label="Reason" error={errs.reason}>
                <Input placeholder="e.g. Late arrival at job" value={f.reason} data-testid="penalty-reason" onChange={(e) => setF({ ...f, reason: e.target.value })} />
              </Field>
            </FormSection>
            <FormSection title="Deduction">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <PremiumSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}
                    options={[{ value: "fixed", label: "Fixed ₹" }, { value: "percentage", label: "Percentage %" }, { value: "score", label: "Score only" }]} />
                </Field>
                <Field label={amountLabel} error={errs.amount}>
                  <Input type="number" min="0" placeholder={f.type === "score" ? "—" : "0"} value={f.amount} data-testid="penalty-amount" onChange={(e) => setF({ ...f, amount: e.target.value })} disabled={f.type === "score"} />
                </Field>
              </div>
            </FormSection>
            <FormSection title="Internal note" desc="Optional — visible to admins only.">
              <Input placeholder="Add context for your team" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            </FormSection>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
              <p className="text-sm font-semibold text-rose-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Confirm penalty</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Partner</span><span className="font-medium text-slate-800">{partner?.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Reason</span><span className="font-medium text-slate-800 text-right max-w-[60%] truncate">{f.reason}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="font-medium text-slate-800 capitalize">{f.type}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Deduction</span><span className="font-semibold text-rose-600">{f.type === "score" ? "Score only" : f.type === "percentage" ? `${f.amount}% of wallet` : `-${fmt(f.amount)}`}</span></div>
              </div>
            </div>
            <p className="text-xs text-slate-400">The partner will be notified and the amount deducted from their wallet immediately.</p>
          </div>
        )}

        <DialogFooter>
          {!confirm
            ? <><Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={proceed} data-testid="penalty-next" className="bg-rose-600 hover:bg-rose-700">Review</Button></>
            : <><Button variant="outline" onClick={() => setConfirm(false)} disabled={saving}>Back</Button>
              <Button onClick={save} data-testid="penalty-save" disabled={saving} className="bg-rose-600 hover:bg-rose-700">
                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Apply Penalty</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
