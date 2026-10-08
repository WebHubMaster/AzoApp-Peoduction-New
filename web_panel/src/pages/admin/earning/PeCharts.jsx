import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar as RBar, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { LineChart as LineIcon, BarChart3, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import { Section, Seg, C, inr, inrC, pct } from "@/pages/admin/earning/peShared";

const inflight = new Map();
function fetchTrend(params) {
  const key = JSON.stringify(params);
  const hit = inflight.get(key);
  if (hit && Date.now() - hit.t < 30000) return hit.p;
  const p = api.get("/admin/platform-earning/trend", { params }).then((r) => r.data);
  p.catch(() => inflight.delete(key));
  inflight.set(key, { t: Date.now(), p });
  return p;
}

function useTrend(params, bucket) {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify({ ...params, bucket });
  useEffect(() => {
    let alive = true;
    setS((x) => ({ ...x, loading: true, error: null }));
    const p = JSON.parse(key);
    if (tick) { p.nocache = "1"; p._t = tick; }
    fetchTrend(p).then((d) => alive && setS({ data: d, loading: false, error: null }))
      .catch(() => alive && setS({ data: null, loading: false, error: "Unable to load data" }));
    return () => { alive = false; };
  }, [key, tick]);
  return { ...s, reload: () => setTick((t) => t + 1) };
}

const BUCKETS = [["auto", "Auto"], ["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]];
const label = (b, unit) => {
  if (!b) return "";
  if (unit === "month") { const [y, m] = b.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }); }
  const d = new Date(b + "T00:00:00");
  const s = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  return unit === "week" ? `Wk ${s}` : s;
};
const axis = { fontSize: 11, fill: "#94A3B8" };

function Tip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-[12px] min-w-[180px]">
      <p className="font-bold text-slate-900 mb-1.5">{label(r.bucket, unit)}</p>
      {[["Revenue", inr(r.revenue, 0), C.blue], ["Expenses", inr(r.expenses, 0), C.red], ["Profit", inr(r.gross_profit, 0), C.green], ["Margin", pct(r.margin), C.navy]].concat(r.net_profit != null ? [["Net Profit", inr(r.net_profit, 0), C.green]] : []).map(([k, v, c]) => (
        <div key={k} className="flex justify-between gap-4 py-0.5"><span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{k}</span><span className="font-semibold tabular-nums text-slate-900">{v}</span></div>
      ))}
    </div>
  );
}

const hasValues = (d) => (d?.series || []).some((x) => x.revenue || x.expenses || x.gross_profit);

export function PnlChart({ params }) {
  const [bucket, setBucket] = useState("auto");
  const [metric, setMetric] = useState("revenue");
  const st = useTrend(params, bucket);
  const d = st.data; const unit = d?.bucket;
  const M = { revenue: ["revenue", C.blue], expenses: ["expenses", C.red], profit: ["gross_profit", C.green] }[metric];
  return (
    <Section className="h-full" testid="pe-pnl-chart" title="Profit & Loss Visualization" subtitle={unit ? `${unit[0].toUpperCase()}${unit.slice(1)}ly aggregation` : "Server-aggregated trend"} icon={LineIcon} state={st} isEmpty={d && !hasValues(d)}
      actions={<Seg testid="pe-pnl-chart-bucket" options={BUCKETS} value={bucket} onChange={setBucket} />}>
      <div className="mb-3"><Seg testid="pe-pnl-chart-metric" options={[["revenue", "Revenue"], ["expenses", "Expenses"], ["profit", "Profit"]]} value={metric} onChange={setMetric} /></div>
      <div className="h-[280px] xl:h-[560px] -ml-2 overflow-x-auto"><div className="h-full min-w-[520px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 260 }}>
          <AreaChart data={d?.series || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs><linearGradient id="peFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={M[1]} stopOpacity={0.22} /><stop offset="100%" stopColor={M[1]} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="bucket" tickFormatter={(b) => label(b, unit)} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={inrC} tick={axis} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<Tip unit={unit} />} />
            <Area type="monotone" dataKey={M[0]} stroke={M[1]} strokeWidth={2.2} fill="url(#peFill)" isAnimationActive animationDuration={600} />
          </AreaChart>
        </ResponsiveContainer>
      </div></div>
    </Section>
  );
}

export function RevenueExpenseChart({ params }) {
  const [bucket, setBucket] = useState("auto");
  const st = useTrend(params, bucket);
  const d = st.data; const unit = d?.bucket;
  return (
    <Section testid="pe-rev-exp-chart" title="Revenue vs Expenses" subtitle="Expenses = refunds + payouts + gateway charges" icon={BarChart3} state={st} isEmpty={d && !hasValues(d)}
      actions={<Seg testid="pe-rev-exp-bucket" options={BUCKETS.slice(1)} value={bucket === "auto" ? unit || "auto" : bucket} onChange={setBucket} />}>
      <div className="flex gap-4 mb-2 text-[12px]"><span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: C.blue }} />Revenue</span><span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "#F87171" }} />Expenses</span></div>
      <div className="h-[260px] -ml-2 overflow-x-auto"><div className="h-full min-w-[520px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 260 }}>
          <BarChart data={d?.series || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="bucket" tickFormatter={(b) => label(b, unit)} tick={axis} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis tickFormatter={inrC} tick={axis} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<Tip unit={unit} />} cursor={{ fill: "#F8FAFC" }} />
            <RBar dataKey="revenue" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <RBar dataKey="expenses" fill="#F87171" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div></div>
    </Section>
  );
}

