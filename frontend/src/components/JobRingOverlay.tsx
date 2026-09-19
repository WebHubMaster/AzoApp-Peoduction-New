import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, Animated, Easing, Vibration, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useToast } from "@/src/components/Toast";
import { Icon } from "@/src/components/Icon";
import { scheduleJobRing } from "@/src/lib/notifications";
import { fmt } from "@/src/lib/format";
import { addMissed, emitRing, isDndActive, isSnoozed, loadLocal, onRing, syncPrefsFromServer } from "@/src/lib/ringPrefs";

const RING_SECONDS = 45;

/**
 * Full-screen incoming "Job Ring" (web: playSound + toast + browserNotify on `job_request`).
 * Rings (looped sound + vibration) until Accept / Decline / timeout.
 */
export function JobRingOverlay() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { subscribe, playRing, stopRing } = useRealtime();
  const [job, setJob] = useState<any>(null);
  const [left, setLeft] = useState(RING_SECONDS);
  const [busy, setBusy] = useState("");
  const [pulse] = useState(() => new Animated.Value(1));

  const refetch = () => { qc.invalidateQueries({ queryKey: ["partner-jobs"] }); qc.invalidateQueries({ queryKey: ["partner-active"] }); qc.invalidateQueries({ queryKey: ["partner-dashboard"] }); qc.invalidateQueries({ queryKey: ["partner-missed"] }); };

  const open = (d: any, force = false) => {
    if (!d || !d.id) return;
    const emergency = d.schedule_type === "emergency";
    // Smart Snooze: non-emergency requests are ignored entirely (never counted as missed).
    if (!force && isSnoozed() && !emergency) return;
    const isTest = !!d.is_test || String(d.id).startsWith("test-");
    setJob({ ...d, is_test: isTest }); setLeft(RING_SECONDS);
    if (!(isDndActive() && !emergency)) {
      playRing();
      if (Platform.OS !== "web") Vibration.vibrate([0, 500, 300, 500, 300, 500], true);
    }
    scheduleJobRing("🔔 New Job Request", `${d.service_name || "New service request"}${d.city ? " · " + d.city : ""}`).catch(() => {});
    if (!isTest) api.post(`/bookings/${d.id}/seen`, {}).catch(() => {});
  };

  useEffect(() => { loadLocal(); syncPrefsFromServer(); }, []);
  useEffect(() => onRing("open-ring", (d) => open(d, true)), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribe((ev) => {
    if (ev.type === "job_request" && ev.data) {
      open(ev.data);
      refetch();
    } else if (ev.type === "job_taken") {
      setJob((j: any) => (j && j.id === ev.data?.id ? null : j));
      refetch();
    } else if (["job_accepted", "booking_update", "__resync__", "job_cancelled"].includes(ev.type)) {
      refetch(); qc.invalidateQueries({ queryKey: ["partner-wallet"] });
    } else if (ev.type === "reschedule_request") {
      toast.info("Customer requested a reschedule — open Active Job to respond"); refetch();
    }
  }), [subscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => { stopRing(); Vibration.cancel(); setJob(null); };
  const timeout = () => { if (job && !job.is_test) addMissed(job); dismiss(); };

  useEffect(() => {
    if (!job) return;
    const id = setInterval(() => setLeft((s) => { if (s <= 1) { timeout(); return 0; } return s - 1; }), 1000);
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
    ]));
    anim.start();
    return () => { clearInterval(id); anim.stop(); };
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { stopRing(); Vibration.cancel(); }, [stopRing]);

  if (!job) return null;
  const accept = async () => {
    if (job.is_test) { dismiss(); emitRing("test-ring-done", { id: job.id, verb: "accepted" }); toast.success("Test job ring works ✓ — sound, vibration & alert are set up"); return; }
    setBusy("accept");
    try { await api.post(`/bookings/${job.id}/accept`, {}); dismiss(); toast.success("Job accepted!"); refetch(); router.push("/(partner)/active"); }
    catch (e: any) { toast.error(e?.detail || "Could not accept"); dismiss(); }
    finally { setBusy(""); }
  };
  const decline = async () => {
    if (job.is_test) { dismiss(); emitRing("test-ring-done", { id: job.id, verb: "rejected" }); return; }
    setBusy("decline");
    try { await api.post(`/bookings/${job.id}/reject`, { reason: "" }); toast.success("Job declined"); refetch(); } catch { /* ignore */ }
    finally { setBusy(""); dismiss(); }
  };
  const view = () => { dismiss(); router.push("/(partner)/jobs"); };
  const pay = String(job.payment_mode || job.payment_method || "Online").replace(/_/g, " ");

  return (
    <Modal visible transparent={false} animationType="slide" statusBarTranslucent onRequestClose={dismiss}>
      <LinearGradient colors={[colors.primaryDark, colors.primary, "#0F172A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, alignItems: "center" }} testID="job-ring-overlay">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#34D399" }} /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", letterSpacing: 1.5 }}>{job.is_test ? "TEST JOB RING" : "INCOMING JOB REQUEST"}</Text>
        </View>
        <Text style={{ color: "#BFDBFE", fontSize: 13, marginTop: 8 }}>Auto-dismiss in {left}s</Text>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={{ transform: [{ scale: pulse }], width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={48} color={colors.primary} /></View>
          </Animated.View>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 28, textAlign: "center" }} numberOfLines={2}>{job.service_name || "New service request"}</Text>
          <Text style={{ color: "#BFDBFE", fontSize: 14, marginTop: 6, fontFamily: "monospace" }}>#{job.code}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}><Icon name="map-marker-outline" size={18} color="#BFDBFE" /><Text style={{ color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" }} numberOfLines={2}>{job.address_line || job.city || "Nearby"}{job.address_line && job.city ? `, ${job.city}` : ""}</Text></View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
            {[["Job value", job.total != null ? fmt(job.total) : "—"], ["Payment", pay], ["Type", job.schedule_type === "emergency" ? "Emergency" : "Standard"]].map(([k, v]) => (
              <View key={String(k)} style={{ borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 14, paddingVertical: 10, minWidth: 96, alignItems: "center" }}>
                <Text style={{ color: "#BFDBFE", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{k}</Text><Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 2, textTransform: "capitalize" }}>{String(v)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ width: "100%", gap: 12 }}>
          <Pressable testID="ring-accept" onPress={accept} disabled={!!busy} style={{ height: 60, borderRadius: 20, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, opacity: busy ? 0.6 : 1, boxShadow: "0px 10px 30px rgba(16,185,129,0.45)" }}>
            <Icon name="check-circle-outline" size={24} color="#fff" /><Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>{busy === "accept" ? "Accepting…" : "Accept Job"}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable testID="ring-view" onPress={view} style={{ flex: 1, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}><Icon name="eye-outline" size={20} color="#fff" /><Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>View details</Text></Pressable>
            <Pressable testID="ring-decline" onPress={decline} disabled={!!busy} style={{ flex: 1, height: 52, borderRadius: 16, backgroundColor: "rgba(244,63,94,0.9)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}><Icon name="close" size={20} color="#fff" /><Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{busy === "decline" ? "…" : "Decline"}</Text></Pressable>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}
