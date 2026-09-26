/** Google/YouTube-style full-screen voice search overlay — pulsing mic + live transcript. */
import React, { useEffect, useRef } from "react";
import { Modal, View, Text, Pressable, Animated, Easing } from "react-native";
import { Mic, X } from "lucide-react-native";
import { PRIMARY, ROSE } from "../../theme";

export function VoiceSearchOverlay({ visible, heard, error, onCancel }: { visible: boolean; heard: string; error?: string; onCancel: () => void }) {
  const r0 = useRef(new Animated.Value(0)).current;
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const rings = [r0, r1, r2];
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }).start();
    const loops = rings.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 550),
        Animated.timing(v, { toValue: 1, duration: 1900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]))
    );
    loops.forEach((l) => l.start());
    return () => { loops.forEach((l) => l.stop()); rings.forEach((v) => v.setValue(0)); pop.setValue(0); };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const isErr = !!error;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable testID="voice-overlay" onPress={onCancel} style={{ flex: 1, backgroundColor: "rgba(9,13,24,0.86)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Pressable testID="voice-close" onPress={onCancel} style={{ position: "absolute", top: 56, right: 24, height: 44, width: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
          <X size={22} color="#fff" />
        </Pressable>

        {/* Live transcript / status */}
        <View style={{ minHeight: 96, justifyContent: "flex-end", marginBottom: 56 }}>
          <Text testID="voice-transcript" style={{ color: isErr ? "#FDA4AF" : heard ? "#fff" : "rgba(255,255,255,0.55)", fontSize: heard ? 27 : 21, fontWeight: "800", textAlign: "center", lineHeight: heard ? 35 : 28, letterSpacing: -0.3 }}>
            {isErr ? error : heard ? heard : "Listening…"}
          </Text>
          {!heard && !isErr ? <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, textAlign: "center", marginTop: 12 }}>Speak now — e.g. “AC repair”, “Cleaning”</Text> : null}
        </View>

        {/* Pulsing mic */}
        <Animated.View style={{ height: 200, width: 200, alignItems: "center", justifyContent: "center", transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: pop }}>
          {!isErr ? rings.map((v, i) => (
            <Animated.View key={i} style={{ position: "absolute", height: 130, width: 130, borderRadius: 65, backgroundColor: PRIMARY[500], opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }} />
          )) : null}
          <View style={{ height: 104, width: 104, borderRadius: 52, backgroundColor: isErr ? ROSE[600] : PRIMARY[600], alignItems: "center", justifyContent: "center", boxShadow: `0px 14px 44px ${isErr ? "rgba(225,29,72,0.55)" : "rgba(13,71,161,0.6)"}` } as any}>
            <Mic size={42} color="#fff" />
          </View>
        </Animated.View>

        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 44, fontWeight: "500" }}>Tap anywhere to cancel</Text>
      </Pressable>
    </Modal>
  );
}
