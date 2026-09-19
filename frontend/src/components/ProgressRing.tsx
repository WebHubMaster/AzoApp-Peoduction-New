import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme, fontSize } from "@/src/theme";

/** Circular progress ring (used on the partner Performance card). */
export function ProgressRing({
  size = 92,
  stroke = 9,
  pct = 0,
  color,
  label,
  centerTop,
  centerBottom,
  trackColor,
  light,
}: {
  size?: number;
  stroke?: number;
  pct?: number;
  color?: string;
  label?: string;
  centerTop?: string;
  centerBottom?: string;
  trackColor?: string;
  light?: boolean;
}) {
  const { colors } = useTheme();
  const c = color || colors.primary;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * circ;

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor || colors.surfaceSubtle} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={c}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
        </Svg>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: light ? "#fff" : colors.text, fontSize: fontSize.lg, fontWeight: "900" }}>{centerTop ?? `${Math.round(clamped)}%`}</Text>
          {centerBottom ? <Text style={{ color: light ? "rgba(255,255,255,0.8)" : colors.textMuted, fontSize: 9, fontWeight: "700" }}>{centerBottom}</Text> : null}
        </View>
      </View>
      {label ? <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: "700", marginTop: 6 }}>{label}</Text> : null}
    </View>
  );
}
