import { useMemo, useState } from "react";
import { Search, Globe, Twitter, CheckCircle2, AlertTriangle, XCircle, Image as ImageIcon } from "lucide-react";
import MediaLibraryPicker from "./MediaLibraryPicker";

const Field = ({ label, hint, children }) => (
  <div>
    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</label>
    <div className="mt-1">{children}</div>
    {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
  </div>
);
const inputCls = "w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30";
const areaCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30";

/**
 * Advanced SEO panel. `seo` is a plain object; `onChange(next)` replaces it.
 * Provides live Google + Facebook/OG + Twitter/X previews and real-time checks.
 */
export default function SeoPanel({ seo = {}, onChange, pageTitle = "", pageDescription = "", baseUrl = "", slug = "" }) {
  const [tab, setTab] = useState("google");
  const [mediaFor, setMediaFor] = useState(null); // "og" | "tw"
  const s = seo || {};
  const set = (k, v) => onChange?.({ ...s, [k]: v });

  const title = s.seo_title || pageTitle || "";
  const desc = s.meta_description || pageDescription || "";
  const url = (baseUrl || (typeof window !== "undefined" ? window.location.origin : "")) + (s.slug || slug ? `/${s.slug || slug}` : "");

  const checks = useMemo(() => {
    const out = [];
    const tl = (title || "").length;
    out.push(tl === 0 ? { s: "err", t: "SEO title is missing" }
      : tl < 30 ? { s: "warn", t: `SEO title short (${tl} chars, aim 30–60)` }
      : tl > 60 ? { s: "warn", t: `SEO title long (${tl} chars, aim ≤60)` }
      : { s: "ok", t: `SEO title length good (${tl})` });
    const dl = (desc || "").length;
    out.push(dl === 0 ? { s: "err", t: "Meta description is missing" }
      : dl < 70 ? { s: "warn", t: `Description short (${dl}, aim 70–160)` }
      : dl > 160 ? { s: "warn", t: `Description long (${dl}, aim ≤160)` }
      : { s: "ok", t: `Description length good (${dl})` });
    const kw = (s.focus_keyword || "").trim().toLowerCase();
    if (!kw) out.push({ s: "warn", t: "No focus keyword set" });
    else {
      const inTitle = title.toLowerCase().includes(kw);
      const inDesc = desc.toLowerCase().includes(kw);
      out.push(inTitle ? { s: "ok", t: "Focus keyword in title" } : { s: "warn", t: "Focus keyword not in title" });
      out.push(inDesc ? { s: "ok", t: "Focus keyword in description" } : { s: "warn", t: "Focus keyword not in description" });
    }
    out.push(s.canonical_url ? { s: "ok", t: "Canonical URL set" } : { s: "warn", t: "No canonical URL" });
    out.push((s.og_image || s.twitter_image) ? { s: "ok", t: "Social image set" } : { s: "warn", t: "No social/OG image" });
    return out;
  }, [title, desc, s.focus_keyword, s.canonical_url, s.og_image, s.twitter_image]);

  const score = useMemo(() => {
    const ok = checks.filter((c) => c.s === "ok").length;
    return Math.round((ok / checks.length) * 100);
  }, [checks]);
  const scoreColor = score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-500" : "text-red-500";

  const ogImg = s.og_image || s.twitter_image || "";
  const twImg = s.twitter_image || s.og_image || "";

  return (
    <div className="space-y-5">
      {/* fields */}
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="SEO / Meta Title" hint={`${(s.seo_title || "").length}/60`}>
          <input className={inputCls} value={s.seo_title || ""} maxLength={70} placeholder={pageTitle} onChange={(e) => set("seo_title", e.target.value)} data-testid="seo-title" />
        </Field>
        <Field label="SEO Slug">
          <input className={inputCls} value={s.slug || ""} placeholder="url-friendly-slug" onChange={(e) => set("slug", e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Meta Description" hint={`${(s.meta_description || "").length}/160`}>
            <textarea className={areaCls} rows={2} value={s.meta_description || ""} maxLength={320} placeholder="One-line summary shown in Google results…" onChange={(e) => set("meta_description", e.target.value)} data-testid="seo-desc" />
          </Field>
        </div>
        <Field label="Focus Keyword">
          <input className={inputCls} value={s.focus_keyword || ""} placeholder="e.g. ac repair near me" onChange={(e) => set("focus_keyword", e.target.value)} />
        </Field>
        <Field label="Secondary Keywords" hint="comma separated">
          <input className={inputCls} value={Array.isArray(s.secondary_keywords) ? s.secondary_keywords.join(", ") : (s.secondary_keywords || "")}
            onChange={(e) => set("secondary_keywords", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
        </Field>
        <Field label="Canonical URL">
          <input className={inputCls} value={s.canonical_url || ""} placeholder="https://…" onChange={(e) => set("canonical_url", e.target.value)} />
        </Field>
        <Field label="Robots">
          <div className="flex items-center gap-4 h-10">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={s.robots_index !== false} onChange={(e) => set("robots_index", e.target.checked)} />Index</label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={s.robots_follow !== false} onChange={(e) => set("robots_follow", e.target.checked)} />Follow</label>
          </div>
        </Field>
      </div>

      {/* social fields */}
      <div className="grid md:grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
        <Field label="Open Graph Title"><input className={inputCls} value={s.og_title || ""} placeholder={title} onChange={(e) => set("og_title", e.target.value)} /></Field>
        <Field label="Twitter/X Title"><input className={inputCls} value={s.twitter_title || ""} placeholder={title} onChange={(e) => set("twitter_title", e.target.value)} /></Field>
        <Field label="Open Graph Description"><textarea className={areaCls} rows={2} value={s.og_description || ""} placeholder={desc} onChange={(e) => set("og_description", e.target.value)} /></Field>
        <Field label="Twitter/X Description"><textarea className={areaCls} rows={2} value={s.twitter_description || ""} placeholder={desc} onChange={(e) => set("twitter_description", e.target.value)} /></Field>
        <Field label="OG Image">
          <div className="flex items-center gap-2">
            <input className={inputCls} value={s.og_image || ""} placeholder="https://…" onChange={(e) => set("og_image", e.target.value)} />
            <button type="button" onClick={() => setMediaFor("og")} className="h-10 px-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200"><ImageIcon className="h-4 w-4" /></button>
          </div>
        </Field>
        <Field label="Twitter/X Image">
          <div className="flex items-center gap-2">
            <input className={inputCls} value={s.twitter_image || ""} placeholder="https://…" onChange={(e) => set("twitter_image", e.target.value)} />
            <button type="button" onClick={() => setMediaFor("tw")} className="h-10 px-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200"><ImageIcon className="h-4 w-4" /></button>
          </div>
        </Field>
        <Field label="Schema Type"><input className={inputCls} value={s.schema_type || ""} placeholder="Article, WebPage, FAQPage…" onChange={(e) => set("schema_type", e.target.value)} /></Field>
        <div className="md:col-span-2">
          <Field label="Custom Schema (JSON-LD)"><textarea className={`${areaCls} font-mono text-xs`} rows={3} value={s.custom_schema || ""} placeholder='{"@context":"https://schema.org", ...}' onChange={(e) => set("custom_schema", e.target.value)} /></Field>
        </div>
      </div>

      {/* previews + checks */}
      <div className="grid lg:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-1 mb-3">
            {[["google", "Google", Search], ["facebook", "Facebook", Globe], ["twitter", "Twitter/X", Twitter]].map(([k, l, I]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === k ? "bg-[#0D47A1] text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                <I className="h-3.5 w-3.5" />{l}
              </button>
            ))}
          </div>
          {tab === "google" && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900" data-testid="seo-preview-google">
              <p className="text-[13px] text-emerald-700 truncate">{url || "https://yoursite.com/page"}</p>
              <p className="text-[18px] text-[#1a0dab] dark:text-blue-400 leading-snug truncate">{title || "Your SEO title appears here"}</p>
              <p className="text-[13px] text-slate-600 dark:text-slate-400 line-clamp-2">{desc || "Your meta description appears here — keep it compelling and under 160 characters."}</p>
            </div>
          )}
          {tab === "facebook" && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 max-w-md" data-testid="seo-preview-fb">
              <div className="aspect-[1.91/1] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {ogImg ? <img src={ogImg} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="h-8 w-8 text-slate-300" />}
              </div>
              <div className="p-3 border-t border-slate-100 dark:border-slate-700">
                <p className="text-[11px] uppercase text-slate-400 truncate">{(url || "yoursite.com").replace(/^https?:\/\//, "")}</p>
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{s.og_title || title || "Open Graph title"}</p>
                <p className="text-xs text-slate-500 line-clamp-2">{s.og_description || desc}</p>
              </div>
            </div>
          )}
          {tab === "twitter" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 max-w-md" data-testid="seo-preview-tw">
              <div className="aspect-[1.91/1] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {twImg ? <img src={twImg} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="h-8 w-8 text-slate-300" />}
              </div>
              <div className="p-3">
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{s.twitter_title || title || "Twitter card title"}</p>
                <p className="text-xs text-slate-500 line-clamp-2">{s.twitter_description || desc}</p>
                <p className="text-[11px] text-slate-400 mt-1 truncate">{(url || "yoursite.com").replace(/^https?:\/\//, "")}</p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">SEO Checks</p>
            <span className={`text-lg font-black ${scoreColor}`} data-testid="seo-score">{score}</span>
          </div>
          <ul className="space-y-1.5">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {c.s === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  : c.s === "warn" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                <span className="text-slate-600 dark:text-slate-300">{c.t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <MediaLibraryPicker open={!!mediaFor} onClose={() => setMediaFor(null)} folder="seo"
        onSelect={(u) => set(mediaFor === "og" ? "og_image" : "twitter_image", u)} />
    </div>
  );
}
