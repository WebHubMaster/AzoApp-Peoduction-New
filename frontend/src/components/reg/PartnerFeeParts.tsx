/* Presentational pieces for the Partner Registration Fee screen (UI only). */
import React from "react";
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import {
  ShieldCheck, Info, ArrowRight, Lock, ChevronLeft, TriangleAlert, Check, RotateCcw, CircleCheck,
  CalendarX, Receipt,
} from "lucide-react-native";

export const C = {
  blue: "#0D47A1",
  blueDeep: "#0A3A85",
  ink: "#0B1B33",
  body: "#475569",
  muted: "#64748B",
  faint: "#94A3B8",
  line: "#E6EDF7",
  tint: "#EEF4FC",
  tint2: "#DCE8FB",
  surface: "#F7FAFE",
  green: "#047857",
  greenTint: "#ECFDF5",
  red: "#B42318",
  redTint: "#FEF3F2",
  redLine: "#FECDCA",
};

const rupee = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export { rupee };

export const enter = (i: number) => FadeInDown.delay(60 + i * 60).duration(320);

export function FeeHeader({ logo, siteName, tagline, onBack, topInset }: {
  logo: string; siteName?: string; tagline?: string; onBack: () => void; topInset: number;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: topInset + 8, paddingBottom: 8, backgroundColor: "#fff" }}>
      <Pressable testID="fee-pay-back" onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back"
        style={({ pressed }) => ({ height: 44, width: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? C.tint : "transparent" })}>
        <ChevronLeft size={24} color={C.ink} />
      </Pressable>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", height: 40 }}>
        {logo ? (
          <Image testID="fee-brand-logo" source={{ uri: logo }} style={{ height: 36, width: 156 }} contentFit="contain" transition={180}
            accessibilityLabel={siteName || "Brand logo"} />
        ) : (
          <View style={{ alignItems: "center" }} testID="fee-brand-fallback">
            <Text style={{ fontSize: 18, lineHeight: 22, fontWeight: "800", color: C.blue }}>{siteName || "AzoApp"}</Text>
            <Text style={{ fontSize: 11, lineHeight: 14, color: C.faint }}>{tagline || "Service at Your Doorstep"}</Text>
          </View>
        )}
      </View>
      <View style={{ width: 44 }} />
    </View>
  );
}

const STEPS = ["Registration", "Payment", "Activation"];

export function FeeProgress() {
  return (
    <Animated.View entering={enter(0)} testID="fee-progress" accessibilityLabel="Step 2 of 3: Payment"
      style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
      {STEPS.map((s, i) => {
        const done = i === 0;
        const active = i === 1;
        return (
          <React.Fragment key={s}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ height: 20, width: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
                backgroundColor: done || active ? C.blue : "#fff", borderWidth: done || active ? 0 : 1.5, borderColor: C.line }}>
                {done ? <Check size={12} color="#fff" strokeWidth={3} /> : (
                  <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", color: active ? "#fff" : C.faint }}>{i + 1}</Text>
                )}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: active ? "700" : "500", color: active ? C.ink : done ? C.body : C.faint }}>{s}</Text>
            </View>
            {i < STEPS.length - 1 ? (
              <View style={{ flex: 1, height: 2, borderRadius: 1, marginHorizontal: 8, backgroundColor: i === 0 ? C.blue : C.line, minWidth: 12 }} />
            ) : null}
          </React.Fragment>
        );
      })}
    </Animated.View>
  );
}

export function FeeHero({ hero }: { hero: any }) {
  const { width: W } = useWindowDimensions();
  const size = Math.max(104, Math.min(W * 0.32, 140));
  return (
    <Animated.View entering={enter(1)} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24 }}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={{ fontSize: W < 360 ? 24 : 26, lineHeight: W < 360 ? 30 : 32, fontWeight: "800", color: C.ink, letterSpacing: -0.4 }}>
          Complete Your Registration
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: C.body, marginTop: 8 }}>
          Pay the one-time processing fee to activate your partner account.
        </Text>
      </View>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.tint, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", borderWidth: 4, borderColor: "#fff", boxShadow: "0px 8px 24px rgba(13,71,161,0.12)" }}>
        <View style={{ position: "absolute", top: size * 0.08, right: size * 0.06, width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: C.tint2 }} />
        <Image source={hero} style={{ width: size * 0.92, height: size * 1.02 }} contentFit="contain" contentPosition="bottom" testID="fee-hero-provider"
          accessibilityLabel="AzoApp partner" />
      </View>
    </Animated.View>
  );
}

