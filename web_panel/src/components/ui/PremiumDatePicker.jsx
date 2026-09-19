import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalIcon, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Monday-first weekday labels (matches reference design)
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Monday-first leading blanks
const leadBlanks = (jsDay) => (jsDay + 6) % 7;

/**
 * PremiumDatePicker — global custom calendar. Drop-in for <input type="date">.
 * value is "YYYY-MM-DD"; onChange fires with { target: { value } }.
 * Supports min/max, disabled states, today + selected highlight, month/year nav.
 * Monday-first weekdays and circular selected day (reference design).
 */
export default function PremiumDatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Select date",
  className = "",
  disabled = false,
  "data-testid": testId,
  ...rest
}) {
  const selected = parseISO(value);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minD = parseISO(min);
  const maxD = parseISO(max);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState(selected || today);
  const [mode, setMode] = useState("days"); // days | months | years
  const [rect, setRect] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => { if (selected) setView(selected); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const measure = useCallback(() => { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); }, []);
  const openCal = () => { if (disabled) return; measure(); setView(selected || today); setMode("days"); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onSR = () => { if (!isMobile) measure(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onSR);
    window.addEventListener("scroll", onSR, true);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onSR); window.removeEventListener("scroll", onSR, true); };
  }, [open, measure, isMobile]);

  const isDisabled = (d) => (minD && d < minD) || (maxD && d > maxD);

  const build = () => {
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1);
    const startDow = leadBlanks(first.getDay());
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    return cells;
  };

  const pick = (d) => { if (!d || isDisabled(d)) return; onChange?.({ target: { value: toISO(d) } }); setOpen(false); };
  const shiftMonth = (delta) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const years = [];
  const baseY = today.getFullYear();
  for (let y = (minD ? minD.getFullYear() : baseY - 100); y <= (maxD ? maxD.getFullYear() : baseY + 10); y++) years.push(y);

  const calInner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Previous" onClick={() => (mode === "days" ? shiftMonth(-1) : setView((v) => new Date(v.getFullYear() - (mode === "years" ? 12 : 1), v.getMonth(), 1)))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => setMode(mode === "days" ? "months" : mode === "months" ? "years" : "days")}
          data-testid={testId ? `${testId}-header` : undefined}
          className="text-sm font-semibold text-slate-700 dark:text-slate-100 rounded-lg px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          {mode === "days" ? `${MONTHS[view.getMonth()]} ${view.getFullYear()}` : mode === "months" ? view.getFullYear() : `${years[0]} – ${years[years.length - 1]}`}
        </button>
        <button type="button" aria-label="Next" onClick={() => (mode === "days" ? shiftMonth(1) : setView((v) => new Date(v.getFullYear() + (mode === "years" ? 12 : 1), v.getMonth(), 1)))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronRight className="h-4 w-4" /></button>
      </div>
      {mode === "months" && (
        <div className="grid grid-cols-3 gap-2 py-1">
          {MONTHS.map((mm, i) => (
            <button key={mm} type="button" onClick={() => { setView(new Date(view.getFullYear(), i, 1)); setMode("days"); }}
              className={`py-2.5 rounded-lg text-sm transition-colors ${i === view.getMonth() ? "bg-primary-600 text-white font-medium" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{mm.slice(0, 3)}</button>
          ))}
        </div>
      )}
      {mode === "years" && (
        <div className="grid grid-cols-3 gap-2 py-1 max-h-[220px] overflow-y-auto no-scrollbar">
          {years.map((y) => (
            <button key={y} type="button" onClick={() => { setView(new Date(y, view.getMonth(), 1)); setMode("months"); }}
              className={`py-2.5 rounded-lg text-sm transition-colors ${y === view.getFullYear() ? "bg-primary-600 text-white font-medium" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{y}</button>
          ))}
        </div>
      )}
      {mode === "days" && (<>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d) => <div key={d} className="text-center text-[11px] font-medium text-slate-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {build().map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dis = isDisabled(d);
          const isSel = sameDay(d, selected);
          const isToday = sameDay(d, today);
          return (
            <button key={toISO(d)} type="button" disabled={dis} onClick={() => pick(d)}
              data-testid={testId ? `${testId}-day-${d.getDate()}` : undefined}
              className={`h-9 w-9 mx-auto flex items-center justify-center rounded-full text-sm transition-all ${dis ? "text-slate-300 dark:text-slate-600 cursor-not-allowed" : "cursor-pointer"} ${isSel ? "bg-primary-600 text-white font-semibold shadow-md shadow-primary-500/30" : isToday ? "ring-1 ring-primary-300 text-primary-600 dark:text-primary-300 font-medium" : !dis ? "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" : ""}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      </>)}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onClick={() => pick(today)} disabled={isDisabled(today)} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-40 disabled:no-underline">Today</button>
        {value && <button type="button" onClick={() => { onChange?.({ target: { value: "" } }); setOpen(false); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>}
      </div>
    </>
  );

  const cal = isMobile ? (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/30" onClick={() => setOpen(false)} />
      <div ref={popRef} data-testid={testId ? `${testId}-cal` : undefined}
        className="fixed inset-x-0 bottom-0 z-[9999] rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl border-t border-slate-200 dark:border-slate-700 p-4 animate-[slideUp_.18s_ease]">
        {calInner}
      </div>
    </>
  ) : (
    <div ref={popRef} data-testid={testId ? `${testId}-cal` : undefined}
      className="fixed z-[9999] w-[300px] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 border border-slate-200 dark:border-slate-700 p-3"
      style={rect ? { top: Math.min(rect.bottom + 6, window.innerHeight - 360), left: Math.min(rect.left, window.innerWidth - 312) } : {}}>
      {calInner}
    </div>
  );

  const label = selected ? selected.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => (open ? setOpen(false) : openCal())} disabled={disabled}
        data-testid={testId} {...rest}
        className={`w-full h-10 px-3 inline-flex items-center gap-2 rounded-lg border bg-white dark:bg-slate-900 text-sm transition-all ${disabled ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700" : "cursor-pointer border-slate-200 dark:border-slate-600 hover:border-primary-300"} ${open ? "border-primary-400 ring-2 ring-primary-100 dark:ring-primary-900/40" : ""} ${className}`}>
        <CalIcon className="h-4 w-4 text-slate-400 shrink-0" />
        <span className={`flex-1 text-left truncate ${label ? "text-slate-700 dark:text-slate-100" : "text-slate-400"}`}>{label || placeholder}</span>
      </button>
      {open && createPortal(cal, document.body)}
    </>
  );
}
