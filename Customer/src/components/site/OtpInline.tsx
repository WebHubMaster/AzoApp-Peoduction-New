import { TC } from "@/src/theme";
/** Inline guest OTP verify inside Checkout "Your Info" — mobile → OTP → (name only if NEW user) → auto-registered customer.
 *  Existing numbers log straight in; brand-new numbers are asked for a name before the account is created. */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { useAuth, isCustomer } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { PRIMARY, SLATE, ROSE } from "../../theme";
import { onlyDigits, onlyAlpha } from "../../lib/format";
import { LegalConsent } from "./LegalConsent";

const input = { height: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, get borderColor() { return TC.border; }, get backgroundColor() { return TC.input; }, fontSize: 16, get color() { return TC.text; }, outlineStyle: "none" } as any;
const Btn = ({ label, onPress, busy, disabled, testID }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; testID: string }) => (
  <Pressable testID={testID} onPress={onPress} disabled={busy || disabled} style={({ pressed }) => ({ height: 50, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy ? 0.7 : disabled ? 0.5 : 1 })}>
    {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{busy ? "Please wait…" : label}</Text>
  </Pressable>
);
const OTP_LEN = 6;
/** Keep only the first 10 typed digits (strip a pasted 91 country code / leading zeros) — typing past 10 is ignored,
 *  the starting digit is never dropped (bug fix). */
const tenDigits = (v: string) => {
  let d = (v || "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d.slice(0, 10);
};

export function OtpInline({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [cooldown, setCooldown] = useState(0); const [accepted, setAccepted] = useState(false);
  const otpRef = useRef<TextInput>(null);
  const normalized = () => `+91${tenDigits(phone)}`;
  const fail = (m: string) => { setErr(m); toast.error(m); };
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const send = async () => {
    setErr("");
    if (!/^[6-9]\d{9}$/.test(tenDigits(phone))) return fail("Enter a valid 10-digit mobile number");
    setBusy(true);
    try {
      const d: any = await api.post("/auth/send-otp", { phone: normalized() }, { auth: false });
      if (d?.sent === false) { if (d.retry_after) setCooldown(Number(d.retry_after) || 60); fail(d.message || "Could not send OTP"); }
      else { setOtp(d?.dev_otp ? String(d.dev_otp) : ""); toast.success(d?.dev_otp ? `OTP sent · Dev OTP: ${d.dev_otp}` : (d?.message || "OTP sent to your mobile")); setCooldown(60); setStep(2); setTimeout(() => otpRef.current?.focus(), 150); }
    } catch (e: any) { fail(e?.message || "Failed to send OTP. Check your connection and try again."); }
    setBusy(false);
  };

  const finishLogin = async (d: any) => {
    if (!d?.token || !d?.user) throw new Error(d?.detail || "Verification failed. Please try again.");
    if (!isCustomer(d.user)) { setOtp(""); setStep(1); fail("This number belongs to a partner/merchant account. Please use a customer mobile number."); return false; }
    await login(d.token, d.user);
    toast.success(`Welcome${d.user.name ? `, ${d.user.name}` : ""}! Number verified — continue with your booking.`);
    onSuccess?.();
    return true;
  };

  // Step 2: verify OTP. Existing customer → logs in. Brand-new number → ask for a name (step 3).
  const verify = async (code?: string) => {
    const c = (code ?? otp).trim();
    setErr("");
    if (c.length < OTP_LEN) return fail("Enter the OTP sent to your mobile");
    setBusy(true);
    try {
      const d: any = await api.post("/auth/verify-otp", { phone: normalized(), otp: c, create_if_new: false }, { auth: false });
      if (d?.new_user) { setStep(3); setBusy(false); return; }
      await finishLogin(d);
    } catch (e: any) { fail(e?.message || "Invalid OTP. Please try again."); }
    setBusy(false);
  };

  // Step 3: new user provides a name → create the account and continue.
  const continueSignup = async () => {
    setErr("");
    if (!name.trim()) return fail("Please enter your name");
    if (!accepted) return fail("Please accept the Terms & Conditions and Privacy Policy to continue");
    setBusy(true);
    try {
      const d: any = await api.post("/auth/verify-otp", { phone: normalized(), otp: otp.trim(), name: name.trim(), create_if_new: true }, { auth: false });
      await finishLogin(d);
    } catch (e: any) { fail(e?.message || "Could not complete signup. Please try again."); }
    setBusy(false);
  };

  return (
    <View testID="otp-inline" style={{ gap: 12 }}>
      {step === 1 ? <>
        <Text style={{ fontSize: 13, fontWeight: "700", color: TC.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>Mobile number</Text>
        <View style={{ flexDirection: "row", alignItems: "center", ...input, paddingHorizontal: 0 }}>
          <Text style={{ paddingHorizontal: 14, fontSize: 16, fontWeight: "700", color: TC.textMuted, borderRightWidth: 1, borderRightColor: TC.border, height: 48, lineHeight: 48 }}>+91</Text>
          <TextInput testID="otp-phone" value={phone} onChangeText={(v) => setPhone(tenDigits(v))} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={10} numberOfLines={1} onSubmitEditing={send} placeholder="10-digit mobile number" placeholderTextColor={TC.textFaint} style={{ flex: 1, height: 48, paddingHorizontal: 12, fontSize: 16, color: TC.text, outlineStyle: "none" } as any} />
        </View>
        <Btn testID="otp-send" label="Send OTP" onPress={send} busy={busy} />
      </> : null}
      {step === 2 ? <>
        <Text style={{ fontSize: 14, color: TC.textMuted }}>OTP sent to <Text style={{ fontWeight: "700", color: TC.text }}>{normalized()}</Text> · <Text testID="otp-change" onPress={() => { setStep(1); setOtp(""); setErr(""); }} style={{ color: TC.primaryText, fontWeight: "600" }}>Change</Text></Text>
        <Pressable testID="otp-boxes" onPress={() => otpRef.current?.focus()}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            {Array.from({ length: OTP_LEN }).map((_, i) => {
              const focused = i === Math.min(otp.length, OTP_LEN - 1);
              return (
                <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, minWidth: 0, height: 52, borderRadius: 12, borderWidth: 2, borderColor: focused ? PRIMARY[600] : TC.border, backgroundColor: TC.surface, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: TC.text }}>{otp[i] || ""}</Text>
                </View>
              );
            })}
          </View>
          <TextInput ref={otpRef} testID="otp-code" value={otp} onChangeText={(v) => setOtp(onlyDigits(v, OTP_LEN))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={OTP_LEN} caretHidden onSubmitEditing={() => verify()}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
        </Pressable>
        <Btn testID="otp-verify" label="Verify OTP & continue" onPress={() => verify()} busy={busy} disabled={otp.length < OTP_LEN} />
        {cooldown > 0 ? (
          <View testID="otp-resend-countdown" style={{ alignSelf: "center", paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 14, color: TC.textFaint }}>Resend OTP in <Text style={{ fontWeight: "700", color: TC.textMuted }}>{fmtTime(cooldown)}</Text></Text>
          </View>
        ) : (
          <Pressable testID="otp-resend" onPress={send} disabled={busy} style={{ alignSelf: "center", paddingVertical: 4 }}><Text style={{ fontSize: 14, color: TC.primaryText, fontWeight: "600" }}>Resend OTP</Text></Pressable>
        )}
      </> : null}
      {step === 3 ? <>
        <Text style={{ fontSize: 14, fontWeight: "700", color: TC.text }}>Welcome! What&apos;s your name?</Text>
        <Text style={{ fontSize: 13, color: TC.textMuted }}>We&apos;ll create your account so you can track this and future bookings.</Text>
        <TextInput testID="otp-name" value={name} onChangeText={(v) => setName(onlyAlpha(v))} autoFocus autoComplete="name" textContentType="name" placeholder="Your full name" placeholderTextColor={TC.textFaint} onSubmitEditing={continueSignup} style={input} />
        <LegalConsent checked={accepted} onChange={setAccepted} testID="otp-legal" />
        <Btn testID="otp-continue-signup" label="Continue" onPress={continueSignup} busy={busy} disabled={!accepted} />
        <Pressable testID="otp-change-2" onPress={() => { setStep(1); setOtp(""); setName(""); setErr(""); }} style={{ alignSelf: "center", paddingVertical: 4 }}><Text style={{ fontSize: 13, color: TC.primaryText, fontWeight: "600" }}>← Change number</Text></Pressable>
      </> : null}
      {err ? <Text testID="otp-error" style={{ fontSize: 13, color: ROSE[600], fontWeight: "600" }}>{err}</Text> : null}
    </View>
  );
}
