import React from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import { useTheme, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { AppShellHeader } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt, fmtDate, initials } from "@/src/lib/format";
import { Card, EmptyState, CardSkeleton } from "@/src/components/ui";

/* ─────────────────────────────────────────────────────────────────────────
 * Merchant Home — 1:1 port of web web_panel/src/pages/merchant/MerchantHome.jsx
 * (+ referral/ReferralShared.jsx), the ACTUAL rendered web merchant home.
 *
 * FONT RULE (critical for number parity): we NEVER set an explicit
 * `fontFamily` on text. On Android, a weight-specific family
 * ("PublicSans-ExtraBold") + a `fontWeight` makes RN fall back to the system
 * font — which is exactly why the numbers didn't look like the web. Instead we
 * only set `fontWeight` and let installGlobalFont() (RN Text render patch) map
 * the weight → the correct Public Sans face. Numbers keep `tabular-nums`.
 * ──────────────────────────────────────────────────────────────────────── */

const HERO = ["#0A2A66", "#0D47A1", "#1565C0"] as const;
const AMBER = ["#F59E0B", "#F97316"] as const;

const TABULAR = { fontVariant: ["tabular-nums" as const] };
// web `.font-heading` → letter-spacing: -0.01em
const track = (px: number) => ({ letterSpacing: px * -0.01 });

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Referral-type badge — customer = sky, partner = violet (web sky-100/700, violet-100/700). */
function TypeBadge({ type }: { type?: string }) {
  const isCust = type === "customer";
  const bg = isCust ? "#E0F2FE" : "#EDE9FE";
  const fg = isCust ? "#0369A1" : "#6D28D9";
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>{isCust ? "Customer" : "Partner"}</Text>
    </View>
  );
}

type Kpi = { label: string; value: any; money?: boolean; primary?: boolean; sub?: string };

function chunk2<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

