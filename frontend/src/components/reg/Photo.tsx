import React, { useState } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator, Linking, Platform } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { File as FsFile, UploadType } from "expo-file-system";
import { Camera, RefreshCw, CheckCircle2, CameraOff, AlertTriangle, FileText, MapPin, Image as ImageIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE, getToken, mediaUrl } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { TW, T, usePal } from "./tokens";
import { Field } from "./Fields";

/* ---------------- media helpers ---------------- */
async function ensurePerm(kind: "camera" | "gallery"): Promise<boolean> {
  let p = kind === "camera" ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!p.granted) p = kind === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!p.granted && !p.canAskAgain) Linking.openSettings();
  return p.granted;
}

export async function pickImage(source: "camera" | "gallery", facing: "front" | "back" = "back"): Promise<ImagePicker.ImagePickerAsset | null> {
  if (!(await ensurePerm(source))) throw new Error(source === "camera" ? "Camera permission denied. Please allow camera access and try again." : "Gallery permission denied. Please allow photo access and try again.");
  // Small delay after the permission grant so the native camera UI reliably launches
  // (works around an Android permission-resolution race where launchCameraAsync no-ops).
  if (source === "camera") await new Promise((r) => setTimeout(r, 250));
  const res = source === "camera"
    ? await ImagePicker.launchCameraAsync({ quality: 0.85, cameraType: facing === "front" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ["images"] });
  return res.canceled ? null : res.assets?.[0] || null;
}

const parseUploadError = (status: number, text: string) => {
  let d = `Upload failed (${status})`;
  try { d = JSON.parse(text)?.detail || d; } catch { /* noop */ }
  return new Error(typeof d === "string" ? d : JSON.stringify(d));
};

/* Multipart upload — native uses expo-file-system File.upload (expo/fetch does not support {uri} parts). */
export async function uploadAsset(base: string, docType: string, asset: ImagePicker.ImagePickerAsset, extra?: Record<string, string>): Promise<any> {
  const token = await getToken();
  const url = `${API_BASE}${base}/upload`;
  const mime = asset.mimeType || "image/jpeg";
  const params: Record<string, string> = { doc_type: docType };
  if (extra) Object.entries(extra).forEach(([k, v]) => { if (v) params[k] = v; });

  if (Platform.OS === "web") {
    const fd = new FormData();
    const blob = await (await fetch(asset.uri)).blob();
    fd.append("file", blob, asset.fileName || `${docType}_${Date.now()}.jpg`);
    Object.entries(params).forEach(([k, v]) => fd.append(k, v));
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (!r.ok) throw parseUploadError(r.status, await r.text());
    return r.json();
  }

  const res = await new FsFile(asset.uri).upload(url, {
    httpMethod: "POST", uploadType: UploadType.MULTIPART, fieldName: "file", mimeType: mime, parameters: params,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status < 200 || res.status >= 300) throw parseUploadError(res.status, res.body);
  return JSON.parse(res.body);
}

/* Camera / gallery choice sheet */
export function SourceSheet({ open, onClose, onPick, title }: { open: boolean; onClose: () => void; onPick: (s: "camera" | "gallery") => void; title: string }) {
  const P = usePal();
  const insets = useSafeAreaInsets();
  const row = (s: "camera" | "gallery", Ic: any, label: string, last?: boolean) => (
    <Pressable testID={`pick-${s}`} onPress={() => { onClose(); onPick(s); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: TW.slate100 }}>
      <Ic size={20} color={P[700]} /><Text style={{ ...T.sm, fontWeight: "500", color: TW.slate700 }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} onPress={onClose} />
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: insets.bottom + 8 }}>
          <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate700, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: TW.slate100 }}>{title}</Text>
          {row("camera", Camera, "Take a photo")}
          {row("gallery", ImageIcon, "Choose from gallery", true)}
        </View>
      </View>
    </Modal>
  );
}

const ErrorBox = ({ text, Icon = CameraOff, onRetry }: { text: string; Icon?: any; onRetry?: () => void }) => (
  <View style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 8, backgroundColor: TW.red50, borderWidth: 1, borderColor: TW.red200, padding: 10 }}>
    <Icon size={16} color={TW.red600} style={{ marginTop: 2 }} />
    <Text style={{ flex: 1, ...T.xs, color: TW.red600 }}>{text}</Text>
    {onRetry ? <Pressable onPress={onRetry}><Text style={{ ...T.xs, fontWeight: "600", color: TW.red600, textDecorationLine: "underline" }}>Retry</Text></Pressable> : null}
  </View>
);

