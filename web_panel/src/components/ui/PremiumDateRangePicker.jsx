import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, X, Check } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "");
const parseISO = (s) => { if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const leadBlanks = (jsDay) => (jsDay + 6) % 7;
const pretty = (d) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function buildCells(view) {
  const y = view.getFullYear(), m = view.getMonth();
  const startDow = leadBlanks(new Date(y, m, 1).getDay());
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  return cells;
}

function MonthGrid({ view, from, to, hover, min, max, onPick, onHover, accent, testId }) {
  const inRange = (d) => {
    if (!from) return false;
    const end = to || hover;
    if (!end) return false;
    const lo = from < end ? from : end;
    const hi = from < end ? end : from;
    return d > lo && d < hi;
  };
  const disabled = (d) => (min && d < min) || (max && d > max);
  return (
    <div className="select-none">
      <div className="grid grid-cols-7 gap-y-1 mb-1">
        {DOW.map((d) => <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {buildCells(view).map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dis = disabled(d);
          const isFrom = sameDay(d, from);
          const isTo = sameDay(d, to);
          const isEnd = isFrom || isTo;
          const between = inRange(d);
          return (
            <div key={toISO(d)} className={`relative flex items-center justify-center ${between ? "bg-primary-50 dark:bg-primary-900/30" : ""} ${isFrom && (to || hover) ? "bg-gradient-to-r from-transparent to-primary-50 dark:to-primary-900/30 rounded-l-full" : ""} ${isTo ? "bg-gradient-to-l from-transparent to-primary-50 dark:to-primary-900/30 rounded-r-full" : ""}`}>
              <button type="button" disabled={dis}
                data-testid={testId ? `${testId}-day-${toISO(d)}` : undefined}
                onMouseEnter={() => onHover(d)}
                onClick={() => onPick(d)}
                className={`h-9 w-9 flex items-center justify-center rounded-full text-sm transition-all ${dis ? "text-slate-300 dark:text-slate-600 cursor-not-allowed" : "cursor-pointer"} ${isEnd ? "text-white font-semibold shadow-md" : between ? "text-primary-700 dark:text-primary-200" : !dis ? "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" : ""}`}
                style={isEnd ? { background: accent } : undefined}>
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * PremiumDateRangePicker — reference-style premium range calendar.
 * Props: from,to (YYYY-MM-DD) ; onApply({from,to}) or onApply(null) on clear.
 * Presets sidebar, two-month desktop / single-month + bottom-sheet mobile,
 * from/to summary inputs, Cancel/Apply. accent defaults to brand blue.
 */
export default function PremiumDateRangePicker({
  from, to, onApply,
  min, max,
  className = "",
  accent = "#0D47A1",
  triggerLabel = "Pick a date range",
  presets: presetsProp,
  align = "start",
  "data-testid": testId = "premium-range",
}) {
  const minD = parseISO(min); const maxD = parseISO(max);
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [rect, setRect] = useState(null);
  const [draft, setDraft] = useState({ from: parseISO(from), to: parseISO(to) });
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(parseISO(from) || new Date());
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => { setDraft({ from: parseISO(from), to: parseISO(to) }); }, [from, to]);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const measure = useCallback(() => { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); }, []);
  const openCal = () => { measure(); setDraft({ from: parseISO(from), to: parseISO(to) }); setView(parseISO(from) || new Date()); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return; setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onSR = () => { if (!isMobile) measure(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onSR);
    window.addEventListener("scroll", onSR, true);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onSR); window.removeEventListener("scroll", onSR, true); };
  }, [open, isMobile, measure]);

  const today = startOfDay(new Date());
  const PRESETS = presetsProp || [
    { key: "today", label: "Today", range: () => ({ from: today, to: today }) },
    { key: "yesterday", label: "Yesterday", range: () => ({ from: addDays(today, -1), to: addDays(today, -1) }) },
    { key: "7", label: "Last 7 days", range: () => ({ from: addDays(today, -6), to: today }) },
    { key: "thisMonth", label: "This month", range: () => ({ from: new Date(today.getFullYear(), today.getMonth(), 1), to: today }) },
    { key: "lastMonth", label: "Last month", range: () => ({ from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 0) }) },
    { key: "90", label: "Last 90 days", range: () => ({ from: addDays(today, -89), to: today }) },
    { key: "thisYear", label: "This year", range: () => ({ from: new Date(today.getFullYear(), 0, 1), to: today }) },
    { key: "lastYear", label: "Last year", range: () => ({ from: new Date(today.getFullYear() - 1, 0, 1), to: new Date(today.getFullYear() - 1, 11, 31) }) },
  ];

  const pick = (d) => {
    setDraft((r) => {
      if (!r.from || (r.from && r.to)) return { from: d, to: null };
      if (d < r.from) return { from: d, to: r.from };
      return { from: r.from, to: d };
    });
  };
  const applyPreset = (p) => { const r = p.range(); setDraft(r); setView(r.from || new Date()); };
  const apply = () => { if (!draft.from) return; onApply?.({ from: toISO(draft.from), to: toISO(draft.to || draft.from) }); setOpen(false); };
  const clear = () => { setDraft({ from: null, to: null }); onApply?.(null); setOpen(false); };

  const activePreset = PRESETS.find((p) => { const r = p.range(); return sameDay(r.from, draft.from) && sameDay(r.to, draft.to); });
  const months = isMobile ? 1 : 2;
  const viewFor = (i) => new Date(view.getFullYear(), view.getMonth() + i, 1);

  const body = (
    <div className="flex flex-col md:flex-row">
      {/* Presets */}
      <div className="md:w-40 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 p-2 md:p-3 bg-slate-50/70 dark:bg-slate-900/60 md:max-h-none max-h-28 overflow-auto no-scrollbar">
        <div className="flex md:flex-col gap-1 flex-wrap">
          {PRESETS.map((p) => {
            const isActive = activePreset?.key === p.key;
            return (
              <button key={p.key} type="button" data-testid={`${testId}-preset-${p.key}`} onClick={() => applyPreset(p)}
                className={`text-left text-[13px] font-medium rounded-lg px-2.5 py-1.5 transition ${isActive ? "text-white" : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"}`}
                style={isActive ? { background: accent } : undefined}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Calendars */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <button type="button" aria-label="Previous" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronLeft className="h-4 w-4" /></button>
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))` }}>
            {Array.from({ length: months }).map((_, i) => (
              <div key={i} className="text-center text-sm font-semibold text-slate-700 dark:text-slate-100">{MONTHS[viewFor(i).getMonth()]} {viewFor(i).getFullYear()}</div>
            ))}
          </div>
          <button type="button" aria-label="Next" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))` }} onMouseLeave={() => setHover(null)}>
          {Array.from({ length: months }).map((_, i) => (
            <MonthGrid key={i} view={viewFor(i)} from={draft.from} to={draft.to} hover={hover} min={minD} max={maxD} onPick={pick} onHover={setHover} accent={accent} testId={i === 0 ? testId : undefined} />
          ))}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-w-[92px] text-center">{pretty(draft.from) || "Start"}</span>
            <span className="text-slate-400">–</span>
            <span className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-w-[92px] text-center">{pretty(draft.to) || "End"}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" data-testid={`${testId}-clear`} onClick={clear} className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Clear</button>
            <button type="button" data-testid={`${testId}-cancel`} onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancel</button>
            <button type="button" data-testid={`${testId}-apply`} onClick={apply} disabled={!draft.from} className="px-4 py-1.5 rounded-lg text-[13px] font-bold text-white shadow-sm disabled:opacity-40 inline-flex items-center gap-1" style={{ background: accent }}><Check className="h-4 w-4" /> Apply</button>
          </div>
        </div>
      </div>
    </div>
  );

  const label = draft.from || parseISO(from)
    ? `${pretty(parseISO(from) || draft.from)}${(parseISO(to) || draft.to) ? ` – ${pretty(parseISO(to) || draft.to)}` : ""}`
    : triggerLabel;

  const panel = isMobile ? (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/40" onClick={() => setOpen(false)} />
      <div ref={popRef} data-testid={`${testId}-popover`} className="fixed inset-x-0 bottom-0 z-[9999] rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl border-t border-slate-200 dark:border-slate-700 max-h-[88vh] overflow-auto animate-[slideUp_.18s_ease]">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Select date range</span>
          <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400"><X className="h-5 w-5" /></button>
        </div>
        {body}
      </div>
    </>
  ) : (
    <div ref={popRef} data-testid={`${testId}-popover`}
      className="fixed z-[9999] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 border border-slate-200 dark:border-slate-700 overflow-hidden"
      style={rect ? { top: Math.min(rect.bottom + 6, window.innerHeight - 380), left: align === "end" ? Math.max(8, Math.min(rect.right - 620, window.innerWidth - 628)) : Math.max(8, Math.min(rect.left, window.innerWidth - 628)) } : {}}>
      {body}
    </div>
  );

  return (
    <>
      <button type="button" ref={triggerRef} data-testid={testId} onClick={() => (open ? setOpen(false) : openCal())}
        className={`h-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-semibold text-slate-700 dark:text-slate-100 hover:border-slate-300 transition ${className}`}>
        <CalIcon className="h-4 w-4" style={{ color: accent }} />
        <span className="truncate max-w-[220px]">{label}</span>
      </button>
      {open && createPortal(panel, document.body)}
    </>
  );
}
