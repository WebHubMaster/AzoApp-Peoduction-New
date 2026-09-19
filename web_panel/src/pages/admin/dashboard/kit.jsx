import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { fmt, fmtC, compact } from "@/lib/api";
import ExactHover from "@/components/ExactHover";
import { TrendingUp, TrendingDown, ChevronRight, BarChart3, AlertTriangle, RefreshCw } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import PremiumSelect from "@/components/ui/PremiumSelect";

export const STATUS_META = {
  searching: { label: "Searching", hex: "#0ea5e9" },
  assigned: { label: "Assigned", hex: "#6366f1" },
  arrived_shop: { label: "Arrived Shop", hex: "#8b5cf6" },
  arrived_customer: { label: "At Customer", hex: "#a855f7" },
  started: { label: "In Progress", hex: "#f59e0b" },
  completed: { label: "Completed", hex: "#10b981" },
  paid: { label: "Paid", hex: "#059669" },
  on_hold: { label: "On Hold", hex: "#64748b" },
  cancelled: { label: "Cancelled", hex: "#ef4444" },
  pending: { label: "Pending", hex: "#f97316" },
  pending_payment: { label: "Awaiting Payment", hex: "#fb923c" },
};
export const sMeta = (s) => STATUS_META[s] || { label: String(s || "").replace(/_/g, " "), hex: "#94a3b8" };
export const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const fadeUp = { hidden: { opacity: 0, y: 14 }, show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: prefersReduced() ? 0 : i * 0.04, duration: 0.4, ease: "easeOut" } }) };
export { fmt, fmtC, compact };

