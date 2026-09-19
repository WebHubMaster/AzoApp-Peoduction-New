import React, { useEffect, useState } from "react";
import { Calendar, Clock, Lock, Phone, MessageCircle, Navigation, KeyRound, CheckCircle2 } from "lucide-react";

/* Visual-only countdown. The REAL unlock/OTP/reminder permission is decided
   server-side (booking.schedule) — this just ticks the display each second from
   the server-provided seconds_to_start, and re-syncs whenever the list reloads. */
export function useCountdown(initialSeconds) {
  const [secs, setSecs] = useState(Number.isFinite(initialSeconds) ? initialSeconds : 0);
  useEffect(() => {
    setSecs(Number.isFinite(initialSeconds) ? initialSeconds : 0);
  }, [initialSeconds]);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  return secs;
}

export function fmtCountdown(total) {
  if (!Number.isFinite(total)) return "";
  const neg = total < 0;
  let s = Math.abs(Math.floor(total));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n) => String(n).padStart(2, "0");
  let out = "";
  if (d > 0) out = `${d}d ${pad(h)}h ${pad(m)}m`;
  else if (h > 0) out = `${h}h ${pad(m)}m ${pad(s)}s`;
  else out = `${pad(m)}m ${pad(s)}s`;
  return neg ? "now" : out;
}

/* Premium scheduled-service card shown on both partner & customer screens (spec 3/6/16).
   Renders the date, time, a live countdown and the lock state for Call/Chat/Navigation/OTP. */
export default function ScheduledCard({ schedule, role = "customer", compact = false }) {
  const s = schedule || {};
  const secs = useCountdown(s.seconds_to_start);
  if (!s.is_scheduled) return null;

  const locked = !!s.comm_locked;
  const started = s.phase === "active";
  const due = s.phase === "due";

  const items = [
    { icon: Phone, label: "Call" },
    { icon: MessageCircle, label: "Chat" },
    { icon: Navigation, label: "Navigation" },
    { icon: KeyRound, label: role === "customer" ? "Start OTP" : "Start Work" },
  ];

  return (
    <div
      data-testid="scheduled-card"
      className={`mt-3 rounded-2xl border-2 p-4 shadow-sm ${
        locked
          ? "border-primary-200 bg-gradient-to-br from-primary-50 to-sky-50 dark:from-primary-900/25 dark:to-sky-900/15"
          : "border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/25 dark:to-teal-900/15"
      }`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`grid h-9 w-9 place-items-center rounded-xl text-white ${locked ? "bg-primary-600" : "bg-emerald-600"}`}>
            <Calendar className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className={`text-[10.5px] font-extrabold uppercase tracking-wider ${locked ? "text-primary-700 dark:text-primary-300" : "text-emerald-700 dark:text-emerald-300"}`}>
              Scheduled Service
            </p>
            <p className="text-sm font-black text-slate-900 dark:text-white leading-tight flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5 opacity-70" /> {s.scheduled_date}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 opacity-70" /> {s.scheduled_time}</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            {started ? "In progress" : due ? "Ready to start" : "Starts in"}
          </p>
          <p data-testid="scheduled-countdown" className={`font-black tabular-nums text-lg leading-tight ${locked ? "text-primary-700 dark:text-primary-200" : "text-emerald-700 dark:text-emerald-200"}`}>
            {started ? "—" : fmtCountdown(secs)}
          </p>
        </div>
      </div>

      {!compact && (
        <div className="mt-3">
          {locked ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {items.map((it) => (
                  <span key={it.label} className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-slate-900/40 border border-primary-100 dark:border-primary-900/40 px-2.5 py-1 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
                    <Lock className="h-3 w-3" /> {it.label}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                Available 30 minutes before the scheduled time.
              </p>
            </>
          ) : (
            <p className="text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              {role === "customer"
                ? "Call, Chat & your Start OTP are now available."
                : "Call, Chat, Navigation & Start Work are now available."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* Small inline lock note for individual disabled action rows. */
export function LockNote({ text = "Available 30 minutes before scheduled time." }) {
  return (
    <p className="text-[11.5px] text-slate-400 inline-flex items-center gap-1"><Lock className="h-3 w-3" /> {text}</p>
  );
}
