import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/src/api/client";

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: "customer" | "partner" | "merchant" | "admin" | "agent";
  photo?: string;
  addresses?: any[];
  wallet_balance?: number;
  [k: string]: any;
}

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  booting: boolean;
  login: (token: string, user: AppUser) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<AppUser | null>;
  setUser: (u: AppUser | null) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

/** Only customers may use this app (Partner/Merchant have their own apps). */
export const isCustomer = (u?: AppUser | null) => !!u && u.role === "customer";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) { setUser(null); return null; }
    try {
      const me = await api.get<AppUser>("/auth/me");
      if (!isCustomer(me)) { await setToken(null); setUser(null); return null; }
      setUser(me);
      return me;
    } catch (e: any) {
      // Only drop the session on a genuine 401 — never on transient network/5xx.
      if (e?.status === 401) { await setToken(null); setUser(null); }
      return null;
    }
  }, []);

  useEffect(() => { (async () => { await refresh(); setBooting(false); })(); }, [refresh]);

  const login = useCallback(async (token: string, u: AppUser) => {
    setLoading(true);
    await setToken(token);
    setUser(u);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => { await setToken(null); setUser(null); }, []);

  return <Ctx.Provider value={{ user, loading, booting, login, logout, refresh, setUser }}>{children}</Ctx.Provider>;
};

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
