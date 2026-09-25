/** Port of NotificationBell from web_panel/src/components/customer/CustomerShell.jsx (mobile popover). */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, CheckCheck } from "lucide-react-native";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { timeAgo } from "@/src/lib/format";
import { useTheme, SLATE, ROSE, PRIMARY } from "@/src/theme";

export function NotificationBell({ testID = "m-notif-btn" }: { testID?: string }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState("");
  useEffect(() => { storage.getItem("azo_notif_seen").then((v) => setSeen(v || "")); }, []);
  const load = useCallback(() => { api.get("/notifications").then((r) => setItems(r || [])).catch(() => {}); }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const unread = items.filter((n) => !seen || (n.created_at || "") > seen).length;
  const markAll = () => { const now = new Date().toISOString(); storage.setItem("azo_notif_seen", now); setSeen(now); };

  return (
    <>
      <Pressable testID={testID} onPress={() => { setOpen(true); load(); }}
        style={({ pressed }) => ({ position: "relative", width: 40, height: 40, borderRadius: 12, backgroundColor: pressed ? (isDark ? SLATE[700] : SLATE[200]) : c.surfaceAlt, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Bell size={20} color={isDark ? SLATE[300] : SLATE[600]} />
        {unread > 0 ? (
          <View testID="notif-unread-badge" style={{ position: "absolute", top: -4, right: -4, height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: ROSE[500], alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.35)" }} onPress={() => setOpen(false)} />
        <View testID="notif-panel" style={{ position: "absolute", left: 0, right: 0, top: insets.top + 56, backgroundColor: c.surface, borderBottomWidth: 1, borderColor: c.border, boxShadow: "0px 25px 50px -12px rgba(0,0,0,0.25)", maxHeight: 440 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
            <Text style={{ fontWeight: "700", fontSize: 16, color: c.text }}>Notifications</Text>
            {unread > 0 ? (
              <Pressable testID="notif-mark-all" onPress={markAll} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <CheckCheck size={14} color={PRIMARY[600]} /><Text style={{ fontSize: 12, fontWeight: "600", color: PRIMARY[600] }}>Mark all read</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {items.length === 0 ? <Text style={{ paddingHorizontal: 16, paddingVertical: 40, textAlign: "center", fontSize: 14, color: c.textFaint }}>You are all caught up.</Text> : null}
            {items.map((n, i) => {
              const isNew = !seen || (n.created_at || "") > seen;
              return (
                <View key={n.id || i} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? "rgba(30,41,59,0.6)" : SLATE[50], backgroundColor: isNew ? (isDark ? "rgba(7,52,115,0.10)" : "rgba(235,243,254,0.40)") : "transparent" }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    {isNew ? <View style={{ marginTop: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY[500] }} /> : null}
                    <View style={{ flex: 1, paddingLeft: isNew ? 0 : 16 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: isDark ? SLATE[100] : SLATE[800] }}>{n.title}</Text>
                      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{n.body || n.message}</Text>
                      <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>{timeAgo(n.created_at)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
