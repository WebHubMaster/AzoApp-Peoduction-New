/**
 * Shared Registration UI kit — used by BOTH Partner and Merchant wizards.
 * Mirrors the web panel registration flows (score ring, stepper, status banners,
 * photo capture with GPS, pincode serviceability, current-location detect).
 */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, Linking } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { Card, Button } from "@/src/components/ui";
import { api, API_BASE, getToken, mediaUrl } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";

export type Cov = { serviceable?: boolean; serviced_cities?: string[] } | null;

/* ------------------------------------------------------------ ScoreRing */
export function ScoreRing({ score = 0, size = 68 }: { score?: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke="rgba(255,255,255,0.25)" fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke="#fff" fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </Svg>
      <Text style={{ position: "absolute", color: "#fff", fontWeight: "900", fontSize: fontSize.md }}>{score}%</Text>
    </View>
  );
}

/* --------------------------------------------------------- Score banner */
export function ScoreBanner({ score, title, subtitle }: { score: number; title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <ScoreRing score={score} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontSize: fontSize.md, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.xs, marginTop: 2 }}>{subtitle}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- Stepper */
export function Stepper({ steps, step, onStep }: { steps: { key: string; label: string; icon: MdiName }[]; step: number; onStep?: (i: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <Pressable disabled={i > step} onPress={() => i <= step && onStep?.(i)} style={{ alignItems: "center" }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: i < step ? colors.success : i === step ? colors.primary : colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
                <Icon name={i < step ? "check" : s.icon} size={16} color={i <= step ? "#fff" : colors.textMuted} />
              </View>
            </Pressable>
            {i < steps.length - 1 ? <View style={{ flex: 1, height: 2, backgroundColor: i < step ? colors.success : colors.border, marginHorizontal: 3 }} /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/* --------------------------------------------------------- Status banners */
export function StatusBanner({ status, reason }: { status: string; reason?: string }) {
  const { colors } = useTheme();
  if (status === "rejected") {
    return (
      <View style={{ backgroundColor: colors.dangerSubtle, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", gap: 10 }}>
        <Icon name="alert-circle" size={20} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.danger, fontWeight: "800", fontSize: fontSize.sm }}>Application needs changes</Text>
          {reason ? <Text style={{ color: colors.danger, fontSize: fontSize.xs, marginTop: 3 }}>{reason}</Text> : null}
          <Text style={{ color: colors.danger, fontSize: fontSize.xs, marginTop: 3, opacity: 0.85 }}>Please correct the details below and submit again.</Text>
        </View>
      </View>
    );
  }
  return null;
}

export function UnderReviewCard({ onRefresh, refreshing }: { onRefresh: () => void; refreshing?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg }} testID="reg-under-review">
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.warningSubtle, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg }}>
        <Icon name="clock-outline" size={44} color={colors.warning} />
      </View>
      <Text style={{ color: colors.text, fontSize: fontSize.xxl, fontWeight: "900", textAlign: "center" }}>Account Under Review</Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center", marginTop: 8, lineHeight: 20 }}>
        Your account is under review. You will receive an update within 24–48 hours. Please wait until your account is approved.
      </Text>
      <View style={{ marginTop: spacing.md, backgroundColor: colors.warningSubtle, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill }}>
        <Text style={{ color: colors.warning, fontWeight: "800", fontSize: fontSize.sm }}>Under Review</Text>
      </View>
      <View style={{ marginTop: spacing.xl, minWidth: 200 }}>
        <Button title="Refresh status" variant="outline" icon="refresh" onPress={onRefresh} loading={refreshing} testID="reg-refresh-status" />
      </View>
    </View>
  );
}

/* ----------------------------------------------------------- Field rows */
export function Field({ label, value, onChange, keyboard, placeholder, autoCap, maxLength, hint, last, disabled }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700", marginBottom: 4 }}>{label}</Text>
      <TextInput value={value} editable={!disabled} onChangeText={onChange} placeholder={placeholder || label} placeholderTextColor={colors.textMuted}
        keyboardType={keyboard || "default"} autoCapitalize={autoCap || "sentences"} maxLength={maxLength}
        style={{ color: disabled ? colors.textMuted : colors.text, fontSize: fontSize.md, fontWeight: "600", paddingVertical: 4 }} />
      {hint ? <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{hint}</Text> : null}
    </View>
  );
}

