import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  TrendingUp, CalendarDays, Filter, IndianRupee, Users, Network, Loader2, PieChart as PieIcon, X,
} from "lucide-react";
import api, { fmt, fmtC } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RangeCalendar } from "@/pages/merchant/referral/ReferralShared";

const iso = (d) => d.toISOString().slice(0, 10);
const PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 Days", days: 6 },
  { key: "30d", label: "30 Days", days: 29 },
  { key: "90d", label: "90 Days", days: 89 },
  { key: "month", label: "This Month", month: true },
  { key: "custom", label: "Custom", custom: true },
];
const rangeFor = (p) => {
  const today = new Date();
  if (p.month) return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  const from = new Date(today); from.setDate(from.getDate() - (p.days || 0));
  return { from: iso(from), to: iso(today) };
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900/95 text-white px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <b>{fmt(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

const PIE_COLORS = ["#0ea5e9", "#8b5cf6"];

export default function MerchantAnalytics({ title = "Business Analytics" }) {
  const [preset, setPreset] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (preset === "custom" && custom.from && custom.to) return { from: custom.from, to: custom.to };
    return rangeFor(PRESETS.find((p) => p.key === preset) || PRESETS[2]);
  }, [preset, custom]);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/merchant/analytics?date_from=${range.from}&date_to=${range.to}`)
      .then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  const k = data?.kpis || {};
  const series = (data?.series || []).map((s) => ({ ...s, d: (s.date || "").slice(5) }));
  const breakdown = (data?.breakdown || []).filter((b) => b.value > 0);

  const kpiCards = [
    { key: "earning", label: "Total Commission", value: k.earning, money: true, grad: "from-emerald-500 to-emerald-700", icon: IndianRupee },
    { key: "customer_commission", label: "Customer Commission", value: k.customer_commission, money: true, grad: "from-sky-500 to-sky-700", icon: Users },
    { key: "partner_commission", label: "Partner Commission", value: k.partner_commission, money: true, grad: "from-violet-500 to-violet-700", icon: Network },
    { key: "avg_per_day", label: "Avg / Day", value: k.avg_per_day, money: true, grad: "from-primary-600 to-primary-800", icon: TrendingUp },
  ];

  return (
    <div className="space-y-5" data-testid="merchant-analytics">
      {/* header + presets */}
      <div className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-lg"
        style={{ background: "linear-gradient(120deg,#0D47A1 0%,#1565C0 55%,#7c3aed 130%)" }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 15% 20%, #fff 0, transparent 40%), radial-gradient(circle at 85% 80%, #fff 0, transparent 35%)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-extrabold text-xl sm:text-2xl flex items-center gap-2"><TrendingUp className="h-6 w-6" /> {title}</h2>
            <p className="text-sky-100/85 text-sm mt-0.5 flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {range.from} → {range.to} · {k.customers || 0} customers · {k.partners || 0} partners</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.key} data-testid={`range-${p.key}`}
                onClick={() => { setPreset(p.key); setShowCustom(!!p.custom); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${preset === p.key ? "bg-white text-primary-700 shadow" : "bg-white/15 text-white hover:bg-white/25"}`}>
                {p.custom ? <span className="flex items-center gap-1"><Filter className="h-3 w-3" />{p.label}</span> : p.label}
              </button>
            ))}
          </div>
        </div>
        {showCustom && (
          <div className="relative mt-3 bg-white/10 rounded-2xl p-3" data-testid="custom-range">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-sky-100/80">Custom range</p>
              <p className="text-[11px] font-semibold text-white tabular-nums">{custom.from || "start"} → {custom.to || "end"}</p>
            </div>
            <div className="rounded-xl bg-white p-2 text-slate-800">
              <RangeCalendar from={custom.from} to={custom.to}
                onPick={(f, t) => setCustom({ from: f, to: t })} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button data-testid="custom-apply" onClick={load} disabled={!custom.from || !custom.to}
                className="flex-1 h-9 bg-white text-primary-700 hover:bg-sky-50">Apply</Button>
              <button onClick={() => { setShowCustom(false); setPreset("30d"); }} className="h-9 w-9 grid place-items-center rounded-lg bg-white/15 hover:bg-white/25"><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((c) => (
          <div key={c.key} data-testid={`kpi-${c.key}`} className={`relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-br ${c.grad} shadow-md`}>
            <div className="absolute -right-3 -top-3 opacity-20"><c.icon className="h-16 w-16" /></div>
            <div className="relative">
              <p className="text-[11px] uppercase tracking-wider font-bold opacity-85">{c.label}</p>
              <p className="font-heading font-extrabold text-2xl mt-1 truncate" title={fmt(c.value)}>{fmtC(c.value || 0)}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div>
      ) : (
        <>
          {/* earnings trend */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5" data-testid="chart-earnings">
            <h3 className="font-heading font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><IndianRupee className="h-4 w-4 text-emerald-600" /> Commission Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ left: -12, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="gEarnM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={20} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="earning" name="Commission" stroke="#10b981" strokeWidth={2.5} fill="url(#gEarnM)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* customer vs partner per day */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5" data-testid="chart-split">
              <h3 className="font-heading font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary-700" /> Customer vs Partner Commission</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={series} margin={{ left: -12, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={20} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="customer" name="Customer" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="partner" name="Partner" stackId="a" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* breakdown donut */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5" data-testid="chart-breakdown">
              <h3 className="font-heading font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><PieIcon className="h-4 w-4 text-primary-700" /> Commission Split</h3>
              {breakdown.length === 0 ? (
                <div className="h-[200px] grid place-items-center text-slate-400 text-sm">No commission in range</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                        {breakdown.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {breakdown.map((e, i) => (
                      <div key={e.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{e.name}</span>
                        <b className="text-emerald-600">{fmt(e.value)}</b>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
