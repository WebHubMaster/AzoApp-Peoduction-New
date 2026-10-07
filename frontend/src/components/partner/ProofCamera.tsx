import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { CameraView, useMicrophonePermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";

export type ProofShot = { uri: string; mimeType: string; kind: "photo" | "video"; width?: number; height?: number };

/** In-app camera for job proof (no external camera app → works on every Android OEM,
 *  and the OS can't kill our app mid-capture and lose the result). */
export function ProofCamera({ visible, kind, maxSec, onClose, onCapture, onFail }: {
  visible: boolean; kind: "photo" | "video"; maxSec: number;
  onClose: () => void; onCapture: (s: ProofShot) => void; onFail: (msg: string) => void;
}) {
  const cam = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [mic, requestMic, getMic] = useMicrophonePermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const readyTimer = useRef<any>(null);

  useEffect(() => {
    if (!visible) { setReady(false); setBusy(false); setRecording(false); setSecs(0); return; }
    if (kind === "video") getMic().then((m) => { if (!m.granted && m.canAskAgain) requestMic(); }).catch(() => {});
    // Some devices never fire onCameraReady — fail over to the system camera instead of hanging.
    readyTimer.current = setTimeout(() => { if (!cam.current) onFail("Camera did not start"); else setReady(true); }, 6000);
    return () => clearTimeout(readyTimer.current);
  }, [visible, kind, facing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recording) return undefined;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const takePhoto = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    try {
      const p = await cam.current.takePictureAsync({ quality: 0.7, exif: false });
      if (!p?.uri) throw new Error("No photo captured");
      onCapture({ uri: p.uri, width: p.width, height: p.height, mimeType: "image/jpeg", kind: "photo" });
    } catch (e: any) { onFail(e?.message || "Couldn't capture the photo"); }
    finally { setBusy(false); }
  };

  const startVideo = async () => {
    if (!cam.current || recording) return;
    setSecs(0); setRecording(true);
    try {
      const v = await cam.current.recordAsync({ maxDuration: maxSec });
      if (!v?.uri) throw new Error("No video recorded");
      onCapture({ uri: v.uri, mimeType: v.uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4", kind: "video" });
    } catch (e: any) { onFail(e?.message || "Couldn't record the video"); }
    finally { setRecording(false); }
  };
  const stopVideo = () => { try { cam.current?.stopRecording(); } catch { /* already stopped */ } };

  const shutter = kind === "photo" ? takePhoto : recording ? stopVideo : startVideo;
  const mute = kind === "video" && !mic?.granted;
  const left = Math.max(0, maxSec - secs);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (recording) stopVideo(); else onClose(); }} statusBarTranslucent>
      <View testID="proof-camera" style={{ flex: 1, backgroundColor: "#000" }}>
        {visible ? (
          <CameraView key={`${kind}-${facing}`} ref={cam} style={{ flex: 1 }} facing={facing} mode={kind === "video" ? "video" : "picture"}
            mute={mute} videoQuality="720p" videoBitrate={4_000_000} animateShutter={false}
            onCameraReady={() => { clearTimeout(readyTimer.current); setReady(true); }}
            onMountError={(e) => onFail(e?.message || "Camera unavailable on this device")} />
        ) : null}
        <View style={{ position: "absolute", top: insets.top + 12, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable testID="proof-camera-close" disabled={recording} onPress={onClose} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", opacity: recording ? 0.4 : 1 }}><Icon name="close" size={22} color="#fff" /></Pressable>
          {kind === "video" ? (
            <View testID="proof-camera-timer" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: recording ? "#DC2626" : "rgba(0,0,0,0.5)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{recording ? `${secs}s · ${left}s left` : `Max ${maxSec}s`}</Text>
            </View>
          ) : null}
          <Pressable testID="proof-camera-flip" disabled={recording || busy} onPress={() => { setReady(false); setFacing((f) => (f === "back" ? "front" : "back")); }} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", opacity: recording ? 0.4 : 1 }}><Icon name="camera-flip-outline" size={22} color="#fff" /></Pressable>
        </View>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 28, alignItems: "center" }}>
          <Text testID="proof-camera-hint" style={{ color: "#fff", fontSize: 13.5, fontWeight: "700", marginBottom: 14 }}>
            {!ready ? "Starting camera…" : kind === "photo" ? "Tap to take photo" : recording ? "Tap to stop" : mute ? "Tap to record (no sound — mic not allowed)" : "Tap to record"}
          </Text>
          <Pressable testID="proof-camera-shutter" onPress={shutter} disabled={!ready || busy} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: "#fff", alignItems: "center", justifyContent: "center", opacity: ready ? 1 : 0.45 }}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <View style={kind === "video"
                ? { width: recording ? 30 : 58, height: recording ? 30 : 58, borderRadius: recording ? 6 : 29, backgroundColor: "#DC2626" }
                : { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" }} />
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
