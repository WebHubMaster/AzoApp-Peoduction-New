import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader, Surface, KitEmpty, KV, StatusBadge, money, shortDate } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

const SLATE = "#94A3B8";
const todayIso = () => new Date().toISOString().slice(0, 10);

const DAY_META: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: "#0659B2", bg: "#F0F7FE" },
  completed: { label: "Completed", color: "#059669", bg: "#ECFDF5" },
  replacement_completed: { label: "Replacement", color: "#7C3AED", bg: "#F5F3FF" },
  maid_absent: { label: "Maid Absent", color: "#F43F5E", bg: "#FFF1F2" },
  customer_cancel: { label: "Customer Cancel", color: "#D97706", bg: "#FFFBEB" },
  weekly_off: { label: "Weekly Off", color: "#64748B", bg: "#F1F5F9" },
};

function StatCol({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: SLATE, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      <Text style={{ color: tone || colors.text, fontSize: 16, fontWeight: "800", marginTop: 3, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function SubDetail({ sub, onBack, reload }: { sub: any; onBack: () => void; reload: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const s = sub;

  const complete = useMutation({
    mutationFn: (date: string) => api.post(`/subscriptions/${s.id}/days/${date}/complete`),
    onSuccess: () => { toast.success("Marked completed"); qc.invalidateQueries({ queryKey: ["maid-subs"] }); reload(); },
    onError: (e: any) => toast.error(e?.detail || "Could not mark completed"),
  });

  const schedule: any[] = s.schedule || [];
  const canMark = (d: any) => s.status === "active" && d.status === "scheduled" && d.date <= todayIso();

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 16 }} showsVerticalScrollIndicator={false}>
      <Pressable testID="sub-back" onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="arrow-left" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "700" }}>All subscriptions</Text>
      </Pressable>

      {/* Summary hero — matches the requested layout */}
      <LinearGradient colors={[colors.primary, "#0f52ba", "#0a2e6b"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 22 }}>
        <Text style={{ color: "#BFDBFE", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.6 }}>{s.plan_label || s.plan_type} {s.category_name || "Maid"} Subscription</Text>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 4 }}>{s.customer_name}</Text>
        <Text style={{ color: "#BFDBFE", fontSize: 13, marginTop: 2 }}>{shortDate(s.start_date)} – {shortDate(s.end_date)}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
          {[["Working", s.working_days], ["Completed", s.completed_days], ["Absent", s.absent_days]].map(([k, v]) => (
            <View key={String(k)} style={{ flex: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", padding: 10 }}>
              <Text style={{ color: "#BFDBFE", fontSize: 10, textTransform: "uppercase" }}>{k}</Text>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 2 }}>{v ?? 0}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <Surface testID="sub-earning-card" style={{ padding: 18, gap: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Earnings breakdown</Text>
        <KV k="Maximum Partner Allocation" v={money(s.partner_allocation)} />
        <KV k="Per-day earning" v={money(s.per_day_earning)} />
        <KV k="Earned so far" v={<Text style={{ color: "#059669", fontWeight: "800" }}>{money(s.accrued_earning)}</Text>} strong />
        <KV k="Absent Adjustment (to platform)" v={<Text style={{ color: "#F43F5E" }}>−{money(s.absent_adjustment)}</Text>} />
        <View style={{ height: 1, backgroundColor: colors.surfaceSubtle }} />
        <KV k="Settlement" v={<Text style={{ color: colors.primary, fontWeight: "800", fontSize: 16 }}>{money(s.settlement?.amount ?? s.settlement_amount)}</Text>} strong />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
          <Text style={{ color: SLATE, fontSize: 12 }}>Settlement status</Text>
          <StatusBadge status={s.settlement?.status && s.settlement?.status !== "none" ? s.settlement.status : (s.status === "active" ? "active" : "pending")} />
        </View>
      </Surface>

      {/* Daily history + mark complete */}
      <Surface style={{ padding: 18 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>Daily schedule & earnings</Text>
        <View style={{ gap: 8 }}>
          {schedule.map((d) => {
            const m = DAY_META[d.status] || DAY_META.scheduled;
            return (
              <View key={d.date} testID={`sub-day-${d.date}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceSubtle, padding: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{shortDate(d.date)}</Text>
                  <View style={{ alignSelf: "flex-start", marginTop: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: m.bg }}>
                    <Text style={{ color: m.color, fontSize: 11, fontWeight: "700" }}>{m.label}</Text>
                  </View>
                </View>
                {canMark(d) ? (
                  <Pressable testID={`sub-complete-${d.date}`} disabled={complete.isPending} onPress={() => complete.mutate(d.date)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Mark done</Text>
                  </Pressable>
                ) : (
                  <Text style={{ color: d.earning > 0 ? "#059669" : SLATE, fontWeight: "800", fontSize: 13 }}>
                    {d.status === "weekly_off" ? "—" : (d.earning > 0 ? "+" + money(d.earning) : money(0))}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </Surface>
    </ScrollView>
  );
}

export default function MaidSubscriptions() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["maid-subs"], queryFn: () => api.get<any[]>("/subscriptions/partner/mine") });
  const subs: any[] = Array.isArray(q.data) ? q.data : [];
  const open = subs.find((x) => x.id === openId);
  const reload = () => qc.invalidateQueries({ queryKey: ["maid-subs"] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" panelTitle="Maid Subscriptions" />
      {open ? (
        <SubDetail sub={open} onBack={() => setOpenId(null)} reload={reload} />
      ) : (
        <ScrollView
          testID="maid-subs-list"
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 14 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          {q.isLoading ? (
            <Surface style={{ padding: 24 }}><View style={{ height: 120, borderRadius: 12, backgroundColor: colors.surfaceSubtle }} /></Surface>
          ) : subs.length === 0 ? (
            <KitEmpty icon="calendar-heart" title="No subscriptions yet" desc="Recurring maid subscriptions assigned to you will appear here." testID="maid-subs-empty" />
          ) : (
            subs.map((s) => (
              <Pressable key={s.id} testID={`maid-sub-${s.id}`} onPress={() => setOpenId(s.id)}>
                <Surface style={{ padding: 16, gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>{s.plan_label || s.plan_type} · {s.customer_name}</Text>
                      <Text style={{ color: SLATE, fontSize: 12, marginTop: 2 }}>{shortDate(s.start_date)} – {shortDate(s.end_date)} · {s.code}</Text>
                    </View>
                    <StatusBadge status={s.settlement?.status && s.settlement?.status !== "none" ? s.settlement.status : s.status} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, paddingTop: 10 }}>
                    <StatCol label="Completed" value={String(s.completed_days || 0)} />
                    <StatCol label="Absent" value={String(s.absent_days || 0)} tone="#F43F5E" />
                    <StatCol label="Earned" value={money(s.accrued_earning)} tone="#059669" />
                    <StatCol label="Settlement" value={money(s.settlement?.amount ?? s.settlement_amount)} tone={colors.primary} />
                  </View>
                </Surface>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
