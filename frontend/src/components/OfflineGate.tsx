/**
 * Full-screen "No Internet Connection" gate. Renders on top of EVERYTHING the
 * moment the app can't reach the backend, and blocks all interaction until the
 * connection is back (auto-recovers, or via "Try Again"). No "offline" escape —
 * the app does nothing useful without a connection.
 */
import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Icon } from "@/src/components/Icon";
import { useConnectivity } from "@/src/lib/connectivity";

const TIPS: { icon: any; label: string }[] = [
  { icon: "signal-cellular-3", label: "Check\nMobile Data" },
  { icon: "wifi", label: "Connect to\nWi-Fi" },
  { icon: "airplane", label: "Turn Off\nAirplane Mode" },
];

export function OfflineGate() {
  const { online, checking, retry } = useConnectivity();
  if (online) return null;

  return (
    <View
      testID="offline-gate"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(15,23,42,0.45)",
        alignItems: "center", justifyContent: "center", padding: 20,
        zIndex: 99999, elevation: 99999,
      }}
    >
      <View
        style={{
          width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 28,
          paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22, alignItems: "center",
          boxShadow: "0px 24px 60px rgba(2,6,23,0.35)",
        }}
      >
        {/* Icon */}
        <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "#FECACA", alignItems: "center", justifyContent: "center" }}>
            <Icon name="wifi-off" size={54} color="#EF4444" />
          </View>
        </View>

        <Text style={{ fontSize: 22, fontWeight: "800", color: "#0F172A", marginTop: 14, textAlign: "center" }}>
          No Internet Connection
        </Text>
        <Text style={{ fontSize: 14.5, lineHeight: 21, color: "#64748B", marginTop: 8, textAlign: "center" }}>
          It looks like you're not connected to the internet. Please check your connection and try again.
        </Text>

        {/* Tips */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 22, width: "100%" }}>
          {TIPS.map((t) => (
            <View key={t.label} style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 6, alignItems: "center", gap: 8 }}>
              <Icon name={t.icon} size={24} color="#2563EB" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155", textAlign: "center", lineHeight: 16 }}>{t.label}</Text>
            </View>
          ))}
        </View>

        {/* Try Again */}
        <Pressable
          testID="offline-try-again"
          onPress={() => retry()}
          disabled={checking}
          style={{
            marginTop: 20, width: "100%", height: 54, borderRadius: 14, backgroundColor: "#2563EB",
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: checking ? 0.75 : 1,
          }}
        >
          {checking ? <ActivityIndicator color="#fff" /> : <Icon name="refresh" size={20} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{checking ? "Checking…" : "Try Again"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default OfflineGate;
