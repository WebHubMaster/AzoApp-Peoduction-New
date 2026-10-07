import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Check, ShieldCheck, Zap, IndianRupee, Users, BadgeCheck, Star, CreditCard, Headphones, Clock } from "lucide-react-native";

export const C = {
  primary: "#0D47A1", bright: "#1565D8", navy: "#0A1B3D", body: "#5A6782", faint: "#94A0B8",
  border: "#E3EAF5", soft: "#EAF2FE", green: "#16A34A", orange: "#F59E0B", bg: "#F4F8FE",
};

const IMG = {
  woman: require("../../../assets/login/woman.webp"),
  ac: require("../../../assets/login/ac.webp"),
  plumber: require("../../../assets/login/plumber.webp"),
  cleaner: require("../../../assets/login/cleaner.webp"),
  living: require("../../../assets/login/living.webp"),
};

const shadow = (y: number, b: number, a: number) => ({ boxShadow: `0px ${y}px ${b}px rgba(13,40,90,${a})` } as any);

export function PrimaryBtn({ label, onPress, busy, disabled, testID }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={busy || disabled}
      style={({ pressed }) => ({ height: 56, borderRadius: 14, backgroundColor: pressed ? C.primary : C.bright, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 12, opacity: disabled && !busy ? 0.55 : 1, transform: [{ scale: pressed ? 0.985 : 1 }], ...shadow(10, 22, 0.28) } as any)}>
      {busy ? <ActivityIndicator color="#fff" size="small" /> : <><Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: 0.2 }}>{label}</Text><ArrowRight size={20} color="#fff" strokeWidth={2.4} /></>}
    </Pressable>
  );
}

export function IndiaFlag() {
  return (
    <View style={{ width: 26, height: 18, borderRadius: 3, overflow: "hidden", borderWidth: 0.5, borderColor: "rgba(0,0,0,0.1)" }}>
      <View style={{ flex: 1, backgroundColor: "#FF9933" }} />
      <View style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><View style={{ width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: "#000080" }} /></View>
      <View style={{ flex: 1, backgroundColor: "#138808" }} />
    </View>
  );
}

function VerifiedDot({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.green, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
      <Check size={size * 0.55} color="#fff" strokeWidth={3.5} />
    </View>
  );
}

function ServiceCard({ src, size, style, testID }: { src: any; size: number; style: any; testID: string }) {
  return (
    <View testID={testID} style={[{ position: "absolute", width: size, height: size, borderRadius: 16, backgroundColor: "#fff", padding: 3, ...shadow(8, 20, 0.16) }, style]}>
      <Image source={src} style={{ flex: 1, borderRadius: 13 }} contentFit="cover" transition={0} />
      <View style={{ position: "absolute", right: -4, bottom: -4 }}><VerifiedDot size={22} /></View>
    </View>
  );
}

/* Right side visual: blue disc + customer + 3 verified service snapshots + verification badge */
export function HeroVisual({ S, W }: { S: number; W: number }) {
  const disc = Math.round(262 * S);
  const card = Math.round(76 * S);
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: -18, top: 0, width: W * 0.62, height: Math.round(470 * S) }}>
      <View testID="login-hero" style={{ position: "absolute", right: -Math.round(72 * S), top: Math.round(84 * S), width: disc, height: disc + Math.round(70 * S), borderTopLeftRadius: disc, borderBottomLeftRadius: disc * 0.9, borderTopRightRadius: 0, overflow: "hidden", backgroundColor: "#4F84E6" }}>
        <Image source={IMG.woman} style={{ width: "100%", height: "100%" }} contentFit="cover" contentPosition="top" transition={0} priority="high" />
      </View>
      <ServiceCard testID="hero-card-ac" src={IMG.ac} size={card} style={{ top: Math.round(48 * S), right: Math.round(118 * S), transform: [{ rotate: "-4deg" }] }} />
      <ServiceCard testID="hero-card-plumber" src={IMG.plumber} size={card} style={{ top: Math.round(34 * S), right: Math.round(18 * S), transform: [{ rotate: "3deg" }] }} />
      <ServiceCard testID="hero-card-cleaner" src={IMG.cleaner} size={Math.round(card * 0.92)} style={{ top: Math.round(142 * S), right: Math.round(4 * S), transform: [{ rotate: "-2deg" }] }} />
      <View testID="hero-verified-badge" style={{ position: "absolute", right: Math.round(10 * S), top: Math.round(392 * S), flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "#fff", transform: [{ rotate: "-3deg" }], ...shadow(10, 24, 0.18) }}>
        <ShieldCheck size={26} color="#fff" fill={C.green} strokeWidth={2.2} />
        <View>
          <Text style={{ fontSize: 13, fontWeight: "800", color: C.navy }}>100% Verified</Text>
          <Text style={{ fontSize: 11.5, color: C.body, marginTop: -1 }}>Professionals</Text>
        </View>
      </View>
    </View>
  );
}

