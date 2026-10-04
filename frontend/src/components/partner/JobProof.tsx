import React, { useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Linking, Platform, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Modal } from "react-native";
import { InlineVideo } from "@/src/components/InlineVideo";
import * as ImagePicker from "expo-image-picker";
import { File as FsFile } from "expo-file-system";
import { useTheme } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { oversizeMessage, assetSizeBytes, shrinkForUpload, uploadAsset } from "@/src/components/reg/Photo";

export const MAX_PROOF_FILES = 5;
export const MAX_VIDEO_SEC = 30;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const CHUNK_B64 = 700 * 1024; // ~525KB binary per JSON part — small enough for proxy body limits on mobile networks
const SLATE400 = "#94A3B8";

export const isVideoUrl = (u: string) => /\.(mp4|mov|webm|3gp|mkv)(\?|$)/i.test(u || "");

export async function ensureCamera(toast: { error: (m: string) => void }) {
  let perm = await ImagePicker.getCameraPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    toast.error("Camera access is required to capture live job proof. Please allow camera permission.");
    if (!perm.canAskAgain) Linking.openSettings();
    return false;
  }
  return true;
}

/** LIVE camera photo → multipart upload to /bookings/{id}/evidence/upload */
export async function captureProofPhoto(bookingId: string, stage: "before" | "after", toast: any, front = false) {
  if (!(await ensureCamera(toast))) return false;
  await new Promise((r) => setTimeout(r, 250));
  const res = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false, exif: false, cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back });
  if (res.canceled || !res.assets?.[0]?.uri) return false;
  const asset = res.assets[0];
  const sizeMsg = oversizeMessage(assetSizeBytes(asset), "camera");
  if (sizeMsg) { toast.error(sizeMsg); return false; }
  const small = await shrinkForUpload(asset, 1600, 0.75);
  await uploadAsset(`/bookings/${bookingId}/evidence`, "evidence", small, { stage });
  return true;
}

async function assetToBase64(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(asset.uri)).blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = () => reject(new Error("Could not read video"));
      fr.readAsDataURL(blob);
    });
  }
  return await new FsFile(asset.uri).base64();
}

/** LIVE camera video (≤30s) → chunked base64 upload to /bookings/{id}/evidence/chunk */
export async function captureProofVideo(bookingId: string, stage: "before" | "after", toast: any, onProgress?: (p: number) => void) {
  if (!(await ensureCamera(toast))) return false;
  await new Promise((r) => setTimeout(r, 250));
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: MAX_VIDEO_SEC, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium, cameraType: ImagePicker.CameraType.back });
  if (res.canceled || !res.assets?.[0]?.uri) return false;
  const asset = res.assets[0];
  if (asset.duration && asset.duration > (MAX_VIDEO_SEC + 2) * 1000) { toast.error(`Video must be ${MAX_VIDEO_SEC} seconds or shorter`); return false; }
  const size = assetSizeBytes(asset);
  if (size > MAX_VIDEO_BYTES) { toast.error("Video too large (max 25 MB). Record a shorter clip."); return false; }
  const b64 = await assetToBase64(asset);
  if (b64.length * 0.75 > MAX_VIDEO_BYTES) { toast.error("Video too large (max 25 MB). Record a shorter clip."); return false; }
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const total = Math.max(1, Math.ceil(b64.length / CHUNK_B64));
  const mime = asset.mimeType || (asset.uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
  let out: any = null;
  for (let i = 0; i < total; i++) {
    const body = { stage, upload_id: uploadId, index: i, total, content_type: mime, data: b64.slice(i * CHUNK_B64, (i + 1) * CHUNK_B64) };
    let attempt = 0;
    for (;;) {
      try { out = await api.post(`/bookings/${bookingId}/evidence/chunk`, body); break; }
      catch (e: any) {
        if (e?.status && e.status !== 502 && e.status !== 503 && e.status !== 504 && e.status !== 413) throw e;
        if (++attempt >= 3) throw new Error(e?.detail || `Video upload failed at part ${i + 1}/${total}. Check your connection and try again.`);
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }
  return !!out?.done;
}

/* ── OtpBoxes (4 boxes) ── */
export function OtpBoxes({ value, onChange, len = 4, testID }: { value: string; onChange: (v: string) => void; len?: number; testID?: string }) {
  const { colors } = useTheme();
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: len }, (_, i) => (value || "")[i] || "");
  const setAt = (i: number, d: string) => {
    const arr = (value || "").padEnd(len, " ").split("");
    arr[i] = d || " ";
    onChange(arr.join("").replace(/ /g, "").slice(0, len));
    if (d && refs.current[i + 1]) refs.current[i + 1]?.focus();
  };
  // Paste / keyboard-suggested code → spread digits across the boxes from box i.
  const fillFrom = (i: number, t: string) => {
    const arr = (value || "").padEnd(len, " ").split("");
    t.slice(0, len - i).split("").forEach((c, k) => { arr[i + k] = c; });
    onChange(arr.join("").replace(/ /g, "").slice(0, len));
    refs.current[Math.min(len - 1, i + t.length)]?.focus();
  };
  const onBoxChange = (i: number, raw: string, d: string) => {
    const t = raw.replace(/\D/g, "");
    if (t.length > 2 || (t.length === 2 && !d)) return fillFrom(t.length >= len ? 0 : i, t);
    setAt(i, t.slice(-1));
  };
  return (
    <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }} testID={testID || "otp-boxes"}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          testID={`otp-box-${i}`}
          value={d}
          keyboardType="number-pad"
          maxLength={len}
          textContentType={i === 0 ? "oneTimeCode" : "none"}
          autoComplete={i === 0 ? "sms-otp" : "off"}
          onChangeText={(t) => onBoxChange(i, t, d)}
          onKeyPress={(e) => { if (e.nativeEvent.key === "Backspace" && !d && i > 0) { setAt(i - 1, ""); refs.current[i - 1]?.focus(); } }}
          selectTextOnFocus
          style={{ width: 56, height: 56, borderRadius: 14, borderWidth: 2, borderColor: d ? colors.secondary : colors.border, backgroundColor: colors.surface, textAlign: "center", fontSize: 22, fontWeight: "800", color: colors.text }}
        />
      ))}
    </View>
  );
}

