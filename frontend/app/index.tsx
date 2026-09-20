import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, ActivityIndicator, Easing, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { shouldShowPermissionGate } from "@/src/lib/notifications";
import { Icon } from "@/src/components/Icon";
import { fontSize } from "@/src/theme";

export default function SplashGate() {
  const router = useRouter();
  const { booting, user, logout } = useAuth();
  const brand = useBrand();
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
        const onboarded = !!(user.onboarding_submitted || user.kyc_status === "approved" || (user.role === "partner" ? user.verified_partner : user.verified_merchant));
        if (user.role === "partner") router.replace(onboarded ? "/(partner)" : "/partner/register");
        else if (user.role === "merchant") router.replace(onboarded ? "/(merchant)" : "/merchant/register");
        else setUnsupported(true);
        return;
      }
      const showGate = await shouldShowPermissionGate();
      router.replace(showGate ? "/onboarding/notifications" : "/(auth)/login");
    })();
  }, [booting, minElapsed, user]);

  const logo = brand.branding.logo_light || brand.branding.logo;

  return (
    <LinearGradient colors={["#1565C0", "#08306E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <StatusBar style="light" />
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], alignItems: "center" }}>
        {logo ? (
          <Image source={{ uri: logo }} style={{ width: 96, height: 96, borderRadius: 22 }} contentFit="contain" />
        ) : (
          <View
            style={{
              width: 104,
              height: 104,
              borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.12)",
              borderWidth: 2,
              borderColor: "rgba(255,255,255,0.35)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 52, fontWeight: "900" }}>
              {(brand.branding.site_name || "A")[0]}
            </Text>
          </View>
        )}
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity, alignItems: "center", marginTop: 22 }}>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: 0.5 }}>
          {brand.branding.site_name}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: fontSize.sm, marginTop: 6 }}>
          {brand.branding.tagline}
        </Text>
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
              router.replace("/(auth)/login");
            }}
            style={{ backgroundColor: "#fff", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
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
