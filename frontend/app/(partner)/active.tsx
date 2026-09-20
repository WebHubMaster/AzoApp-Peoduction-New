import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, Linking, Modal, TextInput, ScrollView, Alert, Platform, RefreshControl } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { AppShellHeader, StatusBadge } from "@/src/components/AppShell";
import { Button } from "@/src/components/ui";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";
import { useChatUnread } from "@/src/context/ChatContext";

const EMERALD = "#059669";
const SLATE400 = "#94A3B8";
const num = (v: any) => Number(v || 0);
const fmtDT = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const fmtShort = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function PartnerActiveJob() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [view, setView] = useState<"active" | "completed">("active");

  const activeQ = useQuery({ queryKey: ["partner-active"], queryFn: () => api.get<any[]>("/bookings/partner/active"), refetchInterval: 15000 });
  const doneQ = useQuery({ queryKey: ["partner-joblist", "history", "completed"], queryFn: () => api.get<any[]>("/bookings/partner/history?status=completed") });
  const activeJobs = activeQ.data || [];
  const completedJobs = (doneQ.data || []).filter((b) => ["completed", "paid"].includes(b.status));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["partner-active"] }); qc.invalidateQueries({ queryKey: ["partner-joblist"] }); qc.invalidateQueries({ queryKey: ["partner-wallet"] }); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView
        testID="active-jobs"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={activeQ.isFetching && !activeQ.isLoading} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Active / Completed chips */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable testID="job-view-active" onPress={() => setView("active")} style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: view === "active" ? colors.primary : colors.surfaceSubtle }}>
            <Text style={{ color: view === "active" ? "#fff" : colors.textSecondary, fontSize: 14, fontWeight: "600" }}>Active{activeJobs.length ? ` (${activeJobs.length})` : ""}</Text>
          </Pressable>
          <Pressable testID="job-view-completed" onPress={() => setView("completed")} style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: view === "completed" ? EMERALD : colors.surfaceSubtle }}>
            <Text style={{ color: view === "completed" ? "#fff" : colors.textSecondary, fontSize: 14, fontWeight: "600" }}>Completed{completedJobs.length ? ` (${completedJobs.length})` : ""}</Text>
          </Pressable>
        </View>

        {view === "active" ? (
          activeQ.isLoading ? <Empty text="Loading…" /> : activeJobs.length === 0 ? <Empty text="No active jobs. Accept a request to get started." /> : activeJobs.map((b) => <ActiveJobCard key={b.id} b={b} onUpdate={refresh} />)
        ) : (
          doneQ.isLoading ? <Empty text="Loading…" /> : completedJobs.length === 0 ? <Empty text="No completed jobs yet. Finished jobs will appear here." /> : completedJobs.map((b) => <CompletedJob key={b.id} b={b} />)
        )}
      </ScrollView>
    </View>
  );
}

/* ── Empty (web: bg-white rounded-xl border-dashed p-10 text-slate-400) ── */
function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View testID="jobs-empty" style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: 40, alignItems: "center" }}>
      <Text style={{ color: SLATE400, fontSize: 16, textAlign: "center", lineHeight: 24 }}>{text}</Text>
    </View>
  );
}

/* ── shared card pieces ── */
function JobCardShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: "hidden", boxShadow: "0px 8px 30px rgba(2,32,71,0.06)", elevation: 2 }}>{children}</View>;
}

function InfoItem({ icon, label, value }: { icon: MdiName; label: string; value?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 12, backgroundColor: colors.surfaceSubtle, padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon name={icon} size={12} color={SLATE400} />
        <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", marginTop: 2 }} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

function Collapse({ title, icon, children, testID }: { title: string; icon: MdiName; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <Pressable testID={testID} onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12 }}>
        <Icon name={icon} size={16} color={SLATE400} />
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700", flex: 1 }}>{title}</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={SLATE400} />
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 }}>{children}</View> : null}
    </View>
  );
}

function TimelineList({ items, color }: { items: any[]; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderLeftWidth: 1, borderLeftColor: colors.border, marginLeft: 6, paddingTop: 4, gap: 12 }}>
      {items.map((t, i) => (
        <View key={i} style={{ marginLeft: 16 }}>
          <View style={{ position: "absolute", left: -23, top: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 3, borderColor: color === EMERALD ? "#D1FAE5" : colors.primarySubtle }} />
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600", textTransform: "capitalize" }}>{String(t.status || "").replace(/_/g, " ")}</Text>
          <Text style={{ color: SLATE400, fontSize: 11 }}>{fmtShort(t.at)}</Text>
        </View>
      ))}
    </View>
  );
}

/* ── ServiceBreakdown (web components/booking/ServiceBreakdown.jsx) ──
   Renders the authoritative server breakdown.service_items — per service (qty, rate×qty),
   nested add-ons (own qty), services subtotal, additional charges & Total Service Amount. */
