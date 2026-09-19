import React, { useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, TextInput } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Card, Avatar, Badge, EmptyState, CardSkeleton } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";

export default function MerchantCustomers() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["merchant-customers"],
    queryFn: () => api.get<any>("/merchant/customers"),
  });
  const items: any[] = data?.items || [];
  const filtered = useMemo(
    () => items.filter((c) => !q || (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.customer_phone || "").includes(q)),
    [items, q],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="My Customers" subtitle={`${data?.count ?? 0} customers`} testID="merchant-customers-header" />
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, padding: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, paddingHorizontal: 12, height: 44 }}>
          <Icon name="magnify" size={20} color={colors.textMuted} />
          <TextInput
            testID="customer-search"
            value={q}
            onChangeText={setQ}
            placeholder="Search customers"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, fontSize: fontSize.sm }}
          />
        </View>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}><CardSkeleton /><CardSkeleton /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.customer_key}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["merchant-customers"] })} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={<EmptyState icon="account-group-outline" title="No customers yet" subtitle="Customers you refer & serve will appear here." />}
          renderItem={({ item: c }) => (
            <Card testID={`customer-${c.customer_key}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <Avatar name={c.name} size={46} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }} numberOfLines={1}>{c.name}</Text>
                    {c.repeat ? <Badge label="Repeat" tone="success" /> : null}
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{c.customer_phone}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>Last: {c.last_service || "—"}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: fontSize.md }}>{fmt(c.total_spent)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{c.bookings} bookings</Text>
                </View>
              </View>
              {c.tags && c.tags.length > 0 ? (
                <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {c.tags.map((t: string) => <Badge key={t} label={t.toUpperCase()} tone="primary" />)}
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}
