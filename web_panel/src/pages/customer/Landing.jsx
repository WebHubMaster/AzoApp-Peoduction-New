import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import api, { mediaSrc } from "@/lib/api";
import { Button } from "@/components/ui/button";
import MobileBottomNav from "@/components/MobileBottomNav";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import Promotions from "@/components/site/Promotions";
import Seo, { orgJsonLd, websiteJsonLd, breadcrumbJsonLd } from "@/components/Seo";
import { useSiteConfig } from "@/context/SiteConfigContext";
import OutOfAreaWaitlist from "@/components/OutOfAreaWaitlist";
import HomeHero, { TrustBar } from "./home/HomeHero";
import { CategoriesSection, ServicesSection, BannersSection, LocationHint } from "./home/HomeSections";
import { ReviewsSection, GrowCta, FaqSection, BlogSection } from "./home/HomeBlocks";
import { Container, SectionHead, RowSkeleton, ErrorState, Sk, useCity } from "./home/ui";
import CategoryServicesSheet from "@/components/CategoryServicesSheet";

const CATEGORY_TYPES = ["popular_categories", "featured_categories", "category_slider"];
const SERVICE_TYPES = ["featured_services", "trending_services", "most_requested", "recommended_services", "service_collection", "category_services"];

/* ---------- First-visit location permission popup ---------- */
const LocationGate = () => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | locating | error | out_of_area
  const [err, setErr] = useState("");
  const [oos, setOos] = useState(null); // out-of-area details { city, pincode, servicedCities }
  useEffect(() => {
    const has = localStorage.getItem("azo_location");
    const dismissed = sessionStorage.getItem("azo_loc_dismissed");
    if (!has && !dismissed) { const t = setTimeout(() => setOpen(true), 900); return () => clearTimeout(t); }
  }, []);
  // One pop-up at a time: rating / alert nudges wait until this modal closes.
  useEffect(() => { window.__azoLocOpen = open; window.dispatchEvent(new Event("azo:modal")); return () => { window.__azoLocOpen = false; window.dispatchEvent(new Event("azo:modal")); }; }, [open]);
  const dismiss = () => { sessionStorage.setItem("azo_loc_dismissed", "1"); setOpen(false); };
  const allow = () => {
    if (!navigator.geolocation) { dismiss(); return; }
    setStatus("locating"); setErr("");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      localStorage.setItem("azo_geo", JSON.stringify({ lat, lng }));
      // Show a friendly area label immediately, then refine it in the BACKGROUND via
      // reverse-geocode so the popup never waits on the slow external lookup.
      if (!localStorage.getItem("azo_location")) localStorage.setItem("azo_location", "Your area");
      api.get(`/geo/reverse?lat=${lat}&lng=${lng}`).then((r) => {
        const d = r.data || {};
        const nm = d.city || d.town || d.state;
        if (nm) { localStorage.setItem("azo_location", nm); window.dispatchEvent(new Event("azo-location-changed")); }
      }).catch(() => {});
      window.dispatchEvent(new Event("azo-location-changed"));
      // Serviceability uses lat/lng directly (fast, internal DB). Only this quick call gates the UI.
      const cov = await api.get("/serviceability", { params: { lat, lng } }).then((r) => r.data).catch(() => null);
      if (cov && cov.serviceable === false) {
        const rev = await Promise.race([
          api.get(`/geo/reverse?lat=${lat}&lng=${lng}`).then((r) => r.data).catch(() => ({})),
          new Promise((res) => setTimeout(() => res({}), 1500)),
        ]);
        setOos({ city: rev.city || rev.town || rev.state || "Your area", pincode: rev.postcode || rev.pincode || "", servicedCities: cov.serviced_cities || [] });
        setStatus("out_of_area");
        return; // keep the modal open to capture waitlist interest
      }
      setStatus("done"); setOpen(false);
    }, (e) => {
      setStatus("error");
      setErr(e && e.code === 1
        ? "Location permission was denied. You can enable it from your browser's site settings, or just enter your city manually."
        : "We couldn't detect your location. Please retry.");
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={dismiss}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-7" data-testid="location-gate" onClick={(e) => e.stopPropagation()}>
        {status === "out_of_area" && oos ? (
          <OutOfAreaWaitlist city={oos.city} pincode={oos.pincode} servicedCities={oos.servicedCities} onClose={dismiss} />
        ) : (
          <div className="text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary-50 mx-auto flex items-center justify-center mb-4"><MapPin className="h-8 w-8 text-primary-700" /></div>
            <h3 className="font-heading font-bold text-xl text-slate-900">Allow location access</h3>
            <p className="text-sm text-slate-500 mt-2">We use your location to show services available near you and to help professionals reach your doorstep faster.</p>
            {status === "error" && <p className="text-xs text-red-600 mt-3 leading-relaxed" data-testid="loc-error">{err}</p>}
            <Button data-testid="loc-allow" onClick={allow} disabled={status === "locating"} className="w-full mt-5 bg-primary-700 hover:bg-primary-800 h-11">
              {status === "locating" ? "Detecting your location…" : status === "error" ? "Retry" : "Allow location"}
            </Button>
            <button data-testid="loc-skip" onClick={dismiss} className="mt-3 text-sm text-slate-500 hover:text-slate-700 font-medium">Not now</button>
          </div>
        )}
      </div>
    </div>
  );
};

