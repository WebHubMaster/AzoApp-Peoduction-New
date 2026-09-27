/** Maid home card — today's + upcoming subscription work tasks with quick Mark-done.
 * Visible only for partners whose skills include "maid". Past scheduled days stay
 * markable so the maid can mark earlier work later too. */
import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { Surface, money } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabel = (iso: string) => {
  if (iso === todayIso()) return "Today";
  if (iso === plusDays(1)) return "Tomorrow";
  const d = new Date(iso + "T00:00:00");
  return `${WD_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

type Task = { subId: string; code: string; customer: string; time: string; earning: number; date: string; overdue: boolean };

export function MaidTasksCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth() as any;
  const isMaid = (user?.skills || []).includes("maid");

  const q = useQuery({ queryKey: ["maid-subs"], queryFn: () => api.get<any[]>("/subscriptions/partner/mine"), enabled: isMaid });
  const complete = useMutation({
    mutationFn: (t: Task) => api.post(`/subscriptions/${t.subId}/days/${t.date}/complete`),
    onSuccess: () => { toast.success("Marked completed"); qc.invalidateQueries({ queryKey: ["maid-subs"] }); },
    onError: (e: any) => toast.error(e?.detail || "Could not mark completed"),
  });
  if (!isMaid || !(q.data || []).length) return null;

  const tasks: Task[] = [];
  for (const s of q.data || []) {
    if (s.status !== "active") continue;
    for (const d of s.schedule || []) {
      if (d.status !== "scheduled" || d.date > plusDays(7)) continue;
      tasks.push({ subId: s.id, code: s.code, customer: s.customer_name, time: s.preferred_time || "", earning: s.per_day_earning || 0, date: d.date, overdue: d.date < todayIso() });
    }
  }
  tasks.sort((a, b) => a.date.localeCompare(b.date));
  if (!tasks.length) return null;

  return (
    <Surface testID="maid-tasks-card" style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="calendar-heart" size={18} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>My Subscription Tasks</Text>
        </View>
        <Pressable testID="maid-tasks-view-all" onPress={() => router.push("/partner/subscriptions" as any)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>View all</Text>
          <Icon name="chevron-right" size={14} color={colors.primary} />
        </Pressable>
      </View>

      {tasks.map((t) => {
        const markable = t.date <= todayIso();
        return (
          <View key={`${t.subId}-${t.date}`} testID={`maid-task-${t.subId}-${t.date}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, paddingTop: 10 }}>
            <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: t.overdue ? "#FFF1F2" : t.date === todayIso() ? "#ECFDF5" : colors.surfaceSubtle }}>
              <Text style={{ color: t.overdue ? "#F43F5E" : t.date === todayIso() ? "#059669" : colors.primary, fontSize: 11, fontWeight: "800" }}>{t.overdue ? `Missed · ${dayLabel(t.date)}` : dayLabel(t.date)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{t.customer}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 11 }}>{t.code}{t.time ? ` · ${t.time}` : ""} · {money(t.earning)}/day</Text>
            </View>
            {t.date === todayIso() ? (
              <Pressable testID={`maid-task-start-${t.subId}-${t.date}`} onPress={() => router.push("/partner/subscriptions" as any)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Start service</Text>
              </Pressable>
            ) : markable ? (
              <Pressable testID={`maid-task-done-${t.subId}-${t.date}`} disabled={complete.isPending} onPress={() => complete.mutate(t)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Mark done</Text>
              </Pressable>
            ) : (
              <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700" }}>Upcoming</Text>
            )}
          </View>
        );
      })}
    </Surface>
  );
}