function Feature({ icon, a, b, testID }: { icon: React.ReactNode; a: string; b: string; testID: string }) {
  return (
    <View testID={testID} style={{ alignItems: "center", gap: 7, width: 66 }}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", ...shadow(4, 12, 0.08) }}>{icon}</View>
      <Text style={{ fontSize: 11, lineHeight: 14, color: C.navy, fontWeight: "600", textAlign: "center" }}>{a}{"\n"}{b}</Text>
    </View>
  );
}

export function HeroFeatures() {
  return (
    <View testID="login-features" style={{ flexDirection: "row", gap: 2, marginTop: 22 }}>
      <Feature testID="feature-verified" icon={<ShieldCheck size={22} color="#fff" fill={C.bright} strokeWidth={2} />} a="Verified" b="Professionals" />
      <Feature testID="feature-safe" icon={<Zap size={21} color={C.bright} fill={C.bright} strokeWidth={2} />} a="Safe &" b="Secure" />
      <Feature testID="feature-payments" icon={<IndianRupee size={21} color={C.bright} strokeWidth={2.4} />} a="Easy" b="Payments" />
    </View>
  );
}

function Stat({ icon, value, label, testID }: { icon: React.ReactNode; value: string; label: string; testID: string }) {
  return (
    <View testID={testID} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {icon}
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: C.navy, letterSpacing: -0.3 }}>{value}</Text>
        <Text numberOfLines={2} style={{ fontSize: 10.5, lineHeight: 13, color: C.body }}>{label}</Text>
      </View>
    </View>
  );
}

const Sep = () => <View style={{ width: 1, height: 34, backgroundColor: C.border }} />;

export function TrustStats() {
  return (
    <View testID="trust-stats" style={{ flexDirection: "row", alignItems: "center", marginTop: 26, paddingHorizontal: 2 }}>
      <Stat testID="stat-customers" icon={<Users size={22} color={C.bright} fill={C.bright} />} value="50,000+" label="Happy Customers" />
      <Sep />
      <Stat testID="stat-professionals" icon={<BadgeCheck size={22} color="#fff" fill={C.bright} />} value="10,000+" label="Verified Professionals" />
      <Sep />
      <Stat testID="stat-rating" icon={<Star size={22} color={C.orange} fill={C.orange} />} value="4.8/5" label="Average Rating" />
    </View>
  );
}

function Benefit({ icon, a, b, last, testID }: { icon: React.ReactNode; a: string; b: string; last?: boolean; testID: string }) {
  return (
    <View testID={testID} style={{ flex: 1, alignItems: "center", gap: 8, borderRightWidth: last ? 0 : 1, borderRightColor: "#D6E3F7" }}>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", ...shadow(3, 10, 0.07) }}>{icon}</View>
      <Text style={{ fontSize: 11.5, lineHeight: 14.5, color: C.navy, fontWeight: "600", textAlign: "center" }}>{a}{"\n"}{b}</Text>
    </View>
  );
}

export function SecurityStrip() {
  const ic = { size: 21, color: C.bright, strokeWidth: 2 };
  return (
    <View testID="security-strip" style={{ flexDirection: "row", marginTop: 24, paddingVertical: 18, borderRadius: 22, backgroundColor: C.soft, borderWidth: 1, borderColor: "#DCE8FA" }}>
      <Benefit testID="benefit-data" icon={<ShieldCheck {...ic} />} a="Your Data" b="is Safe" />
      <Benefit testID="benefit-payments" icon={<CreditCard {...ic} />} a="Secure" b="Payments" />
      <Benefit testID="benefit-support" icon={<Headphones {...ic} />} a="24/7" b="Support" />
      <Benefit testID="benefit-reliable" icon={<Clock {...ic} />} a="Reliable" b="Service" last />
    </View>
  );
}

export function BottomTrust({ bg }: { bg: string }) {
  return (
    <View testID="bottom-trust" style={{ marginTop: 14, marginHorizontal: -18, height: 170, justifyContent: "center" }}>
      <Image source={IMG.living} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.9 }} contentFit="cover" contentPosition="right" transition={0} />
      <LinearGradient colors={[bg, "rgba(244,248,254,0.55)", "rgba(244,248,254,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient colors={[bg, "rgba(244,248,254,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 50 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 18, alignSelf: "flex-start", paddingVertical: 12, paddingLeft: 12, paddingRight: 20, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.88)", ...shadow(8, 22, 0.1) }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: "#ECFDF3", borderWidth: 2, borderColor: "#BBF7D0", alignItems: "center", justifyContent: "center" }}>
          <ShieldCheck size={32} color="#fff" fill={C.green} strokeWidth={2} />
        </View>
        <View>
          <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: "800", color: C.navy }}>Trusted by families{"\n"}across India</Text>
          <Text style={{ fontSize: 12, color: C.body, marginTop: 4, letterSpacing: 0.2 }}>Safe  •  Secure  •  Reliable</Text>
        </View>
      </View>
    </View>
  );
}
