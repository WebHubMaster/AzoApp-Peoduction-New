import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { useTheme } from "@/src/theme";
import { fmtC } from "@/src/lib/format";

/* Unique, SVG-safe gradient id per mounted chart instance. Prevents duplicate
   `url(#id)` references from colliding when several charts are on screen (a real
   native react-native-svg gotcha). */
let _uidCounter = 0;
function useUid(prefix: string) {
  const ref = React.useRef<string | null>(null);
  if (!ref.current) {
    _uidCounter += 1;
    ref.current = `${prefix}${_uidCounter}`;
  }
  return ref.current;
}

type Pt = { x: number; y: number };

/* Monotone cubic interpolation (the SAME curve recharts/d3 draw for
   `type="monotone"`). Produces smooth, natural-looking trend lines instead of
   sharp zig-zag segments — so sparse data (e.g. one big earning day) reads as a
   flowing curve rather than a flat line with a spike. */
function monotoneTangents(pts: Pt[]): number[] {
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else t[i] = (m[i - 1] + m[i]) / 2;
  }
  // Fritsch–Carlson: clamp tangents so the interpolant stays monotone.
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        t[i] = tau * a * m[i];
        t[i + 1] = tau * b * m[i];
      }
    }
  }
  return t;
}

function monotoneLine(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const t = monotoneTangents(pts);
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const { x: x0, y: y0 } = pts[i];
    const { x: x1, y: y1 } = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + h * t[i]} ${x1 - h},${y1 - h * t[i + 1]} ${x1},${y1}`;
  }
  return d;
}

/** Simple line chart for earnings trend (web-style with y-axis + smooth area
 *  fill). Fully responsive: it measures its own width and renders in real
 *  pixels, so the stroke stays crisp and undistorted on any device. */
export function LineChart({ data, height = 140, money = true, label = "Earnings" }: { data: { date: string; earning: number }[]; height?: number; money?: boolean; label?: string }) {
  const { colors } = useTheme();
  const [sel, setSel] = useState<number | null>(null);
  const [vw, setVw] = useState(0);
  const uid = useUid("lc");
  const H = height;
  const padL = 40;
  const padR = 8;
  const padB = 20;
  const padT = 12;
  const vals = data.map((d) => d.earning || 0);
  const maxV = Math.max(...vals, 0);
  const max = maxV > 0 ? maxV * 1.12 : 1; // headroom so the peak isn't clipped
  const innerW = Math.max(1, vw - padL - padR);
  const innerH = H - padB - padT;
  const baseY = padT + innerH;
  const single = data.length === 1;
  const n = Math.max(1, data.length - 1);
  const pts: Pt[] = data.map((d, i) => ({
    x: padL + (single ? innerW / 2 : (i / n) * innerW),
    y: padT + innerH - ((d.earning || 0) / max) * innerH,
  }));
  const linePath = monotoneLine(pts);
  const areaPath = pts.length
    ? `${linePath} L${pts[pts.length - 1].x},${baseY} L${pts[0].x},${baseY} Z`
    : "";
  const gridY = [0, 0.5, 1];
  const onTap = (e: any) => {
    if (!vw || data.length === 0) return;
    const lx = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    const idx = Math.round(((lx - padL) / innerW) * n);
    setSel(Math.max(0, Math.min(data.length - 1, idx)));
  };
  const sp = sel != null ? pts[sel] : null;
  const tipLeft = sp ? Math.min(Math.max(sp.x - 60, 0), Math.max(0, vw - 120)) : 0;

  return (
    <Pressable onPress={onTap} onLayout={(e) => setVw(e.nativeEvent.layout.width)} testID="line-chart" style={{ height: H, width: "100%" }}>
      {sp && sel != null ? (
        <View pointerEvents="none" style={{ position: "absolute", zIndex: 5, left: tipLeft, top: Math.max(0, sp.y - 54), width: 120, backgroundColor: "rgba(15,23,42,0.95)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{data[sel].date}</Text>
          <Text style={{ color: "#fff", fontSize: 11 }}><Text style={{ color: colors.secondary }}>● </Text>{label}: <Text style={{ fontWeight: "800" }}>{money ? fmtC(data[sel].earning || 0) : data[sel].earning}</Text></Text>
        </View>
      ) : null}
      {vw > 0 ? (
        <Svg width={vw} height={H}>
          <Defs>
            <SvgGrad id={uid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.22" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
            </SvgGrad>
          </Defs>
          {gridY.map((g, i) => {
            const y = padT + innerH - g * innerH;
            return <Line key={i} x1={padL} y1={y} x2={padL + innerW} y2={y} stroke={colors.border} strokeWidth="1" strokeDasharray="3 4" />;
          })}
          {data.length ? <Path d={areaPath} fill={`url(#${uid})`} /> : null}
          <Path d={linePath} fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {pts.length <= 12 ? pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r="2.5" fill={colors.primary} />) : null}
          {sp ? <><Line x1={sp.x} x2={sp.x} y1={padT} y2={baseY} stroke={colors.textMuted} strokeWidth="1" strokeDasharray="3 3" /><Circle cx={sp.x} cy={sp.y} r="5" fill="#fff" stroke={colors.primary} strokeWidth="2.5" /></> : null}
        </Svg>
      ) : null}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: padT - 4, height: innerH, justifyContent: "space-between" }}>
        {[max, max / 2, 0].map((v, i) => (
          <Text key={i} style={{ color: colors.textMuted, fontSize: 9 }}>{money ? fmtC(v) : Math.round(v)}</Text>
        ))}
      </View>
    </Pressable>
  );
}


