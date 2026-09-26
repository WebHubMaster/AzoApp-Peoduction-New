/** BookingCard + OtpBanner + CurrentStepCard + ScheduledCard + PremiumTimeline — 1:1 port of CustomerDashboard.jsx (mobile view). */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Linking, Animated } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Wrench, CheckCircle2, X, Copy, User, Phone, Clock, ChevronDown, Wallet, Info, RefreshCcw, Star, AlertTriangle, Lock, Navigation, MessageCircle, FileText, Crown, Calendar, Circle } from "lucide-react-native";
import { PRIMARY, SLATE, EMERALD, ROSE, AMBER, useTheme, shadowBtn, shadowElev } from "../../theme";
import { StatusChip } from "./ux";
import { statusText, statusTone, DONE_STATES, bkDate } from "./nav";
import { fmt } from "../../lib/format";
import { UnreadPill } from "./BookingChat";

export const fmtTs = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export const relTime = (iso?: string) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day${s < 172800 ? "" : "s"} ago`;
};
const STATUS_RANK: Record<string, number> = { searching: 0, assigned: 1, arrived_shop: 2, arrived_customer: 2, started: 3, completed: 4, paid: 4 };
const VIOLET600 = "#7C3AED";

export function buildSteps(b: any) {
  const rank = STATUS_RANK[b.status] ?? 0;
  const at = (st: string[]) => (b.timeline || []).find((t: any) => st.includes(t.status))?.at;
  const defs = [
    { key: "confirmed", title: "Booking Confirmed", req: -1, at: at(["searching", "pending"]) || b.created_at, desc: "We received your booking" },
    { key: "assigned", title: "Partner Assigned", req: 1, at: at(["assigned"]), desc: b.partner_name || "Finding the best partner" },
    { key: "on_way", title: "Partner On The Way", req: 2, at: at(["arrived_customer", "arrived_shop"]), desc: "Estimated arrival 15–20 min" },
    { key: "started", title: "Work Started", req: 3, at: at(["started"]), desc: "Service in progress" },
    { key: "completed", title: "Work Completed", req: 4, at: at(["completed", "paid"]), desc: "Service finished" },
  ];
  let cur = false;
  return defs.map((d) => {
    let state: "completed" | "current" | "upcoming";
    if (d.req <= rank) state = "completed"; else if (!cur) { state = "current"; cur = true; } else state = "upcoming";
    if (b.status === "completed" || b.status === "paid") state = "completed";
    return { ...d, state };
  });
}

/* Pulsing dot (web: animate-ping) */
function PingDot({ color, done }: { color: string; done: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (done) return; const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1200, useNativeDriver: true })); loop.start(); return () => loop.stop(); }, [a, done]);
  return (
    <View style={{ height: 10, width: 10, alignItems: "center", justifyContent: "center" }}>
      {!done ? <Animated.View style={{ position: "absolute", height: 10, width: 10, borderRadius: 5, backgroundColor: PRIMARY[400], opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] }} /> : null}
      <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

export function OtpBanner({ kind, code, bcode }: { kind: "start" | "complete"; code: string; bcode: string }) {
  const start = kind === "start";
  const col = start ? PRIMARY : EMERALD;
  return (
    <View testID={`otp-banner-${kind}-${bcode}`} style={{ marginTop: 12, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: col[300], backgroundColor: start ? PRIMARY[50] : EMERALD[50], alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: col[700], textAlign: "center" }}>{start ? "Share this OTP to START work" : "Share this OTP to COMPLETE work"}</Text>
      <Text testID={`otp-code-${bcode}-${kind}`} style={{ fontSize: 36, fontWeight: "900", letterSpacing: 10, color: col[700], lineHeight: 44 }}>{code}</Text>
      <Text style={{ fontSize: 12, color: SLATE[500], textAlign: "center" }}>Tell your partner this code only when {start ? "they arrive & begin" : "the work is done"}.</Text>
    </View>
  );
}

export function CurrentStepCard({ b }: { b: any }) {
  const { isDark } = useTheme();
  const map: Record<string, { t: string; d: string; eta: string }> = {
    assigned: { t: "Partner assigned", d: "Your partner will start heading over soon", eta: "" },
    arrived_shop: { t: "Partner is on the way", d: "Picking up parts & heading to you", eta: "15–20 min" },
    arrived_customer: { t: "Partner has arrived", d: "Share your start OTP to begin", eta: "" },
    started: { t: "Work in progress", d: "Your partner is working on the service", eta: "" },
  };
  const m = map[b.status] || map.assigned;
  return (
    <View testID={`current-step-${b.code}`} style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: isDark ? PRIMARY[800] : PRIMARY[200], backgroundColor: isDark ? "rgba(7,52,115,0.15)" : "rgba(235,243,254,0.7)", padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: isDark ? SLATE[800] : "#fff", alignItems: "center", justifyContent: "center" }}><User size={20} color={PRIMARY[700]} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: isDark ? PRIMARY[200] : PRIMARY[800] }}>{m.t}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: isDark ? SLATE[300] : SLATE[600], marginTop: 2 }}>{b.partner_name || "Assigning…"}{b.category_name ? ` · ${b.category_name}` : ""}{b.partner_premium ? "  " : ""}{b.partner_premium ? <Text style={{ color: AMBER[600] }}><Crown size={11} color={AMBER[600]} /> Pro</Text> : null}</Text>
          {m.eta ? <Text style={{ fontSize: 11, color: SLATE[500], marginTop: 2 }}>Estimated arrival <Text style={{ fontWeight: "700", color: isDark ? SLATE[200] : SLATE[700] }}>{m.eta}</Text></Text> : null}
        </View>
      </View>
    </View>
  );
}

/* Port of components/booking/ScheduledCard.jsx (countdown ticks locally from server seconds_to_start) */
const fmtCountdown = (total: number) => {
  if (!Number.isFinite(total)) return "";
  if (total < 0) return "now";
  let s = Math.floor(total);
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}m ${pad(s)}s`;
};
export function ScheduledCard({ schedule }: { schedule: any }) {
  const { c, isDark } = useTheme();
  const s = schedule || {};
  const [secs, setSecs] = useState<number>(Number.isFinite(s.seconds_to_start) ? s.seconds_to_start : 0);
  useEffect(() => { setSecs(Number.isFinite(s.seconds_to_start) ? s.seconds_to_start : 0); }, [s.seconds_to_start]);
  useEffect(() => { const t = setInterval(() => setSecs((x) => x - 1), 1000); return () => clearInterval(t); }, []);
  if (!s.is_scheduled) return null;
  const locked = !!s.comm_locked; const started = s.phase === "active"; const due = s.phase === "due";
  const col = locked ? PRIMARY : EMERALD;
  const items = ["Call", "Chat", "Navigation", "Start OTP"];
  return (
    <View testID="scheduled-card" style={{ marginTop: 12, borderRadius: 16, borderWidth: 2, borderColor: locked ? PRIMARY[200] : EMERALD[300], backgroundColor: locked ? (isDark ? "rgba(7,52,115,0.25)" : PRIMARY[50]) : (isDark ? "rgba(6,78,59,0.25)" : EMERALD[50]), padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: col[600], alignItems: "center", justifyContent: "center" }}><Calendar size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: isDark ? col[300] : col[700] }}>Scheduled Service</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Calendar size={13} color={c.text} style={{ opacity: 0.7 }} /><Text style={{ fontSize: 14, fontWeight: "900", color: c.text }}>{s.scheduled_date}</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Clock size={13} color={c.text} style={{ opacity: 0.7 }} /><Text style={{ fontSize: 14, fontWeight: "900", color: c.text }}>{s.scheduled_time}</Text></View>
            </View>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400] }}>{started ? "In progress" : due ? "Ready to start" : "Starts in"}</Text>
          <Text testID="scheduled-countdown" style={{ fontSize: 18, fontWeight: "900", color: isDark ? col[200] : col[700] }}>{started ? "—" : fmtCountdown(secs)}</Text>
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        {locked ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {items.map((l) => <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: isDark ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100], paddingHorizontal: 10, paddingVertical: 4 }}><Lock size={12} color={SLATE[500]} /><Text style={{ fontSize: 11.5, fontWeight: "600", color: SLATE[500] }}>{l}</Text></View>)}
            </View>
            <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 8 }}>Available 30 minutes before the scheduled time.</Text>
          </>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><CheckCircle2 size={16} color={EMERALD[700]} /><Text style={{ fontSize: 12.5, fontWeight: "600", color: isDark ? EMERALD[300] : EMERALD[700] }}>Call, Chat & your Start OTP are now available.</Text></View>
        )}
      </View>
    </View>
  );
}

