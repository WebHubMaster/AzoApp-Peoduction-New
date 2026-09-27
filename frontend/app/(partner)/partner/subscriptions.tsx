import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Linking, Modal, TextInput, Image } from "react-native";
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
const plusDays = (n: number) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // Date.getDay()
const WD_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // backend weekday(): Mon=0..Sun=6

const dayLabel = (iso: string) => {
  if (iso === todayIso()) return "Today";
  if (iso === plusDays(1)) return "Tomorrow";
  const d = new Date(iso + "T00:00:00");
  return `${WD_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

const DAY_META: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: "#0659B2", bg: "#F0F7FE" },
  in_progress: { label: "In progress", color: "#B45309", bg: "#FFFBEB" },
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

  const [otpFor, setOtpFor] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [completeFor, setCompleteFor] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ["maid-subs"] }); reload(); };
  const start = useMutation({
    mutationFn: ({ date, code }: { date: string; code: string }) => api.post(`/subscriptions/${s.id}/days/${date}/start`, { otp: code }),
    onSuccess: () => { setOtpFor(null); setOtp(""); done("Service started"); },
    onError: (e: any) => toast.error(e?.detail || "Could not start service"),
  });
  const complete = useMutation({
    mutationFn: ({ date, note: n, photo: p }: { date: string; note: string; photo: string | null }) =>
      api.post(`/subscriptions/${s.id}/days/${date}/complete`, { note: n, photo: p }),
    onSuccess: () => { setCompleteFor(null); setPhoto(null); setNote(""); done("Marked completed"); },
    onError: (e: any) => toast.error(e?.detail || "Could not mark completed"),
  });

  const pickPhoto = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.4, mediaTypes: ["images"] });
      const asset = r.assets?.[0];
      if (!r.canceled && asset?.base64) setPhoto(`data:image/jpeg;base64,${asset.base64}`);
    } catch { toast.error("Could not pick photo"); }
  };

  const schedule: any[] = s.schedule || [];
  const canMarkPast = (d: any) => s.status === "active" && d.status === "scheduled" && d.date < todayIso();
  const canStart = (d: any) => s.status === "active" && d.status === "scheduled" && d.date === todayIso();
  const canComplete = (d: any) => s.status === "active" && d.status === "in_progress";
  const pendingDays = schedule.filter((d) => canMarkPast(d));
  const addr = s.address || {};
  const addrText = [addr.label, addr.line || addr.address_line, addr.city, addr.pincode].filter(Boolean).join(", ") || "—";
  const weeklyOffText = (s.weekly_offs || []).length ? (s.weekly_offs as number[]).map((d) => WD_FULL[d]).join(", ") : "None";

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

      {/* Customer & work details — kiska kaam, kahan, kab tak, kya karna hai */}
      <Surface testID="sub-customer-card" style={{ padding: 18, gap: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Customer & work details</Text>
        <KV k="Customer" v={s.customer_name || "—"} />
        <KV k="Phone" v={s.customer_phone
          ? <Pressable testID="sub-customer-call" onPress={() => Linking.openURL(`tel:${s.customer_phone}`)}><Text style={{ color: colors.primary, fontWeight: "700" }}>{s.customer_phone}</Text></Pressable>
          : "—"} />
        <KV k="Address" v={addrText} />
        <KV k="Work" v={`${s.service_name || "Home Maid"}${s.category_name ? " · " + s.category_name : ""}`} />
        <KV k="Preferred time" v={s.preferred_time || "—"} />
        <KV k="Duration" v={`${shortDate(s.start_date)} – ${shortDate(s.end_date)}${s.duration_days ? ` · ${s.duration_days} days` : ""}`} />
        <KV k="Weekly off" v={weeklyOffText} />
        {s.notes ? <KV k="Notes" v={s.notes} /> : null}
      </Surface>

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

      {/* Daily history + service session flow */}
      <Surface style={{ padding: 18 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>Daily schedule & earnings</Text>
        {pendingDays.length > 0 ? (
          <View testID="sub-pending-banner" style={{ backgroundColor: "#FFFBEB", borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <Text style={{ color: "#B45309", fontSize: 12, fontWeight: "600" }}>{pendingDays.length} past day(s) not marked yet — aap neeche "Mark done" se baad me bhi mark kar sakti hain.</Text>
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          {schedule.map((d) => {
            const m = DAY_META[d.status] || DAY_META.scheduled;
            return (
              <View key={d.date} testID={`sub-day-${d.date}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceSubtle, padding: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{dayLabel(d.date)} · {shortDate(d.date)}</Text>
                  <View style={{ alignSelf: "flex-start", marginTop: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: m.bg }}>
                    <Text style={{ color: m.color, fontSize: 11, fontWeight: "700" }}>{m.label}</Text>
                  </View>
                  {d.proof_photo ? <Text style={{ color: SLATE, fontSize: 10, marginTop: 3 }}>Photo proof attached</Text> : null}
                </View>
                {canComplete(d) ? (
                  <Pressable testID={`sub-complete-${d.date}`} disabled={complete.isPending} onPress={() => { setCompleteFor(d.date); setPhoto(null); setNote(""); }}
                    style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Complete</Text>
                  </Pressable>
                ) : canStart(d) ? (
                  <Pressable testID={`sub-start-${d.date}`} disabled={start.isPending} onPress={() => { setOtpFor(d.date); setOtp(""); }}
                    style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Start</Text>
                  </Pressable>
                ) : canMarkPast(d) ? (
                  <Pressable testID={`sub-markdone-${d.date}`} disabled={complete.isPending} onPress={() => complete.mutate({ date: d.date, note: "", photo: null })}
                    style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
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

      {/* Start Service — customer OTP */}
      <Modal visible={!!otpFor} transparent animationType="fade" onRequestClose={() => setOtpFor(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.5)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, width: "100%", maxWidth: 380 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>Start Service</Text>
            <Text style={{ color: SLATE, fontSize: 12, marginTop: 4 }}>Customer se aaj ka 4-digit service OTP lein.</Text>
            <TextInput testID="sub-otp-input" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={4} placeholder="••••" placeholderTextColor={SLATE}
              style={{ marginTop: 14, height: 52, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, textAlign: "center", fontSize: 22, fontWeight: "800", letterSpacing: 8, color: colors.text }} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable testID="sub-otp-cancel" onPress={() => setOtpFor(null)} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: SLATE, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable testID="sub-otp-confirm" disabled={otp.length !== 4 || start.isPending} onPress={() => otpFor && start.mutate({ date: otpFor, code: otp })}
                style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: otp.length !== 4 ? 0.5 : 1 }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{start.isPending ? "…" : "Start Service"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Service — optional photo proof */}
      <Modal visible={!!completeFor} transparent animationType="fade" onRequestClose={() => setCompleteFor(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.5)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, width: "100%", maxWidth: 380 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>Complete Service</Text>
            <Text style={{ color: SLATE, fontSize: 12, marginTop: 4 }}>Kaam khatam karke complete mark karein. Photo proof optional hai.</Text>
            {photo ? (
              <Image source={{ uri: photo }} style={{ height: 140, borderRadius: 12, marginTop: 12 }} resizeMode="cover" />
            ) : null}
            <Pressable testID="sub-photo-pick" onPress={pickPhoto} style={{ marginTop: 12, height: 42, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
              <Icon name="camera-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{photo ? "Change photo" : "Add photo proof"}</Text>
            </Pressable>
            <TextInput testID="sub-complete-note" value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={SLATE}
              style={{ marginTop: 10, height: 42, borderWidth: 1, borderColor: colors.surfaceSubtle, borderRadius: 12, paddingHorizontal: 12, color: colors.text }} />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable testID="sub-complete-cancel" onPress={() => setCompleteFor(null)} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: SLATE, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable testID="sub-complete-confirm" disabled={complete.isPending} onPress={() => completeFor && complete.mutate({ date: completeFor, note, photo })}
                style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{complete.isPending ? "…" : "Mark Completed"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  // Advance view — next 7 days of scheduled work across all active subscriptions.
  const upcoming = subs
    .filter((s) => s.status === "active")
    .flatMap((s) => (s.schedule || [])
      .filter((d: any) => d.status === "scheduled" && d.date >= todayIso() && d.date <= plusDays(7))
      .map((d: any) => ({ subId: s.id, date: d.date, customer: s.customer_name, time: s.preferred_time || "" })))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);

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
          {upcoming.length > 0 ? (
            <Surface testID="maid-upcoming" style={{ padding: 16, gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Upcoming work · next 7 days</Text>
              {upcoming.map((t) => (
                <Pressable key={`${t.subId}-${t.date}`} testID={`maid-task-${t.subId}-${t.date}`} onPress={() => setOpenId(t.subId)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, paddingTop: 10 }}>
                  <View style={{ borderRadius: 8, backgroundColor: t.date === todayIso() ? "#ECFDF5" : colors.surfaceSubtle, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: t.date === todayIso() ? "#059669" : colors.primary, fontSize: 11, fontWeight: "800" }}>{dayLabel(t.date)}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 }}>{t.customer}</Text>
                  <Text style={{ color: SLATE, fontSize: 12 }}>{t.time || "—"}</Text>
                </Pressable>
              ))}
            </Surface>
          ) : null}

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
