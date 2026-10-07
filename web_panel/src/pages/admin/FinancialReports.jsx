import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  BarChart3, Filter, X, Download, RefreshCw, TrendingUp, TrendingDown, Wallet,
  CreditCard, Receipt, Users, Building2, Percent, IndianRupee, ArrowDownRight,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, PieChart, Layers, Package,
  Sparkles, Trophy, CalendarDays, AlertCircle, Crown,
} from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import DateRangeControl from "@/pages/admin/finance/DateRangeControl";

const iso = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const PRESETS = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 Days" }, { key: "30d", label: "30 Days" },
  { key: "month", label: "This Month" }, { key: "lastmonth", label: "Last Month" },
  { key: "year", label: "This Year" }, { key: "all", label: "All Time" },
];
const rangeFor = (key) => {
  const now = new Date(); const end = iso(now);
  if (key === "today") return { from: end, to: end };
  if (key === "yesterday") { const d = new Date(now); d.setDate(d.getDate() - 1); return { from: iso(d), to: iso(d) }; }
  if (key === "7d") { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: iso(d), to: end }; }
  if (key === "30d") { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: iso(d), to: end }; }
  if (key === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
  if (key === "lastmonth") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (key === "year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: end };
  return { from: "", to: "" };
};
const shortDate = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); };

// Auto granularity so long ranges stay readable (daily ≤62pts, weekly ≤186, else monthly)
function bucketize(rowsAsc) {
  if (rowsAsc.length <= 62) return { data: rowsAsc, gran: "Daily" };
  const monthly = rowsAsc.length > 186;
  const map = new Map();
  for (const r of rowsAsc) {
    const d = new Date(r.date);
    let key, label;
    if (monthly) { key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }); }
    else { const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); key = iso(mon); label = shortDate(key); }
    const cur = map.get(key) || { date: key, label, collected: 0, refunds: 0, net: 0, orders: 0 };
    cur.collected += r.collected || 0; cur.refunds += r.refunds || 0; cur.net += r.net || 0; cur.orders += r.orders || 0;
    map.set(key, cur);
  }
  return { data: [...map.values()], gran: monthly ? "Monthly" : "Weekly" };
}

