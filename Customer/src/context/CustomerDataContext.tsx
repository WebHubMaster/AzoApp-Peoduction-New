/** Shared dashboard data — same polling/APIs as CustomerDashboard.jsx root (load every 8s). */
import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { api } from "@/src/api/client";
import { ACTIVE_STATES } from "@/src/components/customer/nav";

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

export const CustomerDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [wallet, setWallet] = useState<{ balance: number; transactions: any[] }>({ balance: 0, transactions: [] });
  const [cfg, setCfg] = useState<any>({ profile_fields: {}, address_config: {} });
  const [categories, setCategories] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [referral, setReferral] = useState<any>({ reward_amount: 100, referee_discount: 100 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get("/bookings").then((r) => setBookings(r || [])).catch(() => {}).finally(() => setLoading(false));
    api.get("/wallet").then((r) => setWallet(r || { balance: 0, transactions: [] })).catch(() => {});
    api.get("/payments/refunds").then((r) => setRefunds(r || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    api.get("/auth/config").then(setCfg).catch(() => {});
    api.get("/catalog/categories").then((r) => setCategories(r || [])).catch(() => {});
    api.get("/catalog/services").then((r) => setServices(r || [])).catch(() => {});
    api.get("/referral/summary").then((r) => setReferral(r || {})).catch(() => {});
  }, []);

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
