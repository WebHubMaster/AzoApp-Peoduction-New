import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Crown, Zap, BadgeCheck, Headphones, CheckCircle2, X } from "lucide-react";
import { motion } from "framer-motion";
import api from "@/lib/api";

const BENEFIT_ICONS = [Zap, Crown, BadgeCheck, Headphones];

export default function StarterKitUpsellPopup({ onUpgrade }) {
  const [offer, setOffer] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get("/partner/starter-kit-upsell")
      .then((r) => { if (alive && r.data?.show) { setOffer(r.data.offer); setOpen(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const dismiss = () => {
    setOpen(false);
    api.post("/partner/starter-kit-upsell/dismiss").catch(() => {});
  };

  const upgrade = () => {
    setOpen(false);
    api.post("/partner/starter-kit-upsell/dismiss").catch(() => {});
    onUpgrade?.();
  };

  if (!offer) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent
        data-testid="starter-kit-upsell-popup"
        className="p-0 overflow-hidden border-0 max-w-md bg-transparent shadow-none [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Upgrade to Pro with the Starter Kit</DialogTitle>
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="relative rounded-2xl overflow-hidden bg-slate-900 text-white shadow-2xl ring-1 ring-amber-400/30"
        >
          {/* glow accents */}
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-amber-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />

          <button
            data-testid="upsell-dismiss"
            onClick={dismiss}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-7 pt-8 pb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/30">
              <Crown className="h-3.5 w-3.5" /> Exclusive Pro Offer
            </span>

            <h2 className="mt-4 font-heading text-[28px] leading-tight font-extrabold">
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-200 bg-clip-text text-transparent">
                {offer.headline}
              </span>
            </h2>
            <p className="mt-2 text-sm font-semibold text-white/90">{offer.subheadline}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{offer.body}</p>

            <ul className="mt-5 space-y-2.5">
              {(offer.benefits || []).map((b, i) => {
                const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length] || CheckCircle2;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/20">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[13.5px] font-medium text-white/90">{b}</span>
                  </li>
                );
              })}
            </ul>

            <button
              data-testid="upsell-upgrade-btn"
              onClick={upgrade}
              className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-3.5 text-[15px] font-extrabold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:from-amber-300 hover:to-yellow-400 active:scale-[0.98]"
            >
              <Crown className="h-5 w-5" /> {offer.cta_label || "Upgrade to Pro"}
            </button>
            <button
              data-testid="upsell-maybe-later"
              onClick={dismiss}
              className="mt-2 w-full py-2 text-xs font-semibold text-white/50 hover:text-white/80 transition"
            >
              Maybe later
            </button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
