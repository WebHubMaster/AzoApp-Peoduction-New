import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { useTheme, palette } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { api } from "@/src/api/client";
import { useAuth, AppUser } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { OtpLogin, Role, AuthResult } from "@/src/components/auth/OtpLogin";
import { ForgotPasswordSheet } from "@/src/components/auth/ForgotPasswordSheet";
import { AuthInput, AuthButton, AuthCard, TextLink } from "@/src/components/auth/AuthKit";
import { isEmail } from "@/src/lib/validation";
import { TW } from "@/src/components/partner/home/tw";

/* 1:1 port of web pages/auth/Login.jsx (mobile view) — Partner & Merchant ONLY.
   Customer / admin / agent accounts are rejected on this app (token never stored). */
const APP_ROLES: Role[] = ["partner", "merchant"];
const ROLE_STYLE: Record<Role, { label: string; portal: string; icon: any; badgeBg: string; badgeFg: string; border: string }> = {
  partner: { label: "Partner", portal: "Partner app", icon: "wrench-outline", badgeBg: TW.emerald100, badgeFg: TW.emerald700, border: TW.emerald200 },
  merchant: { label: "Merchant", portal: "Merchant panel", icon: "storefront-outline", badgeBg: TW.fuchsia100, badgeFg: TW.fuchsia700, border: "#F5D0FE" },
};

