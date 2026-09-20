import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, AppState, Platform, Linking, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import {
  PermKey, PermState, allPermissionStates, requestNotificationPermission,
  requestLocationPermission, requestBatteryExemption, openFullScreenIntentSettings,
} from "@/src/lib/notifications";
import { api } from "@/src/api/client";

type Card = {
  key: PermKey;
  icon: MdiName;
  title: string;
  why: string;
  affected: string;
  tint: string;
  critical?: boolean;
};

const CARDS: Card[] = [
  { key: "notifications", icon: "bell-ring", title: "Notifications", why: "Ring loudly for every new job and show booking, chat & reminder alerts — even when the app is closed.", affected: "Without this you will NOT get the Job Ring or any push alerts.", tint: "#F59E0B", critical: true },
  { key: "fullscreen", icon: "cellphone-message", title: "Full-Screen Call Alert", why: "Show a call-style screen over your lock screen when a new job arrives.", affected: "New jobs won't pop up like an incoming call on a locked phone.", tint: "#22C55E" },
  { key: "battery", icon: "battery-heart-variant", title: "Run in Background", why: "Keep the app allowed to ring even when the phone tries to sleep it to save battery.", affected: "The ring may not fire reliably when the app is closed for a while.", tint: "#38BDF8", critical: true },
  { key: "location", icon: "map-marker-radius", title: "Location", why: "Show each job's distance & travel time, and share your live location while online.", affected: "Distance/ETA and live tracking won't work.", tint: "#A78BFA" },
];

