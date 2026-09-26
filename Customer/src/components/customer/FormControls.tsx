/** Form primitives mirroring web PField / Input / PremiumSelect / DatePicker (mobile). */
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { ChevronDown, Calendar as CalIcon, Check } from "lucide-react-native";
import { PRIMARY, SLATE, useTheme } from "../../theme";
import { BottomSheet, MiniCalendar } from "./ux";

export const onlyDigits = (v: string, max?: number) => { const d = String(v ?? "").replace(/\D/g, ""); return max ? d.slice(0, max) : d; };
export const onlyAlpha = (v: string) => String(v ?? "").replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ");

export const PField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View><Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400] }}>{label}</Text><View style={{ marginTop: 4 }}>{children}</View></View>
);

export function FInput({ value, onChange, placeholder, testID, keyboardType, maxLength, multiline, style }: { value: string; onChange: (v: string) => void; placeholder?: string; testID?: string; keyboardType?: any; maxLength?: number; multiline?: boolean; style?: any }) {
  const { c, isDark } = useTheme();
  return (
    <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={SLATE[400]} keyboardType={keyboardType} maxLength={maxLength} multiline={multiline}
      style={[{ height: multiline ? undefined : 40, minHeight: multiline ? 60 : 40, paddingHorizontal: 12, paddingVertical: multiline ? 8 : 0, borderRadius: 6, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], backgroundColor: c.surface, fontSize: 14, color: c.text, textAlignVertical: multiline ? "top" : "center", outlineStyle: "none" } as any, style]} />
  );
}

export function FSelect({ value, options, onChange, testID = "select", title = "Select", placeholder = "Select" }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; testID?: string; title?: string; placeholder?: string }) {
  const { c, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <Pressable testID={testID} onPress={() => setOpen(true)} style={{ height: 40, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], backgroundColor: c.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 14, color: cur ? c.text : SLATE[400] }}>{cur?.label || placeholder}</Text><ChevronDown size={16} color={SLATE[400]} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} testID={`${testID}-sheet`}>
        <View style={{ gap: 4 }}>
          {options.map((o) => { const on = value === o.value; return (
            <Pressable key={o.value || "_"} testID={`${testID}-opt-${o.value || "none"}`} onPress={() => { onChange(o.value); setOpen(false); }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, backgroundColor: on ? c.primarySoft : "transparent" }}>
              <Text style={{ fontSize: 14, fontWeight: on ? "600" : "400", color: on ? c.primaryText : (isDark ? SLATE[300] : SLATE[600]) }}>{o.label}</Text>{on ? <Check size={16} color={c.primaryText} /> : null}
            </Pressable>); })}
        </View>
      </BottomSheet>
    </>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (v: string) => { const d = new Date(v + "T00:00:00"); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

export function DateField({ value, onChange, placeholder = "Pick a date", fromYear = 1950, toYear = new Date().getFullYear(), maxDate, testID = "date" }: { value: string; onChange: (v: string) => void; placeholder?: string; fromYear?: number; toYear?: number; maxDate?: Date; testID?: string }) {
  const { c, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : null;
  const [year, setYear] = useState((selected || new Date()).getFullYear());
  const years: number[] = []; for (let y = toYear; y >= fromYear; y--) years.push(y);
  return (
    <>
      <Pressable testID={testID} onPress={() => { setYear((selected || new Date()).getFullYear()); setOpen(true); }} style={{ height: 40, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], backgroundColor: c.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 14, color: value ? c.text : SLATE[400] }}>{value ? fmtDate(value) : placeholder}</Text><CalIcon size={16} color={SLATE[400]} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={placeholder} testID={`${testID}-sheet`}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {years.map((y) => <Pressable key={y} testID={`${testID}-year-${y}`} onPress={() => setYear(y)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: year === y ? PRIMARY[700] : (isDark ? SLATE[700] : SLATE[200]), backgroundColor: year === y ? PRIMARY[700] : "transparent" }}><Text style={{ fontSize: 13, fontWeight: "600", color: year === y ? "#fff" : c.textMuted }}>{y}</Text></Pressable>)}
        </ScrollView>
        <MiniCalendar key={year} from={selected} initialView={new Date(year, selected && selected.getFullYear() === year ? selected.getMonth() : 0, 1)} maxDate={maxDate} onPick={(d) => { onChange(iso(d)); setOpen(false); }} testID={`${testID}-cal`} />
        {value ? <Pressable testID={`${testID}-clear`} onPress={() => { onChange(""); setOpen(false); }}><Text style={{ fontSize: 14, color: SLATE[500] }}>Clear</Text></Pressable> : null}
      </BottomSheet>
    </>
  );
}

export function Checkbox({ checked, onChange, label, testID }: { checked: boolean; onChange: (v: boolean) => void; label: string; testID?: string }) {
  const { c, isDark } = useTheme();
  return (
    <Pressable testID={testID} onPress={() => onChange(!checked)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ height: 18, width: 18, borderRadius: 4, borderWidth: 1.5, borderColor: checked ? PRIMARY[700] : (isDark ? SLATE[600] : SLATE[300]), backgroundColor: checked ? PRIMARY[700] : "transparent", alignItems: "center", justifyContent: "center" }}>{checked ? <Check size={12} color="#fff" strokeWidth={3} /> : null}</View>
      <Text style={{ fontSize: 14, color: isDark ? SLATE[300] : SLATE[600] }}>{label}</Text>
    </Pressable>
  );
}
