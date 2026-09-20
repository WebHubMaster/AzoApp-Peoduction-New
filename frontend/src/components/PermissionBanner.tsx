import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, AppState } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, radius, spacing, fontSize } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { PermKey, PermState, allPermissionStates } from "@/src/lib/notifications";
import { storage } from "@/src/utils/storage";

const DISMISS_KEY = "azo_perm_warn_dismissed_at";
const RESHOW_MS = 12 * 60 * 60 * 1000; // re-show after 12h so partners don't forget

/**
 * Prominent, DISMISSIBLE warning shown on the partner dashboard when a critical
 * alert permission (notifications or run-in-background) is OFF. Clear English
 * message + one-tap "Turn On Alerts". Re-appears after 12h if still off.
 */
export function PermissionBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const [states, setStates] = useState<Record<PermKey, PermState> | null>(null);
  const [dismissed, setDismissed] = useState(true);

  const refresh = useCallback(async () => {
    setStates(await allPermissionStates());
    const at = Number((await storage.getItem(DISMISS_KEY)) || 0);
    setDismissed(!!at && Date.now() - at < RESHOW_MS);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);

  if (!states || dismissed) return null;
  const missing: string[] = [];
  if (states.notifications?.available && !states.notifications.granted) missing.push("Notifications");
  if (states.battery?.available && !states.battery.granted) missing.push("Run in background");
  if (!missing.length) return null;

  const dismiss = async () => { await storage.setItem(DISMISS_KEY, String(Date.now())); setDismissed(true); };

  return (
    <View testID="permission-banner" style={{ backgroundColor: "#FFF7ED", borderColor: "#FDBA74", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#FED7AA", alignItems: "center", justifyContent: "center" }}>
          <Icon name="bell-alert" size={22} color="#C2410C" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#9A3412", fontWeight: "900", fontSize: fontSize.sm }}>Turn on alerts to receive jobs</Text>
          <Text style={{ color: "#9A3412", fontSize: fontSize.xs, marginTop: 3, lineHeight: 18 }}>
            {missing.join(" and ")} {missing.length > 1 ? "are" : "is"} turned off. If you don&apos;t enable it, you will NOT be notified about new bookings once the app is closed or your screen is locked.
          </Text>
        </View>
        <Pressable testID="permission-banner-dismiss" onPress={dismiss} hitSlop={12} style={{ padding: 2 }}>
          <Icon name="close" size={18} color="#9A3412" />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          testID="permission-banner-fix"
          onPress={() => router.push("/partner/permissions")}
          style={({ pressed }) => ({ flex: 1, height: 42, borderRadius: 12, backgroundColor: "#EA580C", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.97 : 1 }] })}
        >
          <Icon name="bell-ring" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: fontSize.sm }}>Turn On Alerts</Text>
        </Pressable>
        <Pressable testID="permission-banner-later" onPress={dismiss} style={({ pressed }) => ({ paddingHorizontal: 16, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#FDBA74", alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Text style={{ color: "#9A3412", fontWeight: "800", fontSize: fontSize.sm }}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default PermissionBanner;