export function ProfitTrendChart({ params }) {
  const [bucket, setBucket] = useState("auto");
  const [show, setShow] = useState({ gross_profit: true, net_profit: true, margin: true });
  const st = useTrend(params, bucket);
  const d = st.data; const unit = d?.bucket;
  const sets = [["gross_profit", "Gross Profit", C.green], ...(d?.expense_configured ? [["net_profit", "Net Profit", C.navy]] : []), ["margin", "Profit Margin", C.purple]];
  return (
    <Section testid="pe-profit-trend" title="Profit Trend" subtitle={d && !d.expense_configured ? "Net profit hidden — expense data not configured" : "Gross profit, net profit & margin"} icon={TrendingUp} tone={C.green} state={st} isEmpty={d && !hasValues(d)}
      actions={<Seg testid="pe-profit-trend-bucket" options={BUCKETS.slice(1)} value={bucket === "auto" ? unit || "auto" : bucket} onChange={setBucket} />}>
      <div className="flex flex-wrap gap-2 mb-2">
        {sets.map(([k, l, c]) => (
          <button key={k} data-testid={`pe-profit-toggle-${k}`} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${show[k] ? "border-transparent text-white" : "border-slate-200 text-slate-400 bg-white"}`} style={show[k] ? { background: c } : undefined}>{l}</button>
        ))}
      </div>
      <div className="h-[260px] -ml-2 overflow-x-auto"><div className="h-full min-w-[520px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 260 }}>
          <ComposedChart data={d?.series || []} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="bucket" tickFormatter={(b) => label(b, unit)} tick={axis} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis yAxisId="l" tickFormatter={inrC} tick={axis} axisLine={false} tickLine={false} width={64} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} tick={axis} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<Tip unit={unit} />} />
            {show.gross_profit && <Line yAxisId="l" type="monotone" dataKey="gross_profit" stroke={C.green} strokeWidth={2.2} dot={false} />}
            {d?.expense_configured && show.net_profit && <Line yAxisId="l" type="monotone" dataKey="net_profit" stroke={C.navy} strokeWidth={2} dot={false} />}
            {show.margin && <Line yAxisId="r" type="monotone" dataKey="margin" stroke={C.purple} strokeWidth={1.8} strokeDasharray="4 3" dot={false} connectNulls />}
          </ComposedChart>
        </ResponsiveContainer>
      </div></div>
    </Section>
  );
}

export default function PeCharts({ params }) {
  return (
    <>
      <PnlChart params={params} />
      <div className="grid xl:grid-cols-2 gap-4">
        <RevenueExpenseChart params={params} />
        <ProfitTrendChart params={params} />
      </div>
    </>
  );
}