export function PickRow({ label, value, onPress, last, testID }: any) {
  const { colors } = useTheme();
  const tid = testID || `pickrow-${String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  return (
    <Pressable testID={tid} onPress={onPress} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: value ? colors.text : colors.textMuted, fontSize: fontSize.md, fontWeight: "600", marginTop: 2 }}>{value || "Select"}</Text>
      </View>
      <Icon name="chevron-down" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export function Rev({ k, v, last }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{k}</Text>
      <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "700", flex: 1, textAlign: "right" }}>{v || "—"}</Text>
    </View>
  );
}

/* --------------------------------------------------------- Picker sheet */
export type PickerCfg = { title: string; options: { id: string; name: string }[]; search?: boolean; onSel: (o: { id: string; name: string }) => void };
export function PickerSheet({ cfg, onClose }: { cfg: PickerCfg | null; onClose: () => void }) {
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  useEffect(() => { setQ(""); }, [cfg]);
  const opts = (cfg?.options || []).filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 80);
  return (
    <Modal visible={!!cfg} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xl, maxHeight: "72%" }}>
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800", marginBottom: spacing.sm }}>{cfg?.title}</Text>
          {cfg?.search ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 46, marginBottom: spacing.sm }}>
              <Icon name="magnify" size={18} color={colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Type to search…" placeholderTextColor={colors.textMuted} autoFocus style={{ flex: 1, color: colors.text, fontSize: fontSize.md }} />
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            {opts.map((o) => (
              <Pressable key={o.id} testID={`opt-${o.id}`} onPress={() => { cfg?.onSel(o); onClose(); }} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "600" }}>{o.name}</Text>
              </Pressable>
            ))}
            {opts.length === 0 ? <Text style={{ color: colors.textMuted, paddingVertical: 24, textAlign: "center" }}>No options available</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------------------------------------------------- media upload */
async function ensureCamera(): Promise<boolean> {
  let p = await ImagePicker.getCameraPermissionsAsync();
  if (!p.granted) { p = await ImagePicker.requestCameraPermissionsAsync(); }
  if (!p.granted && !p.canAskAgain) { Linking.openSettings(); return false; }
  return p.granted;
}
async function ensureGallery(): Promise<boolean> {
  let p = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!p.granted) { p = await ImagePicker.requestMediaLibraryPermissionsAsync(); }
  if (!p.granted && !p.canAskAgain) { Linking.openSettings(); return false; }
  return p.granted;
}

export async function uploadAsset(
  base: string,
  docType: string,
  asset: ImagePicker.ImagePickerAsset,
  extra?: Record<string, string>,
): Promise<any> {
  const fd = new FormData();
  // @ts-ignore RN FormData file shape
  fd.append("file", { uri: asset.uri, name: asset.fileName || `${docType}.jpg`, type: asset.mimeType || "image/jpeg" });
  fd.append("doc_type", docType);
  if (extra) Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  const token = await getToken();
  const r = await fetch(`${API_BASE}${base}/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  if (!r.ok) { const t = await r.text(); throw new Error(t || "upload failed"); }
  return r.json();
}

/**
 * PhotoField — capture from camera or gallery, upload, show preview.
 * mode: "both" (choice), "camera" (live photo), "gallery".
 */
