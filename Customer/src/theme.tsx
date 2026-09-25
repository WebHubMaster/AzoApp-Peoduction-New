/**
 * Theme tokens — mirror web_panel/src/index.css (:root / .dark) + Tailwind palette,
 * so the Customer App renders the exact same colors as the Customer Web Panel.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { storage } from "@/src/utils/storage";

/* Brand palette (--p-50 … --p-900), converted from the HSL values in index.css */
export const PRIMARY = {
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

export const SLATE = {
  50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8",
  500: "#64748B", 600: "#475569", 700: "#334155", 800: "#1E293B", 900: "#0F172A", 950: "#020617",
};
export const EMERALD = { 50: "#ECFDF5", 100: "#D1FAE5", 200: "#A7F3D0", 400: "#34D399", 500: "#10B981", 600: "#059669", 700: "#047857" };
export const AMBER = { 50: "#FFFBEB", 100: "#FEF3C7", 200: "#FDE68A", 300: "#FCD34D", 400: "#FBBF24", 500: "#F59E0B", 600: "#D97706", 700: "#B45309" };
export const ORANGE = { 500: "#F97316", 600: "#EA580C" };
export const ROSE = { 50: "#FFF1F2", 100: "#FFE4E6", 200: "#FECDD3", 500: "#F43F5E", 600: "#E11D48", 700: "#BE123C" };
export const SKY = { 50: "#F0F9FF", 100: "#E0F2FE", 200: "#BAE6FD", 700: "#0369A1" };
export const BLUE = { 50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE", 700: "#1D4ED8" };
export const VIOLET = { 50: "#F5F3FF", 100: "#EDE9FE", 500: "#8B5CF6", 700: "#6D28D9" };
export const INDIGO = { 50: "#EEF2FF", 100: "#E0E7FF", 700: "#4338CA" };

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
}

const LIGHT: ThemeColors = {
  bg: SLATE[50], surface: "#FFFFFF", surfaceAlt: SLATE[100], border: SLATE[200], borderSoft: SLATE[100],
  text: SLATE[900], textMuted: SLATE[500], textFaint: SLATE[400], primaryText: PRIMARY[700], primarySoft: PRIMARY[50],
};
const DARK: ThemeColors = {
  bg: SLATE[950], surface: SLATE[900], surfaceAlt: SLATE[800], border: SLATE[800], borderSoft: SLATE[800],
  text: "#FFFFFF", textMuted: SLATE[400], textFaint: SLATE[400], primaryText: PRIMARY[300], primarySoft: "rgba(7,52,115,0.30)",
};

interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
  c: ThemeColors;
}
const Ctx = createContext<ThemeCtx>({ isDark: false, toggle: () => {}, c: LIGHT });
const KEY = "azo_theme";

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDark, setDark] = useState(false);
  useEffect(() => { storage.getItem(KEY).then((v) => { if (v === "dark") setDark(true); }); }, []);
  const value = useMemo(() => ({
    isDark,
    c: isDark ? DARK : LIGHT,
    toggle: () => setDark((d) => { storage.setItem(KEY, d ? "light" : "dark"); return !d; }),
  }), [isDark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useTheme = () => useContext(Ctx);

/* shadow helpers (web: shadow-primarybtn / azo-elev) */
export const shadowBtn = { boxShadow: "0px 2px 6px rgba(13,71,161,0.30)" } as const;
export const shadowElev = { boxShadow: "0px 1px 0px rgba(15,23,42,0.03), 0px 10px 30px -18px rgba(15,23,42,0.25)" } as const;
