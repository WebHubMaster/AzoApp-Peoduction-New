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
import { ArrowLeft, ShieldCheck, RotateCw, Lock, ChevronDown } from "lucide-react-native";
import { api } from "@/src/api/client";
import { useAuth, isCustomer, AppUser } from "@/src/context/AuthContext";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import { C, makeGeom, PrimaryBtn, IndiaFlag, HeroImage, Swoosh, HeroFeatures, TrustStats, SecurityStrip, BottomTrust, NeedHelp } from "@/src/components/login/LoginParts";
import { onlyDigits, onlyAlpha, isPhone10 } from "@/src/lib/format";
import { LegalConsent } from "@/src/components/site/LegalConsent";

const OTP_LEN = 6;
const ROLE_BLOCKED = "Account already exists";
export default function Login() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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
  const { branding, stats } = useSiteConfig();
  const { isDark } = useTheme();
  const { user, login, loading, booting } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
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

  const g = makeGeom(width, height - insets.top - insets.bottom);
  const { X, Y, F, u } = g;
  const inputH = Y(88);
  const inputStyle = { height: inputH, borderRadius: 7 * u, borderWidth: 1, borderColor: C.border, backgroundColor: "#fff", paddingHorizontal: 12 * u, fontSize: F(26), color: C.navy, outlineStyle: "none" } as any;
  const h1 = { fontWeight: "600", fontSize: F(33), color: C.navy, letterSpacing: -0.3 } as const;
  const sub = { fontSize: F(22), color: C.body, marginTop: Y(10) } as const;
  const link = { fontSize: F(22), color: C.body, fontWeight: "600" } as const;
  const gap = Y(24);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, overflow: "hidden" }}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView scrollEnabled={false} bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom, alignItems: "center" }}>
        <View testID="login-canvas" style={{ width: g.CW, height: g.H, overflow: "hidden" }}>
          <View pointerEvents="none" style={{ position: "absolute", left: -g.CW * 0.45, top: g.CW * 0.9, width: g.CW * 1.2, height: g.CW * 1.2, borderRadius: g.CW, backgroundColor: "#F2F7FE" }} />
          <HeroImage g={g} />
          <BottomTrust g={g} />

          <Pressable testID="login-back-home" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} hitSlop={10}
            style={({ pressed }) => ({ position: "absolute", left: X(38), top: Y(22), width: X(72), height: X(72), borderRadius: 8 * u, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }], zIndex: 20, boxShadow: "0px 3px 10px rgba(13,40,90,0.08)" } as any)}>
            <ArrowLeft size={F(40)} color={C.navy} strokeWidth={2.4} />
          </Pressable>
          <NeedHelp g={g} onPress={() => router.push("/(site)/contact" as any)} />

          <View testID="brand-logo" style={{ position: "absolute", left: X(48), top: Y(108), height: Y(135), justifyContent: "center" }}>
            {logo ? (
              <Image testID="brand-logo-dynamic" source={{ uri: logo }} style={{ width: X(340), height: Y(135) }} contentFit="contain" contentPosition="left" cachePolicy="memory-disk" transition={0} />
            ) : (
              <View>
                <Text style={{ fontWeight: "900", fontSize: F(70), letterSpacing: -1 }}><Text style={{ color: C.bright }}>{siteName.slice(0, 3)}</Text><Text style={{ color: C.orange }}>{siteName.slice(3)}</Text></Text>
                <Text style={{ fontSize: F(20), color: C.body }}>— {tagline} —</Text>
              </View>
            )}
          </View>

          <Text testID="login-title" style={{ position: "absolute", left: X(48), top: Y(252), fontWeight: "600", fontSize: X(56), lineHeight: Y(66), color: C.navy, letterSpacing: -0.6 * u, zIndex: 5 }}>
            Home Services{"\n"}You Can <Text testID="login-title-trust" style={{ color: C.bright }}>Trust</Text>
          </Text>
          <Swoosh g={g} />
          <Text testID="login-subtitle" style={{ position: "absolute", left: X(52), top: Y(410), width: X(420), fontSize: X(22), lineHeight: Y(32), color: C.body }}>
            Book verified professionals for all{"\n"}your home needs. Fast, safe and{"\n"}reliable service at your doorstep.
          </Text>
          <HeroFeatures g={g} />

          <View testID="login-card" style={{ position: "absolute", left: X(52), right: X(51), top: Y(710), paddingHorizontal: X(48), paddingTop: Y(40), paddingBottom: Y(30), borderRadius: 14 * u, backgroundColor: "#fff", zIndex: 10, boxShadow: "0px 10px 30px rgba(13,40,90,0.07)" } as any}>
            {cfg?.auth_config?.mobile_otp === false ? (
              <Text testID="otp-disabled-note" style={{ ...sub, textAlign: "center" }}>Mobile OTP login is currently disabled. Please use another method.</Text>
            ) : (
              <View testID="otp-login">
                {step === 1 ? (
                  <View>
                    <Text testID="login-card-title" style={h1}>Enter Your Mobile Number</Text>
                    <Text style={sub}>We&apos;ll send you an OTP to login or create your account.</Text>
                    <View testID="phone-field" style={{ marginTop: Y(34), flexDirection: "row", alignItems: "center", height: inputH, borderRadius: 7 * u, borderWidth: 1, borderColor: phone ? C.bright : C.border, backgroundColor: "#fff", paddingLeft: X(24) }}>
                      <IndiaFlag g={g} />
                      <Text style={{ marginLeft: X(22), fontSize: F(28), fontWeight: "700", color: C.navy }}>+91</Text>
                      <ChevronDown size={F(30)} color={C.navy} style={{ marginLeft: X(14) }} />
                      <View style={{ width: 1, height: Y(56), backgroundColor: C.border, marginLeft: X(34), marginRight: X(30) }} />
                      <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => setPhone(onlyDigits(v, 10))} placeholder="Enter mobile number" placeholderTextColor={C.faint} numberOfLines={1} multiline={false}
                        keyboardType="number-pad" maxLength={10} autoComplete="tel" textContentType="telephoneNumber" onSubmitEditing={send}
                        style={{ flex: 1, minWidth: 0, height: inputH - 2, fontSize: F(27), color: C.navy, paddingRight: 8, outlineStyle: "none" } as any} />
                    </View>
                    <View style={{ marginTop: gap }}><PrimaryBtn g={g} testID="send-otp-button" label="Send OTP" onPress={send} busy={busy === "send"} /></View>
                    <View style={{ marginTop: Y(24), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 * u }}>
                      <Lock size={F(26)} color={C.body} />
                      <Text testID="login-route-note" numberOfLines={1} style={{ fontSize: X(17.5), color: C.body, flexShrink: 1 }}>We&apos;ll take you to the right panel (Customer or Partner) based on your number.</Text>
                    </View>
                  </View>
                ) : null}

                {step === 2 ? (
                  <View>
                    <Text style={h1}>Verify OTP</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 * u, marginTop: Y(10) }}>
                      <ShieldCheck size={F(26)} color={C.green} />
                      <Text style={{ fontSize: F(22), color: C.body }}>6-digit code sent to <Text style={{ fontWeight: "700", color: C.navy }}>{normalized()}</Text></Text>
                    </View>
                    <Pressable onPress={() => otpRef.current?.focus()} testID="otp-boxes" style={{ marginTop: Y(28) }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 7 * u }}>
                        {Array.from({ length: OTP_LEN }).map((_, i) => {
                          const focused = i === Math.min(otp.length, OTP_LEN - 1);
                          return (
                            <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, minWidth: 0, height: inputH, borderRadius: 7 * u, borderWidth: 1.5, borderColor: focused ? C.bright : C.border, backgroundColor: focused ? "#F5F9FF" : "#fff", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: F(36), fontWeight: "800", color: C.navy }}>{otp[i] || ""}</Text>
                            </View>
                          );
                        })}
                      </View>
                      <TextInput ref={otpRef} testID="login-otp-input" value={otp} onChangeText={(v) => setOtp(onlyDigits(v, OTP_LEN))} keyboardType="number-pad" maxLength={OTP_LEN}
                        autoFocus caretHidden autoComplete="sms-otp" textContentType="oneTimeCode" onSubmitEditing={verify}
                        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
                    </Pressable>
                    <View style={{ marginTop: gap }}><PrimaryBtn g={g} testID="verify-otp-button" label="Verify OTP" onPress={verify} busy={busy === "verify"} disabled={otp.length < OTP_LEN} /></View>
                    <View style={{ marginTop: Y(22), flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Pressable testID="change-number" onPress={() => { setOtp(""); setStep(1); }}><Text style={link}>← Change number</Text></Pressable>
                      {cooldown > 0 ? (
                        <View testID="resend-countdown" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <RotateCw size={F(24)} color={C.faint} />
                          <Text style={{ fontSize: F(22), color: C.faint }}>Resend in <Text style={{ fontWeight: "700", color: C.body }}>{fmtTime(cooldown)}</Text></Text>
                        </View>
                      ) : (
                        <Pressable testID="resend-otp-button" disabled={!!busy} onPress={send} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <RotateCw size={F(24)} color={C.bright} />
                          <Text style={{ fontSize: F(22), fontWeight: "700", color: C.bright }}>Resend OTP</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ) : null}

                {step === 3 ? (
                  <View testID="otp-name-step" style={{ gap: Y(14) }}>
                    <View>
                      <Text style={h1}>Your Name</Text>
                      <Text style={sub}>Welcome! Please tell us your name to continue.</Text>
                    </View>
                    <TextInput testID="login-name-input" value={name} onChangeText={(v) => setName(onlyAlpha(v))} placeholder="Your full name" placeholderTextColor={C.faint} autoFocus onSubmitEditing={continueSignup} style={inputStyle} />
                    <LegalConsent checked={accepted} onChange={setAccepted} testID="signup-legal" />
                    <PrimaryBtn g={g} testID="continue-signup-button" label="Continue" onPress={continueSignup} busy={busy === "signup"} disabled={!accepted} />
                    <Pressable testID="name-change-number" onPress={() => setStep(1)}><Text style={link}>← Change number</Text></Pressable>
                  </View>
                ) : null}

                {step === 1 && cfg?.auth_config?.email_login ? (
                  <Pressable testID="email-login-toggle" onPress={() => setStep(4)} style={{ marginTop: Y(14), alignSelf: "center" }}>
                    <Text style={{ ...link, color: C.bright }}>Login with Email instead</Text>
                  </Pressable>
                ) : null}

                {step === 4 ? (
                  <View testID="email-login" style={{ gap: Y(14) }}>
                    <Text style={h1}>Email Login</Text>
                    <TextInput testID="email-input" style={inputStyle} placeholder="Email" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address" value={em.email} onChangeText={(v) => setEm({ ...em, email: v })} />
                    <TextInput testID="email-name" style={inputStyle} placeholder="Name (new users)" placeholderTextColor={C.faint} value={em.name} onChangeText={(v) => setEm({ ...em, name: v })} />
                    <TextInput testID="email-pass" style={inputStyle} placeholder="Password" placeholderTextColor={C.faint} secureTextEntry value={em.password} onChangeText={(v) => setEm({ ...em, password: v })} />
                    <PrimaryBtn g={g} testID="email-login-btn" label="Continue with Email" onPress={emailLogin} busy={busy === "email"} />
                    <Pressable testID="email-back" onPress={() => setStep(1)}><Text style={link}>← Use mobile number</Text></Pressable>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {step <= 2 ? <TrustStats g={g} stats={stats} /> : null}
          {step !== 4 ? <SecurityStrip g={g} /> : null}
        </View>
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={C.bright} />
        </View>
      ) : null}
    </View>
  );
}
