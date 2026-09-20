import React, { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, useWindowDimensions, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useBrand } from "@/src/context/BrandContext";
import { palette } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { storage } from "@/src/utils/storage";

export const ONBOARD_DONE_KEY = "azo_onboarding_done";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FALLBACK_LOGO = require("../../assets/brand-logo.png");

type Slide = { icon: MdiName; badge: MdiName; title: string; sub: string; accent: string };
const SLIDES: Slide[] = [
  { icon: "phone-ring", badge: "bell-ring", title: "Jobs that ring like a call", sub: "Every new job near you rings loudly — even when your phone is locked or the app is closed. Never miss work again.", accent: "#F59E0B" },
  { icon: "wallet-plus-outline", badge: "trending-up", title: "Grow your earnings", sub: "Accept jobs in one tap, track every rupee, and withdraw your balance straight to your bank whenever you want.", accent: "#22C55E" },
  { icon: "shield-check", badge: "cog-outline", title: "You're in full control", sub: "Go online when you want, manage your alerts & permissions, and get paid securely for verified, on-time service.", accent: "#38BDF8" },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { width } = useWindowDimensions();
  const P = palette(brand.theme.primary || "#0D47A1");
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const logo = brand.branding.logo_dark || brand.branding.logo_light || brand.branding.logo;

  const finish = useCallback(async () => {
    try { await storage.setItem(ONBOARD_DONE_KEY, "1"); } catch { /* ignore */ }
    router.replace("/onboarding/notifications");
  }, [router]);

  const goTo = (i: number) => { scrollRef.current?.scrollTo({ x: i * width, animated: true }); setIndex(i); };
  const onNext = () => { if (index < SLIDES.length - 1) goTo(index + 1); else finish(); };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const last = index === SLIDES.length - 1;

  return (
    <LinearGradient colors={[P[600], P[800], P[900]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <StatusBar style="light" />
      {/* soft glows */}
      <View pointerEvents="none" style={{ position: "absolute", top: -120, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(255,255,255,0.08)" }} />
      <View pointerEvents="none" style={{ position: "absolute", bottom: 40, left: -100, width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(255,255,255,0.06)" }} />

      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {logo ? (
          <Image testID="onboard-logo" source={{ uri: logo }} style={{ height: 34, width: 132 }} contentFit="contain" contentPosition="left" />
        ) : (
          <Image testID="onboard-logo" source={FALLBACK_LOGO} style={{ height: 40, width: 40, borderRadius: 10 }} contentFit="contain" />
        )}
        {!last ? (
          <Pressable testID="onboard-skip" onPress={finish} hitSlop={10}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 14 }}>Skip</Text>
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={{ width, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 }}>
            <View style={{ width: 190, height: 190, alignItems: "center", justifyContent: "center", marginBottom: 40 }}>
              <View style={{ position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(255,255,255,0.06)" }} />
              <View style={{ position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.10)" }} />
              <View style={{ width: 112, height: 112, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", alignItems: "center", justifyContent: "center" }}>
                <Icon name={s.icon} size={54} color="#fff" />
              </View>
              <View style={{ position: "absolute", top: 8, right: 8, width: 44, height: 44, borderRadius: 22, backgroundColor: s.accent, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.25)" }}>
                <Icon name={s.badge} size={22} color="#fff" />
              </View>
            </View>
            <Text style={{ color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center" }}>{s.title}</Text>
            <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 14 }}>{s.sub}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {SLIDES.map((_, i) => (
            <View key={i} testID={`onboard-dot-${i}`} style={{ height: 8, width: i === index ? 24 : 8, borderRadius: 4, backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.4)" }} />
          ))}
        </View>
        <Pressable
          testID="onboard-next"
          onPress={onNext}
          style={({ pressed }) => ({ backgroundColor: "#fff", borderRadius: 999, paddingVertical: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text style={{ color: P[800], fontWeight: "900", fontSize: 16 }}>{last ? "Get Started" : "Next"}</Text>
          <Icon name={last ? "rocket-launch-outline" : "arrow-right"} size={20} color={P[800]} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}
