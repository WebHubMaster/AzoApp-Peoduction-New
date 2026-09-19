import React from "react";
import { Plus, Wallet, Package, MapPin, LifeBuoy, Gift, ChevronRight, Star, Sparkles, Navigation, Radar, CheckCircle2, Search, Zap, RotateCcw, Wrench, ShieldCheck, Bell } from "lucide-react";
import { fmt, fmtC } from "@/lib/api";
import SearchingStatus from "@/components/customer/SearchingStatus";

const ACTIVE = ["searching", "assigned", "arrived_shop", "arrived_customer", "started", "pending"];
export const STATUS_TXT = {
  searching: "Finding your partner", pending: "Awaiting confirmation", assigned: "Partner assigned",
  arrived_shop: "Partner at shop", arrived_customer: "Partner has arrived", started: "Work in progress",
  completed: "Completed", paid: "Paid", cancelled: "Cancelled", refunded: "Refunded",
};
export const PILL = {
  searching: "bg-amber-50 text-amber-700 border-amber-200/70", pending: "bg-slate-50 text-slate-600 border-slate-200",
  assigned: "bg-sky-50 text-sky-700 border-sky-200/70", arrived_shop: "bg-blue-50 text-blue-700 border-blue-200/70",
  arrived_customer: "bg-emerald-50 text-emerald-700 border-emerald-200/70", started: "bg-indigo-50 text-indigo-700 border-indigo-200/70",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200/70", paid: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200/70", refunded: "bg-slate-50 text-slate-600 border-slate-200",
};
const TILE = {
  searching: "bg-amber-100 text-amber-700", pending: "bg-slate-100 text-slate-500", assigned: "bg-sky-100 text-sky-700",
  arrived_shop: "bg-blue-100 text-blue-700", arrived_customer: "bg-emerald-100 text-emerald-700", started: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700", paid: "bg-emerald-100 text-emerald-700", cancelled: "bg-rose-100 text-rose-600", refunded: "bg-slate-100 text-slate-500",
};
const when = (iso) => { try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const initials = (n = "") => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "P";

const Card = ({ children, className = "", ...rest }) => (
  <section className={`rounded-[22px] bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.03),0_10px_30px_-18px_rgba(15,23,42,0.25)] ${className}`} {...rest}>{children}</section>
);

const SectionTitle = ({ children, action, onAction, testid }) => (
  <div className="flex items-end justify-between px-1 mb-2.5">
    <h2 className="font-heading font-bold text-[17px] tracking-tight text-slate-900 dark:text-white">{children}</h2>
    {action && <button type="button" data-testid={testid} onClick={onAction} className="text-[13px] font-semibold text-primary-700 inline-flex items-center active:opacity-60">{action}<ChevronRight className="h-4 w-4" /></button>}
  </div>
);

const Row = ({ icon, title, sub, right, onClick, testid }) => (
  <button type="button" data-testid={testid} onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-slate-50 transition-colors">
    {icon}
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-[15px] text-slate-900 dark:text-white truncate leading-tight">{title}</p>
      <p className="text-[12px] text-slate-500 truncate mt-0.5">{sub}</p>
    </div>
    <div className="shrink-0 flex items-center gap-1.5">{right}</div>
  </button>
);

export default function CustomerHome({ user, bookings, wallet, loading, onNavigate, onBook, onOpenBooking, onRefreshBookings, onRepeat }) {
  const first = (user?.name || "there").split(" ")[0];
  const active = bookings.filter((b) => ACTIVE.includes(b.status));
  const spotlight = [...active].sort((a, b) => (ACTIVE.indexOf(a.status) - ACTIVE.indexOf(b.status)) || (new Date(b.created_at) - new Date(a.created_at)))[0];
  const completedList = bookings.filter((b) => ["completed", "paid"].includes(b.status));
  const again = Object.values(completedList.reduce((m, b) => { if (!m[b.service_name]) m[b.service_name] = b; return m; }, {})).slice(0, 6);
  const recent = bookings.slice(0, 4);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const home = (user?.addresses || [])[0];
  const city = home?.city || home?.label || "Set your address";

  return (
    <div className="space-y-6 lg:space-y-7" data-testid="customer-home">
      {/* Hero */}
      <section data-testid="home-hero" className="relative overflow-hidden rounded-[26px] bg-primary-800 text-white p-5 sm:p-7 shadow-[0_24px_50px_-24px_rgba(29,78,216,0.65)]">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(56,189,248,0.55),transparent_55%),radial-gradient(90%_80%_at_0%_100%,rgba(30,64,175,0.9),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <button type="button" data-testid="home-location" onClick={() => onNavigate("addresses")} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 backdrop-blur px-3 py-1.5 text-[12px] font-semibold text-white/90 active:scale-95 transition-transform">
              <MapPin className="h-3.5 w-3.5" /> {city} <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            </button>
            <span className="h-10 w-10 rounded-full bg-white/15 backdrop-blur grid place-items-center font-heading font-extrabold text-sm ring-1 ring-white/25">{initials(user?.name)}</span>
          </div>
          <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-white/60">{greet}</p>
          <h1 className="font-heading font-extrabold text-[28px] sm:text-4xl leading-[1.05] tracking-tight mt-1">Hi {first}, what needs<br className="sm:hidden" /> fixing today?</h1>
          <button type="button" data-testid="home-book-now" onClick={onBook}
            className="mt-5 w-full flex items-center gap-3 rounded-2xl bg-white text-slate-900 dark:text-white pl-4 pr-2 py-2 shadow-lg shadow-primary-900/30 active:scale-[0.98] transition-transform text-left">
            <Search className="h-5 w-5 text-slate-400 shrink-0" />
            <span className="flex-1 text-[14px] text-slate-500 truncate">Search AC repair, plumbing, cleaning…</span>
            <span className="h-10 px-4 rounded-xl bg-primary-700 text-white text-[13px] font-bold inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Book</span>
          </button>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" data-testid="home-wallet-chip" onClick={() => onNavigate("wallet")} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 backdrop-blur px-3 py-1.5 text-[12px] font-semibold active:scale-95 transition-transform">
              <Wallet className="h-3.5 w-3.5 text-amber-300" /> Wallet {fmtC(wallet?.balance || 0)}
            </button>
            <button type="button" data-testid="home-emergency" onClick={onBook} className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 px-3 py-1.5 text-[12px] font-semibold active:scale-95 transition-transform">
              <Zap className="h-3.5 w-3.5" /> Emergency
            </button>
          </div>
        </div>
      </section>

      {/* Live spotlight */}
      {spotlight && (
        <div>
          <SectionTitle action={`All ${active.length} active`} onAction={() => onNavigate("orders", "active")} testid="home-active-viewall">
            <span className="inline-flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span> Happening now</span>
          </SectionTitle>
          <Card data-testid="home-active-booking" className="overflow-hidden">
            <button type="button" onClick={() => onOpenBooking(spotlight)} className="w-full text-left p-4 active:bg-slate-50/70 transition-colors" data-testid="home-active-open">
              <div className="flex items-start gap-3.5">
                <span className={`h-12 w-12 rounded-2xl grid place-items-center shrink-0 ${TILE[spotlight.status] || "bg-slate-100 text-slate-500"}`}>
                  {spotlight.status === "searching" ? <Radar className="h-6 w-6" /> : spotlight.status === "started" ? <Wrench className="h-6 w-6" /> : <Navigation className="h-6 w-6" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-heading font-bold text-[16px] text-slate-900 dark:text-white truncate leading-tight">{spotlight.service_name}</p>
                    <p className="font-heading font-extrabold text-[15px] text-slate-900 dark:text-white shrink-0">{fmt(spotlight.pricing?.total || 0)}</p>
                  </div>
                  <p className="text-[12px] text-slate-500 truncate mt-0.5">#{spotlight.code} · {spotlight.category_name}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border ${PILL[spotlight.status] || PILL.pending}`}>{STATUS_TXT[spotlight.status] || spotlight.status}</span>
                    {spotlight.partner_name && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
                        <span className="h-5 w-5 rounded-full bg-primary-100 text-primary-700 text-[9px] font-bold grid place-items-center">{initials(spotlight.partner_name)}</span>
                        {spotlight.partner_name}{spotlight.partner_rating ? <span className="inline-flex items-center text-amber-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{spotlight.partner_rating}</span> : null}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
            {spotlight.status === "searching" && <div className="px-4 pb-4 -mt-1"><SearchingStatus booking={spotlight} onAssigned={onRefreshBookings} /></div>}
            {spotlight.otps?.start && ["assigned", "arrived_shop", "arrived_customer"].includes(spotlight.status) && (
              <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl bg-slate-900 text-white px-4 py-3" data-testid="home-start-otp">
                <div><p className="text-[10px] uppercase tracking-widest text-white/50">Start OTP</p><p className="text-[12px] text-white/80 mt-0.5">Share with your partner to begin</p></div>
                <p className="font-heading font-black text-2xl tracking-[0.3em] tabular-nums">{spotlight.otps.start}</p>
              </div>
            )}
            {spotlight.otps?.completion && spotlight.status === "started" && (
              <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl bg-emerald-600 text-white px-4 py-3" data-testid="home-complete-otp">
                <div><p className="text-[10px] uppercase tracking-widest text-white/60">Completion OTP</p><p className="text-[12px] text-white/85 mt-0.5">Share only when the work is done</p></div>
                <p className="font-heading font-black text-2xl tracking-[0.3em] tabular-nums">{spotlight.otps.completion}</p>
              </div>
            )}
            <div className="border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800">
              <button type="button" data-testid="home-active-track" onClick={() => onOpenBooking(spotlight)} className="py-3 text-[13px] font-semibold text-primary-700 inline-flex items-center justify-center gap-1.5 active:bg-slate-50"><Navigation className="h-4 w-4" /> Track</button>
              <button type="button" data-testid="home-active-help" onClick={() => onNavigate("support")} className="py-3 text-[13px] font-semibold text-slate-600 inline-flex items-center justify-center gap-1.5 active:bg-slate-50"><LifeBuoy className="h-4 w-4" /> Need help</button>
            </div>
          </Card>
        </div>
      )}

      {/* Quick actions */}
      <Card data-testid="home-quick-actions" className="p-2 lg:max-w-2xl">
        <div className="grid grid-cols-4">
          {[
            { k: "orders", l: "Bookings", I: Package, c: "bg-primary-50 text-primary-700", t: "qa-bookings", badge: active.length },
            { k: "wallet", l: "Wallet", I: Wallet, c: "bg-amber-50 text-amber-700", t: "qa-wallet" },
            { k: "addresses", l: "Addresses", I: MapPin, c: "bg-sky-50 text-sky-700", t: "qa-addresses" },
            { k: "support", l: "Help", I: LifeBuoy, c: "bg-rose-50 text-rose-700", t: "qa-support" },
          ].map((a) => (
            <button key={a.k} type="button" data-testid={a.t} onClick={() => onNavigate(a.k)} className="relative flex flex-col items-center gap-2 py-3 rounded-2xl active:bg-slate-50 active:scale-95 transition-all">
              <span className={`h-12 w-12 rounded-2xl grid place-items-center ${a.c}`}><a.I className="h-[22px] w-[22px]" strokeWidth={1.8} /></span>
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{a.l}</span>
              {a.badge > 0 && <span className="absolute top-2 right-[calc(50%-30px)] h-[18px] min-w-[18px] px-1 rounded-full bg-primary-700 text-white text-[10px] font-bold grid place-items-center ring-2 ring-white">{a.badge}</span>}
            </button>
          ))}
        </div>
      </Card>

      {/* Book again */}
      {again.length > 0 && (
        <div>
          <SectionTitle action="History" onAction={() => onNavigate("orders", "completed")} testid="home-again-viewall">Book again</SectionTitle>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 [scrollbar-width:none]" data-testid="home-book-again">
            {again.map((b) => (
              <button key={b.id} type="button" data-testid={`home-again-${b.code}`} onClick={() => onRepeat?.(b)}
                className="shrink-0 w-[168px] rounded-[20px] bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-3.5 text-left shadow-[0_10px_30px_-18px_rgba(15,23,42,0.25)] active:scale-[0.97] transition-transform">
                <span className="h-10 w-10 rounded-xl bg-primary-50 text-primary-700 grid place-items-center"><RotateCcw className="h-5 w-5" /></span>
                <p className="mt-3 font-semibold text-[14px] text-slate-900 dark:text-white leading-tight line-clamp-2">{b.service_name}</p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">{b.category_name}</p>
                <p className="mt-2 font-heading font-extrabold text-[14px] text-slate-900 dark:text-white">{fmt(b.pricing?.total || 0)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Activity */}
      <Card data-testid="home-stats" className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
        {[
          { l: "Bookings", v: bookings.length, I: Package, c: "text-primary-700" },
          { l: "Completed", v: completedList.length, I: CheckCircle2, c: "text-emerald-600" },
          { l: "Wallet", v: fmtC(wallet?.balance || 0), I: Wallet, c: "text-amber-600" },
        ].map((s) => (
          <div key={s.l} className="px-4 py-3.5 text-center">
            <p className="font-heading font-extrabold text-[20px] text-slate-900 dark:text-white leading-none truncate tabular-nums">{s.v}</p>
            <p className="text-[11px] font-medium text-slate-500 mt-1.5 inline-flex items-center gap-1"><s.I className={`h-3 w-3 ${s.c}`} /> {s.l}</p>
          </div>
        ))}
      </Card>

      {/* Refer */}
      <button type="button" data-testid="home-refer" onClick={() => onNavigate("referral")}
        className="relative w-full overflow-hidden rounded-[22px] bg-slate-900 text-white p-4 text-left active:scale-[0.985] transition-transform">
        <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-amber-400/30 blur-2xl" />
        <div className="relative flex items-center gap-3.5">
          <span className="h-12 w-12 rounded-2xl bg-amber-400 text-slate-900 dark:text-white grid place-items-center shrink-0"><Gift className="h-6 w-6" /></span>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-[15px]">Refer a friend, earn wallet cash</p>
            <p className="text-[12px] text-white/65 mt-0.5">You both get rewarded on their first booking</p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/60 shrink-0" />
        </div>
      </button>

      {/* Recent */}
      <div data-testid="home-recent">
        <SectionTitle action={bookings.length > 0 ? "See all" : undefined} onAction={() => onNavigate("orders")} testid="home-recent-viewall">Recent bookings</SectionTitle>
        {loading && bookings.length === 0 && <Card className="p-4 text-[13px] text-slate-400">Loading…</Card>}
        {!loading && bookings.length === 0 && (
          <Card className="p-6 text-center border-dashed">
            <Sparkles className="h-8 w-8 text-primary-500 mx-auto" />
            <p className="font-semibold text-slate-800 dark:text-slate-100 mt-2">No bookings yet</p>
            <p className="text-[12px] text-slate-500">Book your first home service in under a minute.</p>
            <button type="button" onClick={onBook} className="mt-3 h-10 px-4 rounded-xl bg-primary-700 text-white text-sm font-semibold active:scale-95">Book now</button>
          </Card>
        )}
        {recent.length > 0 && (
          <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {recent.map((b) => (
              <Row key={b.id} testid={`home-recent-${b.code}`} onClick={() => onOpenBooking(b)}
                icon={<span className={`h-11 w-11 rounded-2xl grid place-items-center shrink-0 ${TILE[b.status] || "bg-slate-100 text-slate-500"}`}>{["completed", "paid"].includes(b.status) ? <CheckCircle2 className="h-5 w-5" /> : b.status === "cancelled" ? <Package className="h-5 w-5" /> : <Navigation className="h-5 w-5" />}</span>}
                title={b.service_name} sub={`${STATUS_TXT[b.status] || b.status} · ${when(b.created_at)}`}
                right={<><div className="text-right"><p className="font-heading font-bold text-[14px] text-slate-900 dark:text-white">{fmt(b.pricing?.total || 0)}</p>{b.review && <p className="text-[11px] text-amber-600 inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{b.review.rating}.0</p>}</div><ChevronRight className="h-4 w-4 text-slate-300" /></>} />
            ))}
          </Card>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400 inline-flex items-center justify-center gap-1 w-full pb-2"><ShieldCheck className="h-3.5 w-3.5" /> Verified professionals · Secure payments · <Bell className="h-3.5 w-3.5" /> Live updates</p>
    </div>
  );
}
