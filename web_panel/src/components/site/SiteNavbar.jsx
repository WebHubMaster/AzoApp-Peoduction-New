import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, Search, ChevronDown, ArrowRight, Menu, X, ShoppingBag, Loader2, User, CheckCircle2, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import ServiceSearch from "@/components/site/ServiceSearch";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import OutOfAreaWaitlist from "@/components/OutOfAreaWaitlist";
import MembershipBadge from "@/components/site/MembershipBadge";

const BrandMark = ({ branding }) => {
  const { isDark } = useTheme();
  const logo = isDark ? (branding?.logo_dark || branding?.logo_light) : (branding?.logo_light || branding?.logo_dark);
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0" data-testid="site-logo">
      {logo ? (
        /* Admin-set logo replaces the default text mark entirely (theme-aware) */
        <img src={logo} alt={branding?.site_name || "AzoApp"} className="h-9 w-auto max-w-[160px] object-contain" />
      ) : (
        <>
          <div className="h-9 w-9 rounded-xl bg-primary-700 flex items-center justify-center">
            <span className="text-white font-heading font-black text-lg leading-none">{(branding?.site_name || "A")[0]}</span>
          </div>
          <span className="font-heading font-extrabold text-xl text-slate-900 dark:text-white hidden sm:block">{branding?.site_name || "AzoApp"}</span>
        </>
      )}
    </Link>
  );
};

