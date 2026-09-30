import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import EventSource from "react-native-sse";
import { setAudioModeAsync } from "expo-audio";
import { API_BASE, getToken } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { startRingSound, stopRingSound, syncAlertConfig } from "@/src/lib/notifications";
import { startBackgroundAlertListener, stopBackgroundAlertListener } from "@/src/lib/backgroundRing";

/**
 * Live realtime over Server-Sent Events for the Customer app — mirrors the Partner
 * RealtimeContext. Backend: GET /api/realtime/stream?token=JWT → `data: {type,data,ts}`
 * frames. Reconnects with backoff; on reconnect fires a synthetic `__resync__`.
 * `playRing()/stopRing()` loop the call-style alert sound for the reschedule overlay.
 */
export type RtEvent = { type: string; data?: any; ts?: string };
type Listener = (ev: RtEvent) => void;

type RtCtx = {
  connected: boolean;
  subscribe: (cb: Listener) => () => void;
  playRing: () => void;
  stopRing: () => void;
};

const Ctx = createContext<RtCtx>({ connected: false, subscribe: () => () => {}, playRing: () => {}, stopRing: () => {} });

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
  }, []);

  // Keep the admin-configured ring tone in sync whenever a customer is signed in.
  useEffect(() => { if (user) syncAlertConfig().catch(() => {}); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback((ev: RtEvent) => { listeners.current.forEach((cb) => { try { cb(ev); } catch { /* ignore */ } }); }, []);

  const close = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (esRef.current) { esRef.current.removeAllEventListeners(); esRef.current.close(); esRef.current = null; }
    setConnected(false);
  }, []);

  const connectRef = useRef<() => void>(() => {});
  const connect = useCallback(async () => {
    close();
    const token = await getToken();
    if (!token || !user) return;
    const es = new EventSource<"ready">(`${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`, { pollingInterval: 0 });
    esRef.current = es;
    es.addEventListener("open", () => { setConnected(true); if (retryRef.current > 0) emit({ type: "__resync__" }); retryRef.current = 0; });
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("message", (e: any) => {
      if (!e?.data) return;
      try { emit(JSON.parse(e.data)); } catch { /* keepalive */ }
    });
    es.addEventListener("error", () => {
      setConnected(false);
      es.close();
      retryRef.current += 1;
      const wait = Math.min(30000, 1000 * 2 ** Math.min(retryRef.current, 5));
      timerRef.current = setTimeout(() => { connectRef.current(); }, wait);
    });
  }, [user, close, emit]);
  useEffect(() => { connectRef.current = connect; }, [connect]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) connect(); else { close(); stopBackgroundAlertListener().catch(() => {}); }
    return close;
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // On background/locked the foreground SSE can't reliably survive, so drop it and
  // start the FCM-independent foreground-service alert listener (backgroundRing.ts)
  // so a partner reschedule / assignment still rings on a locked/closed phone.
  // Resume the in-app stream (and stop the service) on return to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        stopBackgroundAlertListener().catch(() => {});
        if (user && !esRef.current) { retryRef.current = 1; connect(); }
      } else if (s === "background" && Platform.OS !== "web") {
        close();
        if (user) startBackgroundAlertListener().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user, connect, close]);

  const subscribe = useCallback((cb: Listener) => { listeners.current.add(cb); return () => { listeners.current.delete(cb); }; }, []);

  // Play the ADMIN-configured ring tone (synced via syncAlertConfig) — the SAME
  // source used by the background full-screen alert, so foreground + background match.
  const playRing = useCallback(() => { startRingSound().catch(() => {}); }, []);
  const stopRing = useCallback(() => { stopRingSound(); }, []);

  const value = useMemo(() => ({ connected, subscribe, playRing, stopRing }), [connected, subscribe, playRing, stopRing]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
