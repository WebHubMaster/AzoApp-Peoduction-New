import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { AUTH, Accent, AuthHeader, NeedHelpCard, NeedHelpLink, ROLE_ACCENT } from "@/src/components/auth/AuthUi";
import { OtpFlow, Role, homeFor, LOGIN_ROLES, Step } from "@/src/components/auth/OtpFlow";

const HERO: Record<Role, any> = {
  partner: require("../../assets/hero-partner-arms.png"), // eslint-disable-line @typescript-eslint/no-require-imports
  merchant: require("../../assets/hero-merchant-apron.png"), // eslint-disable-line @typescript-eslint/no-require-imports
};
const ROLES: { role: Role; bullets: string[]; popular?: boolean }[] = [
  { role: "partner", popular: true, bullets: ["Get service requests", "Manage your profile", "Earn more income"] },
  { role: "merchant", bullets: ["Showcase your products", "Manage orders easily", "Grow your local business"] },
];

function RoleCard({ role, bullets, popular, onPress }: { role: Role; bullets: string[]; popular?: boolean; onPress: () => void }) {
  const t: Accent = ROLE_ACCENT[role];
  return (
    <Pressable testID={`pick-${role}`} onPress={onPress} style={({ pressed }) => ({ borderRadius: 22, borderWidth: 1.5, borderColor: t.border, overflow: "hidden", transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <LinearGradient colors={[t.soft, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16, minHeight: 196 }}>
        <View pointerEvents="none" style={{ position: "absolute", right: -30, bottom: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: t.main, opacity: 0.16 }} />
        <Image source={HERO[role]} style={{ position: "absolute", right: 6, bottom: 0, width: 132, height: 150 }} contentFit="contain" contentPosition="bottom right" />
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: t.main, alignItems: "center", justifyContent: "center" }}><Icon name={t.icon} size={30} color="#fff" /></View>
          <View style={{ flex: 1, paddingRight: 110 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ color: AUTH.ink, fontSize: 18, fontWeight: "800" }}>{t.label}</Text>
              {popular ? <View testID="popular-badge" style={{ backgroundColor: "#DCFCE7", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ color: "#15803D", fontSize: 11.5, fontWeight: "800" }}>Popular</Text></View> : null}
            </View>
            <Text style={{ color: AUTH.muted, fontSize: 13, lineHeight: 18, marginTop: 4 }}>{t.sub}</Text>
          </View>
        </View>
        <View style={{ marginTop: 14, gap: 8, paddingRight: 120 }}>
          {bullets.map((b) => (
            <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="check-circle" size={18} color={t.main} />
              <Text style={{ color: "#334155", fontSize: 13.5, fontWeight: "500" }}>{b}</Text>
            </View>
          ))}
        </View>
        <View style={{ position: "absolute", right: 14, top: 18 }}><Icon name="chevron-right" size={24} color={t.dark} /></View>
      </LinearGradient>
    </Pressable>
  );
}

export default function Register() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { user, loading, booting } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [routing, setRouting] = useState(false);

  useEffect(() => { if (user && LOGIN_ROLES.includes(user.role as any)) { setRouting(true); router.replace(homeFor(user) as any); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLoader = booting || loading || routing || (user && LOGIN_ROLES.includes(user.role as any));
  const ac = role ? ROLE_ACCENT[role] : null;
  const goBack = () => { if (role) { setRole(null); setStep("phone"); return; } if (router.canGoBack()) router.back(); else router.replace("/(auth)/welcome" as any); };

  return (
    <View style={{ flex: 1, backgroundColor: AUTH.bg }}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView bottomOffset={110} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <AuthHeader top={insets.top} onBack={goBack} right={role ? <NeedHelpLink /> : undefined} />

        {!role || !ac ? (
          <>
            <View style={{ alignItems: "center", marginTop: 18, paddingHorizontal: 24 }}>
              <View testID="join-pill" style={{ backgroundColor: "#DBEAFE", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ color: AUTH.blue, fontSize: 14, fontWeight: "600" }}>Join <Text style={{ fontWeight: "800" }}>{brand.branding.site_name}</Text></Text>
              </View>
              <Text testID="register-title" style={{ color: AUTH.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.5, marginTop: 12 }}>Create Your Account</Text>
              <Text style={{ color: AUTH.muted, fontSize: 15, marginTop: 6 }}>Choose your role to get started</Text>
            </View>
            <View testID="role-picker" style={{ paddingHorizontal: 16, gap: 16, marginTop: 24 }}>
              {ROLES.map((r) => <RoleCard key={r.role} {...r} onPress={() => { setRole(r.role); setStep("phone"); }} />)}
              <NeedHelpCard />
            </View>
          </>
        ) : (
          <>
            <View style={{ alignItems: "center", marginTop: 18, paddingHorizontal: 24 }}>
              <View testID="role-pill" style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: ac.soft, borderWidth: 1, borderColor: ac.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: ac.main, alignItems: "center", justifyContent: "center" }}><Icon name={ac.icon} size={13} color="#fff" /></View>
                <Text style={{ color: ac.dark, fontSize: 13.5, fontWeight: "800" }}>{ac.label}</Text>
              </View>
              <Text testID="register-title" style={{ color: AUTH.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.5, marginTop: 12 }}>{step === "name" ? "Almost There" : step === "otp" ? "Verify OTP" : "Create Your Account"}</Text>
              <Text style={{ color: AUTH.muted, fontSize: 15, marginTop: 6, textAlign: "center" }}>{step === "name" ? "Tell us your name to finish" : step === "otp" ? "Enter the code we just sent you" : ac.sub}</Text>
            </View>
            <View style={{ alignItems: "center", justifyContent: "flex-end", height: 190, marginTop: 6 }}>
              <View pointerEvents="none" style={{ position: "absolute", bottom: 0, width: 200, height: 200, borderRadius: 100, backgroundColor: ac.main, opacity: 0.14 }} />
              <Image testID="register-hero" source={HERO[role]} style={{ width: 200, height: 186 }} contentFit="contain" contentPosition="bottom" />
            </View>
            <View style={{ paddingHorizontal: 16, gap: 16, marginTop: 14 }}>
              <View testID="register-card" style={{ backgroundColor: "#fff", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "#E8EEF7", boxShadow: AUTH.card }}>
                <OtpFlow key={role} mode="register" role={role} accent={ac} onStepChange={setStep} onRouting={setRouting} />
              </View>
              <Pressable testID="change-role" onPress={goBack} style={{ alignItems: "center", paddingVertical: 4 }}>
                <Text style={{ color: ac.dark, fontSize: 13.5, fontWeight: "700" }}>← Choose a different role</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: AUTH.bg, alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={ac?.main || AUTH.blue} />
        </View>
      ) : null}
    </View>
  );
}
