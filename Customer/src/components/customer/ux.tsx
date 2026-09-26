/** Ports of web_panel/src/components/customer/ux.jsx primitives (StatTile, StatusChip, EmptyState, skeletons). */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, TextInput, ScrollView, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Inbox, Search, X, Calendar as CalIcon, ChevronLeft, ChevronRight, ArrowUpDown, Check, SlidersHorizontal } from "lucide-react-native";
import { PRIMARY, SLATE, EMERALD, AMBER, ROSE, VIOLET, INDIGO, ORANGE, BLUE, useTheme, shadowElev, shadowBtn } from "@/src/theme";
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
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ marginTop: 6, fontWeight: "900", fontSize: 24, lineHeight: 30, color: "#fff" }}>{display}</Text>
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

/* --------------------------------------------------------- SearchInput --- */
export function SearchInput({ value, onChange, placeholder = "Search…", testID, style }: { value: string; onChange: (v: string) => void; placeholder?: string; testID?: string; style?: any }) {
  const { c, isDark } = useTheme();
  return (
    <View style={[{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], backgroundColor: c.surface, flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 10, gap: 8 }, style]}>
      <Search size={16} color={SLATE[400]} />
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={SLATE[400]}
        style={{ flex: 1, fontSize: 14, color: c.text, height: 38, paddingVertical: 0, outlineStyle: "none" } as any} />
      {value ? <Pressable testID={testID ? `${testID}-clear` : undefined} onPress={() => onChange("")} hitSlop={8}><X size={16} color={SLATE[400]} /></Pressable> : null}
    </View>
  );
}

