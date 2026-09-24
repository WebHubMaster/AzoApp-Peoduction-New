// Scan QR module — shared data ported 1:1 from the Web Panel
// (web_panel/src/pages/merchant/scanqr/qrData.js). Keeps the Mobile App's Scan QR
// visually + behaviourally identical to the web merchant panel.

export interface Template {
  id: string;
  label: string;
  variant: "solid" | "light" | "gradient" | "band" | "minimal" | "soft" | "print" | "luxe" | "cream";
  primary: string;
  primary2?: string;
  accent?: string;
}

export const TEMPLATES: Template[] = [
  { id: "classic_blue", label: "Classic Blue", variant: "solid", primary: "#0D47A1" },
  { id: "premium_dark", label: "Premium Dark", variant: "solid", primary: "#0B1220", accent: "#60A5FA" },
  { id: "modern_white", label: "Modern White", variant: "light", primary: "#0D47A1" },
  { id: "gradient_blue", label: "Gradient Blue", variant: "gradient", primary: "#0D47A1", primary2: "#2563EB" },
  { id: "professional", label: "Professional", variant: "band", primary: "#0D47A1" },
  { id: "minimal", label: "Minimal", variant: "minimal", primary: "#0D47A1" },
  { id: "home_services", label: "Home Services", variant: "soft", primary: "#0D47A1" },
  { id: "festival", label: "Festival / Offer", variant: "gradient", primary: "#B91C1C", primary2: "#F59E0B" },
  { id: "social_square", label: "Square Social", variant: "gradient", primary: "#0D47A1", primary2: "#7C3AED" },
  { id: "a4_print", label: "A4 Print", variant: "print", primary: "#0D47A1" },
  { id: "dark_gold", label: "Dark Gold", variant: "luxe", primary: "#0B1220", accent: "#E8C368" },
  { id: "minimal_luxury", label: "Minimal Luxury", variant: "cream", primary: "#B8860B" },
  { id: "royal_purple", label: "Royal Purple", variant: "gradient", primary: "#4C1D95", primary2: "#7C3AED" },
  { id: "emerald_pro", label: "Emerald Pro", variant: "gradient", primary: "#065F46", primary2: "#10B981" },
  { id: "sunset_offer", label: "Sunset Offer", variant: "gradient", primary: "#DB2777", primary2: "#F59E0B" },
  { id: "midnight_teal", label: "Midnight Teal", variant: "gradient", primary: "#0F766E", primary2: "#0B3B37" },
];

export interface ColorPreset {
  id: string;
  label: string;
  primary: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: "azo_blue", label: "AzoApp Blue", primary: "#0D47A1" },
  { id: "emerald", label: "Emerald", primary: "#059669" },
  { id: "purple", label: "Purple", primary: "#7C3AED" },
  { id: "orange", label: "Orange", primary: "#EA580C" },
  { id: "navy", label: "Dark Navy", primary: "#0B1220" },
];

export const DEFAULT_SERVICES = ["Electrician", "Plumber", "AC Repair", "Appliance Repair", "Carpenter", "Cleaning"];

export interface QrConfig {
  template: string;
  preset: string;
  primary: string;
  headline: string;
  subheadline: string;
  tagline: string;
  cta: string;
  services: string[];
  qrPosition: string;
  qrSize: string;
  posterSize: string;
  logoUrl: string;
  phone: string;
  address: string;
  website: string;
  businessName?: string;
  show: { logo: boolean; tagline: boolean };
}

export const DEFAULT_CONFIG: QrConfig = {
  template: "classic_blue",
  preset: "azo_blue",
  primary: "#0D47A1",
  headline: "Scan to Book a Service",
  subheadline: "Trusted Home Services at Your Doorstep",
  tagline: "Trusted Home Services",
  cta: "Scan QR & Book Now",
  services: DEFAULT_SERVICES,
  qrPosition: "center",
  qrSize: "medium",
  posterSize: "social_square",
  logoUrl: "",
  phone: "",
  address: "",
  website: "",
  // Only merchant-toggleable elements. Other blocks are always hidden.
  show: { logo: true, tagline: true },
};

// ── colour helpers (ported from web) ──
export function adjust(hex: string, amt = 0): string {
  try {
    let h = (hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return hex;
    const n = parseInt(h, 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  } catch {
    return hex;
  }
}

// Append 8-bit hex alpha to a #RRGGBB colour (RN + browsers accept #RRGGBBAA).
export function withAlpha(hex: string, aa: string): string {
  return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${aa}` : hex;
}

export const isHex6 = (v?: string) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

// ── poster brand identity (fixed AzoApp service categories + icon paths) ──
// Lucide icon path data (v1.48.0) so the native SVG preview and the HTML export
// render the exact same glyphs used on the web poster.
export const LUCIDE: Record<string, string[]> = {
  lightbulb: [
    "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
    "M9 18h6",
    "M10 22h4",
  ],
  airVent: [
    "M18 17.5a2.5 2.5 0 1 1-4 2.03V12",
    "M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
    "M6 8h12",
    "M6.6 15.572A2 2 0 1 0 10 17v-5",
  ],
  refrigerator: ["M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z", "M5 10h14", "M15 7v6"],
  cctv: [
    "M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97",
    "M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z",
    "M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15",
    "M2 21v-4",
    "M7 9h.01",
  ],
  home: [
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  chevronRight: ["m9 18 6-6-6-6"],
};

export interface PosterService {
  icon: keyof typeof LUCIDE;
  label: string; // may contain \n for 2-line labels
}

export const POSTER_SERVICES: PosterService[] = [
  { icon: "lightbulb", label: "Electrical\nWork" },
  { icon: "airVent", label: "AC Service\n& Repair" },
  { icon: "refrigerator", label: "Home\nAppliances" },
  { icon: "cctv", label: "CCTV\nInstallation" },
  { icon: "home", label: "All Home\nServices" },
];

// Native poster design base (matches web QrBookingPoster POSTER_BASE 384×576).
export const POSTER_BASE = { w: 384, h: 576 };
// Web parity: merchant Scan-QR renders/exports the poster on the "ig_post" canvas
// (SOCIAL_SIZES.ig_post = 1080×1350); content scale fits the base design inside it.
export const POSTER_CANVAS = { w: 1080, h: 1350, scale: Math.min(1080 / 384, 1350 / 576) };
