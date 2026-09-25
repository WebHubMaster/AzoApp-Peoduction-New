/** Ports of web_panel/src/pages/customer/home/ui.jsx primitives (mobile breakpoint). */
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { ChevronRight, PackageOpen, AlertTriangle, RefreshCw } from "lucide-react-native";
import * as Icons from "lucide-react-native";
import { PRIMARY, SLATE } from "@/src/theme";
import { Shimmer } from "@/src/components/customer/ux";

export const Container = ({ children, style, testID }: { children: React.ReactNode; style?: any; testID?: string }) => <View testID={testID} style={[{ paddingHorizontal: 16 }, style]}>{children}</View>;

export function SectionHead({ eyebrow, title, subtitle, onSeeAll, seeAllLabel = "View all", right, align = "left", testID }: {
  eyebrow?: string; title?: string; subtitle?: string; onSeeAll?: () => void; seeAllLabel?: string; right?: React.ReactNode; align?: "left" | "center"; testID?: string;
}) {
  const center = align === "center";
  return (
    <View testID={testID} style={{ flexDirection: center ? "column" : "row", alignItems: center ? "center" : "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
      <View style={{ flex: center ? undefined : 1, minWidth: 0, alignItems: center ? "center" : "flex-start" }}>
        {eyebrow ? <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 2, color: PRIMARY[700] }}>{eyebrow}</Text> : null}
        <Text style={{ fontWeight: "800", fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: SLATE[900], marginTop: 6, textAlign: center ? "center" : "left" }}>{title}</Text>
        {subtitle ? <Text style={{ color: SLATE[500], marginTop: 8, fontSize: 14, textAlign: center ? "center" : "left" }}>{subtitle}</Text> : null}
      </View>
      {right || (onSeeAll ? (
        <Pressable onPress={onSeeAll} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY[700] }}>{seeAllLabel}</Text><ChevronRight size={16} color={PRIMARY[700]} />
        </Pressable>
      ) : null)}
    </View>
  );
}

/* Horizontal scroller (swipe on mobile) */
export const Scroller = ({ children, testID, gap = 16 }: { children: React.ReactNode; testID?: string; gap?: number }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap, paddingBottom: 8 }}>
    {children}
  </ScrollView>
);

export const EmptyState = ({ title = "Nothing here yet", subtitle, testID }: { title?: string; subtitle?: string; testID?: string }) => (
  <View testID={testID} style={{ borderRadius: 24, borderWidth: 1, borderStyle: "dashed", borderColor: SLATE[200], backgroundColor: "rgba(248,250,252,0.6)", paddingVertical: 48, paddingHorizontal: 24, alignItems: "center" }}>
    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center", marginBottom: 12 }}><PackageOpen size={24} color={SLATE[400]} /></View>
    <Text style={{ fontWeight: "700", color: SLATE[800], fontSize: 16 }}>{title}</Text>
    {subtitle ? <Text style={{ fontSize: 14, color: SLATE[500], marginTop: 4, textAlign: "center", maxWidth: 384 }}>{subtitle}</Text> : null}
  </View>
);

export const ErrorState = ({ onRetry, text = "We couldn't load this section." }: { onRetry?: () => void; text?: string }) => (
  <View testID="home-error" style={{ borderRadius: 24, borderWidth: 1, borderColor: "#FFE4E6", backgroundColor: "rgba(255,241,242,0.5)", paddingVertical: 40, paddingHorizontal: 24, alignItems: "center" }}>
    <AlertTriangle size={28} color="#F43F5E" />
    <Text style={{ fontWeight: "600", color: SLATE[800], marginTop: 8 }}>{text}</Text>
    {onRetry ? (
      <Pressable testID="home-retry" onPress={onRetry} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: PRIMARY[700] }}>
        <RefreshCw size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Retry</Text>
      </Pressable>
    ) : null}
  </View>
);

export const Sk = ({ style }: { style?: any }) => <Shimmer style={[{ borderRadius: 16, backgroundColor: "rgba(226,232,240,0.7)" }, style]} />;
export const RowSkeleton = ({ count = 4, w = 260, h = 300 }: { count?: number; w?: number; h?: number }) => (
  <View style={{ flexDirection: "row", gap: 20, overflow: "hidden" }}>{Array.from({ length: count }).map((_, i) => <Sk key={i} style={{ width: w, height: h }} />)}</View>
);

export const iconName = (name?: string) => (name || "").split("-").map((s) => (s[0]?.toUpperCase() || "") + s.slice(1)).join("");
export const LucideByName = ({ name, size = 28, color = PRIMARY[700], strokeWidth = 1.5 }: { name?: string; size?: number; color?: string; strokeWidth?: number }) => {
  const Cmp = (Icons as any)[iconName(name)] || Icons.Wrench;
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} />;
};
export const compactNum = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  const x = Number(v) || 0;
  if (x >= 10000000) return `${(x / 10000000).toFixed(x % 10000000 ? 1 : 0)}Cr+`;
  if (x >= 100000) return `${(x / 100000).toFixed(x % 100000 ? 1 : 0)}L+`;
  if (x >= 1000) return `${(x / 1000).toFixed(x % 1000 ? 1 : 0)}K+`;
  return String(x);
};
export const stripHtml = (h?: string) => (h || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
export const isPositive = (v: any) => typeof v === "string" || Number(v) > 0;
