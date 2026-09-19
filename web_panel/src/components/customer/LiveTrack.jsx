import React, { useEffect, useRef, useState, useCallback } from "react";
import { Navigation, Clock, MapPin, Star, Loader2 } from "lucide-react";
import api from "@/lib/api";
import MapView from "@/components/MapView";
import BookingChat from "@/components/booking/BookingChat";

const ENROUTE = ["assigned", "arrived_shop", "arrived_customer", "started"];

/**
 * Live ETA Sync — shows the customer a real-time distance + arrival countdown
 * once a partner has accepted and is on the way. Polls the booking's /track
 * endpoint every 15s and ticks a smooth second-by-second countdown in between.
 */
export default function LiveTrack({ booking }) {
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);          // forces re-render each second
  const arriveAtRef = useRef(null);             // epoch-ms target arrival time

  const poll = useCallback(async () => {
    if (!booking?.id) return;
    try {
      const { data: d } = await api.get(`/bookings/${booking.id}/track`);
      setData(d);
      if (d && typeof d.eta_minutes === "number" && d.eta_minutes > 0) {
        arriveAtRef.current = Date.now() + d.eta_minutes * 60 * 1000;
      } else if (d && (d.eta_minutes === 0 || ["arrived_customer", "started"].includes(d.status))) {
        arriveAtRef.current = Date.now();
      }
    } catch { /* ignore — keep last known */ }
  }, [booking?.id]);

  // Poll every 15s while the booking is en route.
  useEffect(() => {
    if (!ENROUTE.includes(booking?.status)) return undefined;
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [poll, booking?.status]);

  // 1s heartbeat so the countdown visibly ticks down.
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => (t + 1) % 100000), 1000);
    return () => clearInterval(iv);
  }, []);

  if (!ENROUTE.includes(booking?.status)) return null;
  if (!data) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-2 text-sm text-slate-400" data-testid={`livetrack-loading-${booking.code}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Locating your professional…
      </div>
    );
  }

  const arrived = ["arrived_customer", "started"].includes(data.status) || data.eta_minutes === 0;
  const remainingMs = arrived ? 0 : Math.max(0, (arriveAtRef.current || Date.now()) - Date.now());
  const remMin = Math.floor(remainingMs / 60000);
  const remSec = Math.floor((remainingMs % 60000) / 1000);
  const countdown = arrived ? "Now" : `${remMin}:${String(remSec).padStart(2, "0")}`;
  const dist = data.distance_km;
  const loc = data.partner_location;
  const p = data.partner;

  return (
    <div className="mt-3 rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/20 overflow-hidden" data-testid={`livetrack-${booking.code}`} data-tick={tick}>
      <div className="p-3.5 flex items-center gap-3">
        <div className={`h-12 w-12 rounded-2xl grid place-items-center text-white shrink-0 ${arrived ? "bg-emerald-500" : "bg-primary-600"}`}>
          <Navigation className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-extrabold text-slate-900 dark:text-white leading-tight flex items-center gap-2" data-testid="livetrack-eta-text">
            <span className="relative flex h-2 w-2"><span className={`absolute inline-flex h-full w-full rounded-full ${arrived ? "bg-emerald-400" : "bg-primary-400"} opacity-75 animate-ping`} /><span className={`relative inline-flex h-2 w-2 rounded-full ${arrived ? "bg-emerald-500" : "bg-primary-500"}`} /></span>
            {data.eta_text || (arrived ? "Professional has arrived" : "On the way")}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
            {dist != null && (
              <span className="flex items-center gap-1" data-testid="livetrack-distance"><MapPin className="h-3.5 w-3.5" /> {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`} away</span>
            )}
            {p?.name && <span className="truncate">· {p.name}</span>}
            {p?.rating ? <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {p.rating}</span> : null}
          </p>
        </div>
        {!arrived && (
          <div className="text-right shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-300 flex items-center gap-1 justify-end"><Clock className="h-3 w-3" /> Arriving in</p>
            <p className="text-2xl font-heading font-black text-primary-700 dark:text-primary-200 tabular-nums leading-none" data-testid="livetrack-countdown">{countdown}</p>
          </div>
        )}
        {arrived && (
          <span className="shrink-0 rounded-full bg-emerald-500 text-white text-xs font-bold px-3 py-1" data-testid="livetrack-arrived">Arrived</span>
        )}
      </div>
      {loc && (
        <MapView lat={loc.lat} lng={loc.lng} label={`Partner · ${booking.code}`} height={176} rounded={false} />
      )}

      {/* Chat & Call — available after full payment, once the partner is on the way */}
      <BookingChat booking={booking} role="customer" />
    </div>
  );
}
