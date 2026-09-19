import React from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, StatCard, SectionTitle, Avatar, Badge, EmptyState, CardSkeleton, statusTone } from "@/src/components/ui";
import { fmt } from "@/src/lib/format";

export default function MerchantNetwork() {
  const { colors } = useTheme();
  const stats = useQuery({ queryKey: ["m-net-stats"], queryFn: () => api.get<any>("/merchant/panel/network/stats") });
  const list = useQuery({ queryKey: ["m-net-list"], queryFn: () => api.get<any>("/merchant/panel/network") });
  const s = stats.data || {};
  const items: any[] = list.data?.items || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="My Network" back variant="gradient" testID="merchant-network-header" />
      <ScreenScroll refreshing={stats.isFetching} onRefresh={() => { stats.refetch(); list.refetch(); }}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatCard label="Total Members" value={String(s.total ?? 0)} icon="account-group" tone="primary" />
          <StatCard label="Active" value={String(s.active ?? 0)} icon="account-check" tone="success" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatCard label="Direct" value={String(s.direct ?? 0)} icon="account-arrow-right" tone="info" />
          <StatCard label="Indirect" value={String(s.indirect ?? 0)} icon="account-multiple" tone="warning" />
        </View>
        <StatCard label="Total Network Earnings" value={fmt(s.total_earnings)} icon="cash-multiple" tone="success" sub={`This month ${fmt(s.this_month_earnings)}`} />
        <View>
          <SectionTitle title="Members" />
          {list.isLoading ? <CardSkeleton /> : items.length === 0 ? <Card><EmptyState icon="account-group-outline" title="No members yet" subtitle="Onboard partners & customers to grow your network." /></Card> : (
            <View style={{ gap: spacing.sm }}>
              {items.slice(0, 40).map((m, i) => (
                <Card key={m.id || i}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <Avatar name={m.name || m.email} size={42} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }} numberOfLines={1}>{m.name || m.email || "Member"}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{m.role || (m.is_real ? "partner" : "member")}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={{ color: colors.primary, fontWeight: "800" }}>{fmt(m.commission_generated)}</Text>
                      {m.kyc_status ? <Badge label={m.kyc_status} tone={statusTone(m.kyc_status)} /> : null}
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScreenScroll>
    </View>
  );
}
