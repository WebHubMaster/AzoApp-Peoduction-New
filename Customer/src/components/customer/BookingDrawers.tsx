import { TC } from "@/src/theme";
/** BookingDetailsDrawer + InvoiceDrawer + WorkProof — ports from CustomerDashboard.jsx / WorkProof.jsx. */
import { HelpSOS } from "./HelpSOS";
import React, { useState } from "react";
import { View, Text, Pressable, Modal, Linking } from "react-native";
import { Image } from "expo-image";
import { Wrench, Package, Camera, User, CreditCard, MapPin, AlertTriangle, FileText, MessageCircle, Download, X, ChevronLeft, ChevronRight, ImageOff, ShieldCheck, Navigation } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PRIMARY, SLATE, EMERALD, ROSE, useTheme } from "../../theme";
import { api, mediaUrl } from "../../api/client";
import { useSiteConfig } from "../../context/BrandContext";
import { fmt } from "../../lib/format";
import { statusText } from "./nav";
import { downloadInvoicePdf, openLocalFile, shareInvoicePdf } from "../../lib/invoiceActions";
import { fmtTs } from "./BookingCard";
import { DrawerShell, Btn } from "./BookingDialogs";
import { ServiceBreakdown } from "./ServiceBreakdown";
import { LiveTrackCard } from "./LiveTrackCard";
import { InlineVideo, isVideoUrl } from "../InlineVideo";
import { PlayCircle, Navigation as NavIcon } from "lucide-react-native";

export const DRow = ({ k, v, strong }: { k: string; v: any; strong?: boolean }) => {
  const { c, isDark } = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Text style={{ fontSize: 14, color: c.textMuted }}>{k}</Text><Text style={{ fontSize: 14, fontWeight: strong ? "700" : "400", color: strong ? c.text : (isDark ? SLATE[200] : SLATE[700]), textAlign: "right", flexShrink: 1 }}>{v ?? "—"}</Text></View>;
};
export const DBlock = ({ icon: Icon, title, children }: { icon?: any; title: string; children: React.ReactNode }) => {
  const { c } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>{Icon ? <Icon size={14} color={TC.textFaint} /> : null}<Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", color: TC.textFaint }}>{title}</Text></View>
      <View style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 }}>{children}</View>
    </View>
  );
};
const Sep = () => { const { c } = useTheme(); return <View style={{ borderTopWidth: 1, borderTopColor: c.borderSoft, paddingTop: 8 }} />; };

