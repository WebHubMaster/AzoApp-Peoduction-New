import { useCallback, useEffect, useRef, useState } from "react";
import { useOnScrollEnd } from "@/src/components/customer/ux";

type Page<T> = { items?: T[]; total?: number; [k: string]: any };

// Server-paginated list: loads page 1, appends next pages on scroll, retries once on slow networks.
export function useServerList<T extends { id?: string }>(fetchPage: (page: number) => Promise<Page<T>>, resetKey: string) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const pageRef = useRef(1);
  const busy = useRef(false);
  const reqId = useRef(0);

  const get = (pg: number) => fetchRef.current(pg).catch(() => fetchRef.current(pg));

  const refresh = useCallback(async (silent = false) => {
    const id = ++reqId.current;
    if (!silent) setLoading(true);
    setError(false);
    try {
      const r = await get(1);
      if (id !== reqId.current) return;
      setItems(r?.items || []); setMeta(r); pageRef.current = 1; setMore("idle");
    } catch {
      if (id === reqId.current && !silent) setError(true);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(() => refresh(), 250); return () => clearTimeout(t); }, [resetKey, refresh]);

  const total = meta?.total ?? 0;
  const hasMore = items.length < total;
  const loadMore = async () => {
    if (busy.current || loading || !hasMore) return;
    busy.current = true; setMore("loading");
    const id = reqId.current;
    try {
      const r = await get(pageRef.current + 1);
      if (id !== reqId.current) return;
      const next = r?.items || [];
      setItems((prev) => { const seen = new Set(prev.map((x) => x.id)); return [...prev, ...next.filter((x) => !seen.has(x.id))]; });
      pageRef.current += 1; setMore("idle");
      if (!next.length) setMeta((m) => ({ ...(m || {}), total: items.length }));
    } catch {
      if (id === reqId.current) setMore("error");
    } finally {
      busy.current = false;
    }
  };
  useOnScrollEnd(() => { if (more !== "error") loadMore(); });

  return { items, meta, total, loading, error, more, hasMore, loadMore, refresh };
}
