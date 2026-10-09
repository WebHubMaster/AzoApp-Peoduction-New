import React, { useState, useEffect, useRef } from "react";
import { useNow, fmtElapsed } from "@/src/lib/useNow";
import { HelpSOS } from "@/src/components/partner/HelpSOS";
import * as Location from "expo-location";
import { View, Text, Pressable, Linking, Modal, ScrollView, Alert, Platform } from "react-native";
import { RefreshControl } from "@/src/components/RefreshNote";
import { CalendarSlotPicker } from "@/src/components/CalendarSlotPicker";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
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
  const params = useLocalSearchParams<{ view?: string; focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const scrolledFor = useRef<string | undefined>(undefined);
  const [focusId, setFocusId] = useState<string | undefined>(params.focus);
  useEffect(() => { setFocusId(params.focus); scrolledFor.current = undefined; }, [params.focus]);
  useEffect(() => { if (!focusId) return; const t = setTimeout(() => setFocusId(undefined), 2500); return () => clearTimeout(t); }, [focusId]);
  const onCardLayout = (id: string) => (e: any) => {
    if (id !== params.focus || scrolledFor.current === id) return;
    scrolledFor.current = id;
    scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: true });
  };
  const focusWrap = (id: string, el: React.ReactNode) => (
    <View key={id} onLayout={onCardLayout(id)} testID={`job-focus-wrap-${id}`}
      style={{ borderRadius: 6, borderWidth: 2, borderColor: focusId === id ? colors.primary : "transparent", margin: -2 }}>{el}</View>
  );
  const [view, setView] = useState<"active" | "completed">(params.view === "completed" ? "completed" : "active");
  useEffect(() => { if (params.view === "completed" || params.view === "active") setView(params.view); }, [params.view]);

  const activeQ = useQuery({ queryKey: ["partner-active"], queryFn: () => api.get<any[]>("/bookings/partner/active"), refetchInterval: 15000 });
  const doneQ = useQuery({ queryKey: ["partner-joblist", "history", "completed"], queryFn: () => api.get<any[]>("/bookings/partner/history?status=completed") });
  const activeJobs = activeQ.data || [];
  const completedJobs = (doneQ.data || []).filter((b) => ["completed", "paid"].includes(b.status));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["partner-active"] }); qc.invalidateQueries({ queryKey: ["partner-joblist"] }); qc.invalidateQueries({ queryKey: ["partner-wallet"] }); };

  // Pull-to-refresh spinner reflects ONLY a genuine user pull — never the 15s
  // background poll or the burst of cache-invalidations that fire on job
  // completion (refreshPartnerLive + SSE). Otherwise a slow background refetch
  // kept the native spinner stuck on screen for a long time after completing a
  // job, which looked like the screen was "loading forever".
  const [pulling, setPulling] = useState(false);
  const onPull = async () => {
    setPulling(true);
    qc.invalidateQueries({ queryKey: ["partner-wallet"] });
    try { await Promise.all([activeQ.refetch(), doneQ.refetch()]); }
    finally { setPulling(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView
        ref={scrollRef}
        testID="active-jobs"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Active / Completed chips */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable testID="job-view-active" onPress={() => setView("active")} style={{ height: 36, paddingHorizontal: 16, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: view === "active" ? colors.primary : colors.surfaceSubtle }}>
            <Text style={{ color: view === "active" ? "#fff" : colors.textSecondary, fontSize: 14, fontWeight: "600" }}>Active{activeJobs.length ? ` (${activeJobs.length})` : ""}</Text>
          </Pressable>
          <Pressable testID="job-view-completed" onPress={() => setView("completed")} style={{ height: 36, paddingHorizontal: 16, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: view === "completed" ? EMERALD : colors.surfaceSubtle }}>
            <Text style={{ color: view === "completed" ? "#fff" : colors.textSecondary, fontSize: 14, fontWeight: "600" }}>Completed{completedJobs.length ? ` (${completedJobs.length})` : ""}</Text>
          </Pressable>
        </View>

        {view === "active" ? (
          activeQ.isLoading ? <Empty text="Loading…" /> : activeJobs.length === 0 ? <Empty text="No active jobs. Accept a request to get started." /> : activeJobs.map((b) => focusWrap(b.id, <ActiveJobCard b={b} onUpdate={refresh} />))
        ) : (
          doneQ.isLoading ? <Empty text="Loading…" /> : completedJobs.length === 0 ? <Empty text="No completed jobs yet. Finished jobs will appear here." /> : completedJobs.map((b) => focusWrap(b.id, <CompletedJob b={b} />))
        )}
      </ScrollView>
    </View>
  );
}

/* ── Empty (web: bg-white rounded-xl border-dashed p-10 text-slate-400) ── */
function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View testID="jobs-empty" style={{ backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: 40, alignItems: "center" }}>
      <Text style={{ color: SLATE400, fontSize: 16, textAlign: "center", lineHeight: 24 }}>{text}</Text>
    </View>
  );
}

