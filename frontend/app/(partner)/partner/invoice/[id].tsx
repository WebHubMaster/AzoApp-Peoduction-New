import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Share, Platform, Modal, Linking } from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Card, CardSkeleton, EmptyState } from "@/src/components/ui";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";
import { InvStatusBadge, InvTypeChip } from "@/src/components/invoice";

const money = (n: any) => fmt(Number(n || 0));
const dt = (s?: string) => { if (!s) return ""; try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const dd = (s?: string) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };
const CHARGE_LABEL: Record<string, string> = { emergency_fee: "Emergency / Urgent service", visiting_charge: "Visiting Charge", surge: "Surge Charge", convenience_fee: "Convenience Fee", platform_fee: "Platform Fee" };

export default function InvoiceDetail() {
  const { id, number, download } = useLocalSearchParams<{ id: string; number?: string; download?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [printOpen, setPrintOpen] = useState(download === "1");

  const { data: d, isLoading, isError } = useQuery({ queryKey: ["invoice-detail", id], queryFn: () => api.get<any>(`/invoices/${id}`), enabled: !!id });
  const print = useQuery({ queryKey: ["invoice-html", id], queryFn: () => api.get<string>(`/invoices/${id}/view`), enabled: printOpen });

  const share = () => { if (d) Share.share({ message: `Invoice ${d.invoice_number} · ${money(d.total_amount)} · ${(d.payment_status || "").replace(/_/g, " ")} — AzoApp` }).catch(() => {}); };

  const cur = d || {};
  const cust = cur.customer_snapshot || {};
  const partner = cur.partner_snapshot || {};
  const bd = cur.breakdown || {};
  const lineItems: any[] = (cur.line_items || []).map((it: any) => ({ ...it, isAddon: /^\s*\+/.test(it.desc || "") || (it.detail || "").toLowerCase() === "add-on", desc: (it.desc || "Item").replace(/^\s*\+\s*/, ""), qty: Number(it.qty || 1), amount: Number(it.amount || 0) }));
  const charges: any[] = (Array.isArray(bd.additional_charges) ? bd.additional_charges : []).map((c: any) => ({ label: CHARGE_LABEL[c.key] || c.label || c.key, amount: Number(c.amount || 0) })).filter((c: any) => c.amount > 0);
  const re = cur.role_earning;
  const masked = !!cur.customer_pii_masked;
  const paid = (cur.payment_status || "").toLowerCase() === "paid" ? cur.total_amount : (cur.paid_amount || 0);

  const timeline: { title: string; time: string; done?: boolean; active?: boolean }[] = (() => {
    if (!d) return [];
    const s: any[] = [];
    if (cur.booking_date) s.push({ title: "Booking created", time: dt(cur.booking_date), done: true });
    s.push({ title: "Invoice issued", time: dt(cur.issue_date || cur.created_at), done: true });
    const ps = (cur.payment_status || "").toLowerCase();
    if (ps === "paid") s.push({ title: "Payment received", time: dt(cur.paid_at || cur.updated_at || cur.issue_date), done: true });
    else if (ps === "refunded") s.push({ title: "Amount refunded", time: dt(cur.updated_at || cur.issue_date), done: true });
    else if (ps === "failed") s.push({ title: "Payment failed", time: dt(cur.updated_at || cur.issue_date), active: true });
    else if (ps === "cancelled") s.push({ title: "Invoice cancelled", time: dt(cur.updated_at || cur.issue_date), done: true });
    else s.push({ title: "Awaiting payment", time: "", active: true });
    return s;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title={number || cur.invoice_number || "Invoice"} back subtitle={cur.issue_date ? `Issued ${dd(cur.issue_date)}` : undefined} variant="gradient" testID="invoice-detail-header" />
      {isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}><CardSkeleton /><CardSkeleton /><CardSkeleton /></View>
      ) : isError || !d ? (
        <EmptyState icon="file-alert-outline" title="Could not load invoice" subtitle="Please try again in a moment." />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 90, gap: spacing.md }} showsVerticalScrollIndicator={false}>
            {/* Header card */}
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>A</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>AZOAPP · PARTNER</Text>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }} numberOfLines={1}>{partner.name || "—"}</Text>
                  </View>
                </View>
                <InvStatusBadge status={cur.payment_status} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: spacing.md }}>
                <View>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>INVOICE TOTAL</Text>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 30 }}>{money(cur.total_amount)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: fontSize.xs }}>{cur.invoice_number}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{dd(cur.issue_date)}</Text>
                  <InvTypeChip type={cur.invoice_type} />
                </View>
              </View>
            </Card>

            {/* Customer Details */}
            <Section icon="account-outline" title="Customer Details" colors={colors}>
              <Row k="Customer name" v={cust.name || "—"} strong colors={colors} />
              <Row k="Mobile" v={masked ? "•••••" : (cust.phone || cust.mobile || "—")} colors={colors} />
              <Row k="Email" v={masked ? "•••••" : (cust.email || "—")} colors={colors} />
              <Row k="Address" v={masked ? "•••••" : (cust.address || "—")} colors={colors} last />
              {masked ? <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, paddingVertical: 8 }}>🔒 Customer contact hidden after completion for privacy.</Text> : null}
            </Section>

            {/* Booking Details */}
            <Section icon="calendar-blank-outline" title="Booking Details" colors={colors}>
              <Row k="Booking ID" v={cur.booking_code || "—"} colors={colors} />
              {lineItems.length > 0 ? (
                <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>Services</Text>
                  <View style={{ marginTop: 6, gap: 4 }}>
                    {lineItems.map((it, i) => (
                      <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: it.isAddon ? colors.textMuted : colors.text, fontSize: fontSize.sm, fontWeight: it.isAddon ? "500" : "700", flex: 1 }}>{it.isAddon ? "↳ " : ""}{it.desc}{it.qty > 1 ? ` ×${it.qty}` : ""}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>{money(it.amount)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : <Row k="Service" v={cur.service_name || "—"} colors={colors} />}
              {cur.booking_date ? <Row k="Booking date" v={dd(cur.booking_date)} colors={colors} /> : null}
              <Row k="Reference ID" v={cur.booking_code || cur.transaction_id || "—"} colors={colors} />
              {cur.payment_method ? <Row k="Payment method" v={cur.payment_method} colors={colors} last /> : null}
            </Section>

            {/* Payment Summary */}
            <Section icon="wallet-outline" title="Payment Summary" colors={colors}>
              {lineItems.map((it, i) => (
                <Row key={i} k={`${it.isAddon ? "↳ " : ""}${it.desc}${it.qty > 1 ? ` ×${it.qty}` : ""}`} v={money(it.amount)} colors={colors} />
              ))}
              {charges.map((c, i) => <Row key={`c${i}`} k={c.label} v={money(c.amount)} colors={colors} />)}
              <Row k="Subtotal" v={money(cur.subtotal ?? cur.total_amount)} strong colors={colors} />
              {Number(cur.visiting_charge) > 0 ? <Row k="Visiting Charge" v={money(cur.visiting_charge)} colors={colors} /> : null}
              {cur.discount ? <Row k="Discount" v={`− ${money(cur.discount)}`} green colors={colors} /> : null}
              <Row k="Est. Govt. Taxes" v={cur.tax ? money(cur.tax) : "Not applicable"} muted={!cur.tax} colors={colors} />
              <Row k="Total Amount" v={money(cur.total_amount)} strong colors={colors} />
              <Row k="Paid Amount" v={money(paid)} colors={colors} />
              <Row k="Refunded Amount" v={money(cur.refund || 0)} muted={!cur.refund} colors={colors} last />
            </Section>

            {/* Your Earning */}
            {re && re.role === "partner" ? (
              <Section icon="percent-outline" title="Your Earning" colors={colors}>
                <Row k="Service Amount" v={money(re.service_cost != null ? re.service_cost : re.base)} colors={colors} />
                {Number(re.visiting_charge) > 0 && Math.abs((Number(re.service_cost || 0) + Number(re.visiting_charge)) - Number(re.base || 0)) < 0.02 ? <Row k="Visiting Charge" v={money(re.visiting_charge)} colors={colors} /> : null}
                <Row k="Commissionable Amount" v={money(re.base)} strong colors={colors} />
                {re.rate != null ? <Row k="Commission Rate" v={`${re.rate}%`} colors={colors} /> : null}
                <Row k="Partner Earning" v={money(re.commission)} colors={colors} />
                <Row k="Est. Govt. Taxes" v="Excluded" muted colors={colors} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "800" }}>TOTAL PARTNER EARNING</Text>
                  <Text style={{ color: colors.success, fontSize: fontSize.lg, fontWeight: "900" }}>{money(re.net)}</Text>
                </View>
                {re.coupon_code ? (
                  <View style={{ marginTop: 10, backgroundColor: colors.successSubtle, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success + "40", padding: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.success, fontWeight: "800", fontSize: fontSize.xs }}>COUPON {re.coupon_code}</Text>
                      {Number(re.coupon_discount) > 0 ? <Text style={{ color: colors.success, fontWeight: "700", fontSize: fontSize.xs }}>{money(re.coupon_discount)} off</Text> : null}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 }}>{re.coupon_note || "Coupon discount is funded by AzoApp and does not affect Partner earnings."}</Text>
                  </View>
                ) : null}
              </Section>
            ) : null}

            {/* Timeline */}
            <Section icon="history" title="Timeline" colors={colors}>
              <View style={{ paddingVertical: 4 }}>
                {timeline.map((t, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 3, backgroundColor: t.active ? colors.warning : colors.success }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "700" }}>{t.title}</Text>
                      {t.time ? <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{t.time}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          </ScrollView>

          {/* Bottom bar */}
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: spacing.md, padding: spacing.lg, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Pressable testID="inv-download" onPress={() => setPrintOpen(true)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border }}>
              <Icon name="download" size={18} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: "800" }}>Download PDF</Text>
            </Pressable>
            <Pressable testID="inv-share-btn" onPress={share} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.md, backgroundColor: colors.primary }}>
              <Icon name="share-variant" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800" }}>Share Invoice</Text>
            </Pressable>
          </View>

          {/* Print / PDF viewer */}
          <Modal visible={printOpen} animationType="slide" onRequestClose={() => setPrintOpen(false)}>
            <View style={{ flex: 1, backgroundColor: "#fff" }}>
              <AppHeader title="Invoice PDF" subtitle={cur.invoice_number} variant="gradient" testID="invoice-print-header" />
              <View style={{ position: "absolute", top: insets.top + 4, right: 8, zIndex: 10 }}>
                <Pressable onPress={() => setPrintOpen(false)} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="close" size={24} color="#fff" />
                </Pressable>
              </View>
              {print.isLoading || typeof print.data !== "string" ? (
                <View style={{ padding: spacing.lg }}><CardSkeleton /></View>
              ) : Platform.OS === "web" ? (
                // @ts-ignore iframe valid on web
                <iframe title="invoice" srcDoc={print.data} style={{ flex: 1, border: "none", width: "100%", height: "100%" }} />
              ) : (
                <WebView originWhitelist={["*"]} source={{ html: print.data }} style={{ flex: 1 }} startInLoadingState />
              )}
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

function Section({ icon, title, children, colors }: { icon: MdiName; title: string; children: React.ReactNode; colors: any }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Icon name={icon} size={15} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>{title.toUpperCase()}</Text>
      </View>
      <Card>{children}</Card>
    </View>
  );
}

function Row({ k, v, strong, muted, green, last, colors }: { k: string; v: string; strong?: boolean; muted?: boolean; green?: boolean; last?: boolean; colors: any }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, flexShrink: 0 }}>{k}</Text>
      <Text style={{ color: green ? colors.success : strong ? colors.text : muted ? colors.textMuted : colors.textSecondary, fontSize: fontSize.sm, fontWeight: strong ? "800" : "600", textAlign: "right", flex: 1 }}>{v}</Text>
    </View>
  );
}
