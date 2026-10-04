/** Notifications — full page (opened from the header bell). Lists the customer's
 *  notifications with a per-item clear (X) and a "Clear all" action. Opening the
 *  page marks everything as read (clears the bell's unread badge). Mirrors the
 *  Partner app's notifications screen. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { Bell, Trash2, X } from "lucide-react-native";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { timeAgo } from "@/src/lib/format";
import { useTheme, PRIMARY, ROSE } from "@/src/theme";
import { EmptyState } from "@/src/components/customer/ux";
import { useToast } from "@/src/components/Toast";

export default function NotificationsScreen() {
  const { c, isDark } = useTheme();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.get<any[]>("/notifications"); setItems(Array.isArray(r) ? r : []); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  // Open = read: clear the unread badge by remembering "seen now".
  useEffect(() => {
    load();
    storage.setItem("azo_notif_seen", new Date().toISOString()).catch(() => {});
  }, [load]);

  const removeOne = async (id: string) => {
    if (!id) return;
    const prev = items;
    setItems((list) => list.filter((n) => n.id !== id));
    try { await api.del(`/notifications/${id}`); }
    catch { setItems(prev); toast.error("Could not remove notification"); }
  };

  const clearAll = () => {
    if (!items.length || busy) return;
    Alert.alert("Clear all notifications?", "This removes every notification from your list. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all", style: "destructive",
        onPress: async () => {
          const prev = items; setBusy(true); setItems([]);
          try { await api.del("/notifications"); toast.success("All notifications cleared"); }
          catch { setItems(prev); toast.error("Could not clear notifications"); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <View testID="notifications-page" style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>Notifications</Text>
        {items.length > 0 ? (
          <Pressable testID="notif-clear-all" onPress={clearAll} disabled={busy}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 6, backgroundColor: isDark ? "rgba(136,19,55,0.20)" : ROSE[50], opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Trash2 size={15} color={ROSE[600]} />
            <Text style={{ color: ROSE[600], fontSize: 12.5, fontWeight: "700" }}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}><ActivityIndicator color={PRIMARY[600]} /></View>
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" desc="Booking updates, offers and reminders will show up here." testID="notif-empty" />
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((n, i) => (
            <View key={n.id || i} testID={`notif-item-${n.id || i}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <Bell size={20} color={c.primaryText} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{n.title}</Text>
                <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2, lineHeight: 18 }}>{n.body || n.message}</Text>
                <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>{timeAgo(n.created_at)}</Text>
              </View>
              <Pressable testID={`notif-remove-${n.id || i}`} onPress={() => removeOne(n.id)} hitSlop={8}
                style={({ pressed }) => ({ height: 28, width: 28, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.surfaceAlt : "transparent" })}>
                <X size={16} color={c.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
