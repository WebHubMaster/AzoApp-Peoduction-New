import React, { useEffect, useMemo, useState } from "react";
import { HelpSOS } from "@/src/components/partner/HelpSOS";
import { View, Text, Pressable, ActivityIndicator, Linking } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useTheme } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { StatusBadge } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";
import { oversizeMessage, assetSizeBytes, shrinkForUpload, uploadAsset } from "@/src/components/reg/Photo";
import { OtpBoxes, ProofGrid, uploadProofAsset, systemCameraCapture, pendingSystemCapture, ensureCamera, ensureVideoPermissions, MAX_VIDEO_SEC } from "@/src/components/partner/JobProof";
import { ProofCamera, ProofShot } from "@/src/components/partner/ProofCamera";
import { AdditionalWork } from "@/src/components/partner/AdditionalWork";
import { SelfieCamera } from "@/src/components/partner/SelfieCamera";
import { JobDetailsBlock } from "../../active";
import { refreshPartnerLive } from "@/src/lib/partnerLive";

const EMERALD = "#059669";
const SLATE400 = "#94A3B8";
const num = (v: any) => Number(v || 0);
const fmtDT = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const fmtShort = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const haversineKm = (a: number, b: number, c: number, d: number) => { const R = 6371, dLat = ((c - a) * Math.PI) / 180, dLng = ((d - b) * Math.PI) / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };

const STEPS: { key: string; label: string; icon: MdiName }[] = [
  { key: "details", label: "Details", icon: "clipboard-text-outline" },
  { key: "checkin", label: "Check-in", icon: "camera-account" },
  { key: "start", label: "Start", icon: "play-circle-outline" },
  { key: "complete", label: "Complete", icon: "check-decagram-outline" },
];

/** Which wizard step the booking is really at (server truth). */
function phaseOf(b: any): number {
  if (!b) return 0;
  if (["completed", "paid"].includes(b.status)) return 4;
  if (b.status === "started") return 3;
  if (b.checkin) return 2;
  return 1;
}

