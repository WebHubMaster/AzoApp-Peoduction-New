import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Star, Clock, ArrowLeft, CheckCircle2, Tag, Plus, Minus, ShieldCheck, ShoppingBag, Check } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import BrandLogo from "@/components/site/BrandLogo";
import { Button } from "@/components/ui/button";
import MobileBottomNav from "@/components/MobileBottomNav";
import RateCardBar from "@/components/RateCardModal";
import SmartImage from "@/components/site/SmartImage";
import { DetailSkeleton } from "@/components/site/Skeletons";
import Seo, { serviceJsonLd, breadcrumbJsonLd } from "@/components/Seo";
import { toast } from "sonner";

const PRICE_LABEL = { per_hour: "/ hour", per_person: "/ person", per_sqft: "/ sq ft" };

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addService, count } = useCart();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [svc, setSvc] = useState(null);
  const [addons, setAddons] = useState([]);
  const [tier, setTier] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api.get(`/catalog/services/${id}`).then((r) => {
      setSvc(r.data);
      const ts = r.data.tiers || [];
      if (ts.length) { const bi = ts.findIndex((t) => t.badge); setTier(bi >= 0 ? bi : 0); }
    });
    setAddons([]); setQty(1); setAdded(false);
  }, [id]);

  const toggleAddon = (name) => setAddons((a) => (a.includes(name) ? a.filter((x) => x !== name) : [...a, name]));

  const unitPrice = useMemo(() => {
    if (!svc) return 0;
    let base;
    if (tier != null && svc.tiers?.[tier]) base = Number(svc.tiers[tier].price) || 0;
    else base = svc.discounted_price > 0 && svc.discounted_price < svc.base_price ? svc.discounted_price : svc.base_price;
    const addonSum = addons.reduce((s, name) => { const a = (svc.addons || []).find((x) => x.name === name); return s + (a ? Number(a.price) || 0 : 0); }, 0);
    return (Number(base) || 0) + addonSum;
  }, [svc, tier, addons]);

  const addToBooking = (goCheckout = false) => {
    addService(svc, { tier_index: tier, addons, qty });
    setAdded(true);
    if (goCheckout) navigate("/book");
    else toast.success(`${svc.name} added to your booking`);
  };

  if (!svc) return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <DetailSkeleton />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Seo
        title={(svc.seo && svc.seo.title) || `${svc.name}${svc.category_name ? ` in ${svc.category_name}` : ""}`}
        description={(svc.seo && svc.seo.description) || svc.short_description || svc.description || svc.name}
        keywords={(svc.seo && svc.seo.keywords) || `${svc.name}, ${svc.category_name || ""}, home service, book online`}
        image={svc.image || (svc.gallery && svc.gallery[0])}
        type="product"
        jsonLd={[
          svc.jsonld || serviceJsonLd(svc, origin),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Services", path: "/services" },
            { name: svc.name, path: `/service/${svc.id}` },
          ], origin),
        ]}
      />
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate(-1)} data-testid="back-btn" className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-primary-700"><ArrowLeft className="h-5 w-5" /></button>
          <BrandLogo to="/" />
          <button data-testid="nav-cart" onClick={() => navigate("/book")} className="ml-auto relative h-10 px-3 rounded-xl border border-slate-200 flex items-center gap-2 text-sm font-semibold text-slate-700 hover:border-primary-300">
            <ShoppingBag className="h-4 w-4 text-primary-700" /> Booking
            {count > 0 && <span data-testid="cart-count" className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-primary-700 text-white text-[11px] font-bold flex items-center justify-center">{count}</span>}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <ServiceGallery svc={svc} />
          <p className="text-xs uppercase tracking-wider font-bold text-primary-700 mt-6">{svc.category_name}{svc.subcategory_name ? ` · ${svc.subcategory_name}` : ""}</p>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 mt-1">{svc.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
            <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {svc.rating}</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {svc.duration_min} min</span>
            {svc.members_required > 1 && <span>· {svc.members_required} pros</span>}
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="font-heading font-extrabold text-2xl text-slate-900">{fmt(svc.discounted_price || svc.base_price)}</span>
            {svc.discounted_price > 0 && svc.discounted_price < svc.base_price && <span className="text-slate-400 line-through">{fmt(svc.base_price)}</span>}
            {PRICE_LABEL[svc.price_type] && <span className="text-xs text-slate-500">{PRICE_LABEL[svc.price_type]}</span>}
            {svc.tax_pct > 0 && <span className="text-xs text-slate-400" data-testid="service-tax-note">{svc.tax_inclusive ? "Incl. Est. Govt. Taxes" : "+ Est. Govt. Taxes"}</span>}
          </div>
          {(svc.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">{svc.tags.map((t) => <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{t}</span>)}</div>
          )}

          <div className="mt-4">
            <RateCardBar serviceId={svc.id} categoryId={svc.category_id} addable />
          </div>

          {(svc.tiers || []).length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold mb-3"><Tag className="h-4 w-4" /> Choose a pack &amp; save more</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {svc.tiers.map((t, i) => {
                  const off = t.original_price > t.price ? Math.round((1 - t.price / t.original_price) * 100) : 0;
                  const sel = tier === i;
                  return (
                    <button key={i} data-testid={`tier-${i}`} onClick={() => setTier(i)}
                      className={`relative text-left rounded-2xl border-2 overflow-hidden transition-all ${sel ? "border-primary-700 shadow-md" : "border-slate-200 bg-white hover:border-primary-300"}`}>
                      {t.badge && <span className="absolute top-2 left-2 z-10 bg-primary-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">{t.badge}</span>}
                      {t.image && <div className="h-24 w-full bg-slate-100"><img src={t.image} alt={t.label} className="h-full w-full object-cover" /></div>}
                      <div className={`p-3 ${sel ? "bg-primary-50" : ""}`}>
                        <p className="font-semibold text-slate-900">{t.label}</p>
                        {Number(t.review_count) > 0 && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{t.rating} <span className="text-slate-400">({Number(t.review_count).toLocaleString("en-IN")})</span></div>
                        )}
                        {t.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{t.description}</p>}
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="font-heading font-extrabold text-lg text-slate-900">{fmt(t.price)}</span>
                          {off > 0 && <span className="text-xs text-slate-400 line-through">{fmt(t.original_price)}</span>}
                        </div>
                        {off > 0 && <p className="text-xs text-emerald-600 font-semibold mt-0.5">{off}% off</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(svc.highlights || []).length > 0 && (
            <div className="mt-8">
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-3 flex items-center gap-2"><span className="text-amber-400">✨</span> HIGHLIGHTS</h3>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {svc.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /><span className="text-sm text-slate-700">{h}</span></div>
                ))}
              </div>
            </div>
          )}

          {svc.description && (/<[a-z][\s\S]*>/i.test(svc.description)
            ? <div className="text-slate-600 mt-4 leading-relaxed rt-editor" dangerouslySetInnerHTML={{ __html: svc.description }} />
            : <p className="text-slate-600 mt-4 leading-relaxed">{svc.description}</p>)}

          {svc.addons?.length > 0 && (
            <div className="mt-8">
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-3">Add-ons</h3>
              <div className="space-y-2">
                {svc.addons.map((a) => (
                  <label key={a.name} data-testid={`addon-${a.name}`} className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${addons.includes(a.name) ? "border-primary-700 bg-primary-50" : "border-slate-200 bg-white"}`}>
                    <span className="flex items-center gap-3">
                      <span className={`h-5 w-5 rounded-md border flex items-center justify-center ${addons.includes(a.name) ? "bg-primary-700 border-primary-700" : "border-slate-300"}`}>{addons.includes(a.name) && <Check className="h-4 w-4 text-white" />}</span>
                      <span className="font-medium text-slate-800">{a.name}</span>
                    </span>
                    <span className="font-semibold text-slate-700">+{fmt(a.price)}</span>
                    <input type="checkbox" className="hidden" checked={addons.includes(a.name)} onChange={() => toggleAddon(a.name)} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {(svc.faqs || []).length > 0 && (
            <div className="mt-8">
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-3">Frequently asked questions</h3>
              <div className="space-y-2">
                {svc.faqs.map((f, i) => (
                  <details key={i} className="bg-white border border-slate-200 rounded-xl p-4"><summary className="font-semibold text-slate-800 cursor-pointer">{f.question}</summary><p className="text-slate-600 text-sm mt-2">{f.answer}</p></details>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Add-to-booking card */}
        <div className="lg:col-span-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 sticky top-24">
            <h3 className="font-heading font-bold text-xl text-slate-900">Add to your booking</h3>
            <p className="text-xs text-slate-500 mt-1">Select options, then add this service. You can add more services before checkout.</p>

            <div className="flex items-center justify-between mt-5">
              <span className="text-sm font-semibold text-slate-600">Quantity</span>
              <div className="inline-flex items-center rounded-xl border border-slate-200 h-10">
                <button data-testid="qty-minus" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="px-3 h-full text-slate-500 hover:text-primary-700 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center font-bold text-slate-900">{qty}</span>
                <button data-testid="qty-plus" onClick={() => setQty((q) => q + 1)} className="px-3 h-full text-slate-500 hover:text-primary-700"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            {tier != null && svc.tiers?.[tier] && (
              <div className="flex justify-between text-sm mt-3"><span className="text-slate-500">Pack</span><span className="font-medium text-slate-800">{svc.tiers[tier].label}</span></div>
            )}
            {addons.length > 0 && (
              <div className="flex justify-between text-sm mt-1"><span className="text-slate-500">Add-ons</span><span className="font-medium text-slate-800 text-right max-w-[60%]">{addons.join(", ")}</span></div>
            )}

            <div className="flex items-baseline justify-between mt-4 pt-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">Item total</span>
              <span className="font-heading font-extrabold text-2xl text-slate-900">{fmt(unitPrice * qty)}</span>
            </div>

            <Button data-testid="add-to-booking" onClick={() => addToBooking(false)} className="w-full mt-4 h-12 bg-primary-700 hover:bg-primary-800 text-base">
              {added ? <><Check className="h-4 w-4 mr-1" /> Added · Add again</> : <><Plus className="h-4 w-4 mr-1" /> Add to Booking</>}
            </Button>
            {count > 0 ? (
              <Button data-testid="go-checkout" onClick={() => navigate("/book")} variant="outline" className="w-full mt-2 h-11 border-primary-200 text-primary-700 hover:bg-primary-50">
                Go to checkout ({count}) <ShoppingBag className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <button data-testid="book-now" onClick={() => addToBooking(true)} className="w-full mt-2 h-11 text-sm font-semibold text-primary-700 hover:text-primary-800">Or book only this service →</button>
            )}

            <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-3 flex items-center gap-3" data-testid="secure-badge">
              <div className="h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
              <div><p className="text-sm font-bold text-emerald-800">100% Secure &amp; Refundable</p><p className="text-[11px] text-emerald-700">Pay safely at checkout · easy cancellations</p></div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Mobile sticky add bar */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 flex items-center gap-3">
        <div><p className="text-[11px] text-slate-400">Item total</p><p className="font-heading font-extrabold text-lg text-slate-900 leading-none">{fmt(unitPrice * qty)}</p></div>
        <Button data-testid="add-to-booking-mobile" onClick={() => addToBooking(false)} className="ml-auto h-11 px-5 bg-primary-700 hover:bg-primary-800"><Plus className="h-4 w-4 mr-1" /> Add</Button>
        {count > 0 && <Button data-testid="go-checkout-mobile" onClick={() => navigate("/book")} className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700">Checkout ({count})</Button>}
      </div>

      <MobileBottomNav />
    </div>
  );
}

const ServiceGallery = ({ svc }) => {
  const imgs = [svc.image, ...(svc.gallery || [])].filter(Boolean);
  const [active, setActive] = useState(0);
  if (imgs.length === 0) return <div className="w-full h-64 sm:h-72 rounded-2xl bg-slate-100" />;
  return (
    <div>
      <div className="relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden bg-slate-100">
        <SmartImage src={imgs[active]} alt={svc.name} eager />
      </div>
      {imgs.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
          {imgs.map((im, i) => (
            <button key={i} onClick={() => setActive(i)} className={`h-16 w-24 rounded-lg overflow-hidden border-2 shrink-0 ${i === active ? "border-primary-700" : "border-transparent"}`}><img src={im} alt="" className="h-full w-full object-cover" /></button>
          ))}
        </div>
      )}
    </div>
  );
};
