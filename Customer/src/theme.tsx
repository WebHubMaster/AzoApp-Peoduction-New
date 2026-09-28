/**
 * Theme tokens — mirror web_panel/src/index.css (:root / .dark) + Tailwind palette,
 * so the Customer App renders the exact same colors as the Customer Web Panel.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";

/* Brand palette (--p-50 … --p-900) — DEFAULT values; overridden at runtime from the
 * Admin "Branding & Theme" primary colour via applyBrandPrimary() so the WHOLE app
 * (every PRIMARY[...] reference) follows the admin's chosen colour. */
let _dark = false;
export const isDarkNow = () => _dark;
function setGlobalDark(d: boolean) { _dark = d; Object.assign(TC, d ? DARK : LIGHT); }
const rgba = (hex: string, a: number) => {
  const n = parseInt((hex || "#000000").replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
/* Dark-aware palette: light tints (50/100/200) become translucent tints of the 500
 * shade and deep text shades (700/800) become light shades, so every
 * `X[50]` card / `X[700]` label in the app flips correctly in dark mode. */
function pal<T extends Record<number, string>>(base: T): T {
  const out: any = {};
  Object.keys(base).forEach((k) => {
    const key = Number(k);
    Object.defineProperty(out, key, {
      enumerable: true,
      get() {
        if (!_dark) return base[key];
        const mid = base[500] || base[600] || base[700];
        if (key === 50) return rgba(mid, 0.14);
        if (key === 100) return rgba(mid, 0.22);
        if (key === 200) return rgba(mid, 0.38);
        if (key === 700) return base[400] || base[300] || base[key];
        if (key === 800) return base[300] || base[200] || base[key];
        return base[key];
      },
    });
  });
  return out as T;
}

const _P: Record<number, string> = {
  50: "#EBF3FE",
  100: "#CFE2FC",
  200: "#A1C6F8",
  300: "#6BA4F1",
  400: "#3682E8",
  500: "#1666D3",
  600: "#1258B7",
  700: "#0D4BA0",
  800: "#0A3F89",
  900: "#073473",
};
/* PRIMARY keeps 700/800 as-is in dark (used as solid button backgrounds); only tints flip. */
export const PRIMARY: Record<number, string> = {} as any;
Object.keys(_P).forEach((k) => {
  const key = Number(k);
  Object.defineProperty(PRIMARY, key, {
    enumerable: true,
    get() {
      if (!_dark) return _P[key];
      if (key === 50) return rgba(_P[500], 0.16);
      if (key === 100) return rgba(_P[500], 0.26);
      if (key === 200) return rgba(_P[500], 0.4);
      return _P[key];
    },
  });
});

/* Generate a full 50→900 tint/shade scale from a single brand hex (mirrors the web
 * SiteConfig genPalette + Partner theme.ts palette). */
const SHADE_L: Record<number, number> = { 50: 97, 100: 94, 200: 87, 300: 78, 400: 66, 500: 56, 600: 50, 700: 44, 800: 37, 900: 29 };
function hexToHsl(hex: string) {
  const n = parseInt((hex || "").replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100; const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => { const k = (n + h / 30) % 12; const c = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function genPalette(hex: string): Record<number, string> {
  const c = hexToHsl(hex); const sat = Math.min(95, Math.max(35, c.s));
  const out: Record<number, string> = {};
  Object.entries(SHADE_L).forEach(([k, l]) => { out[Number(k)] = hslToHex(c.h, sat, l); });
  return out;
}
let _brandHex = "";
/** Overwrite the shared PRIMARY scale + primary theme tokens IN PLACE so every
 * `PRIMARY[...]` import across the app reflects the admin's brand colour. */
export function applyBrandPrimary(hex?: string) {
  if (!hex || !/^#?[0-9A-Fa-f]{6}$/.test(hex) || hex === _brandHex) return;
  _brandHex = hex;
  Object.assign(_P, genPalette(hex));
  LIGHT.primaryText = _P[700]; LIGHT.primarySoft = _P[50];
  DARK.primaryText = _P[300]; DARK.primarySoft = rgba(_P[500], 0.18);
  Object.assign(TC, _dark ? DARK : LIGHT);
}

export const SLATE = {
  50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8",
  500: "#64748B", 600: "#475569", 700: "#334155", 800: "#1E293B", 900: "#0F172A", 950: "#020617",
};
export const EMERALD = pal({ 50: "#ECFDF5", 100: "#D1FAE5", 200: "#A7F3D0", 300: "#6EE7B7", 400: "#34D399", 500: "#10B981", 600: "#059669", 700: "#047857" });
export const AMBER = pal({ 50: "#FFFBEB", 100: "#FEF3C7", 200: "#FDE68A", 300: "#FCD34D", 400: "#FBBF24", 500: "#F59E0B", 600: "#D97706", 700: "#B45309" });
export const ORANGE = { 500: "#F97316", 600: "#EA580C" };
export const ROSE = pal({ 50: "#FFF1F2", 100: "#FFE4E6", 200: "#FECDD3", 300: "#FDA4AF", 400: "#FB7185", 500: "#F43F5E", 600: "#E11D48", 700: "#BE123C" });
export const SKY = pal({ 50: "#F0F9FF", 100: "#E0F2FE", 200: "#BAE6FD", 300: "#7DD3FC", 400: "#38BDF8", 500: "#0EA5E9", 700: "#0369A1" });
export const BLUE = pal({ 50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE", 300: "#93C5FD", 400: "#60A5FA", 500: "#3B82F6", 700: "#1D4ED8" });
export const VIOLET = pal({ 50: "#F5F3FF", 100: "#EDE9FE", 200: "#DDD6FE", 300: "#C4B5FD", 400: "#A78BFA", 500: "#8B5CF6", 700: "#6D28D9" });
export const INDIGO = pal({ 50: "#EEF2FF", 100: "#E0E7FF", 200: "#C7D2FE", 300: "#A5B4FC", 400: "#818CF8", 500: "#6366F1", 700: "#4338CA" });

export interface ThemeColors {
  bg: string;        // page background (slate-50 / slate-950)
  surface: string;   // card (white / slate-900)
  surfaceAlt: string; // slate-100 / slate-800
  border: string;    // slate-200 / slate-800
  borderSoft: string; // slate-100 / slate-800
  text: string;      // slate-900 / white
  textMuted: string; // slate-500 / slate-400
  textFaint: string; // slate-400
  primaryText: string; // primary-700 / primary-300
  primarySoft: string; // primary-50 / primary-900 tint
  text2: string;     // slate-700 / slate-300 (body copy)
  page: string;      // white page / slate-950 (site pages)
  input: string;     // input field bg (slate-50 / slate-800)
}

const LIGHT: ThemeColors = {
  bg: SLATE[50], surface: "#FFFFFF", surfaceAlt: SLATE[100], border: SLATE[200], borderSoft: SLATE[100],
  text: SLATE[900], textMuted: SLATE[500], textFaint: SLATE[400], primaryText: _P[700], primarySoft: _P[50],
  text2: SLATE[700], page: "#FFFFFF", input: SLATE[50],
};
const DARK: ThemeColors = {
  bg: SLATE[950], surface: SLATE[900], surfaceAlt: SLATE[800], border: SLATE[800], borderSoft: SLATE[800],
  text: "#FFFFFF", textMuted: SLATE[400], textFaint: SLATE[400], primaryText: _P[300], primarySoft: rgba(_P[500], 0.18),
  text2: SLATE[300], page: SLATE[950], input: SLATE[800],
};

/** Module-level theme colours (mutated in place by ThemeProvider, like PRIMARY) so leaf
 * components can read `TC.surface` etc. without a hook. Screens call useTheme() to re-render. */
export const TC: ThemeColors = { ...LIGHT };

interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
  c: ThemeColors;
}
const Ctx = createContext<ThemeCtx>({ isDark: false, toggle: () => {}, c: LIGHT });
const KEY = "azo_theme";

export const ThemeProvider = ({ children, brandPrimary }: { children: React.ReactNode; brandPrimary?: string }) => {
  const [isDark, setDark] = useState(false);
  useEffect(() => { storage.getItem(KEY).then((v) => { if (v === "dark") setDark(true); }); }, []);
  // Apply the admin brand colour synchronously (before children render) so every
  // PRIMARY[...] reference in the tree uses it.
  useMemo(() => { applyBrandPrimary(brandPrimary); return brandPrimary; }, [brandPrimary]);
  setGlobalDark(isDark);
  const value = useMemo(() => ({
    isDark,
    c: isDark ? DARK : LIGHT,
    toggle: () => setDark((d) => { storage.setItem(KEY, d ? "light" : "dark"); return !d; }),
  }), [isDark, brandPrimary]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useTheme = () => useContext(Ctx);

/* shadow helpers (web: shadow-primarybtn / azo-elev) */
export const shadowBtn = { boxShadow: "0px 2px 6px rgba(13,71,161,0.30)" } as const;
export const shadowElev = { boxShadow: "0px 1px 0px rgba(15,23,42,0.03), 0px 10px 30px -18px rgba(15,23,42,0.25)" } as const;
