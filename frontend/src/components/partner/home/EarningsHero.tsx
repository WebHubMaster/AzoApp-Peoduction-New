import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect, Pattern, Path } from "react-native-svg";
import dayjs from "dayjs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { fmtC } from "@/src/lib/format";
import { Sparkline } from "@/src/components/LineChart";
import { TW, RANGE_LABEL } from "./tw";

export type RangeFilter = { key: string; from?: string; to?: string };
const PRESETS = [
  { key: "7d", label: "7D" }, { key: "30d", label: "30D" }, { key: "90d", label: "90D" },
  { key: "365d", label: "1Y" }, { key: "all", label: "All" },
];

/* web: bg-slate-900 + radial emerald (top-right) + radial blue (bottom-left) + 26px grid @5% */
function HeroBackdrop() {
  return (
    <Svg style={{ position: "absolute", inset: 0 }} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id="g1" cx="100%" cy="0%" rx="110%" ry="80%">
          <Stop offset="0" stopColor={TW.emerald500} stopOpacity="0.45" /><Stop offset="0.55" stopColor={TW.emerald500} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="g2" cx="0%" cy="100%" rx="85%" ry="70%">
          <Stop offset="0" stopColor={TW.blue700} stopOpacity="0.5" /><Stop offset="0.6" stopColor={TW.blue700} stopOpacity="0" />
        </RadialGradient>
        <Pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <Path d="M 26 0 L 0 0 0 26" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={TW.slate900} />
      <Rect width="100%" height="100%" fill="url(#g1)" />
      <Rect width="100%" height="100%" fill="url(#g2)" />
      <Rect width="100%" height="100%" fill="url(#grid)" opacity="0.05" />
    </Svg>
  );
}

export function RangeControl({ filter, setFilter }: { filter: RangeFilter; setFilter: (f: RangeFilter) => void }) {
  const [open, setOpen] = useState(false);
  const isCustom = filter.key === "custom";
  const customLabel = isCustom ? `${dayjs(filter.from).format("D MMM")} – ${dayjs(filter.to).format("D MMM")}` : "Custom";
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="ph-range" style={{ backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 12 }} contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 4, flexGrow: 1 }}>
        {PRESETS.map((r) => {
          const on = filter.key === r.key;
          return (
            <Pressable key={r.key} testID={`range-${r.key}`} onPress={() => setFilter({ key: r.key })} style={{ flexGrow: 1, minWidth: 46, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: "center", backgroundColor: on ? "#fff" : "transparent", boxShadow: on ? "0px 1px 3px rgba(0,0,0,0.2)" : undefined }}>
              <Text style={{ color: on ? TW.slate900 : "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700" }}>{r.label}</Text>
            </Pressable>
          );
        })}
        <Pressable testID="range-custom" onPress={() => setOpen(true)} style={{ flexShrink: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: isCustom ? "#fff" : "transparent", boxShadow: isCustom ? "0px 1px 3px rgba(0,0,0,0.2)" : undefined }}>
          <Icon name="calendar-month-outline" size={14} color={isCustom ? TW.slate900 : "rgba(255,255,255,0.7)"} />
          <Text style={{ color: isCustom ? TW.slate900 : "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700" }}>{customLabel}</Text>
        </Pressable>
      </ScrollView>
      <RangeSheet open={open} onClose={() => setOpen(false)} onApply={(from, to) => { setFilter({ key: "custom", from: dayjs(from).format("YYYY-MM-DD"), to: dayjs(to).format("YYYY-MM-DD") }); setOpen(false); }} />
    </>
  );
}

