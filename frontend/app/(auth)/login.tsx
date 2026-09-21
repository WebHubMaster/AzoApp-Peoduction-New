import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useTheme, palette } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { api } from "@/src/api/client";
import { useAuth, AppUser } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { TW } from "@/src/components/partner/home/tw";

type Role = "partner" | "merchant";
type Step = "phone" | "otp" | "name" | "noaccount";
const APP_ROLES: Role[] = ["partner", "merchant"];
const HERO = "https://static.prod-images.emergentagent.com/jobs/5fb8b7a5-7d9a-445b-865b-3d89e51df3a4/images/1e76c44ecdf202c8b1cc65dc61b0b530af954c9b47e6e27b99a6f46c906cffca.jpeg";
const FALLBACK_LOGO = require("../../assets/brand-logo.png"); // eslint-disable-line @typescript-eslint/no-require-imports
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const FEATURES: { icon: MdiName; label: string; bg: string; fg: string }[] = [
  { icon: "shield-check", label: "Verified\nProfessionals", bg: "#DBEAFE", fg: "#2563EB" },
  { icon: "currency-inr", label: "Affordable\nPricing", bg: "#FEF3C7", fg: "#D97706" },
  { icon: "clock-outline", label: "On-Time\nService", bg: "#DCFCE7", fg: "#16A34A" },
  { icon: "heart", label: "100% Customer\nSatisfaction", bg: "#F3E8FF", fg: "#9333EA" },
];

