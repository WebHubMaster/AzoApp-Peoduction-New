import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, AppState } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, radius, spacing, fontSize } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { PermKey, PermState, allPermissionStates } from "@/src/lib/notifications";

/**
 * Dashboard banner shown when a CRITICAL alert permission is off (notifications
 * or battery/background). Tapping opens the Alerts & Permissions center so the
 * partner can re-enable it. Re-checks whenever the app returns to foreground.
 */
export function PermissionBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const [states, setStates] = useState<Record<PermKey, PermState> | null>(null);

  const load = useCallback(async () => { setStates(await allPermissionStates()); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") load(); });
    return () => sub.remove();
  }, [load]);

  if (!states) return null;
  const missing: string[] = [];
  if (states.notifications?.available && !states.notifications.granted) missing.push("Notifications");
  if (states.battery?.available && !states.battery.granted) missing.push("Run in background");
  if (!missing.length) return null;

  return (
    <Pressable
      testID="permission-banner"
      onPress={() => router.push("/partner/permissions")}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#F59E0B22", alignItems: "center", justifyContent: "center" }}>
        <Icon name="bell-alert" size={22} color="#B45309" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#92400E", fontWeight: "900", fontSize: fontSize.sm }}>Job alerts may not ring</Text>
        <Text style={{ color: "#92400E", fontSize: fontSize.xs, marginTop: 2 }}>{missing.join(" · ")} is off — tap to fix</Text>
      </View>
      <Icon name="chevron-right" size={22} color="#B45309" />
    </Pressable>
  );
}

export default PermissionBanner;
