/* 1:1 port of web InvoiceDetailPanel.jsx (mobile = full-screen page) */
import React, { useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Image } from "expo-image";
import { User, CalendarDays, Wallet, Percent, History, Download, Share2, FileText, MoreHorizontal, Printer, Copy, Phone, Mail, MapPin, MessageCircle } from "lucide-react-native";
import { mediaUrl } from "@/src/api/client";
import { FullSheet, ActionSheet, InvStatusBadge, TypeChip, DetailSkeleton, Timeline, OutlineBtn, useInv } from "@/src/components/invoice";
import { money, shortDate, longDate, buildTimeline, referenceOf } from "@/src/lib/invoiceUtils";

const MONO = "monospace";

function Section({ icon: Ico, title, children, testID }: { icon: any; title: string; children: React.ReactNode; testID?: string }) {
  const inv = useInv();
  return (
    <View testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}><Ico size={14} color={inv.t400} /><Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: inv.t400 }}>{title}</Text></View>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: inv.border, backgroundColor: inv.surface, paddingHorizontal: 16 }}>{children}</View>
    </View>
  );
}
function Row({ k, v, strong, mono, muted, green, testID, last }: { k: string; v: React.ReactNode; strong?: boolean; mono?: boolean; muted?: boolean; green?: boolean; testID?: string; last?: boolean }) {
  const inv = useInv();
  const color = green ? inv.emerald : strong ? inv.t900 : muted ? inv.t400 : inv.t800;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: inv.dark ? "rgba(30,41,59,0.7)" : "#F1F5F9" }}>
      <Text style={{ fontSize: 14, color: inv.t500, flexShrink: 0 }}>{k}</Text>
      {typeof v === "string" || typeof v === "number" ? <Text testID={testID} style={{ fontSize: mono ? 12.5 : 14, fontFamily: mono ? MONO : undefined, color, fontWeight: strong ? "700" : "500", textAlign: "right", flex: 1 }}>{v}</Text> : <View testID={testID} style={{ flex: 1, alignItems: "flex-end" }}>{v}</View>}
    </View>
  );
}
function TotalRow({ k, v, green, testID }: { k: string; v: string; green?: boolean; testID?: string }) {
  const inv = useInv();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 12, borderTopWidth: 1, borderStyle: "dashed", borderTopColor: inv.dark ? "#475569" : "#CBD5E1" }}>
      <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: inv.t700 }}>{k}</Text>
      <Text testID={testID} style={{ fontSize: 16, fontWeight: "800", color: green ? inv.emerald : inv.t900 }}>{v}</Text>
    </View>
  );
}
function SubCap({ children }: { children: React.ReactNode }) { const inv = useInv(); return <Text style={{ paddingTop: 14, paddingBottom: 4, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: inv.t400 }}>{children}</Text>; }
function Masked() { const inv = useInv(); return <Text style={{ letterSpacing: 2, color: inv.t400, fontSize: 14 }}>*****</Text>; }
function CouponNote({ re, cur }: { re: any; cur: string }) {
  const inv = useInv();
  return (
    <View testID="detail-coupon-note" style={{ marginTop: 8, marginBottom: 10, borderRadius: 12, backgroundColor: inv.dark ? "rgba(6,78,59,0.2)" : "#ECFDF5", borderWidth: 1, borderColor: inv.dark ? "#065F46" : "#A7F3D0", paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: inv.dark ? "#6EE7B7" : "#047857" }}>Coupon {re.coupon_code}</Text>
        {Number(re.coupon_discount || 0) > 0 ? <Text style={{ fontSize: 12, fontWeight: "600", color: inv.dark ? "#6EE7B7" : "#047857" }}>{money(re.coupon_discount, cur, 2)} off</Text> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 4 }}>
        <Text style={{ fontSize: 11, color: inv.t500 }}>Discount Bearer</Text>
        <Text style={{ fontSize: 11, fontWeight: "600", color: inv.t700 }}>{re.coupon_bearer || "AzoApp Platform"}</Text>
      </View>
      <Text style={{ fontSize: 11, color: inv.dark ? "rgba(110,231,183,0.8)" : "rgba(4,120,87,0.8)", marginTop: 6 }}>{re.coupon_note || "Coupon discount is funded by AzoApp and does not affect Partner earnings."}</Text>
    </View>
  );
}

