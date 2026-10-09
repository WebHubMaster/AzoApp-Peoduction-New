import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, ActivityIndicator, Easing, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand, useSiteConfigQuery } from "@/src/context/BrandContext";
import { shouldShowPermissionGate } from "@/src/lib/notifications";
import { markNavReady } from "@/src/lib/notifTap";
import { storage } from "@/src/utils/storage";
import { Icon } from "@/src/components/Icon";
import { fontSize } from "@/src/theme";

const ONBOARD_DONE_KEY = "azo_onboarding_done";

export default function SplashGate() {
  const router = useRouter();
  const { booting, user, logout } = useAuth();
  const brand = useBrand();
  const cfgQ = useSiteConfigQuery();
  const [minElapsed, setMinElapsed] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, friction: 6 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => setMinElapsed(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (booting || !minElapsed) return;
    (async () => {
      if (user) {
        // Mirror login's home(): send partners/merchants who haven't finished
        // (or are still under review) back to their registration wizard, not the dashboard.
        // Merchants reach the dashboard only after admin approval (until then: Under Review screen).
        const onboarded = user.role === "merchant"
          ? !!(user.kyc_status === "approved" || user.verified_merchant)
          : !!(user.onboarding_submitted || user.kyc_status === "approved" || user.verified_partner);
        if (user.role === "partner") {
          const home = onboarded ? "/(partner)" : "/partner/register";
          if (await shouldShowPermissionGate().catch(() => false)) router.replace({ pathname: "/onboarding/notifications", params: { next: home } });
          else router.replace(home);
        }
        else if (user.role === "merchant") router.replace(onboarded ? "/(merchant)" : "/merchant/register");
        else if (user.role === "agent") router.replace("/(agent)");
        else setUnsupported(true);
        markNavReady();
        return;
      }
      const done = await storage.getItem(ONBOARD_DONE_KEY);
      if (done !== "1") { router.replace("/onboarding/intro"); markNavReady(); return; }
      router.replace("/(auth)/welcome");
      markNavReady();
    })();
  }, [booting, minElapsed, user]);

  const logo = brand.branding.logo_dark || brand.branding.logo_light || brand.branding.logo;

  return (
    <LinearGradient colors={["#1565C0", "#08306E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <StatusBar style="light" />
      {/* ONE dynamic brand mark: admin logo if uploaded, else admin site name + tagline */}
      <Animated.View testID="splash-brand" style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], alignItems: "center", minHeight: 84, justifyContent: "center" }}>
        {cfgQ.isLoading ? null : logo ? (
          <Image testID="splash-logo" source={{ uri: logo }} style={{ width: 220, height: 84 }} contentFit="contain" transition={200}
            accessibilityLabel={brand.branding.site_name} />
        ) : (
          <View style={{ alignItems: "center" }} testID="splash-brand-text">
            <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: 0.5 }}>{brand.branding.site_name}</Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: fontSize.sm, marginTop: 6 }}>{brand.branding.tagline}</Text>
          </View>
        )}
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity, alignItems: "center", marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <Icon name="shield-check" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: fontSize.xs, fontWeight: "600" }}>
            Partner & Merchant
          </Text>
        </View>
      </Animated.View>

      {unsupported ? (
        <View style={{ position: "absolute", bottom: 60, paddingHorizontal: 32, alignItems: "center" }}>
          <Text style={{ color: "#fff", textAlign: "center", fontSize: fontSize.sm, lineHeight: 20, marginBottom: 12 }}>
            This app is for Partners & Merchants only. Your account is a {user?.role} account.
          </Text>
          <Pressable
            testID="unsupported-logout"
            onPress={async () => {
              await logout();
              router.replace("/(auth)/welcome");
            }}
            style={{ backgroundColor: "#fff", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 6 }}
          >
            <Text style={{ color: "#0D47A1", fontWeight: "800" }}>Switch account</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ position: "absolute", bottom: 70 }}>
          <ActivityIndicator color="rgba(255,255,255,0.9)" />
        </View>
      )}
    </LinearGradient>
  );
}
