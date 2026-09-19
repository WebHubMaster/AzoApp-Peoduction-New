import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { fmt } from "@/lib/api";
import { toast } from "sonner";
import { Crown, Ticket, ArrowRight, Copy, Check, Sparkles, Tag, CalendarClock, ShieldCheck } from "lucide-react";
import { Container, SectionHead, Scroller, Sk, ErrorState } from "@/pages/customer/home/ui";

// Persist the chosen code so Checkout can auto-fill it, copy to clipboard, and
// nudge the user toward services — this is the "one-tap apply" behaviour.
const grabCode = (code, navigate, link) => {
  if (code) {
    localStorage.setItem("azo_coupon", code);
    try { navigator.clipboard?.writeText(code); } catch { /* ignore */ }
    toast.success(`Coupon ${code} copied — apply at checkout`);
  }
  navigate(link || "/services");
};
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch { return ""; } };

export default function Promotions() {
  const [promo, setPromo] = useState(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(null);
  const navigate = useNavigate();

  const load = () => { setError(false); api.get("/site/promotions").then((r) => setPromo(r.data)).catch(() => setError(true)); };
  useEffect(load, []);

  if (error) return <Container className="py-8"><ErrorState onRetry={load} text="We couldn't load offers right now." /></Container>;
  if (!promo) return <Container className="py-10"><Sk className="h-6 w-40 mb-4" /><div className="flex gap-5 overflow-hidden">{[0, 1, 2].map((i) => <Sk key={i} className="w-[320px] h-[180px] shrink-0" />)}</div></Container>;
  const offers = promo.offers || [];
  const coupons = promo.coupons || [];
  const plans = promo.membership || [];
  const topPlan = plans.find((p) => (p.badge || "").toLowerCase().includes("popular")) || plans[0];
  const maxPct = plans.length ? Math.max(...plans.map((p) => p.discount_pct || 0)) : 0;

  const copyCoupon = (code) => {
    localStorage.setItem("azo_coupon", code);
    try { navigator.clipboard?.writeText(code); } catch { /* ignore */ }
    setCopied(code); setTimeout(() => setCopied(null), 1800);
    toast.success(`Coupon ${code} copied — apply at checkout`);
  };

  return (
    <>
      {offers.length > 0 && (
        <section className="py-10 sm:py-14" data-testid="home-offers">
          <Container>
            <SectionHead eyebrow="Deals of the day" title="Offers & savings" onSeeAll={() => navigate("/services")} seeAllLabel="Browse services" />
            <Scroller testId="home-offers-row">
              {offers.map((o) => (
                <button key={o.id} data-testid={`offer-${o.id}`} onClick={() => grabCode(o.coupon_code, navigate, o.link)}
                  className="group relative snap-start shrink-0 w-[300px] sm:w-[340px] h-[190px] rounded-3xl overflow-hidden text-left shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
                  style={{ background: o.bg_color || "#0D47A1" }}>
                  {o.image && <img src={o.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-25 group-hover:scale-105 transition-transform duration-700" />}
                  <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white/10" />
                  <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-between text-white">
                    <div>
                      <div className="flex items-center gap-2">
                        {o.discount_label && <span className="inline-block bg-white text-slate-900 text-xs font-extrabold px-2.5 py-1 rounded-lg">{o.discount_label}</span>}
                        {o.subtitle && <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">{o.subtitle}</span>}
                      </div>
                      <h3 className="font-heading font-extrabold text-xl leading-tight mt-3 line-clamp-2">{o.title}</h3>
                      {o.description && <p className="text-xs text-white/80 mt-1 line-clamp-2">{o.description}</p>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {o.coupon_code ? <span className="font-mono text-xs font-bold bg-white/15 backdrop-blur ring-1 ring-white/30 rounded-lg px-2.5 py-1 tracking-wider">{o.coupon_code}</span> : <span />}
                      <span className="inline-flex items-center gap-1 text-sm font-bold">{o.cta_text || "Grab offer"} <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" /></span>
                    </div>
                  </div>
                </button>
              ))}
            </Scroller>
          </Container>
        </section>
      )}

      {topPlan && (
        <section className="py-4 sm:py-6" data-testid="home-membership-banner">
          <Container>
            <div className="relative rounded-[28px] overflow-hidden bg-slate-900 text-white ring-1 ring-slate-800">
              <div className="absolute inset-0 opacity-90" style={{ background: `radial-gradient(ellipse at 15% 50%, ${topPlan.color || "#0D47A1"}99, transparent 60%), radial-gradient(ellipse at 90% 20%, ${topPlan.color || "#0D47A1"}55, transparent 55%)` }} />
              <Crown className="absolute -right-6 -top-6 h-44 w-44 text-white/[0.06]" />
              <div className="relative grid lg:grid-cols-12 gap-8 p-6 sm:p-10 items-center">
                <div className="lg:col-span-7">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-white/15 ring-1 ring-white/20 px-3 py-1 rounded-full"><Sparkles className="h-3.5 w-3.5" /> {topPlan.badge || "Membership"}</span>
                  <h2 className="font-heading font-black text-2xl sm:text-4xl mt-4 leading-tight">{maxPct > 0 ? <>Save up to <span className="text-amber-300">{maxPct}%</span> on every booking</> : topPlan.name}</h2>
                  <p className="text-white/75 mt-3 max-w-xl text-sm sm:text-base">{topPlan.description || topPlan.tagline}</p>
                  {Array.isArray(topPlan.benefits) && topPlan.benefits.length > 0 && (
                    <ul className="mt-5 grid sm:grid-cols-2 gap-2.5" data-testid="membership-benefits">
                      {topPlan.benefits.slice(0, 4).map((b) => <li key={b} className="flex items-center gap-2 text-sm text-white/90"><ShieldCheck className="h-4 w-4 text-emerald-300 shrink-0" />{b}</li>)}
                    </ul>
                  )}
                </div>
                <div className="lg:col-span-5">
                  <div className="rounded-3xl bg-white/10 backdrop-blur ring-1 ring-white/15 p-6">
                    <p className="text-xs uppercase tracking-wider font-bold text-white/70">{topPlan.name}</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <p className="font-heading font-black text-4xl">{fmt(topPlan.price)}</p>
                      {topPlan.original_price > topPlan.price && <span className="text-white/50 line-through">{fmt(topPlan.original_price)}</span>}
                      {topPlan.duration_days > 0 && <span className="text-sm text-white/70">/ {topPlan.duration_days >= 365 ? "year" : `${topPlan.duration_days} days`}</span>}
                    </div>
                    {plans.length > 1 && <p className="text-xs text-white/60 mt-1">{plans.length} plans available</p>}
                    <button onClick={() => navigate("/membership")} data-testid="membership-cta" className="mt-5 w-full h-12 rounded-2xl bg-white text-slate-900 font-bold inline-flex items-center justify-center gap-2 hover:bg-amber-50 transition-colors">Explore plans <ArrowRight className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>
      )}

      {coupons.length > 0 && (
        <section className="py-10 sm:py-14" data-testid="home-coupons">
          <Container>
            <SectionHead eyebrow="Save instantly" title="Coupons for you" subtitle="Tap to copy — the code auto-applies at checkout." />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {coupons.map((c) => (
                <div key={c.code} data-testid={`coupon-${c.code}`} className="relative flex rounded-3xl bg-white ring-1 ring-slate-200/80 overflow-hidden hover:ring-primary-300 hover:shadow-[0_16px_40px_-18px_rgba(13,71,161,0.3)] transition-all">
                  <div className="relative flex flex-col items-center justify-center bg-primary-700 text-white px-4 py-5 w-[104px] shrink-0">
                    <Ticket className="h-5 w-5 opacity-80" />
                    <span className="font-heading font-extrabold text-base mt-1 text-center leading-tight">{c.label}</span>
                    <span className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white" />
                  </div>
                  <div className="flex-1 p-4 min-w-0 border-l border-dashed border-slate-200">
                    <p className="font-heading font-bold text-slate-900 truncate">{c.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.description}</p>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500 flex-wrap">
                      {c.min_order > 0 && <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" />Min {fmt(c.min_order)}</span>}
                      {c.max_discount > 0 && <span>· Up to {fmt(c.max_discount)}</span>}
                      {c.valid_until && <span className="inline-flex items-center gap-1">· <CalendarClock className="h-3 w-3" />Till {fmtDate(c.valid_until)}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="font-mono text-sm font-bold text-primary-700 bg-primary-50 ring-1 ring-primary-100 rounded-lg px-2.5 py-1 tracking-wider">{c.code}</span>
                      <button data-testid={`coupon-copy-${c.code}`} onClick={() => copyCoupon(c.code)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold text-primary-700 hover:bg-primary-50 transition-colors">
                        {copied === c.code ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy &amp; use</>}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
