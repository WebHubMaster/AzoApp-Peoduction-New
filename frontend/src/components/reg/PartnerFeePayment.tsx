/**
 * Partner Registration Fee — payment screen (mobile parity with the web panel).
 * Shown ONLY when the admin has the one-time registration fee ACTIVE and the
 * partner has not paid yet. Design matches the AzoApp "Complete Your Registration"
 * reference (admin brand logo header, hero provider, fee card, Pay & Continue).
 *   • razorpay_sdk → Razorpay Standard Checkout inside a WebView
 *   • redirect      → open payment_url in a WebView, then verify
 *   • form_post     → auto-submit form in a WebView, then verify
 * No dev-mock bypass — the ACTIVE gateway processes the fee.
 */
import React, { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import {
  FileText, ShieldCheck, ListChecks, Bell, LayoutGrid, Info, ArrowRight, Lock,
  ChevronLeft, TriangleAlert, User as UserIcon,
} from "lucide-react-native";
import { api } from "@/src/api/client";
import { TW, T } from "@/src/components/reg/tokens";
import { WButton } from "@/src/components/reg/Fields";
import { useBrand } from "@/src/context/BrandContext";

const HERO = require("../../../assets/partner-hero.png");
const PAY_METHODS = require("../../../assets/pay-methods.png");

const RB = "/partner/registration";
const BLUE = "#0D47A1";
const INK = "#0D1B2A";
const TINT = "#EAF1FB";

// "Partner" (not "Provider") wording per brand.
const INCLUDED: [any, string, string][] = [
  [UserIcon, "Partner account activation", "Activate your partner account on AzoApp"],
  [ShieldCheck, "Profile verification & onboarding", "Verify your details and complete onboarding process"],
  [ListChecks, "Service listing activation", "List your services and make them live"],
  [Bell, "Start receiving work opportunities", "Get job notifications from customers in your area"],
  [LayoutGrid, "Partner dashboard access", "Access your dashboard to manage bookings"],
];

const esc = (v: any) => String(v ?? "").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function formPostHtml(action: string, params: Record<string, any>): string {
  const inputs = Object.entries(params || {})
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}"/>`)
    .join("");
  return `<!doctype html><html><body onload="document.forms[0].submit()"><form method="post" action="${esc(action)}">${inputs}</form></body></html>`;
}

function razorpayHtml(order: any, customer: any): string {
  const opts = {
    key: order.key_id,
    amount: order.amount,
    currency: order.currency || "INR",
    name: "AzoApp Registration",
    description: "Partner registration fee",
    order_id: order.order_id,
    prefill: { name: customer?.name || "", email: customer?.email || "", contact: customer?.phone || "" },
    theme: { color: BLUE },
  };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;background:#fff">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var send = function(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  try {
    var options = ${JSON.stringify(opts)};
    options.handler = function(r){ send({ type: "success", payment_id: r.razorpay_payment_id, order_id: r.razorpay_order_id, signature: r.razorpay_signature }); };
    options.modal = { ondismiss: function(){ send({ type: "dismiss" }); } };
    var rzp = new Razorpay(options);
    rzp.on("payment.failed", function(resp){ send({ type: "failed", message: (resp.error && resp.error.description) || "Payment failed" }); });
    rzp.open();
  } catch(e){ send({ type: "failed", message: String(e) }); }
