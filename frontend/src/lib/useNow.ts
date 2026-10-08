import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** Ticking clock scoped to the calling component; pauses while the app is backgrounded. */
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) { setNow(Date.now()); id = setInterval(() => setNow(Date.now()), ms); } };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    start();
    const sub = AppState.addEventListener("change", (s) => (s === "active" ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [ms, enabled]);
  return now;
}

export const fmtElapsed = (startedAt: string | undefined, now: number) => {
  const es = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  return `${String(Math.floor(es / 3600)).padStart(2, "0")}:${String(Math.floor((es % 3600) / 60)).padStart(2, "0")}:${String(es % 60).padStart(2, "0")}`;
};
