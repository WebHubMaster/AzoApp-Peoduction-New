/**
 * Login — mobile view of web_panel/src/pages/auth/Login.jsx + components/OtpLogin.jsx.
 * Customer-only: Partner / Merchant / Admin / Agent accounts are rejected here.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { Zap, Phone, ShieldCheck, ArrowRight, RotateCw, Sparkles, Users } from "lucide-react-native";
import { api } from "@/src/api/client";
import { useAuth, isCustomer, AppUser } from "@/src/context/AuthContext";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { PRIMARY, SLATE, EMERALD, AMBER } from "@/src/theme";
import { onlyDigits, onlyAlpha, isPhone10 } from "@/src/lib/format";

const OTP_LEN = 6;
const ROLE_BLOCKED = "Only Customers can sign in to the Customer App. Partners & Merchants please use their own app.";

/* shadcn <Input> look: h-11 rounded-md border-slate-200 bg-white text-sm */
const inputStyle = { height: 44, borderRadius: 6, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", paddingHorizontal: 12, fontSize: 14, color: SLATE[900] } as const;

function PrimaryBtn({ label, onPress, busy, disabled, icon, testID }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: boolean; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={busy || disabled}
      style={({ pressed }) => ({ height: 44, borderRadius: 6, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, opacity: disabled && !busy ? 0.5 : 1 })}>
      {busy ? <ActivityIndicator color="#fff" size="small" /> : <><Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>{label}</Text>{icon ? <ArrowRight size={16} color="#fff" /> : null}</>}
    </Pressable>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { branding } = useSiteConfig();
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
    if (!isCustomer(data?.user)) { toast.error(ROLE_BLOCKED); return false; }
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
  const logo = branding.logo_light || branding.logo_dark;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView bottomOffset={80} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}>
        {/* BrandLogo */}
        <View testID="brand-logo" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 32 }}>
          {logo ? <Image source={{ uri: logo }} style={{ height: 32, width: 150 }} contentFit="contain" contentPosition="left" /> : (
            <>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Zap size={16} color="#fff" /></View>
              <Text style={{ fontWeight: "800", fontSize: 18, color: SLATE[900] }}>{siteName}</Text>
            </>
          )}
        </View>

        <Text testID="login-title" style={{ fontWeight: "800", fontSize: 30, lineHeight: 36, color: SLATE[900] }}>Sign in to continue</Text>
        <Text style={{ color: SLATE[500], marginTop: 4, marginBottom: 24, fontSize: 16 }}>Login with your mobile number</Text>

        <View style={{ padding: 20, borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "rgba(248,250,252,0.6)" }}>
          {cfg?.auth_config?.mobile_otp === false ? (
            <Text testID="otp-disabled-note" style={{ fontSize: 14, color: SLATE[500], textAlign: "center", paddingVertical: 8 }}>Mobile OTP login is currently disabled. Please use another method below.</Text>
          ) : (
            <View testID="otp-login">
              {step === 1 ? (
                <View style={{ gap: 12 }}>
                  <View style={{ position: "relative" }}>
                    <View style={{ position: "absolute", left: 12, top: 14, zIndex: 1 }}><Phone size={16} color={SLATE[400]} strokeWidth={1.5} /></View>
                    <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => setPhone(onlyDigits(v, 10))} placeholder="Enter 10-digit mobile number" placeholderTextColor={SLATE[400]}
                      keyboardType="number-pad" maxLength={10} onSubmitEditing={send} style={{ ...inputStyle, paddingLeft: 36 }} />
                  </View>
                  <PrimaryBtn testID="send-otp-button" label="Send OTP" icon onPress={send} busy={busy === "send"} />
                  <Text style={{ fontSize: 12, color: SLATE[400], textAlign: "center" }}>We&apos;ll take you to the right panel based on your number.</Text>
                </View>
              ) : null}

              {step === 2 ? (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ShieldCheck size={16} color={EMERALD[500]} />
                    <Text style={{ fontSize: 12, color: SLATE[500] }}>Enter the 6-digit code sent to <Text style={{ fontWeight: "700", color: SLATE[700] }}>{normalized()}</Text></Text>
                  </View>
                  <Pressable onPress={() => otpRef.current?.focus()} testID="otp-boxes">
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      {Array.from({ length: OTP_LEN }).map((_, i) => {
                        const focused = i === Math.min(otp.length, OTP_LEN - 1);
                        return (
                          <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 12, borderWidth: 2, borderColor: focused ? PRIMARY[600] : SLATE[200], backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 20, fontWeight: "700", color: SLATE[800] }}>{otp[i] || ""}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <TextInput ref={otpRef} testID="login-otp-input" value={otp} onChangeText={(v) => setOtp(onlyDigits(v, OTP_LEN))} keyboardType="number-pad" maxLength={OTP_LEN}
                      autoFocus caretHidden autoComplete="sms-otp" textContentType="oneTimeCode" onSubmitEditing={verify}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
                  </Pressable>
                  <PrimaryBtn testID="verify-otp-button" label="Verify OTP" onPress={verify} busy={busy === "verify"} disabled={otp.length < OTP_LEN} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
                    <Pressable testID="change-number" onPress={() => { setOtp(""); setStep(1); }}><Text style={{ fontSize: 12, color: SLATE[500] }}>← Change number</Text></Pressable>
                    {cooldown > 0 ? (
                      <View testID="resend-countdown" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <RotateCw size={14} color={SLATE[300]} />
                        <Text style={{ fontSize: 12, color: SLATE[400] }}>You can resend in <Text style={{ fontWeight: "700", color: SLATE[600] }}>{fmtTime(cooldown)}</Text></Text>
                      </View>
                    ) : (
                      <Pressable testID="resend-otp-button" disabled={!!busy} onPress={send} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <RotateCw size={14} color={busy ? SLATE[400] : PRIMARY[700]} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: busy ? SLATE[400] : PRIMARY[700] }}>Resend OTP</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : null}

              {step === 3 ? (
                <View testID="otp-name-step" style={{ gap: 12 }}>
                  <Text style={{ fontSize: 14, color: SLATE[500] }}>Welcome! Please tell us your name to continue.</Text>
                  <TextInput testID="login-name-input" value={name} onChangeText={(v) => setName(onlyAlpha(v))} placeholder="Your full name" placeholderTextColor={SLATE[400]} autoFocus onSubmitEditing={continueSignup} style={inputStyle} />
                  <PrimaryBtn testID="continue-signup-button" label="Continue" icon onPress={continueSignup} busy={busy === "signup"} />
                  <Pressable testID="name-change-number" onPress={() => setStep(1)}><Text style={{ fontSize: 12, color: SLATE[500] }}>← Change number</Text></Pressable>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {cfg?.auth_config?.email_login ? (
          <View testID="email-login" style={{ marginTop: 16, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", gap: 8 }}>
            <Text style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2.4, fontWeight: "700", color: PRIMARY[700] }}>Email Login</Text>
            <TextInput testID="email-input" style={inputStyle} placeholder="Email" placeholderTextColor={SLATE[400]} autoCapitalize="none" keyboardType="email-address" value={em.email} onChangeText={(v) => setEm({ ...em, email: v })} />
            <TextInput testID="email-name" style={inputStyle} placeholder="Name (new users)" placeholderTextColor={SLATE[400]} value={em.name} onChangeText={(v) => setEm({ ...em, name: v })} />
            <TextInput testID="email-pass" style={inputStyle} placeholder="Password" placeholderTextColor={SLATE[400]} secureTextEntry value={em.password} onChangeText={(v) => setEm({ ...em, password: v })} />
            <PrimaryBtn testID="email-login-btn" label="Continue with Email" onPress={emailLogin} busy={busy === "email"} />
          </View>
        ) : null}

        {demo?.demo_mode && demoCustomer ? (
          <View testID="demo-accounts" style={{ marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Sparkles size={16} color={AMBER[500]} />
              <Text style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2.4, fontWeight: "700", color: SLATE[500] }}>One-click demo login · OTP 123456</Text>
            </View>
            <Pressable testID="demo-customer" onPress={() => quickLogin(demoCustomer)} disabled={busy === demoCustomer.phone}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: pressed ? AMBER[500] : AMBER[200], backgroundColor: pressed ? AMBER[50] : "#fff", opacity: busy === demoCustomer.phone ? 0.5 : 1 })}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: AMBER[100], alignItems: "center", justifyContent: "center" }}>
                {busy === demoCustomer.phone ? <ActivityIndicator size="small" color={AMBER[700]} /> : <Users size={20} color={AMBER[700]} strokeWidth={1.8} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "700", fontSize: 14, color: SLATE[800] }}>Login as Customer</Text>
                <Text numberOfLines={1} style={{ fontSize: 11, color: SLATE[400] }}>Opens Customer account</Text>
              </View>
            </Pressable>
            <Text style={{ fontSize: 11, color: SLATE[400], marginTop: 8, textAlign: "center" }}>Signs you straight into the customer account with pre-loaded demo data.</Text>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={PRIMARY[700]} />
        </View>
      ) : null}
    </View>
  );
}
