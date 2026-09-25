/** Offers page — all active offers + coupons (GET /site/promotions), same copy-to-checkout behaviour as web. */
import React from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, BadgePercent, Copy, Ticket } from "lucide-react-native";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, AMBER, EMERALD } from "../../src/theme";
import { storage } from "../../src/utils/storage";
import { useToast } from "../../src/components/Toast";
import { fmt } from "../../src/lib/format";

export default function OffersPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const q = useQuery({ queryKey: ["promotions"], queryFn: () => api.get<any>("/site/promotions"), staleTime: 60_000 });
  const offers: any[] = q.data?.offers || [];
  const coupons: any[] = q.data?.coupons || [];
  const grab = async (code: string) => { await Clipboard.setStringAsync(code); storage.setItem("azo_coupon", code); toast.success(`Coupon ${code} copied — apply at checkout`); };
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }} testID="offers-page">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: SLATE[200] }}>
        <Pressable testID="offers-back" onPress={() => router.back()} style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: SLATE[100] }}><ArrowLeft size={18} color={SLATE[700]} /></Pressable>
        <BadgePercent size={20} color={AMBER[500]} />
        <Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>Offers & Savings</Text>
      </View>
      {q.isLoading ? <ActivityIndicator color={PRIMARY[700]} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
          {offers.map((o) => (
            <LinearGradient key={o.id} colors={[PRIMARY[600], PRIMARY[800]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 16 }} testID={`offers-offer-${o.id}`}>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" }}>{o.title}</Text>
              <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 2 }}>{o.discount_label || `${o.discount}% OFF`}</Text>
              {o.subtitle ? <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 }}>{o.subtitle}</Text> : null}
              {o.code ? (
                <Pressable testID={`offers-copy-${o.code}`} onPress={() => grab(o.code)} style={{ marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 12, height: 36 }}>
                  <Text style={{ fontWeight: "800", color: PRIMARY[700], fontSize: 13 }}>{o.code}</Text><Copy size={14} color={PRIMARY[700]} />
                </Pressable>
              ) : null}
            </LinearGradient>
          ))}
          {coupons.length ? <Text style={{ fontSize: 15, fontWeight: "800", color: SLATE[900], marginTop: 8 }}>Coupons</Text> : null}
          {coupons.map((c) => (
            <View key={c.code} testID={`offers-coupon-${c.code}`} style={{ borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: EMERALD[50], alignItems: "center", justifyContent: "center" }}><Ticket size={18} color={EMERALD[600]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: SLATE[900] }}>{c.label || c.code}</Text>
                <Text style={{ fontSize: 11, color: SLATE[500], marginTop: 2 }}>{c.description || (c.min_order ? `Min order ${fmt(c.min_order)}` : "No minimum order")}</Text>
              </View>
              <Pressable testID={`offers-coupon-copy-${c.code}`} onPress={() => grab(c.code)} style={{ borderWidth: 1, borderColor: PRIMARY[600], borderStyle: "dashed", borderRadius: 8, paddingHorizontal: 10, height: 32, justifyContent: "center" }}><Text style={{ fontSize: 12, fontWeight: "800", color: PRIMARY[700] }}>{c.code}</Text></Pressable>
            </View>
          ))}
          {!offers.length && !coupons.length ? <Text style={{ color: SLATE[500], textAlign: "center", marginTop: 40 }}>No offers right now. Check back soon!</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}