export default function PermissionCenter() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [states, setStates] = useState<Record<PermKey, PermState> | null>(null);
  const [busy, setBusy] = useState<PermKey | null>(null);
  const [diag, setDiag] = useState<{ registered: number; enabled: boolean } | null>(null);
  const [testing, setTesting] = useState<"ring" | "push" | null>(null);

  const load = useCallback(async () => { setStates(await allPermissionStates()); }, []);
  const loadDiag = useCallback(async () => {
    try {
      const [dev, cfg] = await Promise.all([
        api.get<any>("/notifications/my-devices").catch(() => ({ count: 0 })),
        api.get<any>("/notifications/push-config").catch(() => ({ enabled: false })),
      ]);
      setDiag({ registered: dev?.count || 0, enabled: !!cfg?.enabled });
    } catch { setDiag({ registered: 0, enabled: false }); }
  }, []);
  useEffect(() => { load(); loadDiag(); }, [load, loadDiag]);
  const sendTest = useCallback(async (kind: "ring" | "push") => {
    setTesting(kind);
    try {
      const r = await api.post<any>("/notifications/test-self", { kind });
      if (r?.ok) toast.success(r.message || "Sent — check your phone");
      else toast.error(r?.message || "Could not send test", { duration: 6000 });
    } catch (e: any) { toast.error(e?.detail || "Could not send test"); }
    setTesting(null);
    loadDiag();
  }, [toast, loadDiag]);
  useEffect(() => { load(); }, [load]);
  // Re-check the moment we come back from a system settings screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { load(); loadDiag(); } });
    return () => sub.remove();
  }, [load, loadDiag]);

  const handle = useCallback(async (c: Card) => {
    const st = states?.[c.key];
    setBusy(c.key);
    try {
      // Permanently denied (system dialog won't show again) → open App Settings.
      if (st && !st.granted && st.canAskAgain === false && (c.key === "notifications" || c.key === "location")) {
        try { await Linking.openSettings(); } catch { /* ignore */ }
        setBusy(null);
        return;
      }
      if (c.key === "notifications") {
        const r = await requestNotificationPermission();
        if (!r.granted && !r.canAskAgain) { try { await Linking.openSettings(); } catch { /* ignore */ } }
      } else if (c.key === "location") {
        const r = await requestLocationPermission();
        if (!r.granted && !r.canAskAgain) { try { await Linking.openSettings(); } catch { /* ignore */ } }
      } else if (c.key === "battery") {
        await requestBatteryExemption();
      } else if (c.key === "fullscreen") {
        await openFullScreenIntentSettings();
      }
    } catch { /* ignore */ }
    await load();
    setBusy(null);
  }, [states, load]);

  const readyCount = states ? CARDS.filter((c) => states[c.key]?.granted).length : 0;
  const criticalMissing = states ? CARDS.some((c) => c.critical && states[c.key]?.available && !states[c.key]?.granted) : false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable testID="perm-back" onPress={() => router.back()} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "900" }}>Alerts & Permissions</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{readyCount}/{CARDS.length} enabled</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }} showsVerticalScrollIndicator={false} testID="permission-center">
        {criticalMissing ? (
          <View style={{ flexDirection: "row", gap: 10, backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1, borderRadius: radius.lg, padding: spacing.md }}>
            <Icon name="alert" size={20} color="#B45309" />
            <Text style={{ flex: 1, color: "#92400E", fontSize: fontSize.xs, lineHeight: 18, fontWeight: "600" }}>
              A required permission is turned off. New jobs may not ring reliably until you allow it below.
            </Text>
          </View>
        ) : null}

        {CARDS.map((c) => {
          const st = states?.[c.key];
          const granted = st?.granted ?? false;
          const unavailable = st ? !st.available : false;
          const permanentlyDenied = !!st && !granted && st.canAskAgain === false;
          return (
            <View key={c.key} testID={`perm-card-${c.key}`} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: granted ? "rgba(34,197,94,0.45)" : c.critical ? "rgba(245,158,11,0.4)" : colors.border, padding: spacing.md, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.tint + "22", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={c.icon} size={24} color={c.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>{c.title}</Text>
                    {c.critical ? <View style={{ backgroundColor: "#F59E0B22", paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 }}><Text style={{ color: "#B45309", fontSize: 10, fontWeight: "900" }}>REQUIRED</Text></View> : null}
                  </View>
                  {granted ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                      <Icon name="check-circle" size={14} color="#16A34A" />
                      <Text testID={`perm-status-${c.key}`} style={{ color: "#16A34A", fontSize: fontSize.xs, fontWeight: "800" }}>Allowed</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                      <Icon name="alert-circle" size={14} color="#D97706" />
                      <Text testID={`perm-status-${c.key}`} style={{ color: "#D97706", fontSize: fontSize.xs, fontWeight: "800" }}>{unavailable ? "Available in the installed app" : "Not allowed"}</Text>
                    </View>
                  )}
                </View>
                {granted ? (
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" }} testID={`perm-${c.key}-granted`}>
                    <Icon name="check-bold" size={19} color="#fff" />
                  </View>
                ) : unavailable ? null : (
                  <Pressable
                    testID={`perm-${c.key}-allow`}
                    onPress={() => handle(c)}
                    disabled={busy === c.key}
                    style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.primary, opacity: busy === c.key ? 0.6 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: fontSize.xs }}>{permanentlyDenied ? "Open Settings" : "Allow"}</Text>
                  </Pressable>
                )}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 18 }}>{c.why}</Text>
              {!granted && !unavailable ? (
                <Text style={{ color: "#B45309", fontSize: fontSize.xs, lineHeight: 17 }}>{c.affected}</Text>
              ) : null}
            </View>
          );
        })}

        {/* ---------------- Push diagnostics (verify on THIS phone) ---------------- */}
        <View testID="push-diagnostics" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 12, marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="access-point-network" size={20} color={colors.primary} />
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: fontSize.md }}>Push & Ring Diagnostics</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={diag?.enabled ? "check-circle" : "alert-circle"} size={16} color={diag?.enabled ? "#16A34A" : "#D97706"} />
            <Text style={{ flex: 1, color: colors.textMuted, fontSize: fontSize.xs }}>Server push service: <Text style={{ fontWeight: "800", color: diag?.enabled ? "#16A34A" : "#D97706" }}>{diag?.enabled ? "Configured" : "Not configured (contact admin)"}</Text></Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={diag && diag.registered > 0 ? "check-circle" : "alert-circle"} size={16} color={diag && diag.registered > 0 ? "#16A34A" : "#D97706"} />
            <Text style={{ flex: 1, color: colors.textMuted, fontSize: fontSize.xs }}>This phone registered: <Text style={{ fontWeight: "800", color: diag && diag.registered > 0 ? "#16A34A" : "#D97706" }}>{diag && diag.registered > 0 ? `Yes (${diag.registered})` : "No — open the app after login & allow notifications"}</Text></Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 17 }}>Send a real test to this phone. For the ring test, lock your screen or minimise the app first, then tap — it should ring like a call.</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable testID="test-ring-btn" onPress={() => sendTest("ring")} disabled={!!testing} style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: testing ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              {testing === "ring" ? <ActivityIndicator size="small" color="#fff" /> : <><Icon name="phone-ring" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: fontSize.xs }}>Test Job Ring</Text></>}
            </Pressable>
            <Pressable testID="test-push-btn" onPress={() => sendTest("push")} disabled={!!testing} style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: testing ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              {testing === "push" ? <ActivityIndicator size="small" color={colors.primary} /> : <><Icon name="bell-outline" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800", fontSize: fontSize.xs }}>Test Notification</Text></>}
            </Pressable>
          </View>
        </View>

        {Platform.OS === "android" ? (
          <Pressable testID="open-app-settings" onPress={() => Linking.openSettings().catch(() => toast.info("Open your phone Settings → Apps → AzoApp Partner"))} style={{ marginTop: 4, alignItems: "center", paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ color: colors.primary, fontWeight: "800", fontSize: fontSize.sm }}>Open App Settings</Text>
          </Pressable>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4, marginTop: 4 }}>
          <Icon name="shield-lock-outline" size={16} color={colors.textMuted} />
          <Text style={{ flex: 1, color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 18 }}>
            The app can never turn these on by itself — Android controls them. Tap Allow and confirm in the system dialog; if it doesn't appear, use Open Settings.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
