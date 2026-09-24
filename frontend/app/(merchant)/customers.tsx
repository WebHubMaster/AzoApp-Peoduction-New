import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { Users, Wrench, CheckCircle2, ChevronRight } from "lucide-react-native";
import { AppShellHeader } from "@/src/components/AppShell";
import { fmt, fmtDate, initials } from "@/src/lib/format";
import { Card, EmptyState } from "@/src/components/ui";
import { MReportCards, MSearchBox, MPagination, MModuleHeader, MBackLink, MPrivacyNote, Kpi } from "@/src/components/merchant/ReferralShared";

const TAB = { fontVariant: ["tabular-nums" as const] };

/* Avatar — web h-10 w-10 (40) rounded-full, sky-100 bg / sky-700 fg. */
function CAvatar({ name }: { name?: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#E0F2FE", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#0369A1", fontWeight: "700", fontSize: 14 }}>{initials(name || "C")}</Text>
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
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.18 }} numberOfLines={1}>{d.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{d.customer_code} · Referred customer</Text>
              </View>
            </View>

            <MReportCards cards={cards} />

            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
                <Wrench size={16} color={colors.secondary} />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Service-wise commission</Text>
              </View>
              <Card padded={false} style={{ paddingHorizontal: spacing.lg, borderRadius: 16 }}>
                {(d.services || []).length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>No commission-earning services yet.</Text>
                  </View>
                ) : (
                  d.services.map((s: any, i: number) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>{s.service_name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>{[fmtDate(s.date), s.booking_code, `eligible ${fmt(s.eligible_amount)}`, `${s.commission_pct}%`].filter(Boolean).join(" · ")}</Text>
                      </View>
                      <Text style={{ color: colors.success, fontWeight: "800", fontSize: 14, ...TAB }}>{fmt(s.earned)}</Text>
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

  // debounce search (350ms) — matches web; reset to page 1 when the query changes
  useEffect(() => { const t = setTimeout(() => { setQ(qRaw); setPage(1); }, 350); return () => clearTimeout(t); }, [qRaw]);

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
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="merchant-customers"
      >
        <MModuleHeader card title="My Customers" subtitle="Customers referred via your QR / code — and your earned commission" icon={Users} />

        <MReportCards cards={cards} />

        <MSearchBox value={qRaw} onChange={setQRaw} placeholder="Search customer name…" testID="customer-search" />

        <Card padded={false} style={{ paddingHorizontal: spacing.lg, borderRadius: 16 }}>
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
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>{c.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <CheckCircle2 size={12} color="#10B981" />
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{c.completed_services} completed · {c.total_services} services</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: colors.success, fontWeight: "800", fontSize: 14, ...TAB }}>{fmt(c.total_commission)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>commission</Text>
                </View>
                <ChevronRight size={16} color={colors.border} />
              </Pressable>
            ))
          )}
        </Card>

        <MPagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
      </ScrollView>
    </View>
  );
}
