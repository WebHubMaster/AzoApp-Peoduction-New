/**
 * AzoApp Partner — shared premium charts (recharts).
 * Dark-mode aware, responsive, real-data driven, hover tooltips.
 */
import React from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { fmt } from "@/lib/api";
import { EmptyState } from "./kit";
import { BarChart3 } from "lucide-react";

const AXIS = { fontSize: 11, fill: "#94a3b8" };
const GRID = "rgba(148,163,184,0.18)";
export const CHART_COLORS = ["#0D47A1", "#1565C0", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

const MoneyTip = ({ active, payload, label, money }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900 text-white px-3 py-2 shadow-xl text-xs border border-white/10">
      <p className="font-semibold text-white/70 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 tabular-nums">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-white/70">{p.name}:</span>
          <span className="font-bold">{money ? fmt(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
};

const Wrap = ({ height = 220, empty, children }) => {
  if (empty) return <EmptyState icon={BarChart3} title="No data yet" desc="Data will appear here once activity is recorded." className="py-10" />;
  return <div style={{ width: "100%", height }}><ResponsiveContainer>{children}</ResponsiveContainer></div>;
};

export const TrendArea = ({ data = [], xKey = "date", yKey = "amount", name = "Earnings", height = 220, money = true, color = CHART_COLORS[0] }) => (
  <Wrap height={height} empty={!data.length}>
    <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
      <defs>
        <linearGradient id={`g-${yKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={20} />
      <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (money ? "\u20b9" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v) : v)} />
      <Tooltip content={<MoneyTip money={money} />} cursor={{ stroke: color, strokeOpacity: 0.25 }} />
      <Area type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2.5} fill={`url(#g-${yKey})`} dot={false} activeDot={{ r: 4 }} />
    </AreaChart>
  </Wrap>
);

export const Bars = ({ data = [], xKey = "date", yKey = "count", name = "Jobs", height = 220, money = false, color = CHART_COLORS[1] }) => (
  <Wrap height={height} empty={!data.length}>
    <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
      <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
      <Tooltip content={<MoneyTip money={money} />} cursor={{ fill: "rgba(148,163,184,0.1)" }} />
      <Bar dataKey={yKey} name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={38} />
    </BarChart>
  </Wrap>
);

export const Donut = ({ data = [], nameKey = "name", valueKey = "value", height = 220, money = true }) => (
  <Wrap height={height} empty={!data.length}>
    <PieChart>
      <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
        {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
      </Pie>
      <Tooltip content={<MoneyTip money={money} />} />
    </PieChart>
  </Wrap>
);

export const CompareLine = ({ data = [], xKey = "date", series = [], height = 220 }) => (
  <Wrap height={height} empty={!data.length}>
    <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
      <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
      <Tooltip content={<MoneyTip money={false} />} />
      {series.map((s, i) => (
        <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      ))}
    </LineChart>
  </Wrap>
);
