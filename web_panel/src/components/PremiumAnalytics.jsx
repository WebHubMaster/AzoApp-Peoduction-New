import { useCallback, useEffect, useMemo, useState } from "react";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  TrendingUp, CalendarDays, Filter, IndianRupee, CheckCircle2, Users, Briefcase,
  Loader2, Activity, PieChart as PieIcon, X,
} from "lucide-react";
import api, { fmt, fmtC } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const PIE_COLORS = ["#1565C0", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b", "#0ea5e9"];

function ChartTooltip({ active, payload, label, money }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900/95 text-white px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <b>{money && p.dataKey === "earning" ? fmt(p.value) : p.value}</b>
        </p>
      ))}
    </div>
  );
}

const KPI_MAP = {
  merchant: [
    { key: "earning", label: "Earnings", icon: IndianRupee, money: true, grad: "from-primary-600 to-primary-800" },
    { key: "bookings", label: "Bookings", icon: Briefcase, grad: "from-sky-500 to-sky-700" },
    { key: "completed", label: "Completed", icon: CheckCircle2, grad: "from-emerald-500 to-emerald-700" },
    { key: "customers", label: "Customers", icon: Users, grad: "from-amber-500 to-amber-600" },
  ],
  partner: [
    { key: "earning", label: "Earnings", icon: IndianRupee, money: true, grad: "from-primary-600 to-primary-800" },
    { key: "jobs", label: "Jobs", icon: Briefcase, grad: "from-sky-500 to-sky-700" },
    { key: "completed", label: "Completed", icon: CheckCircle2, grad: "from-emerald-500 to-emerald-700" },
    { key: "completion_rate", label: "Completion", icon: Activity, pct: true, grad: "from-fuchsia-500 to-fuchsia-700" },
  ],
};

