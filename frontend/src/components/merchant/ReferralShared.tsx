/**
 * Shared mobile building blocks for the Merchant Referral panel screens
 * (My Customers / My Partners / Commission). Mirrors the web
 * `pages/merchant/referral/ReferralShared.jsx` behaviour + visuals.
 */
import React, { useState } from "react";
import { View, Text, Pressable, TextInput, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, ArrowLeft, ShieldCheck, Calendar, TrendingUp, type LucideIcon } from "lucide-react-native";
import { fmt } from "@/src/lib/format";
import { Card } from "@/src/components/ui";

export type Kpi = { label: string; value: any; money?: boolean; primary?: boolean; sub?: string };

// web numbers use `tabular-nums`; NEVER set an explicit fontFamily on Android (weight-family
// + fontWeight makes RN fall back to the system font) — rely on the global-font weight patch.
const TAB = { fontVariant: ["tabular-nums" as const] };
function chunk2<T>(a: T[]): T[][] { const o: T[][] = []; for (let i = 0; i < a.length; i += 2) o.push(a.slice(i, i + 2)); return o; }

/** One KPI card — matches web ReportCards (rounded-2xl=16, p-4=16, extrabold tabular numbers). */
function MKpiCard({ c }: { c: Kpi }) {
  const { colors } = useTheme();
  const display = c.money ? fmt(c.value) : Number(c.value || 0).toLocaleString("en-IN");
  if (c.primary) {
    return (
      <LinearGradient colors={["#10B981", "#059669"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flex: 1, borderRadius: 16, padding: spacing.lg }}>
        <Text style={{ color: "#ECFDF5", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }} numberOfLines={1}>{c.label}</Text>
        <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 4, letterSpacing: -0.24, ...TAB }} numberOfLines={1}>{display}</Text>
        {c.sub ? <Text style={{ color: "rgba(236,253,245,0.9)", fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
      </LinearGradient>
    );
  }
  return (
    <Card padded={false} style={{ flex: 1, padding: spacing.lg, borderRadius: 16 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 }} numberOfLines={1}>{c.label}</Text>
      <Text style={{ color: c.money ? colors.success : colors.text, fontSize: 18, fontWeight: "800", marginTop: 4, letterSpacing: -0.18, ...TAB }} numberOfLines={1}>{display}</Text>
      {c.sub ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{c.sub}</Text> : null}
    </Card>
  );
}

/** 2-col ReportCards grid with EQUAL-HEIGHT rows (mirrors web `grid grid-cols-2`). */
export function MReportCards({ cards, testID }: { cards: Kpi[]; testID?: string }) {
  return (
    <View style={{ gap: spacing.md }} testID={testID || "report-cards"}>
      {chunk2(cards).map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: spacing.md, alignItems: "stretch" }}>
          {row.map((c) => <MKpiCard key={c.label} c={c} />)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

/** Search box with clear button (matches web SearchBox). */
export function MSearchBox({ value, onChange, placeholder = "Search…", testID = "search-input" }:
  { value: string; onChange: (v: string) => void; placeholder?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44 }}>
      <Search size={20} color={colors.textMuted} />
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
          <X size={18} color={colors.textMuted} />
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
          <ChevronLeft size={18} color={colors.textSecondary} />
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
          <ChevronRight size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

/** Premium gradient module header (matches web ModuleHeader). `card` = in-content
 *  rounded-3xl banner (web); default = full-bleed top strip (kept for other screens). */
export function MModuleHeader({ title, subtitle, icon: Ico = TrendingUp, right, card = false }:
  { title: string; subtitle?: string; icon?: LucideIcon; right?: React.ReactNode; card?: boolean }) {
  if (card) {
    return (
      <LinearGradient colors={["#0D47A1", "#1565C0", "#7C3AED"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, padding: 20, overflow: "hidden", boxShadow: "0px 10px 30px rgba(13,71,161,0.28)" }}>
        <View style={{ position: "absolute", top: -30, left: -10, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.12)" }} />
        <View style={{ position: "absolute", bottom: -40, right: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
            <Ico size={24} color="#fff" strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.2 }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={{ color: "rgba(224,242,254,0.85)", fontSize: 12, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      </LinearGradient>
    );
  }
  return (
    <LinearGradient colors={["#0D47A1", "#1565C0", "#7C3AED"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={{ paddingTop: 14, paddingBottom: 16, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
          <Ico size={24} color="#fff" strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: fontSize.xl, fontWeight: "800", letterSpacing: -0.2 }} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={{ color: "rgba(224,242,254,0.85)", fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </LinearGradient>
  );
}

/** Back link row used at the top of detail views. */
export function MBackLink({ label, onPress, testID = "detail-back" }: { label: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}>
      <ArrowLeft size={16} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/** Privacy footnote (matches web PrivacyNote). */
export function MPrivacyNote() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 }}>
      <View style={{ marginTop: 1 }}><ShieldCheck size={16} color={colors.success} /></View>
      <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 17, flex: 1 }}>
        Personal contact details (phone, email, address) are protected and not shared with merchants. You only see referral &amp; commission information.
      </Text>
    </View>
  );
}


/** Referral-type badge — customer = sky, partner = violet (matches web TypeBadge). */
export function MTypeBadge({ type }: { type?: string }) {
  const isCust = type === "customer";
  const bg = isCust ? "#E0F2FE" : "#EDE9FE";
  const fg = isCust ? "#0369A1" : "#6D28D9";
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, alignSelf: "flex-start" }} testID={`type-badge-${isCust ? "customer" : "partner"}`}>
      <Text style={{ color: fg, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>{isCust ? "Customer" : "Partner"}</Text>
    </View>
  );
}

/* ─────────────── Date-range filter (presets + custom range calendar) ─────────────── */
export type DateRange = { range: string; date_from?: string; date_to?: string };

const PRESETS: [string, string][] = [
  ["", "All time"], ["today", "Today"], ["yesterday", "Yesterday"],
  ["this_week", "This Week"], ["this_month", "This Month"], ["last_month", "Last Month"],
];
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const _iso = (dt: Date) => {
  const z = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

/** Range calendar — mirrors web RangeCalendar tap logic (from → to, swap, disable future). */
function RangeCalendar({ from, to, onPick }: { from?: string; to?: string; onPick: (f: string, t: string) => void }) {
  const { colors } = useTheme();
  const base = from ? new Date(from) : new Date();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = view.getFullYear(), m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const monthLabel = view.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const fromD = from ? new Date(`${from}T00:00:00`) : null;
  const toD = to ? new Date(`${to}T00:00:00`) : null;

  const pick = (dt: Date) => {
    const s = _iso(dt);
    if (!fromD || (fromD && toD)) onPick(s, "");
    else if (dt < fromD) onPick(s, _iso(fromD));
    else onPick(_iso(fromD), s);
  };

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));
  const shift = (n: number) => setView(new Date(y, m + n, 1));

  return (
    <View testID="range-calendar">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Pressable testID="cal-prev" onPress={() => shift(-1)} hitSlop={8} style={{ width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={{ fontSize: fontSize.sm, fontWeight: "800", color: colors.text }}>{monthLabel}</Text>
        <Pressable testID="cal-next" onPress={() => shift(1)} hitSlop={8} style={{ width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>
        {WD.map((w, i) => <Text key={i} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 10, fontWeight: "700", color: colors.textMuted, paddingVertical: 2 }}>{w}</Text>)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((dt, i) => {
          if (!dt) return <View key={i} style={{ width: `${100 / 7}%`, height: 38 }} />;
          const s = _iso(dt);
          const isFrom = fromD && s === _iso(fromD);
          const isTo = toD && s === _iso(toD);
          const inRange = fromD && toD && dt > fromD && dt < toD;
          const isToday = s === _iso(today);
          const future = dt > today;
          const edge = isFrom || isTo;
          return (
            <View key={i} style={{ width: `${100 / 7}%`, height: 38, alignItems: "center", justifyContent: "center" }}>
              <Pressable testID={`cal-day-${s}`} disabled={future} onPress={() => pick(dt)}
                style={{ height: 34, width: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", opacity: future ? 0.3 : 1, backgroundColor: edge ? colors.primary : inRange ? colors.primarySubtle : "transparent" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: edge ? "#fff" : inRange ? colors.primary : colors.text }}>{dt.getDate()}</Text>
                {isToday && !edge ? <View style={{ position: "absolute", bottom: 3, height: 3, width: 3, borderRadius: 2, backgroundColor: colors.primary }} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Date range filter trigger + bottom-sheet (presets + custom range). Matches web DateRangeFilter. */
export function MDateRangeFilter({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const range = value.range || "";
  const label = range === "custom"
    ? `${value.date_from || "…"} → ${value.date_to || "…"}`
    : (PRESETS.find((p) => p[0] === range)?.[1] || "All time");

  return (
    <>
      <Pressable testID="date-filter-toggle" onPress={() => setOpen(true)}
        style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <Calendar size={18} color={colors.primary} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, fontWeight: "600", color: colors.text }}>{label}</Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setOpen(false)} />
          <View testID="date-filter-panel" style={{ backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl }}>
            <View style={{ alignItems: "center", marginBottom: spacing.md }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: colors.textMuted, marginBottom: spacing.sm }}>Quick ranges</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {PRESETS.map(([k, lbl]) => {
                const on = range === k;
                return (
                  <Pressable key={k || "all"} testID={`date-preset-${k || "all"}`} onPress={() => { onChange({ range: k }); setOpen(false); }}
                    style={{ width: "31.5%", height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primary : colors.surfaceSubtle }}>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: on ? "#fff" : colors.textSecondary }}>{lbl}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: colors.textMuted }}>Custom range</Text>
                <Text testID="custom-range-label" style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{value.date_from || "start"} → {value.date_to || "end"}</Text>
              </View>
              <RangeCalendar from={value.date_from} to={value.date_to}
                onPick={(f, t) => onChange({ range: "custom", date_from: f, date_to: t })} />
              <Pressable testID="date-apply" disabled={!value.date_from || !value.date_to} onPress={() => setOpen(false)}
                style={{ marginTop: spacing.md, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: (!value.date_from || !value.date_to) ? 0.4 : 1 }}>
                <Text style={{ color: "#fff", fontSize: fontSize.sm, fontWeight: "800" }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
