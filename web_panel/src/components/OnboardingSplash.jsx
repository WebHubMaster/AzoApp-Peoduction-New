import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Navigation, Wallet, ArrowRight, ChevronLeft, Store, ShieldCheck } from "lucide-react";
import { useSiteConfig } from "@/context/SiteConfigContext";

const KEY = "azo_onboarded_v1";

const SLIDES = [
  {
    icon: Wrench,
    tone: "from-primary-500 to-primary-700",
    title: "Trusted home experts, on demand",
    sub: "Book AC repair, plumbing, cleaning, electrical & more from background-verified professionals near you.",
    art: ["Wiring & Fitting", "AC Service", "Deep Clean"],
  },
  {
    icon: Navigation,
    tone: "from-sky-500 to-blue-700",
    title: "Track your pro, live",
    sub: "Watch your professional head your way in real time, chat, and pay securely only after the job is done.",
    art: ["Live location", "Secure pay", "On-time"],
  },
  {
    icon: Store,
    tone: "from-emerald-500 to-emerald-700",
    title: "Partners & shops welcome",
    sub: "Earn as a service partner or grow your shop as a merchant — bookings, wallet & payouts, all in one app.",
    art: ["Partner earnings", "Merchant tools", "Daily payouts"],
  },
];

export default function OnboardingSplash() {
  const { branding = {}, loaded } = useSiteConfig();
  const [phase, setPhase] = useState("hidden"); // hidden | splash | intro | leaving
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    let done = true;
    try { done = localStorage.getItem(KEY) === "1"; } catch (e) { done = false; }
    if (done) return undefined;
    // small delay so brand config can load for a truly branded splash
    const t0 = setTimeout(() => setPhase("splash"), 150);
    const t1 = setTimeout(() => setPhase("intro"), 2050);
    return () => { clearTimeout(t0); clearTimeout(t1); };
  }, []);

  const finish = useCallback(() => {
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ }
    setPhase("leaving");
    setTimeout(() => setPhase("hidden"), 450);
  }, []);

  const next = useCallback(() => {
    if (idx >= SLIDES.length - 1) { finish(); return; }
    setDir(1); setIdx((i) => i + 1);
  }, [idx, finish]);

  const back = useCallback(() => { if (idx > 0) { setDir(-1); setIdx((i) => i - 1); } }, [idx]);

  if (phase === "hidden") return null;

  const name = branding.site_name || "AzoApp";
  const logo = branding.logo || branding.logo_light || branding.logo_dark || "";
  const initial = (name || "A").trim()[0].toUpperCase();

  return (
    <AnimatePresence>
      {phase !== "hidden" && (
        <motion.div
          data-testid="onboarding-splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === "leaving" ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] overflow-hidden bg-slate-950 text-white"
        >
          {/* ambient brand gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,hsl(var(--primary)/0.55),transparent_60%),radial-gradient(90%_70%_at_100%_110%,rgba(16,185,129,0.35),transparent_55%)]" />
          <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] bg-[size:30px_30px]" />

          <div className="relative h-full w-full flex flex-col items-center justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] max-w-md mx-auto">

            {/* ---- SPLASH ---- */}
            {phase === "splash" && (
              <motion.div
                key="splash"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 20 }}
                className="flex flex-col items-center text-center"
              >
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="relative"
                >
                  <span className="absolute -inset-4 rounded-[28px] bg-white/10 blur-xl" />
                  {logo ? (
                    <img src={logo} alt={name} className="relative h-20 w-20 rounded-[24px] object-contain bg-white/95 p-2 shadow-2xl" />
                  ) : (
                    <span className="relative flex h-20 w-20 rounded-[24px] bg-white text-slate-900 items-center justify-center font-heading font-black text-4xl shadow-2xl">{initial}</span>
                  )}
                </motion.div>
                <motion.h1
                  initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}
                  className="mt-6 font-heading font-black text-3xl tracking-tight">{name}</motion.h1>
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                  className="mt-2 text-white/70 text-sm">{branding.tagline || "Home services, made simple"}</motion.p>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                  className="mt-8 h-1 w-28 rounded-full bg-white/15 overflow-hidden">
                  <motion.span className="block h-full w-1/2 bg-white/80"
                    animate={{ x: ["-60%", "220%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }} />
                </motion.div>
              </motion.div>
            )}

            {/* ---- INTRO CAROUSEL ---- */}
            {(phase === "intro" || phase === "leaving") && (
              <div className="w-full flex flex-col h-full py-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {logo ? <img src={logo} alt={name} className="h-8 w-8 rounded-xl object-contain bg-white/95 p-0.5" />
                      : <span className="flex h-8 w-8 rounded-xl bg-white text-slate-900 items-center justify-center font-heading font-black">{initial}</span>}
                    <span className="font-heading font-bold">{name}</span>
                  </div>
                  <button data-testid="onboarding-skip" onClick={finish} className="text-sm font-semibold text-white/70 hover:text-white active:opacity-60 px-2 py-1">Skip</button>
                </div>

                <div className="flex-1 flex items-center">
                  <div className="w-full">
                    <AnimatePresence mode="wait" custom={dir}>
                      <motion.div
                        key={idx}
                        custom={dir}
                        initial={{ x: dir * 60, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: dir * -60, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                        className="text-center"
                      >
                        {(() => {
                          const S = SLIDES[idx];
                          const Icon = S.icon;
                          return (
                            <>
                              <div className={`mx-auto h-28 w-28 rounded-[32px] bg-gradient-to-br ${S.tone} flex items-center justify-center shadow-2xl shadow-black/40 ring-1 ring-white/15`}>
                                <Icon className="h-14 w-14 text-white" strokeWidth={1.8} />
                              </div>
                              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                                {S.art.map((a) => (
                                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-[12px] font-medium text-white/85 ring-1 ring-white/10">
                                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> {a}
                                  </span>
                                ))}
                              </div>
                              <h2 className="mt-7 font-heading font-black text-[26px] leading-tight tracking-tight px-2">{S.title}</h2>
                              <p className="mt-3 text-white/70 text-[15px] leading-relaxed px-3">{S.sub}</p>
                            </>
                          );
                        })()}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                {/* dots */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  {SLIDES.map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-7 bg-white" : "w-1.5 bg-white/30"}`} />
                  ))}
                </div>

                {/* actions */}
                <div className="flex items-center gap-3">
                  {idx > 0 ? (
                    <button data-testid="onboarding-back" onClick={back}
                      className="min-h-[52px] px-4 rounded-2xl bg-white/10 backdrop-blur text-white font-semibold inline-flex items-center gap-1 active:scale-95 transition-transform ring-1 ring-white/10">
                      <ChevronLeft className="h-5 w-5" /> Back
                    </button>
                  ) : null}
                  <button data-testid="onboarding-next" onClick={next}
                    className="flex-1 min-h-[52px] rounded-2xl bg-white text-slate-900 font-heading font-bold text-[15px] inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-xl shadow-black/30">
                    {idx >= SLIDES.length - 1 ? "Get Started" : "Next"} <ArrowRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
