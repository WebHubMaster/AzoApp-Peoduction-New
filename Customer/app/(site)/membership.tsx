/** Membership — port of web_panel/src/pages/customer/Membership.jsx (plans, active banner, buy: free / mock / Razorpay via WebView). */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Crown, Shield, Gem, Check, Sparkles, BadgeCheck, Clock, TrendingDown, X } from "lucide-react-native";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, AMBER, EMERALD } from "../../src/theme";
import { useAuth } from "../../src/context/AuthContext";
import { useToast } from "../../src/components/Toast";
import { fmt } from "../../src/lib/format";

const ICON: Record<string, any> = { crown: Crown, shield: Shield, gem: Gem };

function RazorpaySheet({ order, plan, user, onClose, onSuccess }: any) {
  const insets = useSafeAreaInsets();
  const [WebView, setWebView] = useState<any>(null);
  useEffect(() => { try { setWebView(require("react-native-webview").WebView); } catch {} }, []); // eslint-disable-line @typescript-eslint/no-require-imports
  const html = `<!doctype html><html><body style="margin:0;background:#fff"><script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
    var post=function(m){ if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(m));} else if(window.parent){window.parent.postMessage(JSON.stringify(m),"*");} };
    var rzp=new Razorpay({key:${JSON.stringify(order.key_id)},order_id:${JSON.stringify(order.order_id)},amount:${JSON.stringify(order.amount)},currency:${JSON.stringify(order.currency || "INR")},
      name:"AzoApp Membership",description:${JSON.stringify(plan.name)},prefill:{name:${JSON.stringify(user?.name || "")},contact:${JSON.stringify(user?.phone || "")},email:${JSON.stringify(user?.email || "")}},
      theme:{color:${JSON.stringify(plan.color || "#4f46e5")}},handler:function(r){post({ok:true,resp:r});},modal:{ondismiss:function(){post({ok:false});}}});
    rzp.open();</script></body></html>`;
  const onMessage = (raw: string) => { try { const m = JSON.parse(raw); if (m.ok) onSuccess(m.resp); else onClose(); } catch {} };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const h = (e: any) => { if (typeof e.data === "string") onMessage(e.data); };
    (globalThis as any).addEventListener("message", h);
    return () => (globalThis as any).removeEventListener("message", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: "#fff" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, height: 48 }}>
          <Text style={{ fontWeight: "800", fontSize: 16, color: SLATE[900] }}>Secure payment</Text>
          <Pressable testID="rzp-close" onPress={onClose}><X size={20} color={SLATE[600]} /></Pressable>
        </View>
        {Platform.OS === "web" ? (
          <iframe title="razorpay" srcDoc={html} style={{ flex: 1, border: "none", width: "100%", height: "100%" } as any} />
        ) : WebView ? (
          <WebView originWhitelist={["*"]} source={{ html, baseUrl: "https://checkout.razorpay.com" }} onMessage={(e: any) => onMessage(e.nativeEvent.data)} javaScriptEnabled style={{ flex: 1 }} />
        ) : <ActivityIndicator color={PRIMARY[700]} style={{ marginTop: 40 }} />}
      </View>
    </Modal>
  );
}

