import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, Animated, Easing, Vibration, Platform, ScrollView, ActivityIndicator, AppState } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Calendar, CalendarCheck, Check, X, ArrowDown } from "lucide-react-native";
import { api } from "@/src/api/client";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useToast } from "@/src/components/Toast";
import { cancelRescheduleRing, onForegroundPush, onFcmNotificationOpen } from "@/src/lib/notifications";

/**
 * Full-screen, call-style RESCHEDULE alert for the customer — mirrors the Partner
 * app's reschedule ring. Fires when a PARTNER requests to move the customer's booking.
 * Sources: SSE (foreground) + FCM foreground push + a 6s reliability poll of /bookings.
 * The lock-screen / closed-app ring is rendered natively by Notifee (notifications.ts).
 */
type Req = any;

function useLoop(toValue: number, duration: number, easing = Easing.inOut(Easing.ease)) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(v, { toValue, duration, easing, useNativeDriver: Platform.OS !== "web" }));
    anim.start();
    return () => anim.stop();
  }, [v, toValue, duration, easing]);
  return v;
}

export function RescheduleAlertOverlay() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { subscribe, playRing, stopRing } = useRealtime();
  const [queue, setQueue] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const handledRef = useRef(new Set<string>());
  const ringingRef = useRef(false);
  const bounce = useLoop(1, 1000);

  const current: Req | null = queue[0] || null;

  const refetch = () => { qc.invalidateQueries({ queryKey: ["bookings"] }); qc.invalidateQueries({ queryKey: ["customer-bookings"] }); };

  const removeFromQueue = useCallback((id: string) => setQueue((q) => q.filter((j) => String(j.id) !== String(id))), []);
  const enqueue = useCallback((d: Req) => {
    const id = String(d?.booking_id || d?.id || "");
    if (!id) return;
    // Only a PARTNER-initiated reschedule rings the customer (never the customer's own request).
    const role = d?.requester_role || d?.requested_by_role;
    if (role && role !== "partner") return;
    if (handledRef.current.has(id)) return;
    setQueue((q) => (q.find((x) => String(x.id) === id) ? q : [...q, { ...d, id, _at: Date.now() }]));
  }, []);

  /* ------------------------- ringtone ------------------------- */
  const startRing = useCallback(() => {
    if (ringingRef.current) return;
    ringingRef.current = true;
    playRing();
    if (Platform.OS !== "web") Vibration.vibrate([0, 400, 180, 400, 720], true);
  }, [playRing]);
  const stopAll = useCallback(() => {
    ringingRef.current = false;
    stopRing();
    if (Platform.OS !== "web") Vibration.cancel();
  }, [stopRing]);

  useEffect(() => {
    if (current) { startRing(); cancelRescheduleRing(String(current.id)).catch(() => {}); } else stopAll();
    return stopAll;
  }, [current?.id, startRing, stopAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE: reschedule request + resolved/cancelled (from either party's action).
  useEffect(() => subscribe((ev) => {
    if (ev.type === "reschedule_request") { enqueue(ev.data || {}); }
    else if (["reschedule_resolved", "booking_update", "__resync__", "job_cancelled"].includes(ev.type)) {
      const d = ev.data || {}; const id = String(d.booking_id || d.id || "");
      if (id && ev.type === "reschedule_resolved") { handledRef.current.add(id); removeFromQueue(id); cancelRescheduleRing(id).catch(() => {}); }
      refetch();
    }
  }), [subscribe, enqueue, removeFromQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  // FCM foreground push (SSE may be reconnecting).
  useEffect(() => {
    const off = onForegroundPush((d) => {
      if (d?.type === "reschedule_request") enqueue(d);
      else if (["reschedule_accepted", "reschedule_rejected", "reschedule_cancelled", "reschedule_resolved"].includes(d?.type) && d?.booking_id) {
        const id = String(d.booking_id); handledRef.current.add(id); removeFromQueue(id); cancelRescheduleRing(id).catch(() => {});
      }
    });
    const offTap = onFcmNotificationOpen((d) => { if (d?.type === "reschedule_request") enqueue(d); });
    return () => { off(); offTap(); };
  }, [enqueue, removeFromQueue]);

  // RELIABILITY FALLBACK: poll the customer's bookings for a pending partner
  // reschedule request (every 6s + on foreground) in case SSE + FCM both missed it.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || AppState.currentState !== "active") return;
      try {
        const rows = await api.get<any[]>("/bookings").catch(() => [] as any[]);
        const list = Array.isArray(rows) ? rows : [];
        const pending = list.filter((b) => {
          const r = b?.reschedule_request;
          return r && r.status === "pending" && r.requested_by_role === "partner";
        });
        pending.forEach((b) => {
          const r = b.reschedule_request;
          enqueue({
            booking_id: b.id, id: b.id, code: b.code, service_name: b.service_name,
            requester_role: "partner", requester_name: r.requester_name,
            old_date: r.old_date, old_time: r.old_time, new_date: r.new_date, new_time: r.new_time,
          });
        });
        const liveIds = new Set(pending.map((b) => String(b.id)));
        setQueue((q) => q.filter((j) => liveIds.has(String(j.id)) || Date.now() - (j._at || 0) < 15000));
      } catch { /* retry next tick */ }
    };
    check();
    const iv = setInterval(check, 6000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    return () => { stopped = true; clearInterval(iv); sub.remove(); };
  }, [enqueue]);

  /* ------------------------- actions ------------------------- */
  const respond = async (req: Req, action: "accept" | "reject") => {
    if (!req || busy) return;
    setBusy(true);
    try {
      await api.post(`/bookings/${req.id}/reschedule/respond`, { action });
      if (action === "accept") toast.success("Reschedule accepted — booking time updated");
      else toast.info("Reschedule declined — time stays the same");
    } catch (e: any) { toast.error(e?.detail || "Could not respond to the reschedule"); }
    handledRef.current.add(String(req.id)); stopAll(); removeFromQueue(String(req.id)); cancelRescheduleRing(String(req.id)).catch(() => {}); refetch();
    setBusy(false);
  };

  if (!current) return null;

  return (
    <Modal visible transparent={false} animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
      <LinearGradient colors={["#F59E0B", "#EA580C", "#B45309"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} testID="customer-reschedule-ring">
        <View pointerEvents="none" style={{ position: "absolute", top: -96, left: -96, width: 288, height: 288, borderRadius: 144, backgroundColor: "rgba(255,255,255,0.10)" }} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, letterSpacing: 3.6, textTransform: "uppercase", marginBottom: 12, fontWeight: "700" }}>Reschedule request</Text>
          <View style={{ width: 128, height: 128, alignItems: "center", justifyContent: "center", marginVertical: 8 }}>
            <Animated.View style={{ position: "absolute", width: 128, height: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.12)", transform: [{ scale: bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }} />
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 4, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" }}>
              <CalendarClock size={44} color="#fff" />
            </View>
          </View>
          <Text testID="cust-resched-who" style={{ color: "#fff", fontSize: 26, lineHeight: 32, fontWeight: "900", textAlign: "center", marginTop: 8 }}>
            {current.requester_name || "Your partner"} wants to reschedule
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 17, fontWeight: "700", marginTop: 6, textAlign: "center" }}>{current.service_name || "your service"}</Text>
          {current.code ? <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 }}>#{current.code}</Text> : null}

          <View style={{ marginTop: 24, width: "100%", maxWidth: 384, gap: 12 }}>
            <View testID="cust-resched-old" style={{ borderRadius: 16, backgroundColor: "rgba(0,0,0,0.14)", paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700", marginBottom: 4 }}>Current time</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Calendar size={18} color="rgba(255,255,255,0.85)" />
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: "700", textDecorationLine: "line-through" }}>{current.old_date} · {current.old_time}</Text>
              </View>
            </View>
            <View style={{ alignItems: "center" }}><ArrowDown size={22} color="#fff" /></View>
            <View testID="cust-resched-new" style={{ borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: "800", marginBottom: 4 }}>New time</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <CalendarCheck size={20} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>{current.new_date} · {current.new_time}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(0,0,0,0.10)", paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: "row", gap: 12, alignSelf: "center", width: "100%", maxWidth: 384 }}>
            <Pressable testID="cust-resched-reject" onPress={() => respond(current, "reject")} disabled={busy} style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <X size={20} color="#fff" /><Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>Keep time</Text>
            </Pressable>
            <Pressable testID="cust-resched-accept" onPress={() => respond(current, "accept")} disabled={busy} style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              {busy ? <ActivityIndicator color="#EA580C" /> : <><Check size={20} color="#EA580C" /><Text style={{ color: "#B45309", fontSize: 16, fontWeight: "900" }}>Accept</Text></>}
            </Pressable>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, textAlign: "center", marginTop: 14 }}>Accept to move the booking · Keep time to stay on the current schedule</Text>
        </View>
      </LinearGradient>
    </Modal>
  );
}
