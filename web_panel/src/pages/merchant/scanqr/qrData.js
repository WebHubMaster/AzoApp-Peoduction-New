// Scan QR module — shared data (templates, color presets, poster sizes, services)

export const TEMPLATES = [
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
  // ── New premium ready-made designs ──
  { id: "dark_gold", label: "Dark Gold", variant: "luxe", primary: "#0B1220", accent: "#E8C368" },
  { id: "minimal_luxury", label: "Minimal Luxury", variant: "cream", primary: "#B8860B" },
  { id: "royal_purple", label: "Royal Purple", variant: "gradient", primary: "#4C1D95", primary2: "#7C3AED" },
  { id: "emerald_pro", label: "Emerald Pro", variant: "gradient", primary: "#065F46", primary2: "#10B981" },
  { id: "sunset_offer", label: "Sunset Offer", variant: "gradient", primary: "#DB2777", primary2: "#F59E0B" },
  { id: "midnight_teal", label: "Midnight Teal", variant: "gradient", primary: "#0F766E", primary2: "#0B3B37" },
];

export const COLOR_PRESETS = [
  { id: "azo_blue", label: "AzoApp Blue", primary: "#0D47A1" },
  { id: "emerald", label: "Emerald", primary: "#059669" },
  { id: "purple", label: "Purple", primary: "#7C3AED" },
  { id: "orange", label: "Orange", primary: "#EA580C" },
  { id: "navy", label: "Dark Navy", primary: "#0B1220" },
];

export const POSTER_SIZES = [
  { id: "social_square", label: "Social 1080×1080", w: 1080, h: 1080 },
  { id: "ig_portrait", label: "Instagram 1080×1350", w: 1080, h: 1350 },
  { id: "facebook", label: "Facebook 1200×1200", w: 1200, h: 1200 },
  { id: "story", label: "Story 1080×1920", w: 1080, h: 1920 },
  { id: "a4", label: "A4 Print", w: 1240, h: 1754 },
  { id: "a5", label: "A5 Print", w: 874, h: 1240 },
  { id: "counter", label: "Counter Card 720×960", w: 720, h: 960 },
];

export const DEFAULT_SERVICES = ["Electrician", "Plumber", "AC Repair", "Appliance Repair", "Carpenter", "Cleaning"];

export const QR_SIZES = ["small", "medium", "large"];
export const QR_POSITIONS = ["center", "top", "bottom", "left", "right"];

// Lighten (amt>0) or darken (amt<0) a hex colour and return a hex string.
export function adjust(hex, amt = 0) {
  try {
    let h = (hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return hex;
    const n = parseInt(h, 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  } catch { return hex; }
}

export function lighten(hex, amt = 40) { return adjust(hex, amt); }

// hex -> rgba() string (alpha 0..1)
export function hexA(hex, a = 1) {
  try {
    let h = (hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${a})`;
  } catch { return hex; }
}

// Resolve a premium rendering theme from template variant + chosen primary colour.
// Returns bg, text colours, decorative blobs and an accent bar for a high-end look.
export function resolveTheme(tpl, primary, primary2) {
  const p = primary || tpl.primary || "#0D47A1";
  const p2 = primary2 || tpl.primary2 || adjust(p, 46);
  const v = tpl.variant;
  const accent = tpl.accent;

  if (v === "solid") {
    return {
      bg: `linear-gradient(155deg, ${adjust(p, 28)} 0%, ${p} 46%, ${adjust(p, -48)} 100%)`,
      fg: "#ffffff", sub: "rgba(255,255,255,.84)", chip: "rgba(255,255,255,.16)",
      accent: accent || "#ffffff", band: null, mode: "dark", primary: p,
      bar: `linear-gradient(90deg, ${accent || "#ffffff"}, ${hexA(accent || "#ffffff", 0.2)})`,
      deco: { c1: "rgba(255,255,255,.10)", c2: "rgba(255,255,255,.06)" },
    };
  }
  if (v === "gradient") {
    return {
      bg: `linear-gradient(150deg, ${p} 0%, ${adjust(p, -10)} 40%, ${p2} 100%)`,
      fg: "#ffffff", sub: "rgba(255,255,255,.86)", chip: "rgba(255,255,255,.17)",
      accent: "#ffffff", band: null, mode: "dark", primary: p,
      bar: "linear-gradient(90deg, rgba(255,255,255,.95), rgba(255,255,255,.25))",
      deco: { c1: "rgba(255,255,255,.12)", c2: "rgba(255,255,255,.07)" },
    };
  }
  if (v === "luxe") {
    const gold = accent || "#E8C368";
    return {
      bg: "linear-gradient(160deg, #131a2b 0%, #0B1220 55%, #05070d 100%)",
      fg: "#ffffff", sub: "rgba(232,214,170,.78)", chip: hexA(gold, 0.14),
      accent: gold, band: null, mode: "dark", primary: p,
      bar: `linear-gradient(90deg, ${gold}, ${hexA(gold, 0.25)})`,
      deco: { c1: hexA(gold, 0.1), c2: hexA(gold, 0.05) },
    };
  }
  if (v === "cream") {
    const gold = p || "#B8860B";
    return {
      bg: "linear-gradient(180deg, #FAF7F0 0%, #F1E9D6 100%)",
      fg: "#1f2937", sub: "#8a7c5f", chip: hexA(gold, 0.1), accent: gold, band: null, mode: "light", primary: gold,
      bar: `linear-gradient(90deg, ${gold}, ${adjust(gold, 70)})`,
      deco: { c1: hexA(gold, 0.09), c2: hexA(gold, 0.05) },
    };
  }
  if (v === "band") {
    return {
      bg: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
      fg: "#0f172a", sub: "#64748b", chip: hexA(p, 0.08), accent: p, band: p, mode: "light", primary: p,
      bar: `linear-gradient(90deg, ${p}, ${adjust(p, 50)})`,
      deco: { c1: hexA(p, 0.07), c2: hexA(p2, 0.06) },
    };
  }
  if (v === "soft") {
    return {
      bg: `linear-gradient(160deg, ${hexA(p, 0.14)} 0%, #EAF2FB 45%, #ffffff 100%)`,
      fg: "#0f172a", sub: "#475569", chip: "#ffffff", accent: p, band: null, mode: "light", primary: p,
      bar: `linear-gradient(90deg, ${p}, ${adjust(p, 50)})`,
      deco: { c1: hexA(p, 0.1), c2: hexA(p, 0.06) },
    };
  }
  if (v === "minimal") {
    return {
      bg: "#ffffff", fg: "#0f172a", sub: "#94a3b8", chip: "#f1f5f9",
      accent: p, band: null, mode: "light", minimal: true, primary: p,
      bar: `linear-gradient(90deg, ${p}, ${adjust(p, 60)})`,
      deco: null,
    };
  }
  if (v === "print") {
    return {
      bg: "#ffffff", fg: "#0f172a", sub: "#475569", chip: "#f1f5f9",
      accent: p, band: p, mode: "light", primary: p,
      bar: `linear-gradient(90deg, ${p}, ${adjust(p, 50)})`,
      deco: null,
    };
  }
  // light (modern_white)
  return {
    bg: "linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%)",
    fg: "#0f172a", sub: "#64748b", chip: hexA(p, 0.08), accent: p, band: null, mode: "light", primary: p,
    bar: `linear-gradient(90deg, ${p}, ${adjust(p, 50)})`,
    deco: { c1: hexA(p, 0.08), c2: hexA(p2, 0.05) },
  };
}

export const DEFAULT_CONFIG = {
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