/* ── ProofGrid: photos + videos (max 5), live camera only ── */
export function ProofGrid({ items, onPhoto, onVideo, onRemove, busy, progress, testID, locked }: { items: string[]; onPhoto: () => void; onVideo: () => void; onRemove: (u: string) => void; busy: boolean; progress?: number; testID: string; locked?: boolean }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const { colors } = useTheme();
  const full = items.length >= MAX_PROOF_FILES;
  const tile = { width: "31%" as const, aspectRatio: 1, borderRadius: 12, overflow: "hidden" as const, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle };
  return (
    <>
    <View testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>Photos & videos · live camera only</Text>
        <View style={{ backgroundColor: items.length ? "#D1FAE5" : colors.surfaceSubtle, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text testID={`${testID}-count`} style={{ color: items.length ? "#047857" : colors.textMuted, fontSize: 11, fontWeight: "800" }}>{items.length}/{MAX_PROOF_FILES}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {items.map((u, i) => (
          <View key={u} style={tile} testID={`${testID}-item-${i}`}>
            {isVideoUrl(u) ? (
              <Pressable testID={`${testID}-play-${i}`} onPress={() => setPlaying(mediaUrl(u) || u)} style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" }}>
                <Icon name="play-circle" size={34} color="#fff" />
                <Text style={{ color: "#CBD5E1", fontSize: 10, fontWeight: "700", marginTop: 4 }}>VIDEO</Text>
              </Pressable>
            ) : (
              <Image source={{ uri: mediaUrl(u) }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={u} transition={120} />
            )}
            <Pressable testID={`${testID}-remove-${i}`} onPress={() => onRemove(u)} disabled={busy} style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={13} color="#fff" />
            </Pressable>
          </View>
        ))}
        {!full && !locked ? (
          <>
            <Pressable testID={`${testID}-photo`} onPress={onPhoto} disabled={busy} style={[tile, { borderWidth: 2, borderStyle: "dashed", borderColor: "#93C5FD", backgroundColor: "rgba(239,246,255,0.7)", alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }]}>
              <Icon name="camera-outline" size={24} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: "700", marginTop: 4 }}>Photo</Text>
            </Pressable>
            <Pressable testID={`${testID}-video`} onPress={onVideo} disabled={busy} style={[tile, { borderWidth: 2, borderStyle: "dashed", borderColor: "#C4B5FD", backgroundColor: "rgba(245,243,255,0.8)", alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }]}>
              <Icon name="video-outline" size={24} color="#7C3AED" />
              <Text style={{ color: "#7C3AED", fontSize: 11.5, fontWeight: "700", marginTop: 4 }}>Video ≤{MAX_VIDEO_SEC}s</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {busy ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text testID={`${testID}-uploading`} style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>{progress ? `Uploading video… ${progress}%` : "Uploading…"}</Text>
        </View>
      ) : null}
      <Text style={{ color: SLATE400, fontSize: 11, marginTop: 8 }}>{full ? `Maximum ${MAX_PROOF_FILES} files reached — remove one to add another.` : "Gallery upload is not allowed. Max 5 files, videos up to 30 sec."}</Text>
    </View>
      <Modal visible={!!playing} transparent animationType="fade" onRequestClose={() => setPlaying(null)}>
        <View testID="video-player-modal" style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.94)", justifyContent: "center", padding: 12 }}>
          <Pressable testID="video-player-close" onPress={() => setPlaying(null)} style={{ position: "absolute", top: 44, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", zIndex: 2 }}><Icon name="close" size={22} color="#fff" /></Pressable>
          <View style={{ height: "60%" }}>{playing ? <InlineVideo uri={playing} testID="inline-video" /> : null}</View>
        </View>
      </Modal>
    </>
  );
}
