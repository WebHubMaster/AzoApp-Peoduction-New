import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, PieChart, Pie, LineChart, Line, Legend,
} from "recharts";
import { TrendingUp, Activity, PieChart as PieIcon } from "lucide-react";
import { Card, SectionTitle, Seg, EmptyState, ChartTooltip, DonutTooltip, sMeta, prefersReduced, axisLabel } from "./kit";

export const REV_METRICS = [
  { key: "gmv", name: "Revenue (GMV)", color: "#0D47A1" },
  { key: "platform_revenue", name: "Platform Fee", color: "#6366f1" },
  { key: "merchant_commission", name: "Merchant Commission", color: "#f59e0b" },
  { key: "partner_earnings", name: "Partner Earnings", color: "#10b981" },
  { key: "refunds", name: "Refunds", color: "#ef4444" },
];
const BUCKETS = [{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }];
const grid = <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.5} />;
const xTick = { fontSize: 10, fill: "#94a3b8" };

export function RevenueChart({ series, bucket, onBucket, onReset, available }) {
  const [active, setActive] = useState({ gmv: true, platform_revenue: true, merchant_commission: false, partner_earnings: false, refunds: false });
  const metrics = REV_METRICS.filter((m) => available.includes(m.key));
  const data = useMemo(() => series.map((r) => ({ ...r, label: axisLabel(r.date, bucket) })), [series, bucket]);
  const hasValues = data.some((r) => metrics.some((m) => active[m.key] && (r[m.key] || 0) > 0));
  return (
    <Card className="p-5 flex flex-col" data-testid="dash-revenue-chart">
      <SectionTitle icon={TrendingUp} sub="Aggregated from bookings, commission ledger & refunds"
        right={<Seg value={bucket} onChange={onBucket} options={BUCKETS} testid="rev-bucket" />}>Revenue Analytics</SectionTitle>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {metrics.map((s) => (
          <button key={s.key} data-testid={`series-${s.key}`} onClick={() => setActive((a) => ({ ...a, [s.key]: !a[s.key] }))}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${active[s.key] ? "text-white border-transparent shadow-sm" : "text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}
            style={active[s.key] ? { background: s.color } : {}}>{s.name}</button>
        ))}
      </div>
      {data.length < 1 || !hasValues ? <div className="flex-1 grid place-items-center"><EmptyState onReset={onReset} text={data.length < 2 && data.length > 0 ? "Not enough data for this period." : "No revenue data available for this period."} /></div> : (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>{metrics.map((s) => <linearGradient key={s.key} id={`ga-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.3} /><stop offset="95%" stopColor={s.color} stopOpacity={0.02} /></linearGradient>)}</defs>
              {grid}
              <XAxis dataKey="label" tick={xTick} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={xTick} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v)} />
              <Tooltip content={<ChartTooltip />} />
              {metrics.filter((s) => active[s.key]).map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.4} fill={`url(#ga-${s.key})`} dot={data.length < 3} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={!prefersReduced()} animationDuration={700} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function BookingTrend({ series, bucket, statuses, onReset }) {
  const [mode, setMode] = useState("bar");
  const data = useMemo(() => series.map((r) => ({ ...r, label: axisLabel(r.date, bucket) })), [series, bucket]);
  const statusKeys = statuses.map((s) => s.status);
  const empty = data.length === 0 || !data.some((r) => r.bookings > 0);
  return (
    <Card className="p-5 flex flex-col" data-testid="dash-booking-trend">
      <SectionTitle icon={Activity} sub="Booking volume per period from real booking records"
        right={<Seg value={mode} onChange={setMode} testid="trend-mode" options={[{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "status", label: "By Status" }]} />}>Booking Trends</SectionTitle>
      {empty ? <div className="flex-1 grid place-items-center"><EmptyState onReset={onReset} text="No booking data available for this period." /></div> : (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            {mode === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}<XAxis dataKey="label" tick={xTick} tickLine={false} axisLine={false} minTickGap={20} /><YAxis tick={xTick} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip content={<ChartTooltip money={false} />} />
                <Line type="monotone" dataKey="bookings" name="Total" stroke="#0D47A1" strokeWidth={2.4} dot={{ r: 3 }} isAnimationActive={!prefersReduced()} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={!prefersReduced()} />
                <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={!prefersReduced()} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            ) : mode === "status" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}<XAxis dataKey="label" tick={xTick} tickLine={false} axisLine={false} minTickGap={20} /><YAxis tick={xTick} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip content={<ChartTooltip money={false} />} cursor={{ fill: "#f1f5f9", fillOpacity: 0.4 }} />
                {statusKeys.map((s, i) => <Bar key={s} dataKey={`s_${s}`} name={sMeta(s).label} stackId="st" fill={sMeta(s).hex} radius={i === statusKeys.length - 1 ? [5, 5, 0, 0] : 0} maxBarSize={36} isAnimationActive={!prefersReduced()} />)}
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}<XAxis dataKey="label" tick={xTick} tickLine={false} axisLine={false} minTickGap={20} /><YAxis tick={xTick} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip content={<ChartTooltip money={false} />} cursor={{ fill: "#f1f5f9", fillOpacity: 0.4 }} />
                <Bar dataKey="bookings" name="Bookings" fill="#0D47A1" radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={!prefersReduced()} animationDuration={700} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function StatusDonut({ statuses, onReset, onPick }) {
  const data = statuses.map((s) => ({ ...s, name: sMeta(s.status).label, hex: sMeta(s.status).hex }));
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <Card className="p-5" data-testid="dash-status-donut">
      <SectionTitle icon={PieIcon} sub="Distribution of statuses present in this period">Bookings by Status</SectionTitle>
      {data.length === 0 ? <EmptyState onReset={onReset} text="No booking data available for this period." /> : (
        <>
          <div className="h-[190px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none" isAnimationActive={!prefersReduced()} onClick={(e) => onPick?.(e?.status)}>
                  {data.map((s, i) => <Cell key={i} fill={s.hex} className="cursor-pointer" />)}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center"><p className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white" data-testid="donut-total">{total}</p><p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Bookings</p></div>
            </div>
          </div>
          <div className="space-y-1.5 mt-3 max-h-44 overflow-y-auto no-scrollbar">
            {data.map((s) => (
              <button key={s.status} onClick={() => onPick?.(s.status)} data-testid={`donut-${s.status}`} className="w-full flex items-center gap-2 text-xs rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.hex }} />
                <span className="text-slate-600 dark:text-slate-300 capitalize flex-1 truncate text-left">{s.name}</span>
                <span className="font-bold text-slate-800 dark:text-white tabular-nums">{s.count}</span>
                <span className="text-slate-400 w-10 text-right tabular-nums">{total ? Math.round(s.count / total * 100) : 0}%</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
