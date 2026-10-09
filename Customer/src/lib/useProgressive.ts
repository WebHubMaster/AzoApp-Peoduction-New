import { useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useOnScrollEnd } from "@/src/components/customer/ux";

export const PAGE_SIZE = 10;
const THRESHOLD = 600;

// Near-bottom + short-content detector for screens that own their ScrollView/FlatList.
export function useEndDetector(onEnd: () => void) {
  const ref = useRef(onEnd);
  ref.current = onEnd;
  const viewH = useRef(0);
  return {
    scrollEventThrottle: 250,
    onScroll: ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - THRESHOLD) ref.current();
    },
    onLayout: (e: LayoutChangeEvent) => { viewH.current = e.nativeEvent.layout.height; },
    onContentSizeChange: (_w: number, h: number) => { if (viewH.current && h <= viewH.current + THRESHOLD) ref.current(); },
  };
}

// Renders a locally filtered list 10 rows at a time; the next 10 appear automatically on scroll.
export function useProgressive<T>(all: T[], resetKey: unknown = null) {
  const [count, setCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setCount(PAGE_SIZE); }, [resetKey]);
  const hasMore = count < all.length;
  const loadMore = () => {
    if (!hasMore || loading) return;
    setLoading(true);
    setTimeout(() => { setCount((c) => c + PAGE_SIZE); setLoading(false); }, 200);
  };
  useOnScrollEnd(loadMore);
  const scrollProps = useEndDetector(loadMore);
  return { items: all.slice(0, count), total: all.length, hasMore, loading, loadMore, scrollProps };
}
