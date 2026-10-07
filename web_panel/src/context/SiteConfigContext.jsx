import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { mediaSrc } from "@/lib/api";

const SiteConfigContext = createContext({ branding: {}, theme: {}, loaded: false });

// Convert #RRGGBB -> {h,s,l} numbers
export const hexToHsl = (hex) => {
  if (!hex) return null;
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  return { h: Math.round(hue * 360), s: Math.round(sat * 100), l: Math.round(l * 100) };
};

// Convert #RRGGBB -> "H S% L%" string for CSS variables
export const hexToHslString = (hex) => {
  const c = hexToHsl(hex);
  return c ? `${c.h} ${c.s}% ${c.l}%` : null;
};

// Generate a full 50-900 tint/shade scale from a single brand colour
const SHADE_L = { 50: 97, 100: 94, 200: 87, 300: 78, 400: 66, 500: 56, 600: 50, 700: 44, 800: 37, 900: 29 };
export const genPalette = (hex) => {
  const c = hexToHsl(hex);
  if (!c) return null;
  const s = Math.min(95, Math.max(35, c.s));
  const out = {};
  Object.entries(SHADE_L).forEach(([k, l]) => { out[k] = `hsl(${c.h} ${s}% ${l}%)`; });
  return out;
};

export const applySiteTheme = (theme = {}) => {
  const root = document.documentElement;
  // Primary drives the entire numbered palette (buttons, accents, links)
  const primary = theme.primary || "#0D47A1";
  const pal = genPalette(primary);
  if (pal) Object.entries(pal).forEach(([k, v]) => root.style.setProperty(`--p-${k}`, v));
  const primaryHsl = hexToHslString(primary);
  if (primaryHsl) { root.style.setProperty("--primary", primaryHsl); root.style.setProperty("--ring", primaryHsl); }
  const accHsl = hexToHslString(theme.accent);
  if (accHsl) root.style.setProperty("--accent", accHsl);
  const secHsl = hexToHslString(theme.secondary);
  if (secHsl) root.style.setProperty("--secondary-foreground", secHsl);
};

export const applyFavicon = (href) => {
  if (!href) return;
  // Resolve relative ("/api/media/...") favicons to an absolute backend URL so the
  // browser fetches from the right origin, and cache-bust so a replaced favicon
  // (same slot) refreshes live instead of showing the cached old icon.
  const abs = mediaSrc(href);
  const bust = abs + (abs.includes("?") ? "&" : "?") + "v=" + Date.now();
  // Keep favicon + apple-touch-icon in sync; create the <link> if the page lacks one.
  const rels = ["icon", "shortcut icon", "apple-touch-icon"];
  rels.forEach((rel) => {
    let link = document.querySelector(`link[rel='${rel}']`);
    if (!link) { link = document.createElement("link"); link.rel = rel; document.head.appendChild(link); }
    link.href = bust;
  });
};

export const SiteConfigProvider = ({ children }) => {
  const [cfg, setCfg] = useState({ branding: {}, theme: {}, maintenance: { enabled: false }, membership_enabled: true, loaded: false });
  const load = useCallback(async (doApply, firstLoad) => {
    try {
      const r = await api.get("/site/config");
      const data = r.data || {};
      setCfg({ branding: data.branding || {}, theme: data.theme || {}, stats: data.stats || {}, apps: data.apps || {}, currency: data.currency, maps_api_key: data.maps_api_key || "", cancellation_reasons: data.cancellation_reasons || [], seo: data.seo || {}, fee_info: data.fee_info || {}, maintenance: data.maintenance || { enabled: false }, membership_enabled: data.membership_enabled !== false, loaded: true });
      if (doApply) {
        applySiteTheme(data.theme || {});
        const b = data.branding || {};
        // Favicon updates live (on first load + after an admin saves branding)
        applyFavicon(b.favicon);
        // Tab title reflects live branding: "<Site Name> — <Tagline>". Runs on first
        // load + after an admin saves branding (doApply=true); the silent poll
        // (doApply=false) skips this so page-level SEO <title>s aren't clobbered.
        if (b.site_name) document.title = b.tagline ? `${b.site_name} — ${b.tagline}` : b.site_name;
      }
    } catch {
      setCfg((p) => ({ ...p, loaded: true }));
    }
  }, []);
  useEffect(() => {
    load(true, true);
    // live poll so maintenance mode reflects app-wide without a manual refresh
    const t = setInterval(() => load(false, false), 60000);
    return () => clearInterval(t);
  }, [load]);
  // refresh() re-fetches + re-applies theme/favicon instantly (call after admin saves branding)
  const refresh = useCallback(() => load(true, false), [load]);
  return <SiteConfigContext.Provider value={{ ...cfg, refresh }}>{children}</SiteConfigContext.Provider>;
};

export const useSiteConfig = () => useContext(SiteConfigContext);
