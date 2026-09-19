import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, Clock } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n) => String(n).padStart(2, "0");
const leadBlanks = (jsDay) => (jsDay + 6) % 7;
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// value is "YYYY-MM-DDTHH:mm" (datetime-local format)
const parseDT = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return d ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), 0, 0) : null;
};
const toDT = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * PremiumDateTimePicker — drop-in for <input type="datetime-local">.
 * value "YYYY-MM-DDTHH:mm"; onChange fires { target: { value } }.
 * Calendar (Monday-first, circle-selected) + hour/minute/AM-PM selectors.
 */
export default function PremiumDateTimePicker({
  value, onChange, min, max,
  placeholder = "Select date & time",
  minuteStep = 5,
  className = "", disabled = false,
  "data-testid": testId,
  ...rest
}) {
  const selected = parseDT(value);
  const today = new Date();
  const minD = parseDT(min); const maxD = parseDT(max);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(selected || today);
  const [draft, setDraft] = useState(selected || (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; })());
  const [rect, setRect] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef(null); const popRef = useRef(null);

  useEffect(() => { if (selected) { setView(selected); setDraft(selected); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const measure = useCallback(() => { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); }, []);
  const openCal = () => { if (disabled) return; measure(); const base = selected || draft; setView(base); setDraft(base); setOpen(true); };

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

  const build = () => {
    const y = view.getFullYear(), m = view.getMonth();
    const startDow = leadBlanks(new Date(y, m, 1).getDay());
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    return cells;
  };
  const dateDisabled = (d) => { if (!d) return false; const dd = new Date(d); dd.setHours(23, 59); const ds = new Date(d); ds.setHours(0, 0); return (minD && dd < minD) || (maxD && ds > maxD); };
  const shiftMonth = (delta) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const hours12 = draft.getHours() % 12 === 0 ? 12 : draft.getHours() % 12;
  const isPM = draft.getHours() >= 12;
  const setHour12 = (h) => { const pm = isPM; let h24 = h % 12; if (pm) h24 += 12; setDraft((d) => { const x = new Date(d); x.setHours(h24); return x; }); };
  const setMinute = (mm) => setDraft((d) => { const x = new Date(d); x.setMinutes(mm); return x; });
  const setMeridiem = (pm) => setDraft((d) => { const x = new Date(d); const h = x.getHours() % 12; x.setHours(pm ? h + 12 : h); return x; });
  const pickDay = (d) => { if (!d || dateDisabled(d)) return; setDraft((prev) => { const x = new Date(d); x.setHours(prev.getHours(), prev.getMinutes()); return x; }); };
  const confirm = () => { onChange?.({ target: { value: toDT(draft) } }); setOpen(false); };

  const minutes = []; for (let m = 0; m < 60; m += minuteStep) minutes.push(m);

  const inner = (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Previous" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-100">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
        <button type="button" aria-label="Next" onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d) => <div key={d} className="text-center text-[11px] font-medium text-slate-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {build().map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dis = dateDisabled(d);
          const isSel = sameDay(d, draft);
          const isToday = sameDay(d, today);
          return (
            <button key={i} type="button" disabled={dis} onClick={() => pickDay(d)}
              data-testid={testId ? `${testId}-day-${d.getDate()}` : undefined}
              className={`h-9 w-9 mx-auto flex items-center justify-center rounded-full text-sm transition-all ${dis ? "text-slate-300 dark:text-slate-600 cursor-not-allowed" : "cursor-pointer"} ${isSel ? "bg-primary-600 text-white font-semibold shadow-md shadow-primary-500/30" : isToday ? "ring-1 ring-primary-300 text-primary-600" : !dis ? "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" : ""}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-2"><Clock className="h-4 w-4 text-slate-400" /><span className="text-xs font-semibold text-slate-500">Time</span></div>
        <div className="flex items-center gap-2">
          <select value={hours12} onChange={(e) => setHour12(Number(e.target.value))} data-testid={testId ? `${testId}-hour` : undefined} className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-300">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{pad(h)}</option>)}
          </select>
          <span className="font-bold text-slate-400">:</span>
          <select value={draft.getMinutes()} onChange={(e) => setMinute(Number(e.target.value))} data-testid={testId ? `${testId}-minute` : undefined} className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-300">
            {minutes.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
          </select>
          <div className="ml-1 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button type="button" onClick={() => setMeridiem(false)} className={`px-3 h-9 text-sm font-medium ${!isPM ? "bg-primary-600 text-white" : "text-slate-500"}`}>AM</button>
            <button type="button" onClick={() => setMeridiem(true)} className={`px-3 h-9 text-sm font-medium ${isPM ? "bg-primary-600 text-white" : "text-slate-500"}`}>PM</button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        {value ? <button type="button" onClick={() => { onChange?.({ target: { value: "" } }); setOpen(false); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button> : <span />}
        <button type="button" data-testid={testId ? `${testId}-confirm` : undefined} onClick={confirm} className="px-4 py-1.5 rounded-lg text-[13px] font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-sm">Set</button>
      </div>
    </div>
  );

  const label = selected ? selected.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  const panel = isMobile ? (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/30" onClick={() => setOpen(false)} />
      <div ref={popRef} data-testid={testId ? `${testId}-cal` : undefined} className="fixed inset-x-0 bottom-0 z-[9999] rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl border-t border-slate-200 dark:border-slate-700 animate-[slideUp_.18s_ease]">{inner}</div>
    </>
  ) : (
    <div ref={popRef} data-testid={testId ? `${testId}-cal` : undefined}
      className="fixed z-[9999] w-[320px] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 border border-slate-200 dark:border-slate-700"
      style={rect ? { top: Math.min(rect.bottom + 6, window.innerHeight - 440), left: Math.min(rect.left, window.innerWidth - 332) } : {}}>{inner}</div>
  );

  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => (open ? setOpen(false) : openCal())} disabled={disabled} data-testid={testId} {...rest}
        className={`w-full h-10 px-3 inline-flex items-center gap-2 rounded-lg border bg-white dark:bg-slate-900 text-sm transition-all ${disabled ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700" : "cursor-pointer border-slate-200 dark:border-slate-600 hover:border-primary-300"} ${open ? "border-primary-400 ring-2 ring-primary-100 dark:ring-primary-900/40" : ""} ${className}`}>
        <CalIcon className="h-4 w-4 text-slate-400 shrink-0" />
        <span className={`flex-1 text-left truncate ${label ? "text-slate-700 dark:text-slate-100" : "text-slate-400"}`}>{label || placeholder}</span>
      </button>
      {open && createPortal(panel, document.body)}
    </>
  );
}
