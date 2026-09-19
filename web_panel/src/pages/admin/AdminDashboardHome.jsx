import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import DashCalendar, { defaultDateValue } from "@/pages/admin/dashboard/DashCalendar";
import {
  IndianRupee, TrendingUp, ClipboardList, CheckCircle2, Clock, XCircle, Users, Wrench, Store,
  RefreshCw, SlidersHorizontal, X, Download, Plus, UserPlus, Wallet, BarChart3,
} from "lucide-react";
import { Card, KpiCard, DashSkeleton, ErrorState, sMeta } from "./dashboard/kit";
import { FilterDrawer } from "./dashboard/FilterDrawer";
import { RevenueChart, BookingTrend, StatusDonut } from "./dashboard/charts";
import {
  EarningsBreakdown, OpsSnapshot, NeedsAttention, ServicePerformance, TopPartners,
  CustomerAnalytics, MerchantAnalytics, QrAnalytics, CityPerformance,
} from "./dashboard/panels";
import RecentBookings from "./dashboard/RecentBookings";
import { buildDashboardCsv, downloadCsv } from "./dashboard/exportCsv";

const EMPTY_FILTERS = { city: "", category: "", service: "", status: "", booking_type: "", payment_status: "", partner: "", customer: "", merchant: "" };
const FILTER_DEFS = [
  ["city", "cities", "All Cities"], ["category", "categories", "All Categories"], ["service", "services", "All Services"],
  ["status", "statuses", "All Status"], ["payment_status", "payment_statuses", "All Payments"], ["booking_type", "booking_types", "All Types"],
  ["partner", "partners", "All Partners"], ["merchant", "merchants", "All Merchants"], ["customer", "customers", "All Customers"],
];

