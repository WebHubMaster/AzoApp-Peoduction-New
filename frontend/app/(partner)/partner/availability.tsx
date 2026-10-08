import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal } from "react-native";
import { RefreshControl } from "@/src/components/RefreshNote";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader, Surface } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

const GREEN = "#10B981", GREEN_50 = "#ECFDF5", GREEN_200 = "#A7F3D0", GREEN_700 = "#047857";
const RED = "#F43F5E", RED_50 = "#FFF1F2", RED_200 = "#FECDD3", RED_700 = "#BE123C";
const SLATE300 = "#CBD5E1", SLATE400 = "#94A3B8";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Partner availability — clean, full-width month calendar + availability counter. */
export default function PartnerAvailability() {
  const { colors, mode } = useTheme();
  const dark = mode === "dark";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({ queryKey: ["partner-availability"], queryFn: () => api.get<any>("/partner/availability/calendar") });
  const statusMap = useMemo(() => { const m: Record<string, string> = {}; (data?.calendar || []).forEach((r: any) => { m[r.date] = r.status; }); return m; }, [data]);
  const today = data?.today || iso(new Date());
  const maxAvail = data?.max_available ?? 7;
  const availCount = data?.available_count ?? 0;
  const pct = Math.min(100, Math.round((availCount / Math.max(1, maxAvail)) * 100));

  const setDate = useMutation({
    mutationFn: ({ date, status }: { date: string; status: string }) => api.post("/partner/availability/calendar/set", { date, status }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["partner-availability"] }); toast.success(v.status === "available" ? "Marked available" : "Marked not available"); },
    onError: (e: any) => toast.error(e?.detail || "Could not update"),
  });

  const onTap = (d: string) => { if (d < today) return; setPicked(d); };
  const choose = (status: string) => { if (!picked) return; setDate.mutate({ date: picked, status }); setPicked(null); };

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysIn }, (_, i) => iso(new Date(year, month, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const monthLabel = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const upcoming = (data?.calendar || []).filter((c: any) => c.status === "available").map((c: any) => c.date).sort();

  const navBtn = { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.surface };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 110, gap: 14 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ["partner-availability"] })} tintColor={colors.primary} colors={[colors.primary]} />}>

        {/* Availability counter (no screen title) */}
        <Surface testID="partner-availability-header" style={{ padding: 18, borderRadius: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                <Icon name="calendar-month-outline" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>Available dates</Text>
                <Text style={{ marginTop: 2 }}><Text style={{ color: GREEN_700, fontSize: 26, fontWeight: "800" }}>{availCount}</Text><Text style={{ color: SLATE400, fontSize: 17, fontWeight: "600" }}> / {maxAvail}</Text></Text>
              </View>
            </View>
            <View style={{ backgroundColor: GREEN_50, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: GREEN_700, fontSize: 12, fontWeight: "700" }}>{pct}%</Text>
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: dark ? colors.surfaceSubtle : "#E2E8F0", marginTop: 14, overflow: "hidden" }}>
            <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
          </View>
        </Surface>

        {/* Calendar */}
        <Surface style={{ padding: 14, borderRadius: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Pressable testID="cal-prev" onPress={() => setCursor(new Date(year, month - 1, 1))} style={navBtn}><Icon name="chevron-left" size={20} color={colors.textSecondary} /></Pressable>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{monthLabel}</Text>
            <Pressable testID="cal-next" onPress={() => setCursor(new Date(year, month + 1, 1))} style={navBtn}><Icon name="chevron-right" size={20} color={colors.textSecondary} /></Pressable>
          </View>

          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} style={{ flex: 1, textAlign: "center", color: SLATE400, fontSize: 12, fontWeight: "700" }}>{d}</Text>)}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={{ width: "14.2857%", padding: 2.5 }} />;
              const past = d < today; const isToday = d === today; const st = statusMap[d];
              const avail = st === "available", unavail = st === "unavailable";
              const bg = past ? "transparent" : avail ? GREEN_50 : unavail ? RED_50 : colors.surface;
              const border = isToday ? colors.primary : avail ? GREEN_200 : unavail ? RED_200 : (past ? "transparent" : colors.border);
              const fg = past ? SLATE300 : avail ? GREEN_700 : unavail ? RED_700 : colors.text;
              const dot = avail ? GREEN : unavail ? RED : null;
              return (
                <View key={d} style={{ width: "14.2857%", padding: 2.5 }}>
                  <Pressable testID={`avail-${d}`} disabled={past} onPress={() => onTap(d)}
                    style={{ aspectRatio: 1, borderRadius: 10, backgroundColor: bg, borderWidth: isToday ? 2 : 1, borderColor: border, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: isToday ? colors.primary : fg, fontSize: 15, fontWeight: isToday ? "800" : "700" }}>{Number(d.slice(-2))}</Text>
                    <View style={{ height: 5, width: 5, borderRadius: 3, marginTop: 4, backgroundColor: dot || "transparent" }} />
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
            {[[GREEN, "Available"], [RED, "Not available"], [SLATE300, "Awaiting"]].map(([c, l]) => (
              <View key={String(l)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: String(c) }} /><Text style={{ color: colors.textSecondary, fontSize: 13 }}>{String(l)}</Text></View>
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.primary }} /><Text style={{ color: colors.textSecondary, fontSize: 13 }}>Today</Text></View>
          </View>
        </Surface>

        {/* Next available dates */}
        <View>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 10 }}>Next available dates</Text>
          {upcoming.length === 0 ? (
            <Surface style={{ padding: 20, alignItems: "center", borderStyle: "dashed", borderRadius: 14 }}><Text style={{ color: SLATE400, fontSize: 14, textAlign: "center" }}>No available dates picked yet. Tap a day above to mark it Available.</Text></Surface>
          ) : upcoming.map((d: string) => (
            <View key={d} testID={`next-${d}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 6, borderWidth: 1, borderColor: GREEN_200, backgroundColor: dark ? "rgba(6,78,59,0.25)" : "rgba(236,253,245,0.6)", paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="calendar-check-outline" size={18} color={GREEN_700} /><Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="check-circle-outline" size={18} color={GREEN_700} /><Text style={{ color: GREEN_700, fontSize: 14, fontWeight: "700" }}>Available</Text></View>
            </View>
          ))}
        </View>
      </ScrollView>

      {picked ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setPicked(null)}>
          <Pressable onPress={() => setPicked(null)} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
            <Pressable onPress={() => {}} testID="availability-popup" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: insets.bottom + 20 }}>
              <View style={{ alignSelf: "center", height: 5, width: 44, borderRadius: 3, backgroundColor: colors.border, marginBottom: 16 }} />
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>Availability</Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 }}>Are you available on this date?</Text>
              <View style={{ marginTop: 14, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Date</Text>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 2 }}>{new Date(picked + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Text>
              </View>
              {statusMap[picked] ? (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 12 }}>Currently: <Text style={{ color: statusMap[picked] === "available" ? GREEN_700 : "#E11D48", fontWeight: "700" }}>{statusMap[picked] === "available" ? "Available" : "Not Available"}</Text> · tap either to change</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <Pressable testID="popup-available" disabled={setDate.isPending} onPress={() => choose("available")} style={{ flex: 1, height: 48, borderRadius: 6, backgroundColor: GREEN_700, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: setDate.isPending ? 0.6 : 1 }}><Icon name="check-circle-outline" size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{setDate.isPending ? "Saving…" : "Available"}</Text></Pressable>
                <Pressable testID="popup-unavailable" disabled={setDate.isPending} onPress={() => choose("unavailable")} style={{ flex: 1, height: 48, borderRadius: 6, borderWidth: 2, borderColor: RED_200, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: setDate.isPending ? 0.6 : 1 }}><Icon name="close-circle-outline" size={18} color="#E11D48" /><Text style={{ color: "#E11D48", fontWeight: "700", fontSize: 15 }}>Not Available</Text></Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}
