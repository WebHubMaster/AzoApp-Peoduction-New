import React, { useCallback, useEffect, useState } from "react";
import { Radar, BellRing, Eye, Clock, MapPin, Users, ShieldCheck, Navigation } from "lucide-react";
import api from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";

const fmtElapsed = (s) => {
  if (s == null) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
};

/** Cab-app style live search status for a customer's SEARCHING booking. */
export default function SearchingStatus({ booking, onAssigned }) {
  const { subscribe } = useRealtime();
  const [st, setSt] = useState(null);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => {
    api.get(`/bookings/${booking.id}/dispatch-status`).then((r) => {
      setSt(r.data ? { ...r.data, _fetchedAt: Date.now() } : r.data);
      if (r.data && !r.data.searching) onAssigned?.(r.data);
    }).catch(() => {});
  }, [booking.id, onAssigned]);

  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [load]);
  useEffect(() => subscribe((ev) => {
    if (ev?.type === "booking_update" && ev.data?.id === booking.id) load();
    if (ev?.type === "__resync__") load();
  }), [subscribe, booking.id, load]);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(iv); }, []);

  if (!st) return null;
  // elapsed = server value at fetch time + wall-clock seconds since that fetch (no double counting)
  const elapsed = st.elapsed_sec != null ? st.elapsed_sec + Math.floor((Date.now() - st._fetchedAt) / 1000) : null;
  void tick;
  const waves = Math.max(1, Math.min(st.max_waves || 1, 6));
  const headline = st.exhausted && st.ringing_now === 0
    ? "All nearby pros are busy right now"
    : st.ringing_now > 0 ? `Ringing ${st.ringing_now} pro${st.ringing_now > 1 ? "s" : ""} near you…` : "Searching for a partner…";

  return (
    <div data-testid={`searching-status-${booking.code}`} className="mt-3 rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-sky-50 p-4 overflow-hidden relative">
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 grid place-items-center">
          <span className="absolute inset-0 rounded-full bg-primary-400/20 animate-ping" />
          <span className="absolute inset-1.5 rounded-full bg-primary-400/20 animate-pulse" />
          <span className="relative h-9 w-9 rounded-full bg-primary-600 text-white grid place-items-center"><Radar className="h-5 w-5" /></span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-slate-900 text-sm" data-testid="searching-headline">{headline}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-700" data-testid="searching-eligible"><Users className="h-3 w-3" /> {st.eligible} pros in area</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-700" data-testid="searching-rung"><BellRing className="h-3 w-3 text-primary-600" /> {st.rung} rung</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-700" data-testid="searching-seen"><Eye className="h-3 w-3 text-sky-600" /> {st.seen} seen</span>
            {st.nearest_eta_min != null && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-700"><Navigation className="h-3 w-3" /> nearest ~{st.nearest_eta_min} min away</span>}
            {st.nearby_expanded && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-violet-700"><MapPin className="h-3 w-3" /> expanded to nearby areas</span>}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5" title={`Search wave ${st.wave} of ${st.max_waves}`}>
            {Array.from({ length: waves }).map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < st.wave ? "bg-primary-500" : i === st.wave ? "bg-primary-300 animate-pulse" : "bg-slate-200"}`} />
            ))}
            <span className="text-[10px] text-slate-500 ml-1 tabular-nums" data-testid="searching-wave">wave {st.wave}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Searching for {fmtElapsed(elapsed)}</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-600" /> Your booking stays confirmed</span>
          </div>
          {st.exhausted && st.ringing_now === 0 && (
            <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" data-testid="searching-manual-note">
              Our team has been alerted and is assigning a partner manually. We&apos;ll notify you the moment someone accepts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
