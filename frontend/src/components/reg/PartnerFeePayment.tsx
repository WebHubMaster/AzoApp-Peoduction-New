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
import React, { useRef, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShieldCheck, ListChecks, Bell, LayoutGrid, ChevronLeft, User as UserIcon } from "lucide-react-native";
import { api } from "@/src/api/client";
import { TW, T } from "@/src/components/reg/tokens";
import { WButton } from "@/src/components/reg/Fields";
import { useBrand } from "@/src/context/BrandContext";
import {
  C, FeeHeader, FeeProgress, FeeHero, FeeCard, FeeIncluded, FeeNotice, FeeError, PayBar, FeeOverlay,
} from "@/src/components/reg/PartnerFeeParts";

const HERO = require("../../../assets/partner-hero.png");
const PAY_METHODS = require("../../../assets/pay-methods.png");

const RB = "/partner/registration";
const BLUE = C.blue;
const INK = C.ink;

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
  const insets = useSafeAreaInsets();
  const brand = useBrand();
  const lock = useRef(false);
  const [barH, setBarH] = useState(150);
  const [success, setSuccess] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [checkout, setCheckout] = useState<{ html?: string; url?: string; order: any; kind: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  if (!fee) return null;
  const amount = Number(fee.final_amount || 0);
  const headerLogo = brand?.branding?.logo || brand?.branding?.logo_light || brand?.branding?.logo_dark || "";

  // verified by backend → brief success transition, then the existing onPaid flow
  const finish = () => { setCheckout(null); setSuccess(true); setTimeout(() => { setSuccess(false); onPaid(); }, 900); };

  const payAndContinue = async () => {
    if (lock.current) return;
    lock.current = true;
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
      lock.current = false;
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

  const busy = paying || verifying || success;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#fff" }} testID="partner-fee-payment-page">
        <FeeHeader logo={headerLogo} siteName={brand?.branding?.site_name} tagline={brand?.branding?.tagline}
          onBack={() => { if (!busy) onClose(); }} topInset={insets.top} />

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: barH + 24 }} showsVerticalScrollIndicator={false}>
          <FeeProgress />
          <FeeHero hero={HERO} />
          <FeeCard fee={fee} amount={amount} />
          {payError ? <FeeError message={payError} onRetry={payAndContinue} busy={busy} /> : null}
          <FeeIncluded items={INCLUDED} />
          <FeeNotice />
        </ScrollView>

        <PayBar amount={amount} busy={busy} retry={!!payError} onPay={payAndContinue} payMethods={PAY_METHODS}
          bottomInset={insets.bottom} onLayout={setBarH} />

        {paying || success ? <FeeOverlay mode={success ? "success" : "processing"} /> : null}

        {/* gateway checkout */}
        <Modal visible={!!checkout} animationType="slide" onRequestClose={() => { if (!verifying) setCheckout(null); }} statusBarTranslucent>
          <View style={{ flex: 1, backgroundColor: "#fff" }} testID="fee-checkout-webview">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: TW.slate100 }}>
              <Pressable onPress={() => { if (!verifying) setCheckout(null); }} hitSlop={8} accessibilityLabel="Close checkout"><ChevronLeft size={22} color={TW.slate700} /></Pressable>
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
              <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 16, borderTopWidth: 1, borderTopColor: TW.slate100 }}>
                <WButton title={verifying ? "Verifying…" : "I've completed the payment"} variant="emerald" full height={52} loading={verifying} onPress={verifyHosted} testID="fee-verify-btn" />
              </View>
            ) : null}
            {verifying && checkout?.kind !== "hosted" ? <FeeOverlay mode="processing" /> : null}
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