export default function Login() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const P = palette(colors.primary);
  const router = useRouter();
  const brand = useBrand();
  const { user, login, loading, booting } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<Step>("phone");
  const [registerRole, setRegisterRole] = useState<Role | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [routing, setRouting] = useState(false);
  const otpRef = useRef<TextInput>(null);

  const { data: demo } = useQuery({ queryKey: ["demo-status"], queryFn: () => api.get<any>("/auth/demo-status", { auth: false }) });
  const logo = brand.branding.logo_light || brand.branding.logo_dark || brand.branding.logo;

  const home = (u: AppUser) => {
    if (u.role === "partner") return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_partner ? "/(partner)" : "/partner/register";
    return u.onboarding_submitted || u.kyc_status === "approved" || u.verified_merchant ? "/(merchant)" : "/merchant/register";
  };
  useEffect(() => { if (user && APP_ROLES.includes(user.role as Role)) { setRouting(true); router.replace(home(user) as any); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async ({ token, user: u }: any, greeting?: string) => {
    if (!APP_ROLES.includes(u?.role)) {
      toast.error(`This app is for Partners & Merchants only. Your ${u?.role || ""} account can sign in on the web panel.`);
      return;
    }
    setRouting(true);
    await login(token, u);
    toast.success(greeting || `Welcome, ${u.name || "back"}!`);
    router.replace(home(u) as any);
  };

  const sendOtp = async () => {
    if (phone.trim().length < 10) return toast.error("Enter a valid 10-digit mobile number");
    setBusy("send");
    try {
      const data = await api.post<any>("/auth/send-otp", { phone: `+91${phone.trim()}` }, { auth: false });
      if (data?.sent === false) { toast.error(data.message || "Could not send the OTP right now"); setBusy(""); return; }
      if (data?.dev_otp) { toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`); setOtp(String(data.dev_otp)); }
      else toast.success("OTP sent to your mobile");
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 250);
    } catch (e: any) { toast.error(e?.detail || "Could not send OTP"); }
    setBusy("");
  };

  // Verify OTP but NEVER auto-create a customer. Unknown numbers must pick Partner/Merchant.
  const verifyOtp = async () => {
    if (otp.trim().length < 4) return toast.error("Enter the OTP");
    setBusy("verify");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: `+91${phone.trim()}`, otp: otp.trim(), create_if_new: false, role: registerRole || undefined }, { auth: false });
      if (data?.new_user) { setStep(registerRole ? "name" : "noaccount"); setBusy(""); return; }
      await finish(data);
    } catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    setBusy("");
  };

  const submitName = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    if (!registerRole) { setStep("noaccount"); return; }
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

  const startRegister = (role: Role) => {
    setRegisterRole(role);
    if (step === "noaccount") { setStep("name"); return; }
    setStep("phone");
    toast.info(`Registering as ${cap(role)} — verify your mobile`);
  };
  const backToLogin = () => { setRegisterRole(null); setStep("phone"); setOtp(""); setName(""); };

  const demoAccounts: any[] = APP_ROLES.map((r) => (demo?.accounts || []).find((a: any) => a.role === r)).filter(Boolean);
  const showLoader = booting || loading || routing || (user && APP_ROLES.includes(user.role as Role));

  const headMain = registerRole ? "Create your" : "Login to";
  const headAccent = registerRole ? `${cap(registerRole)} account` : "Get Started";
  const subtitle =
    step === "otp" ? "Enter the 6-digit code we texted you"
    : step === "name" ? "Almost there — tell us your name"
    : step === "noaccount" ? "This number isn't registered yet"
    : registerRole ? `Register as a ${cap(registerRole)} — verify your mobile to continue`
    : "Enter your mobile number to continue and access your account";

  /* full-width action row (register / demo) */
  const ActionRow = ({ testID, icon, iconBg, iconFg, title, sub, onPress, loading: ld, variant = "solid" }: {
    testID: string; icon: MdiName; iconBg: string; iconFg: string; title: string; sub?: string; onPress: () => void; loading?: boolean; variant?: "solid" | "tint";
  }) => (
    <Pressable testID={testID} onPress={onPress} disabled={!!busy}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: variant === "tint" ? iconBg : "#E7EEFB", backgroundColor: variant === "tint" ? iconBg + "22" : "#fff", opacity: busy && !ld ? 0.55 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
        {ld ? <ActivityIndicator size="small" color={iconFg} /> : <Icon name={icon} size={22} color={iconFg} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: "#0F172A", fontSize: 15, fontWeight: "800" }}>{title}</Text>
        {sub ? <Text style={{ color: TW.slate400, fontSize: 11.5, marginTop: 1 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Icon name="chevron-right" size={20} color={TW.slate400} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#F5F8FF" }}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView bottomOffset={24} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* ---------------- Hero card (big image fixed at bottom) ---------------- */}
        <LinearGradient colors={["#EAF2FF", "#D7E7FF"]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, minHeight: 320, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: "hidden" }}>
          {/* logo + tagline */}
          {logo ? (
            <Image testID="app-brand-logo" source={{ uri: logo }} style={{ height: 40, width: 160 }} contentFit="contain" contentPosition="left" />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Image source={FALLBACK_LOGO} style={{ width: 38, height: 38, borderRadius: 10 }} contentFit="contain" />
              <Text style={{ color: "#0D2E63", fontSize: 23, fontWeight: "900" }}>Azo<Text style={{ color: P[600] }}>App</Text></Text>
            </View>
          )}
          <Text style={{ color: "#334155", fontSize: 12, fontWeight: "600", marginTop: 6 }}>{brand.branding.tagline || "Service at Your Door Steps"}</Text>
          <View style={{ alignSelf: "flex-start", marginTop: 10, backgroundColor: "rgba(37,99,235,0.10)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Text style={{ color: P[700], fontSize: 11, fontWeight: "800" }}>Trusted · Verified · Professional</Text>
          </View>

          {/* dynamic heading (kept clear of the image) */}
          <View style={{ maxWidth: "62%", marginTop: 18 }}>
            <Text testID="login-title" style={{ color: "#0F172A", fontSize: 32, lineHeight: 37, fontWeight: "900" }}>{headMain}{"\n"}<Text style={{ color: P[600] }}>{headAccent}</Text></Text>
            <Text style={{ color: "#475569", fontSize: 13, marginTop: 8, lineHeight: 19 }}>{subtitle}</Text>
          </View>

          {/* big hero image anchored to the bottom of the card */}
          <Image testID="login-hero" source={{ uri: HERO }} style={{ position: "absolute", right: -6, bottom: 0, width: 210, height: 262 }} contentFit="contain" contentPosition="bottom" />
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, marginTop: 22, gap: 16 }}>
          {/* ---------------- Phone step (open, no card) ---------------- */}
          {step === "phone" ? (
            <>
              <View testID="mobile-section" style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name="cellphone" size={18} color={P[600]} />
                  <Text style={{ color: "#0F172A", fontSize: 15, fontWeight: "800" }}>Mobile Number</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 58, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderColor: "#DCE6F7", backgroundColor: "#fff" }}>
                    <View style={{ width: 22, height: 15, borderRadius: 2, overflow: "hidden" }}>
                      <View style={{ flex: 1, backgroundColor: "#FF9933" }} /><View style={{ flex: 1, backgroundColor: "#fff" }} /><View style={{ flex: 1, backgroundColor: "#138808" }} />
                    </View>
                    <Text style={{ color: "#0F172A", fontSize: 16, fontWeight: "800" }}>+91</Text>
                  </View>
                  <TextInput
                    testID="login-phone-input"
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, "").slice(0, 10))}
                    placeholder="98765 43210"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    style={{ flex: 1, minWidth: 0, height: 58, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: "#DCE6F7", backgroundColor: "#fff", fontSize: 18, letterSpacing: 1.5, color: "#0F172A", fontWeight: "800" }}
                    onSubmitEditing={sendOtp}
                  />
                </View>
                <Pressable testID="send-otp-btn" onPress={sendOtp} disabled={busy === "send"} style={({ pressed }) => ({ height: 58, borderRadius: 18, backgroundColor: P[600], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "send" ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], boxShadow: `0px 12px 24px ${P[600]}44` })}>
                  {busy === "send" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>Send OTP</Text><Icon name="arrow-right" size={20} color="#fff" /></>}
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <Icon name="lock-outline" size={13} color={TW.slate400} />
                  <Text style={{ color: TW.slate400, fontSize: 12 }}>Only Partner & Merchant numbers can sign in here.</Text>
                </View>
                {registerRole ? (
                  <Pressable testID="back-to-login" onPress={backToLogin} style={{ alignSelf: "center" }}>
                    <Text style={{ color: P[700], fontSize: 13, fontWeight: "700" }}>← Back to login</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Register — full width, one per line */}
              {!registerRole ? (
                <View testID="register-toggles" style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
                    <Text style={{ color: "#64748B", fontSize: 11.5, fontWeight: "900", letterSpacing: 1 }}>NEW HERE? REGISTER</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
                  </View>
                  <ActionRow testID="reg-partner" icon="wrench" iconBg="#DCFCE7" iconFg="#16A34A" title="Register as Partner" sub="Offer services & receive jobs" onPress={() => startRegister("partner")} />
                  <ActionRow testID="reg-merchant" icon="storefront-outline" iconBg="#FAE8FF" iconFg="#C026D3" title="Register as Merchant" sub="List your shop & manage orders" onPress={() => startRegister("merchant")} />
                </View>
              ) : null}

              {/* Demo — full width, one per line */}
              {demo?.demo_mode && demoAccounts.length > 0 ? (
                <View testID="demo-accounts" style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
                    <Text style={{ color: "#64748B", fontSize: 11.5, fontWeight: "900", letterSpacing: 1 }}>★ ONE-CLICK DEMO LOGIN ★</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
                  </View>
                  {demoAccounts.map((a) => (
                    <ActionRow key={a.role} testID={`demo-${a.role}`} icon={a.role === "partner" ? "wrench" : "storefront-outline"}
                      iconBg={a.role === "partner" ? "#ECFDF5" : "#FDF4FF"} iconFg={a.role === "partner" ? "#16A34A" : "#C026D3"}
                      title={`Login as ${cap(a.role)}`} sub={`Opens the ${cap(a.role)} app with demo data`} onPress={() => quickLogin(a)} loading={busy === a.phone} variant="tint" />
                  ))}
                  <View style={{ backgroundColor: "#EEF4FF", borderRadius: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Icon name="key-outline" size={16} color={P[600]} />
                    <Text style={{ color: "#334155", fontSize: 14, fontWeight: "700" }}>Demo OTP: <Text style={{ color: P[700], fontWeight: "900" }}>123456</Text></Text>
                  </View>
                </View>
              ) : null}

              {/* feature icons */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                {FEATURES.map((f, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: f.bg, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={f.icon} size={22} color={f.fg} />
                    </View>
                    <Text style={{ color: "#475569", fontSize: 10.5, fontWeight: "700", textAlign: "center", lineHeight: 13 }}>{f.label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* ---------------- OTP step ---------------- */}
          {step === "otp" ? (
            <View style={{ gap: 14 }}>
              <Text style={{ color: "#475569", fontSize: 14 }}>Enter the OTP sent to <Text style={{ fontWeight: "800", color: "#0F172A" }}>+91 {phone}</Text></Text>
              <Pressable onPress={() => otpRef.current?.focus()}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  {Array.from({ length: 6 }).map((_, i) => {
                    const active = i === Math.min(otp.length, 5);
                    const filled = i < otp.length;
                    return (
                      <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, height: 58, borderRadius: 15, borderWidth: 1.5, borderColor: active ? P[600] : filled ? "#CBD5E1" : "#DCE6F7", backgroundColor: active ? "#EEF4FF" : "#fff", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 23, fontWeight: "900", color: "#0F172A" }}>{otp[i] || ""}</Text>
                      </View>
                    );
                  })}
                </View>
                <TextInput ref={otpRef} testID="login-otp-input" value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} autoFocus caretHidden onSubmitEditing={verifyOtp} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }} />
              </Pressable>
              <Pressable testID="verify-otp-btn" onPress={verifyOtp} disabled={busy === "verify"} style={({ pressed }) => ({ height: 58, borderRadius: 18, backgroundColor: P[600], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "verify" ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                {busy === "verify" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>Verify & Continue</Text><Icon name="check" size={20} color="#fff" /></>}
              </Pressable>
              <Pressable testID="otp-change-number" onPress={() => { setStep("phone"); setOtp(""); }} style={{ alignItems: "center" }}>
                <Text style={{ color: P[700], fontSize: 13, fontWeight: "700" }}>← Change number</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ---------------- Name step (new registration) ---------------- */}
          {step === "name" ? (
            <View style={{ gap: 14 }}>
              <Text style={{ color: "#475569", fontSize: 14 }}>You&apos;re registering as <Text style={{ fontWeight: "800", color: "#0F172A" }}>{cap(registerRole || "")}</Text>. What should we call you?</Text>
              <TextInput testID="login-name-input" value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor="#94A3B8" autoFocus onSubmitEditing={submitName} style={{ height: 58, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: "#DCE6F7", backgroundColor: "#fff", fontSize: 16, color: "#0F172A", fontWeight: "600" }} />
              <Pressable testID="continue-signup-btn" onPress={submitName} disabled={busy === "name"} style={({ pressed }) => ({ height: 58, borderRadius: 18, backgroundColor: P[600], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "name" ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                {busy === "name" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>Create account</Text><Icon name="arrow-right" size={20} color="#fff" /></>}
              </Pressable>
              <Pressable testID="name-change-number" onPress={backToLogin} style={{ alignItems: "center" }}>
                <Text style={{ color: P[700], fontSize: 13, fontWeight: "700" }}>← Start over</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ---------------- No account found ---------------- */}
          {step === "noaccount" ? (
            <View testID="no-account-step" style={{ gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 16, backgroundColor: "#FFFBEB", borderWidth: 1.5, borderColor: "#FDE68A", padding: 14 }}>
                <Icon name="account-alert-outline" size={22} color="#D97706" />
                <Text style={{ color: "#92400E", fontSize: 13.5, flex: 1, lineHeight: 19 }}>No Partner or Merchant account found for <Text style={{ fontWeight: "800" }}>+91 {phone}</Text>. Please register below to get started.</Text>
              </View>
              <ActionRow testID="no-account-register-partner" icon="wrench" iconBg="#DCFCE7" iconFg="#16A34A" title="Register as Partner" sub="Offer services & receive jobs" onPress={() => startRegister("partner")} />
              <ActionRow testID="no-account-register-merchant" icon="storefront-outline" iconBg="#FAE8FF" iconFg="#C026D3" title="Register as Merchant" sub="List your shop & manage orders" onPress={() => startRegister("merchant")} />
              <Pressable testID="noaccount-change-number" onPress={() => { setStep("phone"); setOtp(""); }} style={{ alignItems: "center" }}>
                <Text style={{ color: P[700], fontSize: 13, fontWeight: "700" }}>← Try a different number</Text>
              </Pressable>
            </View>
          ) : null}

          {/* footer */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
            <Text style={{ color: P[700], fontSize: 12, fontWeight: "800" }}>Your Home Services Partner</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
          </View>
        </View>
      </KeyboardAwareScrollView>

      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#F5F8FF", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={P[700]} />
        </View>
      ) : null}
    </View>
  );
}
