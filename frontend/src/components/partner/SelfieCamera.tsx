import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import Svg, { Path, Ellipse } from "react-native-svg";
import { CameraView } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";

export type Shot = { uri: string; width: number; height: number; mimeType: string };
type Check = { faceOk: boolean; dark: boolean; unavailable: boolean; checking: boolean };

// ML Kit is a native module — absent in Expo Go / web, so load lazily and fall back to "no detection".
let detector: any = null;
let detectorInit: Promise<any> | null = null;
function getDetector(): Promise<any> {
  if (detector) return Promise.resolve(detector);
  if (!detectorInit) {
    detectorInit = (async () => {
      const mod = require("@infinitered/react-native-mlkit-face-detection");
      const d = new mod.RNMLKitFaceDetector({ performanceMode: "fast", minFaceSize: 0.15 }, true);
      await d.initialize();
      detector = d;
      return d;
    })().catch((e) => { detectorInit = null; throw e; });
  }
  return detectorInit;
}

const ovalOf = (w: number, h: number) => { const rx = Math.min(w * 0.36, 170); return { rx, ry: rx * 1.32, cx: w / 2, cy: h * 0.44 }; };
const num = (v: any) => { const n = typeof v === "string" ? parseFloat(v) : Number(v); return Number.isFinite(n) ? n : NaN; };

// Low light from EXIF: iOS BrightnessValue (APEX) or EV100 = log2(N²/t) − log2(ISO/100).
function isDark(exif: any): boolean {
  if (!exif) return false;
  const bv = num(exif.BrightnessValue);
  if (Number.isFinite(bv)) return bv < -0.5;
  const t = num(exif.ExposureTime), n = num(exif.FNumber) || 2, iso = num(Array.isArray(exif.ISOSpeedRatings) ? exif.ISOSpeedRatings[0] : exif.ISOSpeedRatings ?? exif.ISO);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(iso) || iso <= 0) return false;
  return Math.log2((n * n) / t) - Math.log2(iso / 100) < 4.5;
}

// Face centre/size (image px) → screen (preview is "cover") → inside the oval?
function faceInOval(face: any, iw: number, ih: number, w: number, h: number): boolean {
  const f = face?.frame; if (!f || !iw || !ih) return false;
  const sc = Math.max(w / iw, h / ih), ox = (w - iw * sc) / 2, oy = (h - ih * sc) / 2;
  const fx = ox + (f.origin.x + f.size.x / 2) * sc, fy = oy + (f.origin.y + f.size.y / 2) * sc, fw = f.size.x * sc;
  const { rx, ry, cx, cy } = ovalOf(w, h);
  return ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2 <= 0.35 && fw >= rx * 0.7 && fw <= rx * 2.1;
}