export function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const end = Number(target) || 0;
    if (prefersReduced()) { setVal(end); ref.current = end; return; }
    const startV = ref.current; const t0 = performance.now(); let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration); const eased = 1 - Math.pow(1 - p, 3);
      setVal(startV + (end - startV) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else ref.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export const Card = ({ className = "", children, ...p }) => (
  <div {...p} className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] ${className}`}>{children}</div>
);
export const SectionTitle = ({ icon: Icon, children, right, sub }) => (
  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
    <div>
      <h3 className="font-heading font-bold text-[15px] flex items-center gap-2 text-slate-900 dark:text-white">
        {Icon && <span className="h-7 w-7 rounded-lg grid place-items-center bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"><Icon className="h-4 w-4" /></span>}
        {children}
      </h3>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5 ml-9">{sub}</p>}
    </div>
    {right}
  </div>
);
export const Delta = ({ v, invert = false, className = "", suffix = "" }) => {
  if (v === null || v === undefined) return <span className={`text-[11px] text-slate-400 ${className}`}>—</span>;
  const up = v >= 0; const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"} ${className}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(v)}%{suffix}
    </span>
  );
};
export const Spark = ({ data, color = "#0D47A1", dataKey = "value" }) => {
  if (!data || data.length < 2) return <div className="h-9" />;
  const gid = `sp-${color.replace("#", "")}-${dataKey}`;
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.4} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} fill={`url(#${gid})`} dot={false} isAnimationActive={!prefersReduced()} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const TONES = {
  primary: "text-primary-700 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-300",
  green: "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300",
  amber: "text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300",
  violet: "text-violet-700 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300",
  slate: "text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
  rose: "text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300",
  sky: "text-sky-700 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-300",
};
export const KpiCard = ({ i, label, value, currency, icon: Icon, tone = "primary", change, invert, sub, spark, sparkColor, hasBaseline = true, testId }) => {
  const n = useCountUp(typeof value === "number" ? value : 0);
  const display = typeof value === "number" ? (currency ? fmtC(n) : compact(Math.round(n))) : value;
  return (
    <motion.div variants={fadeUp} custom={i} initial="hidden" animate="show">
      <Card data-testid={testId} className="p-4 md:p-5 relative overflow-hidden group hover:shadow-[0_8px_30px_-8px_rgba(13,71,161,0.25)] transition-shadow min-h-[128px] flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 leading-tight">{label}</p>
            <p className="font-heading font-extrabold text-2xl md:text-[26px] mt-1.5 text-slate-900 dark:text-white tabular-nums whitespace-nowrap" data-testid={testId ? `${testId}-value` : undefined}>
              <ExactHover value={typeof value === "number" ? value : null} currency={currency}><span>{display}</span></ExactHover>
            </p>
          </div>
          <span className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${TONES[tone] || TONES.primary}`}><Icon className="h-5 w-5" /></span>
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {change !== undefined && hasBaseline && <Delta v={change} invert={invert} />}
          <span className="text-[11px] text-slate-400">{sub || (hasBaseline ? "vs previous period" : "all time")}</span>
        </div>
        {spark && <div className="mt-auto pt-1 -mx-1"><Spark data={spark} color={sparkColor || "#0D47A1"} /></div>}
      </Card>
    </motion.div>
  );
};

export const Sk = ({ className = "" }) => <div className={`animate-pulse bg-slate-200/70 dark:bg-slate-800 rounded-lg ${className}`} />;
export const DashSkeleton = () => (
  <div className="space-y-5" data-testid="dash-skeleton">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Card key={i} className="p-4"><Sk className="h-3 w-16 mb-3" /><Sk className="h-6 w-20 mb-3" /><Sk className="h-9 w-full" /></Card>)}</div>
    <div className="grid lg:grid-cols-3 gap-4"><Card className="lg:col-span-2 p-5"><Sk className="h-4 w-40 mb-4" /><Sk className="h-64 w-full" /></Card><Card className="p-5"><Sk className="h-4 w-32 mb-4" /><Sk className="h-64 w-full" /></Card></div>
    <Card className="p-5"><Sk className="h-4 w-40 mb-4" /><Sk className="h-72 w-full" /></Card>
  </div>
);
export const EmptyState = ({ onReset, text = "No data available for this period.", compact: small = false, testId }) => (
  <div data-testid={testId} className={`grid place-items-center text-center ${small ? "py-6" : "py-14"}`}>
    <div className={`${small ? "h-10 w-10 mb-2" : "h-14 w-14 mb-3"} rounded-2xl bg-slate-100 dark:bg-slate-800 grid place-items-center`}><BarChart3 className={`${small ? "h-5 w-5" : "h-7 w-7"} text-slate-400`} /></div>
    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{text}</p>
    {onReset && <button onClick={onReset} className="mt-3 text-xs font-bold px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Reset Filters</button>}
  </div>
);
export const ErrorState = ({ onRetry, text = "Unable to load this data." }) => (
  <div className="grid place-items-center py-14 text-center" data-testid="dash-error">
    <div className="h-14 w-14 rounded-2xl bg-red-50 dark:bg-red-900/20 grid place-items-center mb-3"><AlertTriangle className="h-7 w-7 text-red-500" /></div>
    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{text}</p>
    {onRetry && <button onClick={onRetry} data-testid="dash-retry" className="mt-3 text-xs font-bold px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Retry</button>}
  </div>
);

export const ChartTooltip = ({ active, payload, label, money = true }) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-xl px-3.5 py-2.5 min-w-[160px]">
      <p className="text-[11px] font-bold text-slate-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs mb-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
          <span className="text-slate-500 dark:text-slate-400 capitalize">{p.name}</span>
          <span className="ml-auto font-bold text-slate-800 dark:text-white">{money ? fmt(p.value) : p.value}{!money && total && payload.length > 1 ? <span className="text-slate-400 font-medium ml-1">({Math.round(p.value / total * 100)}%)</span> : null}</span>
        </div>
      ))}
    </div>
  );
};
export const DonutTooltip = ({ active, payload, total }) => (active && payload?.length ? (
  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-1.5 text-xs">
    <span className="font-semibold text-slate-700 dark:text-white capitalize">{payload[0].name}</span>: <b>{payload[0].value}</b>{total ? <span className="text-slate-400"> · {Math.round(payload[0].value / total * 100)}%</span> : null}
  </div>) : null);

export const Sel = ({ value, onChange, children, testid, placeholder, className = "" }) => (
  <PremiumSelect data-testid={testid} value={value} onChange={onChange} placeholder={placeholder ?? "Select..."} className={`max-w-[190px] rounded-xl ${className}`}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {children}
  </PremiumSelect>
);

export const Seg = ({ value, onChange, options, testid, size = "sm" }) => (
  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800" data-testid={testid}>
    {options.map((o) => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)} data-testid={testid ? `${testid}-${o.value}` : undefined}
        className={`${size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs"} rounded-md font-semibold transition-all ${value === o.value ? "bg-white dark:bg-slate-900 text-primary-700 dark:text-primary-300 shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}>
        {o.label}
      </button>
    ))}
  </div>
);

export const Mini = ({ label, value, money, hint, tone = "slate", testId }) => (
  <div data-testid={testId} className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 truncate">{label}</p>
    <p className={`font-heading font-extrabold text-lg mt-0.5 tabular-nums ${TONES[tone]?.split(" ")[0] || "text-slate-900"} dark:text-white`}>{money ? fmtC(value) : compact(value ?? 0)}</p>
    {hint && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{hint}</p>}
  </div>
);

export const Bar = ({ pct, color = "bg-primary-600" }) => (
  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${Math.min(100, Math.max(pct > 0 ? 4 : 0, pct))}%` }} /></div>
);

export const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };
export const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
export const axisLabel = (date, bucket) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  if (bucket === "year") return String(d.getFullYear());
  if (bucket === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
