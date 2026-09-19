import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useTheme, palette } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Icon } from "@/src/components/Icon";
import { onlyDigits, onlyAlpha, isPhone10, normalizePhone } from "@/src/lib/validation";
import { AuthInput, AuthButton, TextLink } from "./AuthKit";
import { TW } from "@/src/components/partner/home/tw";

export type Role = "partner" | "merchant";
export type AuthResult = { token: string; user: any; created?: boolean };
const OTP_LEN = 6;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* 1:1 port of web components/OtpLogin.jsx.
   Mobile-only rule: an unknown number WITHOUT a register role is never created as a customer —
   the user must pick Partner / Merchant (step 4) before the account is created. */
export function OtpLogin({ registerRole, onPickRole, onSuccess }: { registerRole: Role | null; onPickRole: (r: Role) => void; onSuccess: (r: AuthResult) => Promise<void> | void }) {
  const { colors } = useTheme();
  const P = palette(colors.primary);
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [focused, setFocused] = useState(-1);
  const boxRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);
  useEffect(() => { if (step === 2) setTimeout(() => boxRefs.current[0]?.focus(), 80); }, [step]);

  const setOtpDigit = (idx: number, val: string) => {
    const digits = onlyDigits(val);
    if (digits.length > 1) { // paste / autofill of the full code
      const next = digits.slice(0, OTP_LEN); setOtp(next);
      setTimeout(() => boxRefs.current[Math.min(next.length, OTP_LEN - 1)]?.focus(), 20);
      return;
    }
    const d = digits.slice(-1);
    const arr = otp.padEnd(OTP_LEN, " ").split("");
    arr[idx] = d || " ";
    setOtp(arr.join("").replace(/\s/g, ""));
    if (d && idx < OTP_LEN - 1) boxRefs.current[idx + 1]?.focus();
  };
  const onKey = (idx: number, key: string) => { if (key === "Backspace" && !otp[idx] && idx > 0) boxRefs.current[idx - 1]?.focus(); };

  const send = async () => {
    if (!isPhone10(phone)) return toast.error("Enter a valid 10-digit mobile number");
    setBusy(true);
    try {
      const data = await api.post<any>("/auth/send-otp", { phone: normalizePhone(phone) }, { auth: false });
      if (data.sent === false) {
        toast.error(data.message || "Could not send the OTP right now. Please try again.");
        if (data.retry_after) setCooldown(Number(data.retry_after) || 30);
        setBusy(false); return;
      }
      if (data.dev_otp) { toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`); setOtp(String(data.dev_otp)); }
      else { toast.success(data.message || "OTP sent to your mobile"); setOtp(""); }
      setCooldown(30);
      setStep(2);
      setTimeout(() => boxRefs.current[0]?.focus(), 80);
    } catch (e: any) { toast.error(e?.detail || "Failed to send OTP"); }
    setBusy(false);
  };

  // Step 2 — verify server-side first, then decide existing vs new.
  const verify = async () => {
    if (otp.length < OTP_LEN) return toast.error("Enter the OTP");
    setBusy(true);
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: normalizePhone(phone), otp, create_if_new: false, role: registerRole || undefined }, { auth: false });
      if (data.new_user) { setStep(registerRole ? 3 : 4); setBusy(false); return; }
      await onSuccess(data);
    } catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    setBusy(false);
  };

  // Step 3 — new Partner/Merchant provides name, account is created (existing signup flow).
  const continueSignup = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    if (!registerRole) return setStep(4);
    setBusy(true);
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: normalizePhone(phone), otp, name: name.trim(), create_if_new: true, role: registerRole }, { auth: false });
      await onSuccess(data);
    } catch (e: any) { toast.error(e?.detail || "Could not complete signup"); }
    setBusy(false);
  };

  const back = () => { setOtp(""); setStep(1); };

  return (
    <View testID="otp-login" style={{ gap: 12 }}>
      {step === 1 ? (
        <>
          <AuthInput testID="login-phone-input" icon="phone-outline" placeholder="Enter 10-digit mobile number" keyboardType="number-pad" maxLength={10} value={phone} onChangeText={(t) => setPhone(onlyDigits(t, 10))} onSubmitEditing={send} returnKeyType="send" />
          <AuthButton testID="send-otp-button" title="Send OTP" icon="arrow-right" onPress={send} busy={busy} />
          <Text style={{ color: TW.slate400, fontSize: 12, textAlign: "center" }}>We&apos;ll take you to the right panel based on your number.</Text>
        </>
      ) : step === 2 ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="shield-check-outline" size={16} color={TW.emerald500} />
            <Text style={{ color: TW.slate500, fontSize: 12 }}>Enter the 6-digit code sent to <Text style={{ fontWeight: "700", color: colors.textSecondary }}>{normalizePhone(phone)}</Text></Text>
          </View>
          <View testID="otp-boxes" style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            {Array.from({ length: OTP_LEN }).map((_, i) => (
              <TextInput key={i} testID={`otp-box-${i}`} ref={(r) => { boxRefs.current[i] = r; }} value={otp[i] || ""}
                onChangeText={(v) => setOtpDigit(i, v)} onKeyPress={({ nativeEvent }) => onKey(i, nativeEvent.key)}
                onFocus={() => setFocused(i)} onBlur={() => setFocused(-1)} keyboardType="number-pad" maxLength={i === 0 ? OTP_LEN : 1} selectTextOnFocus
                style={{ flex: 1, minWidth: 0, height: 48, textAlign: "center", fontSize: 20, fontWeight: "700", borderRadius: 12, borderWidth: 2, borderColor: focused === i ? P[600] : colors.border, backgroundColor: colors.surface, color: colors.text, boxShadow: focused === i ? `0px 0px 0px 2px ${P[100]}` : undefined }} />
            ))}
          </View>
          <AuthButton testID="verify-otp-button" title="Verify OTP" onPress={verify} busy={busy} disabled={otp.length < OTP_LEN} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
            <TextLink testID="change-number" title="← Change number" onPress={back} />
            {cooldown > 0 ? (
              <View testID="resend-countdown" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="refresh" size={14} color={TW.slate300} />
                <Text style={{ color: TW.slate400, fontSize: 12 }}>You can resend in <Text style={{ color: TW.slate600, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{fmtTime(cooldown)}</Text></Text>
              </View>
            ) : (
              <Pressable testID="resend-otp-button" disabled={busy} onPress={send} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="refresh" size={14} color={busy ? TW.slate400 : P[700]} />
                <Text style={{ color: busy ? TW.slate400 : P[700], fontSize: 12, fontWeight: "600" }}>Resend OTP</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : step === 3 ? (
        <View testID="otp-name-step" style={{ gap: 12 }}>
          <Text style={{ color: TW.slate500, fontSize: 14 }}>Welcome! Please tell us your name to continue.</Text>
          <AuthInput testID="login-name-input" placeholder="Your full name" autoFocus value={name} onChangeText={(t) => setName(onlyAlpha(t))} onSubmitEditing={continueSignup} returnKeyType="done" />
          <AuthButton testID="continue-signup-button" title="Continue" icon="arrow-right" onPress={continueSignup} busy={busy} />
          <TextLink title="← Change number" onPress={() => setStep(1)} />
        </View>
      ) : (
        <View testID="otp-no-account-step" style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, backgroundColor: TW.amber50, borderWidth: 1, borderColor: TW.amber200, padding: 12 }}>
            <Icon name="account-alert-outline" size={18} color={TW.amber700} />
            <Text style={{ color: TW.amber800, fontSize: 13, flex: 1, lineHeight: 18 }}>No Partner or Merchant account found for <Text style={{ fontWeight: "700" }}>{normalizePhone(phone)}</Text>. Choose how you&apos;d like to register.</Text>
          </View>
          <AuthButton testID="no-account-register-partner" title="Register as Partner" icon="tools" onPress={() => { onPickRole("partner"); setStep(3); }} />
          <AuthButton testID="no-account-register-merchant" title="Register as Merchant" icon="storefront-outline" variant="outline" onPress={() => { onPickRole("merchant"); setStep(3); }} />
          <TextLink title="← Change number" onPress={() => setStep(1)} />
        </View>
      )}
    </View>
  );
}
