import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, Linking, Modal, TextInput, ScrollView, Alert, Platform, RefreshControl } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { AppShellHeader, StatusBadge } from "@/src/components/AppShell";
import { Button } from "@/src/components/ui";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

const EMERALD = "#059669";
const SLATE400 = "#94A3B8";
const fmtDT = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const fmtShort = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function PartnerActiveJob() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [view, setView] = useState<"active" | "completed">("active");

  const activeQ = useQuery({ queryKey: ["partner-active"], queryFn: () => api.get<any[]>("/bookings/partner/active"), refetchInterval: 15000 });
  const doneQ = useQuery({ queryKey: ["partner-joblist", "history", "completed"], queryFn: () => api.get<any[]>("/bookings/partner/history?status=completed") });
  const activeJobs = activeQ.data || [];
  const completedJobs = (doneQ.data || []).filter((b) => ["completed", "paid"].includes(b.status));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["partner-active"] }); qc.invalidateQueries({ queryKey: ["partner-joblist"] }); qc.invalidateQueries({ queryKey: ["partner-wallet"] }); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView
        testID="active-jobs"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={activeQ.isFetching && !activeQ.isLoading} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Active / Completed chips */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable testID="job-view-active" onPress={() => setView("active")} style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: view === "active" ? colors.primary : colors.surfaceSubtle }}>
            <Text style={{ color: view === "active" ? "#fff" : colors.textSecondary, fontSize: 14, fontWeight: "600" }}>Active{activeJobs.length ? ` (${activeJobs.length})` : ""}</Text>
          </Pressable>
          <Pressable testID="job-view-completed" onPress={() => setView("completed")} style={{ height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: view === "completed" ? EMERALD : colors.surfaceSubtle }}>
            <Text style={{ color: view === "completed" ? "#fff" : colors.textSecondary, fontSize: 14, fontWeight: "600" }}>Completed{completedJobs.length ? ` (${completedJobs.length})` : ""}</Text>
          </Pressable>
        </View>

        {view === "active" ? (
          activeQ.isLoading ? <Empty text="Loading…" /> : activeJobs.length === 0 ? <Empty text="No active jobs. Accept a request to get started." /> : activeJobs.map((b) => <ActiveJobCard key={b.id} b={b} onUpdate={refresh} />)
        ) : (
          doneQ.isLoading ? <Empty text="Loading…" /> : completedJobs.length === 0 ? <Empty text="No completed jobs yet. Finished jobs will appear here." /> : completedJobs.map((b) => <CompletedJob key={b.id} b={b} />)
        )}
      </ScrollView>
    </View>
  );
}

/* ── Empty (web: bg-white rounded-xl border-dashed p-10 text-slate-400) ── */
function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View testID="jobs-empty" style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: 40, alignItems: "center" }}>
      <Text style={{ color: SLATE400, fontSize: 16, textAlign: "center", lineHeight: 24 }}>{text}</Text>
    </View>
  );
}

/* ── shared card pieces ── */
function JobCardShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: "hidden", boxShadow: "0px 8px 30px rgba(2,32,71,0.06)", elevation: 2 }}>{children}</View>;
}

function InfoItem({ icon, label, value }: { icon: MdiName; label: string; value?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 12, backgroundColor: colors.surfaceSubtle, padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon name={icon} size={12} color={SLATE400} />
        <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", marginTop: 2 }} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

function Collapse({ title, icon, children, testID }: { title: string; icon: MdiName; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <Pressable testID={testID} onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12 }}>
        <Icon name={icon} size={16} color={SLATE400} />
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700", flex: 1 }}>{title}</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={SLATE400} />
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 }}>{children}</View> : null}
    </View>
  );
}

