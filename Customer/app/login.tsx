/**
 * Login — customer-only mobile sign-in (Partner / Merchant / Admin / Agent accounts are rejected).
 * Layout: back + Need Help → dynamic brand logo (admin) → "Home Services You Can Trust" hero (customer + verified service
 * snapshots) → white OTP card → trust stats → security strip → bottom trust area.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck, RotateCw, Lock, ChevronDown, Headphones } from "lucide-react-native";
import { api } from "@/src/api/client";
import { useAuth, isCustomer, AppUser } from "@/src/context/AuthContext";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import { C, PrimaryBtn, IndiaFlag, HeroVisual, HeroFeatures, TrustStats, SecurityStrip, BottomTrust } from "@/src/components/login/LoginParts";
import { onlyDigits, onlyAlpha, isPhone10 } from "@/src/lib/format";
import { LegalConsent } from "@/src/components/site/LegalConsent";

const OTP_LEN = 6;
const ROLE_BLOCKED = "Account already exists";
export default function Login() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { return: returnTo } = useLocalSearchParams<{ return?: string }>();
  // After sign-in, continue where the user came from (e.g. the booking flow) instead
  // of always dropping them on the dashboard. Falls back to dashboard only when there
  // is nowhere to return to.
  const goAfterAuth = () => {
    if (returnTo) { router.replace(returnTo as any); return; }
    if (router.canGoBack()) { router.back(); return; }
    router.replace("/(customer)");
  };
  const toast = useToast();
  const { branding } = useSiteConfig();
  const { isDark } = useTheme();
  const { user, login, loading, booting } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [routing, setRouting] = useState(false);
  const otpRef = useRef<TextInput>(null);

  const { data: cfg } = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<any>("/auth/config", { auth: false }) });
  const [em, setEm] = useState({ email: "", password: "", name: "" });

  useEffect(() => { if (user) { setRouting(true); goAfterAuth(); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const normalized = () => { let p = phone.trim().replace(/\s/g, ""); if (!p.startsWith("+")) p = "+91" + p.replace(/^0+/, ""); return p; };

  const finish = async (data: { token: string; user: AppUser }, greeting?: string) => {
    if (!isCustomer(data?.user)) { toast.error(ROLE_BLOCKED); setOtp(""); setName(""); setStep(1); return false; }
    setRouting(true);
    await login(data.token, data.user);
    toast.success(greeting || `Welcome, ${data.user.name}!`);
    return true;
  };

  const send = async () => {
    if (!isPhone10(phone)) return toast.error("Enter a valid 10-digit mobile number");
    setBusy("send");
    try {
      const data = await api.post<any>("/auth/send-otp", { phone: normalized() }, { auth: false });
      if (data.sent === false) {
        toast.error(data.message || "Could not send the OTP right now. Please try again.");
        if (data.retry_after) setCooldown(Number(data.retry_after) || 60);
        setBusy(""); return;
      }
      if (data.dev_otp) { toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`); setOtp(String(data.dev_otp)); }
      else { toast.success(data.message || "OTP sent to your mobile"); setOtp(""); }
      setCooldown(60);
      setStep(2);
      setTimeout(() => otpRef.current?.focus(), 250);
    } catch (e: any) { toast.error(e?.detail || "Failed to send OTP"); }
    setBusy("");
  };

  const verify = async () => {
    if (otp.length < 4) return toast.error("Enter the OTP");
    setBusy("verify");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: normalized(), otp, create_if_new: false }, { auth: false });
      if (data.new_user) { setStep(3); setBusy(""); return; }
      await finish(data);
    } catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    setBusy("");
  };

  const continueSignup = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    if (!accepted) return toast.error("Please accept the Terms & Conditions and Privacy Policy to continue");
    setBusy("signup");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: normalized(), otp, name, create_if_new: true }, { auth: false });
      await finish(data);
    } catch (e: any) { toast.error(e?.detail || "Could not complete signup"); }
    setBusy("");
  };

  const emailLogin = async () => {
    setBusy("email");
    try { const data = await api.post<any>("/auth/email", em, { auth: false }); await finish(data); }
    catch (e: any) { toast.error(e?.detail || "Login failed"); }
    setBusy("");
  };

  const showLoader = booting || loading || routing || !!user;
  const siteName = branding.site_name || "AzoApp";
  const tagline = branding.tagline || "Service at Your Doorstep";
  // Dynamic brand logo from Admin → Site settings; picks the variant for the active theme.
  const logo = isDark ? (branding.logo_dark || branding.logo_light) : (branding.logo_light || branding.logo_dark);

  const W = Math.min(width, 480);
  const S = W / 390;
  const leftW = W * 0.56;
  const inputStyle = { height: 54, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: "#fff", paddingHorizontal: 16, fontSize: 15, color: C.navy, outlineStyle: "none" } as any;
  const link = { fontSize: 13, color: C.body, fontWeight: "600" } as const;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={{ position: "absolute", left: -W * 0.5, top: -W * 0.35, width: W * 1.3, height: W * 1.1, borderRadius: W, backgroundColor: "#EDF4FF" }} />
      <View pointerEvents="none" style={{ position: "absolute", right: -W * 0.6, top: W * 1.1, width: W * 1.4, height: W * 1.2, borderRadius: W, backgroundColor: "#F0F6FF" }} />

      <KeyboardAwareScrollView bottomOffset={80} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom, paddingHorizontal: 18, width: "100%", maxWidth: 480, alignSelf: "center" }}>
        <View style={{ minHeight: Math.round(462 * S) }}>
          <HeroVisual S={S} W={W} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
            <Pressable testID="login-back-home" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} hitSlop={8}
              style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }], boxShadow: "0px 4px 14px rgba(13,40,90,0.08)" } as any)}>
              <ArrowLeft size={20} color={C.navy} strokeWidth={2.4} />
            </Pressable>
            <Pressable testID="login-need-help" onPress={() => router.push("/(site)/contact" as any)} hitSlop={8}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)", opacity: pressed ? 0.7 : 1 } as any)}>
              <Headphones size={18} color={C.bright} strokeWidth={2.3} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.bright }}>Need Help?</Text>
            </Pressable>
          </View>

          <View testID="brand-logo" style={{ marginTop: 18, zIndex: 5 }}>
            {logo ? (
              <Image testID="brand-logo-dynamic" source={{ uri: logo }} style={{ height: Math.round(72 * S), width: Math.min(200, leftW) }} contentFit="contain" contentPosition="left" cachePolicy="memory-disk" transition={0} />
            ) : (
              <View>
                <Text style={{ fontWeight: "900", fontSize: 30, letterSpacing: -0.8 }}><Text style={{ color: C.bright }}>{siteName.slice(0, 3)}</Text><Text style={{ color: C.orange }}>{siteName.slice(3)}</Text></Text>
                <Text style={{ fontSize: 12, color: C.body, marginTop: -2 }}>— {tagline} —</Text>
              </View>
            )}
          </View>

          <View style={{ width: leftW + 14, marginTop: 22, zIndex: 5 }}>
            <Text testID="login-title" style={{ fontWeight: "900", fontSize: Math.round(31 * S), lineHeight: Math.round(36 * S), color: C.navy, letterSpacing: -1.1 }}>
              Home Services{"\n"}You Can <Text testID="login-title-trust" style={{ color: C.bright }}>Trust</Text>
            </Text>
            <View style={{ width: Math.round(84 * S), height: 4, borderRadius: 4, backgroundColor: C.bright, marginTop: 4, marginLeft: Math.round(118 * S), opacity: 0.9 }} />
            <Text testID="login-subtitle" style={{ color: C.body, marginTop: 14, fontSize: 13.5, lineHeight: 20, width: W * 0.48 }}>
              Book verified professionals for all your home needs. Fast, safe and reliable service at your doorstep.
            </Text>
          </View>
          <HeroFeatures />
        </View>

        <View testID="login-card" style={{ marginTop: 6, padding: 22, paddingTop: 24, borderRadius: 26, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, boxShadow: "0px 18px 44px rgba(13,40,90,0.10)" } as any}>
          {cfg?.auth_config?.mobile_otp === false ? (
            <Text testID="otp-disabled-note" style={{ fontSize: 14, color: C.body, textAlign: "center", paddingVertical: 8 }}>Mobile OTP login is currently disabled. Please use another method below.</Text>
          ) : (
            <View testID="otp-login">
              {step === 1 ? (
                <View style={{ gap: 16 }}>
                  <View>
                    <Text testID="login-card-title" style={{ fontSize: 20, fontWeight: "800", color: C.navy, letterSpacing: -0.4 }}>Enter Your Mobile Number</Text>
                    <Text style={{ fontSize: 13, color: C.body, marginTop: 5, lineHeight: 18 }}>We&apos;ll send you an OTP to login or create your account.</Text>
                  </View>
                  <View testID="phone-field" style={{ flexDirection: "row", alignItems: "center", height: 58, borderRadius: 14, borderWidth: 1, borderColor: phone ? C.bright : C.border, backgroundColor: "#fff", paddingLeft: 14 }}>
                    <IndiaFlag />
                    <Text style={{ marginLeft: 10, fontSize: 16, fontWeight: "700", color: C.navy }}>+91</Text>
                    <ChevronDown size={16} color={C.navy} style={{ marginLeft: 6 }} />
                    <View style={{ width: 1, height: 28, backgroundColor: C.border, marginHorizontal: 14 }} />
                    <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => setPhone(onlyDigits(v, 10))} placeholder="Enter mobile number" placeholderTextColor={C.faint} numberOfLines={1} multiline={false}
                      keyboardType="number-pad" maxLength={10} autoComplete="tel" textContentType="telephoneNumber" onSubmitEditing={send}
                      style={{ flex: 1, minWidth: 0, height: 56, fontSize: 16, color: C.navy, paddingRight: 10, letterSpacing: phone ? 1 : 0, outlineStyle: "none" } as any} />
                  </View>
                  <PrimaryBtn testID="send-otp-button" label="Send OTP" onPress={send} busy={busy === "send"} />
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 }}>
                    <Lock size={15} color={C.body} style={{ marginTop: 1 }} />
                    <Text testID="login-route-note" style={{ fontSize: 11.5, lineHeight: 16, color: C.body, flex: 1 }}>We&apos;ll take you to the right panel (Customer or Partner) based on your number.</Text>
                  </View>
                </View>
              ) : null}

              {step === 2 ? (
                <View style={{ gap: 16 }}>
                  <View>
                    <Text style={{ fontSize: 20, fontWeight: "800", color: C.navy, letterSpacing: -0.4 }}>Verify OTP</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }}>
                      <ShieldCheck size={16} color={C.green} />
                      <Text style={{ fontSize: 13, color: C.body }}>6-digit code sent to <Text style={{ fontWeight: "700", color: C.navy }}>{normalized()}</Text></Text>
                    </View>
                  </View>
                  <Pressable onPress={() => otpRef.current?.focus()} testID="otp-boxes">
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      {Array.from({ length: OTP_LEN }).map((_, i) => {
                        const focused = i === Math.min(otp.length, OTP_LEN - 1);
                        return (
                          <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, minWidth: 0, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: focused ? C.bright : C.border, backgroundColor: focused ? "#F5F9FF" : "#fff", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 21, fontWeight: "800", color: C.navy }}>{otp[i] || ""}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <TextInput ref={otpRef} testID="login-otp-input" value={otp} onChangeText={(v) => setOtp(onlyDigits(v, OTP_LEN))} keyboardType="number-pad" maxLength={OTP_LEN}
                      autoFocus caretHidden autoComplete="sms-otp" textContentType="oneTimeCode" onSubmitEditing={verify}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
                  </Pressable>
                  <PrimaryBtn testID="verify-otp-button" label="Verify OTP" onPress={verify} busy={busy === "verify"} disabled={otp.length < OTP_LEN} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Pressable testID="change-number" onPress={() => { setOtp(""); setStep(1); }}><Text style={link}>← Change number</Text></Pressable>
                    {cooldown > 0 ? (
                      <View testID="resend-countdown" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <RotateCw size={14} color={C.faint} />
                        <Text style={{ fontSize: 13, color: C.faint }}>Resend in <Text style={{ fontWeight: "700", color: C.body }}>{fmtTime(cooldown)}</Text></Text>
                      </View>
                    ) : (
                      <Pressable testID="resend-otp-button" disabled={!!busy} onPress={send} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <RotateCw size={14} color={C.bright} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: C.bright }}>Resend OTP</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : null}

              {step === 3 ? (
                <View testID="otp-name-step" style={{ gap: 14 }}>
                  <View>
                    <Text style={{ fontSize: 20, fontWeight: "800", color: C.navy, letterSpacing: -0.4 }}>Your Name</Text>
                    <Text style={{ fontSize: 13, color: C.body, marginTop: 5 }}>Welcome! Please tell us your name to continue.</Text>
                  </View>
                  <TextInput testID="login-name-input" value={name} onChangeText={(v) => setName(onlyAlpha(v))} placeholder="Your full name" placeholderTextColor={C.faint} autoFocus onSubmitEditing={continueSignup} style={inputStyle} />
                  <LegalConsent checked={accepted} onChange={setAccepted} testID="signup-legal" />
                  <PrimaryBtn testID="continue-signup-button" label="Continue" onPress={continueSignup} busy={busy === "signup"} disabled={!accepted} />
                  <Pressable testID="name-change-number" onPress={() => setStep(1)}><Text style={link}>← Change number</Text></Pressable>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {cfg?.auth_config?.email_login ? (
          <View testID="email-login" style={{ marginTop: 14, padding: 20, borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: "#fff", gap: 10 }}>
            <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: "800", color: C.bright }}>Email Login</Text>
            <TextInput testID="email-input" style={inputStyle} placeholder="Email" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address" value={em.email} onChangeText={(v) => setEm({ ...em, email: v })} />
            <TextInput testID="email-name" style={inputStyle} placeholder="Name (new users)" placeholderTextColor={C.faint} value={em.name} onChangeText={(v) => setEm({ ...em, name: v })} />
            <TextInput testID="email-pass" style={inputStyle} placeholder="Password" placeholderTextColor={C.faint} secureTextEntry value={em.password} onChangeText={(v) => setEm({ ...em, password: v })} />
            <PrimaryBtn testID="email-login-btn" label="Continue with Email" onPress={emailLogin} busy={busy === "email"} />
          </View>
        ) : null}

        <TrustStats />
        <SecurityStrip />
        <BottomTrust bg={C.bg} />
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={C.bright} />
        </View>
      ) : null}
    </View>
  );
}
