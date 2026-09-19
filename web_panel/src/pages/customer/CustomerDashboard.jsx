import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import { useNavigate } from "react-router-dom";
import {
  Home, Wallet, Gift, Sparkles, Package, Star, MapPin, Plus, Navigation, User as UserIcon,
  Camera, Pencil, Trash2, Star as StarIcon, ShieldAlert, RefreshCcw, Receipt, FileText,
  AlertTriangle, CheckCircle2, Crown, ChevronRight, ChevronDown, ArrowRight, LifeBuoy, Copy, Share2,
  Clock, TrendingUp, Zap, Phone, IndianRupee, KeyRound, MessageCircle, CreditCard, Download, Wrench, Circle, X, Info as InfoIcon, Lock,
} from "lucide-react";
import api, { fmt, fmtC } from "@/lib/api";
import { shareInvoicePdf, shareFilePdf } from "@/lib/invoiceShare";
import { runPayment } from "@/lib/payments";
import { onlyDigits } from "@/lib/validation";
import { getMerchantRefCode } from "@/lib/merchantRef";
import { useAuth } from "@/context/AuthContext";
import useTabParam from "@/hooks/useTabParam";
import { useSiteConfig } from "@/context/SiteConfigContext";
import CustomerShell from "@/components/customer/CustomerShell";
import OnboardingTour from "@/components/tour/OnboardingTour";
import MyCustomJobs from "@/components/customer/MyCustomJobs";
import InvoiceCenter from "@/components/invoices/InvoiceCenter";
import { AiChat } from "@/components/AiChat";
import SupportCenter from "@/components/SupportCenter";
import ReferralShareCard from "@/components/growth/ReferralShareCard";
import ScratchCardsPanel from "@/components/growth/ScratchCardsPanel";
import WorkProofSection from "@/components/WorkProof";
import { AddressForm, emptyAddress } from "@/components/AddressForm";
import BookingChat from "@/components/booking/BookingChat";
import ScheduledCard from "@/components/booking/ScheduledCard";
import ServiceBreakdown from "@/components/booking/ServiceBreakdown";
import ScheduleAlerts from "@/components/booking/ScheduleAlerts";
import RescheduleRing from "@/components/booking/RescheduleRing";
import SchedulePicker from "@/components/site/SchedulePicker";
import ProfilePhotoPicker from "@/components/common/ProfilePhotoPicker";
import { STATUS_TXT } from "@/components/customer/CustomerHome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { toast } from "sonner";
import {
  StatTile, StatusChip, EmptyState, SkeletonList, StatSkeleton, SearchInput,
  DateRangePicker, SortMenu, FilterButton, FilterSheet, Paginator, SegTabs,
  useIsMobile, inDateRange,
} from "@/components/customer/ux";

const NAV = [
  { key: "home", label: "Home", short: "Home", icon: Home },
  { key: "orders", label: "My Bookings", short: "Bookings", icon: Package },
  { key: "custom_jobs", label: "Custom Requests", short: "Custom", icon: Wrench },
  { key: "refunds", label: "Refunds", short: "Refunds", icon: Receipt },
  { key: "invoices", label: "My Invoices", short: "Invoices", icon: FileText },
  { key: "addresses", label: "My Addresses", short: "Address", icon: MapPin },
  { key: "wallet", label: "Wallet", short: "Wallet", icon: Wallet },
  { key: "profile", label: "My Profile", short: "Profile", icon: UserIcon },
  { key: "referral", label: "Refer & Earn", short: "Refer", icon: Gift },
  { key: "support", label: "Help & Support", short: "Support", icon: LifeBuoy },
  { key: "ai", label: "AI Assistant", short: "AI", icon: Sparkles },
];

const ACTIVE_STATES = ["pending", "pending_payment", "searching", "assigned", "arrived_shop", "arrived_customer", "started"];
const DONE_STATES = ["completed", "paid"];

const statusTone = (s) => {
  if (["completed", "paid", "payment_received"].includes(s)) return "green";
  if (s === "searching") return "blue";
  if (["assigned", "arrived_shop", "arrived_customer", "started"].includes(s)) return "violet";
  if (s === "cancelled") return "rose";
  return "amber";
};
const statusText = (s) => STATUS_TXT[s] || (s || "").replace(/_/g, " ");
const bkDate = (b) => b.scheduled_at || b.created_at;
const CANCEL_REASONS = ["Booked by mistake", "Found a better price elsewhere", "Service no longer needed", "Partner is taking too long", "Scheduling / timing issue", "Want to change the service or add-ons"];

