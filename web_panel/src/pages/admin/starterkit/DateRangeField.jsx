import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useIsMobile } from "../people/ui";

const pad = (n) => String(n).padStart(2, "0");
export const toYMD = (d) => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
const parse = (s) => { if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const same = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const strip = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const fmt = (d) => d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

function MonthGrid({ view, from, to, hover, onPick, onHover }) {
  const y = view.getFullYear(), m = view.getMonth();
  const startDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = strip(new Date());
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  const hi = to || hover;
  const lo = from && hi ? (from < hi ? from : hi) : null, up = from && hi ? (from < hi ? hi : from) : null;
  const inRange = (d) => lo && up && d > lo && d < up;
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const disabled = d > today;
          const isF = same(d, from) || (same(d, lo) && !!hi), isT = same(d, up) && !!hi && !same(lo, up);
          const edge = isF || isT;
          const mid = inRange(d);
          const isToday = same(d, today);
          return (
            <button key={i} type="button" disabled={disabled} onClick={() => onPick(d)} onMouseEnter={() => !disabled && onHover(d)} onMouseLeave={() => onHover(null)}
              data-testid={`cal-day-${toYMD(d)}`}
              className={`relative h-10 sm:h-9 flex items-center justify-center text-sm ${mid ? "bg-primary-50" : ""} ${isF && hi && !same(lo, up) ? "rounded-l-full bg-gradient-to-r from-transparent to-primary-50" : ""} ${isT ? "rounded-r-full bg-gradient-to-l from-transparent to-primary-50" : ""} disabled:cursor-not-allowed`}>
              <span className={`h-9 w-9 sm:h-8 sm:w-8 rounded-full flex items-center justify-center font-medium transition-all duration-150
                ${edge ? "bg-primary-700 text-white shadow-md shadow-primary-700/30 scale-105" : mid ? "text-primary-800" : disabled ? "text-slate-300" : "text-slate-700 hover:bg-slate-100 hover:scale-105"}
                ${isToday && !edge ? "ring-2 ring-primary-300 ring-offset-1" : ""}`}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FieldBox({ label, value, active, onClick, testId }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`flex-1 min-w-[140px] h-11 px-3 rounded-xl border bg-white text-left flex items-center gap-2.5 transition-all duration-150 ${active ? "border-primary-500 ring-2 ring-primary-100 shadow-sm" : value ? "border-primary-200 hover:border-primary-400" : "border-slate-200 hover:border-slate-300"}`}>
      <CalIcon className={`h-4 w-4 shrink-0 ${value ? "text-primary-600" : "text-slate-400"}`} />
      <span className="flex flex-col leading-none min-w-0">
        <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400">{label}</span>
        <span className={`text-sm mt-0.5 truncate ${value ? "font-semibold text-slate-800" : "text-slate-400"}`}>{value || "Select date"}</span>
      </span>
    </button>
  );
}

export default function DateRangeField({ from, to, onChange, testId = "sk-date" }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState("from");
  const [f, setF] = useState(parse(from));
  const [t, setT] = useState(parse(to));
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => parse(from) || strip(new Date()));
  const wrap = useRef(null), pop = useRef(null);
  const [rect, setRect] = useState(null);

  useEffect(() => { setF(parse(from)); setT(parse(to)); }, [from, to]);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (pop.current?.contains(e.target) || wrap.current?.contains(e.target)) return; setOpen(false); };
    const key = (e) => e.key === "Escape" && setOpen(false);
    const re = () => wrap.current && setRect(wrap.current.getBoundingClientRect());
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    window.addEventListener("resize", re); window.addEventListener("scroll", re, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("resize", re); window.removeEventListener("scroll", re, true); };
  }, [open]);

  const openAt = (which) => {
    if (wrap.current) setRect(wrap.current.getBoundingClientRect());
    setF(parse(from)); setT(parse(to)); setFocus(which);
    const anchor = which === "to" ? (parse(to) || parse(from)) : parse(from);
    setView(anchor || strip(new Date()));
    setOpen(true);
  };
  const pick = (d) => {
    if (focus === "from") {
      setF(d);
      if (t && d > t) setT(null);
      setFocus("to");
    } else {
      if (f && d < f) { setT(f); setF(d); } else { setT(d); if (!f) { setF(d); } }
      setFocus("from");
    }
  };
  const apply = () => { onChange({ from: toYMD(f), to: toYMD(t || f) }); setOpen(false); };
  const clear = () => { setF(null); setT(null); onChange({ from: "", to: "" }); setOpen(false); };
  const nav = (n) => setView((v) => new Date(v.getFullYear(), v.getMonth() + n, 1));
  const nextDisabled = useMemo(() => { const n = new Date(); return view.getFullYear() === n.getFullYear() && view.getMonth() === n.getMonth(); }, [view]);

  const panel = (
    <motion.div ref={pop} data-testid={`${testId}-panel`} onClick={(e) => e.stopPropagation()}
      initial={mobile ? { y: 40, opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
      animate={mobile ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={mobile ? { y: 40, opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={`bg-white ring-1 ring-slate-200 shadow-2xl shadow-slate-900/15 ${mobile ? "rounded-t-3xl w-full max-h-[92vh] overflow-y-auto" : "rounded-2xl w-[336px]"}`}>
      {mobile && <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-200" />}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <button type="button" onClick={() => setFocus("from")} data-testid="cal-focus-from"
            className={`flex-1 rounded-xl px-3 py-2 text-left ring-1 transition-colors ${focus === "from" ? "bg-primary-50 ring-primary-300" : "ring-slate-200 hover:bg-slate-50"}`}>
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400">From</p>
            <p className={`text-sm font-semibold ${f ? "text-slate-800" : "text-slate-400"}`} data-testid="cal-start">{f ? fmt(f) : "Start date"}</p>
          </button>
          <span className="text-slate-300">→</span>
          <button type="button" onClick={() => setFocus("to")} data-testid="cal-focus-to"
            className={`flex-1 rounded-xl px-3 py-2 text-left ring-1 transition-colors ${focus === "to" ? "bg-primary-50 ring-primary-300" : "ring-slate-200 hover:bg-slate-50"}`}>
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400">To</p>
            <p className={`text-sm font-semibold ${t ? "text-slate-800" : "text-slate-400"}`} data-testid="cal-end">{t ? fmt(t) : "End date"}</p>
          </button>
        </div>
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => nav(-1)} data-testid="cal-prev" aria-label="Previous month"
            className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors"><ChevronLeft className="h-4 w-4" /></button>
          <p className="text-sm font-bold text-slate-800" data-testid="cal-title">{MONTHS[view.getMonth()]} {view.getFullYear()}</p>
          <button type="button" onClick={() => nav(1)} disabled={nextDisabled} data-testid="cal-next" aria-label="Next month"
            className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${view.getFullYear()}-${view.getMonth()}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12 }}>
            <MonthGrid view={view} from={f} to={t} hover={focus === "to" || (f && !t) ? hover : null} onPick={pick} onHover={setHover} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3 mt-3 border-t border-slate-100 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => { const td = strip(new Date()); setView(td); setF(td); setT(td); setFocus("from"); }} data-testid="cal-today"
          className="h-9 px-3 rounded-lg text-sm font-semibold text-primary-700 hover:bg-primary-50 transition-colors">Today</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={clear} data-testid="cal-clear" className="h-9 px-3 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">Clear</button>
          <button type="button" onClick={apply} disabled={!f} data-testid="cal-apply"
            className="h-9 px-4 rounded-lg text-sm font-bold bg-primary-700 text-white hover:bg-primary-800 disabled:opacity-40 shadow-sm transition-colors">Apply</button>
        </div>
      </div>
    </motion.div>
  );

  let style = {};
  if (!mobile && rect) {
    const w = 336;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
    const below = window.innerHeight - rect.bottom > 460;
    style = { position: "fixed", left, ...(below ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }), zIndex: 95 };
  }

  return (
    <>
      <div ref={wrap} className="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap" data-testid={testId}>
        <FieldBox label="From" value={fmt(parse(from))} active={open && focus === "from"} onClick={() => openAt("from")} testId={`${testId}-from`} />
        <FieldBox label="To" value={fmt(parse(to))} active={open && focus === "to"} onClick={() => openAt("to")} testId={`${testId}-to`} />
        {(from || to) && (
          <button type="button" onClick={clear} data-testid={`${testId}-clear`} aria-label="Clear date range"
            className="h-9 w-9 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors shrink-0"><X className="h-4 w-4" /></button>
        )}
      </div>
      {createPortal(
        <AnimatePresence>
          {open && (mobile
            ? <motion.div key="sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[95] flex items-end bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
                <div className="w-full" onMouseDown={(e) => e.stopPropagation()}>{panel}</div>
              </motion.div>
            : <div key="pop" style={style}>{panel}</div>)}
        </AnimatePresence>, document.body)}
    </>
  );
}
