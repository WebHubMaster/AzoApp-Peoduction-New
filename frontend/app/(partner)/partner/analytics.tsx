import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, TextInput } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Rect, Line, Text as SvgText } from "react-native-svg";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader, Surface } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { LineChart } from "@/src/components/LineChart";
import { fmtC } from "@/src/lib/format";

const SLATE400 = "#94A3B8";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PRESETS = [
  { key: "today", label: "Today", days: 0 }, { key: "7d", label: "7 Days", days: 6 }, { key: "30d", label: "30 Days", days: 29 },
  { key: "90d", label: "90 Days", days: 89 }, { key: "month", label: "This Month", month: true }, { key: "custom", label: "Custom", custom: true },
] as const;
const PIE = ["#097CF6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b", "#0ea5e9"];
const KPIS: { key: string; label: string; icon: MdiName; money?: boolean; pct?: boolean; grad: [string, string] }[] = [
  { key: "earning", label: "Earnings", icon: "currency-inr", money: true, grad: ["#097CF6", "#075BB6"] },
  { key: "jobs", label: "Jobs", icon: "briefcase-outline", grad: ["#0EA5E9", "#0369A1"] },
  { key: "completed", label: "Completed", icon: "check-circle-outline", grad: ["#10B981", "#047857"] },
  { key: "completion_rate", label: "Completion", icon: "pulse", pct: true, grad: ["#D946EF", "#A21CAF"] },
];

