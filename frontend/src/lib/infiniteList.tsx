import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, LayoutChangeEvent } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTheme } from "@/src/theme";

type Page = { items?: any[]; total?: number; [k: string]: any };
export const PAGE_SIZE = 10;
const THRESHOLD = 600;

// Fires onEnd near the bottom, and also when content is shorter than the viewport (auto-fill).
function useEndDetector(onEnd: () => void) {
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

// Server-paginated list: 10 items per request, next page fetched automatically on scroll.
export function useInfiniteList(key: readonly unknown[], fetchPage: (page: number, size: number) => Promise<Page>, opts: { enabled?: boolean } = {}) {
  const q = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam as number, PAGE_SIZE),
    getNextPageParam: (last: Page, all: Page[]) => {
      const loaded = all.reduce((n, p) => n + (p.items?.length || 0), 0);
      return (last.items?.length || 0) > 0 && loaded < (last.total ?? 0) ? all.length + 1 : undefined;
    },
    retry: 1,
    retryDelay: 1500,
    staleTime: 30_000,
    enabled: opts.enabled ?? true,
  });
  const pages = q.data?.pages || [];
  const seen = new Set<string>();
  const items = pages.flatMap((p) => p.items || []).filter((x: any) => (x?.id ? (seen.has(x.id) ? false : (seen.add(x.id), true)) : true));
  const first: Page = pages[0] || {};
  const loadMore = () => { if (q.hasNextPage && !q.isFetchingNextPage && !q.isFetchNextPageError) q.fetchNextPage(); };
  const scrollProps = useEndDetector(loadMore);
  return { ...q, items, first, total: first.total ?? 0, loadMore, scrollProps };
}

// Client-side progressive rendering for lists that are filtered/polled locally: shows 10 more on scroll.
export function useProgressiveList<T>(all: T[], resetKey: unknown = null) {
  const [count, setCount] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCount(PAGE_SIZE); }, [resetKey]);
  const hasNextPage = count < all.length;
  const loadMore = () => {
    if (!hasNextPage || busy) return;
    setBusy(true);
    setTimeout(() => { setCount((c) => c + PAGE_SIZE); setBusy(false); }, 200);
  };
  const scrollProps = useEndDetector(loadMore);
  return { items: all.slice(0, count), total: all.length, hasNextPage, isFetchingNextPage: busy, isFetchNextPageError: false, loadMore, fetchNextPage: loadMore, scrollProps };
}

type FooterList = { items: any[]; total?: number; hasNextPage?: boolean; isFetchingNextPage?: boolean; isFetchNextPageError?: boolean; fetchNextPage: () => any };

export function LoadMoreFooter({ list, testID = "load-more" }: { list: FooterList; testID?: string }) {
  const { colors } = useTheme();
  if (!list.items.length) return null;
  if (list.isFetchNextPageError) return (
    <View testID={`${testID}-error`} style={{ alignItems: "center", marginTop: 12, gap: 8 }}>
      <Text style={{ color: "#E11D48", fontSize: 12 }}>Unable to load more records. Please check your connection.</Text>
      <Pressable testID={`${testID}-retry`} onPress={() => list.fetchNextPage()} style={{ height: 36, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>Retry</Text></Pressable>
    </View>
  );
  if (list.hasNextPage || list.isFetchingNextPage) return (
    <View testID={`${testID}-loading`} style={{ marginTop: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <ActivityIndicator size="small" color={colors.primary} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>Loading more records…</Text>
    </View>
  );
  const n = list.total || list.items.length;
  return (
    <View testID={`${testID}-end`} style={{ marginTop: 14, paddingVertical: 6, alignItems: "center", gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ height: 1, width: 28, backgroundColor: colors.border }} />
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>You have reached the end of the list</Text>
        <View style={{ height: 1, width: 28, backgroundColor: colors.border }} />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{`All ${n} record${n === 1 ? "" : "s"} loaded`}</Text>
    </View>
  );
}
