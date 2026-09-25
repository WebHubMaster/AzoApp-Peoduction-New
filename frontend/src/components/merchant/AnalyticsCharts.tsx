import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Path, Rect, Line, Circle, Defs, LinearGradient as SvgGrad, Stop, Text as SvgText } from "react-native-svg";
import { monotoneLine } from "@/src/components/LineChart";
import { fmt } from "@/src/lib/format";

/* RN-SVG ports of the recharts blocks in web_panel/src/pages/merchant/MerchantAnalytics.jsx */
export type Pt = { d: string; earning: number; customer: number; partner: number };
const TICK = "#94a3b8";
const GRID = "#eef2f7";
const AXIS_W = 44; // recharts YAxis width={44}, margin left -12
const PAD_L = AXIS_W - 12;
const PAD_R = 8;
const PAD_T = 4;
const X_H = 30; // XAxis default height

/* recharts "nice" domain: 5 ticks from 0 → niceMax */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  return [0, 1, 2, 3, 4].map((i) => +(i * step).toFixed(6));
}
const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));

/* label indices honouring minTickGap=20 (label ≈ 30px wide @10px font) */
function xTickIdx(n: number, innerW: number): Set<number> {
  const step = n > 1 ? innerW / (n - 1) : innerW;
  const every = Math.max(1, Math.ceil(50 / step));
  const s = new Set<number>();
  for (let i = 0; i < n; i += every) s.add(i);
  return s;
}

function useUid(p: string) { return `${p}${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`; }

/* dark tooltip: rounded-xl bg-slate-900/95 px-3 py-2 text-xs */
function Tip({ label, rows, x, w }: { label: string; rows: { name: string; value: number; color: string }[]; x: number; w: number }) {
  const tw = 150;
  const left = Math.min(Math.max(x - tw / 2, 0), Math.max(0, w - tw));
  return (
    <View pointerEvents="none" style={{ position: "absolute", zIndex: 5, left, top: 0, width: tw, backgroundColor: "rgba(15,23,42,0.95)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.1)" }}>
      <Text style={{ color: "#fff", fontSize: 12, lineHeight: 16, fontWeight: "600", marginBottom: 4 }}>{label}</Text>
      {rows.map((r) => (
        <View key={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: r.color }} />
          <Text style={{ color: "#fff", fontSize: 12, lineHeight: 16 }}>{r.name}: <Text style={{ fontWeight: "700" }}>{fmt(r.value)}</Text></Text>
        </View>
      ))}
    </View>
  );
}

function Axes({ ticks, innerW, innerH, series, xIdx }: { ticks: number[]; innerW: number; innerH: number; series: Pt[]; xIdx: Set<number> }) {
  const n = series.length;
  const xAt = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const yAt = (v: number) => PAD_T + innerH - (v / (ticks[4] || 1)) * innerH;
  return (
    <>
      {ticks.map((t, i) => <Line key={i} x1={PAD_L} x2={PAD_L + innerW} y1={yAt(t)} y2={yAt(t)} stroke={GRID} strokeDasharray="3 3" strokeWidth={1} />)}
      {ticks.map((t, i) => <SvgText key={`y${i}`} x={PAD_L - 6} y={yAt(t) + 3.5} fontSize={10} fill={TICK} textAnchor="end">{fmtTick(t)}</SvgText>)}
      {series.map((s, i) => xIdx.has(i) ? <SvgText key={`x${i}`} x={xAt(i)} y={PAD_T + innerH + 16} fontSize={10} fill={TICK} textAnchor="middle">{s.d}</SvgText> : null)}
    </>
  );
}

/* ── AreaChart: monotone emerald area, dashed horizontal grid, no axis lines ── */
export function AreaTrend({ series, height = 260 }: { series: Pt[]; height?: number }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const uid = useUid("ga");
  const innerW = Math.max(1, w - PAD_L - PAD_R);
  const innerH = height - PAD_T - X_H;
  const ticks = niceTicks(Math.max(0, ...series.map((s) => s.earning || 0)));
  const top = ticks[4] || 1;
  const n = series.length;
  const pts = series.map((s, i) => ({ x: PAD_L + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2), y: PAD_T + innerH - ((s.earning || 0) / top) * innerH }));
  const line = monotoneLine(pts);
  const base = PAD_T + innerH;
  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z` : "";
  const onTap = (e: any) => {
    if (!w || !n) return;
    const lx = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    const i = Math.round(((lx - PAD_L) / innerW) * Math.max(1, n - 1));
    setSel(Math.max(0, Math.min(n - 1, i)));
  };
  const sp = sel != null ? pts[sel] : null;
  return (
    <Pressable onPress={onTap} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height, width: "100%" }} testID="area-chart">
      {sp && sel != null ? <Tip label={series[sel].d} rows={[{ name: "Commission", value: series[sel].earning || 0, color: "#10b981" }]} x={sp.x} w={w} /> : null}
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Defs><SvgGrad id={uid} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#10b981" stopOpacity="0.5" /><Stop offset="1" stopColor="#10b981" stopOpacity="0.03" /></SvgGrad></Defs>
          <Axes ticks={ticks} innerW={innerW} innerH={innerH} series={series} xIdx={xTickIdx(n, innerW)} />
          {sp ? <Line x1={sp.x} x2={sp.x} y1={PAD_T} y2={base} stroke="#cbd5e1" strokeDasharray="3 3" /> : null}
          {n ? <Path d={area} fill={`url(#${uid})`} /> : null}
          {n ? <Path d={line} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {sp ? <Circle cx={sp.x} cy={sp.y} r={4} fill="#fff" stroke="#10b981" strokeWidth={2} /> : null}
        </Svg>
      ) : null}
    </Pressable>
  );
}

