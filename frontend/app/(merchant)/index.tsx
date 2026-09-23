import React from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt, fmtDate, initials } from "@/src/lib/format";
import { Card, EmptyState, CardSkeleton } from "@/src/components/ui";

// Hero gradient mirrors the web: linear-gradient(135deg,#0A2A66,#0D47A1,#1565C0)
const HERO = ["#0A2A66", "#0D47A1", "#1565C0"] as const;
const AMBER = ["#F59E0B", "#F97316"] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Referral-type badge — customer = sky, partner = violet (matches web TypeBadge). */
function TypeBadge({ type }: { type?: string }) {
  const isCust = type === "customer";
  const bg = isCust ? "rgba(2,132,199,0.12)" : "rgba(124,58,237,0.12)";
  const fg = isCust ? "#0284C7" : "#7C3AED";
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 }}>{isCust ? "Customer" : "Partner"}</Text>
    </View>
  );
}

type Kpi = { label: string; value: any; money?: boolean; primary?: boolean; sub?: string };

/** ReportCards — 2-col grid; primary card is an emerald gradient (matches web). */
function ReportCards({ cards }: { cards: Kpi[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }} testID="report-cards">
      {cards.map((c) => {
        const display = c.money ? fmt(c.value) : Number(c.value || 0).toLocaleString("en-IN");
        if (c.primary) {
          return (
            <LinearGradient key={c.label} colors={["#10B981", "#059669"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: "47.8%", borderRadius: radius.lg, padding: spacing.md }}>
              <Text style={{ color: "#ECFDF5", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>{c.label}</Text>
              <Text style={{ color: "#fff", fontSize: fontSize.xxl, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>{display}</Text>
              {c.sub ? <Text style={{ color: "rgba(236,253,245,0.9)", fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
            </LinearGradient>
          );
        }
        return (
          <View key={c.label} style={{ width: "47.8%" }}>
            <Card padded={false} style={{ padding: spacing.md }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }} numberOfLines={1}>{c.label}</Text>
              <Text style={{ color: c.money ? colors.success : colors.text, fontSize: fontSize.lg, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>{display}</Text>
              {c.sub ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

export default function MerchantHome() {
  const { colors, mode, toggleMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const brand = useBrand();
  const toast = useToast();
  const qc = useQueryClient();

  const overview = useQuery({ queryKey: ["merchant-overview"], queryFn: () => api.get<any>("/merchant/overview") });
  const codeQ = useQuery({ queryKey: ["merchant-my-code"], queryFn: () => api.get<any>("/merchant/my-code") });
  const notifs = useQuery({ queryKey: ["merchant-notifs"], queryFn: () => api.get<any[]>("/notifications") });
  const unread = (notifs.data || []).filter((n) => !n.read).length;

  const dash = overview.data || {};
  const c = dash.commission || {};
  const counts = dash.counts || {};
  const wallet = dash.wallet || {};
  const recent: any[] = dash.recent_activity || [];
  const code: string = codeQ.data?.merchant_code || "";
  const shopName = user?.shop_name || user?.name || "My Shop";

  const onRefresh = () => {
    qc.invalidateQueries({ queryKey: ["merchant-overview"] });
    qc.invalidateQueries({ queryKey: ["merchant-my-code"] });
    qc.invalidateQueries({ queryKey: ["merchant-notifs"] });
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      toast.success("Merchant code copied");
    } catch { /* clipboard blocked */ }
  };

  const kpiCards: Kpi[] = [
    { label: "Total Commission", value: c.total, money: true, primary: true, sub: `${counts.transactions || 0} transactions` },
    { label: "Customer Commission", value: c.customer, money: true },
    { label: "Partner Commission", value: c.partner, money: true },
    { label: "Referred Customers", value: counts.customers },
    { label: "Referred Partners", value: counts.partners, sub: `${counts.active_partners || 0} active` },
    { label: "This Month", value: c.this_month, money: true },
    { label: "Last Month", value: c.last_month, money: true },
    { label: "Today", value: c.today, money: true },
  ];

  const quick: { k: string; label: string; icon: MdiName; sub: string; route: string; bg: string; fg: string }[] = [
    { k: "customers", label: "My Customers", icon: "account-group", sub: `${counts.customers || 0} referred`, route: "/(merchant)/customers", bg: "rgba(2,132,199,0.12)", fg: "#0284C7" },
    { k: "network", label: "My Partners", icon: "account-network", sub: `${counts.partners || 0} referred`, route: "/merchant/network", bg: "rgba(124,58,237,0.12)", fg: "#7C3AED" },
    { k: "earnings", label: "Commission", icon: "trending-up", sub: "earning history", route: "/merchant/commission", bg: "rgba(5,150,105,0.12)", fg: "#059669" },
    { k: "scanqr", label: "Scan QR", icon: "qrcode", sub: "share & grow", route: "/merchant/scanqr", bg: colors.primarySubtle, fg: colors.primary },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {/* App top bar (native chrome) */}
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
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{initials(shopName)}</Text>
          </View>
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={overview.isFetching} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="merchant-home"
      >
        {/* ── Hero ── */}
        <LinearGradient colors={HERO} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: spacing.lg, overflow: "hidden" }}>
          {/* top row: merchant pill + avatar */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill }}>
              <Icon name="store" size={14} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Merchant</Text>
            </View>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>{initials(shopName)}</Text>
            </View>
          </View>

          {/* greeting + shop name + verified */}
          <Text style={{ color: "rgba(224,242,254,0.8)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 16 }}>{greeting()}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
            <Text style={{ color: "#fff", fontSize: 26, fontWeight: "900" }} numberOfLines={1}>{shopName}</Text>
            {user?.verified_merchant ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(16,185,129,0.9)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                <Icon name="shield-check" size={11} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>Verified</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: "rgba(224,242,254,0.75)", fontSize: 13, marginTop: 4 }}>Here&apos;s how your referral business is performing today.</Text>

          {/* two cards: lifetime commission + merchant code */}
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: 16 }}>
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: radius.lg, padding: 14 }}>
              <Text style={{ color: "rgba(224,242,254,0.7)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Lifetime Commission</Text>
              <Text testID="mh-total-earning" style={{ color: "#6EE7B7", fontSize: fontSize.xxl, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>{fmt(c.total)}</Text>
              <Text style={{ color: "rgba(224,242,254,0.7)", fontSize: 11, marginTop: 2 }}>{counts.transactions || 0} transactions</Text>
            </View>
            <Pressable testID="mh-merchant-code" onPress={copyCode} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <LinearGradient colors={AMBER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: "rgba(255,251,235,0.9)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Merchant Code</Text>
                  <Icon name="content-copy" size={13} color="rgba(255,251,235,0.9)" />
                </View>
                <Text style={{ color: "#fff", fontSize: fontSize.xxl, fontWeight: "900", marginTop: 4, letterSpacing: 1.5 }} numberOfLines={1}>{code || "—"}</Text>
                <Text style={{ color: "rgba(255,251,235,0.9)", fontSize: 11, marginTop: 2 }}>Tap to copy &amp; share</Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* actions */}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 16 }}>
            <Pressable testID="mh-scan" onPress={() => router.push("/merchant/scanqr")} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: radius.lg, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Icon name="qrcode" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>Scan &amp; Share QR</Text>
            </Pressable>
            <Pressable testID="mh-withdraw" onPress={() => router.push("/(merchant)/wallet")} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Icon name="cash" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>Withdraw</Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* ── Quick actions ── */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }} testID="mh-quick">
          {quick.map((q) => (
            <Pressable key={q.k} testID={`mh-quick-${q.k}`} onPress={() => router.push(q.route as any)} style={{ width: "47.8%" }}>
              <Card padded={false} style={{ padding: spacing.md }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: q.bg, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm }}>
                  <Icon name={q.icon} size={20} color={q.fg} />
                </View>
                <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "800" }}>{q.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{q.sub}</Text>
              </Card>
            </Pressable>
          ))}
        </View>

        {/* ── KPI report cards ── */}
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
            <Icon name="star-four-points" size={16} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "800" }}>Commission overview</Text>
          </View>
          {overview.isLoading ? <CardSkeleton /> : <ReportCards cards={kpiCards} />}
        </View>

        {/* ── Recent commission ── */}
        <Card padded={false} style={{ padding: spacing.lg }} testID="mh-recent">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "800" }}>Recent commission</Text>
            <Pressable testID="mh-recent-viewall" onPress={() => router.push("/merchant/commission")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>View all</Text>
              <Icon name="chevron-right" size={16} color={colors.primary} />
            </Pressable>
          </View>
          {overview.isLoading ? (
            <CardSkeleton />
          ) : recent.length === 0 ? (
            <EmptyState icon="trending-up" title="No commission earned yet" subtitle={`Share your QR / merchant code ${code || ""} to start earning.`} />
          ) : (
            recent.map((r, i) => (
              <View key={r.id || i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm, flexShrink: 1 }} numberOfLines={1}>{r.service_name || "Referral"}</Text>
                    <TypeBadge type={r.referral_type} />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{[r.name, fmtDate(r.created_at), r.booking_code].filter(Boolean).join(" · ")}</Text>
                </View>
                <Text style={{ color: colors.success, fontWeight: "900", fontSize: fontSize.sm }}>{fmt(r.earned)}</Text>
              </View>
            ))
          )}
        </Card>

        {/* ── Wallet snapshot ── */}
        <Card padded={false} style={{ padding: spacing.lg }} testID="mh-wallet">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="wallet" size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "800" }}>Wallet</Text>
            </View>
            <Pressable testID="mh-wallet-link" onPress={() => router.push("/(merchant)/wallet")} hitSlop={8}>
              <Icon name="chevron-right" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: "900" }}>{fmt(wallet.available || 0)}</Text>
          <View style={{ gap: 6, marginTop: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="cash" size={14} color={colors.success} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Withdrawable</Text>
              </View>
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: "800" }}>{fmt(wallet.withdrawable || 0)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="clock-outline" size={14} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Pending</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{fmt(wallet.pending || 0)}</Text>
            </View>
          </View>
          <Pressable testID="mh-wallet-withdraw" onPress={() => router.push("/(merchant)/wallet")} style={{ marginTop: spacing.md, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
            <Icon name="cash" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>Withdraw</Text>
          </Pressable>
        </Card>

        {/* ── Privacy note ── */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 }}>
          <View style={{ marginTop: 1 }}><Icon name="shield-check" size={16} color={colors.success} /></View>
          <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 17, flex: 1 }}>
            You only see your referred customers, partners and your actual earned commission. Personal contact details are protected.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