export default function InvoiceDetailPanel({ inv, full, loading, onClose, onDownload, onPreview, onPrint, onShare, onCopy, downloading, merchantName, role = "partner" }: {
  inv: any | null; full: any | null; loading: boolean; onClose: () => void; onDownload: (d: any) => void; onPreview: (d: any) => void; onPrint: (d: any) => void;
  onShare: (d: any, ch: string) => void; onCopy: (d: any) => void; downloading: boolean; merchantName: string; role?: "partner" | "merchant";
}) {
  const t = useInv();
  const [more, setMore] = useState(false);
  const d = full || inv;
  const open = !!inv;
  const cur = d?.currency || "INR";
  const cust = d?.customer_snapshot || {};
  const biz = d?.business_snapshot || {};
  const partner = d?.partner_snapshot || {};
  const paid = (d?.payment_status || "").toLowerCase() === "paid" ? d.total_amount : (d?.paid_amount ?? (d?.payment_status === "partially_paid" ? d?.paid_amount || 0 : 0));
  const balance = Math.max(0, (d?.total_amount || 0) - (paid || 0) - (d?.refund || 0));
  const commission = d?.commission || 0;
  const maskedPII = !!d?.customer_pii_masked;
  const lineItems = ((d?.line_items || []) as any[]).map((it) => ({
    ...it,
    isAddon: /^\s*\+/.test(it.desc || "") || (it.detail || "").toLowerCase() === "add-on",
    desc: (it.desc || "Item").replace(/^\s*\+\s*/, ""),
    qty: Number(it.qty || 1),
    amount: Number(it.amount || 0),
  }));
  const serviceLines = lineItems.filter((it) => !/surge|emergency/i.test(it.desc));
  const otherFees = Math.max(0, Number(d?.fees || 0) - Number(d?.visiting_charge || 0));
  const commBase = d?.commission_base ?? d?.subtotal ?? d?.total_amount;
  const rate = d?.commission_pct != null ? d.commission_pct : (commission && commBase ? Math.round((commission / commBase) * 1000) / 10 : null);
  const isCancel = d?.invoice_type === "cancellation";
  const custRefund = Number(d?.refund || 0);

  const bd0 = d?.breakdown || null;
  const acList: any[] = Array.isArray(bd0?.additional_charges) ? bd0.additional_charges : [];
  const CHARGE_LABEL: Record<string, string> = { emergency_fee: "Emergency Charge", visiting_charge: "Visiting Charge", surge: "Surge Charge", convenience_fee: "Convenience Fee", platform_fee: "Platform Fee" };
  const chargeLines = acList.map((c) => ({ key: c.key, label: CHARGE_LABEL[c.key] || c.label || c.key, amount: Number(c.amount || 0), note: c.note })).filter((c) => c.amount > 0);
  const svcFromLines = serviceLines.reduce((s, it) => s + Number(it.amount || 0), 0);
  const emergencySurgeFromLines = lineItems.filter((it) => /surge|emergency|urgent/i.test(it.desc)).reduce((s, it) => s + Number(it.amount || 0), 0);
  const serviceAmt = bd0?.services_subtotal != null ? Number(bd0.services_subtotal) : (svcFromLines > 0 ? svcFromLines : Math.max(0, Number(d?.subtotal || 0) - emergencySurgeFromLines));
  const psDiscount = Number(bd0?.discount ?? d?.discount ?? 0);
  const psTax = Number(bd0?.tax ?? d?.tax ?? 0);
  const grossCharges = serviceAmt + chargeLines.reduce((s, c) => s + c.amount, 0);
  const psSubtotal = bd0?.taxable != null ? Number(bd0.taxable) : Math.round((grossCharges - psDiscount) * 100) / 100;
  const psTotal = bd0?.total != null ? Number(bd0.total) : Math.round((psSubtotal + psTax) * 100) / 100;
  const psRetained = Math.max(0, Math.round((psTotal - custRefund) * 100) / 100);

  const iconBtn = (testID: string, onPress: () => void, Ico: any) => (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ height: 44, width: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? t.subtle : "transparent" })}><Ico size={18} color={t.t500} /></Pressable>
  );
  const headerRight = d ? <>{iconBtn("detail-share", () => onShare(d, "system"), Share2)}{iconBtn("detail-more", () => setMore(true), MoreHorizontal)}</> : null;
  const run = (fn: () => void) => { setMore(false); setTimeout(fn, 60); };
  const MenuItem = ({ icon: Ico, label, onPress, testID, tone }: any) => (
    <Pressable testID={testID} onPress={() => run(onPress)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, height: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: pressed ? t.subtle : "transparent" })}><Ico size={16} color={tone || t.t500} /><Text style={{ color: t.t800, fontSize: 14, fontWeight: "500" }}>{label}</Text></Pressable>
  );
  const linkText = (txt: string) => <Text style={{ fontSize: 14, color: t.primary700, fontWeight: "500" }}>{txt}</Text>;

  const lineRows = (rows: any[], padAddon: number) => rows.map((it, i) => (
    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1, paddingLeft: it.isAddon ? padAddon : 0 }}>
        <Text style={{ fontSize: 14, color: it.isAddon ? t.t500 : t.t700, fontWeight: it.isAddon ? "400" : "500" }}>{it.isAddon ? "↳ " : ""}{it.desc}{it.qty > 1 ? ` ×${it.qty}` : ""}</Text>
        {it.detail && !it.isAddon ? <Text style={{ fontSize: 11, color: t.t400 }}>{it.detail}</Text> : null}
      </View>
      <Text style={{ fontSize: 14, fontWeight: "500", color: t.t800 }}>{money(it.amount, cur, 2)}</Text>
    </View>
  ));

  return (
    <FullSheet open={open} onClose={onClose} title={d?.invoice_number || "Invoice"} subtitle={d ? `Issued ${shortDate(d.issue_date)}` : ""} headerRight={headerRight} testID="invoice-detail-drawer"
      footer={d ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <OutlineBtn testID="drawer-download" onPress={() => onDownload(d)} busy={downloading} height={48} icon={<Download size={16} color={t.t700} />} label="Download PDF" />
          <OutlineBtn testID="drawer-share" onPress={() => onShare(d, "system")} height={48} icon={<Share2 size={16} color={t.t700} />} label="Share Invoice" />
        </View>
      ) : null}>
      {!d ? null : (
        <View style={{ gap: 20 }}>
          {/* Invoice header card */}
          <View testID="detail-header-card" style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.dark ? "rgba(30,41,59,0.6)" : "#F8FAFC", padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                {biz.logo ? <Image source={{ uri: mediaUrl(biz.logo) }} style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: t.border2 }} contentFit="contain" />
                  : <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: t.primary, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 12px rgba(13,71,161,0.3)" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>A</Text></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: t.t400 }}>AzoApp · {role === "partner" ? "Partner" : "Merchant"}</Text>
                  <Text style={{ fontWeight: "600", color: t.t900, fontSize: 15 }} numberOfLines={1}>{role === "partner" ? (partner.name || merchantName) : (d.merchant_snapshot?.name || merchantName)}</Text>
                </View>
              </View>
              <InvStatusBadge status={d.payment_status} testID="detail-status" />
            </View>
            <View style={{ marginTop: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
              <View>
                <Text style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: t.t400, fontWeight: "700" }}>Invoice Total</Text>
                <Text testID="detail-total" style={{ fontSize: 30, fontWeight: "800", color: t.t900, lineHeight: 34 }}>{money(d.total_amount, cur, 2)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: "600", color: t.t700 }}>{d.invoice_number}</Text>
                <Text style={{ fontSize: 12, color: t.t400, marginTop: 2 }}>{longDate(d.issue_date)}</Text>
                <View style={{ marginTop: 6 }}><TypeChip type={d.invoice_type} /></View>
              </View>
            </View>
          </View>

          {loading && !full ? <DetailSkeleton /> : (
            <>
              <Section icon={User} title="Customer Details" testID="detail-customer">
                <Row k="Customer name" v={cust.name || "—"} strong />
                <Row k="Mobile" v={maskedPII ? <Masked /> : (cust.phone || cust.mobile ? <Pressable onPress={() => Linking.openURL(`tel:${cust.phone || cust.mobile}`)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Phone size={14} color={t.primary700} />{linkText(cust.phone || cust.mobile)}</Pressable> : "—")} />
                <Row k="Email" v={maskedPII ? <Masked /> : (cust.email ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Mail size={14} color={t.t400} /><Text style={{ fontSize: 14, color: t.t800, fontWeight: "500" }}>{cust.email}</Text></View> : "—")} />
                <Row k="Address" v={maskedPII ? <Masked /> : (cust.address ? <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, maxWidth: 220 }}><MapPin size={14} color={t.t400} style={{ marginTop: 2 }} /><Text style={{ fontSize: 14, color: t.t800, fontWeight: "500", textAlign: "right", flexShrink: 1 }}>{cust.address}</Text></View> : "—")} last={!maskedPII} />
                {maskedPII ? <Text style={{ paddingVertical: 8, fontSize: 11, color: t.t400 }}><Text style={{ color: "#F59E0B" }}>🔒</Text> Customer contact hidden after completion for privacy.</Text> : null}
              </Section>

              <Section icon={CalendarDays} title="Booking Details" testID="detail-booking">
                <Row k="Booking ID" v={d.booking_code || "—"} mono />
                {serviceLines.length > 1 ? (
                  <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.dark ? "rgba(30,41,59,0.7)" : "#F1F5F9" }}>
                    <Text style={{ fontSize: 14, color: t.t500 }}>Services</Text>
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {serviceLines.map((it, i) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <Text style={{ fontSize: 14, paddingLeft: it.isAddon ? 8 : 0, color: it.isAddon ? t.t500 : t.t800, fontWeight: it.isAddon ? "400" : "500", flex: 1 }}>{it.isAddon ? "↳ " : ""}{it.desc}{it.qty > 1 ? ` ×${it.qty}` : ""}</Text>
                          <Text style={{ fontSize: 14, color: t.t700 }}>{money(it.amount, cur, 2)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Row k="Service" v={d.service_name || (serviceLines[0]?.desc) || "—"} />
                )}
                {d.booking_date ? <Row k="Booking date" v={shortDate(d.booking_date)} /> : null}
                <Row k="Reference ID" v={referenceOf(d)} mono last={!d.transaction_id && !d.payment_method} />
                {d.transaction_id ? <Row k="Transaction ID" v={d.transaction_id} mono last={!d.payment_method} /> : null}
                {d.payment_method ? <Row k="Payment method" v={d.payment_method} last /> : null}
              </Section>

              <Section icon={Wallet} title="Payment Summary" testID="detail-payment">
                {isCancel ? (
                  <>
                    <Row k="Service Amount" v={money(serviceAmt, cur, 2)} testID="detail-service-amount" />
                    {chargeLines.map((c) => <Row key={c.key} k={c.label} v={money(c.amount, cur, 2)} testID={`detail-charge-${c.key}`} />)}
                    {psDiscount > 0 ? <Row k="Coupon Discount" v={`− ${money(psDiscount, cur, 2)}`} green testID="detail-discount" /> : null}
                    <TotalRow k="Subtotal" v={money(psSubtotal, cur, 2)} testID="detail-subtotal" />
                    {psTax > 0 ? <Row k="Est. Govt. Taxes" v={money(psTax, cur, 2)} testID="detail-tax" /> : null}
                    <TotalRow k="Total Booking Amount" v={money(psTotal, cur, 2)} testID="detail-booking-total" />
                    <Row k="Paid Amount" v={money(psTotal, cur, 2)} testID="detail-paid" />
                    <Row k="Customer Refund" v={custRefund > 0 ? `− ${money(custRefund, cur, 2)}` : money(0, cur, 2)} green={custRefund > 0} muted={!custRefund} testID="detail-customer-refund" />
                    <TotalRow k="Amount Retained" v={money(psRetained, cur, 2)} testID="detail-amount-retained" />
                  </>
                ) : (
                  <>
                    {lineItems.length > 0 ? <View style={{ paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: t.dark ? "rgba(30,41,59,0.7)" : "#F1F5F9" }}>{lineRows(lineItems, 12)}</View> : null}
                    <Row k="Subtotal" v={money(d.subtotal ?? d.total_amount, cur, 2)} strong={lineItems.length > 0} />
                    {Number(d.visiting_charge) > 0 ? <Row k="Visiting Charge" v={money(d.visiting_charge, cur, 2)} /> : null}
                    {otherFees > 0.001 ? <Row k="Platform / Service Fees" v={money(otherFees, cur, 2)} /> : null}
                    {d.discount ? <Row k="Discount" v={`− ${money(d.discount, cur, 2)}`} green /> : null}
                    {d.tax ? <Row k="Est. Govt. Taxes" v={money(d.tax, cur, 2)} /> : <Row k="Est. Govt. Taxes" v="Not applicable" muted />}
                    <Row k="Total Amount" v={money(d.total_amount, cur, 2)} strong />
                    <Row k="Paid Amount" v={money(paid, cur, 2)} testID="detail-paid" />
                    {balance > 0 && d.invoice_type !== "cancellation" ? <Row k="Balance" v={money(balance, cur, 2)} strong testID="detail-balance" /> : null}
                    <Row k="Refunded Amount" v={money(d.refund || 0, cur, 2)} muted={!d.refund} last />
                  </>
                )}
              </Section>

              {d?.role_earning ? (
                <Section icon={Percent} title={d.role_earning.role === "partner" ? "Your Earning" : "Your Commission"} testID="detail-commission">
                  {d.role_earning.role === "partner" && !d.role_earning.is_cancellation ? (() => {
                    const re = d.role_earning;
                    const base = Number(re.base || 0);
                    const service = Number(re.service_cost != null ? re.service_cost : base);
                    const vc = Number(re.visiting_charge || 0);
                    const vcInBase = vc > 0 && Math.abs((service + vc) - base) < 0.02;
                    return (
                      <>
                        <Row k="Service Amount" v={money(service, cur, 2)} testID="detail-earn-service" />
                        {vcInBase ? <Row k="Visiting Charge" v={money(vc, cur, 2)} /> : null}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 10, borderTopWidth: 1, borderStyle: "dashed", borderTopColor: t.border2 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: t.t700 }}>Commissionable Amount</Text>
                          <Text testID="detail-commissionable" style={{ fontSize: 14, fontWeight: "600", color: t.t900 }}>{money(base, cur, 2)}</Text>
                        </View>
                        {re.rate != null ? <Row k="Commission Rate" v={`${re.rate}%`} testID="detail-commission-rate" /> : null}
                        <Row k="Partner Earning" v={money(re.commission, cur, 2)} testID="detail-partner-earning" />
                        {vc > 0 && !vcInBase ? <Row k="Visiting Charge (paid to you)" v={"+ " + money(vc, cur, 2)} /> : null}
                        <Row k="Est. Govt. Taxes" v="Excluded" muted last />
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.border2 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: t.t700 }}>Total Partner Earning</Text>
                          <Text testID="detail-net" style={{ fontSize: 16, fontWeight: "800", color: t.emerald }}>{money(re.net, cur, 2)}</Text>
                        </View>
                        {re.coupon_code ? <CouponNote re={re} cur={cur} /> : null}
                      </>
                    );
                  })() : d.role_earning.role === "partner" && d.role_earning.is_cancellation ? (() => {
                    const re = d.role_earning;
                    const shareRate = re.rate;
                    const platformRate = shareRate != null ? Math.round((100 - shareRate) * 100) / 100 : null;
                    return (
                      <>
                        <Row k="Eligible Earning Amount" v={<Text style={{ fontSize: 14, color: t.t800, fontWeight: "500" }}>{money(re.base, cur, 2)} <Text style={{ fontSize: 11, color: t.t400 }}>(excl. tax)</Text></Text>} testID="detail-earn-base" />
                        {shareRate != null ? <Row k="Your Share Rate" v={`${shareRate}%`} testID="detail-commission-rate" /> : null}
                        <SubCap>Earning Breakdown</SubCap>
                        {shareRate != null ? <Row k="Partner Share" v={`${shareRate}%`} /> : null}
                        <Row k="Partner Earning" v={money(re.net, cur, 2)} testID="detail-partner-earning" />
                        {platformRate != null ? <Row k="Platform Share" v={`${platformRate}%`} /> : null}
                        {re.platform != null ? <Row k="AzoApp Platform Earning" v={money(re.platform, cur, 2)} testID="detail-platform-share" last /> : null}
                        <TotalRow k="Net Earning" v={money(re.net, cur, 2)} green testID="detail-net" />
                        {re.coupon_code ? <CouponNote re={re} cur={cur} /> : null}
                      </>
                    );
                  })() : (
                    <>
                      {d.role_earning.base != null ? <Row k={d.role_earning.service_label || "Total Service Amount"} v={<Text style={{ fontSize: 14, color: t.t800, fontWeight: "500" }}>{money(d.role_earning.base, cur, 2)} <Text style={{ fontSize: 11, color: t.t400 }}>(excl. tax)</Text></Text>} testID="detail-earn-base" /> : null}
                      {d.role_earning.role === "merchant" ? (
                        <>
                          <Row k={`Commission Referred By Partner${d.role_earning.referral_pct != null ? ` (${d.role_earning.referral_pct}%)` : ""}`} v={money(d.role_earning.referral || 0, cur, 2)} muted={!d.role_earning.referral} />
                          <Row k={`Commission By Referred Customer${d.role_earning.customer_pct != null ? ` (${d.role_earning.customer_pct}%)` : ""}`} v={money(d.role_earning.customer || 0, cur, 2)} muted={!d.role_earning.customer} />
                          <Row k={d.role_earning.commission_label} v={money(d.role_earning.commission, cur, 2)} />
                        </>
                      ) : (
                        <>
                          {d.role_earning.rate != null ? <Row k="Your Share Rate" v={`${d.role_earning.rate}%`} testID="detail-commission-rate" /> : null}
                          {d.role_earning.platform != null ? <Row k={d.role_earning.platform_label || "Platform Share"} v={money(d.role_earning.platform, cur, 2)} testID="detail-platform-share" /> : null}
                        </>
                      )}
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingVertical: 10 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: t.t600 }}>{d.role_earning.net_label}</Text>
                        <Text testID="detail-net" style={{ fontSize: 16, fontWeight: "800", color: t.emerald }}>{money(d.role_earning.net, cur, 2)}</Text>
                      </View>
                    </>
                  )}
                </Section>
              ) : commission ? (
                <Section icon={Percent} title="Commission Details" testID="detail-commission">
                  <Row k="Commission" v={money(commission, cur, 2)} />
                  {rate != null ? <Row k="Commission Rate" v={`${rate}%`} testID="detail-commission-rate" /> : null}
                  <Row k="Net Amount" v={money((d.total_amount || 0) - commission, cur, 2)} strong last />
                </Section>
              ) : null}

              <Section icon={History} title="Timeline" testID="detail-timeline">
                <View style={{ paddingVertical: 12 }}><Timeline steps={buildTimeline(d)} /></View>
              </Section>
            </>
          )}
        </View>
      )}

      <ActionSheet open={more} onClose={() => setMore(false)} title={d?.invoice_number || "Invoice"} testID="detail-more-sheet">
        {d ? (
          <View>
            <MenuItem icon={FileText} label="View Invoice" onPress={() => onPreview(d)} testID="detail-menu-preview" />
            <MenuItem icon={Download} label="Download PDF" onPress={() => onDownload(d)} testID="detail-menu-download" />
            <MenuItem icon={Printer} label="Print Invoice" onPress={() => onPrint(d)} testID="detail-menu-print" />
            <View style={{ height: 1, backgroundColor: t.border, marginVertical: 4 }} />
            <MenuItem icon={MessageCircle} label="Share on WhatsApp" onPress={() => onShare(d, "whatsapp")} tone={t.emerald} testID="detail-menu-whatsapp" />
            <MenuItem icon={Copy} label="Copy Invoice Number" onPress={() => onCopy(d)} testID="detail-menu-copy" />
          </View>
        ) : null}
      </ActionSheet>
    </FullSheet>
  );
}
