import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp, CalendarDays, Filter, IndianRupee, Users, Network, PieChart as PieIcon, X } from "lucide-react-native";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { fmt, fmtC } from "@/src/lib/format";
import { Icon } from "@/src/components/Icon";
import { SLATE } from "@/src/components/qr/qrKit";
import { useFin, Surface, LockedCard, TAB } from "@/src/components/merchant/FinanceKit";
import { RangeCalendar } from "@/src/components/merchant/ReferralShared";
import { AreaTrend, StackedBars, Donut, Pt } from "@/src/components/merchant/AnalyticsCharts";

/* 1:1 port of web_panel/src/pages/merchant/MerchantAnalytics.jsx (mobile view). */
const PANEL = "/merchant/panel";
const iso = (d: Date) => d.toISOString().slice(0, 10);
type Preset = { key: string; label: string; days?: number; month?: boolean; custom?: boolean };
const PRESETS: Preset[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 Days", days: 6 },
  { key: "30d", label: "30 Days", days: 29 },
  { key: "90d", label: "90 Days", days: 89 },
  { key: "month", label: "This Month", month: true },
  { key: "custom", label: "Custom", custom: true },
];
const rangeFor = (p: Preset) => {
  const today = new Date();
  if (p.month) return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  const from = new Date(today); from.setDate(from.getDate() - (p.days || 0));
  return { from: iso(from), to: iso(today) };
};
const PIE_COLORS = ["#0ea5e9", "#8b5cf6"];
const SKY100 = "rgba(224,242,254,0.85)";

type KpiDef = { key: string; label: string; value: number; grad: [string, string]; icon: typeof IndianRupee };

/* gradient KPI card: rounded-2xl p-4 text-white bg-gradient-to-br shadow-md */
function KpiTile({ c }: { c: KpiDef }) {
  const Ic = c.icon;
  return (
    <LinearGradient colors={c.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} testID={`kpi-${c.key}`}
      style={{ flex: 1, minWidth: "45%", borderRadius: 16, padding: 16, overflow: "hidden", boxShadow: "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -2px rgba(0,0,0,0.1)" }}>
      <View style={{ position: "absolute", right: -12, top: -12, opacity: 0.2 }}><Ic size={64} color="#fff" strokeWidth={2} /></View>
      <Text style={{ fontSize: 11, lineHeight: 14, textTransform: "uppercase", letterSpacing: 0.55, fontWeight: "700", color: "rgba(255,255,255,0.85)" }} numberOfLines={1}>{c.label}</Text>
      <Text style={{ fontSize: 24, lineHeight: 32, fontWeight: "800", color: "#fff", marginTop: 4 }} numberOfLines={1}>{fmtC(c.value || 0)}</Text>
    </LinearGradient>
  );
}

/* chart card: bg-white rounded-2xl border p-4 · h3 font-bold + icon */
function ChartCard({ title, icon, children, testID }: { title: string; icon: React.ReactNode; children: React.ReactNode; testID: string }) {
  const { card, dark, strong } = useFin();
  return (
    <View testID={testID} style={{ backgroundColor: card, borderRadius: 16, borderWidth: 1, borderColor: dark ? SLATE[800] : SLATE[200], padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>{icon}<Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "700", color: strong }}>{title}</Text></View>
      {children}
    </View>
  );
}

