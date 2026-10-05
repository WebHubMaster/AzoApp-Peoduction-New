import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, useWindowDimensions, ActivityIndicator, ScrollView, Animated, Easing, Modal } from "react-native";
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
const PERSON = require("../../assets/welcome-person.webp");
const PERSON_RATIO = 682 / 1255;

const C = {
  bg: "#F4F7FC",
  navy: "#0B1A3F",
  text2: "#4A5672",
  muted: "#7A859D",
  line: "#E3E9F3",
  white: "#FFFFFF",
  success: "#12A150",
};

/* Brand colour with alpha — tolerant of #RGB / #RRGGBB / non-hex values. */
const tint = (c: string, a: number) => {
  let h = (c || "").trim().replace("#", "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((x) => x + x).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return `rgba(6,89,178,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

const TRUST: { icon: MdiName; title: string; sub: string }[] = [
  { icon: "shield-check", title: "Verified", sub: "Trusted experts" },
  { icon: "lightning-bolt", title: "Fast", sub: "At your doorstep" },
  { icon: "currency-inr", title: "Affordable", sub: "Fair pricing" },
];

/* Fade + rise entrance, staggered by `delay`. */
function useEntrance(delay: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] };
}

/* Admin-configured logo, aspect-ratio safe, with skeleton while loading and built-in fallback on error. */
function BrandLogo({ uri, siteName, tagline, maxW, primary }: { uri: string; siteName: string; tagline: string; maxW: number; primary: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">(uri ? "loading" : "error");
  const [ratio, setRatio] = useState(3.2);
  useEffect(() => { setState(uri ? "loading" : "error"); }, [uri]);
  const H = 40;
  if (state === "error") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Image source={LOGO_A} style={{ width: 40, height: 36 }} contentFit="contain" transition={0} />
        <View>
          <Text style={{ color: C.navy, fontSize: 22, fontWeight: "900", letterSpacing: -0.4, lineHeight: 25 }}>{siteName}</Text>
          <Text style={{ color: primary, fontSize: 10.5, fontWeight: "600", marginTop: 1 }}>{tagline}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ height: H, justifyContent: "center" }}>
      {state === "loading" ? <View testID="app-brand-logo-skeleton" style={{ position: "absolute", width: Math.min(maxW, 132), height: 30, borderRadius: 6, backgroundColor: "#E6ECF5" }} /> : null}
      <Image
        testID="app-brand-logo-dynamic"
        source={{ uri }}
        accessibilityLabel={`${siteName} logo`}
        style={{ height: H, width: Math.min(maxW, H * ratio), opacity: state === "ok" ? 1 : 0 }}
        contentFit="contain"
        contentPosition="left center"
        cachePolicy="memory-disk"
        transition={180}
        onLoad={(e) => { const { width: w, height: h } = e.source || ({} as any); if (w && h) setRatio(w / h); setState("ok"); }}
        onError={() => setState("error")}
      />
    </View>
  );
}

function LanguagePill() {
  const [open, setOpen] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(fade, { toValue: open ? 1 : 0, duration: 160, useNativeDriver: true }).start(); }, [open, fade]);
  return (
    <>
      <Pressable
        testID="welcome-language-btn"
        accessibilityRole="button"
        accessibilityLabel="Language: English. Change language"
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, transform: [{ scale: pressed ? 0.96 : 1 }] })}
      >
        <Icon name="web" size={16} color={C.navy} />
        <Text style={{ fontSize: 13.5, fontWeight: "600", color: C.navy }}>English</Text>
        <Icon name="chevron-down" size={16} color={C.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} testID="welcome-language-backdrop">
          <Animated.View style={{ position: "absolute", top: 100, right: 20, minWidth: 180, backgroundColor: C.white, borderRadius: 6, borderWidth: 1, borderColor: C.line, paddingVertical: 6, boxShadow: "0px 12px 32px rgba(11,26,63,0.14)", opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] } as any}>
            <Pressable testID="welcome-language-en" accessibilityRole="menuitem" onPress={() => setOpen(false)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, height: 46, backgroundColor: pressed ? "#F2F6FC" : "transparent" })}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: C.navy }}>English</Text>
              <Icon name="check" size={18} color={C.success} />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