export default function AdminDashboardHome({ onOpenBooking, onNavigate }) {
  const [date, setDate] = useState(defaultDateValue());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [bucket, setBucket] = useState("auto");
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const buildUrl = useCallback(() => {
    const q = new URLSearchParams();
    if (date.allTime) q.set("range", "all");
    else if (date.from && date.to) { q.set("range", "custom"); q.set("date_from", date.from); q.set("date_to", date.to); }
    else q.set("range", "30d");
    if (bucket !== "auto") q.set("bucket", bucket);
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
    return `/admin/dashboard?${q.toString()}`;
  }, [date, filters, bucket]);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.get(buildUrl()).then((r) => setD(r.data)).catch(() => setError(true)).finally(() => setLoading(false));
  }, [buildUrl]);
  useEffect(() => { load(); }, [load]);

  const activeChips = useMemo(() => {
    const chips = [];
    if (date.key !== "30d") chips.push({ k: "__date", label: date.allTime ? "All Time" : date.label });
    Object.entries(filters).forEach(([k, v]) => { if (v) chips.push({ k, label: `${k.replace(/_/g, " ")}: ${k === "status" ? sMeta(v).label : v}` }); });
    return chips;
  }, [date, filters]);
  const setF = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearChip = (k) => (k === "__date" ? setDate(defaultDateValue()) : setFilters((f) => ({ ...f, [k]: "" })));
  const clearAll = () => { setDate(defaultDateValue()); setFilters(EMPTY_FILTERS); };
  const exportCsv = () => d && downloadCsv(buildDashboardCsv(d, { filters: activeChips.map((c) => c.label).join("; ") || "none" }), `azoapp-analytics-${d.window?.from}-to-${d.window?.to}.csv`);

  const fa = d?.filters_available || {};
  const filterDefs = FILTER_DEFS.filter(([, src]) => (fa[src] || []).length > 0).map(([k, src, ph]) => ({
    key: k, placeholder: ph, label: ph.replace(/^All /, ""),
    options: (fa[src] || []).map((c) => ({ value: c, label: k === "status" ? sMeta(c).label : c })),
  }));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const cmp = d?.compare || {};
  const hasBaseline = cmp.has_baseline !== false;
  const series = d?.combined_series || [];
  const spark = (k) => series.map((r) => ({ value: r[k] }));

  const Header = (
    <div className="mb-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading font-extrabold text-2xl md:text-[26px] text-slate-900 dark:text-white tracking-tight">Analytics Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Real-time business intelligence across bookings, revenue, partners, customers &amp; merchants</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button data-testid="dash-export" onClick={exportCsv} disabled={!d} className="h-10 px-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-700 disabled:opacity-40 transition-colors">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button data-testid="dash-refresh" onClick={load} className="h-10 w-10 grid place-items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 hover:border-primary-300 hover:text-primary-600 active:scale-95 transition-all" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <DashCalendar value={date} onChange={setDate} />
          <button data-testid="dash-filters-btn" onClick={() => setDrawer(true)}
            className={`h-10 px-3.5 inline-flex items-center gap-2 rounded-xl border text-sm font-semibold transition-all ${activeFilterCount ? "border-primary-600 bg-primary-700 text-white shadow-sm shadow-primary-700/25 hover:bg-primary-800" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-700"}`}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilterCount > 0 && <span className="h-5 min-w-5 px-1.5 rounded-full bg-white/20 text-[11px] font-bold grid place-items-center" data-testid="dash-filters-count">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid="dash-active-chips">
          {activeChips.map((c) => (
            <span key={c.k} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full pl-2.5 pr-1 py-1 capitalize">
              {c.label}<button onClick={() => clearChip(c.k)} className="h-4 w-4 grid place-items-center rounded-full hover:bg-primary-200/60 dark:hover:bg-primary-800"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const Drawer = <FilterDrawer open={drawer} onClose={() => setDrawer(false)} defs={filterDefs} values={filters} onChange={(k, v) => setF(k)(v)} onClear={() => setFilters(EMPTY_FILTERS)} activeCount={activeFilterCount} />;

  if (error) return <div>{Header}{Drawer}<Card className="p-4"><ErrorState onRetry={load} text="Unable to load this data." /></Card></div>;
  if (!d) return <div>{Header}{Drawer}<DashSkeleton /></div>;

  const kpis = [
    { testId: "kpi-revenue", label: "Total Revenue", value: d.gmv, currency: true, icon: IndianRupee, tone: "primary", change: cmp.gmv, spark: spark("gmv"), sparkColor: "#0D47A1" },
    { testId: "kpi-platform", label: "Platform Fee", value: d.platform_revenue, currency: true, icon: TrendingUp, tone: "violet", change: cmp.platform_revenue, spark: spark("platform_revenue"), sparkColor: "#6366f1" },
    { testId: "kpi-bookings", label: "Total Bookings", value: d.total_bookings, icon: ClipboardList, tone: "sky", change: cmp.total_bookings, spark: spark("bookings"), sparkColor: "#0ea5e9" },
    { testId: "kpi-completed", label: "Completed Bookings", value: d.completed_bookings, icon: CheckCircle2, tone: "green", change: cmp.completed_bookings, spark: spark("completed"), sparkColor: "#10b981" },
    { testId: "kpi-pending", label: "Pending Bookings", value: d.pending_bookings, icon: Clock, tone: "amber", change: cmp.pending_bookings, invert: true, sub: "pending · on hold · searching" },
    { testId: "kpi-cancelled", label: "Cancelled Bookings", value: d.cancelled_bookings, icon: XCircle, tone: "rose", change: cmp.cancelled_bookings, invert: true, sub: `${d.cancellation_rate}% cancellation rate` },
    { testId: "kpi-customers", label: "Active Customers", value: d.active_customers, icon: Users, tone: "slate", change: cmp.active_customers, sub: `${d.customers} registered · ${d.new_customers} new` },
    { testId: "kpi-partners", label: "Active Partners", value: d.active_partners, icon: Wrench, tone: "slate", change: cmp.active_partners, sub: `${d.partners} registered · ${d.online_partners} online` },
    { testId: "kpi-merchants", label: "Active Merchants", value: d.active_merchants, icon: Store, tone: "slate", change: cmp.active_merchants, sub: `${d.merchants} registered · ${d.new_merchants} new` },
    { testId: "kpi-aov", label: "Avg Order Value", value: d.avg_order_value, currency: true, icon: Wallet, tone: "amber", change: cmp.avg_order_value, sub: "per completed booking" },
  ];
  const availableMetrics = ["gmv", "platform_revenue", "merchant_commission", "partner_earnings", "refunds"].filter((k) => series.some((r) => (r[k] || 0) !== 0) || k === "gmv" || k === "platform_revenue");

  return (
    <div className={`transition-opacity duration-150 ${loading ? "opacity-70" : ""}`} data-testid="admin-analytics">
      {Header}
      {Drawer}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4 mb-5" data-testid="kpi-grid">
        {kpis.map((k, i) => <KpiCard key={k.label} i={i} hasBaseline={hasBaseline} {...k} />)}
      </div>

      <div className="grid xl:grid-cols-5 gap-4 mb-5">
        <div className="xl:col-span-3"><RevenueChart series={series} bucket={d.bucket} onBucket={setBucket} onReset={clearAll} available={availableMetrics} /></div>
        <div className="xl:col-span-2"><BookingTrend series={series} bucket={d.bucket} statuses={d.status_breakdown || []} onReset={clearAll} /></div>
      </div>

      <div className="grid xl:grid-cols-3 gap-4 mb-5">
        <StatusDonut statuses={d.status_breakdown || []} onReset={clearAll} onPick={(s) => setF("status")(s)} />
        <div className="xl:col-span-2 grid md:grid-cols-2 gap-4">
          <OpsSnapshot o={d.operations} onNavigate={onNavigate} />
          <NeedsAttention na={d.needs_attention} onNavigate={onNavigate} />
        </div>
      </div>

      <div className="mb-5"><EarningsBreakdown e={d.earnings} cmp={cmp} hasBaseline={hasBaseline} /></div>

      <div className="grid xl:grid-cols-2 gap-4 mb-5">
        <ServicePerformance services={d.top_services} categories={d.top_categories} onPickService={setF("service")} onPickCategory={setF("category")} onReset={clearAll} />
        <TopPartners partners={d.top_partners} onPick={setF("partner")} onReset={clearAll} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
        <CustomerAnalytics c={d.customer_analytics} cmp={cmp} hasBaseline={hasBaseline} />
        <MerchantAnalytics m={d.merchant_analytics} onPick={setF("merchant")} />
        <QrAnalytics q={d.qr_analytics} onNavigate={onNavigate} />
      </div>

      <div className="mb-5"><CityPerformance cities={d.city_performance} onPick={setF("city")} onReset={clearAll} /></div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { l: "Create Booking", icon: Plus, nav: "bookings" }, { l: "Manage Partners", icon: UserPlus, nav: "partners" },
          { l: "Customers", icon: Users, nav: "customers" }, { l: "Finance", icon: Wallet, nav: "ledger" }, { l: "Reports", icon: BarChart3, nav: "reports_overview" },
        ].map((q) => (
          <button key={q.l} data-testid={`qa-${q.nav}`} onClick={() => onNavigate?.(q.nav)} className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-primary-300 hover:shadow-md active:scale-[.98] transition-all">
            <span className="h-9 w-9 rounded-xl grid place-items-center bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shrink-0"><q.icon className="h-4 w-4" /></span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-left">{q.l}</span>
          </button>
        ))}
      </div>

      <RecentBookings rows={d.recent_bookings || []} onOpenBooking={onOpenBooking} onReset={clearAll} faServices={fa.services || []} />
    </div>
  );
}
