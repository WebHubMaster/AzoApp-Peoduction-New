/** BookingCard + OtpBanner + CurrentStepCard + PremiumTimeline — port of CustomerDashboard.jsx (mobile). */
import React, { useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Wrench, CheckCircle2, X, Copy, KeyRound, User, Phone, Clock, ChevronDown, Wallet, Info, RefreshCcw, Star, AlertTriangle, Lock, Navigation } from "lucide-react-native";
import { PRIMARY, SLATE, EMERALD, ROSE, AMBER } from "../../theme";
import { StatusChip } from "./ux";
import { statusText, statusTone, DONE_STATES, bkDate } from "./nav";
import { fmt } from "../../lib/format";

export const fmtTs = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const relTime = (iso: string) => { const d = Math.max(0, Date.now() - new Date(iso).getTime()); const m = Math.floor(d / 60000); if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; };
const STATUS_RANK: Record<string, number> = { searching: 0, assigned: 1, arrived_shop: 2, arrived_customer: 2, started: 3, completed: 4, paid: 4 };

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

export function OtpBanner({ kind, code, bcode }: { kind: "start" | "complete"; code: string; bcode: string }) {
  const start = kind === "start";
  const c = start ? PRIMARY : EMERALD;
  return (
    <View testID={`otp-banner-${kind}-${bcode}`} style={{ marginTop: 12, borderRadius: 18, padding: 16, borderWidth: 2, borderColor: c[300], backgroundColor: c[50], alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><KeyRound size={14} color={c[700]} /><Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: c[700] }}>{start ? "Share this OTP to START work" : "Share this OTP to COMPLETE work"}</Text></View>
      <Text testID={`otp-code-${kind}-${bcode}`} style={{ fontSize: 36, fontWeight: "900", letterSpacing: 10, color: c[700], marginTop: 6 }}>{code}</Text>
      <Text style={{ fontSize: 12, color: SLATE[500], textAlign: "center" }}>Tell your partner this code only when {start ? "they arrive & begin" : "the work is done"}.</Text>
    </View>
  );
}