function TimelineList({ items, color }: { items: any[]; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderLeftWidth: 1, borderLeftColor: colors.border, marginLeft: 6, paddingTop: 4, gap: 12 }}>
      {items.map((t, i) => (
        <View key={i} style={{ marginLeft: 16 }}>
          <View style={{ position: "absolute", left: -23, top: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: 3, borderColor: color === EMERALD ? "#D1FAE5" : colors.primarySubtle }} />
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600", textTransform: "capitalize" }}>{String(t.status || "").replace(/_/g, " ")}</Text>
          <Text style={{ color: SLATE400, fontSize: 11 }}>{fmtShort(t.at)}</Text>
        </View>
      ))}
    </View>
  );
}

/* ── CompletedJob (web PartnerDashboard.jsx) ── */
function CompletedJob({ b }: { b: any }) {
  const { colors } = useTheme();
  const a = b.address || {};
  const completedAt = (b.timeline || []).filter((t: any) => t.status === "completed").map((t: any) => t.at).pop() || b.updated_at;
  const earning = b.commission?.partner_earning ?? null;
  const jobValue = b.total || b.pricing?.total || 0;
  return (
    <JobCardShell>
      <LinearGradient colors={["#059669", "#10B981"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="check-circle-outline" size={16} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>JOB COMPLETED</Text>
          <Text style={{ color: "rgba(236,253,245,0.9)", fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{fmtDT(completedAt)}</Text>
        </View>
      </LinearGradient>
      <View style={{ padding: 20, gap: 16 }} testID={`completed-job-${b.code}`}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, lineHeight: 22 }}>{b.service_name}</Text>
              <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>#{b.code}</Text>
            </View>
          </View>
          <StatusBadge status={b.status} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, borderRadius: 12, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Icon name="map-marker-outline" size={16} color={EMERALD} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", lineHeight: 19 }}>{a.line || "Address unavailable"}{a.city ? `, ${a.city}` : ""}</Text>
            <Text style={{ color: SLATE400, fontSize: 11.5, marginTop: 2 }}>{a.pincode || ""}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <InfoItem icon="account-outline" label="Customer" value={b.customer_name} />
          <InfoItem icon="check-circle-outline" label="Job value" value={fmt(jobValue)} />
        </View>
        {earning != null ? (
          <View style={{ borderRadius: 12, borderWidth: 2, borderColor: "#D1FAE5", backgroundColor: "rgba(236,253,245,0.5)", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="trending-up" size={16} color="#047857" /><Text style={{ color: "#047857", fontSize: 12.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>You earned</Text></View>
            <Text style={{ color: "#047857", fontSize: 18, fontWeight: "800" }}>{fmt(earning)}</Text>
          </View>
        ) : null}
        {(b.timeline || []).length > 0 ? (
          <Collapse title="Job timeline" icon="clock-outline" testID={`completed-timeline-${b.code}`}><TimelineList items={b.timeline} color={EMERALD} /></Collapse>
        ) : null}
      </View>
    </JobCardShell>
  );
}

/* ── JobStepper ── */
const STAGE_STEPS = [
  { key: "assigned", label: "Assigned", match: ["assigned"] },
  { key: "arrived", label: "Arrived", match: ["arrived_shop", "arrived_customer"] },
  { key: "started", label: "In Progress", match: ["started"] },
  { key: "completed", label: "Completed", match: ["completed"] },
];
function JobStepper({ status }: { status: string }) {
  const { colors } = useTheme();
  const cur = Math.max(0, STAGE_STEPS.findIndex((s) => s.match.includes(status)));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }} testID="job-stepper">
      {STAGE_STEPS.map((s, i) => {
        const done = i < cur; const current = i === cur;
        return (
          <View key={s.key} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
              <View style={{ flex: 1, height: 2, backgroundColor: done || current ? colors.secondary : colors.border, opacity: i === 0 ? 0 : 1 }} />
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: done || current ? colors.secondary : colors.border, borderWidth: current ? 4 : 0, borderColor: colors.primarySubtle }}>
                {done ? <Icon name="check" size={13} color="#fff" /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current ? "#fff" : SLATE400 }} />}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: done ? colors.secondary : colors.border, opacity: i === STAGE_STEPS.length - 1 ? 0 : 1 }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: "600", marginTop: 6, textAlign: "center", color: current ? colors.primary : done ? colors.textMuted : "#CBD5E1" }}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ── OtpBoxes (4 boxes) ── */
function OtpBoxes({ value, onChange, len = 4, testID }: { value: string; onChange: (v: string) => void; len?: number; testID?: string }) {
  const { colors } = useTheme();
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: len }, (_, i) => (value || "")[i] || "");
  const setAt = (i: number, d: string) => {
    const arr = (value || "").padEnd(len, " ").split("");
    arr[i] = d || " ";
    onChange(arr.join("").replace(/ /g, "").slice(0, len));
    if (d && refs.current[i + 1]) refs.current[i + 1]?.focus();
  };
  return (
    <View style={{ flexDirection: "row", gap: 8 }} testID={testID || "otp-boxes"}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          testID={`otp-box-${i}`}
          value={d}
          keyboardType="number-pad"
          maxLength={1}
          onChangeText={(t) => setAt(i, t.replace(/\D/g, "").slice(-1))}
          onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace" && !d && refs.current[i - 1]) refs.current[i - 1]?.focus(); }}
          style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 2, borderColor: d ? colors.secondary : colors.border, backgroundColor: colors.surface, textAlign: "center", fontSize: 20, fontWeight: "700", color: colors.text }}
        />
      ))}
    </View>
  );
}

