import { useEffect, useRef, useState } from "react";

/** Render a list 10 at a time; the next 10 appear when the sentinel scrolls into view. */
export default function useProgressive(items, pageSize = 10) {
  const [count, setCount] = useState(pageSize);
  const ref = useRef(null);
  const total = items?.length || 0;
  const hasMore = count < total;
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setCount((c) => c + pageSize); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pageSize, count]);
  return { items: (items || []).slice(0, count), hasMore, sentinelRef: ref };
}

export function LoadMoreSentinel({ list, testId }) {
  if (!list.hasMore) return null;
  return (
    <div ref={list.sentinelRef} data-testid={testId} className="py-4 flex justify-center">
      <span className="h-5 w-5 rounded-full border-2 border-primary-200 border-t-primary-700 animate-spin" />
    </div>
  );
}
