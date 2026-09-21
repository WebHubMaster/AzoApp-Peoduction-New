import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, Animated, Easing, Vibration, Platform, ScrollView, ActivityIndicator, AppState } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle } from "react-native-svg";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, palette } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useToast } from "@/src/components/Toast";
import { Icon } from "@/src/components/Icon";
import { cancelJobRing, onForegroundPush } from "@/src/lib/notifications";
import { emitRing, getRingPrefs, isDndActive, isSnoozed, loadLocal, onRing, syncPrefsFromServer } from "@/src/lib/ringPrefs";
import { TW } from "@/src/components/partner/home/tw";

/* 1:1 port of web components/partner/IncomingJobRing.jsx.
   Requests NEVER auto-decline — the ring stays until Accept / Reject or another partner grabs it. */
type RingJob = any;
const inr = (v: any) => Number(v || 0).toLocaleString("en-IN");

function Glass({ children, style, testID }: { children: React.ReactNode; style?: any; testID?: string }) {
  return <View testID={testID} style={[{ borderRadius: 16, backgroundColor: "rgba(255,255,255,0.10)", paddingHorizontal: 16, paddingVertical: 12 }, style]}>{children}</View>;
}

function useLoop(toValue: number, duration: number, easing = Easing.linear) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(v, { toValue, duration, easing, useNativeDriver: Platform.OS !== "web" }));
    anim.start();
    return () => anim.stop();
  }, [v, toValue, duration, easing]);
  return v;
}