const LocationButton = () => {
  const [loc, setLoc] = useState(() => localStorage.getItem("azo_location") || "");
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [status, setStatus] = useState("idle"); // idle | locating | error | out_of_area
  const [err, setErr] = useState("");
  const [oos, setOos] = useState(null);
  // Live serviceability badge when the user types a 6-digit pincode
  const [pinCov, setPinCov] = useState(null); // {serviceable, serviced_cities}
  const [pinChecking, setPinChecking] = useState(false);
  const box = useRef();
  useEffect(() => {
    const pin = String(val || "").trim();
    if (!/^\d{6}$/.test(pin)) { setPinCov(null); setPinChecking(false); return; }
    let alive = true;
    setPinChecking(true);
    api.get(`/geo/serviceability?pincode=${pin}`)
      .then((r) => { if (alive) setPinCov(r.data); })
      .catch(() => { if (alive) setPinCov(null); })
      .finally(() => { if (alive) setPinChecking(false); });
    return () => { alive = false; };
  }, [val]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    const sync = () => setLoc(localStorage.getItem("azo_location") || "");
    window.addEventListener("azo-location-changed", sync);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("azo-location-changed", sync); };
  }, []);
  const save = () => { if (!val.trim()) return; localStorage.setItem("azo_location", val.trim()); setLoc(val.trim()); window.dispatchEvent(new Event("azo-location-changed")); setOpen(false); };
  const detect = () => {
    if (!navigator.geolocation) { setStatus("error"); setErr("Location is not supported on this device."); return; }
    setStatus("locating"); setErr(""); setOos(null);
    // Fast, low-power fix: network location + accept a recent cached position so
    // detection resolves within a second instead of waiting for a fresh GPS lock.
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      localStorage.setItem("azo_geo", JSON.stringify({ lat, lng }));
      // Show a label immediately and refine via reverse-geocode in the BACKGROUND.
      const prev = localStorage.getItem("azo_location") || "Your area";
      setLoc(prev);
      api.get(`/geo/reverse?lat=${lat}&lng=${lng}`).then((r) => {
        const d = r.data || {}; const nm = d.city || d.town || d.state;
        if (nm) { localStorage.setItem("azo_location", nm); setLoc(nm); window.dispatchEvent(new Event("azo-location-changed")); }
      }).catch(() => {});
      window.dispatchEvent(new Event("azo-location-changed"));
      const cov = await api.get("/serviceability", { params: { lat, lng } }).then((r) => r.data).catch(() => null);
      if (cov && cov.serviceable === false) {
        const rev = await Promise.race([
          api.get(`/geo/reverse?lat=${lat}&lng=${lng}`).then((r) => r.data).catch(() => ({})),
          new Promise((res) => setTimeout(() => res({}), 1500)),
        ]);
        setOos({ city: rev.city || rev.town || rev.state || "Your area", pincode: rev.postcode || rev.pincode || "", servicedCities: cov.serviced_cities || [] });
        setStatus("out_of_area");
        return;
      }
      setStatus("idle"); setOpen(false);
    }, (e) => {
      setStatus("error");
      setErr(e && e.code === 1
        ? "Location permission denied. Enable it in your browser's site settings, then retry."
        : "Couldn't detect your location. Please retry or enter it manually.");
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  };
  return (
    <div className="relative" ref={box}>
      <button data-testid="nav-location" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 hover:border-primary-300 text-sm text-slate-700 max-w-[200px] transition-colors">
        <MapPin className="h-4 w-4 text-primary-700 shrink-0" strokeWidth={2} />
        <span className="truncate font-medium">{loc || "Select location"}</span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50">
          {status === "out_of_area" && oos ? (
            <OutOfAreaWaitlist compact city={oos.city} pincode={oos.pincode} servicedCities={oos.servicedCities} onClose={() => { setStatus("idle"); setOos(null); }} />
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800 mb-2">Where do you need service?</p>
              <div className="flex gap-2">
                <input data-testid="nav-location-input" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="City or pincode" className="h-10 px-3 flex-1 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" />
                <Button data-testid="nav-location-set" onClick={save} className="bg-primary-700 hover:bg-primary-800 h-10">Set</Button>
              </div>
              {/^\d{6}$/.test(String(val || "").trim()) && (
                <div data-testid="nav-pincode-badge" className="mt-2">
                  {pinChecking ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking availability…
                    </span>
                  ) : pinCov && pinCov.serviceable === true ? (
                    <span data-testid="nav-pincode-serviceable" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> We serve your area
                    </span>
                  ) : pinCov && pinCov.serviceable === false ? (
                    <span data-testid="nav-pincode-blocked" className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold px-3 py-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Not in service area yet
                    </span>
                  ) : null}
                </div>
              )}
              <button data-testid="nav-detect-location" onClick={detect} disabled={status === "locating"} className="mt-3 text-sm text-primary-700 font-medium flex items-center gap-1.5 disabled:opacity-70">
                {status === "locating"
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Detecting your location…</>
                  : <><MapPin className="h-4 w-4" /> Use my current location</>}
              </button>
              {status === "error" && (
                <div className="mt-2 text-xs text-red-600 leading-relaxed">
                  {err} <button onClick={detect} className="underline font-medium">Retry</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Warm the (lazy-loaded) dashboard chunk so a logged-in user's profile/Account
// tap opens INSTANTLY instead of waiting for the JS chunk to download on click.
// Paths mirror the React.lazy() imports in App.js; webpack de-dupes the chunk.
const DASH_IMPORT = {
  customer: () => import("@/pages/customer/CustomerDashboard"),
  partner: () => import("@/pages/partner/PartnerRoot"),
  merchant: () => import("@/pages/merchant/MerchantRoot"),
  admin: () => import("@/pages/admin/AdminDashboard"),
};
let _dashPrefetched = "";
const prefetchDash = (role) => {
  if (!role || _dashPrefetched === role) return;
  const imp = DASH_IMPORT[role];
  if (imp) { _dashPrefetched = role; imp().catch(() => { _dashPrefetched = ""; }); }
};

export default function SiteNavbar({ showSearch = true }) {
  const { user } = useAuth();
  const { count } = useCart();
  const { branding } = useSiteConfig();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const dash = { customer: "/account", partner: "/partner", merchant: "/merchant", admin: "/admin" }[user?.role];
  // As soon as a logged-in user views the navbar, quietly prefetch their dashboard
  // chunk so tapping the profile icon feels instant.
  useEffect(() => { if (user?.role) prefetchDash(user.role); }, [user?.role]);
  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-slate-200/70 shadow-[0_1px_0_rgba(15,23,42,0.02)]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3 sm:gap-5">
        <BrandMark branding={branding} />
        <div className="hidden md:block"><LocationButton /></div>
        {showSearch && (
          <div className="relative flex-1 max-w-xl hidden md:block">
            <ServiceSearch variant="navbar" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button onClick={() => navigate("/services")} className="hidden lg:inline-flex items-center h-10 px-3 rounded-xl text-sm font-semibold text-slate-700 hover:text-primary-700 hover:bg-primary-50 transition-colors">All Services</button>
          <button data-testid="nav-membership" onClick={() => navigate("/membership")} className="text-sm font-semibold text-amber-600 hover:text-amber-700 hidden lg:flex items-center gap-1.5"><MembershipBadge size={24} /> Membership</button>
          {/* Premium animated gold Membership badge (mobile/tablet) */}
          <button data-testid="nav-membership-mobile" onClick={() => navigate("/membership")} aria-label="Membership"
            className="relative lg:hidden h-10 w-10 flex items-center justify-center shrink-0 transition-transform hover:scale-105 active:scale-95">
            <MembershipBadge size={36} />
          </button>
          {/* Mobile search icon → opens popup */}
          <button data-testid="nav-search-mobile" onClick={() => setSearchOpen(true)} className="md:hidden h-10 w-10 rounded-full border border-slate-200 hover:border-primary-300 flex items-center justify-center text-slate-700">
            <Search className="h-5 w-5" />
          </button>
          <button data-testid="nav-cart" onClick={() => navigate("/book")} className="relative h-10 w-10 rounded-xl border border-slate-200 hover:border-primary-300 flex items-center justify-center text-slate-700">
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && <span data-testid="nav-cart-count" className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-primary-700 text-white text-[11px] font-bold flex items-center justify-center">{count}</span>}
          </button>
          {user ? (
            <>
              {/* Mobile: circular profile icon */}
              <button data-testid="nav-account-mobile" onClick={() => navigate(dash)} className="sm:hidden h-10 w-10 rounded-full bg-primary-700 hover:bg-primary-800 text-white flex items-center justify-center shadow-sm">
                <User className="h-5 w-5" />
              </button>
              {/* Desktop: text button */}
              <Button data-testid="nav-dashboard" onClick={() => navigate(dash)} className="bg-primary-700 hover:bg-primary-800 rounded-xl hidden sm:inline-flex">Account <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </>
          ) : (
            <>
              <button onClick={() => navigate("/login")} className="hidden lg:inline-flex items-center h-10 px-3 rounded-xl text-sm font-semibold text-slate-700 hover:text-primary-700 hover:bg-primary-50 transition-colors">Become a Partner</button>
              {/* Mobile: circular profile icon */}
              <button data-testid="nav-login-mobile" onClick={() => navigate("/login")} className="sm:hidden h-10 w-10 rounded-full bg-primary-700 hover:bg-primary-800 text-white flex items-center justify-center shadow-sm">
                <User className="h-5 w-5" />
              </button>
              {/* Desktop: text button */}
              <Button data-testid="nav-login" onClick={() => navigate("/login")} className="bg-primary-700 hover:bg-primary-800 rounded-xl hidden sm:inline-flex">Sign In</Button>
            </>
          )}
          <button onClick={() => setMobileOpen((o) => !o)} className="md:hidden h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {/* Mobile search popup */}
      {searchOpen && (
        <div className="fixed inset-0 z-[80] md:hidden" data-testid="mobile-search-modal">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <div className="absolute top-0 left-0 right-0 bg-white rounded-b-2xl shadow-xl p-4 pt-4">
            <div className="flex items-center gap-2">
              <div className="flex-1"><ServiceSearch variant="navbar" autoFocus placeholder="Search services…" /></div>
              <button data-testid="mobile-search-close" onClick={() => setSearchOpen(false)} className="h-10 px-3 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-900">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 px-4 py-3 space-y-3 bg-white">
          <LocationButton />
          <button onClick={() => { navigate("/services"); setMobileOpen(false); }} className="block text-sm font-semibold text-slate-700">All Services</button>
          <button onClick={() => { navigate("/membership"); setMobileOpen(false); }} className="flex items-center gap-1.5 text-sm font-semibold text-amber-600"><MembershipBadge size={22} /> Membership</button>
        </div>
      )}
    </header>
  );
}
