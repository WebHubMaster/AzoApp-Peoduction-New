import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, Trash2, X, BadgePercent, Copy, Ticket, Sparkles, ArrowRight, Clock } from "lucide-react";
import api, { fmt } from "@/lib/api";
import useProgressive, { LoadMoreSentinel } from "@/hooks/useProgressive";
import ScratchCardsPanel from "@/components/growth/ScratchCardsPanel";
import { EmptyState, SkeletonList, ErrorState } from "@/components/customer/ux";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const NOTIF_SEEN_EVENT = "azo-notif-seen";

const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function PageHead({ icon: Icon, title, sub, right }) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-3 mb-5 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-11 w-11 rounded-xl bg-primary-700 text-white grid place-items-center shrink-0"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h2 className="font-heading font-black text-xl sm:text-2xl text-slate-900 dark:text-white">{title}</h2>
          {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------- Notifications --- */
const TAB_KEYS = ["home", "orders", "custom_jobs", "refunds", "invoices", "addresses", "wallet", "rewards", "offers", "profile", "referral", "alerts", "support", "report_bug", "subscriptions"];

/** Where a notification should take the customer: { tab, code?, bookingId?, chat?, ticketId?, href? } */
export function notifTarget(n = {}) {
  const d = n.data || {};
  const type = String(d.type || d.event || "").toLowerCase();
  const link = String(n.link || "");
  const text = `${n.title || ""} ${n.body || n.message || ""}`.toLowerCase();
  if (link === "support" || type.includes("support") || type.includes("ticket")) return { tab: "support", ticketId: n.ref_id || d.ticket_id };
  const bookingId = d.booking_id || n.ref_id;
  const code = d.code || d.booking_code;
  if (bookingId || code) {
    const chat = type.includes("chat");
    if (type.includes("invoice")) return { tab: "invoices" };
    if (type.includes("refund")) return { tab: "refunds" };
    return { tab: "orders", bookingId, code, chat };
  }
  const m = link.match(/[?&]tab=([a-z_]+)/);
  if (m && TAB_KEYS.includes(m[1])) return { tab: m[1] };
  if (/scratch|cashback/.test(text)) return { tab: "rewards" };
  if (/refund/.test(text)) return { tab: "refunds" };
  if (/invoice/.test(text)) return { tab: "invoices" };
  if (/subscription/.test(text)) return { tab: "subscriptions" };
  if (/booking|partner|job/.test(text)) return { tab: "orders" };
  if (link.startsWith("/") && !link.startsWith("/account") && link !== "/" && !link.startsWith("/partner") && !link.startsWith("/merchant") && !link.startsWith("/admin")) return { href: link };
  return { tab: "home" };
}

function NotifRow({ n, onRemove, onOpen }) {
  return (
    <div data-testid={`notif-item-${n.id}`} role="button" tabIndex={0} onClick={() => onOpen?.(n)} onKeyDown={(e) => e.key === "Enter" && onOpen?.(n)}
      className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 azo-fade-up cursor-pointer hover:border-primary-300 hover:shadow-md transition-[border-color,box-shadow]">
      <span className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 grid place-items-center shrink-0"><Bell className="h-5 w-5" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-slate-800 dark:text-white break-words">{n.title}</p>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">{n.body || n.message}</p>
        <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
      </div>
      <button data-testid={`notif-remove-${n.id}`} aria-label="Remove notification" onClick={(e) => { e.stopPropagation(); onRemove(n.id); }}
        className="h-8 w-8 grid place-items-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 transition-colors shrink-0"><X className="h-4 w-4" /></button>
    </div>
  );
}

export function NotificationsView({ onOpen }) {
  const [items, setItems] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/notifications").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => setItems([])), []);
  useEffect(() => {
    load();
    localStorage.setItem("azo_notif_seen", new Date().toISOString());
    window.dispatchEvent(new Event(NOTIF_SEEN_EVENT));
  }, [load]);
  const shown = useProgressive(items || []);

  const removeOne = async (id) => {
    const prev = items;
    setItems((l) => l.filter((n) => n.id !== id));
    try { await api.delete(`/notifications/${id}`); } catch { setItems(prev); toast.error("Could not remove notification"); }
  };
  const clearAll = async () => {
    const prev = items; setBusy(true); setItems([]); setConfirm(false);
    try { await api.delete("/notifications"); toast.success("All notifications cleared"); }
    catch { setItems(prev); toast.error("Could not clear notifications"); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="notifications-page" className="max-w-3xl">
      <PageHead icon={Bell} title="Notifications" sub="Booking updates, offers and reminders"
        right={items?.length ? (
          <button data-testid="notif-clear-all" disabled={busy} onClick={() => setConfirm(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-sm font-bold hover:bg-rose-100 disabled:opacity-60 azo-press"><Trash2 className="h-4 w-4" /> Clear all</button>
        ) : null} />
      {items === null ? <SkeletonList rows={4} /> : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" desc="Booking updates, offers and reminders will show up here." testId="notif-empty" />
      ) : (
        <div className="space-y-2.5" data-testid="notif-list">
          {shown.items.map((n, i) => <NotifRow key={n.id || i} n={n} onRemove={removeOne} onOpen={onOpen} />)}
          <LoadMoreSentinel list={shown} testId="notif-load-more" />
        </div>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent data-testid="notif-clear-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>This removes every notification from your list. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="notif-clear-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="notif-clear-confirm" onClick={clearAll} className="bg-rose-600 hover:bg-rose-700">Clear all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ----------------------------------------------------------------- Offers --- */
const pad = (n) => String(n).padStart(2, "0");
const endMs = (v) => { if (!v) return null; const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59` : v).getTime(); return Number.isFinite(t) ? t : null; };

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return undefined; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [active]);
  return now;
}

function remain(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s` : `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
}

export function OfferTimer({ end, light, testId }) {
  const now = useNow(!!end);
  if (!end) return null;
  const left = end - now;
  if (left <= 0) return <span data-testid={testId} className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full ${light ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}><Clock className="h-3 w-3" /> Offer ended</span>;
  const urgent = left < 24 * 3600 * 1000;
  const tone = light ? (urgent ? "bg-rose-500 text-white" : "bg-white/20 text-white") : (urgent ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700");
  return <span data-testid={testId} className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full tabular-nums ${tone} ${urgent ? "animate-pulse" : ""}`}><Clock className="h-3 w-3" /> Ends in {remain(left)}</span>;
}
const grab = (code) => {
  localStorage.setItem("azo_coupon", code);
  try { navigator.clipboard?.writeText(code); } catch { /* ignore */ }
  toast.success(`Coupon ${code} copied — apply at checkout`);
};

function OfferCard({ o, onUse }) {
  const end = endMs(o.end_date);
  const ended = end !== null && end <= Date.now();
  return (
    <div data-testid={`offers-offer-${o.id}`} className={`relative overflow-hidden rounded-2xl azo-mesh text-white p-5 azo-elev azo-fade-up ${ended ? "opacity-60 grayscale" : ""}`}>
      <div className="absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-white/10" />
      <div className="flex items-start justify-between gap-2 relative">
        <p className="text-xs font-semibold text-white/85 min-w-0">{o.title}</p>
        <OfferTimer end={end} light testId={`offer-timer-${o.id}`} />
      </div>
      <p className="font-heading font-black text-2xl sm:text-3xl mt-1">{o.discount_label || `${o.discount}% OFF`}</p>
      {o.subtitle && <p className="text-xs text-white/85 mt-1">{o.subtitle}</p>}
      <div className="mt-4 flex items-center gap-2 flex-wrap relative">
        {o.code && !ended && (
          <button data-testid={`offers-copy-${o.code}`} onClick={() => grab(o.code)}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-white text-primary-700 text-sm font-extrabold azo-press">{o.code} <Copy className="h-3.5 w-3.5" /></button>
        )}
        {!ended && <button data-testid={`offers-use-${o.id}`} onClick={() => { if (o.code) grab(o.code); onUse(o.destination || o.link); }}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-md bg-white/15 hover:bg-white/25 text-sm font-bold">{o.cta_text || "Book now"} <ArrowRight className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}

function CouponRow({ c }) {
  return (
    <div data-testid={`offers-coupon-${c.code}`} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 azo-fade-up">
      <span className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 grid place-items-center shrink-0"><Ticket className="h-5 w-5" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-sm text-slate-800 dark:text-white truncate">{c.label || c.code}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.description || (c.min_order ? `Min order ${fmt(c.min_order)}` : "No minimum order")}</p>
        {c.valid_until && <div className="mt-1.5"><OfferTimer end={endMs(c.valid_until)} testId={`coupon-timer-${c.code}`} /></div>}
      </div>
      <button data-testid={`offers-coupon-copy-${c.code}`} onClick={() => grab(c.code)}
        className="shrink-0 h-9 px-3 rounded-md border border-dashed border-primary-600 text-primary-700 dark:text-primary-300 text-xs font-extrabold hover:bg-primary-50 dark:hover:bg-primary-900/20 azo-press">{c.code}</button>
    </div>
  );
}

export function OffersView() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => { setError(false); api.get("/site/promotions").then((r) => setData(r.data || {})).catch(() => setError(true)); }, []);
  useEffect(() => { load(); }, [load]);
  const isEnded = (o) => { const e = endMs(o.end_date); return e !== null && e <= Date.now(); };
  const offers = [...(data?.offers || [])].sort((a, b) => isEnded(a) - isEnded(b));
  const coupons = data?.coupons || [];
  const onUse = (link) => navigate(link && link.startsWith("/") ? link : "/services");

  return (
    <div data-testid="offers-page">
      <PageHead icon={BadgePercent} title="Offers & Savings" sub="Active offers and coupons — tap a code to copy, it auto-applies at checkout" />
      {error ? <ErrorState onRetry={load} testId="offers-error" /> : data === null ? <SkeletonList rows={3} /> : (
        <>
          {offers.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6" data-testid="offers-grid">{offers.map((o) => <OfferCard key={o.id} o={o} onUse={onUse} />)}</div>}
          {coupons.length > 0 && (
            <>
              <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white mb-3">Coupons</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="coupons-list">{coupons.map((c) => <CouponRow key={c.code} c={c} />)}</div>
            </>
          )}
          {!offers.length && !coupons.length && <EmptyState icon={BadgePercent} title="No offers right now" desc="Check back soon for new deals and coupons." actionLabel="Browse services" onAction={() => navigate("/services")} testId="offers-empty" />}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Rewards --- */
export function RewardsView({ onClaimed }) {
  return (
    <div data-testid="rewards-page">
      <PageHead icon={Sparkles} title="Reward & Cashback" sub="Scratch cards earned on your bookings — claimed cashback goes straight to your wallet" />
      <ScratchCardsPanel gridOnly onClaimed={onClaimed} />
    </div>
  );
}
