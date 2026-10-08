import { useEffect, useState, useCallback, useRef } from "react";
import { AlertTriangle, RotateCw, ChevronDown, Inbox } from "lucide-react";
import api from "@/lib/api";

export const C = {
  blue: "#0D47A1", navy: "#0B1F44", green: "#059669", red: "#DC2626", orange: "#EA580C",
  purple: "#7C3AED", amber: "#D97706", slate: "#64748B", light: "#E8F0FE",
};

export const inr = (n, dp = 2) => (n == null ? "—" : `${n < 0 ? "−" : ""}₹${Math.abs(Number(n)).toLocaleString("en-IN", { maximumFractionDigits: dp })}`);
export const inrC = (n) => {
  if (n == null) return "—";
  const a = Math.abs(Number(n)); const s = n < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, "")}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, "")}L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `${s}₹${a.toFixed(0)}`;
};
export const pct = (n, dp = 1) => (n == null ? "—" : `${Number(n).toFixed(dp)}%`);
export const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
export const dtt = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const growth = (cur, prev) => (prev == null || !prev ? null : ((cur - prev) / Math.abs(prev)) * 100);

/** Independent section loader: own request, cancellation on param change, per-section error. */
export function useSection(path, params, enabled = true) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params);
  const first = useRef(true);
  useEffect(() => {
    if (!enabled) return undefined;
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    const p = JSON.parse(key);
    if (tick > 0 && !first.current) p.nocache = "1";
    first.current = false;
    api.get(path, { params: p, signal: ctl.signal })
      .then((r) => setState({ data: r.data, loading: false, error: null }))
      .catch((e) => { if (e?.code !== "ERR_CANCELED") setState({ data: null, loading: false, error: e?.response?.data?.detail || "Unable to load data" }); });
    return () => ctl.abort();
  }, [path, key, tick, enabled]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export const Card = ({ children, className = "", ...rest }) => (
  <div className={`rounded-[14px] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`} {...rest}>{children}</div>
);

export const Skel = ({ h = "h-4", w = "w-full", className = "" }) => <div className={`${h} ${w} rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse ${className}`} />;

export function SectionError({ onRetry, testid }) {
  return (
    <div data-testid={testid} className="flex flex-col items-center justify-center text-center py-10 gap-2">
      <AlertTriangle className="h-6 w-6 text-red-400" />
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Unable to load data</p>
      <button onClick={onRetry} data-testid={testid ? `${testid}-retry` : undefined} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0D47A1] hover:underline"><RotateCw className="h-3.5 w-3.5" /> Retry</button>
    </div>
  );
}

export const Empty = ({ text = "No financial activity for this period", sub }) => (
  <div className="flex flex-col items-center justify-center text-center py-10 gap-1.5">
    <Inbox className="h-6 w-6 text-slate-300" />
    <p className="text-sm font-medium text-slate-500">{text}</p>
    {sub && <p className="text-[12px] text-slate-400 max-w-sm">{sub}</p>}
  </div>
);

/** Section shell — header, mobile collapse, loading/error/empty states. */
export function Section({ title, subtitle, icon: Icon, tone = C.blue, actions, state, skeleton, isEmpty, emptyText, children, testid, className = "" }) {
  const [open, setOpen] = useState(true);
  const loading = state?.loading && !state?.data;
  return (
    <Card data-testid={testid} className={`p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-start gap-3 text-left min-w-0 md:cursor-default" data-testid={testid ? `${testid}-toggle` : undefined}>
          {Icon && <span className="h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: `${tone}12`, color: tone }}><Icon className="h-[18px] w-[18px]" /></span>}
          <span className="min-w-0">
            <span className="block font-heading font-bold text-[15px] text-slate-900 dark:text-white leading-tight">{title}</span>
            {subtitle && <span className="block text-[12px] text-slate-500 mt-0.5">{subtitle}</span>}
          </span>
          <ChevronDown className={`md:hidden h-4 w-4 mt-1 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
      <div className={`${open ? "" : "hidden md:block"} ${state?.loading && state?.data ? "opacity-60 transition-opacity" : ""}`}>
        {state?.error ? <SectionError onRetry={state.reload} testid={testid ? `${testid}-error` : undefined} />
          : loading ? (skeleton || <div className="space-y-3"><Skel h="h-5" w="w-1/2" /><Skel h="h-24" /><Skel h="h-5" w="w-2/3" /></div>)
            : isEmpty ? <Empty text={emptyText} /> : children}
      </div>
    </Card>
  );
}

export const Delta = ({ value, invert = false, testid }) => {
  if (value == null || !isFinite(value)) return null;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span data-testid={testid} className={`inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-md ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
      {value >= 0 ? "+" : "−"}{Math.abs(value).toFixed(1)}%
    </span>
  );
};

export const Bar = ({ value, color = C.blue, h = "h-1.5" }) => (
  <div className={`w-full ${h} rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden`}>
    <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, background: color }} />
  </div>
);

export const Seg = ({ options, value, onChange, testid }) => (
  <div className="inline-flex p-0.5 rounded-[10px] bg-slate-100 dark:bg-slate-800" data-testid={testid}>
    {options.map(([k, l]) => (
      <button key={k} type="button" data-testid={testid ? `${testid}-${k}` : undefined} onClick={() => onChange(k)}
        className={`px-2.5 py-1 text-[12px] font-semibold rounded-[8px] transition-colors ${value === k ? "bg-white dark:bg-slate-900 text-[#0D47A1] shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{l}</button>
    ))}
  </div>
);
