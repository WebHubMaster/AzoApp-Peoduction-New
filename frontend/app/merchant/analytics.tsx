import React from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, StatCard, SectionTitle, CardSkeleton } from "@/src/components/ui";
import { fmt } from "@/src/lib/format";

export default function MerchantAnalytics() {
  const { colors } = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ["merchant-analytics"], queryFn: () => api.get<any>("/merchant/analytics") });
  const k = data?.kpis || {};
  const series: any[] = (data?.series || []).slice(-14);
  const max = Math.max(1, ...series.map((s) => s.earning || 0));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Analytics" back subtitle={data?.range ? `Last ${data.range.days} days` : undefined} variant="gradient" testID="merchant-analytics-header" />
      <ScreenScroll>
        {isLoading ? <><CardSkeleton /><CardSkeleton /></> : (
          <>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <StatCard label="Total Earning" value={fmt(k.earning)} icon="cash" tone="primary" />
              <StatCard label="Avg / day" value={fmt(k.avg_per_day)} icon="chart-line" tone="info" />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <StatCard label="Customer Comm." value={fmt(k.customer_commission)} icon="account-cash" tone="success" />
              <StatCard label="Partner Comm." value={fmt(k.partner_commission)} icon="tools" tone="warning" />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <StatCard label="Customers" value={String(k.customers ?? 0)} icon="account-group" tone="primary" />
              <StatCard label="Partners" value={String(k.partners ?? 0)} icon="account-hard-hat" tone="info" />
            </View>
            <Card>
              <SectionTitle title="Earnings trend" />
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 130, marginTop: 4 }}>
                {series.map((s, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                    <View style={{ width: "70%", height: Math.max(3, ((s.earning || 0) / max) * 110), backgroundColor: s.earning > 0 ? colors.primary : colors.border, borderRadius: 3 }} />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{series[0]?.date?.slice(5)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{series[series.length - 1]?.date?.slice(5)}</Text>
              </View>
            </Card>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}
