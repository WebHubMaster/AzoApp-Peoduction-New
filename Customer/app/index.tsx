/** Branded splash (same design as the Partner app): restore the saved session, then route. */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, ActivityIndicator, Easing } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { ShieldCheck } from "lucide-react-native";
import { useAuth } from "@/src/context/AuthContext";
import { useSiteConfig, useSiteConfigQuery } from "@/src/context/BrandContext";

export default function Gate() {
  const router = useRouter();
  const { booting } = useAuth();
  const brand = useSiteConfig();
  const cfgQ = useSiteConfigQuery();
  const [minElapsed, setMinElapsed] = useState(false);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (booting || !minElapsed) return;
    router.replace("/(site)");
  }, [booting, minElapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const logo = brand.branding.logo_dark || brand.branding.logo_light;

  return (
    <LinearGradient testID="login-auth-loader" colors={["#1565C0", "#08306E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <StatusBar style="light" />
      <Animated.View testID="splash-brand" style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], alignItems: "center", minHeight: 84, justifyContent: "center" }}>
        {cfgQ.isLoading ? null : logo ? (
          <Image testID="splash-logo" source={{ uri: logo }} style={{ width: 220, height: 84 }} contentFit="contain" transition={200}
            accessibilityLabel={brand.branding.site_name} />
        ) : (
          <View style={{ alignItems: "center" }} testID="splash-brand-text">
            <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: 0.5 }}>{brand.branding.site_name}</Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 6 }}>{brand.branding.tagline}</Text>
          </View>
        )}
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity, alignItems: "center", marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
          <ShieldCheck size={14} color="rgba(255,255,255,0.7)" />
          <Text testID="splash-caption" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" }}>Trusted Home Services</Text>
        </View>
      </Animated.View>
      <View style={{ position: "absolute", bottom: 70 }}>
        <ActivityIndicator color="rgba(255,255,255,0.9)" />
      </View>
    </LinearGradient>
  );
}
