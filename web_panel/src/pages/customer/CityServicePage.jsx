import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { MapPin, Star, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import Seo from "@/components/Seo";
import { Container, EmptyState, Sk } from "./home/ui";

export default function CityServicePage() {
  const { slug, serviceSlug } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    setState("loading");
    api.get(`/seo/city-service/${slug}/${serviceSlug}`).then((r) => { setD(r.data); setState("ok"); }).catch(() => setState("notfound"));
  }, [slug, serviceSlug]);

  if (state === "notfound") return (
    <div className="bg-white min-h-screen"><SiteNavbar /><Container className="py-24"><EmptyState testId="city-service-notfound" title="This page isn't available" subtitle="The service may not be offered in this city yet." /><div className="text-center mt-6"><Link to={`/city/${slug}`} className="text-primary-700 font-semibold">See services in this city →</Link></div></Container><SiteFooter /></div>
  );
  if (!d) return <div className="bg-white min-h-screen"><SiteNavbar /><Container className="py-16 space-y-4"><Sk className="h-10 w-2/3" /><Sk className="h-40 w-full" /></Container></div>;

  const s = d.service;
  const price = s.discounted_price > 0 ? s.discounted_price : s.base_price;
  const book = () => { localStorage.setItem("azo_location", d.city); window.dispatchEvent(new Event("azo-location-changed")); navigate(`/service/${s.slug || s.id}`); };

  return (
    <div className="bg-white min-h-screen" data-testid="city-service-page">
      <Seo title={d.title} description={s.short_description} path={`/city/${slug}/${serviceSlug}`} />
      <SiteNavbar />
      <Container className="pt-8 pb-14">
        <nav className="text-xs text-slate-500 flex items-center gap-1.5 mb-5" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-primary-700">Home</Link><span>/</span>
          <Link to={`/city/${d.city_slug}`} className="hover:text-primary-700">{d.city}</Link><span>/</span>
          <span className="text-slate-800 font-medium">{s.name}</span>
        </nav>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-800 bg-primary-50 ring-1 ring-primary-100 rounded-md px-3 py-1.5"><MapPin className="h-3.5 w-3.5" />{d.city}{d.areas.length ? ` · ${d.areas.join(", ")}` : ""}</p>
            <h1 className="font-heading font-black text-3xl sm:text-4xl text-slate-900 mt-4" data-testid="city-service-title">{s.name} in {d.city}</h1>
            <p className="mt-5 text-slate-600 leading-relaxed whitespace-pre-line" data-testid="city-service-intro">{d.intro}</p>
            {d.coverage && <p className="mt-4 text-sm text-slate-500">{d.coverage}</p>}
            {d.faqs.length > 0 && (
              <div className="mt-8 space-y-2" data-testid="city-service-faqs">
                <h2 className="font-heading font-bold text-xl text-slate-900 mb-3">Frequently asked in {d.city}</h2>
                {d.faqs.map((f, i) => <details key={i} className="rounded-xl ring-1 ring-slate-200 px-4 py-3"><summary className="font-semibold text-sm text-slate-800 cursor-pointer">{f.q}</summary><p className="text-sm text-slate-600 mt-2">{f.a}</p></details>)}
              </div>
            )}
            {d.reviews.length > 0 && (
              <div className="mt-8" data-testid="city-service-reviews">
                <h2 className="font-heading font-bold text-xl text-slate-900 mb-3">Reviews from customers in {d.city}</h2>
                <div className="grid sm:grid-cols-2 gap-3">{d.reviews.map((r, i) => (
                  <div key={i} className="rounded-xl ring-1 ring-slate-200 p-4"><p className="flex items-center gap-1 text-sm font-semibold text-slate-800"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{r.rating} · {r.name}</p>{r.comment && <p className="text-sm text-slate-600 mt-1.5">{r.comment}</p>}</div>
                ))}</div>
              </div>
            )}
          </div>
          <aside className="lg:col-span-5">
            <div className="rounded-2xl ring-1 ring-slate-200 overflow-hidden shadow-sm">
              {s.image && <img src={s.image} alt={`${s.name} in ${d.city}`} className="h-48 w-full object-cover" />}
              <div className="p-5">
                <p className="text-xs uppercase tracking-wider font-bold text-primary-700">{s.category_name}</p>
                <p className="font-heading font-bold text-lg text-slate-900 mt-1">{s.name}</p>
                {price > 0 && <p className="mt-2 text-slate-700">Price in {d.city}: <span className="font-bold text-slate-900">₹{price}</span></p>}
                <button onClick={book} data-testid="city-service-book" className="mt-4 w-full h-11 rounded-md bg-primary-700 text-white font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-primary-800">View & book <ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
            {d.other_pages.length > 0 && (
              <div className="mt-6"><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">More in {d.city}</p>
                <div className="flex flex-wrap gap-2">{d.other_pages.map((o) => <Link key={o.path} to={o.path} className="rounded-lg ring-1 ring-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:text-primary-700">{o.name}</Link>)}</div>
              </div>
            )}
          </aside>
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}
