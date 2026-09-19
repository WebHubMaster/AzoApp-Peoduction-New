import React from "react";
import { Store, Copy, UserPlus, QrCode, ClipboardPlus, Bell, AlertTriangle, Network, TrendingUp, Wallet, Users, ChevronRight, ShieldCheck, FileText, BarChart3, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fmt, fmtC } from "@/lib/api";

const Card = ({ children, className = "", ...rest }) => (
  <section className={`rounded-[22px] bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.03),0_10px_30px_-18px_rgba(15,23,42,0.25)] ${className}`} {...rest}>{children}</section>
);
const SectionTitle = ({ children, action, onAction, testid }) => (
  <div className="flex items-end justify-between px-1 mb-2.5">
    <h2 className="font-heading font-bold text-[17px] tracking-tight text-slate-900 dark:text-white">{children}</h2>
    {action && <button type="button" data-testid={testid} onClick={onAction} className="text-[13px] font-semibold text-primary-700 inline-flex items-center active:opacity-60">{action}<ChevronRight className="h-4 w-4" /></button>}
  </div>
);
const initials = (n = "") => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "M";

/** Merchant Home — native-app style overview (mobile-first, degrades to desktop). */
export default function MerchantHome({ user, dash, code, refs = [], kycPending, onNavigate, onAddPartner }) {
  const shop = user?.shop_name || user?.name || "My Shop";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const copy = () => { try { navigator.clipboard?.writeText(code || "")?.catch?.(() => {}); } catch {} toast.success("Merchant code copied"); };
  const topRefs = [...refs].sort((a, b) => (b.total_commission || 0) - (a.total_commission || 0)).slice(0, 3);

  return (
    <div className="space-y-6" data-testid="merchant-home">
      {/* Hero */}
      <section data-testid="mh-hero" className="relative overflow-hidden rounded-[26px] bg-slate-900 text-white p-5 sm:p-7 shadow-[0_24px_50px_-24px_rgba(15,23,42,0.8)]">
        <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_100%_0%,rgba(29,78,216,0.75),transparent_55%),radial-gradient(80%_70%_at_0%_100%,rgba(245,158,11,0.35),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-[12px] font-semibold text-white/85"><Store className="h-3.5 w-3.5" /> Merchant</span>
            <span className="h-10 w-10 rounded-full bg-white/15 grid place-items-center font-heading font-extrabold text-sm ring-1 ring-white/25">{initials(shop)}</span>
          </div>
          <p className="mt-5 text-[11px] uppercase tracking-[0.22em] text-white/55">{greet}</p>
          <h1 className="font-heading font-extrabold text-[26px] sm:text-4xl leading-[1.08] tracking-tight mt-1 truncate">{shop}</h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/10 p-3.5">
              <p className="text-[10px] uppercase tracking-widest text-white/55">Lifetime earning</p>
              <p className="font-heading font-black text-[22px] mt-1 truncate" title={fmt(dash?.total_earning || 0)} data-testid="mh-total-earning">{fmtC(dash?.total_earning || 0)}</p>
            </div>
            <button type="button" data-testid="mh-code" onClick={copy} className="rounded-2xl bg-amber-400 text-slate-900 p-3.5 text-left active:scale-[0.97] transition-transform">
              <p className="text-[10px] uppercase tracking-widest text-slate-900/60 flex items-center justify-between">Merchant code <Copy className="h-3.5 w-3.5" /></p>
              <p className="font-heading font-black text-[20px] tracking-[0.18em] mt-1 truncate">{code || "······"}</p>
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" data-testid="mh-book" onClick={() => onNavigate("book")} className="flex-1 h-11 rounded-2xl bg-white text-slate-900 text-[13px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"><ClipboardPlus className="h-4 w-4" /> Book for customer</button>
            <button type="button" data-testid="mh-add-partner" onClick={onAddPartner} className="h-11 px-4 rounded-2xl bg-primary-600 text-white text-[13px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"><UserPlus className="h-4 w-4" /> Add partner</button>
          </div>
        </div>
      </section>

      {kycPending && (
        <button type="button" data-testid="merchant-onboarding-banner" onClick={() => onNavigate("onboarding")} className="w-full flex items-center gap-3.5 rounded-[22px] bg-primary-700 text-white p-4 text-left active:scale-[0.985] transition-transform">
          <span className="h-11 w-11 rounded-2xl bg-white/15 grid place-items-center shrink-0"><ShieldCheck className="h-6 w-6" /></span>
          <div className="flex-1 min-w-0"><p className="font-heading font-bold text-[15px]">Complete your verification</p><p className="text-[12px] text-primary-100">Finish shop profile &amp; KYC to unlock withdrawals.</p></div>
          <ChevronRight className="h-5 w-5 text-white/70" />
        </button>
      )}

      {/* Quick actions */}
      <Card data-testid="mh-quick-actions" className="p-2 lg:max-w-3xl">
        <div className="grid grid-cols-4">
          {[
            { k: "scanqr", l: "Scan QR", I: QrCode, c: "bg-primary-50 text-primary-700" },
            { k: "customers", l: "Customers", I: Users, c: "bg-sky-50 text-sky-700" },
            { k: "reminders", l: "Reminders", I: Bell, c: "bg-amber-50 text-amber-700" },
            { k: "complaints", l: "Complaint", I: AlertTriangle, c: "bg-rose-50 text-rose-700" },
            { k: "network", l: "Network", I: Network, c: "bg-violet-50 text-violet-700" },
            { k: "earnings", l: "Commission", I: TrendingUp, c: "bg-emerald-50 text-emerald-700" },
            { k: "invoices", l: "Invoices", I: FileText, c: "bg-slate-100 text-slate-700" },
            { k: "performance", l: "Reports", I: BarChart3, c: "bg-indigo-50 text-indigo-700" },
          ].map((a) => (
            <button key={a.k} type="button" data-testid={`mqa-${a.k}`} onClick={() => onNavigate(a.k)} className="flex flex-col items-center gap-2 py-3 rounded-2xl active:bg-slate-50 active:scale-95 transition-all">
              <span className={`h-12 w-12 rounded-2xl grid place-items-center ${a.c}`}><a.I className="h-[22px] w-[22px]" strokeWidth={1.8} /></span>
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{a.l}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Earnings snapshot */}
      <div>
        <SectionTitle action="Wallet" onAction={() => onNavigate("wallet")} testid="mh-wallet-link">Earnings snapshot</SectionTitle>
        <Card className="grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden" data-testid="mh-stats">
          {[
            { l: "Referral commission", v: fmtC(dash?.lifetime_referral_earning || 0), t: fmt(dash?.lifetime_referral_earning || 0), I: Network, c: "text-emerald-600", s: "from partners' jobs" },
            { l: "Booking commission", v: fmtC(dash?.booking_commission_earning || 0), t: fmt(dash?.booking_commission_earning || 0), I: ClipboardPlus, c: "text-amber-600", s: "customers you booked" },
            { l: "Referred partners", v: dash?.referred_partners ?? 0, I: Users, c: "text-primary-700", s: `${dash?.active_partners ?? 0} active` },
            { l: "Wallet balance", v: fmtC(dash?.wallet_balance || 0), t: fmt(dash?.wallet_balance || 0), I: Wallet, c: "text-slate-700", s: "withdrawable" },
          ].map((s) => (
            <div key={s.l} className="p-4">
              <p className="text-[11px] font-medium text-slate-500 inline-flex items-center gap-1"><s.I className={`h-3.5 w-3.5 ${s.c}`} /> {s.l}</p>
              <p className="font-heading font-extrabold text-[20px] text-slate-900 dark:text-white mt-1 truncate tabular-nums" title={s.t}>{s.v}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{s.s}</p>
            </div>
          ))}
        </Card>
      </div>

      {/* Top partners */}
      <div>
        <SectionTitle action={refs.length ? "My network" : undefined} onAction={() => onNavigate("network")} testid="mh-network-link">Top earning partners</SectionTitle>
        {topRefs.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <Sparkles className="h-8 w-8 text-primary-500 mx-auto" />
            <p className="font-semibold text-slate-800 dark:text-slate-100 mt-2">No partners yet</p>
            <p className="text-[12px] text-slate-500">Add your first partner and earn lifetime commission on every job.</p>
            <button type="button" onClick={onAddPartner} className="mt-3 h-10 px-4 rounded-xl bg-primary-700 text-white text-sm font-semibold active:scale-95">Add partner</button>
          </Card>
        ) : (
          <Card className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {topRefs.map((r) => (
              <button key={r.id} type="button" data-testid={`mh-ref-${r.id}`} onClick={() => onNavigate("network")} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-slate-50">
                <span className="h-11 w-11 rounded-2xl bg-primary-50 text-primary-700 grid place-items-center font-heading font-bold text-sm shrink-0">{initials(r.partner_name)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] text-slate-900 dark:text-white truncate leading-tight">{r.partner_name}</p>
                  <p className="text-[12px] text-slate-500 truncate mt-0.5">{r.total_jobs} jobs · <span className={r.status === "active" ? "text-emerald-600" : "text-amber-600"}>{r.status}</span></p>
                </div>
                <div className="text-right shrink-0"><p className="font-heading font-bold text-[14px] text-emerald-600">{fmt(r.total_commission)}</p><p className="text-[10px] text-slate-400">earned</p></div>
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