/* ── shared card pieces ── */
function JobCardShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: "hidden", boxShadow: "0px 8px 30px rgba(2,32,71,0.06)", elevation: 2 }}>{children}</View>;
}

export function JobDetailsBlock({ b }: { b: any }) {
  const schedLabel = b.scheduled_at ? fmtDT(b.scheduled_at) : "Now";
  const last4 = String(b.customer_phone || "").replace(/\D/g, "").slice(-4);
  const maskedPhone = last4 ? `+91 XXXXX X${last4}` : "";
  return (
    <View testID={`job-details-block-${b.code}`}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}><InfoItem icon="account-outline" label="Customer" value={b.customer_name} /><InfoItem icon="wrench-outline" label="Service" value={b.service_name} /></View>
        <View style={{ flexDirection: "row", gap: 8 }}><InfoItem icon="calendar-clock-outline" label="Schedule" value={schedLabel} /><InfoItem icon="check-circle-outline" label="Job value" value={fmt(b.partner_amount ?? b.breakdown?.total ?? b.pricing?.total ?? 0)} /></View>
      </View>
      <ServiceBreakdown booking={b} />
      {maskedPhone ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}><Icon name="phone-outline" size={14} color={SLATE400} /><Text style={{ color: SLATE400, fontSize: 12 }}>{maskedPhone} <Text style={{ color: "#CBD5E1" }}>· number protected</Text></Text></View> : null}
    </View>
  );
}

