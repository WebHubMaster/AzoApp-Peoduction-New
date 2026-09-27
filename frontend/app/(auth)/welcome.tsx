import React, { useEffect } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, MdiName } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { homeFor, LOGIN_ROLES } from "@/src/components/auth/OtpFlow";

const LOGO_A = require("../../assets/welcome-logo-a.png");
const PERSON = require("../../assets/welcome-person.png");

/* Dark-luxury palette — deep navy + champagne gold */
const C = {
  inkTop: "#060C22",
  navy: "#0A1E63",
  gold: "#D9B45B",
  goldSoft: "#EBD9A7",
  white: "#FFFFFF",
  mist: "#A7B3D6",
  ink: "#0F1B33",
  muted: "#737A9D",
  line: "#E3E9F5",
};
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

const FEATURES: { icon: MdiName; title: string; sub: string }[] = [
  { icon: "shield-check", title: "Verified", sub: "Professionals" },
  { icon: "lightning-bolt", title: "Fast", sub: "Service" },
  { icon: "currency-inr", title: "Affordable", sub: "Pricing" },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { user, booting } = useAuth();
  const { width, height } = useWindowDimensions();

  useEffect(() => { if (user && LOGIN_ROLES.includes(user.role as any)) router.replace(homeFor(user) as any); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const S = Math.max(0.84, Math.min(1.12, width / 390));
  const heroH = Math.round(Math.max(380, Math.min(height * 0.54, 440 * S)));
  const personH = Math.round(heroH - 26);
  const personW = Math.round(personH * (457 / 1205));
  const discD = Math.round(personW * 2.55);

  const siteName = brand.branding.site_name || "AzoApp";
  const tagline = brand.branding.tagline || "Your Services Our Mission";

  return (
    <View style={{ flex: 1, backgroundColor: C.inkTop }}>
      <StatusBar style="light" />
      {/* deep navy night gradient */}
      <LinearGradient colors={["#060C22", "#0A1E63", "#0C2E7D"]} locations={[0, 0.55, 1]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      {/* faint champagne aurora glow, top-right */}
      <LinearGradient colors={["rgba(217,180,91,0.22)", "rgba(217,180,91,0)"]} start={{ x: 0.9, y: 0 }} end={{ x: 0.2, y: 0.7 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: heroH * 0.8, pointerEvents: "none" }} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false} bounces={false}>
        {/* ---------- Header ---------- */}
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 5 }}>
          <View testID="app-brand-logo" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={LOGO_A} style={{ width: 36, height: 34 }} contentFit="contain" />
            <View>
              <Text style={{ color: C.white, fontSize: 20, fontWeight: "900", letterSpacing: 0.4, lineHeight: 22 }}>{siteName}</Text>
              <Text style={{ color: C.gold, fontSize: 9, fontWeight: "700", letterSpacing: 2.4, marginTop: 3, textTransform: "uppercase" }}>{tagline}</Text>
            </View>
          </View>

          <Pressable testID="welcome-language-btn" onPress={() => {}} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Icon name="web" size={15} color="rgba(255,255,255,0.9)" />
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: "#fff" }}>English</Text>
            <Icon name="chevron-down" size={13} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        {/* ---------- Hero ---------- */}
        <View style={{ height: heroH, marginTop: 10 }}>
          {/* champagne stage disc + gold ring */}
          <LinearGradient
            colors={["#F7EDD4", "#EBD8A9", "#DCC188"]}
            start={{ x: 0.25, y: 0 }} end={{ x: 0.85, y: 1 }}
            style={{ position: "absolute", right: -discD * 0.26, bottom: -discD * 0.34, width: discD, height: discD, borderRadius: discD / 2, pointerEvents: "none" }}
          />
          <View style={{ position: "absolute", right: -discD * 0.17, bottom: -discD * 0.25, width: discD * 0.82, height: discD * 0.82, borderRadius: discD, borderWidth: 1.6, borderColor: "rgba(217,180,91,0.65)", pointerEvents: "none" }} />

          {/* ground shadow + professional */}
          <View style={{ position: "absolute", right: 8, bottom: 10, width: personW * 0.9, height: 15, borderRadius: 10, backgroundColor: "rgba(6,12,34,0.20)", transform: [{ scaleX: 1.3 }], pointerEvents: "none" }} />
          <Image testID="welcome-hero" source={PERSON} style={{ position: "absolute", right: 10, bottom: 12, width: personW, height: personH, pointerEvents: "none" }} contentFit="contain" contentPosition="bottom center" />

          <View style={{ paddingLeft: 24, paddingTop: 14, width: Math.min(width - 100, 264), zIndex: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <View style={{ width: 22, height: 1.4, backgroundColor: C.gold }} />
              <Text style={{ color: C.gold, fontSize: 10.5, fontWeight: "800", letterSpacing: 3 }}>PREMIUM HOME SERVICES</Text>
            </View>
            <Text testID="welcome-title" style={{ color: C.white, fontFamily: SERIF, fontSize: Math.round(31 * S), lineHeight: Math.round(36 * S), fontWeight: "700", letterSpacing: -0.4 }}>
              Reliable Services,{"\n"}at Your <Text style={{ color: C.goldSoft, fontStyle: "italic" }}>Doorstep.</Text>
            </Text>
            <Text style={{ color: C.mist, fontSize: 13.5, lineHeight: 20, marginTop: 14, width: 200, fontWeight: "400" }}>Book trusted professionals, local shops and service providers near you.</Text>
          </View>

          {/* glass feature pills */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 8, paddingLeft: 24, marginTop: 22, width: 246, zIndex: 6 }}>
            {FEATURES.map((f) => (
              <View key={f.title} style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", paddingLeft: 6, paddingRight: 11, paddingVertical: 6, borderRadius: 22 }}>
                <View style={{ width: 25, height: 25, borderRadius: 13, backgroundColor: "rgba(217,180,91,0.18)", alignItems: "center", justifyContent: "center" }}><Icon name={f.icon} size={13.5} color={C.gold} /></View>
                <View>
                  <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "800", lineHeight: 13 }}>{f.title}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 9.5, fontWeight: "500", lineHeight: 12 }}>{f.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ---------- Get Started card ---------- */}
        <View testID="get-started-card" style={{ marginHorizontal: 14, marginTop: -34, backgroundColor: "#fff", borderRadius: 30, paddingTop: 28, paddingHorizontal: 18, paddingBottom: 24, boxShadow: "0px 24px 48px rgba(3,10,35,0.45)", zIndex: 7 }}>
          <Text style={{ textAlign: "center", color: C.ink, fontFamily: SERIF, fontSize: 27, fontWeight: "700" }}>Get Started</Text>
          <Text style={{ textAlign: "center", color: C.muted, fontSize: 13.5, fontWeight: "500", marginTop: 7 }}>Choose how you want to continue</Text>

          <Pressable testID="welcome-login-btn" onPress={() => router.push("/(auth)/login" as any)} style={({ pressed }) => ({ marginTop: 20, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <LinearGradient colors={["#C9A24B", "#E7CD8C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 72, borderRadius: 18, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 14, boxShadow: "0px 10px 22px rgba(190,150,60,0.35)" }}>
              <Icon name="login-variant" size={26} color={C.inkTop} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.inkTop, fontSize: 18, fontWeight: "800" }}>Log In</Text>
                <Text style={{ color: "rgba(7,14,38,0.7)", fontSize: 13, fontWeight: "600", marginTop: 2 }}>Access your existing account</Text>
              </View>
              <Icon name="chevron-right" size={22} color={C.inkTop} />
            </LinearGradient>
          </Pressable>

          <Pressable testID="welcome-register-btn" onPress={() => router.push("/(auth)/register" as any)} style={({ pressed }) => ({ marginTop: 16, height: 72, borderRadius: 18, borderWidth: 1.6, borderColor: "#E1E8F4", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 14, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <Icon name="account-plus-outline" size={26} color={C.navy} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.ink, fontSize: 18, fontWeight: "800" }}>Create New Account</Text>
              <Text style={{ color: C.muted, fontSize: 13, fontWeight: "500", marginTop: 2 }}>Join {siteName} today</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#9AA6BE" />
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 22 }}>
            <View style={{ width: 26, height: 1.2, backgroundColor: C.line }} />
            <Icon name="shield-check-outline" size={16} color={C.gold} />
            <Text style={{ color: "#5A6884", fontSize: 12, fontWeight: "600" }}>Your data is secure & encrypted</Text>
            <View style={{ width: 26, height: 1.2, backgroundColor: C.line }} />
          </View>
        </View>
      </ScrollView>

      {booting || (user && LOGIN_ROLES.includes(user.role as any)) ? (
        <View testID="welcome-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.inkTop, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color={C.gold} /></View>
      ) : null}
    </View>
  );
}
