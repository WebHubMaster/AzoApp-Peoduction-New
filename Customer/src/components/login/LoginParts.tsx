import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { ArrowRight, ShieldCheck, Zap, IndianRupee, Users, Star, CreditCard, Headphones, Clock } from "lucide-react-native";

export const C = {
  primary: "#0D47A1", bright: "#1565D8", navy: "#0A1633", body: "#5B6680", faint: "#9AA4B8",
  border: "#E2E8F2", strip: "#ECF4FD", green: "#16A34A", orange: "#F79A1E", bg: "#F7FAFE",
};

const HERO = require("../../../assets/login/hero.webp");
const ROOM = require("../../../assets/login/room.webp");

// Reference-image geometry (941 x 1672 px) → screen points. Horizontal & vertical scale differ slightly
// so the whole design fits one phone screen (no scroll) while keeping the reference proportions.
export type G = { u: number; X: (p: number) => number; Y: (p: number) => number; F: (p: number) => number; CW: number; H: number };
export function makeGeom(width: number, height: number): G {
  const u = Math.min(width / 390, height / 760);
  const yf = Math.min(height / 1672, 0.48 * u);
  return { u, CW: 390 * u, H: height, X: (p) => p * 0.4145 * u, Y: (p) => p * yf, F: (p) => p * 0.44 * u };
}

const sh = (y: number, b: number, a: number) => ({ boxShadow: `0px ${y}px ${b}px rgba(13,40,90,${a})` } as any);

export function PrimaryBtn({ g, label, onPress, busy, disabled, testID }: { g: G; label: string; onPress: () => void; busy?: boolean; disabled?: boolean; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={busy || disabled}
      style={({ pressed }) => ({ height: g.Y(88), borderRadius: 7 * g.u, backgroundColor: pressed ? C.primary : C.bright, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 * g.u, opacity: disabled && !busy ? 0.55 : 1, transform: [{ scale: pressed ? 0.985 : 1 }], ...sh(6, 14, 0.2) } as any)}>
      {busy ? <ActivityIndicator color="#fff" size="small" /> : <><Text style={{ color: "#fff", fontSize: g.F(29), fontWeight: "600" }}>{label}</Text><ArrowRight size={g.F(32)} color="#fff" strokeWidth={2.4} /></>}
    </Pressable>
  );
}

export function IndiaFlag({ g }: { g: G }) {
  return (
    <View style={{ width: g.X(46), height: g.X(31), borderRadius: 2, overflow: "hidden" }}>
      <View style={{ flex: 1, backgroundColor: "#FF9933" }} />
      <View style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><View style={{ width: 4 * g.u, height: 4 * g.u, borderRadius: 3, borderWidth: 0.8, borderColor: "#000080" }} /></View>
      <View style={{ flex: 1, backgroundColor: "#138808" }} />
    </View>
  );
}

export function HeroImage({ g }: { g: G }) {
  const h = Math.min(g.Y(604), (g.X(471) * 1.14 * 601) / 471);
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 0, top: g.Y(102), width: (h * 471) / 601, height: h }}>
      <Image testID="login-hero" source={HERO} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={0} priority="high" />
      <LinearGradient colors={[C.bg, "rgba(247,250,254,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18 * g.u }} />
      <LinearGradient colors={["rgba(247,250,254,0)", C.bg]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14 * g.u }} />
    </View>
  );
}

