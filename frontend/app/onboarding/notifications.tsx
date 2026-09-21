import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, AppState, ScrollView, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useTheme, spacing, radius, fontSize, palette } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import {
  PermKey, PermState, allPermissionStates, requestNotificationPermission,
  requestLocationPermission, requestBatteryExemption, openFullScreenIntentSettings,
  fullScreenState, markPrompted,
} from "@/src/lib/notifications";

type Card = {
  key: PermKey;
  icon: MdiName;
  title: string;
  sub: string;
  tint: string;       // accent colour for the icon tile
  critical?: boolean; // notifications are required for the ring
};

const CARDS: Card[] = [
  { key: "notifications", icon: "bell-ring", title: "Job Ring Alerts", sub: "Ring loudly for every new job — even when the app is closed", tint: "#F59E0B", critical: true },
  { key: "fullscreen", icon: "cellphone-message", title: "Full-Screen Call Alert", sub: "Show a call-style screen when your phone is locked", tint: "#22C55E" },
  { key: "battery", icon: "battery-heart-variant", title: "Run in Background", sub: "Keep ringing reliably without being stopped to save battery", tint: "#38BDF8" },
  { key: "location", icon: "map-marker-radius", title: "Location", sub: "See each job's distance & travel time on the ring", tint: "#A78BFA" },
];

/** Pulsing concentric rings behind the hero icon (call-app vibe). */
function HeroRings({ color }: { color: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: 2200, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    const anims = [mk(a, 0), mk(b, 1100)];
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [a, b]);
  const ring = (v: Animated.Value, size: number) => (
    <Animated.View
      style={{
        position: "absolute", width: size, height: size, borderRadius: size / 2,
        borderWidth: 2, borderColor: color,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] }) }],
        opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
      }}
    />
  );
  return <>{ring(a, 150)}{ring(b, 150)}</>;
}