export function PremiumTimeline({ b, open, onToggle, lastAt }: { b: any; open: boolean; onToggle: () => void; lastAt?: string }) {
  const { c, isDark } = useTheme();
  if (b.status === "cancelled") {
    return (
      <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: isDark ? "rgba(136,19,55,0.2)" : ROSE[50], borderWidth: 1, borderColor: isDark ? "rgba(136,19,55,0.4)" : ROSE[200], paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <X size={16} color={ROSE[600]} /><Text style={{ fontSize: 14, fontWeight: "600", color: isDark ? "#FDA4AF" : ROSE[700], flex: 1 }}>Booking cancelled</Text>{lastAt ? <Text style={{ fontSize: 12, color: ROSE[500] }}>{fmtTs(lastAt)}</Text> : null}
      </View>
    );
  }
  const steps = buildSteps(b);
  const done = b.status === "completed" || b.status === "paid";
  const current = steps.find((s) => s.state === "current") || steps.filter((s) => s.state === "completed").slice(-1)[0];
  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.borderSoft, paddingTop: 12 }}>
      <Pressable testID={`timeline-toggle-${b.code}`} onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <PingDot color={done ? EMERALD[500] : PRIMARY[600]} done={done} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{done ? "Work Completed" : current?.title}</Text>
          <Text style={{ fontSize: 11, color: SLATE[400], marginTop: 1 }}>{current?.desc}{lastAt ? ` · Updated ${relTime(lastAt)}` : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: PRIMARY[600] }}>{open ? "Hide" : "View Timeline"}</Text>
          <ChevronDown size={16} color={PRIMARY[600]} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 12 }}>
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <View key={s.key} style={{ flexDirection: "row", gap: 12, paddingBottom: isLast ? 0 : 16, position: "relative" }}>
                {!isLast ? <View style={{ position: "absolute", left: 11, top: 24, bottom: 0, width: 2, backgroundColor: s.state === "completed" ? EMERALD[400] : (isDark ? SLATE[700] : SLATE[200]) }} /> : null}
                <View style={{ height: 24, width: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", zIndex: 1, backgroundColor: s.state === "completed" ? EMERALD[500] : s.state === "current" ? PRIMARY[600] : (isDark ? SLATE[800] : SLATE[100]), borderWidth: s.state === "current" ? 4 : 0, borderColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100] }}>
                  {s.state === "completed" ? <CheckCircle2 size={14} color="#fff" /> : s.state === "current" ? <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: "#fff" }} /> : <Circle size={12} color={SLATE[300]} />}
                </View>
                <View style={{ flex: 1, marginTop: -2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: s.state === "upcoming" ? SLATE[400] : c.text }}>{s.title}</Text>
                  <Text style={{ fontSize: 11, color: SLATE[400] }}>{s.desc}</Text>
                  {s.at ? <Text style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{fmtTs(s.at)}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/* ---- action chip (web Button size=sm rounded-full h-9 px-4) ---- */
export const Chip = ({ testID, icon: Icon, label, onPress, tone = "outline", disabled, right }: any) => {
  const { c, isDark } = useTheme();
  const filled = tone === "primary" || tone === "green";
  const bg = tone === "primary" ? PRIMARY[700] : tone === "green" ? EMERALD[600] : c.surface;
  const fg = filled ? "#fff" : tone === "rose" ? ROSE[600] : tone === "amber" ? AMBER[600] : (isDark ? SLATE[200] : SLATE[700]);
  const border = tone === "rose" ? ROSE[200] : tone === "amber" ? AMBER[200] : (isDark ? SLATE[700] : SLATE[200]);
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: bg, borderWidth: filled ? 0 : 1, borderColor: border, flexDirection: "row", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {Icon ? <Icon size={16} color={fg} /> : null}<Text style={{ fontSize: 14, fontWeight: "600", color: fg }}>{label}</Text>{right}
    </Pressable>
  );
};