function BarChart({ data }: { data: { date: string; jobs: number }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const [vw, setVw] = useState(0);
  const W = 300, H = 160, padL = 26, padB = 18, padT = 8;
  const max = Math.max(1, ...data.map((d) => d.jobs || 0));
  const innerW = W - padL - 6, innerH = H - padB - padT;
  const bw = Math.max(2, (innerW / Math.max(1, data.length)) * 0.6);
  const step = innerW / Math.max(1, data.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const lblEvery = Math.max(1, Math.ceil(data.length / 6));
  const onTap = (e: any) => { if (!vw || !data.length) return; const lx = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0; const xv = (lx / vw) * W; setSel(Math.max(0, Math.min(data.length - 1, Math.floor((xv - padL) / step)))); };
  return (
    <Pressable onPress={onTap} onLayout={(e) => setVw(e.nativeEvent.layout.width)} testID="bar-chart">
      {sel != null && data[sel] ? (
        <View pointerEvents="none" style={{ position: "absolute", zIndex: 5, top: 0, left: Math.min(Math.max(((padL + sel * step + step / 2) / W) * vw - 55, 0), vw - 110), width: 110, backgroundColor: "rgba(15,23,42,0.95)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{data[sel].date}</Text>
          <Text style={{ color: "#fff", fontSize: 11 }}><Text style={{ color: "#A78BFA" }}>● </Text>Jobs: <Text style={{ fontWeight: "800" }}>{data[sel].jobs}</Text></Text>
        </View>
      ) : null}
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((t, i) => { const y = padT + innerH - t * innerH; return (<React.Fragment key={i}><Line x1={padL} x2={W - 6} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" /><SvgText x={padL - 4} y={y + 3} fontSize="8" fill={SLATE400} textAnchor="end">{Math.round(t * max)}</SvgText></React.Fragment>); })}
      {data.map((d, i) => { const h = ((d.jobs || 0) / max) * innerH; return <Rect key={i} x={padL + i * step + (step - bw) / 2} y={padT + innerH - h} width={bw} height={h} rx={3} fill={sel === i ? "#5B21B6" : "#7C3AED"} />; })}
      {data.map((d, i) => (i % lblEvery === 0 || i === data.length - 1) && data.length > 1 ? <SvgText key={`l${i}`} x={padL + i * step + step / 2} y={H - 4} fontSize="8" fill={SLATE400} textAnchor="middle">{d.date.slice(5)}</SvgText> : null)}
    </Svg>
    </Pressable>
  );
}

function Donut({ parts, sel }: { parts: { name: string; value: number }[]; sel: number | null }) {
  const size = 150, stroke = 28, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let acc = 0;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      {parts.map((p, i) => { const len = (p.value / total) * c; const el = <Circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PIE[i % PIE.length]} strokeWidth={sel === i ? stroke + 8 : stroke} opacity={sel == null || sel === i ? 1 : 0.35} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} />; acc += len; return el; })}
    </Svg>
  );
}

/** Web PremiumAnalytics (role=partner, title "Earnings Analytics") */
export default function PartnerAnalytics() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [preset, setPreset] = useState<string>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [showCustom, setShowCustom] = useState(false);

  const range = useMemo(() => {
    if (preset === "custom" && custom.from && custom.to) return { from: custom.from, to: custom.to };
    const p = PRESETS.find((x) => x.key === preset) || PRESETS[2];
    const today = new Date();
    if ((p as any).month) return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    const from = new Date(today); from.setDate(from.getDate() - ((p as any).days || 0));
    return { from: iso(from), to: iso(today) };
  }, [preset, custom]);

  const q = useQuery({ queryKey: ["partner-analytics", range.from, range.to], queryFn: () => api.get<any>(`/partner/analytics?date_from=${range.from}&date_to=${range.to}`) });
  const [slice, setSlice] = useState<number | null>(null);
  const d = q.data; const k = d?.kpis || {}; const series: any[] = d?.series || []; const status: any[] = d?.status_breakdown || []; const rt = d?.ratings;
  const Card = ({ icon, title, children, testID }: { icon: MdiName; title: string; children: React.ReactNode; testID?: string }) => (
    <Surface testID={testID} style={{ padding: 20 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}><Icon name={icon} size={18} color={colors.secondary} /><Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{title}</Text></View>{children}</Surface>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 16 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ["partner-analytics"] })} tintColor={colors.primary} colors={[colors.primary]} />}>
        {/* Header */}
        <LinearGradient colors={[colors.secondary, "#4338CA", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 20 }} testID="partner-analytics-header">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="trending-up" size={22} color="#fff" /><Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>Earnings Analytics</Text></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}><Icon name="calendar-month-outline" size={14} color="#BFDBFE" /><Text style={{ color: "#BFDBFE", fontSize: 13 }}>{range.from} → {range.to}</Text></View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {PRESETS.map((p) => { const on = preset === p.key; return (
              <Pressable key={p.key} testID={`range-${p.key}`} onPress={() => { setPreset(p.key); if ((p as any).custom) setShowCustom(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? "#fff" : "rgba(255,255,255,0.15)" }}>
                {(p as any).custom ? <Icon name="filter-variant" size={14} color={on ? colors.secondary : "#fff"} /> : null}<Text style={{ color: on ? colors.secondary : "#fff", fontSize: 13, fontWeight: "600" }}>{p.label}</Text>
              </Pressable>); })}
          </View>
          {showCustom && preset === "custom" ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              {(["from", "to"] as const).map((f) => <TextInput key={f} testID={`custom-${f}`} value={custom[f]} onChangeText={(v) => setCustom({ ...custom, [f]: v })} placeholder={`${f === "from" ? "From" : "To"} YYYY-MM-DD`} placeholderTextColor="rgba(255,255,255,0.6)" style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", color: "#fff", paddingHorizontal: 12, fontSize: 13 }} />)}
            </View>
          ) : null}
        </LinearGradient>

        {/* KPIs */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
          {KPIS.map((x) => (
            <LinearGradient key={x.key} colors={x.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "48%", borderRadius: 16, padding: 16, overflow: "hidden", minHeight: 96 }}>
              <View style={{ position: "absolute", right: -8, top: -8, opacity: 0.15 }}><Icon name={x.icon} size={72} color="#fff" /></View>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>{x.label}</Text>
              <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 6 }} numberOfLines={1}>{q.isLoading ? "…" : x.money ? fmtC(k[x.key]) : x.pct ? `${k[x.key] ?? 0}%` : k[x.key] ?? 0}</Text>
            </LinearGradient>
          ))}
        </View>

        <Card icon="currency-inr" title="Earnings Trend" testID="chart-earnings"><LineChart data={series.map((s) => ({ date: s.date, earning: s.earning }))} height={180} /></Card>
        <Card icon="briefcase-outline" title="Jobs per Day" testID="chart-jobs"><BarChart data={series} /></Card>
        <Card icon="chart-donut" title="Status Split" testID="chart-status">
          {status.length === 0 ? <Text style={{ color: SLATE400, textAlign: "center", paddingVertical: 24 }}>No jobs in this range.</Text> : (
            <>
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <Donut parts={status} sel={slice} />
                {slice != null && status[slice] ? <View style={{ position: "absolute", top: 62, alignItems: "center" }}><Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{status[slice].value}</Text><Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "capitalize" }}>{status[slice].name.replace(/_/g, " ")} · {Math.round((status[slice].value / (status.reduce((a, b) => a + b.value, 0) || 1)) * 100)}%</Text></View> : null}
              </View>
              <View style={{ gap: 8, marginTop: 8 }}>{status.map((s, i) => <Pressable key={s.name} testID={`status-${s.name}`} onPress={() => setSlice(slice === i ? null : i)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: slice == null || slice === i ? 1 : 0.5 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PIE[i % PIE.length] }} /><Text style={{ color: colors.textSecondary, fontSize: 14, textTransform: "capitalize" }}>{s.name.replace(/_/g, " ")}</Text></View><Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{s.value}</Text></Pressable>)}</View>
            </>
          )}
        </Card>

        {rt ? (
          <>
            <Surface style={{ padding: 20, alignItems: "center" }} testID="chart-ratings">
              <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>Average rating</Text>
              <Text style={{ color: "#F59E0B", fontSize: 48, fontWeight: "800", marginTop: 4 }}>{rt.avg || 0}</Text>
              <Text style={{ fontSize: 18, letterSpacing: 2 }}>{[1, 2, 3, 4, 5].map((s) => <Text key={s} style={{ color: s <= Math.round(rt.avg || 0) ? "#FBBF24" : "#E2E8F0" }}>★</Text>)}</Text>
              <Text style={{ color: SLATE400, fontSize: 12, marginTop: 4 }}>{rt.count || 0} reviews</Text>
            </Surface>
            <Surface style={{ padding: 20 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12 }}>Rating Breakdown</Text>
              <View style={{ gap: 10 }}>
                {(rt.distribution || []).map((x: any) => { const total = rt.count || 1; const pct = Math.round((x.count / total) * 100); return (
                  <View key={x.star} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, width: 24 }}>{x.star}★</Text>
                    <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceSubtle, overflow: "hidden" }}><View style={{ width: `${pct}%`, height: 10, backgroundColor: "#FBBF24", borderRadius: 5 }} /></View>
                    <Text style={{ color: colors.textMuted, fontSize: 13, width: 20, textAlign: "right" }}>{x.count}</Text>
                  </View>); })}
              </View>
            </Surface>
            {(rt.recent || []).length > 0 ? (
              <Surface style={{ padding: 20 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12 }}>Recent Reviews</Text>
                <View style={{ gap: 8 }}>
                  {rt.recent.map((r: any, i: number) => (
                    <View key={i} style={{ borderRadius: 12, backgroundColor: colors.surfaceSubtle, padding: 12 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 13, letterSpacing: 1 }}>{[1, 2, 3, 4, 5].map((s) => <Text key={s} style={{ color: s <= r.rating ? "#FBBF24" : "#E2E8F0" }}>★</Text>)}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r.date} · {r.service}</Text>
                      </View>
                      {r.comment ? <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6 }}>{r.comment}</Text> : null}
                      <Text style={{ color: SLATE400, fontSize: 12, marginTop: 4 }}>— {r.customer}</Text>
                    </View>
                  ))}
                </View>
              </Surface>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
