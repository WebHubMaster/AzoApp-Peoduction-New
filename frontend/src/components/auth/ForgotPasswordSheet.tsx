import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Icon } from "@/src/components/Icon";
import { AuthInput, AuthButton, TextLink } from "./AuthKit";
import { TW } from "@/src/components/partner/home/tw";

/* 1:1 port of web Login.jsx ForgotPasswordDialog → bottom sheet.
   POST /auth/forgot-password {identifier} → POST /auth/reset-password {identifier, otp, new_password} */
export function ForgotPasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ identifier: "", otp: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const upd = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const sendOtp = async () => {
    if (!f.identifier.trim()) return toast.error("Enter your email or mobile");
    setBusy(true);
    try {
      const data = await api.post<any>("/auth/forgot-password", { identifier: f.identifier.trim() }, { auth: false });
      if (data.dev_otp) { toast.success(`OTP (dev): ${data.dev_otp}`); upd("otp", String(data.dev_otp)); }
      else toast.success(data.message || "OTP sent");
      setStep(2);
    } catch (e: any) { toast.error(e?.detail || "Failed to send OTP"); }
    setBusy(false);
  };
  const reset = async () => {
    if (f.otp.length < 4 || f.new_password.length < 4) return toast.error("Enter OTP and a new password (min 4 chars)");
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { identifier: f.identifier.trim(), otp: f.otp, new_password: f.new_password }, { auth: false });
      toast.success("Password reset! Please log in.");
      onClose(); setStep(1); setF({ identifier: "", otp: "", new_password: "" });
    } catch (e: any) { toast.error(e?.detail || "Reset failed"); }
    setBusy(false);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} testID="forgot-password-dialog" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, gap: 12 }}>
          <View style={{ alignSelf: "center", width: 48, height: 6, borderRadius: 3, backgroundColor: TW.slate200, marginBottom: 4 }} />
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Reset your password</Text>
              <Text style={{ color: TW.slate500, fontSize: 14, marginTop: 4 }}>Verify a one-time OTP sent to your registered mobile.</Text>
            </View>
            <Pressable testID="forgot-close" onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={18} color={TW.slate400} /></Pressable>
          </View>
          {step === 1 ? (
            <>
              <Text style={{ color: TW.slate500, fontSize: 14 }}>We&apos;ll send a one-time OTP to your registered mobile.</Text>
              <AuthInput testID="forgot-identifier" placeholder="Email or mobile number" autoCapitalize="none" value={f.identifier} onChangeText={(v) => upd("identifier", v)} />
              <AuthButton testID="forgot-send-otp" title={busy ? "Sending…" : "Send OTP"} onPress={sendOtp} busy={busy} />
            </>
          ) : (
            <>
              <AuthInput testID="forgot-otp" placeholder="Enter OTP" keyboardType="number-pad" value={f.otp} onChangeText={(v) => upd("otp", v.replace(/\D/g, "").slice(0, 6))} />
              <AuthInput testID="forgot-new-password" placeholder="New password" secureTextEntry value={f.new_password} onChangeText={(v) => upd("new_password", v)} />
              <AuthButton testID="forgot-reset" title={busy ? "Resetting…" : "Reset Password"} onPress={reset} busy={busy} />
              <TextLink title="← Change email/mobile" onPress={() => setStep(1)} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
