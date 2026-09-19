import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** true when viewport < 640px (Tailwind `sm`) — lets overlays render ONE variant only */
export function useMediaQuery(q) {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = (e) => setM(e.matches);
    mq.addEventListener ? mq.addEventListener("change", fn) : mq.addListener(fn);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", fn) : mq.removeListener(fn));
  }, [q]);
  return m;
}
export const useIsMobile = () => useMediaQuery("(max-width: 639px)");
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft } from "lucide-react";

/**
 * SlideOver — desktop: right-side drawer; mobile: full-screen app-style page.
 * Sits above the merchant bottom nav (z-80). Locks body scroll while open.
 */
export function SlideOver({ open, onClose, title, subtitle, children, footer, headerRight, testid, width = 520 }) {
  const mobile = useIsMobile();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]" data-testid={testid} role="dialog" aria-modal="true">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
          {/* desktop drawer */}
          {!mobile && <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 340 }}
            style={{ maxWidth: width }}
            className="flex absolute right-0 top-0 h-full w-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex-col shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white truncate">{title}</h3>
                {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {headerRight}
                <button onClick={onClose} data-testid="slideover-close" aria-label="Close" className="h-9 w-9 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 transition-colors"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-white dark:bg-slate-900">{footer}</div>}
          </motion.div>}
          {/* mobile full-screen page */}
          {mobile && <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 340 }}
            className="absolute inset-0 bg-slate-50 dark:bg-slate-950 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
              <button onClick={onClose} data-testid="slideover-back" aria-label="Back" className="h-11 w-11 rounded-xl grid place-items-center text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white truncate leading-tight">{title}</h3>
                {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
              </div>
              {headerRight}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">{children}</div>
            {footer && <div className="absolute bottom-0 inset-x-0 border-t border-slate-200 dark:border-slate-800 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-white/95 dark:bg-slate-900/95 backdrop-blur">{footer}</div>}
          </motion.div>}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Bottom sheet (mobile) / centered dialog (desktop) — used for share options */
export function ActionSheet({ open, onClose, title, children, testid }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]" data-testid={testid} role="dialog" aria-modal="true">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 360 }}
            className="absolute bottom-0 inset-x-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[380px] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-4">
            <div className="sm:hidden mx-auto h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 mt-3" />
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="font-heading font-bold text-slate-900 dark:text-white">{title}</p>
              <button onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-4 pb-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