/* ── stacked BarChart: Customer (sky) + Partner (violet, rounded top), legend ── */
export function StackedBars({ series, height = 240 }: { series: Pt[]; height?: number }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const LEGEND_H = 24;
  const plotH = height - LEGEND_H;
  const innerW = Math.max(1, w - PAD_L - PAD_R);
  const innerH = plotH - PAD_T - X_H;
  const ticks = niceTicks(Math.max(0, ...series.map((s) => (s.customer || 0) + (s.partner || 0))));
  const top = ticks[4] || 1;
  const n = series.length;
  const band = n ? innerW / n : innerW;
  const bw = Math.min(26, band * 0.8);
  const base = PAD_T + innerH;
  const hOf = (v: number) => ((v || 0) / top) * innerH;
  const xOf = (i: number) => PAD_L + band * i + (band - bw) / 2;
  const onTap = (e: any) => {
    if (!w || !n) return;
    const lx = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    setSel(Math.max(0, Math.min(n - 1, Math.floor((lx - PAD_L) / band))));
  };
  const roundedTop = (x: number, y: number, bwid: number, h: number, r: number) => {
    const rr = Math.min(r, h / 2, bwid / 2);
    return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + bwid - rr},${y} Q${x + bwid},${y} ${x + bwid},${y + rr} L${x + bwid},${y + h} Z`;
  };
  return (
    <View style={{ height, width: "100%" }} testID="bar-chart">
      <Pressable onPress={onTap} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: plotH, width: "100%" }}>
        {sel != null ? <Tip label={series[sel].d} rows={[{ name: "Customer", value: series[sel].customer || 0, color: "#0ea5e9" }, { name: "Partner", value: series[sel].partner || 0, color: "#8b5cf6" }]} x={xOf(sel) + bw / 2} w={w} /> : null}
        {w > 0 ? (
          <Svg width={w} height={plotH}>
            {sel != null ? <Rect x={PAD_L + band * sel} y={PAD_T} width={band} height={innerH} fill="#f1f5f9" /> : null}
            <Axes ticks={ticks} innerW={innerW} innerH={innerH} series={series} xIdx={xTickIdx(n, innerW)} />
            {series.map((s, i) => {
              const hc = hOf(s.customer), hp = hOf(s.partner);
              const x = xOf(i);
              return (
                <React.Fragment key={i}>
                  {hc > 0 ? <Rect x={x} y={base - hc} width={bw} height={hc} fill="#0ea5e9" /> : null}
                  {hp > 0 ? <Path d={roundedTop(x, base - hc - hp, bw, hp, 6)} fill="#8b5cf6" /> : null}
                </React.Fragment>
              );
            })}
          </Svg>
        ) : null}
      </Pressable>
      <View style={{ height: LEGEND_H, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 }}>
        {[["Customer", "#0ea5e9"], ["Partner", "#8b5cf6"]].map(([nm, c]) => (
          <View key={nm} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ height: 14, width: 14, backgroundColor: c }} />
            <Text style={{ fontSize: 11, lineHeight: 14, color: c }}>{nm}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── donut: innerRadius 44 / outerRadius 72 / paddingAngle 2 ── */
export function Donut({ data, colors, height = 180 }: { data: { name: string; value: number }[]; colors: string[]; height?: number }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const total = data.reduce((a, b) => a + (b.value || 0), 0) || 1;
  const cx = w / 2, cy = height / 2, R = 72, r = 44, pad = data.length > 1 ? 2 : 0;
  const arc = (a0: number, a1: number) => {
    const p = (a: number, rad: number) => ({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
    const o0 = p(a0, R), o1 = p(a1, R), i0 = p(a0, r), i1 = p(a1, r);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    return `M${o0.x},${o0.y} A${R},${R} 0 ${big} 1 ${o1.x},${o1.y} L${i1.x},${i1.y} A${r},${r} 0 ${big} 0 ${i0.x},${i0.y} Z`;
  };
  let a = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const span = ((d.value || 0) / total) * Math.PI * 2;
    const g = (pad * Math.PI) / 180;
    const s = { i, a0: a + g / 2, a1: a + span - g / 2 };
    a += span;
    return s;
  });
  const onTap = (e: any) => {
    const lx = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    const ly = e.nativeEvent.locationY ?? e.nativeEvent.offsetY ?? 0;
    const dx = lx - cx, dy = ly - cy, dist = Math.hypot(dx, dy);
    if (dist < r || dist > R) return setSel(null);
    let ang = Math.atan2(dy, dx); if (ang < -Math.PI / 2) ang += Math.PI * 2;
    const hit = slices.find((s) => ang >= s.a0 && ang <= s.a1);
    setSel(hit ? (sel === hit.i ? null : hit.i) : null);
  };
  return (
    <Pressable onPress={onTap} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height, width: "100%" }} testID="donut-chart">
      {sel != null ? <Tip label={data[sel].name} rows={[{ name: data[sel].name, value: data[sel].value, color: colors[sel % colors.length] }]} x={cx} w={w} /> : null}
      {w > 0 ? (
        <Svg width={w} height={height}>
          {slices.map((s) => (s.a1 > s.a0 ? <Path key={s.i} d={arc(s.a0, s.a1)} fill={colors[s.i % colors.length]} /> : null))}
        </Svg>
      ) : null}
    </Pressable>
  );
}
