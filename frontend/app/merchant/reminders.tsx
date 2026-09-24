import React from "react";
import { View, Text, FlatList, Pressable, Linking, RefreshControl } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Card, Badge, EmptyState, CardSkeleton } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { fmtDate } from "@/src/lib/format";

export default function MerchantReminders() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({ queryKey: ["merchant-reminders"], queryFn: () => api.get<any>("/merchant/panel/reminders") });
  const items: any[] = data?.items || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Service Reminders" back embedded subtitle={`${items.length} due`} variant="gradient" testID="merchant-reminders-header" />
      {isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}><CardSkeleton /><CardSkeleton /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x, i) => x.id || String(i)}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["merchant-reminders"] })} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={<EmptyState icon="bell-ring-outline" title="No reminders" subtitle="Customer service reminders will appear here." />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>{item.customer_name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{item.service_type}{item.product ? ` · ${item.product}` : ""}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 }}>Next due: {fmtDate(item.next_service_date)}</Text>
                </View>
                <Pressable testID={`remind-call-${item.id}`} onPress={() => item.customer_mobile && Linking.openURL(`tel:${item.customer_mobile}`)} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="phone" size={20} color={colors.primary} />
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
