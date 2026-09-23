import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import EventSource from "react-native-sse";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { API_BASE, getToken, mediaUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { getRingPrefs } from "@/src/lib/ringPrefs";
import { startBackgroundJobListener, stopBackgroundJobListener } from "@/src/lib/backgroundRing";

/**
 * Live dispatch over Server-Sent Events — mirrors web RealtimeContext.jsx.
 * Backend: GET /api/realtime/stream?token=JWT  → `data: {type, data, ts}` frames
 * (EventSource can't send Authorization headers, so the JWT rides in the query).
 * Reconnects with backoff; on reconnect fires a synthetic `__resync__` event so
 * screens can refetch. `playRing()/stopRing()` loop the job-ring sound.
 */
export type RtEvent = { type: string; data?: any; ts?: string };
type Listener = (ev: RtEvent) => void;

type RtCtx = {
  connected: boolean;
  bgListening: boolean;
  subscribe: (cb: Listener) => () => void;
  playRing: () => void;
  stopRing: () => void;
};

const Ctx = createContext<RtCtx>({ connected: false, bgListening: false, subscribe: () => () => {}, playRing: () => {}, stopRing: () => {} });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RING = require("../../assets/sounds/job-ring.wav");

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useAudioPlayer(RING);
  const srcRef = useRef<string>("__default__");

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  }, []);

  const emit = useCallback((ev: RtEvent) => { listeners.current.forEach((cb) => { try { cb(ev); } catch { /* ignore */ } }); }, []);

  const close = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (esRef.current) { esRef.current.removeAllEventListeners(); esRef.current.close(); esRef.current = null; }
    setConnected(false);
  }, []);

  const connect = useCallback(async () => {
    close();
    const token = await getToken();
    if (!token || !user) return;
    const es = new EventSource(`${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`, { pollingInterval: 0 });
    esRef.current = es;
    es.addEventListener("open", () => { setConnected(true); if (retryRef.current > 0) emit({ type: "__resync__" }); retryRef.current = 0; });
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("message", (e: any) => {
      if (!e?.data) return;
      try { emit(JSON.parse(e.data)); } catch { /* ignore keepalives */ }
    });
    es.addEventListener("error", () => {
      setConnected(false);
      es.close();
      retryRef.current += 1;
      const wait = Math.min(30000, 1000 * 2 ** Math.min(retryRef.current, 5));
      timerRef.current = setTimeout(() => { connect(); }, wait);
    });
  }, [user, close, emit]);

  useEffect(() => {
    if (user) connect(); else { close(); stopBackgroundJobListener().catch(() => {}); }
    return close;
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // FCM-INDEPENDENT background job listener (the reliable "other method").
  // START it the MOMENT a partner is ONLINE — while the app is still in the
  // FOREGROUND — so we NEVER hit Android 12+'s "can't start a foreground service
  // from the background" restriction (that silent failure was why the locked/closed
  // full-screen ring stopped firing). Once running, the Notifee foreground service
  // (stopWithTask=false) keeps the process + SSE stream alive through screen-lock,
  // app-close and swipe-away, so booking / reschedule / reminder all ring locally
  // via Notifee with NO FCM push required. Stop it only when the partner goes
  // offline or logs out.
  const partnerOnline = user?.role === "partner" && user?.partner_status === "online";
  const [bgListening, setBgListening] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (partnerOnline) { startBackgroundJobListener().then(() => setBgListening(true)).catch(() => setBgListening(false)); }
    else { stopBackgroundJobListener().catch(() => {}); setBgListening(false); }
  }, [partnerOnline]);

  // App backgrounded/locked: the foreground SSE can't reliably survive, so we drop
  // it and let the always-on background listener (started above while online) keep
  // receiving jobs. On return to foreground we resume the in-app stream. We NO LONGER
  // start the foreground service here — it is already running whenever the partner
  // is online, which is what makes the locked/closed ring reliable.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        if (user && !esRef.current) { retryRef.current = 1; connect(); }
      } else if (s === "background" && Platform.OS !== "web") {
        close();
      }
    });
    return () => sub.remove();
  }, [user, connect, close]);

  const subscribe = useCallback((cb: Listener) => { listeners.current.add(cb); return () => { listeners.current.delete(cb); }; }, []);

  // Admin ring config (web ringPrefs): custom uploaded tone + volume, looped until stopped.
  const playRing = useCallback(() => {
    try {
      const prefs = getRingPrefs();
      const src = prefs.customSoundUrl ? { uri: mediaUrl(prefs.customSoundUrl) || prefs.customSoundUrl } : RING;
      const key = typeof src === "object" && src && "uri" in src ? src.uri : "__default__";
      if (srcRef.current !== key) { player.replace(src); srcRef.current = key; }
      player.volume = Math.max(0.05, Math.min(1, prefs.volume != null ? prefs.volume : 0.7));
      player.loop = true; player.seekTo(0); player.play();
    } catch { /* ignore */ }
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [player]);
  const stopRing = useCallback(() => { try { player.pause(); player.seekTo(0); } catch { /* ignore */ } }, [player]);

  const value = useMemo(() => ({ connected, bgListening, subscribe, playRing, stopRing }), [connected, bgListening, subscribe, playRing, stopRing]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
