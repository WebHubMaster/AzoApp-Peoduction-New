import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { fmt, fmtDate } from "@/src/lib/format";
import { Card, EmptyState } from "@/src/components/ui";
import { MReportCards, MSearchBox, MPagination, MModuleHeader, MTypeBadge, MDateRangeFilter, DateRange, Kpi } from "@/src/components/merchant/ReferralShared";

const TYPE_TABS: [string, string][] = [["", "All"], ["customer", "Customer"], ["partner", "Partner"]];

// tabular-nums so money/percent columns align (mirrors web `tabular-nums`)
const TAB = { fontVariant: ["tabular-nums" as const] };

/* ─────────────── Type tabs (All / Customer / Partner) ─────────────── */
function TypeTabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 3 }} testID="commission-type-tabs">
      {TYPE_TABS.map(([k, lbl]) => {
        const on = value === k;
        return (
          <Pressable
            key={k || "all"}
            testID={`type-tab-${k || "all"}`}
            onPress={() => onChange(k)}
            style={{ flex: 1, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primary : "transparent" }}
          >
            <Text style={{ color: on ? "#fff" : colors.textSecondary, fontSize: fontSize.sm, fontWeight: "800" }}>{lbl}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MerchantCommission() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [type, setType] = useState("");
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [date, setDate] = useState<DateRange>({ range: "" });

  // debounce search (350ms) — matches web
  useEffect(() => { const t = setTimeout(() => setQ(qRaw), 350); return () => clearTimeout(t); }, [qRaw]);
  useEffect(() => { setPage(1); }, [type, q, date, pageSize]);

  const qs = new URLSearchParams({
    page: String(page), page_size: String(pageSize), type, q,
    range: date.range || "", date_from: date.date_from || "", date_to: date.date_to || "",
  }).toString();

  const list = useQuery({
    queryKey: ["m-ref-commission", page, pageSize, type, q, date],
    queryFn: () => api.get<any>(`/merchant/referral/commission?${qs}`),
  });
  const data = list.data;
  const s = data?.summary || {};
  const items: any[] = data?.items || [];

  const cards: Kpi[] = useMemo(() => [
    { label: "Total Commission", value: s.total, money: true, primary: true, sub: `${s.transactions || 0} transactions` },
    { label: "This Month", value: s.this_month, money: true },
    { label: "Last Month", value: s.last_month, money: true },
    { label: "This Week", value: s.this_week, money: true },
    { label: "Today", value: s.today, money: true },
    { label: "Yesterday", value: s.yesterday, money: true },
    { label: "Customer Commission", value: s.customer_commission, money: true },
    { label: "Partner Commission", value: s.partner_commission, money: true },
  ], [s]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="merchant-commission"
      >
        <MModuleHeader card title="Commission" subtitle="Your actual earned referral commission — customer & partner" />
        <MReportCards cards={cards} />

        <TypeTabs value={type} onChange={setType} />

        <MSearchBox value={qRaw} onChange={setQRaw} placeholder="Search service, name or booking code…" testID="commission-search" />

        <MDateRangeFilter value={date} onChange={setDate} />

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {list.isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
          ) : items.length === 0 ? (
            <EmptyState icon="cash-remove" title="No commission yet" subtitle="Commission from your referred customers and partners will appear here." />
          ) : (
            items.map((it) => (
              <View
                key={it.id}
                testID={`commission-row-${it.id}`}
                style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 }}
              >
                {/* Row 1 — Date + booking code (left) · type badge (right) */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "500", ...TAB }} numberOfLines={1}>{fmtDate(it.date)}</Text>
                    {it.booking_code ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{it.booking_code}</Text> : null}
                  </View>
                  <MTypeBadge type={it.referral_type} />
                </View>

                {/* Row 2 — Referral / Service (full width) */}
                <View>
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "600" }} numberOfLines={1}>{it.service_name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{it.name}</Text>
                </View>

                {/* Row 3 — Eligible + Earned (left col) · % (right col), all right-aligned (mirrors web grid) */}
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
                    <Text style={{ fontSize: fontSize.sm, ...TAB }} numberOfLines={1}>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>Eligible </Text>
                      <Text style={{ color: colors.textSecondary }}>{fmt(it.eligible_amount)}</Text>
                    </Text>
                    <Text style={{ color: colors.success, fontSize: fontSize.sm, fontWeight: "800", ...TAB }} numberOfLines={1}>{fmt(it.earned)}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, ...TAB }} numberOfLines={1}>{it.commission_pct}%</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>

        <MPagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
      </ScrollView>
    </View>
  );
}
