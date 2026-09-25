import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { Network, Wrench, CheckCircle2, ChevronRight } from "lucide-react-native";
import { fmt, fmtDate, initials } from "@/src/lib/format";
import { Card, EmptyState, Badge, statusTone } from "@/src/components/ui";
import { MReportCards, MSearchBox, MPagination, MModuleHeader, MBackLink, MPrivacyNote, Kpi } from "@/src/components/merchant/ReferralShared";

/* ─────────────── Avatar (violet tone, matches web) ─────────────── */
function PAvatar({ name }: { name?: string }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(124,58,237,0.12)", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#7C3AED", fontWeight: "800", fontSize: 14 }}>{initials(name || "P")}</Text>
    </View>
  );
}

/* ─────────────── Status badge (matches web StatusBadge) ─────────────── */
function PStatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge label="—" tone="neutral" />;
  return <Badge label={status.toUpperCase()} tone={statusTone(status)} />;
}

/* ─────────────── Status tabs (All / Active / Pending / Suspended) ─────────────── */
const STATUS_TABS: [string, string][] = [["", "All"], ["active", "Active"], ["pending", "Pending"], ["suspended", "Suspended"]];

function StatusTabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 3 }} testID="partner-status-tabs">
      {STATUS_TABS.map(([k, lbl]) => {
        const on = value === k;
        return (
          <Pressable
            key={k || "all"}
            testID={`status-tab-${k || "all"}`}
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

/* ─────────────── Partner detail view ─────────────── */
function PartnerDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const detail = useQuery({ queryKey: ["m-ref-partner", id], queryFn: () => api.get<any>(`/merchant/referral/partners/${id}`) });
  const d = detail.data;

  const r = d?.report || {};
  const cards: Kpi[] = [
    { label: "Total Commission", value: r.total_commission, money: true, primary: true, sub: `${r.commission_services || 0} services` },
    { label: "This Month", value: r.this_month, money: true },
    { label: "Last Month", value: r.last_month, money: true },
    { label: "Today", value: r.today, money: true },
    { label: "Yesterday", value: r.yesterday, money: true },
    { label: "Completed Services", value: d?.completed_services },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={detail.isFetching} onRefresh={() => detail.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="partner-detail"
      >
        <MBackLink label="Back to partners" onPress={onBack} />
        <MModuleHeader card title="Partner" subtitle="Referred partner commission" icon={Wrench} />

        {detail.isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
        ) : !d ? (
          <EmptyState icon="account-off" title="Not found" subtitle="Partner details unavailable." />
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <PAvatar name={d.name} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "900" }} numberOfLines={1}>{d.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}>{[d.partner_code, d.category].filter(Boolean).join(" · ")}</Text>
              </View>
              <PStatusBadge status={d.status} />
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: -spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Registered: <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>{fmtDate(d.registered_at)}</Text></Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Category: <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>{d.category || "—"}</Text></Text>
            </View>

            <MReportCards cards={cards} />

            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
                <Wrench size={16} color={colors.primary} />
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

/* ─────────────── Partners list view ─────────────── */
export default function MerchantPartners() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  // debounce search (350ms) — matches web
  useEffect(() => { const t = setTimeout(() => setQ(qRaw), 350); return () => clearTimeout(t); }, [qRaw]);
  useEffect(() => { setPage(1); }, [q, status, pageSize]);

  const list = useQuery({
    queryKey: ["m-ref-partners", page, pageSize, q, status],
    queryFn: () => api.get<any>(`/merchant/referral/partners?page=${page}&page_size=${pageSize}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  });
  const data = list.data;
  const rep = data?.report || {};
  const items: any[] = data?.items || [];

  const cards: Kpi[] = [
    { label: "Total Commission", value: rep.total_commission, money: true, primary: true, sub: `${rep.total_partners || 0} partners` },
    { label: "This Month", value: rep.this_month, money: true },
    { label: "Last Month", value: rep.last_month, money: true },
    { label: "Active Partners", value: rep.active_partners },
    { label: "Total Partners", value: rep.total_partners },
    { label: "Completed Services", value: rep.total_completed_services },
  ];

  if (sel) return <PartnerDetail id={sel} onBack={() => setSel(null)} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="merchant-partners"
      >
        <MModuleHeader card title="My Partners" subtitle="Partners registered with your merchant code — and your earned commission" icon={Network} />
        <MReportCards cards={cards} />

        <StatusTabs value={status} onChange={setStatus} />

        <MSearchBox value={qRaw} onChange={setQRaw} placeholder="Search partner name or ID…" testID="partner-search" />

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {list.isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
          ) : items.length === 0 ? (
            <EmptyState icon="account-network-outline" title="No referred partners yet" subtitle="Partners who register using your merchant code will appear here." />
          ) : (
            items.map((p, i) => (
              <Pressable
                key={p.id}
                testID={`partner-row-${p.id}`}
                onPress={() => setSel(p.id)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 })}
              >
                <PAvatar name={p.name} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm, flexShrink: 1 }} numberOfLines={1}>{p.name}</Text>
                    <PStatusBadge status={p.status} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{[p.partner_code, p.category].filter(Boolean).join(" · ")}</Text>
                    <CheckCircle2 size={12} color={colors.success} />
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{p.completed_services} completed</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: colors.success, fontWeight: "900", fontSize: fontSize.sm }}>{fmt(p.total_commission)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>commission</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </Card>

        <MPagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
      </ScrollView>
    </View>
  );
}