export default function PermissionsOnboarding() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const P = palette(colors.primary);
  const router = useRouter();
  const toast = useToast();
  const [states, setStates] = useState<Record<PermKey, PermState> | null>(null);
  const [busy, setBusy] = useState<PermKey | "all" | null>(null);

  const load = useCallback(async () => { setStates(await allPermissionStates()); }, []);

  useEffect(() => { load(); }, [load]);
  // Re-read statuses whenever we return from a system settings screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") load(); });
    return () => sub.remove();
  }, [load]);

  const finish = useCallback(async () => { await markPrompted(); router.replace("/(auth)/login"); }, [router]);

  const runOne = useCallback(async (key: PermKey): Promise<PermState | null> => {
    try {
      if (key === "notifications") {
        const r = await requestNotificationPermission();
        if (!r.granted && !r.canAskAgain) { try { await Linking.openSettings(); } catch { /* ignore */ } }
        return { key, granted: r.granted, canAskAgain: r.canAskAgain, available: true };
      }
      if (key === "location") return await requestLocationPermission();
      if (key === "battery") { await requestBatteryExemption(); return null; }
      if (key === "fullscreen") { await openFullScreenIntentSettings(); return null; }
    } catch { /* ignore */ }
    return null;
  }, []);

  const handleCard = useCallback(async (key: PermKey) => {
    setBusy(key);
    await runOne(key);
    await load();
    setBusy(null);
  }, [runOne, load]);

  const handleAll = useCallback(async () => {
    setBusy("all");
    // 1) Fast in-app permission DIALOGS first (one tap each) — reflect immediately.
    await runOne("notifications");
    setStates(await allPermissionStates());
    await runOne("location");
    setStates(await allPermissionStates());
    // 2) Battery — direct one-tap "run in background" system dialog (Android).
    if (Platform.OS === "android") {
      await requestBatteryExemption();
      setStates(await allPermissionStates());
      // 3) Full-screen intent — only Android 14+ needs the settings toggle; open
      //    it just once and only when it isn't already satisfied.
      const fs = await fullScreenState();
      if (fs.available && !fs.granted) await openFullScreenIntentSettings();
    }
    const next = await allPermissionStates();
    setStates(next);
    setBusy(null);
    toast[next.notifications.granted ? "success" : "info"](
      next.notifications.granted ? "You're all set — job alerts are on" : "Enable Job Ring alerts to never miss a job",
    );
  }, [runOne, toast]);

  const notifGranted = states?.notifications.granted ?? false;
  const readyCount = states ? CARDS.filter((c) => states[c.key]?.granted).length : 0;
  const availableCards = states ? CARDS.filter((c) => states[c.key]?.available) : [];
  const allGranted = states ? availableCards.length > 0 && availableCards.every((c) => states[c.key]?.granted) : false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient
          colors={[P[600], P[800]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + 36, paddingBottom: 40, alignItems: "center", borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          <View style={{ width: 108, height: 108, alignItems: "center", justifyContent: "center", marginBottom: spacing.md }}>
            <HeroRings color="rgba(255,255,255,0.5)" />
            <View style={{ width: 92, height: 92, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" }}>
              <Icon name="phone-ring" size={46} color="#fff" />
            </View>
          </View>
          <Text style={{ color: "#fff", fontSize: fontSize.xxl, fontWeight: "900", letterSpacing: 0.2 }}>Never miss a job</Text>
          <Text style={{ color: "rgba(255,255,255,0.86)", fontSize: fontSize.sm, marginTop: 8, textAlign: "center", paddingHorizontal: 36, lineHeight: 21 }}>
            New jobs ring like an incoming call. Turn these on so you get every job — even when your phone is locked or the app is closed.
          </Text>
          {states ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 }}>
              <Icon name="check-decagram" size={15} color="#fff" />
              <Text style={{ color: "#fff", fontSize: fontSize.xs, fontWeight: "800" }}>{readyCount}/{CARDS.length} ready</Text>
            </View>
          ) : null}
        </LinearGradient>

        {/* Permission cards */}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {CARDS.map((c, i) => {
            const st = states?.[c.key];
            const granted = st?.granted ?? false;
            const unavailable = st ? !st.available : false;
            return (
              <PermCard
                key={c.key}
                card={c}
                colors={colors}
                index={i}
                granted={granted}
                unavailable={unavailable}
                busy={busy === c.key || busy === "all"}
                onPress={() => handleCard(c.key)}
              />
            );
          })}

          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4, marginTop: 4 }}>
            <Icon name="shield-lock-outline" size={16} color={colors.textMuted} />
            <Text style={{ flex: 1, color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 18 }}>
              We only use these to deliver your job alerts on time. You can change them anytime in your phone's Settings.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky action bar */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
        <Pressable
          testID="enable-all-permissions-button"
          onPress={allGranted ? finish : handleAll}
          disabled={busy === "all"}
          style={({ pressed }) => ({
            backgroundColor: allGranted ? "#22C55E" : colors.primary, borderRadius: radius.lg, paddingVertical: 16,
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
            opacity: busy === "all" ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <Icon name={allGranted ? "check-bold" : "bell-ring"} size={20} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: fontSize.md }}>
            {busy === "all" ? "Setting up…" : allGranted ? "Continue" : "Allow all permissions"}
          </Text>
        </Pressable>
        {!allGranted ? (
          <Pressable onPress={finish} style={{ alignItems: "center", paddingVertical: 10 }} testID="skip-notifications-button">
            <Text style={{ color: notifGranted ? colors.primary : colors.textMuted, fontWeight: "800", fontSize: fontSize.sm }}>
              {notifGranted ? "Continue" : "Maybe later"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PermCard({
  card, colors, index, granted, unavailable, busy, onPress,
}: {
  card: Card; colors: any; index: number; granted: boolean; unavailable: boolean; busy: boolean; onPress: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 420, delay: 120 + index * 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter, index]);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: granted ? "rgba(34,197,94,0.45)" : colors.border,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: card.tint + "22", alignItems: "center", justifyContent: "center" }}>
        <Icon name={card.icon} size={24} color={card.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>{card.title}</Text>
          {card.critical ? (
            <View style={{ backgroundColor: "#F59E0B22", paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 }}>
              <Text style={{ color: "#B45309", fontSize: 10, fontWeight: "900" }}>REQUIRED</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 3, lineHeight: 17 }}>{card.sub}</Text>
      </View>

      {granted ? (
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" }} testID={`perm-${card.key}-granted`}>
          <Icon name="check-bold" size={19} color="#fff" />
        </View>
      ) : unavailable ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.background }}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700" }}>Build only</Text>
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          disabled={busy}
          testID={`perm-${card.key}-allow`}
          style={({ pressed }) => ({
            paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
            backgroundColor: colors.primary, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: fontSize.xs }}>Allow</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
