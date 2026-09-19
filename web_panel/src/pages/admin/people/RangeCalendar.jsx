/* RangeCalendar — premium interactive date-range picker.
   Desktop: anchored popover. Mobile: bottom-sheet. Presets + dual-month grid, range selection,
   month / year navigation, Today, Clear, Cancel, Apply.
   Props: value {from,to} (YYYY-MM-DD strings) · onChange({from,to}) · label · testId */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useIsMobile } from "./ui";

const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
const parse = (s) => { if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const same = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const strip = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const PRESETS = [
  { key: "today", label: "Today", get: () => { const t = strip(new Date()); return [t, t]; } },
  { key: "yesterday", label: "Yesterday", get: () => { const t = strip(new Date()); t.setDate(t.getDate() - 1); return [t, t]; } },
  { key: "7d", label: "Last 7 Days", get: () => { const t = strip(new Date()); const f = new Date(t); f.setDate(f.getDate() - 6); return [f, t]; } },
  { key: "30d", label: "Last 30 Days", get: () => { const t = strip(new Date()); const f = new Date(t); f.setDate(f.getDate() - 29); return [f, t]; } },
  { key: "month", label: "This Month", get: () => { const t = strip(new Date()); return [new Date(t.getFullYear(), t.getMonth(), 1), t]; } },
  { key: "lmonth", label: "Last Month", get: () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)]; } },
  { key: "quarter", label: "This Quarter", get: () => { const t = strip(new Date()); const qm = Math.floor(t.getMonth() / 3) * 3; return [new Date(t.getFullYear(), qm, 1), t]; } },
  { key: "year", label: "This Year", get: () => { const t = strip(new Date()); return [new Date(t.getFullYear(), 0, 1), t]; } },
  { key: "custom", label: "Custom Range", get: null },
];

export const rangeLabel = (v) => {
  if (!v?.from && !v?.to) return "";
  const f = parse(v.from), t = parse(v.to);
  for (const p of PRESETS) { if (p.get) { const [a, b] = p.get(); if (same(a, f) && same(b, t)) return p.label; } }
  const fmt = (d) => d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  return f && t ? (same(f, t) ? fmt(f) : `${fmt(f)} – ${fmt(t)}`) : fmt(f || t);
};

