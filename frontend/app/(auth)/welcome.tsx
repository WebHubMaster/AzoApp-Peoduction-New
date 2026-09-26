import React, { useEffect } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, MdiName } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { AUTH, BrandRow } from "@/src/components/auth/AuthUi";
import { homeFor, LOGIN_ROLES } from "@/src/components/auth/OtpFlow";

const HERO = require("../../assets/hero-pro.png");
const BG = require("../../assets/auth-welcome-bg.png");

const FEATURES: { icon: MdiName; title: string; sub: string; bg: string; fg: string }[] = [
  { icon: "shield-check", title: "Verified", sub: "Professionals", bg: "#DCFCE7", fg: "#16A34A" },
  { icon: "lightning-bolt", title: "Fast", sub: "Service", bg: "#DBEAFE", fg: "#2563EB" },
  { icon: "currency-inr", title: "Affordable", sub: "Pricing", bg: "#FEF3C7", fg: "#D97706" },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { user, booting } = useAuth();
  const { width, height } = useWindowDimensions();
  const heroH = Math.max(430, Math.min(520, height * 0.56));

  useEffect(() => { if (user && LOGIN_ROLES.includes(user.role as any)) router.replace(homeFor(user) as any); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: AUTH.bg }}>
      <StatusBar style="dark" />
      <Image source={BG} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.6, width, opacity: 0.55 }} contentFit="cover" contentPosition="bottom" />
      <LinearGradient colors={[AUTH.bg, AUTH.bg, "rgba(244,247,252,0.35)"]} locations={[0, 0.3, 1]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: height * 0.6 }} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 18 }} showsVerticalScrollIndicator={false} bounces={false}>
        {/* ---------- Hero ---------- */}
        <View style={{ height: heroH, overflow: "hidden" }}>
          <View pointerEvents="none" style={{ position: "absolute", right: -110, top: heroH * 0.3, width: 320, height: 320, borderRadius: 160, backgroundColor: "#2F80ED", opacity: 0.9 }} />
          <View pointerEvents="none" style={{ position: "absolute", right: -40, top: heroH * 0.3, width: 220, height: 220, borderRadius: 110, backgroundColor: "#60A5FA", opacity: 0.35 }} />
          <Image testID="welcome-hero" source={HERO} style={{ position: "absolute", right: -14, bottom: 0, width: 236, height: heroH * 0.7 }} contentFit="contain" contentPosition="bottom right" />

          <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20 }}>
            <BrandRow />
          </View>

          <View style={{ marginTop: 26, paddingLeft: 20, width: width * 0.62 }}>
            <Text testID="welcome-title" style={{ color: AUTH.blueDark, fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.5 }}>Reliable Services{"\n"}at Your Door Step</Text>
            <Text style={{ color: "#475569", fontSize: 14.5, lineHeight: 21, marginTop: 12 }}>Book trusted professionals, local shops and service providers near you.</Text>
          </View>

          <View style={{ flexDirection: "row", columnGap: 12, rowGap: 10, paddingLeft: 20, marginTop: 20, width: width * 0.56, flexWrap: "wrap" }}>
            {FEATURES.map((f) => (
              <View key={f.title} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: f.bg, alignItems: "center", justifyContent: "center" }}><Icon name={f.icon} size={16} color={f.fg} /></View>
                <View>
                  <Text style={{ color: AUTH.ink, fontSize: 12, fontWeight: "800", lineHeight: 14 }}>{f.title}</Text>
                  <Text style={{ color: AUTH.muted, fontSize: 10.5, lineHeight: 13 }}>{f.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ---------- Get Started card ---------- */}
        <View testID="get-started-card" style={{ marginHorizontal: 16, marginTop: -26, backgroundColor: "#fff", borderRadius: 26, padding: 18, gap: 12, boxShadow: AUTH.card }}>
          <View style={{ alignItems: "center", marginBottom: 4 }}>
            <Text style={{ color: AUTH.ink, fontSize: 24, fontWeight: "800" }}>Get Started</Text>
            <Text style={{ color: AUTH.muted, fontSize: 14, marginTop: 4 }}>Choose how you want to continue</Text>
          </View>

          <Pressable testID="welcome-login-btn" onPress={() => router.push("/(auth)/login" as any)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <LinearGradient colors={AUTH.blueGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 78, borderRadius: 18, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 14 }}>
              <Icon name="login-variant" size={30} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>Log In</Text>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 }}>Access your existing account</Text>
              </View>
              <Icon name="chevron-right" size={24} color="#fff" />
            </LinearGradient>
          </Pressable>

          <Pressable testID="welcome-register-btn" onPress={() => router.push("/(auth)/register" as any)} style={({ pressed }) => ({ height: 78, borderRadius: 18, borderWidth: 1.5, borderColor: "#DCE6F7", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 14, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Icon name="account-plus-outline" size={30} color={AUTH.ink} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: AUTH.ink, fontSize: 18, fontWeight: "800" }}>Create New Account</Text>
              <Text style={{ color: AUTH.muted, fontSize: 13, marginTop: 2 }}>Join {brand.branding.site_name} today</Text>
            </View>
            <Icon name="chevron-right" size={24} color="#94A3B8" />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Icon name="shield-check-outline" size={18} color={AUTH.ink} />
          <Text style={{ color: "#334155", fontSize: 13.5, fontWeight: "600" }}>Your data is secure & encrypted</Text>
          <Icon name="chevron-right" size={16} color={AUTH.ink} />
        </View>
      </ScrollView>

      {booting || (user && LOGIN_ROLES.includes(user.role as any)) ? (
        <View testID="welcome-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: AUTH.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color={AUTH.blue} /></View>
      ) : null}
    </View>
  );
}
