import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Icon, MdiName } from "@/src/components/Icon";
import { useBrand } from "@/src/context/BrandContext";

const FALLBACK_LOGO = require("../../../assets/brand-logo.png"); // eslint-disable-line @typescript-eslint/no-require-imports

/* Mockup palette — shared by Welcome / Login / Register screens. */
export const AUTH = {
  bg: "#F4F7FC",
  ink: "#0F172A",
  navy: "#1E3A8A",
  blue: "#1D4ED8",
  blueDark: "#1E40AF",
  blueGrad: ["#3B82F6", "#1D4ED8"] as const,
  blueSoft: "#EAF1FF",
  muted: "#64748B",
  line: "#E2E8F0",
  card: "0px 10px 30px rgba(15,23,42,0.08)",
};

export type Accent = { main: string; dark: string; soft: string; border: string; grad: readonly [string, string]; icon: MdiName; label: string; sub: string };
export const ROLE_ACCENT: Record<"partner" | "merchant", Accent> = {
  partner: { main: "#10B981", dark: "#047857", soft: "#ECFDF5", border: "#A7F3D0", grad: ["#34D399", "#059669"], icon: "wrench", label: "Register as Partner", sub: "Offer services, receive jobs and grow your business" },
  merchant: { main: "#8B5CF6", dark: "#6D28D9", soft: "#F5F3FF", border: "#DDD6FE", grad: ["#A78BFA", "#7C3AED"], icon: "storefront-outline", label: "Register as Merchant", sub: "List your shop, manage orders and reach more customers" },
};
export const LOGIN_ACCENT: Accent = { main: AUTH.blue, dark: AUTH.navy, soft: AUTH.blueSoft, border: "#BFDBFE", grad: AUTH.blueGrad, icon: "login-variant", label: "Log In", sub: "Access your existing account" };

export function useSupportContact() {
  const brand = useBrand();
  const phone = brand.branding.phone || brand.business?.support_phone;
  const email = brand.branding.email || brand.business?.support_email;
  return () => {
    if (phone) return Linking.openURL(`tel:${String(phone).replace(/[^+\d]/g, "")}`).catch(() => {});
    if (email) return Linking.openURL(`mailto:${email}`).catch(() => {});
    return Promise.resolve();
  };
}

/* Dynamic brand logo (admin → Branding). Falls back to icon + site name. */
export function BrandRow({ size = 34 }: { size?: number }) {
  const brand = useBrand();
  const logo = brand.branding.logo_light || brand.branding.logo || brand.branding.logo_dark;
  if (logo) return <Image testID="app-brand-logo" source={{ uri: logo }} style={{ height: size + 6, width: 150 }} contentFit="contain" contentPosition="left" />;
  return (
    <View testID="app-brand-logo" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Image source={FALLBACK_LOGO} style={{ width: size + 6, height: size + 6, borderRadius: 10 }} contentFit="contain" />
      <View>
        <Text style={{ color: AUTH.ink, fontSize: 21, fontWeight: "900", letterSpacing: -0.3 }}>{brand.branding.site_name}</Text>
        <Text style={{ color: AUTH.muted, fontSize: 10.5, fontWeight: "600", marginTop: -1 }}>{brand.branding.tagline}</Text>
      </View>
    </View>
  );
}

export function BackButton({ onPress, testID = "auth-back" }: { onPress?: () => void; testID?: string }) {
  const router = useRouter();
  const go = onPress || (() => (router.canGoBack() ? router.back() : router.replace("/(auth)/welcome" as any)));
  return (
    <Pressable testID={testID} onPress={go} hitSlop={8} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 14px rgba(15,23,42,0.08)", transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Icon name="chevron-left" size={26} color={AUTH.ink} />
    </Pressable>
  );
}

export function NeedHelpLink() {
  const open = useSupportContact();
  return (
    <Pressable testID="need-help-link" onPress={open} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon name="headset" size={18} color={AUTH.ink} />
      <Text style={{ color: AUTH.ink, fontSize: 14, fontWeight: "600" }}>Need Help?</Text>
    </Pressable>
  );
}

export function AuthHeader({ right, onBack, top }: { right?: React.ReactNode; onBack?: () => void; top: number }) {
  return (
    <View style={{ paddingTop: top + 10, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      <BackButton onPress={onBack} />
      {right || <View style={{ width: 44 }} />}
    </View>
  );
}

/* Big-tile info card ("Safe & Secure", "Need Help?") */
export function InfoCard({ icon, iconBg, iconColor, title, sub, onPress, chevron, testID, bg = "#EEF4FF", border = "#DDE7FA" }: { icon: MdiName; iconBg: string; iconColor: string; title: string; sub: string; onPress?: () => void; chevron?: boolean; testID?: string; bg?: string; border?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 20, backgroundColor: bg, borderWidth: 1, borderColor: border, transform: [{ scale: pressed && onPress ? 0.98 : 1 }] })}>
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={28} color={iconColor} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: AUTH.ink, fontSize: 16, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: AUTH.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{sub}</Text>
      </View>
      {chevron ? <Icon name="chevron-right" size={22} color="#94A3B8" /> : null}
    </Pressable>
  );
}

export function SafeSecureCard() {
  return <InfoCard testID="safe-secure-card" icon="shield-lock" iconBg="#DBEAFE" iconColor={AUTH.blue} title="Safe & Secure" sub="We use industry standard encryption to keep your data safe." />;
}

export function NeedHelpCard() {
  const open = useSupportContact();
  return <InfoCard testID="need-help-card" icon="headset" iconBg="#DBEAFE" iconColor={AUTH.blue} title="Need Help?" sub="Contact our support team anytime" onPress={open} chevron bg="#fff" border={AUTH.line} />;
}
