import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ScrollView, RefreshControl, Share, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { AppShellHeader, Surface, KitEmpty, shortDate } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";
import { InvStatusBadge, InvTypeChip } from "@/src/components/invoice";

const RANGES = [
  { key: "all", label: "All Time" }, { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" }, { key: "30d", label: "Last 30 Days" }, { key: "this_month", label: "This Month" },
] as const;
const SORTS = [
  { key: "newest", label: "Newest first" }, { key: "oldest", label: "Oldest first" },
  { key: "amount_high", label: "Highest amount" }, { key: "amount_low", label: "Lowest amount" },
] as const;
const SLATE400 = "#94A3B8";

/** Web MerchantInvoices (role=partner) — "My Invoices" */
export default function PartnerInvoices() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [range, setRange] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["partner-invoices", range, sort],
    queryFn: () => api.get<any>(`/invoices?range=${range}&sort=${sort}&page_size=200`),
  });
  const all: any[] = data?.items || [];
  const filtered = search.trim() ? all.filter((x) => `${x.invoice_number} ${x.booking_code} ${x.customer_snapshot?.name || ""}`.toLowerCase().includes(search.trim().toLowerCase())) : all;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pg = Math.min(page, pages);
  const items = filtered.slice((pg - 1) * pageSize, pg * pageSize);
  const count = data?.summary?.total_count ?? all.length;
  const totalAmt = data?.summary?.total_amount ?? all.reduce((s, x) => s + (x.total_amount || 0), 0);
  const partyOf = (x: any) => x.customer_snapshot?.name || x.merchant_snapshot?.name || "—";
  const iconBtn = { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" as const, justifyContent: "center" as const };

  const Stat = ({ icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub: string; tone: string }) => (
    <Surface style={{ width: 180, padding: 16 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tone, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={colors.primary} /></View>
      <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginTop: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: SLATE400, fontSize: 12, marginTop: 4 }}>{sub}</Text>
    </Surface>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 16 }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ["partner-invoices"] })} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View>
              <Text testID="partner-invoices-header" style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>My Invoices</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 2 }}>Booking, earnings, settlement & withdrawal documents</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.surfaceSubtle, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8 }}>
                <Icon name="storefront-outline" size={14} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{user?.name || "Partner"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, height: 44, backgroundColor: colors.surface }}>
                <Icon name="magnify" size={18} color={SLATE400} />
                <TextInput testID="invoice-search" value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} placeholder="Search invoice #, book" placeholderTextColor={SLATE400} style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 14 }} />
              </View>
              <Pressable testID="invoice-filter" onPress={() => setSortOpen((o) => !o)} style={iconBtn}><Icon name="tune-variant" size={18} color={colors.textSecondary} /></Pressable>
              <Pressable testID="invoice-sort" onPress={() => setSortOpen((o) => !o)} style={iconBtn}><Icon name="swap-vertical" size={18} color={colors.textSecondary} /></Pressable>
              <Pressable testID="invoice-refresh" onPress={() => qc.invalidateQueries({ queryKey: ["partner-invoices"] })} style={iconBtn}><Icon name="refresh" size={18} color={colors.textSecondary} /></Pressable>
            </View>
            {sortOpen ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {SORTS.map((s) => { const on = sort === s.key; return (
                  <Pressable key={s.key} testID={`sort-${s.key}`} onPress={() => { setSort(s.key); setSortOpen(false); }} style={{ paddingHorizontal: 12, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primary : colors.surface, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                    <Text style={{ color: on ? "#fff" : colors.textSecondary, fontWeight: "600", fontSize: 12 }}>{s.label}</Text>
                  </Pressable>); })}
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {RANGES.map((r) => { const on = range === r.key; return (
                <Pressable key={r.key} testID={`range-${r.key}`} onPress={() => { setRange(r.key); setPage(1); }} style={{ paddingHorizontal: 16, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primary : colors.surface, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                  <Text style={{ color: on ? "#fff" : colors.textSecondary, fontWeight: "600", fontSize: 13 }}>{r.label}</Text>
                </Pressable>); })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              <Stat icon="file-document-outline" label="INVOICES" value={String(count)} sub={RANGES.find((r) => r.key === range)?.label || ""} tone={colors.primarySubtle} />
              <Stat icon="currency-inr" label="TOTAL AMOUNT" value={fmt(totalAmt)} sub="Gross invoice value" tone={colors.primarySubtle} />
              <Stat icon="check-circle-outline" label="PAID" value={fmt(data?.summary?.paid_amount)} sub={`${data?.summary?.paid_count ?? 0} invoices`} tone="#ECFDF5" />
            </ScrollView>
          </View>
        }
        ListEmptyComponent={isLoading ? <Surface style={{ padding: 16 }}><View style={{ height: 80, borderRadius: 12, backgroundColor: colors.surfaceSubtle }} /></Surface> : <Surface><KitEmpty icon="file-document-outline" title="No invoices" desc="Invoices are generated after completed jobs & settlements." /></Surface>}
        renderItem={({ item }) => (
          <Surface testID={`invoice-${item.id}`} style={{ padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{item.invoice_number}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <InvTypeChip type={item.invoice_type} />
                  {item.booking_code ? <Text style={{ color: SLATE400, fontSize: 11, fontFamily: "monospace" }}>{item.booking_code}</Text> : null}
                </View>
              </View>
              <InvStatusBadge status={item.payment_status} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "500", fontSize: 14 }} numberOfLines={1}>{partyOf(item)}</Text>
                <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2 }}>{shortDate(item.booking_date || item.issue_date)}</Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 20 }}>{fmt(item.display_amount ?? item.total_amount)}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <Pressable testID={`inv-view-${item.id}`} onPress={() => router.push(`/partner/invoice/${item.id}`)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <Icon name="eye-outline" size={17} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 14 }}>View</Text>
              </Pressable>
              <Pressable testID={`inv-download-${item.id}`} onPress={() => router.push(`/partner/invoice/${item.id}?download=1`)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                <Icon name="download-outline" size={17} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 14 }}>Download</Text>
              </Pressable>
              <Pressable testID={`inv-more-${item.id}`} onPress={() => setMenuFor(menuFor === item.id ? null : item.id)} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                <Icon name="dots-horizontal" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            {menuFor === item.id ? (
              <Pressable testID={`inv-share-${item.id}`} onPress={() => { setMenuFor(null); Share.share({ message: `Invoice ${item.invoice_number} · ${fmt(item.total_amount)} · ${(item.payment_status || "").replace(/_/g, " ")} — AzoApp` }).catch(() => {}); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, height: 40, borderRadius: 12, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 12 }}>
                <Icon name="share-variant-outline" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Share Invoice</Text>
              </Pressable>
            ) : null}
          </Surface>
        )}
        ListFooterComponent={filtered.length > 0 ? (
          <View style={{ alignItems: "center", gap: 12, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text testID="pagination-info" style={{ color: colors.textMuted, fontSize: 13 }}>Showing <Text style={{ fontWeight: "700", color: colors.textSecondary }}>{(pg - 1) * pageSize + 1}–{Math.min(pg * pageSize, filtered.length)}</Text> of {filtered.length} invoices</Text>
              <Pressable testID="page-size" onPress={() => { setPageSize(pageSize === 10 ? 25 : 10); setPage(1); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{pageSize} / page</Text><Icon name="chevron-down" size={14} color={SLATE400} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable testID="page-prev" disabled={pg <= 1} onPress={() => setPage(pg - 1)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", opacity: pg <= 1 ? 0.4 : 1 }}><Icon name="chevron-left" size={18} color={SLATE400} /></Pressable>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{pg}</Text></View>
              <Pressable testID="page-next" disabled={pg >= pages} onPress={() => setPage(pg + 1)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", opacity: pg >= pages ? 0.4 : 1 }}><Icon name="chevron-right" size={18} color={SLATE400} /></Pressable>
            </View>
          </View>
        ) : null}
      />
    </View>
  );
}
