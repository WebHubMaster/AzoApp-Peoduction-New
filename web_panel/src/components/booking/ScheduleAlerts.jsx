import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X, CheckCircle2 } from "lucide-react";
import { useRealtime } from "@/context/RealtimeContext";

/* Realtime SCHEDULE REMINDER popup shared by Partner & Customer panels.
 *
 * NOTE: The reschedule-request alert is owned SOLELY by <RescheduleRing/> (single
 * premium full-screen modal). This component intentionally does NOT render a
 * reschedule modal anymore — that was the source of the duplicate popup/backdrop.
 * It still listens for `reschedule_resolved` purely to trigger a data refresh so
 * the inline booking cards update once the other party responds. */
export default function ScheduleAlerts({ role = "customer", onChanged }) {
  const { subscribe } = useRealtime();
  const [reminder, setReminder] = useState(null); // scheduled_reminder payload

  useEffect(() => subscribe((ev) => {
    if (ev.type === "scheduled_reminder" && ev.data?.booking_id) setReminder(ev.data);
    else if (ev.type === "reschedule_resolved") onChanged?.();
  }), [subscribe, onChanged]);

  if (!reminder) return null;

  return createPortal(
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 p-4" data-testid="scheduled-reminder-ring">
      <div className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white px-5 py-4 flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <p className="font-heading font-black tracking-wide">SCHEDULED WORK REMINDER</p>
        </div>
        <div className="p-5 space-y-3 text-center">
          <p className="font-bold text-slate-900 dark:text-white text-lg">{reminder.service_name}</p>
          <div className="flex items-center justify-center gap-4 text-base font-black text-slate-800 dark:text-white">
            <span className="inline-flex items-center gap-1.5">📅 {reminder.scheduled_date}</span>
            <span className="inline-flex items-center gap-1.5">⏰ {reminder.scheduled_time}</span>
          </div>
          <p className="text-[12.5px] text-emerald-600 font-semibold inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Call, Chat & Navigation are now unlocked.</p>
          <button data-testid="reminder-view-btn" onClick={() => setReminder(null)}
            className="w-full h-11 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold">VIEW SCHEDULED WORK</button>
        </div>
        <button onClick={() => setReminder(null)} className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-lg text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
    </div>,
    document.body
  );
}
