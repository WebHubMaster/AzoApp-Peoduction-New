import React from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { LogOut } from "lucide-react-native";
import { TW, GRAD_BAR, GRAD_SCORE, T, usePal } from "./tokens";

/* ---------------- Completion score ring (web: size 76, stroke 6) ---------------- */
export function ScoreRing({ score = 0, size = 76 }: { score?: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} stroke="rgba(255,255,255,0.2)" fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} stroke="#fff" fill="none" strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={off} />
      </Svg>
      <Text style={{ position: "absolute", color: "#fff", fontWeight: "800", ...T.lg, lineHeight: 20 }}>{score}%</Text>
    </View>
  );
}

/* ---------------- Shell (web mobile frame: brand bar + score banner + card) ---------------- */
export function RegShell({ kind, score, scoreTitle, onLogout, children, nav, testID }: {
  kind: "partner" | "merchant"; score?: number; scoreTitle?: string; onLogout: () => void;
  children: React.ReactNode; nav?: React.ReactNode; testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const P = usePal();
  const brandName = kind === "partner" ? "AzoApp Partner" : "AzoApp Merchant";
  const tagline = kind === "partner" ? "Trusted professionals network" : "Grow your shop & network";
  return (
    <View style={{ flex: 1, backgroundColor: TW.slate100 }}>
      <StatusBar style="light" />
      <KeyboardAwareScrollView bottomOffset={24} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: (nav ? 88 : 24) + insets.bottom }}>
        <LinearGradient colors={[...GRAD_BAR]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }}
          style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 80 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "900", ...T.base }}>A</Text>
              </View>
              <View>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16, lineHeight: 18 }}>{brandName}</Text>
                <Text style={{ color: "rgba(186,230,253,0.8)", ...T.px11, marginTop: 2 }}>{tagline}</Text>
              </View>
            </View>
            <Pressable testID="reg-logout" onPress={onLogout} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <LogOut size={16} color={TW.sky100} />
              <Text style={{ color: TW.sky100, ...T.sm }}>Logout</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={{ marginTop: -64, paddingHorizontal: 12, paddingTop: 24 }}>
          {typeof score === "number" ? (
            <LinearGradient colors={[...GRAD_SCORE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }}
              style={{ borderRadius: 24, padding: 16, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 16, borderWidth: 1, borderColor: P[100], boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.1)" }}>
              <ScoreRing score={score} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "700", ...T.lg }}>{scoreTitle}</Text>
                <Text style={{ color: "rgba(224,242,254,0.85)", ...T.sm }}>A complete profile builds trust and speeds up approval.</Text>
              </View>
            </LinearGradient>
          ) : null}
          <View testID={testID} style={{ backgroundColor: "#fff", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: TW.slate100, boxShadow: "0px 25px 50px -12px rgba(0,0,0,0.25)" }}>
            {children}
          </View>
          <Text style={{ textAlign: "center", color: TW.slate400, ...T.xs, marginTop: 16 }}>© AzoApp · Your data is secure & encrypted</Text>
        </View>
      </KeyboardAwareScrollView>
      {nav}
    </View>
  );
}
