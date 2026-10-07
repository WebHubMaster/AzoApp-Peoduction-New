/** Compact, one-tap permission nudge for the Customer home.
 *  Guides the customer to allow the two Android permissions that make a booking /
 *  reschedule alert pop up like a call on a LOCKED or in-use phone:
 *    • Full-Screen Alert (Android 14+ full-screen intent)
 *    • Display Over Other Apps (SYSTEM_ALERT_WINDOW)
 *  Shows only when at least one is still off; hides once both are allowed. Dismiss
 *  snoozes it for 3 days. Android only (iOS/web render nothing). */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import { BellRing, MonitorSmartphone, Layers, Check, X, ChevronRight } from "lucide-react-native";
import { useTheme, PRIMARY } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import {
  PermState, fullScreenState, overlayState,
  openFullScreenIntentSettings, requestOverlayPermission,
} from "@/src/lib/notifications";

const DISMISS_KEY = "azo_alert_nudge_dismissed_at";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // re-show after 3 days

export function AlertSetupNudge() {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const [fs, setFs] = useState<PermState | null>(null);
  const [ov, setOv] = useState<PermState | null>(null);
  const [snoozed, setSnoozed] = useState(true); // assume hidden until we've checked
  const [busy, setBusy] = useState<"fullscreen" | "overlay" | null>(null);

  const load = useCallback(async () => {
    const [f, o] = await Promise.all([fullScreenState(), overlayState()]);
    setFs(f); setOv(o);
    const at = Number((await storage.getItem(DISMISS_KEY)) || 0);
    setSnoozed(!!at && Date.now() - at < SNOOZE_MS);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") load(); });
    return () => sub.remove();
  }, [load]);

  if (Platform.OS !== "android") return null;
  if (!fs || !ov) return null;
  const fsOk = fs.granted || fs.available === false;
  const ovOk = ov.granted || ov.available === false;
  if (fsOk && ovOk) return null;          // everything the ring needs is allowed
  if (snoozed) return null;               // user dismissed recently

  const enable = async (which: "fullscreen" | "overlay") => {
    setBusy(which);
    try { which === "fullscreen" ? await openFullScreenIntentSettings() : await requestOverlayPermission(); }
    catch { /* ignore */ }
    await load();
    setBusy(null);
  };
  const dismiss = async () => { try { await storage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } setSnoozed(true); };

  const Chip = ({ which, icon: Ic, label, ok }: { which: "fullscreen" | "overlay"; icon: any; label: string; ok: boolean }) => (
    <Pressable
      testID={`alert-nudge-${which}`}
      disabled={ok || busy === which}
      onPress={() => enable(which)}
      style={({ pressed }) => ({
        flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6,
        borderWidth: 1, borderColor: ok ? "rgba(34,197,94,0.5)" : PRIMARY[600],
        backgroundColor: ok ? (isDark ? "rgba(22,163,74,0.15)" : "rgba(34,197,94,0.08)") : (pressed ? (isDark ? "rgba(13,71,161,0.25)" : PRIMARY[50]) : "transparent"),
        opacity: busy === which ? 0.6 : 1,
      })}
    >
      {ok ? <Check size={16} color="#16A34A" /> : <Ic size={16} color={c.primaryText} />}
      <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "800", color: ok ? "#16A34A" : c.text }} numberOfLines={1}>{label}</Text>
      {ok ? null : <Text style={{ fontSize: 11.5, fontWeight: "800", color: c.primaryText }}>Allow</Text>}
    </Pressable>
  );

  return (
    <View
      testID="alert-nudge"
      style={{
        borderRadius: 6, borderWidth: 1, borderColor: isDark ? "rgba(245,158,11,0.4)" : "#FCD34D",
        backgroundColor: isDark ? "rgba(120,53,15,0.18)" : "#FFFBEB", padding: 14, gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 6, backgroundColor: isDark ? "rgba(245,158,11,0.2)" : "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
          <BellRing size={20} color="#D97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: "900", color: c.text }}>Don&apos;t miss your booking alerts</Text>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: c.textMuted, marginTop: 2 }}>
            Allow these so partner updates ring like a call — even when your phone is locked or you&apos;re in another app.
          </Text>
        </View>
        <Pressable testID="alert-nudge-dismiss" onPress={dismiss} hitSlop={8} style={{ padding: 2 }}>
          <X size={18} color={c.textMuted} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip which="fullscreen" icon={MonitorSmartphone} label="Full-screen alert" ok={fsOk} />
        <Chip which="overlay" icon={Layers} label="Over other apps" ok={ovOk} />
      </View>

      <Pressable testID="alert-nudge-open" onPress={() => router.push("/(customer)/alerts" as any)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: c.primaryText }}>Open alert setup &amp; test the ring</Text>
        <ChevronRight size={15} color={c.primaryText} />
      </Pressable>
    </View>
  );
}
