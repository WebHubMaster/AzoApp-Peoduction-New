import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Modal } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader, Surface } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

const GREEN = "#10B981", RED = "#F43F5E", SLATE300 = "#CBD5E1", SLATE400 = "#94A3B8";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Web AvailabilitySection — My Availability card + month calendar + legend + next available dates */
export default function PartnerAvailability() {
  const { colors } = useTheme();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 16 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ["partner-availability"] })} tintColor={colors.primary} colors={[colors.primary]} />}>
        {/* Info card */}
        <View testID="partner-availability-header" style={{ borderRadius: 24, backgroundColor: "#E8F1FB", padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#1976D2", alignItems: "center", justifyContent: "center" }}><Icon name="calendar-month-outline" size={24} color="#fff" /></View>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>My Availability</Text>
          </View>
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 16, marginTop: 16, width: "100%", boxShadow: "0px 4px 12px rgba(2,32,71,0.06)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: SLATE400, fontSize: 12, fontWeight: "700", letterSpacing: 0.8 }}>AVAILABLE DATES</Text>
              <Text><Text style={{ color: "#059669", fontSize: 26, fontWeight: "800" }}>{availCount}</Text><Text style={{ color: SLATE400, fontSize: 18, fontWeight: "600" }}> / {maxAvail}</Text></Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: "#E2E8F0", marginTop: 10, overflow: "hidden" }}><View style={{ width: `${Math.min(100, (availCount / maxAvail) * 100)}%`, height: 6, backgroundColor: GREEN }} /></View>
          </View>
        </View>

        {/* Calendar */}
        <Surface style={{ padding: 16, borderRadius: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable testID="cal-prev" onPress={() => setCursor(new Date(year, month - 1, 1))} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Icon name="chevron-left" size={20} color={colors.textSecondary} /></Pressable>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{monthLabel}</Text>
            <Pressable testID="cal-next" onPress={() => setCursor(new Date(year, month + 1, 1))} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Icon name="chevron-right" size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <View style={{ flexDirection: "row", marginTop: 16 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} style={{ flex: 1, textAlign: "center", color: SLATE400, fontSize: 12, fontWeight: "700" }}>{d}</Text>)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={{ width: "14.28%", padding: 3 }} />;
              const past = d < today; const isToday = d === today; const st = statusMap[d];
              const bg = past ? colors.surfaceSubtle : st === "available" ? "#ECFDF5" : st === "unavailable" ? "#FFF1F2" : colors.surface;
              const fg = past ? SLATE300 : st === "available" ? "#047857" : st === "unavailable" ? "#BE123C" : colors.text;
              const sub = past ? "" : st === "available" ? "Available" : st === "unavailable" ? "Not avail." : "Awaiting";
              return (
                <View key={d} style={{ width: "14.28%", padding: 3 }}>
                  <Pressable testID={`avail-${d}`} disabled={past} onPress={() => onTap(d)} style={{ aspectRatio: 1, borderRadius: 12, backgroundColor: bg, borderWidth: isToday ? 2 : 1, borderColor: isToday ? "#1976D2" : past ? "transparent" : colors.border, alignItems: "center", justifyContent: "center", boxShadow: past ? undefined : "0px 2px 6px rgba(2,32,71,0.05)" }}>
                    <Text style={{ color: fg, fontSize: 16, fontWeight: "800" }}>{Number(d.slice(-2))}</Text>
                    {sub ? <Text style={{ color: st ? fg : SLATE400, fontSize: 8, fontWeight: "600", marginTop: 1 }} numberOfLines={1}>{sub}</Text> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 16, paddingHorizontal: 4 }}>
            {[[GREEN, "Available"], [RED, "Not Available"], [SLATE300, "Awaiting"]].map(([c, l]) => (
              <View key={String(l)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: String(c) }} /><Text style={{ color: colors.textSecondary, fontSize: 14 }}>{String(l)}</Text></View>
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#1976D2" }} /><Text style={{ color: colors.textSecondary, fontSize: 14 }}>Today</Text></View>
          </View>
        </Surface>

        {/* Next available dates */}
        <View>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 12 }}>Next available dates</Text>
          {upcoming.length === 0 ? (
            <Surface style={{ padding: 20, alignItems: "center", borderStyle: "dashed" }}><Text style={{ color: SLATE400, fontSize: 14 }}>No available dates picked yet. Tap a day above to mark it Available.</Text></Surface>
          ) : upcoming.map((d: string) => (
            <View key={d} testID={`next-${d}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "rgba(236,253,245,0.5)", paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="calendar-check-outline" size={18} color="#DC2626" /><Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="check-circle-outline" size={18} color="#059669" /><Text style={{ color: "#059669", fontSize: 15, fontWeight: "700" }}>Available</Text></View>
            </View>
          ))}
        </View>
      </ScrollView>

      {picked ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setPicked(null)}>
          <Pressable onPress={() => setPicked(null)} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
            <Pressable onPress={() => {}} testID="availability-popup" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20 }}>
              <View style={{ alignSelf: "center", height: 5, width: 44, borderRadius: 3, backgroundColor: colors.border, marginBottom: 16 }} />
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>Availability</Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 }}>Are you available on this date?</Text>
              <View style={{ marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Date</Text>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 2 }}>{new Date(picked + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Text>
              </View>
              {statusMap[picked] ? (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 12 }}>Currently: <Text style={{ color: statusMap[picked] === "available" ? "#059669" : "#E11D48", fontWeight: "700" }}>{statusMap[picked] === "available" ? "Available" : "Not Available"}</Text> · tap either to change</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <Pressable testID="popup-available" disabled={setDate.isPending} onPress={() => choose("available")} style={{ flex: 1, height: 48, borderRadius: 16, backgroundColor: "#059669", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: setDate.isPending ? 0.6 : 1 }}><Icon name="check-circle-outline" size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{setDate.isPending ? "Saving…" : "Available"}</Text></Pressable>
                <Pressable testID="popup-unavailable" disabled={setDate.isPending} onPress={() => choose("unavailable")} style={{ flex: 1, height: 48, borderRadius: 16, borderWidth: 2, borderColor: "#FECDD3", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: setDate.isPending ? 0.6 : 1 }}><Icon name="close-circle-outline" size={18} color="#E11D48" /><Text style={{ color: "#E11D48", fontWeight: "700", fontSize: 15 }}>Not Available</Text></Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}
