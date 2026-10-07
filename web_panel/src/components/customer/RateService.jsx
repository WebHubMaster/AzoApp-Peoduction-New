import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Star, CheckCircle2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRealtime } from "@/context/RealtimeContext";
import { useCart } from "@/context/CartContext";

const LIVE_EVENTS = ["booking_update", "booking_completed", "__resync__"];
const NO_AUTO = ["/login", "/book", "/payment"];
const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const on = () => setOpen(window.innerHeight - vv.height > 150);
    vv.addEventListener("resize", on);
    return () => vv.removeEventListener("resize", on);
  }, []);
  return open;
}

function usePendingReviews(isCustomer) {
  const [items, setItems] = useState([]);
  const rt = useRealtime();
  const load = useCallback(async () => {
    if (!isCustomer) { setItems([]); return; }
    try { const { data } = await api.get("/bookings/my/pending-reviews"); setItems(data.items || []); } catch { /* keep last */ }
  }, [isCustomer]);
  useEffect(() => {
    load();
    if (!isCustomer) return undefined;
    const t = setInterval(load, 20000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load, isCustomer]);
  const subscribe = rt?.subscribe;
  useEffect(() => subscribe?.((ev) => { if (LIVE_EVENTS.includes(ev?.type)) setTimeout(load, 600); }), [subscribe, load]);
  return { items, setItems, load };
}

export default function RateService() {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const { count: cartCount } = useCart();
  const kbOpen = useKeyboardOpen();
  const isCustomer = user?.role === "customer";
  const { items, setItems, load } = usePendingReviews(isCustomer);
  const [current, setCurrent] = useState(null);
  const handled = useRef(new Set());
  useEffect(() => { load(); }, [pathname, load]);

  useEffect(() => {
    if (current || !isCustomer || NO_AUTO.some((p) => pathname.startsWith(p))) return;
    const next = items[0]?.auto_prompt && !handled.current.has(items[0].id) ? items[0] : null;
    if (next) { handled.current.add(next.id); setCurrent(next); }
  }, [items, current, isCustomer, pathname]);

  const close = (rated) => {
    const b = current;
    setCurrent(null);
    if (!b) return;
    items.forEach((x) => handled.current.add(x.id));
    if (rated) setItems((xs) => xs.filter((x) => x.id !== b.id).map((x) => ({ ...x, auto_prompt: false })));
    else {
      setItems((xs) => xs.map((x) => ({ ...x, auto_prompt: false })));
      api.post(`/bookings/${b.id}/review-prompt-dismiss`).catch(() => {});
    }
    setTimeout(load, 400);
  };

  const tab = new URLSearchParams(search).get("tab");
  const onHome = pathname === "/" || (pathname === "/account" && (!tab || tab === "home"));
  const showBtn = isCustomer && onHome && items.length > 0 && !current && !kbOpen;

  return (
    <>
      <AnimatePresence>
        {showBtn && <RateButton key="rb" item={items[0]} total={items.length} onLanding={pathname === "/"} cartActive={cartCount > 0}
          onClick={() => { handled.current.add(items[0].id); setCurrent(items[0]); }} />}
      </AnimatePresence>
      <RateModal booking={current} onClose={close} />
    </>
  );
}

function RateButton({ item, total, onLanding, cartActive, onClick }) {
  useEffect(() => {
    window.__azoRateBar = true; window.dispatchEvent(new Event("azo:ratebar"));
    return () => { window.__azoRateBar = false; window.dispatchEvent(new Event("azo:ratebar")); };
  }, []);
  // On "/" the Custom-Job FAB sits bottom-right, so the bar stops just left of it.
  const pos = onLanding
    ? `left-3 right-[5.25rem] lg:left-auto lg:right-[6.5rem] lg:bottom-[1.75rem] ${cartActive ? "bottom-[calc(9.25rem_+_env(safe-area-inset-bottom))]" : "bottom-[calc(5.25rem_+_env(safe-area-inset-bottom))]"}`
    : "left-3 right-3 lg:left-auto lg:right-6 lg:bottom-6 bottom-[calc(4.6rem_+_env(safe-area-inset-bottom))]";
  return (
    <motion.div data-testid="rate-service-bar" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={{ duration: 0.22, ease: "easeOut" }}
      className={`fixed z-[75] ${pos} sm:max-w-[400px] sm:mx-auto lg:mx-0 lg:w-[360px]`}>
      <div className="flex items-center gap-3 h-14 pl-2 pr-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/80 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.18)]">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 grid place-items-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p data-testid="rate-service-name" className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-white">{item.service_name}</p>
          <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">Completed{total > 1 ? ` \u00b7 ${total - 1} more to rate` : ""}</p>
        </div>
        <button data-testid="rate-service-btn" onClick={onClick}
          className="shrink-0 h-9 px-3.5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-[12.5px] font-semibold tracking-tight active:scale-[0.97] transition-[transform,background-color] duration-150">
          Rate service
        </button>
      </div>
    </motion.div>
  );
}

function RateModal({ booking, onClose }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStars(0); setHover(0); setComment(""); setBusy(false); }, [booking?.id]);

  const submit = async () => {
    if (!booking || !stars) return;
    setBusy(true);
    try {
      await api.post(`/bookings/${booking.id}/review`, { rating: stars, comment: comment.trim() });
      toast.success("Thanks for your rating!");
      onClose(true);
    } catch (e) {
      setBusy(false);
      const msg = e?.response?.data?.detail || "Could not submit rating";
      if (/already reviewed/i.test(msg)) onClose(true); else toast.error(msg);
    }
  };
  const shown = hover || stars;

  return createPortal(
    <AnimatePresence>
      {booking && (
        <motion.div key="rm" className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-slate-900/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onClose(false)}>
          <motion.div data-testid="rate-service-modal" onClick={(e) => e.stopPropagation()}
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold tracking-wider text-emerald-600">SERVICE COMPLETED</p>
                <h3 data-testid="rate-modal-service" className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white truncate">{booking.service_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">#{booking.code}{booking.partner_name ? ` · by ${booking.partner_name}` : ""}</p>
              </div>
              <button data-testid="rate-modal-close" onClick={() => onClose(false)} className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-5 text-center text-sm font-semibold text-slate-500">How was your experience?</p>
            <div className="mt-3 flex justify-center gap-2" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} data-testid={`rate-star-${n}`} onClick={() => setStars(n)} onMouseEnter={() => setHover(n)}
                  className={`p-0.5 transition-transform active:scale-90 ${n <= shown ? "scale-110" : ""}`}>
                  <Star className={`h-9 w-9 ${n <= shown ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
                </button>
              ))}
            </div>
            <p data-testid="rate-star-label" className="h-5 mt-1 text-center text-sm font-bold text-amber-600">{LABELS[shown]}</p>
            <textarea data-testid="rate-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3}
              placeholder="Share more about your experience (optional)"
              className="mt-3 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent p-3 text-sm text-slate-800 dark:text-white outline-none focus:border-primary-500 resize-none" />
            <div className="mt-4 flex gap-2.5">
              <button data-testid="rate-later-btn" onClick={() => onClose(false)} className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">Not now</button>
              <button data-testid="rate-submit-btn" disabled={!stars || busy} onClick={submit}
                className="flex-[2] h-12 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-extrabold disabled:opacity-50 flex items-center justify-center">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit rating"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
