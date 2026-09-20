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
import { ForgotPasswordSheet } from "@/src/components/auth/ForgotPasswordSheet";
import { TW } from "@/src/components/partner/home/tw";

type Role = "partner" | "merchant";
const APP_ROLES: Role[] = ["partner", "merchant"];
const HERO = "https://static.prod-images.emergentagent.com/jobs/5fb8b7a5-7d9a-445b-865b-3d89e51df3a4/images/1e76c44ecdf202c8b1cc65dc61b0b530af954c9b47e6e27b99a6f46c906cffca.jpeg";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FALLBACK_LOGO = require("../../assets/brand-logo.png");

const FEATURES: { icon: MdiName; label: string; bg: string; fg: string }[] = [
  { icon: "shield-check", label: "Verified\nProfessionals", bg: "#DBEAFE", fg: "#2563EB" },
  { icon: "currency-inr", label: "Affordable\nPricing", bg: "#FEF3C7", fg: "#D97706" },
  { icon: "clock-outline", label: "On-Time\nService", bg: "#DCFCE7", fg: "#16A34A" },
  { icon: "heart", label: "100% Customer\nSatisfaction", bg: "#F3E8FF", fg: "#9333EA" },
];

const BADGES: { icon: MdiName; label: string; fg: string; top: number; right: number }[] = [
  { icon: "shield-check", label: "Verified\nProfessionals", fg: "#D97706", top: 0, right: 96 },
  { icon: "clock-outline", label: "On-Time\nService", fg: "#16A34A", top: 0, right: 0 },
  { icon: "heart", label: "Trusted by\nThousands", fg: "#EC4899", top: 74, right: 0 },
];

