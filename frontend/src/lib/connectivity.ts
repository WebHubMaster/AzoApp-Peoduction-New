/**
 * Connectivity detection for the whole app.
 *
 * Source of truth is an ACTIVE reachability ping to our own backend (a request
 * that actually succeeds means the app can work). @react-native-community/netinfo,
 * when present in the native build, gives instant change events; we still verify
 * with a real ping so a "connected but no real internet" state is caught too.
 * Works everywhere (native build, Expo Go, web) — netinfo is optional.
 *
 * IMPORTANT (cold-start flash fix): on Android the FIRST NetInfo event replayed on
 * subscribe frequently reports `isConnected: false` for a moment while the native
 * network stack warms up, and the very first backend ping can also lose the race
 * (DNS/TLS warm-up). We therefore NEVER show the "No Internet" gate on a single
 * miss — the gate only appears after TWO consecutive confirmed-offline probes.
 * Recovery (going back online) stays instant on the first success.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { API_BASE } from "@/src/api/client";

let _NetInfo: any | undefined;
function getNetInfo(): any | null {
  if (_NetInfo === undefined) {
    try { _NetInfo = require("@react-native-community/netinfo").default; }
    catch { _NetInfo = null; }
  }
  return _NetInfo || null;
}

/** A single reachability probe — any HTTP response (even 4xx) means we're online. */
async function ping(timeoutMs = 6000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${API_BASE}/notifications/push-config`, {
      method: "GET", signal: controller.signal, cache: "no-store" as any,
    });
    clearTimeout(t);
    return res.status > 0;
  } catch {
    return false;
  }
}

export function useConnectivity() {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);
  const onlineRef = useRef(true);
  const timer = useRef<any>(null);
  // Consecutive confirmed-offline count. The gate only shows once this reaches 2,
  // so a lone cold-start / warm-up miss can never flash "No Internet".
  const failStreak = useRef(0);

  const check = useCallback(async () => {
    setChecking(true);
    let ok = await ping();
    // Never declare "offline" on a single miss: a cold-start request can lose the
    // first ping (DNS/TLS warm-up) even with a perfectly good connection. Confirm
    // with a second, shorter probe before counting this cycle as a failure.
    if (!ok) ok = await ping(3000);
    if (!mounted.current) return ok;
    if (ok) {
      failStreak.current = 0;
      onlineRef.current = true;
      setOnline(true);
    } else {
      failStreak.current += 1;
      // Require TWO consecutive confirmed failures before blocking the app.
      if (failStreak.current >= 2) {
        onlineRef.current = false;
        setOnline(false);
      }
    }
    setChecking(false);
    return ok;
  }, []);

  // "Try Again" from the gate: probe once and reveal the app the instant we're back.
  const retry = useCallback(async () => {
    setChecking(true);
    let ok = await ping();
    if (!ok) ok = await ping(3000);
    if (!mounted.current) return ok;
    if (ok) { failStreak.current = 0; onlineRef.current = true; setOnline(true); }
    setChecking(false);
    return ok;
  }, []);

  // Self-scheduling poll. While we're online but a probe just missed (streak 1, gate
  // still hidden) we re-check quickly so a genuine drop is caught within a few seconds
  // without ever flashing on a transient warm-up miss. Steady online state polls slowly.
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const delay = onlineRef.current ? (failStreak.current > 0 ? 3000 : 20000) : 4000;
    timer.current = setTimeout(async () => {
      await check();
      if (mounted.current) schedule();
    }, delay);
  }, [check]);

  useEffect(() => {
    mounted.current = true;
    check().then(() => { if (mounted.current) schedule(); });

    const NetInfo = getNetInfo();
    let unsub: any;
    if (NetInfo) {
      unsub = NetInfo.addEventListener((state: any) => {
        // We do NOT trust NetInfo to flip us offline directly — not even a hard
        // `isConnected === false`. On Android cold start that state is replayed
        // (or briefly reported) while the stack warms up, which used to flash the
        // gate on every launch. The active backend ping is the ONLY source of
        // truth: any state change just triggers a fresh verification.
        check();
      });
    }
    const appSub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });

    return () => {
      mounted.current = false;
      unsub?.();
      appSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [check, schedule]);

  return { online, checking, retry };
}
