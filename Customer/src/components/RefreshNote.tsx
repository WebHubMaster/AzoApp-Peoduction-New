import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, RefreshControl as RNRefreshControl, RefreshControlProps, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2 } from "lucide-react-native";

const subs = new Set<() => void>();

let tickPlayer: any = null;
/** Soft tick + light haptic when a refresh finishes (respects the phone's silent mode on iOS). */
function playRefreshFeedback() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  if (Platform.OS === "web") return;
  try {
    const AA = require("expo-audio");
    if (!tickPlayer) { tickPlayer = AA.createAudioPlayer(require("../../assets/sounds/refresh-tick.wav")); try { tickPlayer.volume = 0.35; } catch { /* ignore */ } }
    tickPlayer.seekTo?.(0); tickPlayer.play();
  } catch { /* ignore */ }
}
/** Show the floating "Updated just now" note. */
export const notifyRefreshed = () => subs.forEach((f) => f());

/** Drop-in RefreshControl: after a user pull finishes, shows the "Updated just now" note. */
export function RefreshControl(props: RefreshControlProps) {
  const { refreshing, onRefresh } = props;
  const pulled = useRef(false);
  const sawSpin = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = () => { if (!pulled.current) return; pulled.current = false; sawSpin.current = false; if (timer.current) clearTimeout(timer.current); notifyRefreshed(); };
  useEffect(() => {
    if (!pulled.current) return;
    if (refreshing) { sawSpin.current = true; if (timer.current) clearTimeout(timer.current); }
    else if (sawSpin.current) done();
  }, [refreshing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const handle = () => {
    pulled.current = true; sawSpin.current = false;
    // Screens that never flip `refreshing` still get the note once the request settles.
    timer.current = setTimeout(() => { if (!sawSpin.current) done(); }, 1200);
    const r: any = onRefresh?.();
    if (r && typeof r.then === "function") r.finally(() => { if (!sawSpin.current) done(); });
  };
  return <RNRefreshControl {...props} onRefresh={handle} />;
}

/** Mount once near the app root. */
export function RefreshNoteHost() {
  const insets = useSafeAreaInsets();
  const [show, setShow] = useState(false);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const fn = () => {
      playRefreshFeedback();
      setShow(true); clearTimeout(t);
      Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
      t = setTimeout(() => Animated.timing(a, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setShow(false)), 1800);
    };
    subs.add(fn);
    return () => { subs.delete(fn); clearTimeout(t); };
  }, [a]);
  if (!show) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: insets.top + 64, left: 0, right: 0, alignItems: "center", zIndex: 9999, elevation: 30 }}>
      <Animated.View testID="refresh-updated-note" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(15,23,42,0.92)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
        <CheckCircle2 size={15} color="#34D399" strokeWidth={2.4} />
        <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "700" }}>Updated just now</Text>
      </Animated.View>
    </View>
  );
}
