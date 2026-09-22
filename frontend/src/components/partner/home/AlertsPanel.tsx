import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking, Platform, AppState } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/src/api/client";
import { useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { fmt } from "@/src/lib/format";
import { getPermissionStatus, requestNotificationPermission, registerPushToken, openFullScreenIntentSettings, fullScreenState, batteryState, requestBatteryExemption, overlayState, requestOverlayPermission } from "@/src/lib/notifications";
import { getMissed, removeMissed, onRing, setSnooze, clearSnooze, snoozeRemainingMs, syncPrefsFromServer, emitRing, loadLocal, MissedJob } from "@/src/lib/ringPrefs";
import { TW } from "./tw";

function Surface({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: any }) {
  const { colors } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, boxShadow: "0px 3px 12px rgba(47,43,61,0.1)" }, style]}>{children}</View>;
}

/* ------------------------------------------------------------ Alert check (TestRingCard) */
export function TestRingCard() {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<"granted" | "denied" | "prompt">("prompt");
  const [last, setLast] = useState<{ sentAt: number; push: any; doneAt: number | null; verb?: string } | null>(null);
  const devices = useQuery({ queryKey: ["my-devices"], queryFn: () => api.get<any>("/notifications/my-devices") });
  const registered = (devices.data?.count || 0) > 0;

  const checkPerm = useCallback(() => {
    getPermissionStatus().then((p) => setPerm(p.granted ? "granted" : p.canAskAgain ? "prompt" : "denied")).catch(() => setPerm("prompt"));
  }, []);
  const [extra, setExtra] = useState<{ fsi?: any; battery?: any; overlay?: any }>({});
  const loadExtra = useCallback(() => {
    if (Platform.OS !== "android") return;
    Promise.all([fullScreenState(), batteryState(), overlayState()]).then(([fsi, battery, overlay]) => setExtra({ fsi, battery, overlay })).catch(() => {});
  }, []);
  useEffect(() => { checkPerm(); loadExtra(); }, [checkPerm, loadExtra]);
  // Re-check when returning from a system settings screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { checkPerm(); loadExtra(); devices.refetch(); } });
    return () => sub.remove();
  }, [checkPerm, loadExtra]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onRing("test-ring-done", (d) => setLast((l) => (l ? { ...l, doneAt: Date.now(), verb: d?.verb } : l))), []);

  const fix = async () => {
    const res = await requestNotificationPermission();
    // Register THIS device's token right now (don't wait for a background/foreground
    // cycle) so "device registered" flips on immediately after the user allows.
    if (res.granted) { try { await registerPushToken(); } catch { /* reported to backend */ } }
    checkPerm(); devices.refetch();
    if (res.granted) toast.success(registered ? "Notifications enabled" : "Permission granted — background push activates on the installed app build");
    else if (!res.canAskAgain && Platform.OS !== "web") Linking.openSettings();
    else toast.info("Enable notifications to receive job rings");
  };

  const send = async () => {
    setBusy(true);
    try {
      const data = await api.post<any>("/partner/test-ring", {});
      const p = data.push || {};
      setLast({ sentAt: Date.now(), push: p, doneAt: null });
      if ((p.success || 0) > 0) toast.success("Test ring sent — screen ring + push notification on your device");
      else toast.info("Test ring sent to this screen" + (p.skipped === "no_devices" ? " · push skipped: device not registered" : p.error ? ` · push failed: ${p.error}` : ""));
    } catch (e: any) { toast.error(e?.detail || "Could not send test ring"); }
    finally { setBusy(false); }
  };

  // Lock-screen self-test: fire a REAL push after a short delay so the partner can
  // LOCK the phone / switch apps and see the true call-style full-screen ring (the
  // normal test can't show it because the app is in the foreground).
  const [lockCountdown, setLockCountdown] = useState<number | null>(null);
  const lockTest = async () => {
    if (!pushOk) { toast.error(perm === "denied" ? "Notifications are blocked — allow them first" : "Register this device first — tap Fix above"); return; }
    try {
      const r = await api.post<any>("/notifications/test-self", { kind: "ring", delay: 6 });
      if (r?.scheduled) {
        toast.success("Lock your phone or switch apps NOW — ring fires in 6s");
        let n = 6; setLockCountdown(n);
        const iv = setInterval(() => {
          n -= 1; setLockCountdown(n);
          if (n <= 0) { clearInterval(iv); setTimeout(() => setLockCountdown(null), 2500); }
        }, 1000);
      } else {
        toast.info(r?.message || "Could not schedule the lock-screen ring");
      }
    } catch (e: any) { toast.error(e?.detail || "Could not send lock-screen test"); }
  };

  const pushOk = perm === "granted" && registered;
  return (
    <Surface testID="test-ring-card">
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="bell-ring-outline" size={20} color={colors.primaryHover} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Alert check</Text>
          <Text style={{ color: TW.slate400, fontSize: 12, marginTop: 2 }}>Ring this phone like a real job to confirm sound, vibration & push.</Text>
          <View testID="test-ring-device-state" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <Icon name="cellphone" size={14} color={colors.textMuted} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: pushOk ? TW.emerald600 : perm === "denied" ? TW.red600 : TW.amber600 }}>
              {pushOk ? "Background push: ON (device registered)" : perm === "denied" ? "Background push: blocked on this device" : "Background push: OFF (device not registered)"}
            </Text>
            {!pushOk ? <Pressable testID="test-ring-fix" onPress={fix} hitSlop={6}><Text style={{ color: colors.primaryHover, fontSize: 11, fontWeight: "600", textDecorationLine: "underline" }}>Fix</Text></Pressable> : null}
          </View>
        </View>
      </View>
      {Platform.OS === "android" ? (
        <View testID="ring-permissions" style={{ marginTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>For the call-style ring on a locked / closed phone</Text>
          {/* Full-Screen intent — detection is unreliable on some OEMs, so ALWAYS offer the button */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={extra.fsi?.granted ? "check-circle" : "cellphone-message"} size={15} color={extra.fsi?.granted ? TW.emerald600 : TW.amber600} />
            <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: colors.textSecondary }}>Full-Screen Call Alert{extra.fsi?.granted ? " · allowed" : ""}</Text>
            <Pressable testID="alert-allow-fsi" onPress={() => openFullScreenIntentSettings().then(loadExtra)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: extra.fsi?.granted ? colors.surfaceSubtle : colors.primary }}>
              <Text style={{ color: extra.fsi?.granted ? colors.textSecondary : "#fff", fontSize: 11, fontWeight: "700" }}>{extra.fsi?.granted ? "Open" : "Allow"}</Text>
            </Pressable>
          </View>
          {/* Battery / background — reliably detectable via Notifee */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={extra.battery?.granted ? "check-circle" : "battery-heart-variant"} size={15} color={extra.battery?.granted ? TW.emerald600 : TW.amber600} />
            <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: colors.textSecondary }}>Run in Background{extra.battery?.granted ? " · allowed" : ""}</Text>
            {!extra.battery?.granted ? (
              <Pressable testID="alert-allow-battery" onPress={() => requestBatteryExemption().then(loadExtra)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.primary }}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Allow</Text>
              </Pressable>
            ) : null}
          </View>
          {/* Display over other apps — full-screen ring even when the phone is UNLOCKED */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={extra.overlay?.granted ? "check-circle" : "cellphone-arrow-down"} size={15} color={extra.overlay?.granted ? TW.emerald600 : TW.amber600} />
            <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: colors.textSecondary }}>Full-Screen on Unlocked{extra.overlay?.granted ? " · allowed" : ""}</Text>
            <Pressable testID="alert-allow-overlay" onPress={() => requestOverlayPermission().then(loadExtra)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: extra.overlay?.granted ? colors.surfaceSubtle : colors.primary }}>
              <Text style={{ color: extra.overlay?.granted ? colors.textSecondary : "#fff", fontSize: 11, fontWeight: "700" }}>{extra.overlay?.granted ? "Open" : "Allow"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable testID="test-ring-send" onPress={send} disabled={busy} style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="bell-ring-outline" size={16} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Send me a test job ring</Text>
        </Pressable>
        {Platform.OS !== "web" ? (
          <Pressable testID="test-lockscreen-ring" onPress={lockTest} disabled={lockCountdown !== null} style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: lockCountdown !== null ? 0.6 : 1 }}>
            <Icon name="cellphone-lock" size={16} color={colors.primaryHover} />
            <Text style={{ color: colors.primaryHover, fontSize: 14, fontWeight: "600" }}>{lockCountdown !== null ? `Lock now… ${Math.max(0, lockCountdown)}s` : "Test lock-screen ring"}</Text>
          </Pressable>
        ) : null}
      </View>
      {lockCountdown !== null ? (
        <View testID="lockscreen-ring-hint" style={{ marginTop: 8, borderRadius: 12, backgroundColor: colors.primarySubtle, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="cellphone-lock" size={18} color={colors.primaryHover} />
          <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
            {lockCountdown > 0 ? `Lock your phone or switch to another app now — the full-screen job ring will fire in ${lockCountdown}s.` : "Ring sent! You should see the full-screen call now. Not showing? Allow the permissions above and try again."}
          </Text>
        </View>
      ) : null}
      {last ? (
        <View testID="test-ring-result" style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.surfaceSubtle, padding: 12, gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Sent {new Date(last.sentAt).toLocaleTimeString()}</Text>
          <Text style={{ color: TW.emerald600, fontSize: 11 }}>Screen ring: delivered via live connection</Text>
          <Text style={{ color: (last.push?.success || 0) > 0 ? TW.emerald600 : TW.amber600, fontSize: 11 }}>
            Push: {(last.push?.success || 0) > 0 ? `sent to ${last.push.success} device(s)` : last.push?.skipped === "no_devices" ? "skipped — device not registered" : last.push?.skipped === "not_configured" ? "skipped — push not configured by admin" : last.push?.error ? `failed (${last.push.error})` : "not sent"}
          </Text>
          {last.doneAt ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="check-circle-outline" size={14} color={TW.emerald700} /><Text style={{ color: TW.emerald700, fontSize: 11, fontWeight: "600" }}>You {last.verb} it in {((last.doneAt - last.sentAt) / 1000).toFixed(1)}s</Text></View> : null}
        </View>
      ) : null}
      {devices.data?.ring_state ? (() => {
        const rs: any = devices.data.ring_state;
        return (
          <View testID="ring-diagnostic" style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: rs.ok ? TW.emerald200 : "#FECACA", backgroundColor: colors.surfaceSubtle, padding: 12, gap: 3 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>Last job ring on this phone</Text>
            <Text style={{ color: rs.ok ? TW.emerald600 : TW.red600, fontSize: 11, fontWeight: "600" }}>
              {rs.ctx === "bg" ? "App closed / locked" : "App open"}: {rs.ok ? (rs.mode === "fgs" ? "full ring shown ✓" : "ring shown (single sound) ✓") : "NOT shown ✗"}
            </Text>
            {rs.fsi === false ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ color: TW.amber600, fontSize: 11, flex: 1, minWidth: 160 }}>⚠ Full-screen permission is OFF — the call screen can't open on a locked phone.</Text>
                <Pressable testID="ring-fix-fsi" onPress={() => openFullScreenIntentSettings()} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.primary }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Allow full-screen</Text>
                </Pressable>
              </View>
            ) : null}
            {rs.error ? <Text style={{ color: TW.slate400, fontSize: 10 }} numberOfLines={2}>{String(rs.error)}</Text> : null}
            {rs.at ? <Text style={{ color: TW.slate400, fontSize: 10 }}>{new Date(rs.at).toLocaleString()}</Text> : null}
          </View>
        );
      })() : null}
    </Surface>
  );
}