/* service image with ping + spinning waiting arc + elapsed pill (web: animate-ping / animate-spin 3s) */
function RingAvatar({ image, elapsed }: { image?: string; elapsed: number }) {
  const spin = useLoop(1, 3000);
  const ping = useLoop(1, 1400, Easing.out(Easing.ease));
  const R = 74, C = 2 * Math.PI * R;
  const uri = mediaUrl(image);
  return (
    <View style={{ width: 160, height: 160, alignItems: "center", justifyContent: "center", marginVertical: 16 }}>
      <Animated.View style={{ position: "absolute", width: 128, height: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.10)", transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }], opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }) }} />
      <Animated.View testID="ring-countdown" style={{ position: "absolute", width: 160, height: 160, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
        <Svg width={160} height={160} viewBox="0 0 160 160">
          <Circle cx={80} cy={80} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={5} />
          <Circle cx={80} cy={80} r={R} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${C * 0.28} ${C}`} transform="rotate(-90 80 80)" />
        </Svg>
      </Animated.View>
      {uri ? (
        <Image source={{ uri }} style={{ width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: "rgba(255,255,255,0.3)" }} contentFit="cover" />
      ) : (
        <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 4, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" }}>
          <Icon name="briefcase-outline" size={44} color="#fff" />
        </View>
      )}
      <View style={{ position: "absolute", bottom: -4, borderRadius: 999, backgroundColor: "rgba(15,23,42,0.7)", paddingHorizontal: 10, paddingVertical: 2 }}>
        <Text testID="ring-seconds" style={{ color: "#fff", fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}</Text>
      </View>
    </View>
  );
}

function Pill({ children, bg, color = "#fff", testID }: { children: React.ReactNode; bg: string; color?: string; testID?: string }) {
  return <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 4 }}><Text style={{ color, fontSize: 11, fontWeight: "700" }}>{children}</Text></View>;
}

export function JobRingOverlay() {
  const { colors } = useTheme();
  const P = palette(colors.primary);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { subscribe, playRing, stopRing } = useRealtime();
  const [queue, setQueue] = useState<RingJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const handledRef = useRef(new Set<string>());
  const ringingRef = useRef(false);
  const bounce = useLoop(1, 1000, Easing.inOut(Easing.ease));

  const current: RingJob | null = queue[0] || null;
  const silent = current ? isDndActive() && current.schedule_type !== "emergency" : false;

  const refetch = () => ["partner-jobs", "partner-active", "partner-dashboard", "partner-missed"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  // Best-effort partner location (web: navigator.geolocation once) for distance / ETA.
  useEffect(() => {
    if (!current || myPos) return;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      } catch { /* unavailable */ }
    })();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const distanceKm = (() => {
    if (!current || !myPos || current.lat == null || current.lng == null) return null;
    const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(current.lat - myPos.lat), dLng = toRad(current.lng - myPos.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(myPos.lat)) * Math.cos(toRad(current.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  })();
  const etaMin = distanceKm != null ? Math.max(3, Math.round((distanceKm / 25) * 60)) : null;

  /* ------------------------- ringtone ------------------------- */
  const startRing = useCallback((job: RingJob) => {
    if (ringingRef.current) return;
    const prefs = getRingPrefs();
    if (isDndActive(prefs) && job.schedule_type !== "emergency") return;
    ringingRef.current = true;
    playRing();
    if (Platform.OS !== "web") Vibration.vibrate([0, 400, 180, 400, 720], true);
  }, [playRing]);
  const stopAll = useCallback(() => {
    ringingRef.current = false;
    stopRing();
    if (Platform.OS !== "web") Vibration.cancel();
  }, [stopRing]);

  useEffect(() => { loadLocal(); syncPrefsFromServer().catch(() => {}); }, []);
  useEffect(() => {
    // In-app ring takes over from the lock-screen (Notifee) ring for this job.
    if (current) { startRing(current); if (!current.is_test) cancelJobRing(current.id).catch(() => {}); } else stopAll();
    return stopAll;
  }, [current?.id, startRing, stopAll]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------- queue ------------------------- */
  const removeFromQueue = useCallback((id: string) => setQueue((q) => q.filter((j) => j.id !== id)), []);
  const enqueue = useCallback((job: RingJob, force = false) => {
    if (!job || !job.id) return;
    if (handledRef.current.has(job.id)) return;
    // Smart Snooze: non-emergency requests are ignored entirely (never counted as missed).
    if (!force && isSnoozed() && job.schedule_type !== "emergency") return;
    const isTest = !!job.is_test || String(job.id).startsWith("test-");
    setQueue((q) => (q.find((x) => x.id === job.id) ? q : [...q, { ...job, is_test: isTest, _manual: isTest || job._manual, _at: Date.now() }]));
    if (isTest || job._resched) return;
    api.post(`/bookings/${job.id}/seen`, {}).catch(() => {});
  }, []);

  // Elapsed timer (informational only — never cancels).
  useEffect(() => {
    if (!current) { setElapsed(0); return; }
    setElapsed(0);
    const startedAt = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE: new requests + jobs taken by someone else (+ list refreshes, as web PartnerDashboard).
  useEffect(() => subscribe((ev) => {
    if (ev.type === "job_request") { enqueue(ev.data || {}); refetch(); }
    else if (ev.type === "job_taken") { const id = ev.data?.id; if (id) { handledRef.current.add(id); removeFromQueue(id); cancelJobRing(id).catch(() => {}); } refetch(); }
    else if (["job_accepted", "booking_update", "__resync__", "job_cancelled"].includes(ev.type)) { refetch(); qc.invalidateQueries({ queryKey: ["partner-wallet"] }); }
    else if (ev.type === "reschedule_request") { const d = ev.data || {}; if (d.booking_id) enqueue({ ...d, id: String(d.booking_id), _resched: true }, true); refetch(); }
  }), [subscribe, enqueue, removeFromQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  // RELIABILITY FALLBACK: poll offers that should be ringing right now (every 6s + on foreground).
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || AppState.currentState !== "active") return;
      try {
        const data = await api.get<any[]>("/bookings/partner/ring-pending");
        const list = Array.isArray(data) ? data : [];
        list.forEach((j) => enqueue(j));
        const live = new Set(list.map((j) => j.id));
        setQueue((q) => q.filter((j) => live.has(j.id) || j._manual || j._resched || Date.now() - (j._at || 0) < 15000));
      } catch { /* retry next tick */ }
    };
    check();
    const iv = setInterval(check, 6000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    // FCM data message while foregrounded (SSE may be reconnecting): refresh offers now.
    const offPush = onForegroundPush((d) => {
      if (d?.type === "job_request") check();
      else if (d?.type === "reschedule_request" && d.booking_id) enqueue({ ...d, id: String(d.booking_id), _resched: true }, true);
      else if ((d?.type === "job_taken" || d?.type === "job_cancelled") && d.booking_id) { handledRef.current.add(String(d.booking_id)); removeFromQueue(String(d.booking_id)); cancelJobRing(String(d.booking_id)).catch(() => {}); }
    });
    return () => { stopped = true; clearInterval(iv); sub.remove(); offPush(); };
  }, [enqueue, removeFromQueue]);

  // Re-grab a missed job / test ring from the dashboard (opens the ring again).
  useEffect(() => onRing("open-ring", (job) => { if (job?.id) { handledRef.current.delete(job.id); enqueue({ ...job, _manual: true }, true); } }), [enqueue]);

  /* ------------------------- actions ------------------------- */
  const finishTest = (job: RingJob, verb: string) => {
    handledRef.current.add(job.id); stopAll(); removeFromQueue(job.id);
    toast.success(`Test ring ${verb} — alerts are working on this device`);
    emitRing("test-ring-done", { id: job.id, verb });
  };
  const doAccept = async (job: RingJob) => {
    if (!job || busy) return;
    if (job.is_test) { finishTest(job, "accepted"); return; }
    setBusy(true);
    try {
      await api.post(`/bookings/${job.id}/accept`, {});
      handledRef.current.add(job.id); stopAll(); removeFromQueue(job.id); cancelJobRing(job.id).catch(() => {});
      toast.success(`Job accepted · ${job.service_name || ""}`);
      refetch();
      router.push("/(partner)/active");
    } catch (e: any) {
      toast.error(e?.detail || "Could not accept — it may have been taken.");
      handledRef.current.add(job.id); removeFromQueue(job.id);
    } finally { setBusy(false); }
  };
  const doReject = async (job: RingJob) => {
    if (!job || busy) return;
    if (job.is_test) { finishTest(job, "dismissed"); return; }
    setBusy(true);
    try { await api.post(`/bookings/${job.id}/reject`, { reason: "" }); toast.info(`Request declined · ${job.service_name || ""}`); } catch { /* ignore */ }
    handledRef.current.add(job.id); stopAll(); removeFromQueue(job.id); cancelJobRing(job.id).catch(() => {}); refetch();
    setBusy(false);
  };

  const doReschedResponse = async (job: RingJob, action: "accept" | "reject") => {
    if (!job || busy) return;
    setBusy(true);
    try {
      await api.post(`/bookings/${job.id}/reschedule/respond`, { action });
      if (action === "accept") toast.success("Reschedule accepted — booking time updated");
      else toast.info("Reschedule declined — time stays the same");
    } catch (e: any) { toast.error(e?.detail || "Could not respond to the reschedule"); }
    handledRef.current.add(job.id); stopAll(); removeFromQueue(job.id); cancelJobRing(job.id).catch(() => {}); refetch();
    setBusy(false);
  };

  if (!current) return null;

  /* ---------------- Reschedule ring (customer moved the booking) ---------------- */
  if (current._resched) {
    return (
      <Modal visible transparent={false} animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
        <LinearGradient colors={["#F59E0B", "#EA580C", "#B45309"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} testID="reschedule-ring">
          <View pointerEvents="none" style={{ position: "absolute", top: -96, left: -96, width: 288, height: 288, borderRadius: 144, backgroundColor: "rgba(255,255,255,0.10)" }} />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, letterSpacing: 3.6, textTransform: "uppercase", marginBottom: 12, fontWeight: "700" }}>Reschedule request</Text>
            <View style={{ width: 128, height: 128, alignItems: "center", justifyContent: "center", marginVertical: 8 }}>
              <Animated.View style={{ position: "absolute", width: 128, height: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.12)", transform: [{ scale: bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }} />
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 4, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" }}>
                <Icon name="calendar-clock" size={44} color="#fff" />
              </View>
            </View>
            <Text testID="resched-ring-who" style={{ color: "#fff", fontSize: 26, lineHeight: 32, fontWeight: "900", textAlign: "center", marginTop: 8 }}>
              {current.requester_name || "Customer"} wants to reschedule
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 17, fontWeight: "700", marginTop: 6, textAlign: "center" }}>{current.service_name || "your service"}</Text>
            {current.code ? <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 }}>#{current.code}</Text> : null}

            <View style={{ marginTop: 24, width: "100%", maxWidth: 384, gap: 12 }}>
              <View testID="resched-old" style={{ borderRadius: 16, backgroundColor: "rgba(0,0,0,0.14)", paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700", marginBottom: 4 }}>Current time</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="calendar-outline" size={18} color="rgba(255,255,255,0.85)" />
                  <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: "700", textDecorationLine: "line-through" }}>{current.old_date} · {current.old_time}</Text>
                </View>
              </View>
              <View style={{ alignItems: "center" }}><Icon name="arrow-down" size={22} color="#fff" /></View>
              <View testID="resched-new" style={{ borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: "800", marginBottom: 4 }}>New time</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="calendar-check" size={20} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>{current.new_date} · {current.new_time}</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.10)", paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 24 }}>
            <View style={{ flexDirection: "row", gap: 12, alignSelf: "center", width: "100%", maxWidth: 384 }}>
              <Pressable testID="resched-ring-reject" onPress={() => doReschedResponse(current, "reject")} disabled={busy} style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <Icon name="close" size={20} color="#fff" /><Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>Keep time</Text>
              </Pressable>
              <Pressable testID="resched-ring-accept" onPress={() => doReschedResponse(current, "accept")} disabled={busy} style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                {busy ? <ActivityIndicator color="#EA580C" /> : <><Icon name="check" size={20} color="#EA580C" /><Text style={{ color: "#B45309", fontSize: 16, fontWeight: "900" }}>Accept</Text></>}
              </Pressable>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, textAlign: "center", marginTop: 14 }}>Accept to move the booking · Reject to keep the current time</Text>
          </View>
        </LinearGradient>
      </Modal>
    );
  }


  const area = current.address_line || current.city || "Customer location";
  const total = current.partner_amount != null && current.partner_amount !== "" ? current.partner_amount
    : current.services_total != null && current.services_total !== "" ? current.services_total
    : current.total != null ? current.total : "";
  const visitingCharge = Number(current.visiting_charge || 0);
  const couponCode = current.coupon_code || null;
  const items: any[] = Array.isArray(current.items) ? current.items : [];
  const singleServiceQty = (() => {
    if (current.items_count > 1) return 0;
    const q = Number(items.filter((x) => !x.is_addon)[0]?.qty || 1);
    return q > 1 ? q : 0;
  })();

  return (
    <Modal visible transparent={false} animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
      <LinearGradient colors={[P[500], P[700], P[900]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} testID="incoming-job-ring">
        {/* soft glows */}
        <View pointerEvents="none" style={{ position: "absolute", top: -96, left: -96, width: 288, height: 288, borderRadius: 144, backgroundColor: "rgba(255,255,255,0.10)" }} />
        <View pointerEvents="none" style={{ position: "absolute", bottom: 40, right: -80, width: 288, height: 288, borderRadius: 144, backgroundColor: "rgba(52,211,153,0.10)" }} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 3.6, textTransform: "uppercase", marginBottom: 8 }}>{current.is_test ? "Test job ring" : "Incoming job request"}</Text>
          {current.is_test ? <View style={{ marginBottom: 12 }}><Pill testID="ring-test-badge" bg={TW.amber400} color="#451A03">TEST · not a real job</Pill></View> : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {current.schedule_type === "emergency" ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(239,68,68,0.9)", paddingHorizontal: 12, paddingVertical: 4 }}><Icon name="flash" size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Emergency</Text></View> : null}
            {silent ? <View testID="ring-dnd-badge" style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 4 }}><Icon name="bell-off-outline" size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Silent · Do Not Disturb</Text></View> : null}
            {queue.length > 1 ? <Pill bg="rgba(255,255,255,0.15)">+{queue.length - 1} more waiting</Pill> : null}
          </View>

          {current.is_scheduled && current.scheduled_date ? (
            <View testID="ring-scheduled" style={{ marginBottom: 12, width: "100%", maxWidth: 384, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", paddingHorizontal: 16, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", fontWeight: "700", marginBottom: 4 }}>Scheduled Work</Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="calendar-month-outline" size={18} color="#fff" /><Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>{current.scheduled_date}</Text></View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="clock-outline" size={18} color="#fff" /><Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>{current.scheduled_time}</Text></View>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5, marginTop: 4 }}>Scheduled for {current.scheduled_date} at {current.scheduled_time}</Text>
            </View>
          ) : null}

          <RingAvatar image={current.service_image} elapsed={elapsed} />

          <Text testID="ring-title" style={{ color: "#fff", fontSize: 36, lineHeight: 42, fontWeight: "900", textAlign: "center" }}>
            {current.items_count > 1 ? `${current.items_count} services` : current.service_name || "New Service Request"}
          </Text>
          {current.category_name ? <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 18, fontWeight: "600", marginTop: 4, textAlign: "center" }}>{current.category_name}</Text> : null}
          {singleServiceQty > 0 ? <View style={{ marginTop: 8 }}><View testID="ring-qty" style={{ borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 4 }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Quantity: {singleServiceQty}</Text></View></View> : null}

          {total !== "" ? (
            <View testID="ring-amount" style={{ marginTop: 16, alignItems: "center", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <Text style={{ color: TW.emerald300, fontSize: 24, fontWeight: "700" }}>₹</Text>
                <Text style={{ color: "#fff", fontSize: 48, lineHeight: 54, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{inr(total)}</Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{visitingCharge > 0 ? "Total incl. visiting charge · excl. taxes" : "Service amount · excl. taxes"}</Text>
              {visitingCharge > 0 ? <Text testID="ring-visiting" style={{ color: "rgba(167,243,208,0.9)", fontSize: 11, marginTop: 2 }}>includes ₹{inr(visitingCharge)} visiting charge</Text> : null}
            </View>
          ) : null}

          <View style={{ marginTop: 24, width: "100%", maxWidth: 384, gap: 10 }}>
            {items.length > 1 ? (
              <Glass testID="ring-services" style={{ gap: 6 }}>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700", marginBottom: 4 }}>Services & add-ons (excl. tax)</Text>
                {items.map((it, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingLeft: it.is_addon ? 12 : 0 }}>
                    <Text style={{ color: it.is_addon ? "rgba(255,255,255,0.8)" : "#fff", fontSize: 14, fontWeight: it.is_addon ? "400" : "500", flex: 1 }} numberOfLines={1}>{it.is_addon ? "+ " : ""}{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</Text>
                    {it.price ? <Text style={{ color: it.is_addon ? "rgba(255,255,255,0.8)" : "#fff", fontSize: 14, fontWeight: it.is_addon ? "400" : "700", fontVariant: ["tabular-nums"] }}>₹{inr(it.price)}</Text> : null}
                  </View>
                ))}
                {visitingCharge > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)", paddingTop: 6, marginTop: 4 }}>
                    <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>Visiting charge</Text><Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, fontVariant: ["tabular-nums"] }}>₹{inr(visitingCharge)}</Text>
                  </View>
                ) : null}
              </Glass>
            ) : null}
            {couponCode ? (
              <View testID="ring-coupon" style={{ borderRadius: 16, backgroundColor: "rgba(52,211,153,0.15)", borderWidth: 1, borderColor: "rgba(110,231,183,0.3)", paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ color: TW.emerald200, fontSize: 14, fontWeight: "600" }}>Coupon {couponCode}</Text>
                  {Number(current.coupon_discount || 0) > 0 ? <Text style={{ color: TW.emerald200, fontSize: 14, fontVariant: ["tabular-nums"] }}>₹{inr(current.coupon_discount)} off</Text> : null}
                </View>
                <Text style={{ color: "rgba(209,250,229,0.8)", fontSize: 11, marginTop: 4 }}>Funded by AzoApp — your earning is not affected.</Text>
              </View>
            ) : null}
            <Glass style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Icon name="map-marker-outline" size={20} color="rgba(255,255,255,0.8)" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "500", flex: 1 }} numberOfLines={1}>{area}</Text>
            </Glass>
            {distanceKm != null ? (
              <Glass testID="ring-distance" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon name="navigation-variant-outline" size={20} color="#7DD3FC" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away · ~{etaMin} min travel</Text>
              </Glass>
            ) : null}
            <Glass style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Icon name="clock-outline" size={20} color={TW.amber300} /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>{current.code ? `#${current.code}` : "Respond quickly to grab this job"}</Text>
            </Glass>
          </View>
        </ScrollView>

        {/* action bar — sticky at the bottom */}
        <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.10)", paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "center", width: "100%", maxWidth: 384 }}>
            <Pressable testID="ring-reject" onPress={() => doReject(current)} disabled={busy} style={({ pressed }) => ({ alignItems: "center", gap: 8, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: TW.red500, alignItems: "center", justifyContent: "center", boxShadow: "0px 10px 25px rgba(127,29,29,0.4)" }}><Icon name="phone-hangup" size={28} color="#fff" /></View>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Reject</Text>
            </Pressable>
            <Pressable testID="ring-accept" onPress={() => doAccept(current)} disabled={busy} style={({ pressed }) => ({ alignItems: "center", gap: 8, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <Animated.View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: TW.emerald500, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "rgba(110,231,183,0.4)", boxShadow: "0px 10px 25px rgba(6,78,59,0.5)", transform: [{ translateY: bounce.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -10, 0] }) }] }}>
                {busy ? <ActivityIndicator color="#fff" /> : <Icon name="phone" size={32} color="#fff" />}
              </Animated.View>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Accept</Text>
            </Pressable>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center", marginTop: 16 }}>{silent ? "Silent alert (Do Not Disturb)" : "Ringing…"} · waiting for your response</Text>
        </View>
      </LinearGradient>
    </Modal>
  );
}
