import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Icon } from "@/src/components/Icon";
import { api } from "@/src/api/client";
import { useAuth, AppUser } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { AUTH, Accent } from "./AuthUi";

export type Role = "partner" | "merchant";
export type Step = "phone" | "otp" | "name";
export const LOGIN_ROLES = ["partner", "merchant", "agent"] as const;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export const homeFor = (u: AppUser) => {
  if (u.role === "agent") return "/(agent)";
  if (u.role === "partner") return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_partner ? "/(partner)" : "/partner/register";
  return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_merchant ? "/(merchant)" : "/merchant/register";
};

function GradButton({ title, icon, busy, onPress, grad, testID }: { title: string; icon: any; busy: boolean; onPress: () => void; grad: readonly [string, string]; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={busy} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, opacity: busy ? 0.7 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>{title}</Text><Icon name={icon} size={22} color="#fff" /></>}
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Shared Mobile-OTP flow (same backend logic for Login & Register):
 *  phone → /auth/send-otp → otp → /auth/verify-otp(create_if_new:false)
 *  · login:    new_user → onNewUser() (send to Register)
 *  · register: new_user → name → /auth/verify-otp(create_if_new:true, role)
 */
export function OtpFlow({ mode, role, accent, onNewUser, onStepChange, onRouting }: { mode: "login" | "register"; role?: Role; accent: Accent; onNewUser?: () => void; onStepChange?: (s: Step) => void; onRouting?: (v: boolean) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { login } = useAuth();
  const [step, setStepRaw] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef<TextInput>(null);
  const setStep = (s: Step) => { setStepRaw(s); onStepChange?.(s); };

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const finish = async ({ token, user: u }: any, greeting?: string) => {
    if (!LOGIN_ROLES.includes(u?.role)) { toast.error(`This app is for Partners & Merchants only. Your ${u?.role || ""} account can sign in on the web panel.`); return; }
    onRouting?.(true);
    await login(token, u);
    toast.success(greeting || `Welcome, ${u.name || "back"}!`);
    router.replace(homeFor(u) as any);
  };

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

  const verifyOtp = async () => {
    if (otp.trim().length < 4) return toast.error("Enter the OTP");
    setBusy("verify");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: `+91${phone.trim()}`, otp: otp.trim(), create_if_new: false, role: mode === "register" ? role : undefined }, { auth: false });
      if (data?.new_user) {
        if (mode === "register") setStep("name");
        else { toast.info("No account found for this number — please create an account."); onNewUser?.(); }
        setBusy(""); return;
      }
      await finish(data, mode === "register" ? `Account already exists — welcome back, ${data.user?.name || ""}!` : undefined);
    } catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    setBusy("");
  };

  const submitName = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    setBusy("name");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: `+91${phone.trim()}`, otp: otp.trim(), name: name.trim(), create_if_new: true, role }, { auth: false });
      await finish(data, `Welcome, ${data.user?.name || name}!`);
    } catch (e: any) { toast.error(e?.detail || "Could not complete registration"); }
    setBusy("");
  };

  const ac = accent;
  const inputStyle = { height: 56, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, backgroundColor: "#F8FAFC", fontSize: 16, color: AUTH.ink } as const;

  if (step === "phone") {
    return (
      <View testID="otp-step-phone" style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name="cellphone" size={22} color={AUTH.ink} />
            <Text style={{ color: AUTH.ink, fontSize: 17, fontWeight: "800" }}>Mobile Number</Text>
          </View>
          <View testID="country-code-pill" style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: AUTH.line, backgroundColor: "#fff" }}>
            <View style={{ width: 22, height: 15, borderRadius: 2, overflow: "hidden" }}><View style={{ flex: 1, backgroundColor: "#FF9933" }} /><View style={{ flex: 1, backgroundColor: "#fff" }} /><View style={{ flex: 1, backgroundColor: "#138808" }} /></View>
            <Text style={{ color: AUTH.ink, fontSize: 15, fontWeight: "700" }}>+91</Text>
            <Icon name="chevron-down" size={18} color={AUTH.muted} />
          </View>
        </View>
        <TextInput testID="login-phone-input" value={phone} onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="Enter your mobile number" placeholderTextColor="#94A3B8" keyboardType="number-pad" onSubmitEditing={sendOtp}
          style={[inputStyle, { borderColor: phone.length === 10 ? ac.main : AUTH.line, letterSpacing: 0.5, fontWeight: "600" }]} />
        <GradButton testID="send-otp-btn" title="Send OTP" icon="arrow-right" busy={busy === "send"} onPress={sendOtp} grad={ac.grad} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <Icon name="lock-outline" size={14} color="#94A3B8" /><Text style={{ color: "#94A3B8", fontSize: 12 }}>Only Partner & Merchant numbers can sign in here</Text>
        </View>
      </View>
    );
  }

  if (step === "otp") {
    return (
      <View testID="otp-step-otp" style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name="message-text-lock-outline" size={22} color={AUTH.ink} />
          <Text style={{ color: AUTH.ink, fontSize: 17, fontWeight: "800" }}>Verify OTP</Text>
        </View>
        <Text style={{ color: AUTH.muted, fontSize: 14 }}>Enter the 6-digit code sent to <Text style={{ fontWeight: "800", color: AUTH.ink }}>+91 {phone}</Text></Text>
        <Pressable onPress={() => otpRef.current?.focus()}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => {
              const active = i === Math.min(otp.length, 5); const filled = i < otp.length;
              return (
                <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: active ? ac.main : filled ? "#CBD5E1" : AUTH.line, backgroundColor: active ? ac.soft : "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: AUTH.ink }}>{otp[i] || ""}</Text>
                </View>
              );
            })}
          </View>
          <TextInput ref={otpRef} testID="login-otp-input" value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} autoFocus caretHidden autoComplete="sms-otp" importantForAutofill="yes" textContentType="oneTimeCode" onSubmitEditing={verifyOtp} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
        </Pressable>
        <GradButton testID="verify-otp-btn" title={mode === "login" ? "Verify & Log In" : "Verify & Continue"} icon="check" busy={busy === "verify"} onPress={verifyOtp} grad={ac.grad} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }}>
          {resendIn > 0 ? <Text testID="resend-timer" style={{ color: "#94A3B8", fontSize: 13, fontWeight: "600" }}>Resend OTP in 0:{String(resendIn).padStart(2, "0")}</Text>
            : <Pressable testID="resend-otp" onPress={() => { if (!busy) sendOtp(); }} hitSlop={8}><Text style={{ color: ac.dark, fontSize: 13, fontWeight: "800" }}>{busy === "send" ? "Resending…" : "Resend OTP"}</Text></Pressable>}
          <Text style={{ color: "#CBD5E1" }}>•</Text>
          <Pressable testID="otp-change-number" onPress={() => { setStep("phone"); setOtp(""); }} hitSlop={8}><Text style={{ color: ac.dark, fontSize: 13, fontWeight: "700" }}>Change number</Text></Pressable>
        </View>
      </View>
    );
  }

  return (
    <View testID="otp-step-name" style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: ac.soft, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: ac.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: ac.main, alignItems: "center", justifyContent: "center" }}><Icon name={ac.icon} size={20} color="#fff" /></View>
        <Text style={{ color: ac.dark, fontSize: 13.5, fontWeight: "700", flex: 1 }}>Mobile verified · creating your {cap(role || "")} account</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="account-outline" size={22} color={AUTH.ink} />
        <Text style={{ color: AUTH.ink, fontSize: 17, fontWeight: "800" }}>Your Name</Text>
      </View>
      <TextInput testID="login-name-input" value={name} onChangeText={setName} placeholder="Enter your full name" placeholderTextColor="#94A3B8" autoFocus onSubmitEditing={submitName} style={[inputStyle, { borderColor: name.trim() ? ac.main : AUTH.line, fontWeight: "600" }]} />
      <GradButton testID="continue-signup-btn" title={`Create ${cap(role || "")} Account`} icon="arrow-right" busy={busy === "name"} onPress={submitName} grad={ac.grad} />
    </View>
  );
}
