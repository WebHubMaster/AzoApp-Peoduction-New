/** Live booking tracking — status hero, partner card (call), OTP codes, step timeline, address; refreshes with the 8s poll. */
import React, { useEffect } from "react";
import { View, Text, Pressable, ScrollView, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Phone, MapPin, User, CheckCircle2, Wrench, Navigation, KeyRound, Clock } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCustomerData } from "../../../src/context/CustomerDataContext";
import { useToast } from "../../../src/components/Toast";
import { PRIMARY, SLATE, EMERALD, AMBER, ROSE } from "../../../src/theme";
import { statusText, DONE_STATES } from "../../../src/components/customer/nav";
import { buildSteps, fmtTs } from "../../../src/components/customer/BookingCard";
import { fmt } from "../../../src/lib/format";

const HEAD: Record<string, { t: string; d: string }> = {
  searching: { t: "Finding your partner", d: "We're matching the best verified professional near you" },
  assigned: { t: "Partner assigned", d: "Your partner will start heading over soon" },
  arrived_shop: { t: "Partner is on the way", d: "Picking up parts & heading to you · ETA 15–20 min" },
  arrived_customer: { t: "Partner has arrived", d: "Share your START OTP to begin the work" },
  started: { t: "Work in progress", d: "Your partner is working on the service" },
  completed: { t: "Work completed", d: "Thanks for booking with AzoApp" },
  paid: { t: "Work completed", d: "Thanks for booking with AzoApp" },
  cancelled: { t: "Booking cancelled", d: "This booking was cancelled" },
};

