/** First-booking alert walkthrough. Android only, shown once after the first booking.
 *  AUTO permissions (system dialog: notifications, battery) are requested silently — no step shown.
 *  Only FORCE permissions (need a settings screen: full-screen, overlay, OEM autostart) are walked through. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Modal, AppState, Platform, Linking, ScrollView } from "react-native";
import { MonitorSmartphone, Layers, Rocket, Check, ShieldCheck, ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, PRIMARY } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import {
  PermKey, PermState, allAlertStates, oemLabel,
  requestNotificationPermission, getPermissionStatus, openFullScreenIntentSettings,
  requestOverlayPermission, requestBatteryExemption, requestOemSettings,
} from "@/src/lib/notifications";

const DONE_KEY = "azo_alert_walkthrough_done";
const AUTO_KEYS: PermKey[] = ["notifications", "battery"];

type Step = { key: PermKey; icon: any; title: string; why: string; tint: string };
const STEPS: Step[] = [
  { key: "fullscreen", icon: MonitorSmartphone, title: "Allow full-screen alerts", why: "Shows a call-style screen over your lock screen when a partner confirms or wants to reschedule.", tint: "#22C55E" },
  { key: "overlay", icon: Layers, title: "Display over other apps", why: "Lets the alert pop up over whatever you're doing, even when the phone is unlocked.", tint: "#A855F7" },
  { key: "oem", icon: Rocket, title: "Autostart & pop-ups", why: "", tint: "#EF4444" },
];

async function runRequest(key: PermKey) {
  if (key === "notifications") {
    const cur = await getPermissionStatus();
    if (!cur.granted && cur.canAskAgain === false) { try { await Linking.openSettings(); } catch { /* ignore */ } return; }
    const r = await requestNotificationPermission();
    if (!r.granted && !r.canAskAgain) { try { await Linking.openSettings(); } catch { /* ignore */ } }
  } else if (key === "fullscreen") await openFullScreenIntentSettings();
  else if (key === "overlay") await requestOverlayPermission();
  else if (key === "battery") await requestBatteryExemption();
  else if (key === "oem") await requestOemSettings();
}

export function AlertPermissionWalkthrough({ bookingCount }: { bookingCount: number }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<Record<PermKey, PermState> | null>(null);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [todo, setTodo] = useState<PermKey[]>([]);

  const load = useCallback(async () => setStates(await allAlertStates()), []);

  // Decide whether to show: Android, has booked at least once, not completed before,
  // and at least one applicable permission still missing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== "android" || bookingCount <= 0) return;
      if ((await storage.getItem(DONE_KEY)) === "1") return;
      let s = await allAlertStates();
      // AUTO: fire the system dialogs directly, one after another.
      for (const k of AUTO_KEYS) {
        if (cancelled) return;
        const st = s[k];
        if (st?.available === false || st?.granted || (k === "notifications" && st?.canAskAgain === false)) continue;
        try { await runRequest(k); } catch { /* ignore */ }
      }
      s = await allAlertStates();
      if (cancelled) return;
      const missing = STEPS.some((st) => s[st.key]?.available && !s[st.key]?.granted);
      if (!missing) { try { await storage.setItem(DONE_KEY, "1"); } catch { /* ignore */ } return; }
      setTodo(STEPS.filter((st) => s[st.key]?.available && !s[st.key]?.granted).map((st) => st.key));
      setStates(s); setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [bookingCount]);

  // Re-check when the user returns from a system settings screen.
  useEffect(() => {
    if (!open) return undefined;
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") load(); });
    return () => sub.remove();
  }, [open, load]);

  // Only the FORCE steps that were missing when the walkthrough opened (snapshot so progress stays stable).
  const steps = useMemo(() => STEPS.filter((st) => todo.includes(st.key)), [todo]);
  const finish = useCallback(async () => { try { await storage.setItem(DONE_KEY, "1"); } catch { /* ignore */ } setOpen(false); }, []);

  if (!open || !states || steps.length === 0) return null;
  const safeIdx = Math.min(idx, steps.length - 1);
  const step = steps[safeIdx];
  const st = states[step.key];
  const granted = !!st?.granted;
  const permanentlyDenied = !!st && !granted && st.canAskAgain === false;
  const Ic = step.icon;
  const isLast = safeIdx >= steps.length - 1;
  const why = step.key === "oem" ? `On ${oemLabel()}, turn on Autostart and "show pop-up / display on lock screen" in the phone's security app so the alert isn't downgraded to a silent notification.` : step.why;

  const allow = async () => { setBusy(true); try { await runRequest(step.key); } catch { /* ignore */ } await load(); setBusy(false); };
  const next = () => { if (isLast) finish(); else setIdx(safeIdx + 1); };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={finish}>
      <View style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.6)", justifyContent: "flex-end" }}>
        <View testID="alert-walkthrough" style={{ backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 20 + Math.max(insets.bottom, 16), gap: 16 }}>
          {/* header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={18} color={c.primaryText} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: c.textMuted }}>Set up booking alerts</Text>
            <Text testID="alert-walkthrough-progress" style={{ fontSize: 12.5, fontWeight: "800", color: c.textMuted }}>{safeIdx + 1} / {steps.length}</Text>
          </View>
          {/* progress bar */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {steps.map((s, i) => (
              <View key={s.key} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= safeIdx ? PRIMARY[600] : (isDark ? "rgba(148,163,184,0.25)" : "#E2E8F0") }} />
            ))}
          </View>

          {/* body */}
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 6 }}>
            <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: step.tint + "22", alignItems: "center", justifyContent: "center" }}>
              {granted ? <Check size={30} color="#16A34A" /> : <Ic size={30} color={step.tint} />}
            </View>
            <Text style={{ fontSize: 18, fontWeight: "900", color: c.text, textAlign: "center" }}>{step.title}</Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: c.textMuted, textAlign: "center", paddingHorizontal: 6 }}>{why}</Text>
            {granted ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Check size={15} color="#16A34A" /><Text testID={`walkthrough-granted-${step.key}`} style={{ color: "#16A34A", fontSize: 13, fontWeight: "800" }}>Allowed</Text>
              </View>
            ) : null}
          </View>

          {/* actions */}
          {granted ? (
            <Pressable testID="alert-walkthrough-next" onPress={next} style={({ pressed }) => ({ height: 50, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{isLast ? "Done — I'm all set" : "Next"}</Text>
              {isLast ? null : <ChevronRight size={18} color="#fff" />}
            </Pressable>
          ) : (
            <View style={{ gap: 10 }}>
              <Pressable testID={`alert-walkthrough-allow-${step.key}`} onPress={allow} disabled={busy} style={({ pressed }) => ({ height: 50, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{permanentlyDenied ? "Open Settings" : "Allow"}</Text>
              </Pressable>
              <Pressable testID="alert-walkthrough-skip" onPress={next} style={{ height: 40, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: c.textMuted, fontWeight: "700", fontSize: 13.5 }}>{isLast ? "Finish" : "Skip for now"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