function ServiceBreakdown({ booking }: { booking: any }) {
  const { colors } = useTheme();
  const bd = booking?.breakdown || null;
  const list: any[] = (bd && Array.isArray(bd.service_items) && bd.service_items.length ? bd.service_items : []);
  if (!list.length) return null;
  const servicesSubtotal = bd?.services_subtotal != null ? num(bd.services_subtotal) : list.reduce((s, it) => s + num(it.amount ?? it.price ?? it.total), 0);
  const charges: any[] = (Array.isArray(bd?.additional_charges) ? bd.additional_charges : []).map((c: any) => ({ label: c.label, amount: num(c.amount) })).filter((c: any) => c.amount > 0);
  const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
  const totalServiceAmount = servicesSubtotal + chargesTotal;
  const hdr = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingHorizontal: 12, paddingVertical: 8 };
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginTop: 12 }} testID="service-breakdown">
      <View style={[hdr, { backgroundColor: colors.surfaceSubtle, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Services to do ({list.length})</Text>
        <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "600" }}>Excl. taxes</Text>
      </View>
      {list.map((it, i) => {
        const name = it.name || it.service_name || it.custom_name || "Service";
        const qty = Math.max(1, num(it.qty || 1));
        const rate = it.rate != null ? num(it.rate) : num(it.base_price);
        const amount = it.amount != null ? num(it.amount) : rate * qty;
        const addons: any[] = Array.isArray(it.addons) ? it.addons.filter((a: any) => a && (a.name || typeof a === "string")) : [];
        return (
          <View key={i} style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }} testID={`svc-line-${i}`}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                  <Text style={{ color: SLATE400 }}>{i + 1}. </Text>{name}{qty > 1 ? <Text style={{ color: colors.primary, fontWeight: "700" }}>  × {qty}</Text> : null}
                </Text>
                {qty > 1 ? <Text style={{ color: SLATE400, fontSize: 11, marginTop: 2 }}>{fmt(rate)} × {qty}</Text> : null}
              </View>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{fmt(amount)}</Text>
            </View>
            {addons.length > 0 ? (
              <View style={{ marginTop: 6, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.primarySubtle, gap: 4 }}>
                {addons.map((a: any, ai: number) => {
                  const an = a && typeof a === "object" ? a.name : String(a);
                  const aq = Math.max(1, num((a && a.qty) || 1));
                  const ar = num(a && (a.rate != null ? a.rate : a.price));
                  const aAmt = a && a.amount != null ? num(a.amount) : ar * aq;
                  return (
                    <View key={ai} testID={`svc-line-${i}-addon-${ai}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>+ {an}{aq > 1 ? <Text style={{ color: colors.primary, fontWeight: "600" }}>  × {aq}</Text> : null}</Text>
                      {aAmt ? <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] }}>{fmt(aAmt)}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={[hdr, { backgroundColor: colors.surfaceSubtle, borderTopWidth: 1, borderTopColor: colors.border }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}>Services total (excl. taxes)</Text>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }} testID="services-subtotal">{fmt(servicesSubtotal)}</Text>
      </View>
      {charges.length > 0 ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }} testID="service-charges">
          {charges.map((c, ci) => (
            <View key={ci} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500", fontVariant: ["tabular-nums"] }}>{fmt(c.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[hdr, { backgroundColor: colors.primarySubtle, borderTopWidth: 1, borderTopColor: colors.primarySubtle }]} testID="total-service-amount">
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Total Service Amount (excl. taxes)</Text>
        <Text style={{ color: colors.primaryDark, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{fmt(totalServiceAmount)}</Text>
      </View>
    </View>
  );
}

/* ── PartnerEarningSummary (web components/booking/PartnerEarningSummary.jsx) ── */
function EarnRow({ k, v, sub, strong, negative, muted }: { k: string; v: string; sub?: string; strong?: boolean; negative?: boolean; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: 2 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12.5, color: strong ? colors.text : muted ? SLATE400 : colors.textMuted, fontWeight: strong ? "700" : "400" }}>{k}</Text>
        {sub ? <Text style={{ fontSize: 10.5, color: SLATE400, marginTop: 2, lineHeight: 14 }}>{sub}</Text> : null}
      </View>
      <Text style={{ fontSize: 12.5, fontVariant: ["tabular-nums"], color: strong ? colors.text : negative ? EMERALD : colors.textSecondary, fontWeight: strong ? "800" : negative ? "600" : "500" }}>{v}</Text>
    </View>
  );
}
function PartnerEarningSummary({ booking }: { booking: any }) {
  const { colors } = useTheme();
  const bd = booking?.breakdown;
  if (!bd) return null;
  const earning = bd.earning || null;
  const customerOnly: any[] = (Array.isArray(bd.customer_only_charges) ? bd.customer_only_charges : []).filter((c: any) => num(c.amount) > 0);
  const charges: any[] = (Array.isArray(bd.additional_charges) ? bd.additional_charges : []).filter((c: any) => num(c.amount) > 0);
  const discount = num(bd.discount);
  const refund = bd.refund || null;
  const cancelled = booking.status === "cancelled" || !!refund;
  const eligibleSubtotal = bd.partner_eligible_subtotal != null ? num(bd.partner_eligible_subtotal) : null;
  const customerPaid = bd.customer_paid_total != null ? num(bd.customer_paid_total) : num(bd.total);
  const secHdr = (bg: string, fg: string, label: string) => (
    <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginTop: 12 }} testID="partner-earning-summary">
      {secHdr(colors.surfaceSubtle, colors.textMuted, "Payment Summary")}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <EarnRow k="Service Amount" v={fmt(bd.services_subtotal)} />
        {charges.map((c) => <EarnRow key={c.key || c.label} k={c.label} v={fmt(c.amount)} />)}
        {discount > 0 ? <EarnRow k={`Coupon Discount${bd.coupon_code ? ` (${bd.coupon_code})` : ""}`} v={`- ${fmt(discount)}`} negative sub="AzoApp-funded · does not reduce your earning" /> : null}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8 }}>
          <EarnRow k="Partner-eligible subtotal" v={fmt(eligibleSubtotal != null ? eligibleSubtotal : bd.subtotal)} strong />
        </View>
      </View>
      {(customerOnly.length > 0 || num(bd.tax) > 0) ? (
        <>
          {secHdr("#FFFBEB", "#B45309", "Customer-only charges")}
          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            {customerOnly.map((c) => <EarnRow key={c.key || c.label} k={c.label} v={fmt(c.amount)} sub={c.note || "Customer-only charge · excluded from your earnings"} />)}
            {num(bd.tax) > 0 ? <EarnRow k={`Tax / GST${bd.gst_pct ? ` (${bd.gst_pct}%)` : ""}`} v={fmt(bd.tax)} sub="Collected from customer · excluded from your earnings" /> : null}
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8 }}>
              <EarnRow k="Customer paid total" v={fmt(customerPaid)} strong />
            </View>
          </View>
        </>
      ) : null}
      {earning && !cancelled ? (
        <>
          {secHdr("#ECFDF5", "#047857", "Your earning")}
          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }} testID="partner-earning-block">
            <EarnRow k="Eligible amount" v={fmt(earning.base)} />
            <EarnRow k="Partner share" v={`${earning.partner_share_pct}%`} muted />
            <EarnRow k="Partner Earning" v={fmt(earning.partner_earning)} strong />
            <EarnRow k="AzoApp Platform share" v={`${earning.platform_share_pct}%`} muted />
            <EarnRow k="AzoApp Platform Earning" v={fmt(earning.platform_earning)} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: EMERALD }}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Net Earning</Text>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }} testID="partner-net-earning">{fmt(earning.net_earning)}</Text>
          </View>
        </>
      ) : null}
      {cancelled && refund ? (
        <>
          {secHdr("#FFF1F2", "#BE123C", "Payment & refund")}
          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }} testID="partner-refund-block">
            <EarnRow k="Original booking amount" v={fmt(refund.original_amount)} strong />
            <EarnRow k="Paid amount" v={fmt(bd.paid)} />
            <EarnRow k={`Customer Refund${refund.refund_pct != null ? ` (${refund.refund_pct}%)` : ""}`} v={`- ${fmt(refund.refund_amount)}`} negative />
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8 }}>
              <EarnRow k="Amount retained" v={fmt(refund.retained)} strong />
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

/* ── ScheduledCard (web components/booking/ScheduledCard.jsx) ── */
function fmtCountdown(total: number) {
  if (!Number.isFinite(total)) return "";
  const neg = total < 0;
  let s = Math.abs(Math.floor(total));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (neg) return "now";
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}m ${pad(s)}s`;
}
function ScheduledCard({ schedule, role = "partner" }: { schedule: any; role?: string }) {
  const { colors } = useTheme();
  const s = schedule || {};
  const [secs, setSecs] = useState(Number.isFinite(s.seconds_to_start) ? s.seconds_to_start : 0);
  useEffect(() => { setSecs(Number.isFinite(s.seconds_to_start) ? s.seconds_to_start : 0); }, [s.seconds_to_start]);
  useEffect(() => { const t = setInterval(() => setSecs((v: number) => v - 1), 1000); return () => clearInterval(t); }, []);
  if (!s.is_scheduled) return null;
  const locked = !!s.comm_locked;
  const started = s.phase === "active";
  const due = s.phase === "due";
  const items: { icon: MdiName; label: string }[] = [
    { icon: "phone-outline", label: "Call" },
    { icon: "message-outline", label: "Chat" },
    { icon: "navigation-variant-outline", label: "Navigation" },
    { icon: "key-outline", label: role === "customer" ? "Start OTP" : "Start Work" },
  ];
  const accent = locked ? colors.primary : EMERALD;
  return (
    <View testID="scheduled-card" style={{ borderRadius: 16, borderWidth: 2, borderColor: locked ? colors.primarySubtle : "#A7F3D0", backgroundColor: locked ? "rgba(239,246,255,0.6)" : "#ECFDF5", padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}><Icon name="calendar-outline" size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: accent, fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>Scheduled Service</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="calendar-outline" size={13} color={colors.textMuted} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{s.scheduled_date}</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="clock-outline" size={13} color={colors.textMuted} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{s.scheduled_time}</Text></View>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: SLATE400, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>{started ? "In progress" : due ? "Ready to start" : "Starts in"}</Text>
          <Text testID="scheduled-countdown" style={{ color: accent, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{started ? "—" : fmtCountdown(secs)}</Text>
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        {locked ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {items.map((it) => (
                <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: colors.primarySubtle, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Icon name="lock-outline" size={12} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "600" }}>{it.label}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>Available 30 minutes before the scheduled time.</Text>
          </>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="check-circle-outline" size={16} color="#047857" />
            <Text style={{ color: "#047857", fontSize: 12.5, fontWeight: "600", flex: 1 }}>{role === "customer" ? "Call, Chat & your Start OTP are now available." : "Call, Chat, Navigation & Start Work are now available."}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ── CompletedJob (web PartnerDashboard.jsx) ── */
function CompletedJob({ b }: { b: any }) {
  const { colors } = useTheme();
  const a = b.address || {};
  const completedAt = (b.timeline || []).filter((t: any) => t.status === "completed").map((t: any) => t.at).pop() || b.updated_at;
  const earning = b.commission?.partner_earning ?? null;
  const jobValue = b.total || b.pricing?.total || 0;
  return (
    <JobCardShell>
      <LinearGradient colors={["#059669", "#10B981"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="check-circle-outline" size={16} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>JOB COMPLETED</Text>
          <Text style={{ color: "rgba(236,253,245,0.9)", fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{fmtDT(completedAt)}</Text>
        </View>
      </LinearGradient>
      <View style={{ padding: 20, gap: 16 }} testID={`completed-job-${b.code}`}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, lineHeight: 22 }}>{b.service_name}</Text>
              <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>#{b.code}</Text>
            </View>
          </View>
          <StatusBadge status={b.status} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, borderRadius: 12, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Icon name="map-marker-outline" size={16} color={EMERALD} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", lineHeight: 19 }}>{a.line || "Address unavailable"}{a.city ? `, ${a.city}` : ""}</Text>
            <Text style={{ color: SLATE400, fontSize: 11.5, marginTop: 2 }}>{a.pincode || ""}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <InfoItem icon="account-outline" label="Customer" value={b.customer_name} />
          <InfoItem icon="check-circle-outline" label="Job value" value={fmt(jobValue)} />
        </View>
        {earning != null ? (
          <View style={{ borderRadius: 12, borderWidth: 2, borderColor: "#D1FAE5", backgroundColor: "rgba(236,253,245,0.5)", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="trending-up" size={16} color="#047857" /><Text style={{ color: "#047857", fontSize: 12.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>You earned</Text></View>
            <Text style={{ color: "#047857", fontSize: 18, fontWeight: "800" }}>{fmt(earning)}</Text>
          </View>
        ) : null}
        {(b.timeline || []).length > 0 ? (
          <Collapse title="Job timeline" icon="clock-outline" testID={`completed-timeline-${b.code}`}><TimelineList items={b.timeline} color={EMERALD} /></Collapse>
        ) : null}
      </View>
    </JobCardShell>
  );
}

/* ── JobStepper ── */
const STAGE_STEPS = [
  { key: "assigned", label: "Assigned", match: ["assigned"] },
  { key: "arrived", label: "Arrived", match: ["arrived_shop", "arrived_customer"] },
  { key: "started", label: "In Progress", match: ["started"] },
  { key: "completed", label: "Completed", match: ["completed"] },
];
function JobStepper({ status }: { status: string }) {
  const { colors } = useTheme();
  const cur = Math.max(0, STAGE_STEPS.findIndex((s) => s.match.includes(status)));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }} testID="job-stepper">
      {STAGE_STEPS.map((s, i) => {
        const done = i < cur; const current = i === cur;
        return (
          <View key={s.key} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
              <View style={{ flex: 1, height: 2, backgroundColor: done || current ? colors.secondary : colors.border, opacity: i === 0 ? 0 : 1 }} />
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: done || current ? colors.secondary : colors.border, borderWidth: current ? 4 : 0, borderColor: colors.primarySubtle }}>
                {done ? <Icon name="check" size={13} color="#fff" /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current ? "#fff" : SLATE400 }} />}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: done ? colors.secondary : colors.border, opacity: i === STAGE_STEPS.length - 1 ? 0 : 1 }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: "600", marginTop: 6, textAlign: "center", color: current ? colors.primary : done ? colors.textMuted : "#CBD5E1" }}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ── OtpBoxes (4 boxes) ── */
function OtpBoxes({ value, onChange, len = 4, testID }: { value: string; onChange: (v: string) => void; len?: number; testID?: string }) {
  const { colors } = useTheme();
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: len }, (_, i) => (value || "")[i] || "");
  const setAt = (i: number, d: string) => {
    const arr = (value || "").padEnd(len, " ").split("");
    arr[i] = d || " ";
    onChange(arr.join("").replace(/ /g, "").slice(0, len));
    if (d && refs.current[i + 1]) refs.current[i + 1]?.focus();
  };
  return (
    <View style={{ flexDirection: "row", gap: 8 }} testID={testID || "otp-boxes"}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          testID={`otp-box-${i}`}
          value={d}
          keyboardType="number-pad"
          maxLength={1}
          onChangeText={(t) => setAt(i, t.replace(/\D/g, "").slice(-1))}
          onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace" && !d && refs.current[i - 1]) refs.current[i - 1]?.focus(); }}
          style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 2, borderColor: d ? colors.secondary : colors.border, backgroundColor: colors.surface, textAlign: "center", fontSize: 20, fontWeight: "700", color: colors.text }}
        />
      ))}
    </View>
  );
}

/* ── PhotoBlock ── */
function PhotoBlock({ title, items, onAdd, onRemove, uploading, testID }: { title: string; items: string[]; onAdd: () => void; onRemove: (u: string) => void; uploading: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{title}</Text>
        <View style={{ backgroundColor: items.length ? "#D1FAE5" : colors.surfaceSubtle, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: items.length ? "#047857" : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{Math.min(items.length, 3)}/3 photos{items.length ? " ✓" : ""}</Text>
        </View>
      </View>
      {items.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {items.map((u, i) => (
            <View key={u} style={{ width: "31%", aspectRatio: 1, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
              <Image source={{ uri: mediaUrl(u) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              <Pressable testID={`${testID}-remove-${i}`} onPress={() => onRemove(u)} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable testID={testID} onPress={onAdd} disabled={uploading} style={{ marginTop: 12, height: 44, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: uploading ? 0.6 : 1 }}>
        <Icon name="camera-outline" size={16} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>{uploading ? "Uploading…" : items.length ? "Add more photos" : `Add ${title.split(" ")[0]} Photos`}</Text>
      </Pressable>
    </View>
  );
}

/* ── ActiveJob (web ActiveJob) ── */
function ActiveJobCard({ b, onUpdate }: { b: any; onUpdate: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rcOpen, setRcOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const status = b.status as string;
  const arrived = ["arrived_shop", "arrived_customer"].includes(status);
  const inProgress = status === "started";
  const before: string[] = b.evidence?.before || [];
  const after: string[] = b.evidence?.after || [];
  const demoOtp = (b.demo_otps || {}) as { start?: string; completion?: string };
  const a = b.address || {};
  const det = (b.eligible_detail || {})[b.partner_id] || {};
  const schedLabel = b.scheduled_at ? fmtDT(b.scheduled_at) : "Now";
  const last4 = String(b.customer_phone || "").replace(/\D/g, "").slice(-4);
  const maskedPhone = last4 ? `+91 XXXXX X${last4}` : "";

  // Additional work (web parity: booking.additional + rate card /additional flow)
  const addl = b.additional || null;
  const addlPending = !!addl && num(addl.total) > 0 && addl.status !== "paid";
  const rcQ = useQuery({
    queryKey: ["ratecard", b.category_id],
    queryFn: () => api.get<any>(`/ratecards/by-category/${b.category_id}`),
    enabled: !!b.category_id && (inProgress || status === "arrived_customer"),
  });
  const rcCard = rcQ.data && (rcQ.data.groups || []).length ? rcQ.data : null;

  // Unread chat badge — server-side read receipts (synced with web).
  const unseen = useChatUnread(b.id);

  const startedAt = (b.timeline || []).filter((t: any) => ["started", "in_progress"].includes(t.status)).map((t: any) => t.at).pop();
  useEffect(() => { if (!inProgress) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [inProgress]);
  const es = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const elapsed = `${String(Math.floor(es / 3600)).padStart(2, "0")}:${String(Math.floor((es % 3600) / 60)).padStart(2, "0")}:${String(es % 60).padStart(2, "0")}`;

  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const showSchedule = sched.is_scheduled && !["completed", "paid", "cancelled"].includes(status);
  const pendingReq = b.reschedule_request && b.reschedule_request.status === "pending" ? b.reschedule_request : null;
  const theyRequested = pendingReq && pendingReq.requested_by_role === "customer";
  const canRequestResched = sched.is_scheduled && !pendingReq && ["assigned", "arrived_shop", "arrived_customer"].includes(status);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedVal, setReschedVal] = useState("");
  const [sharing, setSharing] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const capture = async (stage: "before" | "after") => {
    let perm = await ImagePicker.getCameraPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain) perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted && !perm.canAskAgain) { Linking.openSettings(); return; }
    }
    setBusy(`photo-${stage}`);
    try {
      const res = perm.granted
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ["images"] });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      const asset = res.assets[0];
      await api.post(`/bookings/${b.id}/evidence`, { stage, images: [`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`] });
      toast.success(`${stage === "before" ? "Before" : "After"} photo captured ✓`);
      onUpdate();
    } catch (e: any) { toast.error(e?.detail || "Upload failed, please retake"); }
    finally { setBusy(null); }
  };
  const removePhoto = async (stage: "before" | "after", url: string) => {
    try { await api.post(`/bookings/${b.id}/evidence/remove`, { stage, url }); toast.success("Photo removed — you can capture a new one"); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not remove photo"); }
  };
  const step = async (path: string, label: string) => {
    setBusy(path);
    try { await api.post(`/bookings/${b.id}/${path}`, { otp }); toast.success(label); setOtp(""); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    finally { setBusy(null); }
  };
  const reject = () => {
    Alert.alert("Reject this job?", "It will be sent back to admin for re-assignment.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: async () => {
        try { await api.post(`/bookings/${b.id}/reject`, { reason: "" }); toast.success("Job rejected"); onUpdate(); }
        catch (e: any) { toast.error(e?.detail || "Failed to reject"); }
      } },
    ]);
  };
  const addAdditionalRow = async (row: any) => {
    const part = num(row.service_charge);
    const labour = num(row.labour_charge);
    if (part <= 0 && labour <= 0) { toast.error("This item has no charge to add"); return; }
    try {
      await api.post(`/bookings/${b.id}/additional`, { items: [{
        description: row.description, part_charge: part, labour_charge: labour,
        warranty: row.warranty || "", ratecard_row_id: row.id, category_id: b.category_id,
      }] });
      toast.success(`Added "${row.description}" — ask customer to pay`);
      onUpdate();
    } catch (e: any) { toast.error(e?.detail || "Failed to add"); }
  };
  const removeAdditional = async (itemId: string) => {
    try { await api.del(`/bookings/${b.id}/additional/${itemId}`); toast.success("Removed"); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Failed"); }
  };
  const requestResched = async () => {
    const iso = new Date(reschedVal.replace(" ", "T"));
    if (!reschedVal || isNaN(iso.getTime())) return toast.error("Pick a new date & time (YYYY-MM-DD HH:MM)");
    setBusy("resched");
    try { await api.post(`/bookings/${b.id}/reschedule/request`, { scheduled_at: iso.toISOString() }); toast.success("Reschedule request sent to the customer"); setReschedOpen(false); setReschedVal(""); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not send request"); }
    finally { setBusy(null); }
  };
  const respondResched = async (action: "accept" | "reject") => {
    try { await api.post(`/bookings/${b.id}/reschedule/respond`, { action }); toast.success(action === "accept" ? "Reschedule accepted" : "Reschedule declined"); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not respond"); }
  };
  const cancelResched = async () => {
    try { await api.post(`/bookings/${b.id}/reschedule/cancel`, {}); toast.success("Reschedule request withdrawn"); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not withdraw"); }
  };
  const shareLocation = async () => {
    setSharing(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setSharing(false); toast.error("Location permission denied. Allow location access to share your live location."); return; }
      const send = (pos: Location.LocationObject) => api.post(`/bookings/${b.id}/location`, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      send(first);
      watchRef.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 25 }, send);
      toast.success("Sharing live location with customer");
      setTimeout(() => { watchRef.current?.remove(); watchRef.current = null; setSharing(false); }, 120000);
    } catch (e: any) { setSharing(false); toast.error("Couldn't get your location. Please check GPS and try again."); }
  };
  useEffect(() => () => { watchRef.current?.remove(); }, []);

  const dest = a.lat && a.lng ? `${a.lat},${a.lng}` : encodeURIComponent(`${a.line || ""}, ${a.city || ""} ${a.pincode || ""}`);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

  const outlineBtn = (opts: { border: string }) => ({ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: opts.border, alignItems: "center" as const, justifyContent: "center" as const, flexDirection: "row" as const, gap: 6 });

  return (
    <JobCardShell>
      {/* State banner */}
      {inProgress ? (
        <LinearGradient colors={["#F59E0B", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>WORK IN PROGRESS</Text>
            <Text style={{ color: "rgba(255,251,235,0.9)", fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{b.service_name}{startedAt ? ` · started ${new Date(startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>
          </View>
          {startedAt ? <Text testID={`elapsed-${b.code}`} style={{ color: "#fff", fontWeight: "700", fontSize: 14, fontVariant: ["tabular-nums"], backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>{elapsed}</Text> : null}
        </LinearGradient>
      ) : arrived ? (
        <LinearGradient colors={["#7C3AED", colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="check-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>You've arrived — verify the customer to start</Text>
        </LinearGradient>
      ) : (
        <LinearGradient colors={[colors.primary, "#1976D2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="shield-check-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>New job assigned — head to the customer</Text>
        </LinearGradient>
      )}

      <View style={{ padding: 20, gap: 16 }} testID={`active-job-${b.code}`}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, lineHeight: 22 }}>{b.service_name}</Text>
              <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>#{b.code}</Text>
            </View>
          </View>
          <StatusBadge status={status} />
        </View>

        {/* Customer location */}
        <View style={{ flexDirection: "row", gap: 8, borderRadius: 12, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Icon name="map-marker-outline" size={16} color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", lineHeight: 19 }}>{a.line || "Address unavailable"}{a.city ? `, ${a.city}` : ""}</Text>
            <Text style={{ color: SLATE400, fontSize: 11.5, marginTop: 2 }}>{a.pincode || ""}{det.distance_km != null ? ` · ~${det.distance_km} km` : ""}{det.eta_min != null ? ` · ~${det.eta_min} min` : ""}</Text>
          </View>
        </View>

        <JobStepper status={status} />

        {showSchedule ? <ScheduledCard schedule={sched} role="partner" /> : null}

        {/* Demo OTP hint (demo partner only) */}
        {demoOtp.start || demoOtp.completion ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.infoSubtle, borderRadius: 12, padding: 12 }}>
            <Icon name="information-outline" size={16} color={colors.info} />
            <Text style={{ color: colors.info, fontSize: 12, fontWeight: "700", flex: 1 }}>Demo — Start OTP {demoOtp.start} · Completion OTP {demoOtp.completion}</Text>
          </View>
        ) : null}

        {/* Reschedule pending */}
        {pendingReq ? (
          <View testID={`reschedule-pending-${b.code}`} style={{ borderRadius: 16, borderWidth: 2, borderColor: "#FCD34D", backgroundColor: "#FFFBEB", padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="clock-outline" size={16} color="#B45309" /><Text style={{ color: "#B45309", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>Reschedule request · pending</Text></View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{pendingReq.requester_name} · {b.service_name}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.7)", padding: 10 }}>
                <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Current schedule</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{pendingReq.old_date}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{pendingReq.old_time}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.7)", padding: 10, borderWidth: 1, borderColor: "#FDE68A" }}>
                <Text style={{ color: "#F59E0B", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>New request</Text>
                <Text style={{ color: "#B45309", fontSize: 13, fontWeight: "900" }}>{pendingReq.new_date}</Text>
                <Text style={{ color: "#B45309", fontSize: 13, fontWeight: "900" }}>{pendingReq.new_time}</Text>
              </View>
            </View>
            {theyRequested ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable testID={`reschedule-accept-${b.code}`} onPress={() => respondResched("accept")} style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Accept reschedule</Text></Pressable>
                <Pressable testID={`reschedule-reject-${b.code}`} onPress={() => respondResched("reject")} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#FECDD3", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#E11D48", fontWeight: "700", fontSize: 13 }}>Reject</Text></Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
                <Text style={{ color: "#B45309", fontSize: 12, flex: 1 }}>Waiting for the customer to accept.</Text>
                <Pressable testID={`reschedule-withdraw-${b.code}`} onPress={cancelResched} style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Withdraw</Text></Pressable>
              </View>
            )}
          </View>
        ) : null}

        {/* Primary CTA — Navigate */}
        <View>
          {commLocked ? (
            <View testID={`navigate-locked-${b.code}`} style={{ height: 48, borderRadius: 12, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Icon name="lock-outline" size={20} color={SLATE400} /><Text style={{ color: SLATE400, fontWeight: "600", fontSize: 15 }}>Navigation locked</Text>
            </View>
          ) : (
            <Pressable testID={`navigate-${b.code}`} onPress={() => Linking.openURL(navUrl)} style={{ height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Icon name="navigation-variant-outline" size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Navigate to Customer</Text>
            </Pressable>
          )}
          <Text style={{ color: SLATE400, fontSize: 11.5, textAlign: "center", marginTop: 6 }}>{commLocked ? "Available 30 minutes before the scheduled time" : "Opens directions to the customer's location"}</Text>
        </View>

        {/* Contact */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {commLocked || !b.customer_phone ? (
            <View style={outlineBtn({ border: colors.border })}><Icon name={commLocked ? "lock-outline" : "phone-outline"} size={16} color="#CBD5E1" /><Text style={{ color: "#CBD5E1", fontWeight: "600", fontSize: 14 }}>Call</Text></View>
          ) : (
            <Pressable testID={`call-cust-${b.code}`} onPress={() => Linking.openURL(`tel:${b.customer_phone}`)} style={outlineBtn({ border: "#A7F3D0" })}><Icon name="phone-outline" size={16} color="#047857" /><Text style={{ color: "#047857", fontWeight: "600", fontSize: 14 }}>Call</Text></Pressable>
          )}
          <Pressable testID={`chat-cust-${b.code}`} disabled={commLocked} onPress={() => (commLocked ? toast.info("Chat unlocks 30 minutes before the scheduled time") : router.push({ pathname: "/chat/[id]", params: { id: b.id, role: "partner", service: b.service_name || "" } }))} style={[outlineBtn({ border: "#BFDBFE" }), { opacity: commLocked ? 0.5 : 1 }]}>
            <Icon name={commLocked ? "lock-outline" : "message-outline"} size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>Chat</Text>
            {!commLocked && unseen > 0 ? (
              <View testID={`chat-unseen-${b.code}`} style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginLeft: 2 }}>
                <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "800" }}>{unseen > 9 ? "9+" : unseen}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Job & customer details */}
        <Collapse title="Job & customer details" icon="account-outline" testID={`details-collapse-${b.code}`}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}><InfoItem icon="account-outline" label="Customer" value={b.customer_name} /><InfoItem icon="wrench-outline" label="Service" value={b.service_name} /></View>
            <View style={{ flexDirection: "row", gap: 8 }}><InfoItem icon="calendar-clock-outline" label="Schedule" value={schedLabel} /><InfoItem icon="check-circle-outline" label="Job value" value={fmt(b.breakdown?.total || b.total || b.pricing?.total || 0)} /></View>
          </View>
          <ServiceBreakdown booking={b} />
          <PartnerEarningSummary booking={b} />
          {maskedPhone ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}><Icon name="phone-outline" size={14} color={SLATE400} /><Text style={{ color: SLATE400, fontSize: 12 }}>{maskedPhone} <Text style={{ color: "#CBD5E1" }}>· number protected</Text></Text></View> : null}
        </Collapse>

        {(b.timeline || []).length > 0 ? (
          <Collapse title="Job timeline" icon="clock-outline" testID={`timeline-collapse-${b.code}`}><TimelineList items={b.timeline} color={colors.secondary} /></Collapse>
        ) : null}

        {/* BEFORE work + verify & start */}
        {status === "assigned" || arrived ? (
          <>
            {commLocked ? (
              <View style={{ borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="lock-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Before Work locked</Text></View>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>Before-work photo unlocks 30 minutes before {sched.scheduled_time || "the scheduled time"}</Text>
              </View>
            ) : (
              <PhotoBlock title="Before Work" items={before} onAdd={() => capture("before")} onRemove={(u) => removePhoto("before", u)} uploading={busy === "photo-before"} testID={`before-ev-${b.code}`} />
            )}
            {commLocked ? (
              <View testID={`start-locked-${b.code}`} style={{ borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="lock-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Start Work locked</Text></View>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>You can start this scheduled job 30 minutes before {sched.scheduled_time} on {sched.scheduled_date}. The customer's Start OTP becomes visible then too.</Text>
              </View>
            ) : (
              <View style={{ borderRadius: 12, borderWidth: 2, borderColor: "#DBEAFE", backgroundColor: "rgba(239,246,255,0.4)", padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="shield-check-outline" size={14} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Customer verification</Text></View>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Ask the customer for their <Text style={{ fontWeight: "700" }}>Start OTP</Text> to begin the job.</Text>
                <OtpBoxes value={otp} onChange={setOtp} />
                <Pressable testID={`start-otp-${b.code}`} disabled={otp.length < 4 || busy === "start-otp"} onPress={() => step("start-otp", "Job started ✓")} style={{ marginTop: 12, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: otp.length < 4 ? 0.5 : 1 }}>
                  <Icon name="check-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{busy === "start-otp" ? "Verifying…" : "Verify & Start Job"}</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        {/* AFTER work + complete */}
        {inProgress ? (
          <>
            <PhotoBlock title="After Work" items={after} onAdd={() => capture("after")} onRemove={(u) => removePhoto("after", u)} uploading={busy === "photo-after"} testID={`after-ev-${b.code}`} />
            {addlPending ? (
              <View testID={`complete-locked-${b.code}`} style={{ borderRadius: 12, borderWidth: 2, borderColor: "#FCD34D", backgroundColor: "#FFFBEB", paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="alert-outline" size={16} color="#B45309" /><Text style={{ color: "#92400E", fontSize: 14, fontWeight: "800" }}>Additional payment pending</Text></View>
                <Text style={{ color: "#B45309", fontSize: 12.5, marginTop: 4 }}>Additional work ka <Text style={{ fontWeight: "700" }}>payment order pehle customer se complete karwayein</Text>, uske baad hi OTP se kaam complete hoga.</Text>
              </View>
            ) : (
              <View style={{ borderRadius: 12, borderWidth: 2, borderColor: "#D1FAE5", backgroundColor: "rgba(236,253,245,0.4)", padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="check-circle-outline" size={14} color="#047857" /><Text style={{ color: "#047857", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Complete the job</Text></View>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Enter the customer's <Text style={{ fontWeight: "700" }}>Completion OTP</Text> to finish & credit your earnings.</Text>
                <OtpBoxes value={otp} onChange={setOtp} />
                <Pressable testID={`complete-otp-${b.code}`} disabled={otp.length < 4 || busy === "complete"} onPress={() => step("complete", "Job completed! Earnings credited 🎉")} style={{ marginTop: 12, height: 44, borderRadius: 12, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: otp.length < 4 ? 0.5 : 1 }}>
                  <Icon name="check-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{busy === "complete" ? "Completing…" : "Complete Job"}</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        {/* Secondary actions */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {status === "assigned" ? (
            <Pressable testID={`reject-${b.code}`} onPress={reject} style={outlineBtn({ border: "#FECACA" })}><Text style={{ color: "#DC2626", fontWeight: "600", fontSize: 13 }}>Reject Job</Text></Pressable>
          ) : null}
          {canRequestResched ? (
            <Pressable testID={`reschedule-${b.code}`} onPress={() => setReschedOpen(true)} style={outlineBtn({ border: colors.border })}><Icon name="clock-outline" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Request Reschedule</Text></Pressable>
          ) : null}
          {["arrived_customer", "started", "assigned"].includes(status) ? (
            <Pressable testID={`share-loc-${b.code}`} onPress={shareLocation} disabled={sharing} style={[outlineBtn({ border: colors.border }), { opacity: sharing ? 0.6 : 1 }]}><Icon name="navigation-variant-outline" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>{sharing ? "Sharing…" : "Share Location"}</Text></Pressable>
          ) : null}
        </View>

        {/* Additional work — rate-card flow (web ActiveJob parity) */}
        {inProgress || status === "arrived_customer" ? (
          <View testID={`additional-section-${b.code}`} style={{ borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, paddingTop: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="wrench-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Additional work</Text></View>
              {addl && num(addl.total) > 0 ? (
                <View style={{ backgroundColor: addl.status === "paid" ? "#D1FAE5" : "#FEF3C7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: addl.status === "paid" ? "#047857" : "#B45309", fontSize: 11, fontWeight: "700" }}>{addl.status === "paid" ? "Paid" : "Payment pending"}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 }}>If any extra parts or labour were used, add them from the category rate card. <Text style={{ color: "#B45309", fontWeight: "700" }}>Collect the payment for additional work from the customer first, then complete the job.</Text></Text>

            {addl && (addl.items || []).length > 0 ? (
              <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: 8, padding: 12, gap: 6, marginBottom: 12 }}>
                {addl.items.map((it: any) => (
                  <View key={it.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>{it.description}<Text style={{ color: SLATE400 }}> · part {fmt(it.part_charge)}{num(it.labour_charge) > 0 ? ` + labour ${fmt(it.labour_charge)}` : ""}</Text></Text>
                    {addl.status !== "paid" ? (
                      <Pressable testID={`addl-remove-${it.id}`} onPress={() => removeAdditional(it.id)} hitSlop={8}><Icon name="trash-can-outline" size={16} color="#EF4444" /></Pressable>
                    ) : null}
                  </View>
                ))}
                <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>Parts (no commission)</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmt(addl.parts_total)}</Text></View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>Labour (commission applies)</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmt(addl.labour_total)}</Text></View>
                {num(addl.gst) > 0 ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>Est. Govt. Taxes</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmt(addl.gst)}</Text></View> : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>Additional total</Text><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{fmt(addl.total)}</Text></View>
                {addl.status === "paid" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 2 }}><Icon name="check-circle-outline" size={14} color="#047857" /><Text style={{ color: "#047857", fontSize: 12, fontWeight: "600" }}>Customer paid — you can complete the job now</Text></View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 2 }}><Icon name="alert-outline" size={14} color="#B45309" /><Text style={{ color: "#B45309", fontSize: 12, fontWeight: "600" }}>Waiting for customer to pay the additional amount</Text></View>
                )}
              </View>
            ) : null}

            {addl?.status !== "paid" ? (
              rcCard ? (
                <Pressable testID={`add-additional-${b.code}`} onPress={() => setRcOpen(true)} style={{ alignSelf: "flex-start", height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#93C5FD", flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Add from rate card</Text>
                </Pressable>
              ) : (
                <Text style={{ color: SLATE400, fontSize: 12 }}>No rate card configured for this category — additional work unavailable.</Text>
              )
            ) : null}
          </View>
        ) : null}
      </View>

      {rcCard ? <RateCardSheet open={rcOpen} onClose={() => setRcOpen(false)} card={rcCard} onAdd={addAdditionalRow} /> : null}

      <Modal visible={reschedOpen} transparent animationType="slide" onRequestClose={() => setReschedOpen(false)}>
        <KeyboardProvider>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setReschedOpen(false)} />
          <View testID={`reschedule-modal-${b.code}`} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "700" }}>Request reschedule</Text>
              <Pressable onPress={() => setReschedOpen(false)} hitSlop={8}><Icon name="close" size={18} color={SLATE400} /></Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Current: <Text style={{ fontWeight: "700" }}>{sched.scheduled_date} · {sched.scheduled_time}</Text>. The booking time changes only after the customer accepts.</Text>
            <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Pick a new date & time slot</Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 50 }}>
              <Icon name="calendar-clock-outline" size={18} color={colors.textMuted} />
              <TextInput testID="resched-input" value={reschedVal} onChangeText={setReschedVal} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor={colors.textMuted} style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.md, fontWeight: "600" }} />
            </View>
            <Button title={busy === "resched" ? "Sending…" : "Send reschedule request"} onPress={requestResched} loading={busy === "resched"} disabled={!reschedVal} testID={`reschedule-confirm-${b.code}`} />
          </View>
        </KeyboardAvoidingView>
        </KeyboardProvider>
      </Modal>
    </JobCardShell>
  );
}

/* ── RateCardSheet — RN mirror of web RateCardModal (add extra work from category rate card) ── */
function RateCardSheet({ open, onClose, card, onAdd }: { open: boolean; onClose: () => void; card: any; onAdd: (row: any) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const accent = card?.accent_color || "#0D47A1";
  const groups: any[] = card?.groups || [];
  const filtered = !q.trim() ? groups : groups.map((g) => ({
    ...g,
    rows: (g.rows || []).filter((r: any) =>
      (r.description || "").toLowerCase().includes(q.trim().toLowerCase()) ||
      (r.warranty || "").toLowerCase().includes(q.trim().toLowerCase()) ||
      String(r.service_charge || "").includes(q.trim())),
  })).filter((g) => g.rows.length > 0);
  const handleAdd = (r: any) => { onAdd(r); setAdded((prev) => new Set(prev).add(r.id)); };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%", paddingBottom: insets.bottom + 12 }}>
          <View style={{ height: 6, backgroundColor: accent }} />
          <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${accent}1A`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Icon name="star-four-points-outline" size={13} color={accent} /><Text style={{ color: accent, fontSize: 12, fontWeight: "800" }}>{card?.brand_label || "AzoCover"}</Text>
                </View>
                <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "500" }}>{card?.category_name}</Text></View>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={18} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 10 }}>{card?.title || "Standard rate card"}</Text>
            {card?.subtitle ? <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{card.subtitle}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, height: 44, marginTop: 12 }}>
              <Icon name="magnify" size={18} color={SLATE400} />
              <TextInput testID="ratecard-search" value={q} onChangeText={setQ} placeholder="Search a repair, part or price…" placeholderTextColor={SLATE400} style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 14 }} />
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 48 }}><Icon name="magnify" size={32} color={SLATE400} /><Text style={{ color: SLATE400, fontSize: 14, marginTop: 10 }}>No items match “{q}”.</Text></View>
            ) : filtered.map((g) => (
              <View key={g.id} style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, borderLeftColor: accent }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${accent}1A`, alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={16} color={accent} /></View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }}>{g.name || "Services"}</Text>
                  <View style={{ backgroundColor: `${accent}1A`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: accent, fontSize: 11, fontWeight: "700" }}>{(g.rows || []).length}</Text></View>
                </View>
                {(g.rows || []).map((r: any) => {
                  const sc = num(r.service_charge);
                  const isAdded = added.has(r.id);
                  return (
                    <View key={r.id} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14 }}>{r.description}</Text>
                        {r.warranty ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 6, backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Icon name="shield-check-outline" size={11} color="#047857" /><Text style={{ color: "#047857", fontSize: 10.5, fontWeight: "600" }}>{r.warranty} warranty</Text>
                          </View>
                        ) : null}
                        <Pressable testID={`ratecard-add-${r.id}`} onPress={() => handleAdd(r)} style={{ alignSelf: "flex-start", marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: isAdded ? EMERALD : accent }}>
                          <Icon name={isAdded ? "check" : "plus"} size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{isAdded ? "Added · add again" : "Add"}</Text>
                        </Pressable>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>{fmt(sc)}</Text>
                        {num(r.labour_charge) > 0 ? <Text style={{ color: SLATE400, fontSize: 11, marginTop: 2 }}>+ {fmt(r.labour_charge)} labour</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }} testID="ratecard-footer">
            <Text style={{ color: added.size > 0 ? "#047857" : colors.textMuted, fontSize: 13, fontWeight: "600", flex: 1 }}>{added.size > 0 ? `${added.size} item${added.size > 1 ? "s" : ""} added — customer will be asked to pay` : "Tap Add on any item to add it as extra work"}</Text>
            <Pressable testID="ratecard-done" onPress={onClose} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: accent }}><Icon name="check" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Done</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
