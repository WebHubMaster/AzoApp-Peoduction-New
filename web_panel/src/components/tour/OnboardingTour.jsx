import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TOUR_STEPS } from "./tourSteps";

const BRAND = "#0D47A1";
const SPOT_PAD = 8; // padding around the highlighted element
const MARGIN = 12; // min gap from viewport edges
const GAP = 14; // gap between element and tooltip
const TIP_W = () => Math.min(340, window.innerWidth - 2 * MARGIN);

// Is the element actually rendered & visible right now?
function isVisible(el) {
  if (!el) return false;
  const s = window.getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity || "1") === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

// First visible element for a (possibly multi) selector.
function findTarget(selector) {
  if (!selector) return null;
  let els = [];
  try { els = Array.from(document.querySelectorAll(selector)); } catch { return null; }
  return els.find(isVisible) || null;
}

/**
 * OnboardingTour — premium, database-backed, first-time product walkthrough.
 * Self-contained: reads the authenticated user + role, shows the matching tour
 * once when `onboarding_tour_status` is pending, and persists completed/skipped
 * to the server so it never re-appears.
 */
export default function OnboardingTour() {
  const { user, setUser } = useAuth();
  const role = user?.role;
  const steps = (role && TOUR_STEPS[role]) || [];
  const status = user?.onboarding_tour_status ?? "pending";

  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null); // target rect (viewport coords) or null => centered
  const [pos, setPos] = useState(null); // computed tooltip position
  const tipRef = useRef(null);
  const startedRef = useRef(false);

  // ── start once, on first dashboard mount, only when pending ──────────────
  useEffect(() => {
    if (startedRef.current) return;
    if (!user || !steps.length) return;
    if (status !== "pending") return;
    startedRef.current = true;
    const t = setTimeout(() => { setIdx(0); setActive(true); }, 750);
    return () => clearTimeout(t);
  }, [user, status, steps.length]);

  // ── lock body scroll while the tour runs ─────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);

  // ── measure the current step's target (with scroll-into-view) ────────────
  const measure = useCallback(() => {
    const step = steps[idx];
    if (!step) return;
    const el = findTarget(step.selector);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [idx, steps]);

  useEffect(() => {
    if (!active) return;
    const step = steps[idx];
    if (!step) return;
    const el = findTarget(step.selector);
    if (el) {
      try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch { /* noop */ }
      const t = setTimeout(measure, 380); // after smooth scroll settles
      return () => clearTimeout(t);
    }
    setRect(null);
  }, [active, idx, steps, measure]);

  // ── keep aligned on resize / orientation change ──────────────────────────
  useEffect(() => {
    if (!active) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [active, measure]);

  // ── compute tooltip placement (viewport-clamped, arrow toward target) ────
  useLayoutEffect(() => {
    if (!active) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = TIP_W();
    const th = tipRef.current?.offsetHeight || 200;

    if (!rect) { setPos({ mode: "center", top: (vh - th) / 2, left: (vw - tw) / 2, tw }); return; }

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const space = {
      bottom: vh - (rect.top + rect.height),
      top: rect.top,
      right: vw - (rect.left + rect.width),
      left: rect.left,
    };
    let place = "bottom";
    if (space.bottom >= th + GAP) place = "bottom";
    else if (space.top >= th + GAP) place = "top";
    else if (space.right >= tw + GAP) place = "right";
    else if (space.left >= tw + GAP) place = "left";
    else place = "bottom";

    let top, left;
    if (place === "bottom") { top = rect.top + rect.height + GAP; left = cx - tw / 2; }
    else if (place === "top") { top = rect.top - GAP - th; left = cx - tw / 2; }
    else if (place === "right") { left = rect.left + rect.width + GAP; top = cy - th / 2; }
    else { left = rect.left - GAP - tw; top = cy - th / 2; }

    left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - th - MARGIN));

    // arrow offset along the shared edge, aligned to the element centre
    let arrow;
    if (place === "bottom" || place === "top") {
      arrow = { left: Math.max(16, Math.min(cx - left, tw - 16)), edge: place === "bottom" ? "top" : "bottom" };
    } else {
      arrow = { top: Math.max(16, Math.min(cy - top, th - 16)), edge: place === "right" ? "left" : "right" };
    }
    setPos({ mode: "anchored", place, top, left, tw, arrow });
  }, [rect, active, idx]);

  const persist = useCallback(async (next) => {
    setActive(false);
    try { await api.post("/auth/onboarding-tour", { status: next }); } catch { /* best-effort */ }
    if (setUser) setUser((u) => (u ? { ...u, onboarding_tour_status: next } : u));
  }, [setUser]);

  const next = useCallback(() => {
    if (idx >= steps.length - 1) persist("completed");
    else setIdx((i) => i + 1);
  }, [idx, steps.length, persist]);
  const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const skip = useCallback(() => persist("skipped"), [persist]);

  // ── keyboard: Esc = skip, ←/→ navigate ───────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === "Escape") skip();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, skip]);

  if (!active || !steps.length) return null;
  const step = steps[idx];
  const isLast = idx === steps.length - 1;
  const tw = pos?.tw || TIP_W();

  const overlay = (
    <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: "auto" }} aria-live="polite" role="dialog" aria-modal="true">
      {/* Interaction blocker (kept below the visuals) */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Spotlight cut-out OR full dim (centered mode) */}
      {rect ? (
        <motion.div
          initial={false}
          animate={{ top: rect.top - SPOT_PAD, left: rect.left - SPOT_PAD, width: rect.width + SPOT_PAD * 2, height: rect.height + SPOT_PAD * 2 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="absolute rounded-2xl"
          style={{
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
            outline: `2px solid ${BRAND}`,
            outlineOffset: 2,
            pointerEvents: "none",
          }}
        >
          <span className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: `0 0 0 4px rgba(13,71,161,0.25)` }} />
        </motion.div>
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(2px)" }} />
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          ref={tipRef}
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(2,32,71,0.45)] ring-1 ring-slate-900/5"
          style={{ top: pos?.top ?? 120, left: pos?.left ?? 20, width: tw, pointerEvents: "auto" }}
        >
          {/* arrow */}
          {pos?.mode === "anchored" && pos.arrow && (
            <span
              className="absolute h-3 w-3 rotate-45 bg-white"
              style={{
                boxShadow: "-2px -2px 4px -2px rgba(2,32,71,0.15)",
                ...(pos.arrow.edge === "top" ? { top: -6, left: pos.arrow.left - 6 } : {}),
                ...(pos.arrow.edge === "bottom" ? { bottom: -6, left: pos.arrow.left - 6, boxShadow: "2px 2px 4px -2px rgba(2,32,71,0.15)" } : {}),
                ...(pos.arrow.edge === "left" ? { left: -6, top: pos.arrow.top - 6 } : {}),
                ...(pos.arrow.edge === "right" ? { right: -6, top: pos.arrow.top - 6, boxShadow: "2px 2px 4px -2px rgba(2,32,71,0.15)" } : {}),
              }}
            />
          )}

          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: BRAND }}>
                  <Sparkles className="h-4 w-4" />
                </span>
                <h3 className="font-heading font-extrabold text-[16px] leading-tight text-slate-900">{step.title}</h3>
              </div>
              <button
                onClick={skip}
                aria-label="Skip tour"
                className="shrink-0 h-8 w-8 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-600">{step.body}</p>

            {/* progress dots */}
            <div className="mt-4 flex items-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{ width: i === idx ? 22 : 6, background: i <= idx ? BRAND : "#E2E8F0" }}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-slate-400">{idx + 1} of {steps.length}</span>
              <div className="flex items-center gap-2">
                {idx > 0 && (
                  <button
                    onClick={back}
                    className="inline-flex items-center gap-1 h-10 px-3.5 rounded-xl text-[13px] font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                )}
                <button
                  onClick={next}
                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-bold text-white shadow-md active:scale-95 transition-all"
                  style={{ background: BRAND, boxShadow: "0 8px 18px -6px rgba(13,71,161,0.6)" }}
                >
                  {isLast ? (<><Check className="h-4 w-4" /> Finish</>) : (<>Next <ArrowRight className="h-4 w-4" /></>)}
                </button>
              </div>
            </div>

            {/* Persistent, always-visible skip */}
            <button
              onClick={skip}
              className="mt-3 w-full text-center text-[12px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Skip tour
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  return createPortal(overlay, document.body);
}
