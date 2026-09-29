import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { api, getToken, setToken, setForceLogoutHandler } from "@/src/api/client";

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: "partner" | "merchant" | "customer" | "admin" | "agent";
  is_qr_agent?: boolean;
  agent_active?: boolean;
  assigned_batch_ids?: string[];
  photo?: string;
  kyc_status?: string;
  partner_status?: string;
  wallet_balance?: number;
  shop_name?: string;
  shop_type?: string;
  rating?: number;
  jobs_completed?: number;
  partner_code?: string;
  city?: string;
  state?: string;
  verified_partner?: boolean;
  verified_merchant?: boolean;
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
  sessionEndedReason: string | null;
  clearSessionEndedReason: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sessionEndedReason, setSessionEndedReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) {
      setUser(null);
      return null;
    }
    try {
      const me = await api.get<AppUser>("/auth/me");
      setUser(me);
      return me;
    } catch (e: any) {
      // Only drop the session on a genuine 401 — never on transient network/5xx.
      if (e?.status === 401) {
        await setToken(null);
        setUser(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setBooting(false);
    })();
  }, [refresh]);

  // Single-device lock: the API layer calls this when the backend revokes this
  // device's session (a new device registered). Drop to login with a clear reason.
  useEffect(() => {
    setForceLogoutHandler((reason) => {
      setSessionEndedReason(reason || "device_revoked");
      setUser(null);
    });
    return () => setForceLogoutHandler(null);
  }, []);

  const login = useCallback(async (token: string, u: AppUser) => {
    setLoading(true);
    setSessionEndedReason(null);
    await setToken(token);
    setUser(u);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const clearSessionEndedReason = useCallback(() => setSessionEndedReason(null), []);

  return (
    <Ctx.Provider value={{ user, loading, booting, login, logout, refresh, setUser, sessionEndedReason, clearSessionEndedReason }}>
      {children}
    </Ctx.Provider>
  );
};

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
