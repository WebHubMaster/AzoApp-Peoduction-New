import React from "react";
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
import { fmt, timeAgo, initials } from "@/src/lib/format";
import { Card, SectionTitle, EmptyState, CardSkeleton } from "@/src/components/ui";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

export default function AgentHome() {
  const { colors, mode, toggleMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const brand = useBrand();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["agent-me"], queryFn: () => api.get<any>("/agent/me") });
  const earnings = useQuery({ queryKey: ["agent-earnings"], queryFn: () => api.get<any>("/agent/earnings") });
  const batches = useQuery({ queryKey: ["agent-batches"], queryFn: () => api.get<any>("/admin/physical-qr/batches") });

  const w = me.data?.wallet || {};
  const cfg = me.data?.config || {};
  const rows: any[] = earnings.data?.earnings || [];
  const bList: any[] = batches.data?.batches || [];
  const unassigned = bList.reduce((s, b) => s + (b.unassigned || 0), 0);

  const onRefresh = () => {
    qc.invalidateQueries({ queryKey: ["agent-me"] });
    qc.invalidateQueries({ queryKey: ["agent-earnings"] });
    qc.invalidateQueries({ queryKey: ["agent-batches"] });
  };

  const grid: { icon: MdiName; label: string; value: string; tone: string }[] = [
    { icon: "qrcode-plus", label: "QRs mapped", value: String(w.mappings ?? 0), tone: colors.success },
    { icon: "sticker-check-outline", label: "To map", value: String(unassigned), tone: colors.warning },
    { icon: "package-variant-closed", label: "My batches", value: String(bList.length), tone: colors.info },
    { icon: "cash", label: "Per mapping", value: fmt(cfg.commission_per_mapping), tone: colors.primary },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: colors.primary, fontSize: fontSize.xl, fontWeight: "900", letterSpacing: 0.3, flex: 1 }}>{brand.branding.site_name}</Text>
        <Pressable testID="agent-notifications" onPress={() => router.push("/notifications")} hitSlop={8} style={{ padding: 4, marginRight: 2 }}>
          <Icon name="bell-outline" size={24} color={colors.text} />
        </Pressable>
        <Pressable testID="agent-theme-toggle" onPress={toggleMode} hitSlop={8} style={{ padding: 4, marginRight: 2 }}>
          <Icon name={mode === "dark" ? "weather-sunny" : "weather-night"} size={22} color={colors.text} />
        </Pressable>
        <Pressable testID="agent-profile-chip" onPress={() => router.push("/(agent)/profile")} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, paddingLeft: 3, paddingRight: 6, paddingVertical: 3 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{initials(user?.name)}</Text>
          </View>
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={me.isFetching} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Greeting */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{initials(user?.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{greeting()}</Text>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }} numberOfLines={1}>{user?.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                <Icon name="map-marker-radius" size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>Field QR Agent</Text>
              </View>
            </View>
            <Pressable testID="agent-map-shortcut" onPress={() => router.push("/(agent)/map")} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
              <Icon name="qrcode-scan" size={22} color={colors.primary} />
            </Pressable>
          </View>
        </Card>

        {/* Wallet hero */}
        {me.isLoading ? <CardSkeleton /> : (
          <LinearGradient colors={[colors.primary, colors.primaryHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: spacing.lg }}>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.5 }}>AVAILABLE BALANCE</Text>
            <Text style={{ color: "#fff", fontSize: 34, fontWeight: "900", marginTop: 4 }}>{fmt(w.available)}</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              {[{ l: "EARNED", v: w.total_earned }, { l: "PENDING", v: w.pending }, { l: "WITHDRAWN", v: w.withdrawn }].map((t) => (
                <View key={t.l} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, padding: spacing.sm }}>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 9, fontWeight: "700" }}>{t.l}</Text>
                  <Text style={{ color: "#fff", fontSize: fontSize.md, fontWeight: "800", marginTop: 2 }}>{fmt(t.v)}</Text>
                </View>
              ))}
            </View>
            <Pressable testID="agent-withdraw-cta" onPress={() => router.push("/(agent)/wallet")} style={{ marginTop: spacing.md, backgroundColor: "#fff", borderRadius: radius.md, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
              <Icon name="bank-transfer-out" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>Wallet & Withdraw</Text>
            </Pressable>
          </LinearGradient>
        )}

        {/* Map CTA */}
        <Pressable testID="agent-map-cta" onPress={() => router.push("/(agent)/map")}>
          <LinearGradient colors={["#F59E0B", "#B45309"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
              <Icon name="qrcode-scan" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: fontSize.lg }}>Map a QR sticker</Text>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.xs, marginTop: 2 }}>Link a sticker to a merchant & earn {fmt(cfg.commission_per_mapping)}</Text>
            </View>
            <Icon name="arrow-right" size={22} color="#fff" />
          </LinearGradient>
        </Pressable>

        {/* Stats grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {grid.map((g) => (
            <View key={g.label} style={{ width: "47.6%" }}>
              <Card>
                <Icon name={g.icon} size={22} color={g.tone} />
                <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900", marginTop: 6 }}>{g.value}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" }}>{g.label}</Text>
              </Card>
            </View>
          ))}
        </View>

        {/* Assigned batches */}
        <Card>
          <SectionTitle title="My batches" action="Map QR" onAction={() => router.push("/(agent)/map")} />
          {batches.isLoading ? <CardSkeleton /> : bList.length === 0 ? (
            <EmptyState icon="package-variant" title="No batches assigned" subtitle="An admin will assign QR sticker batches to you." />
          ) : (
            bList.map((b, i) => (
              <View key={b.batch_id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="qrcode" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{b.batch_name || "Batch"}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}>{b.active || 0} mapped · {b.unassigned || 0} to map · {b.total || 0} total</Text>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* Recent earnings */}
        <Card>
          <SectionTitle title="Recent earnings" action="Wallet" onAction={() => router.push("/(agent)/wallet")} />
          {earnings.isLoading ? <CardSkeleton /> : rows.length === 0 ? (
            <EmptyState icon="cash-remove" title="No earnings yet" subtitle="Map a QR sticker to a merchant to start earning." />
          ) : (
            rows.slice(0, 12).map((r, i) => (
              <View key={r.id || i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.successSubtle, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="store-check" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{r.merchant_name || "Merchant"}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }} numberOfLines={1}>{r.token} · {timeAgo(r.at)}</Text>
                </View>
                <Text style={{ color: colors.success, fontWeight: "800", fontSize: fontSize.sm }}>+{fmt(r.amount)}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
