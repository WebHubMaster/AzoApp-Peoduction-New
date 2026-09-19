import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, RefreshCw, Check, RotateCcw, Loader2 } from "lucide-react";

/**
 * CameraCapture — LIVE camera-only proof capture (no gallery / no file picker).
 * Opens the device camera via getUserMedia, lets the user snap a frame, preview it,
 * and confirm. onCapture receives a JPEG File. Rear camera preferred on mobile.
 */
export default function CameraCapture({ open, title = "Capture photo", onClose, onCapture, uploading }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState(null); // { blob, url }
  const [facing, setFacing] = useState("environment");

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
            <button onClick={start} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-white text-slate-900 font-semibold"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        ) : shot ? (
          <img src={shot.url} alt="preview" className="max-h-full max-w-full object-contain" data-testid="camera-preview" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" data-testid="camera-video" />
            {!ready && <div className="absolute inset-0 grid place-items-center text-white/80"><Loader2 className="h-8 w-8 animate-spin" /></div>}
          </>
        )}
      </div>

      <div className="px-4 py-5 flex items-center justify-center gap-6 bg-black">
        {shot ? (
          <>
            <button onClick={retake} disabled={uploading} data-testid="camera-retake" className="inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-white/10 text-white font-semibold disabled:opacity-50"><RotateCcw className="h-5 w-5" /> Retake</button>
            <button onClick={confirm} disabled={uploading} data-testid="camera-confirm" className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-60">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} {uploading ? "Uploading…" : "Use photo"}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} disabled={!ready} data-testid="camera-flip" className="h-12 w-12 grid place-items-center rounded-full bg-white/10 text-white disabled:opacity-40"><RefreshCw className="h-5 w-5" /></button>
            <button onClick={snap} disabled={!ready} data-testid="camera-shutter" className="h-16 w-16 rounded-full bg-white ring-4 ring-white/40 disabled:opacity-40 active:scale-95 transition" aria-label="Capture" />
            <span className="h-12 w-12" />
          </>
        )}
      </div>
    </div>
  );
}
