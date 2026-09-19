import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { openCheckout } from "@/lib/payments";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  Package, Crown, CheckCircle2, ShieldCheck, Sparkles, Star, Lock,
  Shirt, IdCard, Headphones, BadgeCheck, ArrowRight, Truck, RefreshCw,
} from "lucide-react";

const ICONS = { shirt: Shirt, cap: Crown, id: IdCard, support: Headphones };

function fmtINR(n) { return `₹${Number(n || 0).toLocaleString("en-IN")}`; }

export default function PartnerStarterKit({ status, locked = false, onPurchased }) {
  const { refresh, user } = useAuth();
  const [data, setData] = useState(status || null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(() => {
    api.get("/starter-kit/me").then((r) => setData(r.data)).catch(() => {});
  }, []);
  useEffect(() => { if (!status) load(); else setData(status); }, [status, load]);

  const purchase = async () => {
    setBuying(true);
    try {
      const { data: order } = await api.post("/starter-kit/order");
      if (order.free) {
        // Kit is free — backend already activated it.
        toast.success("Starter Kit activated!");
      } else if (order.mock) {
        // No live gateway configured → dev mock activation (gated server-side).
        await api.post("/starter-kit/mock");
        toast.success("Payment successful — welcome to AzoApp Pro! 🎉");
      } else {
        // REAL payment gateway: open checkout, then verify server-side. The Pro
        // tag is granted ONLY after /starter-kit/verify confirms the signature.
        const ok = await openCheckout(order, {
          user, name: "AzoApp Pro", description: "Starter Kit",
          onVerify: (res) => api.post("/starter-kit/verify", {
            order_id: res.razorpay_order_id,
            payment_id: res.razorpay_payment_id,
            signature: res.razorpay_signature,
          }),
        });
        if (!ok) { setBuying(false); return; }  // cancelled / failed — no Pro tag
        toast.success("Payment verified — welcome to AzoApp Pro! 🎉");
      }
      await load();
      await refresh?.();
      onPurchased?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Purchase failed");
    } finally { setBuying(false); }
  };

  if (!data) return <div className="p-6 text-slate-400">Loading Starter Kit…</div>;

  const cfg = data.config || {};
  const purchased = data.purchased;

  /* ---------------- Already a Pro ---------------- */
  if (purchased) {
    return (
      <div className="w-full" data-testid="starter-kit-owned">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-indigo-700 to-violet-700 text-white p-8 shadow-2xl">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10" />
          <div className="absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-white/5" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-4 py-1.5 text-sm font-bold">
              <Crown className="h-4 w-4 text-amber-300" /> {data.badge_label || cfg.badge_label || "AzoApp Pro"}
            </div>
            <h1 className="font-heading font-black text-3xl mt-4">You&apos;re an AzoApp Pro! 🎉</h1>
            <p className="text-white/80 mt-2 max-w-lg">Your premium badge is live on your profile. Your branded kit is on the way — wear it proud and win more customers.</p>
            <div className="mt-5 flex items-center gap-2 text-sm text-white/90"><Truck className="h-4 w-4" /> Kit dispatch is handled by the AzoApp team.</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          {(cfg.items || []).map((it) => {
            const Icon = ICONS[it.icon] || Package;
            return (
              <div key={it.id} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4">
                {it.image ? <img src={it.image} alt={it.name} className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600"><Icon className="h-6 w-6" /></div>}
                <div><p className="font-semibold text-slate-800 text-sm">{it.name}</p><p className="text-[12px] text-slate-500 line-clamp-2">{it.description}</p></div>
                <BadgeCheck className="h-5 w-5 text-emerald-500 ml-auto shrink-0" />
              </div>
            );
          })}
        </div>

        {/* Delivery tracking */}
        <div className="mt-5 bg-white rounded-2xl border border-slate-200 p-5" data-testid="kit-tracking">
          <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2 mb-4"><Truck className="h-4 w-4 text-primary-600" /> Kit delivery status</h3>
          {(() => {
            const steps = [
              { key: "processing", label: "Order confirmed" },
              { key: "shipped", label: "Shipped" },
              { key: "out_for_delivery", label: "Out for delivery" },
              { key: "delivered", label: "Delivered" },
            ];
            const cur = data.tracking_status || "processing";
            const idx = Math.max(0, steps.findIndex((s) => s.key === cur));
            return (
              <div className="flex items-center">
                {steps.map((s, i) => (
                  <div key={s.key} className="flex-1 flex flex-col items-center relative">
                    {i > 0 && <div className={`absolute top-3 right-1/2 left-[-50%] h-0.5 ${i <= idx ? "bg-emerald-500" : "bg-slate-200"}`} />}
                    <div className={`relative z-10 h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i <= idx ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                      {i < idx || (i === idx && cur === "delivered") ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={`text-[11px] mt-1.5 text-center ${i <= idx ? "text-slate-700 font-semibold" : "text-slate-400"}`}>{s.label}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Renewal */}
        {data.renewal?.expires_at && (
          <div className={`mt-4 rounded-2xl border p-4 flex items-center gap-3 ${data.renewal.expired ? "bg-red-50 border-red-200" : data.renewal.expiring_soon ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`} data-testid="kit-renewal">
            <RefreshCw className={`h-5 w-5 shrink-0 ${data.renewal.expired ? "text-red-600" : data.renewal.expiring_soon ? "text-amber-600" : "text-slate-500"}`} />
            <div>
              <p className="font-semibold text-slate-800 text-sm">
                {data.renewal.expired ? "Your AzoApp Pro membership has expired" : `Membership valid till ${new Date(data.renewal.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
              {!data.renewal.expired && data.renewal.days_left != null && <p className="text-[12px] text-slate-500">{data.renewal.days_left} day(s) left{data.renewal.expiring_soon ? " — renew soon to keep your perks" : ""}</p>}
            </div>
            {(data.renewal.expired || data.renewal.expiring_soon) && (
              <Button onClick={purchase} disabled={buying} size="sm" className="ml-auto bg-primary-700 hover:bg-primary-800">{buying ? "…" : "Renew now"}</Button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ---------------- Sales / purchase page ---------------- */
  const actual = Number(cfg.actual_price || 0);
  const price = Number(cfg.discounted_price || 0);
  const savings = Math.max(actual - price, 0);
  const discountPct = actual > 0 ? Math.round((savings / actual) * 100) : 0;

  return (
    <div className="w-full" data-testid="starter-kit-buy">
      {locked && (
        <div className="mb-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3" data-testid="starter-kit-lock-notice">
          <Lock className="h-6 w-6 text-amber-600 shrink-0" />
          <div>
            <p className="font-heading font-bold text-amber-900">Starter Kit purchase required</p>
            <p className="text-amber-800 text-sm mt-0.5">Your service area requires the AzoApp Pro Starter Kit before you can start taking jobs. Please complete the purchase below to unlock your dashboard.</p>
          </div>
        </div>
      )}

      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-primary-900 to-indigo-900 text-white shadow-2xl">
        {cfg.hero_image && <img src={cfg.hero_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
        <div className="absolute -top-20 -right-16 h-64 w-64 rounded-full bg-primary-500/20 blur-2xl" />
        <div className="relative p-8 sm:p-10 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-3 py-1 text-[13px] font-bold text-amber-300">
              <Sparkles className="h-4 w-4" /> {cfg.tagline || "Become a verified AzoApp Pro"}
            </div>
            <h1 className="font-heading font-black text-3xl sm:text-4xl mt-4 leading-tight">{cfg.title || "AzoApp Pro Starter Kit"}</h1>
            <p className="text-white/75 mt-3 text-[15px]">{cfg.subtitle || "Look the part. Win customer trust. Earn more."}</p>
            <div className="flex items-center gap-3 mt-6">
              <div className="flex items-baseline gap-2">
                <span className="font-heading font-black text-4xl">{fmtINR(price)}</span>
                {savings > 0 && <span className="text-white/50 line-through text-lg">{fmtINR(actual)}</span>}
              </div>
              {discountPct > 0 && <span className="bg-emerald-500 text-white text-sm font-bold rounded-full px-3 py-1">{discountPct}% OFF</span>}
            </div>
            {savings > 0 && <p className="text-emerald-300 text-sm font-semibold mt-1">You save {fmtINR(savings)} today</p>}
            <Button onClick={purchase} disabled={buying} data-testid="starter-kit-buy-btn"
              className="mt-6 bg-white text-primary-800 hover:bg-primary-50 font-bold text-base h-12 px-7 rounded-xl shadow-lg">
              {buying ? "Processing…" : <>Get your Starter Kit <ArrowRight className="h-5 w-5 ml-1.5" /></>}
            </Button>
            <div className="flex items-center gap-4 mt-4 text-[12px] text-white/60">
              <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Secure payment</span>
              <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> Kit delivered to you</span>
            </div>
          </div>
          {/* Rating / trust card */}
          <div className="hidden md:block">
            <div className="bg-white/10 backdrop-blur rounded-2xl border border-white/15 p-5">
              <div className="flex items-center gap-1 text-amber-300">{[...Array(5)].map((_, i) => <Star key={i} className="h-5 w-5 fill-amber-300" />)}</div>
              <p className="text-white/90 text-sm mt-2 italic">&ldquo;After I got the branded kit, customers trust me instantly. My ratings and repeat jobs went up.&rdquo;</p>
              <p className="text-white/60 text-[12px] mt-2">— A verified AzoApp Pro partner</p>
            </div>
          </div>
        </div>
      </div>

      {/* WHAT'S INSIDE */}
      <div className="mt-8">
        <h2 className="font-heading font-extrabold text-xl text-slate-900 flex items-center gap-2"><Package className="h-5 w-5 text-primary-600" /> What&apos;s inside your kit</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {(cfg.items || []).map((it) => {
            const Icon = ICONS[it.icon] || Package;
            return (
              <div key={it.id} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition" data-testid={`sk-view-item-${it.id}`}>
                <div className="h-36 bg-gradient-to-br from-primary-50 to-indigo-50 flex items-center justify-center overflow-hidden">
                  {it.image ? <img src={it.image} alt={it.name} className="h-full w-full object-cover group-hover:scale-105 transition" /> : <Icon className="h-14 w-14 text-primary-300" />}
                </div>
                <div className="p-4">
                  <p className="font-heading font-bold text-slate-800">{it.name}</p>
                  <p className="text-[13px] text-slate-500 mt-1">{it.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BENEFITS */}
      {(cfg.benefits || []).length > 0 && (
        <div className="mt-8 bg-gradient-to-br from-primary-50 to-indigo-50 rounded-2xl border border-primary-100 p-6">
          <h2 className="font-heading font-extrabold text-xl text-slate-900 flex items-center gap-2"><Crown className="h-5 w-5 text-amber-500" /> Why partners love it</h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {(cfg.benefits || []).map((b, i) => (
              <div key={i} className="flex items-start gap-2.5 bg-white/70 rounded-xl p-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-slate-700 text-sm font-medium">{b}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={purchase} disabled={buying} className="bg-primary-700 hover:bg-primary-800 font-bold h-12 px-8 rounded-xl">
              {buying ? "Processing…" : <>Join AzoApp Pro — {fmtINR(price)} <ArrowRight className="h-5 w-5 ml-1.5" /></>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