</script>
</body></html>`;
}

export function PartnerFeePayment({
  fee, visible, onClose, onPaid, customer,
}: {
  fee: any;
  visible: boolean;
  onClose: () => void;
  onPaid: () => void;
  customer?: { name?: string; email?: string; phone?: string };
}) {
  const { width: W } = useWindowDimensions();
  const brand = useBrand();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [checkout, setCheckout] = useState<{ html?: string; url?: string; order: any; kind: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  if (!fee) return null;
  const amount = Math.round(fee.final_amount || 0);
  const headerLogo = brand?.branding?.logo || brand?.branding?.logo_light || brand?.branding?.logo_dark || "";

  // responsive hero sizing
  const heroW = Math.max(128, Math.min(W * 0.4, 168));
  const heroH = heroW * 1.16;
  const circleD = heroW * 0.94;

  const finish = () => { setCheckout(null); onPaid(); };

  const payAndContinue = async () => {
    setPaying(true);
    setPayError("");
    try {
      const order = await api.post<any>(`${RB}/pay/create-order`);
      const method = order?.method;
      if (method === "razorpay_sdk") {
        setCheckout({ html: razorpayHtml(order, customer), order, kind: "razorpay" });
      } else if (method === "redirect" && order.payment_url) {
        setCheckout({ url: order.payment_url, order, kind: "hosted" });
      } else if (method === "form_post" && order.action) {
        setCheckout({ html: formPostHtml(order.action, order.params || {}), order, kind: "hosted" });
      } else {
        setPayError("This gateway's in-app checkout isn't available in this build. Please complete the payment from the web panel.");
      }
    } catch (e: any) {
      setPayError(e?.detail || "Payment could not be started. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const onCheckoutMessage = async (raw: string) => {
    let msg: any = {};
    try { msg = JSON.parse(raw); } catch { return; }
    if (!checkout) return;
    if (msg.type === "success") {
      setVerifying(true);
      try {
        const res = await api.post<any>(`${RB}/pay/confirm`, {
          order_id: msg.order_id || checkout.order.order_id, gateway: "razorpay",
          payment_id: msg.payment_id, signature: msg.signature,
        });
        if (res?.ok) { finish(); }
        else { setPayError("Payment could not be verified. Please try again."); setCheckout(null); }
      } catch (e: any) {
        setPayError(e?.detail || "Payment could not be verified. Please try again.");
        setCheckout(null);
      } finally { setVerifying(false); }
    } else if (msg.type === "failed") {
      setPayError(msg.message || "Payment failed. Please try again."); setCheckout(null);
    } else if (msg.type === "dismiss") {
      setCheckout(null);
    }
  };

  const verifyHosted = async () => {
    if (!checkout) return;
    setVerifying(true);
    setPayError("");
    try {
      const res = await api.post<any>(`${RB}/pay/confirm`, { order_id: checkout.order.order_id, gateway: checkout.order.gateway, mode: checkout.order.mode });
      if (res?.ok) { finish(); }
      else { setPayError("Payment was not completed. Please try again."); }
    } catch (e: any) {
      setPayError(e?.detail || "Payment was not completed. Please try again.");
    } finally { setVerifying(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#fff" }} testID="partner-fee-payment-page">
        {/* header — admin brand logo (from Branding & Theme) */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 48, paddingBottom: 8 }}>
          <Pressable testID="fee-pay-back" onPress={() => { if (!paying) onClose(); }} hitSlop={8}
            style={{ height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={24} color={INK} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            {headerLogo ? (
              <Image testID="fee-brand-logo" source={{ uri: headerLogo }} style={{ height: 40, width: 168 }} contentFit="contain" transition={150} />
            ) : (
              <View style={{ alignItems: "center" }}>
                <Text style={{ ...T.lg, fontWeight: "800", color: BLUE }}>{brand?.branding?.site_name || "AzoApp"}</Text>
                <Text style={{ ...T.xs, color: TW.slate400, marginTop: -2 }}>{brand?.branding?.tagline || "Service at Your Doorstep"}</Text>
              </View>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 220 }} showsVerticalScrollIndicator={false}>
          {/* title + hero provider */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 16 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "800", color: INK }}>Complete Your Registration</Text>
              <Text style={{ ...T.base, color: TW.slate500, marginTop: 12, lineHeight: 22 }}>
                Pay the one-time processing fee to activate your partner account and start receiving service opportunities in your area.
              </Text>
            </View>
            <View style={{ width: heroW, height: heroH, alignItems: "center", justifyContent: "flex-end" }}>
              <View style={{ position: "absolute", top: 0, width: circleD, height: circleD, borderRadius: circleD / 2, backgroundColor: TINT }} />
              <Image source={HERO} style={{ width: heroW, height: heroH }} contentFit="contain" contentPosition="bottom" testID="fee-hero-provider" />
            </View>
          </View>

          {/* fee card */}
          <View style={{ marginTop: 20, borderRadius: 24, padding: 20, flexDirection: "row", alignItems: "flex-start", gap: 16, backgroundColor: TINT }}>
            <View style={{ height: 56, width: 56, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
              <FileText size={28} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: INK }}>Registration Fee</Text>
              <Text style={{ ...T.sm, color: TW.slate500 }}>One-Time Processing Fee</Text>
              <Text testID="fee-amount" style={{ fontSize: 44, fontWeight: "900", color: BLUE, marginTop: 4 }}>₹{amount}</Text>
              {fee.discount_amount > 0 ? (
                <Text style={{ ...T.sm, marginTop: 2 }}>
                  <Text style={{ textDecorationLine: "line-through", color: TW.slate400 }}>₹{Math.round(fee.original_price)}</Text>
                  <Text style={{ color: TW.emerald600, fontWeight: "700" }}>  Save ₹{Math.round(fee.discount_amount)}</Text>
                </Text>
              ) : null}
              <View style={{ marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.7)", paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ ...T.sm, fontWeight: "700", color: BLUE }}>One-time payment</Text>
                <Text style={{ color: TW.slate300 }}>|</Text>
                <Text style={{ ...T.sm, fontWeight: "700", color: BLUE }}>No monthly charges</Text>
              </View>
            </View>
          </View>

          {/* what's included */}
          <Text style={{ fontSize: 22, fontWeight: "800", color: INK, marginTop: 28 }}>What&rsquo;s Included?</Text>
          <View style={{ marginTop: 16, gap: 16 }}>
            {INCLUDED.map(([Icon, t, d]) => (
              <View key={t} style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
                <View style={{ height: 44, width: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: TINT }}>
                  <Icon size={20} color={BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...T.base, fontWeight: "700", color: INK }}>{t}</Text>
                  <Text style={{ ...T.sm, color: TW.slate500, lineHeight: 20 }}>{d}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 24, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: TINT }}>
            <Info size={20} color={BLUE} style={{ marginTop: 2 }} />
            <Text style={{ ...T.sm, color: INK, flex: 1, lineHeight: 20 }}>
              <Text style={{ fontWeight: "800" }}>This is a one-time processing fee. </Text>
              <Text style={{ color: TW.slate500 }}>There are no monthly registration charges or hidden fees.</Text>
            </Text>
          </View>

          {payError ? (
            <View testID="fee-pay-error" style={{ marginTop: 20, borderRadius: 12, backgroundColor: "#FFF1F2", borderWidth: 1, borderColor: "#FECDD3", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <TriangleAlert size={16} color="#BE123C" style={{ marginTop: 2 }} />
              <Text style={{ ...T.sm, color: "#BE123C", flex: 1 }}>{payError}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* sticky pay bar */}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, backgroundColor: "rgba(255,255,255,0.98)", borderTopWidth: 1, borderTopColor: TW.slate100 }}>
          <Pressable testID="fee-pay-btn" onPress={payAndContinue} disabled={paying}
            style={{ height: 56, borderRadius: 18, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: paying ? 0.7 : 1 }}>
            {paying ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>{payError ? "Retry Payment" : `Pay ₹${amount} & Continue`}</Text>
                <ArrowRight size={20} color="#fff" />
              </>
            )}
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 }}>
            <Lock size={14} color={TW.slate400} />
            <Text style={{ ...T.xs, color: TW.slate400 }}>Secure Payment · 100% Safe &amp; Secure</Text>
          </View>
          <Image source={PAY_METHODS} style={{ width: "82%", height: 24, alignSelf: "center", marginTop: 10 }} contentFit="contain" testID="fee-pay-methods" />
        </View>

        {/* gateway checkout */}
        <Modal visible={!!checkout} animationType="slide" onRequestClose={() => setCheckout(null)}>
          <View style={{ flex: 1, backgroundColor: "#fff" }} testID="fee-checkout-webview">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 48, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: TW.slate100 }}>
              <Pressable onPress={() => setCheckout(null)} hitSlop={8}><ChevronLeft size={22} color={TW.slate700} /></Pressable>
              <Text style={{ ...T.base, fontWeight: "800", color: INK }}>Secure Checkout</Text>
              <View style={{ width: 22 }} />
            </View>
            {checkout ? (
              <WebView
                source={checkout.url ? { uri: checkout.url } : { html: checkout.html || "" }}
                originWhitelist={["*"]}
                javaScriptEnabled
                domStorageEnabled
                onMessage={(e) => onCheckoutMessage(e.nativeEvent.data)}
                startInLoadingState
                renderLoading={() => <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />}
                style={{ flex: 1 }}
              />
            ) : null}
            {checkout?.kind === "hosted" ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: TW.slate100 }}>
                <WButton title={verifying ? "Verifying…" : "I've completed the payment"} variant="emerald" full height={52} loading={verifying} onPress={verifyHosted} testID="fee-verify-btn" />
              </View>
            ) : verifying ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}><ActivityIndicator color={BLUE} /><Text style={{ ...T.sm, color: TW.slate500, marginTop: 6 }}>Verifying payment…</Text></View>
            ) : null}
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
