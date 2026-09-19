import React, { useEffect, useState, useCallback } from "react";
import { Bell, History, RefreshCw, Trash2, Zap, MapPin, Flame, Award, Coffee, Clock, Gift } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { toast } from "sonner";
import TestRingCard from "@/components/partner/TestRingCard";
import {
  getRingPrefs, getMissed, removeMissed, syncPrefsFromServer,
  setSnooze, clearSnooze, isSnoozed, snoozeRemainingMs,
} from "@/lib/ringPrefs";

const streakBadge = (s) => {
  if (s >= 10) return { label: "Unstoppable", cls: "from-fuchsia-500 to-pink-500" };
  if (s >= 5) return { label: "On Fire", cls: "from-orange-500 to-red-500" };
  if (s >= 3) return { label: "Warming Up", cls: "from-amber-400 to-orange-400" };
  return { label: "Start a streak", cls: "from-slate-400 to-slate-500" };
};

export default function PartnerAlertsPanel() {
  const [, setPrefs] = useState(getRingPrefs());
  const [missed, setMissed] = useState(getMissed());
  const [stats, setStats] = useState(null);
  const [snoozeMs, setSnoozeMs] = useState(snoozeRemainingMs());

  // Live-tick the Smart Snooze countdown every second.
  useEffect(() => {
    const iv = setInterval(() => setSnoozeMs(snoozeRemainingMs()), 1000);
    return () => clearInterval(iv);
  }, []);

  const fmtCountdown = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  const startSnooze = useCallback((mins) => {
    setPrefs(setSnooze(mins));
    setSnoozeMs(snoozeRemainingMs());
    toast.success(`Snoozed for ${mins} min`, { description: "Non-emergency requests are muted. Your streak is safe." });
  }, []);

  const stopSnooze = useCallback(() => {
    setPrefs(clearSnooze());
    setSnoozeMs(0);
    toast("Back online", { description: "You'll ring for new job requests again." });
  }, []);

  const loadStats = useCallback(() => {
    api.get("/partner/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    syncPrefsFromServer().then(setPrefs).catch(() => {});
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const onMissed = (e) => { setMissed(e.detail || getMissed()); loadStats(); };
    const onPrefs = (e) => setPrefs(e.detail || getRingPrefs());
    const onFocus = () => loadStats();
    window.addEventListener("azo-missed", onMissed);
    window.addEventListener("azo-ring-prefs", onPrefs);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("azo-missed", onMissed);
      window.removeEventListener("azo-ring-prefs", onPrefs);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadStats]);

  const regrab = useCallback(async (job) => {
    try {
      const { data } = await api.get("/bookings/partner/jobs");
      const raw = (data || []).find((j) => j.id === job.id);
      if (!raw) { toast("This request is no longer available"); removeMissed(job.id); return; }
      const norm = {
        id: raw.id, code: raw.code, service_name: raw.service_name, category_name: raw.category_name,
        service_image: (raw.items && raw.items[0] && raw.items[0].image) || raw.image || "",
        city: (raw.address && raw.address.city) || "", address_line: (raw.address && raw.address.line) || "",
        schedule_type: raw.schedule_type || "", total: (raw.pricing && raw.pricing.total) != null ? raw.pricing.total : "",
      };
      window.dispatchEvent(new CustomEvent("azo-open-ring", { detail: norm }));
      removeMissed(job.id);
    } catch { toast.error("Could not re-open the request"); }
  }, []);

  return (
    <div className="space-y-4" data-testid="partner-alerts-panel">
      <TestRingCard />
      {/* Smart Snooze — "busy for a bit" without breaking your streak */}
      <div className={`rounded-2xl border shadow-card p-4 sm:p-5 ${snoozeMs > 0
        ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700"
        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`} data-testid="snooze-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={`h-11 w-11 rounded-xl grid place-items-center ${snoozeMs > 0 ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
              <Coffee className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-heading font-bold text-slate-900 dark:text-white leading-tight">
                {snoozeMs > 0 ? "You're on a break" : "Smart Snooze"}
              </h3>
              {snoozeMs > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Muted for <b className="tabular-nums" data-testid="snooze-countdown">{fmtCountdown(snoozeMs)}</b> · streak safe
                </p>
              ) : (
                <p className="text-xs text-slate-400">Mute new requests for a bit — your streak stays safe.</p>
              )}
            </div>
          </div>
          {snoozeMs > 0 ? (
            <button data-testid="snooze-resume" onClick={stopSnooze}
              className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">
              Resume now
            </button>
          ) : (
            <div className="flex gap-2">
              <button data-testid="snooze-30" onClick={() => startSnooze(30)}
                className="h-10 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold">Busy 30 min</button>
              <button data-testid="snooze-60" onClick={() => startSnooze(60)}
                className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800">1 hour</button>
            </div>
          )}
        </div>
        {snoozeMs > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-300/80 mt-2">Emergency bookings will still ring through.</p>
        )}
      </div>

      {/* Streak + weekly insights */}
      {stats && (() => {
        const badge = streakBadge(stats.accept_streak || 0);
        const tot = (stats.accepted_week || 0) + (stats.missed_week || 0);
        const acceptPct = tot ? Math.round((stats.accepted_week / tot) * 100) : 0;
        return (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card p-5" data-testid="partner-streak-card">
            <div className="grid sm:grid-cols-3 gap-4 items-center">
              <div className="flex items-center gap-3">
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${badge.cls} text-white flex items-center justify-center shadow-lg`}>
                  <Flame className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Accept Streak</p>
                  <p className="text-2xl font-heading font-extrabold text-slate-900 dark:text-white leading-none" data-testid="streak-count">{stats.accept_streak || 0}</p>
                  <span className={`mt-1 inline-block rounded-full bg-gradient-to-r ${badge.cls} text-white text-[10px] font-bold px-2 py-0.5`}>{badge.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-11 w-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center"><Award className="h-5 w-5" /></span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Best Streak</p>
                  <p className="text-xl font-heading font-extrabold text-slate-900 dark:text-white">{stats.best_streak || 0}</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">This week</p>
                <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${acceptPct}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${100 - acceptPct}%` }} />
                </div>
                <div className="flex justify-between mt-1.5 text-xs">
                  <span className="text-emerald-600 font-semibold" data-testid="week-accepted">✓ {stats.accepted_week || 0} accepted</span>
                  <span className="text-amber-600 font-semibold" data-testid="week-missed">✗ {stats.missed_week || 0} missed</span>
                </div>
              </div>
            </div>

            {/* Reward Payouts — accept-streak milestone → cashable wallet bonus */}
            {stats.reward?.enabled && (() => {
              const rw = stats.reward;
              return (
                <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 p-3.5" data-testid="reward-payout">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                      <Gift className="h-4 w-4" /> Streak reward · {fmt(rw.bonus)} every {rw.threshold} in a row
                    </p>
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-white/70 dark:bg-emerald-900/40 rounded-full px-2 py-0.5" data-testid="reward-earned">
                      Earned {fmt(rw.total_earned || 0)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-emerald-100 dark:bg-emerald-950 overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${rw.progress_pct || 0}%` }} data-testid="reward-progress" />
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1.5">
                    {rw.remaining > 0
                      ? <>Accept <b>{rw.remaining}</b> more in a row to earn <b>{fmt(rw.bonus)}</b> — added straight to your withdrawable wallet.</>
                      : <>Milestone reached! Keep the streak alive for the next {fmt(rw.bonus)}.</>}
                  </p>
                </div>
              );
            })()}
          </div>
        );
      })()}

      <div className="grid gap-4">
      {/* Missed requests */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center"><History className="h-5 w-5" /></span>
            <div>
              <h3 className="font-heading font-bold text-slate-900 dark:text-white leading-tight">Missed Requests</h3>
              <p className="text-xs text-slate-400">Jobs you did not answer in time</p>
            </div>
          </div>
          {missed.length > 0 && (
            <button data-testid="missed-clear" onClick={() => { missed.forEach((m) => removeMissed(m.id)); }} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
          )}
        </div>

        {missed.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No missed requests. Stay online to catch every job!</div>
        ) : (
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto no-scrollbar">
            {missed.map((m) => (
              <div key={m.id} data-testid={`missed-${m.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5">
                {m.service_image
                  ? <img src={m.service_image} alt="" className="h-11 w-11 rounded-lg object-cover shrink-0" />
                  : <span className="h-11 w-11 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-400"><Bell className="h-5 w-5" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-800 dark:text-white truncate flex items-center gap-1.5">
                    {m.service_name || "Service request"}
                    {m.schedule_type === "emergency" && <Zap className="h-3.5 w-3.5 text-red-500" />}
                  </p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate"><MapPin className="h-3 w-3" /> {m.address_line || m.city || "—"}{m.total ? ` · ₹${m.total}` : ""}</p>
                </div>
                <button data-testid={`regrab-${m.id}`} onClick={() => regrab(m)}
                  className="shrink-0 h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Re-grab
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
