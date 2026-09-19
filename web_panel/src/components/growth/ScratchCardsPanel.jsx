import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Gift, Sparkles, Check, Clock, X, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import api from "@/lib/api";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * Scratch Cards (product #11):
 *  - background stays FIXED while scratching (body scroll locked + touch-action none
 *    + preventDefault on touchmove so the page never jumps up/down).
 *  - cards shown in a horizontal slider/carousel (with arrows).
 *  - "View All" opens a dedicated full grid page (in-panel route via `viewAll` state).
 *  - scratched cards auto-delete after 30 days (server sweep + lazy purge on list).
 */
export default function ScratchCardsPanel({ onClaimed }) {
  const [data, setData] = useState({ cards: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [viewAll, setViewAll] = useState(false);
  const scrollerRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/growth/scratch-cards").then((r) => setData(r.data || { cards: [] }))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cards = data.cards || [];
  const summary = data.summary || {};

  if (!loading && cards.length === 0) {
    return (
      <div data-testid="scratch-empty" className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center mb-5">
        <div className="h-12 w-12 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 grid place-items-center mx-auto mb-2"><Gift className="h-6 w-6" /></div>
        <p className="font-semibold text-slate-800 dark:text-white">No scratch cards yet</p>
        <p className="text-sm text-slate-500 mt-0.5">Complete eligible bookings to unlock cashback rewards.</p>
      </div>
    );
  }

  const scrollBy = (dir) => {
    const el = scrollerRef.current; if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  };

  const openCard = (c) => (c.status === "available" || c.status === "scratched") && setActive(c);

  // ---------- Dedicated "View All" page ----------
  if (viewAll) {
    return (
      <div className="mb-6" data-testid="scratch-viewall">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setViewAll(false)} data-testid="scratch-viewall-back"
            className="h-9 w-9 grid place-items-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> All Scratch Cards</h3>
            <p className="text-xs text-slate-500">Earned {fmt(summary.earned)} · {cards.length} card{cards.length > 1 ? "s" : ""} · scratched cards auto-remove after 30 days</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" data-testid="scratch-grid">
          {cards.map((c) => <ScratchTile key={c.id} card={c} onOpen={() => openCard(c)} />)}
        </div>
        {active && (
          <ScratchModal card={active} onClose={() => setActive(null)}
            onDone={() => { setActive(null); load(); onClaimed && onClaimed(); }} />
        )}
      </div>
    );
  }

  // ---------- Carousel (default) ----------
  return (
    <div className="mb-6" data-testid="scratch-panel">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> Scratch Cards &amp; Cashback</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 hidden sm:inline">Earned {fmt(summary.earned)}</span>
          {cards.length > 1 && (
            <button onClick={() => setViewAll(true)} data-testid="scratch-viewall-btn"
              className="text-sm font-semibold text-primary-600 hover:text-primary-700">View All ({cards.length})</button>
          )}
        </div>
      </div>

      <div className="relative">
        {cards.length > 2 && (
          <>
            <button onClick={() => scrollBy(-1)} data-testid="scratch-prev" aria-label="Previous"
              className="hidden sm:grid absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 place-items-center rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => scrollBy(1)} data-testid="scratch-next" aria-label="Next"
              className="hidden sm:grid absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 place-items-center rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
        <div ref={scrollerRef} data-testid="scratch-carousel"
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory azo-noscrollbar">
          {cards.map((c) => (
            <div key={c.id} className="snap-start shrink-0 w-[46%] sm:w-[210px]">
              <ScratchTile card={c} onOpen={() => openCard(c)} />
            </div>
          ))}
        </div>
      </div>

      {active && (
        <ScratchModal card={active} onClose={() => setActive(null)}
          onDone={() => { setActive(null); load(); onClaimed && onClaimed(); }} />
      )}
    </div>
  );
}

function ScratchTile({ card, onOpen }) {
  const claimed = card.status === "claimed";
  const expired = card.status === "expired";
  const available = card.status === "available";
  return (
    <button data-testid={`scratch-tile-${card.id}`} onClick={() => (available || card.status === "scratched") && onOpen()}
      disabled={claimed || expired}
      className={`relative w-full rounded-2xl p-4 text-left overflow-hidden aspect-[4/5] flex flex-col justify-between transition-transform active:scale-95 ${
        claimed ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
        : expired ? "bg-slate-100 dark:bg-slate-800 opacity-70"
        : "azo-mesh text-white shadow-lg"}`}>
      {available && <>
        <Gift className="h-7 w-7" />
        <div>
          <p className="font-bold leading-tight">Scratch to reveal 🎁</p>
          <p className="text-[11px] text-white/80 mt-0.5">Booking {card.booking_code || ""}</p>
        </div>
      </>}
      {card.status === "scratched" && <>
        <Sparkles className="h-7 w-7" />
        <div>
          <p className="font-bold leading-tight">{card.is_win ? fmt(card.reward_amount) : "No win"}</p>
          <p className="text-[11px] text-white/80 mt-0.5">Tap to claim</p>
        </div>
      </>}
      {claimed && <>
        <span className="h-7 w-7 rounded-full bg-emerald-500 text-white grid place-items-center"><Check className="h-4 w-4" /></span>
        <div>
          <p className="font-bold text-emerald-700 dark:text-emerald-300 leading-tight">{card.is_win ? `${fmt(card.reward_amount)} won` : "Better luck next"}</p>
          <p className="text-[11px] text-emerald-600/80 mt-0.5">Claimed</p>
        </div>
      </>}
      {expired && <>
        <Clock className="h-7 w-7 text-slate-400" />
        <div><p className="font-bold text-slate-500 leading-tight">Expired</p></div>
      </>}
    </button>
  );
}

function ScratchModal({ card, onClose, onDone }) {
  const canvasRef = useRef(null);
  const [revealed, setRevealed] = useState(card.status === "scratched");
  const [reward, setReward] = useState(card.status === "scratched" ? card : null);
  const [claiming, setClaiming] = useState(false);
  const drawing = useRef(false);
  const revealing = useRef(false);

  // Lock the page scroll while the card is open so the BACKGROUND stays fixed
  // (no up/down jump while the user drags to scratch).
  useEffect(() => {
    const y = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, []);

  const doReveal = useCallback(async () => {
    if (revealing.current || revealed) return;
    revealing.current = true;
    try {
      const { data } = await api.post(`/growth/scratch-cards/${card.id}/scratch`);
      if (data?.ok) { setReward(data.card); setRevealed(true); }
      else { toast.error(data?.detail || "Could not reveal"); }
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not reveal"); }
  }, [card.id, revealed]);

  useEffect(() => {
    if (revealed) return undefined;
    const cv = canvasRef.current; if (!cv) return undefined;
    const ctx = cv.getContext("2d");
    cv.width = 320; cv.height = 200;
    const g = ctx.createLinearGradient(0, 0, 320, 200);
    g.addColorStop(0, "#9ca3af"); g.addColorStop(1, "#6b7280");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "700 18px Inter, Arial"; ctx.textAlign = "center";
    ctx.fillText("Scratch here 🎁", 160, 105);
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) * (cv.width / r.width), y: (t.clientY - r.top) * (cv.height / r.height) };
    };
    const scratch = (e) => {
      if (!drawing.current) return;
      // Block the browser from scrolling/refreshing the page while scratching.
      if (e.cancelable) e.preventDefault();
      const { x, y } = pos(e);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
      const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let clear = 0; for (let i = 3; i < img.length; i += 4 * 40) if (img[i] === 0) clear++;
      if (clear / (img.length / (4 * 40)) > 0.4) doReveal();
    };
    const down = (e) => { drawing.current = true; if (e.cancelable && e.touches) e.preventDefault(); scratch(e); };
    const up = () => { drawing.current = false; };
    cv.addEventListener("mousedown", down); cv.addEventListener("mousemove", scratch); window.addEventListener("mouseup", up);
    // NON-passive touch handlers so preventDefault actually stops page scroll.
    cv.addEventListener("touchstart", down, { passive: false }); cv.addEventListener("touchmove", scratch, { passive: false }); window.addEventListener("touchend", up);
    return () => { cv.removeEventListener("mousedown", down); cv.removeEventListener("mousemove", scratch); window.removeEventListener("mouseup", up); cv.removeEventListener("touchstart", down); cv.removeEventListener("touchmove", scratch); window.removeEventListener("touchend", up); };
  }, [revealed, doReveal]);

  const claim = async () => {
    setClaiming(true);
    try {
      const { data } = await api.post(`/growth/scratch-cards/${card.id}/claim`);
      if (data?.ok) {
        if ((data.credited || 0) > 0) toast.success(`${fmt(data.credited)} added to your wallet 🎉`);
        else toast.success("Reward claimed");
        onDone();
      } else toast.error(data?.detail || "Could not claim");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not claim"); }
    setClaiming(false);
  };

  const win = reward?.is_win ?? card.is_win;
  const amount = reward?.reward_amount ?? card.reward_amount;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overscroll-none touch-none" onClick={onClose}>
      <div data-testid="scratch-modal" className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} data-testid="scratch-modal-close" className="absolute right-3 top-3 h-9 w-9 grid place-items-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Scratch Card</p>
        <div className="relative mx-auto mt-4 w-[320px] max-w-full h-[200px] rounded-2xl overflow-hidden bg-gradient-to-br from-primary-600 to-primary-800 grid place-items-center">
          <div className="text-white">
            {win ? <>
              <p className="text-sm font-semibold text-white/85">You won</p>
              <p className="font-heading font-black text-5xl mt-1">{fmt(amount)}</p>
              <p className="text-xs text-white/80 mt-1">cashback</p>
            </> : <>
              <p className="font-heading font-black text-2xl">Better luck<br/>next time!</p>
            </>}
          </div>
          {!revealed && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-pointer touch-none" style={{ touchAction: "none" }} />}
        </div>
        {revealed ? (
          <button data-testid="scratch-claim" onClick={claim} disabled={claiming}
            className="mt-5 w-full h-12 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white font-bold">
            {claiming ? "Claiming…" : win ? "Claim to Wallet" : "Okay"}
          </button>
        ) : (
          <p className="mt-5 text-sm text-slate-500">Scratch the grey area to reveal your reward</p>
        )}
      </div>
    </div>,
    document.body
  );
}
