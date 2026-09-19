import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Check, X, ArrowRight, Calendar, Clock } from "lucide-react";
import api from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import { getRingPrefs, TONES, playCustomSound, stopCustomSound, syncPrefsFromServer } from "@/lib/ringPrefs";
import { toast } from "sonner";

/**
 * SINGLE, premium, full-screen reschedule-request alert (spec) for BOTH parties.
 * This is the ONLY reschedule modal in the app — <ScheduleAlerts/> no longer renders
 * one (that was the duplicate popup/backdrop). The receiving party gets a push + a
 * looping ring alert that REUSES the same admin-configured ring sound as the Job
 * Alert ring. Shows requester name, service, Booking ID, OLD time and the NEW
 * proposed time with Accept / Reject. Backend enforces idempotent accept/reject and
 * the Accept/Reject buttons are single-flight (no duplicate API / state / sound).
 */
export default function RescheduleRing({ onResolved }) {
  const { subscribe } = useRealtime();
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const handledRef = useRef(new Set());
  const ring = useRef({ ctx: null, timer: null, customPlaying: false });

  const current = queue[0] || null;

  /* ------------------------- ringtone engine (same as job ring) ------------------------- */
  const ensureCtx = useCallback(() => {
    const r = ring.current;
    if (!r.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) r.ctx = new AC();
    }
    if (r.ctx && r.ctx.state === "suspended") r.ctx.resume().catch(() => {});
    return r.ctx;
  }, []);

  const ringOnce = useCallback((ctx, prefs) => {
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, prefs.volume != null ? prefs.volume : 0.7));
    const pattern = TONES[prefs.tone] || TONES.classic;
    pattern.forEach(({ f, t }) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(vol, now + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.42);
      o.start(now + t); o.stop(now + t + 0.46);
    });
  }, []);

  const startRing = useCallback(() => {
    const r = ring.current;
    if (r.timer || r.customPlaying) return;
    const prefs = getRingPrefs();
    const vibrate = () => { try { if (navigator.vibrate) navigator.vibrate([400, 180, 400]); } catch { /* ignore */ } };
    if (prefs.customSoundUrl) {
      playCustomSound(prefs.customSoundUrl, prefs.volume, true);
      r.customPlaying = true;
      vibrate();
      r.timer = setInterval(vibrate, 1700);
    } else {
      const beat = () => {
        const ctx = ensureCtx();
        try { if (ctx) ringOnce(ctx, getRingPrefs()); } catch { /* ignore */ }
        vibrate();
      };
      beat();
      r.timer = setInterval(beat, 1700);
    }
  }, [ensureCtx, ringOnce]);

  const stopRing = useCallback(() => {
    const r = ring.current;
    if (r.timer) { clearInterval(r.timer); r.timer = null; }
    r.customPlaying = false;
    stopCustomSound();
    try { if (navigator.vibrate) navigator.vibrate(0); } catch { /* ignore */ }
  }, []);

  useEffect(() => { syncPrefsFromServer().catch(() => {}); }, []);

  useEffect(() => {
    const prime = () => ensureCtx();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, [ensureCtx]);

  useEffect(() => {
    if (current) startRing(); else stopRing();
    return () => stopRing();
  }, [current, startRing, stopRing]);

  // Lock body scroll while the modal is open (no background scroll leakage).
  useEffect(() => {
    if (!current) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [current]);

  /* ------------------------- queue ------------------------- */
  const enqueue = useCallback((req) => {
    if (!req || !req.booking_id) return;
    const key = req.request_id || req.booking_id;
    if (handledRef.current.has(key)) return;
    setQueue((q) => (q.find((x) => (x.request_id || x.booking_id) === key) ? q : [...q, req]));
  }, []);

  const dequeue = useCallback((key) => {
    setQueue((q) => q.filter((x) => (x.request_id || x.booking_id) !== key));
  }, []);

  // Realtime: incoming reschedule requests + resolutions/cancellations that clear them.
  useEffect(() => subscribe((ev) => {
    if (ev.type === "reschedule_request") enqueue(ev.data || {});
    else if (ev.type === "reschedule_resolved" || ev.type === "reschedule_cancelled") {
      const d = ev.data || {};
      const key = d.request_id || d.booking_id;
      if (key) { handledRef.current.add(key); dequeue(key); }
    }
  }), [subscribe, enqueue, dequeue]);

  const respond = useCallback(async (req, action) => {
    if (!req || busy) return;                 // single-flight guard: blocks double-click
    setBusy(true);
    const key = req.request_id || req.booking_id;
    try {
      await api.post(`/bookings/${req.booking_id}/reschedule/respond`, { action });
      handledRef.current.add(key);
      stopRing();                              // stop sound immediately on success
      dequeue(key);                            // close modal
      toast[action === "accept" ? "success" : "message"](
        action === "accept" ? "New schedule confirmed" : "Reschedule request rejected",
        { description: req.service_name || "" });
      onResolved?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Could not respond — the request may have expired.";
      toast.error(msg);
      handledRef.current.add(key);
      stopRing();
      dequeue(key);
    } finally { setBusy(false); }
  }, [busy, stopRing, dequeue, onResolved]);

  if (!current) return null;

  const whoLabel = current.requester_role === "partner" ? "Partner" : "Customer";
  const oldDate = current.old_date || (current.old_label || "").split(" ").slice(0, 3).join(" ") || "—";
  const oldTime = current.old_time || (current.old_label || "").split(" ").slice(3).join(" ") || "";
  const newDate = current.new_date || (current.new_label || "").split(" ").slice(0, 3).join(" ") || "—";
  const newTime = current.new_time || (current.new_label || "").split(" ").slice(3).join(" ") || "";
  const code = current.code ? (current.code.startsWith("#") ? current.code : `#${current.code}`) : "";

  return createPortal(
    // SINGLE full-viewport overlay + SINGLE backdrop. High z-index above every panel.
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      data-testid="reschedule-ring"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header — brand theme colour */}
        <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white px-6 py-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-white/20 grid place-items-center mb-2 animate-pulse">
            <CalendarClock className="h-7 w-7" />
          </div>
          <p className="uppercase tracking-[0.25em] text-[11px] text-white/80">Reschedule Request</p>
          <h2 className="font-heading font-black text-2xl mt-1" data-testid="reschedule-who">{whoLabel}: {current.requester_name || whoLabel}</h2>
          {current.service_name && (
            <p className="text-white/90 mt-0.5 font-semibold">{current.service_name}</p>
          )}
          {code && <p className="text-white/70 text-[12.5px] mt-0.5" data-testid="reschedule-code">Booking {code}</p>}
        </div>

        <div className="px-6 py-6">
          <div className="flex items-stretch justify-between gap-3">
            <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 text-center">
              <p className="text-[10.5px] uppercase tracking-wider text-slate-400 font-bold">Old Time</p>
              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200 mt-1.5 flex items-center justify-center gap-1"><Calendar className="h-3.5 w-3.5" /> {oldDate}</p>
              {oldTime && <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1" data-testid="reschedule-old"><Clock className="h-3.5 w-3.5" /> {oldTime}</p>}
            </div>
            <div className="self-center"><ArrowRight className="h-5 w-5 text-slate-400 shrink-0" /></div>
            <div className="flex-1 rounded-2xl border-2 border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20 p-3 text-center">
              <p className="text-[10.5px] uppercase tracking-wider text-primary-600 dark:text-primary-300 font-bold">New Time</p>
              <p className="text-[13px] font-extrabold text-primary-700 dark:text-primary-200 mt-1.5 flex items-center justify-center gap-1"><Calendar className="h-3.5 w-3.5" /> {newDate}</p>
              {newTime && <p className="text-[13px] font-extrabold text-primary-700 dark:text-primary-200 flex items-center justify-center gap-1" data-testid="reschedule-new"><Clock className="h-3.5 w-3.5" /> {newTime}</p>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button data-testid="reschedule-reject" onClick={() => respond(current, "reject")} disabled={busy}
              className="h-12 rounded-xl border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition">
              <X className="h-5 w-5" /> Reject
            </button>
            <button data-testid="reschedule-accept" onClick={() => respond(current, "accept")} disabled={busy}
              className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition">
              {busy ? <span className="h-5 w-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> : <Check className="h-5 w-5" />} Accept
            </button>
          </div>
          <p className="text-center text-slate-400 text-[11px] mt-3">The booking time changes only after you Accept.</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
