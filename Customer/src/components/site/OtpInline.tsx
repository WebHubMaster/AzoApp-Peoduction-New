/** Inline guest OTP verify inside Checkout "Your Info" — number (+ optional name) → OTP → auto-registered customer
 *  (same as the web guest flow: verified number = customer account, booking continues on the same screen). */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { api } from "../../api/client";
import { useAuth, isCustomer } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { PRIMARY, SLATE, ROSE } from "../../theme";

const input = { height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", fontSize: 15, color: SLATE[900], outlineStyle: "none" } as any;
const Btn = ({ label, onPress, busy, testID }: { label: string; onPress: () => void; busy?: boolean; testID: string }) => (
  <Pressable testID={testID} onPress={onPress} disabled={busy} style={({ pressed }) => ({ height: 48, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy ? 0.7 : 1 })}>
    {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{busy ? "Please wait…" : label}</Text>
  </Pressable>
);
const OTP_LEN = 6;
/** Keep the LAST 10 digits so pasted "+91 98765 43210" / "0987…" still resolves to the right number. */
const tenDigits = (v: string) => { const d = v.replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };

export function OtpInline({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const otpRef = useRef<TextInput>(null);
  const autoRef = useRef("");
  const normalized = () => `+91${tenDigits(phone)}`;
  const fail = (m: string) => { setErr(m); toast.error(m); };

  const send = async () => {
    setErr("");
    if (!/^[6-9]\d{9}$/.test(tenDigits(phone))) return fail("Enter a valid 10-digit mobile number");
    setBusy(true);
    try {
      const d: any = await api.post("/auth/send-otp", { phone: normalized() }, { auth: false });
      if (d?.sent === false) { fail(d.message || "Could not send OTP"); }
      else { setOtp(d?.dev_otp ? String(d.dev_otp) : ""); toast.success(d?.dev_otp ? `OTP sent · Dev OTP: ${d.dev_otp}` : (d?.message || "OTP sent to your mobile")); setStep(2); setTimeout(() => otpRef.current?.focus(), 150); }
    } catch (e: any) { fail(e?.message || "Failed to send OTP. Check your connection and try again."); }
    setBusy(false);
  };

  const verify = async (code?: string) => {
    const c = (code ?? otp).trim();
    setErr("");
    if (c.length < 4) return fail("Enter the OTP sent to your mobile");
    setBusy(true);
    try {
      // create_if_new → a verified new number becomes a customer account right away (guest booking flow).
      const d: any = await api.post("/auth/verify-otp", { phone: normalized(), otp: c, name: name.trim(), create_if_new: true }, { auth: false });
      if (!d?.token || !d?.user) throw new Error(d?.detail || "Verification failed. Please try again.");
      if (!isCustomer(d.user)) { setBusy(false); setOtp(""); setStep(1); return fail("This number belongs to a partner/merchant account. Please use a customer mobile number."); }
      await login(d.token, d.user);
      toast.success(`Welcome${d.user.name ? `, ${d.user.name}` : ""}! Number verified — continue with your booking.`);
      onSuccess?.();
    } catch (e: any) { fail(e?.message || "Invalid OTP. Please try again."); }
    setBusy(false);
  };
  // Auto-verify once all digits are typed (or auto-filled from SMS).
  useEffect(() => { if (step === 2 && otp.length === OTP_LEN && !busy && autoRef.current !== otp) { autoRef.current = otp; verify(otp); } }, [otp, step]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View testID="otp-inline" style={{ gap: 12 }}>
      {step === 1 ? <>
        <Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[500], textTransform: "uppercase", letterSpacing: 0.6 }}>Mobile number</Text>
        <View style={{ flexDirection: "row", alignItems: "center", ...input, paddingHorizontal: 0 }}>
          <Text style={{ paddingHorizontal: 14, fontSize: 15, fontWeight: "700", color: SLATE[600], borderRightWidth: 1, borderRightColor: SLATE[200], height: 46, lineHeight: 46 }}>+91</Text>
          <TextInput testID="otp-phone" value={phone} onChangeText={(v) => setPhone(tenDigits(v))} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={16} onSubmitEditing={send} placeholder="10-digit mobile number" placeholderTextColor={SLATE[400]} style={{ flex: 1, height: 46, paddingHorizontal: 12, fontSize: 15, color: SLATE[900], outlineStyle: "none" } as any} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[500], textTransform: "uppercase", letterSpacing: 0.6 }}>Your name <Text style={{ color: SLATE[400], fontWeight: "500", textTransform: "none" }}>(optional)</Text></Text>
        <TextInput testID="otp-name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Full name" placeholderTextColor={SLATE[400]} style={input} />
        <Btn testID="otp-send" label="Send OTP" onPress={send} busy={busy} />
      </> : null}
      {step === 2 ? <>
        <Text style={{ fontSize: 13, color: SLATE[500] }}>OTP sent to <Text style={{ fontWeight: "700", color: SLATE[800] }}>{normalized()}</Text> · <Text testID="otp-change" onPress={() => { setStep(1); setOtp(""); setErr(""); }} style={{ color: PRIMARY[700], fontWeight: "600" }}>Change</Text></Text>
        <TextInput ref={otpRef} testID="otp-code" value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, OTP_LEN))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={OTP_LEN} onSubmitEditing={() => verify()} placeholder="Enter OTP" placeholderTextColor={SLATE[400]} style={{ ...input, letterSpacing: 8, fontWeight: "800", textAlign: "center", fontSize: 18 }} />
        <Btn testID="otp-verify" label="Verify & continue" onPress={() => verify()} busy={busy} />
        <Pressable testID="otp-resend" onPress={send} disabled={busy} style={{ alignSelf: "center", paddingVertical: 4 }}><Text style={{ fontSize: 13, color: PRIMARY[700], fontWeight: "600" }}>Resend OTP</Text></Pressable>
      </> : null}
      {err ? <Text testID="otp-error" style={{ fontSize: 13, color: ROSE[600], fontWeight: "600" }}>{err}</Text> : null}
    </View>
  );
}
