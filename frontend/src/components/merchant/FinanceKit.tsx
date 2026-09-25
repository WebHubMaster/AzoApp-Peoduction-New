import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, MdiName } from "@/src/components/Icon";
import { useQrPalette, SLATE } from "@/src/components/qr/qrKit";

/* 1:1 RN port of web_panel/src/components/merchant/finance/FinanceKit.jsx (mobile view). */

export const EMERALD = { 50: "#ecfdf5", 100: "#d1fae5", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 950: "rgba(2,44,34,0.4)" };
export const ROSE = { 50: "#fff1f2", 100: "#ffe4e6", 400: "#fb7185", 500: "#f43f5e", 700: "#be123c", 950: "rgba(76,5,25,0.4)" };
export const AMBER = { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 900: "rgba(120,53,15,0.4)", 950: "rgba(69,26,3,0.2)" };
const BLUE = { 50: "#eff6ff", 400: "#60a5fa", 500: "#3b82f6", 700: "#1d4ed8", 950: "rgba(23,37,84,0.4)" };
const VIOLET = { 50: "#f5f3ff", 400: "#a78bfa", 500: "#8b5cf6", 700: "#6d28d9", 950: "rgba(46,16,101,0.4)" };
const ORANGE = { 50: "#fff7ed", 400: "#fb923c", 500: "#f97316", 700: "#c2410c", 950: "rgba(67,20,7,0.4)" };
export const TAB = { fontVariant: ["tabular-nums" as const] };

export function useFin() {
  const q = useQrPalette();
  const { dark } = q;
  return {
    ...q,
    // text-slate-800 dark:text-slate-100
    strong: dark ? SLATE[100] : SLATE[800],
    // border-slate-100 dark:border-slate-800
    hairline: dark ? SLATE[800] : SLATE[100],
    // bg-slate-50 dark:bg-slate-800/50
    well: dark ? "rgba(30,41,59,0.5)" : SLATE[50],
    // text-primary-600 dark:text-primary-300
    link: dark ? q.P[300] : q.P[600],
    primaryText: dark ? q.P[300] : q.P[700],
    primarySubtle: dark ? "rgba(13,71,161,0.3)" : q.P[50],
  };
}

/* ── status badge ── */
type Tone = { bg: string; text: string; dot: string };
const badge = (light: string, dark: string, tl: string, td: string, dot: string) => ({ light: { bg: light, text: tl, dot }, dark: { bg: dark, text: td, dot } });
const BADGES: Record<string, ReturnType<typeof badge>> = {
  verified: badge(EMERALD[50], EMERALD[950], EMERALD[700], EMERALD[400], EMERALD[500]),
  approved: badge(EMERALD[50], EMERALD[950], EMERALD[700], EMERALD[400], EMERALD[500]),
  completed: badge(EMERALD[50], EMERALD[950], EMERALD[700], EMERALD[400], EMERALD[500]),
  paid: badge(VIOLET[50], VIOLET[950], VIOLET[700], VIOLET[400], VIOLET[500]),
  pending: badge(AMBER[50], "rgba(69,26,3,0.4)", AMBER[700], AMBER[400], AMBER[500]),
  processing: badge(BLUE[50], BLUE[950], BLUE[700], BLUE[400], BLUE[500]),
  submitted: badge(BLUE[50], BLUE[950], BLUE[700], BLUE[400], BLUE[500]),
  under_review: badge(BLUE[50], BLUE[950], BLUE[700], BLUE[400], BLUE[500]),
  rejected: badge(ROSE[50], ROSE[950], ROSE[700], ROSE[400], ROSE[500]),
  failed: badge(ROSE[50], ROSE[950], ROSE[700], ROSE[400], ROSE[500]),
  reversed: badge(SLATE[100], SLATE[800], SLATE[600], SLATE[300], SLATE[400]),
  action_required: badge(ORANGE[50], ORANGE[950], ORANGE[700], ORANGE[400], ORANGE[500]),
  default: badge(SLATE[100], SLATE[800], SLATE[600], SLATE[300], SLATE[400]),
};
const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