export default function PartnerJobWizard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["partner-booking", id], queryFn: () => api.get<any>(`/bookings/partner/job/${id}`), enabled: !!id, refetchInterval: 10000 });
  const b = q.data;
  const phase = phaseOf(b);
  const [step, setStep] = useState(0);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [cam, setCam] = useState<{ stage: "before" | "after"; kind: "photo" | "video" } | null>(null);
  const [pendingAsset, setPendingAsset] = useState<any>(null);
  useEffect(() => { pendingSystemCapture().then((a) => { if (a) setPendingAsset(a); }); }, []);
  // Android restarted the app while the phone camera was open → upload the recovered capture.
  useEffect(() => {
    if (!pendingAsset || !b || String(b.id) !== String(id)) return;
    const a = pendingAsset; setPendingAsset(null);
    const stage = phaseOf(b) >= 3 ? "after" : "before";
    setBusy(`${stage}-recovered`);
    uploadProofAsset(b.id, stage, a, toast, setProgress)
      .then((ok) => { if (ok) { toast.success("Recovered capture added ✓"); q.refetch(); } })
      .catch((e: any) => toast.error(e?.detail || e?.message || "Upload failed, please retry"))
      .finally(() => { setBusy(null); setProgress(0); });
  }, [pendingAsset, b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [footerH, setFooterH] = useState(120); // measured sticky-footer height → keyboard offset

  // Opening a DIFFERENT job (id change) must never carry over the previous job's
  // step / OTP / busy state — otherwise the wrong service's wizard step shows.
  useEffect(() => { setStep(0); setOtp(""); setBusy(null); setProgress(0); }, [id]);

  // Server moved forward (OTP verified / completed) → wizard follows.
  useEffect(() => { if (step > 0 && phase > step) setStep(phase); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { q.refetch(); refreshPartnerLive(qc); };
  const goBack = () => router.replace("/(partner)/active" as any);

  // NEVER render a booking whose id doesn't match the route id (guards against a
  // stale/previous booking briefly showing the wrong service in this wizard).
  if (q.isLoading || !b || String(b.id) !== String(id)) {
    return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;
  }

  const before: string[] = b.evidence?.before || [];
  const after: string[] = b.evidence?.after || [];
  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const addl = b.additional || null;
  const addlPending = !!addl && num(addl.total) > 0 && addl.status !== "paid";
  const demoOtp = (b.demo_otps || {}) as { start?: string; completion?: string };

  const upload = async (stage: "before" | "after", kind: "photo" | "video", asset: any) => {
    setBusy(`${stage}-${kind}`); setProgress(0);
    try {
      const ok = await uploadProofAsset(b.id, stage, asset, toast, setProgress);
      if (ok) { toast.success(`${kind === "photo" ? "Photo" : "Video"} added ✓`); refresh(); }
    } catch (e: any) { toast.error(e?.detail || e?.message || "Upload failed, please retry"); }
    finally { setBusy(null); setProgress(0); }
  };
  const proof = async (stage: "before" | "after", kind: "photo" | "video") => {
    const ok = kind === "video" ? await ensureVideoPermissions(toast) : await ensureCamera(toast);
    if (ok) setCam({ stage, kind });
  };
  const onShot = (shot: ProofShot) => {
    const c = cam; setCam(null);
    if (c) upload(c.stage, c.kind, { ...shot, type: shot.kind === "video" ? "video" : "image" });
  };
  const onCamFail = async (msg: string) => {
    const c = cam; setCam(null);
    if (!c) return;
    toast.info(`${msg} — opening phone camera`);
    await new Promise((r) => setTimeout(r, 400));
    const asset = await systemCameraCapture(c.kind);
    if (asset) upload(c.stage, c.kind, asset);
  };
  const removeProof = async (stage: "before" | "after", url: string) => {
    try { await api.post(`/bookings/${b.id}/evidence/remove`, { stage, url }); toast.success("Removed"); refresh(); }
    catch (e: any) { toast.error(e?.detail || "Could not remove"); }
  };
  const verify = async (path: "start-otp" | "complete", label: string) => {
    setBusy(path);
    try {
      const updated = await api.post<any>(`/bookings/${b.id}/${path}`, { otp });
      setOtp("");
      // Advance the wizard IMMEDIATELY from server truth — don't wait for the poll,
      // otherwise the partner can tap Complete while the cache still says "assigned"
      // (→ "Job not started yet") or the Start screen lingers after a verified OTP.
      if (updated && String(updated.id) === String(b.id)) {
        qc.setQueryData(["partner-booking", id], (old: any) => (old ? { ...old, ...updated } : updated));
      }
      setStep(path === "start-otp" ? 3 : 4);
      toast.success(label);
      refresh();
    } catch (e: any) { setOtp(""); toast.error(e?.detail || "Invalid OTP"); }
    finally { setBusy(null); }
  };

  const cur = Math.min(step, 3);
  const primary = colors.primary;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="job-wizard">
      {/* Header */}
      <LinearGradient colors={[primary, "#1976D2"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 8, paddingBottom: 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable testID="wizard-back" onPress={goBack} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}><Icon name="arrow-left" size={20} color="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }} numberOfLines={1}>{b.service_name}</Text>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 11.5, fontFamily: "monospace" }}>#{b.code}</Text>
          </View>
          <StatusBadge status={b.status} />
        </View>
        {/* Step indicator */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }} testID="wizard-steps">
          {STEPS.map((s, i) => {
            const done = i < cur || phase === 4; const active = i === cur && phase !== 4;
            return (
              <View key={s.key} style={{ flex: 1, alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                  <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? "transparent" : done || active ? "#fff" : "rgba(255,255,255,0.3)" }} />
                  <View testID={`wizard-step-${s.key}${active ? "-active" : done ? "-done" : ""}`} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: done ? "#fff" : active ? "#fff" : "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", borderWidth: active ? 3 : 0, borderColor: "rgba(255,255,255,0.45)" }}>
                    {done ? <Icon name="check" size={15} color={primary} /> : <Icon name={s.icon} size={15} color={active ? primary : "#fff"} />}
                  </View>
                  <View style={{ flex: 1, height: 2, backgroundColor: i === STEPS.length - 1 ? "transparent" : done ? "#fff" : "rgba(255,255,255,0.3)" }} />
                </View>
                <Text style={{ color: active ? "#fff" : "rgba(255,255,255,0.7)", fontSize: 10.5, fontWeight: active ? "800" : "600", marginTop: 5 }}>{s.label}</Text>
              </View>
            );
          })}
        </View>
      </LinearGradient>

      <KeyboardAwareScrollView bottomOffset={footerH + 16} contentContainerStyle={{ padding: 16, paddingBottom: footerH + 28, gap: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {(phase === 4 || step >= 4) ? <DoneStep b={b} /> :
          step === 0 ? <DetailsStep b={b} /> :
          step === 1 ? <CheckinStep b={b} onDone={refresh} /> :
          step === 2 ? (
            <StartStep b={b} before={before} locked={commLocked} demoOtp={demoOtp.start} otp={otp} setOtp={setOtp} busy={busy} progress={progress} onPhoto={() => proof("before", "photo")} onVideo={() => proof("before", "video")} onRemove={(u) => removeProof("before", u)} />
          ) : (
            <WorkStep b={b} after={after} addlPending={addlPending} demoOtp={demoOtp.completion} otp={otp} setOtp={setOtp} busy={busy} progress={progress} onPhoto={() => proof("after", "photo")} onVideo={() => proof("after", "video")} onRemove={(u) => removeProof("after", u)} onUpdate={refresh} />
          )}
      </KeyboardAwareScrollView>
      <ProofCamera visible={!!cam} kind={cam?.kind || "photo"} maxSec={MAX_VIDEO_SEC} onClose={() => setCam(null)} onCapture={onShot} onFail={onCamFail} />

      {/* Bottom CTA bar (replaces the hidden tab bar) — sticks right above the keyboard */}
      <KeyboardStickyView offset={{ opened: insets.bottom }} style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <View onLayout={(e) => setFooterH(Math.round(e.nativeEvent.layout.height))} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 14, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }} testID="wizard-footer">
        {(phase === 4 || step >= 4) ? (
          <Cta testID="wizard-finish" label="Back to Active Jobs" icon="arrow-left" color={EMERALD} onPress={() => router.replace("/(partner)/active" as any)} />
        ) : step === 0 ? (
          <Cta testID="wizard-continue" label={phase >= 3 ? "Continue to Complete Job" : phase >= 2 ? "Continue to Start Job" : "Continue"} icon="arrow-right" color={primary} onPress={() => setStep(phase)} />
        ) : step === 1 ? (
          phase >= 2 ? <Cta testID="wizard-next" label="Continue to Start Job" icon="arrow-right" color={primary} onPress={() => setStep(2)} /> : <Text style={{ color: colors.textMuted, fontSize: 12.5, textAlign: "center" }}>Take your selfie & share live location above, then tap <Text style={{ fontWeight: "800" }}>Check-in & Continue</Text>.</Text>
        ) : step === 2 ? (
          <Cta testID={`start-otp-${b.code}`} label={busy === "start-otp" ? "Verifying…" : "Verify OTP & Start Job"} icon="play-circle-outline" color={primary} disabled={commLocked || before.length === 0 || otp.length < 4 || !!busy} onPress={() => verify("start-otp", "Job started ✓")} />
        ) : (
          <Cta testID={`complete-otp-${b.code}`} label={busy === "complete" ? "Completing…" : addlPending ? "Additional payment pending" : (b.payment_method === "cos" ? "Payment Received · Complete Job" : "Verify OTP & Complete Job")} icon="check-decagram-outline" color={EMERALD} disabled={addlPending || after.length === 0 || otp.length < 4 || !!busy} onPress={() => verify("complete", b.payment_method === "cos" ? "Cash received · Job completed! 🎉" : "Job completed! Earnings credited 🎉")} />
        )}
      </View>
      </KeyboardStickyView>
    </View>
  );
}

