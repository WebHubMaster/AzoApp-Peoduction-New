import { IndianRupee, TrendingUp, Receipt, PiggyBank, Landmark, Percent, BadgePercent, Coins, RotateCcw, Users, Store, Activity, ShieldAlert, HeartPulse, ArrowUpRight } from "lucide-react";
import { Card, Skel, SectionError, Delta, C, inr, pct, num, growth } from "@/pages/admin/earning/peShared";

function Kpi({ k, onTrace }) {
  return (
    <Card data-testid={`pe-kpi-${k.id}`} onClick={() => onTrace?.(k.trace)}
      className="p-4 group cursor-pointer transition-[border-color,transform] duration-200 hover:border-[#0D47A1]/30 hover:-translate-y-[1px]">
      <div className="flex items-center justify-between">
        <span className="h-8 w-8 rounded-[9px] flex items-center justify-center" style={{ background: `${k.tone}14`, color: k.tone }}><k.icon className="h-4 w-4" /></span>
        <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-[#0D47A1] transition-colors" />
      </div>
      <p className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400">{k.label}</p>
      {k.value == null
        ? <p data-testid={`pe-kpi-${k.id}-value`} className="mt-1 text-[13px] font-semibold text-slate-400">{k.missing}</p>
        : <p data-testid={`pe-kpi-${k.id}-value`} className="mt-1 font-heading font-extrabold text-[22px] leading-tight tracking-tight tabular-nums" style={{ color: k.color || "#0B1F44" }}>{k.fmt ? k.fmt(k.value) : inr(k.value)}</p>}
      <div className="mt-1.5 flex items-center gap-1.5 min-h-[20px] flex-wrap">
        {k.delta != null && <><Delta value={k.delta} invert={k.invert} testid={`pe-kpi-${k.id}-delta`} /><span className="text-[11px] text-slate-400">vs previous period</span></>}
        {k.delta == null && <span className="text-[11px] text-slate-400 truncate">{k.sub}</span>}
      </div>
      {k.delta != null && k.sub && <p className="text-[11px] text-slate-400 truncate">{k.sub}</p>}
    </Card>
  );
}

export function KpiGrid({ state, onTrace }) {
  if (state.error) return <Card className="p-4"><SectionError onRetry={state.reload} testid="pe-kpis-error" /></Card>;
  if (!state.data) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(12)].map((_, i) => <Card key={i} className="p-4 space-y-3"><Skel h="h-8" w="w-8" /><Skel h="h-3" w="w-24" /><Skel h="h-6" w="w-32" /></Card>)}</div>;
  const s = state.data; const p = s.pnl; const pv = s.previous;
  const g = (cur, key) => (pv ? growth(cur, key(pv)) : null);
  const ptsDelta = pv && p.gross_margin != null && pv.gross_margin != null ? p.gross_margin - pv.gross_margin : null;
  const kpis = [
    { id: "gross-revenue", label: "Gross Platform Revenue", icon: IndianRupee, tone: C.blue, value: p.revenue, delta: g(p.revenue, (x) => x.revenue), sub: `${inr(p.gross_collection, 0)} collected incl. GST`, trace: { sort: "gross" } },
    { id: "net-revenue", label: "Net Platform Revenue", icon: TrendingUp, tone: C.blue, color: C.blue, value: p.platform_revenue, delta: g(p.platform_revenue, (x) => x.platform_revenue), sub: `Take rate ${pct(p.take_rate)}`, trace: { sort: "platform_revenue" } },
    { id: "costs", label: "Total Platform Costs", icon: Receipt, tone: C.red, value: p.costs, delta: g(p.costs, (x) => x.costs), invert: true, sub: "Refunds, payouts & gateway", trace: { sort: "partner_payout" } },
    { id: "gross-profit", label: "Gross Profit", icon: PiggyBank, tone: C.green, color: p.gross_profit < 0 ? C.red : C.green, value: p.gross_profit, delta: g(p.gross_profit, (x) => x.gross_profit), sub: "After gateway charges", trace: { sort: "net_earning" } },
    { id: "net-profit", label: "Net Profit", icon: Landmark, tone: C.green, color: C.green, value: s.expense_configured ? p.net_profit : null, missing: "Expense data not configured", delta: s.expense_configured && pv?.net_profit != null ? growth(p.net_profit, pv.net_profit) : null, sub: "After operating expenses", trace: { sort: "net_earning" } },
    { id: "margin", label: "Profit Margin", icon: Percent, tone: C.green, value: p.gross_margin, fmt: (v) => pct(v), sub: "Gross profit ÷ revenue", delta: null, trace: { sort: "net_earning" }, extra: ptsDelta },
    { id: "commission", label: "Platform Commission", icon: BadgePercent, tone: C.purple, color: C.purple, value: s.commission, delta: pv ? growth(s.commission, pv.commission) : null, sub: `${num(s.counts.bookings_settled)} settled bookings`, trace: { source: "booking", sort: "commission" } },
    { id: "fees", label: "Platform Fees", icon: Coins, tone: C.blue, value: s.platform_fee, delta: pv ? growth(s.platform_fee, pv.platform_fee) : null, sub: "Convenience + platform fees", trace: { source: "booking", sort: "platform_revenue" } },
    { id: "refund-impact", label: "Refund Impact", icon: RotateCcw, tone: C.red, color: C.red, value: p.refunds + p.refund_pending, delta: pv ? growth(p.refunds + p.refund_pending, pv.refunds + pv.refund_pending) : null, invert: true, sub: `${num(s.counts.cancellations)} cancellations`, trace: { source: "cancellation", sort: "refund" } },
    { id: "partner-payouts", label: "Partner Payouts", icon: Users, tone: C.orange, value: p.partner_payout, delta: g(p.partner_payout, (x) => x.partner_payout), sub: "Earnings accrued to partners", trace: { sort: "partner_payout" } },
    { id: "merchant-payouts", label: "Merchant Payouts", icon: Store, tone: C.orange, value: p.merchant_payout, delta: g(p.merchant_payout, (x) => x.merchant_payout), sub: "Referral + customer commission", trace: { source: "booking" } },
    { id: "transactions", label: "Total Transactions", icon: Activity, tone: C.navy, value: s.counts.rows, fmt: num, delta: pv ? growth(s.counts.rows, pv.rows) : null, sub: "Financial events in period", trace: {} },
  ];
  kpis[5].delta = null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="pe-kpi-grid">
      {kpis.map((k) => <Kpi key={k.id} k={k.id === "margin" && k.extra != null ? { ...k, sub: `${k.extra >= 0 ? "+" : "−"}${Math.abs(k.extra).toFixed(1)} pts vs previous period` } : k} onTrace={onTrace} />)}
    </div>
  );
}

