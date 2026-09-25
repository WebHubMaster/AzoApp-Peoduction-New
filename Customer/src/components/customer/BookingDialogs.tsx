/** Booking dialogs — Cancel (with cancellation-preview), Review, Reschedule request, Details, Additional-work pay. */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { X, Star } from "lucide-react-native";
import { PRIMARY, SLATE, EMERALD, ROSE, AMBER } from "../../theme";
import { api } from "../../api/client";
import { fmt } from "../../lib/format";
import { statusText } from "./nav";
import { fmtTs } from "./BookingCard";

export const CANCEL_REASONS = ["Booked by mistake", "Found a better price elsewhere", "Service no longer needed", "Partner is taking too long", "Scheduling / timing issue", "Want to change the service or address"];

export function Sheet({ open, title, onClose, children, footer, testID }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; testID?: string }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View testID={testID} style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%", paddingBottom: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, paddingBottom: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>{title}</Text>
            <Pressable testID={`${testID || "sheet"}-close`} onPress={onClose} style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" }}><X size={18} color={SLATE[600]} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>{children}</ScrollView>
          {footer ? <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const Btn = ({ label, onPress, tone = "primary", disabled, testID }: any) => (
  <Pressable testID={testID} onPress={onPress} disabled={disabled} style={{ height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tone === "rose" ? ROSE[600] : tone === "amber" ? AMBER[600] : tone === "outline" ? "#fff" : PRIMARY[700], borderWidth: tone === "outline" ? 1 : 0, borderColor: SLATE[200], opacity: disabled ? 0.5 : 1, flex: 1 }}>
    <Text style={{ color: tone === "outline" ? SLATE[700] : "#fff", fontWeight: "700", fontSize: 15 }}>{label}</Text>
  </Pressable>
);

export function CancelDialog({ booking, reasons, onClose, onConfirm }: { booking: any; reasons?: string[]; onClose: () => void; onConfirm: (b: any, reason: string) => Promise<void> }) {
  const list = [...((reasons && reasons.length) ? reasons : CANCEL_REASONS), "Other"];
  const [reason, setReason] = useState(""); const [other, setOther] = useState(""); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null); const [pv, setPv] = useState(false);
  useEffect(() => {
    if (!booking) return;
    setReason(""); setOther(""); setPreview(null); setPv(true);
    api.get<any>(`/bookings/${booking.id}/cancellation-preview`).then(setPreview).catch(() => setPreview(null)).finally(() => setPv(false));
  }, [booking]);
  if (!booking) return null;
  const finalReason = reason === "Other" ? other.trim() : reason;
  return (
    <Sheet open={!!booking} title="Cancel booking?" onClose={onClose} testID="cancel-dialog"
      footer={<View style={{ flexDirection: "row", gap: 10 }}><Btn label="Keep booking" tone="outline" onPress={onClose} /><Btn testID="cancel-confirm" label={busy ? "Cancelling…" : "Cancel booking"} tone="rose" disabled={!finalReason || busy} onPress={async () => { setBusy(true); try { await onConfirm(booking, finalReason); } finally { setBusy(false); } }} /></View>}>
      <Text style={{ fontSize: 13, color: SLATE[500] }}>#{booking.code} · {booking.service_name}</Text>
      {pv ? <ActivityIndicator color={PRIMARY[700]} style={{ marginVertical: 12 }} /> : preview ? (
        <View testID="cancel-preview" style={{ marginTop: 12, borderRadius: 14, backgroundColor: preview.fee > 0 ? AMBER[50] : EMERALD[50], borderWidth: 1, borderColor: preview.fee > 0 ? AMBER[200] : EMERALD[200], padding: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: SLATE[900] }}>{preview.fee > 0 ? `Cancellation fee ${fmt(preview.fee)}` : "Free cancellation"}</Text>
          {preview.refund_amount != null ? <Text style={{ fontSize: 13, color: SLATE[600], marginTop: 2 }}>Refund: {fmt(preview.refund_amount)} {preview.refund_to ? `→ ${preview.refund_to}` : ""}</Text> : null}
          {preview.message ? <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 4 }}>{preview.message}</Text> : null}
        </View>
      ) : null}
      <Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[400], textTransform: "uppercase", letterSpacing: 0.8, marginTop: 16, marginBottom: 8 }}>Reason</Text>
      {list.map((r) => (
        <Pressable key={r} testID={`cancel-reason-${r.replace(/\W+/g, "-").toLowerCase()}`} onPress={() => setReason(r)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}>
          <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: reason === r ? PRIMARY[600] : SLATE[300], alignItems: "center", justifyContent: "center" }}>{reason === r ? <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: PRIMARY[600] }} /> : null}</View>
          <Text style={{ fontSize: 14, color: SLATE[800] }}>{r}</Text>
        </Pressable>
      ))}
      {reason === "Other" ? <TextInput testID="cancel-other" value={other} onChangeText={setOther} placeholder="Tell us more…" style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 12, fontSize: 14, marginTop: 6 }} /> : null}
    </Sheet>
  );
}
export function ReviewDialog({ booking, onClose, onSubmit }: { booking: any; onClose: () => void; onSubmit: (b: any, stars: number, cmt: string) => Promise<void> }) {
  const [stars, setStars] = useState(5); const [cmt, setCmt] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setStars(5); setCmt(""); }, [booking]);
  if (!booking) return null;
  return (
    <Sheet open={!!booking} title="Rate your experience" onClose={onClose} testID="review-dialog"
      footer={<Btn testID="review-submit" label={busy ? "Submitting…" : "Submit review"} disabled={busy} onPress={async () => { setBusy(true); try { await onSubmit(booking, stars, cmt); } finally { setBusy(false); } }} />}>
      <Text style={{ fontSize: 13, color: SLATE[500] }}>{booking.service_name} · {booking.partner_name || "Partner"}</Text>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginVertical: 18 }}>
        {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} testID={`review-star-${n}`} onPress={() => setStars(n)}><Star size={36} color={AMBER[500]} fill={n <= stars ? AMBER[500] : "transparent"} /></Pressable>)}
      </View>
      <TextInput testID="review-comment" value={cmt} onChangeText={setCmt} placeholder="Share a few words about the service (optional)" multiline style={{ minHeight: 90, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], padding: 12, fontSize: 14, textAlignVertical: "top" }} />
    </Sheet>
  );
}

