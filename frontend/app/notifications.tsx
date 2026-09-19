import React from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Card, EmptyState, CardSkeleton } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { timeAgo } from "@/src/lib/format";

export default function Notifications() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      try { return await api.get<any[]>("/notifications"); } catch { return []; }
    },
  });
  const items = Array.isArray(data) ? data : (data as any)?.items || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Notifications" back variant="gradient" testID="notifications-header" />
      {isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}><CardSkeleton /><CardSkeleton /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n, i) => n.id || String(i)}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["notifications"] })} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={<EmptyState icon="bell-outline" title="No notifications" subtitle="Job rings, booking updates and payouts will appear here." />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="bell-ring" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>{item.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2, lineHeight: 18 }}>{item.body || item.message}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>{timeAgo(item.created_at)}</Text>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
