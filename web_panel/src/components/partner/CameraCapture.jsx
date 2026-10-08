import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, RefreshCw, Check, RotateCcw, Loader2 } from "lucide-react";

/**
 * CameraCapture — LIVE camera-only proof capture (no gallery / no file picker).
 * Opens the device camera via getUserMedia, lets the user snap a frame, preview it,
 * and confirm. onCapture receives a JPEG File. Rear camera preferred on mobile.
 */
const MP_VER = "1.0.1";
let detectorPromise = null;
function loadFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = import("@mediapipe/tasks-vision").then(async ({ FaceDetector, FilesetResolver }) => {
      const fs = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`);
      return FaceDetector.createFromOptions(fs, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite", delegate: "CPU" },
        runningMode: "VIDEO", minDetectionConfidence: 0.6,
      });
    }).catch((e) => { detectorPromise = null; throw e; });
  }
  return detectorPromise;
}

const ovalOf = (w, h) => { const rx = Math.min(w * 0.34, h * 0.3, 170); return { rx, ry: rx * 1.32, cx: w / 2, cy: h * 0.46 }; };

// Face inside oval check (video is object-contain inside the w×h box).
function faceInOval(det, video, w, h) {
  const bb = det?.boundingBox; const vw = video.videoWidth, vh = video.videoHeight;
  if (!bb || !vw || !vh) return false;
  const sc = Math.min(w / vw, h / vh), ox = (w - vw * sc) / 2, oy = (h - vh * sc) / 2;
  const fx = ox + (bb.originX + bb.width / 2) * sc, fy = oy + (bb.originY + bb.height / 2) * sc, fw = bb.width * sc;
  const { rx, ry, cx, cy } = ovalOf(w, h);
  const inside = ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2 <= 0.35;
  return inside && fw >= rx * 0.7 && fw <= rx * 2.1;
}

function lumaOf(video, canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, 32, 24);
  const d = ctx.getImageData(0, 0, 32, 24).data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}

/** Oval face guide + live face detection + low-light check. Reports { faceOk, dark, unavailable }. */
function FaceGuide({ videoRef, onStatus }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [st, setSt] = useState({ faceOk: false, dark: false, unavailable: false, loading: true });
  const boxRef = useRef(box); boxRef.current = box;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let alive = true, timer = null, det = null;
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 24;
    const push = (n) => { if (!alive) return; setSt(n); onStatus?.(n); };
    const tick = () => {
      const v = videoRef.current;
      if (alive && v && v.readyState >= 2) {
        const dark = lumaOf(v, canvas) < 55;
        let faceOk = false;
        if (det) { try { const r = det.detectForVideo(v, performance.now()); faceOk = faceInOval(r.detections?.[0], v, boxRef.current.w, boxRef.current.h) && r.detections.length === 1; } catch { /* skip frame */ } }
        push({ faceOk: det ? faceOk : true, dark, unavailable: !det, loading: false });
      }
      if (alive) timer = setTimeout(tick, 250);
    };
    loadFaceDetector().then((d) => { det = d; }).catch(() => { det = null; }).finally(() => { if (alive) tick(); });
    return () => { alive = false; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { w, h } = box;
  const { rx, ry, cx, cy } = ovalOf(w, h);
  const hole = `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  const color = st.faceOk && !st.unavailable ? "#22C55E" : "#FFFFFF";
  const hint = st.loading ? "Starting face check…" : st.dark ? "Too dark — move to a brighter place" : st.faceOk && !st.unavailable ? "Perfect! Hold still and tap capture" : "Align your face in the oval, then tap capture";
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" data-testid="face-guide" data-face-ok={st.faceOk ? "true" : "false"} data-dark={st.dark ? "true" : "false"}>
      {w > 0 && (
        <svg width={w} height={h} className="absolute inset-0">
          <path d={`M0 0H${w}V${h}H0Z ${hole}`} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
          <ellipse data-testid="face-guide-oval" cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={st.faceOk && !st.unavailable ? 5 : 3} strokeDasharray={st.faceOk && !st.unavailable ? "none" : "10 8"} style={{ transition: "stroke 200ms ease" }} />
        </svg>
      )}
      {w > 0 && <p data-testid="face-guide-hint" className={`absolute left-0 right-0 text-center text-sm font-semibold drop-shadow ${st.dark ? "text-amber-300" : st.faceOk ? "text-emerald-300" : "text-white"}`} style={{ top: Math.min(h - 28, cy + ry + 14) }}>{hint}</p>}
      {st.dark && w > 0 && <div data-testid="face-guide-dark-warning" className="absolute left-1/2 -translate-x-1/2 top-3 rounded-md bg-amber-500/95 px-3 py-1.5 text-xs font-bold text-amber-950">Too dark — move to light</div>}
    </div>
  );
}

