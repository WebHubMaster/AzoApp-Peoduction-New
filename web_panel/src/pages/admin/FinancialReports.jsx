import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { useEffect, useState, useCallback, useMemo } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  BarChart3, Filter, X, Download, RefreshCw, TrendingUp, TrendingDown, Wallet,
  CreditCard, Receipt, Users, Building2, Percent, IndianRupee, ArrowDownRight,
  ChevronLeft, ChevronRight, PieChart, Layers, Package,
} from "lucide-react";
import { toast } from "sonner";

// Quick date-range presets (all values are YYYY-MM-DD in local time)
const iso = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Time" },
];
const rangeFor = (key) => {
  const now = new Date();
  const end = iso(now);
  if (key === "today") return { from: end, to: end };
  if (key === "7d") { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: iso(d), to: end }; }
  if (key === "30d") { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: iso(d), to: end }; }
  if (key === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
  if (key === "year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: end };
  return { from: "", to: "" };
};

const KpiCard = ({ label, value, sub, tone = "text-slate-900 dark:text-white", Icon, iconCls = "bg-slate-100 text-slate-500" }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
    <div className="flex items-start justify-between gap-2">
      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      {Icon && <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}><Icon className="h-4 w-4" /></span>}
    </div>
    <p className={`font-heading font-extrabold text-xl mt-1.5 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

// A breakdown table with per-row share bars.
const BreakdownCard = ({ title, Icon, rows, nameKey, testid }) => {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0) || 1;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5" data-testid={testid}>
      <h3 className="font-heading font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
        <Icon className="h-5 w-5 text-primary-700" /> {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No data in range</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => {
            const pct = Math.round(((r.amount || 0) / total) * 100);
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-700 dark:text-slate-200 truncate capitalize">{r[nameKey] || "Other"}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap ml-2">{fmt(r.amount)} <span className="text-[11px] font-normal text-slate-400">· {r.count}</span></span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-primary-600/80" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Advanced Financial Reports — full revenue/refund/payout picture with a date-range
// filter, complete KPI grid, method/category/service breakdowns, a daily trend chart
// and a paginated day-by-day ledger with CSV export.
export default function FinancialReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState("30d");
  const [dateFrom, setDateFrom] = useState(() => rangeFor("30d").from);
  const [dateTo, setDateTo] = useState(() => rangeFor("30d").to);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const r = await api.get("/admin/finance/report", { params });
      setData(r.data);
    } catch { toast.error("Failed to load financial report"); } finally { setLoading(false); }
  }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo]);

  const applyPreset = (key) => {
    setPreset(key);
    const { from, to } = rangeFor(key);
    setDateFrom(from); setDateTo(to);
  };
  const onManualDate = (setter) => (e) => { setter(e.target.value); setPreset(""); };

  const k = data?.kpis || {};
  const byDay = data?.by_day || [];
  const pageCount = Math.max(1, Math.ceil(byDay.length / pageSize));
  const cur = Math.min(page, pageCount);
  const pageRows = byDay.slice((cur - 1) * pageSize, cur * pageSize);

  const maxTrend = useMemo(() => Math.max(1, ...byDay.map((d) => Math.max(d.collected || 0, d.refunds || 0))), [byDay]);
  const trend = useMemo(() => byDay.slice(0, 30).slice().reverse(), [byDay]);

  const exportCsv = () => {
    if (!byDay.length) return toast.error("Nothing to export");
    const cols = ["date", "orders", "collected", "refunds", "net"];
    const head = ["Date", "Orders", "Collected", "Refunds", "Net"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...byDay.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    const range = dateFrom || dateTo ? `_${dateFrom || "start"}_to_${dateTo || "today"}` : "";
    a.href = url; a.download = `financial-report${range}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${byDay.length} day(s)`);
  };

  const activeFilters = [dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="space-y-4" data-testid="financial-reports">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary-700 text-white flex items-center justify-center"><BarChart3 className="h-5 w-5" /></div>
          <div>
            <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Financial Reports</h2>
            <p className="text-[11px] text-slate-400">{dateFrom || "Start"} → {dateTo || "Today"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="fin-filter-toggle" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1">
            <Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
          </Button>
          <Button data-testid="fin-refresh" variant="outline" onClick={load} className="gap-1"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button data-testid="fin-export" onClick={exportCsv} className="gap-1 bg-primary-700 hover:bg-primary-800"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {/* Quick range chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" data-testid="fin-presets">
        {PRESETS.map((p) => (
          <button key={p.key} data-testid={`fin-preset-${p.key}`} onClick={() => applyPreset(p.key)}
            className={`px-3.5 py-2 rounded-full text-sm whitespace-nowrap transition-all ${preset === p.key ? "bg-primary-700 text-white shadow" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="fin-filters">
          <div><label className="text-xs text-slate-500">From date</label><PremiumDatePicker value={dateFrom} onChange={onManualDate(setDateFrom)} placeholder="From date" /></div>
          <div><label className="text-xs text-slate-500">To date</label><PremiumDatePicker value={dateTo} onChange={onManualDate(setDateTo)} placeholder="To date" /></div>
          <div className="flex items-end"><Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); setPreset("all"); }} className="gap-1 text-slate-500"><X className="h-4 w-4" /> Clear</Button></div>
        </div>
      )}

      {loading && !data ? (
        <div className="py-20 text-center text-slate-400">Loading financial report…</div>
      ) : (
        <>
          {/* Primary KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="fin-kpis">
            <KpiCard label="Gross Revenue" value={fmt(k.gross_revenue || 0)} sub={`${k.orders || 0} paid orders`} tone="text-emerald-600" Icon={IndianRupee} iconCls="bg-emerald-100 text-emerald-600" />
            <KpiCard label="Refunds" value={fmt(k.refunds || 0)} sub={`${k.refund_count || 0} refunds`} tone="text-red-500" Icon={ArrowDownRight} iconCls="bg-red-100 text-red-500" />
            <KpiCard label="Net Revenue" value={fmt(k.net_revenue || 0)} sub="After refunds" tone="text-slate-900 dark:text-white" Icon={TrendingUp} iconCls="bg-primary-100 text-primary-700" />
            <KpiCard label="Tax Collected" value={fmt(k.tax_collected || 0)} sub="GST incl." tone="text-amber-600" Icon={Receipt} iconCls="bg-amber-100 text-amber-600" />
            <KpiCard label="Platform Revenue" value={fmt(k.platform_revenue || 0)} sub="Commission earned" tone="text-primary-700" Icon={Building2} iconCls="bg-primary-100 text-primary-700" />
            <KpiCard label="Partner Earnings" value={fmt(k.partner_earnings || 0)} sub="Paid to providers" tone="text-violet-600" Icon={Users} iconCls="bg-violet-100 text-violet-600" />
            <KpiCard label="Merchant Referral" value={fmt(k.merchant_referral || 0)} sub="Referral share" tone="text-teal-600" Icon={Layers} iconCls="bg-teal-100 text-teal-600" />
            <KpiCard label="Withdrawals Paid" value={fmt(k.withdrawals_paid || 0)} sub={`Pending ${fmt(k.pending_payouts || 0)}`} tone="text-sky-600" Icon={Wallet} iconCls="bg-sky-100 text-sky-600" />
          </div>

          {/* Secondary KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="fin-kpis-2">
            <KpiCard label="Success Rate" value={`${k.success_rate ?? 0}%`} sub="Paid vs attempted" tone="text-emerald-600" Icon={Percent} iconCls="bg-emerald-100 text-emerald-600" />
            <KpiCard label="Avg Order Value" value={fmt(k.avg_order_value || 0)} sub="Per paid order" tone="text-slate-900 dark:text-white" Icon={CreditCard} iconCls="bg-slate-100 text-slate-500" />
            <KpiCard label="Total Orders" value={k.orders || 0} sub="Paid bookings" tone="text-slate-900 dark:text-white" Icon={Package} iconCls="bg-slate-100 text-slate-500" />
            <KpiCard label="Pending Payouts" value={fmt(k.pending_payouts || 0)} sub="Awaiting release" tone="text-amber-600" Icon={TrendingDown} iconCls="bg-amber-100 text-amber-600" />
          </div>

          {/* Daily trend chart */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6" data-testid="fin-trend">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary-700" /> Revenue Trend</h3>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary-600/80" /> Collected</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Refunds</span>
              </div>
            </div>
            {trend.length === 0 ? (
              <p className="text-sm text-slate-400 py-10 text-center">No revenue in this range</p>
            ) : (
              <div className="flex items-end gap-1.5 h-44 overflow-x-auto">
                {trend.map((x) => (
                  <div key={x.date} className="flex-1 min-w-[16px] flex flex-col items-center gap-1 group relative">
                    <div className="w-full flex items-end justify-center gap-0.5 h-40">
                      <div className="w-1/2 bg-primary-600/80 rounded-t" style={{ height: `${((x.collected || 0) / maxTrend) * 100}%` }} title={`Collected ${fmt(x.collected)}`} />
                      <div className="w-1/2 bg-red-400 rounded-t" style={{ height: `${((x.refunds || 0) / maxTrend) * 100}%` }} title={`Refunds ${fmt(x.refunds)}`} />
                    </div>
                    <span className="text-[9px] text-slate-400 whitespace-nowrap">{(x.date || "").slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Breakdowns */}
          <div className="grid lg:grid-cols-3 gap-4">
            <BreakdownCard title="By Payment Method" Icon={CreditCard} rows={data?.by_method || []} nameKey="label" testid="fin-by-method" />
            <BreakdownCard title="By Category" Icon={PieChart} rows={data?.by_category || []} nameKey="category" testid="fin-by-category" />
            <BreakdownCard title="Top Services" Icon={Package} rows={data?.top_services || []} nameKey="name" testid="fin-top-services" />
          </div>

          {/* Daily breakdown table with pagination */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden" data-testid="fin-daily-table">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><Receipt className="h-5 w-5 text-primary-700" /> Day-by-Day Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                  <tr>{["Date", "Orders", "Collected", "Refunds", "Net"].map((h, i) => <th key={i} className={`font-medium px-4 py-3 whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No data in range</td></tr>
                  ) : pageRows.map((r) => (
                    <tr key={r.date} data-testid={`fin-day-${r.date}`} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.orders}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600 whitespace-nowrap">{fmt(r.collected)}</td>
                      <td className="px-4 py-3 text-right text-red-500 whitespace-nowrap">{r.refunds ? `- ${fmt(r.refunds)}` : fmt(0)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{fmt(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {byDay.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
                <span data-testid="fin-page-info">{(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, byDay.length)} of {byDay.length} days</span>
                <div className="flex items-center gap-1">
                  <button data-testid="fin-prev" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={cur === 1} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{cur} / {pageCount}</span>
                  <button data-testid="fin-next" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={cur === pageCount} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
