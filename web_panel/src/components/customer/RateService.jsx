import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Check, X, Loader2, Heart, Wallet } from "lucide-react";
import { runPayment } from "@/lib/payments";
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
  useEffect(() => subscribe?.((ev) => { if (LIVE_EVENTS.includes(ev?.type)) setTimeout(load, 150); }), [subscribe, load]);
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
  const showBtn = isCustomer && onHome && items.length > 0 && !current && !kbOpen && !(pathname === "/" && cartCount > 0);

  return (
    <>
      <AnimatePresence>
        {showBtn && <div key="rb-space" aria-hidden className="lg:hidden h-[3.75rem]" />}
        {showBtn && <RateButton key="rb" item={items[0]} total={items.length} onLanding={pathname === "/"}
          onClick={() => { handled.current.add(items[0].id); setCurrent(items[0]); }} />}
      </AnimatePresence>
      <RateModal booking={current} onClose={close} />
    </>
  );
}

function completedLabel(iso) {
  if (!iso) return "Completed";
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Completed today";
  if (days === 1) return "Completed yesterday";
  return `Completed ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function useBottomNavHeight() {
  const [h, setH] = useState(null);
  useEffect(() => {
    let ro; let raf;
    const attach = () => {
      const nav = document.querySelector("[data-bottom-nav]");
      if (!nav) { raf = requestAnimationFrame(attach); return; }
      const on = () => setH(nav.getBoundingClientRect().height);
      on(); ro = new ResizeObserver(on); ro.observe(nav);
    };
    attach();
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, []);
  return h;
}

function RateButton({ item, total, onLanding, onClick }) {
  const navH = useBottomNavHeight();
  useEffect(() => {
    window.__azoRateBar = true; window.dispatchEvent(new Event("azo:ratebar"));
    return () => { window.__azoRateBar = false; window.dispatchEvent(new Event("azo:ratebar")); };
  }, []);
  return (
    <motion.div data-testid="rate-service-bar" style={navH != null && window.innerWidth < 1024 ? { bottom: navH } : undefined} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed z-[39] inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-6 lg:w-[380px] ${onLanding ? "lg:bottom-[6.25rem]" : "lg:bottom-6"}
        bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.18)]
        lg:rounded-2xl lg:border lg:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.25)]`}>
      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 grid place-items-center">
          <Check className="h-5 w-5 text-slate-800 dark:text-slate-100" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p data-testid="rate-service-name" className="truncate text-[14px] font-semibold text-slate-900 dark:text-white leading-5">{item.service_name}</p>
          <p className="truncate text-[12px] text-slate-500 dark:text-slate-400 leading-4">
            {completedLabel(item.completed_at)}
            {total > 1 && <span data-testid="rate-service-more" className="ml-1.5 text-slate-400">· {total - 1} more</span>}
          </p>
        </div>
        <button data-testid="rate-service-btn" onClick={onClick}
          className="shrink-0 h-10 px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-[13.5px] font-semibold active:scale-[0.97] transition-[transform,background-color] duration-150">
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
  const [paying, setPaying] = useState(false);
  useEffect(() => { setStars(0); setHover(0); setComment(""); setBusy(false); setPaying(false); }, [booking?.id]);

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
      {booking && !paying && (
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
            <ThankYouTipCard booking={booking} setPaying={setPaying} />
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

const TIP_AMOUNTS = [20, 50, 100];

/** Thank-you card with the partner's photo + one-tap tip (wallet if balance allows, else online). */
function ThankYouTipCard({ booking, setPaying }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(0);
  const [sending, setSending] = useState(null);
  const [tipped, setTipped] = useState(booking.tip_amount || 0);
  useEffect(() => {
    setTipped(booking.tip_amount || 0);
    api.get("/wallet").then(({ data }) => setWallet(Number(data?.balance || 0))).catch(() => {});
  }, [booking.id, booking.tip_amount]);
  const name = booking.partner_name || "your professional";
  const tip = async (amt) => {
    if (sending || tipped) return;
    setSending(amt);
    try {
      if (wallet >= amt) {
        await api.post(`/bookings/${booking.id}/tip`, { amount: amt, method: "wallet" });
        setWallet((w) => w - amt); setTipped(amt); toast.success(`₹${amt} tip sent to ${name}`);
      } else {
        setPaying(true);
        const ok = await runPayment({ purpose: "tip", bookingId: booking.id, amount: amt, user });
        setPaying(false);
        if (ok) { setTipped(amt); toast.success(`₹${amt} tip sent to ${name}`); }
      }
    } catch (e) { setPaying(false); toast.error(e?.response?.data?.detail || "Could not send tip"); }
    setSending(null);
  };
  return (
    <div data-testid="thank-you-card" className="mt-4 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-4">
      <div className="flex items-center gap-3">
        {booking.partner_photo
          ? <img data-testid="thank-you-partner-photo" src={booking.partner_photo} alt={name} className="h-[52px] w-[52px] rounded-full object-cover ring-2 ring-emerald-500" />
          : <span className="h-[52px] w-[52px] rounded-full bg-emerald-600 text-white grid place-items-center text-xl font-black">{name.charAt(0).toUpperCase()}</span>}
        <div className="min-w-0">
          <p data-testid="thank-you-title" className="text-[15px] font-extrabold text-slate-900 dark:text-white">Thank you for choosing us!</p>
          <p className="text-xs text-slate-500 mt-0.5">{booking.partner_name ? `${booking.partner_name} completed your service.` : "Your service is complete."}</p>
        </div>
      </div>
      {tipped ? (
        <p data-testid="tip-sent" className="mt-3 flex items-center gap-1.5 text-[13px] font-bold text-emerald-700"><Heart className="h-4 w-4 fill-rose-600 text-rose-600" /> ₹{tipped} tip sent — thank you for your kindness!</p>
      ) : (
        <>
          <p className="mt-3 text-xs font-bold text-slate-500">Say thanks with a tip · 100% goes to {booking.partner_name || "the professional"}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TIP_AMOUNTS.map((a) => (
              <button key={a} data-testid={`tip-${a}`} disabled={!!sending} onClick={() => tip(a)}
                className={`h-10 rounded-xl border-[1.5px] border-emerald-500 bg-white dark:bg-slate-900 font-extrabold text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-[transform,background-color] flex items-center justify-center ${sending && sending !== a ? "opacity-50" : ""}`}>
                {sending === a ? <Loader2 className="h-4 w-4 animate-spin" /> : `₹${a}`}
              </button>
            ))}
          </div>
          {wallet > 0 && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400"><Wallet className="h-3 w-3" /> Paid from wallet when balance allows (₹{wallet.toFixed(0)})</p>}
        </>
      )}
    </div>
  );
}
