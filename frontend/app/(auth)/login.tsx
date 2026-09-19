import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { useAuth, AppUser } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";

type Role = "partner" | "merchant";
const OTP_LEN = 6;

function normalizePhone(p: string) {
  let x = p.trim().replace(/\s/g, "");
  if (!x.startsWith("+")) x = "+91" + x.replace(/^0+/, "");
  return x;
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const { login } = useAuth();
  const brand = useBrand();
  const toast = useToast();

  const [registerRole, setRegisterRole] = useState<Role | null>(null);
  const [mode, setMode] = useState<"otp" | "email">("otp");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const { data: cfg } = useQuery({
    queryKey: ["auth-config"],
    queryFn: () => api.get<any>("/auth/config", { auth: false }),
  });
  const { data: demo } = useQuery({
    queryKey: ["demo-status"],
    queryFn: () => api.get<any>("/auth/demo-status", { auth: false }),
  });

  const emailEnabled = cfg?.auth_config?.email_login;
  const otpEnabled = cfg?.auth_config?.mobile_otp !== false;

  useEffect(() => {
    if (step === 2) setTimeout(() => otpRefs.current[0]?.focus(), 120);
  }, [step]);

  const routeUser = (u: AppUser) => {
    if (u.role === "partner") router.replace("/(partner)");
    else if (u.role === "merchant") router.replace("/(merchant)");
    else {
      toast.error("This app is for Partners & Merchants only.");
    }
  };

  const onSuccess = async (token: string, u: AppUser) => {
    await login(token, u);
    toast.success(`Welcome, ${u.name || "back"}!`);
    routeUser(u);
  };

  const sendOtp = async () => {
    if (phone.replace(/\D/g, "").length < 10) return toast.error("Enter a valid 10-digit mobile number");
    setBusy(true);
    try {
      const data = await api.post<any>("/auth/send-otp", { phone: normalizePhone(phone) }, { auth: false });
      if (data.sent === false) {
        toast.error(data.message || "Could not send OTP. Try again.");
        setBusy(false);
        return;
      }
      if (data.dev_otp) {
        setDevOtp(String(data.dev_otp));
        setOtp(String(data.dev_otp));
      } else {
        setDevOtp(null);
        setOtp("");
      }
      setStep(2);
      toast.success(data.dev_otp ? `Dev OTP: ${data.dev_otp}` : "OTP sent to your mobile");
    } catch (e: any) {
      toast.error(e?.detail || "Failed to send OTP");
    }
    setBusy(false);
  };

  const verify = async () => {
    if (otp.length < 4) return toast.error("Enter the OTP");
    setBusy(true);
    try {
      const data = await api.post<any>(
        "/auth/verify-otp",
        { phone: normalizePhone(phone), otp, create_if_new: false, role: registerRole || undefined },
        { auth: false },
      );
      if (data.new_user) {
        setStep(3);
        setBusy(false);
        return;
      }
      await onSuccess(data.token, data.user);
    } catch (e: any) {
      toast.error(e?.detail || "Invalid OTP");
    }
    setBusy(false);
  };

  const completeSignup = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    setBusy(true);
    try {
      const data = await api.post<any>(
        "/auth/verify-otp",
        { phone: normalizePhone(phone), otp, name: name.trim(), create_if_new: true, role: registerRole || undefined },
        { auth: false },
      );
      if (registerRole === "partner") {
        await login(data.token, data.user);
        router.replace("/partner/register");
      } else if (registerRole === "merchant") {
        await login(data.token, data.user);
        router.replace("/merchant/register");
      } else {
        await onSuccess(data.token, data.user);
      }
    } catch (e: any) {
      toast.error(e?.detail || "Could not complete signup");
    }
    setBusy(false);
  };

  const emailLogin = async () => {
    if (!email.trim() || password.length < 4) return toast.error("Enter email and password (min 4 chars)");
    setBusy(true);
    try {
      const data = await api.post<any>("/auth/email", { email: email.trim(), password, name: name.trim() || undefined }, { auth: false });
      await onSuccess(data.token, data.user);
    } catch (e: any) {
      toast.error(e?.detail || "Login failed");
    }
    setBusy(false);
  };

  const demoLogin = async (dphone: string, dotp: string) => {
    setBusy(true);
    try {
      await api.post("/auth/send-otp", { phone: dphone }, { auth: false });
      const data = await api.post<any>("/auth/verify-otp", { phone: dphone, otp: dotp }, { auth: false });
      await onSuccess(data.token, data.user);
    } catch (e: any) {
      toast.error(e?.detail || "Demo login failed");
    }
    setBusy(false);
  };

  const setOtpDigit = (idx: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const arr = otp.padEnd(OTP_LEN, " ").split("");
    arr[idx] = d || " ";
    setOtp(arr.join("").replace(/\s/g, ""));
    if (d && idx < OTP_LEN - 1) otpRefs.current[idx + 1]?.focus();
  };

  const resetToPhone = () => {
    setStep(1);
    setOtp("");
    setDevOtp(null);
  };

  const demoPartner = demo?.accounts?.find((a: any) => a.role === "partner");
  const demoMerchant = demo?.accounts?.find((a: any) => a.role === "merchant");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <KeyboardAwareScrollView bottomOffset={24} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
          {/* Brand header */}
          <LinearGradient
            colors={[colors.primary, colors.primaryHover]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: insets.top + 36, paddingBottom: 44, paddingHorizontal: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
          >
            <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 32, fontWeight: "900" }}>{(brand.branding.site_name || "A")[0]}</Text>
            </View>
            <Text style={{ color: "#fff", fontSize: fontSize.xxl, fontWeight: "900", marginTop: spacing.lg }}>
              {registerRole ? `Register as ${registerRole === "partner" ? "Partner" : "Merchant"}` : `Welcome to ${brand.branding.site_name}`}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.sm, marginTop: 6 }}>
              {registerRole ? "Verify your mobile to create your account" : "One login — we open the right panel for you"}
            </Text>
          </LinearGradient>

          <View style={{ padding: spacing.lg, gap: spacing.lg, marginTop: -12 }}>
            {/* OTP / Email toggle */}
            {emailEnabled ? (
              <View style={{ flexDirection: "row", backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: 4 }}>
                {(["otp", "email"] as const).map((m) => (
                  <Pressable
                    key={m}
                    testID={`auth-mode-${m}`}
                    onPress={() => { setMode(m); resetToPhone(); }}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: mode === m ? colors.surface : "transparent", alignItems: "center" }}
                  >
                    <Text style={{ color: mode === m ? colors.primary : colors.textMuted, fontWeight: "800", fontSize: fontSize.sm }}>
                      {m === "otp" ? "Mobile OTP" : "Email"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* OTP FLOW */}
            {mode === "otp" && otpEnabled ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md }}>
                {step === 1 ? (
                  <>
                    <Label colors={colors} text="Mobile number" />
                    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 52 }}>
                      <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: fontSize.md }}>+91</Text>
                      <View style={{ width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 10 }} />
                      <TextInput
                        testID="login-phone-input"
                        value={phone}
                        onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                        placeholder="10-digit mobile number"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={10}
                        style={{ flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: "600" }}
                      />
                    </View>
                    <Button title="Send OTP" icon="arrow-right" onPress={sendOtp} loading={busy} testID="send-otp-button" />
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, textAlign: "center" }}>
                      We will take you to the right panel based on your number.
                    </Text>
                  </>
                ) : step === 2 ? (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Icon name="shield-check" size={16} color={colors.success} />
                      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                        Enter the 6-digit code sent to <Text style={{ fontWeight: "800", color: colors.text }}>{normalizePhone(phone)}</Text>
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                      {Array.from({ length: OTP_LEN }).map((_, i) => (
                        <TextInput
                          key={i}
                          testID={`otp-box-${i}`}
                          ref={(r) => { otpRefs.current[i] = r; }}
                          value={otp[i] || ""}
                          onChangeText={(v) => setOtpDigit(i, v)}
                          onKeyPress={({ nativeEvent }) => {
                            if (nativeEvent.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
                          }}
                          keyboardType="number-pad"
                          maxLength={1}
                          style={{
                            flex: 1,
                            height: 56,
                            borderWidth: 1.5,
                            borderColor: otp[i] ? colors.primary : colors.border,
                            borderRadius: radius.md,
                            textAlign: "center",
                            fontSize: fontSize.xl,
                            fontWeight: "800",
                            color: colors.text,
                            backgroundColor: colors.surfaceSubtle,
                          }}
                        />
                      ))}
                    </View>
                    {devOtp ? (
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, textAlign: "center" }}>Dev OTP auto-filled: {devOtp}</Text>
                    ) : null}
                    <Button title="Verify & Continue" onPress={verify} loading={busy} testID="verify-otp-button" />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Pressable onPress={resetToPhone} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "700" }}>← Change number</Text></Pressable>
                      <Pressable onPress={sendOtp} hitSlop={8}><Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" }}>Resend OTP</Text></Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Label colors={colors} text="Your full name" />
                    <TextInput
                      testID="signup-name-input"
                      value={name}
                      onChangeText={setName}
                      placeholder="Enter your name"
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      style={{ height: 52, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.text, fontSize: fontSize.md, fontWeight: "600" }}
                    />
                    <Button title="Create account" onPress={completeSignup} loading={busy} testID="complete-signup-button" />
                    <Pressable onPress={resetToPhone} hitSlop={8} style={{ alignItems: "center" }}><Text style={{ color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "700" }}>← Start over</Text></Pressable>
                  </>
                )}
              </View>
            ) : null}

            {mode === "otp" && !otpEnabled ? (
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" }}>Mobile OTP login is currently disabled.</Text>
            ) : null}

            {/* EMAIL FLOW */}
            {mode === "email" && emailEnabled ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md }}>
                <TextInput testID="email-input" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" style={inputStyle(colors)} />
                <TextInput testID="email-name-input" value={name} onChangeText={setName} placeholder="Name (new users)" placeholderTextColor={colors.textMuted} style={inputStyle(colors)} />
                <TextInput testID="email-password-input" value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry style={inputStyle(colors)} />
                <Button title="Continue with Email" onPress={emailLogin} loading={busy} testID="email-login-button" />
              </View>
            ) : null}

            {/* Register toggles */}
            {step === 1 && mode === "otp" ? (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {(["partner", "merchant"] as Role[]).map((r) => {
                  const active = registerRole === r;
                  return (
                    <Pressable
                      key={r}
                      testID={`register-${r}-toggle`}
                      onPress={() => setRegisterRole(active ? null : r)}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySubtle : colors.surface, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                    >
                      <Icon name={r === "partner" ? "tools" : "storefront"} size={16} color={active ? colors.primary : colors.textSecondary} />
                      <Text style={{ color: active ? colors.primary : colors.textSecondary, fontWeight: "800", fontSize: fontSize.sm }}>
                        {active ? "Cancel" : `Register as ${r === "partner" ? "Partner" : "Merchant"}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Demo quick login */}
            {demo?.demo_mode && (demoPartner || demoMerchant) ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>Demo login · OTP 123456</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {demoPartner ? (
                    <Pressable testID="demo-partner-login" disabled={busy} onPress={() => demoLogin(demoPartner.phone, demoPartner.otp)} style={demoBtn(colors)}>
                      <Icon name="tools" size={20} color={colors.primary} />
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>Partner Demo</Text>
                    </Pressable>
                  ) : null}
                  {demoMerchant ? (
                    <Pressable testID="demo-merchant-login" disabled={busy} onPress={() => demoLogin(demoMerchant.phone, demoMerchant.otp)} style={demoBtn(colors)}>
                      <Icon name="storefront" size={20} color={colors.primary} />
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>Merchant Demo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </KeyboardAwareScrollView>
    </View>
  );
}

function Label({ colors, text }: { colors: any; text: string }) {
  return <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>{text}</Text>;
}
function inputStyle(colors: any) {
  return { height: 52, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.text, fontSize: fontSize.md, fontWeight: "600" as const };
}
function demoBtn(colors: any) {
  return { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface };
}