const Month = ({ view, from, to, hover, onPick, onHover, onNav, showNav, onYear }) => {
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1); const startDow = first.getDay(); const days = new Date(y, m + 1, 0).getDate();
  const today = strip(new Date());
  const cells = []; for (let i = 0; i < startDow; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  const hi = to || hover;
  const inRange = (d) => from && hi && d > (from < hi ? from : hi) && d < (from < hi ? hi : from);
  return (
    <div className="w-full sm:w-[272px]">
      <div className="flex items-center justify-between mb-2">
        {showNav.left ? <div className="flex"><button onClick={() => onNav(-12)} className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center" title="Previous year"><ChevronsLeft className="h-4 w-4" /></button><button onClick={() => onNav(-1)} data-testid="cal-prev" className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button></div> : <span className="w-16" />}
        <button onClick={onYear} className="text-sm font-bold text-slate-800 dark:text-white hover:text-primary-600" data-testid="cal-title">{MONTHS[m]} {y}</button>
        {showNav.right ? <div className="flex"><button onClick={() => onNav(1)} data-testid="cal-next" className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button><button onClick={() => onNav(12)} className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center" title="Next year"><ChevronsRight className="h-4 w-4" /></button></div> : <span className="w-16" />}
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 mb-1">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const isF = same(d, from), isT = same(d, to), mid = inRange(d), isToday = same(d, today);
          return (
            <button key={i} onClick={() => onPick(d)} onMouseEnter={() => onHover(d)} data-testid={`cal-day-${toISO(d)}`}
              className={`relative h-9 sm:h-8 text-sm flex items-center justify-center ${mid ? "bg-primary-50 dark:bg-primary-900/30" : ""} ${isF ? "rounded-l-lg" : ""} ${isT ? "rounded-r-lg" : ""}`}>
              <span className={`h-8 w-8 sm:h-7 sm:w-7 rounded-lg flex items-center justify-center font-medium transition ${isF || isT ? "bg-primary-600 text-white shadow" : mid ? "text-primary-800 dark:text-primary-200" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"} ${isToday && !isF && !isT ? "ring-1 ring-primary-400" : ""}`}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default function RangeCalendar({ value, onChange, label = "Date", className = "", testId = "date-range", align = "left" }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(parse(value?.from));
  const [to, setTo] = useState(parse(value?.to));
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => parse(value?.from) || strip(new Date()));
  const [yearMode, setYearMode] = useState(false);
  const [preset, setPreset] = useState(null);
  const ref = useRef(null); const pop = useRef(null);
  const [rect, setRect] = useState(null);

  useEffect(() => { setFrom(parse(value?.from)); setTo(parse(value?.to)); }, [value?.from, value?.to]);
  useEffect(() => {
    if (!open) return;
    const f = (e) => { if (pop.current?.contains(e.target) || ref.current?.contains(e.target)) return; setOpen(false); };
    const k = (e) => e.key === "Escape" && setOpen(false);
    const r = () => ref.current && setRect(ref.current.getBoundingClientRect());
    document.addEventListener("mousedown", f); document.addEventListener("keydown", k); window.addEventListener("resize", r); window.addEventListener("scroll", r, true);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", k); window.removeEventListener("resize", r); window.removeEventListener("scroll", r, true); };
  }, [open]);

  const openIt = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()); setFrom(parse(value?.from)); setTo(parse(value?.to)); setView(parse(value?.from) || strip(new Date())); setPreset(null); setYearMode(false); setOpen(true); };
  const pick = (d) => { setPreset("custom"); if (!from || (from && to)) { setFrom(d); setTo(null); } else { if (d < from) { setTo(from); setFrom(d); } else setTo(d); } };
  const applyPreset = (p) => { setPreset(p.key); if (p.get) { const [a, b] = p.get(); setFrom(a); setTo(b); setView(a); } };
  const apply = () => { onChange?.({ from: toISO(from), to: toISO(to || from) }); setOpen(false); };
  const clear = () => { setFrom(null); setTo(null); setPreset(null); onChange?.({ from: "", to: "" }); setOpen(false); };
  const nav = (n) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1));
  const view2 = useMemo(() => new Date(view.getFullYear(), view.getMonth() + 1, 1), [view]);
  const lbl = rangeLabel(value);
  const years = useMemo(() => { const y = view.getFullYear(); return Array.from({ length: 12 }, (_, i) => y - 6 + i); }, [view]);

  const panel = (
    <div ref={pop} data-testid={`${testId}-panel`} className={`bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-2xl ${mobile ? "rounded-t-3xl w-full max-h-[92vh] flex flex-col" : "rounded-2xl"}`} onClick={(e) => e.stopPropagation()}>
      {mobile && <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />}
      <div className={`flex ${mobile ? "flex-col overflow-y-auto" : "flex-row"}`}>
        <div className={`${mobile ? "px-4 pt-2 flex gap-2 overflow-x-auto no-scrollbar" : "w-40 p-3 border-r border-slate-100 dark:border-slate-800 flex flex-col gap-0.5"}`}>
          {PRESETS.map((p) => <button key={p.key} data-testid={`preset-${p.key}`} onClick={() => applyPreset(p)} className={`${mobile ? "shrink-0 h-8 px-3 rounded-full text-xs" : "text-left h-8 px-2.5 rounded-lg text-sm"} font-medium transition ${preset === p.key || (!preset && lbl === p.label) ? "bg-primary-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{p.label}</button>)}
        </div>
        <div className="p-4">
          {yearMode ? (
            <div className="grid grid-cols-4 gap-2 w-full sm:w-[560px]">{years.map((y) => <button key={y} onClick={() => { setView(new Date(y, view.getMonth(), 1)); setYearMode(false); }} className={`h-10 rounded-lg text-sm font-semibold ${y === view.getFullYear() ? "bg-primary-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{y}</button>)}</div>
          ) : (
            <div className={`flex ${mobile ? "flex-col gap-6" : "flex-row gap-6"}`}>
              <Month view={view} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} onNav={nav} showNav={{ left: true, right: mobile }} onYear={() => setYearMode(true)} />
              {!mobile && <Month view={view2} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} onNav={nav} showNav={{ left: false, right: true }} onYear={() => setYearMode(true)} />}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 font-medium min-w-[100px] text-center" data-testid="cal-start">{from ? from.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Start date"}</span>
            <span>→</span>
            <span className="px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 font-medium min-w-[100px] text-center" data-testid="cal-end">{to ? to.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "End date"}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button onClick={() => { const t = strip(new Date()); setView(t); setFrom(t); setTo(t); setPreset("today"); }} data-testid="cal-today" className="h-9 px-3 rounded-lg text-sm font-semibold text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/30">Today</button>
        <div className="flex items-center gap-2">
          <button onClick={clear} data-testid="cal-clear" className="h-9 px-3 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Clear</button>
          <button onClick={() => setOpen(false)} data-testid="cal-cancel" className="h-9 px-3 rounded-lg text-sm font-semibold ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={apply} disabled={!from} data-testid="cal-apply" className="h-9 px-4 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 shadow-sm">Apply</button>
        </div>
      </div>
    </div>
  );

  let style = {};
  if (!mobile && rect) {
    const w = 760; const left = align === "right" ? Math.max(8, rect.right - w) : Math.min(rect.left, window.innerWidth - w - 8);
    const below = window.innerHeight - rect.bottom > 420;
    style = { position: "fixed", left: Math.max(8, left), ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }), zIndex: 95 };
  }
  return (
    <>
      <button ref={ref} type="button" onClick={openIt} data-testid={testId}
        className={`inline-flex items-center gap-2 h-10 px-3 rounded-xl ring-1 text-sm font-medium bg-white dark:bg-slate-900 transition ${lbl ? "ring-primary-300 text-primary-800 dark:text-primary-200 bg-primary-50/40" : "ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"} ${className}`}>
        <CalIcon className="h-4 w-4 shrink-0" /><span className="truncate max-w-[220px]">{lbl || label}</span>
        {lbl && <span role="button" onClick={(e) => { e.stopPropagation(); clear(); }} className="ml-1 h-5 w-5 rounded-full hover:bg-primary-100 flex items-center justify-center" data-testid={`${testId}-clear-inline`}><X className="h-3 w-3" /></span>}
      </button>
      {open && createPortal(
        mobile ? <div className="fixed inset-0 z-[95] flex items-end bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}><div className="w-full" onMouseDown={(e) => e.stopPropagation()}>{panel}</div></div>
          : <div style={style}>{panel}</div>, document.body)}
    </>
  );
}