export default function Login() {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const P = palette(colors.primary);
  const router = useRouter();
  const brand = useBrand();
  const { user, login, loading, booting } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [registerRole, setRegisterRole] = useState<Role | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState("");
  const [routing, setRouting] = useState(false);
  const [forgot, setForgot] = useState(false);
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
      await api.post("/auth/send-otp", { phone: `+91${phone.trim()}` }, { auth: false });
      toast.success("OTP sent to your mobile");
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 250);
    } catch (e: any) { toast.error(e?.detail || "Could not send OTP"); }
    setBusy("");
  };

  const verifyOtp = async () => {
    if (otp.trim().length < 4) return toast.error("Enter the OTP");
    setBusy("verify");
    try {
      const data = await api.post<any>("/auth/verify-otp", { phone: `+91${phone.trim()}`, otp: otp.trim(), role: registerRole || undefined }, { auth: false });
      await finish(data);
    } catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    setBusy("");
  };

  const quickLogin = async (acc: any) => {
    setBusy(acc.phone);
    try {
      await api.post("/auth/send-otp", { phone: acc.phone }, { auth: false });
      const data = await api.post<any>("/auth/verify-otp", { phone: acc.phone, otp: acc.otp }, { auth: false });
      await finish(data, `Demo login: ${data.user?.name}`);
    } catch (e: any) { toast.error(e?.detail || "Demo login failed"); }
    setBusy("");
  };

  const demoAccounts: any[] = APP_ROLES.map((r) => (demo?.accounts || []).find((a: any) => a.role === r)).filter(Boolean);
  const showLoader = booting || loading || routing || (user && APP_ROLES.includes(user.role as Role));

  const RoleCard = ({ role, kind }: { role: Role; kind: "register" | "demo" }) => {
    const isPartner = role === "partner";
    const on = busy === (demoAccounts.find((a) => a.role === role)?.phone);
    const bg = kind === "demo" ? (isPartner ? "#ECFDF5" : "#FDF4FF") : colors.surface;
    const border = kind === "demo" ? (isPartner ? "#A7F3D0" : "#F5D0FE") : colors.border;
    const iconBg = isPartner ? "#DCFCE7" : "#FAE8FF";
    const iconFg = isPartner ? "#16A34A" : "#C026D3";
    const title = kind === "register" ? `Register as\n${isPartner ? "Partner" : "Merchant"}` : `Login as ${isPartner ? "Partner" : "Merchant"}`;
    const sub = kind === "demo" ? `Opens ${isPartner ? "Partner app" : "Merchant app"} with demo data` : "";
    const onPress = () => {
      if (kind === "register") { setRegisterRole(role); setStep("phone"); toast.info(`Registering as ${isPartner ? "Partner" : "Merchant"} — verify your mobile`); }
      else { const a = demoAccounts.find((x) => x.role === role); if (a) quickLogin(a); }
    };
    return (
      <Pressable
        testID={kind === "register" ? `reg-${role}` : `demo-${role}`}
        onPress={onPress}
        disabled={!!busy}
        style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1.5, borderColor: border, backgroundColor: bg, opacity: busy && !on ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
      >
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
          {on ? <ActivityIndicator size="small" color={iconFg} /> : <Icon name={isPartner ? "wrench" : "storefront-outline"} size={22} color={iconFg} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: kind === "register" ? 15 : 14, fontWeight: "800", lineHeight: 18 }}>{title}</Text>
          {sub ? <Text style={{ color: TW.slate400, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <Icon name="chevron-right" size={20} color={TW.slate400} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFF" }}>
      <StatusBar style="dark" />
      <KeyboardAwareScrollView bottomOffset={24} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* ---------------- Hero header ---------------- */}
        <LinearGradient colors={["#EAF2FF", "#DCEBFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            {/* logo + tagline */}
            <View style={{ flex: 1, paddingTop: 6 }}>
              {logo ? (
                <Image testID="app-brand-logo" source={{ uri: logo }} style={{ height: 42, width: 168 }} contentFit="contain" contentPosition="left" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Image source={FALLBACK_LOGO} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="contain" />
                  <Text style={{ color: "#0D2E63", fontSize: 24, fontWeight: "900" }}>Azo<Text style={{ color: P[600] }}>App</Text></Text>
                </View>
              )}
              <Text style={{ color: "#334155", fontSize: 12, fontWeight: "600", marginTop: 6 }}>{brand.branding.tagline || "Service at Your Door Steps"}</Text>
              <View style={{ alignSelf: "flex-start", marginTop: 10, backgroundColor: "rgba(37,99,235,0.10)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ color: P[700], fontSize: 11, fontWeight: "800" }}>Trusted · Verified · Professional</Text>
              </View>
            </View>
            {/* hero image + floating badges */}
            <View style={{ width: 150, height: 150 }}>
              <Image source={{ uri: HERO }} style={{ width: 150, height: 150, borderRadius: 20 }} contentFit="cover" />
              {BADGES.map((b, i) => (
                <View key={i} style={{ position: "absolute", top: b.top, right: b.right, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5, boxShadow: "0px 6px 14px rgba(2,32,71,0.14)" }}>
                  <Icon name={b.icon} size={13} color={b.fg} />
                  <Text style={{ color: "#0F172A", fontSize: 8.5, fontWeight: "800", lineHeight: 10 }}>{b.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text testID="login-title" style={{ color: "#0F172A", fontSize: 34, lineHeight: 40, fontWeight: "900", marginTop: 18 }}>Login to{"\n"}<Text style={{ color: P[600] }}>Get Started</Text></Text>
          <Text style={{ color: "#475569", fontSize: 14, marginTop: 8, lineHeight: 20 }}>{registerRole ? `You're registering as ${registerRole}. Enter your mobile to continue.` : "Enter your mobile number to continue and access your account"}</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 16 }}>
          {/* ---------------- Mobile / OTP card ---------------- */}
          <View style={{ backgroundColor: "#fff", borderRadius: 22, borderWidth: 1, borderColor: "#E7EEFB", padding: 18, boxShadow: "0px 10px 30px rgba(2,32,71,0.06)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="phone-outline" size={18} color={P[600]} />
              <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800" }}>Mobile Number</Text>
            </View>

            {step === "phone" ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 54, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
                    <View style={{ width: 20, height: 14, borderRadius: 2, overflow: "hidden" }}>
                      <View style={{ flex: 1, backgroundColor: "#FF9933" }} /><View style={{ flex: 1, backgroundColor: "#fff" }} /><View style={{ flex: 1, backgroundColor: "#138808" }} />
                    </View>
                    <Text style={{ color: "#0F172A", fontSize: 15, fontWeight: "800" }}>+91</Text>
                  </View>
                  <TextInput
                    testID="login-phone-input"
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, "").slice(0, 10))}
                    placeholder="Mobile number"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    numberOfLines={1}
                    style={{ flex: 1, minWidth: 0, height: 54, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC", fontSize: 16, letterSpacing: 1, color: "#0F172A", fontWeight: "700" }}
                    onSubmitEditing={sendOtp}
                  />
                </View>
                <Pressable testID="send-otp-btn" onPress={sendOtp} disabled={busy === "send"} style={({ pressed }) => ({ marginTop: 14, height: 56, borderRadius: 16, backgroundColor: P[600], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "send" ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], boxShadow: `0px 10px 22px ${P[600]}55` })}>
                  {busy === "send" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>Send OTP</Text><Icon name="arrow-right" size={20} color="#fff" /></>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ color: "#475569", fontSize: 13, marginBottom: 10 }}>Enter the OTP sent to <Text style={{ fontWeight: "800", color: "#0F172A" }}>+91 {phone}</Text></Text>
                <Pressable onPress={() => otpRef.current?.focus()}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    {Array.from({ length: 6 }).map((_, i) => {
                      const active = i === Math.min(otp.length, 5);
                      const filled = i < otp.length;
                      return (
                        <View key={i} testID={`otp-box-${i}`} style={{ flex: 1, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: active ? P[600] : filled ? "#CBD5E1" : "#E2E8F0", backgroundColor: active ? "#EEF4FF" : "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 22, fontWeight: "900", color: "#0F172A" }}>{otp[i] || ""}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <TextInput
                    ref={otpRef}
                    testID="login-otp-input"
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    caretHidden
                    onSubmitEditing={verifyOtp}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
                  />
                </Pressable>
                <Pressable testID="verify-otp-btn" onPress={verifyOtp} disabled={busy === "verify"} style={({ pressed }) => ({ marginTop: 14, height: 56, borderRadius: 16, backgroundColor: P[600], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy === "verify" ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                  {busy === "verify" ? <ActivityIndicator color="#fff" /> : <><Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>Verify & Continue</Text><Icon name="check" size={20} color="#fff" /></>}
                </Pressable>
                <Pressable testID="otp-change-number" onPress={() => { setStep("phone"); setOtp(""); }} style={{ marginTop: 10, alignItems: "center" }}>
                  <Text style={{ color: P[700], fontSize: 13, fontWeight: "700" }}>← Change number</Text>
                </Pressable>
              </>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "center" }}>
              <Icon name="lock-outline" size={13} color={TW.slate400} />
              <Text style={{ color: TW.slate400, fontSize: 12 }}>We&apos;ll take you to the right panel based on your number.</Text>
            </View>
          </View>

          {/* ---------------- Register (single row, split) ---------------- */}
          <View testID="register-toggles" style={{ flexDirection: "row", alignItems: "stretch", backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border, overflow: "hidden" }}>
            {APP_ROLES.map((role, idx) => {
              const isPartner = role === "partner";
              return (
                <React.Fragment key={role}>
                  {idx === 1 ? <View style={{ width: 1.5, backgroundColor: colors.border }} /> : null}
                  <Pressable
                    testID={`reg-${role}`}
                    disabled={!!busy}
                    onPress={() => { setRegisterRole(role); setStep("phone"); toast.info(`Registering as ${isPartner ? "Partner" : "Merchant"} — verify your mobile`); }}
                    style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingVertical: 15, backgroundColor: pressed ? (isPartner ? "#F0FDF4" : "#FDF4FF") : "transparent" })}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: isPartner ? "#DCFCE7" : "#FAE8FF", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={isPartner ? "wrench" : "storefront-outline"} size={18} color={isPartner ? "#16A34A" : "#C026D3"} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "800" }} numberOfLines={1}>Register as {isPartner ? "Partner" : "Merchant"}</Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>

          {/* ---------------- Demo login ---------------- */}
          {demo?.demo_mode && demoAccounts.length > 0 ? (
            <View testID="demo-accounts" style={{ gap: 12, marginTop: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
                <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>★ ONE-CLICK DEMO LOGIN ★</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <RoleCard role="partner" kind="demo" />
                <RoleCard role="merchant" kind="demo" />
              </View>
              <View style={{ alignSelf: "stretch", backgroundColor: "#EEF4FF", borderRadius: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Icon name="wrench-outline" size={16} color={P[600]} />
                <Text style={{ color: "#334155", fontSize: 14, fontWeight: "700" }}>Demo OTP: <Text style={{ color: P[700], fontWeight: "900" }}>123456</Text></Text>
              </View>
            </View>
          ) : null}

          {/* ---------------- Feature icons ---------------- */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
            {FEATURES.map((f, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: f.bg, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={f.icon} size={22} color={f.fg} />
                </View>
                <Text style={{ color: "#475569", fontSize: 10.5, fontWeight: "700", textAlign: "center", lineHeight: 13 }}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* ---------------- Footer ---------------- */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
            <Text style={{ color: P[700], fontSize: 12, fontWeight: "800" }}>Your Home Services Partner</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
          </View>
        </View>
      </KeyboardAwareScrollView>

      <ForgotPasswordSheet open={forgot} onClose={() => setForgot(false)} />
      {showLoader ? (
        <View testID="login-auth-loader" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#F8FAFF", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <ActivityIndicator size="large" color={P[700]} />
        </View>
      ) : null}
    </View>
  );
}