const KpiCard = ({ label, value, sub, tone = "text-slate-900 dark:text-white", Icon, iconCls = "bg-slate-100 text-slate-500" }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-shadow hover:shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      {Icon && <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}><Icon className="h-4 w-4" /></span>}
    </div>
    <p className={`font-heading font-extrabold text-xl mt-1.5 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

const Skel = ({ className = "" }) => <div className={`animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 ${className}`} />;
const KpiSkel = () => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
    <div className="flex justify-between"><Skel className="h-3 w-20" /><Skel className="h-7 w-7 rounded-lg" /></div>
    <Skel className="h-6 w-24 mt-3" /><Skel className="h-3 w-16 mt-2" />
  </div>
);

const BreakdownCard = ({ title, Icon, rows, nameKey, testid, ranked, loading }) => {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0) || 1;
  const medal = ["bg-amber-400", "bg-slate-400", "bg-amber-700"];
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5" data-testid={testid}>
      <h3 className="font-heading font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Icon className="h-5 w-5 text-primary-700" /> {title}</h3>
      {loading ? <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i}><Skel className="h-4 w-full mb-1.5" /><Skel className="h-2 w-full" /></div>)}</div>
        : rows.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No data in range</p>
          : <div className="space-y-3">
            {rows.map((r, i) => {
              const pct = Math.round(((r.amount || 0) / total) * 100);
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-700 dark:text-slate-200 truncate capitalize flex items-center gap-2">
                      {ranked && (i < 3 ? <span className={`h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${medal[i]}`}>{i + 1}</span> : <span className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>)}
                      {r[nameKey] || "Other"}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap ml-2">{fmt(r.amount)} <span className="text-[11px] font-normal text-slate-400">· {r.count}</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${ranked && i < 3 ? "bg-primary-600" : "bg-primary-500/60"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>}
    </div>
  );
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{p.label || label}</p>
      <p className="flex items-center justify-between gap-6"><span className="flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-primary-600" />Collected</span><span className="font-semibold text-slate-800 dark:text-slate-100">{fmt(p.collected)}</span></p>
      <p className="flex items-center justify-between gap-6"><span className="flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-rose-500" />Refunds</span><span className="font-semibold text-rose-500">− {fmt(p.refunds)}</span></p>
      <p className="flex items-center justify-between gap-6 pt-1 mt-1 border-t border-slate-100 dark:border-slate-800"><span className="flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />Net</span><span className="font-semibold text-emerald-600">{fmt(p.net)}</span></p>
    </div>
  );
}

export default function FinancialReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [preset, setPreset] = useState("30d");
  const [dateFrom, setDateFrom] = useState(() => rangeFor("30d").from);
  const [dateTo, setDateTo] = useState(() => rangeFor("30d").to);
  const [showFilters, setShowFilters] = useState(false);
  const [series, setSeries] = useState({ collected: true, refunds: true, net: true });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const abortRef = useRef(null);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const r = await api.get("/admin/finance/report", { params, signal: controller.signal });
      setData(r.data);
    } catch (e) {
      if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return;
      setError(true);
    } finally { if (abortRef.current === controller) { setLoading(false); abortRef.current = null; } }
  }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, pageSize]);

  const applyPreset = (key) => { setPreset(key); const { from, to } = rangeFor(key); setDateFrom(from); setDateTo(to); };

  const k = data?.kpis || {};
  const byDay = data?.by_day || [];
  const pageCount = Math.max(1, Math.ceil(byDay.length / pageSize));
  const cur = Math.min(page, pageCount);
  const pageRows = byDay.slice((cur - 1) * pageSize, cur * pageSize);

  const trendAsc = useMemo(() => byDay.slice().sort((a, b) => (a.date < b.date ? -1 : 1)), [byDay]);
  const { data: chartData, gran } = useMemo(() => bucketize(trendAsc.map((d) => ({ ...d, label: shortDate(d.date) }))), [trendAsc]);

  // Data-driven insights (real values only — no fabrication)
  const insights = useMemo(() => {
    const top = (arr, key) => (arr && arr.length ? arr.reduce((m, r) => ((r.amount || 0) > (m.amount || 0) ? r : m)) : null);
    const bestDay = byDay.length ? byDay.reduce((m, r) => ((r.net || 0) > (m.net || 0) ? r : m)) : null;
    const worstRefund = byDay.length ? byDay.reduce((m, r) => ((r.refunds || 0) > (m.refunds || 0) ? r : m)) : null;
    return {
      cat: top(data?.by_category, "category"), svc: top(data?.top_services, "name"),
      method: top(data?.by_method, "label"), bestDay, worstRefund,
    };
  }, [data, byDay]);

  const exportCsv = () => {
    if (!byDay.length) return toast.error("Nothing to export");
    const cols = ["date", "orders", "collected", "refunds", "net"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [["Date", "Orders", "Collected", "Refunds", "Net"].join(","), ...byDay.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    const range = dateFrom || dateTo ? `_${dateFrom || "start"}_to_${dateTo || "today"}` : "";
    a.href = url; a.download = `financial-report${range}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${byDay.length} day(s)`);
  };

  const showSkel = loading && !data;
  const rangeLabel = (PRESETS.find((p) => p.key === preset) || {}).label || "Custom";

  return (
    <div className="space-y-4" data-testid="financial-reports">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-primary-700 text-white flex items-center justify-center shrink-0"><BarChart3 className="h-5 w-5" /></div>
          <div>
            <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Financial Reports</h2>
            <p className="text-[12px] text-slate-500">Revenue, refunds, payouts & tax intelligence — {dateFrom || "all time"} → {dateTo || "today"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="fin-filter-toggle" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1"><Filter className="h-4 w-4" /> Filters</Button>
          <Button data-testid="fin-refresh" variant="outline" onClick={load} className="gap-1"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button data-testid="fin-export" onClick={exportCsv} className="gap-1 bg-primary-700 hover:bg-primary-800"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {/* Quick range chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" data-testid="fin-presets">
        {PRESETS.map((p) => (
          <button key={p.key} data-testid={`fin-preset-${p.key}`} onClick={() => applyPreset(p.key)}
            className={`px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${preset === p.key ? "bg-primary-700 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>{p.label}</button>
        ))}
      </div>

      {/* Active range chip */}
      {(dateFrom || dateTo) && (
        <div className="flex items-center gap-1.5" data-testid="fin-active-filters">
          <button onClick={() => { setDateFrom(""); setDateTo(""); setPreset("all"); }} data-testid="fin-chip-range"
            className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 ring-1 ring-primary-200 dark:ring-primary-800 text-xs font-semibold hover:bg-primary-100 transition-colors">
            {rangeLabel}: {dateFrom || "start"} → {dateTo || "today"} <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4" data-testid="fin-filters">
          <label className="text-[11px] font-semibold text-slate-500 block mb-2">Custom date range</label>
          <DateRangeControl from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPreset(""); }} testid="fin-daterange" />
        </div>
      )}

      {error && !data ? (
        <div className="rounded-2xl border border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-10 text-center" data-testid="fin-error">
          <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
          <p className="font-semibold text-rose-700 dark:text-rose-300">Unable to load financial data</p>
          <p className="text-sm text-rose-600/80 mb-4">Your date range and filters are preserved.</p>
          <Button onClick={load} className="bg-rose-600 hover:bg-rose-700" data-testid="fin-retry">Retry</Button>
        </div>
      ) : (
        <>
          {/* Primary KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="fin-kpis">
            {showSkel ? [...Array(8)].map((_, i) => <KpiSkel key={i} />) : <>
              <KpiCard label="Gross Revenue" value={fmt(k.gross_revenue || 0)} sub={`${k.orders || 0} paid orders`} tone="text-emerald-600" Icon={IndianRupee} iconCls="bg-emerald-100 text-emerald-600" />
              <KpiCard label="Refunds" value={`− ${fmt(k.refunds || 0)}`} sub={`${k.refund_count || 0} refunds`} tone="text-rose-500" Icon={ArrowDownRight} iconCls="bg-rose-100 text-rose-500" />
              <KpiCard label="Net Revenue" value={fmt(k.net_revenue || 0)} sub="After refunds" tone="text-slate-900 dark:text-white" Icon={TrendingUp} iconCls="bg-primary-100 text-primary-700" />
              <KpiCard label="Tax Collected" value={fmt(k.tax_collected || 0)} sub="GST incl." tone="text-amber-600" Icon={Receipt} iconCls="bg-amber-100 text-amber-600" />
              <KpiCard label="Platform Revenue" value={fmt(k.platform_revenue || 0)} sub="Commission earned" tone="text-primary-700" Icon={Building2} iconCls="bg-primary-100 text-primary-700" />
              <KpiCard label="Partner Earnings" value={fmt(k.partner_earnings || 0)} sub="Paid to providers" tone="text-violet-600" Icon={Users} iconCls="bg-violet-100 text-violet-600" />
              <KpiCard label="Merchant Referral" value={fmt(k.merchant_referral || 0)} sub="Referral share" tone="text-teal-600" Icon={Layers} iconCls="bg-teal-100 text-teal-600" />
              <KpiCard label="Withdrawals Paid" value={fmt(k.withdrawals_paid || 0)} sub={`Pending ${fmt(k.pending_payouts || 0)}`} tone="text-sky-600" Icon={Wallet} iconCls="bg-sky-100 text-sky-600" />
            </>}
          </div>

          {/* Secondary KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="fin-kpis-2">
            {showSkel ? [...Array(4)].map((_, i) => <KpiSkel key={i} />) : <>
              <KpiCard label="Success Rate" value={`${k.success_rate ?? 0}%`} sub="Paid vs attempted" tone="text-emerald-600" Icon={Percent} iconCls="bg-emerald-100 text-emerald-600" />
              <KpiCard label="Avg Order Value" value={fmt(k.avg_order_value || 0)} sub="Per paid order" tone="text-slate-900 dark:text-white" Icon={CreditCard} iconCls="bg-slate-100 text-slate-500" />
              <KpiCard label="Total Orders" value={k.orders || 0} sub="Paid bookings" tone="text-slate-900 dark:text-white" Icon={Package} iconCls="bg-slate-100 text-slate-500" />
              <KpiCard label="Pending Payouts" value={fmt(k.pending_payouts || 0)} sub="Awaiting release" tone="text-amber-600" Icon={TrendingDown} iconCls="bg-amber-100 text-amber-600" />
            </>}
          </div>

          {/* Insights strip (real data only) */}
          {!showSkel && (insights.cat || insights.svc || insights.method) && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="fin-insights">
              <Insight Icon={Trophy} iconCls="bg-amber-100 text-amber-600" label="Top Category" name={insights.cat?.category} value={fmt(insights.cat?.amount)} />
              <Insight Icon={Crown} iconCls="bg-primary-100 text-primary-700" label="Top Service" name={insights.svc?.name} value={fmt(insights.svc?.amount)} />
              <Insight Icon={CreditCard} iconCls="bg-violet-100 text-violet-600" label="Top Method" name={insights.method?.label} value={fmt(insights.method?.amount)} />
              <Insight Icon={CalendarDays} iconCls="bg-emerald-100 text-emerald-600" label="Best Revenue Day" name={insights.bestDay ? shortDate(insights.bestDay.date) : "—"} value={fmt(insights.bestDay?.net)} />
              <Insight Icon={ArrowDownRight} iconCls="bg-rose-100 text-rose-500" label="Largest Refund Day" name={insights.worstRefund?.refunds ? shortDate(insights.worstRefund.date) : "—"} value={insights.worstRefund?.refunds ? `− ${fmt(insights.worstRefund.refunds)}` : fmt(0)} tone="text-rose-500" />
            </div>
          )}

          {/* Revenue trend chart */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5" data-testid="fin-trend">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary-700" /> Revenue Trend <span className="text-[11px] font-normal text-slate-400">· {gran}</span></h3>
              <div className="flex items-center gap-1.5">
                {[["collected", "Collected", "bg-primary-600"], ["refunds", "Refunds", "bg-rose-500"], ["net", "Net", "bg-emerald-500"]].map(([key, lbl, dot]) => (
                  <button key={key} data-testid={`fin-series-${key}`} onClick={() => setSeries((s) => ({ ...s, [key]: !s[key] }))}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${series[key] ? "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200" : "border-transparent text-slate-300 dark:text-slate-600 line-through"}`}>
                    <span className={`h-2 w-2 rounded-full ${dot} ${series[key] ? "" : "opacity-30"}`} /> {lbl}
                  </button>
                ))}
              </div>
            </div>
            {showSkel ? <Skel className="h-56 w-full" />
              : chartData.length === 0 ? <p className="text-sm text-slate-400 py-16 text-center">No revenue in this range</p>
                : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => (v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)} />
                      <RTooltip content={<ChartTooltip />} />
                      {series.collected && <Area type="monotone" dataKey="collected" stroke="#2563eb" strokeWidth={2} fill="url(#gC)" dot={false} activeDot={{ r: 4 }} />}
                      {series.net && <Area type="monotone" dataKey="net" stroke="#10b981" strokeWidth={2} fill="url(#gN)" dot={false} activeDot={{ r: 4 }} />}
                      {series.refunds && <Area type="monotone" dataKey="refunds" stroke="#f43f5e" strokeWidth={2} fill="url(#gR)" dot={false} activeDot={{ r: 4 }} />}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
          </div>

          {/* Breakdowns */}
          <div className="grid lg:grid-cols-3 gap-4">
            <BreakdownCard title="By Payment Method" Icon={CreditCard} rows={data?.by_method || []} nameKey="label" testid="fin-by-method" loading={showSkel} />
            <BreakdownCard title="By Category" Icon={PieChart} rows={data?.by_category || []} nameKey="category" testid="fin-by-category" loading={showSkel} />
            <BreakdownCard title="Top Services" Icon={Package} rows={data?.top_services || []} nameKey="name" testid="fin-top-services" ranked loading={showSkel} />
          </div>

          {/* Daily breakdown table */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden" data-testid="fin-daily-table">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><Receipt className="h-5 w-5 text-primary-700" /> Day-by-Day Breakdown</h3>
            </div>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 sticky top-0 z-10">
                  <tr>{["Date", "Orders", "Collected", "Refunds", "Net"].map((h, i) => <th key={i} className={`font-medium px-4 py-3 whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {showSkel ? [...Array(8)].map((_, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-800"><td colSpan={5} className="px-4 py-3"><Skel className="h-5 w-full" /></td></tr>)
                    : pageRows.length === 0 ? <tr><td colSpan={5} className="px-4 py-14 text-center"><Receipt className="h-7 w-7 text-slate-300 mx-auto mb-2" /><p className="text-slate-500 font-medium">No financial data for this period</p><p className="text-[12px] text-slate-400">Try a different date range.</p></td></tr>
                      : pageRows.map((r) => (
                        <tr key={r.date} data-testid={`fin-day-${r.date}`} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.date}</td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.orders}</td>
                          <td className="px-4 py-3 text-right font-medium text-emerald-600 whitespace-nowrap">{fmt(r.collected)}</td>
                          <td className="px-4 py-3 text-right text-rose-500 whitespace-nowrap">{r.refunds ? `− ${fmt(r.refunds)}` : fmt(0)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{fmt(r.net)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {byDay.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500 flex-wrap">
                <div className="flex items-center gap-3">
                  <span data-testid="fin-page-info">{(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, byDay.length)} of {byDay.length} days</span>
                  <select data-testid="fin-page-size" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[12px]">
                    {[10, 25, 50, 100].map((s) => <option key={s} value={s}>{`${s} / page`}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <Pg testid="fin-first" disabled={cur === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></Pg>
                  <Pg testid="fin-prev" disabled={cur === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Pg>
                  <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{cur} / {pageCount}</span>
                  <Pg testid="fin-next" disabled={cur === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}><ChevronRight className="h-4 w-4" /></Pg>
                  <Pg testid="fin-last" disabled={cur === pageCount} onClick={() => setPage(pageCount)}><ChevronsRight className="h-4 w-4" /></Pg>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const Insight = ({ Icon, iconCls, label, name, value, tone = "text-slate-900 dark:text-white" }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
    <div className="flex items-center gap-2">
      <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}><Icon className="h-4 w-4" /></span>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
    </div>
    <p className="font-semibold text-slate-800 dark:text-slate-100 mt-2 truncate capitalize">{name || "—"}</p>
    <p className={`font-heading font-bold text-sm ${tone}`}>{value}</p>
  </div>
);

const Pg = ({ children, disabled, onClick, testid }) => (
  <button data-testid={testid} onClick={onClick} disabled={disabled} className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">{children}</button>
);
