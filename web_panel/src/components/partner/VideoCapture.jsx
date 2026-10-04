import React, { useCallback, useEffect, useRef, useState } from "react";
import { Video, X, RefreshCw, Check, RotateCcw, Loader2, Square } from "lucide-react";

export const MAX_VIDEO_SEC = 30;

/**
 * VideoCapture — LIVE camera video recording (≤30s) via MediaRecorder. No gallery.
 * onCapture receives a File (video/webm or video/mp4 depending on the browser).
 */
export default function VideoCapture({ open, title = "Record video", onClose, onCapture, uploading, progress = 0 }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [clip, setClip] = useState(null); // { blob, url, mime }

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") { try { recRef.current.stop(); } catch { /* noop */ } }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(""); setReady(false);
    stop();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Video recording is not supported on this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; await videoRef.current.play().catch(() => {}); }
      setReady(true);
    } catch (e) {
      setError(e?.name === "NotAllowedError" ? "Camera/microphone permission denied. Please allow access to record work proof." : "Unable to open the camera. Make sure no other app is using it.");
    }
  }, [stop]);

  useEffect(() => {
    if (open) { setClip((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; }); setSecs(0); start(); }
    else stop();
    return () => stop();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginRecording = () => {
    if (!streamRef.current) return;
    const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const type = (rec.mimeType || mime || "video/webm").split(";")[0];
      const blob = new Blob(chunksRef.current, { type });
      setClip({ blob, url: URL.createObjectURL(blob), mime: type });
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
    recRef.current = rec;
    rec.start(500);
    setRecording(true); setSecs(0);
    timerRef.current = setInterval(() => setSecs((s) => {
      if (s + 1 >= MAX_VIDEO_SEC) { endRecording(); return MAX_VIDEO_SEC; }
      return s + 1;
    }), 1000);
  };
  const endRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  };
  const retake = () => { if (clip?.url) URL.revokeObjectURL(clip.url); setClip(null); setSecs(0); start(); };
  const confirm = () => {
    if (!clip) return;
    const ext = clip.mime.includes("mp4") ? "mp4" : "webm";
    onCapture?.(new File([clip.blob], `proof-${Date.now()}.${ext}`, { type: clip.mime }), secs);
  };
  const handleClose = () => { stop(); if (clip?.url) URL.revokeObjectURL(clip.url); setClip(null); onClose?.(); };

  if (!open) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" data-testid="video-capture">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 font-semibold"><Video className="h-5 w-5" /> {title}</div>
        <button onClick={handleClose} data-testid="video-close" className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center px-6">
            <p className="text-white/90 mb-4" data-testid="video-error">{error}</p>
            <button onClick={start} className="inline-flex items-center gap-2 px-4 h-11 rounded-md bg-white text-slate-900 font-semibold"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        ) : clip ? (
          <video src={clip.url} controls playsInline className="max-h-full max-w-full object-contain" data-testid="video-preview" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" data-testid="video-live" />
            {!ready && <div className="absolute inset-0 grid place-items-center text-white/80"><Loader2 className="h-8 w-8 animate-spin" /></div>}
            {recording && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-red-600 text-white px-3 py-1 text-sm font-bold" data-testid="video-timer">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> REC 00:{pad(secs)} / 00:{MAX_VIDEO_SEC}
              </div>
            )}
          </>
        )}
      </div>
      <div className="px-4 py-5 flex items-center justify-center gap-6 bg-black">
        {clip ? (
          <>
            <button onClick={retake} disabled={uploading} data-testid="video-retake" className="inline-flex items-center gap-2 px-5 h-12 rounded-md bg-white/10 text-white font-semibold disabled:opacity-50"><RotateCcw className="h-5 w-5" /> Re-record</button>
            <button onClick={confirm} disabled={uploading} data-testid="video-confirm" className="inline-flex items-center gap-2 px-6 h-12 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-60">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} {uploading ? `Uploading… ${progress}%` : "Use video"}
            </button>
          </>
        ) : recording ? (
          <button onClick={endRecording} data-testid="video-stop" className="h-16 w-16 rounded-full bg-red-600 ring-4 ring-red-400/50 grid place-items-center active:scale-95 transition" aria-label="Stop"><Square className="h-6 w-6 text-white fill-white" /></button>
        ) : (
          <button onClick={beginRecording} disabled={!ready} data-testid="video-record" className="h-16 w-16 rounded-full bg-white ring-4 ring-white/40 grid place-items-center disabled:opacity-40 active:scale-95 transition" aria-label="Record"><span className="h-7 w-7 rounded-full bg-red-600" /></button>
        )}
      </div>
    </div>
  );
}
