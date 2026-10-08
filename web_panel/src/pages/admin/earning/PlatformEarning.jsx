import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { ChartNoAxesCombined, SlidersHorizontal, RefreshCw, Download, X, Loader2, CheckCircle2, ChevronDown, CalendarRange, FilterX } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import PremiumDateRangePicker from "@/components/ui/PremiumDateRangePicker";
import { Card, Skel, useSection } from "@/pages/admin/earning/peShared";
import PeFilters, { EMPTY_FILTERS, FILTER_FIELDS, activeCount, labelFor } from "@/pages/admin/earning/PeFilters";
import { KpiGrid, HealthStrip, AnomalyPanel } from "@/pages/admin/earning/PeOverview";
import { PnlStatement, RevenueBreakdown, RefundImpact, Reconciliation, FeeAnalytics } from "@/pages/admin/earning/PePnl";
import { CommissionAnalytics, PayoutAnalytics, GatewayCost, TopPerformers } from "@/pages/admin/earning/PeAnalytics";
import { ProfitabilityTable, RecordsTable } from "@/pages/admin/earning/PeTables";
import PeDetailDrawer from "@/pages/admin/earning/PeDetailDrawer";

const PnlChart = lazy(() => import("@/pages/admin/earning/PeCharts").then((m) => ({ default: m.PnlChart })));
const RevenueExpenseChart = lazy(() => import("@/pages/admin/earning/PeCharts").then((m) => ({ default: m.RevenueExpenseChart })));
const ProfitTrendChart = lazy(() => import("@/pages/admin/earning/PeCharts").then((m) => ({ default: m.ProfitTrendChart })));

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const PRESETS = {
  today: ["Today", () => [today0(), today0()]],
  yesterday: ["Yesterday", () => [add(today0(), -1), add(today0(), -1)]],
  "7d": ["Last 7 Days", () => [add(today0(), -6), today0()]],
  "30d": ["Last 30 Days", () => [add(today0(), -29), today0()]],
  month: ["This Month", () => { const t = today0(); return [new Date(t.getFullYear(), t.getMonth(), 1), t]; }],
  lastmonth: ["Last Month", () => { const t = today0(); return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)]; }],
  year: ["This Year", () => { const t = today0(); return [new Date(t.getFullYear(), 0, 1), t]; }],
  all: ["All Time", () => [null, null]],
};
const rangeOf = (key) => { const [a, b] = PRESETS[key][1](); return { preset: key, from: a ? iso(a) : "", to: b ? iso(b) : "" }; };
const PICKER_PRESETS = Object.entries(PRESETS).filter(([k]) => k !== "all").map(([key, [label, fn]]) => ({ key, label, range: () => { const [from, to] = fn(); return { from, to }; } }));
const prettyD = (s) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const EXPORTS = [["records", "Financial Records"], ["service", "Service Profitability"], ["category", "Category Profitability"], ["city", "City-wise Earnings"], ["partner", "Partner Contribution"], ["merchant", "Merchant Contribution"], ["source", "Earning by Type"]];

