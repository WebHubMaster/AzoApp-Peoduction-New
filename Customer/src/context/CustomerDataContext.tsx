/** Shared dashboard data for the Customer app.
 *  Near-real-time job status: bookings are polled on a short adaptive interval
 *  (every 3s while a job is active, 6s otherwise) AND refreshed instantly when the
 *  backend pushes a live `booking_update` / `booking_confirmed` over SSE — so a
 *  partner completing a job shows up on the customer side within ~1s. Heavier
 *  wallet/refunds data is polled on a slower cadence. */
import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/src/api/client";
import { ACTIVE_STATES } from "@/src/components/customer/nav";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useRawLocation } from "@/src/lib/location";

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
const POLL_ACTIVE_MS = 3000;   // a job is in flight → check every 3s
const POLL_IDLE_MS = 6000;     // nothing active → gentler cadence
const AUX_POLL_MS = 20000;     // wallet + refunds rarely change → slow poll

export const CustomerDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { subscribe } = useRealtime();
  const [bookings, setBookings] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [wallet, setWallet] = useState<{ balance: number; transactions: any[] }>({ balance: 0, transactions: [] });
  const [cfg, setCfg] = useState<any>({ profile_fields: {}, address_config: {} });
  const [categories, setCategories] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [referral, setReferral] = useState<any>({ reward_amount: 100, referee_discount: 100 });
  const [loading, setLoading] = useState(true);

  // Fast path: just the bookings list (drives the live job status).
  const loadBookings = useCallback(() => {
    api.get("/bookings").then((r) => setBookings(r || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  // Slow path: wallet + refunds.
  const loadAux = useCallback(() => {
    api.get("/wallet").then((r) => setWallet(r || { balance: 0, transactions: [] })).catch(() => {});
    api.get("/payments/refunds").then((r) => setRefunds(r || [])).catch(() => {});
  }, []);
  const load = useCallback(() => { loadBookings(); loadAux(); }, [loadBookings, loadAux]);

  // Adaptive bookings poll — speeds up while any job is active.
  const hasActiveRef = useRef(false);
  hasActiveRef.current = bookings.some((b) => ACTIVE_STATES.includes(b.status));
  useEffect(() => {
    loadBookings();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      loadBookings();
      timer = setTimeout(tick, hasActiveRef.current ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    };
    timer = setTimeout(tick, hasActiveRef.current ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => clearTimeout(timer);
  }, [loadBookings]);

  // Slow poll for wallet/refunds.
  useEffect(() => { loadAux(); const t = setInterval(loadAux, AUX_POLL_MS); return () => clearInterval(t); }, [loadAux]);

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
    api.get("/catalog/categories").then((r) => setCategories(r || [])).catch(() => {});
    api.get("/catalog/services").then((r) => setServices(r || [])).catch(() => {});
    api.get("/referral/summary").then((r) => setReferral(r || {})).catch(() => {});
  }, [cityKey]);

  const activeCount = bookings.filter((b) => ACTIVE_STATES.includes(b.status)).length;

  return (
    <Ctx.Provider value={{ bookings, refunds, wallet, cfg, categories, services, referral, loading, activeCount, load }}>
      {children}
    </Ctx.Provider>
  );
};

export function useCustomerData(): Data {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCustomerData must be used within CustomerDataProvider");
  return c;
}
