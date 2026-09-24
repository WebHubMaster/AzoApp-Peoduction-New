import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Svg, { Path, Line, Defs, LinearGradient as SvgGrad, Stop, Text as SvgText } from "react-native-svg";
import { api } from "@/src/api/client";
import { Icon, MdiName } from "@/src/components/Icon";
import { monotoneLine } from "@/src/components/LineChart";
import { KitCard, KitSeg, SLATE, EMERALD, VIOLET, AMBER, useQrPalette } from "@/src/components/qr/qrKit";

/* 1:1 port of web_panel/src/pages/merchant/scanqr/QRAnalytics.jsx */

const RANGES = [{ v: "7d", l: "7 Days" }, { v: "30d", l: "30 Days" }, { v: "90d", l: "90 Days" }, { v: "year", l: "This Year" }] as const;
type Range = (typeof RANGES)[number]["v"];

const timeAgo = (iso: string) => {
  try {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};
const num = (n: any) => Number(n ?? 0).toLocaleString("en-IN");

function Stat({ icon, label, value, bg, fg }: { icon: MdiName; label: string; value: string; bg: string; fg: string }) {
  const { heading } = useQrPalette();
  return (
    <KitCard style={{ width: "48.2%" }}>
      <View style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={fg} /></View>
      <Text style={{ fontSize: 24, lineHeight: 32, fontWeight: "800", color: heading, marginTop: 12, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.25, color: SLATE[400], marginTop: 2 }}>{label}</Text>
    </KitCard>
  );
}

/** recharts-style "nice" axis: 0 → niceMax in 4 steps, integers only */
function niceTicks(max: number) {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const raw = max / 4; const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) || pow * 10;
  const st = Math.max(1, Math.ceil(step));
  return [0, 1, 2, 3, 4].map((i) => i * st);
}

