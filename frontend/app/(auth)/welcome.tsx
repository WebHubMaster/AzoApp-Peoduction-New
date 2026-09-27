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
import { homeFor, LOGIN_ROLES } from "@/src/components/auth/OtpFlow";

/* Reference-matched artwork (see uploaded AzoApp welcome screenshot). */
const LOGO_A = require("../../assets/welcome-logo-a.png");
const BLOB = require("../../assets/welcome-blob.png");
const HOUSE = require("../../assets/welcome-house.png");
const PERSON = require("../../assets/welcome-person.png");
const LEAVES = require("../../assets/welcome-leaves.png");

const C = {
  navy: "#0A1E63",
  ink: "#0F1B33",
  muted: "#737A9D",
  bg: "#EFF6FD",
  line: "#E3E9F5",
};

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

  useEffect(() => { if (user && LOGIN_ROLES.includes(user.role as any)) router.replace(homeFor(user) as any); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Composition scales with screen width while preserving the reference layout.
  const S = Math.max(0.84, Math.min(1.12, width / 390));
  const heroH = Math.round(Math.max(348, Math.min(height * 0.48, 408 * S)));
  const personH = Math.round(heroH - 14);
  const personW = Math.round(personH * (620 / 983));
  const blobW = Math.round(250 * S);
  const houseW = Math.round(214 * S);
  const leavesW = width;
  const leavesH = Math.round(width * (113 / 226));

  const siteName = brand.branding.site_name || "AzoApp";
  const tagline = brand.branding.tagline || "Your Services Our Mission";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <LinearGradient colors={["#E9F2FD", "#EFF6FD", "#F4F9FE"]} locations={[0, 0.45, 1]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      {/* soft greenery peeking at the very bottom corners (behind the card) */}
      <Image source={LEAVES} style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: leavesW, height: leavesH, pointerEvents: "none" }} contentFit="cover" contentPosition="bottom" />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false} bounces={false}>
        {/* ---------- Header ---------- */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 5 }}>
          <View testID="app-brand-logo" style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Image source={LOGO_A} style={{ width: 34, height: 32 }} contentFit="contain" />
            <View>
              <Text style={{ color: C.navy, fontSize: 20, fontWeight: "900", letterSpacing: -0.3, lineHeight: 22 }}>{siteName}</Text>
              <Text style={{ color: "#8A93AE", fontSize: 9.5, fontWeight: "600", marginTop: 2 }}>{tagline}</Text>
            </View>
          </View>

          <Pressable testID="welcome-language-btn" onPress={() => {}} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, boxShadow: "0px 3px 10px rgba(15,40,90,0.06)", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Icon name="web" size={16} color="#3A4560" />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#2A3552" }}>English</Text>
            <Icon name="chevron-down" size={14} color="#5A6480" />
          </Pressable>
        </View>

        {/* ---------- Hero ---------- */}
        <View style={{ height: heroH, marginTop: 4 }}>
          <Image source={BLOB} style={{ position: "absolute", right: -30, top: -8, width: blobW, height: Math.round(blobW * (129 / 231)), opacity: 0.95, pointerEvents: "none" }} contentFit="contain" />
          <Image source={HOUSE} style={{ position: "absolute", left: 12, bottom: 30, width: houseW, height: Math.round(houseW * (246 / 254)), pointerEvents: "none" }} contentFit="contain" contentPosition="bottom" />
          <Image testID="welcome-hero" source={PERSON} style={{ position: "absolute", right: -26, bottom: -4, width: personW, height: personH, pointerEvents: "none" }} contentFit="contain" contentPosition="bottom right" />

          <View style={{ paddingLeft: 22, paddingTop: 6, width: Math.min(width - 90, 280), zIndex: 6 }}>
            <Text testID="welcome-title" style={{ color: C.navy, fontSize: Math.round(25 * S), lineHeight: Math.round(30 * S), fontWeight: "800", letterSpacing: -0.7 }}>Reliable Services{"\n"}at Your Door Step</Text>
            <Text style={{ color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 11, width: 208, fontWeight: "500" }}>Book trusted professionals, local shops and service providers near you.</Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 13, rowGap: 12, paddingLeft: 22, marginTop: 22, width: 250, zIndex: 6 }}>
            {FEATURES.map((f) => (
              <View key={f.title} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <View style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: f.bg, alignItems: "center", justifyContent: "center" }}><Icon name={f.icon} size={15} color={f.fg} /></View>
                <View>
                  <Text style={{ color: "#243356", fontSize: 11, fontWeight: "800", lineHeight: 13 }}>{f.title}</Text>
                  <Text style={{ color: "#7A8398", fontSize: 10, fontWeight: "500", lineHeight: 13 }}>{f.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ---------- Get Started card ---------- */}
        <View testID="get-started-card" style={{ marginHorizontal: 14, marginTop: -30, backgroundColor: "#fff", borderRadius: 28, paddingTop: 26, paddingHorizontal: 18, paddingBottom: 22, boxShadow: "0px 18px 40px rgba(12,35,80,0.12)", zIndex: 7 }}>
          <Text style={{ textAlign: "center", color: C.ink, fontSize: 24, fontWeight: "800" }}>Get Started</Text>
          <Text style={{ textAlign: "center", color: C.muted, fontSize: 13.5, fontWeight: "500", marginTop: 6 }}>Choose how you want to continue</Text>

          <Pressable testID="welcome-login-btn" onPress={() => router.push("/(auth)/login" as any)} style={({ pressed }) => ({ marginTop: 18, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <LinearGradient colors={["#1461C9", "#0A44B4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 72, borderRadius: 18, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 14, boxShadow: "0px 10px 20px rgba(11,70,180,0.28)" }}>
              <Icon name="login-variant" size={27} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>Log In</Text>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "500", marginTop: 2 }}>Access your existing account</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#fff" />
            </LinearGradient>
          </Pressable>

          <Pressable testID="welcome-register-btn" onPress={() => router.push("/(auth)/register" as any)} style={({ pressed }) => ({ marginTop: 18, height: 72, borderRadius: 18, borderWidth: 1.6, borderColor: "#E1E8F4", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 14, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <Icon name="account-plus-outline" size={27} color={C.ink} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontSize: 18, fontWeight: "800" }}>Create New Account</Text>
              <Text style={{ color: C.muted, fontSize: 13, fontWeight: "500", marginTop: 2 }}>Join {siteName} today</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#9AA6BE" />
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 }}>
            <Icon name="shield-check-outline" size={17} color="#5A6884" />
            <Text style={{ color: "#5A6884", fontSize: 12.5, fontWeight: "600" }}>Your data is secure & encrypted</Text>
            <Icon name="chevron-right" size={15} color="#8894AD" />
          </View>
        </View>
      </ScrollView>

      {booting || (user && LOGIN_ROLES.includes(user.role as any)) ? (
        <View testID="welcome-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color="#1461C9" /></View>
      ) : null}
    </View>
  );
}