export function RescheduleDialog({ booking, onClose, onDone, toast }: { booking: any; onClose: () => void; onDone: () => void; toast: any }) {
  const [date, setDate] = useState(""); const [time, setTime] = useState("10:00"); const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + 1 + i); return d.toISOString().slice(0, 10); });
  const times = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
  useEffect(() => { setDate(days[0]); setTime("10:00"); }, [booking]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!booking) return null;
  const submit = async () => {
    setBusy(true);
    try { await api.post(`/bookings/${booking.id}/reschedule/request`, { scheduled_at: `${date}T${time}:00` }); toast.success("Reschedule requested — waiting for partner"); onDone(); onClose(); }
    catch (e: any) { toast.error(e?.message || "Could not request reschedule"); } finally { setBusy(false); }
  };
  const pill = (v: string, on: boolean, cb: () => void, id: string) => (
    <Pressable key={v} testID={id} onPress={cb} style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: on ? PRIMARY[600] : SLATE[200], backgroundColor: on ? PRIMARY[50] : "#fff", justifyContent: "center" }}><Text style={{ fontSize: 13, fontWeight: "600", color: on ? PRIMARY[700] : SLATE[700] }}>{v}</Text></Pressable>
  );
  return (
    <Sheet open={!!booking} title="Request reschedule" onClose={onClose} testID="reschedule-dialog" footer={<Btn testID="reschedule-submit" label={busy ? "Sending…" : "Send request"} disabled={busy || !date} onPress={submit} />}>
      <Text style={{ fontSize: 13, color: SLATE[500] }}>Your partner must accept the new time. Current: {fmtTs(booking.scheduled_at)}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[400], textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14, marginBottom: 8 }}>New date</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{days.map((d) => pill(new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), d === date, () => setDate(d), `resched-day-${d}`))}</View>
      <Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[400], textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14, marginBottom: 8 }}>New time</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{times.map((t) => pill(t, t === time, () => setTime(t), `resched-time-${t}`))}</View>
    </Sheet>
  );
}

