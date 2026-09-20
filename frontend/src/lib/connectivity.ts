/**
 * Connectivity detection for the whole app.
 *
 * Source of truth is an ACTIVE reachability ping to our own backend (a request
 * that actually succeeds means the app can work). @react-native-community/netinfo,
 * when present in the native build, gives instant change events; we still verify
 * with a real ping so a "connected but no real internet" state is caught too.
 * Works everywhere (native build, Expo Go, web) — netinfo is optional.
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

  const check = useCallback(async () => {
    setChecking(true);
    const ok = await ping();
    if (mounted.current) {
      onlineRef.current = ok;
      setOnline(ok);
      setChecking(false);
    }
    return ok;
  }, []);

  // Self-scheduling poll: fast (4s) while offline for quick auto-recovery,
  // relaxed (20s) while online so we still notice a drop without netinfo.
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await check();
      if (mounted.current) schedule();
    }, onlineRef.current ? 20000 : 4000);
  }, [check]);

  useEffect(() => {
    mounted.current = true;
    check().then(() => { if (mounted.current) schedule(); });

    const NetInfo = getNetInfo();
    let unsub: any;
    if (NetInfo) {
      unsub = NetInfo.addEventListener((state: any) => {
        const connected = state?.isConnected !== false && state?.isInternetReachable !== false;
        if (!connected) { onlineRef.current = false; setOnline(false); }
        else check();
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

  return { online, checking, retry: check };
}