export function CurrentStepCard({ b, onCall, commLocked }: { b: any; onCall: () => void; commLocked?: boolean }) {
  const map: Record<string, { t: string; d: string; eta: string }> = {
    assigned: { t: "Partner assigned", d: "Your partner will start heading over soon", eta: "" },
    arrived_shop: { t: "Partner is on the way", d: "Picking up parts & heading to you", eta: "15–20 min" },
    arrived_customer: { t: "Partner has arrived", d: "Share your start OTP to begin", eta: "" },
    started: { t: "Work in progress", d: "Your partner is working on the service", eta: "" },
  };
  const m = map[b.status] || map.assigned;
  return (
    <View testID={`current-step-${b.code}`} style={{ marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: PRIMARY[200], backgroundColor: PRIMARY[50], padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><User size={20} color={PRIMARY[700]} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: PRIMARY[800] }}>{m.t}</Text>
          <Text style={{ fontSize: 12, color: SLATE[500] }}>{b.partner_name ? `${b.partner_name} · ` : ""}{m.d}{m.eta ? ` · ETA ${m.eta}` : ""}</Text>
        </View>
        <Pressable testID={`call-${b.code}`} onPress={onCall} style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: commLocked ? SLATE[200] : PRIMARY[700], alignItems: "center", justifyContent: "center" }}>{commLocked ? <Lock size={16} color={SLATE[500]} /> : <Phone size={16} color="#fff" />}</Pressable>
      </View>
    </View>
  );
}
export function PremiumTimeline({ b, open, onToggle }: { b: any; open: boolean; onToggle: () => void }) {
  const lastAt = (b.timeline || []).filter((t: any) => t?.at).slice(-1)[0]?.at;
  if (b.status === "cancelled") {
    return (
      <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: ROSE[50], borderWidth: 1, borderColor: ROSE[200], paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <X size={16} color={ROSE[600]} /><Text style={{ fontSize: 14, fontWeight: "600", color: ROSE[700], flex: 1 }}>Booking cancelled</Text>{lastAt ? <Text style={{ fontSize: 12, color: ROSE[500] }}>{fmtTs(lastAt)}</Text> : null}
      </View>
    );
  }
  const steps = buildSteps(b);
  const done = b.status === "completed" || b.status === "paid";
  const current = steps.find((s) => s.state === "current") || steps.filter((s) => s.state === "completed").slice(-1)[0];
  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: SLATE[100], paddingTop: 12 }}>
      <Pressable testID={`timeline-toggle-${b.code}`} onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: done ? EMERALD[500] : PRIMARY[600] }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: SLATE[800] }}>{done ? "Work Completed" : current?.title}</Text>
          <Text style={{ fontSize: 11, color: SLATE[400] }}>{current?.desc}{lastAt ? ` · Updated ${relTime(lastAt)}` : ""}</Text>
        </View>
        <Text style={{ fontSize: 12, fontWeight: "600", color: PRIMARY[600] }}>{open ? "Hide" : "View Timeline"}</Text><ChevronDown size={16} color={PRIMARY[600]} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 14 }}>
          {steps.map((s, i) => (
            <View key={s.key} style={{ flexDirection: "row", gap: 12, paddingBottom: i === steps.length - 1 ? 0 : 16, position: "relative" }}>
              {i < steps.length - 1 ? <View style={{ position: "absolute", left: 11, top: 24, bottom: 0, width: 2, backgroundColor: s.state === "completed" ? EMERALD[400] : SLATE[200] }} /> : null}
              <View style={{ height: 24, width: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: s.state === "completed" ? EMERALD[500] : s.state === "current" ? PRIMARY[600] : SLATE[100], zIndex: 1 }}>
                {s.state === "completed" ? <CheckCircle2 size={14} color="#fff" /> : <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: s.state === "current" ? "#fff" : SLATE[300] }} />}
              </View>
              <View style={{ flex: 1, marginTop: -2 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: s.state === "upcoming" ? SLATE[400] : SLATE[800] }}>{s.title}</Text>
                <Text style={{ fontSize: 11, color: SLATE[400] }}>{s.desc}</Text>
                {s.at ? <Text style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{fmtTs(s.at)}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const Chip = ({ testID, icon: Icon, label, onPress, tone = "outline", disabled }: any) => {
  const bg = tone === "primary" ? PRIMARY[700] : tone === "green" ? EMERALD[600] : "#fff";
  const fg = tone === "primary" || tone === "green" ? "#fff" : tone === "rose" ? ROSE[600] : tone === "amber" ? AMBER[600] : SLATE[700];
  const border = tone === "rose" ? ROSE[200] : tone === "amber" ? AMBER[200] : SLATE[200];
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: bg, borderWidth: tone === "primary" || tone === "green" ? 0 : 1, borderColor: border, flexDirection: "row", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1 }}>
      {Icon ? <Icon size={14} color={fg} /> : null}<Text style={{ fontSize: 13, fontWeight: "600", color: fg }}>{label}</Text>
    </Pressable>
  );
};
export type CardActions = {
  onRepeat: (b: any) => void; onCancel: (b: any) => void; onReview: (b: any) => void; onPay: (b: any) => void; onPayAddl: (b: any) => void;
  onSpare: (b: any, partId: string, action: string) => void; onRefresh: () => void; onDetails: (b: any) => void; onReschedule: (b: any) => void; onTrack: (b: any) => void;
  respondResched: (b: any, action: "accept" | "reject") => Promise<void>; cancelResched: (b: any) => Promise<void>; toast: any;
};

