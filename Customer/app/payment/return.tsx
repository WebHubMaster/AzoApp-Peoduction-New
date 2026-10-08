/** Web build landing page after a hosted gateway (PayU / Easebuzz / Juspay / Cashfree
 *  redirect) sends the customer back: confirms the payment, clears the cart, routes on. */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Clock } from "lucide-react-native";
import { TC } from "@/src/theme";
import { useCart } from "@/src/context/CartContext";
import { confirmHosted, PAY_PENDING_KEY } from "@/src/lib/webCheckout";

export default function PaymentReturn() {
  const p = useLocalSearchParams<{ gw?: string; order_id?: string }>();
  const router = useRouter();
  const { clear } = useCart();
  const [state, setState] = useState<"checking" | "paid" | "pending">("checking");
  const [kind, setKind] = useState("booking");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let pending: any = null;
    try { pending = JSON.parse(window.sessionStorage.getItem(PAY_PENDING_KEY) || "null"); } catch { /* ignore */ }
    const orderId = String(p.order_id || pending?.order_id || "");
    const gw = String(p.gw || pending?.gw || "");
    const ctx = pending && pending.order_id === orderId ? pending : {};
    try { clear(); } catch { /* ignore */ }
    if (!orderId) { setState("pending"); return; }
    confirmHosted(ctx, orderId, gw)
      .then((r) => { setKind(r.kind); setState(r.paid ? "paid" : "pending"); })
      .catch(() => setState("pending"))
      .finally(() => { try { window.sessionStorage.removeItem(PAY_PENDING_KEY); } catch { /* ignore */ } });
  }, [p.order_id, p.gw, clear]);

  const dest = kind === "subscription" ? "/(customer)/subscriptions" : "/(customer)/orders";
  return (
    <View testID="payment-return" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: TC.bg }}>
      {state === "checking" ? (
        <>
          <ActivityIndicator size="large" color="#0D47A1" />
          <Text style={{ marginTop: 16, fontSize: 20, fontWeight: "800", color: TC.text }}>Confirming your payment…</Text>
          <Text style={{ marginTop: 6, color: TC.textMuted }}>Please don't close this page.</Text>
        </>
      ) : (
        <>
          {state === "paid" ? <CheckCircle2 size={64} color="#10B981" /> : <Clock size={64} color="#D97706" />}
          <Text testID={state === "paid" ? "payment-return-paid" : "payment-return-pending"} style={{ marginTop: 16, fontSize: 22, fontWeight: "800", color: TC.text, textAlign: "center" }}>
            {state === "paid" ? "Payment successful!" : "Payment not completed"}
          </Text>
          <Text style={{ marginTop: 6, color: TC.textMuted, textAlign: "center", maxWidth: 360 }}>
            {state === "paid" ? "Your booking is confirmed. We're finding the best professional near you." : "If money was debited it will reflect shortly, or you can retry the payment from My Bookings."}
          </Text>
          <Pressable testID="payment-return-continue" onPress={() => router.replace(dest as any)} style={{ marginTop: 20, backgroundColor: "#0D47A1", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 }}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>{kind === "subscription" ? "View my subscriptions" : "View my bookings"}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
