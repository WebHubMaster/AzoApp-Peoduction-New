/** Port of web_panel/src/components/site/SchedulePicker.jsx — calendar + admin slot grid (/bookings/slot-availability). */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronLeft, ChevronRight, Check, CalendarX2, ArrowRight } from "lucide-react-native";
import { api } from "../../api/client";
import { PRIMARY, SLATE, AMBER, useTheme, shadowBtn } from "../../theme";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FALLBACK_SLOTS = (() => { const out: string[] = []; for (let m = 8 * 60; m < 20 * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`); return out; })();
const to12 = (t: string) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`; };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const prettyDate = (ds: string) => { try { return new Date(`${ds}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }); } catch { return ds; } };

export function SchedulePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { c, isDark } = useTheme();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const now = new Date();
  const [dateStr, setDateStr] = useState<string | null>(value ? value.split("T")[0] : null);
  const selTime = value && value.split("T")[1] ? value.split("T")[1].slice(0, 5) : null;
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [fullSlots, setFullSlots] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>(FALLBACK_SLOTS);

  useEffect(() => {
    if (!dateStr) { setFullSlots([]); return; }
    api.get<any>(`/bookings/slot-availability?date=${dateStr}`).then((r) => { setFullSlots(r?.full_slots || []); if (Array.isArray(r?.slots) && r.slots.length) setSlots(r.slots); }).catch(() => setFullSlots([]));
  }, [dateStr]);

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    return cells;
  }, [view]);

  const maxDate = new Date(today); maxDate.setDate(today.getDate() + 45);
  const canPrev = new Date(view.getFullYear(), view.getMonth(), 1) > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= maxDate;
  const slotDisabledOn = (t: string, ds: string, fulls: string[]) => {
    if (fulls.includes(t)) return true;
    if (ds === iso(now)) { const [h, m] = t.split(":").map(Number); return h * 60 + m <= now.getHours() * 60 + now.getMinutes(); }
    return false;
  };
  const isSlotDisabled = (t: string) => (dateStr ? slotDisabledOn(t, dateStr, fullSlots) : false);
  const firstAvailable = (ds: string, fulls: string[] = []) => (!slotDisabledOn("10:00", ds, fulls) ? "10:00" : slots.find((t) => !slotDisabledOn(t, ds, fulls)) || null);
  const todayExhausted = !firstAvailable(iso(now), []);
  const selectDate = (ds: string) => { setDateStr(ds); const ft = firstAvailable(ds, []); onChange(ft ? `${ds}T${ft}` : null); };
  const goNextDay = () => {
    const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date(today);
    base.setDate(base.getDate() + 1); base.setHours(0, 0, 0, 0);
    if (base > maxDate) return;
    if (base.getMonth() !== view.getMonth() || base.getFullYear() !== view.getFullYear()) setView(new Date(base.getFullYear(), base.getMonth(), 1));
    selectDate(iso(base));
  };
  const availForSel = dateStr ? slots.filter((t) => !isSlotDisabled(t)) : [];
  const noSlotsForSel = !!dateStr && availForSel.length === 0;

  useEffect(() => {
    if (value) return;
    const base = new Date(today);
    if (todayExhausted) base.setDate(base.getDate() + 1);
    if (base.getMonth() !== view.getMonth() || base.getFullYear() !== view.getFullYear()) setView(new Date(base.getFullYear(), base.getMonth(), 1));
    selectDate(iso(base));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dateStr || !selTime) return;
    if (slotDisabledOn(selTime, dateStr, fullSlots)) { const ft = firstAvailable(dateStr, fullSlots); onChange(ft ? `${dateStr}T${ft}` : null); }
  }, [fullSlots]); // eslint-disable-line react-hooks/exhaustive-deps

  const navBtn = (dis: boolean, onPress: () => void, Icon: any, id: string) => (
    <Pressable testID={id} disabled={dis} onPress={onPress} style={{ height: 32, width: 32, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", opacity: dis ? 0.3 : 1 }}><Icon size={16} color={SLATE[500]} /></Pressable>
  );
  return (
    <View testID="schedule-picker" style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        {navBtn(!canPrev, () => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1)), ChevronLeft, "cal-prev")}
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{MONTHS[view.getMonth()]} {view.getFullYear()}</Text>
        {navBtn(!canNext, () => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1)), ChevronRight, "cal-next")}
      </View>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>{DOW.map((d, i) => <Text key={i} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "700", color: SLATE[400], paddingVertical: 4 }}>{d}</Text>)}</View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {days.map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 40 }} />;
          const isTodayCell = iso(d) === iso(today);
          const past = d < today || d > maxDate || (isTodayCell && todayExhausted);
          const isSel = dateStr === iso(d);
          return (
            <Pressable key={i} testID={`cal-day-${iso(d)}`} disabled={past} onPress={() => selectDate(iso(d))} style={{ width: `${100 / 7}%`, height: 40, padding: 2 }}>
              <View style={{ flex: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: isSel ? PRIMARY[700] : "transparent", ...(isSel ? shadowBtn : {}) }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: isSel ? "#fff" : past ? SLATE[300] : (isDark ? SLATE[200] : SLATE[700]) }}>{d.getDate()}</Text>
                {isTodayCell && !isSel ? <View style={{ position: "absolute", bottom: 4, height: 4, width: 4, borderRadius: 2, backgroundColor: todayExhausted ? SLATE[300] : PRIMARY[600] }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.borderSoft }}>
        <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400], marginBottom: 8 }}>Select a time slot</Text>
        {!dateStr ? <Text style={{ fontSize: 14, color: SLATE[400] }}>Pick a date first.</Text> : null}
        {noSlotsForSel ? (
          <View testID="no-slots-notice" style={{ borderRadius: 12, backgroundColor: AMBER[50], borderWidth: 1, borderColor: AMBER[200], padding: 12, flexDirection: "row", gap: 12 }}>
            <CalendarX2 size={20} color={AMBER[600]} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#78350F" }}>No time slots available for {dateStr === iso(today) ? "today" : prettyDate(dateStr!)}.</Text>
              <Text style={{ fontSize: 12, color: AMBER[700], marginTop: 2 }}>{dateStr === iso(today) ? "Today's slots are over — please book for the next day." : "This day is fully booked. Please choose another day."}</Text>
              <Pressable testID="book-next-day" onPress={goNextDay} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}><Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY[700] }}>Book next day</Text><ArrowRight size={16} color={PRIMARY[700]} /></Pressable>
            </View>
          </View>
        ) : null}
        {dateStr && !noSlotsForSel ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {slots.map((t) => {
              const dis = isSlotDisabled(t); const active = selTime === t; const isFull = fullSlots.includes(t);
              return (
                <Pressable key={t} testID={`slot-${t}`} disabled={dis} onPress={() => onChange(`${dateStr}T${t}`)} style={{ width: "31%", flexGrow: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: active ? PRIMARY[700] : dis ? c.borderSoft : c.border, backgroundColor: active ? PRIMARY[700] : "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  {active ? <Check size={12} color="#fff" /> : null}
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#fff" : dis ? SLATE[300] : (isDark ? SLATE[200] : SLATE[700]), textDecorationLine: dis ? "line-through" : "none" }}>{to12(t)}{isFull ? " ·Full" : ""}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      {value && selTime ? (
        <View style={{ marginTop: 12, borderRadius: 8, backgroundColor: isDark ? "rgba(7,52,115,0.35)" : PRIMARY[50], paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: isDark ? PRIMARY[200] : PRIMARY[800] }}>Scheduled for {new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · {to12(selTime)}</Text>
        </View>
      ) : null}
    </View>
  );
}
