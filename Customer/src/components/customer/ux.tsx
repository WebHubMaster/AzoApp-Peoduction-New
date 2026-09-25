/** Ports of web_panel/src/components/customer/ux.jsx primitives (StatTile, StatusChip, EmptyState, skeletons). */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Inbox } from "lucide-react-native";
import { PRIMARY, SLATE, EMERALD, AMBER, ROSE, VIOLET, INDIGO, ORANGE, BLUE, useTheme, shadowElev } from "@/src/theme";
import type { Tone } from "@/src/components/customer/nav";

/* ---------------------------------------------------------- useCountUp --- */
export function useCountUp(target: number, ms = 650) {
  const [v, setV] = useState(0);
  const raf = useRef<any>(null);
  useEffect(() => {
    const num = Number(target) || 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(num * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}

/* ------------------------------------------------------------- StatTile --- */
const TONES: Record<string, [string, string]> = {
  primary: [PRIMARY[600], PRIMARY[800]],
  green: [EMERALD[500], EMERALD[700]],
  amber: [AMBER[500], ORANGE[600]],
  rose: [ROSE[500], ROSE[700]],
  slate: [SLATE[600], SLATE[800]],
  violet: [VIOLET[500], INDIGO[700]],
};

export function StatTile({ label, value, icon: Icon, tone = "primary", count, onPress, testID }: {
  label: string; value: any; icon?: any; tone?: string; count?: boolean; money?: string; onPress?: () => void; testID?: string;
}) {
  const numeric = count && typeof value === "number";
  const animated = useCountUp(numeric ? value : 0);
  const display = numeric ? Math.round(animated).toLocaleString("en-IN") : value;
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <LinearGradient colors={TONES[tone] || TONES.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: 16, padding: 16, overflow: "hidden", ...shadowElev }}>
        <View style={{ position: "absolute", right: -16, top: -16, width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.10)" }} />
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.55, color: "rgba(255,255,255,0.75)" }}>{label}</Text>
            <Text numberOfLines={1} style={{ marginTop: 6, fontWeight: "900", fontSize: 24, lineHeight: 30, color: "#fff" }}>{display}</Text>
          </View>
          {Icon ? (
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
              <Icon size={20} color="#fff" />
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/* ----------------------------------------------------------- StatusChip --- */
const CHIP: Record<Tone, { bg: string; fg: string; dbg: string; dfg: string }> = {
  slate: { bg: SLATE[100], fg: SLATE[600], dbg: SLATE[800], dfg: SLATE[300] },
  blue: { bg: BLUE[50], fg: BLUE[700], dbg: "rgba(30,58,138,0.30)", dfg: "#93C5FD" },
  green: { bg: EMERALD[50], fg: EMERALD[700], dbg: "rgba(6,78,59,0.30)", dfg: "#6EE7B7" },
  amber: { bg: AMBER[50], fg: AMBER[700], dbg: "rgba(120,53,15,0.30)", dfg: "#FCD34D" },
  rose: { bg: ROSE[50], fg: ROSE[700], dbg: "rgba(136,19,55,0.30)", dfg: "#FDA4AF" },
  violet: { bg: VIOLET[50], fg: VIOLET[700], dbg: "rgba(76,29,149,0.30)", dfg: "#C4B5FD" },
};

export function StatusChip({ label, tone = "slate", testID }: { label: string; tone?: Tone; testID?: string }) {
  const { isDark } = useTheme();
  const m = CHIP[tone] || CHIP.slate;
  return (
    <View testID={testID} style={{ backgroundColor: isDark ? m.dbg : m.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: isDark ? m.dfg : m.fg }}>{label}</Text>
    </View>
  );
}

/* ----------------------------------------------------------- EmptyState --- */
export function EmptyState({ icon: Icon = Inbox, title, desc, actionLabel, onAction, testID }: {
  icon?: any; title: string; desc?: string; actionLabel?: string; onAction?: () => void; testID?: string;
}) {
  const { c, isDark } = useTheme();
  return (
    <View testID={testID} style={{ borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: isDark ? SLATE[700] : SLATE[200],
      backgroundColor: isDark ? "rgba(15,23,42,0.40)" : "rgba(255,255,255,0.60)", padding: 40, alignItems: "center" }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Icon size={28} color={c.primaryText} strokeWidth={1.6} />
      </View>
      <Text style={{ marginTop: 16, fontWeight: "700", fontSize: 18, color: c.text }}>{title}</Text>
      {desc ? <Text style={{ marginTop: 4, fontSize: 14, color: c.textMuted, textAlign: "center", maxWidth: 384 }}>{desc}</Text> : null}
      {actionLabel ? (
        <Pressable testID={testID ? `${testID}-action` : undefined} onPress={onAction} style={({ pressed }) => ({ marginTop: 20, height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center" })}>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ Skeletons --- */
export function Shimmer({ style }: { style?: any }) {
  const { isDark } = useTheme();
  const anim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[{ borderRadius: 8, backgroundColor: isDark ? "rgba(148,163,184,0.14)" : "rgba(148,163,184,0.24)", opacity: anim }, style]} />;
}

export function CardSkeleton() {
  const { c } = useTheme();
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 20 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ width: "50%", gap: 8 }}><Shimmer style={{ height: 16, width: "75%" }} /><Shimmer style={{ height: 12, width: "50%" }} /></View>
        <Shimmer style={{ height: 24, width: 64 }} />
      </View>
      <Shimmer style={{ height: 12, width: "100%", marginTop: 16 }} />
      <Shimmer style={{ height: 12, width: "66%", marginTop: 8 }} />
    </View>
  );
}
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return <View style={{ gap: 12 }}>{Array.from({ length: rows }).map((_, i) => <CardSkeleton key={i} />)}</View>;
}
export function StatSkeleton({ n = 4 }: { n?: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {Array.from({ length: n }).map((_, i) => <Shimmer key={i} style={{ height: 96, borderRadius: 16, width: "47%", flexGrow: 1 }} />)}
    </View>
  );
}

/* ------------------------------------------------------- Primary button --- */
export function PrimaryButton({ label, onPress, icon: Icon, disabled, busy, testID, style }: {
  label: string; onPress: () => void; icon?: any; disabled?: boolean; busy?: boolean; testID?: string; style?: any;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{ height: 44, borderRadius: 6, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, opacity: disabled ? 0.5 : 1 }, style]}>
      {busy ? <Shimmer style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" }} /> : (
        <>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>{label}</Text>
          {Icon ? <Icon size={16} color="#fff" /> : null}
        </>
      )}
    </Pressable>
  );
}
