import React from "react";
import { View, Text, Pressable, ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTheme } from "@/src/theme";

type Page = { items?: any[]; total?: number; [k: string]: any };
export const PAGE_SIZE = 10;

// Server-paginated list: 10 items per request, next page fetched on scroll; one retry for slow networks.
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
  const loadMore = () => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); };
  // Spread onto the screen's ScrollView.
  const scrollProps = {
    scrollEventThrottle: 250,
    onScroll: ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600 && !q.isFetchNextPageError) loadMore();
    },
  };
  return { ...q, items, first, total: first.total ?? 0, loadMore, scrollProps };
}

export function LoadMoreFooter({ list, testID = "load-more" }: { list: ReturnType<typeof useInfiniteList>; testID?: string }) {
  const { colors } = useTheme();
  if (!list.items.length) return null;
  const btn = { marginTop: 12, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const };
  if (list.isFetchingNextPage) return <View testID={`${testID}-loading`} style={{ marginTop: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}><ActivityIndicator size="small" color={colors.primary} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>Loading more…</Text></View>;
  if (list.isFetchNextPageError) return (
    <View testID={`${testID}-error`} style={{ alignItems: "center", marginTop: 12 }}>
      <Text style={{ color: "#E11D48", fontSize: 12 }}>Slow connection — couldn&apos;t load more.</Text>
      <Pressable testID={`${testID}-retry`} onPress={() => list.fetchNextPage()} style={{ ...btn, paddingHorizontal: 16 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>Retry</Text></Pressable>
    </View>
  );
  if (list.hasNextPage) return <Pressable testID={`${testID}-btn`} onPress={list.loadMore} style={btn}><Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>Load more</Text></Pressable>;
  return <Text testID={`${testID}-end`} style={{ marginTop: 12, textAlign: "center", color: colors.textMuted, fontSize: 12 }}>You&apos;re all caught up</Text>;
}