/* ============================================================ ROOT ====== */
export default function CustomerDashboard() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useTabParam("home");
  const [bookings, setBookings] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [cfg, setCfg] = useState({ profile_fields: {}, address_config: {} });
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [referral, setReferral] = useState({ reward_amount: 100, referee_discount: 100 });
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [addlTarget, setAddlTarget] = useState(null);
  const [rev, setRev] = useState(null);
  const [stars, setStars] = useState(5);
  const [cmt, setCmt] = useState("");
  const [focusCode, setFocusCode] = useState("");

  const load = useCallback(() => {
    api.get("/bookings").then((r) => setBookings(r.data || [])).catch(() => {}).finally(() => setLoading(false));
    api.get("/wallet").then((r) => setWallet(r.data || { balance: 0, transactions: [] })).catch(() => {});
    api.get("/payments/refunds").then((r) => setRefunds(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    api.get("/auth/config").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/catalog/categories").then((r) => setCategories(r.data || [])).catch(() => {});
    api.get("/catalog/services").then((r) => setServices(r.data || [])).catch(() => {});
    api.get("/referral/summary").then((r) => setReferral(r.data || {})).catch(() => {});
  }, []);
  // Capture a friend's referral code from the URL (?fref=CODE) for later apply.
  useEffect(() => {
    const fref = new URLSearchParams(window.location.search).get("fref");
    if (fref) localStorage.setItem("azo_fref", fref);
  }, []);
  // Auto-apply a captured referral code once the user is known (best-effort, idempotent server-side).
  useEffect(() => {
    if (!user) return;
    const c = localStorage.getItem("azo_fref");
    if (!c) return;
    if (c.toUpperCase() === `AZO${(user.phone || "").slice(-4)}`) { localStorage.removeItem("azo_fref"); return; }
    api.post("/referral/apply", { code: c })
      .then(({ data }) => { if (data?.ok) toast.success(data.detail || "Referral applied!"); })
      .catch(() => {})
      .finally(() => localStorage.removeItem("azo_fref"));
  }, [user]);

  const activeCount = bookings.filter((b) => ACTIVE_STATES.includes(b.status)).length;

  const goTo = (key, code) => { setActive(key); if (code) setFocusCode(code); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openBooking = (b) => { setFocusCode(b.code); setActive("orders"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  /* ---- mutations (unchanged business logic) ---- */
  // Bookings created together in one checkout share an order_group_id → pay them
  // ALL with a single combined payment; older/single bookings pay individually.
  const pay = async (b) => {
    const ok = b.order_group_id
      ? await runPayment({ purpose: "booking_group", groupId: b.order_group_id, user })
      : await runPayment({ purpose: "booking", bookingId: b.id, user });
    if (ok) load();
  };
  const payAdditional = async (b, method = "online") => {
    if (method === "online") { const ok = await runPayment({ purpose: "additional", bookingId: b.id, user }); if (ok) load(); return; }
    try { await api.post(`/bookings/${b.id}/additional/pay`, { method }); toast.success("Additional work paid"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Payment failed"); }
  };
  const repeat = async (b) => {
    try {
      const { data } = await api.get(`/bookings/${b.id}/repeat-preview`);
      if (!data.available) return toast.error((data.issues || []).join(", ") || "This service is unavailable now");
      const when = new Date(Date.now() + 60 * 60 * 1000);
      const { data: nb } = await api.post("/bookings", { service_id: data.service.id, address: data.address, schedule_type: "schedule", scheduled_at: when.toISOString(), addons: data.addons || [], merchant_ref_code: getMerchantRefCode() || undefined });
      toast.success("Booking repeated!");
      openBooking(nb);
      await runPayment({ purpose: "booking", bookingId: nb.id, user });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not repeat"); }
  };
  const cancelBooking = async (b, reason) => {
    try { const { data } = await api.post(`/bookings/${b.id}/cancel`, { reason }); toast.success(data?.message || "Booking cancelled"); setCancelTarget(null); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Cancel failed"); }
  };
  const submitReview = async () => {
    await api.post(`/bookings/${rev.id}/review`, { rating: stars, comment: cmt });
    toast.success("Thanks for your review!");
    setRev(null); load();
  };
  const spareAction = async (b, partId, action) => {
    try { await api.post(`/bookings/${b.id}/spare-parts/${partId}/action`, { action }); toast.success(`Spare part ${action}d`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <CustomerShell nav={NAV} active={active} onNavigate={(k) => goTo(k)} user={user} badges={{ orders: activeCount }} mobilePrimary={["home", "orders", "wallet", "invoices"]}>
      <OnboardingTour />
      <ScheduleAlerts role="customer" onChanged={load} />
      <RescheduleRing onResolved={load} />
      <CancelDialog booking={cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={cancelBooking} />
      <AdditionalPayDialog booking={addlTarget} walletBalance={wallet.balance} onClose={() => setAddlTarget(null)} onPay={payAdditional} />
      <ReviewDialog rev={rev} setRev={setRev} stars={stars} setStars={setStars} cmt={cmt} setCmt={setCmt} onSubmit={submitReview} />

      {active === "home" && (
        <HomeView user={user} bookings={bookings} wallet={wallet} refunds={refunds} categories={categories} services={services} referral={referral}
          loading={loading} onNavigate={goTo} onBook={() => navigate("/services")} onCategory={(id) => navigate(`/services?category=${id}`)} onOpenBooking={openBooking} onService={(id) => navigate(`/service/${id}`)} />
      )}

      {active === "orders" && (
        <BookingsView bookings={bookings} wallet={wallet} loading={loading} focusCode={focusCode}
          onNew={() => navigate("/services")} onRepeat={repeat} onCancel={setCancelTarget} onReview={(b) => { setRev(b); setStars(5); setCmt(""); }}
          onPay={pay} onPayAddl={setAddlTarget} onSpare={spareAction} onRefresh={load} />
      )}

      {active === "refunds" && <RefundsView refunds={refunds} loading={loading} />}
      {active === "custom_jobs" && <MyCustomJobs />}
      {active === "wallet" && <WalletView wallet={wallet} user={user} onReload={load} />}
      {active === "referral" && <ReferralView user={user} bookings={bookings} />}
      {active === "profile" && <div className="max-w-3xl"><SectionHeader title="My Profile" sub="Manage your personal details & preferences" onNew={() => navigate("/services")} /><ProfileEditor user={user} fields={cfg.profile_fields || {}} onSaved={refresh} /></div>}
      {active === "addresses" && <div><SectionHeader title="My Addresses" sub="Saved locations for faster checkout" onNew={() => navigate("/services")} /><AddressBook cfg={cfg.address_config || {}} onSaved={refresh} /></div>}
      {active === "invoices" && <InvoiceCenter role="customer" title="My Invoices" subtitle="View & download invoices for your bookings and payments." />}
      {active === "support" && <SupportCenter />}
      {active === "ai" && <div><SectionHeader title="AI Assistant" sub="Ask about services, bookings, invoices & more" onNew={() => navigate("/services")} /><div className="max-w-3xl"><AiChat role="customer" /></div></div>}
    </CustomerShell>
  );
}

/* ==================================================== shared header ===== */
function SectionHeader({ title, sub, onNew, right }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5 azo-fade-up">
      <div className="min-w-0">
        <h1 className="font-heading font-black text-2xl lg:text-3xl text-slate-900 dark:text-white truncate">{title}</h1>
        {sub && <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{sub}</p>}
      </div>
      {right || (onNew && (
        <Button data-testid="book-new" onClick={onNew} className="bg-primary-700 hover:bg-primary-800 rounded-xl h-10 shrink-0 shadow-primarybtn">
          <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">New </span>Booking
        </Button>
      ))}
    </div>
  );
}

/* ========================================================== HOME ======== */
function HomeView({ user, bookings, wallet, refunds, categories, services, referral, loading, onNavigate, onBook, onCategory, onOpenBooking, onService }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name || "there").split(" ")[0];
  const location = user?.addresses?.find((a) => a.is_default)?.city || user?.addresses?.[0]?.city || "Patna";
  const live = bookings.find((b) => ["searching", "assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status));
  const recent = [...bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
  const popular = [...services].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  const completed = bookings.filter((b) => DONE_STATES.includes(b.status)).length;
  const activeC = bookings.filter((b) => ACTIVE_STATES.includes(b.status)).length;
  const totalRefunded = refunds.reduce((s, r) => s + (r.status === "processed" ? Number(r.refund_amount || 0) : 0), 0);
  const [q, setQ] = useState("");
  const svcMatches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(t) || (s.category_name || "").toLowerCase().includes(t)).slice(0, 6);
  }, [q, services]);

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl azo-mesh text-white p-5 sm:p-7 lg:p-9 azo-fade-up">
        <div className="relative z-10 max-w-3xl">
          <p className="text-white/80 text-sm flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {location}</p>
          <h1 className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl mt-1.5">{greet}, {firstName} <span className="inline-block">👋</span></h1>
          <p className="text-white/85 mt-1 text-sm lg:text-base">What service do you need today?</p>
          <div className="mt-4 relative max-w-xl">
            <input data-testid="home-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search AC repair, electrician, cleaning…"
              className="w-full h-12 lg:h-14 pl-5 pr-32 rounded-2xl bg-white text-slate-800 placeholder:text-slate-400 shadow-xl focus:outline-none focus:ring-4 focus:ring-white/30" />
            <Button data-testid="home-book-cta" onClick={onBook} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 lg:h-11 rounded-xl bg-primary-700 hover:bg-primary-800 px-4">
              <Plus className="h-4 w-4 mr-1" /> Book
            </Button>
            {svcMatches.length > 0 && (
              <div className="absolute z-20 top-14 lg:top-16 left-0 right-0 rounded-2xl bg-white text-slate-800 shadow-2xl overflow-hidden azo-scale-in">
                {svcMatches.map((s) => (
                  <button key={s.id} onClick={() => onService(s.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left">
                    <span className="flex items-center gap-2.5"><span className="h-8 w-8 rounded-lg bg-primary-100 grid place-items-center text-primary-700"><Zap className="h-4 w-4" /></span><span className="text-sm font-medium">{s.name}<span className="block text-xs text-slate-400">{s.category_name}</span></span></span>
                    <span className="text-sm font-bold text-primary-700">{fmt(s.base_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[["orders", Package, "Bookings"], ["wallet", Wallet, "Wallet"], ["addresses", MapPin, "Addresses"], ["support", LifeBuoy, "Support"]].map(([k, Ic, l]) => (
              <button key={k} data-testid={`quick-${k}`} onClick={() => onNavigate(k)} className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white/15 hover:bg-white/25 backdrop-blur rounded-full px-3.5 h-9 azo-press">
                <Ic className="h-4 w-4" /> {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* QUICK STATS */}
      {loading ? <StatSkeleton /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4 azo-stagger">
          <StatTile testId="stat-total" label="Total Bookings" value={bookings.length} count icon={Package} tone="primary" onClick={() => onNavigate("orders")} />
          <StatTile testId="stat-completed" label="Completed" value={completed} count icon={CheckCircle2} tone="green" onClick={() => onNavigate("orders", "completed")} />
          <StatTile testId="stat-active" label="Active" value={activeC} count icon={Clock} tone="violet" onClick={() => onNavigate("orders")} />
          <StatTile testId="stat-wallet" label="Wallet" value={fmtC(wallet.balance)} money={fmt(wallet.balance)} icon={Wallet} tone="amber" onClick={() => onNavigate("wallet")} />
          <StatTile testId="stat-refunds" label="Refunded" value={fmtC(totalRefunded)} money={fmt(totalRefunded)} icon={Receipt} tone="slate" onClick={() => onNavigate("refunds")} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* LIVE BOOKING */}
          {live && <LiveBookingCard b={live} onOpen={() => onOpenBooking(live)} />}

          {/* SERVICE DISCOVERY */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white">Explore Services</h2>
              <button onClick={onBook} className="text-sm font-semibold text-primary-600 flex items-center gap-1">View all <ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 azo-stagger">
              {categories.slice(0, 12).map((c) => (
                <button key={c.id} data-testid={`cat-${c.slug}`} onClick={() => onCategory(c.id)} className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 azo-hover-lift azo-elev text-center">
                  <div className="mx-auto h-14 w-14 rounded-2xl overflow-hidden bg-primary-50 dark:bg-primary-900/30 grid place-items-center">
                    {c.image ? <img src={c.image} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform" /> : <Zap className="h-6 w-6 text-primary-600" />}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 leading-tight">{c.name}</p>
                </button>
              ))}
            </div>
          </section>

          {/* POPULAR SERVICES */}
          {popular.length > 0 && (
            <section>
              <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white mb-3">Popular Services</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 azo-stagger">
                {popular.map((s) => (
                  <button key={s.id} data-testid={`svc-${s.id}`} onClick={() => onService(s.id)} className="group flex gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-left azo-hover-lift azo-elev">
                    <div className="h-16 w-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                      {s.image && <img src={s.image} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-slate-400 truncate">{s.category_name}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-sm font-bold text-primary-700 dark:text-primary-300">{fmt(s.base_price)}</span>
                        <span className="text-[11px] text-amber-600 flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{(s.rating || 4.8).toFixed(1)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* PROMO */}
          <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5 azo-elev azo-fade-up">
            <Gift className="h-8 w-8" />
            <p className="font-heading font-black text-xl mt-2">Refer & Earn ₹{referral?.reward_amount || 100}</p>
            <p className="text-sm text-white/85 mt-0.5">Invite friends — you both earn on their first booking.</p>
            <Button onClick={() => onNavigate("referral")} className="mt-3 bg-white text-orange-600 hover:bg-white/90 rounded-xl font-bold">Invite friends</Button>
          </div>

          {/* RECENT BOOKINGS */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white">Recent Bookings</h2>
              <button onClick={() => onNavigate("orders")} className="text-sm font-semibold text-primary-600 flex items-center gap-1">All <ChevronRight className="h-4 w-4" /></button>
            </div>
            {loading ? <SkeletonList rows={3} /> : recent.length === 0 ? (
              <EmptyState icon={Package} title="No bookings yet" desc="Book your first home service in minutes." actionLabel="Book a Service" onAction={onBook} testId="home-empty" />
            ) : (
              <div className="space-y-3 azo-stagger">
                {recent.map((b) => (
                  <button key={b.id} onClick={() => onOpenBooking(b)} className="w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 azo-hover-lift azo-elev">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{b.service_name}</p>
                      <StatusChip label={statusText(b.status)} tone={statusTone(b.status)} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs text-slate-400">#{b.code} · {new Date(bkDate(b)).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>
                      <p className="font-bold text-slate-800 dark:text-white">{fmt(b.pricing?.total)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function LiveBookingCard({ b, onOpen }) {
  const STEPS = ["searching", "assigned", "arrived_customer", "started", "completed"];
  const idx = Math.max(0, STEPS.indexOf(b.status === "arrived_shop" ? "assigned" : b.status));
  const pct = ((idx + 1) / STEPS.length) * 100;
  return (
    <section data-testid="live-booking" className="rounded-3xl border border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/15 p-5 azo-fade-up azo-elev">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 dark:text-primary-300"><span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-60" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-600" /></span> LIVE BOOKING</span>
        <StatusChip label={statusText(b.status)} tone={statusTone(b.status)} />
      </div>
      <div className="flex items-center justify-between mt-2 gap-3">
        <div className="min-w-0">
          <p className="font-heading font-bold text-lg text-slate-900 dark:text-white truncate">{b.service_name}</p>
          <p className="text-xs text-slate-500">#{b.code}{b.partner_name ? ` · ${b.partner_name}` : ""}</p>
        </div>
        <p className="font-heading font-black text-xl text-slate-900 dark:text-white">{fmt(b.pricing?.total)}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/70 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full bg-primary-600 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-slate-400 mt-1.5">
        {["Searching", "Assigned", "Arrived", "Started", "Done"].map((s, i) => <span key={s} className={i <= idx ? "text-primary-600 dark:text-primary-300" : ""}>{s}</span>)}
      </div>
      <Button onClick={onOpen} data-testid="track-booking" className="w-full mt-4 bg-primary-700 hover:bg-primary-800 rounded-xl"><Navigation className="h-4 w-4 mr-1.5" /> Track Booking</Button>
    </section>
  );
}

/* ====================================================== BOOKINGS ======== */
const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
  { value: "amt_hi", label: "Amount: High → Low" },
  { value: "amt_lo", label: "Amount: Low → High" },
];
const BK_TABS = [
  { key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "searching", label: "Searching" },
  { key: "ongoing", label: "Ongoing" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" },
];
const matchTab = (b, tab) => {
  switch (tab) {
    case "active": return ACTIVE_STATES.includes(b.status);
    case "searching": return b.status === "searching";
    case "ongoing": return ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status);
    case "completed": return DONE_STATES.includes(b.status);
    case "cancelled": return b.status === "cancelled";
    default: return true;
  }
};

function BookingsView({ bookings, wallet, loading, focusCode, onNew, onRepeat, onCancel, onReview, onPay, onPayAddl, onSpare, onRefresh }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState(focusCode || "");
  const [tab, setTab] = useState("all");
  const [payment, setPayment] = useState("all");
  const [range, setRange] = useState({ preset: "All", from: null, to: null });
  const [sort, setSort] = useState("new");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [fOpen, setFOpen] = useState(false);
  useEffect(() => { if (focusCode) setQ(focusCode); }, [focusCode]);
  useEffect(() => { setPage(1); }, [q, tab, payment, range, sort, pageSize]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = bookings.filter((b) =>
      matchTab(b, tab) &&
      (payment === "all" || b.payment_status === payment) &&
      inDateRange(bkDate(b), range) &&
      (!t || (b.code || "").toLowerCase().includes(t) || (b.service_name || "").toLowerCase().includes(t) || (b.partner_name || "").toLowerCase().includes(t))
    );
    list = [...list].sort((a, b) => {
      if (sort === "new") return new Date(b.created_at) - new Date(a.created_at);
      if (sort === "old") return new Date(a.created_at) - new Date(b.created_at);
      if (sort === "amt_hi") return (b.pricing?.total || 0) - (a.pricing?.total || 0);
      if (sort === "amt_lo") return (a.pricing?.total || 0) - (b.pricing?.total || 0);
      return 0;
    });
    return list;
  }, [bookings, q, tab, payment, range, sort]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeFilters = (payment !== "all" ? 1 : 0) + (range.preset !== "All" ? 1 : 0) + (sort !== "new" ? 1 : 0);
  const spent = bookings.filter((b) => DONE_STATES.includes(b.status)).reduce((s, b) => s + (b.pricing?.total || 0), 0);

  const clearAll = () => { setPayment("all"); setRange({ preset: "All", from: null, to: null }); setSort("new"); setTab("all"); };

  const paymentSel = (
    <PremiumSelect value={payment} onChange={(e) => setPayment(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
      <option value="all">All payments</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="refunded">Refunded</option>
    </PremiumSelect>
  );

  return (
    <div>
      <SectionHeader title="My Bookings" sub="Track, manage and rebook your home services" onNew={onNew} />

      {/* KPI */}
      {loading ? <StatSkeleton /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4 mb-5 azo-stagger">
          <StatTile testId="kpi-total" label="Total" value={bookings.length} count icon={Package} tone="primary" />
          <StatTile testId="kpi-active" label="Active" value={bookings.filter((b) => ACTIVE_STATES.includes(b.status)).length} count icon={Clock} tone="violet" />
          <StatTile testId="kpi-completed" label="Completed" value={bookings.filter((b) => DONE_STATES.includes(b.status)).length} count icon={CheckCircle2} tone="green" />
          <StatTile testId="kpi-cancelled" label="Cancelled" value={bookings.filter((b) => b.status === "cancelled").length} count icon={AlertTriangle} tone="rose" />
          <StatTile testId="kpi-spent" label="Total Spent" value={fmtC(spent)} money={fmt(spent)} icon={IndianRupee} tone="amber" />
        </div>
      )}

      {/* Toolbar */}
      <div className="sticky top-16 lg:top-16 z-20 -mx-4 lg:mx-0 px-4 lg:px-0 py-2 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search service, booking ID, partner…" className="flex-1" testId="bk-search" />
            {isMobile ? (
              <FilterButton activeCount={activeFilters} onClick={() => setFOpen(true)} testId="bk-filter-btn" />
            ) : (
              <><DateRangePicker value={range} onChange={setRange} testId="bk-date" /><SortMenu value={sort} options={SORTS} onChange={setSort} testId="bk-sort" />{paymentSel}</>
            )}
          </div>
          <SegTabs tabs={BK_TABS} value={tab} onChange={setTab} testId="bk-tab"
            counts={{ all: bookings.length, active: bookings.filter((b) => ACTIVE_STATES.includes(b.status)).length, searching: bookings.filter((b) => b.status === "searching").length, ongoing: bookings.filter((b) => ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status)).length, completed: bookings.filter((b) => DONE_STATES.includes(b.status)).length, cancelled: bookings.filter((b) => b.status === "cancelled").length }} />
        </div>
      </div>

      {/* List */}
      <div className="mt-4 space-y-3" data-testid="orders-list">
        {loading && bookings.length === 0 && <SkeletonList rows={4} />}
        {!loading && bookings.length === 0 && <EmptyState icon={Package} title="No bookings yet" desc="Book your first home service in minutes." actionLabel="Book a Service" onAction={onNew} testId="orders-empty" />}
        {!loading && bookings.length > 0 && filtered.length === 0 && <EmptyState icon={Package} title="No bookings match" desc="Try adjusting filters or search." testId="orders-nomatch" />}
        {paged.map((b) => (
          <BookingCard key={b.id} b={b} focus={focusCode === b.code} onRepeat={onRepeat} onCancel={onCancel} onReview={onReview} onPay={onPay} onPayAddl={onPayAddl} onSpare={onSpare} onRefresh={onRefresh} wallet={wallet} />
        ))}
      </div>
      <Paginator page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} testId="bk-pager" />

      {/* Mobile filter sheet */}
      <FilterSheet open={fOpen} onOpenChange={setFOpen} onClear={() => { clearAll(); setFOpen(false); }} onApply={() => setFOpen(false)} title="Filter bookings">
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Date range</p><DateRangePicker value={range} onChange={setRange} testId="bk-date-m" /></div>
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Payment status</p>{paymentSel}</div>
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Sort by</p><SortMenu value={sort} options={SORTS} onChange={setSort} testId="bk-sort-m" /></div>
      </FilterSheet>
    </div>
  );
}

function OtpBanner({ kind, code, bcode }) {
  const start = kind === "start";
  const label = start ? "Share this OTP to START work" : "Share this OTP to COMPLETE work";
  const desc = `Tell your partner this code only when ${start ? "they arrive & begin" : "the work is done"}.`;
  return (
    <div data-testid={`otp-banner-${kind}-${bcode}`}
      className={`mt-3 rounded-2xl p-4 border-2 shadow-sm ${start
        ? "border-primary-300 bg-gradient-to-r from-primary-50 to-sky-50 dark:from-primary-900/30 dark:to-sky-900/20"
        : "border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/20"}`}>
      <div className="flex flex-col items-center text-center gap-2 sm:flex-row sm:items-center sm:text-left sm:gap-3">
        <div className={`hidden sm:grid h-11 w-11 shrink-0 rounded-2xl place-items-center text-white ${start ? "bg-primary-600" : "bg-emerald-600"}`}>
          <KeyRound className="h-5 w-5" />
        </div>
        {/* Line 1 (mobile top): label */}
        <div className="min-w-0 sm:flex-1 order-1 sm:order-none">
          <p className={`text-[11px] font-extrabold uppercase tracking-wider ${start ? "text-primary-700 dark:text-primary-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {label}
          </p>
          {/* description shows inline on desktop */}
          <p className="hidden sm:block text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
        </div>
        {/* Line 2 (mobile middle): the OTP code */}
        <div className={`order-2 sm:order-none shrink-0 font-black tracking-[0.3em] tabular-nums text-4xl sm:text-4xl ${start ? "text-primary-700 dark:text-primary-200" : "text-emerald-700 dark:text-emerald-200"}`}
          data-testid={`otp-code-${kind}-${bcode}`}>
          {code}
        </div>
        {/* Line 3 (mobile bottom): description */}
        <p className="order-3 sm:hidden text-[12px] text-slate-500 dark:text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

function BookingCard({ b, focus, onRepeat, onCancel, onReview, onPay, onPayAddl, onSpare, onRefresh, wallet }) {
  const [tlOpen, setTlOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showResched, setShowResched] = useState(false);
  const [reschedBusy, setReschedBusy] = useState(false);
  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const pendingReq = b.reschedule_request && b.reschedule_request.status === "pending" ? b.reschedule_request : null;
  const iRequested = pendingReq && pendingReq.requested_by_role === "customer";
  const theyRequested = pendingReq && pendingReq.requested_by_role === "partner";
  const canCancel = ["searching", "assigned", "arrived_shop", "arrived_customer"].includes(b.status);
  const canRepeat = DONE_STATES.includes(b.status) || b.status === "cancelled";
  const canReview = DONE_STATES.includes(b.status) && !b.review;
  const canInvoice = DONE_STATES.includes(b.status);
  const addlDue = b.additional && (b.additional.total || 0) > 0 && b.additional.status !== "paid";
  const assigned = ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status);
  const showSchedule = sched.is_scheduled && !DONE_STATES.includes(b.status) && b.status !== "cancelled";
  const canRequestResched = sched.is_scheduled && !pendingReq && !!b.partner_id
    && ["assigned", "arrived_shop", "arrived_customer"].includes(b.status);
  const respondResched = async (action) => {
    setReschedBusy(true);
    try {
      await api.post(`/bookings/${b.id}/reschedule/respond`, { action });
      toast.success(action === "accept" ? "Reschedule accepted" : "Reschedule declined");
      onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not respond"); }
    finally { setReschedBusy(false); }
  };
  const cancelResched = async () => {
    setReschedBusy(true);
    try {
      await api.post(`/bookings/${b.id}/reschedule/cancel`);
      toast.success("Reschedule request withdrawn");
      onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not withdraw"); }
    finally { setReschedBusy(false); }
  };
  const lastAt = (b.timeline || []).filter((t) => t?.at).slice(-1)[0]?.at;
  const copyId = () => { try { const p = navigator.clipboard?.writeText(b.code); if (p?.catch) p.catch(() => {}); } catch { /* ignore */ } toast.success("Booking ID copied"); };
  const callPartner = () => {
    if (commLocked) { toast.info("Call unlocks 30 minutes before your scheduled time"); return; }
    const phone = b.partner_phone || b.partner?.phone;
    if (phone) { window.location.href = `tel:${String(phone).replace(/\s/g, "")}`; }
    else toast.info("Partner contact will be shared once a partner is assigned");
  };
  const chatPartner = () => {
    if (commLocked) { toast.info("Chat unlocks 30 minutes before your scheduled time"); return; }
    setShowChat(true);
  };
  return (
    <div data-testid={`booking-card-${b.code}`} className={`rounded-2xl border bg-white dark:bg-slate-900 p-4 sm:p-5 transition-shadow hover:shadow-lg azo-fade-up ${focus ? "border-primary-400 ring-2 ring-primary-200 dark:ring-primary-900/50" : "border-slate-200 dark:border-slate-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="h-11 w-11 shrink-0 rounded-2xl grid place-items-center text-white" style={{ background: b.status === "cancelled" ? "#e11d48" : "#0D47A1" }}>
            {b.status === "cancelled" ? <X className="h-5 w-5" /> : DONE_STATES.includes(b.status) ? <CheckCircle2 className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-900 dark:text-white truncate">{b.service_name}</p>
              <StatusChip testId={`booking-status-${b.code}`} label={statusText(b.status)} tone={statusTone(b.status)} />
              {b.payment_status && <StatusChip label={b.payment_status} tone={b.payment_status === "paid" ? "green" : b.payment_status === "refunded" ? "violet" : "amber"} />}
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <button onClick={copyId} className="inline-flex items-center gap-1 hover:text-primary-600 transition" title="Copy booking ID">#{b.code} <Copy className="h-3 w-3" /></button>
              <span>· {b.category_name}</span>
              <span>· {new Date(bkDate(b)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              {b.booking_type === "merchant" && <span className="text-primary-600">· via {b.merchant_name}</span>}
            </p>
            {/* Point #9 — same-category multi-service order: every job listed individually */}
            {(b.items || []).length > 1 && (
              <div className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3 py-2 space-y-1" data-testid={`items-${b.code}`}>
                {(b.items || []).map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-slate-600 dark:text-slate-300 truncate">{i + 1}. {it.service_name || it.name || it.custom_name}{(it.qty || 1) > 1 ? ` × ${it.qty}` : ""}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">{fmt(it.price ?? it.total ?? it.custom_price ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-heading font-black text-lg text-slate-900 dark:text-white">{fmt(b.pricing?.total)}</p>
          {b.payment_status === "paid" ? <p className="text-[11px] text-emerald-600 font-semibold">Paid</p>
            : b.payment_status === "refunded" ? <p className="text-[11px] text-violet-600 font-semibold">Refunded</p>
            : <p className="text-[11px] text-amber-600 font-semibold">Pending</p>}
        </div>
      </div>

      {b.otps?.start && ["assigned", "arrived_shop", "arrived_customer"].includes(b.status) && (
        <OtpBanner kind="start" code={b.otps.start} bcode={b.code} />
      )}
      {b.otps?.completion && b.status === "started" && (
        <OtpBanner kind="complete" code={b.otps.completion} bcode={b.code} />
      )}

      {assigned && <CurrentStepCard b={b} onCall={callPartner} onChat={chatPartner} commLocked={commLocked} />}

      {showSchedule && <ScheduledCard schedule={sched} role="customer" />}

      {pendingReq && (
        <div data-testid={`reschedule-pending-${b.code}`} className="mt-3 rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><Clock className="h-4 w-4" /> Reschedule request · pending</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current schedule</p>
              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{pendingReq.old_date}</p>
              <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{pendingReq.old_time}</p>
            </div>
            <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 p-2.5 ring-1 ring-amber-200">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">New request</p>
              <p className="text-[13px] font-black text-amber-700 dark:text-amber-300">{pendingReq.new_date}</p>
              <p className="text-[13px] font-black text-amber-700 dark:text-amber-300">{pendingReq.new_time}</p>
            </div>
          </div>
          {theyRequested ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={reschedBusy} data-testid={`reschedule-accept-${b.code}`} onClick={() => respondResched("accept")} className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold">Accept reschedule</Button>
              <Button size="sm" variant="outline" disabled={reschedBusy} data-testid={`reschedule-reject-${b.code}`} onClick={() => respondResched("reject")} className="flex-1 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50">Reject</Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[12px] text-amber-700 dark:text-amber-200">Waiting for your partner to accept.</p>
              <Button size="sm" variant="outline" disabled={reschedBusy} data-testid={`reschedule-withdraw-${b.code}`} onClick={cancelResched} className="rounded-full">Withdraw</Button>
            </div>
          )}
        </div>
      )}

      {addlDue && (
        <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4" data-testid={`addl-pending-${b.code}`}>
          <p className="text-sm font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Additional work payment pending</p>
          <p className="text-[12.5px] text-amber-700 dark:text-amber-200 mt-1">Your partner added extra work/parts. Please complete this payment — the job finishes only after the additional payment.</p>
          <div className="mt-2.5 space-y-1 bg-white/70 dark:bg-slate-900/50 rounded-lg p-2.5">
            {(b.additional.items || []).map((it) => (
              <div key={it.id} className="flex justify-between text-[12.5px] text-slate-700 dark:text-slate-200"><span>{it.description}{it.labour_charge > 0 ? " (+ labour)" : ""}</span><span className="font-semibold">{fmt((Number(it.part_charge) || 0) + (Number(it.labour_charge) || 0))}</span></div>
            ))}
            <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700"><span>Additional total</span><span>{fmt(b.additional.total)}</span></div>
          </div>
          <Button data-testid={`pay-addl-${b.code}`} size="sm" onClick={() => onPayAddl(b)} className="mt-3 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold">Pay {fmt(b.additional.total)} for additional work</Button>
        </div>
      )}
      {b.additional && b.additional.status === "paid" && ["started", "completed", "paid"].includes(b.status) && (
        <p className="mt-2 text-[12.5px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1" data-testid={`addl-paid-${b.code}`}><CheckCircle2 className="h-4 w-4" /> Additional work paid · {fmt(b.additional.total)}</p>
      )}

      <PremiumTimeline b={b} open={tlOpen} onToggle={() => setTlOpen((o) => !o)} lastAt={lastAt} />

      {/* Contextual actions */}
      <div className="flex gap-2 mt-3 flex-wrap items-center">
        {b.status === "pending_payment" && onPay && (
          <Button size="sm" onClick={() => onPay(b)} data-testid={`pay-${b.code}`}
            className="rounded-full h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            <Wallet className="h-4 w-4 mr-1" /> {b.order_group_id ? "Pay Now · combined order" : `Pay ${fmt(b.pricing?.total)}`}
          </Button>
        )}
        {assigned && <Button size="sm" onClick={callPartner} disabled={commLocked} data-testid={`call-${b.code}`} className="rounded-full h-9 px-4 bg-primary-700 hover:bg-primary-800 disabled:opacity-50">{commLocked ? <Lock className="h-4 w-4 mr-1" /> : <Phone className="h-4 w-4 mr-1" />} Call</Button>}
        {assigned && <Button size="sm" variant="outline" onClick={chatPartner} disabled={commLocked} data-testid={`chat-${b.code}`} className="rounded-full h-9 px-4 disabled:opacity-50">{commLocked ? <Lock className="h-4 w-4 mr-1" /> : <MessageCircle className="h-4 w-4 mr-1" />} Chat</Button>}
        <Button size="sm" variant="outline" onClick={() => setShowDetails(true)} data-testid={`details-${b.code}`} className="rounded-full h-9 px-4"><InfoIcon className="h-4 w-4 mr-1" /> View Details</Button>
        {canInvoice && <Button size="sm" variant="outline" onClick={() => setShowInvoice(true)} data-testid={`invoice-${b.code}`} className="rounded-full h-9 px-4"><FileText className="h-4 w-4 mr-1" /> Invoice</Button>}
        {canRepeat && <Button data-testid={`repeat-${b.code}`} size="sm" variant="outline" onClick={() => onRepeat(b)} className="rounded-full h-9 px-4"><RefreshCcw className="h-4 w-4 mr-1" /> Book Again</Button>}
        {canReview && <Button data-testid={`review-${b.code}`} size="sm" variant="outline" onClick={() => onReview(b)} className="rounded-full h-9 px-4 border-amber-200 text-amber-600 hover:bg-amber-50"><Star className="h-4 w-4 mr-1" /> Rate</Button>}
        {canRequestResched && <Button size="sm" variant="outline" onClick={() => setShowResched(true)} data-testid={`reschedule-${b.code}`} className="rounded-full h-9 px-4"><Clock className="h-4 w-4 mr-1" /> Request Reschedule</Button>}
        {canCancel && <Button data-testid={`cancel-${b.code}`} size="sm" variant="outline" onClick={() => onCancel(b)} className="rounded-full h-9 px-4 border-rose-200 text-rose-600 hover:bg-rose-50">Cancel</Button>}
        {b.review && <span className="text-sm text-amber-600 flex items-center ml-auto"><Star className="h-4 w-4 fill-amber-400 text-amber-400 mr-1" />{b.review.rating}.0 rated</span>}
      </div>

      {(b.spare_parts || []).length > 0 && ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status) && (
        <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3" data-testid={`spares-${b.code}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary-700 dark:text-primary-300 mb-2">Spare parts requested</p>
          <div className="space-y-2">
            {b.spare_parts.map((sp) => (
              <div key={sp.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                <div><p className="text-sm font-medium">{sp.name} × {sp.quantity}</p><p className="text-xs text-slate-400">{fmt(sp.total)}{sp.notes ? ` · ${sp.notes}` : ""}</p></div>
                {sp.status === "pending" ? (
                  <div className="flex gap-1">
                    <Button size="sm" data-testid={`spare-approve-${sp.id}`} className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2" onClick={() => onSpare(b, sp.id, "approve")}>Approve</Button>
                    <Button size="sm" variant="outline" className="text-red-600 h-7 px-2" onClick={() => onSpare(b, sp.id, "reject")}>Reject</Button>
                  </div>
                ) : <Badge className={`${sp.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"} border-0 capitalize`}>{sp.status}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      <BookingDetailsDrawer b={b} open={showDetails} onClose={() => setShowDetails(false)} onInvoice={() => { setShowDetails(false); setShowInvoice(true); }} canInvoice={canInvoice} />
      <InvoiceDrawer b={b} open={showInvoice} onClose={() => setShowInvoice(false)} />
      {assigned && <BookingChat booking={b} role="customer" open={showChat} onOpenChange={setShowChat} hideBar />}
      <RescheduleDrawer b={b} open={showResched} onClose={() => setShowResched(false)} onDone={onRefresh} />
    </div>
  );
}

/* ====================================================== REFUNDS ========= */
const REFUND_TABS = [{ key: "all", label: "All" }, { key: "pending", label: "Pending" }, { key: "processed", label: "Completed" }, { key: "failed", label: "Rejected" }];
function RefundsView({ refunds, loading }) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [range, setRange] = useState({ preset: "All", from: null, to: null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); }, [q, tab, range, pageSize]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return refunds.filter((r) => {
      const tabOk = tab === "all" || (tab === "pending" ? ["initiated", "pending", "processing"].includes(r.status) : tab === "processed" ? r.status === "processed" : r.status === "failed");
      return tabOk && inDateRange(r.cancelled_at, range) && (!t || (r.booking_code || "").toLowerCase().includes(t) || (r.service_name || "").toLowerCase().includes(t));
    });
  }, [refunds, q, tab, range]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalRefunded = refunds.reduce((s, r) => s + (r.status === "processed" ? Number(r.refund_amount || 0) : 0), 0);

  return (
    <div>
      <SectionHeader title="Refunds" sub="Track cancellations and refund status" />
      {loading ? <StatSkeleton /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5 azo-stagger">
          <StatTile label="Total Refunds" value={refunds.length} count icon={Receipt} tone="primary" testId="rf-total" />
          <StatTile label="Pending" value={refunds.filter((r) => ["initiated", "pending", "processing"].includes(r.status)).length} count icon={Clock} tone="amber" testId="rf-pending" />
          <StatTile label="Completed" value={refunds.filter((r) => r.status === "processed").length} count icon={CheckCircle2} tone="green" testId="rf-done" />
          <StatTile label="Refunded Amount" value={fmtC(totalRefunded)} money={fmt(totalRefunded)} icon={IndianRupee} tone="violet" testId="rf-amt" />
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search booking ID, service…" className="flex-1" testId="rf-search" />
        <DateRangePicker value={range} onChange={setRange} testId="rf-date" />
      </div>
      <SegTabs tabs={REFUND_TABS} value={tab} onChange={setTab} testId="rf-tab" />
      <div className="mt-4 space-y-3" data-testid="refunds-list">
        {loading && refunds.length === 0 && <SkeletonList rows={3} />}
        {!loading && refunds.length === 0 && <EmptyState icon={Receipt} title="No refunds yet" desc="No cancellations or refunds on your account." testId="refunds-empty" />}
        {!loading && refunds.length > 0 && filtered.length === 0 && <EmptyState icon={Receipt} title="No refunds match" desc="Adjust your filters." testId="refunds-nomatch" />}
        {paged.map((r) => (
          <div key={r.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 azo-elev azo-fade-up" data-testid={`refund-${r.booking_code}`}>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900 dark:text-white">{r.service_name}</p>
                  <RefundStatusBadge status={r.status} />
                  <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-0 capitalize">{r.method}</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1">#{r.booking_code} · Cancelled {new Date(r.cancelled_at).toLocaleString("en-IN")}</p>
                {r.cancellation_reason && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Reason: {r.cancellation_reason}</p>}
              </div>
              <div className="text-right">
                <p className="font-heading font-black text-lg text-emerald-600">{fmt(r.refund_amount)}</p>
                <p className="text-xs text-slate-400">{r.refund_pct}% of {fmt(r.original_amount)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Info label="Original" value={fmt(r.original_amount)} />
              <Info label="Refund %" value={`${r.refund_pct}%`} />
              <Info label="Refund amount" value={fmt(r.refund_amount)} />
              <Info label="Status" value={(r.status || "").replace("_", " ")} cap />
            </div>
            {(r.status_history || []).length > 0 && (
              <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Refund timeline</p>
                <div className="space-y-1">
                  {r.status_history.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-primary-500" /><span className="capitalize font-medium text-slate-700 dark:text-slate-200">{(h.status || "").replace("_", " ")}</span><span className="text-slate-400">· {new Date(h.at).toLocaleString("en-IN")}</span>{h.note && <span className="text-slate-400 truncate">— {h.note}</span>}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Paginator page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} testId="rf-pager" />
    </div>
  );
}

/* ======================================================== WALLET ======== */
function WalletView({ wallet, user, onReload }) {
  const isMobile = useIsMobile();
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [range, setRange] = useState({ preset: "All", from: null, to: null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const txns = wallet.transactions || [];
  useEffect(() => { setPage(1); }, [type, q, range, pageSize]);

  const credits = txns.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const debits = txns.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount || 0), 0);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return txns.filter((x) => (type === "all" || x.type === type) && inDateRange(x.created_at, range) && (!t || (x.note || "").toLowerCase().includes(t) || (x.kind || "").toLowerCase().includes(t)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [txns, type, q, range]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <SectionHeader title="Wallet" sub="Your AzoApp balance, top-ups and payments" />
      <ScratchCardsPanel onClaimed={onReload} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-1 relative overflow-hidden rounded-3xl azo-mesh text-white p-6 azo-elev azo-fade-up">
          <div className="absolute -right-6 -bottom-6 h-32 w-32 rounded-full bg-white/10" />
          <p className="text-white/80 text-sm">Available Balance</p>
          <p className="font-heading font-black text-4xl mt-1.5 truncate" title={fmt(wallet.balance)}>{fmtC(wallet.balance)}</p>
          <WalletTopup onDone={onReload} user={user} />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-3 lg:gap-4 azo-stagger">
          <StatTile label="Total Added" value={fmtC(credits)} money={fmt(credits)} icon={TrendingUp} tone="green" testId="w-credits" />
          <StatTile label="Total Spent" value={fmtC(debits)} money={fmt(debits)} icon={IndianRupee} tone="rose" testId="w-debits" />
          <StatTile label="Transactions" value={txns.length} count icon={Receipt} tone="primary" testId="w-count" />
          <StatTile label="Balance" value={fmtC(wallet.balance)} money={fmt(wallet.balance)} icon={Wallet} tone="amber" testId="w-bal" />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <SearchInput value={q} onChange={setQ} placeholder="Search transactions…" className="flex-1 min-w-[180px]" testId="w-search" />
        <PremiumSelect value={type} onChange={(e) => setType(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <option value="all">All types</option><option value="credit">Credits</option><option value="debit">Debits</option>
        </PremiumSelect>
        <DateRangePicker value={range} onChange={setRange} testId="w-date" />
      </div>

      <h3 className="font-heading font-bold text-lg mb-3 text-slate-900 dark:text-white">Transactions</h3>
      <div className="space-y-2" data-testid="txn-list">
        {txns.length === 0 && <EmptyState icon={Wallet} title="No transactions yet" desc="Add money or make a booking to see activity here." testId="wallet-empty" />}
        {txns.length > 0 && filtered.length === 0 && <EmptyState icon={Wallet} title="No transactions match" desc="Adjust your filters." testId="wallet-nomatch" />}
        {paged.map((t) => {
          const credit = t.type === "credit";
          return (
            <div key={t.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between azo-fade-up">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${credit ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30" : "bg-rose-50 text-rose-600 dark:bg-rose-900/30"}`}>
                  {credit ? <TrendingUp className="h-5 w-5" /> : <IndianRupee className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-white capitalize truncate">{(t.kind || "").replace(/_/g, " ")}</p>
                  <p className="text-xs text-slate-400 truncate">{t.note} · {new Date(t.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
              <p className={`font-bold shrink-0 ${credit ? "text-emerald-600" : "text-slate-700 dark:text-slate-200"}`}>{credit ? "+" : "-"}{fmt(t.amount)}</p>
            </div>
          );
        })}
      </div>
      <Paginator page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} testId="w-pager" />
    </div>
  );
}

const WalletTopup = ({ onDone, user }) => {
  const [amt, setAmt] = useState(500);
  const [busy, setBusy] = useState(false);
  const add = async () => { setBusy(true); try { const ok = await runPayment({ purpose: "wallet", amount: Number(amt), user }); if (ok) onDone(); } finally { setBusy(false); } };
  return (
    <div className="mt-4">
      <div className="flex gap-2 flex-wrap mb-2">
        {[100, 250, 500, 1000].map((v) => (
          <button key={v} data-testid={`topup-preset-${v}`} onClick={() => setAmt(v)} className={`h-8 px-3 rounded-lg text-sm font-bold azo-press ${Number(amt) === v ? "bg-white text-primary-700" : "bg-white/20 text-white hover:bg-white/30"}`}>₹{v}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input data-testid="topup-amount" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} className="bg-white/20 border-white/30 text-white placeholder:text-white/60 w-28 h-10" />
        <Button data-testid="topup-btn" disabled={busy || !Number(amt)} onClick={add} className="bg-white text-primary-700 hover:bg-white/90 h-10 font-bold flex-1">{busy ? "Processing…" : "Add Money"}</Button>
      </div>
    </div>
  );
};

/* ====================================================== REFERRAL ======== */
function ReferralView({ user, bookings }) {
  const [sum, setSum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [codeInput, setCodeInput] = useState("");
  const [applying, setApplying] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    api.get("/growth/referral").then((r) => setSum(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const code = sum?.code || `AZO${(user?.phone || "").slice(-4)}`;
  const reward = sum?.reward_amount || 100;
  const discount = sum?.referee_discount || reward;
  const link = `${window.location.origin}/${sum?.link || `?fref=${code}`}`;
  const stats = sum?.stats || { invited: 0, joined: 0, first_booking: 0, earned: 0, pending: 0 };
  const history = sum?.history || [];

  const copy = (text, msg) => { try { const p = navigator.clipboard?.writeText(text); if (p?.catch) p.catch(() => {}); } catch { /* ignore */ } toast.success(msg); };
  const share = async () => {
    const data = { title: "AzoApp", text: `Book trusted home services on AzoApp. Use my code ${code} and we both earn ₹${reward}!`, url: link };
    if (navigator.share) { try { await navigator.share(data); } catch { /* cancelled */ } }
    else copy(link, "Referral link copied!");
  };
  const applyCode = async () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) return;
    setApplying(true);
    try {
      const { data } = await api.post("/referral/apply", { code: c });
      if (data.ok) { toast.success(data.detail || "Referral applied!"); setCodeInput(""); load(); }
      else toast.error(data.detail || "Could not apply code");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not apply code"); }
    setApplying(false);
  };

  return (
    <div>
      <SectionHeader title="Refer & Earn" sub="Invite friends and earn rewards together" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 relative overflow-hidden rounded-3xl azo-mesh text-white p-6 lg:p-8 azo-elev azo-fade-up">
          <Gift className="h-10 w-10" />
          <h2 className="font-heading font-black text-2xl lg:text-3xl mt-3">Refer friends, earn ₹{reward} each</h2>
          <p className="text-white/85 mt-1">Share your code — your friend gets ₹{discount} off their first booking and you earn ₹{reward} when they complete it.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="bg-white/15 backdrop-blur rounded-2xl px-5 py-3">
              <p className="text-[11px] text-white/70 uppercase tracking-wider">Your code</p>
              <p className="font-heading font-black text-2xl tracking-widest" data-testid="referral-code">{code}</p>
            </div>
            <Button data-testid="copy-referral" onClick={() => copy(code, "Referral code copied!")} className="bg-white text-primary-700 hover:bg-white/90 rounded-xl h-11"><Copy className="h-4 w-4 mr-1.5" /> Copy code</Button>
            <Button data-testid="copy-referral-link" onClick={() => copy(link, "Referral link copied!")} className="bg-white/20 hover:bg-white/30 text-white rounded-xl h-11"><Copy className="h-4 w-4 mr-1.5" /> Copy link</Button>
            <Button data-testid="share-referral" onClick={share} className="bg-white/20 hover:bg-white/30 text-white rounded-xl h-11"><Share2 className="h-4 w-4 mr-1.5" /> Share</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:gap-4 content-start azo-stagger">
          <StatTile label="Total Invited" value={stats.invited} count icon={Gift} tone="primary" testId="ref-invited" />
          <StatTile label="Joined" value={stats.joined} count icon={CheckCircle2} tone="green" testId="ref-joined" />
          <StatTile label="Rewards Earned" value={fmtC(stats.earned)} money={fmt(stats.earned)} icon={TrendingUp} tone="amber" testId="ref-earned" />
          <StatTile label="Pending" value={fmtC(stats.pending)} money={fmt(stats.pending)} icon={Clock} tone="slate" testId="ref-pending" />
        </div>
      </div>

      <div className="mt-6 max-w-md">
        <ReferralShareCard code={code} reward={reward} discount={discount} link={link} card={sum?.card} />
      </div>

      {/* Apply a friend's code */}
      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 azo-elev" data-testid="apply-referral-card">
        <p className="font-heading font-bold text-slate-900 dark:text-white">Got a friend&apos;s code?</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Enter it before your first booking — you both earn ₹{reward}.</p>
        <div className="mt-3 flex gap-2 max-w-md">
          <Input data-testid="apply-code-input" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} placeholder="e.g. AZO1234" className="uppercase" />
          <Button data-testid="apply-code-btn" onClick={applyCode} disabled={applying || !codeInput.trim()} className="bg-primary-700 hover:bg-primary-800 rounded-xl shrink-0">{applying ? "Applying…" : "Apply"}</Button>
        </div>
      </div>

      {/* History */}
      <div className="mt-6">
        <h3 className="font-heading font-bold text-lg mb-3 text-slate-900 dark:text-white">Referral history</h3>
        {loading ? <SkeletonList rows={3} /> : history.length === 0 ? (
          <EmptyState icon={Gift} title="No referrals yet" desc="Share your code to start earning rewards." testId="referral-empty" />
        ) : (
          <div className="space-y-2" data-testid="referral-history">
            {history.map((h) => (
              <div key={h.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between azo-fade-up">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-10 w-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 grid place-items-center font-bold shrink-0">{(h.name || "F")[0]}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-white truncate">{h.name}</p>
                    <p className="text-xs text-slate-400">{h.date ? new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <StatusChip tone={h.payment_status === "paid" ? "green" : "amber"} label={h.status === "first_booking" ? "Completed" : "Joined"} />
                  <span className={`font-bold ${h.payment_status === "paid" ? "text-emerald-600" : "text-slate-400"}`}>{h.payment_status === "paid" ? "+" : ""}{fmt(h.reward)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="font-heading font-bold text-lg mb-3 text-slate-900 dark:text-white">How it works</h3>
        <div className="grid sm:grid-cols-3 gap-3 azo-stagger">
          {[["Share your code", "Send your referral code or link to friends & family."], ["Friend books", `They get ₹${discount} off their first AzoApp booking.`], ["You earn", `You get ₹${reward} credited once their booking completes.`]].map(([t, d], i) => (
            <div key={t} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 azo-elev">
              <span className="h-9 w-9 grid place-items-center rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-black">{i + 1}</span>
              <p className="font-semibold text-slate-900 dark:text-white mt-3">{t}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================ shared small pieces === */
const Info = ({ label, value, cap }) => (
  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`text-slate-800 dark:text-slate-100 font-medium break-all ${cap ? "capitalize" : ""}`}>{value}</p>
  </div>
);

const REFUND_STATUS = { initiated: "blue", pending: "amber", processing: "amber", processed: "green", failed: "rose" };
const RefundStatusBadge = ({ status }) => (
  <StatusChip tone={REFUND_STATUS[status] || "slate"} label={status === "processed" ? "Refund successful" : `Refund ${(status || "").replace("_", " ")}`} />
);

function ReviewDialog({ rev, setRev, stars, setStars, cmt, setCmt, onSubmit }) {
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await onSubmit(); } finally { setBusy(false); } };
  return (
    <Dialog open={!!rev} onOpenChange={() => setRev(null)}>
      <DialogContent data-testid="review-dialog">
        <DialogHeader><DialogTitle className="font-heading">Rate your service</DialogTitle><DialogDescription>How was your experience{rev?.partner_name ? ` with ${rev.partner_name}` : ""}?</DialogDescription></DialogHeader>
        <div className="flex gap-1 justify-center my-2">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} data-testid={`star-${n}`} onClick={() => setStars(n)}><Star className={`h-9 w-9 transition-transform hover:scale-110 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} /></button>)}
        </div>
        <Input data-testid="review-comment" placeholder="Add a comment (optional)" value={cmt} onChange={(e) => setCmt(e.target.value)} />
        <Button data-testid="submit-review" onClick={submit} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800 mt-3">
          {busy ? "Submitting…" : "Submit Review"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const AdditionalPayDialog = ({ booking, walletBalance, onClose, onPay }) => {
  const [busy, setBusy] = useState(false);
  if (!booking || !booking.additional) return null;
  const a = booking.additional;
  const canWallet = (walletBalance || 0) >= (a.total || 0);
  const run = async (method) => { setBusy(true); try { await onPay(booking, method); } finally { setBusy(false); onClose(); } };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" data-testid="addl-pay-dialog">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden azo-scale-in">
        <div className="bg-amber-500 text-white px-5 py-4"><p className="font-heading font-extrabold text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Additional work payment</p><p className="text-amber-50 text-[12.5px] mt-0.5">Complete this payment so the partner can finish the job.</p></div>
        <div className="p-5">
          <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
            {(a.items || []).map((it) => <div key={it.id} className="flex justify-between text-sm text-slate-700 dark:text-slate-200"><span>{it.description}</span><span className="font-semibold">{fmt((Number(it.part_charge) || 0) + (Number(it.labour_charge) || 0))}</span></div>)}
            <div className="flex justify-between text-base font-extrabold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-700"><span>Total payable</span><span>{fmt(a.total)}</span></div>
          </div>
          <div className="mt-4 space-y-2">
            <Button data-testid="addl-pay-online" disabled={busy} onClick={() => run("online")} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold">{busy ? "Processing…" : `Pay ${fmt(a.total)} now`}</Button>
            <Button data-testid="addl-pay-wallet" disabled={busy || !canWallet} variant="outline" onClick={() => run("wallet")} className="w-full border-primary-200 text-primary-700"><Wallet className="h-4 w-4 mr-1" /> {canWallet ? `Pay from Wallet (${fmt(walletBalance)})` : "Insufficient wallet balance"}</Button>
            <button onClick={onClose} className="w-full text-sm text-slate-500 hover:text-slate-700 py-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CancelDialog = ({ booking, onClose, onConfirm }) => {
  const { cancellation_reasons } = useSiteConfig();
  const reasonList = [...((cancellation_reasons && cancellation_reasons.length) ? cancellation_reasons : CANCEL_REASONS), "Other"];
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pvLoading, setPvLoading] = useState(false);
  useEffect(() => {
    if (booking) {
      setReason(""); setOther(""); setPreview(null); setPvLoading(true);
      api.get(`/bookings/${booking.id}/cancellation-preview`)
        .then(({ data }) => setPreview(data))
        .catch(() => setPreview(null))
        .finally(() => setPvLoading(false));
    }
  }, [booking]);
  if (!booking) return null;
  const finalReason = reason === "Other" ? other.trim() : reason;
  const submit = async () => { if (!finalReason) return; setBusy(true); try { await onConfirm(booking, finalReason); } finally { setBusy(false); } };
  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="cancel-dialog">
        <DialogHeader><DialogTitle>Cancel booking #{booking.code}?</DialogTitle><DialogDescription>Review your refund breakdown, then tell us why you&apos;re cancelling.</DialogDescription></DialogHeader>

        {/* ---- Cancellation Breakdown Card ---- */}
        <div data-testid="cancel-breakdown" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3.5 text-sm">
          {pvLoading && <p className="text-slate-400 text-xs py-2 text-center">Calculating your refund…</p>}
          {!pvLoading && preview && (
            <>
              <div className={`mb-2.5 rounded-lg px-3 py-2 text-xs font-medium ${preview.partner_was_assigned ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"}`}>
                {preview.reason}
              </div>
              <div className="space-y-1.5">
                <Row k="Original amount" v={fmt(preview.original_amount)} />
                {preview.partner_was_assigned && (
                  <>
                    <Row k={`Service refund (${(preview.refund_pct || 0)}% of ${fmt(preview.service_amount)})`} v={fmt(preview.service_refund)} />
                    <Row k={`Est. Govt. Taxes refund (${(preview.refund_pct || 0)}% of ${fmt(preview.tax)})`} v={fmt(preview.gst_refund)} />
                  </>
                )}
                {Number(preview.retained_from_you) > 0 && (
                  <Row k="Cancellation charge" v={`- ${fmt(preview.retained_from_you)}`} muted />
                )}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">You&apos;ll get back</span>
                  <span data-testid="cancel-refund-amount" className="font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums text-base">{fmt(preview.refund)}</span>
                </div>
                {(preview.item_refunds || []).length > 1 && (
                  <div className="pt-2 mt-1 border-t border-dashed border-slate-200 dark:border-slate-700 space-y-1">
                    {preview.item_refunds.map((it, i) => (
                      <Row key={i} k={`${it.service_name}${it.qty > 1 ? ` ×${it.qty}` : ""}`} v={fmt(it.refund)} small />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {!pvLoading && !preview && <p className="text-slate-400 text-xs py-2 text-center">A refund applies as per our cancellation policy.</p>}
        </div>

        <div className="space-y-2 py-1">
          {reasonList.map((r) => (
            <button key={r} type="button" data-testid={`cancel-reason-${r.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} onClick={() => setReason(r)}
              className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${reason === r ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium ring-1 ring-primary-500" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>{r}</button>
          ))}
          {reason === "Other" && <Input autoFocus data-testid="cancel-reason-other-input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Tell us a bit more…" className="mt-1" />}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Keep booking</Button>
          <Button data-testid="cancel-confirm" onClick={submit} disabled={busy || !finalReason} className="bg-red-600 hover:bg-red-700">{busy ? "Cancelling…" : "Confirm cancellation"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ k, v, muted, small }) => (
  <div className={`flex items-center justify-between ${small ? "text-xs" : "text-sm"}`}>
    <span className={muted ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}>{k}</span>
    <span className={`tabular-nums ${muted ? "text-slate-400" : "text-slate-700 dark:text-slate-200 font-medium"}`}>{v}</span>
  </div>
);

/* ============ Booking timeline helpers ============ */
const relTime = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day${s < 172800 ? "" : "s"} ago`;
};
const STATUS_RANK = { searching: 0, assigned: 1, arrived_shop: 2, arrived_customer: 2, started: 3, completed: 4, paid: 4 };
const fmtTs = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function buildSteps(b) {
  const rank = STATUS_RANK[b.status] ?? 0;
  const at = (statuses) => (b.timeline || []).find((t) => statuses.includes(t.status))?.at;
  const defs = [
    { key: "confirmed", title: "Booking Confirmed", req: -1, at: at(["searching", "pending"]) || b.created_at, desc: "We received your booking" },
    { key: "assigned", title: "Partner Assigned", req: 1, at: at(["assigned"]), desc: b.partner_name || "Finding the best partner" },
    { key: "on_way", title: "Partner On The Way", req: 2, at: at(["arrived_customer", "arrived_shop"]), desc: "Estimated arrival 15–20 min" },
    { key: "started", title: "Work Started", req: 3, at: at(["started"]), desc: "Service in progress" },
    { key: "completed", title: "Work Completed", req: 4, at: at(["completed", "paid"]), desc: "Service finished" },
  ];
  let currentSet = false;
  return defs.map((d) => {
    let state;
    if (d.req <= rank) state = "completed";
    else if (!currentSet) { state = "current"; currentSet = true; }
    else state = "upcoming";
    if (b.status === "completed" || b.status === "paid") state = "completed";
    return { ...d, state };
  });
}

function PremiumTimeline({ b, open, onToggle, lastAt }) {
  if (b.status === "cancelled") {
    return (
      <div className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/40 px-4 py-3 flex items-center gap-2">
        <X className="h-4 w-4 text-rose-600" />
        <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">Booking cancelled</span>
        {lastAt && <span className="text-xs text-rose-500 ml-auto">{fmtTs(lastAt)}</span>}
      </div>
    );
  }
  const steps = buildSteps(b);
  const current = steps.find((s) => s.state === "current") || steps.filter((s) => s.state === "completed").slice(-1)[0];
  const done = b.status === "completed" || b.status === "paid";
  return (
    <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
      {/* Collapsed summary */}
      <button onClick={onToggle} data-testid={`timeline-toggle-${b.code}`}
        className="w-full flex items-center gap-3 text-left group">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {!done && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-60" />}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${done ? "bg-emerald-500" : "bg-primary-600"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{done ? "Work Completed" : current?.title}</p>
          <p className="text-[11px] text-slate-400">{current?.desc}{lastAt ? ` · Updated ${relTime(lastAt)}` : ""}</p>
        </div>
        <span className="text-xs font-semibold text-primary-600 flex items-center gap-1 shrink-0">
          {open ? "Hide" : "View Timeline"} <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* Expanded vertical timeline */}
      <div className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <ol className="relative">
            {steps.map((s, i) => {
              const isLast = i === steps.length - 1;
              return (
                <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {!isLast && <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${s.state === "completed" ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />}
                  <span className={`relative z-10 h-6 w-6 shrink-0 rounded-full grid place-items-center ${
                    s.state === "completed" ? "bg-emerald-500 text-white"
                    : s.state === "current" ? "bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/40"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-300"}`}>
                    {s.state === "completed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.state === "current" ? <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> : <Circle className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 -mt-0.5">
                    <p className={`text-sm font-semibold ${s.state === "upcoming" ? "text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>{s.title}</p>
                    <p className="text-[11px] text-slate-400">{s.desc}</p>
                    {s.at && <p className="text-[11px] text-slate-400 mt-0.5">{fmtTs(s.at)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function CurrentStepCard({ b, onCall, onChat }) {
  const map = {
    assigned: { t: "Partner assigned", d: "Your partner will start heading over soon", eta: "" },
    arrived_shop: { t: "Partner is on the way", d: "Picking up parts & heading to you", eta: "15–20 min" },
    arrived_customer: { t: "Partner has arrived", d: "Share your start OTP to begin", eta: "" },
    started: { t: "Work in progress", d: "Your partner is working on the service", eta: "" },
  };
  const m = map[b.status] || map.assigned;
  return (
    <div className="mt-3 rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/70 dark:bg-primary-900/15 p-4" data-testid={`current-step-${b.code}`}>
      <div className="flex items-center gap-3">
        <span className="h-11 w-11 rounded-full bg-white dark:bg-slate-800 grid place-items-center text-primary-700 shrink-0 shadow-sm">
          <UserIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-primary-800 dark:text-primary-200">{m.t}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
            {b.partner_name || "Assigning…"}{b.category_name ? ` · ${b.category_name}` : ""}
            {b.partner_premium && <span className="inline-flex items-center gap-0.5 ml-1 text-amber-600"><Crown className="h-3 w-3" /> Pro</span>}
          </p>
          {m.eta && <p className="text-[11px] text-slate-500 mt-0.5">Estimated arrival <b className="text-slate-700 dark:text-slate-200">{m.eta}</b></p>}
        </div>
      </div>
    </div>
  );
}

/* ============ Details + Invoice drawers ============ */
function DrawerShell({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex sm:justify-end bg-black/50 azo-fade-up" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
        {footer && <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
const DRow = ({ k, v, strong }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500">{k}</span>
    <span className={strong ? "font-bold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-200"}>{v}</span>
  </div>
);
const DBlock = ({ icon: Icon, title, children }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2 flex items-center gap-1.5">{Icon && <Icon className="h-3.5 w-3.5" />} {title}</p>
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">{children}</div>
  </div>
);

/* Canonical Payment Summary — renders ONLY the backend-provided breakdown (single
   source of truth). No local math, so Service Amount never absorbs a fee and no
   charge/tax is ever double-counted. Falls back to legacy pricing for old data. */
function PaymentSummary({ b }) {
  const bd = b.breakdown;
  if (!bd) {
    // Legacy fallback (pre-breakdown bookings)
    const p = b.pricing || {};
    const visiting = Number(p.visiting_charge || 0);
    const svc = Number(p.subtotal ?? p.base ?? 0) - visiting - Number(p.emergency_fee || 0) - Number(p.surge || 0);
    return (
      <>
        <DRow k="Service Amount" v={fmt(Math.max(svc, 0))} />
        {Number(p.emergency_fee || 0) > 0 && <DRow k="Emergency Fee" v={fmt(p.emergency_fee)} />}
        {visiting > 0 && <DRow k="Visiting Charge" v={fmt(visiting)} />}
        {Number(p.discount || 0) > 0 && <DRow k="Discount" v={`- ${fmt(p.discount)}`} />}
        {Number(p.gst || 0) > 0 && <DRow k="Est. Govt. Taxes" v={fmt(p.gst)} />}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-2"><DRow k="Total" v={fmt(p.total)} strong /></div>
        <DRow k="Payment status" v={(b.payment_status || "pending").toUpperCase()} />
      </>
    );
  }
  const hasCharges = (bd.additional_charges || []).length > 0;
  return (
    <>
      <DRow k="Service Amount" v={fmt(bd.services_subtotal)} />
      {(bd.additional_charges || []).map((c) => (
        <DRow key={c.key} k={c.label} v={fmt(c.amount)} />
      ))}
      {hasCharges && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
          <DRow k="Subtotal" v={fmt(bd.subtotal)} />
        </div>
      )}
      {Number(bd.discount || 0) > 0 && (
        <DRow k={`Coupon Discount${bd.coupon_code ? ` (${bd.coupon_code})` : ""}`} v={`- ${fmt(bd.discount)}`} />
      )}
      {Number(bd.tax || 0) > 0 && (
        <>
          <DRow k="Taxable Amount" v={fmt(bd.taxable)} />
          <DRow k="Est. Govt. Taxes" v={fmt(bd.tax)} />
        </>
      )}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
        <DRow k="Total Booking Amount" v={fmt(bd.total)} strong />
      </div>
      <DRow k="Payment status" v={(bd.payment_status || b.payment_status || "pending").toUpperCase()} />
    </>
  );
}

function BookingDetailsDrawer({ b, open, onClose, onInvoice, canInvoice }) {
  const p = b.pricing || {};
  const bd = b.breakdown || null;
  const addr = b.address || {};
  return (
    <DrawerShell open={open} onClose={onClose} title="Booking Details"
      footer={canInvoice ? <Button onClick={onInvoice} className="w-full bg-primary-700 hover:bg-primary-800 rounded-xl"><FileText className="h-4 w-4 mr-1.5" /> View Invoice</Button> : null}>
      <DBlock icon={Wrench} title="Service Information">
        <DRow k="Service" v={b.service_name} strong />
        <DRow k="Category" v={b.category_name} />
        <DRow k="Status" v={statusText(b.status)} />
      </DBlock>
      {/* Point #9 — every service (job) inside this order, itemised with Qty × Rate =
          Amount and independent add-on quantities (single source of truth: breakdown). */}
      {((b.breakdown && (b.breakdown.service_items || []).length > 0) || (b.items || []).length > 0) && (
        <DBlock icon={Package} title="Services">
          <ServiceBreakdown booking={b} fmt={fmt} title="Services in this order" compact />
        </DBlock>
      )}
      {/* Point #10 — partner-uploaded before/after work photos with lightbox */}
      {((b.evidence?.before || []).length > 0 || (b.evidence?.after || []).length > 0) && (
        <DBlock icon={Camera} title="Work Proof Photos">
          <WorkProofSection evidence={b.evidence} compact />
        </DBlock>
      )}
      <DBlock icon={Package} title="Booking Information">
        <DRow k="Booking ID" v={`#${b.code}`} />
        <DRow k="Booked on" v={fmtTs(b.created_at)} />
        {b.scheduled_at && <DRow k="Scheduled" v={fmtTs(b.scheduled_at)} />}
        {b.booking_type === "merchant" && <DRow k="Referred by" v={b.merchant_name} />}
      </DBlock>
      {b.partner_name && (
        <DBlock icon={UserIcon} title="Partner Information">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-primary-50 dark:bg-primary-900/30 grid place-items-center text-primary-700"><UserIcon className="h-5 w-5" /></span>
            <div><p className="font-semibold text-slate-800 dark:text-white">{b.partner_name}</p><p className="text-xs text-slate-400">{b.category_name}</p></div>
          </div>
        </DBlock>
      )}
      <DBlock icon={CreditCard} title="Payment Summary">
        <PaymentSummary b={b} />
      </DBlock>
      {(addr.line || addr.city) && (
        <DBlock icon={MapPin} title="Service Address">
          <p className="text-sm text-slate-700 dark:text-slate-200">{addr.line}</p>
          <p className="text-xs text-slate-400">{[addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}</p>
        </DBlock>
      )}
      {b.status === "cancelled" && (
        <DBlock icon={AlertTriangle} title="Cancellation & Refund">
          <DRow k="Status" v="Cancelled" />
          {(() => {
            // Same centralized source as the booking/invoice — bd.refund is derived
            // from the ORIGINAL breakdown, so Original − Refund == Retained exactly.
            const rf = bd?.refund || null;
            const c = b.cancellation || {};
            const orderValue = rf?.original_amount != null ? Number(rf.original_amount)
              : (c.original_amount != null ? Number(c.original_amount) : Number(bd?.total ?? p.total ?? 0));
            const refundAmt = rf?.refund_amount != null ? Number(rf.refund_amount)
              : (c.refund != null ? Number(c.refund) : null);
            const refundPct = rf?.refund_pct != null ? Number(rf.refund_pct)
              : (c.refund_pct != null ? Number(c.refund_pct) : null);
            if (refundAmt == null) {
              return b.payment_status === "refunded"
                ? <DRow k="Refund" v={`${fmt(orderValue)} · Processing`} /> : null;
            }
            const retained = rf?.retained != null ? Number(rf.retained) : Math.max(0, orderValue - refundAmt);
            return (
              <>
                <DRow k="Original Booking Amount" v={fmt(orderValue)} />
                <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                  <DRow k={`Customer Refund${refundPct != null ? ` (${refundPct}%)` : ""}`}
                    v={`${fmt(refundAmt)}${b.payment_status === "refunded" ? " · Processing" : ""}`} strong />
                </div>
                {retained > 0 && <DRow k="Amount Retained" v={fmt(retained)} />}
              </>
            );
          })()}
        </DBlock>
      )}
    </DrawerShell>
  );
}

function InvoiceDrawer({ b, open, onClose }) {
  const p = b.pricing || {};
  const { branding } = useSiteConfig();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const backend = process.env.REACT_APP_BACKEND_URL || "";
  const rawLogo = branding?.email_logo || branding?.logo_light || branding?.logo_dark || "";
  const logoUrl = rawLogo ? (/^https?:|^data:/.test(rawLogo) ? rawLogo : `${backend}${rawLogo}`) : "";
  const brandName = branding?.brand_name || branding?.name || "AzoApp";
  // Centralized invoice breakdown — renders the backend `breakdown` (single source
  // of truth) so the invoice preview NEVER differs from booking/checkout and no fee
  // is ever folded into the Service Amount.
  const bd = b.breakdown || null;
  const visiting = Number(p.visiting_charge || 0);
  const lines = bd
    ? [
        ["Service Amount", Number(bd.services_subtotal || 0), false],
        ...(bd.additional_charges || []).map((c) => [c.label, Number(c.amount || 0), false]),
        Number(bd.discount || 0) > 0 ? [`Coupon Discount${bd.coupon_code ? ` (${bd.coupon_code})` : ""}`, -Number(bd.discount), false] : null,
        Number(bd.tax || 0) > 0 ? ["Est. Govt. Taxes", Number(bd.tax), false] : null,
      ].filter(Boolean)
    : [
        ["Service Amount", Math.max(Number(p.subtotal ?? p.base ?? 0) - visiting - Number(p.emergency_fee || 0) - Number(p.surge || 0), 0), false],
        Number(p.emergency_fee || 0) > 0 ? ["Emergency Fee", Number(p.emergency_fee), false] : null,
        visiting > 0 ? ["Visiting Charge", visiting, false] : null,
        Number(p.platform_fee || 0) > 0 ? ["Platform Fee", Number(p.platform_fee), false] : null,
        Number(p.convenience_fee || 0) > 0 ? ["Convenience Fee", Number(p.convenience_fee), false] : null,
        Number(p.discount || 0) > 0 ? ["Discount", -Number(p.discount), false] : null,
        Number(p.gst || 0) > 0 ? ["Est. Govt. Taxes", Number(p.gst), false] : null,
      ].filter(Boolean);

  // Load a raster logo → dataURL for jsPDF (handles PNG/JPG/webp; SVG falls back to text).
  const loadLogoDataUrl = () => new Promise((resolve) => {
    if (!logoUrl || /\.svg($|\?)/i.test(logoUrl)) return resolve(null);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth || 160; c.height = img.naturalHeight || 60;
          c.getContext("2d").drawImage(img, 0, 0);
          resolve({ data: c.toDataURL("image/png"), w: c.width, h: c.height });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    } catch { resolve(null); }
  });

  const downloadInvoice = async () => {
    setBusy(true);
    try {
      // 1) Preferred: the CENTRAL server-rendered PDF (single source of truth —
      //    real branding logo, Tax/Visiting Charge/Platform Fee labels).
      try {
        const { data: list } = await api.get("/invoices", { params: { booking_id: b.id, page_size: 1 } });
        const inv = (list?.items || list || [])[0];
        if (inv?.id) {
          const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
          const href = URL.createObjectURL(r.data);
          const a = document.createElement("a"); a.href = href;
          a.download = `${inv.number || `AzoApp-${b.code}`}.pdf`;
          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
          toast.success("Invoice downloaded"); setBusy(false); return;
        }
      } catch { /* fall through to client render */ }

      // 2) Fallback: client PDF with the SAME labels + branding logo.
      const doc = await buildClientPdf();
      doc.save(`AzoApp-Invoice-${b.code}.pdf`);
      toast.success("Invoice downloaded");
    } catch (e) { toast.error("Could not generate PDF"); }
    finally { setBusy(false); }
  };

  // Build the client-side invoice PDF (jsPDF). Returns the jsPDF doc so it can be
  // either saved (download) or turned into a File/blob (WhatsApp share).
  const buildClientPdf = async () => {
      const logo = await loadLogoDataUrl();
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const M = 40;
      doc.setFillColor(13, 71, 161);
      doc.rect(0, 0, W, 90, "F");
      if (logo) {
        const h = 44; const w = Math.min(180, (logo.w / logo.h) * h);
        try { doc.addImage(logo.data, "PNG", M, 24, w, h); } catch { /* ignore */ }
      } else {
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.text(brandName, M, 50);
      }
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("Tax Invoice", M, 78);
      doc.setFontSize(11); doc.text(`Invoice #${b.code}`, W - M, 45, { align: "right" });
      doc.text(new Date(b.created_at).toLocaleDateString("en-IN"), W - M, 62, { align: "right" });
      doc.setTextColor(30, 41, 59); doc.setFontSize(11); let y = 130;
      const meta = [["Service", b.service_name || "-"], ["Category", b.category_name || "-"],
        ["Partner", b.partner_name || "-"], ["Status", (b.status || "").toUpperCase()]];
      meta.forEach(([k, v]) => { doc.setTextColor(100, 116, 139); doc.text(k, M, y); doc.setTextColor(15, 23, 42); doc.text(String(v), M + 120, y); y += 22; });
      y += 12; doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 24;
      const row = (k, v, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setTextColor(bold ? 13 : 71, bold ? 71 : 85, bold ? 161 : 105); doc.text(k, M, y); doc.text(v, W - M, y, { align: "right" }); y += 22; };
      lines.forEach(([k, v]) => row(k, `${v < 0 ? "- " : ""}INR ${Math.abs(v).toFixed(2)}`));
      y += 6; doc.line(M, y, W - M, y); y += 26;
      row("Grand Total", `INR ${Number(p.total ?? 0).toFixed(2)}`, true);
      y += 10; doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.setFontSize(10);
      doc.text(`Payment: ${(b.payment_method || "UPI / Wallet")} · ${(b.payment_status || "pending").toUpperCase()}`, M, y);
      y += 30; doc.text(`Thank you for choosing ${brandName}!`, M, y);
      return doc;
  };

  // One-tap WhatsApp share of the invoice PDF (prefers the server-rendered PDF,
  // else the client-built one). On mobile the real PDF is attached via the share
  // sheet; on desktop it downloads + opens WhatsApp Web.
  const shareOnWhatsApp = async () => {
    setSharing(true);
    const t = toast.loading("Preparing invoice\u2026");
    try {
      const { data: list } = await api.get("/invoices", { params: { booking_id: b.id, page_size: 1 } });
      const inv = (list?.items || list || [])[0];
      if (inv?.id) { toast.dismiss(t); await shareInvoicePdf(inv, "whatsapp"); return; }
      const doc = await buildClientPdf();
      const blob = doc.output("blob");
      const file = new File([blob], `AzoApp-Invoice-${b.code}.pdf`, { type: "application/pdf" });
      const text = `Invoice ${b.code} \u00b7 INR ${Number(p.total ?? 0).toFixed(2)} \u2014 ${brandName}`;
      await shareFilePdf(file, { title: `Invoice ${b.code}`, text, channel: "whatsapp", toastId: t });
    } catch { toast.error("Could not share invoice", { id: t }); }
    finally { setSharing(false); }
  };
  return (
    <DrawerShell open={open} onClose={onClose} title="Invoice"
      footer={<div className="flex gap-2">
        <Button variant="outline" onClick={shareOnWhatsApp} disabled={sharing || busy} data-testid={`invoice-whatsapp-${b.code}`} className="h-11 flex-1 rounded-xl border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"><MessageCircle className="h-4 w-4 mr-1.5" /> {sharing ? "Preparing…" : "WhatsApp"}</Button>
        <Button onClick={downloadInvoice} disabled={busy || sharing} className="h-11 flex-1 bg-primary-700 hover:bg-primary-800 rounded-xl"><Download className="h-4 w-4 mr-1.5" /> {busy ? "Preparing…" : "Download"}</Button>
      </div>}>
      <div className="text-center pb-3 border-b border-slate-100 dark:border-slate-800">
        {logoUrl
          ? <img src={logoUrl} alt={brandName} className="h-10 mx-auto object-contain" data-testid="invoice-logo" />
          : <p className="font-heading font-black text-xl" style={{ color: "#0D47A1" }}>{brandName}</p>}
        <p className="text-xs text-slate-400 mt-1">Tax Invoice · #{b.code}</p>
      </div>
      <div className="space-y-2">
        <DRow k="Service" v={b.service_name} strong />
        <DRow k="Partner" v={b.partner_name || "—"} />
        <DRow k="Date" v={fmtTs(b.created_at)} />
      </div>
      <ServiceBreakdown booking={b} fmt={fmt} showCharges title="Services" compact />
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">
        {Number(bd?.discount ?? p.discount ?? 0) > 0 && (
          <DRow k={`Coupon Discount${bd?.coupon_code ? ` (${bd.coupon_code})` : ""}`} v={`- ${fmt(bd?.discount ?? p.discount)}`} />
        )}
        {Number(bd?.tax ?? p.gst ?? 0) > 0 && <DRow k="Est. Govt. Taxes" v={fmt(bd?.tax ?? p.gst)} />}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2"><DRow k="Grand Total" v={fmt(bd?.total ?? p.total)} strong /></div>
        <DRow k="Paid Amount" v={fmt((b.payment_status === "paid" || b.payment_status === "completed" || b.payment_status === "refunded") ? (bd?.total ?? p.total) : 0)} />
        {bd?.refund ? (
          <div className="mt-2 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-900/10 p-3 space-y-2" data-testid="invoice-cancel-card">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Cancellation &amp; Refund</p>
            <DRow k="Original Booking Amount" v={fmt(bd.refund.original_amount ?? bd?.total ?? p.total)} strong />
            <DRow k={`Customer Refund${bd.refund.refund_pct != null ? ` (${bd.refund.refund_pct}%)` : ""}`} v={`- ${fmt(bd.refund.refund_amount)}`} />
            <div className="border-t border-rose-200/70 dark:border-rose-900/40 pt-2"><DRow k="Amount Retained" v={fmt(bd.refund.retained)} strong /></div>
          </div>
        ) : null}
      </div>
      {Number(bd?.discount ?? p.discount ?? 0) > 0 && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5" data-testid="invoice-coupon-note">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Coupon{bd?.coupon_code ? ` ${bd.coupon_code}` : ""}</span>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">{fmt(bd?.discount ?? p.discount)} off</span>
          </div>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1">This coupon discount is funded by AzoApp — your savings, on us.</p>
        </div>
      )}
      <div className="space-y-2">
        <DRow k="Payment method" v={(b.payment_method || "UPI / Wallet").toUpperCase?.() || "UPI"} />
        <DRow k="Payment status" v={(b.payment_status || "pending").toUpperCase()} />
      </div>
    </DrawerShell>
  );
}

/* ============ Reschedule REQUEST drawer (mutual approval) ============ */
function RescheduleDrawer({ b, open, onClose, onDone }) {
  const [val, setVal] = useState(b?.scheduled_at || null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setVal(b?.scheduled_at || null); }, [open, b?.scheduled_at]);
  const save = async () => {
    if (!val) return toast.error("Pick a new date & time slot");
    setBusy(true);
    try {
      await api.post(`/bookings/${b.id}/reschedule/request`, { scheduled_at: val });
      toast.success("Reschedule request sent to your partner");
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send request"); }
    setBusy(false);
  };
  return (
    <DrawerShell open={open} onClose={onClose} title="Request reschedule"
      footer={<Button data-testid={`reschedule-confirm-${b.code}`} onClick={save} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800 rounded-xl">{busy ? "Sending…" : "Send reschedule request"}</Button>}>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center gap-3">
        <span className="h-10 w-10 rounded-xl grid place-items-center text-white shrink-0" style={{ background: "#0D47A1" }}><Wrench className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white truncate">{b.service_name}</p>
          <p className="text-xs text-slate-400">#{b.code}{b.scheduled_at ? ` · currently ${fmtTs(b.scheduled_at)}` : ""}</p>
        </div>
      </div>
      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Pick a new time slot below. Your booking stays on its current time until your <b>partner accepts</b> the change.</p>
      <SchedulePicker value={val} onChange={setVal} />
    </DrawerShell>
  );
}

/* ====================================================== PROFILE ========= */
const LANGS = [["en", "English"], ["hi", "हिन्दी"], ["bn", "বাংলা"], ["ta", "தமிழ்"], ["te", "తెలుగు"], ["mr", "मराठी"]];
const COMM = [["all", "All (SMS, WhatsApp, Email)"], ["sms", "SMS only"], ["whatsapp", "WhatsApp only"], ["email", "Email only"], ["none", "Do not contact"]];
const PField = ({ label, children }) => (<div><label className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label><div className="mt-1">{children}</div></div>);

const ProfileEditor = ({ user, fields, onSaved }) => {
  const [f, setF] = useState({
    name: user?.name || "", email: user?.email || "", gender: user?.gender || "", dob: user?.dob || "",
    alternate_mobile: user?.alternate_mobile || "", language: user?.language || "en", communication_pref: user?.communication_pref || "all",
    gst_number: user?.gst_number || "", company_name: user?.company_name || "", photo: user?.photo || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const filled = Object.values({ name: f.name, email: f.email, gender: f.gender, dob: f.dob, photo: f.photo }).filter(Boolean).length;
  const completion = Math.round((filled / 5) * 100);
  const save = async () => { setBusy(true); try { await api.put("/auth/profile", f); toast.success("Profile updated"); onSaved?.(); } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); } setBusy(false); };
  return (
    <div data-testid="profile-editor" className="space-y-5">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 azo-elev">
        <div className="flex items-center gap-4 mb-6">
          <ProfilePhotoPicker value={f.photo} onChange={(d) => set("photo", d)} size={80} testId="profile-photo" />
          <div className="flex-1">
            <p className="font-heading font-bold text-lg text-slate-900 dark:text-white">{f.name || "Your name"}</p>
            <p className="text-sm text-slate-400">{user?.phone}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-32 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-primary-600" style={{ width: `${completion}%` }} /></div>
              <span className="text-xs font-semibold text-slate-500">{completion}% complete</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PField label="Full Name"><Input data-testid="pf-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></PField>
          {fields.email && <PField label="Email"><Input data-testid="pf-email" value={f.email} onChange={(e) => set("email", e.target.value)} /></PField>}
          {fields.gender && <PField label="Gender"><PremiumSelect data-testid="pf-gender" value={f.gender} onChange={(e) => set("gender", e.target.value)} className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></PremiumSelect></PField>}
          {fields.dob && <PField label="Date of Birth"><DatePicker testId="pf-dob" value={f.dob} onChange={(v) => set("dob", v)} placeholder="Select date of birth" fromYear={1940} toYear={new Date().getFullYear()} maxDate={new Date()} /></PField>}
          {fields.alternate_mobile && <PField label="Alternate Mobile"><Input data-testid="pf-altmobile" inputMode="numeric" maxLength={10} value={f.alternate_mobile} onChange={(e) => set("alternate_mobile", onlyDigits(e.target.value, 10))} /></PField>}
          {fields.language && <PField label="Language"><PremiumSelect data-testid="pf-language" value={f.language} onChange={(e) => set("language", e.target.value)} className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</PremiumSelect></PField>}
          {fields.communication_pref && <PField label="Communication Preference"><PremiumSelect data-testid="pf-comm" value={f.communication_pref} onChange={(e) => set("communication_pref", e.target.value)} className="w-full h-10 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">{COMM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</PremiumSelect></PField>}
          {fields.gst && <PField label="GST Number (B2B)"><Input data-testid="pf-gst" value={f.gst_number} onChange={(e) => set("gst_number", e.target.value)} /></PField>}
          {fields.company && <PField label="Company Name (B2B)"><Input data-testid="pf-company" value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></PField>}
        </div>
        <Button data-testid="save-profile" onClick={save} disabled={busy} className="mt-6 bg-primary-700 hover:bg-primary-800 rounded-xl">{busy ? "Saving…" : "Save Profile"}</Button>
      </div>
      <DeleteAccount />
    </div>
  );
};

const DeleteAccount = () => {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const del = async () => { setBusy(true); try { const { data } = await api.post("/auth/delete-account", { reason: "User requested" }); toast.success(data.message || "Request submitted"); if (data.status === "deleted") logout(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } setBusy(false); };
  return (
    <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900 p-6" data-testid="danger-zone">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-rose-500 mt-0.5" />
        <div className="flex-1"><p className="font-heading font-bold text-slate-900 dark:text-white">Delete Account</p><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">This removes your account and data. An admin may need to approve the request.</p></div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button data-testid="delete-account-btn" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50">Delete</Button></AlertDialogTrigger>
          <AlertDialogContent data-testid="delete-account-dialog">
            <AlertDialogHeader><AlertDialogTitle>Delete your account?</AlertDialogTitle><AlertDialogDescription>This requests permanent deletion. It cannot be undone once approved.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel data-testid="delete-cancel">Cancel</AlertDialogCancel><AlertDialogAction data-testid="delete-confirm" disabled={busy} onClick={del} className="bg-rose-600 hover:bg-rose-700">Yes, delete</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

/* ====================================================== ADDRESSES ======= */
const AddressBook = ({ cfg, onSaved }) => {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyAddress());
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/auth/addresses").then((r) => setList(r.data || [])), []);
  useEffect(() => { load(); }, [load]);
  const openAdd = () => { setEditing(null); setForm(emptyAddress()); setOpen(true); };
  const openEdit = (a) => { setEditing(a.id); setForm({ ...emptyAddress(), ...a }); setOpen(true); };
  const save = async () => {
    if (!form.line || !form.pincode) return toast.error("Please enter address & pincode");
    if (cfg.mandatory_landmark && cfg.landmark_instructions && !form.landmark) return toast.error("Landmark is required");
    setBusy(true);
    try { if (editing) await api.put(`/auth/address/${editing}`, form); else await api.post("/auth/address", form); toast.success("Address saved"); setOpen(false); await load(); onSaved?.(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };
  const del = async (id) => { await api.delete(`/auth/address/${id}`); toast.success("Address removed"); await load(); onSaved?.(); };
  const setDefault = async (id) => { await api.post(`/auth/address/${id}/default`); await load(); onSaved?.(); };
  return (
    <div data-testid="address-book">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{list.length} saved location{list.length !== 1 ? "s" : ""}</p>
        <Button data-testid="add-address-btn" onClick={openAdd} className="bg-primary-700 hover:bg-primary-800 rounded-xl"><Plus className="h-4 w-4 mr-1" /> Add Address</Button>
      </div>
      {list.length === 0 && <EmptyState icon={MapPin} title="No saved addresses" desc="Save your home or office address for faster booking." actionLabel="Add Address" onAction={openAdd} testId="address-empty" />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 azo-stagger">
        {list.map((a) => (
          <div key={a.id} data-testid={`address-card-${a.id}`} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 azo-elev azo-hover-lift">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">{a.label}{a.is_default && <Badge className="bg-primary-50 text-primary-700 border-0 text-[10px]">Default</Badge>}</span>
              <div className="flex gap-1">
                <button data-testid={`edit-address-${a.id}`} onClick={() => openEdit(a)} className="text-slate-400 hover:text-primary-700"><Pencil className="h-4 w-4" /></button>
                <button data-testid={`delete-address-${a.id}`} onClick={() => del(a.id)} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{a.line}</p>
            <p className="text-xs text-slate-400 mt-0.5">{[a.city, a.pincode].filter(Boolean).join(" · ")}{a.property_type ? ` · ${a.property_type}` : ""}</p>
            {a.landmark && <p className="text-xs text-slate-400">Landmark: {a.landmark}</p>}
            {!a.is_default && <button data-testid={`set-default-${a.id}`} onClick={() => setDefault(a.id)} className="text-xs text-primary-700 dark:text-primary-300 mt-2 flex items-center gap-1"><StarIcon className="h-3 w-3" /> Set as default</button>}
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="address-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit Address" : "Add Address"}</DialogTitle><DialogDescription>Fill in your service location details.</DialogDescription></DialogHeader>
          <AddressForm value={form} onChange={setForm} cfg={cfg} />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mt-2"><input type="checkbox" data-testid="addr-set-default" checked={!!form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Set as default address</label>
          <Button data-testid="save-address-btn" onClick={save} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800 mt-2 rounded-xl">{busy ? "Saving…" : "Save Address"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};
