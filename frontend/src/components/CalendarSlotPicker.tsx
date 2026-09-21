import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Icon } from "@/src/components/Icon";
import { api } from "@/src/api/client";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Fallback 30-min grid used only until the backend (source of truth) responds.
const FALLBACK_SLOTS = (() => { const out: string[] = []; for (let m = 8 * 60; m < 20 * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`); return out; })();

const pad = (n: number) => String(n).padStart(2, "0");
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const to12 = (t: string) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = h % 12 || 12; return `${hh}:${pad(m)} ${ap}`; };

/* Rapido/booking-style calendar + time-slot picker — identical slot source as the customer's
   SchedulePicker (GET /bookings/slot-availability). Past dates & past/full slots are disabled.
   Emits a full Date once a slot is tapped; emits null when only the day changes. */
export function CalendarSlotPicker({ value, onChange, primary = "#2563EB", surface = "#FFFFFF", text = "#0F172A", muted = "#94A3B8", border = "#E2E8F0" }: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  primary?: string; surface?: string; text?: string; muted?: string; border?: string;
}) {
  const today = startOfDay(new Date());
  const base = value || today;
  const [selDay, setSelDay] = useState<Date | null>(value ? startOfDay(value) : null);
  const [view, setView] = useState(() => new Date(base.getFullYear(), base.getMonth(), 1));
  const [slots, setSlots] = useState<string[]>(FALLBACK_SLOTS);
  const [fullSlots, setFullSlots] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<Record<string, number>>({});

  // Fetch the admin-configured slot grid + fully-booked slots for the selected date.
  useEffect(() => {
    if (!selDay) { setFullSlots([]); setRemaining({}); return; }
    let alive = true;
    api.get<any>(`/bookings/slot-availability?date=${isoDay(selDay)}`).then((r) => {
      if (!alive) return;
      setFullSlots(Array.isArray(r?.full_slots) ? r.full_slots : []);
      setRemaining(r?.remaining && typeof r.remaining === "object" ? r.remaining : {});
      if (Array.isArray(r?.slots) && r.slots.length) setSlots(r.slots);
    }).catch(() => { if (alive) { setFullSlots([]); setRemaining({}); } });
    return () => { alive = false; };
  }, [selDay]);

  const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

  const maxDate = new Date(today); maxDate.setDate(today.getDate() + 45);
  const canPrev = view.getFullYear() > today.getFullYear() || (view.getFullYear() === today.getFullYear() && view.getMonth() > today.getMonth());
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= maxDate;
  const now = new Date();
  const isTodaySel = selDay ? sameDay(selDay, today) : false;
  const selSlotStr = value && selDay && sameDay(startOfDay(value), selDay) ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : null;

  const shiftMonth = (dir: number) => {
    if (dir < 0 && !canPrev) return;
    if (dir > 0 && !canNext) return;
    setView((v) => new Date(v.getFullYear(), v.getMonth() + dir, 1));
  };
  const pickDay = (d: Date) => {
    if (startOfDay(d) < today || d > maxDate) return;
    setSelDay(startOfDay(d));
    onChange(null); // force a fresh slot choice
  };
  const slotDisabled = (t: string) => {
    if (fullSlots.includes(t)) return true;
    if (isTodaySel) { const [h, m] = t.split(":").map(Number); return (h * 60 + m) <= (now.getHours() * 60 + now.getMinutes()); }
    return false;
  };
  const pickSlot = (t: string) => {
    if (!selDay || slotDisabled(t)) return;
    const [h, m] = t.split(":").map(Number);
    const d = new Date(selDay); d.setHours(h, m, 0, 0);
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
        <Pressable testID="cal-next" onPress={() => shiftMonth(1)} disabled={!canNext} hitSlop={10}
          style={{ width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center", opacity: canNext ? 1 : 0.35 }}>
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
          const past = startOfDay(d) < today || d > maxDate;
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
        {slots.map((t) => {
          const active = selSlotStr === t;
          const past = isTodaySel && (() => { const [h, m] = t.split(":").map(Number); return (h * 60 + m) <= (now.getHours() * 60 + now.getMinutes()); })();
          const full = fullSlots.includes(t);
          const dis = !selDay || full || past;
          const left = remaining[t];
          const hasLeft = typeof left === "number";
          const caption = full ? "Full" : past ? "Past" : hasLeft ? `${left} left` : null;
          const capColor = active ? "rgba(255,255,255,0.9)" : full || past ? muted : left != null && left <= 1 ? "#D97706" : muted;
          return (
            <View key={t} style={{ width: "25%", padding: 4 }}>
              <Pressable testID={`slot-${t}`} onPress={() => pickSlot(t)} disabled={dis}
                style={{ minHeight: 48, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: active ? primary : border, backgroundColor: active ? primary : surface, alignItems: "center", justifyContent: "center", opacity: dis && !active ? 0.45 : 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  {active ? <Icon name="check" size={12} color="#fff" /> : null}
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#fff" : text, textDecorationLine: full ? "line-through" : "none" }}>{to12(t)}</Text>
                </View>
                {caption ? <Text style={{ fontSize: 9.5, fontWeight: "700", marginTop: 1, color: capColor }}>{caption}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Summary */}
      {value && selSlotStr ? (
        <View testID="cal-summary" style={{ marginTop: 12, backgroundColor: primary + "14", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="calendar-check" size={16} color={primary} />
          <Text style={{ color: primary, fontSize: 13.5, fontWeight: "700" }}>
            Scheduled for {SHORT_D[value.getDay()]}, {value.getDate()} {SHORT_M[value.getMonth()]} · {to12(`${pad(value.getHours())}:${pad(value.getMinutes())}`)}
          </Text>
        </View>
      ) : (
        <Text style={{ color: muted, fontSize: 12, marginTop: 12, textAlign: "center" }}>{selDay ? "Now pick a time slot above" : "Pick a date, then a time slot"}</Text>
      )}
    </View>
  );
}
