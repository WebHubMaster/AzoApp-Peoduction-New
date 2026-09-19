import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Camera, ImageOff } from "lucide-react";

/**
 * Shared work-proof (before/after photo) viewer used by Customer, Partner & Admin
 * panels. Thumbnails open a full-size lightbox (backdrop click / ESC to close,
 * arrow keys or buttons to navigate).
 */

const norm = (x) => (typeof x === "string" ? x : (x?.url || x?.image || ""));

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
        <img src={list[i]} alt={title || "Work photo"} data-testid="lightbox-image"
          className="max-h-full max-w-full object-contain rounded-lg shadow-2xl select-none" draggable={false} />
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
            className="h-16 w-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-primary-400 transition cursor-zoom-in">
            <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
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
        <span className="normal-case font-semibold text-emerald-600">{imgs.length} photo{imgs.length > 1 ? "s" : ""}</span>
      </p>
      {imgs.length
        ? <PhotoGrid images={imgs} title={label} testid={testid} />
        : <p className="text-xs text-slate-400 flex items-center gap-1"><ImageOff className="h-3.5 w-3.5" /> No photos</p>}
    </div>
  );
}

/** Before/After work-proof section (read-only) for customer & admin panels. */
export default function WorkProofSection({ evidence, compact = false }) {
  const before = (evidence?.before || []).map(norm).filter(Boolean);
  const after = (evidence?.after || []).map(norm).filter(Boolean);
  if (!before.length && !after.length) return null;
  return (
    <div className={compact ? "space-y-3" : "rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3"} data-testid="work-proof-section">
      <ProofBlock label="Before Work" imgs={before} testid="proof-before" />
      <ProofBlock label="After Work" imgs={after} testid="proof-after" />
    </div>
  );
}