function BrandLogo() {
  const { colors, mode } = useTheme();
  const brand = useBrand();
  const P = palette(colors.primary);
  const logo = mode === "dark" ? brand.branding.logo_dark || brand.branding.logo : brand.branding.logo || brand.branding.logo_light;
  if (logo) return <Image testID="app-brand-logo" source={{ uri: logo }} style={{ height: 40, width: 170 }} contentFit="contain" contentPosition="left" />;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: P[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>{(brand.branding.site_name || "A")[0]}</Text></View>
      <View><Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{brand.branding.site_name}</Text><Text style={{ color: TW.slate400, fontSize: 10 }}>{brand.branding.tagline}</Text></View>
    </View>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const P = palette(colors.primary);
  const router = useRouter();
  const { user, login, loading, booting } = useAuth();
  const toast = useToast();
  const [registerRole, setRegisterRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState("");
  const [em, setEm] = useState({ email: "", password: "" });
  const [forgot, setForgot] = useState(false);
  const [routing, setRouting] = useState(false);

  const { data: cfg } = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<any>("/auth/config", { auth: false }) });
  const { data: demo } = useQuery({ queryKey: ["demo-status"], queryFn: () => api.get<any>("/auth/demo-status", { auth: false }) });
  const ac = cfg?.auth_config || {};

  const home = (u: AppUser) => {
    if (u.role === "partner") return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_partner ? "/(partner)" : "/partner/register";
    return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_merchant ? "/(merchant)" : "/merchant/register";
  };
  // Already signed in (auto-login) → straight to the right panel, like web HOME[role].
  useEffect(() => { if (user && APP_ROLES.includes(user.role as Role)) { setRouting(true); router.replace(home(user) as any); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Role gate + session persist. Web routes HOME[role]; this app only admits partner/merchant. */
  const finish = async ({ token, user: u }: AuthResult, greeting?: string) => {
    if (!APP_ROLES.includes(u?.role)) {
      toast.error(`This app is for Partners & Merchants only. Your ${u?.role || ""} account can sign in on the web panel.`);
      return;
    }
    setRouting(true);
    await login(token, u);
    toast.success(greeting || `Welcome, ${u.name || "back"}!`);
    router.replace(home(u) as any);
  };

  const emailLogin = async () => {
    if (!isEmail(em.email)) return toast.error("Enter a valid email address");
    if (em.password.length < 4) return toast.error("Password too short (min 4 characters)");
    setBusy("email");
    try { await finish(await api.post<any>("/auth/email", { email: em.email.trim(), password: em.password, create_if_new: false }, { auth: false })); }
    catch (e: any) { toast.error(e?.detail || "Login failed"); }
    setBusy("");
  };

  const quickLogin = async (acc: any) => {
    setBusy(acc.phone);
    try {
      await api.post("/auth/send-otp", { phone: acc.phone }, { auth: false });
      const data = await api.post<any>("/auth/verify-otp", { phone: acc.phone, otp: acc.otp }, { auth: false });
      await finish(data, `Demo login: ${data.user?.name}`);
    } catch (e: any) { toast.error(e?.detail || "Demo login failed"); }
    setBusy("");
  };

  const demoAccounts: any[] = APP_ROLES.map((r) => (demo?.accounts || []).find((a: any) => a.role === r)).filter(Boolean);
  const showLoader = booting || loading || routing || (user && APP_ROLES.includes(user.role as Role));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <KeyboardAwareScrollView bottomOffset={24} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 40 }}>
        <View style={{ marginBottom: 32 }}><BrandLogo /></View>
        <Text testID="login-title" style={{ color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "800" }}>{registerRole ? `Register as ${registerRole}` : "Sign in to continue"}</Text>
        <Text style={{ color: TW.slate500, fontSize: 15, marginTop: 4, marginBottom: 24 }}>{registerRole ? "Verify your mobile to create your account" : "Login with your mobile number"}</Text>

        <AuthCard subtle>
          {ac.mobile_otp === false
            ? <Text testID="otp-disabled-note" style={{ color: TW.slate500, fontSize: 14, textAlign: "center", paddingVertical: 8 }}>Mobile OTP login is currently disabled. Please use another method below.</Text>
            : <OtpLogin registerRole={registerRole} onPickRole={setRegisterRole} onSuccess={finish} />}
        </AuthCard>

        {/* register toggles — exact web behaviour */}
        <View testID="register-toggles" style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          {APP_ROLES.map((r) => {
            if (r === "merchant" && registerRole === "partner") return null;
            const on = registerRole === r;
            return (
              <Pressable key={r} testID={`reg-${r}`} onPress={() => setRegisterRole(on ? null : r)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: on ? P[700] : colors.border, backgroundColor: on ? P[50] : "transparent", alignItems: "center" }}>
                <Text style={{ color: on ? P[700] : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>{on ? "← Back to login" : `Register as ${ROLE_STYLE[r].label}`}</Text>
              </Pressable>
            );
          })}
        </View>

        {ac.email_login ? (
          <AuthCard testID="email-login" style={{ marginTop: 16, gap: 8 }}>
            <Text style={{ color: P[700], fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 2.4 }}>Email Login</Text>
            <AuthInput testID="email-input" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={em.email} onChangeText={(v) => setEm({ ...em, email: v })} />
            <AuthInput testID="email-pass" placeholder="Password" secureTextEntry value={em.password} onChangeText={(v) => setEm({ ...em, password: v })} onSubmitEditing={emailLogin} />
            <AuthButton testID="email-login-btn" title="Continue with Email" onPress={emailLogin} busy={busy === "email"} />
            <TextLink testID="forgot-password-link" title="Forgot password?" onPress={() => setForgot(true)} primary align="center" />
          </AuthCard>
        ) : null}

        {ac.social_login || ac.whatsapp_login ? (
          <View testID="alt-auth" style={{ marginTop: 12, gap: 8 }}>
            {ac.whatsapp_login ? <AuthButton testID="wa-login" variant="outline" title="Continue with WhatsApp OTP" icon="whatsapp" onPress={() => toast.info("WhatsApp OTP uses the same mobile flow above")} /> : null}
            {ac.social_login ? <AuthButton testID="social-login-disabled" variant="outline" title="Continue with Google" icon="google" onPress={() => toast.info(cfg?.integrations?.google_client_id ? "Google sign-in is available on the web panel. Use your mobile number here." : "Admin: add Google Client ID in Integrations to enable Google sign-in")} /> : null}
          </View>
        ) : null}

        {demo?.demo_mode && demoAccounts.length > 0 ? (
          <View testID="demo-accounts" style={{ marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="auto-fix" size={16} color={colors.accent} />
              <Text style={{ color: TW.slate500, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 2.4 }}>One-click demo login · OTP 123456</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {demoAccounts.map((a) => {
                const s = ROLE_STYLE[a.role as Role];
                const on = busy === a.phone;
                return (
                  <Pressable key={a.role} testID={`demo-${a.role}`} onPress={() => quickLogin(a)} disabled={!!busy} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: s.border, backgroundColor: colors.surface, opacity: busy && !on ? 0.5 : 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: s.badgeBg, alignItems: "center", justifyContent: "center" }}>
                      {on ? <ActivityIndicator size="small" color={s.badgeFg} /> : <Icon name={s.icon} size={20} color={s.badgeFg} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>Login as {s.label}</Text>
                      <Text style={{ color: TW.slate400, fontSize: 11 }} numberOfLines={1}>Opens {s.portal}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: TW.slate400, fontSize: 11, textAlign: "center", marginTop: 8 }}>Each button signs you straight into that portal with pre-loaded demo data.</Text>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <ForgotPasswordSheet open={forgot} onClose={() => setForgot(false)} />
      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={P[700]} />
        </View>
      ) : null}
    </View>
  );
}