/** KPI card — matches web ReportCards (rounded-2xl=16, p-4=16, extrabold tabular numbers). */
function KpiCard({ c }: { c: Kpi }) {
  const { colors } = useTheme();
  const display = c.money ? fmt(c.value) : Number(c.value || 0).toLocaleString("en-IN");
  if (c.primary) {
    return (
      <LinearGradient colors={["#10B981", "#059669"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: 16, padding: spacing.lg }}>
        <Text style={{ color: "#ECFDF5", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }}>{c.label}</Text>
        <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 4, ...track(24), ...TABULAR }} numberOfLines={1}>{display}</Text>
        {c.sub ? <Text style={{ color: "rgba(236,253,245,0.9)", fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
      </LinearGradient>
    );
  }
  return (
    <Card padded={false} style={{ flex: 1, padding: spacing.lg, borderRadius: 16 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }} numberOfLines={1}>{c.label}</Text>
      <Text style={{ color: c.money ? colors.success : colors.text, fontSize: 18, fontWeight: "800", marginTop: 4, ...track(18), ...TABULAR }} numberOfLines={1}>{display}</Text>
      {c.sub ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
    </Card>
  );
}

/** 2-col grid with EQUAL-HEIGHT rows (mirrors web `grid grid-cols-2`). */
function ReportCards({ cards }: { cards: Kpi[] }) {
  return (
    <View style={{ gap: spacing.md }} testID="report-cards">
      {chunk2(cards).map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: spacing.md, alignItems: "stretch" }}>
          {row.map((c) => <KpiCard key={c.label} c={c} />)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

export default function MerchantHome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const overview = useQuery({ queryKey: ["merchant-overview"], queryFn: () => api.get<any>("/merchant/overview") });
  const codeQ = useQuery({ queryKey: ["merchant-my-code"], queryFn: () => api.get<any>("/merchant/my-code") });

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
    qc.invalidateQueries({ queryKey: ["partner-notifs"] });
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

  // Tones mirror web toneCls (sky-50/700, violet-50/700, emerald-50/700, primary-50/700). Icons = outline (line).
  const quick: { k: string; label: string; icon: MdiName; sub: string; route: string; bg: string; fg: string }[] = [
    { k: "customers", label: "My Customers", icon: "account-group-outline", sub: `${counts.customers || 0} referred`, route: "/(merchant)/customers", bg: "#F0F9FF", fg: "#0369A1" },
    { k: "network", label: "My Partners", icon: "account-network-outline", sub: `${counts.partners || 0} referred`, route: "/merchant/partners", bg: "#F5F3FF", fg: "#6D28D9" },
    { k: "earnings", label: "Commission", icon: "trending-up", sub: "earning history", route: "/merchant/commission", bg: "#ECFDF5", fg: "#047857" },
    { k: "scanqr", label: "Scan QR", icon: "qrcode", sub: "share & grow", route: "/merchant/scanqr", bg: colors.primarySubtle, fg: colors.primary },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={overview.isFetching} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="merchant-home"
      >
        {/* ── Hero (rounded-3xl = 24) ── */}
        <LinearGradient colors={HERO} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 20, overflow: "hidden" }}>
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="mhGlowW" cx="12%" cy="18%" r="62%">
                <Stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
                <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="mhGlowV" cx="88%" cy="82%" r="58%">
                <Stop offset="0" stopColor="#7C3AED" stopOpacity="0.32" />
                <Stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#mhGlowW)" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#mhGlowV)" />
          </Svg>

          {/* top row: merchant pill + avatar */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill }}>
              <Icon name="store-outline" size={14} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Merchant</Text>
            </View>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800", ...track(14) }}>{initials(shopName)}</Text>
            </View>
          </View>

          {/* greeting + shop name + verified */}
          <Text style={{ color: "rgba(224,242,254,0.8)", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.1, marginTop: 16 }}>{greeting()}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", ...track(24) }} numberOfLines={1}>{shopName}</Text>
            {user?.verified_merchant ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.9)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                <Icon name="shield-check-outline" size={12} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>Verified</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: "rgba(224,242,254,0.75)", fontSize: 13, marginTop: 4 }}>Here&apos;s how your referral business is performing today.</Text>

          {/* two cards: lifetime commission + merchant code (rounded-2xl = 16) */}
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: 16 }}>
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 14 }}>
              <Text style={{ color: "rgba(224,242,254,0.7)", fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }}>Lifetime Commission</Text>
              <Text testID="mh-total-earning" style={{ color: "#6EE7B7", fontSize: 24, fontWeight: "800", marginTop: 4, ...track(24), ...TABULAR }} numberOfLines={1}>{fmt(c.total)}</Text>
              <Text style={{ color: "rgba(224,242,254,0.7)", fontSize: 11, marginTop: 2 }}>{counts.transactions || 0} transactions</Text>
            </View>
            <Pressable testID="mh-merchant-code" onPress={copyCode} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <LinearGradient colors={AMBER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: "rgba(255,251,235,0.9)", fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }}>Merchant Code</Text>
                  <Icon name="content-copy" size={14} color="rgba(255,251,235,0.9)" />
                </View>
                <Text adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 4, letterSpacing: 1.2 }} numberOfLines={1}>{code || "—"}</Text>
                <Text style={{ color: "rgba(255,251,235,0.9)", fontSize: 11, marginTop: 2 }}>Tap to copy &amp; share</Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* actions (h-11 = 44, rounded-2xl = 16, text-[13px] font-bold) */}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 16 }}>
            <Pressable testID="mh-scan" onPress={() => router.push("/merchant/scanqr")} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Icon name="qrcode" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Scan &amp; Share QR</Text>
            </Pressable>
            <Pressable testID="mh-withdraw" onPress={() => router.push("/(merchant)/wallet")} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 16, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Icon name="cash" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Withdraw</Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* ── Quick actions (rounded-2xl = 16 cards · p-4 = 16 · equal-height rows) ── */}
        <View style={{ gap: spacing.md }} testID="mh-quick">
          {chunk2(quick).map((row, ri) => (
            <View key={ri} style={{ flexDirection: "row", gap: spacing.md, alignItems: "stretch" }}>
              {row.map((q) => (
                <Pressable key={q.k} testID={`mh-quick-${q.k}`} onPress={() => router.push(q.route as any)} style={{ flex: 1 }}>
                  <Card padded={false} style={{ flex: 1, padding: spacing.lg, borderRadius: 16 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: q.bg, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm }}>
                      <Icon name={q.icon} size={20} color={q.fg} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{q.label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{q.sub}</Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          ))}
        </View>

        {/* ── KPI report cards ── */}
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
            <Icon name="star-four-points-outline" size={16} color={colors.secondary} />
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", ...track(15) }}>Commission overview</Text>
          </View>
          {overview.isLoading ? <CardSkeleton /> : <ReportCards cards={kpiCards} />}
        </View>

        {/* ── Recent commission (rounded-2xl = 16) ── */}
        <Card padded={false} style={{ padding: spacing.lg, borderRadius: 16 }} testID="mh-recent">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", ...track(15) }}>Recent commission</Text>
            <Pressable testID="mh-recent-viewall" onPress={() => router.push("/merchant/commission")} hitSlop={8} style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>View all</Text>
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
                    <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{r.service_name || "Referral"}</Text>
                    <TypeBadge type={r.referral_type} />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{[r.name, fmtDate(r.created_at), r.booking_code].filter(Boolean).join(" · ")}</Text>
                </View>
                <Text style={{ color: colors.success, fontWeight: "800", fontSize: 14, ...TABULAR }}>{fmt(r.earned)}</Text>
              </View>
            ))
          )}
        </Card>

        {/* ── Wallet snapshot (rounded-2xl = 16) ── */}
        <Card padded={false} style={{ padding: spacing.lg, borderRadius: 16 }} testID="mh-wallet">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="wallet-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", ...track(15) }}>Wallet</Text>
            </View>
            <Pressable testID="mh-wallet-link" onPress={() => router.push("/(merchant)/wallet")} hitSlop={8}>
              <Icon name="chevron-right" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 2, ...track(28), ...TABULAR }}>{fmt(wallet.available || 0)}</Text>
          <View style={{ gap: 6, marginTop: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="cash" size={14} color="#10B981" />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Withdrawable</Text>
              </View>
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700", ...TABULAR }}>{fmt(wallet.withdrawable || 0)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="clock-outline" size={14} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Pending</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700", ...TABULAR }}>{fmt(wallet.pending || 0)}</Text>
            </View>
          </View>
          {/* h-10 = 40, rounded-xl = 12, text-[13px] font-semibold, bg primary-700 */}
          <Pressable testID="mh-wallet-withdraw" onPress={() => router.push("/(merchant)/wallet")} style={{ marginTop: spacing.md, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
            <Icon name="cash" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Withdraw</Text>
          </Pressable>
        </Card>

        {/* ── Privacy note (rounded-xl = 12) ── */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <View style={{ marginTop: 1 }}><Icon name="shield-check-outline" size={16} color={colors.success} /></View>
          <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 17, flex: 1 }}>
            You only see your referred customers, partners and your actual earned commission. Personal contact details are protected.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
