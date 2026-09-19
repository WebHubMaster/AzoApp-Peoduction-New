import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar as CalIcon, ChevronLeft, ChevronRight } from "lucide-react-native";
import { TW, T, usePal } from "./tokens";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* PremiumDatePicker (web) — trigger h-12 rounded-xl + mobile bottom-sheet calendar */
export function WDatePicker({ value, onChange, min, max, placeholder = "Select date", disabled, testID }: {
  value?: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; disabled?: boolean; testID?: string;
}) {
  const P = usePal();
  const insets = useSafeAreaInsets();
  const selected = parseISO(value);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minD = parseISO(min), maxD = parseISO(max);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(selected || today);
  const [mode, setMode] = useState<"days" | "months" | "years">("days");

  const openCal = () => { if (disabled) return; setView(selected || today); setMode("days"); setOpen(true); };
  const isDisabled = (d: Date) => (!!minD && d < minD) || (!!maxD && d > maxD);
  const pick = (d: Date | null) => { if (!d || isDisabled(d)) return; onChange(toISO(d)); setOpen(false); };
  const shiftMonth = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const cells: (Date | null)[] = [];
  const y = view.getFullYear(), m = view.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1, n = new Date(y, m + 1, 0).getDate(); d <= n; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);

  const years: number[] = [];
  for (let yy = minD ? minD.getFullYear() : today.getFullYear() - 100; yy <= (maxD ? maxD.getFullYear() : today.getFullYear() + 10); yy++) years.push(yy);

  const label = selected ? selected.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  const navBtn = (dir: -1 | 1) => (
    <Pressable hitSlop={6} style={{ padding: 6, borderRadius: 8 }} onPress={() => (mode === "days" ? shiftMonth(dir) : setView((v) => new Date(v.getFullYear() + dir * (mode === "years" ? 12 : 1), v.getMonth(), 1)))}>
      {dir < 0 ? <ChevronLeft size={16} color={TW.slate500} /> : <ChevronRight size={16} color={TW.slate500} />}
    </Pressable>
  );

  return (
    <>
      <Pressable testID={testID} disabled={disabled} onPress={openCal}
        style={{ width: "100%", height: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: open ? P[400] : TW.slate200, backgroundColor: "#fff", opacity: disabled ? 0.5 : 1, boxShadow: open ? `0px 0px 0px 2px ${P[100]}` : undefined }}>
        <CalIcon size={16} color={TW.slate400} />
        <Text numberOfLines={1} style={{ flex: 1, ...T.sm, color: label ? TW.slate700 : TW.slate400 }}>{label || placeholder}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} onPress={() => setOpen(false)} />
          <View testID={testID ? `${testID}-cal` : undefined} style={{ backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: TW.slate200, padding: 16, paddingBottom: 16 + insets.bottom, boxShadow: "0px -10px 40px rgba(0,0,0,0.2)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              {navBtn(-1)}
              <Pressable onPress={() => setMode(mode === "days" ? "months" : mode === "months" ? "years" : "days")} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate700 }}>
                  {mode === "days" ? `${MONTHS[view.getMonth()]} ${view.getFullYear()}` : mode === "months" ? String(view.getFullYear()) : `${years[0]} – ${years[years.length - 1]}`}
                </Text>
              </Pressable>
              {navBtn(1)}
            </View>

            {mode === "months" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", paddingVertical: 4 }}>
                {MONTHS.map((mm, i) => {
                  const on = i === view.getMonth();
                  return (
                    <Pressable key={mm} onPress={() => { setView(new Date(view.getFullYear(), i, 1)); setMode("days"); }} style={{ width: "33.33%", padding: 4 }}>
                      <View style={{ paddingVertical: 10, borderRadius: 8, alignItems: "center", backgroundColor: on ? P[600] : "transparent" }}>
                        <Text style={{ ...T.sm, color: on ? "#fff" : TW.slate600, fontWeight: on ? "500" : "400" }}>{mm.slice(0, 3)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {mode === "years" ? (
              <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", paddingVertical: 4 }}>
                {years.map((yy) => {
                  const on = yy === view.getFullYear();
                  return (
                    <Pressable key={yy} onPress={() => { setView(new Date(yy, view.getMonth(), 1)); setMode("months"); }} style={{ width: "33.33%", padding: 4 }}>
                      <View style={{ paddingVertical: 10, borderRadius: 8, alignItems: "center", backgroundColor: on ? P[600] : "transparent" }}>
                        <Text style={{ ...T.sm, color: on ? "#fff" : TW.slate600, fontWeight: on ? "500" : "400" }}>{yy}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {mode === "days" ? (
              <>
                <View style={{ flexDirection: "row", marginBottom: 4 }}>
                  {DOW.map((d) => <Text key={d} style={{ width: `${100 / 7}%`, textAlign: "center", ...T.px11, fontWeight: "500", color: TW.slate400, paddingVertical: 4 }}>{d}</Text>)}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {cells.map((d, i) => {
                    if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
                    const dis = isDisabled(d), isSel = sameDay(d, selected), isToday = sameDay(d, today);
                    return (
                      <View key={toISO(d)} style={{ width: `${100 / 7}%`, height: 40, alignItems: "center", justifyContent: "center" }}>
                        <Pressable disabled={dis} onPress={() => pick(d)} testID={testID ? `${testID}-day-${d.getDate()}` : undefined}
                          style={{ height: 36, width: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: isSel ? P[600] : "transparent", borderWidth: !isSel && isToday ? 1 : 0, borderColor: P[300], boxShadow: isSel ? "0px 4px 6px -1px rgba(13,71,161,0.3)" : undefined }}>
                          <Text style={{ ...T.sm, color: dis ? TW.slate300 : isSel ? "#fff" : isToday ? P[600] : TW.slate600, fontWeight: isSel ? "600" : isToday ? "500" : "400" }}>{d.getDate()}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: TW.slate100 }}>
              <Pressable onPress={() => pick(today)} disabled={isDisabled(today)} style={{ opacity: isDisabled(today) ? 0.4 : 1 }}>
                <Text style={{ ...T.xs, fontWeight: "500", color: P[600] }}>Today</Text>
              </Pressable>
              {value ? <Pressable onPress={() => { onChange(""); setOpen(false); }}><Text style={{ ...T.xs, color: TW.slate400 }}>Clear</Text></Pressable> : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
