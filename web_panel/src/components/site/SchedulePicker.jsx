import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Check, CalendarX2, ArrowRight } from "lucide-react";
import api from "@/lib/api";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Fallback 30-minute grid (08:00–20:00) used until the backend (source of truth) responds
// with the admin-configured working-hours slots for the selected date.
const FALLBACK_SLOTS = (() => { const out = []; for (let m = 8 * 60; m < 20 * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`); return out; })();
const to12 = (t) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = h % 12 || 12; return `${hh}:${String(m).padStart(2, "0")} ${ap}`; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const prettyDate = (ds) => { try { return new Date(`${ds}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }); } catch { return ds; } };

/*
  Premium custom scheduler (no native date/time inputs).
  value: ISO string "YYYY-MM-DDTHH:mm" or null
  onChange(isoString | null)

  Behaviour:
   - Defaults to today if today still has bookable slots, otherwise auto-advances
     to the next day (today is then disabled in the calendar).
   - If a chosen date has NO bookable slots left (all past / fully booked), a clear
     notice is shown with a one-tap "Book next day" action.
*/
export default function SchedulePicker({ value, onChange }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const now = new Date();

  const [dateStr, setDateStr] = useState(value ? value.split("T")[0] : null);
  const selTime = value && value.split("T")[1] ? value.split("T")[1] : null;
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [fullSlots, setFullSlots] = useState([]);
  const [slots, setSlots] = useState(FALLBACK_SLOTS);

  // Fetch the configured slot grid + fully-booked slots for the selected date.
  useEffect(() => {
    if (!dateStr) { setFullSlots([]); return; }
    api.get(`/bookings/slot-availability?date=${dateStr}`).then((r) => {
      setFullSlots(r.data?.full_slots || []);
      if (Array.isArray(r.data?.slots) && r.data.slots.length) setSlots(r.data.slots);
    }).catch(() => setFullSlots([]));
  }, [dateStr]);

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startPad = first.getDay();
    const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    return cells;
  }, [view]);

  const maxDate = new Date(today); maxDate.setDate(today.getDate() + 45);
  const canPrev = new Date(view.getFullYear(), view.getMonth(), 1) > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= maxDate;

  // A slot is disabled if it's booked-full, or (for today) already past the current hour.
  const slotDisabledOn = (t, ds, fulls) => {
    if (fulls.includes(t)) return true;
    if (ds === iso(now)) { const [h, m] = t.split(":").map(Number); return (h * 60 + m) <= (now.getHours() * 60 + now.getMinutes()); }
    return false;
  };
  const isSlotDisabled = (t) => (dateStr ? slotDisabledOn(t, dateStr, fullSlots) : false);
  // First bookable slot for a date — prefer 10:00, else earliest available.
  const firstAvailable = (ds, fulls = []) => (!slotDisabledOn("10:00", ds, fulls) ? "10:00" : slots.find((t) => !slotDisabledOn(t, ds, fulls)) || null);

  // Today has no time left at all (used to skip today by default and disable it).
  const todayExhausted = !firstAvailable(iso(now), []);

  const selectDate = (ds) => {
    setDateStr(ds);
    const ft = firstAvailable(ds, []);
    onChange(ft ? `${ds}T${ft}` : null); // no valid time -> clear so checkout stays blocked
  };
  const pickDay = (d) => selectDate(iso(d));
  const pickTime = (t) => { if (dateStr) onChange(`${dateStr}T${t}`); };

  const goNextDay = () => {
    const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date(today);
    base.setDate(base.getDate() + 1); base.setHours(0, 0, 0, 0);
    if (base > maxDate) return;
    if (base.getMonth() !== view.getMonth() || base.getFullYear() !== view.getFullYear())
      setView(new Date(base.getFullYear(), base.getMonth(), 1));
    selectDate(iso(base));
  };

  // Available slots for the currently-selected date (accounts for full + past).
  const availForSel = dateStr ? slots.filter((t) => !isSlotDisabled(t)) : [];
  const noSlotsForSel = !!dateStr && availForSel.length === 0;

  // Default selection on mount: today if it has slots, else next day.
  useEffect(() => {
    if (value) return;
    const base = new Date(today);
    if (todayExhausted) base.setDate(base.getDate() + 1);
    if (base.getMonth() !== view.getMonth() || base.getFullYear() !== view.getFullYear())
      setView(new Date(base.getFullYear(), base.getMonth(), 1));
    selectDate(iso(base));
  }, []);

  // If the selected time becomes invalid once full-slots load, re-pick a valid one.
  useEffect(() => {
    if (!dateStr || !selTime) return;
    if (slotDisabledOn(selTime, dateStr, fullSlots)) {
      const ft = firstAvailable(dateStr, fullSlots);
      onChange(ft ? `${dateStr}T${ft}` : null);
    }
  }, [fullSlots]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="schedule-picker">
      {/* Calendar */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" data-testid="cal-prev" disabled={!canPrev} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-30 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
        <p className="font-heading font-bold text-slate-900">{MONTHS[view.getMonth()]} {view.getFullYear()}</p>
        <button type="button" data-testid="cal-next" disabled={!canNext} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-30 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">{DOW.map((d, i) => <div key={i} className="text-center text-[11px] font-bold text-slate-400 py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const isTodayCell = iso(d) === iso(today);
          // Today is disabled when all of its slots are already gone.
          const past = d < today || d > maxDate || (isTodayCell && todayExhausted);
          const isSel = dateStr === iso(d);
          return (
            <button key={i} type="button" disabled={past} data-testid={`cal-day-${iso(d)}`} onClick={() => pickDay(d)}
              title={isTodayCell && todayExhausted ? "No slots left for today" : undefined}
              className={`h-9 rounded-lg text-sm font-medium transition-all relative ${isSel ? "bg-primary-700 text-white shadow-md shadow-primary-700/30" : past ? "text-slate-300 cursor-not-allowed" : "text-slate-700 hover:bg-primary-50"}`}>
              {d.getDate()}
              {isTodayCell && !isSel && <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${todayExhausted ? "bg-slate-300" : "bg-primary-600"}`} />}
            </button>
          );
        })}
      </div>

      {/* Time slots */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Select a time slot</p>
        {!dateStr && <p className="text-sm text-slate-400">Pick a date first.</p>}

        {noSlotsForSel && (
          <div data-testid="no-slots-notice" className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
            <CalendarX2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                No time slots available for {dateStr === iso(today) ? "today" : prettyDate(dateStr)}.
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {dateStr === iso(today) ? "Today's slots are over — please book for the next day." : "This day is fully booked. Please choose another day."}
              </p>
              <button type="button" data-testid="book-next-day" onClick={goNextDay}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
                Book next day <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {dateStr && !noSlotsForSel && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {slots.map((t) => {
              const dis = isSlotDisabled(t);
              const active = selTime === t;
              const isFull = fullSlots.includes(t);
              return (
                <button key={t} type="button" disabled={dis} data-testid={`slot-${t}`} onClick={() => pickTime(t)}
                  className={`py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-all ${active ? "border-primary-700 bg-primary-700 text-white" : dis ? "border-slate-100 text-slate-300 cursor-not-allowed line-through" : "border-slate-200 text-slate-700 hover:border-primary-300"}`}>
                  {active && <Check className="h-3 w-3" />}{to12(t)}{isFull ? " ·Full" : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {value && selTime && (
        <div className="mt-3 rounded-lg bg-primary-50 text-primary-800 text-sm font-medium px-3 py-2">
          Scheduled for {new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · {to12(selTime)}
        </div>
      )}
    </div>
  );
}
