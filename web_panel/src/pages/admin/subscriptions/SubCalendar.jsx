import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, X, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { inr, label } from "../bookings/shared";
import { fmtDate } from "./subShared";

export const DAY_STYLE = {
  scheduled: ["Scheduled", "bg-blue-50 text-[#1D4ED8] ring-blue-200", "bg-[#2563EB]"],
  in_progress: ["In Progress", "bg-indigo-50 text-indigo-700 ring-indigo-200", "bg-indigo-500"],
  completed: ["Completed", "bg-green-100 text-[#15803D] ring-green-200", "bg-[#16A34A]"],
  replacement_completed: ["Replacement", "bg-violet-100 text-violet-700 ring-violet-200", "bg-violet-500"],
  maid_absent: ["Maid Absent", "bg-red-100 text-[#B91C1C] ring-red-200", "bg-[#DC2626]"],
  customer_cancel: ["Customer Cancel", "bg-amber-100 text-[#B45309] ring-amber-200", "bg-[#F59E0B]"],
  weekly_off: ["Weekly Off", "bg-slate-100 text-slate-400 ring-slate-200", "bg-slate-300"],
  paused: ["Paused", "bg-slate-200/70 text-slate-600 ring-slate-300 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(100,116,139,.12)_4px,rgba(100,116,139,.12)_8px)]", "bg-slate-500"],
  cancelled: ["Cancelled", "bg-rose-50 text-rose-400 ring-rose-200 line-through", "bg-rose-300"],
};
const LOCKED = ["weekly_off", "paused", "cancelled"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ym = (iso) => iso.slice(0, 7);
const pad = (n) => String(n).padStart(2, "0");

function DayCell({ d, iso, busy, markDay, isToday }) {
  const [open, setOpen] = useState(false);
  const day = Number(iso.slice(8));
  if (!d) return <div className="h-11 rounded-md grid place-items-center text-[12px] text-slate-300 tabular-nums">{day}</div>;
  const [l, cls] = DAY_STYLE[d.status] || [label(d.status), "bg-slate-50 text-slate-600 ring-slate-200"];
  const can = !LOCKED.includes(d.status) && !busy;
  const act = (st) => { setOpen(false); markDay(d.date, st); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={`sub-cal-day-${iso}`} aria-label={`${fmtDate(iso)} · ${l}`}
          className={`h-11 rounded-md ring-1 flex flex-col items-center justify-center leading-none transition-transform hover:scale-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D47A1] ${cls} ${isToday ? "outline outline-2 outline-offset-1 outline-[#0D47A1]" : ""}`}>
          <span className="text-[12.5px] font-semibold tabular-nums">{day}</span>
          {(d.earning || 0) > 0 && <span className="text-[9.5px] mt-0.5 opacity-80 tabular-nums">₹{Math.round(d.earning)}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-56 p-3 text-[13px]" data-testid="sub-cal-pop">
        <p className="font-semibold text-[#111827] dark:text-white">{fmtDate(iso)}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{l}{d.status !== "weekly_off" ? ` · ${inr(d.earning || 0)}` : ""}</p>
        {d.note && <p className="text-[11.5px] text-slate-400 mt-1">{d.note}</p>}
        {can ? (
          <div className="grid gap-1 mt-2.5">
            <Button variant="outline" className="h-8 justify-start text-[12.5px] text-[#15803D]" onClick={() => act("completed")} data-testid={`sub-day-completed-${iso}`}><CheckCircle2 className="h-3.5 w-3.5" /> Mark completed</Button>
            <Button variant="outline" className="h-8 justify-start text-[12.5px] text-[#B91C1C]" onClick={() => act("maid_absent")} data-testid={`sub-day-maid_absent-${iso}`}><X className="h-3.5 w-3.5" /> Maid absent</Button>
            <Button variant="outline" className="h-8 justify-start text-[12.5px] text-[#B45309]" onClick={() => act("customer_cancel")} data-testid={`sub-day-customer_cancel-${iso}`}><Clock className="h-3.5 w-3.5" /> Customer cancel</Button>
          </div>
        ) : <p className="text-[11.5px] text-slate-400 mt-2">{d.status === "weekly_off" ? "Agreed weekly off — no visit." : d.status === "paused" ? "Paused day — shifted to the end of the plan." : d.status === "cancelled" ? "Cancelled with the subscription." : ""}</p>}
      </PopoverContent>
    </Popover>
  );
}

export default function SubCalendar({ s, busy, markDay }) {
  const byDate = useMemo(() => Object.fromEntries((s.schedule || []).map((d) => [d.date, d])), [s.schedule]);
  const months = useMemo(() => {
    const out = []; const dates = (s.schedule || []).map((d) => d.date).sort();
    if (!dates.length) return out;
    let [y, m] = dates[0].split("-").map(Number); const [ey, em] = dates[dates.length - 1].split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${pad(m)}`); m += 1; if (m > 12) { m = 1; y += 1; } }
    return out;
  }, [s.schedule]);
  const today = new Date().toISOString().slice(0, 10);
  const [idx, setIdx] = useState(() => Math.max(0, months.indexOf(ym(today))));
  const i = Math.min(idx, Math.max(0, months.length - 1));
  if (!months.length) return <p className="text-[12.5px] text-slate-400">No schedule yet.</p>;
  const [y, m] = months[i].split("-").map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const n = new Date(y, m, 0).getDate();
  const used = new Set((s.schedule || []).map((d) => d.status));
  return (
    <div data-testid="sub-calendar">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setIdx(i - 1)} disabled={i === 0} aria-label="Previous month" className="h-7 w-7 grid place-items-center rounded-md border border-[#E5E7EB] dark:border-slate-700 text-slate-500 hover:bg-slate-50 disabled:opacity-30" data-testid="sub-cal-prev"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <p className="text-[13.5px] font-semibold text-[#111827] dark:text-white" data-testid="sub-cal-month">{MONTHS[m - 1]} {y}{months.length > 1 && <span className="ml-1.5 text-[11.5px] font-normal text-slate-400">{i + 1}/{months.length}</span>}</p>
        <button type="button" onClick={() => setIdx(i + 1)} disabled={i >= months.length - 1} aria-label="Next month" className="h-7 w-7 grid place-items-center rounded-md border border-[#E5E7EB] dark:border-slate-700 text-slate-500 hover:bg-slate-50 disabled:opacity-30" data-testid="sub-cal-next"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">{DOW.map((d) => <div key={d} className="text-center text-[11px] font-medium text-slate-400">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, k) => <div key={`b${k}`} />)}
        {Array.from({ length: n }).map((_, k) => { const iso = `${y}-${pad(m)}-${pad(k + 1)}`; return <DayCell key={iso} iso={iso} d={byDate[iso]} busy={busy} markDay={markDay} isToday={iso === today} />; })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5" data-testid="sub-cal-legend">
        {Object.entries(DAY_STYLE).filter(([k]) => used.has(k)).map(([k, [l, , dot]]) => <span key={k} className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-500"><span className={`h-2 w-2 rounded-sm ${dot}`} />{l}</span>)}
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">Tap a day to mark attendance.</p>
    </div>
  );
}
