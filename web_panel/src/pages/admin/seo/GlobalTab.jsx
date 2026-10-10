import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Save, X, Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Card, Field, inputCls, areaCls, Btn, Select, Toggle, SnippetPreview, SocialPreview, Skel, errMsg, Pill, fmtDate } from "./seoUi";

const ROBOTS = [{ value: "index,follow", label: "index, follow (recommended)" }, { value: "index,nofollow", label: "index, nofollow" },
  { value: "noindex,follow", label: "noindex, follow" }, { value: "noindex,nofollow", label: "noindex, nofollow" }];

export default function GlobalTab() {
  const [orig, setOrig] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [adv, setAdv] = useState(false);
  const load = () => api.get("/admin/seo/global").then((r) => { setOrig(r.data); setF(r.data); }).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);
  const dirty = useMemo(() => f && orig && JSON.stringify(f) !== JSON.stringify(orig), [f, orig]);
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!f) return <div className="grid lg:grid-cols-3 gap-5"><Skel className="h-[520px] lg:col-span-2" /><Skel className="h-[520px]" /></div>;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e && e.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/seo/global", f);
      setOrig(data); setF(data); toast.success("Global SEO saved — the public site now uses these defaults");
    } catch (e) { toast.error(errMsg(e, "Save failed")); if (e?.response?.status === 409) load(); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    if (!window.confirm("Reset all global SEO settings to defaults? Site title and description are kept.")) return;
    try { const { data } = await api.post("/admin/seo/global/reset"); setOrig(data); setF(data); toast.success("Reset to defaults"); } catch (e) { toast.error(errMsg(e)); }
  };
  const title = f.default_meta_title || f.site_title || f.site_name;
  const desc = f.meta_description;
  const base = f.base;
  const locs = f.business_locations || [];
  const setLoc = (i, k, v) => setF((x) => ({ ...x, business_locations: locs.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));

  return (
    <div className="space-y-5" data-testid="seo-global">
      <div className="sticky top-[46px] z-10 flex flex-wrap items-center gap-2 bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm">
        {dirty ? <Pill tone="amber" testId="global-unsaved">Unsaved changes</Pill> : <Pill tone="green" testId="global-saved">All changes saved</Pill>}
        <span className="text-[11px] text-slate-400">v{orig.version || 0}{orig.updated_at ? ` · updated ${fmtDate(orig.updated_at)}` : ""}</span>
        <div className="ml-auto flex gap-2">
          <Btn variant="ghost" size="sm" onClick={reset} data-testid="global-reset"><RotateCcw className="h-3.5 w-3.5" />Reset to defaults</Btn>
          <Btn variant="outline" size="sm" disabled={!dirty} onClick={() => setF(orig)} data-testid="global-cancel"><X className="h-3.5 w-3.5" />Cancel</Btn>
          <Btn size="sm" disabled={!dirty} loading={saving} onClick={save} data-testid="global-save"><Save className="h-3.5 w-3.5" />Save</Btn>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Site identity & default meta" subtitle="Used site-wide unless a category, service or city overrides it.">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Website title" count={(f.site_title || "").length} max={60} help="Shown on the homepage title tag."><input data-testid="global-site-title" className={inputCls} value={f.site_title || ""} onChange={set("site_title")} /></Field>
              <Field label="Default meta title" count={(f.default_meta_title || "").length} max={60} hint="Homepage title. Falls back to website title."><input data-testid="global-default-title" className={inputCls} value={f.default_meta_title || ""} onChange={set("default_meta_title")} /></Field>
              <Field className="md:col-span-2" label="Default meta description" count={(desc || "").length} min={70} max={160} hint="Recommended 120–160 characters. Longer text is allowed but may be truncated by search engines.">
                <textarea data-testid="global-meta-description" className={areaCls} value={desc || ""} onChange={set("meta_description")} /></Field>
              <Field label="Title template" hint="Applied to inner pages. Must contain {title}; {site_name} is optional."><input data-testid="global-title-template" className={inputCls} value={f.title_template || ""} onChange={set("title_template")} /></Field>
              <Field label="Default meta keywords" hint="Legacy only — Google ignores the keywords tag."><input data-testid="global-keywords" className={inputCls} value={f.meta_keywords || ""} onChange={set("meta_keywords")} /></Field>
            </div>
          </Card>

          <Card title="Canonical & robots" subtitle="How the preferred URL of each page is generated.">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Preferred host" hint={`Production domain used for canonicals and sitemaps. Empty = ${f.env_base}`}><input data-testid="global-preferred-host" placeholder="https://www.azoapp.in" className={inputCls} value={f.preferred_host || ""} onChange={set("preferred_host")} /></Field>
              <Field label="Canonical policy"><Select testId="global-canonical-policy" value={f.canonical_policy} onChange={set("canonical_policy")} options={[{ value: "self", label: "Self-referencing canonical on every page" }, { value: "preferred_host", label: "Self-referencing on preferred host" }]} /></Field>
              <Field label="Default robots directive" hint="Pages can override this; private routes are always noindex."><Select testId="global-robots" value={f.robots_default} onChange={set("robots_default")} options={ROBOTS} /></Field>
              <div className="flex items-end pb-1.5"><Toggle testId="global-trailing-slash" checked={!!f.trailing_slash} onChange={set("trailing_slash")} label="Add trailing slash to canonical URLs" /></div>
            </div>
          </Card>

          <Card title="Open Graph & social sharing">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Default OG title" count={(f.og_title || "").length} max={70}><input data-testid="global-og-title" className={inputCls} value={f.og_title || ""} onChange={set("og_title")} placeholder={title} /></Field>
              <Field label="X / Twitter handle"><input data-testid="global-twitter" className={inputCls} value={f.twitter || ""} onChange={set("twitter")} placeholder="@azoapp" /></Field>
              <Field className="md:col-span-2" label="Default OG description" count={(f.og_description || "").length} max={200}><textarea data-testid="global-og-description" className={areaCls} value={f.og_description || ""} onChange={set("og_description")} placeholder={desc} /></Field>
              <Field label="Default OG image URL" hint="1200×630 recommended. https or /api/media/… paths."><input data-testid="global-og-image" className={inputCls} value={f.og_image || ""} onChange={set("og_image")} /></Field>
              <Field label="Twitter card"><Select testId="global-twitter-card" value={f.twitter_card} onChange={set("twitter_card")} options={[{ value: "summary_large_image", label: "Large image" }, { value: "summary", label: "Summary" }]} /></Field>
            </div>
          </Card>

          <Card title="Organization identity" subtitle="Feeds Organization / WebSite structured data. Enter only verified information.">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Organization name"><input data-testid="global-org-name" className={inputCls} value={f.org_name || ""} onChange={set("org_name")} placeholder={f.site_name} /></Field>
              <Field label="Logo URL"><input data-testid="global-org-logo" className={inputCls} value={f.org_logo || ""} onChange={set("org_logo")} placeholder={f.brand_logo || "https://…/logo.png"} /></Field>
              <Field label="Customer service phone"><input data-testid="global-org-phone" className={inputCls} value={f.org_phone || ""} onChange={set("org_phone")} /></Field>
              <Field label="Official profiles (sameAs)" hint="One URL per line"><textarea data-testid="global-same-as" className={areaCls} value={(f.org_same_as || []).join("\n")} onChange={(e) => setF((x) => ({ ...x, org_same_as: e.target.value.split("\n") }))} /></Field>
              <Field label="Locale"><input data-testid="global-locale" className={inputCls} value={f.locale || ""} onChange={set("locale")} placeholder="en_IN" /></Field>
              <Field label="Language"><input data-testid="global-language" className={inputCls} value={f.language || ""} onChange={set("language")} placeholder="en" /></Field>
            </div>
          </Card>

          <Card title="Advanced: auto-generation templates" right={<Btn size="sm" variant="ghost" onClick={() => setAdv(!adv)} data-testid="global-advanced-toggle">{adv ? "Hide" : "Show"}</Btn>}
            subtitle="Used only when a page has no custom title. Tokens: {name} {category} {subcategory} {city} {price} {site_name}">
            {adv ? (
              <div className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Service title"><input data-testid="tpl-service" className={inputCls} value={f.service_title_template || ""} onChange={set("service_title_template")} /></Field>
                  <Field label="Category title"><input data-testid="tpl-category" className={inputCls} value={f.category_title_template || ""} onChange={set("category_title_template")} /></Field>
                  <Field label="City page title"><input data-testid="tpl-city" className={inputCls} value={f.city_title_template || ""} onChange={set("city_title_template")} /></Field>
                  <Field label="City-service page title"><input data-testid="tpl-city-service" className={inputCls} value={f.city_service_title_template || ""} onChange={set("city_service_title_template")} /></Field>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2"><p className="text-[12px] font-semibold text-slate-700">Physical business locations (LocalBusiness schema)</p>
                    <Btn size="sm" variant="outline" data-testid="loc-add" onClick={() => setF((x) => ({ ...x, business_locations: [...locs, { name: "", street: "", city: "", state: "", postal_code: "", phone: "" }] }))}><Plus className="h-3.5 w-3.5" />Add</Btn></div>
                  <p className="text-[11px] text-slate-500 mb-2">Only add real offices customers can visit. Leave empty if AzoApp operates as a service-area business.</p>
                  {locs.map((l, i) => (
                    <div key={i} className="grid md:grid-cols-6 gap-2 mb-2">
                      {["name", "street", "city", "state", "postal_code", "phone"].map((k) => <input key={k} placeholder={k.replace("_", " ")} data-testid={`loc-${i}-${k}`} className={inputCls} value={l[k] || ""} onChange={(e) => setLoc(i, k, e.target.value)} />)}
                      <button onClick={() => setF((x) => ({ ...x, business_locations: locs.filter((_, j) => j !== i) }))} className="text-rose-500 text-xs inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" />Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-xs text-slate-500">Collapsed. Defaults generate titles from real record names.</p>}
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-[110px] self-start">
          <SnippetPreview url={`${base}/`} title={title} description={desc} testId="global-snippet" />
          <SocialPreview url={base} title={f.og_title || title} description={f.og_description || desc} image={f.og_image || f.brand_logo} testId="global-social" />
        </div>
      </div>
    </div>
  );
}