/* ---------- Work proof (before/after) with lightbox ---------- */
const norm = (x: any) => (typeof x === "string" ? x : x?.url || x?.image || "");
function PhotoGrid({ images, title, testID }: { images: string[]; title: string; testID: string }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(-1);
  const i = Math.min(Math.max(open, 0), images.length - 1);
  return (
    <View testID={testID}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {images.map((u, idx) => <Pressable key={idx} testID={`${testID}-img-${idx}`} onPress={() => setOpen(idx)} style={{ height: 64, width: 64, borderRadius: 6, overflow: "hidden", backgroundColor: isDark ? SLATE[800] : TC.surfaceAlt, borderWidth: 1, borderColor: c.border }}>{isVideoUrl(u) ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" }}><PlayCircle size={24} color="#fff" /></View> : <Image source={{ uri: mediaUrl(u) }} style={{ height: 64, width: 64 }} contentFit="cover" />}</Pressable>)}
      </View>
      <Modal visible={open >= 0} transparent animationType="fade" onRequestClose={() => setOpen(-1)}>
        <View testID="workproof-lightbox" style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, marginTop: insets.top + 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>{title} <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "400" }}>· {i + 1}/{images.length}</Text></Text>
            <Pressable testID="lightbox-close" onPress={() => setOpen(-1)} style={{ height: 36, width: 36, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}><X size={20} color="#fff" /></Pressable>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingBottom: insets.bottom + 16 }}>
            {open >= 0 ? (isVideoUrl(images[i]) ? <InlineVideo testID="lightbox-video" uri={mediaUrl(images[i]) || images[i]} /> : <Image testID="lightbox-image" source={{ uri: mediaUrl(images[i]) }} style={{ width: "100%", height: "100%", borderRadius: 6 }} contentFit="contain" />) : null}
            {images.length > 1 ? <>
              <Pressable testID="lightbox-prev" disabled={i === 0} onPress={() => setOpen(Math.max(i - 1, 0))} style={{ position: "absolute", left: 8, height: 40, width: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}><ChevronLeft size={20} color="#fff" /></Pressable>
              <Pressable testID="lightbox-next" disabled={i === images.length - 1} onPress={() => setOpen(Math.min(i + 1, images.length - 1))} style={{ position: "absolute", right: 8, height: 40, width: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", opacity: i === images.length - 1 ? 0.3 : 1 }}><ChevronRight size={20} color="#fff" /></Pressable>
            </> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
function ProofBlock({ label, imgs, testID }: { label: string; imgs: string[]; testID: string }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}><Camera size={12} color={TC.textFaint} /><Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: TC.textFaint }}>{label}</Text><Text style={{ fontSize: 11, fontWeight: "600", color: EMERALD[600] }}>{imgs.length} photo{imgs.length > 1 ? "s" : ""}</Text></View>
      {imgs.length ? <PhotoGrid images={imgs} title={label} testID={testID} /> : <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><ImageOff size={14} color={TC.textFaint} /><Text style={{ fontSize: 12, color: TC.textFaint }}>No photos</Text></View>}
    </View>
  );
}
/** Trust block: the partner's live selfie + GPS taken at the customer's door (wizard check-in). */
export function PartnerCheckin({ checkin, partnerName, done }: { checkin: any; partnerName?: string; done?: boolean }) {
  const [open, setOpen] = useState(false);
  const url = mediaUrl(checkin?.selfie_url) || checkin?.selfie_url;
  if (!url) return null;
  const when = checkin.at ? fmtTs(checkin.at) : "";
  const far = !!checkin.far;
  return (
    <View testID="partner-checkin" style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: far ? "#FFFBEB" : EMERALD[50], borderRadius: 6, padding: 10, borderWidth: 1, borderColor: far ? "#FDE68A" : EMERALD[100] }}>
      <Pressable testID="partner-checkin-selfie" onPress={() => setOpen(true)} style={{ width: 64, height: 80, borderRadius: 6, overflow: "hidden", borderWidth: 2, borderColor: "#fff" }}>
        <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><ShieldCheck size={14} color={far ? "#B45309" : EMERALD[700]} /><Text style={{ fontSize: 13.5, fontWeight: "800", color: TC.text }}>{partnerName || "Your partner"} arrived</Text></View>
        {when ? <Text style={{ fontSize: 12, color: TC.textMuted }}>Selfie verified · {when}</Text> : null}
        {!done && checkin.distance_km != null ? <Text style={{ fontSize: 12, color: far ? "#B45309" : EMERALD[700], fontWeight: "600" }}>{far ? `~${checkin.distance_km} km from your address` : `Within ${checkin.distance_km <= 0.05 ? "50 m" : `${Math.round(checkin.distance_km * 1000)} m`} of your address`}</Text> : null}
        {!done && checkin.lat != null ? (
          <Pressable testID="partner-checkin-map" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${checkin.lat},${checkin.lng}`)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <Navigation size={12} color={TC.primaryText} /><Text style={{ fontSize: 12, fontWeight: "700", color: TC.primaryText }}>View arrival location</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.92)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Image source={{ uri: url }} style={{ width: "100%", height: "80%" }} contentFit="contain" />
          <Text style={{ color: "#fff", marginTop: 10, fontSize: 13 }}>Partner check-in selfie{when ? ` · ${when}` : ""}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
export function WorkProofSection({ evidence }: { evidence: any }) {
  const before = (evidence?.before || []).map(norm).filter(Boolean); const after = (evidence?.after || []).map(norm).filter(Boolean);
  if (!before.length && !after.length) return null;
  return <View testID="work-proof-section" style={{ gap: 12 }}><ProofBlock label="Before Work" imgs={before} testID="proof-before" /><ProofBlock label="After Work" imgs={after} testID="proof-after" /></View>;
}

/* ---------- Payment summary (backend breakdown = single source of truth) ---------- */
function PaymentSummary({ b }: { b: any }) {
  const bd = b.breakdown;
  if (!bd) {
    const p = b.pricing || {}; const visiting = Number(p.visiting_charge || 0);
    const svc = Number(p.subtotal ?? p.base ?? 0) - visiting - Number(p.emergency_fee || 0) - Number(p.surge || 0);
    return <>
      <DRow k="Service Amount" v={fmt(Math.max(svc, 0))} />
      {Number(p.emergency_fee || 0) > 0 ? <DRow k="Quick Service Fee" v={fmt(p.emergency_fee)} /> : null}
      {visiting > 0 ? <DRow k="Visiting Charge" v={fmt(visiting)} /> : null}
      {Number(p.discount || 0) > 0 ? <DRow k="Discount" v={`- ${fmt(p.discount)}`} /> : null}
      {Number(p.gst || 0) > 0 ? <DRow k="Est. Govt. Taxes" v={fmt(p.gst)} /> : null}
      <Sep /><DRow k="Total" v={fmt(p.total)} strong />
      <DRow k="Payment status" v={(b.payment_status || "pending").toUpperCase()} />
    </>;
  }
  const hasCharges = (bd.additional_charges || []).length > 0;
  return <>
    <DRow k="Service Amount" v={fmt(bd.services_subtotal)} />
    {(bd.additional_charges || []).map((x: any) => <DRow key={x.key} k={x.label} v={fmt(x.amount)} />)}
    {hasCharges ? <><Sep /><DRow k="Subtotal" v={fmt(bd.subtotal)} /></> : null}
    {Number(bd.discount || 0) > 0 ? <DRow k={`Coupon Discount${bd.coupon_code ? ` (${bd.coupon_code})` : ""}`} v={`- ${fmt(bd.discount)}`} /> : null}
    {Number(bd.tax || 0) > 0 ? <DRow k="Est. Govt. Taxes" v={fmt(bd.tax)} /> : null}
    <Sep /><DRow k="Total Booking Amount" v={fmt(bd.total)} strong />
    <DRow k="Payment status" v={(bd.payment_status || b.payment_status || "pending").toUpperCase()} />
  </>;
}

export function BookingDetailsDrawer({ booking: b, onClose, onInvoice }: { booking: any; onClose: () => void; onInvoice: (b: any) => void }) {
  const { c, isDark } = useTheme();
  if (!b) return null;
  const p = b.pricing || {}; const bd = b.breakdown || null; const addr = b.address || {};
  const canInvoice = ["completed", "paid"].includes(b.status);
  const rf = bd?.refund || null; const cn = b.cancellation || {};
  const orderValue = rf?.original_amount != null ? Number(rf.original_amount) : (cn.original_amount != null ? Number(cn.original_amount) : Number(bd?.total ?? p.total ?? 0));
  const refundAmt = rf?.refund_amount != null ? Number(rf.refund_amount) : (cn.refund != null ? Number(cn.refund) : null);
  const refundPct = rf?.refund_pct != null ? Number(rf.refund_pct) : (cn.refund_pct != null ? Number(cn.refund_pct) : null);
  const retained = refundAmt != null ? (rf?.retained != null ? Number(rf.retained) : Math.max(0, orderValue - refundAmt)) : 0;
  return (
    <DrawerShell open={!!b} onClose={onClose} title="Booking Details" testID="details-sheet"
      footer={canInvoice ? <Btn testID="details-view-invoice" icon={FileText} label="View Invoice" onPress={() => { onClose(); onInvoice(b); }} style={{ height: 44, borderRadius: 6 }} /> : null}>
      <DBlock icon={Wrench} title="Service Information"><DRow k="Service" v={b.service_name} strong /><DRow k="Category" v={b.category_name} /><DRow k="Status" v={statusText(b.status)} /></DBlock>
      {((bd && (bd.service_items || []).length > 0) || (b.items || []).length > 0) ? <DBlock icon={Package} title="Services"><ServiceBreakdown booking={b} title="Services in this order" /></DBlock> : null}
      {["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status) && b.partner_id ? <DBlock icon={NavIcon} title="Live Tracking"><LiveTrackCard booking={b} /></DBlock> : null}
      {b.status === "started" ? <DBlock icon={ShieldCheck} title="Help & SOS"><HelpSOS booking={b} testPrefix="drawer-" /></DBlock> : null}
      {b.checkin?.selfie_url ? <DBlock icon={ShieldCheck} title="Partner Check-in"><PartnerCheckin checkin={b.checkin} partnerName={b.partner_name} done={["completed", "paid"].includes(b.status)} /></DBlock> : null}
      {((b.evidence?.before || []).length > 0 || (b.evidence?.after || []).length > 0) ? <DBlock icon={Camera} title="Work Proof Photos & Videos"><WorkProofSection evidence={b.evidence} /></DBlock> : null}
      <DBlock icon={Package} title="Booking Information">
        <DRow k="Booking ID" v={`#${b.code}`} /><DRow k="Booked on" v={fmtTs(b.created_at)} />
        {b.scheduled_at ? <DRow k="Scheduled" v={fmtTs(b.scheduled_at)} /> : null}
        {b.booking_type === "merchant" ? <DRow k="Referred by" v={b.merchant_name} /> : null}
      </DBlock>
      {b.partner_name ? (
        <DBlock icon={User} title="Partner Information">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: isDark ? "rgba(7,52,115,0.3)" : PRIMARY[50], alignItems: "center", justifyContent: "center" }}><User size={20} color={TC.primaryText} /></View>
            <View><Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{b.partner_name}</Text><Text style={{ fontSize: 12, color: TC.textFaint }}>{b.category_name}</Text></View>
          </View>
        </DBlock>
      ) : null}
      <DBlock icon={CreditCard} title="Payment Summary"><PaymentSummary b={b} /></DBlock>
      {addr.line || addr.city ? <DBlock icon={MapPin} title="Service Address"><Text style={{ fontSize: 14, color: isDark ? SLATE[200] : TC.text2 }}>{addr.line}</Text><Text style={{ fontSize: 12, color: TC.textFaint }}>{[addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}</Text></DBlock> : null}
      {b.status === "cancelled" ? (
        <DBlock icon={AlertTriangle} title="Cancellation & Refund">
          <DRow k="Status" v="Cancelled" />
          {refundAmt == null ? (b.payment_status === "refunded" ? <DRow k="Refund" v={`${fmt(orderValue)} · Processing`} /> : null) : <>
            <DRow k="Original Booking Amount" v={fmt(orderValue)} />
            <Sep /><DRow k="Customer Refund" v={`${fmt(refundAmt)}${b.payment_status === "refunded" ? " · Processing" : ""}`} strong />
            {retained > 0 ? <DRow k="Amount Retained" v={fmt(retained)} /> : null}
          </>}
        </DBlock>
      ) : null}
    </DrawerShell>
  );
}

export function InvoiceDrawer({ booking: b, onClose, toast }: { booking: any; onClose: () => void; toast: any }) {
  const { c, isDark } = useTheme();
  const { branding } = useSiteConfig() as any;
  const [busy, setBusy] = useState(false); const [sharing, setSharing] = useState(false);
  if (!b) return null;
  const p = b.pricing || {}; const bd = b.breakdown || null;
  const rawLogo = branding?.logo_light || branding?.email_logo || branding?.logo_dark || "";
  const logoUrl = rawLogo ? mediaUrl(rawLogo) : "";
  const brandName = branding?.brand_name || branding?.site_name || branding?.name || "AzoApp";
  const paid = ["paid", "completed", "refunded"].includes(b.payment_status);
  const resolveInvoice = async () => {
    const list: any = await api.get(`/invoices?booking_id=${b.id}&page_size=1`);
    const inv = (list?.items || list || [])[0];
    if (!inv?.id) throw new Error("Invoice is not generated yet");
    return inv;
  };
  const downloadInvoice = async () => {
    setBusy(true);
    try {
      const inv = await resolveInvoice();
      const r = await downloadInvoicePdf(inv);
      toast.success(r.status === "saved" ? "Invoice saved to Downloads — opening PDF" : r.status === "downloaded" ? "Invoice downloaded — opening PDF" : "Invoice ready — choose a PDF app to view or save.");
      if (r.openUri) { try { await openLocalFile(r.openUri); } catch { toast.error("Downloaded, but no PDF viewer was found to open it"); } }
    } catch (e: any) { toast.error(e?.message || "Could not generate PDF"); } finally { setBusy(false); }
  };
  const shareOnWhatsApp = async () => {
    setSharing(true);
    try {
      const inv = await resolveInvoice();
      // Share the ACTUAL PDF file — never a backend URL.
      const r = await shareInvoicePdf(inv, "whatsapp");
      if (r === "fallback") toast.info("Shared invoice details — PDF couldn't be attached this time");
    } catch (e: any) { toast.error(e?.message || "Could not share invoice"); } finally { setSharing(false); }
  };
  return (
    <DrawerShell open={!!b} onClose={onClose} title="Invoice" testID="invoice-sheet"
      footer={<View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable testID={`invoice-whatsapp-${b.code}`} disabled={sharing || busy} onPress={shareOnWhatsApp} style={{ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: isDark ? "#065F46" : EMERALD[200], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: sharing || busy ? 0.5 : 1 }}><MessageCircle size={16} color={isDark ? EMERALD[300] : EMERALD[700]} /><Text style={{ fontSize: 14, fontWeight: "600", color: isDark ? EMERALD[300] : EMERALD[700] }}>{sharing ? "Preparing…" : "WhatsApp"}</Text></Pressable>
        <Btn testID={`invoice-download-${b.code}`} icon={Download} disabled={busy || sharing} onPress={downloadInvoice} label={busy ? "Preparing…" : "Download"} style={{ flex: 1, height: 44, borderRadius: 6 }} />
      </View>}>
      <View style={{ alignItems: "center", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
        {logoUrl ? <Image testID="invoice-logo" source={{ uri: logoUrl }} style={{ height: 40, width: 160 }} contentFit="contain" /> : <Text style={{ fontSize: 20, fontWeight: "900", color: "#0D47A1" }}>{brandName}</Text>}
        <Text style={{ fontSize: 12, color: TC.textFaint, marginTop: 4 }}>Tax Invoice · #{b.code}</Text>
      </View>
      <View style={{ gap: 8 }}><DRow k="Service" v={b.service_name} strong /><DRow k="Partner" v={b.partner_name || "—"} /><DRow k="Date" v={fmtTs(b.created_at)} /></View>
      <ServiceBreakdown booking={b} title="Services" showCharges />
      <View style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 }}>
        {Number(bd?.discount ?? p.discount ?? 0) > 0 ? <DRow k={`Coupon Discount${bd?.coupon_code ? ` (${bd.coupon_code})` : ""}`} v={`- ${fmt(bd?.discount ?? p.discount)}`} /> : null}
        {Number(bd?.tax ?? p.gst ?? 0) > 0 ? <DRow k="Est. Govt. Taxes" v={fmt(bd?.tax ?? p.gst)} /> : null}
        <Sep /><DRow k="Grand Total" v={fmt(bd?.total ?? p.total)} strong />
        <DRow k="Paid Amount" v={fmt(paid ? (bd?.total ?? p.total) : 0)} />
        {bd?.refund ? (
          <View testID="invoice-cancel-card" style={{ marginTop: 8, borderRadius: 6, borderWidth: 1, borderColor: isDark ? "rgba(136,19,55,0.4)" : ROSE[200], backgroundColor: isDark ? "rgba(136,19,55,0.1)" : "rgba(255,241,242,0.6)", padding: 12, gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: isDark ? "#FB7185" : ROSE[700] }}>Cancellation & Refund</Text>
            <DRow k="Original Booking Amount" v={fmt(bd.refund.original_amount ?? bd?.total ?? p.total)} strong />
            <DRow k="Customer Refund" v={`- ${fmt(bd.refund.refund_amount)}`} />
            <View style={{ borderTopWidth: 1, borderTopColor: ROSE[200], paddingTop: 8 }}><DRow k="Amount Retained" v={fmt(bd.refund.retained)} strong /></View>
          </View>
        ) : null}
      </View>
      {b.additional && b.additional.status === "paid" && (Number(b.additional.total) || 0) > 0 ? (
        <View testID="invoice-additional-work" style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: TC.textFaint }}>Additional Work (Rate Card)</Text>
          {(b.additional.items || []).map((it: any, i: number) => {
            const part = Number(it.part_charge) || 0; const lab = Number(it.labour_charge) || 0;
            return (
              <View key={it.id || i} testID={`invoice-addl-item-${i}`} style={{ gap: 2 }}>
                <DRow k={it.description || "Additional work"} v={fmt(part + lab)} />
                {lab > 0 ? <Text style={{ fontSize: 11, color: TC.textFaint }}>Includes labour {fmt(lab)}{part > 0 ? ` · parts ${fmt(part)}` : ""}</Text> : null}
              </View>
            );
          })}
          {Number(b.additional.gst || 0) > 0 ? <DRow k="Est. Govt. Taxes" v={fmt(b.additional.gst)} /> : null}
          <Sep /><DRow k="Additional Total" v={fmt(b.additional.total)} strong />
          <DRow k="Grand Total (incl. additional)" v={fmt((Number(bd?.total ?? p.total ?? 0)) + Number(b.additional.total || 0))} strong />
        </View>
      ) : null}
      {Number(bd?.discount ?? p.discount ?? 0) > 0 ? (
        <View testID="invoice-coupon-note" style={{ borderRadius: 6, backgroundColor: isDark ? "rgba(6,78,59,0.2)" : EMERALD[50], borderWidth: 1, borderColor: isDark ? "#065F46" : EMERALD[200], paddingHorizontal: 12, paddingVertical: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: isDark ? EMERALD[300] : EMERALD[700] }}>Coupon{bd?.coupon_code ? ` ${bd.coupon_code}` : ""}</Text><Text style={{ fontSize: 12, fontWeight: "600", color: isDark ? EMERALD[300] : EMERALD[700] }}>{fmt(bd?.discount ?? p.discount)} off</Text></View>
          <Text style={{ fontSize: 11, color: isDark ? "rgba(110,231,183,0.8)" : "rgba(4,120,87,0.8)", marginTop: 4 }}>This coupon discount is funded by AzoApp — your savings, on us.</Text>
        </View>
      ) : null}
      <View style={{ gap: 8 }}><DRow k="Payment method" v={String(b.payment_method || "UPI / Wallet").toUpperCase()} /><DRow k="Payment status" v={(b.payment_status || "pending").toUpperCase()} /></View>
    </DrawerShell>
  );
}