export function HealthStrip({ state }) {
  const h = state.data?.health;
  const items = h ? [
    ["Revenue Growth", h.revenue_growth, (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`, h.revenue_growth == null ? "Needs a bounded date range with prior data" : "Net revenue vs previous period", h.revenue_growth >= 0 ? C.green : C.red],
    ["Profit Margin", h.profit_margin, (v) => pct(v), "Gross profit ÷ revenue", C.green],
    ["Refund Rate", h.refund_rate, (v) => pct(v), `${pct(h.refund_value_rate)} of collection value`, C.red],
    ["Payout Ratio", h.payout_ratio, (v) => pct(v), "Partner + merchant ÷ revenue", C.orange],
    ["Txn Success Rate", h.txn_success_rate, (v) => pct(v), "Captured ÷ (captured + failed)", C.blue],
    ["Avg Order Value", h.avg_order_value, (v) => inr(v, 0), "Settled bookings", C.navy],
  ] : [];
  return (
    <Card className="p-5" data-testid="pe-health">
      <div className="flex items-center gap-2 mb-4"><HeartPulse className="h-4 w-4 text-[#059669]" /><p className="font-heading font-bold text-[15px] text-slate-900 dark:text-white">Financial Health</p></div>
      {state.error ? <SectionError onRetry={state.reload} testid="pe-health-error" /> : !h ? <div className="grid grid-cols-2 md:grid-cols-6 gap-4">{[...Array(6)].map((_, i) => <Skel key={i} h="h-12" />)}</div> : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-y-5 gap-x-4">
          {items.map(([l, v, f, sub, col], i) => (
            <div key={l} data-testid={`pe-health-${i}`} className={`${i ? "xl:border-l xl:pl-4 border-slate-100 dark:border-slate-800" : ""}`}>
              <p className="text-[11px] font-semibold text-slate-500">{l}</p>
              <p className="font-heading font-extrabold text-[20px] tabular-nums mt-0.5" style={{ color: v == null ? "#94A3B8" : col }}>{v == null ? "—" : f(v)}</p>
              <p className="text-[11px] text-slate-400 leading-snug">{sub}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const SEV = { high: "border-red-200 bg-red-50/60 text-red-700", medium: "border-amber-200 bg-amber-50/60 text-amber-800", low: "border-slate-200 bg-slate-50 text-slate-700" };

export function AnomalyPanel({ state, onNavigate, onSearch }) {
  const items = state.data?.items || [];
  if (state.error) return <Card className="p-4"><SectionError onRetry={state.reload} testid="pe-anomalies-error" /></Card>;
  if (!state.data || !items.length) return null;
  return (
    <Card className="p-5 border-amber-200/80" data-testid="pe-anomalies">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="h-4 w-4 text-amber-600" />
        <p className="font-heading font-bold text-[15px] text-slate-900 dark:text-white">Data Quality & Anomaly Alerts</p>
        <span className="text-[11px] text-slate-400">Rule-based checks — not fraud determinations</span>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {items.map((a) => (
          <div key={a.code} data-testid={`pe-anomaly-${a.code}`} className={`rounded-xl border px-3.5 py-3 ${SEV[a.severity] || SEV.low}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-bold">{a.title}</p>
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{a.severity}</span>
            </div>
            <p className="text-[12px] mt-1 opacity-90 leading-snug">{a.detail}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(a.refs || []).map((r) => <button key={r} onClick={() => onSearch(r)} className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-current/10 hover:underline">{r}</button>)}
              {a.link && <button onClick={() => onNavigate?.(a.link)} data-testid={`pe-anomaly-${a.code}-link`} className="text-[11px] font-semibold underline underline-offset-2">Open records →</button>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
