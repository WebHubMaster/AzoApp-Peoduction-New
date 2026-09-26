/** Inline OTP login (port of web OtpLogin used inside Checkout "Your Info" step) — customer-only guard. */
import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { api } from "../../api/client";
import { useAuth, isCustomer } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { PRIMARY, SLATE } from "../../theme";

const input = { height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", fontSize: 15, color: SLATE[900], outlineStyle: "none" } as any;
const Btn = ({ label, onPress, busy, testID }: { label: string; onPress: () => void; busy?: boolean; testID: string }) => (
  <Pressable testID={testID} onPress={onPress} disabled={busy} style={({ pressed }) => ({ height: 44, borderRadius: 10, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 })}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>{busy ? "Please wait…" : label}</Text></Pressable>
);

export function OtpInline({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState(""); const [otp, setOtp] = useState(""); const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  const normalized = () => { let p = phone.trim().replace(/\s/g, ""); if (!p.startsWith("+")) p = "+91" + p.replace(/^0+/, ""); return p; };
  const finish = async (data: any) => {
    if (!isCustomer(data?.user)) { toast.error("This account is not a customer account. Please use a customer mobile number."); setOtp(""); setStep(1); return; }
    await login(data.token, data.user); toast.success(`Welcome, ${data.user.name}!`); onSuccess?.();
  };
  const send = async () => {
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, "").slice(-10))) return toast.error("Enter a valid 10-digit mobile number");
    setBusy(true);
    try { const d: any = await api.post("/auth/send-otp", { phone: normalized() }, { auth: false }); if (d.sent === false) { toast.error(d.message || "Could not send OTP"); } else { if (d.dev_otp) { toast.success(`OTP sent · Dev OTP: ${d.dev_otp}`); setOtp(String(d.dev_otp)); } else toast.success(d.message || "OTP sent to your mobile"); setStep(2); } }
    catch (e: any) { toast.error(e?.message || "Failed to send OTP"); }
    setBusy(false);
  };
  const verify = async () => {
    if (otp.length < 4) return toast.error("Enter the OTP");
    setBusy(true);
    try { const d: any = await api.post("/auth/verify-otp", { phone: normalized(), otp, create_if_new: false }, { auth: false }); if (d.new_user) setStep(3); else await finish(d); }
    catch (e: any) { toast.error(e?.message || "Invalid OTP"); }
    setBusy(false);
  };
  const signup = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    setBusy(true);
    try { const d: any = await api.post("/auth/verify-otp", { phone: normalized(), otp, name, create_if_new: true }, { auth: false }); await finish(d); }
    catch (e: any) { toast.error(e?.message || "Could not complete signup"); }
    setBusy(false);
  };
  return (
    <View testID="otp-inline" style={{ gap: 12 }}>
      {step === 1 ? <>
        <Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[500], textTransform: "uppercase", letterSpacing: 0.6 }}>Mobile number</Text>
        <TextInput testID="otp-phone" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))} keyboardType="phone-pad" placeholder="10-digit mobile number" placeholderTextColor={SLATE[400]} style={input} />
        <Btn testID="otp-send" label="Send OTP" onPress={send} busy={busy} />
      </> : null}
      {step === 2 ? <>
        <Text style={{ fontSize: 13, color: SLATE[500] }}>OTP sent to <Text style={{ fontWeight: "700", color: SLATE[800] }}>{normalized()}</Text> · <Text onPress={() => setStep(1)} style={{ color: PRIMARY[700], fontWeight: "600" }}>Change</Text></Text>
        <TextInput testID="otp-code" value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="Enter OTP" placeholderTextColor={SLATE[400]} style={{ ...input, letterSpacing: 6, fontWeight: "700", textAlign: "center" }} />
        <Btn testID="otp-verify" label="Verify & continue" onPress={verify} busy={busy} />
      </> : null}
      {step === 3 ? <>
        <Text style={{ fontSize: 13, color: SLATE[500] }}>New here? Tell us your name to create your account.</Text>
        <TextInput testID="otp-name" value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={SLATE[400]} style={input} />
        <Btn testID="otp-signup" label="Create account & continue" onPress={signup} busy={busy} />
      </> : null}
    </View>
  );
}
