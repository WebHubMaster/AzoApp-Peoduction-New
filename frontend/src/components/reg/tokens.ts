/* Tailwind tokens used by the web registration pages — keeps mobile 1:1. */
import { useMemo } from "react";
import { palette, useTheme } from "@/src/theme";
import { TW as BASE } from "@/src/components/partner/home/tw";

export const TW = {
  ...BASE,
  red50: "#FEF2F2", red200: "#FECACA",
  rose100: "#FFE4E6", rose700: "#BE123C",
  sky100: "#E0F2FE", sky200: "#BAE6FD",
  emerald100: "#D1FAE5", emerald200: "#A7F3D0", emerald300: "#6EE7B7",
  amber100: "#FEF3C7", amber200: "#FDE68A", amber300: "#FCD34D", amber500: "#F59E0B", amber600: "#D97706", amber700: "#B45309", amber800: "#92400E",
};

export const GRAD_BAR = ["#0D47A1", "#0B3D8C", "#072a63"] as const;
export const GRAD_SCORE = ["#0D47A1", "#1565C0"] as const;

/* text-sm / text-xs / text-lg … */
export const T = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl2: { fontSize: 24, lineHeight: 32 },
  px11: { fontSize: 11, lineHeight: 16 },
  px10: { fontSize: 10, lineHeight: 14 },
} as const;

export function usePal() {
  const { brand } = useTheme();
  return useMemo(() => palette(brand.primary), [brand.primary]);
}