export default function MerchantAnalytics({ title = "Business Analytics" }: { title?: string }) {
  const { P, dark, colors, heading, muted, card } = useFin();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const shopName = user?.shop_name || user?.name || "My Shop";

  const accessQ = useQuery({ queryKey: ["m-panel-access"], queryFn: () => api.get<any>(`${PANEL}/access`) });
  const approved = !!(accessQ.data?.approved || user?.kyc_status === "approved");

  const [preset, setPreset] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (preset === "custom" && custom.from && custom.to) return { from: custom.from, to: custom.to };
    return rangeFor(PRESETS.find((p) => p.key === preset) || PRESETS[2]);
  }, [preset, custom]);

  const load = useCallback(() => {
    setLoading(true);
    api.get<any>(`/merchant/analytics?date_from=${range.from}&date_to=${range.to}`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [range.from, range.to]);
  useEffect(() => { if (approved) load(); }, [approved, load]);

  const k = data?.kpis || {};
  const series: Pt[] = (data?.series || []).map((s: any) => ({ ...s, d: (s.date || "").slice(5) }));
  const breakdown: { name: string; value: number }[] = (data?.breakdown || []).filter((b: any) => b.value > 0);

  const kpiCards: KpiDef[] = [
    { key: "earning", label: "Total Commission", value: k.earning, grad: ["#10b981", "#047857"], icon: IndianRupee },
    { key: "customer_commission", label: "Customer Commission", value: k.customer_commission, grad: ["#0ea5e9", "#0369a1"], icon: Users },
    { key: "partner_commission", label: "Partner Commission", value: k.partner_commission, grad: ["#8b5cf6", "#6d28d9"], icon: Network },
    { key: "avg_per_day", label: "Avg / Day", value: k.avg_per_day, grad: [P[600], P[800]], icon: TrendingUp },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={P[700]} colors={[P[700]]} />}
        testID="merchant-analytics"
      >
        {/* Page header (MerchantDashboard.jsx) */}
        <View style={{ marginBottom: 16 }}>
          <Text testID="merchant-analytics-header" style={{ fontSize: 20, lineHeight: 28, fontWeight: "800", color: heading }} numberOfLines={1}>Analytics</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <Icon name="store" size={14} color={P[700]} />
            <Text style={{ fontSize: 12, lineHeight: 16, color: muted }} numberOfLines={1}>{shopName}</Text>
          </View>
        </View>

        {!accessQ.isLoading && !approved ? (
          <LockedCard completion={accessQ.data?.completion ?? 0} status={accessQ.data?.status} onGo={() => router.push("/merchant/profilekyc")} />
        ) : (
          <View style={{ gap: 20 }}>
            {/* header + presets */}
            <LinearGradient colors={["#0D47A1", "#1565C0", "#7c3aed"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0.15 }} end={{ x: 1, y: 0.85 }}
              style={{ borderRadius: 24, padding: 20, overflow: "hidden", boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.1), 0px 4px 6px -4px rgba(0,0,0,0.1)" }} testID="analytics-hero">
              <View pointerEvents="none" style={{ position: "absolute", left: "15%", top: "20%", height: 220, width: 220, marginLeft: -110, marginTop: -110, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.12)" }} />
              <View pointerEvents="none" style={{ position: "absolute", left: "85%", top: "80%", height: 180, width: 180, marginLeft: -90, marginTop: -90, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.1)" }} />
              <View style={{ gap: 12 }}>
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><TrendingUp size={24} color="#fff" /><Text style={{ fontSize: 20, lineHeight: 28, fontWeight: "800", color: "#fff" }}>{title}</Text></View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <CalendarDays size={16} color={SKY100} />
                    <Text testID="analytics-range-label" style={{ flex: 1, fontSize: 14, lineHeight: 20, color: SKY100 }}>{range.from} → {range.to} · {k.customers || 0} customers · {k.partners || 0} partners</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  {PRESETS.map((p) => {
                    const on = preset === p.key;
                    return (
                      <Pressable key={p.key} testID={`range-${p.key}`} onPress={() => { setPreset(p.key); setShowCustom(!!p.custom); }}
                        style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: on ? "#fff" : pressed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)", boxShadow: on ? "0px 1px 3px rgba(0,0,0,0.1), 0px 1px 2px -1px rgba(0,0,0,0.1)" : undefined })}>
                        {p.custom ? <Filter size={12} color={on ? P[700] : "#fff"} /> : null}
                        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color: on ? P[700] : "#fff" }}>{p.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {showCustom ? (
                <View testID="custom-range" style={{ marginTop: 12, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, color: "rgba(224,242,254,0.8)" }}>Custom range</Text>
                    <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "600", color: "#fff", ...TAB }}>{custom.from || "start"} → {custom.to || "end"}</Text>
                  </View>
                  <View style={{ borderRadius: 12, backgroundColor: "#fff", padding: 8 }}>
                    <RangeCalendar from={custom.from} to={custom.to} onPick={(f, t) => setCustom({ from: f, to: t })} />
                  </View>
                  <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
                    <Pressable testID="custom-apply" onPress={load} disabled={!custom.from || !custom.to}
                      style={({ pressed }) => ({ flex: 1, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? "#f0f9ff" : "#fff", opacity: !custom.from || !custom.to ? 0.5 : 1 })}>
                      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: P[700] }}>Apply</Text>
                    </Pressable>
                    <Pressable testID="custom-close" onPress={() => { setShowCustom(false); setPreset("30d"); }}
                      style={({ pressed }) => ({ height: 36, width: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)" })}>
                      <X size={16} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </LinearGradient>

            {/* KPI cards: grid-cols-2 gap-3 */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {kpiCards.map((c) => <KpiTile key={c.key} c={c} />)}
            </View>

            {loading ? (
              <View style={{ paddingVertical: 64, alignItems: "center", justifyContent: "center", backgroundColor: card, borderRadius: 16, borderWidth: 1, borderColor: dark ? SLATE[800] : SLATE[200] }} testID="analytics-loading">
                <ActivityIndicator size="large" color={P[600]} />
              </View>
            ) : (
              <>
                <ChartCard testID="chart-earnings" title="Commission Trend" icon={<IndianRupee size={16} color="#059669" />}>
                  <AreaTrend series={series} height={260} />
                </ChartCard>

                <ChartCard testID="chart-split" title="Customer vs Partner Commission" icon={<TrendingUp size={16} color={P[700]} />}>
                  <StackedBars series={series} height={240} />
                </ChartCard>

                <ChartCard testID="chart-breakdown" title="Commission Split" icon={<PieIcon size={16} color={P[700]} />}>
                  {breakdown.length === 0 ? (
                    <View style={{ height: 200, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 14, lineHeight: 20, color: SLATE[400] }}>No commission in range</Text></View>
                  ) : (
                    <>
                      <Donut data={breakdown} colors={PIE_COLORS} height={180} />
                      <View style={{ gap: 4, marginTop: 8 }}>
                        {breakdown.map((e, i) => (
                          <View key={e.name} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} /><Text style={{ fontSize: 12, lineHeight: 16, color: dark ? SLATE[300] : SLATE[600] }}>{e.name}</Text></View>
                            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: "#059669" }}>{fmt(e.value)}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </ChartCard>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