export default function PlatformEarning({ onNavigate, onOpenBooking }) {
  const [range, setRange] = useState(() => rangeOf("30d"));
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [nonce, setNonce] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const recSort = useState("date");
  const [recSource, setRecSource] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState("idle");
  const recRef = useRef(null);

  const params = useMemo(() => {
    const p = { date_from: range.from, date_to: range.to };
    FILTER_FIELDS.forEach((f) => { if (filters[f.key]?.length) p[f.key] = filters[f.key].join(","); });
    if (filters.min_amount !== "") p.min_amount = filters.min_amount;
    if (filters.max_amount !== "") p.max_amount = filters.max_amount;
    Object.keys(p).forEach((k) => { if (p[k] === "") delete p[k]; });
    if (nonce) { p.nocache = "1"; p._r = nonce; }
    return p;
  }, [range, filters, nonce]);
  const recParams = useMemo(() => (recSource ? { ...params, source: recSource } : params), [params, recSource]);

  const meta = useSection("/admin/platform-earning/meta", {});
  const summary = useSection("/admin/platform-earning/summary", params);
  const top = useSection("/admin/platform-earning/top", params);
  const commission = useSection("/admin/platform-earning/commission", params);
  const fees = useSection("/admin/platform-earning/fees", params);
  const payouts = useSection("/admin/platform-earning/payouts", params);
  const gateway = useSection("/admin/platform-earning/gateway", params);
  const anomalies = useSection("/admin/platform-earning/anomalies", params);

  const nFilters = activeCount(filters);
  const empty = summary.data && !summary.data.has_data;
  const refreshing = summary.loading && !!summary.data;

  const drill = (dim, value) => {
    if (!value) return;
    setFilters((f) => ({ ...f, [dim]: [String(value)] }));
    toast.success(`Filtered by ${dim}: ${dim === "partner" || dim === "merchant" ? labelFor(meta.data, dim, value) : value}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const trace = (t = {}) => {
    setRecSource(t.source || "");
    if (t.sort) recSort[1](t.sort);
    recRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openPicker = () => document.querySelector('[data-testid="pe-date-range"]')?.click();

  const runExport = async (report, sort = "date", order = "desc", q = "") => {
    if (exportPhase !== "idle") return;
    setExportOpen(false);
    setExportPhase("preparing");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const started = Date.now();
    const tid = toast.loading("Preparing report…");
    try {
      const p = { ...(report === "records" ? recParams : params), report, sort, order };
      delete p.nocache; delete p._r;
      if (q) p.q = q;
      const res = await api.get("/admin/platform-earning/export", {
        params: p, responseType: "blob", timeout: 300000,
      });
      await wait(Math.max(0, 500 - (Date.now() - started)));
      setExportPhase("generating"); toast.loading("Generating…", { id: tid });
      await wait(500);
      const cd = res.headers?.["content-disposition"] || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || `platform_earning_${report}.csv`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      setExportPhase("ready");
      toast.success("Download ready", { id: tid, description: name });
      setTimeout(() => setExportPhase("idle"), 2500);
    } catch {
      setExportPhase("idle");
      toast.error("Export failed. Please retry.", { id: tid });
    }
  };
  const busy = exportPhase !== "idle";

  const chips = [];
  chips.push({ k: "date", label: range.preset && range.preset !== "custom" ? PRESETS[range.preset][0] : `${prettyD(range.from)} – ${prettyD(range.to)}`, clear: range.preset === "all" ? null : () => setRange(rangeOf("all")) });
  FILTER_FIELDS.forEach((f) => (filters[f.key] || []).forEach((v) => chips.push({ k: `${f.key}-${v}`, label: labelFor(meta.data, f.key, v), pre: f.label, clear: () => setFilters((x) => ({ ...x, [f.key]: x[f.key].filter((y) => y !== v) })) })));
  if (filters.min_amount !== "") chips.push({ k: "min", label: `≥ ₹${filters.min_amount}`, pre: "Amount", clear: () => setFilters((x) => ({ ...x, min_amount: "" })) });
  if (filters.max_amount !== "") chips.push({ k: "max", label: `≤ ₹${filters.max_amount}`, pre: "Amount", clear: () => setFilters((x) => ({ ...x, max_amount: "" })) });

  const ChartSkel = () => <Card className="p-5 h-[360px] space-y-3"><Skel h="h-5" w="w-40" /><Skel h="h-[280px]" /></Card>;

  return (
    <div className="space-y-5 pb-10" data-testid="platform-earning">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-[12px] bg-[#0B1F44] text-white flex items-center justify-center shrink-0"><ChartNoAxesCombined className="h-5 w-5" /></div>
          <div>
            <h1 className="font-heading font-extrabold text-[22px] leading-tight text-slate-900 dark:text-white" data-testid="pe-title">Platform Earning</h1>
            <p className="text-[13px] text-slate-500">Complete financial overview of AzoApp platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <PremiumDateRangePicker data-testid="pe-date-range" from={range.from} to={range.to} presets={PICKER_PRESETS} align="end" triggerLabel="All Time"
            onApply={(r) => { if (!r) return setRange(rangeOf("all")); const k = Object.keys(PRESETS).find((key) => { const x = rangeOf(key); return x.from === r.from && x.to === r.to; }); setRange({ preset: k || "custom", from: r.from, to: r.to }); }} />
          {range.preset !== "all" && <Button variant="outline" data-testid="pe-preset-all" onClick={() => setRange(rangeOf("all"))} className="h-[42px] px-3 text-[13px]">All Time</Button>}
          <Button variant="outline" data-testid="pe-filter-btn" onClick={() => setShowFilters(true)} className="h-[42px] gap-1.5">
            <SlidersHorizontal className="h-4 w-4" /> Filters {nFilters > 0 && <span data-testid="pe-filter-count" className="h-5 min-w-[20px] px-1 rounded-md bg-[#0D47A1] text-white text-[10px] font-bold flex items-center justify-center">{nFilters}</span>}
          </Button>
          <Button variant="outline" data-testid="pe-refresh" onClick={() => setNonce((n) => n + 1)} className="h-[42px] gap-1.5"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh</Button>
          <div className="relative">
            <Button data-testid="pe-export-btn" disabled={busy} onClick={() => setExportOpen((o) => !o)} className="h-[42px] gap-1.5 bg-[#0D47A1] hover:bg-[#0B3C8A] min-w-[120px]">
              {exportPhase === "preparing" || exportPhase === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : exportPhase === "ready" ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {exportPhase === "preparing" ? "Preparing…" : exportPhase === "generating" ? "Generating…" : exportPhase === "ready" ? "Ready" : "Export"}
              {!busy && exportPhase === "idle" && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
            </Button>
            {exportOpen && <>
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-[48px] z-50 w-60 rounded-[12px] border border-slate-200 bg-white dark:bg-slate-900 shadow-xl p-1.5" data-testid="pe-export-menu">
                <p className="px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">CSV · respects date, filters & search</p>
                {EXPORTS.map(([k, l]) => <button key={k} data-testid={`pe-export-${k}`} onClick={() => runExport(k, k === "records" ? recSort[0] : "revenue", "desc", k === "records" ? search : "")} className="w-full text-left px-2.5 py-2 rounded-lg text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">{l}</button>)}
              </div>
            </>}
          </div>
        </div>
      </div>
      <p className="-mt-2 text-[11.5px] text-slate-400 hidden md:block">Revenue · Costs · Profit & Loss · Commission · Fees · Refund impact · Partner/Merchant payouts — aggregated live from settled ledger, refunds, payments & withdrawals.</p>

      {/* Chips */}
      <div className="flex items-center gap-2 flex-wrap" data-testid="pe-chips">
        {chips.map((c) => (
          <span key={c.k} data-testid={`pe-chip-${c.k}`} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-[#E8F0FE] text-[#0D47A1] text-[12px] font-semibold">
            {c.k === "date" && <CalendarRange className="h-3.5 w-3.5" />}{c.pre && <span className="font-normal text-[#0D47A1]/60">{c.pre}:</span>}{c.label}
            {c.clear && <button data-testid={`pe-chip-${c.k}-remove`} onClick={c.clear} className="h-5 w-5 rounded-full hover:bg-[#0D47A1]/10 flex items-center justify-center"><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {nFilters > 0 && <button data-testid="pe-chips-clear" onClick={() => setFilters(EMPTY_FILTERS)} className="text-[12px] font-semibold text-slate-500 hover:text-red-600 ml-1">Clear all</button>}
      </div>

      {empty ? (
        <Card className="py-16 px-6 flex flex-col items-center text-center" data-testid="pe-empty">
          <div className="h-14 w-14 rounded-2xl bg-[#E8F0FE] text-[#0D47A1] flex items-center justify-center mb-4"><ChartNoAxesCombined className="h-7 w-7" /></div>
          <p className="font-heading font-bold text-lg text-slate-900 dark:text-white">No financial activity for this period</p>
          <p className="text-[13px] text-slate-500 mt-1 max-w-md">There are no settled bookings, refunds, fees or other platform income matching the selected date range and filters.</p>
          <div className="flex gap-2 mt-5">
            <Button variant="outline" data-testid="pe-empty-change-range" onClick={openPicker} className="gap-1.5"><CalendarRange className="h-4 w-4" />Change Date Range</Button>
            <Button variant="outline" data-testid="pe-empty-clear" disabled={!nFilters} onClick={() => setFilters(EMPTY_FILTERS)} className="gap-1.5"><FilterX className="h-4 w-4" />Clear Filters</Button>
          </div>
        </Card>
      ) : <>
        <KpiGrid state={summary} onTrace={trace} />
        <HealthStrip state={summary} />
        <AnomalyPanel state={anomalies} onNavigate={onNavigate} onSearch={(r) => { setSearch(r); trace({}); }} />

        <div className="grid xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5"><PnlStatement state={summary} /></div>
          <div className="xl:col-span-7"><Suspense fallback={<ChartSkel />}><PnlChart params={params} /></Suspense></div>
        </div>
        <div className="grid xl:grid-cols-2 gap-4">
          <Suspense fallback={<ChartSkel />}><RevenueExpenseChart params={params} /></Suspense>
          <Suspense fallback={<ChartSkel />}><ProfitTrendChart params={params} /></Suspense>
        </div>
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <RevenueBreakdown state={summary} />
          <RefundImpact state={summary} onNavigate={onNavigate} />
          <Reconciliation state={summary} />
        </div>
        <CommissionAnalytics state={commission} onDrill={drill} />
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <FeeAnalytics state={fees} />
          <PayoutAnalytics state={payouts} onNavigate={onNavigate} />
          <GatewayCost state={gateway} />
        </div>
        <TopPerformers state={top} onDrill={drill} />
        <ProfitabilityTable params={params} onDrill={drill} exporting={busy} onExport={(dim, sort, order) => runExport(dim, sort, order)} />
        <RecordsTable innerRef={recRef} params={recParams} search={search} setSearch={setSearch} sortState={recSort} onOpen={setDetail} exporting={busy}
          localSource={recSource} clearLocalSource={() => setRecSource("")} onExport={(r, sort, order, q) => runExport(r, sort, order, q)} />
      </>}

      <PeFilters open={showFilters} onClose={() => setShowFilters(false)} meta={meta.data} value={filters} onApply={setFilters} />
      {detail && <PeDetailDrawer uid={detail} onClose={() => setDetail(null)} onNavigate={(k) => { setDetail(null); onNavigate?.(k); }} onOpenBooking={(id) => { setDetail(null); onOpenBooking?.(id); }} />}
    </div>
  );
}