export function StatusBadge({ status, label, testID }: { status?: string; label?: string; testID?: string }) {
  const { dark } = useFin();
  const key = (status || "").toLowerCase().replace(/\s+/g, "_") || "default";
  const s: Tone = (BADGES[key] || BADGES.default)[dark ? "dark" : "light"];
  const text = label || (status || "not submitted").replace(/_/g, " ");
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: s.bg, alignSelf: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.dot }} />
      <Text style={{ color: s.text, fontSize: 11, lineHeight: 14, fontWeight: "600" }} numberOfLines={1}>{cap(text)}</Text>
    </View>
  );
}

/* ── surface card: rounded-2xl bg-white border-slate-200/80 shadow-card ── */
export function Surface({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { card, dark } = useFin();
  return (
    <View testID={testID} style={[{ borderRadius: 16, backgroundColor: card, borderWidth: 1, borderColor: dark ? SLATE[800] : "rgba(226,232,240,0.8)", boxShadow: "0px 3px 12px rgba(47,43,61,0.1)" }, style]}>
      {children}
    </View>
  );
}

/* ── StatValue (ExactHover.jsx) — ≥1000 abbreviated ── */
const compactNum = (n: number) => {
  const sign = n < 0 ? "-" : ""; const abs = Math.abs(n);
  const trim = (v: number) => v.toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1e9) return sign + trim(abs / 1e9) + "B";
  if (abs >= 1e6) return sign + trim(abs / 1e6) + "M";
  if (abs >= 1e3) return sign + trim(abs / 1e3) + "K";
  return sign + (Number.isInteger(abs) ? String(abs) : trim(abs));
};
export function statValue(value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return compactNum(value);
  const str = String(value);
  const m = str.match(/^\s*(₹|Rs\.?\s*|\$)?\s*(-?[\d,]+(?:\.\d+)?)\s*$/);
  if (m) {
    const sym = (m[1] || "").trim(); const isRupee = sym.includes("₹") || /^Rs/i.test(sym);
    const num = parseFloat(m[2].replace(/,/g, ""));
    if (!Number.isNaN(num) && Math.abs(num) >= 1000) return (sym ? (isRupee ? "₹" : sym) : "") + compactNum(num);
  }
  return str;
}

