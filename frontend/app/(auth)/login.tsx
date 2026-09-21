import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { Icon, MdiName } from "@/src/components/Icon";
import { api } from "@/src/api/client";
import { useAuth, AppUser } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";

type Role = "partner" | "merchant";
type Mode = "login" | "register";
type Step = "phone" | "otp" | "name";
const APP_ROLES: Role[] = ["partner", "merchant"];
const HERO = require("../../assets/hero-pro.png"); // eslint-disable-line @typescript-eslint/no-require-imports
const HERO_MERCHANT = require("../../assets/hero-merchant.png"); // eslint-disable-line @typescript-eslint/no-require-imports
const FALLBACK_LOGO = require("../../assets/brand-logo.png"); // eslint-disable-line @typescript-eslint/no-require-imports
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// Login = blue · Register(neutral/Partner) = green · Merchant = purple.
const TH = {
  login: { main: "#1E40AF", dark: "#1E3A8A", soft: "#EFF6FF", border: "#BFDBFE", grad: ["#3B82F6", "#1E40AF"] as const, chip: "LOGIN MODE", chipSub: "Access your existing account", icon: "login-variant" as MdiName },
  register: { main: "#059669", dark: "#047857", soft: "#ECFDF5", border: "#A7F3D0", grad: ["#10B981", "#047857"] as const, chip: "REGISTER MODE", chipSub: "Create a new account", icon: "account-plus" as MdiName },
  partner: { main: "#059669", dark: "#047857", soft: "#ECFDF5", border: "#A7F3D0", grad: ["#10B981", "#047857"] as const, chip: "REGISTER · PARTNER", chipSub: "Offer services & receive jobs", icon: "wrench" as MdiName },
  merchant: { main: "#9333EA", dark: "#6B21A8", soft: "#FAF5FF", border: "#E9D5FF", grad: ["#A855F7", "#6B21A8"] as const, chip: "REGISTER · MERCHANT", chipSub: "List your shop & manage orders", icon: "storefront-outline" as MdiName },
};

