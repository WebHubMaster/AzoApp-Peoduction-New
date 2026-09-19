import React, { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { createPortal } from "react-dom";
import { Calendar as CalIcon, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

/* Premium date-range picker: preset list + custom month calendar.
   Desktop → popover, Mobile → full bottom-sheet. Emits
   { key, label, from:'YYYY-MM-DD', to:'YYYY-MM-DD', allTime:bool }. */

const D = "YYYY-MM-DD";
const today = () => dayjs();

export const PRESETS = [
  { key: "today", label: "Today", range: () => [today(), today()] },
  { key: "yesterday", label: "Yesterday", range: () => [today().subtract(1, "day"), today().subtract(1, "day")] },
  { key: "7d", label: "Last 7 Days", range: () => [today().subtract(6, "day"), today()] },
  { key: "30d", label: "Last 30 Days", range: () => [today().subtract(29, "day"), today()] },
  { key: "thisMonth", label: "This Month", range: () => [today().startOf("month"), today()] },
  { key: "lastMonth", label: "Last Month", range: () => [today().subtract(1, "month").startOf("month"), today().subtract(1, "month").endOf("month")] },
  { key: "thisQuarter", label: "This Quarter", range: () => [today().startOf("quarter"), today()] },
  { key: "lastQuarter", label: "Last Quarter", range: () => [today().subtract(1, "quarter").startOf("quarter"), today().subtract(1, "quarter").endOf("quarter")] },
  { key: "thisYear", label: "This Year", range: () => [today().startOf("year"), today()] },
  { key: "lastYear", label: "Last Year", range: () => [today().subtract(1, "year").startOf("year"), today().subtract(1, "year").endOf("year")] },
  { key: "all", label: "All Time", range: () => [null, null], allTime: true },
];

export const defaultDateValue = () => {
  const p = PRESETS.find((x) => x.key === "30d");
  const [f, t] = p.range();
  return { key: "30d", label: p.label, from: f.format(D), to: t.format(D), allTime: false };
};

function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const on = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return m;
}

function MonthGrid({ month, onNav, onYear, from, to, hover, setHover, onPick }) {
  const [yearMode, setYearMode] = useState(false);
  const start = month.startOf("month");
  const startDow = start.day(); // 0 Sun
  const daysInMonth = month.daysInMonth();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(month.date(d));
  const t = today().format(D);
  const inRange = (day) => {
    if (!from) return false;
    const end = to || hover;
    if (!end) return false;
    const a = dayjs(from);
    const b = dayjs(end);
    const lo = a.isBefore(b) ? a : b;
    const hi = a.isBefore(b) ? b : a;
    return day.isAfter(lo.subtract(1, "day")) && day.isBefore(hi.add(1, "day"));
  };
  if (yearMode) {
    const y0 = month.year();
    const years = Array.from({ length: 12 }, (_, i) => y0 - 8 + i);
    return (
      <div className="select-none" data-testid="dash-cal-years">
        <div className="flex items-center justify-between mb-2 px-1">
          <button onClick={() => onYear(-12)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" aria-label="Earlier years"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setYearMode(false)} className="text-sm font-bold text-slate-800 dark:text-slate-100 hover:text-primary-600">{years[0]} – {years[years.length - 1]}</button>
          <button onClick={() => onYear(12)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" aria-label="Later years"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {years.map((y) => (
            <button key={y} onClick={() => { onYear(y - y0); setYearMode(false); }} data-testid={`dash-cal-year-${y}`}
              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${y === y0 ? "bg-primary-600 text-white" : y > today().year() ? "text-slate-300 cursor-not-allowed" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"}`} disabled={y > today().year()}>{y}</button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={() => onNav(-1)} data-testid="dash-cal-prev" className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setYearMode(true)} data-testid="dash-cal-title" className="text-sm font-bold text-slate-800 dark:text-slate-100 hover:text-primary-600 transition-colors" title="Pick a year">{month.format("MMMM YYYY")}</button>
        <button onClick={() => onNav(1)} data-testid="dash-cal-next" className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
          <div key={i} className="h-7 grid place-items-center text-[10px] font-bold text-slate-400">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = day.format(D);
          const isFrom = from && ds === from;
          const isTo = to && ds === to;
          const selected = isFrom || isTo;
          const rng = inRange(day);
          const isToday = ds === t;
          const future = day.isAfter(today(), "day");
          return (
            <button
              key={i}
              disabled={future}
              onMouseEnter={() => setHover(ds)}
              onClick={() => onPick(ds)}
              className={[
                "h-9 grid place-items-center text-xs rounded-lg relative transition-colors",
                future ? "text-slate-300 dark:text-slate-700 cursor-not-allowed" : "hover:bg-primary-50 dark:hover:bg-primary-900/30",
                rng && !selected ? "bg-primary-100/70 dark:bg-primary-900/30 rounded-none" : "",
                selected ? "bg-primary-600 text-white font-bold shadow" : "text-slate-700 dark:text-slate-200",
              ].join(" ")}
            >
              {day.date()}
              {isToday && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DashCalendar({ value, onChange, testid = "dash-daterange" }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(dayjs(value?.to || undefined));
  const [from, setFrom] = useState(value?.from || null);
  const [to, setTo] = useState(value?.to || null);
  const [hover, setHover] = useState(null);
  const [activeKey, setActiveKey] = useState(value?.key || "30d");
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) {
      setFrom(value?.from || null);
      setTo(value?.to || null);
      setActiveKey(value?.key || "custom");
      setMonth(dayjs(value?.to || undefined));
    }
  }, [open, value]);

  useEffect(() => {
    if (open && !isMobile && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = 620;
      let left = r.right - width;
      if (left < 8) left = 8;
      setPos({ top: r.bottom + 8, left });
    }
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (ds) => {
    setActiveKey("custom");
    if (!from || (from && to)) { setFrom(ds); setTo(null); return; }
    // second click
    if (dayjs(ds).isBefore(dayjs(from))) { setTo(from); setFrom(ds); }
    else setTo(ds);
  };

  const applyPreset = (p) => {
    if (p.allTime) {
      setActiveKey("all"); setFrom(null); setTo(null);
      onChange({ key: "all", label: p.label, from: "", to: "", allTime: true });
      setOpen(false);
      return;
    }
    const [f, t] = p.range();
    setActiveKey(p.key); setFrom(f.format(D)); setTo(t.format(D)); setMonth(t);
    onChange({ key: p.key, label: p.label, from: f.format(D), to: t.format(D), allTime: false });
    setOpen(false);
  };

  const apply = () => {
    if (!from) return;
    const t = to || from;
    onChange({ key: "custom", label: `${dayjs(from).format("DD MMM")} – ${dayjs(t).format("DD MMM 'YY")}`, from, to: t, allTime: false });
    setOpen(false);
  };

  const clear = () => { setFrom(null); setTo(null); setActiveKey("custom"); };

  const label = value?.allTime ? "All Time" : (value?.label || "Last 30 Days");

  const Panel = (
    <div ref={popRef} className={isMobile
      ? "fixed inset-x-0 bottom-0 z-[70] bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl max-h-[92vh] overflow-y-auto animate-[slideUp_.25s_ease]"
      : "fixed z-[70] w-[620px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"}
      style={isMobile ? {} : { top: pos.top, left: pos.left }}>
      {isMobile && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2 sticky top-0 bg-white dark:bg-slate-900">
          <h4 className="font-bold text-slate-900 dark:text-white">Select date range</h4>
          <button onClick={() => setOpen(false)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
      )}
      <div className={isMobile ? "flex flex-col" : "flex"}>
        <div className={isMobile ? "grid grid-cols-2 gap-1.5 p-4 border-b border-slate-100 dark:border-slate-800" : "w-44 p-3 border-r border-slate-100 dark:border-slate-800 space-y-0.5 max-h-[400px] overflow-y-auto"}>
          {PRESETS.map((p) => (
            <button key={p.key} data-testid={`dash-preset-${p.key}`} onClick={() => applyPreset(p)}
              className={`text-left text-xs font-medium px-3 py-2 rounded-lg transition-colors ${activeKey === p.key ? "bg-primary-600 text-white shadow" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex-1 p-4">
          <MonthGrid month={month} onNav={(d) => setMonth(month.add(d, "month"))} onYear={(y) => setMonth(month.add(y, "year"))} from={from} to={to} hover={hover} setHover={setHover} onPick={pick} />
          <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {from ? <span><b className="text-slate-700 dark:text-slate-200">{dayjs(from).format("DD MMM")}</b> → {to ? <b className="text-slate-700 dark:text-slate-200">{dayjs(to).format("DD MMM YYYY")}</b> : <span className="italic">pick end date</span>}</span> : "Select start date"}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clear} className="text-xs font-semibold px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Clear</button>
              <button onClick={() => setOpen(false)} className="text-xs font-semibold px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
              <button data-testid="dash-apply-range" onClick={apply} disabled={!from} className="text-xs font-bold px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-40 hover:bg-primary-700">Apply</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button ref={btnRef} data-testid={testid} onClick={() => setOpen((o) => !o)}
        className="h-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-primary-300 hover:shadow-sm transition-all active:scale-[.98]">
        <CalIcon className="h-4 w-4 text-primary-600" />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (isMobile
        ? createPortal(<><div className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />{Panel}</>, document.body)
        : createPortal(Panel, document.body))}
    </div>
  );
}
