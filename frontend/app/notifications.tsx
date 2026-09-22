import React from "react";
import { View, Text, FlatList, RefreshControl, Pressable, Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Card, EmptyState, CardSkeleton } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { timeAgo } from "@/src/lib/format";

export default function Notifications() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      try { return await api.get<any[]>("/notifications"); } catch { return []; }
    },
  });
  const items = Array.isArray(data) ? data : (data as any)?.items || [];

  const refreshBadges = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["partner-notifs"] });
  };

  // Remove a SINGLE notification permanently (hidden for this user on the server).
  const removeOne = async (id: string) => {
    if (!id) return;
    const prev = items;
    qc.setQueryData(["notifications"], (old: any) => (Array.isArray(old) ? old.filter((n: any) => n.id !== id) : old));
    try {
      await api.del(`/notifications/${id}`);
      refreshBadges();
    } catch {
      qc.setQueryData(["notifications"], prev); // rollback
      toast.error("Could not remove notification");
    }
  };

  // Clear ALL notifications permanently (never shown again for this user).
  const clearAll = () => {
    if (!items.length || busy) return;
    Alert.alert(
      "Clear all notifications?",
      "This removes every notification from your list. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: async () => {
            const prev = items;
            setBusy(true);
            qc.setQueryData(["notifications"], []);
            try {
              await api.del("/notifications");
              refreshBadges();
              toast.success("All notifications cleared");
            } catch {
              qc.setQueryData(["notifications"], prev);
              toast.error("Could not clear notifications");
            } finally { setBusy(false); }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Notifications" back variant="gradient" testID="notifications-header" />

      {!isLoading && items.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" }}>
            {items.length} notification{items.length > 1 ? "s" : ""}
          </Text>
          <Pressable testID="notif-clear-all" onPress={clearAll} disabled={busy} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: colors.dangerSubtle }}>
            <Icon name="trash-can-outline" size={15} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: fontSize.xs, fontWeight: "700" }}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}

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
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }}>{item.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2, lineHeight: 18 }}>{item.body || item.message}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>{timeAgo(item.created_at)}</Text>
                </View>
                <Pressable testID={`notif-remove-${item.id}`} onPress={() => removeOne(item.id)} hitSlop={8} style={{ height: 28, width: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