export default function CameraCapture({ open, title = "Capture photo", onClose, onCapture, uploading, initialFacing = "environment", faceGuide = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState(null); // { blob, url }
  const [facing, setFacing] = useState(initialFacing);
  const [face, setFace] = useState({ faceOk: false });
  const [count, setCount] = useState(0);
  const countRef = useRef(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setError(""); setReady(false);
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not supported on this device/browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (e) {
      setError(
        e?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access to capture work proof."
          : "Unable to open the camera. Make sure no other app is using it."
      );
    }
  }, [facing, stop]);

  // Fresh open → ALWAYS clear any previous capture and (re)start a live stream.
  // Without this, closing after a BEFORE shot leaves `shot` set (the component is
  // only hidden, not unmounted), so opening AFTER showed the stale BEFORE image.
  // (spec 8: after-work camera must be fresh/reset, no previous preview)
  useEffect(() => {
    if (open) {
      setShot((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return null; });
      setError("");
      start();
    } else {
      stop();
      setShot((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return null; });
    }
    return () => { stop(); };
  }, [open]);

  // Flip front/rear camera (only while live-previewing) → restart with new facing.
  useEffect(() => { if (open && !shot) start(); }, [facing]);

  // Always release the camera on unmount — no stale streams / memory leaks. (spec 9)
  useEffect(() => () => stop(), [stop]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) { setShot({ blob, url: URL.createObjectURL(blob) }); stop(); }
    }, "image/jpeg", 0.9);
  };

  // Selfie mode: 3-2-1 countdown before the frame is grabbed so the partner can hold steady.
  const startCountdown = () => {
    if (count) return;
    let n = 3; setCount(n);
    countRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(countRef.current); countRef.current = null; setCount(0); snap(); }
      else setCount(n);
    }, 1000);
  };
  useEffect(() => () => clearInterval(countRef.current), []);
  useEffect(() => { if (!open) { clearInterval(countRef.current); countRef.current = null; setCount(0); setFace({ faceOk: false }); } }, [open]);
  const canSnap = ready && !count;

  const retake = () => {
    if (shot?.url) URL.revokeObjectURL(shot.url);
    setShot(null);
    start();
  };

  const confirm = () => {
    if (!shot) return;
    const file = new File([shot.blob], `proof-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture?.(file);
  };

  const handleClose = () => { stop(); if (shot?.url) URL.revokeObjectURL(shot.url); setShot(null); onClose?.(); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" data-testid="camera-capture">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-semibold"><Camera className="h-5 w-5" /> {title}</div>
        <button onClick={handleClose} data-testid="camera-close" className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center px-6">
            <p className="text-white/90 mb-4" data-testid="camera-error">{error}</p>
            <button onClick={start} className="inline-flex items-center gap-2 px-4 h-11 rounded-md bg-white text-slate-900 font-semibold"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        ) : shot ? (
          <img src={shot.url} alt="preview" className="max-h-full max-w-full object-contain" data-testid="camera-preview" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" data-testid="camera-video" />
            {faceGuide && ready && <FaceGuide videoRef={videoRef} onStatus={setFace} />}
            {count > 0 && <div data-testid="camera-countdown" className="pointer-events-none absolute inset-0 grid place-items-center"><span key={count} className="text-white font-black text-8xl drop-shadow-2xl animate-in zoom-in-50 duration-300">{count}</span></div>}
            {!ready && <div className="absolute inset-0 grid place-items-center text-white/80"><Loader2 className="h-8 w-8 animate-spin" /></div>}
          </>
        )}
      </div>

      <div className="px-4 py-5 flex items-center justify-center gap-6 bg-black">
        {shot ? (
          <>
            <button onClick={retake} disabled={uploading} data-testid="camera-retake" className="inline-flex items-center gap-2 px-5 h-12 rounded-md bg-white/10 text-white font-semibold disabled:opacity-50"><RotateCcw className="h-5 w-5" /> Retake</button>
            <button onClick={confirm} disabled={uploading} data-testid="camera-confirm" className="inline-flex items-center gap-2 px-6 h-12 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-60">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} {uploading ? "Uploading…" : "Use photo"}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} disabled={!ready || !!count} data-testid="camera-flip" className="h-12 w-12 grid place-items-center rounded-full bg-white/10 text-white disabled:opacity-40"><RefreshCw className="h-5 w-5" /></button>
            <button onClick={faceGuide ? startCountdown : snap} disabled={!canSnap} data-testid="camera-shutter" className={`h-16 w-16 rounded-full ring-4 disabled:opacity-40 active:scale-95 transition ${faceGuide && face.faceOk ? "bg-emerald-400 ring-emerald-300/60" : "bg-white ring-white/40"}`} aria-label="Capture" />
            <span className="h-12 w-12" />
          </>
        )}
      </div>
    </div>
  );
}