function MemberSavingsBanner({ navigate }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("azo_token")) return;
    api.get("/memberships/me").then((r) => setInfo(r.data || null)).catch(() => setInfo(null));
  }, []);
  if (!info || !info.active) return null;
  const saved = Number(info.total_saved || 0);
  const plan = info.membership?.plan_name || info.membership?.slug || "Member";
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6" data-testid="home-member-savings">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-4 flex items-center gap-4 shadow-sm">
        <span className="text-2xl">🎉</span>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-extrabold text-lg leading-tight">
            {saved > 0 ? `You've saved ₹${saved.toLocaleString("en-IN")} as a member` : `You're a ${plan} member`}
          </p>
          <p className="text-emerald-50 text-[13px]">Enjoy member discounts &amp; free visits on every booking · {plan}</p>
        </div>
        <button onClick={() => navigate("/services")}
          className="hidden sm:inline-flex shrink-0 bg-white text-emerald-700 font-bold text-sm rounded-md px-4 py-2 hover:bg-emerald-50 transition">
          Book &amp; save more
        </button>
      </div>
    </div>
  );
}

function VideoSection({ sec }) {
  const [playing, setPlaying] = useState(false);
  const d = sec.data || {};
  const src = d.video || sec.config?.video || "";
  const poster = d.poster || sec.config?.poster || "";
  if (!src) return null;
  return (
    <section className="py-10 bg-white" data-testid={`home-video-${sec.id}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {sec.title ? <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900">{sec.title}</h2> : null}
        {sec.subtitle ? <p className="text-slate-500 mt-1">{sec.subtitle}</p> : null}
        <div className={`${sec.title || sec.subtitle ? "mt-5" : ""} relative rounded-3xl overflow-hidden bg-black shadow-lg aspect-video max-w-4xl`}>
          {playing ? (
            <video src={mediaSrc(src)} poster={poster ? mediaSrc(poster) : undefined} controls autoPlay playsInline className="w-full h-full object-contain bg-black" data-testid={`home-video-player-${sec.id}`} />
          ) : (
            <button type="button" onClick={() => setPlaying(true)} data-testid={`home-video-play-${sec.id}`} className="group w-full h-full">
              {poster ? <img src={mediaSrc(poster)} alt={sec.title || "video"} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-16 w-16 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-xl transition">
                  <span className="ml-1 border-y-[11px] border-y-transparent border-l-[18px] border-l-primary-700" />
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- City local guide (intro / coverage / FAQs / service-page links) ----------
   Admin-managed in SEO → City & Local. Rendered in the same homepage section style,
   just above the FAQ section, on city pages only. */
function CityExtras({ slug, cityName }) {
  const [x, setX] = useState(null);
  useEffect(() => { api.get(`/seo/city-extras/${slug}`).then((r) => setX(r.data)).catch(() => setX(null)); }, [slug]);
  if (!x || (!x.intro && !x.coverage && !x.faqs?.length && !x.service_pages?.length)) return null;
  return (
    <section className="py-10 sm:py-16 bg-white border-t border-slate-100" data-testid="city-local-info">
      <Container>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-5">
            {x.intro && <div><SectionHead eyebrow="Local guide" title={`About our services in ${cityName}`} /><p className="text-slate-600 leading-relaxed whitespace-pre-line" data-testid="city-intro">{x.intro}</p></div>}
            {x.coverage && <p className="text-sm text-slate-500 leading-relaxed" data-testid="city-coverage-note">{x.coverage}</p>}
            {x.service_pages?.length > 0 && (
              <div data-testid="city-service-pages">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Service guides for {cityName}</p>
                <div className="flex flex-wrap gap-2">{x.service_pages.map((sp) => <Link key={sp.path} to={sp.path} data-testid={`city-service-link-${sp.path}`} className="rounded-xl bg-primary-50 ring-1 ring-primary-100 px-3.5 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-100">{sp.name}</Link>)}</div>
              </div>
            )}
          </div>
          {x.faqs?.length > 0 && (
            <div className="lg:col-span-5" data-testid="city-faqs">
              <SectionHead eyebrow="FAQ" title={`Questions from ${cityName}`} />
              <div className="space-y-2">{x.faqs.map((f, i) => <details key={i} className="rounded-xl ring-1 ring-slate-200 bg-white px-4 py-3" data-testid={`city-faq-${i}`}><summary className="font-semibold text-slate-800 cursor-pointer text-sm">{f.q}</summary><p className="text-sm text-slate-600 mt-2">{f.a}</p></details>)}</div>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

/**
 * Landing — the main customer homepage. Driven entirely by admin "Customer App Home"
 * sections. Also reused for city pages (/city/:slug): pass `fixedCity` (the city name
 * resolved from the slug) + `citySlug` and the page renders the SAME layout/design,
 * filtered to that city's Price Manager (categories, services and prices).
 */
export default function Landing({ fixedCity = null, citySlug = null, cityData = null }) {
  const cityMode = !!fixedCity;
  const [sections, setSections] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(false);
  const [sheetCat, setSheetCat] = useState(null);
  const navigate = useNavigate();
  const dynamicCity = useCity();
  // A city page ALWAYS uses its own city, independent of the visitor's saved header
  // location — and never writes to localStorage just by being visited.
  const city = cityMode ? fixedCity : dynamicCity;
  const { seo = {}, branding = {} } = useSiteConfig();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const siteName = seo.site_name || branding.site_name || "AzoApp";

  // NOTE: logged-in provider accounts (partner/merchant/admin) are NOT auto-redirected
  // away from the public homepage. They reach their dashboard via the Account button.

  const load = useCallback(() => {
    setError(false);
    // Hero/sheet categories: the main homepage pulls the global list (filtered by the
    // visitor's X-City header); a city page derives them from the city-filtered homepage
    // sections below, so the city param is always respected regardless of saved location.
    if (!cityMode) api.get("/catalog/categories").then((r) => setCategories(r.data || [])).catch(() => {});
    api.get("/site/homepage", { params: city ? { city } : {} })
      .then((r) => setSections(Array.isArray(r.data) ? r.data : []))
      .catch(() => { setError(true); setSections((s) => s || []); });
  }, [city, cityMode]);
  useEffect(() => { load(); }, [load]);

  const secs = sections || [];

  // Categories available in this city (service_count > 0), derived from the city-filtered
  // homepage category sections. Used for the hero tiles/chips and the category sheet.
  const cityCategories = useMemo(() => {
    if (!cityMode || !sections) return [];
    const map = new Map();
    sections.forEach((s) => {
      if (CATEGORY_TYPES.includes(s.type)) {
        (s.data || []).forEach((c) => { if ((c.service_count || 0) > 0 && !map.has(c.id)) map.set(c.id, c); });
      }
    });
    return [...map.values()];
  }, [cityMode, sections]);
  const heroCategories = cityMode ? cityCategories : categories;

  // Does the city have anything to sell? (any service row or any non-empty category)
  const cityHasServices = useMemo(() => {
    if (!cityMode || !sections) return true;
    const anySvc = sections.some((s) => SERVICE_TYPES.includes(s.type) && (s.data || []).length > 0);
    return anySvc || cityCategories.length > 0;
  }, [cityMode, sections, cityCategories]);

  const heroBanners = (secs.find((s) => s.type === "hero_banner") || {}).data || [];
  const faqSec = secs.find((s) => s.type === "faq") || {};
  const blogSec = secs.find((s) => ["blog", "latest_blogs", "blogs", "insights"].includes(s.type)) || {};
  const loaded = sections !== null;
  const openLocation = () => document.querySelector('[data-testid="nav-location"]')?.click();
  let serviceRows = 0;

  const otherCities = (cityData?.other_cities || []).map((c) => c.city);

  return (
    <div className="bg-white min-h-screen" data-testid={cityMode ? "city-page" : "home-page"}>
      {cityMode ? (
        <Seo
          title={`Home services in ${city}`}
          description={`Book verified professionals in ${city}${cityData?.areas?.length ? ` (${cityData.areas.slice(0, 3).join(", ")})` : ""}. Transparent pricing, on-time service, doorstep delivery.`}
          path={`/city/${citySlug}`}
          jsonLd={[
            breadcrumbJsonLd([{ name: "Home", url: "/" }, { name: `Home services in ${city}`, url: `/city/${citySlug}` }], origin),
            {
              "@context": "https://schema.org", "@type": "Service", name: `Home services in ${city}`,
              provider: { "@type": "Organization", name: siteName, url: origin },
              areaServed: { "@type": "City", name: city, ...(cityData?.lat && cityData?.lng ? { geo: { "@type": "GeoCoordinates", latitude: cityData.lat, longitude: cityData.lng } } : {}) },
            },
          ]}
        />
      ) : (
        <Seo
          title={seo.site_title || `${siteName} — Home services at your doorstep`}
          description={seo.meta_description || "Book trusted, verified professionals for AC repair, home cleaning, electrician, plumbing, carpentry & more. Fast booking, transparent pricing, on-time service."}
          jsonLd={[orgJsonLd(siteName, seo.logo || branding.logo, origin, seo.phone), websiteJsonLd(siteName, origin)]}
        />
      )}
      <SiteNavbar />
      <HomeHero categories={heroCategories} banners={heroBanners} loaded={loaded} navigate={navigate} city={city} onCategory={setSheetCat} cityName={cityMode ? city : ""} />
      <TrustBar />
      {!cityMode && <LocationHint city={city} onPick={openLocation} />}
      <MemberSavingsBanner navigate={navigate} />

      {!loaded && (
        <Container className="py-12 space-y-10" data-testid="home-skeleton">
          <div><Sk className="h-7 w-64 mb-6" /><RowSkeleton count={6} w="w-[176px]" h="h-[220px]" /></div>
          <div><Sk className="h-7 w-56 mb-6" /><RowSkeleton count={4} /></div>
        </Container>
      )}
      {error && loaded && secs.length === 0 && <Container className="py-10"><ErrorState onRetry={load} text="We couldn't load the homepage content." /></Container>}

      {/* City with no available services → friendly waitlist / empty state (matches app behaviour). */}
      {cityMode && loaded && !cityHasServices ? (
        <Container className="py-16">
          <div className="max-w-md mx-auto rounded-3xl bg-white ring-1 ring-slate-200 p-7 shadow-sm" data-testid="city-empty">
            <OutOfAreaWaitlist city={city} servicedCities={otherCities} />
          </div>
        </Container>
      ) : (
        secs.map((sec) => {
          if (CATEGORY_TYPES.includes(sec.type)) {
            // On a city page, hide categories that have zero available services here.
            const secOut = cityMode ? { ...sec, data: (sec.data || []).filter((c) => (c.service_count || 0) > 0) } : sec;
            if (cityMode && (secOut.data || []).length === 0) return null;
            return <CategoriesSection key={sec.id} sec={secOut} navigate={navigate} onCategory={setSheetCat} />;
          }
          if (SERVICE_TYPES.includes(sec.type)) {
            if (cityMode && (sec.data || []).length === 0) return null;
            serviceRows += 1;
            return <ServicesSection key={sec.id} sec={sec} navigate={navigate} city={city} tone={serviceRows % 2 === 0 ? "tint" : "white"} />;
          }
          if (["promo_banner", "slider"].includes(sec.type)) return <BannersSection key={sec.id} sec={sec} navigate={navigate} />;
          if (sec.type === "video") return <VideoSection key={sec.id} sec={sec} />;
          return null; // hero_banner → rendered inside the hero; coupons/faq → dedicated sections below
        })
      )}

      <Promotions />
      <ReviewsSection />
      <GrowCta navigate={navigate} />
      {cityMode && <CityExtras slug={citySlug} cityName={city} />}
      <FaqSection title={faqSec.title} subtitle={faqSec.subtitle} seeded={faqSec.data} />
      {blogSec.enabled !== false && <BlogSection title={blogSec.title} subtitle={blogSec.subtitle} seeded={blogSec.data} limit={blogSec.config?.limit || 3} />}

      <SiteFooter />
      <MobileBottomNav />
      {!cityMode && <LocationGate />}
      <CategoryServicesSheet category={sheetCat} onClose={() => setSheetCat(null)} navigate={navigate} city={cityMode ? city : null} />
    </div>
  );
}
