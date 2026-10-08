import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { isChatOpen } from "@/lib/chatPresence";

const RealtimeCtx = createContext(null);

export const RealtimeProvider = ({ children }) => {
  const { user, refresh } = useAuth();
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState({ enabled: true, sound: true, browser_notifications: true });
  const listeners = useRef(new Set());
  const esRef = useRef(null);
  const openedOnce = useRef(false);

  const subscribe = useCallback((typeOrCb, maybeCb) => {
    // subscribe(cb) → every event; subscribe("type", cb) → cb(ev.data) for that type only
    const cb = typeof typeOrCb === "function"
      ? typeOrCb
      : (ev) => { if (ev && ev.type === typeOrCb && typeof maybeCb === "function") maybeCb(ev.data, ev); };
    listeners.current.add(cb);
    return () => listeners.current.delete(cb);
  }, []);

  const dispatch = useCallback((ev) => {
    listeners.current.forEach((cb) => { try { cb(ev); } catch { /* ignore */ } });
  }, []);

  // Admin approved this partner/merchant → reload the profile; the panel gate swaps to the dashboard.
  useEffect(() => subscribe("notification", (d) => {
    if (d?.type !== "account_approved") return;
    Promise.resolve(refresh?.()).then(() => {
      const home = d.role === "merchant" ? "/merchant" : d.role === "partner" ? "/partner" : null;
      const base = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
      if (home && !window.location.pathname.startsWith(base + home)) window.location.assign(base + home);
    });
  }), [subscribe, refresh]);

  // load realtime config (admin-controlled via Integration Center)
  const refreshConfig = useCallback(() => {
    return api.get("/realtime/config").then((r) => setConfig(r.data)).catch(() => {});
  }, []);
  useEffect(() => { if (user) refreshConfig(); }, [user, refreshConfig]);

  // open the SSE connection while logged in
  useEffect(() => {
    if (!user || config.enabled === false) { return undefined; }
    const token = localStorage.getItem("azo_token");
    if (!token) return undefined;
    openedOnce.current = false;
    const es = new EventSource(`${API}/realtime/stream?token=${encodeURIComponent(token)}`);
    esRef.current = es;
    es.onopen = () => {
      setConnected(true);
      // On reconnect, tell listeners to re-sync latest server state.
      if (openedOnce.current) dispatch({ type: "__resync__", data: {} });
      openedOnce.current = true;
    };
    es.onmessage = (e) => {
      try { dispatch(JSON.parse(e.data)); } catch { /* ignore keepalives */ }
    };
    es.onerror = () => { setConnected(false); /* EventSource auto-reconnects */ };
    return () => { es.close(); esRef.current = null; setConnected(false); };
  }, [user, config.enabled, dispatch]);

  // ---- sound alert (Web Audio, no asset needed) ----
  const playSound = useCallback(() => {
    if (!config.sound) return;
    // Stay silent while the user is actually viewing a chat screen — they can
    // already see the message. The pleasant chime only plays when NOT in a chat.
    if (isChatOpen()) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      // Soft master envelope for a gentle, premium bell-like chime.
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const note = (freq, start, dur, type = "sine", gain = 0.4) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        o.connect(g); g.connect(master);
        g.gain.setValueAtTime(0.0001, now + start);
        g.gain.exponentialRampToValueAtTime(gain, now + start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        o.start(now + start); o.stop(now + start + dur + 0.04);
      };
      // Friendly ascending two-note chime (E5 → B5) with a soft shimmer harmonic.
      note(659.25, 0.00, 0.55, "sine", 0.45);     // E5
      note(987.77, 0.13, 0.70, "sine", 0.40);     // B5
      note(1318.51, 0.13, 0.55, "triangle", 0.10); // soft shimmer
      setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1400);
    } catch { /* ignore */ }
  }, [config.sound]);

  // ---- browser notification ----
  // Permission is asked through the shared PushRegistrar popup (needs a user gesture);
  // calling the native prompt on page load is ignored by browsers, so this is a no-op
  // when permission is still "default" — the popup takes over.
  const requestPermission = useCallback(() => {
    try {
      if ("Notification" in window && Notification.permission === "default") { /* handled by PushRegistrar popup */ }
    } catch { /* ignore */ }
  }, []);

  const browserNotify = useCallback((title, body) => {
    if (!config.browser_notifications) return;
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    } catch { /* ignore */ }
  }, [config.browser_notifications]);

  const value = { connected, config, setConfig, refreshConfig, subscribe, playSound, browserNotify, requestPermission };
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
};

export const useRealtime = () => useContext(RealtimeCtx) || {
  connected: false, config: {}, subscribe: () => () => {}, playSound: () => {},
  browserNotify: () => {}, requestPermission: () => {}, refreshConfig: () => {},
};

/* Convenience: subscribe to a single event type for the component's lifetime. */
export const useRealtimeEvent = (handler, deps = []) => {
  const { subscribe } = useRealtime();
  useEffect(() => subscribe(handler), [subscribe, ...deps]); // eslint-disable-line
};
