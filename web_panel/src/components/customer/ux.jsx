import React, { useEffect, useMemo, useRef, useState } from "react";
import { StatValue } from "@/components/ExactHover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Search, Calendar as CalIcon, SlidersHorizontal, ChevronLeft, ChevronRight,
  ArrowUpDown, X, Inbox, RefreshCcw, Check,
} from "lucide-react";
import PremiumSelect from "@/components/ui/PremiumSelect";

/* ---------------------------------------------------------------- hooks --- */
export function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.innerWidth < bp : false));
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}

export function useCountUp(target, ms = 650) {
  const [v, setV] = useState(0);
  const raf = useRef();
  useEffect(() => {
    const num = Number(target) || 0;
    const start = performance.now();
    const from = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (num - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}

/* ------------------------------------------------------------- StatTile --- */
const TONES = {
  primary: "from-primary-600 to-primary-800 text-white",
  green: "from-emerald-500 to-emerald-700 text-white",
  amber: "from-amber-500 to-orange-600 text-white",
  rose: "from-rose-500 to-rose-700 text-white",
  slate: "from-slate-600 to-slate-800 text-white",
  violet: "from-violet-500 to-indigo-700 text-white",
};

export function StatTile({ label, value, sub, icon: Icon, tone = "primary", money, count, onClick, testId }) {
  const numeric = count && typeof value === "number";
  const animated = useCountUp(numeric ? value : 0);
  const display = numeric ? Math.round(animated).toLocaleString("en-IN") : value;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`relative overflow-hidden rounded-2xl p-4 lg:p-5 text-left azo-hover-lift azo-elev bg-gradient-to-br ${TONES[tone] || TONES.primary} ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/75">{label}</p>
          <p className="mt-1.5 font-heading font-black text-2xl lg:text-3xl truncate">
            {numeric
              ? (Math.abs(value) >= 1000 ? <StatValue value={value} /> : display)
              : <StatValue value={value} />}
          </p>
          {sub && <p className="mt-0.5 text-[11px] text-white/70 truncate">{sub}</p>}
        </div>
        {Icon && (
          <span className="grid place-items-center h-10 w-10 rounded-xl bg-white/15 backdrop-blur">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </button>
  );
}

/* ----------------------------------------------------------- StatusChip --- */
export function StatusChip({ label, tone = "slate", className = "", testId }) {
  const map = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  };
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${map[tone] || map.slate} ${className}`}>
      {label}
    </span>
  );
}

/* ----------------------------------------------------------- EmptyState --- */
export function EmptyState({ icon: Icon = Inbox, title, desc, actionLabel, onAction, testId }) {
  return (
    <div data-testid={testId} className="azo-fade-up rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-10 lg:p-16 text-center">
      <div className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
        <Icon className="h-7 w-7" strokeWidth={1.6} />
      </div>
      <p className="mt-4 font-heading font-bold text-lg text-slate-900 dark:text-white">{title}</p>
      {desc && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">{desc}</p>}
      {actionLabel && (
        <Button onClick={onAction} className="mt-5 bg-primary-700 hover:bg-primary-800 rounded-xl">{actionLabel}</Button>
      )}
    </div>
  );
}

export function ErrorState({ onRetry, message = "Something went wrong while loading.", testId }) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-900/10 p-10 text-center">
      <p className="font-heading font-bold text-rose-700 dark:text-rose-300">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-4 rounded-xl border-rose-300 text-rose-700">
          <RefreshCcw className="h-4 w-4 mr-1.5" /> Retry
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Skeletons --- */
export const Shimmer = ({ className = "" }) => <div className={`azo-shimmer rounded-lg ${className}`} />;
export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex justify-between">
        <div className="space-y-2 w-1/2"><Shimmer className="h-4 w-3/4" /><Shimmer className="h-3 w-1/2" /></div>
        <Shimmer className="h-6 w-16" />
      </div>
      <Shimmer className="h-3 w-full mt-4" />
      <Shimmer className="h-3 w-2/3 mt-2" />
    </div>
  );
}
export function SkeletonList({ rows = 4 }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <CardSkeleton key={i} />)}</div>;
}
export function StatSkeleton({ n = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      {Array.from({ length: n }).map((_, i) => <Shimmer key={i} className="h-24 rounded-2xl" />)}
    </div>
  );
}