const DRow = ({ k, v, strong }: { k: string; v: any; strong?: boolean }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 }}><Text style={{ fontSize: 13, color: SLATE[500] }}>{k}</Text><Text style={{ fontSize: 13, fontWeight: strong ? "800" : "600", color: SLATE[900], textAlign: "right", flexShrink: 1 }}>{v ?? "—"}</Text></View>
);

export function DetailsSheet({ booking, onClose }: { booking: any; onClose: () => void }) {
  if (!booking) return null;
  const b = booking; const p = b.pricing || {}; const ad = b.address || {};
  return (
    <Sheet open={!!booking} title={`Booking #${b.code}`} onClose={onClose} testID="details-sheet">
      <Text style={{ fontSize: 12, fontWeight: "700", color: PRIMARY[700], textTransform: "uppercase", letterSpacing: 0.8 }}>Service</Text>
      <DRow k="Service" v={b.service_name} /><DRow k="Category" v={b.category_name} /><DRow k="Status" v={statusText(b.status)} /><DRow k="Scheduled" v={fmtTs(b.scheduled_at)} /><DRow k="Booked on" v={fmtTs(b.created_at)} />
      {(b.addons || []).length ? <DRow k="Add-ons" v={b.addons.map((a: any) => a.name || a).join(", ")} /> : null}
      <Text style={{ fontSize: 12, fontWeight: "700", color: PRIMARY[700], textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14 }}>Partner</Text>
      <DRow k="Name" v={b.partner_name || "Not assigned yet"} />{b.partner_phone ? <DRow k="Phone" v={b.partner_phone} /> : null}
      <Text style={{ fontSize: 12, fontWeight: "700", color: PRIMARY[700], textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14 }}>Address</Text>
      <DRow k="Address" v={[ad.line || ad.address, ad.landmark, ad.city, ad.pincode].filter(Boolean).join(", ")} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: PRIMARY[700], textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14 }}>Payment</Text>
      <DRow k="Services" v={fmt(p.subtotal ?? p.base ?? 0)} />{p.addons_total ? <DRow k="Add-ons" v={fmt(p.addons_total)} /> : null}{p.visit_fee ? <DRow k="Visiting charge" v={fmt(p.visit_fee)} /> : null}{p.emergency_fee ? <DRow k="Emergency fee" v={fmt(p.emergency_fee)} /> : null}{p.discount ? <DRow k={`Discount${b.coupon_code ? ` (${b.coupon_code})` : ""}`} v={`- ${fmt(p.discount)}`} /> : null}{p.membership_discount ? <DRow k="Member savings" v={`- ${fmt(p.membership_discount)}`} /> : null}<DRow k="GST" v={fmt(p.tax ?? p.gst ?? 0)} /><DRow k="Total" v={fmt(p.total)} strong /><DRow k="Payment status" v={b.payment_status} />{b.payment_method ? <DRow k="Method" v={b.payment_method} /> : null}
    </Sheet>
  );
}

export function AdditionalPayDialog({ booking, onClose, onPay, walletBalance }: { booking: any; onClose: () => void; onPay: (b: any, method: "online" | "wallet") => Promise<void>; walletBalance: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!booking) return null;
  const total = Number(booking.additional?.total || 0);
  const go = async (m: "online" | "wallet") => { setBusy(m); try { await onPay(booking, m); onClose(); } finally { setBusy(null); } };
  return (
    <Sheet open={!!booking} title="Pay for additional work" onClose={onClose} testID="addl-dialog"
      footer={<View style={{ flexDirection: "row", gap: 10 }}><Btn testID="addl-pay-wallet" tone="outline" label={busy === "wallet" ? "Paying…" : `Wallet (${fmt(walletBalance)})`} disabled={!!busy || walletBalance < total} onPress={() => go("wallet")} /><Btn testID="addl-pay-online" tone="amber" label={busy === "online" ? "Paying…" : `Pay ${fmt(total)} online`} disabled={!!busy} onPress={() => go("online")} /></View>}>
      {(booking.additional?.items || []).map((it: any) => <DRow key={it.id} k={it.description} v={fmt((Number(it.part_charge) || 0) + (Number(it.labour_charge) || 0))} />)}
      <DRow k="Additional total" v={fmt(total)} strong />
    </Sheet>
  );
}
