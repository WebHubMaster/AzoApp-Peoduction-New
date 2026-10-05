import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import Svg, { Path, Ellipse } from "react-native-svg";
import { CameraView } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";

export type Shot = { uri: string; width: number; height: number; mimeType: string };

function FaceGuide() {
  const { width: w, height: h } = useWindowDimensions();
  const rx = Math.min(w * 0.36, 170), ry = rx * 1.32, cx = w / 2, cy = h * 0.44;
  const hole = `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  return (
    <View pointerEvents="none" testID="face-guide" style={{ position: "absolute", top: 0, left: 0, width: w, height: h }}>
      <Svg width={w} height={h}>
        <Path d={`M0 0H${w}V${h}H0Z ${hole}`} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray="10 8" />
      </Svg>
    </View>
  );
}

/** In-app camera (no external camera intent) so selfie capture works on every Android/iOS device. */
export function SelfieCamera({ visible, onClose, onCapture, onFail }: { visible: boolean; onClose: () => void; onCapture: (s: Shot) => void; onFail: (msg: string) => void }) {
  const cam = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"front" | "back">("front");
  useEffect(() => { if (!visible) { setReady(false); setBusy(false); } }, [visible]);

  const snap = async () => {
    if (!cam.current || busy || !ready) return;
    setBusy(true);
    try {
      const p = await cam.current.takePictureAsync({ quality: 0.7, exif: false });
      if (p?.uri) onCapture({ uri: p.uri, width: p.width, height: p.height, mimeType: "image/jpeg" });
    } catch (e: any) { onFail(e?.message || "Couldn't capture the selfie. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View testID="selfie-camera" style={{ flex: 1, backgroundColor: "#000" }}>
        {visible ? (
          <CameraView key={facing} ref={cam} style={{ flex: 1 }} facing={facing} mirror={facing === "front"} animateShutter
            onCameraReady={() => setReady(true)} onMountError={(e) => onFail(e?.message || "Camera unavailable on this device")} />
        ) : null}
        {ready ? <FaceGuide /> : null}
        <View style={{ position: "absolute", top: insets.top + 12, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable testID="selfie-camera-close" onPress={onClose} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={22} color="#fff" /></Pressable>
          <Pressable testID="selfie-camera-flip" onPress={() => { setReady(false); setFacing((f) => (f === "front" ? "back" : "front")); }} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}><Icon name="camera-flip-outline" size={22} color="#fff" /></Pressable>
        </View>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 28, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", marginBottom: 14 }}>{ready ? "Align your face inside the oval" : "Starting camera…"}</Text>
          <Pressable testID="selfie-camera-shutter" onPress={snap} disabled={!ready || busy} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: "#fff", alignItems: "center", justifyContent: "center", opacity: ready ? 1 : 0.5 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" }} />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
