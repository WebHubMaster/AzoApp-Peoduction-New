import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { fmt, fmtDate, initials } from "@/src/lib/format";
import { Card, EmptyState } from "@/src/components/ui";
import { MReportCards, MSearchBox, MPagination, MModuleHeader, MBackLink, MPrivacyNote, Kpi } from "@/src/components/merchant/ReferralShared";

/* ─────────────── Avatar (sky tone, matches web) ─────────────── */
function CAvatar({ name }: { name?: string }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(2,132,199,0.12)", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#0284C7", fontWeight: "800", fontSize: 14 }}>{initials(name || "C")}</Text>
    </View>
  );
}

/* ─────────────── Customer detail view ─────────────── */
function CustomerDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const detail = useQuery({ queryKey: ["m-ref-customer", id], queryFn: () => api.get<any>(`/merchant/referral/customers/${id}`) });
  const d = detail.data;

  const r = d?.report || {};
  const cards: Kpi[] = [
    { label: "Total Commission", value: r.total_commission, money: true, primary: true, sub: `${r.commission_services || 0} services` },
    { label: "This Month", value: r.this_month, money: true },
    { label: "Last Month", value: r.last_month, money: true },
    { label: "Today", value: r.today, money: true },
    { label: "Yesterday", value: r.yesterday, money: true },
    { label: "Total Services", value: d?.total_services },
    { label: "Completed Services", value: d?.completed_services },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MModuleHeader title="Customer" subtitle="Referred customer commission" icon="account" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={detail.isFetching} onRefresh={() => detail.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="customer-detail"
      >
        <MBackLink label="Back to customers" onPress={onBack} />

        {detail.isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
        ) : !d ? (
          <EmptyState icon="account-off" title="Not found" subtitle="Customer details unavailable." />
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <CAvatar name={d.name} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "900" }} numberOfLines={1}>{d.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}>{d.customer_code} · Referred customer</Text>
              </View>
            </View>

            <MReportCards cards={cards} />

            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
                <Icon name="wrench" size={16} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "800" }}>Service-wise commission</Text>
              </View>
              <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
                {(d.services || []).length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>No commission-earning services yet.</Text>
                  </View>
                ) : (
                  d.services.map((s: any, i: number) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{s.service_name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>{[fmtDate(s.date), s.booking_code, `eligible ${fmt(s.eligible_amount)}`, `${s.commission_pct}%`].filter(Boolean).join(" · ")}</Text>
                      </View>
                      <Text style={{ color: colors.success, fontWeight: "900", fontSize: fontSize.sm }}>{fmt(s.earned)}</Text>
                    </View>
                  ))
                )}
              </Card>
            </View>

            <MPrivacyNote />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ─────────────── Customers list view ─────────────── */
export default function MerchantCustomers() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  // debounce search (350ms) — matches web
  useEffect(() => { const t = setTimeout(() => setQ(qRaw), 350); return () => clearTimeout(t); }, [qRaw]);
  useEffect(() => { setPage(1); }, [q, pageSize]);

  const list = useQuery({
    queryKey: ["m-ref-customers", page, pageSize, q],
    queryFn: () => api.get<any>(`/merchant/referral/customers?page=${page}&page_size=${pageSize}&q=${encodeURIComponent(q)}`),
  });
  const data = list.data;
  const rep = data?.report || {};
  const items: any[] = data?.items || [];

  const cards: Kpi[] = [
    { label: "Total Commission", value: rep.total_commission, money: true, primary: true, sub: `${rep.total_customers || 0} customers` },
    { label: "This Month", value: rep.this_month, money: true },
    { label: "Last Month", value: rep.last_month, money: true },
    { label: "Today", value: rep.today, money: true },
    { label: "Yesterday", value: rep.yesterday, money: true },
    { label: "Total Services", value: rep.total_services },
    { label: "Completed Services", value: rep.total_completed_services },
  ];

  if (sel) return <CustomerDetail id={sel} onBack={() => setSel(null)} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MModuleHeader title="My Customers" subtitle="Customers referred via your QR / code — and your earned commission" icon="account-group" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="merchant-customers"
      >
        <MReportCards cards={cards} />

        <MSearchBox value={qRaw} onChange={setQRaw} placeholder="Search customer name…" testID="customer-search" />

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {list.isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
          ) : items.length === 0 ? (
            <EmptyState icon="account-group-outline" title="No referred customers yet" subtitle="Customers who book through your QR code or sign up with your merchant code will appear here." />
          ) : (
            items.map((c, i) => (
              <Pressable
                key={c.id}
                testID={`customer-row-${c.id}`}
                onPress={() => setSel(c.id)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 })}
              >
                <CAvatar name={c.name} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }} numberOfLines={1}>{c.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <Icon name="check-circle" size={12} color={colors.success} />
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{c.completed_services} completed · {c.total_services} services</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: colors.success, fontWeight: "900", fontSize: fontSize.sm }}>{fmt(c.total_commission)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>commission</Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </Card>

        <MPagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
      </ScrollView>
    </View>
  );
}