/* --------------------------------------------------------- SearchInput --- */
export function SearchInput({ value, onChange, placeholder = "Search…", debounce = 300, className = "", testId }) {
  const [text, setText] = useState(value || "");
  const timer = useRef();
  useEffect(() => { setText(value || ""); }, [value]);
  const handle = (v) => {
    setText(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), debounce);
  };
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        data-testid={testId}
        value={text}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400"
      />
      {text && (
        <button onClick={() => handle("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Date range ---- */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export const DATE_PRESETS = [
  "Today", "Yesterday", "Last 7 Days", "Last 30 Days",
  "This Month", "Last Month", "This Year", "Custom Range",
];

export function computePreset(name) {
  const now = new Date();
  const t = startOfDay(now);
  switch (name) {
    case "Today": return { from: t, to: endOfDay(now) };
    case "Yesterday": { const y = new Date(t); y.setDate(y.getDate() - 1); return { from: y, to: endOfDay(y) }; }
    case "Last 7 Days": { const f = new Date(t); f.setDate(f.getDate() - 6); return { from: f, to: endOfDay(now) }; }
    case "Last 30 Days": { const f = new Date(t); f.setDate(f.getDate() - 29); return { from: f, to: endOfDay(now) }; }
    case "This Month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "Last Month": return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "This Year": return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    default: return { from: null, to: null };
  }
}

export function inDateRange(dateStr, range) {
  if (!range || range.preset === "All" || (!range.from && !range.to)) return true;
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

function rangeLabel(range) {
  if (!range || range.preset === "All") return "All time";
  if (range.preset && range.preset !== "Custom Range") return range.preset;
  if (range.from && range.to) {
    const f = range.from.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const t = range.to.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    return `${f} – ${t}`;
  }
  return "Custom";
}

export function DateRangePicker({ value, onChange, testId = "date-range" }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({ from: value?.from || undefined, to: value?.to || undefined });
  useEffect(() => { setSel({ from: value?.from || undefined, to: value?.to || undefined }); }, [value, open]);

  const applyPreset = (name) => {
    if (name === "Custom Range") return;
    const r = computePreset(name);
    onChange({ preset: name, from: r.from, to: r.to });
    setOpen(false);
  };
  const applyCustom = () => {
    onChange({ preset: "Custom Range", from: sel.from ? startOfDay(sel.from) : null, to: sel.to ? endOfDay(sel.to) : (sel.from ? endOfDay(sel.from) : null) });
    setOpen(false);
  };
  const clear = () => { onChange({ preset: "All", from: null, to: null }); setOpen(false); };

  const Trigger = (
    <button
      type="button"
      data-testid={`${testId}-trigger`}
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-400 azo-press"
    >
      <CalIcon className="h-4 w-4 text-primary-600" />
      <span className="truncate max-w-[140px]">{rangeLabel(value)}</span>
    </button>
  );

  const Body = (
    <div className="flex flex-col sm:flex-row">
      <div className="flex sm:flex-col gap-1 p-2 sm:border-r border-slate-100 dark:border-slate-800 overflow-x-auto no-scrollbar sm:w-40">
        {DATE_PRESETS.map((p) => (
          <button
            key={p}
            data-testid={`preset-${p.replace(/\s+/g, "-").toLowerCase()}`}
            onClick={() => applyPreset(p)}
            className={`whitespace-nowrap text-left text-sm px-3 py-2 rounded-lg transition-colors ${value?.preset === p ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="p-2">
        <Calendar mode="range" numberOfMonths={1} selected={sel} onSelect={(r) => setSel(r || { from: undefined, to: undefined })} />
        <div className="flex items-center justify-between gap-2 px-2 pb-1">
          <button onClick={clear} className="text-sm text-slate-500 hover:text-rose-600">Clear</button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" className="rounded-lg bg-primary-700 hover:bg-primary-800" onClick={applyCustom} disabled={!sel.from} data-testid={`${testId}-apply`}>Apply</Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {Trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[90vh] overflow-y-auto">
            <SheetHeader className="px-4 pt-4"><SheetTitle>Select date range</SheetTitle></SheetHeader>
            {Body}
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{Trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 azo-scale-in">{Body}</PopoverContent>
    </Popover>
  );
}

/* --------------------------------------------------------- SortMenu ------ */
export function SortMenu({ value, options, onChange, testId = "sort" }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={`${testId}-trigger`} className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-400 azo-press">
          <ArrowUpDown className="h-4 w-4 text-primary-600" />
          <span className="truncate max-w-[120px]">{cur?.label || "Sort"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5 azo-scale-in">
        {options.map((o) => (
          <button key={o.value} data-testid={`${testId}-${o.value}`} onClick={() => { onChange(o.value); setOpen(false); }}
            className={`w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-lg ${value === o.value ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
            {o.label}{value === o.value && <Check className="h-4 w-4" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* --------------------------------------------------------- FilterSheet --- */
export function FilterButton({ activeCount = 0, onClick, testId = "filters-btn" }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-400 azo-press">
      <SlidersHorizontal className="h-4 w-4 text-primary-600" />
      Filters{activeCount > 0 && <span className="ml-0.5 grid place-items-center h-5 min-w-[20px] px-1 rounded-full bg-primary-700 text-white text-[10px] font-bold">{activeCount}</span>}
    </button>
  );
}

export function FilterSheet({ open, onOpenChange, onClear, onApply, children, title = "Filters" }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[88vh] flex flex-col" data-testid="filter-sheet">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800"><SheetTitle>{title}</SheetTitle></SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">{children}</div>
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 sticky bottom-0 bg-white dark:bg-slate-900">
          <Button variant="outline" className="rounded-xl h-11" onClick={onClear} data-testid="filter-clear">Clear All</Button>
          <Button className="rounded-xl h-11 bg-primary-700 hover:bg-primary-800" onClick={onApply} data-testid="filter-apply">Apply Filters</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* --------------------------------------------------------- Paginator ----- */
export function Paginator({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50, 100], testId = "paginator" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const isMobile = useIsMobile();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  if (total === 0) return null;

  if (isMobile) {
    return (
      <div className="flex items-center justify-between mt-4" data-testid={`${testId}-mobile`}>
        <span className="text-xs text-slate-500">{from}–{to} of {total}</span>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 azo-press"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold px-2">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 azo-press"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    );
  }

  const nums = Array.from({ length: pages }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const withGaps = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) withGaps.push("…");
    withGaps.push(n);
  });

  return (
    <div className="flex items-center justify-between mt-5 flex-wrap gap-3" data-testid={testId}>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span>Showing {from}–{to} of {total}</span>
        {onPageSize && (
          <PremiumSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} data-testid={`${testId}-size`} searchable={false}
            className="!w-[110px] !h-9 rounded-lg text-sm">
            {sizes.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </PremiumSelect>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(1)} className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-40 azo-press">First</button>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 azo-press"><ChevronLeft className="h-4 w-4" /></button>
        {withGaps.map((n, i) => n === "…"
          ? <span key={`g${i}`} className="px-2 text-slate-400">…</span>
          : <button key={n} onClick={() => onPage(n)} className={`h-9 min-w-9 px-2 rounded-lg text-sm font-medium azo-press ${n === page ? "bg-primary-700 text-white" : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>{n}</button>)}
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 azo-press"><ChevronRight className="h-4 w-4" /></button>
        <button disabled={page >= pages} onClick={() => onPage(pages)} className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-40 azo-press">Last</button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- SegTabs ------- */
export function SegTabs({ tabs, value, onChange, counts = {}, testId = "tab" }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
      {tabs.map((t) => (
        <button key={t.key} data-testid={`${testId}-${t.key}`} onClick={() => onChange(t.key)}
          className={`whitespace-nowrap text-sm font-semibold px-3.5 h-9 rounded-full azo-press transition-colors ${value === t.key ? "bg-primary-700 text-white shadow-primarybtn" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300"}`}>
          {t.label}{counts[t.key] != null && <span className={`ml-1.5 text-[11px] ${value === t.key ? "text-white/80" : "text-slate-400"}`}>{counts[t.key]}</span>}
        </button>
      ))}
    </div>
  );
}
