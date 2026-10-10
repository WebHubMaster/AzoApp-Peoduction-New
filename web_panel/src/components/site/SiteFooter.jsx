import React from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Youtube, Phone, Mail, ShieldCheck, Clock, Star, Play, Apple } from "lucide-react";
import { useSiteConfig } from "@/context/SiteConfigContext";

/** X (formerly Twitter) brand logo — lucide has no official X mark, so we render it inline. */
const XIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const SOCIAL = [["facebook", Facebook], ["instagram", Instagram], ["twitter", XIcon], ["youtube", Youtube]];


const FooterCol = ({ title, links }) => (
  <div>
    <p className="font-heading font-bold text-white mb-3 text-sm">{title}</p>
    <ul className="space-y-2.5 text-sm">
      {links.map(([label, to]) => (
        <li key={label}>
          <Link to={to} className="text-slate-400 hover:text-white transition-colors">{label}</Link>
        </li>
      ))}
    </ul>
  </div>
);

export default function SiteFooter() {
  const { branding, stats = {}, apps = {} } = useSiteConfig();
  const name = branding?.site_name || "AzoApp";
  const social = branding?.social || {};
  const TRUST = [
    [ShieldCheck, stats.verified_partners ? `${stats.verified_partners} verified professionals` : "Verified professionals"],
    [Star, stats.rating ? `Rated ${stats.rating} / 5` : "Rated by real customers"],
    [Clock, "On-time service"],
  ];
  return (
    <footer className="relative bg-slate-950 text-slate-300">
      {/* premium top accent */}
      <div className="h-1 w-full bg-primary-600" />

      {/* trust strip */}
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-3 gap-4">
          {TRUST.map(([Icon, label]) => (
            <div key={label} className="flex items-center justify-center sm:justify-start gap-2 text-center sm:text-left">
              <div className="h-9 w-9 rounded-full bg-white/5 flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-primary-400" /></div>
              <span className="text-xs sm:text-sm font-medium text-slate-300">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* main — 2 columns on mobile, 4 on desktop */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-10">
          {/* brand — full width on mobile */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              {branding?.logo_dark ? (
                /* When a brand logo is uploaded it already contains the wordmark —
                   show ONLY the logo (no duplicate text name beside it). */
                <img src={branding.logo_dark} alt={name} className="h-9 w-auto max-w-[180px] object-contain brightness-0 invert" />
              ) : (
                <>
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg"><span className="text-white font-heading font-black text-lg">{name[0]}</span></div>
                  <span className="font-heading font-extrabold text-xl text-white">{name}</span>
                </>
              )}
            </div>
            <p className="text-sm text-slate-400 max-w-xs">{branding?.footer_text || "Trusted, verified home-service professionals at your doorstep — book in seconds, pay securely."}</p>
          </div>

          <FooterCol title="Company" links={[["About us", "/about"], ["Contact us", "/contact"], ["Blog", "/blog"], ["All services", "/services"]]} />
          <FooterCol title="For customers" links={[["Browse categories", "/services"], ["Help & support", "/contact"], ["My account", "/login"]]} />
          {(SOCIAL.some(([k]) => social[k]) || apps?.playstore || apps?.appstore) && (
            <div data-testid="footer-follow">
              <p className="font-heading font-bold text-white mb-3 text-sm">Follow us</p>
              {SOCIAL.some(([k]) => social[k]) && (
                <div className="flex flex-wrap items-center gap-3">
                  {SOCIAL.filter(([k]) => social[k]).map(([k, Icon]) => (
                    <a key={k} href={social[k]} target="_blank" rel="noopener noreferrer" aria-label={k}
                      className="h-9 w-9 rounded-full bg-white/5 hover:bg-gradient-to-br hover:from-primary-500 hover:to-primary-700 border border-white/10 flex items-center justify-center transition-all hover:-translate-y-0.5">
                      <Icon className="h-4 w-4 text-white" />
                    </a>
                  ))}
                </div>
              )}
              {(apps?.playstore || apps?.appstore) && (
                <div className="flex flex-col gap-2 mt-4 max-w-[200px]" data-testid="footer-apps">
                  {apps?.playstore && (
                    <a href={apps.playstore} target="_blank" rel="noopener noreferrer" data-testid="footer-playstore"
                      className="inline-flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                      <Play className="h-5 w-5 text-primary-400 shrink-0" /><span className="text-[10px] text-slate-300 leading-tight whitespace-nowrap">Get it on<br/><b className="text-white text-[13px]">Google Play</b></span>
                    </a>
                  )}
                  {apps?.appstore && (
                    <a href={apps.appstore} target="_blank" rel="noopener noreferrer" data-testid="footer-appstore"
                      className="inline-flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                      <Apple className="h-5 w-5 text-white shrink-0" /><span className="text-[10px] text-slate-300 leading-tight whitespace-nowrap">Download on<br/><b className="text-white text-[13px]">App Store</b></span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <FooterCol title="For professionals" links={[["Register as a pro", "/login"], ["Partner login", "/login"], ["For merchants", "/login"]]} />
            {(branding?.phone || branding?.email) && (
              <div className="mt-4 space-y-2 text-sm text-slate-400">
                {branding?.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-primary-400" />{branding.phone}</p>}
                {branding?.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-primary-400" />{branding.email}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* bottom bar */}
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>© {new Date().getFullYear()} {name}. All rights reserved.</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms &amp; Conditions</Link>
            <Link to="/refund" className="hover:text-slate-300 transition-colors">Refund Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
