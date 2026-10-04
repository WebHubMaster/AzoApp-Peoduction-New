/** Alert Health Check — verify the customer's phone can receive the call-style
 *  booking / reschedule alerts even when the app is closed or locked. Mirrors the
 *  Partner app's permission center, trimmed to the 3 that matter for the customer:
 *  notification permission, full-screen intent, battery-optimisation exemption. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, AppState, Platform, Linking, ActivityIndicator } from "react-native";
import { BellRing, MonitorSmartphone, BatteryCharging, Radio, CheckCircle2, AlertCircle, Check, ShieldCheck, Bell } from "lucide-react-native";
import { useToast } from "../../src/components/Toast";
import { api } from "../../src/api/client";
import { PRIMARY, useTheme } from "../../src/theme";
import {
  PermKey, PermState, allAlertStates, requestNotificationPermission,
  openFullScreenIntentSettings, requestBatteryExemption, getPermissionStatus,
} from "../../src/lib/notifications";

type Card = { key: PermKey; icon: any; title: string; why: string; affected: string; tint: string; critical?: boolean };

const CARDS: Card[] = [
  { key: "notifications", icon: BellRing, title: "Notifications", why: "Ring loudly and show booking, reschedule & chat alerts — even when the app is closed.", affected: "Without this you will NOT get any alert about your bookings.", tint: "#F59E0B", critical: true },
  { key: "fullscreen", icon: MonitorSmartphone, title: "Full-Screen Alert", why: "Show a call-style screen over your lock screen when a partner confirms or wants to reschedule.", affected: "Alerts won't pop up like an incoming call on a locked phone.", tint: "#22C55E" },
  { key: "battery", icon: BatteryCharging, title: "Run in Background", why: "Keep the app allowed to ring even when the phone tries to sleep it to save battery.", affected: "The ring may not fire reliably when the app is closed for a while.", tint: "#38BDF8", critical: true },
];

export default function AlertHealthCheck() {
  const { c, isDark } = useTheme();
  const toast = useToast();
  const [states, setStates] = useState<Record<PermKey, PermState> | null>(null);
  const [busy, setBusy] = useState<PermKey | null>(null);
  const [diag, setDiag] = useState<{ registered: number; enabled: boolean } | null>(null);
  const [testing, setTesting] = useState<"ring" | "push" | null>(null);

  const load = useCallback(async () => { setStates(await allAlertStates()); }, []);
  const loadDiag = useCallback(async () => {
    try {
      const [dev, cfg]: any[] = await Promise.all([
        api.get<any>("/notifications/my-devices").catch(() => ({ count: 0 })),
        api.get<any>("/notifications/push-config").catch(() => ({ enabled: false })),
      ]);
      setDiag({ registered: dev?.count || 0, enabled: !!cfg?.enabled });
    } catch { setDiag({ registered: 0, enabled: false }); }
  }, []);
  useEffect(() => { load(); loadDiag(); }, [load, loadDiag]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { load(); loadDiag(); } });
    return () => sub.remove();
  }, [load, loadDiag]);

  const sendTest = useCallback(async (kind: "ring" | "push") => {
    setTesting(kind);
    try {
      const r: any = await api.post<any>("/notifications/test-self", { kind });
      if (r?.ok) toast.success(r.message || "Sent — check your phone");
      else toast.error(r?.message || "Could not send test");
    } catch (e: any) { toast.error(e?.detail || e?.message || "Could not send test"); }
    setTesting(null);
    loadDiag();
  }, [toast, loadDiag]);

  const handle = useCallback(async (card: Card) => {
    const st = states?.[card.key];
    setBusy(card.key);
    try {
      if (card.key === "notifications") {
        const cur = await getPermissionStatus();
        if (!cur.granted && cur.canAskAgain === false) { try { await Linking.openSettings(); } catch { /* ignore */ } }
        else {
          const r = await requestNotificationPermission();
          if (!r.granted && !r.canAskAgain) { try { await Linking.openSettings(); } catch { /* ignore */ } }
        }
      } else if (card.key === "fullscreen") {
        await openFullScreenIntentSettings();
      } else if (card.key === "battery") {
        await requestBatteryExemption();
      }
    } catch { /* ignore */ }
    await load();
    setBusy(null);
    void st;
  }, [states, load]);

  const shown = CARDS.filter((card) => states?.[card.key]?.available !== false);
  const readyCount = states ? shown.filter((card) => states[card.key]?.granted).length : 0;
  const criticalMissing = states ? shown.some((card) => card.critical && states[card.key]?.available && !states[card.key]?.granted) : false;

  return (
    <View testID="alert-health-check" style={{ gap: 16 }}>
      {criticalMissing ? (
        <View testID="alert-warning" style={{ flexDirection: "row", gap: 10, backgroundColor: isDark ? "rgba(120,53,15,0.25)" : "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1, borderRadius: 10, padding: 14 }}>
          <AlertCircle size={20} color="#B45309" />
          <Text style={{ flex: 1, color: isDark ? "#FDE68A" : "#92400E", fontSize: 12.5, lineHeight: 18, fontWeight: "600" }}>
            A required permission is off. Your booking alerts may not ring reliably until you allow it below.
          </Text>
        </View>
      ) : null}

      {shown.map((card) => {
        const st = states?.[card.key];
        const granted = st?.granted ?? false;
        const permanentlyDenied = !!st && !granted && st.canAskAgain === false;
        const Ic = card.icon;
        return (
          <View key={card.key} testID={`alert-card-${card.key}`} style={{ backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: granted ? "rgba(34,197,94,0.45)" : card.critical ? "rgba(245,158,11,0.4)" : c.border, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: card.tint + "22", alignItems: "center", justifyContent: "center" }}>
                <Ic size={24} color={card.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{card.title}</Text>
                  {card.critical ? <View style={{ backgroundColor: "#F59E0B22", paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 }}><Text style={{ color: "#B45309", fontSize: 10, fontWeight: "900" }}>REQUIRED</Text></View> : null}
                </View>
                {granted ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                    <CheckCircle2 size={14} color="#16A34A" />
                    <Text testID={`alert-status-${card.key}`} style={{ color: "#16A34A", fontSize: 12.5, fontWeight: "800" }}>Allowed</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                    <AlertCircle size={14} color="#D97706" />
                    <Text testID={`alert-status-${card.key}`} style={{ color: "#D97706", fontSize: 12.5, fontWeight: "800" }}>Not allowed</Text>
                  </View>
                )}
              </View>
              {granted ? (
                <View testID={`alert-${card.key}-granted`} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" }}>
                  <Check size={19} color="#fff" />
                </View>
              ) : (
                <Pressable
                  testID={`alert-${card.key}-allow`}
                  onPress={() => handle(card)}
                  disabled={busy === card.key}
                  style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: PRIMARY[700], opacity: busy === card.key ? 0.6 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12.5 }}>{permanentlyDenied ? "Open Settings" : "Allow"}</Text>
                </Pressable>
              )}
            </View>
            <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18 }}>{card.why}</Text>
            {!granted ? <Text style={{ color: "#B45309", fontSize: 12.5, lineHeight: 17 }}>{card.affected}</Text> : null}
          </View>
        );
      })}

      {/* Push & ring diagnostics + real self-test */}
      <View testID="alert-diagnostics" style={{ backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 14, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Radio size={20} color={c.primaryText} />
          <Text style={{ color: c.text, fontWeight: "900", fontSize: 15 }}>Push & Ring Diagnostics</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {diag?.enabled ? <CheckCircle2 size={16} color="#16A34A" /> : <AlertCircle size={16} color="#D97706" />}
          <Text style={{ flex: 1, color: c.textMuted, fontSize: 12.5 }}>Server push service: <Text style={{ fontWeight: "800", color: diag?.enabled ? "#16A34A" : "#D97706" }}>{diag?.enabled ? "Configured" : "Not configured (contact support)"}</Text></Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {diag && diag.registered > 0 ? <CheckCircle2 size={16} color="#16A34A" /> : <AlertCircle size={16} color="#D97706" />}
          <Text style={{ flex: 1, color: c.textMuted, fontSize: 12.5 }}>This phone registered: <Text style={{ fontWeight: "800", color: diag && diag.registered > 0 ? "#16A34A" : "#D97706" }}>{diag && diag.registered > 0 ? `Yes (${diag.registered})` : "No — open the app after login & allow notifications"}</Text></Text>
        </View>
        <Text style={{ color: c.textMuted, fontSize: 11.5, lineHeight: 17 }}>Send a real test to this phone. For the alert test, lock your screen or minimise the app first, then tap — it should ring like a call.</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable testID="alert-test-ring" onPress={() => sendTest("ring")} disabled={!!testing} style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: testing ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            {testing === "ring" ? <ActivityIndicator size="small" color="#fff" /> : <><BellRing size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 12.5 }}>Test Alert Ring</Text></>}
          </Pressable>
          <Pressable testID="alert-test-push" onPress={() => sendTest("push")} disabled={!!testing} style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: testing ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            {testing === "push" ? <ActivityIndicator size="small" color={c.primaryText} /> : <><Bell size={16} color={c.primaryText} /><Text style={{ color: c.primaryText, fontWeight: "800", fontSize: 12.5 }}>Test Notification</Text></>}
          </Pressable>
        </View>
      </View>

      {Platform.OS === "android" ? (
        <Pressable testID="alert-open-settings" onPress={() => Linking.openSettings().catch(() => toast.info("Open your phone Settings → Apps → AzoApp"))} style={{ alignItems: "center", paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.primaryText, fontWeight: "800", fontSize: 14 }}>Open App Settings</Text>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 }}>
        <ShieldCheck size={16} color={c.textMuted} />
        <Text style={{ flex: 1, color: c.textMuted, fontSize: 12.5, lineHeight: 18 }}>
          The app can never turn these on by itself — Android controls them. Tap Allow and confirm in the system dialog; if it doesn&apos;t appear, use Open Settings.
        </Text>
      </View>
    </View>
  );
}
