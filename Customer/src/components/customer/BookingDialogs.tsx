/** Booking dialogs — ports of CancelDialog, ReviewDialog, AdditionalPayDialog, RescheduleDrawer + DrawerShell (CustomerDashboard.jsx). */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Star, AlertTriangle, Wallet, Wrench } from "lucide-react-native";
import { PRIMARY, SLATE, EMERALD, AMBER, useTheme } from "../../theme";
import { api } from "../../api/client";
import { fmt } from "../../lib/format";
import { fmtTs } from "./BookingCard";
import { SchedulePicker } from "./SchedulePicker";

export const CANCEL_REASONS = ["Booked by mistake", "Found a better price elsewhere", "Service no longer needed", "Partner is taking too long", "Scheduling / timing issue", "Want to change the service or add-ons"];

/* Web DrawerShell: full-height panel (mobile w-full h-full) with sticky header, scroll body, footer */
export function DrawerShell({ open, onClose, title, children, footer, testID }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; testID?: string }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <Pressable style={{ height: insets.top + 24 }} onPress={onClose} />
        <View testID={testID} style={{ flex: 1, backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }}>{title}</Text>
            <Pressable testID={testID ? `${testID}-close` : undefined} onPress={onClose} style={{ height: 36, width: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: isDark ? SLATE[800] : SLATE[100] }}><X size={20} color={SLATE[400]} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={{ padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: c.borderSoft }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/* Web Dialog (centered modal card) */
export function CenterDialog({ open, onClose, children, testID }: { open: boolean; onClose: () => void; children: React.ReactNode; testID?: string }) {
  const { c } = useTheme();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.6)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Pressable style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} onPress={onClose} />
          <View testID={testID} style={{ width: "100%", maxWidth: 448, maxHeight: "92%", backgroundColor: c.surface, borderRadius: 16, overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const Btn = ({ label, onPress, tone = "primary", disabled, testID, icon: Icon, style }: any) => {
  const { c, isDark } = useTheme();
  const bg = tone === "red" ? "#DC2626" : tone === "amber" ? AMBER[600] : tone === "outline" ? c.surface : PRIMARY[700];
  const fg = tone === "outline" ? c.text : "#fff";
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} style={({ pressed }) => [{ height: 40, paddingHorizontal: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: bg, borderWidth: tone === "outline" ? 1 : 0, borderColor: isDark ? SLATE[700] : SLATE[200], opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
      {Icon ? <Icon size={16} color={fg} /> : null}<Text style={{ color: fg, fontWeight: "600", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
};
const Title = ({ t, d }: { t: string; d?: string }) => { const { c } = useTheme(); return <View style={{ gap: 6 }}><Text style={{ fontSize: 18, fontWeight: "600", color: c.text }}>{t}</Text>{d ? <Text style={{ fontSize: 14, color: c.textMuted }}>{d}</Text> : null}</View>; };
const Row = ({ k, v, muted, small }: { k: string; v: string; muted?: boolean; small?: boolean }) => {
  const { c, isDark } = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Text style={{ flex: 1, fontSize: small ? 12 : 14, color: muted ? SLATE[400] : c.textMuted }}>{k}</Text><Text style={{ fontSize: small ? 12 : 14, fontWeight: muted ? "400" : "500", color: muted ? SLATE[400] : (isDark ? SLATE[200] : SLATE[700]) }}>{v}</Text></View>;
};

export function CancelDialog({ booking, reasons, onClose, onConfirm }: { booking: any; reasons?: string[]; onClose: () => void; onConfirm: (b: any, reason: string) => Promise<void> }) {
  const { c, isDark } = useTheme();
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
  const submit = async () => { if (!finalReason) return; setBusy(true); try { await onConfirm(booking, finalReason); } finally { setBusy(false); } };
  const assigned = !!preview?.partner_was_assigned;
  return (
    <CenterDialog open={!!booking} onClose={onClose} testID="cancel-dialog">
      <Title t={`Cancel booking #${booking.code}?`} d="Review your refund breakdown, then tell us why you're cancelling." />
      <View testID="cancel-breakdown" style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: isDark ? "rgba(30,41,59,0.5)" : SLATE[50], padding: 14 }}>
        {pv ? <Text style={{ fontSize: 12, color: SLATE[400], textAlign: "center", paddingVertical: 8 }}>Calculating your refund…</Text> : null}
        {!pv && preview ? (
          <View style={{ gap: 6 }}>
            <View style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4, backgroundColor: assigned ? (isDark ? "rgba(120,53,15,0.2)" : AMBER[50]) : (isDark ? "rgba(6,78,59,0.2)" : EMERALD[50]) }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: assigned ? (isDark ? AMBER[300] : AMBER[700]) : (isDark ? EMERALD[300] : EMERALD[700]) }}>{preview.reason}</Text>
            </View>
            <Row k="Original amount" v={fmt(preview.original_amount)} />
            {assigned ? <><Row k={`Service refund (${preview.refund_pct || 0}% of ${fmt(preview.service_amount)})`} v={fmt(preview.service_refund)} /><Row k={`Est. Govt. Taxes refund (${preview.refund_pct || 0}% of ${fmt(preview.tax)})`} v={fmt(preview.gst_refund)} /></> : null}
            {Number(preview.retained_from_you) > 0 ? <Row k="Cancellation charge" v={`- ${fmt(preview.retained_from_you)}`} muted /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: isDark ? SLATE[200] : SLATE[700] }}>You'll get back</Text>
              <Text testID="cancel-refund-amount" style={{ fontSize: 16, fontWeight: "800", color: isDark ? EMERALD[400] : EMERALD[600] }}>{fmt(preview.refund)}</Text>
            </View>
            {(preview.item_refunds || []).length > 1 ? <View style={{ paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderStyle: "dashed", borderTopColor: c.border, gap: 4 }}>{preview.item_refunds.map((it: any, i: number) => <Row key={i} k={`${it.service_name}${it.qty > 1 ? ` ×${it.qty}` : ""}`} v={fmt(it.refund)} small />)}</View> : null}
          </View>
        ) : null}
        {!pv && !preview ? <Text style={{ fontSize: 12, color: SLATE[400], textAlign: "center", paddingVertical: 8 }}>A refund applies as per our cancellation policy.</Text> : null}
      </View>
      <View style={{ gap: 8 }}>
        {list.map((r) => {
          const on = reason === r;
          return (
            <Pressable key={r} testID={`cancel-reason-${r.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} onPress={() => setReason(r)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: on ? 2 : 1, borderColor: on ? PRIMARY[500] : c.border, backgroundColor: on ? (isDark ? "rgba(7,52,115,0.3)" : PRIMARY[50]) : "transparent" }}>
              <Text style={{ fontSize: 14, fontWeight: on ? "500" : "400", color: on ? c.primaryText : (isDark ? SLATE[300] : SLATE[600]) }}>{r}</Text>
            </Pressable>
          );
        })}
        {reason === "Other" ? <TextInput autoFocus testID="cancel-reason-other-input" value={other} onChangeText={setOther} placeholder="Tell us a bit more…" placeholderTextColor={SLATE[400]} style={{ height: 40, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, fontSize: 14, color: c.text, marginTop: 4 }} /> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <Btn label="Keep booking" tone="outline" onPress={onClose} testID="cancel-keep" />
        <Btn testID="cancel-confirm" label={busy ? "Cancelling…" : "Confirm cancellation"} tone="red" disabled={busy || !finalReason} onPress={submit} />
      </View>
    </CenterDialog>
  );
}

export function ReviewDialog({ booking, onClose, onSubmit }: { booking: any; onClose: () => void; onSubmit: (b: any, stars: number, cmt: string) => Promise<void> }) {
  const { c } = useTheme();
  const [stars, setStars] = useState(5); const [cmt, setCmt] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setStars(5); setCmt(""); }, [booking]);
  if (!booking) return null;
  return (
    <CenterDialog open={!!booking} onClose={onClose} testID="review-dialog">
      <Title t="Rate your service" d={`How was your experience${booking.partner_name ? ` with ${booking.partner_name}` : ""}?`} />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 4, marginVertical: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} testID={`star-${n}`} onPress={() => setStars(n)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 1.1 : 1 }] })}><Star size={36} color={n <= stars ? AMBER[400] : SLATE[300]} fill={n <= stars ? AMBER[400] : "transparent"} /></Pressable>)}
      </View>
      <TextInput testID="review-comment" value={cmt} onChangeText={setCmt} placeholder="Add a comment (optional)" placeholderTextColor={SLATE[400]} style={{ height: 40, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, fontSize: 14, color: c.text }} />
      <Btn testID="submit-review" label={busy ? "Submitting…" : "Submit Review"} disabled={busy} onPress={async () => { setBusy(true); try { await onSubmit(booking, stars, cmt); } finally { setBusy(false); } }} style={{ marginTop: 4 }} />
    </CenterDialog>
  );
}

export function AdditionalPayDialog({ booking, onClose, onPay, walletBalance }: { booking: any; onClose: () => void; onPay: (b: any, method: "online" | "wallet") => Promise<void>; walletBalance: number }) {
  const { c, isDark } = useTheme();
  const [busy, setBusy] = useState(false);
  if (!booking || !booking.additional) return null;
  const a = booking.additional;
  const canWallet = (walletBalance || 0) >= (a.total || 0);
  const run = async (m: "online" | "wallet") => { setBusy(true); try { await onPay(booking, m); } finally { setBusy(false); onClose(); } };
  return (
    <Modal visible={!!booking} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.5)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Pressable style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} onPress={onClose} />
        <View testID="addl-pay-dialog" style={{ width: "100%", maxWidth: 448, backgroundColor: c.surface, borderRadius: 16, overflow: "hidden" }}>
          <View style={{ backgroundColor: AMBER[500], paddingHorizontal: 20, paddingVertical: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><AlertTriangle size={20} color="#fff" /><Text style={{ fontSize: 18, fontWeight: "800", color: "#fff" }}>Additional work payment</Text></View>
            <Text style={{ fontSize: 12.5, color: AMBER[50], marginTop: 2 }}>Complete this payment so the partner can finish the job.</Text>
          </View>
          <View style={{ padding: 20 }}>
            <View style={{ gap: 6, backgroundColor: isDark ? SLATE[800] : SLATE[50], borderRadius: 12, padding: 12 }}>
              {(a.items || []).map((it: any) => <View key={it.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={{ fontSize: 14, color: isDark ? SLATE[200] : SLATE[700], flex: 1 }}>{it.description}</Text><Text style={{ fontSize: 14, fontWeight: "600", color: isDark ? SLATE[200] : SLATE[700] }}>{fmt((Number(it.part_charge) || 0) + (Number(it.labour_charge) || 0))}</Text></View>)}
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 6, borderTopWidth: 1, borderTopColor: c.border }}><Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>Total payable</Text><Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>{fmt(a.total)}</Text></View>
            </View>
            <View style={{ marginTop: 16, gap: 8 }}>
              <Btn testID="addl-pay-online" tone="amber" disabled={busy} onPress={() => run("online")} label={busy ? "Processing…" : `Pay ${fmt(a.total)} now`} />
              <Btn testID="addl-pay-wallet" tone="outline" icon={Wallet} disabled={busy || !canWallet} onPress={() => run("wallet")} label={canWallet ? `Pay from Wallet (${fmt(walletBalance)})` : "Insufficient wallet balance"} />
              <Pressable onPress={onClose} style={{ paddingVertical: 8, alignItems: "center" }}><Text style={{ fontSize: 14, color: SLATE[500] }}>Cancel</Text></Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function RescheduleDialog({ booking, onClose, onDone, toast }: { booking: any; onClose: () => void; onDone: () => void; toast: any }) {
  const { c } = useTheme();
  const [val, setVal] = useState<string | null>(booking?.scheduled_at || null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (booking) setVal(booking.scheduled_at ? String(booking.scheduled_at).slice(0, 16) : null); }, [booking]);
  if (!booking) return null;
  const save = async () => {
    if (!val) return toast.error("Pick a new date & time slot");
    setBusy(true);
    try { await api.post(`/bookings/${booking.id}/reschedule/request`, { scheduled_at: val }); toast.success("Reschedule request sent to your partner"); onDone(); onClose(); }
    catch (e: any) { toast.error(e?.message || "Could not send request"); }
    setBusy(false);
  };
  return (
    <DrawerShell open={!!booking} onClose={onClose} title="Request reschedule" testID="reschedule-dialog"
      footer={<Btn testID={`reschedule-confirm-${booking.code}`} label={busy ? "Sending…" : "Send reschedule request"} disabled={busy} onPress={save} style={{ height: 44, borderRadius: 12 }} />}>
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: "#0D47A1", alignItems: "center", justifyContent: "center" }}><Wrench size={20} color="#fff" /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{booking.service_name}</Text><Text style={{ fontSize: 12, color: SLATE[400] }}>#{booking.code}{booking.scheduled_at ? ` · currently ${fmtTs(booking.scheduled_at)}` : ""}</Text></View>
      </View>
      <Text style={{ fontSize: 12.5, color: c.textMuted }}>Pick a new time slot below. Your booking stays on its current time until your <Text style={{ fontWeight: "700" }}>partner accepts</Text> the change.</Text>
      <SchedulePicker value={val} onChange={setVal} />
    </DrawerShell>
  );
}