export default function PremiumAnalytics({ role = "merchant", title = "Analytics" }) {
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
    api.get(`/${role}/analytics?date_from=${range.from}&date_to=${range.to}`)
      .then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [role, range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  const kpis = KPI_MAP[role] || KPI_MAP.merchant;
  const series = data?.series || [];
  const money = true;

  return (
    <div className="space-y-5" data-testid={`premium-analytics-${role}`}>
      {/* premium header + filter bar */}
      <div className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-lg"
        style={{ background: "linear-gradient(120deg,#0D47A1 0%,#1565C0 55%,#7c3aed 130%)" }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 15% 20%, #fff 0, transparent 40%), radial-gradient(circle at 85% 80%, #fff 0, transparent 35%)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-extrabold text-xl sm:text-2xl flex items-center gap-2"><TrendingUp className="h-6 w-6" /> {title}</h2>
            <p className="text-sky-100/85 text-sm mt-0.5 flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {range.from} → {range.to}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.key} data-testid={`range-${p.key}`}
                onClick={() => { setPreset(p.key); setShowCustom(p.custom); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${preset === p.key ? "bg-white text-primary-700 shadow" : "bg-white/15 text-white hover:bg-white/25"}`}>
                {p.custom ? <span className="flex items-center gap-1"><Filter className="h-3 w-3" />{p.label}</span> : p.label}
              </button>
            ))}
          </div>
        </div>
        {showCustom && (
          <div className="relative mt-3 flex flex-wrap items-end gap-3 bg-white/10 rounded-2xl p-3" data-testid="custom-range">
            <div><label className="text-[11px] text-sky-100/80 block mb-1">From</label>
              <PremiumDatePicker data-testid="custom-from" value={custom.from} max={custom.to || iso(new Date())}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="!h-9 !w-40" /></div>
            <div><label className="text-[11px] text-sky-100/80 block mb-1">To</label>
              <PremiumDatePicker data-testid="custom-to" value={custom.to} max={iso(new Date())}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="!h-9 !w-40" /></div>
            <Button data-testid="custom-apply" onClick={load} disabled={!custom.from || !custom.to}
              className="h-9 bg-white text-primary-700 hover:bg-sky-50">Apply</Button>
            <button onClick={() => { setShowCustom(false); setPreset("30d"); }} className="h-9 w-9 grid place-items-center rounded-lg bg-white/15 hover:bg-white/25"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => {
          const v = data?.kpis?.[k.key] ?? 0;
          return (
            <div key={k.key} data-testid={`kpi-${k.key}`} className={`relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-br ${k.grad} shadow-md`}>
              <div className="absolute -right-3 -top-3 opacity-20"><k.icon className="h-16 w-16" /></div>
              <div className="relative">
                <p className="text-[11px] uppercase tracking-wider font-bold opacity-85">{k.label}</p>
                <p className="font-heading font-extrabold text-2xl mt-1 truncate" title={k.money ? fmt(v) : undefined}>{k.money ? fmtC(v) : k.pct ? `${v}%` : v}</p>
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 bg-white rounded-2xl border border-slate-200"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div>
      ) : (
        <>
          {/* earnings area chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5" data-testid="chart-earnings">
            <h3 className="font-heading font-bold text-slate-800 mb-3 flex items-center gap-2"><IndianRupee className="h-4 w-4 text-primary-700" /> Earnings Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ left: -12, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="gEarn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1565C0" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#1565C0" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(d) => d.slice(5)} minTickGap={20} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<ChartTooltip money={money} />} />
                <Area type="monotone" dataKey="earning" name="Earnings" stroke="#1565C0" strokeWidth={2.5} fill="url(#gEarn)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* jobs/bookings bar chart */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5" data-testid="chart-jobs">
              <h3 className="font-heading font-bold text-slate-800 mb-3 flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary-700" /> {role === "partner" ? "Jobs" : "Bookings"} per Day</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={series} margin={{ left: -12, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(d) => d.slice(5)} minTickGap={20} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="jobs" name={role === "partner" ? "Jobs" : "Bookings"} fill="#7c3aed" radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* status donut */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5" data-testid="chart-status">
              <h3 className="font-heading font-bold text-slate-800 mb-3 flex items-center gap-2"><PieIcon className="h-4 w-4 text-primary-700" /> Status Split</h3>
              {(data?.status_breakdown || []).length === 0 ? (
                <div className="h-[200px] grid place-items-center text-slate-400 text-sm">No data in range</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={data.status_breakdown} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                        {data.status_breakdown.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {data.status_breakdown.map((e, i) => (
                      <div key={e.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 capitalize text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{e.name}</span>
                        <b className="text-slate-800">{e.value}</b>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ratings & reviews (partner) */}
          {data?.ratings && (
            <div className="grid lg:grid-cols-3 gap-4" data-testid="chart-ratings">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col items-center justify-center">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Average Rating</p>
                <p className="font-heading font-extrabold text-5xl text-amber-500 mt-1">{data.ratings.avg || 0}</p>
                <div className="flex gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className={s <= Math.round(data.ratings.avg || 0) ? "text-amber-400" : "text-slate-200"}>★</span>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">{data.ratings.count || 0} reviews</p>
              </div>
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
                <h3 className="font-heading font-bold text-slate-800 mb-3">Rating Breakdown</h3>
                <div className="space-y-2">
                  {(data.ratings.distribution || []).map((d2) => {
                    const total = data.ratings.count || 1;
                    return (
                      <div key={d2.star} className="flex items-center gap-2 text-sm">
                        <span className="w-8 text-slate-500">{d2.star}★</span>
                        <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(d2.count / total) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-slate-500">{d2.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {(data.ratings.recent || []).length > 0 && (
                <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <h3 className="font-heading font-bold text-slate-800 mb-3">Recent Reviews</h3>
                  <div className="space-y-2">
                    {data.ratings.recent.map((rv, i) => (
                      <div key={i} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-amber-500 text-sm">{"★".repeat(rv.rating)}<span className="text-slate-200">{"★".repeat(5 - rv.rating)}</span></span>
                          <span className="text-xs text-slate-400">{rv.date} · {rv.service}</span>
                        </div>
                        {rv.comment && <p className="text-sm text-slate-600 mt-1">{rv.comment}</p>}
                        <p className="text-xs text-slate-400 mt-0.5">— {rv.customer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
