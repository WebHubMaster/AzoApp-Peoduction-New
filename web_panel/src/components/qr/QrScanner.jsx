import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";

/**
 * Reusable camera QR scanner (client-side, html5-qrcode — no paid API).
 *
 * Props:
 *   - onDetected(text): called with the raw decoded string once, then camera stops.
 *   - label: helper text shown under the viewport.
 *
 * Gracefully handles camera-permission-denied / no-camera by surfacing an error
 * message; the parent always provides a manual text fallback next to it.
 */
export default function QrScanner({ onDetected, label = "Point the camera at the QR" }) {
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const regionId = useRef(`qr-region-${Math.random().toString(36).slice(2)}`);
  const html5Ref = useRef(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(async () => {
    const inst = html5Ref.current;
    html5Ref.current = null;
    if (inst) {
      try {
        await inst.stop();
        await inst.clear();
      } catch { /* ignore */ }
    }
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    setError("");
    setStarting(true);
    stoppedRef.current = false;
    try {
      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode;
      const inst = new Html5Qrcode(regionId.current, { verbose: false });
      html5Ref.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText) => {
          if (stoppedRef.current) return;
          stoppedRef.current = true;
          onDetected && onDetected(decodedText);
          stop();
        },
        () => { /* per-frame decode failure — ignore */ }
      );
      setScanning(true);
    } catch (e) {
      const msg = (e && e.toString()) || "";
      if (/NotAllowedError|Permission|denied/i.test(msg)) {
        setError("Camera permission denied. Use manual entry below, or allow camera access and retry.");
      } else if (/NotFoundError|no camera|Requested device/i.test(msg)) {
        setError("No camera found on this device. Please use manual entry below.");
      } else {
        setError("Unable to start the camera. Please use manual entry below.");
      }
      setScanning(false);
    } finally {
      setStarting(false);
    }
  }, [onDetected, stop]);

  useEffect(() => () => { stoppedRef.current = true; stop(); }, [stop]);

  return (
    <div className="w-full">
      <div
        id={regionId.current}
        className="w-full aspect-square max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950 ring-1 ring-inset ring-white/10 flex items-center justify-center"
      >
        {!scanning && (
          <div className="text-center text-slate-300 px-4">
            <span className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-white/10 grid place-items-center">
              <Camera className="w-8 h-8 opacity-90" />
            </span>
            <p className="text-sm font-medium text-slate-200">Camera is off</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Tap below to start scanning</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {!scanning ? (
          <button
            type="button"
            data-testid="qr-scan-start"
            onClick={start}
            disabled={starting}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-br from-[#0D47A1] to-[#1769d6] text-white text-sm font-semibold shadow-[0_6px_16px_-6px_rgba(13,71,161,0.6)] hover:brightness-105 active:scale-[0.98] transition disabled:opacity-60"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {starting ? "Starting…" : "Start camera scan"}
          </button>
        ) : (
          <button
            type="button"
            data-testid="qr-scan-stop"
            onClick={stop}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium active:scale-[0.98] transition"
          >
            <CameraOff className="w-4 h-4" /> Stop camera
          </button>
        )}
      </div>
      {label && !error && <p className="mt-2.5 text-center text-xs text-slate-500">{label}</p>}
      {error && (
        <p data-testid="qr-scan-error" className="mt-2.5 text-center text-xs text-amber-600 dark:text-amber-400">{error}</p>
      )}
    </div>
  );
}
