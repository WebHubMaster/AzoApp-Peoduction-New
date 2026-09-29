import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { AUTH, FS, AuthHeader, LOGIN_ACCENT, NeedHelpLink, SafeSecureCard } from "@/src/components/auth/AuthUi";
import { OtpFlow, homeFor, LOGIN_ROLES, Step } from "@/src/components/auth/OtpFlow";

const ILLUSTRATION = require("../../assets/auth-login-illustration.png");

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { user, loading, booting } = useAuth();
  const [routing, setRouting] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [heroH, setHeroH] = useState(160);

  useEffect(() => { if (user && LOGIN_ROLES.includes(user.role as any)) { setRouting(true); router.replace(homeFor(user) as any); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLoader = booting || loading || routing || (user && LOGIN_ROLES.includes(user.role as any));

  return (
    <View style={{ flex: 1, backgroundColor: AUTH.bg }}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView bottomOffset={24} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 16 }}>
        <AuthHeader top={insets.top} right={<NeedHelpLink />} onBack={() => (router.canGoBack() ? router.back() : router.replace("/(auth)/welcome" as any))} />

        <View style={{ alignItems: "center", marginTop: 16, paddingHorizontal: 24 }}>
          <Text testID="login-title" style={{ color: AUTH.ink, fontSize: FS.title, fontWeight: "800", letterSpacing: -0.5 }}>{step === "otp" ? "Verify OTP" : "Welcome Back"}</Text>
          <Text style={{ color: AUTH.muted, fontSize: FS.subtitle, marginTop: 6 }}>{step === "otp" ? "Enter the code we just sent you" : `Log in to continue to ${brand.branding.site_name}`}</Text>
        </View>

        {/* Hero flexes to whatever height is left so the card + footer always fit on one screen */}
        <View testID="login-hero" style={{ flex: 1, minHeight: 96, maxHeight: 240, alignItems: "center", justifyContent: "center", marginVertical: 6 }} onLayout={(e) => setHeroH(Math.round(e.nativeEvent.layout.height))}>
          <View pointerEvents="none" style={{ position: "absolute", width: heroH * 0.9, height: heroH * 0.9, borderRadius: heroH, backgroundColor: "#DBEAFE", opacity: 0.55 }} />
          <View pointerEvents="none" style={{ position: "absolute", width: heroH * 1.1, height: heroH * 1.1, borderRadius: heroH, backgroundColor: "#DBEAFE", opacity: 0.3 }} />
          <Image testID="login-illustration" source={ILLUSTRATION} style={{ width: heroH, height: heroH }} contentFit="contain" />
        </View>

        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <View testID="login-card" style={{ backgroundColor: "#fff", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "#E8EEF7", boxShadow: AUTH.card }}>
            <OtpFlow mode="login" accent={LOGIN_ACCENT} onStepChange={setStep} onRouting={setRouting} onNewUser={() => router.replace("/(auth)/register" as any)} />
          </View>
          <SafeSecureCard />
        </View>
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: AUTH.bg, alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={AUTH.blue} />
        </View>
      ) : null}
    </View>
  );
}
