/** Header bell — shows the unread count and opens the full Notifications page.
 *  Tapping marks everything as read (clears the badge). Replaces the old popover. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { useTheme, SLATE, ROSE, TC } from "@/src/theme";

export function NotificationBell({ testID = "m-notif-btn" }: { testID?: string }) {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [seen, setSeen] = useState("");
  useEffect(() => { storage.getItem("azo_notif_seen").then((v) => setSeen(v || "")); }, []);
  const load = useCallback(() => { api.get("/notifications").then((r) => setItems(r || [])).catch(() => {}); }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const unread = items.filter((n) => !seen || (n.created_at || "") > seen).length;

  const open = () => {
    // Tapping the bell marks all as read, then opens the dedicated page.
    const now = new Date().toISOString();
    storage.setItem("azo_notif_seen", now).catch(() => {});
    setSeen(now);
    router.push("/(customer)/notifications" as any);
  };

  return (
    <Pressable testID={testID} onPress={open}
      style={({ pressed }) => ({ position: "relative", width: 40, height: 40, borderRadius: 6, backgroundColor: pressed ? (isDark ? SLATE[700] : SLATE[200]) : c.surfaceAlt, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Bell size={20} color={isDark ? SLATE[300] : TC.textMuted} />
      {unread > 0 ? (
        <View testID="notif-unread-badge" style={{ position: "absolute", top: -4, right: -4, height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 6, backgroundColor: ROSE[500], alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
