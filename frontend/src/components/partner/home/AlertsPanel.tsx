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
import { getPermissionStatus, requestNotificationPermission, registerPushToken, openFullScreenIntentSettings, fullScreenState, batteryState, requestBatteryExemption, overlayState, requestOverlayPermission, oemState, requestOemSettings } from "@/src/lib/notifications";
import { getMissed, removeMissed, onRing, setSnooze, clearSnooze, snoozeRemainingMs, syncPrefsFromServer, emitRing, loadLocal, MissedJob } from "@/src/lib/ringPrefs";
import { TW } from "./tw";

function Surface({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: any }) {
  const { colors } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 16, boxShadow: "0px 3px 12px rgba(47,43,61,0.1)" }, style]}>{children}</View>;
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
  const [extra, setExtra] = useState<{ fsi?: any; battery?: any; overlay?: any; oem?: any }>({});
  const loadExtra = useCallback(() => {
    if (Platform.OS !== "android") return;
    Promise.all([fullScreenState(), batteryState(), overlayState(), oemState()]).then(([fsi, battery, overlay, oem]) => setExtra({ fsi, battery, overlay, oem })).catch(() => {});
  }, []);
  useEffect(() => { checkPerm(); loadExtra(); }, [checkPerm, loadExtra]);
  // Re-check when returning from a system settings screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") { checkPerm(); loadExtra(); devices.refetch(); } });
    return () => sub.remove();
  }, [checkPerm, loadExtra]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onRing("test-ring-done", (d) => setLast((l) => (l ? { ...l, doneAt: Date.now(), verb: d?.verb } : l))), []);

  const [fixing, setFixing] = useState(false);
  const fix = async () => {
    setFixing(true);
    try {
      const res = await requestNotificationPermission();
      if (!res.granted) {
        checkPerm();
        if (!res.canAskAgain && Platform.OS !== "web") { Linking.openSettings(); return; }
        toast.error("Allow notifications to receive job rings");
        return;
      }
      // Register THIS device's token right now and SHOW the real outcome (the old
      // code always showed "enabled" even when the native FCM token fetch failed).
      let reg: { ok: boolean; reason?: string } = { ok: false, reason: "no_module" };
      try { reg = await registerPushToken(); } catch (e: any) { reg = { ok: false, reason: String(e?.message || e) }; }
      checkPerm();
      await devices.refetch();
      if (reg.ok) {
        toast.success("Device registered — background push is ON");
      } else if (reg.reason === "fcm_registration_failed") {
        toast.error("This phone couldn't register for job alerts. Please try again later.");
      } else if (reg.reason === "play_services") {
        toast.error("Update Google Play services on this phone, then tap Fix again");
      } else if (reg.reason === "permission") {
        toast.error("Notifications are blocked — allow them in Settings");
      } else {
        toast.error("Could not turn on job alerts on this phone. Please try again.");
      }
    } finally { setFixing(false); }
  };

  const send = async () => {
    setBusy(true);
    try {
      const data = await api.post<any>("/partner/test-ring", {});
      const p = data.push || {};
      setLast({ sentAt: Date.now(), push: p, doneAt: null });
      if ((p.success || 0) > 0) toast.success("Test ring sent — screen ring + push notification on your device");
      else toast.info("Test ring shown on this screen");
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
  const rs: any = devices.data?.ring_state;
  const android = Platform.OS === "android";
  type Issue = { key: string; icon: any; text: string; action?: { label: string; onPress: () => void; busy?: boolean } };
  const issues: Issue[] = [];
  if (!pushOk) {
    issues.push({ key: "push", icon: "bell-off-outline",
      text: perm === "denied" ? "Notifications are blocked on this phone. Allow them to receive job alerts."
        : devices.data?.push_state?.reason || devices.data?.push_state?.error ? "This phone couldn't register for job alerts. Tap Fix to try again."
        : "Job alerts are not turned on for this phone yet.",
      action: { label: fixing ? "Fixing…" : "Fix", onPress: fix, busy: fixing } });
  }
  if (android && extra.fsi?.granted === false) issues.push({ key: "fsi", icon: "cellphone-message", text: "Allow full-screen call alerts so job rings open on a locked phone.", action: { label: "Allow", onPress: () => { openFullScreenIntentSettings().then(loadExtra); } } });
  if (android && extra.battery?.granted === false) issues.push({ key: "battery", icon: "battery-heart-variant", text: "Allow the app to run in the background so you never miss a job.", action: { label: "Allow", onPress: () => { requestBatteryExemption().then(loadExtra); } } });
  if (android && extra.overlay?.granted === false) issues.push({ key: "overlay", icon: "cellphone-arrow-down", text: "Allow display over other apps to see job rings while using your phone.", action: { label: "Allow", onPress: () => { requestOverlayPermission().then(loadExtra); } } });
  if (android && extra.oem?.available && !extra.oem?.granted) issues.push({ key: "oem", icon: "shield-alert-outline", text: "Turn on Autostart and pop-up windows for this app, otherwise you'll only get a silent notification.", action: { label: "Enable", onPress: () => { requestOemSettings().then(loadExtra); } } });
  if (rs && rs.ok === false) issues.push({ key: "ring", icon: "phone-alert-outline", text: "Your last job ring didn't show on screen. Check the permissions above, then send a test ring." });

  // Hidden while checking, and hidden completely when everything is already configured.
  const checking = devices.isLoading || (android && !extra.fsi && !extra.battery && !extra.overlay);
  if (checking || (issues.length === 0 && lockCountdown === null && !last)) return null;

  return (
    <Surface testID="test-ring-card" style={{ borderColor: "#FCD9A8" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: TW.amber50, alignItems: "center", justifyContent: "center" }}><Icon name="bell-alert-outline" size={20} color={TW.amber600} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Alert check</Text>
          <Text style={{ color: TW.slate400, fontSize: 12, marginTop: 1 }}>
            {issues.length ? `${issues.length} thing${issues.length > 1 ? "s" : ""} to fix so you never miss a job` : "All set — job alerts are working"}
          </Text>
        </View>
      </View>
      {issues.length ? (
        <View testID="alert-issues" style={{ marginTop: 12, gap: 8 }}>
          {issues.map((it) => (
            <View key={it.key} testID={`alert-issue-${it.key}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, padding: 10 }}>
              <Icon name={it.icon} size={16} color={TW.amber600} />
              <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary }}>{it.text}</Text>
              {it.action ? (
                <Pressable testID={`alert-fix-${it.key}`} onPress={it.action.onPress} disabled={it.action.busy} hitSlop={6}
                  style={{ paddingHorizontal: 12, height: 30, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: it.action.busy ? 0.6 : 1 }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{it.action.label}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable testID="test-ring-send" onPress={send} disabled={busy} style={{ height: 40, paddingHorizontal: 14, borderRadius: 6, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="bell-ring-outline" size={16} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Send test ring</Text>
        </Pressable>
        {Platform.OS !== "web" ? (
          <Pressable testID="test-lockscreen-ring" onPress={lockTest} disabled={lockCountdown !== null} style={{ height: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: lockCountdown !== null ? 0.6 : 1 }}>
            <Icon name="cellphone-lock" size={16} color={colors.primaryHover} />
            <Text style={{ color: colors.primaryHover, fontSize: 13, fontWeight: "600" }}>{lockCountdown !== null ? `Lock now… ${Math.max(0, lockCountdown)}s` : "Test lock-screen ring"}</Text>
          </Pressable>
        ) : null}
      </View>
      {lockCountdown !== null ? (
        <Text testID="lockscreen-ring-hint" style={{ marginTop: 8, color: colors.textSecondary, fontSize: 12 }}>
          {lockCountdown > 0 ? `Lock your phone now — the job ring will fire in ${lockCountdown}s.` : "Ring sent! You should see the full-screen call now."}
        </Text>
      ) : null}
      {last ? (
        <Text testID="test-ring-result" style={{ marginTop: 8, fontSize: 12, color: (last.push?.success || 0) > 0 ? TW.emerald600 : TW.amber600 }}>
          {(last.push?.success || 0) > 0 ? "Test ring sent to this phone." : "Test ring shown on screen, but background alerts are not working yet."}
          {last.doneAt ? ` You ${last.verb} it in ${((last.doneAt - last.sentAt) / 1000).toFixed(1)}s.` : ""}
        </Text>
      ) : null}
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
          <Pressable testID="snooze-resume" onPress={stop} style={{ height: 40, paddingHorizontal: 16, borderRadius: 6, backgroundColor: TW.emerald600, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Resume now</Text></Pressable>
        ) : (
          <>
            <Pressable testID="snooze-30" onPress={() => start(30)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 6, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Busy 30 min</Text></Pressable>
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
          <LinearGradient colors={badge.cls} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 56, height: 56, borderRadius: 10, alignItems: "center", justifyContent: "center", boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.15)" }}>
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
