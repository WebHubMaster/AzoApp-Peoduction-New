import { toast } from "sonner";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const t = localStorage.getItem("azo_token");
    if (!t) { setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      // Only log the user out when the token is genuinely invalid/expired (401).
      // Transient issues (network drop, 5xx) must NOT wipe the saved session —
      // otherwise the user is forced to re-OTP on every hiccup.
      if (e?.response?.status === 401) {
        localStorage.removeItem("azo_token");
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => {
    const onRevoked = (ev) => {
      localStorage.removeItem("azo_token");
      setUser(null);
      toast.error(ev.detail || "You've been logged out because this account was logged in on another device.", { duration: 8000 });
    };
    window.addEventListener("azo:session-revoked", onRevoked);
    return () => window.removeEventListener("azo:session-revoked", onRevoked);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const check = () => { if (localStorage.getItem("azo_token")) api.get("/auth/me").catch(() => {}); };
    const id = setInterval(check, 20000);
    window.addEventListener("focus", check);
    return () => { clearInterval(id); window.removeEventListener("focus", check); };
  }, [user]);

  const login = (token, u) => {
    localStorage.setItem("azo_token", token);
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem("azo_token");
    setUser(null);
  };
  const refresh = loadMe;

  return (
    <AuthCtx.Provider value={{ user, setUser, login, logout, loading, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);