export default function MembershipPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rzp, setRzp] = useState<any>(null);

  const loadMe = useCallback(async () => {
    if (!user) { setMe(null); return; }
    try { setMe(await api.get("/memberships/me")); } catch {}
  }, [user]);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setPlans((await api.get<any[]>("/memberships/plans", { auth: false })) || []); } catch { toast.error("Failed to load plans"); } finally { setLoading(false); }
      await loadMe();
    })();
  }, [loadMe]); // eslint-disable-line react-hooks/exhaustive-deps

  const activePlanId = me?.active ? me?.membership?.plan_id : null;

  const buy = async (plan: any) => {
    if (!user) { toast.info("Please sign in to buy a membership"); router.push("/login"); return; }
    setBusy(plan.id);
    try {
      const data: any = await api.post("/memberships/order", { plan_id: plan.id });
      if (data.free) { toast.success("Membership activated! 🎉"); await loadMe(); return; }
      if (data.mock) { await api.post("/memberships/mock", { plan_id: plan.id }); toast.success(`${plan.name} activated! 🎉`); await loadMe(); return; }
      setRzp({ order: data, plan });
    } catch (e: any) { toast.error(e?.message || "Purchase failed"); }
    finally { setBusy(null); }
  };
  const verify = async (resp: any) => {
    const plan = rzp.plan; setRzp(null);
    try {
      await api.post("/memberships/verify", { plan_id: plan.id, order_id: resp.razorpay_order_id, payment_id: resp.razorpay_payment_id, signature: resp.razorpay_signature });
      toast.success(`${plan.name} activated! 🎉`); await loadMe();
    } catch { toast.error("Payment verification failed"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }} testID="membership-page">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, height: insets.top + 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(226,232,240,0.5)" }}>
        <Pressable testID="membership-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: SLATE[100] }}><ArrowLeft size={20} color={SLATE[600]} /></Pressable>
        <Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>Membership</Text>
        <Pressable testID="membership-account" onPress={() => router.push(user ? "/(customer)" : "/login")} style={{ marginLeft: "auto", height: 36, paddingHorizontal: 14, borderRadius: 12, backgroundColor: PRIMARY[700], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{user ? "My Account" : "Sign In"}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 36, paddingBottom: 20, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: AMBER[50], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}><Sparkles size={14} color={AMBER[600]} /><Text style={{ fontSize: 11, fontWeight: "700", color: AMBER[600], letterSpacing: 1, textTransform: "uppercase" }}>AzoApp Membership</Text></View>
          <Text style={{ fontSize: 30, fontWeight: "900", color: SLATE[900], marginTop: 16, textAlign: "center", letterSpacing: -0.6 }}>Save more on every booking</Text>
          <Text style={{ fontSize: 14, color: SLATE[500], marginTop: 12, textAlign: "center", lineHeight: 21 }}>Join a membership plan and unlock instant discounts, free visiting charges and priority support — on every home service, all year round.</Text>
        </View>

        {me?.active ? (
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }} testID="my-membership">
            <LinearGradient colors={[me.membership.color || "#4f46e5", "#1e293b"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 20, gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Crown size={32} color="#fff" />
                <View style={{ flex: 1 }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>{me.membership.plan_name} — Active</Text><Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{me.membership.discount_pct}% off every booking · valid till {(me.membership.expires_at || "").slice(0, 10)}</Text></View>
              </View>
              <View style={{ alignItems: "flex-end" }}><View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><TrendingDown size={14} color="rgba(255,255,255,0.7)" /><Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Total saved</Text></View><Text style={{ color: "#fff", fontWeight: "800", fontSize: 24 }}>{fmt(me.total_saved || 0)}</Text></View>
            </LinearGradient>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 20, gap: 20 }} testID="membership-plans">
          {loading ? <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={PRIMARY[700]} /><Text style={{ color: SLATE[400], marginTop: 8 }}>Loading plans…</Text></View>
            : plans.length === 0 ? <Text style={{ paddingVertical: 60, textAlign: "center", color: SLATE[400] }}>No membership plans available right now.</Text>
            : plans.map((p) => {
              const Icon = ICON[p.icon] || Crown;
              const isActive = activePlanId === p.id;
              const popular = (p.badge || "").toLowerCase().includes("popular");
              const save = p.original_price > p.price ? Math.round((1 - p.price / p.original_price) * 100) : 0;
              const benefits: string[] = p.benefits?.length ? p.benefits : [`${p.discount_pct}% off every booking`, p.free_visits > 0 ? `${p.free_visits} free visiting charges` : null, p.priority_support ? "Priority support" : null].filter(Boolean);
              return (
                <View key={p.id} testID={`plan-card-${p.slug}`} style={{ borderRadius: 24, backgroundColor: "#fff", borderWidth: 2, borderColor: popular ? p.color : SLATE[200], padding: 24, marginTop: p.badge ? 10 : 0, boxShadow: popular ? "0px 10px 30px rgba(15,23,42,0.12)" : "0px 1px 2px rgba(15,23,42,0.05)" }}>
                  {p.badge ? <View style={{ position: "absolute", top: -13, alignSelf: "center", backgroundColor: p.color, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 5 }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{p.badge}</Text></View> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ height: 48, width: 48, borderRadius: 16, backgroundColor: p.color, alignItems: "center", justifyContent: "center" }}><Icon size={24} color="#fff" /></View>
                    <View style={{ flex: 1 }}><Text style={{ fontSize: 20, fontWeight: "800", color: SLATE[900] }}>{p.name}</Text><Text style={{ fontSize: 12, color: SLATE[400] }}>{p.tagline}</Text></View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 20 }}>
                    <Text style={{ fontSize: 36, fontWeight: "900", color: SLATE[900], lineHeight: 40 }}>{fmt(p.price)}</Text>
                    {p.original_price > p.price ? <Text style={{ color: SLATE[400], textDecorationLine: "line-through", marginBottom: 6, fontSize: 15 }}>{fmt(p.original_price)}</Text> : null}
                  </View>
                  <Text style={{ fontSize: 12, color: SLATE[400], marginTop: 2 }}>for {p.duration_days} days {save > 0 ? <Text style={{ color: EMERALD[600], fontWeight: "600" }}>· Save {save}%</Text> : null}</Text>
                  <View style={{ marginTop: 16, borderRadius: 12, backgroundColor: EMERALD[50], paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <BadgeCheck size={16} color={EMERALD[700]} /><Text style={{ fontSize: 14, fontWeight: "600", color: EMERALD[700] }}>{p.discount_pct}% off every booking</Text>
                    {p.max_discount_per_booking > 0 ? <Text style={{ fontSize: 11, color: EMERALD[600] }}>(up to {fmt(p.max_discount_per_booking)})</Text> : null}
                  </View>
                  <View style={{ marginTop: 16, gap: 8 }}>
                    {benefits.map((b, i) => <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}><Check size={16} color={EMERALD[500]} style={{ marginTop: 2 }} /><Text style={{ fontSize: 14, color: SLATE[600], flex: 1 }}>{b}</Text></View>)}
                  </View>
                  <Pressable testID={`buy-${p.slug}`} disabled={isActive || busy === p.id} onPress={() => buy(p)} style={{ marginTop: 24, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: isActive ? "#10b981" : p.color, opacity: isActive || busy === p.id ? 0.75 : 1 }}>
                    {busy === p.id ? <><ActivityIndicator size="small" color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Processing…</Text></>
                      : isActive ? <><Check size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Current Plan</Text></>
                      : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{user ? `Get ${p.name}` : "Sign in to buy"}</Text>}
                  </Pressable>
                </View>
              );
            })}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 40, gap: 12 }}>
          {[[BadgeCheck, "Instant activation", "Benefits apply the moment you join"], [Clock, "Auto-applied at checkout", "No coupon codes — discount is automatic"], [Shield, "Secure payments", "Bank-grade Razorpay checkout"]].map(([I, t, s]: any, i) => (
            <View key={i} style={{ borderRadius: 20, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", padding: 20, alignItems: "center" }}>
              <I size={24} color={PRIMARY[700]} />
              <Text style={{ fontWeight: "700", color: SLATE[800], marginTop: 8, fontSize: 15 }}>{t}</Text>
              <Text style={{ fontSize: 12, color: SLATE[400], marginTop: 4 }}>{s}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      {rzp ? <RazorpaySheet order={rzp.order} plan={rzp.plan} user={user} onClose={() => setRzp(null)} onSuccess={verify} /> : null}
    </View>
  );
}