export function Swoosh({ g }: { g: G }) {
  return (
    <Svg testID="trust-underline" width={g.X(152)} height={g.Y(22)} viewBox="0 0 152 22" style={{ position: "absolute", left: g.X(294), top: g.Y(360) } as any}>
      <Path d="M3 14 C 40 6, 100 4, 149 8" stroke={C.bright} strokeWidth={4.5} strokeLinecap="round" fill="none" />
      <Path d="M22 19 C 60 13, 105 12, 140 14" stroke={C.bright} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function Feature({ g, cx, icon, a, b, testID }: { g: G; cx: number; icon: React.ReactNode; a: string; b: string; testID: string }) {
  const w = g.X(170);
  return (
    <View testID={testID} style={{ position: "absolute", left: g.X(cx) - w / 2, top: g.Y(532), width: w, alignItems: "center" }}>
      <View style={{ width: g.Y(80), height: g.Y(80), borderRadius: 99, backgroundColor: "#EAF2FD", borderWidth: 1, borderColor: "#fff", alignItems: "center", justifyContent: "center", ...sh(2, 8, 0.08) }}>{icon}</View>
      <Text style={{ marginTop: g.Y(8), fontSize: g.F(20), lineHeight: g.Y(24), color: C.navy, fontWeight: "500", textAlign: "center" }}>{a}{"\n"}{b}</Text>
    </View>
  );
}

export function HeroFeatures({ g }: { g: G }) {
  const s = g.F(40);
  return (
    <View testID="login-features" pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0 }}>
      <Feature g={g} cx={110} testID="feature-verified" icon={<ShieldCheck size={s} color="#fff" fill={C.bright} strokeWidth={2} />} a="Verified" b="Professionals" />
      <Feature g={g} cx={262} testID="feature-safe" icon={<Zap size={s} color={C.bright} fill={C.bright} strokeWidth={1.5} />} a="Safe &" b="Secure" />
      <Feature g={g} cx={407} testID="feature-payments" icon={<IndianRupee size={s} color={C.bright} strokeWidth={2.6} />} a="Easy" b="Payments" />
    </View>
  );
}

function Stat({ g, ix, tx, icon, value, label, testID }: { g: G; ix: number; tx: number; icon: React.ReactNode; value: string; label: string; testID: string }) {
  return (
    <>
      <View style={{ position: "absolute", left: g.X(ix), top: g.Y(28) }}>{icon}</View>
      <View testID={testID} style={{ position: "absolute", left: g.X(tx), top: g.Y(10) }}>
        <Text style={{ fontSize: g.F(27), fontWeight: "700", color: C.navy }}>{value}</Text>
        <Text style={{ fontSize: g.F(18), color: C.body, marginTop: g.Y(2) }}>{label}</Text>
      </View>
    </>
  );
}

export function TrustStats({ g }: { g: G }) {
  const s = g.F(44);
  const sep = (x: number) => <View style={{ position: "absolute", left: g.X(x), top: g.Y(5), width: 1, height: g.Y(68), backgroundColor: C.border }} />;
  return (
    <View testID="trust-stats" style={{ position: "absolute", left: 0, right: 0, top: g.Y(1165), height: g.Y(80) }}>
      <Stat g={g} ix={73} tx={143} testID="stat-customers" icon={<Users size={s} color={C.bright} fill={C.bright} />} value="50,000+" label="Happy Customers" />
      {sep(332)}
      <Stat g={g} ix={373} tx={440} testID="stat-professionals" icon={<ShieldCheck size={s} color="#fff" fill={C.bright} strokeWidth={2} />} value="10,000+" label="Verified Professionals" />
      {sep(636)}
      <Stat g={g} ix={680} tx={755} testID="stat-rating" icon={<Star size={s} color={C.orange} fill={C.orange} />} value="4.8/5" label="Average Rating" />
    </View>
  );
}

function Benefit({ g, cx, icon, a, b, testID }: { g: G; cx: number; icon: React.ReactNode; a: string; b: string; testID: string }) {
  const w = g.X(200);
  return (
    <View testID={testID} style={{ position: "absolute", left: g.X(cx - 38) - w / 2, top: g.Y(22), width: w, alignItems: "center" }}>
      <View style={{ height: g.Y(52), justifyContent: "center" }}>{icon}</View>
      <Text style={{ marginTop: g.Y(10), fontSize: g.F(20), lineHeight: g.Y(25), color: C.navy, textAlign: "center" }}>{a}{"\n"}{b}</Text>
    </View>
  );
}