export function PhotoField({
  base, docType, label, hint, value, onUploaded, mode = "both", cameraType, extra, gps, dashed, last,
}: {
  base: string; docType: string; label: string; hint?: string; value?: string;
  onUploaded: (data: any, asset?: ImagePicker.ImagePickerAsset) => void;
  mode?: "both" | "camera" | "gallery"; cameraType?: "front" | "back";
  extra?: Record<string, string>; gps?: boolean; dashed?: boolean; last?: boolean;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState(false);

  const run = async (source: "camera" | "gallery") => {
    setChoose(false);
    setBusy(true);
    try {
      let ok = source === "camera" ? await ensureCamera() : await ensureGallery();
      if (!ok) { toast.error("Permission needed. Enable it in Settings."); setBusy(false); return; }
      let ex = { ...(extra || {}) };
      if (gps) {
        try {
          let lp = await Location.getForegroundPermissionsAsync();
          if (!lp.granted) lp = await Location.requestForegroundPermissionsAsync();
          if (lp.granted) {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            ex.lat = String(loc.coords.latitude); ex.lng = String(loc.coords.longitude);
          }
        } catch { /* gps optional here */ }
      }
      const res = source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, cameraType: cameraType === "front" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
      if (res.canceled || !res.assets?.[0]) { setBusy(false); return; }
      const data = await uploadAsset(base, docType, res.assets[0], ex);
      if (ex.lat && ex.lng) { data._lat = Number(ex.lat); data._lng = Number(ex.lng); }
      onUploaded(data, res.assets[0]);
      toast.success(`${label} uploaded`);
    } catch (e: any) {
      toast.error("Upload failed, try again");
    }
    setBusy(false);
  };

  const onPress = () => { if (mode === "camera") run("camera"); else if (mode === "gallery") run("gallery"); else setChoose(true); };

  return (
    <>
      <Pressable onPress={onPress} disabled={busy}
        style={dashed
          ? { borderWidth: 2, borderStyle: "dashed", borderColor: value ? colors.success : colors.border, borderRadius: radius.md, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: value ? colors.successSubtle : colors.surfaceSubtle }
          : { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
        {value ? (
          <Image source={{ uri: mediaUrl(value) }} style={{ width: 46, height: 46, borderRadius: 8 }} contentFit="cover" />
        ) : (
          <View style={{ width: 46, height: 46, borderRadius: 8, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
            <Icon name={busy ? "progress-upload" : mode === "camera" ? "camera" : "camera-plus"} size={22} color={colors.primary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "700" }}>{label}</Text>
          <Text style={{ color: value ? colors.success : colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>
            {busy ? "Uploading…" : value ? "Uploaded — tap to change" : hint || "Tap to upload"}
          </Text>
        </View>
        {value ? <Icon name="check-circle" size={20} color={colors.success} /> : null}
      </Pressable>

      <Modal visible={choose} transparent animationType="fade" onRequestClose={() => setChoose(false)}>
        <Pressable onPress={() => setChoose(false)} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xl }}>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800", marginBottom: spacing.md }}>{label}</Text>
            <Pressable testID="pick-camera" onPress={() => run("camera")} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Icon name="camera" size={22} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "600" }}>Take a photo</Text>
            </Pressable>
            <Pressable testID="pick-gallery" onPress={() => run("gallery")} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
              <Icon name="image-multiple" size={22} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "600" }}>Choose from gallery</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ---------------------------------------------------- serviceability hook */
export function useServiceability(pincode: string) {
  const [checking, setChecking] = useState(false);
  const [cov, setCov] = useState<Cov>(null);
  useEffect(() => {
    const pin = String(pincode || "").trim();
    if (pin.length !== 6) { setCov(null); setChecking(false); return; }
    let alive = true;
    setChecking(true);
    api.get<Cov>(`/geo/serviceability?pincode=${pin}`)
      .then((r) => { if (alive) setCov(r); })
      .catch(() => { if (alive) setCov(null); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [pincode]);
  return { checking, cov };
}

export function PincodeBadge({ pincode, checking, cov }: { pincode: string; checking: boolean; cov: Cov }) {
  const { colors } = useTheme();
  if (String(pincode || "").length !== 6) return null;
  if (checking) return <Pill bg={colors.surfaceSubtle} fg={colors.textSecondary} icon="progress-clock" text="Checking availability…" />;
  if (cov?.serviceable === true) return <Pill bg={colors.successSubtle} fg={colors.success} icon="check-circle" text="We serve your area" testID="reg-pincode-serviceable" />;
  if (cov?.serviceable === false) return <Pill bg={colors.dangerSubtle} fg={colors.danger} icon="alert" text="Not serviceable" testID="reg-pincode-blocked" />;
  return null;
}

function Pill({ bg, fg, icon, text, testID }: { bg: string; fg: string; icon: MdiName; text: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
      <Icon name={icon} size={14} color={fg} />
      <Text style={{ color: fg, fontSize: fontSize.xs, fontWeight: "800" }}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------- current location detect */
export async function detectLocation(): Promise<{ lat: number; lng: number; geo: any } | null> {
  let lp = await Location.getForegroundPermissionsAsync();
  if (!lp.granted) lp = await Location.requestForegroundPermissionsAsync();
  if (!lp.granted) { if (!lp.canAskAgain) Linking.openSettings(); return null; }
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const { latitude: lat, longitude: lng } = loc.coords;
  let geo: any = {};
  try { geo = await api.get(`/geo/reverse?lat=${lat}&lng=${lng}`); } catch { /* autofill optional */ }
  return { lat, lng, geo };
}