/* ---------------- Document uploader (dashed box) ---------------- */
export function Uploader({ label, value, onUploaded, docType, aadhaar, ocr, required, base, variant = "partner" }: {
  label: string; value?: string; onUploaded: (d: any) => void; docType: string; aadhaar?: string; ocr?: any; required?: boolean; base: string; variant?: "partner" | "merchant";
}) {
  const P = usePal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState(false);
  const run = async (s: "camera" | "gallery") => {
    setBusy(true);
    try {
      const asset = await pickImage(s, "back");
      if (asset) { onUploaded(await uploadAsset(base, docType, asset, aadhaar ? { aadhaar_number: aadhaar } : undefined)); toast.success(`${label} uploaded`); }
    } catch (e: any) { toast.error(e?.message || "Upload failed"); }
    setBusy(false);
  };
  const Idle = variant === "partner" ? Camera : FileText;
  return (
    <Field label={label} required={required}>
      <Pressable testID={`upload-${docType}`} disabled={busy} onPress={() => setChoose(true)}
        style={{ borderRadius: 12, borderWidth: 2, borderStyle: "dashed", padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderColor: value ? TW.emerald300 : TW.slate200, backgroundColor: value ? TW.emerald50 : TW.slate50 }}>
        {busy ? <ActivityIndicator size="small" color={P[600]} /> : value ? <CheckCircle2 size={24} color={TW.emerald600} /> : <Idle size={24} color={TW.slate400} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...T.sm, fontWeight: "500", color: TW.slate700 }}>{busy ? "Uploading…" : value ? "Uploaded — tap to replace" : "Tap to upload (JPG/PNG/PDF)"}</Text>
          {value && !busy ? <Text numberOfLines={1} style={{ ...T.xs, color: TW.emerald600 }}>{String(value).split("/").pop()}</Text> : null}
        </View>
        {value && variant === "partner" ? <Image source={{ uri: mediaUrl(value) }} style={{ height: 48, width: 48, borderRadius: 8, borderWidth: 1, borderColor: TW.emerald200 }} contentFit="cover" /> : null}
      </Pressable>
      {ocr?.matched ? (
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 }}><CheckCircle2 size={14} color={TW.emerald600} /><Text style={{ ...T.xs, color: TW.emerald600 }}>Aadhaar number verified via OCR</Text></View>
      ) : ocr?.ocr_ran ? (
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 }}><AlertTriangle size={14} color={TW.red500} /><Text style={{ flex: 1, ...T.xs, color: TW.red500 }}>Please enter a valid Aadhaar number or upload the correct ID.</Text></View>
      ) : null}
      <SourceSheet open={choose} onClose={() => setChoose(false)} onPick={run} title={label} />
    </Field>
  );
}

/* ---------------- Live selfie capture (primary dashed card) ---------------- */
export function LivePhotoCapture({ value, onCaptured, base, editable = true }: { value?: string; onCaptured: (url: string) => void; base: string; editable?: boolean }) {
  const P = usePal();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setError("");
    try {
      const asset = await pickImage("camera", "front");
      if (!asset) return;
      setUploading(true);
      const d = await uploadAsset(base, "live_photo", asset);
      onCaptured(d.url);
      toast.success("Live photo captured");
    } catch (e: any) { if (/permission/i.test(e?.message)) setError(e.message); else toast.error(e?.message || "Upload failed"); }
    setUploading(false);
  };
  return (
    <View testID="live-photo-capture" style={{ borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: P[200], backgroundColor: `${P[50]}80`, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <View style={{ height: 32, width: 32, borderRadius: 8, backgroundColor: P[100], alignItems: "center", justifyContent: "center" }}><Camera size={16} color={P[700]} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate800 }}>Live Photo <Text style={{ color: TW.red500 }}>*</Text></Text>
          <Text style={{ ...T.px11, color: TW.slate500 }}>Capture a real-time selfie from your camera. Gallery upload is not allowed.</Text>
        </View>
      </View>
      {value && !uploading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Image source={{ uri: mediaUrl(value) }} style={{ height: 96, width: 96, borderRadius: 16, borderWidth: 4, borderColor: TW.emerald200 }} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><CheckCircle2 size={16} color={TW.emerald700} /><Text style={{ ...T.sm, fontWeight: "600", color: TW.emerald700 }}>Photo captured</Text></View>
            {editable ? (
              <Pressable testID="live-photo-retake" onPress={run} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <RefreshCw size={16} color={P[700]} /><Text style={{ ...T.sm, fontWeight: "600", color: P[700] }}>Retake photo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {uploading ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 24 }}>
          <ActivityIndicator size="small" color={P[700]} /><Text style={{ ...T.sm, fontWeight: "500", color: P[700] }}>Uploading photo…</Text>
        </View>
      ) : null}
      {!value && !uploading ? (
        <Pressable testID="live-photo-start" disabled={!editable} onPress={run}
          style={({ pressed }) => ({ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: pressed ? P[700] : P[600], opacity: editable ? 1 : 0.6 })}>
          <Camera size={20} color="#fff" /><Text style={{ ...T.base, fontWeight: "600", color: "#fff" }}>Open camera</Text>
        </Pressable>
      ) : null}
      {error ? <ErrorBox text={error} /> : null}
    </View>
  );
}

