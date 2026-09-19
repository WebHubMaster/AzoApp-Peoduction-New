import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./kit";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
const parse = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const same = (a, b) => a && b && a.getTime() === b.getTime();
const addM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
];

export function presetRange(key) {
  const t = today();
  const end = t;
  if (key === "today") return { from: t, to: t };
  if (key === "yesterday") { const y = new Date(t); y.setDate(t.getDate() - 1); return { from: y, to: y }; }
  if (key === "7d") { const s = new Date(t); s.setDate(t.getDate() - 6); return { from: s, to: end }; }
  if (key === "30d") { const s = new Date(t); s.setDate(t.getDate() - 29); return { from: s, to: end }; }
  if (key === "this_month") return { from: startOfMonth(t), to: end };
  if (key === "last_month") { const s = addM(t, -1); const e = new Date(t.getFullYear(), t.getMonth(), 0); return { from: s, to: e }; }
  return { from: null, to: null };
}

function MonthGrid({ month, from, to, hover, onPick, onHover }) {
  const first = startOfMonth(month);
  const startPad = first.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  const inRange = (d) => {
    if (!d) return false;
    const b = to || hover;
    if (from && b) { const lo = Math.min(from.getTime(), b.getTime()); const hi = Math.max(from.getTime(), b.getTime()); return d.getTime() >= lo && d.getTime() <= hi; }
    return false;
  };
  return (
    <div className="w-[248px]">
      <div className="grid grid-cols-7 mb-1">{DOW.map((w) => <span key={w} className="text-[11px] font-semibold text-slate-400 text-center py-1">{w}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const isFrom = same(d, from); const isTo = same(d, to);
          const rng = inRange(d);
          const isToday = same(d, today());
          return (
            <button key={i} type="button" onClick={() => onPick(d)} onMouseEnter={() => onHover(d)}
              className={cn("h-8 text-xs font-medium grid place-items-center relative",
                rng && !isFrom && !isTo && "bg-primary-50 dark:bg-primary-900/30",
                isFrom && "rounded-l-lg", isTo && "rounded-r-lg")}>
              <span className={cn("h-7 w-7 grid place-items-center rounded-lg transition-colors",
                (isFrom || isTo) ? "bg-primary-600 text-white font-bold" : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
                isToday && !isFrom && !isTo && "ring-1 ring-primary-300")}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({ value, onChange, align = "right" }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(parse(value?.from));
  const [to, setTo] = useState(parse(value?.to));
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(startOfMonth(parse(value?.from) || today()));
  const [presetKey, setPresetKey] = useState(value?.preset || "30d");
  const ref = useRef(null);

  useEffect(() => { setFrom(parse(value?.from)); setTo(parse(value?.to)); setPresetKey(value?.preset || ""); }, [value?.from, value?.to, value?.preset]);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const label = useMemo(() => {
    const p = PRESETS.find((x) => x.key === presetKey);
    if (p && (!value?.from || value?.preset)) return p.label;
    if (value?.from && value?.to) {
      const f = parse(value.from), t = parse(value.to);
      const o = { day: "2-digit", month: "short" };
      return `${f.toLocaleDateString("en-IN", o)} – ${t.toLocaleDateString("en-IN", { ...o, year: "numeric" })}`;
    }
    return "Last 30 Days";
  }, [presetKey, value]);

  const pick = (d) => {
    setPresetKey("");
    if (!from || (from && to)) { setFrom(d); setTo(null); setHover(null); }
    else { if (d.getTime() < from.getTime()) { setTo(from); setFrom(d); } else setTo(d); }
  };
  const applyPreset = (key) => {
    const r = presetRange(key); setFrom(r.from); setTo(r.to); setPresetKey(key);
    if (r.from) setView(startOfMonth(r.from));
  };
  const apply = () => {
    if (from && to) { onChange?.({ from: iso(from), to: iso(to), preset: presetKey }); setOpen(false); }
  };
  const clear = () => { setFrom(null); setTo(null); setPresetKey("30d"); const r = presetRange("30d"); onChange?.({ from: iso(r.from), to: iso(r.to), preset: "30d" }); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button type="button" data-testid="date-range-trigger" onClick={() => setOpen((o) => !o)}
        className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800">
        <CalIcon className="h-4 w-4 text-slate-400" /> {label}
        <ChevronRight className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className={cn("absolute z-[9999] mt-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3", align === "right" ? "right-0" : "left-0")} style={{ minWidth: 300 }}>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex sm:flex-col gap-1 flex-wrap sm:w-32 sm:border-r sm:border-slate-100 dark:sm:border-slate-800 sm:pr-2">
              {PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => applyPreset(p.key)}
                  className={cn("text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors", presetKey === p.key ? "bg-primary-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800")}>{p.label}</button>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setView((v) => addM(v, -1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronLeft className="h-4 w-4" /></button>
                <div className="flex-1 flex justify-around text-sm font-bold text-slate-800 dark:text-slate-100">
                  <span>{MON[view.getMonth()]} {view.getFullYear()}</span>
                  <span className="hidden sm:block">{MON[addM(view, 1).getMonth()]} {addM(view, 1).getFullYear()}</span>
                </div>
                <button type="button" onClick={() => setView((v) => addM(v, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="flex gap-4" onMouseLeave={() => setHover(null)}>
                <MonthGrid month={view} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
                <div className="hidden sm:block"><MonthGrid month={addM(view, 1)} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} /></div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500">{from ? iso(from) : "Start"} {"→"} {to ? iso(to) : "End"}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={clear} className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2">Clear</button>
              <button type="button" onClick={() => setOpen(false)} className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 dark:border-slate-700">Cancel</button>
              <button type="button" data-testid="date-range-apply" onClick={apply} disabled={!from || !to} className="h-8 px-4 rounded-lg text-xs font-bold text-white bg-primary-700 hover:bg-primary-800 disabled:opacity-50">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
