import React from "react";
import { View, Text, Pressable, ActivityIndicator, StyleProp, ViewStyle } from "react-native";
import { useTheme, palette } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";

/* Scan-QR kit — tailwind tokens + shadcn <Button> equivalents used by the web
   ScanQRModule, so the mobile screen matches the web panel's mobile view 1:1. */

export const SLATE = {
  50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8",
  500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a",
};
export const EMERALD = { 50: "#ecfdf5", 200: "#a7f3d0", 500: "#10b981", 600: "#059669" };
export const VIOLET = { 50: "#f5f3ff", 600: "#7c3aed" };
export const AMBER = { 50: "#fffbeb", 600: "#d97706" };

/** Brand primary shades (web `primary-50…900` CSS vars) + dark-mode flag. */
export function useQrPalette() {
  const { brand, mode, colors } = useTheme();
  const P = palette(brand.primary);
  const dark = mode === "dark";
  return {
    P, dark, colors,
    // web: bg-white dark:bg-slate-900 · border-slate-200/70 dark:border-slate-800
    card: dark ? SLATE[900] : "#ffffff",
    cardBorder: dark ? SLATE[800] : "rgba(226,232,240,0.7)",
    // web: bg-slate-100 dark:bg-slate-800
    subtle: dark ? SLATE[800] : SLATE[100],
    heading: dark ? "#ffffff" : SLATE[900],
    body: dark ? SLATE[200] : SLATE[700],
    muted: dark ? SLATE[400] : SLATE[500],
    faint: SLATE[400],
  };
}

/** web `<Label>` — text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 */
export function KitLabel({ children }: { children: string }) {
  return <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.55, color: SLATE[400], marginBottom: 8 }}>{children}</Text>;
}

type Variant = "default" | "outline" | "ghost" | "white" | "whatsapp";

/** shadcn Button — h-10 rounded-md text-sm font-semibold gap-2, icon 16px. */
export function WBtn({
  label, icon, onPress, variant = "default", busy, disabled, style, testID, bold,
}: {
  label: string; icon?: MdiName; onPress: () => void; variant?: Variant; busy?: boolean;
  disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string; bold?: boolean;
}) {
  const { P, dark } = useQrPalette();
  const bg = variant === "default" ? P[700] : variant === "white" ? "#ffffff" : variant === "whatsapp" ? EMERALD[500] : variant === "outline" ? (dark ? SLATE[900] : "#ffffff") : "transparent";
  const fg = variant === "default" || variant === "whatsapp" ? "#ffffff" : variant === "white" ? P[800] : variant === "ghost" ? (dark ? SLATE[300] : SLATE[500]) : (dark ? SLATE[200] : SLATE[700]);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        {
          height: 40, borderRadius: 6, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1 : 0, borderColor: dark ? SLATE[700] : SLATE[200],
          opacity: disabled || busy ? (variant === "white" || variant === "whatsapp" ? 0.7 : 0.5) : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          boxShadow: variant === "default" ? "0px 2px 6px rgba(13,71,161,0.3)" : undefined,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 14, fontWeight: bold ? "700" : "600" }} numberOfLines={1}>{busy && (variant === "white" || variant === "whatsapp") ? "Please wait…" : label}</Text>
    </Pressable>
  );
}

/** web surface card: rounded-2xl bg-white border-slate-200/70 p-4 */
export function KitCard({ children, style, testID, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string; padded?: boolean }) {
  const { card, cardBorder } = useQrPalette();
  return <View testID={testID} style={[{ borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: cardBorder, padding: padded ? 16 : 0 }, style]}>{children}</View>;
}

/** web segmented pills: bg-slate-100 rounded-lg p-1 · active bg-white text-primary-700 shadow-sm */
export function KitSeg<T extends string>({ items, value, onChange, testidPrefix, flex }: { items: { v: T; l: string; icon?: MdiName }[]; value: T; onChange: (v: T) => void; testidPrefix: string; flex?: boolean }) {
  const { P, dark, subtle } = useQrPalette();
  return (
    <View style={{ flexDirection: "row", gap: 4, backgroundColor: subtle, borderRadius: 8, padding: 4, alignSelf: flex ? "stretch" : "flex-start" }}>
      {items.map((it) => {
        const on = value === it.v;
        return (
          <Pressable key={it.v} testID={`${testidPrefix}-${it.v}`} onPress={() => onChange(it.v)} style={{ flex: flex ? 1 : undefined, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: on ? (dark ? SLATE[900] : "#ffffff") : "transparent", boxShadow: on ? "0px 1px 2px rgba(0,0,0,0.05)" : undefined }}>
            {it.icon ? <Icon name={it.icon} size={14} color={on ? P[700] : SLATE[500]} /> : null}
            <Text style={{ fontSize: 12, fontWeight: "600", color: on ? P[700] : SLATE[500] }}>{it.l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
