import { TC } from "@/src/theme";
/** PaymentWebViewHost — renders the active gateway's checkout inside a full-screen
 *  WebView modal and resolves runPayment()'s promise. Handles all gateway shapes the
 *  backend returns from POST /payments/order:
 *    - razorpay_sdk : checkout.js → handler postMessage → POST /payments/verify
 *    - cashfree_sdk : cashfree v3 SDK (redirectTarget _self) → /payment/return → confirm-return
 *    - form_post    : signed PayU form auto-submit → surl → confirm-return
 *    - redirect     : Easebuzz/Juspay hosted page → /payment/return → confirm-return
 *  Mounted ONCE at the app root (app/_layout.tsx). */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { setPaymentOpener, PayContext } from "../lib/payments";

const RETURN_HINTS = ["/payment/return", "payu-callback", "easebuzz-callback"];

const escapeJs = (v: any) => JSON.stringify(v ?? "");

function buildHtml(order: any, user: any): string | null {
  const name = "AzoApp";
  const contact = String(user?.phone || "").replace("+91", "");
  const email = String(user?.email || "");
  const uname = String(user?.name || "");
  if (order.method === "form_post") {
    const inputs = Object.entries(order.fields || {})
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v ?? "").replace(/"/g, "&quot;")}"/>`)
      .join("");
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
      <body onload="document.forms[0].submit()"><form method="POST" action="${order.action}">${inputs}</form>
      <p style="font-family:sans-serif;text-align:center;margin-top:40px">Redirecting to secure payment…</p></body></html>`;
  }
  if (order.method === "cashfree_sdk") {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
      <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script></head>
      <body><p style="font-family:sans-serif;text-align:center;margin-top:40px">Opening secure payment…</p>
      <script>
        try {
          var cf = Cashfree({ mode: ${escapeJs(order.cf_mode || "sandbox")} });
          cf.checkout({ paymentSessionId: ${escapeJs(order.payment_session_id)}, redirectTarget: "_self" });
        } catch (e) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error" })); }
      </script></body></html>`;
  }
  // Default: Razorpay in-page SDK.
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
    <body><p style="font-family:sans-serif;text-align:center;margin-top:40px">Opening secure payment…</p>
    <script>
      var opts = {
        key: ${escapeJs(order.key_id)}, amount: ${escapeJs(order.amount)}, currency: ${escapeJs(order.currency || "INR")},
        order_id: ${escapeJs(order.order_id)}, name: ${escapeJs(name)}, description: ${escapeJs("Service payment")},
        prefill: { name: ${escapeJs(uname)}, email: ${escapeJs(email)}, contact: ${escapeJs(contact)} },
        theme: { color: "#0D47A1" },
        handler: function (res) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "razorpay", order_id: res.razorpay_order_id, payment_id: res.razorpay_payment_id, signature: res.razorpay_signature })); },
        modal: { ondismiss: function () { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" })); } }
      };
      try { var rzp = new Razorpay(opts); rzp.open(); }
      catch (e) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error" })); }
    </script></body></html>`;
}

export function PaymentWebViewHost() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const ctxRef = useRef<PayContext | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const settledRef = useRef(false);

  const close = useCallback((ok: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    const r = resolveRef.current; resolveRef.current = null;
    setOrder(null);
    r?.(ok);
  }, []);

  useEffect(() => {
    setPaymentOpener((ord, ctx) => new Promise<boolean>((resolve) => {
      settledRef.current = false;
      ctxRef.current = ctx;
      resolveRef.current = resolve;
      setOrder(ord);
    }));
    return () => setPaymentOpener(null);
  }, []);

  const confirmReturn = useCallback(async () => {
    const ord = order; const ctx = ctxRef.current;
    try {
      const d: any = ctx?.purpose === "subscription"
        ? await api.post(`/subscriptions/${ctx?.subscriptionId}/pay/confirm`, { order_id: ord?.order_id, gw: ord?.gateway })
        : await api.post("/payments/confirm-return", { gw: ord?.gateway, order_id: ord?.order_id });
      const paid = ctx?.purpose === "subscription" ? !!(d && (d.payment_status === "paid" || d.id)) : !!d?.paid;
      if (paid) { ctx?.toast?.success?.("Payment successful"); close(true); }
      else { ctx?.toast?.error?.("Payment not completed. If money was debited it will reflect shortly."); close(false); }
    } catch (e: any) { ctx?.toast?.error?.(e?.message || "Could not confirm payment"); close(false); }
  }, [order, close]);

  const onMessage = useCallback(async (e: any) => {
    let msg: any = {};
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    const ctx = ctxRef.current;
    if (msg.type === "razorpay") {
      try {
        if (ctx?.purpose === "subscription") {
          await api.post(`/subscriptions/${ctx?.subscriptionId}/pay/verify`, { order_id: msg.order_id, payment_id: msg.payment_id, signature: msg.signature });
        } else {
          await api.post("/payments/verify", { order_id: msg.order_id, payment_id: msg.payment_id, signature: msg.signature, purpose: ctx?.purpose, booking_id: ctx?.bookingId, group_id: ctx?.groupId, amount: ctx?.amount });
        }
        ctx?.toast?.success?.("Payment successful");
        close(true);
      } catch (err: any) { ctx?.toast?.error?.(err?.detail || err?.message || "Payment verification failed"); close(false); }
    } else if (msg.type === "dismiss") {
      close(false);
    } else if (msg.type === "error") {
      ctx?.toast?.error?.("Could not load the payment gateway"); close(false);
    }
  }, [close]);

  const onNav = useCallback((navState: any) => {
    const url: string = navState?.url || "";
    if (RETURN_HINTS.some((h) => url.includes(h))) { confirmReturn(); }
  }, [confirmReturn]);

  if (!order) return null;
  const html = buildHtml(order, user);
  const source = order.method === "redirect" && order.payment_url ? { uri: order.payment_url } : { html: html || "", baseUrl: "https://checkout.local/" };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={() => close(false)}>
      <View style={{ flex: 1, backgroundColor: TC.surface, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, height: 52, borderBottomWidth: 1, borderBottomColor: TC.border }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: TC.text }}>Secure Payment</Text>
          <Pressable testID="pay-close" onPress={() => close(false)} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: TC.surfaceAlt }}>
            <X size={20} color="#0F172A" />
          </Pressable>
        </View>
        <WebView
          testID="payment-webview"
          source={source as any}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          onNavigationStateChange={onNav}
          startInLoadingState
          renderLoading={() => <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color="#0D47A1" /></View>}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}