export function BookingCard({ b, focus, a }: { b: any; focus?: boolean; a: CardActions }) {
  const [tlOpen, setTlOpen] = useState(false);
  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const pendingReq = b.reschedule_request && b.reschedule_request.status === "pending" ? b.reschedule_request : null;
  const theyRequested = pendingReq && pendingReq.requested_by_role === "partner";
  const canCancel = ["searching", "assigned", "arrived_shop", "arrived_customer"].includes(b.status);
  const canRepeat = DONE_STATES.includes(b.status) || b.status === "cancelled";
  const canReview = DONE_STATES.includes(b.status) && !b.review;
  const addlDue = b.additional && (b.additional.total || 0) > 0 && b.additional.status !== "paid";
  const assigned = ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status);
  const canRequestResched = sched.is_scheduled && !pendingReq && !!b.partner_id && ["assigned", "arrived_shop", "arrived_customer"].includes(b.status);
  const callPartner = () => {
    if (commLocked) { a.toast.info("Call unlocks 30 minutes before your scheduled time"); return; }
    const phone = b.partner_phone || b.partner?.phone;
    if (phone) Linking.openURL(`tel:${String(phone).replace(/\s/g, "")}`); else a.toast.info("Partner contact will be shared once a partner is assigned");
  };
  const paidTone = b.payment_status === "paid" ? EMERALD[600] : b.payment_status === "refunded" ? "#7C3AED" : AMBER[600];
  return (
    <View testID={`booking-card-${b.code}`} style={{ borderRadius: 18, borderWidth: focus ? 2 : 1, borderColor: focus ? PRIMARY[400] : SLATE[200], backgroundColor: "#fff", padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ height: 44, width: 44, borderRadius: 14, backgroundColor: b.status === "cancelled" ? "#e11d48" : "#0D47A1", alignItems: "center", justifyContent: "center" }}>
          {b.status === "cancelled" ? <X size={20} color="#fff" /> : DONE_STATES.includes(b.status) ? <CheckCircle2 size={20} color="#fff" /> : <Wrench size={20} color="#fff" />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: SLATE[900] }}>{b.service_name}</Text>
            <StatusChip testID={`booking-status-${b.code}`} label={statusText(b.status)} tone={statusTone(b.status) as any} />
            {b.payment_status ? <StatusChip label={b.payment_status} tone={b.payment_status === "paid" ? "green" : b.payment_status === "refunded" ? "violet" : "amber"} /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 12, color: SLATE[400] }}>#{b.code}</Text><Copy size={11} color={SLATE[400]} />
            <Text style={{ fontSize: 12, color: SLATE[400] }}>· {b.category_name} · {fmtTs(bkDate(b))}</Text>
            {b.booking_type === "merchant" ? <Text style={{ fontSize: 12, color: PRIMARY[600] }}>· via {b.merchant_name}</Text> : null}
          </View>
          {(b.items || []).length > 1 ? (
            <View testID={`items-${b.code}`} style={{ marginTop: 8, borderRadius: 12, backgroundColor: SLATE[50], borderWidth: 1, borderColor: SLATE[100], paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
              {b.items.map((it: any, i: number) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12.5, color: SLATE[600], flex: 1 }}>{i + 1}. {it.service_name || it.name || it.custom_name}{(it.qty || 1) > 1 ? ` × ${it.qty}` : ""}</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: SLATE[700] }}>{fmt(it.price ?? it.total ?? it.custom_price ?? 0)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 18, fontWeight: "900", color: SLATE[900] }}>{fmt(b.pricing?.total)}</Text>
          <Text style={{ fontSize: 11, fontWeight: "600", color: paidTone }}>{b.payment_status === "paid" ? "Paid" : b.payment_status === "refunded" ? "Refunded" : "Pending"}</Text>
        </View>
      </View>

      {b.otps?.start && ["assigned", "arrived_shop", "arrived_customer"].includes(b.status) ? <OtpBanner kind="start" code={b.otps.start} bcode={b.code} /> : null}
      {b.otps?.completion && b.status === "started" ? <OtpBanner kind="complete" code={b.otps.completion} bcode={b.code} /> : null}
      {assigned ? <CurrentStepCard b={b} onCall={callPartner} commLocked={commLocked} /> : null}
      {assigned || b.status === "searching" ? (
        <Pressable testID={`track-${b.code}`} onPress={() => a.onTrack(b)} style={{ marginTop: 10, height: 44, borderRadius: 12, backgroundColor: PRIMARY[700], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Navigation size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Track Live</Text>
        </Pressable>
      ) : null}
      {pendingReq ? (
        <View testID={`reschedule-pending-${b.code}`} style={{ marginTop: 12, borderRadius: 18, borderWidth: 2, borderColor: AMBER[300], backgroundColor: AMBER[50], padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Clock size={14} color={AMBER[700]} /><Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: AMBER[700] }}>Reschedule request · pending</Text></View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.7)", padding: 10 }}><Text style={{ fontSize: 10, fontWeight: "700", color: SLATE[400], textTransform: "uppercase" }}>Current schedule</Text><Text style={{ fontSize: 13, fontWeight: "700", color: SLATE[700] }}>{pendingReq.old_date}</Text><Text style={{ fontSize: 13, fontWeight: "700", color: SLATE[700] }}>{pendingReq.old_time}</Text></View>
            <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.7)", padding: 10, borderWidth: 1, borderColor: AMBER[200] }}><Text style={{ fontSize: 10, fontWeight: "700", color: AMBER[500], textTransform: "uppercase" }}>New request</Text><Text style={{ fontSize: 13, fontWeight: "900", color: AMBER[700] }}>{pendingReq.new_date}</Text><Text style={{ fontSize: 13, fontWeight: "900", color: AMBER[700] }}>{pendingReq.new_time}</Text></View>
          </View>
          {theyRequested ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable testID={`reschedule-accept-${b.code}`} onPress={() => a.respondResched(b, "accept")} style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: EMERALD[600], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Accept reschedule</Text></Pressable>
              <Pressable testID={`reschedule-reject-${b.code}`} onPress={() => a.respondResched(b, "reject")} style={{ flex: 1, height: 40, borderRadius: 20, borderWidth: 1, borderColor: ROSE[200], alignItems: "center", justifyContent: "center" }}><Text style={{ color: ROSE[600], fontWeight: "700" }}>Reject</Text></Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: AMBER[700] }}>Waiting for your partner to accept.</Text>
              <Pressable testID={`reschedule-withdraw-${b.code}`} onPress={() => a.cancelResched(b)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: SLATE[200] }}><Text style={{ fontSize: 13, fontWeight: "600", color: SLATE[700], lineHeight: 32 }}>Withdraw</Text></Pressable>
            </View>
          )}
        </View>
      ) : null}

      {addlDue ? (
        <View testID={`addl-pending-${b.code}`} style={{ marginTop: 12, borderRadius: 14, borderWidth: 2, borderColor: AMBER[300], backgroundColor: AMBER[50], padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><AlertTriangle size={15} color={AMBER[700]} /><Text style={{ fontSize: 14, fontWeight: "800", color: AMBER[700] }}>Additional work payment pending</Text></View>
          <Text style={{ fontSize: 12.5, color: AMBER[700], marginTop: 4 }}>Your partner added extra work/parts. The job finishes only after the additional payment.</Text>
          <View style={{ marginTop: 8, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 10, padding: 10, gap: 4 }}>
            {(b.additional.items || []).map((it: any) => <View key={it.id} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 12.5, color: SLATE[700] }}>{it.description}{it.labour_charge > 0 ? " (+ labour)" : ""}</Text><Text style={{ fontSize: 12.5, fontWeight: "600", color: SLATE[700] }}>{fmt((Number(it.part_charge) || 0) + (Number(it.labour_charge) || 0))}</Text></View>)}
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: SLATE[200], paddingTop: 4 }}><Text style={{ fontSize: 14, fontWeight: "800", color: SLATE[900] }}>Additional total</Text><Text style={{ fontSize: 14, fontWeight: "800", color: SLATE[900] }}>{fmt(b.additional.total)}</Text></View>
          </View>
          <Pressable testID={`pay-addl-${b.code}`} onPress={() => a.onPayAddl(b)} style={{ marginTop: 12, height: 42, borderRadius: 10, backgroundColor: AMBER[600], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Pay {fmt(b.additional.total)} for additional work</Text></Pressable>
        </View>
      ) : null}
      {b.additional && b.additional.status === "paid" && ["started", "completed", "paid"].includes(b.status) ? <View testID={`addl-paid-${b.code}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}><CheckCircle2 size={14} color={EMERALD[700]} /><Text style={{ fontSize: 12.5, fontWeight: "600", color: EMERALD[700] }}>Additional work paid · {fmt(b.additional.total)}</Text></View> : null}

      <PremiumTimeline b={b} open={tlOpen} onToggle={() => setTlOpen((o) => !o)} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
        {b.status === "pending_payment" && <Chip testID={`pay-${b.code}`} icon={Wallet} tone="green" onPress={() => a.onPay(b)} label={b.order_group_id ? "Pay Now · combined order" : `Pay ${fmt(b.pricing?.total)}`} />}
        {assigned && <Chip testID={`call-btn-${b.code}`} icon={commLocked ? Lock : Phone} tone="primary" onPress={callPartner} label={commLocked ? "Call locked" : "Call Partner"} />}
        <Chip testID={`details-${b.code}`} icon={Info} onPress={() => a.onDetails(b)} label="View Details" />
        {canRepeat && <Chip testID={`repeat-${b.code}`} icon={RefreshCcw} onPress={() => a.onRepeat(b)} label="Book Again" />}
        {canReview && <Chip testID={`review-${b.code}`} icon={Star} onPress={() => a.onReview(b)} label="Rate" tone="amber" />}
        {canRequestResched && <Chip testID={`reschedule-${b.code}`} icon={Clock} onPress={() => a.onReschedule(b)} label="Request Reschedule" />}
        {canCancel && <Chip testID={`cancel-${b.code}`} onPress={() => a.onCancel(b)} label="Cancel" tone="rose" />}
        {b.review ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}><Star size={14} color={AMBER[500]} fill={AMBER[500]} /><Text style={{ fontSize: 13, color: AMBER[600] }}>{b.review.rating}.0 rated</Text></View> : null}
      </View>

      {(b.spare_parts || []).length > 0 && assigned ? (
        <View testID={`spares-${b.code}`} style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: SLATE[100], paddingTop: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: PRIMARY[700], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Spare parts requested</Text>
          {b.spare_parts.map((sp: any) => (
            <View key={sp.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: SLATE[50], borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 }}>
              <View><Text style={{ fontSize: 14, fontWeight: "500", color: SLATE[800] }}>{sp.name} × {sp.quantity}</Text><Text style={{ fontSize: 12, color: SLATE[400] }}>{fmt(sp.total)}{sp.notes ? ` · ${sp.notes}` : ""}</Text></View>
              {sp.status === "pending" ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pressable testID={`spare-approve-${sp.id}`} onPress={() => a.onSpare(b, sp.id, "approve")} style={{ height: 28, paddingHorizontal: 10, borderRadius: 8, backgroundColor: EMERALD[600], justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Approve</Text></Pressable>
                  <Pressable onPress={() => a.onSpare(b, sp.id, "reject")} style={{ height: 28, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: SLATE[200], justifyContent: "center" }}><Text style={{ color: ROSE[600], fontSize: 12, fontWeight: "700" }}>Reject</Text></Pressable>
                </View>
              ) : <StatusChip label={sp.status} tone={sp.status === "approved" ? "green" : "rose"} />}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
