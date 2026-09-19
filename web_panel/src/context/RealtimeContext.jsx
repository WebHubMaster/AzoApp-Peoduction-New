import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const RealtimeCtx = createContext(null);

export const RealtimeProvider = ({ children }) => {
  const { user } = useAuth();
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
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const beep = (freq, start, dur) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = "sine"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
      };
      beep(880, 0, 0.28); beep(1174, 0.22, 0.34);
      setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 900);
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