/* Custom range popover (web Popover + Calendar mode=range) → bottom-sheet with quick presets + month grid. */
function RangeSheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (from: Date, to: Date) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(dayjs().startOf("month"));
  const [from, setFrom] = useState<dayjs.Dayjs | null>(null);
  const [to, setTo] = useState<dayjs.Dayjs | null>(null);
  const quick = [
    { label: "Today", fn: () => onApply(new Date(), new Date()) },
    { label: "Yesterday", fn: () => onApply(dayjs().subtract(1, "day").toDate(), dayjs().subtract(1, "day").toDate()) },
    { label: "This month", fn: () => onApply(dayjs().startOf("month").toDate(), new Date()) },
    { label: "Last month", fn: () => onApply(dayjs().subtract(1, "month").startOf("month").toDate(), dayjs().subtract(1, "month").endOf("month").toDate()) },
  ];
  const pick = (d: dayjs.Dayjs) => {
    if (!from || (from && to)) { setFrom(d); setTo(null); return; }
    if (d.isBefore(from)) { setTo(from); setFrom(d); } else setTo(d);
  };
  const lead = month.day();
  const days = month.daysInMonth();
  const cells: (dayjs.Dayjs | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => month.add(i, "day"))];
  const inRange = (d: dayjs.Dayjs) => from && to && !d.isBefore(from, "day") && !d.isAfter(to, "day");
  const isEdge = (d: dayjs.Dayjs) => (from && d.isSame(from, "day")) || (to && d.isSame(to, "day"));
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} testID="range-popover" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: insets.bottom + 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 12 }} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {quick.map((q) => (
              <Pressable key={q.label} testID={`preset-${q.label}`} onPress={q.fn} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceSubtle }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{q.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ padding: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Pressable testID="cal-prev" onPress={() => setMonth(month.subtract(1, "month"))} hitSlop={8} style={{ padding: 6 }}><Icon name="chevron-left" size={20} color={colors.textSecondary} /></Pressable>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{month.format("MMMM YYYY")}</Text>
              <Pressable testID="cal-next" onPress={() => setMonth(month.add(1, "month"))} hitSlop={8} style={{ padding: 6 }}><Icon name="chevron-right" size={20} color={colors.textSecondary} /></Pressable>
            </View>
            <View style={{ flexDirection: "row" }}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <Text key={d} style={{ width: "14.28%", textAlign: "center", color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
              {cells.map((d, i) => d ? (
                <Pressable key={i} testID={`cal-day-${d.format("YYYY-MM-DD")}`} onPress={() => pick(d)} disabled={d.isAfter(dayjs(), "day")} style={{ width: "14.28%", height: 38, alignItems: "center", justifyContent: "center", backgroundColor: inRange(d) ? colors.primarySubtle : "transparent" }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: isEdge(d) ? colors.primary : "transparent" }}>
                    <Text style={{ color: isEdge(d) ? "#fff" : d.isAfter(dayjs(), "day") ? colors.border : colors.text, fontSize: 13, fontWeight: isEdge(d) ? "700" : "500" }}>{d.date()}</Text>
                  </View>
                </Pressable>
              ) : <View key={i} style={{ width: "14.28%", height: 38 }} />)}
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Pressable testID="range-clear" onPress={() => { setFrom(null); setTo(null); }}><Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>Clear</Text></Pressable>
            <Pressable testID="range-apply" disabled={!from || !to} onPress={() => from && to && onApply(from.toDate(), to.toDate())} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primaryHover, opacity: from && to ? 1 : 0.4 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function EarningsHero({ k, chart, filter, setFilter }: { k: any; chart: any[]; filter: RangeFilter; setFilter: (f: RangeFilter) => void }) {
  return (
    <View testID="ph-hero" style={{ borderRadius: 24, overflow: "hidden", padding: 20, boxShadow: "0px 24px 50px -24px rgba(15,23,42,0.8)" }}>
      <HeroBackdrop />
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="currency-inr" size={14} color="rgba(255,255,255,0.6)" />
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", flexShrink: 1 }} numberOfLines={1}>Earnings · {RANGE_LABEL[filter.key] || "Custom"}</Text>
          </View>
          <Text testID="ph-earnings" style={{ color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: -0.5, marginTop: 8 }} numberOfLines={1} adjustsFontSizeToFit>{fmtC(k.earnings)}</Text>
        </View>
        {k.rating ? (
          <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 4 }}>
            <Icon name="star" size={14} color={TW.amber300} /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{(k.rating || 0).toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: 16 }}><RangeControl filter={filter} setFilter={setFilter} /></View>
      <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
        {[{ l: "Today", v: k.today_earnings }, { l: "This week", v: k.week_earnings }, { l: "This month", v: k.month_earnings }].map((x) => (
          <View key={x.l} style={{ flex: 1, minWidth: 0, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", padding: 12 }}>
            <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>{x.l}</Text>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{fmtC(x.v)}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 16, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingTop: 10, paddingHorizontal: 8, paddingBottom: 8, height: 128 }}>
        {chart.length === 0
          ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>No earnings in this period yet.</Text></View>
          : <Sparkline data={chart} height={110} stroke={TW.emerald400} />}
      </View>
    </View>
  );
}