function InfoItem({ icon, label, value }: { icon: MdiName; label: string; value?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 6, backgroundColor: colors.surfaceSubtle, padding: 12 }}>
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
    <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
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
    <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginTop: 12 }} testID="service-breakdown">
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
  const coupon = num(bd.coupon_discount);
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
    <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginTop: 12 }} testID="partner-earning-summary">
      {secHdr(colors.surfaceSubtle, colors.textMuted, "Payment Summary")}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <EarnRow k="Service Amount" v={fmt(bd.services_subtotal)} />
        {charges.map((c) => <EarnRow key={c.key || c.label} k={c.label} v={fmt(c.amount)} />)}
        {coupon > 0 ? <EarnRow k={`Coupon${bd.coupon_code ? ` ${bd.coupon_code}` : ""} · AzoApp-funded`} v={fmt(coupon)} muted sub="Paid by AzoApp · not deducted from your earning" /> : null}
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
            <EarnRow k="Partner Earning" v={fmt(earning.partner_earning)} strong />
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
            <EarnRow k="Customer Refund" v={`- ${fmt(refund.refund_amount)}`} negative />
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
  if (!s.is_scheduled && !s.is_instant) return null;
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
    <View testID="scheduled-card" style={{ borderRadius: 6, borderWidth: 2, borderColor: locked ? colors.primarySubtle : "#A7F3D0", backgroundColor: locked ? "rgba(239,246,255,0.6)" : "#ECFDF5", padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: accent, alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="calendar-outline" size={18} color="#fff" /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: accent, fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>{s.is_instant ? "Instant Service" : "Scheduled Service"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="calendar-outline" size={13} color={colors.textMuted} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{s.scheduled_date}</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="clock-outline" size={13} color={colors.textMuted} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{s.scheduled_time}</Text></View>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
          <Text numberOfLines={1} style={{ color: SLATE400, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>{started ? "In progress" : due ? "Ready to start" : "Starts in"}</Text>
          <Text testID="scheduled-countdown" style={{ color: accent, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{started ? "—" : fmtCountdown(secs)}</Text>
        </View>
      </View>
      {locked ? (
      <View style={{ marginTop: 12 }}>
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {items.map((it) => (
                <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: colors.primarySubtle, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Icon name="lock-outline" size={12} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "600" }}>{it.label}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>Available {Number(s.lead_minutes) || 30} minutes before the scheduled time.</Text>
          </>
      </View>
      ) : null}
    </View>
  );
}

/* ── CompletedJob (web PartnerDashboard.jsx) ── */
function CompletedJob({ b }: { b: any }) {
  const { colors } = useTheme();
  const a = b.address || {};
  const completedAt = (b.timeline || []).filter((t: any) => t.status === "completed").map((t: any) => t.at).pop() || b.updated_at;
  const earning = b.commission?.partner_earning ?? null;
  const jobValue = b.partner_amount ?? b.breakdown?.total ?? b.total ?? b.pricing?.total ?? 0;
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
            <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, lineHeight: 22 }}>{b.service_name}</Text>
              <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>#{b.code}</Text>
            </View>
          </View>
          <StatusBadge status={b.status} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, borderRadius: 6, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 14, paddingVertical: 12 }}>
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
          <View style={{ borderRadius: 6, borderWidth: 2, borderColor: "#D1FAE5", backgroundColor: "rgba(236,253,245,0.5)", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
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

/* ── ActiveJob (web ActiveJob) ── */
function Elapsed({ startedAt, style, testID }: { startedAt?: string; style: any; testID: string }) {
  const now = useNow(1000, !!startedAt);
  return <Text testID={testID} style={style}>{fmtElapsed(startedAt, now)}</Text>;
}

export function ActiveJobCard({ b, onUpdate }: { b: any; onUpdate: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);

  const status = b.status as string;
  const arrived = ["arrived_shop", "arrived_customer"].includes(status);
  const inProgress = status === "started";
  const a = b.address || {};
  const det = (b.eligible_detail || {})[b.partner_id] || {};

  // Unread chat badge — server-side read receipts (synced with web).
  const unseen = useChatUnread(b.id);

  const startedAt = (b.timeline || []).filter((t: any) => ["started", "in_progress"].includes(t.status)).map((t: any) => t.at).pop();

  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const leadMin = Number(sched.lead_minutes) || 30;
  const showSchedule = !["completed", "paid", "cancelled"].includes(status);
  const pendingReq = b.reschedule_request && b.reschedule_request.status === "pending" ? b.reschedule_request : null;
  const theyRequested = pendingReq && pendingReq.requested_by_role === "customer";
  const canRequestResched = !pendingReq && ["assigned", "arrived_shop", "arrived_customer"].includes(status);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState<Date | null>(null);

  const openWizard = () => router.push({ pathname: "/(partner)/partner/job/[id]", params: { id: b.id } } as any);

  // Live location sharing while travelling (assigned / arrived_shop) → customer's Live Tracking map.
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const travelling = ["assigned", "arrived_shop"].includes(status) && !sched.comm_locked;
  useEffect(() => {
    if (!travelling || Platform.OS === "web") return undefined;
    let alive = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted || !alive) return;
        const send = (pos: Location.LocationObject) => api.post(`/bookings/${b.id}/location`, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (cur) send(cur);
        watchRef.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 20000, distanceInterval: 40 }, send);
      } catch { /* location unavailable — customer sees last known */ }
    })();
    return () => { alive = false; watchRef.current?.remove(); watchRef.current = null; };
  }, [travelling, b.id]);
  const reject = () => {
    Alert.alert("Reject this job?", "It will be sent back to admin for re-assignment.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: async () => {
        try { await api.post(`/bookings/${b.id}/reject`, { reason: "" }); toast.success("Job rejected"); onUpdate(); }
        catch (e: any) { toast.error(e?.detail || "Failed to reject"); }
      } },
    ]);
  };
  const requestResched = async () => {
    if (!reschedDate) return toast.error("Pick a new date & time");
    if (reschedDate.getTime() < Date.now()) return toast.error("Pick a future date & time");
    // Send local wall-clock time (YYYY-MM-DDTHH:MM) so the slot grid matches the booking.
    const p = (n: number) => String(n).padStart(2, "0");
    const local = `${reschedDate.getFullYear()}-${p(reschedDate.getMonth() + 1)}-${p(reschedDate.getDate())}T${p(reschedDate.getHours())}:${p(reschedDate.getMinutes())}`;
    setBusy("resched");
    try { await api.post(`/bookings/${b.id}/reschedule/request`, { scheduled_at: local }); toast.success("Reschedule request sent to the customer"); setReschedOpen(false); setReschedDate(null); onUpdate(); }
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

  const dest = a.lat && a.lng ? `${a.lat},${a.lng}` : encodeURIComponent(`${a.line || ""}, ${a.city || ""} ${a.pincode || ""}`);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

  const outlineBtn = (opts: { border: string }) => ({ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: opts.border, alignItems: "center" as const, justifyContent: "center" as const, flexDirection: "row" as const, gap: 6 });

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
          {startedAt ? <Elapsed testID={`elapsed-${b.code}`} startedAt={startedAt} style={{ color: "#fff", fontWeight: "700", fontSize: 14, fontVariant: ["tabular-nums"], backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }} /> : null}
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
        {/* Premium header (tap → job wizard): price + customer address up top */}
        <Pressable testID={`job-card-${b.code}`} onPress={openWizard} accessibilityRole="button" accessibilityLabel={`Open job ${b.code}`}
          style={({ pressed }) => ({ marginHorizontal: -20, marginTop: -20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, backgroundColor: inProgress ? "#F0FDF7" : "#F5F9FF", borderBottomWidth: 1, borderBottomColor: colors.border, opacity: pressed ? 0.94 : 1 })}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <View testID={`status-pill-${b.code}`} style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 24, paddingHorizontal: 9, borderRadius: 6, backgroundColor: inProgress ? EMERALD : colors.primary }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11, textTransform: "capitalize" }}>{inProgress ? "Work in progress" : String(status).replace(/_/g, " ")}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", fontFamily: "monospace" }}>#{b.code}</Text>
              </View>
              <Text numberOfLines={2} style={{ color: colors.text, fontWeight: "800", fontSize: 17, lineHeight: 23, marginTop: 8 }}>{b.service_name}</Text>
              {b.category_name ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{b.category_name}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
              <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>Job value</Text>
              <Text testID={`job-price-${b.code}`} style={{ color: inProgress ? "#047857" : colors.text, fontWeight: "800", fontSize: 22, lineHeight: 28, fontVariant: ["tabular-nums"] }}>{fmt(b.partner_amount ?? b.breakdown?.total ?? b.total ?? 0)}</Text>
            </View>
          </View>

          {/* Customer address */}
          <View testID={`job-address-${b.code}`} style={{ flexDirection: "row", gap: 10, marginTop: 14, borderRadius: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, padding: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
              <Icon name="map-marker-outline" size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>Customer address</Text>
              <Text numberOfLines={2} style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", lineHeight: 19, marginTop: 1 }}>{a.line || "Address unavailable"}{a.city ? `, ${a.city}` : ""}</Text>
              {a.pincode || det.distance_km != null || det.eta_min != null ? (
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {a.pincode ? <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{a.pincode}</Text> : null}
                  {det.distance_km != null ? <Text testID={`job-distance-${b.code}`} style={{ color: colors.primary, fontSize: 11, fontWeight: "700", backgroundColor: colors.primarySubtle, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>~{det.distance_km} km</Text> : null}
                  {det.eta_min != null ? <Text testID={`job-eta-${b.code}`} style={{ color: colors.primary, fontSize: 11, fontWeight: "700", backgroundColor: colors.primarySubtle, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>~{det.eta_min} min</Text> : null}
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        {inProgress ? <HelpSOS booking={b} /> : null}

        {showSchedule ? <ScheduledCard schedule={sched} role="partner" /> : null}

        {/* Reschedule pending */}
        {pendingReq ? (
          <View testID={`reschedule-pending-${b.code}`} style={{ borderRadius: 6, borderWidth: 2, borderColor: "#FCD34D", backgroundColor: "#FFFBEB", padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="clock-outline" size={16} color="#B45309" /><Text style={{ color: "#B45309", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>Reschedule request · pending</Text></View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{pendingReq.requester_name} · {b.service_name}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.7)", padding: 10 }}>
                <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Current schedule</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{pendingReq.old_date}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{pendingReq.old_time}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.7)", padding: 10, borderWidth: 1, borderColor: "#FDE68A" }}>
                <Text style={{ color: "#F59E0B", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>New request</Text>
                <Text style={{ color: "#B45309", fontSize: 13, fontWeight: "900" }}>{pendingReq.new_date}</Text>
                <Text style={{ color: "#B45309", fontSize: 13, fontWeight: "900" }}>{pendingReq.new_time}</Text>
              </View>
            </View>
            {theyRequested ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable testID={`reschedule-accept-${b.code}`} onPress={() => respondResched("accept")} style={{ flex: 1, height: 40, borderRadius: 6, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Accept reschedule</Text></Pressable>
                <Pressable testID={`reschedule-reject-${b.code}`} onPress={() => respondResched("reject")} style={{ flex: 1, height: 40, borderRadius: 6, borderWidth: 1, borderColor: "#FECDD3", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#E11D48", fontWeight: "700", fontSize: 13 }}>Reject</Text></Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
                <Text style={{ color: "#B45309", fontSize: 12, flex: 1 }}>Waiting for the customer to accept.</Text>
                <Pressable testID={`reschedule-withdraw-${b.code}`} onPress={cancelResched} style={{ height: 36, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Withdraw</Text></Pressable>
              </View>
            )}
          </View>
        ) : null}

        {/* Primary CTA — Navigate */}
        <View>
          {commLocked ? (
            <View testID={`navigate-locked-${b.code}`} style={{ height: 48, borderRadius: 6, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Icon name="lock-outline" size={20} color={SLATE400} /><Text style={{ color: SLATE400, fontWeight: "600", fontSize: 15 }}>Navigation locked</Text>
            </View>
          ) : (
            <Pressable testID={`navigate-${b.code}`} onPress={() => Linking.openURL(navUrl)} style={{ height: 48, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Icon name="navigation-variant-outline" size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Navigate to Customer</Text>
            </Pressable>
          )}
          <Text style={{ color: SLATE400, fontSize: 11.5, textAlign: "center", marginTop: 6 }}>{commLocked ? `Available ${leadMin} minutes before the scheduled time` : "Opens directions to the customer's location"}</Text>
        </View>

        {/* Contact */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {commLocked || !b.customer_phone ? (
            <View style={outlineBtn({ border: colors.border })}><Icon name={commLocked ? "lock-outline" : "phone-outline"} size={16} color="#CBD5E1" /><Text style={{ color: "#CBD5E1", fontWeight: "600", fontSize: 14 }}>Call</Text></View>
          ) : (
            <Pressable testID={`call-cust-${b.code}`} onPress={() => Linking.openURL(`tel:${b.customer_phone}`)} style={outlineBtn({ border: "#A7F3D0" })}><Icon name="phone-outline" size={16} color="#047857" /><Text style={{ color: "#047857", fontWeight: "600", fontSize: 14 }}>Call</Text></Pressable>
          )}
          <Pressable testID={`chat-cust-${b.code}`} disabled={commLocked} onPress={() => (commLocked ? toast.info(`Chat unlocks ${leadMin} minutes before the scheduled time`) : router.push({ pathname: "/chat/[id]", params: { id: b.id, role: "partner", service: b.service_name || "" } }))} style={[outlineBtn({ border: "#BFDBFE" }), { opacity: commLocked ? 0.5 : 1 }]}>
            <Icon name={commLocked ? "lock-outline" : "message-outline"} size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>Chat</Text>
            {!commLocked && unseen > 0 ? (
              <View testID={`chat-unseen-${b.code}`} style={{ minWidth: 18, height: 18, borderRadius: 6, paddingHorizontal: 5, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", marginLeft: 2 }}>
                <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "800" }}>{unseen > 9 ? "9+" : unseen}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Job & customer details */}
        <Collapse title="Job & customer details" icon="account-outline" testID={`details-collapse-${b.code}`}>
          <JobDetailsBlock b={b} />
        </Collapse>

        {/* Wizard entry — Details → Selfie check-in → Before proof + Start OTP → After proof + Complete OTP */}
        <Pressable testID={`open-job-${b.code}`} disabled={commLocked} onPress={openWizard} style={({ pressed }) => ({ height: 52, borderRadius: 6, backgroundColor: commLocked ? colors.surfaceSubtle : inProgress ? EMERALD : colors.secondary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: commLocked ? 0.7 : 1, transform: [{ scale: pressed && !commLocked ? 0.985 : 1 }] })}>
          <Icon name={commLocked ? "lock-outline" : inProgress ? "check-decagram-outline" : b.checkin ? "play-circle-outline" : "camera-account"} size={20} color={commLocked ? SLATE400 : "#fff"} />
          <Text style={{ color: commLocked ? SLATE400 : "#fff", fontWeight: "800", fontSize: 15 }}>{commLocked ? "Check-in & Start locked" : inProgress ? "Continue · Complete Job" : b.checkin ? "Continue · Start Job" : "Continue · Check-in & Start"}</Text>
          {commLocked ? null : <Icon name="chevron-right" size={20} color="#fff" />}
        </Pressable>
        {commLocked ? <Text testID={`start-locked-note-${b.code}`} style={{ color: SLATE400, fontSize: 11.5, textAlign: "center", marginTop: 6 }}>Available {leadMin} minutes before the scheduled time</Text> : null}

        {/* Secondary actions */}
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {status === "assigned" ? (
            <Pressable testID={`reject-${b.code}`} onPress={reject} style={[outlineBtn({ border: "#FECACA" }), { flex: 1, minWidth: 130, paddingHorizontal: 8 }]}><Icon name="close-circle-outline" size={15} color="#DC2626" /><Text numberOfLines={1} style={{ color: "#DC2626", fontWeight: "700", fontSize: 12, flexShrink: 1 }}>Reject Job</Text></Pressable>
          ) : null}
          {canRequestResched ? (
            <Pressable testID={`reschedule-${b.code}`} onPress={() => setReschedOpen(true)} style={[outlineBtn({ border: colors.border }), { flex: 1, minWidth: 130, paddingHorizontal: 8 }]}><Icon name="clock-outline" size={15} color={colors.textSecondary} /><Text numberOfLines={1} style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 12, flexShrink: 1 }}>Request Reschedule</Text></Pressable>
          ) : null}
        </View>

      </View>

      <Modal visible={reschedOpen} transparent animationType="slide" onRequestClose={() => setReschedOpen(false)}>
        <KeyboardProvider>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setReschedOpen(false)} />
          <View testID={`reschedule-modal-${b.code}`} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: 20, paddingBottom: insets.bottom + 20, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "700" }}>Request reschedule</Text>
              <Pressable onPress={() => setReschedOpen(false)} hitSlop={8}><Icon name="close" size={18} color={SLATE400} /></Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Current: <Text style={{ fontWeight: "700" }}>{sched.is_scheduled ? `${sched.scheduled_date} · ${sched.scheduled_time}` : "Now (instant)"}</Text>. The booking time changes only after the customer accepts.</Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <CalendarSlotPicker
                value={reschedDate}
                onChange={setReschedDate}
                primary={colors.primary}
                surface={colors.surface}
                text={colors.text}
                muted={colors.textMuted}
                border={colors.border}
              />
            </ScrollView>
            <Button title={busy === "resched" ? "Sending…" : "Send reschedule request"} onPress={requestResched} loading={busy === "resched"} disabled={!reschedDate} testID={`reschedule-confirm-${b.code}`} />
          </View>
        </KeyboardAvoidingView>
        </KeyboardProvider>
      </Modal>
    </JobCardShell>
  );
}

