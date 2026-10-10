import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import { Container, EmptyState, ErrorState, Sk } from "./home/ui";
import Landing from "./Landing";

/**
 * City page (/city/:slug). Resolves the city name from the slug (GET /site/city/:slug)
 * and then renders the EXACT same layout/design as the main homepage via <Landing>,
 * filtered to this city (categories, services and prices come from the city's Price
 * Manager). Unknown / unserved slugs keep the existing 404 "not found" behaviour.
 *
 * Visiting a city page NEVER changes the visitor's saved header location
 * ("azo_location" in localStorage) — that only changes when the user explicitly picks
 * a location from the navbar.
 */
export default function CityPage() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | notfound | error

  const load = () => {
    setState("loading");
    api.get(`/site/city/${slug}`)
      .then((r) => { setD(r.data); setState("ok"); })
      .catch((e) => setState(e?.response?.status === 404 ? "notfound" : "error"));
  };
  useEffect(load, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  if (state === "notfound") {
    return (
      <div className="bg-white min-h-screen" data-testid="city-page">
        <SiteNavbar />
        <Container className="py-24">
          <EmptyState testId="city-notfound" title="We don't serve this city yet" subtitle="Browse our services or explore another city." />
          <div className="text-center mt-6"><Link to="/services" className="text-primary-700 font-semibold">Browse all services →</Link></div>
        </Container>
        <SiteFooter />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-white min-h-screen" data-testid="city-page">
        <SiteNavbar />
        <Container className="py-24"><ErrorState onRetry={load} text="We couldn't load this city page." /></Container>
        <SiteFooter />
      </div>
    );
  }

  if (state === "loading" || !d) {
    return (
      <div className="bg-white min-h-screen" data-testid="city-page">
        <SiteNavbar />
        <Container className="py-16 space-y-4" data-testid="city-loading">
          <Sk className="h-8 w-56 rounded-full" /><Sk className="h-16 w-3/4" /><Sk className="h-6 w-1/2" /><Sk className="h-14 w-full max-w-2xl" />
        </Container>
      </div>
    );
  }

  return <Landing fixedCity={d.city} citySlug={slug} cityData={d} />;
}
