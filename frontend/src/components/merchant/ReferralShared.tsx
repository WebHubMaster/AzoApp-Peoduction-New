/**
 * Shared mobile building blocks for the Merchant Referral panel screens
 * (My Customers / My Partners / Commission). Mirrors the web
 * `pages/merchant/referral/ReferralShared.jsx` behaviour + visuals.
 */
import React from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";
import { Card } from "@/src/components/ui";

export type Kpi = { label: string; value: any; money?: boolean; primary?: boolean; sub?: string };

/** 2-col ReportCards grid — primary card is an emerald gradient (matches web). */
export function MReportCards({ cards, testID }: { cards: Kpi[]; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }} testID={testID || "report-cards"}>
      {cards.map((c) => {
        const display = c.money ? fmt(c.value) : Number(c.value || 0).toLocaleString("en-IN");
        if (c.primary) {
          return (
            <LinearGradient key={c.label} colors={["#10B981", "#059669"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: "47.8%", borderRadius: radius.lg, padding: spacing.md }}>
              <Text style={{ color: "#ECFDF5", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>{c.label}</Text>
              <Text style={{ color: "#fff", fontSize: fontSize.xxl, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>{display}</Text>
              {c.sub ? <Text style={{ color: "rgba(236,253,245,0.9)", fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
            </LinearGradient>
          );
        }
        return (
          <View key={c.label} style={{ width: "47.8%" }}>
            <Card padded={false} style={{ padding: spacing.md }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }} numberOfLines={1}>{c.label}</Text>
              <Text style={{ color: c.money ? colors.success : colors.text, fontSize: fontSize.lg, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>{display}</Text>
              {c.sub ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

/** Search box with clear button (matches web SearchBox). */
export function MSearchBox({ value, onChange, placeholder = "Search…", testID = "search-input" }:
  { value: string; onChange: (v: string) => void; placeholder?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44 }}>
      <Icon name="magnify" size={20} color={colors.textMuted} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{ flex: 1, color: colors.text, fontSize: fontSize.sm }}
      />
      {value ? (
        <Pressable testID={`${testID}-clear`} onPress={() => onChange("")} hitSlop={8}>
          <Icon name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Server-side pagination control (prev / page numbers / next + size + range). */
export function MPagination({ page, pages, total, pageSize, onPage, onPageSize }:
  { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void; onPageSize: (n: number) => void }) {
  const { colors } = useTheme();
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const start = Math.min(Math.max(1, page - 2), Math.max(1, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }).map((_, i) => start + i).filter((n) => n <= pages);
  const sizes = [10, 25, 50, 100];
  return (
    <View style={{ gap: spacing.md }} testID="pagination">
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{from}–{to} of <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>{total}</Text></Text>
        <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
          {sizes.map((n) => {
            const on = n === pageSize;
            return (
              <Pressable key={n} testID={`page-size-${n}`} onPress={() => onPageSize(n)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: on ? colors.primary : colors.surfaceSubtle }}>
                <Text style={{ color: on ? "#fff" : colors.textSecondary, fontSize: 11, fontWeight: "800" }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Pressable testID="page-prev" disabled={page <= 1} onPress={() => onPage(page - 1)} style={{ width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: page <= 1 ? 0.4 : 1 }}>
          <Icon name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        {nums.map((n) => {
          const on = n === page;
          return (
            <Pressable key={n} testID={`page-${n}`} onPress={() => onPage(n)} style={{ minWidth: 36, height: 36, paddingHorizontal: 8, borderRadius: radius.sm, borderWidth: on ? 0 : 1, borderColor: colors.border, backgroundColor: on ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: on ? "#fff" : colors.textSecondary, fontSize: fontSize.sm, fontWeight: "800" }}>{n}</Text>
            </Pressable>
          );
        })}
        <Pressable testID="page-next" disabled={page >= pages} onPress={() => onPage(page + 1)} style={{ width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: page >= pages ? 0.4 : 1 }}>
          <Icon name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

/** Premium gradient module header banner (matches web ModuleHeader). */
export function MModuleHeader({ title, subtitle, icon = "trending-up", right }:
  { title: string; subtitle?: string; icon?: MdiName; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar style="light" />
      <LinearGradient colors={["#0D47A1", "#1565C0", "#7C3AED"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={{ paddingTop: insets.top + 10, paddingBottom: 16, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ width: 46, height: 46, borderRadius: radius.lg, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: fontSize.xl, fontWeight: "900" }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={{ color: "rgba(224,242,254,0.85)", fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      </LinearGradient>
    </>
  );
}

/** Back link row used at the top of detail views. */
export function MBackLink({ label, onPress, testID = "detail-back" }: { label: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}>
      <Icon name="arrow-left" size={16} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/** Privacy footnote (matches web PrivacyNote). */
export function MPrivacyNote() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 }}>
      <View style={{ marginTop: 1 }}><Icon name="shield-check" size={16} color={colors.success} /></View>
      <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 17, flex: 1 }}>
        Personal contact details (phone, email, address) are protected and not shared with merchants. You only see referral &amp; commission information.
      </Text>
    </View>
  );
}