/** Scans vs Bookings — recharts AreaChart (monotone, gradient fill, dashed grid) */
function AreaChart({ data }: { data: { d: string; scans: number; bookings: number }[] }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const { dark, heading } = useQrPalette();
  const H = 220, padL = 34, padR = 8, padT = 5, padB = 20;
  const innerW = Math.max(1, w - padL - padR), innerH = H - padT - padB, baseY = padT + innerH;
  const ticks = niceTicks(Math.max(0, ...data.map((x) => Math.max(x.scans || 0, x.bookings || 0))));
  const yMax = ticks[ticks.length - 1] || 1;
  const n = Math.max(1, data.length - 1);
  const X = (i: number) => padL + (data.length === 1 ? innerW / 2 : (i / n) * innerW);
  const Y = (v: number) => padT + innerH - (v / yMax) * innerH;
  const pts = (k: "scans" | "bookings") => data.map((x, i) => ({ x: X(i), y: Y(x[k] || 0) }));
  const line = (k: "scans" | "bookings") => monotoneLine(pts(k));
  const area = (k: "scans" | "bookings") => { const p = pts(k); return p.length ? `${line(k)} L${p[p.length - 1].x},${baseY} L${p[0].x},${baseY} Z` : ""; };
  const labelEvery = Math.max(1, Math.ceil((data.length * 34) / Math.max(1, innerW)));
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const onTap = (e: any) => { if (!w || !data.length) return; const lx = e.nativeEvent.locationX ?? 0; setSel(Math.max(0, Math.min(data.length - 1, Math.round(((lx - padL) / innerW) * n)))); };
  const s = sel != null ? data[sel] : null;

  return (
    <Pressable onLayout={(e) => setW(e.nativeEvent.layout.width)} onPress={onTap} style={{ width: "100%", height: H }} testID="qra-chart">
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Defs>
            <SvgGrad id={`gS${uid}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#0D47A1" stopOpacity="0.35" /><Stop offset="1" stopColor="#0D47A1" stopOpacity="0" /></SvgGrad>
            <SvgGrad id={`gB${uid}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#10b981" stopOpacity="0.35" /><Stop offset="1" stopColor="#10b981" stopOpacity="0" /></SvgGrad>
          </Defs>
          {ticks.map((t) => (
            <React.Fragment key={t}>
              <Line x1={padL} x2={padL + innerW} y1={Y(t)} y2={Y(t)} stroke={dark ? SLATE[800] : "#eef2f7"} strokeWidth={1} strokeDasharray="3 3" />
              <SvgText x={padL - 6} y={Y(t) + 3.5} fontSize={10} fill={SLATE[400]} textAnchor="end">{String(t)}</SvgText>
            </React.Fragment>
          ))}
          {data.map((x, i) => {
            const last = i === data.length - 1;
            const show = last || (i % labelEvery === 0 && data.length - 1 - i >= labelEvery * 0.6);
            return show ? <SvgText key={x.d + i} x={X(i)} y={H - 4} fontSize={10} fill={SLATE[400]} textAnchor={i === 0 ? "start" : last ? "end" : "middle"}>{x.d}</SvgText> : null;
          })}
          {data.length ? <><Path d={area("scans")} fill={`url(#gS${uid})`} /><Path d={line("scans")} stroke="#0D47A1" strokeWidth={2} fill="none" /></> : null}
          {data.length ? <><Path d={area("bookings")} fill={`url(#gB${uid})`} /><Path d={line("bookings")} stroke="#10b981" strokeWidth={2} fill="none" /></> : null}
          {s && sel != null ? <Line x1={X(sel)} x2={X(sel)} y1={padT} y2={baseY} stroke={SLATE[400]} strokeWidth={1} strokeDasharray="3 3" /> : null}
        </Svg>
      ) : null}
      {s && sel != null ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 8, left: Math.min(Math.max(X(sel) - 60, 0), Math.max(0, w - 130)), width: 130, backgroundColor: dark ? SLATE[800] : "#fff", borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], borderRadius: 6, padding: 8 }}>
          <Text style={{ fontSize: 11, color: heading, marginBottom: 2 }}>{s.d}</Text>
          <Text style={{ fontSize: 11, color: "#0D47A1" }}>Scans : {s.scans}</Text>
          <Text style={{ fontSize: 11, color: "#10b981" }}>Bookings : {s.bookings}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function QrAnalytics() {
  const [range, setRange] = useState<Range>("30d");
  const { P, dark, heading, body } = useQrPalette();
  const q = useQuery({ queryKey: ["merchant-qr-analytics", range], queryFn: () => api.get<any>(`/merchant/panel/qr/analytics?range=${range}`) });
  const s = q.data || {};
  const chartData = ((s.series || []) as any[]).map((x) => ({ ...x, d: String(x.date || "").slice(5) }));
  const recent: any[] = s.recent || [];

  return (
    <View style={{ gap: 16 }} testID="qr-analytics">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="trending-up" size={20} color={P[700]} />
          <Text style={{ fontSize: 18, lineHeight: 28, fontWeight: "800", color: heading }}>QR Performance</Text>
        </View>
        <KitSeg items={RANGES as any} value={range} onChange={setRange} testidPrefix="qra-range" />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
        <Stat icon="qrcode" label="Total Scans" value={num(s.total_scans)} bg={dark ? "rgba(13,71,161,0.25)" : P[50]} fg={P[700]} />
        <Stat icon="account-multiple" label="Unique Visitors" value={num(s.unique_visitors)} bg={dark ? "rgba(124,58,237,0.2)" : VIOLET[50]} fg={VIOLET[600]} />
        <Stat icon="shopping" label="Bookings" value={num(s.bookings)} bg={dark ? "rgba(16,185,129,0.2)" : EMERALD[50]} fg={EMERALD[600]} />
        <Stat icon="trending-up" label="Conversion" value={`${s.conversion ?? 0}%`} bg={dark ? "rgba(217,119,6,0.2)" : AMBER[50]} fg={AMBER[600]} />
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        {[["This Month Scans", num(s.month_scans)], ["This Month Bookings", num(s.month_bookings)]].map(([l, v]) => (
          <KitCard key={l} style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.25, color: SLATE[400] }}>{l}</Text>
            <Text style={{ fontSize: 20, lineHeight: 28, fontWeight: "800", color: heading, marginTop: 4 }}>{v}</Text>
          </KitCard>
        ))}
      </View>

      <KitCard>
        <Text style={{ fontSize: 14, fontWeight: "600", color: body, marginBottom: 12 }}>Scans vs Bookings</Text>
        <AreaChart data={chartData} />
      </KitCard>

      <KitCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Icon name="calendar-clock" size={16} color={P[700]} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: body }}>Recent Activity</Text>
        </View>
        {recent.length === 0 ? (
          <Text style={{ fontSize: 14, color: SLATE[400], textAlign: "center", paddingVertical: 24 }}>No scans yet. Share your QR to start tracking.</Text>
        ) : (
          <View style={{ gap: 8 }} testID="qra-recent">
            {recent.map((a, i) => {
              const bk = a.type === "booking";
              return (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, borderBottomWidth: i === recent.length - 1 ? 0 : 1, borderBottomColor: dark ? SLATE[800] : SLATE[50] }}>
                  <View style={{ height: 32, width: 32, borderRadius: 8, backgroundColor: bk ? (dark ? "rgba(16,185,129,0.2)" : EMERALD[50]) : (dark ? "rgba(13,71,161,0.25)" : P[50]), alignItems: "center", justifyContent: "center" }}>
                    <Icon name={bk ? "shopping" : "qrcode"} size={16} color={bk ? EMERALD[600] : P[600]} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: dark ? SLATE[100] : SLATE[800] }} numberOfLines={1}>{a.label}</Text>
                    {a.city ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="map-marker" size={12} color={SLATE[400]} /><Text style={{ fontSize: 11, color: SLATE[400] }}>{a.city}</Text></View> : null}
                  </View>
                  <Text style={{ fontSize: 11, color: SLATE[400] }}>{timeAgo(a.at)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </KitCard>
    </View>
  );
}

export default QrAnalytics;