export default function TrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { bookings, load } = useCustomerData();
  const b = bookings.find((x: any) => x.id === id || x.code === id);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  if (!b) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}><Text style={{ color: SLATE[500] }}>Loading booking…</Text></View>;
  const h = HEAD[b.status] || HEAD.searching;
  const done = DONE_STATES.includes(b.status);
  const live = !done && b.status !== "cancelled";
  const steps = buildSteps(b);
  const call = () => {
    if (b.schedule?.comm_locked) { toast.info("Call unlocks 30 minutes before your scheduled time"); return; }
    const phone = b.partner_phone || b.partner?.phone;
    if (phone) Linking.openURL(`tel:${String(phone).replace(/\s/g, "")}`); else toast.info("Partner contact will be shared once a partner is assigned");
  };
  const otpKind = b.status === "started" ? "complete" : ["assigned", "arrived_shop", "arrived_customer"].includes(b.status) ? "start" : null;
  const otp = otpKind === "start" ? b.otps?.start : otpKind === "complete" ? b.otps?.completion : null;
  return (
    <View style={{ flex: 1, backgroundColor: SLATE[50] }} testID="track-page">
      <LinearGradient colors={b.status === "cancelled" ? [ROSE[600], ROSE[500]] : done ? [EMERALD[600], EMERALD[500]] : [PRIMARY[800], PRIMARY[600]]} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable testID="track-back" onPress={() => router.back()} style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} color="#fff" /></Pressable>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" }}>#{b.code} · {b.service_name}</Text>
          {live ? <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 10, height: 26 }}><View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: "#4ADE80" }} /><Text style={{ color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }}>LIVE</Text></View> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 22 }}>
          <View style={{ height: 56, width: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>{done ? <CheckCircle2 size={28} color="#fff" /> : b.status === "searching" ? <Navigation size={26} color="#fff" /> : <Wrench size={26} color="#fff" />}</View>
          <View style={{ flex: 1 }}><Text testID="track-status" style={{ color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.4 }}>{h.t}</Text><Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4, lineHeight: 18 }}>{h.d}</Text></View>
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 20 }}>{steps.map((s) => <View key={s.key} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: s.state === "upcoming" ? "rgba(255,255,255,0.25)" : "#fff" }} />)}</View>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 14 }}>
        {otp ? (
          <View testID={`track-otp-${otpKind}`} style={{ borderRadius: 20, borderWidth: 2, borderColor: otpKind === "start" ? PRIMARY[300] : EMERALD[300], backgroundColor: otpKind === "start" ? PRIMARY[50] : EMERALD[50], padding: 18, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><KeyRound size={14} color={otpKind === "start" ? PRIMARY[700] : EMERALD[700]} /><Text style={{ fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: otpKind === "start" ? PRIMARY[700] : EMERALD[700] }}>{otpKind === "start" ? "Share this OTP to START work" : "Share this OTP to COMPLETE work"}</Text></View>
            <Text testID="track-otp-code" style={{ fontSize: 40, fontWeight: "900", letterSpacing: 12, color: otpKind === "start" ? PRIMARY[700] : EMERALD[700], marginTop: 8 }}>{otp}</Text>
            <Text style={{ fontSize: 12, color: SLATE[500], textAlign: "center" }}>Tell your partner this code only when {otpKind === "start" ? "they arrive & begin" : "the work is done"}.</Text>
          </View>
        ) : null}

        <View testID="track-partner" style={{ borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ height: 52, width: 52, borderRadius: 26, backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center" }}><User size={24} color={PRIMARY[700]} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: SLATE[400], textTransform: "uppercase", letterSpacing: 0.8 }}>Your partner</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: SLATE[900], marginTop: 2 }}>{b.partner_name || "Assigning soon…"}</Text>
            <Text style={{ fontSize: 12, color: SLATE[500] }}>{b.partner_name ? (b.partner_phone ? b.partner_phone : "Verified professional") : "We'll notify you once a partner accepts"}</Text>
          </View>
          {b.partner_id ? <Pressable testID="track-call" onPress={call} style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Phone size={18} color="#fff" /></Pressable> : null}
        </View>

        <View testID="track-steps" style={{ borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], padding: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: SLATE[900], marginBottom: 14 }}>Progress</Text>
          {steps.map((s, i) => (
            <View key={s.key} style={{ flexDirection: "row", gap: 12, paddingBottom: i === steps.length - 1 ? 0 : 18, position: "relative" }}>
              {i < steps.length - 1 ? <View style={{ position: "absolute", left: 13, top: 28, bottom: 0, width: 2, backgroundColor: s.state === "completed" ? EMERALD[400] : SLATE[200] }} /> : null}
              <View style={{ height: 28, width: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: s.state === "completed" ? EMERALD[500] : s.state === "current" ? PRIMARY[600] : SLATE[100], zIndex: 1 }}>{s.state === "completed" ? <CheckCircle2 size={16} color="#fff" /> : <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: s.state === "current" ? "#fff" : SLATE[300] }} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: s.state === "upcoming" ? SLATE[400] : SLATE[900] }}>{s.title}</Text>
                <Text style={{ fontSize: 12, color: SLATE[500] }}>{s.desc}</Text>
                {s.at ? <Text style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{fmtTs(s.at)}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <View style={{ borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Clock size={16} color={SLATE[500]} /><Text style={{ fontSize: 14, color: SLATE[700] }}>{b.schedule_type === "emergency" ? "Emergency · ASAP" : fmtTs(b.scheduled_at)}</Text><Text style={{ marginLeft: "auto", fontSize: 16, fontWeight: "900", color: SLATE[900] }}>{fmt(b.pricing?.total)}</Text></View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}><MapPin size={16} color={SLATE[500]} /><Text style={{ fontSize: 14, color: SLATE[700], flex: 1 }}>{[b.address?.line || b.address?.address, b.address?.city, b.address?.pincode].filter(Boolean).join(", ") || "—"}</Text></View>
          <Text style={{ fontSize: 12, color: SLATE[400] }}>Status: {statusText(b.status)} · Payment: {b.payment_status}</Text>
        </View>

        <Pressable testID="track-open-booking" onPress={() => router.push(`/(customer)/orders?focus=${b.code}` as any)} style={{ height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: PRIMARY[600], alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
          <Text style={{ color: PRIMARY[700], fontWeight: "700", fontSize: 15 }}>Manage booking</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