/* ── KPI card ── */
type KpiTone = "primary" | "emerald" | "amber" | "violet" | "slate" | "blue";
export function KpiCard({ icon, label, value, sub, trend, tone = "slate", testID }: { icon?: MdiName; label: string; value: string; sub?: string; trend?: number | null; tone?: KpiTone; testID?: string }) {
  const { dark, P, heading } = useFin();
  const TONES: Record<KpiTone, { bg: string; fg: string }> = {
    primary: { bg: dark ? "rgba(13,71,161,0.3)" : P[50], fg: dark ? P[300] : P[700] },
    emerald: { bg: dark ? EMERALD[950] : EMERALD[50], fg: dark ? EMERALD[400] : EMERALD[600] },
    amber: { bg: dark ? "rgba(69,26,3,0.4)" : AMBER[50], fg: dark ? AMBER[400] : AMBER[600] },
    violet: { bg: dark ? VIOLET[950] : VIOLET[50], fg: dark ? VIOLET[400] : "#7c3aed" },
    slate: { bg: dark ? SLATE[800] : SLATE[100], fg: dark ? SLATE[300] : SLATE[600] },
    blue: { bg: dark ? BLUE[950] : BLUE[50], fg: dark ? BLUE[400] : "#2563eb" },
  };
  const t = TONES[tone];
  const up = (trend ?? 0) >= 0;
  return (
    <Surface style={{ padding: 16 }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        {icon ? <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={t.fg} /></View> : null}
        {trend != null ? (
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: up ? (dark ? EMERALD[950] : EMERALD[50]) : (dark ? ROSE[950] : ROSE[50]) }}>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", color: up ? EMERALD[600] : ROSE[500] }}>{up ? "▲" : "▼"} {Math.abs(trend)}%</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.55, color: dark ? SLATE[500] : SLATE[400], marginTop: 12 }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: "800", color: heading, marginTop: 2, ...TAB }} numberOfLines={1}>{statValue(value)}</Text>
      {sub ? <Text style={{ fontSize: 12, lineHeight: 16, color: dark ? SLATE[500] : SLATE[400], marginTop: 4 }} numberOfLines={1}>{sub}</Text> : null}
    </Surface>
  );
}

/* ── segmented tabs: p-1 rounded-2xl bg-slate-100 · px-4 h-9 rounded-xl text-sm font-semibold ── */
export function SegTabs<T extends string>({ tabs, value, onChange, testidPrefix = "tab" }: { tabs: T[]; value: T; onChange: (v: T) => void; testidPrefix?: string }) {
  const { dark, subtle, card, P } = useFin();
  return (
    <View style={{ flexDirection: "row", gap: 4, padding: 4, borderRadius: 16, backgroundColor: subtle }}>
      {tabs.map((t) => {
        const on = value === t;
        return (
          <Pressable key={t} testID={`${testidPrefix}-${t}`} onPress={() => onChange(t)} style={{ paddingHorizontal: 16, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: on ? card : "transparent", boxShadow: on ? "0px 1px 2px rgba(0,0,0,0.05)" : undefined }}>
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", textTransform: "capitalize", color: on ? (dark ? P[300] : P[700]) : (dark ? SLATE[400] : SLATE[500]) }}>{t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── bottom sheet (web DetailDrawer, mobile variant) ── */
export function DetailDrawer({ open, onClose, title, subtitle, children, testID }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; testID?: string }) {
  const { card, dark, heading, hairline } = useFin();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" }} testID={testID}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ maxHeight: "90%", backgroundColor: card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: dark ? SLATE[800] : SLATE[200], boxShadow: "0px -20px 50px rgba(15,23,42,0.25)" }}>
          <View style={{ alignSelf: "center", height: 6, width: 48, borderRadius: 3, backgroundColor: dark ? SLATE[700] : SLATE[200], marginTop: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: hairline }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 18, lineHeight: 28, fontWeight: "700", color: heading }} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={{ fontSize: 12, lineHeight: 16, color: dark ? SLATE[500] : SLATE[400], marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <Pressable testID="drawer-close" onPress={onClose} hitSlop={8} style={{ height: 32, width: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={16} color={SLATE[400]} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 96 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ── key → value row ── */
export function KV({ k, v, mono, strong, color, transform, testID }: { k: string; v: any; mono?: boolean; strong?: boolean; color?: string; transform?: "capitalize" | "uppercase"; testID?: string }) {
  const { dark, heading, body, muted } = useFin();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: dark ? "rgba(30,41,59,0.6)" : SLATE[50] }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: muted }}>{k}</Text>
      <Text testID={testID} style={{ fontSize: 14, lineHeight: 20, textAlign: "right", flexShrink: 1, fontFamily: mono ? "monospace" : undefined, textTransform: transform, fontWeight: strong ? "700" : "500", color: color || (strong ? heading : body) }}>{String(v ?? "")}</Text>
    </View>
  );
}

/* ── vertical timeline ── */
export function Timeline({ steps }: { steps: { title: string; time?: string; done?: boolean; active?: boolean }[] }) {
  const { dark, P, heading, card } = useFin();
  return (
    <View style={{ paddingLeft: 20, position: "relative" }}>
      <View style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 1, backgroundColor: dark ? SLATE[700] : SLATE[200] }} />
      {steps.map((s, i) => (
        <View key={i} style={{ position: "relative", paddingBottom: i === steps.length - 1 ? 0 : 16 }}>
          <View style={{ position: "absolute", left: -24, top: -2, height: 22, width: 22, borderRadius: 11, backgroundColor: card, alignItems: "center", justifyContent: "center" }}>
            <View style={{ height: 14, width: 14, borderRadius: 7, backgroundColor: s.done ? EMERALD[500] : s.active ? P[600] : (dark ? SLATE[600] : SLATE[300]) }} />
          </View>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: s.done || s.active ? heading : SLATE[400] }}>{s.title}</Text>
          {s.time ? <Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400], marginTop: 2 }}>{s.time}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/* ── empty state ── */
export function EmptyState({ icon = "inbox-outline", title, hint, action, testID }: { icon?: MdiName; title: string; hint?: string; action?: React.ReactNode; testID?: string }) {
  const { subtle, strong, dark } = useFin();
  return (
    <View testID={testID} style={{ paddingVertical: 56, paddingHorizontal: 24, alignItems: "center" }}>
      <View style={{ height: 56, width: 56, borderRadius: 16, backgroundColor: subtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={28} color={SLATE[400]} /></View>
      <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "700", color: strong, marginTop: 16, textAlign: "center" }}>{title}</Text>
      {hint ? <Text style={{ fontSize: 14, lineHeight: 20, color: dark ? SLATE[500] : SLATE[400], marginTop: 4, maxWidth: 320, textAlign: "center" }}>{hint}</Text> : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

/* ── skeletons ── */
export function Sk({ style }: { style?: StyleProp<ViewStyle> }) {
  const { subtle } = useFin();
  return <View style={[{ borderRadius: 8, backgroundColor: subtle, opacity: 0.8 }, style]} />;
}
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return <View style={{ gap: 8 }}>{Array.from({ length: rows }).map((_, i) => <Sk key={i} style={{ height: 56, borderRadius: 12 }} />)}</View>;
}

/* ── shadcn Button (default / outline) — h-10 rounded-md text-sm font-medium ── */
export function FBtn({ label, icon, onPress, variant = "default", disabled, style, testID, size = "md" }: { label: string; icon?: MdiName; onPress: () => void; variant?: "default" | "outline" | "white"; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string; size?: "md" | "lg" }) {
  const { P, dark, card, body } = useFin();
  const bg = variant === "default" ? P[700] : variant === "white" ? "#ffffff" : card;
  const fg = variant === "default" ? "#ffffff" : variant === "white" ? P[800] : body;
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled}
      style={({ pressed }) => [{ height: size === "lg" ? 48 : 40, borderRadius: size === "lg" ? 16 : 6, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: bg, borderWidth: variant === "outline" ? 1 : 0, borderColor: dark ? SLATE[700] : SLATE[200], opacity: disabled ? 0.5 : pressed ? 0.9 : 1, boxShadow: variant === "white" ? "0px 10px 15px -3px rgba(0,0,0,0.1)" : undefined }, style]}>
      {icon ? <Icon name={icon} size={size === "lg" ? 20 : 16} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: size === "lg" ? 16 : 14, lineHeight: size === "lg" ? 24 : 20, fontWeight: size === "lg" ? "700" : "500" }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/* ── PremiumSelect (mobile = bottom-sheet picker) ── */
export function PremiumSelect<T extends string | number>({ value, onChange, options, placeholder = "Select...", height = 40, radius = 8, fontSize = 14, style, testID }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; placeholder?: string; height?: number; radius?: number; fontSize?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { dark, card, body, P, hairline, primarySubtle, primaryText } = useFin();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value));
  return (
    <>
      <Pressable testID={testID} onPress={() => setOpen(true)} style={[{ height, borderRadius: radius, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: dark ? SLATE[600] : SLATE[200], backgroundColor: card }, style]}>
        <Text style={{ flex: 1, fontSize, color: selected ? body : SLATE[400] }} numberOfLines={1}>{selected?.label || placeholder}</Text>
        <Icon name="chevron-down" size={16} color={SLATE[400]} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <View testID={testID ? `${testID}-menu` : undefined} style={{ maxHeight: "70%", backgroundColor: card, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], boxShadow: "0px -20px 50px rgba(15,23,42,0.25)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: hairline }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: body }}>{placeholder}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} style={{ padding: 4 }}><Icon name="close" size={20} color={SLATE[400]} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
              {options.map((o) => {
                const sel = String(o.value) === String(value);
                return (
                  <Pressable key={String(o.value)} testID={testID ? `${testID}-opt-${o.value}` : undefined} onPress={() => { onChange(o.value); setOpen(false); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: sel ? primarySubtle : "transparent" }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: sel ? "500" : "400", color: sel ? primaryText : (dark ? SLATE[300] : SLATE[600]) }}>{o.label}</Text>
                    {sel ? <Icon name="check" size={16} color={P[700]} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ── pagination ── */
export function Paginator({ page, pages, total, pageSize, onPage, onPageSize }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void; onPageSize?: (n: number) => void }) {
  const { dark, card, body, muted, hairline } = useFin();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const nav = (disabled: boolean) => ({ height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], backgroundColor: dark ? SLATE[800] : card, alignItems: "center" as const, justifyContent: "center" as const, opacity: disabled ? 0.4 : 1 });
  return (
    <View style={{ alignItems: "center", gap: 12, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: hairline }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text testID="pagination-info" style={{ fontSize: 12, color: muted }}>Showing <Text style={{ fontWeight: "700", color: body }}>{from}–{to}</Text> of <Text style={{ fontWeight: "700", color: body }}>{total}</Text></Text>
        {onPageSize ? <PremiumSelect testID="page-size" value={pageSize} onChange={(n) => onPageSize(Number(n))} options={[10, 25, 50, 100].map((n) => ({ value: n, label: `${n} / page` }))} placeholder="Rows per page" height={32} fontSize={12} style={{ width: 104 }} /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Pressable testID="page-prev" disabled={page <= 1} onPress={() => onPage(page - 1)} style={nav(page <= 1)}><Icon name="chevron-left" size={16} color={dark ? SLATE[300] : SLATE[600]} /></Pressable>
        <Text style={{ fontSize: 12, fontWeight: "600", color: muted, paddingHorizontal: 8, ...TAB }}>{page} / {pages || 1}</Text>
        <Pressable testID="page-next" disabled={page >= (pages || 1)} onPress={() => onPage(page + 1)} style={nav(page >= (pages || 1))}><Icon name="chevron-right" size={16} color={dark ? SLATE[300] : SLATE[600]} /></Pressable>
      </View>
    </View>
  );
}

/* ── security/trust footer ── */
export function SecurityNote({ text = "Your banking information is encrypted and securely protected. AzoApp never shares your financial details." }: { text?: string }) {
  const { dark, well, strong, muted } = useFin();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 16, backgroundColor: well, borderWidth: 1, borderColor: dark ? SLATE[800] : "rgba(226,232,240,0.7)", padding: 16 }}>
      <View style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: dark ? EMERALD[950] : EMERALD[50], alignItems: "center", justifyContent: "center" }}><Icon name="shield-check" size={18} color={EMERALD[600]} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: strong }}>Bank-grade security</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: muted, marginTop: 2 }}>{text}</Text>
      </View>
    </View>
  );
}

/* ── web MerchantDashboard lockedCard (renderGated) ── */
export function LockedCard({ completion, status, onGo }: { completion: number; status?: string; onGo: () => void }) {
  const { heading, muted, primaryText, dark } = useFin();
  return (
    <Surface testID="feature-locked" style={{ padding: 32, alignItems: "center" }}>
      <View style={{ height: 56, width: 56, borderRadius: 16, backgroundColor: dark ? AMBER[950] : AMBER[50], alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Icon name="lock-outline" size={28} color={AMBER[600]} /></View>
      <Text style={{ fontSize: 18, lineHeight: 28, fontWeight: "700", color: heading }}>Feature locked</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: muted, marginTop: 4, textAlign: "center", maxWidth: 384 }}>Yeh feature tab unlock hoga jab aapka profile 100% complete ho aur admin approve kar de.</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: primaryText }}>{completion}%</Text>
        <Text style={{ fontSize: 14, color: SLATE[400] }}>complete · {(status || "").replace("_", " ")}</Text>
      </View>
      <FBtn testID="goto-profile" label="Complete Profile" icon="arrow-right" onPress={onGo} style={{ marginTop: 16, height: 44 }} />
    </Surface>
  );
}

export const money = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const shortDate = (s?: string) => { try { return new Date(s || "").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return (s || "").slice(0, 10); } };
