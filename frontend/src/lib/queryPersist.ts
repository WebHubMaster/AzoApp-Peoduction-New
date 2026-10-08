import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { storage } from "@/src/utils/storage";

// Home-screen queries kept on the phone so the app opens instantly (even on slow internet).
const ROOTS = ["partner-dashboard", "partner-stats", "starter-kit", "maid-subs", "partner-active"];

/** Restores the last saved home data on launch, then keeps the snapshot updated after each successful fetch. */
export function usePersistHomeQueries(qc: QueryClient, userId?: string) {
  useEffect(() => {
    if (!userId) return;
    const key = `partner_home_cache_v1_${userId}`;
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    storage.getItem(key).then((raw) => {
      if (!alive || !raw) return;
      try {
        (JSON.parse(raw) as [unknown[], unknown][]).forEach(([k, d]) => {
          // updatedAt: 1 → treated as stale, so every screen still refetches fresh data on mount.
          if (qc.getQueryData(k) === undefined) qc.setQueryData(k, d, { updatedAt: 1 });
        });
      } catch { /* corrupt cache → ignore */ }
    });
    const save = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const entries = qc.getQueryCache().findAll()
          .filter((q) => ROOTS.includes(String(q.queryKey[0])) && q.state.status === "success" && q.state.dataUpdatedAt > 1)
          .map((q) => [q.queryKey, q.state.data]);
        storage.setItem(key, JSON.stringify(entries));
      }, 1500);
    };
    const unsub = qc.getQueryCache().subscribe((e) => {
      if (e.type === "updated" && e.action?.type === "success" && ROOTS.includes(String(e.query.queryKey[0]))) save();
    });
    return () => { alive = false; if (t) clearTimeout(t); unsub(); };
  }, [qc, userId]);
}
