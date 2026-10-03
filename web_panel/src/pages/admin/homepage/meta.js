import { LayoutTemplate, Grid3x3, Shapes, Star, TrendingUp, Flame, ThumbsUp, ListChecks, FolderOpen, GalleryHorizontal, Clapperboard, TicketPercent, HelpCircle, Newspaper, ShieldCheck, Workflow } from "lucide-react";

// kind drives the mini visual preview; desc is shown in the section-type picker
export const TYPE_META = {
  hero_banner: { label: "Hero Banner", desc: "Main promotional homepage banner", icon: LayoutTemplate, kind: "hero" },
  popular_categories: { label: "Popular Categories", desc: "Display frequently used service categories", icon: Grid3x3, kind: "circles" },
  featured_categories: { label: "Featured Categories", desc: "Highlight chosen service categories", icon: Shapes, kind: "tiles" },
  featured_services: { label: "Featured Services", desc: "Highlight selected services", icon: Star, kind: "cards" },
  trending_services: { label: "Trending Services", desc: "Show popular / trending services", icon: TrendingUp, kind: "cards" },
  most_requested: { label: "Most Requested", desc: "Hand-picked most requested services", icon: Flame, kind: "cards" },
  recommended_services: { label: "Recommended Services", desc: "Hand-picked recommended services", icon: ThumbsUp, kind: "cards" },
  service_collection: { label: "Hand-picked Services", desc: "A custom collection of services you choose", icon: ListChecks, kind: "cards" },
  category_services: { label: "Category Services", desc: "All services from one whole category", icon: FolderOpen, kind: "cards" },
  promo_banner: { label: "Promo Banner", desc: "Image banner with a link", icon: GalleryHorizontal, kind: "banner" },
  video: { label: "Video Section", desc: "Video from a URL or upload", icon: Clapperboard, kind: "video" },
  coupons: { label: "Coupons", desc: "Display active promotional offers", icon: TicketPercent, kind: "tickets" },
  faq: { label: "FAQ", desc: "Frequently asked questions", icon: HelpCircle, kind: "lines" },
  blog: { label: "Blog", desc: "Latest blog content", icon: Newspaper, kind: "posts" },
  why_choose_us: { label: "Why Choose Us", desc: "Trust & value highlights", icon: ShieldCheck, kind: "icons" },
  how_it_works: { label: "How It Works", desc: "Step-by-step booking guide", icon: Workflow, kind: "steps" },
};

export const metaOf = (t) => TYPE_META[t] || { label: (t || "").replace(/_/g, " "), desc: "Custom section", icon: Shapes, kind: "cards" };

// where a section's items come from when it has no explicit picker
export const AUTO_SOURCE = {
  hero_banner: "Hero content comes from Branding & Banners.",
  popular_categories: "Categories are pulled automatically from Service Categories.",
  featured_categories: "Categories marked featured in Service Categories are shown.",
  featured_services: "Services marked Featured in Services are shown.",
  trending_services: "Services marked Trending in Services are shown.",
  coupons: "Active coupons from Marketing → Coupons are shown.",
  faq: "FAQs from Website / CMS → FAQ are shown.",
  blog: "Latest published posts from Website / CMS → Blog are shown.",
  why_choose_us: "Static trust highlights.",
  how_it_works: "Static booking steps.",
};

export const FIELDS = ["title", "subtitle", "enabled", "config"];
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const sectionDiff = (srv, d) => {
  const out = {};
  FIELDS.forEach((k) => { if (!same(srv?.[k] ?? (k === "enabled" ? false : k === "config" ? {} : ""), d[k] ?? (k === "enabled" ? false : k === "config" ? {} : ""))) out[k] = d[k]; });
  return out;
};
export const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const t = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Today, ${t}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${t}`;
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, ${t}`;
};