function Cta({ label, icon, color, onPress, disabled, testID }: { label: string; icon: MdiName; color: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Pressable testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ height: 54, borderRadius: 6, backgroundColor: color, opacity: disabled ? 0.45 : 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      <Icon name={icon} size={20} color="#fff" /><Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

function Card({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: any }) {
  const { colors } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 16 }, style]}>{children}</View>;
}
function SectionTitle({ icon, title }: { icon: MdiName; title: string }) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}><Icon name={icon} size={15} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</Text></View>;
}
/* ── Step 1: Details ── */
function DetailsStep({ b }: { b: any }) {
  const { colors } = useTheme();
  const [tlOpen, setTlOpen] = useState(false);
  const a = b.address || {};
  const timeline: any[] = b.timeline || [];
  return (
    <>
      <Card testID="wizard-details">
        <SectionTitle icon="clipboard-text-outline" title="Job details" />
        <JobDetailsBlock b={b} />
      </Card>
      <Card testID="wizard-customer">
        <SectionTitle icon="account-outline" title="Customer details" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {b.customer_photo ? <Image source={{ uri: mediaUrl(b.customer_photo) }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" cachePolicy="memory-disk" /> : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.primary, fontWeight: "900", fontSize: 17 }}>{String(b.customer_name || "C").trim().charAt(0).toUpperCase()}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>{b.customer_name || "Customer"}</Text>
            {b.customer_phone ? <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>{b.customer_phone}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, backgroundColor: colors.surfaceSubtle, borderRadius: 6, padding: 10 }}>
          <Icon name="map-marker-outline" size={16} color={colors.secondary} />
          <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 19, flex: 1 }}>{a.line || "Address unavailable"}{a.landmark ? `, ${a.landmark}` : ""}{a.city ? `, ${a.city}` : ""}{a.pincode ? ` · ${a.pincode}` : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {b.customer_phone ? <Pressable testID="wizard-call" onPress={() => Linking.openURL(`tel:${b.customer_phone}`)} style={{ flex: 1, height: 42, borderRadius: 6, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}><Icon name="phone-outline" size={16} color="#047857" /><Text style={{ color: "#047857", fontWeight: "700" }}>Call</Text></Pressable> : null}
          <Pressable testID="wizard-navigate" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${a.lat && a.lng ? `${a.lat},${a.lng}` : encodeURIComponent(`${a.line || ""}, ${a.city || ""}`)}`)} style={{ flex: 1, height: 42, borderRadius: 6, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}><Icon name="navigation-variant-outline" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "700" }}>Navigate</Text></Pressable>
        </View>
      </Card>
      {timeline.length ? (
        <Card testID="wizard-timeline">
          <Pressable testID="wizard-timeline-toggle" onPress={() => setTlOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="clock-outline" size={15} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 }}>Job timeline</Text>
              <View style={{ backgroundColor: colors.primarySubtle, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>{timeline.length}</Text></View>
            </View>
            <Icon name={tlOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.textMuted} />
          </Pressable>
          {tlOpen ? (
            <View testID="wizard-timeline-list" style={{ borderLeftWidth: 1, borderLeftColor: colors.border, marginLeft: 6, gap: 12, paddingTop: 2, marginTop: 12 }}>
              {timeline.map((t: any, i: number) => (
                <View key={i} style={{ marginLeft: 16 }}>
                  <View style={{ position: "absolute", left: -23, top: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: i === timeline.length - 1 ? colors.secondary : colors.border, borderWidth: 3, borderColor: colors.primarySubtle }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600", textTransform: "capitalize" }}>{String(t.status || "").replace(/_/g, " ")}</Text>
                  <Text style={{ color: SLATE400, fontSize: 11 }}>{fmtShort(t.at)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function CheckinStep({ b, onDone }: { b: any; onDone: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [selfie, setSelfie] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc?: number | null } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const a = b.address || {};
  const done = !!b.checkin;
  const locked = !!b.schedule?.comm_locked;
  const dist = useMemo(() => (loc && a.lat && a.lng ? haversineKm(loc.lat, loc.lng, Number(a.lat), Number(a.lng)) : null), [loc, a.lat, a.lng]);

  const getLocation = async () => {
    setLocBusy(true);
    try {
      let p = await Location.getForegroundPermissionsAsync();
      if (!p.granted && p.canAskAgain) p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) { toast.error("Location permission is required for check-in."); if (!p.canAskAgain) Linking.openSettings(); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
    } catch { toast.error("Couldn't get your location. Check GPS and try again."); }
    finally { setLocBusy(false); }
  };
  useEffect(() => { if (!done) getLocation(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [camOpen, setCamOpen] = useState(false);
  const pickerSelfie = async () => {
    try {
      let res;
      try {
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7, base64: false, exif: false, cameraType: ImagePicker.CameraType.front });
      } catch {
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7, base64: false, exif: false });
      }
      if (res.canceled || !res.assets?.[0]?.uri) {
        // Android may kill the app while the system camera is open — recover the photo.
        const pending: any = await ImagePicker.getPendingResultAsync().catch(() => null);
        const a = Array.isArray(pending) ? pending[0]?.assets?.[0] : pending?.assets?.[0];
        if (!a?.uri) return;
        res = { canceled: false, assets: [a] } as any;
      }
      const msg = oversizeMessage(assetSizeBytes(res.assets[0]), "camera");
      if (msg) { toast.error(msg); return; }
      setSelfie(res.assets[0]);
    } catch (e: any) {
      toast.error(e?.detail || e?.message || "Couldn't open the camera. Please try again.");
    }
  };
  const takeSelfie = async () => {
    if (!(await ensureCamera(toast))) return;
    setCamOpen(true);
  };
  const onCamFail = (m: string) => {
    setCamOpen(false);
    toast.info(m);
    setTimeout(pickerSelfie, 400);
  };
  const submit = async () => {
    if (!selfie || !loc) return;
    setSending(true);
    try {
      const small = await shrinkForUpload(selfie, 1200, 0.75);
      await uploadAsset(`/bookings/${b.id}/checkin`, "checkin", small, { lat: String(loc.lat), lng: String(loc.lng) });
      toast.success("Checked in ✓ — you're marked Arrived");
      onDone();
    } catch (e: any) { toast.error(e?.detail || e?.message || "Check-in failed, please retry"); }
    finally { setSending(false); }
  };

  if (done) {
    const c = b.checkin;
    return (
      <Card testID="wizard-checkin-done">
        <SectionTitle icon="check-circle-outline" title="Checked in" />
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Image source={{ uri: mediaUrl(c.selfie_url) }} style={{ width: 96, height: 120, borderRadius: 6 }} contentFit="cover" />
          <View style={{ flex: 1, justifyContent: "center", gap: 6 }}>
            <Text style={{ color: "#047857", fontSize: 15, fontWeight: "800" }}>Selfie & location recorded</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{fmtDT(c.at)}</Text>
            {c.distance_km != null ? <Text style={{ color: c.far ? "#B45309" : colors.textMuted, fontSize: 12.5, fontWeight: "600" }}>~{c.distance_km} km from customer address</Text> : null}
          </View>
        </View>
      </Card>
    );
  }
  return (
    <>
      <Card testID="wizard-checkin">
        <SectionTitle icon="camera-account" title="Step 1 · Live selfie" />
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginBottom: 12 }}>Take a clear selfie at the customer's door. Front camera only — this is shared with the customer & admin for safety.</Text>
        <Pressable testID="wizard-selfie-btn" onPress={takeSelfie} style={{ alignSelf: "center", width: 160, height: 200, borderRadius: 6, borderWidth: 2, borderStyle: selfie ? "solid" : "dashed", borderColor: selfie ? EMERALD : "#93C5FD", backgroundColor: selfie ? "transparent" : "rgba(239,246,255,0.7)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {selfie ? <Image source={{ uri: selfie.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : (
            <><Icon name="camera-front-variant" size={36} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", marginTop: 8 }}>Take selfie</Text></>
          )}
        </Pressable>
        <SelfieCamera visible={camOpen} onClose={() => setCamOpen(false)} onFail={onCamFail} onCapture={(shot) => { setCamOpen(false); setSelfie({ ...shot, type: "image" } as any); }} />
        {selfie ? <Pressable testID="wizard-selfie-retake" onPress={takeSelfie} style={{ alignSelf: "center", marginTop: 8 }}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Retake</Text></Pressable> : null}
      </Card>
      <Card testID="wizard-location">
        <SectionTitle icon="crosshairs-gps" title="Step 2 · Live location" />
        {loc ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}><Icon name="map-marker-check-outline" size={20} color="#047857" /></View>
            <View style={{ flex: 1 }}>
              <Text testID="wizard-location-ok" style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>Location captured</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}{loc.acc ? ` · ±${Math.round(loc.acc)} m` : ""}</Text>
              {dist != null ? <Text style={{ color: dist > 0.5 ? "#B45309" : "#047857", fontSize: 12, fontWeight: "700", marginTop: 2 }}>{dist > 0.5 ? `You appear ~${dist.toFixed(1)} km from the customer's address` : "You're at the customer's location ✓"}</Text> : null}
            </View>
            <Pressable testID="wizard-location-refresh" onPress={getLocation} hitSlop={8}><Icon name="refresh" size={20} color={colors.textMuted} /></Pressable>
          </View>
        ) : (
          <Pressable testID="wizard-location-btn" onPress={getLocation} disabled={locBusy} style={{ height: 46, borderRadius: 6, borderWidth: 1, borderColor: "#BFDBFE", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
            {locBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="crosshairs-gps" size={18} color={colors.primary} />}<Text style={{ color: colors.primary, fontWeight: "700" }}>{locBusy ? "Getting location…" : "Share live location"}</Text>
          </Pressable>
        )}
      </Card>
      {locked ? (
        <View style={{ borderRadius: 6, backgroundColor: colors.surfaceSubtle, padding: 14, flexDirection: "row", gap: 8 }}><Icon name="lock-outline" size={16} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12.5, flex: 1 }}>Check-in opens 30 minutes before the scheduled time ({b.schedule?.scheduled_time}).</Text></View>
      ) : null}
      <Pressable testID="wizard-checkin-submit" disabled={!selfie || !loc || sending || locked} onPress={submit} style={{ height: 54, borderRadius: 6, backgroundColor: colors.primary, opacity: !selfie || !loc || sending || locked ? 0.45 : 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
        {sending ? <ActivityIndicator color="#fff" /> : <Icon name="check-circle-outline" size={20} color="#fff" />}<Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>{sending ? "Checking in…" : "Check-in & Continue"}</Text>
      </Pressable>
    </>
  );
}

/* ── Step 3: Before proof + Start OTP ── */
function StartStep({ b, before, locked, demoOtp, otp, setOtp, busy, progress, onPhoto, onVideo, onRemove }: any) {
  const { colors } = useTheme();
  return (
    <>
      {locked ? (
        <View testID={`start-locked-${b.code}`} style={{ borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="lock-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Start Work locked</Text></View>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>You can start this job 30 minutes before {b.schedule?.scheduled_time} on {b.schedule?.scheduled_date}.</Text>
        </View>
      ) : null}
      <Card testID="wizard-before-proof">
        <SectionTitle icon="camera-outline" title="Before work proof" />
        <ProofGrid items={before} onPhoto={onPhoto} onVideo={onVideo} onRemove={onRemove} busy={!!busy && String(busy).startsWith("before")} progress={progress} testID={`before-ev-${b.code}`} locked={locked} />
      </Card>
      <Card testID="wizard-start-otp" style={{ borderColor: "#DBEAFE", backgroundColor: "rgba(239,246,255,0.5)" }}>
        <SectionTitle icon="shield-check-outline" title="Customer verification" />
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginBottom: 14 }}>Ask the customer for their <Text style={{ fontWeight: "800" }}>Start OTP</Text> to begin the job.</Text>
        <OtpBoxes value={otp} onChange={setOtp} />
        {demoOtp ? <Text testID="demo-start-otp" style={{ color: colors.info, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 10 }}>Demo · Start OTP {demoOtp}</Text> : null}
        {before.length === 0 ? <Text style={{ color: "#B45309", fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 10 }}>Add at least one before-work photo/video to enable Start.</Text> : null}
      </Card>
    </>
  );
}

/* ── Step 4: Work in progress → after proof + Complete OTP ── */
function WorkStep({ b, after, addlPending, demoOtp, otp, setOtp, busy, progress, onPhoto, onVideo, onRemove, onUpdate }: any) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const startedAt = (b.timeline || []).filter((t: any) => ["started", "in_progress"].includes(t.status)).map((t: any) => t.at).pop();
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const es = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const elapsed = `${String(Math.floor(es / 3600)).padStart(2, "0")}:${String(Math.floor((es % 3600) / 60)).padStart(2, "0")}:${String(es % 60).padStart(2, "0")}`;
  return (
    <>
      <LinearGradient colors={["#F59E0B", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" }} />
        <View style={{ flex: 1 }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>WORK IN PROGRESS</Text><Text style={{ color: "rgba(255,251,235,0.9)", fontSize: 11.5 }}>{startedAt ? `Started ${new Date(startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</Text></View>
        <Text testID={`elapsed-${b.code}`} style={{ color: "#fff", fontWeight: "800", fontSize: 15, fontVariant: ["tabular-nums"], backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}>{elapsed}</Text>
      </LinearGradient>
      <HelpSOS booking={b} testPrefix="wizard-" />
      <Card testID="wizard-after-proof">
        <SectionTitle icon="camera-outline" title="After work proof" />
        <ProofGrid items={after} onPhoto={onPhoto} onVideo={onVideo} onRemove={onRemove} busy={!!busy && String(busy).startsWith("after")} progress={progress} testID={`after-ev-${b.code}`} />
      </Card>
      <AdditionalWork b={b} onUpdate={onUpdate} />
      {addlPending ? (
        <View testID={`complete-locked-${b.code}`} style={{ borderRadius: 6, borderWidth: 2, borderColor: "#FCD34D", backgroundColor: "#FFFBEB", paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="alert-outline" size={16} color="#B45309" /><Text style={{ color: "#92400E", fontSize: 14, fontWeight: "800" }}>Additional payment pending</Text></View>
          <Text style={{ color: "#B45309", fontSize: 12.5, marginTop: 4 }}>Customer must pay the additional work first — then complete with OTP.</Text>
        </View>
      ) : (
        <>
        {b.payment_method === "cos" && b.cos ? (
          <Card testID="wizard-cos-collect" style={{ borderColor: "#FED7AA", backgroundColor: "#FFF7ED" }}>
            <SectionTitle icon="cash-multiple" title="Collect Cash on Service" />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}><Text style={{ color: "#9A3412", fontSize: 13 }}>Token already paid online</Text><Text style={{ color: "#9A3412", fontSize: 13, fontWeight: "700" }}>{fmt(b.cos.token_amount)}</Text></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, borderTopWidth: 1, borderTopColor: "#FED7AA", paddingTop: 8 }}><Text style={{ color: "#7C2D12", fontSize: 15, fontWeight: "800" }}>Cash to collect now</Text><Text testID={`cos-cash-${b.code}`} style={{ color: "#7C2D12", fontSize: 18, fontWeight: "900" }}>{fmt(b.cos.cash_to_collect)}</Text></View>
            <Text style={{ color: "#B45309", fontSize: 12, marginTop: 8 }}>Collect this amount in cash from the customer, then enter the Completion OTP and tap "Payment Received".</Text>
          </Card>
        ) : null}
        <Card testID="wizard-complete-otp" style={{ borderColor: "#D1FAE5", backgroundColor: "rgba(236,253,245,0.5)" }}>
          <SectionTitle icon="check-circle-outline" title="Complete the job" />
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginBottom: 14 }}>Enter the customer's <Text style={{ fontWeight: "800" }}>Completion OTP</Text> to finish & credit your earnings.</Text>
          <OtpBoxes value={otp} onChange={setOtp} />
          {demoOtp ? <Text testID="demo-complete-otp" style={{ color: colors.info, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 10 }}>Demo · Completion OTP {demoOtp}</Text> : null}
          {after.length === 0 ? <Text style={{ color: "#B45309", fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 10 }}>Add at least one after-work photo/video to enable Complete.</Text> : null}
        </Card>
        </>
      )}
    </>
  );
}

/* ── Done ── */
function DoneStep({ b }: { b: any }) {
  const { colors } = useTheme();
  const earning = b.commission?.partner_earning ?? b.breakdown?.earning?.net_earning ?? null;
  return (
    <Card testID="wizard-done" style={{ alignItems: "center", paddingVertical: 32 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}><Icon name="check-decagram" size={44} color={EMERALD} /></View>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 16 }}>Job completed!</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 6, textAlign: "center" }}>{b.service_name} · #{b.code}</Text>
      {earning != null ? <View style={{ marginTop: 18, borderRadius: 6, backgroundColor: "rgba(236,253,245,0.8)", borderWidth: 1, borderColor: "#A7F3D0", paddingHorizontal: 22, paddingVertical: 12, alignItems: "center" }}><Text style={{ color: "#047857", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>You earned</Text><Text style={{ color: "#047857", fontSize: 26, fontWeight: "900" }}>{fmt(earning)}</Text></View> : null}
      {b.payment_method === "cos" && b.cos ? (
        <View testID="done-cos-receipt" style={{ marginTop: 16, width: "100%", borderRadius: 6, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}><Icon name="cash-multiple" size={15} color="#9A3412" /><Text style={{ color: "#9A3412", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>Cash On Service</Text></View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}><Text style={{ color: "#9A3412", fontSize: 13 }}>Token already paid online</Text><Text style={{ color: "#9A3412", fontSize: 13, fontWeight: "700" }}>{fmt(b.cos.token_amount)}</Text></View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderTopWidth: 1, borderTopColor: "#FED7AA", marginTop: 3, paddingTop: 6 }}><Text style={{ color: "#7C2D12", fontSize: 13, fontWeight: "700" }}>Cash collected from customer</Text><Text testID="done-cos-cash" style={{ color: "#7C2D12", fontSize: 14, fontWeight: "900" }}>{fmt(b.cos.collected_amount ?? b.cos.cash_to_collect)}</Text></View>
        </View>
      ) : null}
    </Card>
  );
}