export type CardActions = {
  onRepeat: (b: any) => void; onCancel: (b: any) => void; onReview: (b: any) => void; onPay: (b: any) => void; onPayAddl: (b: any) => void;
  onSpare: (b: any, partId: string, action: string) => void; onRefresh: () => void; onDetails: (b: any) => void; onInvoice: (b: any) => void; onChat: (b: any) => void;
  onReschedule: (b: any) => void; onTrack: (b: any) => void; respondResched: (b: any, action: "accept" | "reject") => Promise<void>; cancelResched: (b: any) => Promise<void>;
  unreadFor: (id: string) => number; toast: any;
};

export function BookingCard({ b, focus, a }: { b: any; focus?: boolean; a: CardActions }) {
  const { c, isDark } = useTheme();
  const [tlOpen, setTlOpen] = useState(false);
  const [reschedBusy, setReschedBusy] = useState(false);
  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const pendingReq = b.reschedule_request && b.reschedule_request.status === "pending" ? b.reschedule_request : null;
  const theyRequested = pendingReq && pendingReq.requested_by_role === "partner";
  const canCancel = ["searching", "assigned", "arrived_shop", "arrived_customer"].includes(b.status);
  const canRepeat = DONE_STATES.includes(b.status) || b.status === "cancelled";
  const canReview = DONE_STATES.includes(b.status) && !b.review;
  const canInvoice = DONE_STATES.includes(b.status);
  const addlDue = b.additional && (b.additional.total || 0) > 0 && b.additional.status !== "paid";
  const assigned = ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status);
  const showSchedule = sched.is_scheduled && !DONE_STATES.includes(b.status) && b.status !== "cancelled";
  const canRequestResched = sched.is_scheduled && !pendingReq && !!b.partner_id && ["assigned", "arrived_shop", "arrived_customer"].includes(b.status);
  const lastAt = (b.timeline || []).filter((t: any) => t?.at).slice(-1)[0]?.at;
  const unread = a.unreadFor(b.id);
  const copyId = async () => { try { await Clipboard.setStringAsync(b.code); } catch { /* ignore */ } a.toast.success("Booking ID copied"); };
  const callPartner = () => {
    if (commLocked) { a.toast.info("Call unlocks 30 minutes before your scheduled time"); return; }
    const phone = b.partner_phone || b.partner?.phone;
    if (phone) Linking.openURL(`tel:${String(phone).replace(/\s/g, "")}`); else a.toast.info("Partner contact will be shared once a partner is assigned");
  };
  const chatPartner = () => { if (commLocked) { a.toast.info("Chat unlocks 30 minutes before your scheduled time"); return; } a.onChat(b); };
  const wrap = async (fn: () => Promise<void>) => { setReschedBusy(true); try { await fn(); } finally { setReschedBusy(false); } };
  const payColor = b.payment_status === "paid" ? EMERALD[600] : b.payment_status === "refunded" ? VIOLET600 : AMBER[600];
  const payLabel = b.payment_status === "paid" ? "Paid" : b.payment_status === "refunded" ? "Refunded" : "Pending";
  const softBg = isDark ? "rgba(30,41,59,0.6)" : SLATE[50];
  const amberSoft = isDark ? "rgba(120,53,15,0.2)" : AMBER[50];
  const whiteSoft = isDark ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.7)";

  return (
    <View testID={`booking-card-${b.code}`} style={{ borderRadius: 20, borderWidth: focus ? 2 : 1, borderColor: focus ? PRIMARY[400] : c.border, backgroundColor: c.surface, padding: 18, marginBottom: 16, ...shadowElev }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, flex: 1, minWidth: 0 }}>
          <View style={{ height: 50, width: 50, borderRadius: 18, backgroundColor: b.status === "cancelled" ? "#e11d48" : "#0D47A1", alignItems: "center", justifyContent: "center", ...shadowBtn }}>
            {b.status === "cancelled" ? <X size={23} color="#fff" /> : DONE_STATES.includes(b.status) ? <CheckCircle2 size={23} color="#fff" /> : <Wrench size={23} color="#fff" />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ fontSize: 17.5, fontWeight: "800", color: c.text, letterSpacing: -0.3 }}>{b.service_name}</Text>
              <StatusChip testID={`booking-status-${b.code}`} label={statusText(b.status)} tone={statusTone(b.status)} />
              {b.payment_status ? <StatusChip label={b.payment_status} tone={b.payment_status === "paid" ? "green" : b.payment_status === "refunded" ? "violet" : "amber"} /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <Pressable testID={`copy-id-${b.code}`} onPress={copyId} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ fontSize: 12, color: SLATE[400] }}>#{b.code}</Text><Copy size={12} color={SLATE[400]} /></Pressable>
              <Text style={{ fontSize: 12, color: SLATE[400] }}>· {b.category_name}</Text>
              <Text style={{ fontSize: 12, color: SLATE[400] }}>· {fmtTs(bkDate(b))}</Text>
              {b.booking_type === "merchant" ? <Text style={{ fontSize: 12, color: PRIMARY[600] }}>· via {b.merchant_name}</Text> : null}
            </View>
            {(b.items || []).length > 1 ? (
              <View testID={`items-${b.code}`} style={{ marginTop: 8, borderRadius: 12, backgroundColor: softBg, borderWidth: 1, borderColor: c.borderSoft, paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
                {b.items.map((it: any, i: number) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text numberOfLines={1} style={{ fontSize: 12.5, color: isDark ? SLATE[300] : SLATE[600], flex: 1 }}>{i + 1}. {it.service_name || it.name || it.custom_name}{(it.qty || 1) > 1 ? ` × ${it.qty}` : ""}</Text>
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: isDark ? SLATE[200] : SLATE[700] }}>{fmt(it.price ?? it.total ?? it.custom_price ?? 0)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 21, fontWeight: "900", color: c.text, letterSpacing: -0.4 }}>{fmt(b.pricing?.total)}</Text>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: payColor, marginTop: 2 }}>{payLabel}</Text>
        </View>
      </View>

      {b.otps?.start && ["assigned", "arrived_shop", "arrived_customer"].includes(b.status) ? <OtpBanner kind="start" code={b.otps.start} bcode={b.code} /> : null}
      {b.otps?.completion && b.status === "started" ? <OtpBanner kind="complete" code={b.otps.completion} bcode={b.code} /> : null}
      {assigned ? <CurrentStepCard b={b} /> : null}
      {showSchedule ? <ScheduledCard schedule={sched} /> : null}

      {pendingReq ? (
        <View testID={`reschedule-pending-${b.code}`} style={{ marginTop: 12, borderRadius: 16, borderWidth: 2, borderColor: AMBER[300], backgroundColor: amberSoft, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Clock size={16} color={AMBER[700]} /><Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: isDark ? AMBER[300] : AMBER[700] }}>Reschedule request · pending</Text></View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: whiteSoft, padding: 10 }}><Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400] }}>Current schedule</Text><Text style={{ fontSize: 13, fontWeight: "700", color: isDark ? SLATE[200] : SLATE[700] }}>{pendingReq.old_date}</Text><Text style={{ fontSize: 13, fontWeight: "700", color: isDark ? SLATE[200] : SLATE[700] }}>{pendingReq.old_time}</Text></View>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: whiteSoft, padding: 10, borderWidth: 1, borderColor: AMBER[200] }}><Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: AMBER[500] }}>New request</Text><Text style={{ fontSize: 13, fontWeight: "900", color: isDark ? AMBER[300] : AMBER[700] }}>{pendingReq.new_date}</Text><Text style={{ fontSize: 13, fontWeight: "900", color: isDark ? AMBER[300] : AMBER[700] }}>{pendingReq.new_time}</Text></View>
          </View>
          {theyRequested ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable testID={`reschedule-accept-${b.code}`} disabled={reschedBusy} onPress={() => wrap(() => a.respondResched(b, "accept"))} style={{ flex: 1, height: 36, borderRadius: 18, backgroundColor: EMERALD[600], alignItems: "center", justifyContent: "center", opacity: reschedBusy ? 0.5 : 1 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Accept reschedule</Text></Pressable>
              <Pressable testID={`reschedule-reject-${b.code}`} disabled={reschedBusy} onPress={() => wrap(() => a.respondResched(b, "reject"))} style={{ flex: 1, height: 36, borderRadius: 18, borderWidth: 1, borderColor: ROSE[200], backgroundColor: c.surface, alignItems: "center", justifyContent: "center", opacity: reschedBusy ? 0.5 : 1 }}><Text style={{ color: ROSE[600], fontWeight: "700", fontSize: 14 }}>Reject</Text></Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: isDark ? AMBER[200] : AMBER[700], flex: 1 }}>Waiting for your partner to accept.</Text>
              <Chip testID={`reschedule-withdraw-${b.code}`} label="Withdraw" disabled={reschedBusy} onPress={() => wrap(() => a.cancelResched(b))} />
            </View>
          )}
        </View>
      ) : null}

      {addlDue ? (
        <View testID={`addl-pending-${b.code}`} style={{ marginTop: 12, borderRadius: 12, borderWidth: 2, borderColor: AMBER[300], backgroundColor: amberSoft, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><AlertTriangle size={16} color={AMBER[700]} /><Text style={{ fontSize: 14, fontWeight: "800", color: isDark ? AMBER[300] : "#92400E" }}>Additional work payment pending</Text></View>
          <Text style={{ fontSize: 12.5, color: isDark ? AMBER[200] : AMBER[700], marginTop: 4 }}>Your partner added extra work/parts. Please complete this payment — the job finishes only after the additional payment.</Text>
          <View style={{ marginTop: 10, backgroundColor: whiteSoft, borderRadius: 8, padding: 10, gap: 4 }}>
            {(b.additional.items || []).map((it: any) => <View key={it.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={{ fontSize: 12.5, color: isDark ? SLATE[200] : SLATE[700], flex: 1 }}>{it.description}{it.labour_charge > 0 ? " (+ labour)" : ""}</Text><Text style={{ fontSize: 12.5, fontWeight: "600", color: isDark ? SLATE[200] : SLATE[700] }}>{fmt((Number(it.part_charge) || 0) + (Number(it.labour_charge) || 0))}</Text></View>)}
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: isDark ? SLATE[700] : SLATE[200], paddingTop: 4 }}><Text style={{ fontSize: 14, fontWeight: "800", color: c.text }}>Additional total</Text><Text style={{ fontSize: 14, fontWeight: "800", color: c.text }}>{fmt(b.additional.total)}</Text></View>
          </View>
          <Pressable testID={`pay-addl-${b.code}`} onPress={() => a.onPayAddl(b)} style={{ marginTop: 12, height: 40, borderRadius: 8, backgroundColor: AMBER[600], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Pay {fmt(b.additional.total)} for additional work</Text></Pressable>
        </View>
      ) : null}
      {b.additional && b.additional.status === "paid" && ["started", "completed", "paid"].includes(b.status) ? <View testID={`addl-paid-${b.code}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}><CheckCircle2 size={16} color={EMERALD[700]} /><Text style={{ fontSize: 12.5, fontWeight: "600", color: isDark ? EMERALD[400] : EMERALD[700] }}>Additional work paid · {fmt(b.additional.total)}</Text></View> : null}

      <PremiumTimeline b={b} open={tlOpen} onToggle={() => setTlOpen((o) => !o)} lastAt={lastAt} />

      {/* Contextual actions */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, alignItems: "center" }}>
        {b.status === "pending_payment" ? <Chip testID={`pay-${b.code}`} icon={Wallet} tone="green" onPress={() => a.onPay(b)} label={b.order_group_id ? "Pay Now · combined order" : `Pay ${fmt(b.pricing?.total)}`} /> : null}
        {assigned ? <Chip testID={`call-${b.code}`} icon={commLocked ? Lock : Phone} tone="primary" onPress={callPartner} disabled={commLocked} label="Call" /> : null}
        {assigned ? <Chip testID={`chat-${b.code}`} icon={commLocked ? Lock : MessageCircle} onPress={chatPartner} disabled={commLocked} label="Chat" right={!commLocked ? <UnreadPill count={unread} testID={`chat-unread-${b.code}`} /> : null} /> : null}
        {assigned || b.status === "searching" ? <Chip testID={`track-${b.code}`} icon={Navigation} onPress={() => a.onTrack(b)} label="Track Live" /> : null}
        <Chip testID={`details-${b.code}`} icon={Info} onPress={() => a.onDetails(b)} label="View Details" />
        {canInvoice ? <Chip testID={`invoice-${b.code}`} icon={FileText} onPress={() => a.onInvoice(b)} label="Invoice" /> : null}
        {canRepeat ? <Chip testID={`repeat-${b.code}`} icon={RefreshCcw} onPress={() => a.onRepeat(b)} label="Book Again" /> : null}
        {canReview ? <Chip testID={`review-${b.code}`} icon={Star} tone="amber" onPress={() => a.onReview(b)} label="Rate" /> : null}
        {canRequestResched ? <Chip testID={`reschedule-${b.code}`} icon={Clock} onPress={() => a.onReschedule(b)} label="Request Reschedule" /> : null}
        {canCancel ? <Chip testID={`cancel-${b.code}`} tone="rose" onPress={() => a.onCancel(b)} label="Cancel" /> : null}
        {b.review ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}><Star size={16} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 14, color: AMBER[600] }}>{b.review.rating}.0 rated</Text></View> : null}
      </View>

      {(b.spare_parts || []).length > 0 && assigned ? (
        <View testID={`spares-${b.code}`} style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: c.borderSoft, paddingTop: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: c.primaryText, marginBottom: 8 }}>Spare parts requested</Text>
          <View style={{ gap: 8 }}>
            {b.spare_parts.map((sp: any) => (
              <View key={sp.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: isDark ? SLATE[800] : SLATE[50], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "500", color: c.text }}>{sp.name} × {sp.quantity}</Text><Text style={{ fontSize: 12, color: SLATE[400] }}>{fmt(sp.total)}{sp.notes ? ` · ${sp.notes}` : ""}</Text></View>
                {sp.status === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Pressable testID={`spare-approve-${sp.id}`} onPress={() => a.onSpare(b, sp.id, "approve")} style={{ height: 28, paddingHorizontal: 8, borderRadius: 6, backgroundColor: EMERALD[600], justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Approve</Text></Pressable>
                    <Pressable testID={`spare-reject-${sp.id}`} onPress={() => a.onSpare(b, sp.id, "reject")} style={{ height: 28, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: c.border, justifyContent: "center" }}><Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "600" }}>Reject</Text></Pressable>
                  </View>
                ) : <StatusChip label={sp.status} tone={sp.status === "approved" ? "green" : "rose"} />}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
