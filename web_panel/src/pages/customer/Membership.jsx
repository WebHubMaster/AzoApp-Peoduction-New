import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { fmt } from "@/lib/api";
import BrandLogo from "@/components/site/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Zap, ArrowLeft, Crown, Shield, Gem, Check, Sparkles, BadgeCheck,
  Clock, TrendingDown, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import MobileBottomNav from "@/components/MobileBottomNav";
import Seo from "@/components/Seo";

const ICON = { crown: Crown, shield: Shield, gem: Gem };

const loadRzp = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => resolve(true); s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

export default function Membership() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const loadMe = useCallback(async () => {
    if (!user) { setMe(null); return; }
    try { const { data } = await api.get("/memberships/me"); setMe(data); } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    document.title = "Membership Plans · Save on every service · AzoApp";
    (async () => {
      setLoading(true);
      try { const { data } = await api.get("/memberships/plans"); setPlans(data || []); }
      catch { toast.error("Failed to load plans"); } finally { setLoading(false); }
      await loadMe();
    })();
  }, [loadMe]);

  const activePlanId = me?.active ? me?.membership?.plan_id : null;

  const buy = async (plan) => {
    if (!user) { toast.info("Please sign in to buy a membership"); navigate("/login"); return; }
    setBusy(plan.id);
    try {
      const { data } = await api.post("/memberships/order", { plan_id: plan.id });
      if (data.free) { toast.success("Membership activated! 🎉"); await loadMe(); return; }
      if (data.mock) {
        await api.post("/memberships/mock", { plan_id: plan.id });
        toast.success(`${plan.name} activated! 🎉`); await loadMe(); return;
      }
      const ok = await loadRzp();
      if (!ok) { toast.error("Could not load payment gateway"); return; }
      const rzp = new window.Razorpay({
        key: data.key_id, order_id: data.order_id, amount: data.amount, currency: data.currency || "INR",
        name: "AzoApp Membership", description: plan.name,
        handler: async (resp) => {
          try {
            await api.post("/memberships/verify", {
              plan_id: plan.id, order_id: resp.razorpay_order_id,
              payment_id: resp.razorpay_payment_id, signature: resp.razorpay_signature,
            });
            toast.success(`${plan.name} activated! 🎉`); await loadMe();
          } catch { toast.error("Payment verification failed"); }
        },
        prefill: { name: user.name, contact: user.phone, email: user.email },
        theme: { color: plan.color || "#4f46e5" },
      });
      rzp.open();
    } catch (e) { toast.error(e?.response?.data?.detail || "Purchase failed"); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Seo
        title="Membership Plans — Save on every home service"
        description="Join AzoApp Membership and get up to 15% off every booking, free visiting charges and priority support. Silver, Gold & Platinum plans available."
        keywords="membership, home service discount, priority support, azoapp membership"
      />
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-primary-700"><ArrowLeft className="h-5 w-5" /></button>
          <BrandLogo to="/" />
          <div className="ml-auto">
            {user ? <Button size="sm" onClick={() => navigate("/account")} className="bg-primary-700 hover:bg-primary-800 rounded-xl">My Account</Button>
              : <Button size="sm" onClick={() => navigate("/login")} className="bg-primary-700 hover:bg-primary-800 rounded-xl">Sign In</Button>}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-6 text-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-3 py-1 rounded-full"><Sparkles className="h-3.5 w-3.5" /> AzoApp Membership</span>
        <h1 className="font-heading font-black text-3xl sm:text-5xl text-slate-900 mt-4">Save more on every booking</h1>
        <p className="text-slate-500 mt-3 max-w-xl mx-auto">Join a membership plan and unlock instant discounts, free visiting charges and priority support — on every home service, all year round.</p>
      </section>

      {/* Active membership banner */}
      {me?.active && (
        <section className="max-w-6xl mx-auto px-6 mb-4" data-testid="my-membership">
          <div className="rounded-2xl p-5 text-white flex items-center justify-between gap-4 flex-wrap" style={{ background: `linear-gradient(135deg, ${me.membership.color || "#4f46e5"}, #1e293b)` }}>
            <div className="flex items-center gap-3">
              <Crown className="h-8 w-8" />
              <div>
                <p className="font-heading font-extrabold text-lg">{me.membership.plan_name} — Active</p>
                <p className="text-white/80 text-sm">{me.membership.discount_pct}% off every booking · valid till {(me.membership.expires_at || "").slice(0, 10)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white/70 text-xs flex items-center gap-1 justify-end"><TrendingDown className="h-3.5 w-3.5" /> Total saved</p>
              <p className="font-heading font-extrabold text-2xl">{fmt(me.total_saved || 0)}</p>
            </div>
          </div>
        </section>
      )}

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        {loading ? (
          <div className="py-24 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin inline" /> Loading plans…</div>
        ) : plans.length === 0 ? (
          <div className="py-24 text-center text-slate-400">No membership plans available right now.</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 items-stretch" data-testid="membership-plans">
            {plans.map((p) => {
              const Icon = ICON[p.icon] || Crown;
              const isActive = activePlanId === p.id;
              const popular = (p.badge || "").toLowerCase().includes("popular");
              const save = p.original_price > p.price ? Math.round((1 - p.price / p.original_price) * 100) : 0;
              return (
                <div key={p.id} data-testid={`plan-card-${p.slug}`}
                  className={`relative rounded-3xl bg-white border-2 p-6 flex flex-col shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 ${popular ? "md:scale-105 shadow-lg" : ""}`}
                  style={{ borderColor: popular ? p.color : "#e2e8f0" }}>
                  {p.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold text-white px-4 py-1 rounded-full shadow" style={{ background: p.color }}>{p.badge}</span>}
                  <div className="flex items-center gap-3">
                    <span className="h-12 w-12 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: p.color }}><Icon className="h-6 w-6" /></span>
                    <div>
                      <p className="font-heading font-extrabold text-xl text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.tagline}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="font-heading font-black text-4xl text-slate-900">{fmt(p.price)}</span>
                    {p.original_price > p.price && <span className="text-slate-400 line-through mb-1">{fmt(p.original_price)}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">for {p.duration_days} days {save > 0 && <span className="text-emerald-600 font-semibold">· Save {save}%</span>}</p>

                  <div className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-semibold flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4" /> {p.discount_pct}% off every booking
                    {p.max_discount_per_booking > 0 && <span className="text-[11px] font-normal text-emerald-600/80">(up to {fmt(p.max_discount_per_booking)})</span>}
                  </div>

                  <ul className="mt-4 space-y-2 flex-1">
                    {(p.benefits && p.benefits.length ? p.benefits : [
                      `${p.discount_pct}% off every booking`,
                      p.free_visits > 0 ? `${p.free_visits} free visiting charges` : null,
                      p.priority_support ? "Priority support" : null,
                    ].filter(Boolean)).map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600"><Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> {b}</li>
                    ))}
                  </ul>

                  <Button data-testid={`buy-${p.slug}`} disabled={isActive || busy === p.id}
                    onClick={() => buy(p)} className="mt-6 w-full rounded-xl text-white h-11 font-semibold disabled:opacity-70"
                    style={{ background: isActive ? "#10b981" : p.color }}>
                    {busy === p.id ? <><Loader2 className="h-4 w-4 animate-spin mr-1 inline" /> Processing…</>
                      : isActive ? <><Check className="h-4 w-4 mr-1 inline" /> Current Plan</>
                      : user ? `Get ${p.name}` : "Sign in to buy"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Trust strip */}
        <div className="mt-12 grid sm:grid-cols-3 gap-4 text-center">
          {[[BadgeCheck, "Instant activation", "Benefits apply the moment you join"],
            [Clock, "Auto-applied at checkout", "No coupon codes — discount is automatic"],
            [Shield, "Secure payments", "Bank-grade Razorpay checkout"]].map(([I, t, s], i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
              <I className="h-6 w-6 text-primary-700 mx-auto" />
              <p className="font-heading font-bold text-slate-800 mt-2">{t}</p>
              <p className="text-xs text-slate-400 mt-1">{s}</p>
            </div>
          ))}
        </div>
      </section>
      <MobileBottomNav />
    </div>
  );
}
