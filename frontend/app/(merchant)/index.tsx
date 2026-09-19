import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt, fmtC, timeAgo, initials } from "@/src/lib/format";
import { Card, SectionTitle, EmptyState, CardSkeleton } from "@/src/components/ui";

const NAVY = ["#0C2E63", "#071A3D"] as const;
const RANGES = ["Today", "Week", "Month", "All"] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

export default function MerchantHome() {
  const { colors, mode, toggleMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const brand = useBrand();
  const qc = useQueryClient();
  const [range, setRange] = useState<(typeof RANGES)[number]>("All");

  const overview = useQuery({ queryKey: ["merchant-overview"], queryFn: () => api.get<any>("/merchant/overview") });
  const notifs = useQuery({ queryKey: ["merchant-notifs"], queryFn: () => api.get<any[]>("/notifications") });
  const unread = (notifs.data || []).filter((n) => !n.read).length;

  const o = overview.data || {};
  const com = o.commission || {};
  const counts = o.counts || {};
  const wal = o.wallet || {};
  const activity: any[] = o.recent_activity || [];

  const rangeAmount = range === "Today" ? com.today : range === "Week" ? com.this_week : range === "Month" ? com.this_month : com.lifetime;

  const onRefresh = () => { qc.invalidateQueries({ queryKey: ["merchant-overview"] }); qc.invalidateQueries({ queryKey: ["merchant-notifs"] }); };

  const grid: { icon: MdiName; label: string; value: string; tone: string; route?: string }[] = [
    { icon: "account-group", label: "Customers", value: String(counts.customers ?? 0), tone: colors.success, route: "/(merchant)/customers" },
    { icon: "tools", label: "Partners", value: String(counts.partners ?? 0), tone: colors.info, route: "/merchant/network" },
    { icon: "account-check", label: "Active partners", value: String(counts.active_partners ?? 0), tone: colors.primary, route: "/merchant/network" },
    { icon: "swap-horizontal", label: "Transactions", value: String(counts.transactions ?? 0), tone: colors.warning },
    { icon: "account-cash", label: "From customers", value: fmtC(com.customer), tone: colors.success },
    { icon: "wrench", label: "From partners", value: fmtC(com.partner), tone: colors.info },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {/* Top bar */}
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: colors.primary, fontSize: fontSize.xl, fontWeight: "900", letterSpacing: 0.3, flex: 1 }}>{brand.branding.site_name}</Text>
        <Pressable testID="merchant-notifications" onPress={() => router.push("/notifications")} hitSlop={8} style={{ padding: 4, marginRight: 2 }}>
          <Icon name="bell-outline" size={24} color={colors.text} />
          {unread > 0 ? (
            <View style={{ position: "absolute", top: -1, right: -2, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable testID="merchant-theme-toggle" onPress={toggleMode} hitSlop={8} style={{ padding: 4, marginRight: 2 }}>
          <Icon name={mode === "dark" ? "weather-sunny" : "weather-night"} size={22} color={colors.text} />
        </Pressable>
        <Pressable testID="merchant-profile-chip" onPress={() => router.push("/(merchant)/profile")} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, paddingLeft: 3, paddingRight: 6, paddingVertical: 3 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{initials(user?.shop_name || user?.name)}</Text>
          </View>
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={overview.isFetching} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Greeting */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{initials(user?.shop_name || user?.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{greeting()}</Text>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }} numberOfLines={1}>{user?.shop_name || user?.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                <Icon name="store" size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{user?.city || user?.shop_type || "Merchant partner"}</Text>
                {user?.verified_merchant ? <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 4 }}><Icon name="check-decagram" size={12} color={colors.success} /><Text style={{ color: colors.success, fontSize: fontSize.xs, fontWeight: "700" }}>Verified</Text></View> : null}
              </View>
            </View>
            <Pressable onPress={() => router.push("/merchant/scanqr")} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
              <Icon name="qrcode" size={22} color={colors.primary} />
            </Pressable>
          </View>
        </Card>

        {/* Commission hero */}
        {overview.isLoading ? <CardSkeleton /> : (
          <LinearGradient colors={NAVY} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: spacing.lg }}>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.5 }}>COMMISSION · {range.toUpperCase()}</Text>
            <Text style={{ color: "#fff", fontSize: 34, fontWeight: "900", marginTop: 4 }}>{fmtC(rangeAmount)}</Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.md }}>
              {RANGES.map((r) => {
                const on = range === r;
                return (
                  <Pressable key={r} testID={`mrange-${r}`} onPress={() => setRange(r)} style={{ flex: 1, paddingVertical: 6, borderRadius: radius.sm, alignItems: "center", backgroundColor: on ? "#fff" : "rgba(255,255,255,0.12)" }}>
                    <Text style={{ color: on ? NAVY[0] : "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800" }}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              {[{ l: "TODAY", v: com.today }, { l: "THIS WEEK", v: com.this_week }, { l: "THIS MONTH", v: com.this_month }].map((t) => (
                <View key={t.l} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: radius.md, padding: spacing.sm }}>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 9, fontWeight: "700" }}>{t.l}</Text>
                  <Text style={{ color: "#fff", fontSize: fontSize.md, fontWeight: "800", marginTop: 2 }}>{fmtC(t.v)}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        )}

        {/* Available balance */}
        <Card>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700" }}>WALLET BALANCE</Text>
          <Text style={{ color: colors.text, fontSize: fontSize.xxl, fontWeight: "900", marginTop: 2 }}>{fmt(wal.available)}</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <View style={{ flex: 1, backgroundColor: colors.successSubtle, borderRadius: radius.md, padding: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>WITHDRAWABLE</Text>
              <Text style={{ color: colors.success, fontSize: fontSize.md, fontWeight: "800" }}>{fmt(wal.withdrawable)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.warningSubtle, borderRadius: radius.md, padding: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>PENDING</Text>
              <Text style={{ color: colors.warning, fontSize: fontSize.md, fontWeight: "800" }}>{fmt(wal.pending)}</Text>
            </View>
          </View>
          <Pressable testID="merchant-withdraw" onPress={() => router.push("/(merchant)/wallet")} style={{ marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <Icon name="bank-transfer-out" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: fontSize.md }}>Withdraw Money</Text>
          </Pressable>
        </Card>

        {/* Stats grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {grid.map((g) => (
            <Pressable key={g.label} testID={`mstat-${g.label}`} onPress={() => g.route && router.push(g.route as any)} style={{ width: "47.6%" }}>
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Icon name={g.icon} size={22} color={g.tone} />
                  {g.route ? <Icon name="chevron-right" size={18} color={colors.textMuted} /> : null}
                </View>
                <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900", marginTop: 6 }}>{g.value}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" }}>{g.label}</Text>
              </Card>
            </Pressable>
          ))}
        </View>

        {/* Quick actions */}
        <Card>
          <SectionTitle title="Quick actions" />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {([
              { icon: "account-group", label: "Customers", route: "/(merchant)/customers" },
              { icon: "account-network", label: "Network", route: "/merchant/network" },
              { icon: "trending-up", label: "Commission", route: "/merchant/commission" },
              { icon: "qrcode-scan", label: "My QR", route: "/merchant/scanqr" },
              { icon: "chart-box", label: "Analytics", route: "/merchant/analytics" },
              { icon: "wallet", label: "Wallet", route: "/(merchant)/wallet" },
            ] as { icon: MdiName; label: string; route: string }[]).map((q) => (
              <Pressable key={q.label} testID={`mqa-${q.label}`} onPress={() => router.push(q.route as any)} style={{ width: "33.3%", alignItems: "center", gap: 6, paddingVertical: spacing.sm }}>
                <View style={{ width: 50, height: 50, borderRadius: 15, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={q.icon} size={23} color={colors.primary} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>{q.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Recent activity */}
        <Card>
          <SectionTitle title="Recent activity" action="Commission" onAction={() => router.push("/merchant/commission")} />
          {overview.isLoading ? <CardSkeleton /> : activity.length === 0 ? (
            <EmptyState icon="history" title="No activity yet" subtitle="Commission & referral activity will appear here." />
          ) : (
            activity.slice(0, 12).map((a, i) => (
              <View key={a.id || i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: a.referral_type === "partner" ? colors.infoSubtle : colors.successSubtle, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={a.referral_type === "partner" ? "tools" : "account"} size={18} color={a.referral_type === "partner" ? colors.info : colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{a.name || "Referral"}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }} numberOfLines={1}>{a.service_name || a.referral_type} · {a.booking_code || timeAgo(a.created_at)}</Text>
                </View>
                {(a.earned ?? a.amount) != null ? <Text style={{ color: colors.success, fontWeight: "800", fontSize: fontSize.sm }}>+{fmt(a.earned ?? a.amount)}</Text> : null}
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