/* ------------------------------------------------------------ SegTabs ---- */
export function SegTabs({ tabs, value, onChange, counts = {}, testID = "tab" }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void; counts?: Record<string, number>; testID?: string }) {
  const { c, isDark } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingHorizontal: 2 }}>
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <Pressable key={t.key} testID={`${testID}-${t.key}`} onPress={() => onChange(t.key)}
            style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: on ? PRIMARY[700] : c.surface, borderWidth: on ? 0 : 1, borderColor: isDark ? SLATE[700] : SLATE[200], transform: [{ scale: pressed ? 0.97 : 1 }], ...(on ? shadowBtn : {}) })}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: on ? "#fff" : (isDark ? SLATE[300] : SLATE[600]) }}>{t.label}</Text>
            {counts[t.key] != null ? <Text style={{ fontSize: 11, color: on ? "rgba(255,255,255,0.8)" : SLATE[400] }}>{counts[t.key]}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* --------------------------------------------------------- Date range ---- */
export type DateRange = { preset: string; from: Date | null; to: Date | null };
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const DATE_PRESETS = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "This Year", "Custom Range"];
export function computePreset(name: string): { from: Date | null; to: Date | null } {
  const now = new Date(); const t = startOfDay(now);
  switch (name) {
    case "Today": return { from: t, to: endOfDay(now) };
    case "Yesterday": { const y = new Date(t); y.setDate(y.getDate() - 1); return { from: y, to: endOfDay(y) }; }
    case "Last 7 Days": { const f = new Date(t); f.setDate(f.getDate() - 6); return { from: f, to: endOfDay(now) }; }
    case "Last 30 Days": { const f = new Date(t); f.setDate(f.getDate() - 29); return { from: f, to: endOfDay(now) }; }
    case "This Month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "Last Month": return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "This Year": return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    default: return { from: null, to: null };
  }
}
export function inDateRange(dateStr: string | undefined, range: DateRange) {
  if (!range || range.preset === "All" || (!range.from && !range.to)) return true;
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}
const rangeLabel = (r: DateRange) => {
  if (!r || r.preset === "All") return "All time";
  if (r.preset && r.preset !== "Custom Range") return r.preset;
  if (r.from && r.to) return `${r.from.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${r.to.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
  return "Custom";
};

/* Trigger-style pill button (web: h-10 px-3.5 rounded-xl border) */
export function PillTrigger({ icon: Icon, label, onPress, testID, badge }: { icon: any; label: string; onPress: () => void; testID?: string; badge?: number }) {
  const { c, isDark } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], backgroundColor: c.surface, flexDirection: "row", alignItems: "center", gap: 8, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Icon size={16} color={PRIMARY[600]} />
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: isDark ? SLATE[200] : SLATE[700], maxWidth: 140 }}>{label}</Text>
      {badge ? <View style={{ height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{badge}</Text></View> : null}
    </Pressable>
  );
}

/* Bottom sheet (web: Sheet side="bottom" rounded-t-3xl) */
export function BottomSheet({ open, onClose, title, children, footer, testID, maxHeight = "88%" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; testID?: string; maxHeight?: any }) {
  const { c, isDark } = useTheme();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View testID={testID} style={{ backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: isDark ? SLATE[800] : SLATE[100] }}>
            <Text style={{ fontSize: 18, fontWeight: "600", color: c.text }}>{title}</Text>
            <Pressable testID={testID ? `${testID}-close` : undefined} onPress={onClose} hitSlop={8} style={{ height: 32, width: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><X size={18} color={SLATE[400]} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: isDark ? SLATE[800] : SLATE[100] }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/* Mini month calendar for Custom Range */
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function MiniCalendar({ from, to, onPick, minDate, maxDate, testID = "cal", initialView }: { from?: Date | null; to?: Date | null; onPick: (d: Date) => void; minDate?: Date; maxDate?: Date; testID?: string; initialView?: Date }) {
  const { c, isDark } = useTheme();
  const base = initialView || from || new Date();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const cells: (Date | null)[] = [];
  for (let i = 0; i < view.getDay(); i++) cells.push(null);
  const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  const same = (a?: Date | null, b?: Date | null) => !!a && !!b && a.toDateString() === b.toDateString();
  const inSel = (d: Date) => !!from && !!to && d > startOfDay(from) && d < startOfDay(to);
  const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Pressable testID={`${testID}-prev`} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={{ height: 32, width: 32, borderRadius: 8, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} color={SLATE[500]} /></Pressable>
        <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>{MONTHS[view.getMonth()]} {view.getFullYear()}</Text>
        <Pressable testID={`${testID}-next`} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={{ height: 32, width: 32, borderRadius: 8, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center" }}><ChevronRight size={16} color={SLATE[500]} /></Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>{DOW.map((d, i) => <Text key={i} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "700", color: SLATE[400], paddingVertical: 4 }}>{d}</Text>)}</View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 38 }} />;
          const dis = (minDate && d < startOfDay(minDate)) || (maxDate && d > endOfDay(maxDate));
          const sel = same(d, from) || same(d, to);
          return (
            <Pressable key={i} testID={`${testID}-day-${isoD(d)}`} disabled={!!dis} onPress={() => onPick(d)} style={{ width: `${100 / 7}%`, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: inSel(d) ? (isDark ? "rgba(7,52,115,0.35)" : PRIMARY[50]) : "transparent" }}>
              <View style={{ height: 34, width: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: sel ? PRIMARY[700] : "transparent" }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: sel ? "#fff" : dis ? SLATE[300] : (isDark ? SLATE[200] : SLATE[700]) }}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function DateRangePicker({ value, onChange, testID = "date-range" }: { value: DateRange; onChange: (r: DateRange) => void; testID?: string }) {
  const { c, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<{ from: Date | null; to: Date | null }>({ from: value.from, to: value.to });
  const openSheet = () => { setSel({ from: value.from, to: value.to }); setOpen(true); };
  const applyPreset = (name: string) => { if (name === "Custom Range") return; const r = computePreset(name); onChange({ preset: name, from: r.from, to: r.to }); setOpen(false); };
  const pick = (d: Date) => { if (!sel.from || (sel.from && sel.to)) setSel({ from: d, to: null }); else if (d < sel.from) setSel({ from: d, to: sel.from }); else setSel({ from: sel.from, to: d }); };
  const applyCustom = () => { onChange({ preset: "Custom Range", from: sel.from ? startOfDay(sel.from) : null, to: sel.to ? endOfDay(sel.to) : (sel.from ? endOfDay(sel.from) : null) }); setOpen(false); };
  const clear = () => { onChange({ preset: "All", from: null, to: null }); setOpen(false); };
  return (
    <>
      <PillTrigger testID={`${testID}-trigger`} icon={CalIcon} label={rangeLabel(value)} onPress={openSheet} />
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Select date range" testID={`${testID}-sheet`}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
          {DATE_PRESETS.map((p) => (
            <Pressable key={p} testID={`preset-${p.replace(/\s+/g, "-").toLowerCase()}`} onPress={() => applyPreset(p)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: value.preset === p ? (isDark ? "rgba(7,52,115,0.35)" : PRIMARY[50]) : "transparent" }}>
              <Text style={{ fontSize: 14, fontWeight: value.preset === p ? "600" : "400", color: value.preset === p ? c.primaryText : (isDark ? SLATE[300] : SLATE[600]) }}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <MiniCalendar from={sel.from} to={sel.to} onPick={pick} testID={`${testID}-cal`} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Pressable onPress={clear} testID={`${testID}-clear`}><Text style={{ fontSize: 14, color: SLATE[500] }}>Clear</Text></Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setOpen(false)} style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 13, fontWeight: "500", color: c.text }}>Cancel</Text></Pressable>
            <Pressable testID={`${testID}-apply`} disabled={!sel.from} onPress={applyCustom} style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: sel.from ? 1 : 0.5 }}><Text style={{ fontSize: 13, fontWeight: "500", color: "#fff" }}>Apply</Text></Pressable>
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

/* --------------------------------------------------------- SortMenu / Select --- */
export function OptionMenu({ value, options, onChange, icon = ArrowUpDown, title = "Sort by", testID = "sort", placeholder = "Select" }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; icon?: any; title?: string; testID?: string; placeholder?: string }) {
  const { c, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <PillTrigger testID={`${testID}-trigger`} icon={icon} label={cur?.label || placeholder} onPress={() => setOpen(true)} />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} testID={`${testID}-sheet`}>
        <View style={{ gap: 4 }}>
          {options.map((o) => {
            const on = value === o.value;
            return (
              <Pressable key={o.value} testID={`${testID}-${o.value}`} onPress={() => { onChange(o.value); setOpen(false); }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, backgroundColor: on ? (isDark ? "rgba(7,52,115,0.35)" : PRIMARY[50]) : "transparent" }}>
                <Text style={{ fontSize: 14, fontWeight: on ? "600" : "400", color: on ? c.primaryText : (isDark ? SLATE[300] : SLATE[600]) }}>{o.label}</Text>
                {on ? <Check size={16} color={c.primaryText} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}

/* --------------------------------------------------------- FilterSheet --- */
export function FilterButton({ activeCount = 0, onPress, testID = "filters-btn" }: { activeCount?: number; onPress: () => void; testID?: string }) {
  return <PillTrigger testID={testID} icon={SlidersHorizontal} label="Filters" onPress={onPress} badge={activeCount} />;
}
export function FilterSheet({ open, onClose, onClear, onApply, children, title = "Filters" }: { open: boolean; onClose: () => void; onClear: () => void; onApply: () => void; children: React.ReactNode; title?: string }) {
  const { c, isDark } = useTheme();
  return (
    <BottomSheet open={open} onClose={onClose} title={title} testID="filter-sheet"
      footer={<View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable testID="filter-clear" onPress={onClear} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 14, fontWeight: "500", color: c.text }}>Clear All</Text></Pressable>
        <Pressable testID="filter-apply" onPress={onApply} style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 14, fontWeight: "500", color: "#fff" }}>Apply Filters</Text></Pressable>
      </View>}>
      {children}
    </BottomSheet>
  );
}
export const FilterLabel = ({ children }: { children: React.ReactNode }) => <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400], marginBottom: 8 }}>{children}</Text>;

/* --------------------------------------------------------- Paginator (mobile) --- */
export function Paginator({ page, pageSize, total, onPage, testID = "paginator" }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; testID?: string }) {
  const { c, isDark } = useTheme();
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1; const to = Math.min(total, page * pageSize);
  const nav = (dis: boolean, onPress: () => void, Icon: any, id: string) => (
    <Pressable testID={id} disabled={dis} onPress={onPress} style={{ height: 36, width: 36, borderRadius: 8, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center", opacity: dis ? 0.4 : 1 }}><Icon size={16} color={c.text} /></Pressable>
  );
  return (
    <View testID={`${testID}-mobile`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
      <Text style={{ fontSize: 12, color: SLATE[500] }}>{from}–{to} of {total}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {nav(page <= 1, () => onPage(page - 1), ChevronLeft, `${testID}-prev`)}
        <Text style={{ fontSize: 14, fontWeight: "600", color: c.text, paddingHorizontal: 8 }}>{page} / {pages}</Text>
        {nav(page >= pages, () => onPage(page + 1), ChevronRight, `${testID}-next`)}
      </View>
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

/* Non-virtualized list (pages render inside CustomerShell's ScrollView — avoids nested VirtualizedList warning) */
export function PlainList({ data, keyExtractor, ListHeaderComponent, ListEmptyComponent, renderItem, testID }: { data: any[]; keyExtractor: (item: any, index: number) => string; ListHeaderComponent?: React.ReactNode; ListEmptyComponent?: React.ReactNode; renderItem: (info: { item: any; index: number }) => React.ReactNode; testID?: string; contentContainerStyle?: any; initialNumToRender?: number }) {
  return (
    <View testID={testID}>
      {ListHeaderComponent}
      {data.length === 0 ? ListEmptyComponent : data.map((item, index) => <React.Fragment key={keyExtractor(item, index)}>{renderItem({ item, index })}</React.Fragment>)}
    </View>
  );
}