/* ---------------- GPS shop verification photo (amber dashed card) ---------------- */
export function GpsPhotoCapture({ value, lat, lng, distance, verified, gpsOk, onCaptured, base, editable = true }: {
  value?: string; lat?: number | null; lng?: number | null; distance?: number | null; verified?: boolean; gpsOk?: boolean;
  onCaptured: (d: { url: string; lat: number; lng: number; captured_at: string }) => Promise<void> | void; base: string; editable?: boolean;
}) {
  const P = usePal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const GPS_ERR = "This photo does not contain valid GPS location data. Please allow location access and capture again using the GPS Camera.";
  const run = async () => {
    setError("");
    setBusy(true);
    try {
      let lp = await Location.getForegroundPermissionsAsync();
      if (!lp.granted) lp = await Location.requestForegroundPermissionsAsync();
      if (!lp.granted) { setError(GPS_ERR); setBusy(false); return; }
      const asset = await pickImage("camera", "back");
      if (!asset) { setBusy(false); return; }
      let coords: Location.LocationObjectCoords;
      try { coords = (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })).coords; }
      catch { setError(GPS_ERR); setBusy(false); return; }
      const d = await uploadAsset(base, "shop_photo", asset);
      await onCaptured({ url: d.url, lat: coords.latitude, lng: coords.longitude, captured_at: new Date().toISOString() });
      toast.success("Shop verification photo captured with GPS");
    } catch (e: any) { if (/permission/i.test(e?.message)) setError(e.message); else toast.error(e?.message || "Upload failed"); }
    setBusy(false);
  };
  return (
    <View testID="gps-photo-capture" style={{ borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: TW.amber300, backgroundColor: "#FFFBEB80", padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <View style={{ height: 32, width: 32, borderRadius: 8, backgroundColor: TW.amber100, alignItems: "center", justifyContent: "center" }}><MapPin size={16} color={TW.amber700} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate800 }}>Shop Verification Photo <Text style={{ color: TW.red500 }}>*</Text></Text>
          <Text style={{ ...T.px11, color: TW.slate500 }}>Stand in front of your shop poster/banner/signboard and click a live GPS photo. Location is captured with the shot.</Text>
        </View>
      </View>
      {value && !busy ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
          <Image source={{ uri: mediaUrl(value) }} style={{ height: 112, width: 112, borderRadius: 16, borderWidth: 4, borderColor: TW.amber200 }} contentFit="cover" />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><CheckCircle2 size={16} color={TW.emerald700} /><Text style={{ ...T.sm, fontWeight: "600", color: TW.emerald700 }}>Photo captured</Text></View>
            {gpsOk && lat != null ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MapPin size={12} color={TW.amber600} /><Text style={{ ...T.px11, color: TW.slate600 }}>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</Text></View> : null}
            {distance != null ? <Text style={{ ...T.px11, fontWeight: "500", color: verified ? TW.emerald600 : TW.red500 }}>{verified ? `Location matches shop (${Math.round(distance)}m away)` : `Photo location is ${Math.round(distance)}m from your shop address`}</Text> : null}
            {editable ? (
              <Pressable testID="gps-photo-retake" onPress={run} style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <RefreshCw size={16} color={P[700]} /><Text style={{ ...T.sm, fontWeight: "600", color: P[700] }}>Retake photo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {busy ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 24 }}>
          <ActivityIndicator size="small" color={P[700]} /><Text style={{ ...T.sm, fontWeight: "500", color: P[700] }}>Reading GPS &amp; uploading…</Text>
        </View>
      ) : null}
      {!value && !busy ? (
        <Pressable testID="gps-photo-start" disabled={!editable} onPress={run}
          style={({ pressed }) => ({ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: pressed ? TW.amber700 : TW.amber600, opacity: editable ? 1 : 0.6 })}>
          <Camera size={20} color="#fff" /><Text style={{ ...T.base, fontWeight: "600", color: "#fff" }}>Open GPS Camera</Text>
        </Pressable>
      ) : null}
      {error ? <ErrorBox text={error} Icon={AlertTriangle} onRetry={run} /> : null}
    </View>
  );
}
