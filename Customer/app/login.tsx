/**
 * Login — customer-only mobile sign-in (Partner / Merchant / Admin / Agent accounts are rejected).
 * Layout follows the approved reference: back chip → dynamic brand logo (admin light/dark) → "Sign In to {Brand}"
 * hero with feature chips + illustration → white card (Mobile Number · +91 · Send OTP → OTP boxes → name).
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Zap, ShieldCheck, ArrowRight, RotateCw, Sparkles, Users, Lock, ChevronDown } from "lucide-react-native";
import { api } from "@/src/api/client";
import { useAuth, isCustomer, AppUser } from "@/src/context/AuthContext";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { PRIMARY, SLATE, EMERALD, AMBER, useTheme } from "@/src/theme";
import { onlyDigits, onlyAlpha, isPhone10 } from "@/src/lib/format";

const OTP_LEN = 6;
const ROLE_BLOCKED = "Only Customers can sign in to the Customer App. Partners & Merchants please use their own app.";
const HERO = require("../assets/login-hero.webp");
const HERO_RATIO = 0.60; // width / height of the cutout

function PrimaryBtn({ label, onPress, busy, disabled, icon, testID }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: boolean; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={busy || disabled}
      style={({ pressed }) => ({ height: 54, borderRadius: 14, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[600], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: disabled && !busy ? 0.5 : 1, boxShadow: "0px 8px 20px rgba(18,88,183,0.28)" } as any)}>
      {busy ? <ActivityIndicator color="#fff" size="small" /> : <><Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{label}</Text>{icon ? <ArrowRight size={18} color="#fff" strokeWidth={2.4} /> : null}</>}
    </Pressable>
  );
}

function IndiaFlag() {
  return (
    <View style={{ width: 22, height: 15, borderRadius: 2, overflow: "hidden", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.08)" }}>
      <View style={{ flex: 1, backgroundColor: "#FF9933" }} />
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}><View style={{ width: 4, height: 4, borderRadius: 2, borderWidth: 1, borderColor: "#000080" }} /></View>
      <View style={{ flex: 1, backgroundColor: "#138808" }} />
    </View>
  );
}

function Chip({ icon, title, sub, dark }: { icon: React.ReactNode; title: string; sub: string; dark: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: dark ? "rgba(30,41,59,0.9)" : "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0px 2px 8px rgba(15,23,42,0.08)" } as any}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "800", color: dark ? "#F8FAFC" : SLATE[800] }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 10.5, color: dark ? SLATE[400] : SLATE[500] }}>{sub}</Text>
      </View>
    </View>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const toast = useToast();
  const { branding } = useSiteConfig();
  const { isDark } = useTheme();
  const { user, login, loading, booting } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [routing, setRouting] = useState(false);
  const otpRef = useRef<TextInput>(null);

  const { data: demo } = useQuery({ queryKey: ["demo-status"], queryFn: () => api.get<any>("/auth/demo-status", { auth: false }) });
  const { data: cfg } = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<any>("/auth/config", { auth: false }) });
  const [em, setEm] = useState({ email: "", password: "", name: "" });

  useEffect(() => { if (user) { setRouting(true); router.replace("/(customer)"); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
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
    router.replace("/(customer)");
    return true;
  };

  const send = async () => {
    if (!isPhone10(phone)) return toast.error("Enter a valid 10-digit mobile number");
    setBusy("send");
    try {
      const data = await api.post<any>("/auth/send-otp", { phone: normalized() }, { auth: false });
      if (data.sent === false) {
        toast.error(data.message || "Could not send the OTP right now. Please try again.");
        if (data.retry_after) setCooldown(Number(data.retry_after) || 30);
        setBusy(""); return;
      }
      if (data.dev_otp) { toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`); setOtp(String(data.dev_otp)); }
      else { toast.success(data.message || "OTP sent to your mobile"); setOtp(""); }
      setCooldown(30);
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

  const quickLogin = async (acc: any) => {
    setBusy(acc.phone);
    try {
      await api.post("/auth/send-otp", { phone: acc.phone }, { auth: false });
      const data = await api.post<any>("/auth/verify-otp", { phone: acc.phone, otp: acc.otp }, { auth: false });
      await finish(data, `Demo login: ${data.user.name}`);
    } catch (e: any) { toast.error(e?.detail || "Demo login failed"); }
    setBusy("");
  };

  const demoCustomer = (demo?.accounts || []).find((a: any) => a.role === "customer");
  const showLoader = booting || loading || routing || !!user;
  const siteName = branding.site_name || "AzoApp";
  const tagline = branding.tagline || "Service at Your Doorstep";
  // Dynamic brand logo from Admin → Site settings; picks the variant for the active theme.
  const logo = isDark ? (branding.logo_dark || branding.logo_light) : (branding.logo_light || branding.logo_dark);

  const bg = isDark ? "#0B1220" : "#F5F8FD";
  const cardBg = isDark ? "#111A2E" : "#fff";
  const heading = isDark ? "#F8FAFC" : "#0B1C4A";
  const muted = isDark ? SLATE[400] : SLATE[500];
  const inputBorder = isDark ? "#243350" : SLATE[200];
  const inputBg = isDark ? "#0F172A" : "#fff";
  const inputText = isDark ? "#F1F5F9" : SLATE[900];
  const heroH = Math.min(230, Math.round(width * 0.62));
  const heroW = Math.round(heroH * HERO_RATIO);
  const inputStyle = { height: 50, borderRadius: 12, borderWidth: 1, borderColor: inputBorder, backgroundColor: inputBg, paddingHorizontal: 14, fontSize: 15, color: inputText } as const;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* soft background discs */}
      <View pointerEvents="none" style={{ position: "absolute", right: -width * 0.25, top: insets.top + 110, width: width * 0.75, height: width * 0.75, borderRadius: width, backgroundColor: isDark ? "rgba(30,64,175,0.20)" : "#DCE9FB" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: -width * 0.3, bottom: -width * 0.35, width: width * 0.9, height: width * 0.9, borderRadius: width, backgroundColor: isDark ? "rgba(30,64,175,0.12)" : "#E8F0FC" }} />

      <KeyboardAwareScrollView bottomOffset={80} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 18 }}>
        {/* Back */}
        <Pressable testID="login-back-home" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} hitSlop={8}
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 13, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? "#1E293B" : "#E6EDF7", alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }], boxShadow: "0px 2px 8px rgba(15,23,42,0.06)" } as any)}>
          <ArrowLeft size={18} color={heading} strokeWidth={2.4} />
        </Pressable>

        {/* Brand (dynamic from admin) */}
        <View testID="brand-logo" style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 }}>
          {logo ? (
            <Image testID="brand-logo-dynamic" source={{ uri: logo }} style={{ height: 44, width: Math.min(220, width * 0.6) }} contentFit="contain" contentPosition="left" cachePolicy="memory-disk" transition={0} />
          ) : (
            <>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}><Zap size={24} color="#fff" strokeWidth={2.4} /></View>
              <View>
                <Text style={{ fontWeight: "900", fontSize: 24, color: heading, letterSpacing: -0.5 }}>{siteName}</Text>
                <Text style={{ fontSize: 11.5, color: muted, marginTop: -1 }}>{tagline}</Text>
              </View>
            </>
          )}
        </View>

        {/* Hero */}
        <View style={{ flexDirection: "row", marginTop: 26, minHeight: heroH }}>
          <View style={{ flex: 1, paddingRight: 6, zIndex: 2 }}>
            <Text testID="login-title" style={{ fontWeight: "900", fontSize: 32, lineHeight: 38, color: heading, letterSpacing: -0.8 }}>Sign In to</Text>
            <Text style={{ fontWeight: "900", fontSize: 32, lineHeight: 38, color: PRIMARY[500], letterSpacing: -0.8 }}>{siteName}</Text>
            <Text style={{ color: muted, marginTop: 10, fontSize: 14, lineHeight: 20 }}>Login with your mobile number and get quick access to all services.</Text>
          </View>
          <View style={{ width: heroW, alignItems: "flex-end", justifyContent: "flex-end" }}>
            <Image testID="login-hero" source={HERO} style={{ width: heroW + 10, height: heroH, marginRight: -18 }} contentFit="contain" contentPosition="bottom right" transition={0} priority="high" />
          </View>
        </View>

        {/* Feature chips */}
        <View testID="login-features" style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Chip dark={isDark} icon={<ShieldCheck size={15} color={PRIMARY[600]} strokeWidth={2.4} />} title="Safe &" sub="Secure" />
          <Chip dark={isDark} icon={<Zap size={15} color={PRIMARY[600]} strokeWidth={2.4} />} title="Fast" sub="Login" />
          <Chip dark={isDark} icon={<Users size={15} color={PRIMARY[600]} strokeWidth={2.4} />} title="Trusted" sub="Platform" />
        </View>

        {/* Card */}
        <View testID="login-card" style={{ marginTop: 18, padding: 18, borderRadius: 24, backgroundColor: cardBg, borderWidth: 1, borderColor: isDark ? "#1E293B" : "#E9EFF8", boxShadow: "0px 14px 36px rgba(15,23,42,0.10)" } as any}>
          {cfg?.auth_config?.mobile_otp === false ? (
            <Text testID="otp-disabled-note" style={{ fontSize: 14, color: muted, textAlign: "center", paddingVertical: 8 }}>Mobile OTP login is currently disabled. Please use another method below.</Text>
          ) : (
            <View testID="otp-login">
              {step === 1 ? (
                <View style={{ gap: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: heading }}>Mobile Number</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: inputBorder, backgroundColor: inputBg, paddingLeft: 14 }}>
                    <IndiaFlag />
                    <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: "700", color: inputText }}>+91</Text>
                    <ChevronDown size={16} color={muted} style={{ marginLeft: 4 }} />
                    <View style={{ width: 1, height: 26, backgroundColor: inputBorder, marginHorizontal: 12 }} />
                    <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => setPhone(onlyDigits(v, 10))} placeholder="Enter 10-digit mobile number" placeholderTextColor={SLATE[400]}
                      keyboardType="number-pad" maxLength={10} autoComplete="tel" textContentType="telephoneNumber" onSubmitEditing={send}
                      style={{ flex: 1, height: 52, fontSize: 15, color: inputText, paddingRight: 12, outlineStyle: "none" } as any} />
                  </View>
                  <PrimaryBtn testID="send-otp-button" label="Send OTP" icon onPress={send} busy={busy === "send"} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <Lock size={13} color={SLATE[400]} />
                    <Text style={{ fontSize: 11.5, color: SLATE[400] }}>We&apos;ll take you to the right panel based on your number.</Text>
                  </View>
                </View>
              ) : null}

              {step === 2 ? (
                <View style={{ gap: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: heading }}>Enter OTP</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ShieldCheck size={16} color={EMERALD[500]} />
                    <Text style={{ fontSize: 12.5, color: muted }}>6-digit code sent to <Text style={{ fontWeight: "700", color: heading }}>{normalized()}</Text></Text>
                  </View>
                  <Pressable onPress={() => otpRef.current?.focus()} testID="otp-boxes">
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      {Array.from({ length: OTP_LEN }).map((_, i) => {
                        const focused = i === Math.min(otp.length, OTP_LEN - 1);
                        return (
                          <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, minWidth: 0, height: 52, borderRadius: 14, borderWidth: 2, borderColor: focused ? PRIMARY[600] : inputBorder, backgroundColor: inputBg, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 20, fontWeight: "800", color: inputText }}>{otp[i] || ""}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <TextInput ref={otpRef} testID="login-otp-input" value={otp} onChangeText={(v) => setOtp(onlyDigits(v, OTP_LEN))} keyboardType="number-pad" maxLength={OTP_LEN}
                      autoFocus caretHidden autoComplete="sms-otp" textContentType="oneTimeCode" onSubmitEditing={verify}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
                  </Pressable>
                  <PrimaryBtn testID="verify-otp-button" label="Verify OTP" icon onPress={verify} busy={busy === "verify"} disabled={otp.length < OTP_LEN} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
                    <Pressable testID="change-number" onPress={() => { setOtp(""); setStep(1); }}><Text style={{ fontSize: 12.5, color: muted }}>← Change number</Text></Pressable>
                    {cooldown > 0 ? (
                      <View testID="resend-countdown" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <RotateCw size={14} color={SLATE[300]} />
                        <Text style={{ fontSize: 12.5, color: SLATE[400] }}>Resend in <Text style={{ fontWeight: "700", color: muted }}>{fmtTime(cooldown)}</Text></Text>
                      </View>
                    ) : (
                      <Pressable testID="resend-otp-button" disabled={!!busy} onPress={send} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <RotateCw size={14} color={busy ? SLATE[400] : PRIMARY[600]} />
                        <Text style={{ fontSize: 12.5, fontWeight: "700", color: busy ? SLATE[400] : PRIMARY[600] }}>Resend OTP</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : null}

              {step === 3 ? (
                <View testID="otp-name-step" style={{ gap: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: heading }}>Your Name</Text>
                  <Text style={{ fontSize: 13, color: muted }}>Welcome! Please tell us your name to continue.</Text>
                  <TextInput testID="login-name-input" value={name} onChangeText={(v) => setName(onlyAlpha(v))} placeholder="Your full name" placeholderTextColor={SLATE[400]} autoFocus onSubmitEditing={continueSignup} style={inputStyle} />
                  <PrimaryBtn testID="continue-signup-button" label="Continue" icon onPress={continueSignup} busy={busy === "signup"} />
                  <Pressable testID="name-change-number" onPress={() => setStep(1)}><Text style={{ fontSize: 12.5, color: muted }}>← Change number</Text></Pressable>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {cfg?.auth_config?.email_login ? (
          <View testID="email-login" style={{ marginTop: 14, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: isDark ? "#1E293B" : "#E9EFF8", backgroundColor: cardBg, gap: 10 }}>
            <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: "800", color: PRIMARY[600] }}>Email Login</Text>
            <TextInput testID="email-input" style={inputStyle} placeholder="Email" placeholderTextColor={SLATE[400]} autoCapitalize="none" keyboardType="email-address" value={em.email} onChangeText={(v) => setEm({ ...em, email: v })} />
            <TextInput testID="email-name" style={inputStyle} placeholder="Name (new users)" placeholderTextColor={SLATE[400]} value={em.name} onChangeText={(v) => setEm({ ...em, name: v })} />
            <TextInput testID="email-pass" style={inputStyle} placeholder="Password" placeholderTextColor={SLATE[400]} secureTextEntry value={em.password} onChangeText={(v) => setEm({ ...em, password: v })} />
            <PrimaryBtn testID="email-login-btn" label="Continue with Email" onPress={emailLogin} busy={busy === "email"} />
          </View>
        ) : null}

        {demo?.demo_mode && demoCustomer ? (
          <View testID="demo-accounts" style={{ marginTop: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Sparkles size={15} color={AMBER[500]} />
              <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, fontWeight: "800", color: muted }}>One-click demo login · OTP 123456</Text>
            </View>
            <Pressable testID="demo-customer" onPress={() => quickLogin(demoCustomer)} disabled={busy === demoCustomer.phone}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: pressed ? AMBER[500] : AMBER[200], backgroundColor: pressed ? AMBER[50] : cardBg, opacity: busy === demoCustomer.phone ? 0.5 : 1 })}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: AMBER[100], alignItems: "center", justifyContent: "center" }}>
                {busy === demoCustomer.phone ? <ActivityIndicator size="small" color={AMBER[700]} /> : <Users size={20} color={AMBER[700]} strokeWidth={1.8} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "700", fontSize: 14, color: heading }}>Login as Customer</Text>
                <Text numberOfLines={1} style={{ fontSize: 11, color: muted }}>Opens Customer account</Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bg, alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={PRIMARY[600]} />
        </View>
      ) : null}
    </View>
  );
}