function Chip({ icon: Icon, label, testID }: { icon: any; label: string; testID: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: C.tint, paddingHorizontal: 10, paddingVertical: 7 }}>
      <Icon size={14} color={C.blue} strokeWidth={2.2} />
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color: C.blue }}>{label}</Text>
    </View>
  );
}

function Row({ label, value, tone, testID }: { label: string; value: string; tone?: "green" | "strike"; testID: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, lineHeight: 18, color: C.muted }}>{label}</Text>
      <Text testID={testID} style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: tone === "green" ? C.green : C.body,
        textDecorationLine: tone === "strike" ? "line-through" : "none" }}>{value}</Text>
    </View>
  );
}

export function FeeCard({ fee, amount }: { fee: any; amount: number }) {
  const hasDiscount = fee.discount_amount > 0;
  const pct = fee.discount_type === "percentage" && fee.discount_value > 0 ? ` (${Math.round(fee.discount_value)}% off)` : "";
  return (
    <Animated.View entering={enter(2)} testID="fee-summary-card"
      style={{ marginTop: 24, borderRadius: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, boxShadow: "0px 10px 30px rgba(13,71,161,0.08)", overflow: "hidden" }}>
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" }}>
            <Receipt size={20} color={C.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: "700", color: C.ink }}>Registration Fee</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, color: C.muted }}>One-Time Processing Fee</Text>
          </View>
          {hasDiscount ? (
            <View testID="fee-discount-badge" style={{ borderRadius: 999, backgroundColor: C.greenTint, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", color: C.green }}>Save {rupee(fee.discount_amount)}</Text>
            </View>
          ) : null}
        </View>

        <Text style={{ fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 20 }}>{hasDiscount ? "Final payable amount" : "Amount payable"}</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
          <Text testID="fee-amount" accessibilityLabel={`Payable amount ${amount} rupees`} adjustsFontSizeToFit numberOfLines={1}
            style={{ fontSize: 40, lineHeight: 48, fontWeight: "800", color: C.ink, letterSpacing: -1 }}>{rupee(amount)}</Text>
          {hasDiscount ? (
            <Text testID="fee-original-strike" style={{ fontSize: 16, lineHeight: 24, marginBottom: 6, color: C.faint, textDecorationLine: "line-through" }}>{rupee(fee.original_price)}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
          <Chip icon={ShieldCheck} label="One-time payment" testID="fee-chip-onetime" />
          <Chip icon={CalendarX} label="No monthly charges" testID="fee-chip-nomonthly" />
        </View>
      </View>

      {hasDiscount ? (
        <View testID="fee-breakdown" style={{ backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 20, paddingVertical: 12 }}>
          <Row label="Original price" value={rupee(fee.original_price)} testID="fee-row-original" />
          <Row label={`Discount${pct}`} value={`− ${rupee(fee.discount_amount)}`} tone="green" testID="fee-row-discount" />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: C.ink }}>Total payable</Text>
            <Text testID="fee-row-final" style={{ fontSize: 15, lineHeight: 20, fontWeight: "800", color: C.ink }}>{rupee(amount)}</Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

export function FeeIncluded({ items }: { items: [any, string, string][] }) {
  return (
    <Animated.View entering={enter(3)} style={{ marginTop: 32 }} testID="fee-included">
      <Text accessibilityRole="header" style={{ fontSize: 18, lineHeight: 24, fontWeight: "700", color: C.ink }}>What&rsquo;s included</Text>
      <Text style={{ fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 4 }}>Your fee covers partner registration and onboarding.</Text>
      <View style={{ marginTop: 16, borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", paddingHorizontal: 16 }}>
        {items.map(([Icon, t, d], i) => (
          <View key={t} testID={`fee-included-item-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
            borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <View style={{ height: 40, width: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: C.tint }}>
              <Icon size={18} color={C.blue} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: C.ink }}>{t}</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: C.muted, marginTop: 1 }}>{d}</Text>
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

export function FeeNotice() {
  return (
    <Animated.View entering={enter(4)} testID="fee-onetime-notice"
      style={{ marginTop: 16, borderRadius: 6, padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }}>
      <View style={{ height: 32, width: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: C.tint }}>
        <Info size={16} color={C.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: C.ink }}>This is a one-time processing fee</Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: C.muted, marginTop: 2 }}>There are no monthly registration charges or hidden fees.</Text>
      </View>
    </Animated.View>
  );
}

const RAW = /error|exception|traceback|undefined|null|\{|\}|status code|http|stack|timeout|network/i;
export const friendlyError = (m: string) =>
  m && m.length <= 140 && !RAW.test(m) ? m : "We couldn't complete your payment. Please check your connection and try again.";

export function FeeError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} testID="fee-pay-error" accessibilityRole="alert"
      style={{ marginTop: 16, borderRadius: 6, backgroundColor: C.redTint, borderWidth: 1, borderColor: C.redLine, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ height: 32, width: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
          <TriangleAlert size={16} color={C.red} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: C.red }}>Payment not completed</Text>
          <Text testID="fee-pay-error-text" style={{ fontSize: 13, lineHeight: 18, color: "#7A271A", marginTop: 2 }}>{friendlyError(message)}</Text>
        </View>
      </View>
      <Pressable testID="fee-retry-btn" onPress={onRetry} disabled={busy} accessibilityRole="button" accessibilityLabel="Retry payment"
        style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: 12, marginLeft: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 6,
          backgroundColor: "#fff", borderWidth: 1, borderColor: C.redLine, opacity: busy ? 0.6 : pressed ? 0.8 : 1 })}>
        <RotateCcw size={14} color={C.red} />
        <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "600", color: C.red }}>Try again</Text>
      </Pressable>
    </Animated.View>
  );
}

export function PayBar({ amount, busy, retry, onPay, payMethods, bottomInset, onLayout }: {
  amount: number; busy: boolean; retry: boolean; onPay: () => void; payMethods: any; bottomInset: number; onLayout: (h: number) => void;
}) {
  const label = retry ? `Retry Payment · ${rupee(amount)}` : `Pay ${rupee(amount)} & Continue`;
  return (
    <View onLayout={(e) => onLayout(e.nativeEvent.layout.height)} testID="fee-pay-bar"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(bottomInset, 12) + 4,
        backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: C.line, boxShadow: "0px -6px 20px rgba(11,27,51,0.06)" }}>
      <Pressable testID="fee-pay-btn" onPress={onPay} disabled={busy} accessibilityRole="button" accessibilityLabel={busy ? "Processing payment" : label}
        accessibilityState={{ disabled: busy, busy }}
        style={({ pressed }) => ({ height: 56, borderRadius: 6, backgroundColor: busy ? C.blueDeep : C.blue, alignItems: "center", justifyContent: "center",
          flexDirection: "row", gap: 8, opacity: busy ? 0.85 : 1, transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
          boxShadow: busy ? "none" : "0px 8px 18px rgba(13,71,161,0.28)" })}>
        {busy ? (
          <>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={{ color: "#fff", fontSize: 16, lineHeight: 20, fontWeight: "600" }}>Processing…</Text>
          </>
        ) : (
          <>
            <Text testID="fee-pay-btn-label" style={{ color: "#fff", fontSize: 16, lineHeight: 20, fontWeight: "700" }}>{label}</Text>
            <ArrowRight size={18} color="#fff" strokeWidth={2.4} />
          </>
        )}
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }} testID="fee-secure-note">
        <Lock size={12} color={C.muted} />
        <Text style={{ fontSize: 11, lineHeight: 16, color: C.muted, fontWeight: "500" }}>Secure Payment · 100% Safe &amp; Secure</Text>
      </View>
      <Image source={payMethods} style={{ width: "72%", height: 20, alignSelf: "center", marginTop: 8, opacity: 0.9 }} contentFit="contain" testID="fee-pay-methods"
        accessibilityLabel="Supported payment methods" />
    </View>
  );
}

export function FeeOverlay({ mode }: { mode: "processing" | "success" }) {
  const ok = mode === "success";
  return (
    <Animated.View entering={FadeIn.duration(180)} testID={ok ? "fee-success-overlay" : "fee-processing-overlay"} accessibilityLiveRegion="polite"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      <Animated.View entering={ZoomIn.duration(260)} style={{ height: 72, width: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: ok ? C.greenTint : C.tint }}>
        {ok ? <CircleCheck size={36} color={C.green} /> : <ActivityIndicator size="large" color={C.blue} />}
      </Animated.View>
      <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: "700", color: C.ink, marginTop: 20, textAlign: "center" }}>
        {ok ? "Payment successful" : "Processing payment…"}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: C.muted, marginTop: 6, textAlign: "center" }}>
        {ok ? "Continuing your registration…" : "Please do not close the app or press back."}
      </Text>
    </Animated.View>
  );
}
