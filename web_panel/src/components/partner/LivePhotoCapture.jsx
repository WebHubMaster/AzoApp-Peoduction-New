import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, RefreshCw, Loader2, CheckCircle2, AlertTriangle, CameraOff, X } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * Live selfie capture — CAMERA ONLY (no gallery / file picker).
 * Captures a frame from the live camera stream, uploads it and returns the URL.
 */
export default function LivePhotoCapture({ value, onCaptured, regBase = "/partner/registration", editable = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camOn, setCamOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCamOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not supported on this device/browser.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCamOn(true);
      // wait for the <video> to mount, then attach
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError")
        setError("Camera permission denied. Please allow camera access and try again.");
      else if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError")
        setError("No camera found on this device.");
      else setError("Could not start the camera. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    // center-crop square
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) return;
    stopCamera();
    setUploading(true);
    try {
      const file = new File([blob], `live_photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", "live_photo");
      const { data } = await api.post(`${regBase}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      onCaptured(data.url);
      toast.success("Live photo captured");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/50 p-4" data-testid="live-photo-capture">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-8 w-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center"><Camera className="h-4 w-4" /></span>
        <div>
          <p className="font-semibold text-sm text-slate-800">Live Photo <span className="text-red-500">*</span></p>
          <p className="text-[11px] text-slate-500">Capture a real-time selfie from your camera. Gallery upload is not allowed.</p>
        </div>
      </div>

      {/* Captured state */}
      {value && !camOn && !uploading && (
        <div className="flex items-center gap-4">
          <img src={value} alt="Live" className="h-24 w-24 rounded-2xl object-cover ring-4 ring-emerald-200" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Photo captured</p>
            {editable && (
              <button type="button" data-testid="live-photo-retake" onClick={startCamera}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
                <RefreshCw className="h-4 w-4" /> Retake photo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Uploading */}
      {uploading && (
        <div className="flex items-center gap-2 text-primary-700 py-6 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm font-medium">Uploading photo…</span>
        </div>
      )}

      {/* Live camera */}
      {camOn && !uploading && (
        <div className="space-y-3">
          <div className="relative mx-auto w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover -scale-x-100" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-2xl pointer-events-none" />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={stopCamera} className="h-11 w-11 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300">
              <X className="h-5 w-5" />
            </button>
            <button type="button" data-testid="live-photo-capture-btn" onClick={capture}
              className="h-16 w-16 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-lg ring-4 ring-primary-200 hover:bg-primary-700 active:scale-95 transition">
              <Camera className="h-7 w-7" />
            </button>
            <span className="h-11 w-11" />
          </div>
          <p className="text-center text-xs text-slate-500">Position your face in the frame and tap the shutter.</p>
        </div>
      )}

      {/* Idle / start */}
      {!value && !camOn && !uploading && (
        <button type="button" data-testid="live-photo-start" onClick={startCamera} disabled={starting}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-60 transition">
          {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          {starting ? "Starting camera…" : "Open camera"}
        </button>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-2.5 text-red-600 text-xs">
          <CameraOff className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
