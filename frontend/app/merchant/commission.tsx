import React from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, StatCard, SectionTitle, Badge, EmptyState, CardSkeleton, statusTone } from "@/src/components/ui";
import { fmt, fmtDate } from "@/src/lib/format";

export default function MerchantCommission() {
  const { colors } = useTheme();
  const summary = useQuery({ queryKey: ["m-comm-summary"], queryFn: () => api.get<any>("/merchant/panel/commission/summary") });
  const list = useQuery({ queryKey: ["m-comm-list"], queryFn: () => api.get<any>("/merchant/panel/commission") });
  const s = summary.data || {};
  const items: any[] = list.data?.items || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Commission" back variant="gradient" testID="merchant-commission-header" />
      <ScreenScroll refreshing={summary.isFetching} onRefresh={() => { summary.refetch(); list.refetch(); }}>
        {summary.isLoading ? <CardSkeleton /> : (
          <>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <StatCard label="Total" value={fmt(s.total)} icon="cash-multiple" tone="primary" />
              <StatCard label="This Month" value={fmt(s.this_month)} icon="calendar-month" tone="success" />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <StatCard label="Pending" value={fmt(s.pending)} icon="clock-outline" tone="warning" />
              <StatCard label="Paid" value={fmt(s.paid)} icon="check-decagram" tone="info" />
            </View>
            <View>
              <SectionTitle title={`Commission history (${s.count ?? items.length})`} />
              {items.length === 0 ? <Card><EmptyState icon="cash-remove" title="No commission yet" /></Card> : (
                <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
                  {items.slice(0, 40).map((c, i) => (
                    <View key={c.id || i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }}>{c.source} · {c.type}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{c.transaction_id} · {fmtDate(c.date)}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={{ color: colors.success, fontWeight: "800" }}>+{fmt(c.commission)}</Text>
                        <Badge label={c.status} tone={statusTone(c.status)} />
                      </View>
                    </View>
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}