export function SecurityStrip({ g }: { g: G }) {
  const ic = { size: g.F(46), color: C.bright, strokeWidth: 2 };
  const div = (x: number) => <View style={{ position: "absolute", left: g.X(x - 38), top: g.Y(28), width: 1, height: g.Y(100), backgroundColor: "#D7E4F6" }} />;
  return (
    <View testID="security-strip" style={{ position: "absolute", left: g.X(38), right: g.X(38), top: g.Y(1272), height: g.Y(154), borderRadius: 12 * g.u, backgroundColor: C.strip, borderWidth: 1, borderColor: "#E3EDFA" }}>
      <Benefit g={g} cx={151} testID="benefit-data" icon={<ShieldCheck {...ic} />} a="Your Data" b="is Safe" />
      {div(262)}
      <Benefit g={g} cx={367} testID="benefit-payments" icon={<CreditCard {...ic} />} a="Secure" b="Payments" />
      {div(470)}
      <Benefit g={g} cx={570} testID="benefit-support" icon={<Headphones {...ic} />} a="24/7" b="Support" />
      {div(678)}
      <Benefit g={g} cx={778} testID="benefit-reliable" icon={<Clock {...ic} />} a="Reliable" b="Service" />
    </View>
  );
}

export function BottomTrust({ g }: { g: G }) {
  const blockH = g.H - g.Y(1428);
  const rw = g.CW - g.X(340);
  const rh = Math.min(blockH, rw * 0.62);
  const seal = g.X(112);
  return (
    <View testID="bottom-trust" pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: blockH }}>
      <Image source={ROOM} style={{ position: "absolute", right: 0, bottom: 0, width: rw, height: rh }} contentFit="cover" contentPosition="bottom" transition={0} />
      <LinearGradient colors={[C.bg, "rgba(247,250,254,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", right: rw - 40 * g.u, bottom: 0, width: 40 * g.u, height: rh }} />
      <LinearGradient colors={[C.bg, "rgba(247,250,254,0)"]} style={{ position: "absolute", right: 0, bottom: rh - 30 * g.u, width: rw, height: 30 * g.u }} />
      <View style={{ position: "absolute", left: g.X(150), top: g.Y(42), width: g.X(280), height: g.Y(118), borderRadius: 14 * g.u, backgroundColor: "rgba(255,255,255,0.8)" }} />
      <View style={{ position: "absolute", left: g.X(42), top: g.Y(101) - seal / 2, width: seal, height: seal, borderRadius: seal, backgroundColor: "#fff", borderWidth: 2, borderStyle: "dashed", borderColor: "#86C79A", alignItems: "center", justifyContent: "center", ...sh(4, 12, 0.12) }}>
        <View style={{ width: seal * 0.8, height: seal * 0.8, borderRadius: seal, backgroundColor: "#F2FBF4", alignItems: "center", justifyContent: "center" }}>
          <ShieldCheck size={seal * 0.62} color="#fff" fill={C.green} strokeWidth={2} />
        </View>
      </View>
      <View style={{ position: "absolute", left: g.X(172), top: g.Y(60) }}>
        <Text style={{ fontSize: g.F(25), lineHeight: g.F(30), fontWeight: "700", color: C.navy }}>Trusted by families{"\n"}across India</Text>
        <Text style={{ fontSize: g.F(19), color: C.body, marginTop: g.Y(10) }}>Safe  •  Secure  •  Reliable</Text>
      </View>
    </View>
  );
}

export function NeedHelp({ g, onPress }: { g: G; onPress: () => void }) {
  return (
    <Pressable testID="login-need-help" onPress={onPress} hitSlop={10}
      style={({ pressed }) => ({ position: "absolute", right: g.X(42), top: g.Y(28), flexDirection: "row", alignItems: "center", gap: 8 * g.u, opacity: pressed ? 0.6 : 1, zIndex: 20 } as any)}>
      <Headphones size={g.F(42)} color={C.bright} strokeWidth={2.4} />
      <Text style={{ fontSize: g.F(23), fontWeight: "500", color: C.bright }}>Need Help?</Text>
    </Pressable>
  );
}
