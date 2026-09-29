/** Subscription checkout (mobile) — reached from the Booking cart when it holds a
 *  single recurring (Maid) subscription line. Same look & feel as the standard
 *  /book checkout, wired to the /subscriptions endpoints. */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CalendarClock, MapPin, ShieldCheck, CheckCircle2, PartyPopper, ArrowRight, Plus } from "lucide-react-native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "../Toast";
import { openPreparedOrder } from "../../lib/payments";
import { fmt } from "../../lib/format";
import { PRIMARY, EMERALD, TC } from "../../theme";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const todayPlus = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

const Section = ({ title, icon: Icon, children }: any) => (
  <View style={{ borderRadius: 16, borderWidth: 1, borderColor: TC.border, backgroundColor: TC.surface, overflow: "hidden" }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: TC.borderSoft }}>
      {Icon ? <Icon size={16} color={PRIMARY[700]} /> : null}
      <Text style={{ fontSize: 15, fontWeight: "800", color: TC.text }}>{title}</Text>
    </View>
    <View style={{ padding: 16 }}>{children}</View>
  </View>
);

export function SubscriptionCheckout({ item }: { item: any }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { clear } = useCart();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addrId, setAddrId] = useState("");
  const [startDate, setStartDate] = useState(todayPlus(1));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get<any[]>("/auth/addresses").then((as) => {
      const list = as || [];
      setAddresses(list);
      setAddrId((cur) => cur || (list.find((a: any) => a.is_default) || list[0])?.id || "");
    }).catch(() => {});
  }, [user]);

  const total = Number(item.plan_price) || 0;

  const placeOrder = async () => {
    if (!user) { toast.info("Please log in to continue"); router.push("/login" as any); return; }
    if (!addrId) return toast.error("Please select a service address");
    setBusy(true);
    try {
      const sub = await api.post<any>("/subscriptions", { service_id: item.service_id, plan_type: item.plan_type, start_date: startDate, preferred_time: time, address_id: addrId });
      const order = await api.post<any>(`/subscriptions/${sub.id}/pay/order`);
      const ok = await openPreparedOrder(order, { purpose: "subscription", subscriptionId: sub.id, toast });
      if (ok) { clear(); setPlaced(true); }
      else { toast.info("Payment was not completed. You can try again."); }
    } catch (e: any) {
      toast.error(e?.detail || e?.message || "Booking failed, please try again");
    } finally { setBusy(false); }
  };

  if (placed) {
    return (
      <View style={{ flex: 1, backgroundColor: TC.bg, alignItems: "center", justifyContent: "center", padding: 24, paddingTop: insets.top }}>
        <View style={{ height: 80, width: 80, borderRadius: 40, backgroundColor: EMERALD[500], alignItems: "center", justifyContent: "center", marginBottom: 20 }}><PartyPopper size={40} color="#fff" /></View>
        <Text testID="sub-checkout-success" style={{ fontSize: 24, fontWeight: "900", color: TC.text }}>Booking confirmed!</Text>
        <Text style={{ fontSize: 14, color: TC.textMuted, marginTop: 8, textAlign: "center", maxWidth: 320 }}>Your {item.plan_label} plan for {item.name} is booked &amp; paid · {fmt(total)}. We're assigning a verified professional.</Text>
        <Pressable testID="sub-go-subscriptions" onPress={() => router.replace("/(customer)/subscriptions" as any)} style={{ marginTop: 24, height: 48, paddingHorizontal: 28, borderRadius: 12, backgroundColor: PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>View my subscriptions</Text><ArrowRight size={16} color="#fff" /></Pressable>
        <Pressable onPress={() => router.replace("/(site)/services" as any)} style={{ marginTop: 14 }}><Text style={{ color: TC.textMuted, fontWeight: "600" }}>Book more services</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: TC.bg }} testID="subscription-checkout">
      <View style={{ paddingTop: insets.top + 8, backgroundColor: TC.surface, borderBottomWidth: 1, borderBottomColor: "rgba(226,232,240,0.7)" }}>
        <View style={{ height: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable testID="sub-checkout-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)" as any))} style={{ height: 36, width: 36, borderRadius: 12, borderWidth: 1, borderColor: TC.border, alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} color={TC.textMuted} /></Pressable>
          <View><Text style={{ fontSize: 18, fontWeight: "800", color: TC.text }}>Confirm your booking</Text><Text style={{ fontSize: 11, color: TC.textFaint, marginTop: 2 }}>Recurring subscription</Text></View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160, gap: 12 }} showsVerticalScrollIndicator={false}>
        <Section title="Your plan" icon={CalendarClock}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ height: 56, width: 56, borderRadius: 12, backgroundColor: TC.surfaceAlt, overflow: "hidden" }}>{item.image ? <Image source={{ uri: item.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ alignSelf: "flex-start", backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 11, fontWeight: "700", color: EMERALD[700] }}>Recurring Subscription</Text></View>
              <Text style={{ fontWeight: "700", color: TC.text, marginTop: 4 }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 2 }}>{item.plan_label} plan{item.working_days ? ` · ${item.working_days} working days` : ""}{item.duration_days ? ` · ${item.duration_days}-day period` : ""}{(item.weekly_offs || []).length ? ` · ${(item.weekly_offs || []).map((d: number) => WD[d]).join(", ")} off` : ""}</Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: "800", color: TC.text }}>{fmt(total)}</Text>
          </View>
        </Section>

        <Section title="When should we start?" icon={CalendarClock}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TC.textMuted, fontSize: 11, marginBottom: 4 }}>Start date</Text>
              <TextInput testID="sub-start-date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={TC.textFaint} style={{ height: 44, borderWidth: 1, borderColor: TC.border, borderRadius: 12, paddingHorizontal: 12, color: TC.text }} />
            </View>
            <View style={{ width: 110 }}>
              <Text style={{ color: TC.textMuted, fontSize: 11, marginBottom: 4 }}>Time</Text>
              <TextInput testID="sub-time-input" value={time} onChangeText={setTime} placeholder="09:00" placeholderTextColor={TC.textFaint} style={{ height: 44, borderWidth: 1, borderColor: TC.border, borderRadius: 12, paddingHorizontal: 12, color: TC.text }} />
            </View>
          </View>
        </Section>

        <Section title="Service address" icon={MapPin}>
          {addresses.length === 0 ? (
            <Pressable testID="sub-add-address-link" onPress={() => router.push("/(customer)/addresses" as any)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Plus size={14} color={PRIMARY[700]} /><Text style={{ color: PRIMARY[700], fontWeight: "700", fontSize: 13 }}>Add a service address</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 8 }}>
              {addresses.map((a) => {
                const on = a.id === addrId;
                return (
                  <Pressable key={a.id} testID={`sub-address-${a.id}`} onPress={() => setAddrId(a.id)} style={{ flexDirection: "row", gap: 10, alignItems: "center", borderWidth: on ? 2 : 1, borderColor: on ? PRIMARY[700] : TC.border, borderRadius: 12, padding: 12, backgroundColor: on ? PRIMARY[50] : TC.surface }}>
                    <MapPin size={16} color={PRIMARY[700]} />
                    <Text style={{ color: TC.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{a.label ? `${a.label} · ` : ""}{a.line || a.address_line || `${a.city || ""} ${a.pincode || ""}`}</Text>
                    {on ? <CheckCircle2 size={16} color={PRIMARY[700]} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>

        <Section title="Price details" icon={ShieldCheck}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: TC.textMuted, fontSize: 14 }}>{item.plan_label} plan</Text><Text style={{ color: TC.text2, fontSize: 14, fontWeight: "500" }}>{fmt(total)}</Text></View>
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: TC.borderSoft, flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: TC.text, fontWeight: "700" }}>Total payable</Text><Text style={{ color: TC.text, fontWeight: "800" }}>{fmt(total)}</Text></View>
          <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: EMERALD[600], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "700", color: "#065F46" }}>100% Secure &amp; Refundable</Text><Text style={{ fontSize: 11, color: EMERALD[700] }}>Attendance captured daily · easy cancellations</Text></View>
          </View>
        </Section>
      </ScrollView>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: TC.surface, borderTopWidth: 1, borderTopColor: TC.border, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 11, color: TC.textFaint, fontWeight: "500" }}>Total payable</Text><Text style={{ fontSize: 20, fontWeight: "800", color: TC.text }}>{fmt(total)}</Text></View>
        <Pressable testID="sub-confirm-pay-btn" onPress={placeOrder} disabled={busy || !addrId} style={({ pressed }) => ({ height: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: pressed ? EMERALD[700] : EMERALD[600], flexDirection: "row", alignItems: "center", gap: 6, opacity: busy || !addrId ? 0.6 : 1 })}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{busy ? "Processing…" : "Confirm & Pay"}</Text><ShieldCheck size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
