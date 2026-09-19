import { useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Sparkles } from "lucide-react";
import CustomJobWizard from "@/components/customer/CustomJobWizard";
import { useCart } from "@/context/CartContext";

// Only show on the PUBLIC front-website pages (never inside logged-in panels).
const PUBLIC_PREFIXES = ["/", "/services", "/service", "/category", "/membership", "/about", "/contact"];

function isPublicRoute(pathname) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/")));
}

export default function CustomJobFAB() {
  const { pathname } = useLocation();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [showTip, setShowTip] = useState(true);

  if (!isPublicRoute(pathname)) return null;

  // When the cart has item(s), the "View your booking / Checkout" bar appears at
  // the bottom (bottom-16 on mobile). Lift the FAB above it so they never overlap;
  // also hide the "Need a Custom Service?" tip pill to keep the corner clean.
  const cartActive = count > 0;

  return (
    <>
      <div
        className={`fixed z-[190] right-4 lg:right-6 lg:bottom-6 ${cartActive
          ? "bottom-[calc(9rem_+_env(safe-area-inset-bottom))]"
          : "bottom-[calc(5rem_+_env(safe-area-inset-bottom))]"}`}
        data-testid="custom-job-fab-wrap">
        <div className="flex items-center gap-2 justify-end">
          <AnimatePresence>
            {showTip && !cartActive && (
              <motion.div
                initial={{ opacity: 0, x: 8, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 8, scale: 0.9 }}
                className="hidden sm:flex items-center gap-1.5 bg-white dark:bg-slate-800 shadow-lg rounded-full pl-3 pr-3 py-2 border border-slate-100 dark:border-slate-700">
                <Sparkles className="h-3.5 w-3.5 text-primary-600" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  Need a Custom Service?
                </span>
                <button onClick={() => setShowTip(false)}
                  className="text-slate-300 hover:text-slate-500 text-sm leading-none ml-0.5">×</button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setOpen(true)}
            aria-label="Request a custom service"
            data-testid="custom-job-fab"
            className="relative h-14 w-14 sm:h-15 sm:w-15 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-xl grid place-items-center active:scale-95 transition-transform group">
            {/* soft continuous pulse ring (subtle, not annoying) */}
            <span className="absolute inset-0 rounded-full bg-primary-500/40 animate-ping [animation-duration:2.5s]" />
            <span className="absolute inset-0 rounded-full ring-2 ring-white/30" />
            <Wrench className="h-6 w-6 relative z-10 group-hover:rotate-12 transition-transform" strokeWidth={2} />
            {/* mobile mini-badge */}
            <span className="sm:hidden absolute -top-1 -left-1 h-4 w-4 rounded-full bg-amber-400 grid place-items-center">
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </span>
          </button>
        </div>
      </div>

      <CustomJobWizard open={open} onClose={() => setOpen(false)} />
    </>
  );
}
