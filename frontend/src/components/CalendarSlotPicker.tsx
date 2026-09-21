import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Icon } from "@/src/components/Icon";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

type Slot = { h: number; m: number; label: string };
const SLOTS: Slot[] = (() => {
  const out: Slot[] = [];
  for (let h = 8; h <= 19; h++) {
    for (const m of [0, 30]) {
      const hr12 = ((h + 11) % 12) + 1;
      const ap = h < 12 ? "AM" : "PM";
      out.push({ h, m, label: `${hr12}:${String(m).padStart(2, "0")} ${ap}` });
    }
  }
  return out;
})();

/* Rapido/booking-style calendar + time-slot picker. Past dates & past slots (for today)
   are disabled. Emits a full Date once a slot is tapped; emits null when only the day changes. */
export function CalendarSlotPicker({ value, onChange, primary = "#2563EB", surface = "#FFFFFF", text = "#0F172A", muted = "#94A3B8", border = "#E2E8F0" }: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  primary?: string; surface?: string; text?: string; muted?: string; border?: string;
}) {
  const today = startOfDay(new Date());
  const base = value || today;
  const [selDay, setSelDay] = useState<Date | null>(value ? startOfDay(value) : null);
  const [view, setView] = useState(() => new Date(base.getFullYear(), base.getMonth(), 1));

  const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

  const canPrev = view.getFullYear() > today.getFullYear() || (view.getFullYear() === today.getFullYear() && view.getMonth() > today.getMonth());
  const now = new Date();
  const isTodaySel = selDay ? sameDay(selDay, today) : false;
  const selSlotKey = value && selDay && sameDay(startOfDay(value), selDay) ? value.getHours() * 60 + value.getMinutes() : null;

  const shiftMonth = (dir: number) => {
    if (dir < 0 && !canPrev) return;
    setView((v) => new Date(v.getFullYear(), v.getMonth() + dir, 1));
  };
  const pickDay = (d: Date) => {
    if (startOfDay(d) < today) return;
    setSelDay(startOfDay(d));
    onChange(null); // force a fresh slot choice
  };
  const slotDisabled = (s: Slot) => isTodaySel && (s.h < now.getHours() || (s.h === now.getHours() && s.m <= now.getMinutes()));
  const pickSlot = (s: Slot) => {
    if (!selDay || slotDisabled(s)) return;
    const d = new Date(selDay); d.setHours(s.h, s.m, 0, 0);
    onChange(d);
  };

  return (
    <View testID="calendar-slot-picker" style={{ backgroundColor: surface, borderRadius: 20, borderWidth: 1, borderColor: border, padding: 16 }}>
      {/* Month header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Pressable testID="cal-prev" onPress={() => shiftMonth(-1)} disabled={!canPrev} hitSlop={10}
          style={{ width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center", opacity: canPrev ? 1 : 0.35 }}>
          <Icon name="chevron-left" size={20} color={text} />
        </Pressable>
        <Text style={{ color: text, fontSize: 16, fontWeight: "800" }}>{MONTHS[view.getMonth()]} {view.getFullYear()}</Text>
        <Pressable testID="cal-next" onPress={() => shiftMonth(1)} hitSlop={10}
          style={{ width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" }}>
          <Icon name="chevron-right" size={20} color={text} />
        </Pressable>
      </View>

      {/* Weekday row */}
      <View style={{ flexDirection: "row" }}>
        {DOW.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
            <Text style={{ color: muted, fontSize: 11, fontWeight: "700" }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 40 }} />;
          const past = startOfDay(d) < today;
          const selected = selDay ? sameDay(d, selDay) : false;
          const isToday = sameDay(d, today);
          return (
            <View key={i} style={{ width: `${100 / 7}%`, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Pressable testID={`cal-day-${d.getDate()}`} onPress={() => pickDay(d)} disabled={past}
                style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: selected ? primary : "transparent" }}>
                <Text style={{ fontSize: 14, fontWeight: selected ? "800" : "600", color: selected ? "#fff" : past ? "#CBD5E1" : text }}>{d.getDate()}</Text>
                {isToday && !selected ? <View style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: primary }} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Time slots */}
      <Text style={{ color: muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginTop: 14, marginBottom: 8 }}>SELECT A TIME SLOT</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
        {SLOTS.map((s) => {
          const key = s.h * 60 + s.m;
          const active = selSlotKey === key;
          const dis = !selDay || slotDisabled(s);
          return (
            <View key={key} style={{ width: "25%", padding: 4 }}>
              <Pressable testID={`slot-${key}`} onPress={() => pickSlot(s)} disabled={dis}
                style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: active ? primary : border, backgroundColor: active ? primary : surface, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3, opacity: dis && !active ? 0.4 : 1 }}>
                {active ? <Icon name="check" size={13} color="#fff" /> : null}
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#fff" : text }}>{s.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Summary */}
      {value ? (
        <View testID="cal-summary" style={{ marginTop: 12, backgroundColor: primary + "14", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="calendar-check" size={16} color={primary} />
          <Text style={{ color: primary, fontSize: 13.5, fontWeight: "700" }}>
            Scheduled for {SHORT_D[value.getDay()]}, {value.getDate()} {SHORT_M[value.getMonth()]} · {value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
          </Text>
        </View>
      ) : (
        <Text style={{ color: muted, fontSize: 12, marginTop: 12, textAlign: "center" }}>{selDay ? "Now pick a time slot above" : "Pick a date, then a time slot"}</Text>
      )}
    </View>
  );
}
