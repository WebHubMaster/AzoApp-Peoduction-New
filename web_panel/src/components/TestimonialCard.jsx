import { Star, User, Quote } from "lucide-react";

/* Shared colorful themes used by both the public carousel and the admin builder.
   Keep keys in sync with backend TestimonialCreate.theme options. */
export const TESTIMONIAL_THEMES = {
  rose:    { label: "Rose",    bg: "bg-rose-50",    ring: "border-rose-100",    title: "text-rose-600",    name: "text-rose-600",    badge: "bg-rose-600",    quote: "text-rose-200",    dot: "#e11d48" },
  violet:  { label: "Violet",  bg: "bg-violet-50",  ring: "border-violet-100",  title: "text-violet-700",  name: "text-violet-700",  badge: "bg-violet-700",  quote: "text-violet-200",  dot: "#6d28d9" },
  teal:    { label: "Teal",    bg: "bg-teal-50",    ring: "border-teal-100",    title: "text-teal-600",    name: "text-teal-600",    badge: "bg-teal-600",    quote: "text-teal-200",    dot: "#0d9488" },
  amber:   { label: "Amber",   bg: "bg-amber-50",   ring: "border-amber-100",   title: "text-amber-600",   name: "text-amber-600",   badge: "bg-amber-500",   quote: "text-amber-200",   dot: "#d97706" },
  sky:     { label: "Sky",     bg: "bg-sky-50",     ring: "border-sky-100",     title: "text-sky-600",     name: "text-sky-600",     badge: "bg-sky-600",     quote: "text-sky-200",     dot: "#0284c7" },
  emerald: { label: "Emerald", bg: "bg-emerald-50", ring: "border-emerald-100", title: "text-emerald-600", name: "text-emerald-600", badge: "bg-emerald-600", quote: "text-emerald-200", dot: "#059669" },
  indigo:  { label: "Indigo",  bg: "bg-indigo-50",  ring: "border-indigo-100",  title: "text-indigo-600",  name: "text-indigo-600",  badge: "bg-indigo-600",  quote: "text-indigo-200",  dot: "#4f46e5" },
  slate:   { label: "Slate",   bg: "bg-slate-50",   ring: "border-slate-200",   title: "text-slate-800",   name: "text-slate-800",   badge: "bg-slate-700",   quote: "text-slate-200",   dot: "#334155" },
};

export const THEME_KEYS = Object.keys(TESTIMONIAL_THEMES);

export default function TestimonialCard({ t, className = "" }) {
  const th = TESTIMONIAL_THEMES[t.theme] || TESTIMONIAL_THEMES.rose;
  const rating = Number(t.rating || 5);
  const full = Math.floor(rating);
  return (
    <div className={`relative rounded-2xl border ${th.ring} ${th.bg} p-6 flex flex-col ${className}`}>
      {/* header: title + rating */}
      <div className="flex items-start justify-between gap-3">
        <h3 className={`font-heading font-extrabold text-lg leading-snug ${th.title}`}>{t.title || "Great service"}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-3.5 w-3.5 ${i < full ? "fill-amber-400 text-amber-400" : "fill-amber-200 text-amber-200"}`} />
            ))}
          </div>
          <span className={`text-white text-xs font-bold rounded px-1.5 py-0.5 ${th.badge}`}>{rating.toFixed(1)}</span>
        </div>
      </div>

      {/* opening quote */}
      <Quote className={`h-6 w-6 mt-3 -mb-1 ${th.quote} fill-current rotate-180`} />
      <p className="text-[15px] text-slate-700 leading-relaxed">{t.text}</p>

      {/* footer */}
      <div className="mt-auto pt-4">
        <div className="flex justify-end">
          <Quote className={`h-6 w-6 ${th.quote} fill-current`} />
        </div>
        <div className="flex items-center justify-end gap-2 -mt-1">
          {t.photo
            ? <img src={t.photo} alt={t.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-white shadow-sm" />
            : t.avatar
            ? <img src={t.avatar} alt={t.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-white shadow-sm" />
            : <div className={`h-9 w-9 rounded-full flex items-center justify-center ${th.bg} ring-2 ring-white shadow-sm`}><User className={`h-4 w-4 ${th.name}`} /></div>}
          <span className={`font-bold ${th.name}`}>{t.name || "Customer"}</span>
        </div>
        {(t.city || t.service) && (
          <p className="text-right text-[11px] text-slate-400 mt-0.5">{[t.service, t.city].filter(Boolean).join(" · ")}</p>
        )}
      </div>
    </div>
  );
}
