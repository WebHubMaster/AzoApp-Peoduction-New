import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import MobileBottomNav from "@/components/MobileBottomNav";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import Promotions from "@/components/site/Promotions";
import Seo, { orgJsonLd, websiteJsonLd } from "@/components/Seo";
import { useSiteConfig } from "@/context/SiteConfigContext";
import OutOfAreaWaitlist from "@/components/OutOfAreaWaitlist";
import HomeHero, { TrustBar } from "./home/HomeHero";
import { CategoriesSection, ServicesSection, BannersSection, LocationHint } from "./home/HomeSections";
import { ReviewsSection, GrowCta, FaqSection, BlogSection } from "./home/HomeBlocks";
import { Container, RowSkeleton, ErrorState, Sk, useCity } from "./home/ui";
import CategoryServicesSheet from "@/components/CategoryServicesSheet";

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
          className="hidden sm:inline-flex shrink-0 bg-white text-emerald-700 font-bold text-sm rounded-xl px-4 py-2 hover:bg-emerald-50 transition">
          Book &amp; save more
        </button>
      </div>
    </div>
  );
}

export default function Landing() {
  const [sections, setSections] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(false);
  const [sheetCat, setSheetCat] = useState(null);
  const navigate = useNavigate();
  const city = useCity();
  const { seo = {}, branding = {} } = useSiteConfig();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const siteName = seo.site_name || branding.site_name || "AzoApp";

  // NOTE: logged-in provider accounts (partner/merchant/admin) are NOT auto-redirected
  // away from the public homepage. They reach their dashboard via the Account button.

  const load = useCallback(() => {
    setError(false);
    api.get("/catalog/categories").then((r) => setCategories(r.data || [])).catch(() => {});
    api.get("/site/homepage", { params: city ? { city } : {} })
      .then((r) => setSections(Array.isArray(r.data) ? r.data : []))
      .catch(() => { setError(true); setSections((s) => s || []); });
  }, [city]);
  useEffect(() => { load(); }, [load]);

  const secs = sections || [];
  const heroBanners = (secs.find((s) => s.type === "hero_banner") || {}).data || [];
  const faqSec = secs.find((s) => s.type === "faq") || {};
  const blogSec = secs.find((s) => ["blog", "latest_blogs", "blogs", "insights"].includes(s.type)) || {};
  const loaded = sections !== null;
  const openLocation = () => document.querySelector('[data-testid="nav-location"]')?.click();
  let serviceRows = 0;

  return (
    <div className="bg-white min-h-screen">
      <Seo
        title={seo.site_title || `${siteName} — Home services at your doorstep`}
        description={seo.meta_description || "Book trusted, verified professionals for AC repair, home cleaning, electrician, plumbing, carpentry & more. Fast booking, transparent pricing, on-time service."}
        jsonLd={[orgJsonLd(siteName, seo.logo || branding.logo, origin, seo.phone), websiteJsonLd(siteName, origin)]}
      />
      <SiteNavbar />
      <HomeHero categories={categories} banners={heroBanners} loaded={loaded} navigate={navigate} city={city} onCategory={setSheetCat} />
      <TrustBar />
      <LocationHint city={city} onPick={openLocation} />
      <MemberSavingsBanner navigate={navigate} />

      {!loaded && (
        <Container className="py-12 space-y-10" data-testid="home-skeleton">
          <div><Sk className="h-7 w-64 mb-6" /><RowSkeleton count={6} w="w-[176px]" h="h-[220px]" /></div>
          <div><Sk className="h-7 w-56 mb-6" /><RowSkeleton count={4} /></div>
        </Container>
      )}
      {error && loaded && secs.length === 0 && <Container className="py-10"><ErrorState onRetry={load} text="We couldn't load the homepage content." /></Container>}

      {secs.map((sec) => {
        if (["popular_categories", "featured_categories", "category_slider"].includes(sec.type)) return <CategoriesSection key={sec.id} sec={sec} navigate={navigate} onCategory={setSheetCat} />;
        if (["featured_services", "trending_services", "most_requested", "recommended_services", "service_collection"].includes(sec.type)) {
          serviceRows += 1;
          return <ServicesSection key={sec.id} sec={sec} navigate={navigate} city={city} tone={serviceRows % 2 === 0 ? "tint" : "white"} />;
        }
        if (["promo_banner", "slider"].includes(sec.type)) return <BannersSection key={sec.id} sec={sec} navigate={navigate} />;
        return null; // hero_banner → rendered inside the hero; coupons/faq → dedicated sections below
      })}

      <Promotions />
      <ReviewsSection />
      <GrowCta navigate={navigate} />
      <FaqSection title={faqSec.title} subtitle={faqSec.subtitle} seeded={faqSec.data} />
      {blogSec.enabled !== false && <BlogSection title={blogSec.title} subtitle={blogSec.subtitle} seeded={blogSec.data} limit={blogSec.config?.limit || 3} />}

      <SiteFooter />
      <MobileBottomNav />
      <LocationGate />
      <CategoryServicesSheet category={sheetCat} onClose={() => setSheetCat(null)} navigate={navigate} />
    </div>
  );
}
