import React, { useEffect, useState } from "react";
import { View, Text, Pressable, useWindowDimensions, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, MdiName } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { homeFor, LOGIN_ROLES } from "@/src/components/auth/OtpFlow";
import { FS } from "@/src/components/auth/AuthUi";

const LOGO_A = require("../../assets/welcome-logo-a.png");
const PERSON = require("../../assets/welcome-person.webp");
const PERSON_RATIO = 600 / 1093;

const C = {
  bg: "#F6F9FE",
  navy: "#0E1B45",
  blue: "#1F6FEB",
  blueDeep: "#1656C9",
  blob: "#D8E7FA",
  gray: "#5E6B86",
  muted: "#7C879F",
  line: "#DCE4F2",
  white: "#FFFFFF",
};

const FEATURES: { icon: MdiName; title: string; sub: string; bg: string; fg: string }[] = [
  { icon: "shield-check", title: "Verified", sub: "Professionals", bg: "#E4EEFC", fg: C.blue },
  { icon: "lightning-bolt", title: "Fast", sub: "Service", bg: "#E4EEFC", fg: C.blue },
  { icon: "currency-inr", title: "Affordable", sub: "Pricing", bg: "#FDF1D3", fg: "#C7891A" },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { user, booting } = useAuth();
  const { width, height } = useWindowDimensions();
  const [heroH, setHeroH] = useState(0);

  useEffect(() => { if (user && LOGIN_ROLES.includes(user.role as any)) router.replace(homeFor(user) as any); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const S = Math.max(0.84, Math.min(1.12, width / 390));
  // Vertical scale from the usable height — everything (header, hero, card, footer) is laid
  // out in one flex column, the hero simply takes whatever is left, so the screen never scrolls.
  const avail = height - insets.top - insets.bottom;
  const V = Math.max(0.7, Math.min(1, avail / 800));
  const compact = V < 0.86;
  const personH = Math.round(heroH * 1.04);
  const personW = Math.round(personH * PERSON_RATIO);
  const blobD = Math.round(width * 0.62);
  const btnH = Math.round(62 * V) + 4;

  const siteName = brand.branding.site_name || "AzoApp";
  const tagline = brand.branding.tagline || "Service at Your Doorstep";
  const adminLogo = brand.branding.logo_light || brand.branding.logo || brand.branding.logo_dark || "";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <LinearGradient colors={["#FFFFFF", "#F3F7FD", "#EEF4FC"]} locations={[0, 0.5, 1]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />

      <View testID="welcome-screen" style={{ flex: 1, paddingBottom: insets.bottom + 10 }}>
        {/* ---------- Header ---------- */}
        <View style={{ paddingTop: insets.top + Math.round(10 * V), paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 5 }}>
          <View testID="app-brand-logo" style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 12 }}>
            {adminLogo ? (
              <Image testID="app-brand-logo-dynamic" source={{ uri: adminLogo }} style={{ height: 44, width: Math.min(170, width * 0.45) }} contentFit="contain" contentPosition="left center" cachePolicy="memory-disk" transition={0} />
            ) : (
              <>
                <Image source={LOGO_A} style={{ width: 44, height: 40 }} contentFit="contain" transition={0} />
                <View>
                  <Text style={{ color: C.navy, fontSize: 24, fontWeight: "900", letterSpacing: -0.3, lineHeight: 27 }}>{siteName}</Text>
                  <Text style={{ color: C.gray, fontSize: 11, fontWeight: "500", marginTop: 1 }}>{tagline}</Text>
                </View>
              </>
            )}
          </View>

          <Pressable testID="welcome-language-btn" onPress={() => {}} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 24, paddingHorizontal: 13, paddingVertical: 9, transform: [{ scale: pressed ? 0.97 : 1 }], boxShadow: "0px 2px 8px rgba(14,27,69,0.05)" })}>
            <Icon name="web" size={16} color={C.navy} />
            <Text style={{ fontSize: FS.small, fontWeight: "600", color: C.navy }}>English</Text>
            <Icon name="chevron-down" size={14} color={C.navy} />
          </Pressable>
        </View>

        {/* ---------- Hero (flexes to fill what is left) ---------- */}
        <View style={{ flex: 1, minHeight: 190, marginTop: Math.round(16 * V) }} onLayout={(e) => setHeroH(Math.round(e.nativeEvent.layout.height))}>
          <View style={{ position: "absolute", right: -blobD * 0.18, top: -8, width: blobD, height: blobD, borderRadius: blobD / 2, backgroundColor: C.blob, pointerEvents: "none" }} />
          <View style={{ position: "absolute", right: 30, bottom: -30, width: blobD * 0.72, height: blobD * 0.72, borderRadius: blobD, backgroundColor: C.blob, pointerEvents: "none" }} />

          {heroH > 0 ? (
            <Image testID="welcome-hero" source={PERSON} style={{ position: "absolute", right: -personW * 0.1, bottom: -Math.round(24 * V), width: personW, height: personH, pointerEvents: "none" }} contentFit="contain" contentPosition="bottom center" transition={0} priority="high" />
          ) : null}

          <View style={{ paddingLeft: 22, width: Math.min(width - 90, 270), zIndex: 6 }}>
            <Text testID="welcome-title" style={{ color: C.navy, fontSize: Math.round(32 * S * Math.max(0.84, V)), lineHeight: Math.round(38 * S * Math.max(0.84, V)), fontWeight: "900", letterSpacing: -0.6 }}>
              Reliable{"\n"}Home Services
            </Text>
            <Text style={{ color: C.gray, fontSize: FS.subtitle, lineHeight: 22, marginTop: Math.round(12 * V), width: Math.min(width * 0.52, 215), fontWeight: "400" }}>Book trusted professionals and local service providers near you.</Text>
          </View>

          <View style={{ paddingLeft: 22, marginTop: Math.round(22 * V), gap: Math.round(compact ? 10 : 16), zIndex: 6 }}>
            {FEATURES.map((f) => (
              <View key={f.title} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{ width: compact ? 38 : 46, height: compact ? 38 : 46, borderRadius: 23, backgroundColor: f.bg, alignItems: "center", justifyContent: "center" }}><Icon name={f.icon} size={compact ? 19 : 22} color={f.fg} /></View>
                <View>
                  <Text style={{ color: C.navy, fontSize: FS.input, fontWeight: "800", lineHeight: 19 }}>{f.title}</Text>
                  <Text style={{ color: C.muted, fontSize: FS.small, fontWeight: "400", lineHeight: 17, marginTop: 1 }}>{f.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ---------- Get Started card ---------- */}
        <View testID="get-started-card" style={{ marginHorizontal: 12, marginTop: Math.round(12 * V), backgroundColor: C.white, borderRadius: 30, paddingTop: Math.round(18 * V), paddingHorizontal: 18, paddingBottom: Math.round(18 * V), boxShadow: "0px 14px 40px rgba(14,27,69,0.10)", zIndex: 7 }}>
          <Text style={{ textAlign: "center", color: C.navy, fontSize: FS.title, fontWeight: "900", letterSpacing: -0.4 }}>Get Started</Text>
          <Text style={{ textAlign: "center", color: C.gray, fontSize: FS.subtitle, fontWeight: "400", marginTop: 4 }}>Choose how you want to continue</Text>

          <Pressable testID="welcome-login-btn" onPress={() => router.push("/(auth)/login" as any)} style={({ pressed }) => ({ marginTop: Math.round(16 * V), transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <LinearGradient colors={[C.blueDeep, "#2A7BEA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: btnH, borderRadius: 20, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 16, boxShadow: "0px 10px 22px rgba(31,111,235,0.30)" }}>
              <Icon name="login-variant" size={28} color={C.white} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.white, fontSize: FS.label, fontWeight: "800" }}>Log In</Text>
                <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: FS.buttonSub, fontWeight: "500", marginTop: 2 }}>Access your existing account</Text>
              </View>
              <Icon name="chevron-right" size={24} color={C.white} />
            </LinearGradient>
          </Pressable>

          <Pressable testID="welcome-register-btn" onPress={() => router.push("/(auth)/register" as any)} style={({ pressed }) => ({ marginTop: Math.round(10 * V), height: btnH, borderRadius: 20, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.white, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 16, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
            <Icon name="account-plus-outline" size={28} color={C.blue} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.navy, fontSize: FS.label, fontWeight: "800" }}>Create New Account</Text>
              <Text style={{ color: C.gray, fontSize: FS.buttonSub, fontWeight: "400", marginTop: 2 }}>Join {siteName} today</Text>
            </View>
            <Icon name="chevron-right" size={24} color={C.navy} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: Math.round(12 * V) }}>
          <Icon name="shield-check-outline" size={18} color={C.gray} />
          <Text style={{ color: C.gray, fontSize: FS.small, fontWeight: "500" }}>Your data is secure & encrypted</Text>
        </View>
      </View>

      {booting || (user && LOGIN_ROLES.includes(user.role as any)) ? (
        <View testID="welcome-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color={C.blue} /></View>
      ) : null}
    </View>
  );
}
