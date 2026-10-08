import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Camera, ImageOff, PlayCircle, MapPin, ShieldAlert, ShieldCheck, ScanFace, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { API, mediaSrc } from "@/lib/api";

/**
 * Shared work-proof (before/after photo) viewer used by Customer, Partner & Admin
 * panels. Thumbnails open a full-size lightbox (backdrop click / ESC to close,
 * arrow keys or buttons to navigate).
 */

// Stored proof URLs may be relative ("/api/media/...") or point at an old backend host
// → always resolve them against the CURRENT backend so admin/customer previews load.
const API_ORIGIN = API.replace(/\/api$/, "");
export const proofSrc = (u) => {
  if (!u) return "";
  const s = String(u).trim();
  const m = s.match(/^https?:\/\/[^/]+(\/api\/media\/.*)$/i);
  if (m && API_ORIGIN) return `${API_ORIGIN}${m[1]}`;
  return mediaSrc(s);
};
const norm = (x) => proofSrc(typeof x === "string" ? x : (x?.url || x?.image || ""));
export const isVideoUrl = (u) => /\.(mp4|mov|webm|3gp|mkv)(\?|$)/i.test(u || "");

export function Lightbox({ images, index, title, onClose, onNav }) {
  const list = useMemo(() => (images || []).map(norm).filter(Boolean), [images]);
  const i = Math.min(Math.max(index || 0, 0), Math.max(list.length - 1, 0));
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight") onNav?.(Math.min(i + 1, list.length - 1));
      if (e.key === "ArrowLeft") onNav?.(Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    // NOTE: we intentionally do NOT toggle document.body.style.overflow here.
    // This lightbox is often opened from inside a Radix drawer/dialog which already
    // manages body scroll + pointer-events; touching body overflow ourselves left it
    // stuck and caused the drawer to intercept clicks after the lightbox closed.
    return () => { window.removeEventListener("keydown", onKey); };
  }, [i, list.length, onClose, onNav]);
  if (!list.length) return null;
  return createPortal(
    <div data-testid="workproof-lightbox"
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col"
      onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white/90 shrink-0" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold truncate">{title || "Work photo"} <span className="text-white/50 font-normal">· {i + 1}/{list.length}</span></p>
        <button onClick={onClose} data-testid="lightbox-close"
          className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center transition"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 min-h-0 relative flex items-center justify-center px-2 pb-4" onClick={(e) => e.stopPropagation()}>
        {list.length > 1 && (
          <button onClick={() => onNav?.(Math.max(i - 1, 0))} disabled={i === 0} data-testid="lightbox-prev"
            className="absolute left-2 sm:left-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center disabled:opacity-30 transition">
            <ChevronLeft className="h-5 w-5" /></button>
        )}
        {isVideoUrl(list[i]) ? (
          <video key={list[i]} src={list[i]} controls autoPlay playsInline data-testid="lightbox-video"
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" />
        ) : (
          <img src={list[i]} alt={title || "Work photo"} data-testid="lightbox-image"
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl select-none" draggable={false} />
        )}
        {list.length > 1 && (
          <button onClick={() => onNav?.(Math.min(i + 1, list.length - 1))} disabled={i === list.length - 1} data-testid="lightbox-next"
            className="absolute right-2 sm:right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center disabled:opacity-30 transition">
            <ChevronRight className="h-5 w-5" /></button>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Small clickable thumbnail grid that opens the shared lightbox. */
export function PhotoGrid({ images, title, testid }) {
  const list = useMemo(() => (images || []).map(norm).filter(Boolean), [images]);
  const [open, setOpen] = useState(-1);
  if (!list.length) return null;
  return (
    <div data-testid={testid}>
      <div className="flex flex-wrap gap-2">
        {list.map((u, idx) => (
          <button key={idx} type="button" onClick={() => setOpen(idx)}
            data-testid={testid ? `${testid}-img-${idx}` : undefined}
            className="h-16 w-16 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-primary-400 transition cursor-zoom-in">
            {isVideoUrl(u)
              ? <span className="h-full w-full grid place-items-center bg-slate-900 text-white" data-testid="proof-video-thumb"><PlayCircle className="h-7 w-7" /></span>
              : <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />}
          </button>
        ))}
      </div>
      {open >= 0 && <Lightbox images={list} index={open} title={title} onClose={() => setOpen(-1)} onNav={setOpen} />}
    </div>
  );
}

/** Before/After labelled block (kept at module scope — never re-created on render). */
function ProofBlock({ label, imgs, testid }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
        <Camera className="h-3 w-3" /> {label}
        <span className="normal-case font-semibold text-emerald-600">{imgs.length} file{imgs.length > 1 ? "s" : ""}</span>
      </p>
      {imgs.length
        ? <PhotoGrid images={imgs} title={label} testid={testid} />
        : <p className="text-xs text-slate-400 flex items-center gap-1"><ImageOff className="h-3.5 w-3.5" /> No photos</p>}
    </div>
  );
}

/** Before/After work-proof section (read-only) for customer & admin panels. */
const FM_STYLE = {
  match: { label: "Face matched", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800" },
  mismatch: { label: "Face mismatch", cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800" },
  unverified: { label: "Face not verified", cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
};

/** Admin-only: KYC photo vs check-in selfie verdict + re-check. */
function FaceMatchPanel({ bookingId, checkin }) {
  const [fm, setFm] = useState(checkin?.face_match || null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const recheck = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/admin/bookings/${bookingId}/face-match`); setFm(data); toast.success(`Face check: ${FM_STYLE[data.status]?.label || data.status}`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Face check failed"); }
    finally { setBusy(false); }
  };
  const st = FM_STYLE[fm?.status] || null;
  return (
    <div data-testid="face-match-panel" className={`rounded-xl border p-2.5 text-xs ${st ? st.cls : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {fm?.status === "mismatch" ? <ShieldAlert className="h-4 w-4" /> : fm?.status === "match" ? <ShieldCheck className="h-4 w-4" /> : <ScanFace className="h-4 w-4" />}
        <span data-testid="face-match-status" className="font-extrabold">{st ? st.label : "Face check pending…"}</span>
        {fm?.confidence != null && <span data-testid="face-match-confidence" className="font-semibold opacity-80">{fm.confidence}% confidence</span>}
        <button type="button" data-testid="face-match-recheck" onClick={recheck} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded-md border border-current/20 bg-white/70 dark:bg-slate-900/40 px-2 py-1 font-bold disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-check
        </button>
      </div>
      {fm?.reason && <p data-testid="face-match-reason" className="mt-1 opacity-90">{fm.reason}</p>}
      {(fm?.setup_required || /not configured|turned off/i.test(fm?.reason || "")) && (
        <a data-testid="face-match-configure-link" href="/admin?tab=integration_center&intg=ocr" className="mt-1.5 inline-flex items-center gap-1 font-bold text-primary-700 underline underline-offset-2">Configure Vision AI in Integration Center →</a>
      )}
      {fm?.kyc_photo_url && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => { setIdx(0); setOpen(true); }} className="h-14 w-12 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in" data-testid="face-match-kyc-photo"><img src={proofSrc(fm.kyc_photo_url)} alt="KYC" className="h-full w-full object-cover" /></button>
          <span className="opacity-80">KYC photo vs check-in selfie</span>
        </div>
      )}
      {open && <Lightbox images={[fm.kyc_photo_url, checkin.selfie_url]} index={idx} title="KYC photo · Check-in selfie" onClose={() => setOpen(false)} onNav={setIdx} />}
    </div>
  );
}

export function CheckinProof({ checkin, bookingId, admin = false }) {
  const [open, setOpen] = useState(false);
  if (!checkin?.selfie_url) return null;
  return (
    <div className="space-y-2">
    <div data-testid="checkin-proof" className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5">
      <button type="button" onClick={() => setOpen(true)} className="h-16 w-14 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-zoom-in">
        <img src={proofSrc(checkin.selfie_url)} alt="Partner selfie" className="h-full w-full object-cover" />
      </button>
      <div className="min-w-0 text-xs">
        <p className="font-bold text-slate-700 dark:text-slate-200">Partner check-in selfie</p>
        <p className="text-slate-500">{checkin.at ? new Date(checkin.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
        {checkin.lat != null && (
          <a href={`https://www.google.com/maps?q=${checkin.lat},${checkin.lng}`} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 font-semibold ${checkin.far ? "text-amber-600" : "text-emerald-600"}`}>
            <MapPin className="h-3 w-3" /> {checkin.distance_km != null ? `~${checkin.distance_km} km from address` : "Live location"}{checkin.far ? " · far" : ""}
          </a>
        )}
      </div>
      {open && <Lightbox images={[checkin.selfie_url]} index={0} title="Check-in selfie" onClose={() => setOpen(false)} onNav={() => {}} />}
    </div>
    {admin && bookingId && <FaceMatchPanel bookingId={bookingId} checkin={checkin} />}
    </div>
  );
}

export default function WorkProofSection({ evidence, compact = false, checkin = null, bookingId = null, admin = false }) {
  const before = (evidence?.before || []).map(norm).filter(Boolean);
  const after = (evidence?.after || []).map(norm).filter(Boolean);
  if (!before.length && !after.length && !checkin?.selfie_url) return null;
  return (
    <div className={compact ? "space-y-3" : "rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3"} data-testid="work-proof-section">
      <CheckinProof checkin={checkin} bookingId={bookingId} admin={admin} />
      <ProofBlock label="Before Work" imgs={before} testid="proof-before" />
      <ProofBlock label="After Work" imgs={after} testid="proof-after" />
    </div>
  );
}
