import React from "react";
import { View, Text, Modal, Pressable, Animated, Easing, Dimensions, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/src/components/Icon";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useToast } from "@/src/components/Toast";
import { fmt } from "@/src/lib/format";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CONFETTI_COLORS = ["#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#A855F7", "#FACC15", "#34D399"];
const PIECES = 46;

type Unlock = { name?: string; amount?: number };

/** One falling + spinning confetti ribbon. One-shot burst (no loop). */
function Confetti({ run }: { run: number }) {
  const pieces = React.useMemo(
    () =>
      Array.from({ length: PIECES }).map((_, i) => ({
        id: i,
        left: Math.random() * SCREEN_W,
        delay: Math.random() * 500,
        duration: 2200 + Math.random() * 1400,
        drift: (Math.random() - 0.5) * 160,
        size: 7 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rounded: Math.random() > 0.5,
      })),
    [run],
  );
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map((p) => (
        <Piece key={`${run}-${p.id}`} {...p} />
      ))}
    </View>
  );
}

function Piece({ left, delay, duration, drift, size, color, rounded }: any) {
  const t = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(t, { toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true }).start();
  }, [t, duration, delay]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-40, SCREEN_H + 40] });
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${drift > 0 ? 720 : -720}deg`] });
  const opacity = t.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View
      style={{
        position: "absolute",
        left,
        width: size,
        height: size * 1.6,
        backgroundColor: color,
        borderRadius: rounded ? size : 2,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

/**
 * Global milestone celebration. Listens for the backend `challenge_unlocked` realtime
 * event (emitted the instant a challenge bonus hits the wallet) and fires a confetti
 * burst + a congratulations card + a wallet-credit toast. Mounted once, app-wide, so it
 * plays no matter which screen the partner is on.
 */
export default function ChallengeCelebration() {
  const { subscribe } = useRealtime();
  const toast = useToast();
  const qc = useQueryClient();
  const [unlock, setUnlock] = React.useState<Unlock | null>(null);
  const [run, setRun] = React.useState(0);
  const scale = React.useRef(new Animated.Value(0)).current;
  const glow = React.useRef(new Animated.Value(0)).current;
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = React.useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(scale, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setUnlock(null));
  }, [scale]);

  React.useEffect(() => {
    const off = subscribe((ev) => {
      if (ev?.type !== "challenge_unlocked") return;
      const d = (ev.data || {}) as Unlock;
      // Refresh the rewards + wallet surfaces so numbers are up to date behind the overlay.
      qc.invalidateQueries({ queryKey: ["partner-challenges"] });
      qc.invalidateQueries({ queryKey: ["partner-bonuses"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["partner-wallet"] });
      // Wallet-credit toast (always, even if the overlay is skipped on web).
      toast.success(`🎉 ${d.name || "Challenge"} unlocked! ${fmt(d.amount)} added to your wallet`);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setUnlock(d);
      setRun((r) => r + 1);
    });
    return off;
  }, [subscribe, qc, toast]);

  React.useEffect(() => {
    if (!unlock) return;
    scale.setValue(0);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    hideTimer.current = setTimeout(dismiss, 4200);
    return () => {
      loop.stop();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [unlock]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!unlock) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <Pressable
        testID="challenge-celebration"
        onPress={dismiss}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(2,6,23,0.74)" }}
      >
        <Confetti run={run} />
        <Animated.View
          style={{
            width: Math.min(340, SCREEN_W - 48),
            borderRadius: 24,
            overflow: "hidden",
            transform: [{ scale }],
            boxShadow: "0px 20px 50px rgba(0,0,0,0.45)",
            elevation: 24,
          }}
        >
          <LinearGradient colors={["#065F46", "#10B981", "#34D399"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 26, alignItems: "center" }}>
            <Animated.View
              style={{
                width: 92,
                height: 92,
                borderRadius: 46,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.18)",
                opacity: glow,
                marginBottom: 14,
              }}
            >
              <Icon name="trophy" size={52} color="#FDE68A" />
            </Animated.View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="party-popper" size={18} color="#FDE68A" />
              <Text style={{ color: "#ECFDF5", fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
                Challenge Unlocked
              </Text>
              <Icon name="party-popper" size={18} color="#FDE68A" />
            </View>
            <Text testID="celebration-name" style={{ color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center", marginTop: 8 }}>
              {unlock.name || "Reward unlocked!"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
                backgroundColor: "rgba(255,255,255,0.16)",
                borderRadius: 999,
                paddingHorizontal: 18,
                paddingVertical: 10,
              }}
            >
              <Icon name="wallet" size={20} color="#fff" />
              <Text testID="celebration-amount" style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>
                +{fmt(unlock.amount)}
              </Text>
            </View>
            <Text style={{ color: "#D1FAE5", fontSize: 14, marginTop: 12, textAlign: "center" }}>
              Added straight to your wallet 🚀
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 16 }}>Tap anywhere to continue</Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