/* ── PhotoBlock ── */
function PhotoBlock({ title, items, onAdd, onRemove, uploading, testID }: { title: string; items: string[]; onAdd: () => void; onRemove: (u: string) => void; uploading: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{title}</Text>
        <View style={{ backgroundColor: items.length ? "#D1FAE5" : colors.surfaceSubtle, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: items.length ? "#047857" : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{Math.min(items.length, 3)}/3 photos{items.length ? " ✓" : ""}</Text>
        </View>
      </View>
      {items.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {items.map((u, i) => (
            <View key={u} style={{ width: "31%", aspectRatio: 1, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
              <Image source={{ uri: mediaUrl(u) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              <Pressable testID={`${testID}-remove-${i}`} onPress={() => onRemove(u)} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable testID={testID} onPress={onAdd} disabled={uploading} style={{ marginTop: 12, height: 44, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: uploading ? 0.6 : 1 }}>
        <Icon name="camera-outline" size={16} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>{uploading ? "Uploading…" : items.length ? "Add more photos" : `Add ${title.split(" ")[0]} Photos`}</Text>
      </Pressable>
    </View>
  );
}

/* ── ActiveJob (web ActiveJob) ── */
function ActiveJobCard({ b, onUpdate }: { b: any; onUpdate: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sparesOpen, setSparesOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const status = b.status as string;
  const arrived = ["arrived_shop", "arrived_customer"].includes(status);
  const inProgress = status === "started";
  const before: string[] = b.evidence?.before || [];
  const after: string[] = b.evidence?.after || [];
  const spares: any[] = b.spare_parts || [];
  const demoOtp = (b.demo_otps || {}) as { start?: string; completion?: string };
  const a = b.address || {};
  const det = (b.eligible_detail || {})[b.partner_id] || {};
  const items: any[] = b.breakdown?.service_items || [];
  const pricing = b.pricing || {};
  const schedLabel = b.scheduled_at ? fmtDT(b.scheduled_at) : "Now";
  const last4 = String(b.customer_phone || "").replace(/\D/g, "").slice(-4);
  const maskedPhone = last4 ? `+91 XXXXX X${last4}` : "";

  const startedAt = (b.timeline || []).filter((t: any) => ["started", "in_progress"].includes(t.status)).map((t: any) => t.at).pop();
  useEffect(() => { if (!inProgress) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [inProgress]);
  const es = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const elapsed = `${String(Math.floor(es / 3600)).padStart(2, "0")}:${String(Math.floor((es % 3600) / 60)).padStart(2, "0")}:${String(es % 60).padStart(2, "0")}`;

  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const pendingReq = b.reschedule_request && b.reschedule_request.status === "pending" ? b.reschedule_request : null;
  const theyRequested = pendingReq && pendingReq.requested_by_role === "customer";
  const canRequestResched = sched.is_scheduled && !pendingReq && ["assigned", "arrived_shop", "arrived_customer"].includes(status);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedVal, setReschedVal] = useState("");

  const capture = async (stage: "before" | "after") => {
    let perm = await ImagePicker.getCameraPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain) perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted && !perm.canAskAgain) { Linking.openSettings(); return; }
    }
    setBusy(`photo-${stage}`);
    try {
      const res = perm.granted
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ["images"] });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      const asset = res.assets[0];
      await api.post(`/bookings/${b.id}/evidence`, { stage, images: [`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`] });
      toast.success(`${stage === "before" ? "Before" : "After"} photo captured ✓`);
      onUpdate();
    } catch (e: any) { toast.error(e?.detail || "Upload failed, please retake"); }
    finally { setBusy(null); }
  };
  const removePhoto = async (stage: "before" | "after", url: string) => {
    try { await api.post(`/bookings/${b.id}/evidence/remove`, { stage, url }); toast.success("Photo removed — you can capture a new one"); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not remove photo"); }
  };
  const step = async (path: string, label: string) => {
    setBusy(path);
    try { await api.post(`/bookings/${b.id}/${path}`, { otp }); toast.success(label); setOtp(""); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Invalid OTP"); }
    finally { setBusy(null); }
  };
  const reject = () => {
    Alert.alert("Reject this job?", "It will be sent back to admin for re-assignment.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: async () => {
        try { await api.post(`/bookings/${b.id}/reject`, { reason: "" }); toast.success("Job rejected"); onUpdate(); }
        catch (e: any) { toast.error(e?.detail || "Failed to reject"); }
      } },
    ]);
  };
  const requestResched = async () => {
    const iso = new Date(reschedVal.replace(" ", "T"));
    if (!reschedVal || isNaN(iso.getTime())) return toast.error("Pick a new date & time (YYYY-MM-DD HH:MM)");
    setBusy("resched");
    try { await api.post(`/bookings/${b.id}/reschedule/request`, { scheduled_at: iso.toISOString() }); toast.success("Reschedule request sent to the customer"); setReschedOpen(false); setReschedVal(""); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not send request"); }
    finally { setBusy(null); }
  };
  const respondResched = async (action: "accept" | "reject") => {
    try { await api.post(`/bookings/${b.id}/reschedule/respond`, { action }); toast.success(action === "accept" ? "Reschedule accepted" : "Reschedule declined"); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not respond"); }
  };
  const cancelResched = async () => {
    try { await api.post(`/bookings/${b.id}/reschedule/cancel`, {}); toast.success("Reschedule request withdrawn"); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Could not withdraw"); }
  };

  const dest = a.lat && a.lng ? `${a.lat},${a.lng}` : encodeURIComponent(`${a.line || ""}, ${a.city || ""} ${a.pincode || ""}`);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

  const outlineBtn = (opts: { color: string; border: string }) => ({ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: opts.border, alignItems: "center" as const, justifyContent: "center" as const, flexDirection: "row" as const, gap: 6 });

  return (
    <JobCardShell>
      {/* State banner */}
      {inProgress ? (
        <LinearGradient colors={["#F59E0B", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>WORK IN PROGRESS</Text>
            <Text style={{ color: "rgba(255,251,235,0.9)", fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{b.service_name}{startedAt ? ` · started ${new Date(startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</Text>
          </View>
          {startedAt ? <Text testID={`elapsed-${b.code}`} style={{ color: "#fff", fontWeight: "700", fontSize: 14, fontVariant: ["tabular-nums"], backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>{elapsed}</Text> : null}
        </LinearGradient>
      ) : arrived ? (
        <LinearGradient colors={["#7C3AED", colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="check-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>You've arrived — verify the customer to start</Text>
        </LinearGradient>
      ) : (
        <LinearGradient colors={[colors.primary, "#1976D2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="shield-check-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>New job assigned — head to the customer</Text>
        </LinearGradient>
      )}

      <View style={{ padding: 20, gap: 16 }} testID={`active-job-${b.code}`}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, lineHeight: 22 }}>{b.service_name}</Text>
              <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>#{b.code}</Text>
            </View>
          </View>
          <StatusBadge status={status} />
        </View>

        {/* Customer location */}
        <View style={{ flexDirection: "row", gap: 8, borderRadius: 12, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Icon name="map-marker-outline" size={16} color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", lineHeight: 19 }}>{a.line || "Address unavailable"}{a.city ? `, ${a.city}` : ""}</Text>
            <Text style={{ color: SLATE400, fontSize: 11.5, marginTop: 2 }}>{a.pincode || ""}{det.distance_km != null ? ` · ~${det.distance_km} km` : ""}{det.eta_min != null ? ` · ~${det.eta_min} min` : ""}</Text>
          </View>
        </View>

        <JobStepper status={status} />

        {/* Demo OTP hint (demo partner only) */}
        {demoOtp.start || demoOtp.completion ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.infoSubtle, borderRadius: 12, padding: 12 }}>
            <Icon name="information-outline" size={16} color={colors.info} />
            <Text style={{ color: colors.info, fontSize: 12, fontWeight: "700", flex: 1 }}>Demo — Start OTP {demoOtp.start} · Completion OTP {demoOtp.completion}</Text>
          </View>
        ) : null}

        {/* Reschedule pending */}
        {pendingReq ? (
          <View testID={`reschedule-pending-${b.code}`} style={{ borderRadius: 16, borderWidth: 2, borderColor: "#FCD34D", backgroundColor: "#FFFBEB", padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="clock-outline" size={16} color="#B45309" /><Text style={{ color: "#B45309", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>Reschedule request · pending</Text></View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{pendingReq.requester_name} · {b.service_name}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.7)", padding: 10 }}>
                <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Current schedule</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{pendingReq.old_date}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>{pendingReq.old_time}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.7)", padding: 10, borderWidth: 1, borderColor: "#FDE68A" }}>
                <Text style={{ color: "#F59E0B", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>New request</Text>
                <Text style={{ color: "#B45309", fontSize: 13, fontWeight: "900" }}>{pendingReq.new_date}</Text>
                <Text style={{ color: "#B45309", fontSize: 13, fontWeight: "900" }}>{pendingReq.new_time}</Text>
              </View>
            </View>
            {theyRequested ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable testID={`reschedule-accept-${b.code}`} onPress={() => respondResched("accept")} style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Accept reschedule</Text></Pressable>
                <Pressable testID={`reschedule-reject-${b.code}`} onPress={() => respondResched("reject")} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#FECDD3", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#E11D48", fontWeight: "700", fontSize: 13 }}>Reject</Text></Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
                <Text style={{ color: "#B45309", fontSize: 12, flex: 1 }}>Waiting for the customer to accept.</Text>
                <Pressable testID={`reschedule-withdraw-${b.code}`} onPress={cancelResched} style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Withdraw</Text></Pressable>
              </View>
            )}
          </View>
        ) : null}

        {/* Primary CTA — Navigate */}
        <View>
          {commLocked ? (
            <View testID={`navigate-locked-${b.code}`} style={{ height: 48, borderRadius: 12, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Icon name="lock-outline" size={20} color={SLATE400} /><Text style={{ color: SLATE400, fontWeight: "600", fontSize: 15 }}>Navigation locked</Text>
            </View>
          ) : (
            <Pressable testID={`navigate-${b.code}`} onPress={() => Linking.openURL(navUrl)} style={{ height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Icon name="navigation-variant-outline" size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Navigate to Customer</Text>
            </Pressable>
          )}
          <Text style={{ color: SLATE400, fontSize: 11.5, textAlign: "center", marginTop: 6 }}>{commLocked ? "Available 30 minutes before the scheduled time" : "Opens directions to the customer's location"}</Text>
        </View>

        {/* Contact */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {commLocked || !b.customer_phone ? (
            <View style={outlineBtn({ color: "#CBD5E1", border: colors.border })}><Icon name={commLocked ? "lock-outline" : "phone-outline"} size={16} color="#CBD5E1" /><Text style={{ color: "#CBD5E1", fontWeight: "600", fontSize: 14 }}>Call</Text></View>
          ) : (
            <Pressable testID={`call-cust-${b.code}`} onPress={() => Linking.openURL(`tel:${b.customer_phone}`)} style={outlineBtn({ color: "#047857", border: "#A7F3D0" })}><Icon name="phone-outline" size={16} color="#047857" /><Text style={{ color: "#047857", fontWeight: "600", fontSize: 14 }}>Call</Text></Pressable>
          )}
          <Pressable testID={`chat-cust-${b.code}`} disabled={commLocked} onPress={() => (commLocked ? toast.info("Chat unlocks 30 minutes before the scheduled time") : router.push(`/(partner)/booking/${b.id}`))} style={[outlineBtn({ color: colors.primary, border: "#BFDBFE" }), { opacity: commLocked ? 0.5 : 1 }]}>
            <Icon name={commLocked ? "lock-outline" : "message-outline"} size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>Chat</Text>
          </Pressable>
        </View>

        {/* Job & customer details */}
        <Collapse title="Job & customer details" icon="account-outline" testID={`details-collapse-${b.code}`}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}><InfoItem icon="account-outline" label="Customer" value={b.customer_name} /><InfoItem icon="wrench-outline" label="Service" value={b.service_name} /></View>
            <View style={{ flexDirection: "row", gap: 8 }}><InfoItem icon="calendar-clock-outline" label="Schedule" value={schedLabel} /><InfoItem icon="check-circle-outline" label="Job value" value={fmt(b.breakdown?.total || b.total || pricing.total || 0)} /></View>
          </View>
          {items.length > 0 ? (
            <View style={{ marginTop: 12, borderRadius: 12, backgroundColor: colors.surfaceSubtle, padding: 12, gap: 6 }}>
              <Text style={{ color: SLATE400, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Services to do</Text>
              {items.map((it, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, flex: 1 }}>{i + 1}. {it.name}{it.qty > 1 ? ` × ${it.qty}` : ""}</Text>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{fmt(it.amount)}</Text>
                </View>
              ))}
              {pricing.addons_total ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>Add-ons</Text><Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{fmt(pricing.addons_total)}</Text></View> : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>Total</Text><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{fmt(pricing.total)}</Text></View>
            </View>
          ) : null}
          {b.commission?.partner_earning != null ? (
            <View style={{ marginTop: 12, borderRadius: 12, borderWidth: 2, borderColor: "#D1FAE5", backgroundColor: "rgba(236,253,245,0.5)", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: "#047857", fontSize: 12.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Your earning</Text>
              <Text style={{ color: "#047857", fontSize: 18, fontWeight: "800" }}>{fmt(b.commission.partner_earning)}</Text>
            </View>
          ) : null}
          {maskedPhone ? <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}><Icon name="phone-outline" size={14} color={SLATE400} /><Text style={{ color: SLATE400, fontSize: 12 }}>{maskedPhone} <Text style={{ color: "#CBD5E1" }}>· number protected</Text></Text></View> : null}
        </Collapse>

        {(b.timeline || []).length > 0 ? (
          <Collapse title="Job timeline" icon="clock-outline" testID={`timeline-collapse-${b.code}`}><TimelineList items={b.timeline} color={colors.secondary} /></Collapse>
        ) : null}

        {/* BEFORE work + verify & start */}
        {status === "assigned" || arrived ? (
          <>
            {commLocked ? (
              <View style={{ borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="lock-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Before Work locked</Text></View>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>Before-work photo unlocks 30 minutes before {sched.scheduled_time || "the scheduled time"}</Text>
              </View>
            ) : (
              <PhotoBlock title="Before Work" items={before} onAdd={() => capture("before")} onRemove={(u) => removePhoto("before", u)} uploading={busy === "photo-before"} testID={`before-ev-${b.code}`} />
            )}
            {commLocked ? (
              <View testID={`start-locked-${b.code}`} style={{ borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="lock-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Start Work locked</Text></View>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>You can start this scheduled job 30 minutes before {sched.scheduled_time} on {sched.scheduled_date}. The customer's Start OTP becomes visible then too.</Text>
              </View>
            ) : (
              <View style={{ borderRadius: 12, borderWidth: 2, borderColor: "#DBEAFE", backgroundColor: "rgba(239,246,255,0.4)", padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="shield-check-outline" size={14} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Customer verification</Text></View>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Ask the customer for their <Text style={{ fontWeight: "700" }}>Start OTP</Text> to begin the job.</Text>
                <OtpBoxes value={otp} onChange={setOtp} />
                <Pressable testID={`start-otp-${b.code}`} disabled={otp.length < 4 || busy === "start-otp"} onPress={() => step("start-otp", "Job started ✓")} style={{ marginTop: 12, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: otp.length < 4 ? 0.5 : 1 }}>
                  <Icon name="check-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{busy === "start-otp" ? "Verifying…" : "Verify & Start Job"}</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        {/* AFTER work + complete */}
        {inProgress ? (
          <>
            <PhotoBlock title="After Work" items={after} onAdd={() => capture("after")} onRemove={(u) => removePhoto("after", u)} uploading={busy === "photo-after"} testID={`after-ev-${b.code}`} />
            <View style={{ borderRadius: 12, borderWidth: 2, borderColor: "#D1FAE5", backgroundColor: "rgba(236,253,245,0.4)", padding: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="check-circle-outline" size={14} color="#047857" /><Text style={{ color: "#047857", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Complete the job</Text></View>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>Enter the customer's <Text style={{ fontWeight: "700" }}>Completion OTP</Text> to finish & credit your earnings.</Text>
              <OtpBoxes value={otp} onChange={setOtp} />
              <Pressable testID={`complete-otp-${b.code}`} disabled={otp.length < 4 || busy === "complete"} onPress={() => step("complete", "Job completed! Earnings credited 🎉")} style={{ marginTop: 12, height: 44, borderRadius: 12, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: otp.length < 4 ? 0.5 : 1 }}>
                <Icon name="check-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{busy === "complete" ? "Completing…" : "Complete Job"}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {/* Secondary actions */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {status === "assigned" ? (
            <Pressable testID={`reject-${b.code}`} onPress={reject} style={outlineBtn({ color: "#DC2626", border: "#FECACA" })}><Text style={{ color: "#DC2626", fontWeight: "600", fontSize: 13 }}>Reject Job</Text></Pressable>
          ) : null}
          {canRequestResched ? (
            <Pressable testID={`reschedule-${b.code}`} onPress={() => setReschedOpen(true)} style={outlineBtn({ color: colors.textSecondary, border: colors.border })}><Icon name="clock-outline" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Request Reschedule</Text></Pressable>
          ) : null}
        </View>

        {/* Additional work (spare parts) */}
        {inProgress || status === "arrived_customer" ? (
          <View testID={`additional-section-${b.code}`} style={{ borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, paddingTop: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="wrench-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Additional work</Text></View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 }}>If any extra parts or labour were used, add them here. <Text style={{ color: "#B45309", fontWeight: "700" }}>Collect the payment for additional work from the customer first, then complete the job.</Text></Text>
            {spares.length > 0 ? (
              <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: 8, padding: 12, gap: 6, marginBottom: 12 }}>
                {spares.map((p) => (
                  <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1 }}>{p.name} <Text style={{ color: SLATE400 }}>· ×{p.quantity}</Text></Text>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{fmt(p.total)}</Text>
                    <StatusBadge status={p.status} />
                  </View>
                ))}
              </View>
            ) : null}
            <Pressable testID={`add-additional-${b.code}`} onPress={() => setSparesOpen(true)} style={{ alignSelf: "flex-start", height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#93C5FD", flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Add spare part</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <SpareModal open={sparesOpen} onClose={() => setSparesOpen(false)} bookingId={b.id} onAdded={onUpdate} />

      <Modal visible={reschedOpen} transparent animationType="slide" onRequestClose={() => setReschedOpen(false)}>
        <KeyboardProvider>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setReschedOpen(false)} />
          <View testID={`reschedule-modal-${b.code}`} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "700" }}>Request reschedule</Text>
              <Pressable onPress={() => setReschedOpen(false)} hitSlop={8}><Icon name="close" size={18} color={SLATE400} /></Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Current: <Text style={{ fontWeight: "700" }}>{sched.scheduled_date} · {sched.scheduled_time}</Text>. The booking time changes only after the customer accepts.</Text>
            <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Pick a new date & time slot</Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 50 }}>
              <Icon name="calendar-clock-outline" size={18} color={colors.textMuted} />
              <TextInput testID="resched-input" value={reschedVal} onChangeText={setReschedVal} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor={colors.textMuted} style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.md, fontWeight: "600" }} />
            </View>
            <Button title={busy === "resched" ? "Sending…" : "Send reschedule request"} onPress={requestResched} loading={busy === "resched"} disabled={!reschedVal} testID={`reschedule-confirm-${b.code}`} />
          </View>
        </KeyboardAvoidingView>
        </KeyboardProvider>
      </Modal>
    </JobCardShell>
  );
}

function SpareModal({ open, onClose, bookingId, onAdded }: { open: boolean; onClose: () => void; bookingId: string; onAdded: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const add = useMutation({
    mutationFn: () => api.post(`/bookings/${bookingId}/spare-parts`, { name, quantity: Number(qty) || 1, price: Number(price) || 0 }),
    onSuccess: () => { toast.success("Spare part added — ask customer to pay"); setName(""); setQty("1"); setPrice(""); onClose(); onAdded(); },
    onError: (e: any) => toast.error(e?.detail || "Could not add part"),
  });
  const input = { flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.md, fontWeight: "600" as const };
  const box = { flexDirection: "row" as const, alignItems: "center" as const, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 50 };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "700" }}>Add spare part</Text>
            <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={18} color={SLATE400} /></Pressable>
          </View>
          <View style={box}><Icon name="cog-outline" size={18} color={colors.textMuted} /><TextInput testID="spare-name" value={name} onChangeText={setName} placeholder="Part name" placeholderTextColor={colors.textMuted} style={input} /></View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={[box, { flex: 0.5 }]}><Text style={{ color: colors.textMuted }}>Qty</Text><TextInput value={qty} onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={input} /></View>
            <View style={[box, { flex: 1 }]}><Text style={{ color: colors.textSecondary, fontWeight: "800" }}>₹</Text><TextInput value={price} onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ""))} placeholder="Price" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={input} /></View>
          </View>
          <Button title="Add part" onPress={() => (name.trim() ? add.mutate() : toast.error("Enter a part name"))} loading={add.isPending} testID="spare-submit" />
        </View>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