function CtaButton({ testID, primary, color, icon, title, sub, onPress, height }: { testID: string; primary?: boolean; color: string; icon: MdiName; title: string; sub: string; onPress: () => void; height: number }) {
  const press = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.timing(press, { toValue: v, duration: 120, useNativeDriver: true }).start();
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] });
  const arrowX = press.interpolate({ inputRange: [0, 1], outputRange: [0, 4] });
  const fg = primary ? C.white : C.navy;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress} onPressIn={() => to(1)} onPressOut={() => to(0)}>
      <Animated.View style={{
        height, borderRadius: 6, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 14,
        backgroundColor: primary ? color : C.white, borderWidth: primary ? 0 : 1.5, borderColor: C.line,
        boxShadow: primary ? `0px 10px 24px ${tint(color, 0.25)}` : "none", transform: [{ scale }],
      } as any}>
        <View style={{ width: 44, height: 44, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: primary ? "rgba(255,255,255,0.16)" : tint(color, 0.08) }}>
          <Icon name={icon} size={23} color={primary ? C.white : color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: fg, fontSize: 16.5, fontWeight: "700", letterSpacing: -0.1 }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: primary ? "rgba(255,255,255,0.82)" : C.muted, fontSize: 13, fontWeight: "400", marginTop: 2 }}>{sub}</Text>
        </View>
        <Animated.View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: primary ? "rgba(255,255,255,0.16)" : "#F2F5FA", transform: [{ translateX: arrowX }] }}>
          <Icon name="arrow-right" size={18} color={fg} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { user, booting } = useAuth();
  const { width, height } = useWindowDimensions();

  useEffect(() => { if (user && LOGIN_ROLES.includes(user.role as any)) router.replace(homeFor(user) as any); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const primary = brand.theme?.primary || "#0659B2";
  const siteName = brand.branding.site_name || "AzoApp";
  const tagline = brand.branding.tagline || "Service at Your Doorstep";
  const adminLogo = brand.branding.logo_light || brand.branding.logo || brand.branding.logo_dark || "";

  // Height-aware scale: small phones tighten spacing so the CTA panel stays on screen.
  const avail = height - insets.top - insets.bottom;
  const V = Math.max(0.72, Math.min(1, avail / 780));
  const sp = (n: number) => Math.round(n * V);
  const [heroH, setHeroH] = useState(() => Math.max(200, Math.min(330, Math.round(avail * 0.36))));
  const personW = Math.round(Math.min(heroH * 1.02 * PERSON_RATIO, width * 0.48));
  const personH = Math.round(personW / PERSON_RATIO);
  const blobD = Math.round(Math.min(width * 0.66, heroH * 1.02));
  const textW = Math.max(150, Math.min(width - personW - 28, 240));
  const titleFS = Math.round(Math.max(22, Math.min(28, width / 13.5)) * Math.max(0.9, V));
  const btnH = Math.max(68, sp(78));

  const aHeader = useEntrance(0);
  const aHero = useEntrance(80);
  const aTrust = useEntrance(160);
  const aPanel = useEntrance(240);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <LinearGradient colors={["#FFFFFF", "#F4F7FC"]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />

      <ScrollView testID="welcome-screen" bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View style={[{ paddingTop: insets.top + sp(12), paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 5 }, aHeader]}>
          <View testID="app-brand-logo" style={{ flex: 1, marginRight: 12 }}>
            <BrandLogo uri={adminLogo} siteName={siteName} tagline={tagline} maxW={Math.min(170, width * 0.46)} primary={primary} />
          </View>
          <LanguagePill />
        </Animated.View>

        {/* Hero */}
        <Animated.View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (Math.abs(h - heroH) > 2) setHeroH(h); }} style={[{ flex: 1, minHeight: 230, maxHeight: 420, marginTop: sp(14) }, aHero]}>
          <View style={{ position: "absolute", right: -blobD * 0.2, top: sp(6), width: blobD, height: blobD, borderRadius: blobD / 2, backgroundColor: tint(primary, 0.08), pointerEvents: "none" }} />
          <View style={{ position: "absolute", right: blobD * 0.42, top: sp(40), width: 12, height: 12, borderRadius: 6, backgroundColor: tint(primary, 0.2), pointerEvents: "none" }} />
          <View style={{ position: "absolute", right: 0, bottom: 0, width: personW, height: personH, overflow: "hidden", pointerEvents: "none" }}>
            <Image testID="welcome-hero" source={PERSON} accessibilityIgnoresInvertColors style={{ position: "absolute", right: 0, bottom: 0, width: personW, height: personH }} contentFit="contain" contentPosition="bottom center" transition={200} priority="high" />
            <LinearGradient colors={["rgba(244,247,252,0)", C.bg]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.round(personH * 0.22) }} />
          </View>

          <View style={{ paddingLeft: 20, width: textW + 20, zIndex: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 10, height: 28 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.success }} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.text2 }}>Available near you</Text>
            </View>
            <View testID="welcome-title" accessibilityRole="header" style={{ marginTop: sp(14) }}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: C.navy, fontSize: Math.round(titleFS * 0.82), lineHeight: Math.round(titleFS * 0.82 * 1.2), fontWeight: "600", letterSpacing: -0.4 }}>Reliable Home</Text>
              <Text numberOfLines={1} style={{ color: C.navy, fontSize: Math.round(titleFS * 0.82), lineHeight: Math.round(titleFS * 0.82 * 1.2), fontWeight: "600", letterSpacing: -0.4 }}>Services</Text>
            </View>
            <Text style={{ color: C.text2, fontSize: 13, lineHeight: 18, marginTop: sp(8), fontWeight: "400" }}>Book trusted professionals and local service providers near you.</Text>
          </View>
        </Animated.View>

        {/* Trust indicators */}
        <Animated.View style={[{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: sp(2), zIndex: 6 }, aTrust]}>
          {TRUST.map((t) => (
            <View key={t.title} testID={`welcome-trust-${t.title.toLowerCase()}`} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 10, paddingVertical: sp(8) }}>
              <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: tint(primary, 0.07), alignItems: "center", justifyContent: "center" }}>
                <Icon name={t.icon} size={16} color={primary} />
              </View>
              <Text style={{ color: C.navy, fontSize: 12.5, fontWeight: "700", marginTop: 6 }}>{t.title}</Text>
              <Text numberOfLines={2} style={{ color: C.muted, fontSize: 10.5, lineHeight: 14, fontWeight: "400", marginTop: 1 }}>{t.sub}</Text>
            </View>
          ))}
        </Animated.View>


        {/* Get Started panel */}
        <Animated.View testID="get-started-card" style={[{ marginTop: sp(12), backgroundColor: C.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: sp(18), paddingHorizontal: 20, paddingBottom: insets.bottom + sp(18), boxShadow: "0px -8px 30px rgba(11,26,63,0.07)" } as any, aPanel]}>
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: sp(14) }} />
          <Text accessibilityRole="header" style={{ color: C.navy, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 }}>Get Started</Text>
          <Text style={{ color: C.text2, fontSize: 14.5, fontWeight: "400", marginTop: 4 }}>Choose how you want to continue</Text>

          <View style={{ marginTop: sp(18), gap: sp(12) }}>
            <CtaButton testID="welcome-login-btn" primary color={primary} icon="login-variant" title="Log In" sub="Access your existing account" height={btnH} onPress={() => router.push("/(auth)/login" as any)} />
            <CtaButton testID="welcome-register-btn" color={primary} icon="account-plus-outline" title="Create New Account" sub={`Join ${siteName} today`} height={btnH} onPress={() => router.push("/(auth)/register" as any)} />
          </View>

          <View testID="welcome-security-note" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: sp(14) }}>
            <Icon name="shield-lock-outline" size={15} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: "500" }}>Your data is secure & encrypted</Text>
          </View>
        </Animated.View>
      </ScrollView>

      {booting || (user && LOGIN_ROLES.includes(user.role as any)) ? (
        <View testID="welcome-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color={primary} /></View>
      ) : null}
    </View>
  );
}