/* ------------------------------------------------------------ Smart Snooze */
export function SnoozeCard() {
  const { colors, mode } = useTheme();
  const toast = useToast();
  const [ms, setMs] = useState(0);
  useEffect(() => {
    loadLocal().then(() => setMs(snoozeRemainingMs()));
    syncPrefsFromServer().then(() => setMs(snoozeRemainingMs()));
    const iv = setInterval(() => setMs(snoozeRemainingMs()), 1000);
    const off = onRing("prefs", () => setMs(snoozeRemainingMs()));
    return () => { clearInterval(iv); off(); };
  }, []);
  const countdown = (v: number) => { const s = Math.max(0, Math.ceil(v / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const start = (mins: number) => { setSnooze(mins); setMs(snoozeRemainingMs()); toast.success(`Snoozed for ${mins} min — non-emergency requests muted, streak safe`); };
  const stop = () => { clearSnooze(); setMs(0); toast.info("Back online — you'll ring for new job requests again"); };
  const on = ms > 0;
  const dark = mode === "dark";
  return (
    <Surface testID="snooze-card" style={on ? { borderColor: dark ? TW.amber700 : TW.amber300, backgroundColor: dark ? "rgba(120,53,15,0.2)" : TW.amber50 } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: on ? TW.amber500 : colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="coffee-outline" size={20} color={on ? "#fff" : TW.slate500} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{on ? "You're on a break" : "Smart Snooze"}</Text>
          {on ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="clock-outline" size={13} color={TW.amber700} />
              <Text style={{ color: dark ? TW.amber300 : TW.amber700, fontSize: 12 }}>Muted for <Text testID="snooze-countdown" style={{ fontWeight: "700" }}>{countdown(ms)}</Text> · streak safe</Text>
            </View>
          ) : <Text style={{ color: TW.slate400, fontSize: 12 }}>Mute new requests for a bit — your streak stays safe.</Text>}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        {on ? (
          <Pressable testID="snooze-resume" onPress={stop} style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: TW.emerald600, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Resume now</Text></Pressable>
        ) : (
          <>
            <Pressable testID="snooze-30" onPress={() => start(30)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Busy 30 min</Text></Pressable>
            <Pressable testID="snooze-60" onPress={() => start(60)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>1 hour</Text></Pressable>
          </>
        )}
      </View>
      {on ? <Text style={{ color: TW.amber600, fontSize: 11, marginTop: 8 }}>Emergency bookings will still ring through.</Text> : null}
    </Surface>
  );
}

/* ------------------------------------------------------------ Accept streak + weekly insights */
const streakBadge = (s: number) => {
  if (s >= 10) return { label: "Unstoppable", cls: [TW.fuchsia500, TW.pink500] as const };
  if (s >= 5) return { label: "On Fire", cls: [TW.orange500, TW.red500] as const };
  if (s >= 3) return { label: "Warming Up", cls: [TW.amber400, "#FB923C"] as const };
  return { label: "Start a streak", cls: [TW.slate400, TW.slate500] as const };
};

export function StreakCard({ stats }: { stats: any }) {
  const { colors, mode } = useTheme();
  if (!stats) return null;
  const badge = streakBadge(stats.accept_streak || 0);
  const tot = (stats.accepted_week || 0) + (stats.missed_week || 0);
  const pct = tot ? Math.round((stats.accepted_week / tot) * 100) : 0;
  const rw = stats.reward;
  const dark = mode === "dark";
  const lbl = { color: TW.slate400, fontSize: 11, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: 0.8 };
  return (
    <Surface testID="partner-streak-card" style={{ padding: 20 }}>
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <LinearGradient colors={badge.cls} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.15)" }}>
            <Icon name="fire" size={28} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={lbl}>Accept Streak</Text>
            <Text testID="streak-count" style={{ color: colors.text, fontSize: 24, fontWeight: "800", lineHeight: 26 }}>{stats.accept_streak || 0}</Text>
            <LinearGradient colors={badge.cls} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{badge.label}</Text>
            </LinearGradient>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: dark ? "rgba(120,53,15,0.3)" : TW.amber50, alignItems: "center", justifyContent: "center" }}><Icon name="medal-outline" size={20} color={TW.amber600} /></View>
          <View>
            <Text style={lbl}>Best Streak</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{stats.best_streak || 0}</Text>
          </View>
        </View>
      </View>
      <View style={{ marginTop: 16 }}>
        <Text style={[lbl, { marginBottom: 6 }]}>This week</Text>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceSubtle, overflow: "hidden", flexDirection: "row" }}>
          <View style={{ width: `${pct}%`, backgroundColor: TW.emerald500 }} />
          <View style={{ width: `${100 - pct}%`, backgroundColor: TW.amber400 }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text testID="week-accepted" style={{ color: TW.emerald600, fontSize: 12, fontWeight: "600" }}>✓ {stats.accepted_week || 0} accepted</Text>
          <Text testID="week-missed" style={{ color: TW.amber600, fontSize: 12, fontWeight: "600" }}>✗ {stats.missed_week || 0} missed</Text>
        </View>
      </View>
      {rw?.enabled ? (
        <View testID="reward-payout" style={{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: dark ? TW.emerald800 : TW.emerald200, backgroundColor: dark ? "rgba(6,78,59,0.25)" : "rgba(236,253,245,0.7)", padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
              <Icon name="gift-outline" size={16} color={dark ? TW.emerald200 : TW.emerald800} />
              <Text style={{ color: dark ? TW.emerald200 : TW.emerald800, fontSize: 13, fontWeight: "600", flexShrink: 1 }}>Streak reward · {fmt(rw.bonus)} every {rw.threshold} in a row</Text>
            </View>
            <View style={{ backgroundColor: dark ? "rgba(6,78,59,0.4)" : "rgba(255,255,255,0.7)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text testID="reward-earned" style={{ color: TW.emerald700, fontSize: 11, fontWeight: "700" }}>Earned {fmt(rw.total_earned || 0)}</Text>
            </View>
          </View>
          <View style={{ marginTop: 8, height: 8, borderRadius: 4, backgroundColor: dark ? "#022C22" : TW.emerald100, overflow: "hidden" }}>
            <View testID="reward-progress" style={{ width: `${rw.progress_pct || 0}%`, height: 8, backgroundColor: TW.emerald500 }} />
          </View>
          <Text style={{ color: dark ? TW.emerald300 : TW.emerald700, fontSize: 11, marginTop: 6, lineHeight: 16 }}>
            {rw.remaining > 0
              ? <>Accept <Text style={{ fontWeight: "700" }}>{rw.remaining}</Text> more in a row to earn <Text style={{ fontWeight: "700" }}>{fmt(rw.bonus)}</Text> — added straight to your withdrawable wallet.</>
              : <>Milestone reached! Keep the streak alive for the next {fmt(rw.bonus)}.</>}
          </Text>
        </View>
      ) : null}
    </Surface>
  );
}

/* ------------------------------------------------------------ Missed requests (device-local, re-grab re-opens the ring) */
export function MissedRequestsCard() {
  const { colors, mode } = useTheme();
  const toast = useToast();
  const [missed, setMissed] = useState<MissedJob[]>(getMissed());
  useEffect(() => { loadLocal().then(() => setMissed(getMissed())); return onRing("missed", (l) => setMissed(l || getMissed())); }, []);

  const regrab = async (job: MissedJob) => {
    try {
      const data = await api.get<any[]>("/bookings/partner/jobs");
      const raw = (data || []).find((j) => j.id === job.id);
      if (!raw) { toast.info("This request is no longer available"); removeMissed(job.id); return; }
      emitRing("open-ring", {
        id: raw.id, code: raw.code, service_name: raw.service_name, category_name: raw.category_name,
        service_image: raw.items?.[0]?.image || raw.image || "",
        city: raw.address?.city || "", address_line: raw.address?.line || "",
        schedule_type: raw.schedule_type || "", total: raw.pricing?.total ?? "",
      });
      removeMissed(job.id);
    } catch { toast.error("Could not re-open the request"); }
  };

  return (
    <Surface style={{ padding: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: mode === "dark" ? "rgba(120,53,15,0.3)" : TW.amber50, alignItems: "center", justifyContent: "center" }}><Icon name="history" size={20} color={TW.amber600} /></View>
          <View>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Missed Requests</Text>
            <Text style={{ color: TW.slate400, fontSize: 12 }}>Jobs you did not answer in time</Text>
          </View>
        </View>
        {missed.length > 0 ? (
          <Pressable testID="missed-clear" onPress={() => missed.forEach((m) => removeMissed(m.id))} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="trash-can-outline" size={14} color={TW.slate400} /><Text style={{ color: TW.slate400, fontSize: 12 }}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {missed.length === 0 ? (
        <Text style={{ textAlign: "center", color: TW.slate400, fontSize: 13, paddingVertical: 40 }}>No missed requests. Stay online to catch every job!</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {missed.map((m) => (
            <View key={m.id} testID={`missed-${m.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
              {m.service_image
                ? <Image source={{ uri: mediaUrl(m.service_image) }} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" />
                : <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="bell-outline" size={20} color={TW.slate400} /></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{m.service_name || "Service request"}</Text>
                  {m.schedule_type === "emergency" ? <Icon name="flash" size={14} color={TW.red500} /> : null}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="map-marker-outline" size={12} color={TW.slate400} />
                  <Text style={{ color: TW.slate400, fontSize: 11, flex: 1 }} numberOfLines={1}>{m.address_line || m.city || "—"}{m.total ? ` · ₹${m.total}` : ""}</Text>
                </View>
              </View>
              <Pressable testID={`regrab-${m.id}`} onPress={() => regrab(m)} style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: TW.emerald600, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="refresh" size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Re-grab</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Surface>
  );
}
