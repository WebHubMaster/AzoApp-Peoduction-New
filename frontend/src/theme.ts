/**
 * AzoApp Partner/Merchant — theme tokens + helpers.
 * Colors mirror the Admin "Brand & Theme" config; the primary/secondary/accent
 * can be overridden at runtime from GET /api/site/config (BrandProvider feeds
 * the live values into ThemeProvider). Every screen reads colors via useTheme()
 * and builds styles with makeStyles().
 */
import { useMemo, useState } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import React, { createContext, useContext } from "react";

export type ThemeMode = "light" | "dark";

export interface ThemeColors {
  // brand
  primary: string;
  primaryDark: string;
  primaryHover: string;
  primarySubtle: string;
  secondary: string;
  accent: string;
  onPrimary: string;
  // surfaces
  background: string;
  surface: string;
  surfaceSubtle: string;
  card: string;
  border: string;
  // text
  text: string;
  textSecondary: string;
  textMuted: string;
  // status
  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;
  info: string;
  infoSubtle: string;
  // misc
  overlay: string;
  tabBar: string;
  tabActive: string;
  tabInactive: string;
}

const BASE_BRAND = {
  primary: "#0659B2",
  secondary: "#1E7AD6",
  accent: "#F59E0B",
};

/** Mirrors web SiteConfigContext.genPalette — HSL tint/shade scale from one brand colour. */
const SHADE_L: Record<number, number> = { 50: 97, 100: 94, 200: 87, 300: 78, 400: 66, 500: 56, 600: 50, 700: 44, 800: 37, 900: 29 };
function hexToHsl(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2;
  let h = 0, sat = 0;
  if (max !== min) {
    const d = max - min; sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return { h: Math.round(h), s: Math.round(sat * 100), l: Math.round(l * 100) };
}
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100; const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => { const k = (n + h / 30) % 12; const c = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export function palette(hex: string): Record<number, string> {
  const c = hexToHsl(hex); const sat = Math.min(95, Math.max(35, c.s));
  const out: Record<number, string> = {};
  Object.entries(SHADE_L).forEach(([k, l]) => { out[Number(k)] = hslToHex(c.h, sat, l); });
  return out;
}

function buildColors(mode: ThemeMode, brand: typeof BASE_BRAND): ThemeColors {
  const P = palette(brand.primary);
  if (mode === "dark") {
    return {
      primary: P[500],
      primaryDark: P[800],
      primaryHover: P[700],
      primarySubtle: "rgba(6, 89, 178, 0.28)",
      secondary: P[600],
      accent: brand.accent,
      onPrimary: "#FFFFFF",
      background: "#0B1120",
      surface: "#1E293B",
      surfaceSubtle: "#111827",
      card: "#1E293B",
      border: "#334155",
      text: "#F8FAFC",
      textSecondary: "#CBD5E1",
      textMuted: "#94A3B8",
      success: "#34D399",
      successSubtle: "rgba(16,185,129,0.16)",
      warning: "#FBBF24",
      warningSubtle: "rgba(245,158,11,0.16)",
      danger: "#FB7185",
      dangerSubtle: "rgba(244,63,94,0.16)",
      info: "#60A5FA",
      infoSubtle: "rgba(59,130,246,0.16)",
      overlay: "rgba(0,0,0,0.6)",
      tabBar: "#111827",
      tabActive: P[500],
      tabInactive: "#94A3B8",
    };
  }
  return {
    primary: P[700],
    primaryDark: P[800],
    primaryHover: P[700],
    primarySubtle: P[50],
    secondary: P[600],
    accent: brand.accent,
    onPrimary: "#FFFFFF",
    background: "#F8F7FA",
    surface: "#FFFFFF",
    surfaceSubtle: "#F1F5F9",
    card: "#FFFFFF",
    border: "#E7EBF1",
    text: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#64748B",
    success: "#059669",
    successSubtle: "#ECFDF5",
    warning: "#D97706",
    warningSubtle: "#FFFBEB",
    danger: "#E11D48",
    dangerSubtle: "#FFF1F2",
    info: "#2563EB",
    infoSubtle: "#EFF6FF",
    overlay: "rgba(15,23,42,0.45)",
    tabBar: "#FFFFFF",
    tabActive: P[700],
    tabInactive: "#94A3B8",
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  hero: 32,
};

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
}

interface ThemeContextValue extends Theme {
  brand: { primary: string; secondary: string; accent: string };
  toggleMode: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({
  children,
  brand,
  forcedMode,
}: {
  children: React.ReactNode;
  brand?: Partial<typeof BASE_BRAND>;
  forcedMode?: ThemeMode;
}) => {
  const system = useColorScheme();
  const [override, setOverride] = useState<ThemeMode | undefined>(forcedMode);
  const mode: ThemeMode = override || (system === "dark" ? "dark" : "light");
  const mergedBrand = { ...BASE_BRAND, ...(brand || {}) };
  const toggleMode = () => setOverride((m) => ((m || mode) === "dark" ? "light" : "dark"));
  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: buildColors(mode, mergedBrand),
      spacing,
      radius,
      fontSize,
      brand: mergedBrand,
      toggleMode,
      setMode: setOverride,
    }),
    [mode, mergedBrand.primary, mergedBrand.secondary, mergedBrand.accent],
  );
  return React.createElement(ThemeContext.Provider, { value }, children);
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for any component rendered outside the provider (should not happen)
    return {
      mode: "light",
      colors: buildColors("light", BASE_BRAND),
      spacing,
      radius,
      fontSize,
      brand: BASE_BRAND,
      toggleMode: () => {},
      setMode: () => {},
    };
  }
  return ctx;
}

type NamedStyles<T> = { [P in keyof T]: object };

/**
 * makeStyles — build a themed StyleSheet. Usage:
 *   const useStyles = makeStyles((t) => ({ box: { backgroundColor: t.colors.surface } }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends NamedStyles<T>>(
  factory: (theme: Theme) => T,
) {
  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(
      () => StyleSheet.create(factory(theme) as any),
      [theme.mode, theme.colors.primary],
    );
  };
}