function FaceGuide({ ok }: { ok: boolean }) {
  const { width: w, height: h } = useWindowDimensions();
  const { rx, ry, cx, cy } = ovalOf(w, h);
  const hole = `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  return (
    <View pointerEvents="none" testID="face-guide" style={{ position: "absolute", top: 0, left: 0, width: w, height: h }}>
      <Svg width={w} height={h}>
        <Path d={`M0 0H${w}V${h}H0Z ${hole}`} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={ok ? "#22C55E" : "#fff"} strokeWidth={ok ? 5 : 3} strokeDasharray={ok ? undefined : "10 8"} />
      </Svg>
    </View>
  );
}

/** In-app camera (no external camera intent) with face check, low-light hint and 3-s countdown. */
export function SelfieCamera({ visible, onClose, onCapture, onFail }: { visible: boolean; onClose: () => void; onCapture: (s: Shot) => void; onFail: (msg: string) => void }) {
  const cam = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { width: w, height: h } = useWindowDimensions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [chk, setChk] = useState<Check>({ faceOk: false, dark: false, unavailable: false, checking: true });
  const probing = useRef(false);
  const shooting = useRef(false);
  const fails = useRef(0);

  useEffect(() => { if (!visible) { setReady(false); setBusy(false); setCount(0); shooting.current = false; setChk({ faceOk: false, dark: false, unavailable: false, checking: true }); } }, [visible]);

  // Probe loop: silent low-res frame every ~1s → ML Kit face + EXIF brightness.
  useEffect(() => {
    if (!visible || !ready) return;
    let alive = true; let timer: any = null;
    const loop = async () => {
      if (!alive) return;
      if (!probing.current && !shooting.current && cam.current) {
        probing.current = true;
        try {
          const d = await getDetector().catch(() => null);
          const p: any = await cam.current.takePictureAsync({ quality: 0.15, exif: true, shutterSound: false, skipProcessing: false } as any);
          const dark = isDark(p?.exif);
          if (!d) { if (alive) setChk({ faceOk: true, dark, unavailable: true, checking: false }); }
          else {
            const r = await d.detectFaces(p.uri);
            const faces = r?.faces || [];
            const ok = faces.length === 1 && faceInOval(faces[0], p.width, p.height, w, h);
            if (alive) setChk({ faceOk: ok, dark, unavailable: false, checking: false });
          }
          fails.current = 0;
        } catch {
          // Repeated probe failures on an odd device must never block check-in.
          if (++fails.current >= 3 && alive) setChk((c) => ({ ...c, faceOk: true, unavailable: true, checking: false }));
        } finally { probing.current = false; }
      }
      if (alive) timer = setTimeout(loop, 900);
    };
    timer = setTimeout(loop, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [visible, ready, facing, w, h]);

  const shoot = async () => {
    if (!cam.current) return;
    shooting.current = true; setBusy(true);
    try {
      for (let i = 0; probing.current && i < 40; i++) await new Promise((r) => setTimeout(r, 80));
      const p = await cam.current.takePictureAsync({ quality: 0.7, exif: false });
      if (p?.uri) onCapture({ uri: p.uri, width: p.width, height: p.height, mimeType: "image/jpeg" });
    } catch (e: any) { onFail(e?.message || "Couldn't capture the selfie. Please try again."); }
    finally { shooting.current = false; setBusy(false); }
  };

  useEffect(() => {
    if (!count) return;
    const t = setTimeout(() => { if (count === 1) { setCount(0); shoot(); } else setCount(count - 1); }, 1000);
    return () => clearTimeout(t);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const canShoot = ready && !busy && !count;
  const okLook = chk.faceOk && !chk.unavailable;
  const hint = !ready ? "Starting camera…" : count ? "Hold still…" : chk.dark ? "Too dark — move to a brighter place" : okLook ? "Perfect! Tap the button to capture" : "Align your face in the oval, then tap to capture";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View testID="selfie-camera" style={{ flex: 1, backgroundColor: "#000" }}>
        {visible ? (
          <CameraView key={facing} ref={cam} style={{ flex: 1 }} facing={facing} mirror={facing === "front"} animateShutter={false}
            onCameraReady={() => setReady(true)} onMountError={(e) => onFail(e?.message || "Camera unavailable on this device")} />
        ) : null}
        {ready ? <FaceGuide ok={okLook} /> : null}
        {ready && chk.dark ? (
          <View testID="selfie-dark-warning" pointerEvents="none" style={{ position: "absolute", top: insets.top + 64, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,158,11,0.95)", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Icon name="weather-night" size={16} color="#451A03" /><Text style={{ color: "#451A03", fontSize: 12.5, fontWeight: "800" }}>Too dark — move to light</Text>
          </View>
        ) : null}
        {count ? (
          <View testID="selfie-countdown" pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 110, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 12 }}>{count}</Text>
          </View>
        ) : null}
        <View style={{ position: "absolute", top: insets.top + 12, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable testID="selfie-camera-close" onPress={onClose} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={22} color="#fff" /></Pressable>
          <Pressable testID="selfie-camera-flip" disabled={!!count || busy} onPress={() => { setReady(false); setChk({ faceOk: false, dark: false, unavailable: false, checking: true }); setFacing((f) => (f === "front" ? "back" : "front")); }} hitSlop={10} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}><Icon name="camera-flip-outline" size={22} color="#fff" /></Pressable>
        </View>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 28, alignItems: "center" }}>
          <Text testID="selfie-hint" style={{ color: chk.dark ? "#FCD34D" : okLook ? "#86EFAC" : "#fff", fontSize: 13.5, fontWeight: "700", marginBottom: 14 }}>{hint}</Text>
          <Pressable testID="selfie-camera-shutter" onPress={() => setCount(3)} disabled={!canShoot} style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: okLook ? "#86EFAC" : "#fff", alignItems: "center", justifyContent: "center", opacity: canShoot ? 1 : 0.45 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: okLook ? "#22C55E" : "#fff" }} />}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
