/* Tailwind palette hexes used by the web Partner panel — keeps mobile colours identical. */
export const TW = {
  slate50: "#F8FAFC", slate100: "#F1F5F9", slate200: "#E2E8F0", slate300: "#CBD5E1", slate400: "#94A3B8",
  slate500: "#64748B", slate600: "#475569", slate700: "#334155", slate800: "#1E293B", slate900: "#0F172A",
  emerald50: "#ECFDF5", emerald100: "#D1FAE5", emerald200: "#A7F3D0", emerald300: "#6EE7B7", emerald400: "#34D399",
  emerald500: "#10B981", emerald600: "#059669", emerald700: "#047857", emerald800: "#065F46",
  amber50: "#FFFBEB", amber100: "#FEF3C7", amber200: "#FDE68A", amber300: "#FCD34D", amber400: "#FBBF24",
  amber500: "#F59E0B", amber600: "#D97706", amber700: "#B45309", amber800: "#92400E",
  orange500: "#F97316", red100: "#FEE2E2", red500: "#EF4444", red600: "#DC2626", red700: "#B91C1C",
  rose500: "#F43F5E", rose200: "#FECDD3", rose50: "#FFF1F2", sky500: "#0EA5E9",
  violet100: "#EDE9FE", violet500: "#8B5CF6", violet600: "#7C3AED", fuchsia500: "#D946EF", pink500: "#EC4899",
  blue700: "#1D4ED8",
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
};

export const RANGE_LABEL: Record<string, string> = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days",
  "365d": "Last 1 year", all: "All time", custom: "Custom range",
};
