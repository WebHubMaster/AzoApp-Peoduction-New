/** Shared dashboard data for the Customer app.
 *  Near-real-time job status: bookings are polled on a short adaptive interval
 *  (every 3s while a job is active, 6s otherwise) AND refreshed instantly when the
 *  backend pushes a live `booking_update` / `booking_confirmed` over SSE — so a
 *  partner completing a job shows up on the customer side within ~1s. Heavier
 *  wallet/refunds data is polled on a slower cadence. */
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "@/src/api/client";
import { ACTIVE_STATES } from "@/src/components/customer/nav";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useRawLocation } from "@/src/lib/location";
import { useAuth } from "@/src/context/AuthContext";
import { storage } from "@/src/utils/storage";

interface Data {
  bookings: any[];
  refunds: any[];
  wallet: { balance: number; transactions: any[] };
  cfg: any;
  categories: any[];
  services: any[];
  referral: any;
  loading: boolean;
  activeCount: number;
  load: () => void;
}

const Ctx = createContext<Data | null>(null);

// How often to poll /bookings for status changes.
const POLL_ACTIVE_MS = 5000;   // a job is in flight (SSE already pushes changes instantly)
const POLL_IDLE_MS = 15000;    // nothing active → gentler cadence
const AUX_POLL_MS = 30000;     // wallet + refunds rarely change → slow poll

const isActive = () => AppState.currentState === "active";
// Only update state when the payload actually changed → no needless app-wide re-renders on each poll.
function useStableState<T>(init: T) {
  const [v, setV] = useState<T>(init);
  const last = useRef("");
  const set = useCallback((next: T) => {
    const k = JSON.stringify(next);
    if (k !== last.current) { last.current = k; setV(next); }
  }, []);
  return [v, set] as const;
}

export const CustomerDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { subscribe } = useRealtime();
  const [bookings, setBookings] = useStableState<any[]>([]);
  const [refunds, setRefunds] = useStableState<any[]>([]);
  const [wallet, setWallet] = useStableState<{ balance: number; transactions: any[] }>({ balance: 0, transactions: [] });
  const [cfg, setCfg] = useState<any>({ profile_fields: {}, address_config: {} });
  const [categories, setCategories] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [referral, setReferral] = useState<any>({ reward_amount: 100, referee_discount: 100 });
  const [loading, setLoading] = useState(true);

  // Instant Home: show the last saved dashboard immediately, then refresh from the network.
  const { user } = useAuth();
  const cacheKey = user?.id ? `cust_home_cache_v1_${user.id}` : "";
  const fresh = useRef({ bookings: false, aux: false, catalog: false, referral: false });
  useEffect(() => {
    if (!cacheKey) return;
    storage.getItem(cacheKey).then((raw) => {
      if (!raw) return;
      try {
        const c = JSON.parse(raw);
        if (!fresh.current.bookings && c.bookings) { setBookings(c.bookings); setLoading(false); }
        if (!fresh.current.aux) { if (c.wallet) setWallet(c.wallet); if (c.refunds) setRefunds(c.refunds); }
        if (!fresh.current.catalog) { if (c.categories) setCategories(c.categories); if (c.services) setServices(c.services); if (c.cfg) setCfg(c.cfg); }
        if (!fresh.current.referral && c.referral) setReferral(c.referral);
      } catch { /* corrupt cache → ignore */ }
    });
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fast path: just the bookings list (drives the live job status).
  const loadBookings = useCallback(() => {
    api.get("/bookings").then((r) => { fresh.current.bookings = true; setBookings(r || []); }).catch(() => {}).finally(() => setLoading(false));
  }, [setBookings]);
  // Slow path: wallet + refunds.
  const loadAux = useCallback(() => {
    api.get("/wallet").then((r) => { fresh.current.aux = true; setWallet(r || { balance: 0, transactions: [] }); }).catch(() => {});
    api.get("/payments/refunds").then((r) => setRefunds(r || [])).catch(() => {});
  }, [setWallet, setRefunds]);
  const load = useCallback(() => { loadBookings(); loadAux(); }, [loadBookings, loadAux]);

  // Adaptive bookings poll — speeds up while any job is active.
  const hasActiveRef = useRef(false);
  hasActiveRef.current = bookings.some((b) => ACTIVE_STATES.includes(b.status));
  useEffect(() => {
    loadBookings();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (isActive()) loadBookings();
      timer = setTimeout(tick, hasActiveRef.current ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    };
    timer = setTimeout(tick, hasActiveRef.current ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    // Instant catch-up when the app returns to the foreground.
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") { loadBookings(); loadAux(); } });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [loadBookings, loadAux]);

  // Slow poll for wallet/refunds.
  useEffect(() => { loadAux(); const t = setInterval(() => { if (isActive()) loadAux(); }, AUX_POLL_MS); return () => clearInterval(t); }, [loadAux]);

  // Instant refresh when the backend pushes a live booking update (job completed,
  // confirmed, reschedule resolved) or after an SSE reconnect resync.
  useEffect(() => {
    const unsub = subscribe((ev) => {
      if (["booking_update", "booking_confirmed", "booking_completed", "reschedule_resolved", "__resync__"].includes(ev?.type)) {
        loadBookings();
      }
    });
    return unsub;
  }, [subscribe, loadBookings]);

  const cityKey = useRawLocation();
  useEffect(() => {
    api.get("/auth/config").then(setCfg).catch(() => {});
    api.get("/catalog/categories").then((r) => { fresh.current.catalog = true; setCategories(r || []); }).catch(() => {});
    api.get("/catalog/services").then((r) => { fresh.current.catalog = true; setServices(r || []); }).catch(() => {});
    api.get("/referral/summary").then((r) => { fresh.current.referral = true; setReferral(r || {}); }).catch(() => {});
  }, [cityKey]);

  // Save a snapshot (debounced) once real data has arrived.
  useEffect(() => {
    if (!cacheKey || !fresh.current.bookings) return;
    const t = setTimeout(() => {
      storage.setItem(cacheKey, JSON.stringify({ bookings: bookings.slice(0, 100), wallet: { ...wallet, transactions: (wallet?.transactions || []).slice(0, 20) }, refunds: refunds.slice(0, 50), cfg, categories, services, referral }));
    }, 1000);
    return () => clearTimeout(t);
  }, [cacheKey, bookings, wallet, refunds, cfg, categories, services, referral]);

  const activeCount = useMemo(() => bookings.filter((b) => ACTIVE_STATES.includes(b.status)).length, [bookings]);
  const value = useMemo(() => ({ bookings, refunds, wallet, cfg, categories, services, referral, loading, activeCount, load }),
    [bookings, refunds, wallet, cfg, categories, services, referral, loading, activeCount, load]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
};

export function useCustomerData(): Data {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCustomerData must be used within CustomerDataProvider");
  return c;
}