/** Compact smooth area sparkline (no axes) — used inside the dark earnings hero.
 *  Draws a monotone-cubic curve + gradient area fill (identical look to the web
 *  recharts `type="monotone"` area), measured in real pixels so it fills the
 *  card edge-to-edge and stays crisp on every screen size. */
export function Sparkline({
  data,
  height = 96,
  stroke = "#34D399",
}: {
  data: { earning: number }[];
  height?: number;
  stroke?: string;
}) {
  const [w, setW] = useState(0);
  const uid = useUid("sk");
  const H = height;
  const padT = 8;
  const padB = 8;
  const vals = data.map((d) => d.earning || 0);
  const maxV = Math.max(...vals, 0);
  const max = maxV > 0 ? maxV * 1.12 : 1;
  const padX = 6;
  const innerH = H - padT - padB;
  const innerW = Math.max(1, w - padX * 2);
  const baseY = padT + innerH;
  const single = data.length === 1;
  const n = Math.max(1, data.length - 1);
  const pts: Pt[] = data.map((d, i) => ({
    x: padX + (single ? innerW / 2 : (i / n) * innerW),
    y: padT + innerH - ((d.earning || 0) / max) * innerH,
  }));
  // Single point → flat baseline so it still reads as a chart.
  const linePath = single && pts.length
    ? `M${padX},${pts[0].y} L${padX + innerW},${pts[0].y}`
    : monotoneLine(pts);
  const areaPath = pts.length
    ? (single
        ? `M${padX},${pts[0].y} L${padX + innerW},${pts[0].y} L${padX + innerW},${baseY} L${padX},${baseY} Z`
        : `${linePath} L${pts[pts.length - 1].x},${baseY} L${pts[0].x},${baseY} Z`)
    : "";
  const last = pts[pts.length - 1];

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H, width: "100%" }}>
      {w > 0 && pts.length ? (
        <Svg width={w} height={H}>
          <Defs>
            <SvgGrad id={uid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity="0.55" />
              <Stop offset="1" stopColor={stroke} stopOpacity="0" />
            </SvgGrad>
          </Defs>
          <Path d={areaPath} fill={`url(#${uid})`} />
          <Path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {last ? <Circle cx={single ? padX + innerW : last.x} cy={last.y} r="3" fill={stroke} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
