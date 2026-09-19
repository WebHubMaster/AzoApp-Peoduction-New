import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, RefreshCw, Loader2, CheckCircle2, MapPin, CameraOff, X, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * GPS Shop Verification Photo — CAMERA ONLY (no gallery) + device GPS.
 * Captures a live frame from the back camera, reads the device geolocation and
 * uploads the image. Returns { url, lat, lng, captured_at } via onCaptured.
 * A photo WITHOUT GPS is rejected (mirrors "GPS Camera" validation).
 */
export default function GpsPhotoCapture({
  value, lat, lng, distance, verified, gpsOk,
  onCaptured, uploadBase = "/merchant/registration", editable = true,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camOn, setCamOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
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
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setCamOn(true);
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

  const getPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no-geo"));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setError("");
    // 1) GPS first — reject if unavailable (GPS Camera requirement)
    let coords;
    try {
      coords = await getPosition();
    } catch (e) {
      setBusy(false);
      setError("This photo does not contain valid GPS location data. Please allow location access and capture again using the GPS Camera.");
      return;
    }
    // 2) grab frame
    const w = video.videoWidth, h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) { setBusy(false); return; }
    stopCamera();
    // 3) upload
    try {
      const file = new File([blob], `shop_photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", "shop_photo");
      const { data } = await api.post(`${uploadBase}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      await onCaptured({
        url: data.url,
        lat: coords.latitude,
        lng: coords.longitude,
        captured_at: new Date().toISOString(),
      });
      toast.success("Shop verification photo captured with GPS");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4" data-testid="gps-photo-capture">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center"><MapPin className="h-4 w-4" /></span>
        <div>
          <p className="font-semibold text-sm text-slate-800">Shop Verification Photo <span className="text-red-500">*</span></p>
          <p className="text-[11px] text-slate-500">Stand in front of your shop poster/banner/signboard and click a live GPS photo. Gallery upload is not allowed.</p>
        </div>
      </div>

      {value && !camOn && !busy && (
        <div className="flex items-start gap-4">
          <img src={value} alt="Shop" className="h-28 w-28 rounded-2xl object-cover ring-4 ring-amber-200" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Photo captured</p>
            {gpsOk && (lat != null) && (
              <p className="text-[11px] text-slate-600 flex items-center gap-1"><MapPin className="h-3 w-3 text-amber-600" /> {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</p>
            )}
            {distance != null && (
              <p className={`text-[11px] font-medium ${verified ? "text-emerald-600" : "text-red-500"}`}>
                {verified ? `Location matches shop (${Math.round(distance)}m away)` : `Photo location is ${Math.round(distance)}m from your shop address`}
              </p>
            )}
            {editable && (
              <button type="button" data-testid="gps-photo-retake" onClick={startCamera}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
                <RefreshCw className="h-4 w-4" /> Retake photo
              </button>
            )}
          </div>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-primary-700 py-6 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm font-medium">Reading GPS &amp; uploading…</span>
        </div>
      )}

      {camOn && !busy && (
        <div className="space-y-3">
          <div className="relative mx-auto w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[10px] px-2 py-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> GPS will be captured with the photo</div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={stopCamera} className="h-11 w-11 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300"><X className="h-5 w-5" /></button>
            <button type="button" data-testid="gps-photo-capture-btn" onClick={capture}
              className="h-16 w-16 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-lg ring-4 ring-amber-200 hover:bg-amber-700 active:scale-95 transition"><Camera className="h-7 w-7" /></button>
            <span className="h-11 w-11" />
          </div>
          <p className="text-center text-xs text-slate-500">Frame the shop signboard/banner and tap the shutter.</p>
        </div>
      )}

      {!value && !camOn && !busy && (
        <button type="button" data-testid="gps-photo-start" onClick={startCamera} disabled={starting}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60 transition">
          {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          {starting ? "Starting camera…" : "Open GPS Camera"}
        </button>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-2.5 text-red-600 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
          <button type="button" onClick={startCamera} className="ml-auto font-semibold underline shrink-0">Retry</button>
        </div>
      )}
    </div>
  );
}