const FEATURES: { icon: MdiName; label: string; bg: string; fg: string }[] = [
  { icon: "shield-check", label: "Verified", bg: "#DBEAFE", fg: "#2563EB" },
  { icon: "currency-inr", label: "Affordable", bg: "#FEF3C7", fg: "#D97706" },
  { icon: "clock-outline", label: "On-Time", bg: "#DCFCE7", fg: "#16A34A" },
  { icon: "heart", label: "Trusted", bg: "#F3E8FF", fg: "#9333EA" },
];

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const { user, login, loading, booting } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("login");
  const [registerRole, setRegisterRole] = useState<Role | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [routing, setRouting] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef<TextInput>(null);

  const { data: demo } = useQuery({ queryKey: ["demo-status"], queryFn: () => api.get<any>("/auth/demo-status", { auth: false }) });
  const logo = brand.branding.logo_light || brand.branding.logo_dark || brand.branding.logo;

  // Active accent theme.
  const ac = mode === "login" ? TH.login : registerRole ? TH[registerRole] : TH.register;

  const home = (u: AppUser) => {
    if (u.role === "partner") return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_partner ? "/(partner)" : "/partner/register";
    return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_merchant ? "/(merchant)" : "/merchant/register";
  };
  useEffect(() => { if (user && APP_ROLES.includes(user.role as Role)) { setRouting(true); router.replace(home(user) as any); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resend countdown (re-schedules once per second, no drift).
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const finish = async ({ token, user: u }: any, greeting?: string) => {
    if (!APP_ROLES.includes(u?.role)) { toast.error(`This app is for Partners & Merchants only. Your ${u?.role || ""} account can sign in on the web panel.`); return; }
    setRouting(true);
    await login(token, u);
    toast.success(greeting || `Welcome, ${u.name || "back"}!`);
    router.replace(home(u) as any);
  };

  const switchMode = (m: Mode) => { setMode(m); setRegisterRole(null); setStep("phone"); setOtp(""); setName(""); };

  const sendOtp = async () => {
    if (phone.trim().length < 10) return toast.error("Enter a valid 10-digit mobile number");
    setBusy("send");
    try {
      const data = await api.post<any>("/auth/send-otp", { phone: `+91${phone.trim()}` }, { auth: false });
      if (data?.sent === false) { toast.error(data.message || "Could not send the OTP right now"); setBusy(""); return; }
      if (data?.dev_otp) { toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`); setOtp(String(data.dev_otp)); } else toast.success("OTP sent to your mobile");
      setStep("otp");
      setResendIn(30);
      setTimeout(() => otpRef.current?.focus(), 250);
    } catch (e: any) { toast.error(e?.detail || "Could not send OTP"); }
    setBusy("");
  };

  const resendOtp = () => { if (resendIn > 0 || busy) return; sendOtp(); };

  // Verify — never auto-creates a customer; unknown numbers must register a role.
  const verifyOtp = async () => {
    if (otp.trim().length < 4) return toast.error("Enter the OTP");
    setBusy("verify");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: `+91${phone.trim()}`, otp: otp.trim(), create_if_new: false, role: mode === "register" ? registerRole || undefined : undefined }, { auth: false });
      if (data?.new_user) {
        if (mode === "register") setStep("name");
        else { setMode("register"); setRegisterRole(null); setStep("phone"); toast.info("No account found for this number — please register below."); }
        setBusy(""); return;
      }
      await finish(data);
    } catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    setBusy("");
  };

  const submitName = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    if (!registerRole) { setStep("phone"); return; }
    setBusy("name");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: `+91${phone.trim()}`, otp: otp.trim(), name: name.trim(), create_if_new: true, role: registerRole }, { auth: false });
      await finish(data, `Welcome, ${data.user?.name || name}!`);
    } catch (e: any) { toast.error(e?.detail || "Could not complete registration"); }
    setBusy("");
  };

  const quickLogin = async (acc: any) => {
    setBusy(acc.phone);
    try {
      await api.post("/auth/send-otp", { phone: acc.phone }, { auth: false });
      const data = await api.post<any>("/auth/verify-otp", { phone: acc.phone, otp: acc.otp, create_if_new: false }, { auth: false });
      await finish(data, `Demo login: ${data.user?.name}`);
    } catch (e: any) { toast.error(e?.detail || "Demo login failed"); }
    setBusy("");
  };

  const demoAccounts: any[] = APP_ROLES.map((r) => (demo?.accounts || []).find((a: any) => a.role === r)).filter(Boolean);
  const showLoader = booting || loading || routing || (user && APP_ROLES.includes(user.role as Role));
  const showRolePicker = mode === "register" && !registerRole;

  const changeNumber = () => { setStep("phone"); setOtp(""); };

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView bottomOffset={110} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* ---------------- Hero (transparent PNG + soft glow) ---------------- */}
        <View style={{ paddingTop: insets.top + 12, height: 300, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
          <LinearGradient colors={[ac.soft, "#F8FAFC"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          {/* brand row */}
          <View style={{ position: "absolute", top: insets.top + 14, left: 20, right: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {logo ? <Image testID="app-brand-logo" source={{ uri: logo }} style={{ height: 34, width: 140 }} contentFit="contain" contentPosition="left" />
              : <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Image source={FALLBACK_LOGO} style={{ width: 34, height: 34, borderRadius: 9 }} contentFit="contain" /><Text style={{ color: "#0D2E63", fontSize: 20, fontWeight: "900" }}>Azo<Text style={{ color: ac.main }}>App</Text></Text></View>}
            <View style={{ backgroundColor: ac.soft, borderColor: ac.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: ac.dark, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 }}>{brand.branding.tagline || "At Your Doorstep"}</Text>
            </View>
          </View>
          {/* glow backdrop */}
          <View pointerEvents="none" style={{ position: "absolute", bottom: 6, width: 230, height: 230, borderRadius: 115, backgroundColor: ac.main, opacity: 0.12 }} />
          <View pointerEvents="none" style={{ position: "absolute", bottom: 26, width: 150, height: 150, borderRadius: 75, backgroundColor: ac.main, opacity: 0.1 }} />
          <Image testID="login-hero" source={mode === "register" && registerRole === "merchant" ? HERO_MERCHANT : HERO} style={{ width: 240, height: 250 }} contentFit="contain" contentPosition="bottom" />
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 6 }}>
          {/* ---------------- Segmented mode toggle ---------------- */}
          <View style={{ flexDirection: "row", backgroundColor: "#EDF1F7", borderRadius: 14, padding: 4, marginBottom: 14 }}>
            {(["login", "register"] as Mode[]).map((m) => {
              const on = mode === m;
              const c = m === "login" ? TH.login : TH.register;
              return (
                <Pressable key={m} testID={`mode-${m}`} onPress={() => switchMode(m)}
                  style={{ flex: 1, height: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: on ? "#fff" : "transparent", boxShadow: on ? "0px 2px 6px rgba(15,23,42,0.10)" : undefined }}>
                  <Icon name={m === "login" ? "login-variant" : "account-plus"} size={17} color={on ? c.main : "#94A3B8"} />
                  <Text style={{ fontSize: 14.5, fontWeight: "800", color: on ? c.dark : "#94A3B8" }}>{m === "login" ? "Log In" : "Register"}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* ---------------- Mode indicator badge ---------------- */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ac.soft, borderColor: ac.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: ac.main }} />
              <Text style={{ color: ac.dark, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 }}>{ac.chip}</Text>
            </View>
            <Text style={{ color: "#64748B", fontSize: 12, flex: 1 }} numberOfLines={1}>{ac.chipSub}</Text>
          </View>

          {/* ---------------- Form (open, full-width — no card) ---------------- */}
          <View style={{ marginTop: 2 }}>
            {/* Role picker (register, no role yet) */}
            {showRolePicker ? (
              <View testID="role-picker" style={{ gap: 12 }}>
                <Text style={{ color: "#0F172A", fontSize: 16, fontWeight: "800" }}>How do you want to join?</Text>
                {APP_ROLES.map((r) => {
                  const t = TH[r];
                  return (
                    <Pressable key={r} testID={`pick-${r}`} onPress={() => { setRegisterRole(r); setStep("phone"); }}
                      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 13, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.soft, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: t.main, alignItems: "center", justifyContent: "center" }}><Icon name={t.icon} size={24} color="#fff" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.dark, fontSize: 15.5, fontWeight: "900" }}>Register as {cap(r)}</Text>
                        <Text style={{ color: "#475569", fontSize: 12, marginTop: 1 }}>{t.chipSub}</Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={t.main} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Phone step */}
            {!showRolePicker && step === "phone" ? (
              <View style={{ gap: 12 }}>
                {mode === "register" && registerRole ? (
                  <Pressable testID="change-role" onPress={() => setRegisterRole(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 2 }}>
                    <Icon name="arrow-left" size={16} color={ac.main} /><Text style={{ color: ac.dark, fontSize: 13, fontWeight: "700" }}>Change role</Text>
                  </Pressable>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name="cellphone" size={18} color={ac.main} />
                  <Text style={{ color: "#0F172A", fontSize: 15, fontWeight: "800" }}>Mobile Number</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 56, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1.5, borderColor: "#DCE6F7", backgroundColor: "#F8FAFC" }}>
                    <View style={{ width: 22, height: 15, borderRadius: 2, overflow: "hidden" }}><View style={{ flex: 1, backgroundColor: "#FF9933" }} /><View style={{ flex: 1, backgroundColor: "#fff" }} /><View style={{ flex: 1, backgroundColor: "#138808" }} /></View>
                    <Text style={{ color: "#0F172A", fontSize: 16, fontWeight: "800" }}>+91</Text>
                  </View>
                  <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="98765 43210" placeholderTextColor="#94A3B8" keyboardType="number-pad" onSubmitEditing={sendOtp}
                    style={{ flex: 1, minWidth: 0, height: 56, paddingHorizontal: 16, borderRadius: 15, borderWidth: 1.5, borderColor: phone.length === 10 ? ac.main : "#DCE6F7", backgroundColor: "#fff", fontSize: 18, letterSpacing: 1.5, color: "#0F172A", fontWeight: "800" }} />
                </View>
                <Pressable testID="send-otp-btn" onPress={sendOtp} disabled={busy === "send"} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                  <LinearGradient colors={ac.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "send" ? 0.7 : 1 }}>
                    {busy === "send" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 16.5, fontWeight: "900" }}>{mode === "login" ? "Log In with OTP" : "Continue"}</Text><Icon name="arrow-right" size={20} color="#fff" /></>}
                  </LinearGradient>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 2 }}>
                  <Icon name="lock-outline" size={13} color="#94A3B8" /><Text style={{ color: "#94A3B8", fontSize: 11.5 }}>Only Partner & Merchant numbers can sign in here</Text>
                </View>
              </View>
            ) : null}

            {/* OTP step */}
            {!showRolePicker && step === "otp" ? (
              <View style={{ gap: 14 }}>
                <Text style={{ color: "#475569", fontSize: 14 }}>Enter the OTP sent to <Text style={{ fontWeight: "800", color: "#0F172A" }}>+91 {phone}</Text></Text>
                <Pressable onPress={() => otpRef.current?.focus()}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    {Array.from({ length: 6 }).map((_, i) => {
                      const active = i === Math.min(otp.length, 5); const filled = i < otp.length;
                      return (
                        <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: active ? ac.main : filled ? "#CBD5E1" : "#DCE6F7", backgroundColor: active ? ac.soft : "#fff", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 22, fontWeight: "900", color: "#0F172A" }}>{otp[i] || ""}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <TextInput ref={otpRef} testID="login-otp-input" value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} autoFocus caretHidden autoComplete="sms-otp" importantForAutofill="yes" textContentType="oneTimeCode" onSubmitEditing={verifyOtp} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
                </Pressable>
                <Pressable testID="verify-otp-btn" onPress={verifyOtp} disabled={busy === "verify"} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                  <LinearGradient colors={ac.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "verify" ? 0.7 : 1 }}>
                    {busy === "verify" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 16.5, fontWeight: "900" }}>{mode === "login" ? "Verify & Log In" : "Verify & Continue"}</Text><Icon name="check" size={20} color="#fff" /></>}
                  </LinearGradient>
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }}>
                  {resendIn > 0 ? (
                    <Text testID="resend-timer" style={{ color: "#94A3B8", fontSize: 13, fontWeight: "600" }}>Resend OTP in 0:{String(resendIn).padStart(2, "0")}</Text>
                  ) : (
                    <Pressable testID="resend-otp" onPress={resendOtp} disabled={busy === "send"} hitSlop={8}>
                      <Text style={{ color: ac.dark, fontSize: 13, fontWeight: "800" }}>{busy === "send" ? "Resending…" : "Resend OTP"}</Text>
                    </Pressable>
                  )}
                  <Text style={{ color: "#CBD5E1" }}>•</Text>
                  <Pressable testID="otp-change-number" onPress={changeNumber} hitSlop={8}><Text style={{ color: ac.dark, fontSize: 13, fontWeight: "700" }}>Change number</Text></Pressable>
                </View>
              </View>
            ) : null}

            {/* Name step */}
            {!showRolePicker && step === "name" ? (
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: ac.soft, borderRadius: 12, padding: 12 }}>
                  <Icon name={ac.icon} size={20} color={ac.main} />
                  <Text style={{ color: ac.dark, fontSize: 13, fontWeight: "700", flex: 1 }}>Creating a new {cap(registerRole || "")} account</Text>
                </View>
                <Text style={{ color: "#475569", fontSize: 14 }}>What should we call you?</Text>
                <TextInput testID="login-name-input" value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor="#94A3B8" autoFocus onSubmitEditing={submitName} style={{ height: 56, paddingHorizontal: 16, borderRadius: 15, borderWidth: 1.5, borderColor: "#DCE6F7", backgroundColor: "#fff", fontSize: 16, color: "#0F172A", fontWeight: "600" }} />
                <Pressable testID="continue-signup-btn" onPress={submitName} disabled={busy === "name"} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                  <LinearGradient colors={ac.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "name" ? 0.7 : 1 }}>
                    {busy === "name" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 16.5, fontWeight: "900" }}>Create {cap(registerRole || "")} account</Text><Icon name="arrow-right" size={20} color="#fff" /></>}
                  </LinearGradient>
                </Pressable>
                <Pressable testID="name-start-over" onPress={() => switchMode("register")} style={{ alignItems: "center" }}><Text style={{ color: ac.dark, fontSize: 13, fontWeight: "700" }}>← Start over</Text></Pressable>
              </View>
            ) : null}

            {/* Demo — login mode, phone step */}
            {mode === "login" && step === "phone" && demo?.demo_mode && demoAccounts.length > 0 ? (
              <View testID="demo-accounts" style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#EEF2F7", gap: 10 }}>
                <Text style={{ color: "#64748B", fontSize: 11.5, fontWeight: "900", letterSpacing: 0.8, textAlign: "center" }}>★ ONE-CLICK DEMO LOGIN ★</Text>
                {demoAccounts.map((a) => {
                  const t = TH[a.role as Role];
                  return (
                    <Pressable key={a.role} testID={`demo-${a.role}`} onPress={() => quickLogin(a)} disabled={!!busy}
                      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.soft, opacity: busy && busy !== a.phone ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.main, alignItems: "center", justifyContent: "center" }}>{busy === a.phone ? <ActivityIndicator size="small" color="#fff" /> : <Icon name={t.icon} size={20} color="#fff" />}</View>
                      <View style={{ flex: 1 }}><Text style={{ color: t.dark, fontSize: 14.5, fontWeight: "800" }}>Login as {cap(a.role)}</Text><Text style={{ color: "#64748B", fontSize: 11.5 }}>Opens the {cap(a.role)} demo app</Text></View>
                      <Icon name="chevron-right" size={18} color={t.main} />
                    </Pressable>
                  );
                })}
                <View style={{ backgroundColor: "#EEF4FF", borderRadius: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Icon name="key-outline" size={15} color="#2563EB" /><Text style={{ color: "#334155", fontSize: 13, fontWeight: "700" }}>Demo OTP: <Text style={{ color: "#1E40AF", fontWeight: "900" }}>123456</Text></Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* trust strip (open, no card) */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderTopColor: "#E7EDF5", paddingHorizontal: 4 }}>
            {FEATURES.map((f, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: f.bg, alignItems: "center", justifyContent: "center" }}><Icon name={f.icon} size={20} color={f.fg} /></View>
                <Text style={{ color: "#475569", fontSize: 11, fontWeight: "700" }}>{f.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ textAlign: "center", color: "#94A3B8", fontSize: 11.5, marginTop: 14 }}>© AzoApp · Your data is secure & encrypted</Text>
        </View>
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={ac.main} />
        </View>
      ) : null}
    </View>
  );
}
