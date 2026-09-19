import React, { useState, useMemo } from "react";
import { View, Text, Pressable, FlatList, RefreshControl, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { EmptyState, CardSkeleton } from "@/src/components/ui";
import { StatusBadge } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { fmt, fmtDate } from "@/src/lib/format";

const HIST_FILTERS = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default function PartnerJobHistory() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [histStatus, setHistStatus] = useState<(typeof HIST_FILTERS)[number]["key"]>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["partner-joblist", "history", histStatus],
    queryFn: () => api.get<any[]>(`/bookings/partner/history?status=${histStatus}`),
  });

  const list = useMemo(() => {
    let rows = q.data || [];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter((b) => `${b.service_name} ${b.code} ${b.customer_name} ${b.address?.city || ""}`.toLowerCase().includes(s));
    }
    return rows;
  }, [q.data, search]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Job History" subtitle="Completed & cancelled jobs" back testID="partner-history-header" />
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: 10, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44, backgroundColor: colors.surfaceSubtle }}>
          <Icon name="magnify" size={18} color={colors.textMuted} />
          <TextInput
            testID="history-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search service, code, customer, city"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.sm }}
          />
          {search ? <Pressable onPress={() => setSearch("")} hitSlop={8}><Icon name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {HIST_FILTERS.map((f) => {
            const on = histStatus === f.key;
            return (
              <Pressable key={f.key} testID={`hist-filter-${f.key}`} onPress={() => setHistStatus(f.key)} style={{ flex: 1, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primarySubtle : colors.surfaceSubtle, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                <Text style={{ color: on ? colors.primary : colors.textSecondary, fontWeight: "700", fontSize: fontSize.xs }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {q.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}><CardSkeleton /><CardSkeleton /></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.sm }}
          renderItem={({ item: b }) => {
            const cancelled = b.status === "cancelled";
            return (
              <Pressable testID={`history-${b.code}`} onPress={() => router.push(`/(partner)/booking/${b.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
                <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: cancelled ? colors.dangerSubtle : colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={cancelled ? "close-circle-outline" : "wrench"} size={20} color={cancelled ? colors.danger : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{b.service_name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>#{b.code} · {fmtDate(b.updated_at || b.created_at)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>{fmt(b.pricing?.total ?? b.total)}</Text>
                  <StatusBadge status={b.status} />
                </View>
              </Pressable>
            );
          }}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["partner-joblist"] })} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={<EmptyState icon="history" title="No jobs found" subtitle="Your completed & cancelled jobs will appear here." />}
        />
      )}
    </View>
  );
}
