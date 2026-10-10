import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Save, ExternalLink, ChevronDown, Plus, Trash2, CheckCircle2, Circle, Link2, SearchCheck } from "lucide-react";
import api, { API } from "@/lib/api";
import { Btn, Field, inputCls, areaCls, Select, Toggle, SnippetPreview, SocialPreview, Sev, Pill, Skel, CopyField, errMsg, TYPE_LABEL, fmtDate } from "./seoUi";

const ROBOTS = [{ value: "", label: "Inherit default" }, { value: "index,follow", label: "index, follow" }, { value: "noindex,follow", label: "noindex, follow" },
  { value: "noindex,nofollow", label: "noindex, nofollow" }, { value: "index,nofollow", label: "index, nofollow" }];
const SEO_KEYS = ["title", "description", "canonical", "robots", "og_title", "og_description", "og_image", "image_alt", "keywords", "schema_jsonld", "breadcrumb_label"];

const Section = ({ title, children, defaultOpen = true, testId }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl bg-white" data-testid={testId}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">{title}<ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
};

const Src = ({ s }) => s && s !== "page" ? <span className="text-[10px] font-medium text-slate-400 ml-1">inherited · {s.replace("_", " ")}</span> : null;

export default function PageEditor({ pageKey, onClose, onSaved }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [init, setInit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [inspect, setInspect] = useState(null);

  const hydrate = (data) => {
    const p = data.page, ov = p.override || {};
    const f = { seo: Object.fromEntries(SEO_KEYS.map((k) => [k, ov[k] || ""])), slug: p.slug || "", seo_defaults: { title_template: "", description: "", robots: "", og_image: "", ...(p.defaults || {}) },
      city: { intro: ov.intro || "", coverage: ov.coverage || "", faqs: ov.faqs || [], state: ov.state || "", country: ov.country || "India", indexable: ov.indexable !== false, status: ov.status || "draft" } };
    setD(data); setForm(f); setInit(JSON.stringify(f));
  };
  const load = () => api.get("/admin/seo/page", { params: { key: pageKey } }).then((r) => hydrate(r.data)).catch((e) => { toast.error(errMsg(e)); onClose(); });
  useEffect(() => { load(); }, [pageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = form && init !== JSON.stringify(form);
  const close = () => { if (dirty && !window.confirm("Discard unsaved SEO changes?")) return; onClose(); };

  const p = d?.page;
  const r = p?.resolved || {};
  const seo = form?.seo || {};
  const title = useMemo(() => {
    if (!p) return "";
    if (!seo.title) return r.full_title;
    const site = (r.full_title || "").split("|").pop()?.trim();
    return seo.title.toLowerCase().includes((site || "").toLowerCase()) ? seo.title : (d.global.title_template || "{title}").replace("{title}", seo.title).replace("{site_name}", site || "");
  }, [seo.title, p, r.full_title, d]);
  if (!d || !form) return <Shell onClose={close}><div className="p-6 space-y-3"><Skel className="h-24" /><Skel className="h-64" /><Skel className="h-40" /></div></Shell>;

  const setS = (k) => (e) => setForm((x) => ({ ...x, seo: { ...x.seo, [k]: e?.target ? e.target.value : e } }));
  const setC = (k) => (v) => setForm((x) => ({ ...x, city: { ...x.city, [k]: v?.target ? v.target.value : v } }));
  const setD2 = (k) => (e) => setForm((x) => ({ ...x, seo_defaults: { ...x.seo_defaults, [k]: e?.target ? e.target.value : e } }));
  const t = p.type;
  const isEntity = ["service", "category", "subcategory"].includes(t);
  const isCity = t === "city" || t === "city_service";
  const url = seo.canonical || `${d.base}${isEntity && form.slug !== p.slug ? p.path.replace(/[^/]+$/, form.slug) : p.path}`;
  const desc = seo.description || r.description;
  const slugChanged = isEntity && p.slug && form.slug !== p.slug;

  const save = async () => {
    setSaving(true);
    try {
      const body = { seo: form.seo, expected_updated_at: d.version || undefined };
      if (isEntity) body.slug = form.slug;
      if (t === "category" || t === "subcategory") body.seo_defaults = form.seo_defaults;
      if (isCity) body.city = form.city;
      const { data } = await api.put("/admin/seo/page", body, { params: { key: pageKey } });
      hydrate(data); onSaved && onSaved();
      toast.success(slugChanged && p.published ? "Saved — a 301 redirect from the old URL was created" : "SEO saved");
    } catch (e) { toast.error(errMsg(e, "Save failed")); } finally { setSaving(false); }
  };
  const doInspect = async () => {
    try { const { data } = await api.post("/admin/seo/gsc/inspect", { key: pageKey }); setInspect(data); toast.success("Inspection result received from Google"); }
    catch (e) { toast.error(errMsg(e, "Inspection unavailable")); }
  };
  const faqs = form.city.faqs || [];
  const origin = API.replace(/\/api$/, "");

  return (
    <Shell onClose={close}>
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><Pill tone="blue">{TYPE_LABEL[t]}</Pill>{p.indexable ? <Pill tone="green" testId="editor-indexable">Indexable</Pill> : <Pill testId="editor-indexable">Not indexable</Pill>}{dirty && <Pill tone="amber" testId="editor-unsaved">Unsaved</Pill>}</div>
          <p className="font-semibold text-slate-900 mt-1 truncate" data-testid="editor-title">{p.name}</p>
          <a href={origin + p.path} target="_blank" rel="noreferrer" className="text-xs text-slate-500 font-mono inline-flex items-center gap-1 hover:text-[#0D47A1]">{p.path}<ExternalLink className="h-3 w-3" /></a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Btn size="sm" disabled={!dirty} loading={saving} onClick={save} data-testid="editor-save"><Save className="h-3.5 w-3.5" />Save</Btn>
          <button onClick={close} data-testid="editor-close" className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="p-5 space-y-4 bg-[#F5F7FA]">
        <SnippetPreview url={url} title={title} description={desc} testId="editor-snippet" />

        {p.issues.filter((i) => i.severity !== "info").length > 0 && (
          <div className="rounded-xl bg-white border border-slate-200 p-4" data-testid="editor-issues">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Detected issues · score {p.score}/100</p>
            <ul className="space-y-1.5">{p.issues.filter((i) => i.severity !== "info").map((i, k) => <li key={k} className="text-sm flex gap-2"><Sev s={i.severity} /><span className="text-slate-700">{i.message} {i.fix && <span className="text-[#0D47A1]">{i.fix}</span>}</span></li>)}</ul>
          </div>
        )}
        {(p.eligibility_reasons || []).length > 0 && <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-800" data-testid="editor-eligibility">Not eligible for indexing: {p.eligibility_reasons.join("; ")}</div>}

        <Section title="Search appearance" testId="editor-sec-meta">
          <Field label={<>SEO title <Src s={!seo.title && p.sources?.title} /></>} count={title.length} max={60} min={15}><input data-testid="editor-seo-title" className={inputCls} value={seo.title} onChange={setS("title")} placeholder={r.title} /></Field>
          <Field label={<>Meta description <Src s={!seo.description && p.sources?.description} /></>} count={(desc || "").length} max={160} min={70}><textarea data-testid="editor-seo-description" className={areaCls} value={seo.description} onChange={setS("description")} placeholder={r.description} /></Field>
          <Field label="Keywords (legacy)" hint="Not used by Google; kept for compatibility."><input data-testid="editor-keywords" className={inputCls} value={seo.keywords} onChange={setS("keywords")} /></Field>
        </Section>

        <Section title="URL, canonical & indexing" testId="editor-sec-url">
          {isEntity && <Field label="URL slug" hint={slugChanged ? (p.published ? `Changing from “${p.slug}” — a 301 redirect will be created automatically.` : "Page is not published; no redirect needed.") : "Lowercase words separated by hyphens"}>
            <input data-testid="editor-slug" className={inputCls} value={form.slug} onChange={(e) => setForm((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") }))} /></Field>}
          <Field label="Canonical URL" hint={`Leave empty for self-canonical: ${d.base}${p.path}`}><input data-testid="editor-canonical" className={inputCls} value={seo.canonical} onChange={setS("canonical")} placeholder={`${d.base}${p.path}`} /></Field>
          <Field label={<>Robots <Src s={!seo.robots && p.sources?.robots} /></>}><Select testId="editor-robots" value={seo.robots} onChange={setS("robots")} options={ROBOTS} /></Field>
          <div><p className="text-[12px] font-semibold text-slate-700 mb-1.5">Public URL</p><CopyField value={url} testId="editor-url" /></div>
        </Section>

        {isCity && (
          <Section title="Local content" testId="editor-sec-local">
            {t === "city" && <div className="grid grid-cols-2 gap-3"><Field label="State"><input data-testid="editor-state" className={inputCls} value={form.city.state} onChange={setC("state")} placeholder="Bihar" /></Field><Field label="Country"><input data-testid="editor-country" className={inputCls} value={form.city.country} onChange={setC("country")} /></Field></div>}
            {t === "city_service" && <Field label="Publish status"><Select testId="editor-status" value={form.city.status} onChange={setC("status")} options={[{ value: "draft", label: "Draft (not public)" }, { value: "published", label: "Published" }]} /></Field>}
            <Field label="Local introduction" count={(form.city.intro || "").length} min={t === "city" ? 250 : 300} hint="Genuine, location-specific information: coverage, response times, local conditions. Thin or copy-pasted text blocks publishing.">
              <textarea data-testid="editor-intro" className={`${areaCls} min-h-[140px]`} value={form.city.intro} onChange={setC("intro")} /></Field>
            <Field label="Service coverage details"><textarea data-testid="editor-coverage" className={areaCls} value={form.city.coverage} onChange={setC("coverage")} placeholder="Areas, pincodes and timings genuinely covered" /></Field>
            <div>
              <div className="flex items-center justify-between mb-2"><p className="text-[12px] font-semibold text-slate-700">FAQs</p><Btn size="sm" variant="outline" data-testid="editor-faq-add" onClick={() => setC("faqs")([...faqs, { q: "", a: "" }])}><Plus className="h-3.5 w-3.5" />Add</Btn></div>
              {faqs.map((f, i) => (
                <div key={i} className="grid gap-2 mb-3 p-3 rounded-lg ring-1 ring-slate-200">
                  <input data-testid={`editor-faq-q-${i}`} className={inputCls} placeholder="Question" value={f.q} onChange={(e) => setC("faqs")(faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
                  <textarea className={areaCls} placeholder="Answer" value={f.a} onChange={(e) => setC("faqs")(faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
                  <button onClick={() => setC("faqs")(faqs.filter((_, j) => j !== i))} className="text-xs text-rose-500 inline-flex items-center gap-1 justify-self-start"><Trash2 className="h-3 w-3" />Remove</button>
                </div>
              ))}
            </div>
            <Toggle testId="editor-city-indexable" checked={form.city.indexable} onChange={setC("indexable")} label="Allow indexing when eligible" />
          </Section>
        )}

        <Section title="Social sharing (Open Graph)" defaultOpen={false} testId="editor-sec-og">
          <Field label="OG title"><input data-testid="editor-og-title" className={inputCls} value={seo.og_title} onChange={setS("og_title")} placeholder={title} /></Field>
          <Field label="OG description"><textarea data-testid="editor-og-description" className={areaCls} value={seo.og_description} onChange={setS("og_description")} placeholder={desc} /></Field>
          <Field label={<>Share image URL <Src s={!seo.og_image && p.sources?.og_image} /></>}><input data-testid="editor-og-image" className={inputCls} value={seo.og_image} onChange={setS("og_image")} placeholder={r.og_image} /></Field>
          <SocialPreview url={url} title={seo.og_title || title} description={seo.og_description || desc} image={seo.og_image || r.og_image} testId="editor-social" />
        </Section>

        {(p.image || (d.gallery || []).length > 0) && (
          <Section title="Images & alt text" defaultOpen={false} testId="editor-sec-images">
            <div className="flex gap-3 items-start">{p.image && <img src={p.image} alt="" className="h-16 w-24 rounded-md object-cover ring-1 ring-slate-200" />}
              <Field className="flex-1" label="Main image alt text" count={(seo.image_alt || "").length} max={125} hint="Describe what the image shows; avoid keyword stuffing."><input data-testid="editor-image-alt" className={inputCls} value={seo.image_alt} onChange={setS("image_alt")} placeholder={p.name} /></Field></div>
            {(d.gallery || []).length > 0 && <p className="text-xs text-slate-500">{d.gallery.length} gallery image(s) render with “{p.name} photo N” alt text.</p>}
          </Section>
        )}

        {(t === "category" || t === "subcategory") && (
          <Section title="Defaults inherited by child services" defaultOpen={false} testId="editor-sec-defaults">
            <Field label="Child title template" hint="Must include {name}. Tokens: {name} {category} {price}"><input data-testid="editor-child-template" className={inputCls} value={form.seo_defaults.title_template} onChange={setD2("title_template")} placeholder="{name} — {category}" /></Field>
            <Field label="Child default description"><textarea className={areaCls} value={form.seo_defaults.description} onChange={setD2("description")} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Child robots"><Select value={form.seo_defaults.robots} onChange={setD2("robots")} options={ROBOTS} /></Field><Field label="Child share image"><input className={inputCls} value={form.seo_defaults.og_image} onChange={setD2("og_image")} /></Field></div>
          </Section>
        )}

        <Section title={`Structured data (${d.schema.length} block${d.schema.length === 1 ? "" : "s"})`} defaultOpen={false} testId="editor-sec-schema">
          {d.schema_validation.map((v, i) => (
            <div key={i} className="text-sm"><span className="font-semibold text-slate-800">{v.type}</span> {v.errors.length === 0 ? <Sev s="ok">valid</Sev> : <Sev s="high">{v.errors.length} error(s)</Sev>}
              {[...v.errors, ...v.warnings].map((m, j) => <p key={j} className="text-xs text-slate-500 ml-2">• {m}</p>)}</div>
          ))}
          <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-64" data-testid="editor-schema-json">{JSON.stringify(d.schema, null, 2)}</pre>
          <Field label="Additional custom JSON-LD (optional)" hint="One object with @type. Ratings/reviews are generated only from verified bookings and cannot be added here."><textarea data-testid="editor-custom-jsonld" className={`${areaCls} font-mono text-xs`} value={seo.schema_jsonld} onChange={setS("schema_jsonld")} /></Field>
          <Field label="Breadcrumb label (optional)"><input className={inputCls} value={seo.breadcrumb_label} onChange={setS("breadcrumb_label")} placeholder={p.name} /></Field>
        </Section>

        <Section title={`Content completeness · ${d.completeness.pct}%`} defaultOpen={false} testId="editor-sec-completeness">
          <ul className="grid sm:grid-cols-2 gap-1.5">{d.completeness.items.map((c) => <li key={c.label} className="text-sm flex items-center gap-2">{c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}<span className={c.ok ? "text-slate-700" : "text-slate-500"}>{c.label}</span></li>)}</ul>
        </Section>

        <Section title="Internal linking" defaultOpen={false} testId="editor-sec-links">
          {d.link_recommendations.length === 0 ? <p className="text-sm text-slate-500">No recommendations.</p> : d.link_recommendations.map((l, i) => (
            <p key={i} className="text-sm flex items-center gap-2"><Link2 className={`h-4 w-4 ${l.ok ? "text-emerald-500" : "text-amber-500"}`} /><span className="text-slate-700">{l.text}</span>{l.path && <span className="font-mono text-[11px] text-slate-400">{l.path}</span>}</p>
          ))}
        </Section>

        <Section title="Indexing status" defaultOpen={false} testId="editor-sec-indexing">
          {(d.status?.steps || []).map((s) => <p key={s.step} className="text-sm flex items-center gap-2">{s.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-amber-500" />}{s.step}<span className="text-xs text-slate-400">{s.detail}</span></p>)}
          <p className="text-xs text-slate-500">Last checked {fmtDate(d.status?.checked_at)} · Submitted for discovery: {d.status?.submitted_at ? fmtDate(d.status.submitted_at) : "not yet"}</p>
          {(inspect || d.status?.inspection) && <div className="text-xs rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200" data-testid="editor-inspection">Google: <b>{(inspect || d.status.inspection).coverage_state || (inspect || d.status.inspection).verdict}</b> · last crawl {(inspect || d.status.inspection).last_crawl || "—"}</div>}
          <div className="flex gap-2 flex-wrap"><Btn size="sm" variant="outline" onClick={doInspect} data-testid="editor-inspect"><SearchCheck className="h-3.5 w-3.5" />Inspect via Search Console</Btn></div>
          <p className="text-[11px] text-slate-400">If Search Console is not connected, copy the public URL above and inspect it manually in Google Search Console.</p>
        </Section>
      </div>
    </Shell>
  );
}

const Shell = ({ children, onClose }) => (
  <div className="fixed inset-0 z-[70] flex justify-end" data-testid="page-editor">
    <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
    <div className="relative w-full max-w-2xl h-full overflow-y-auto bg-[#F5F7FA] shadow-2xl animate-in slide-in-from-right duration-200">{children}</div>
  </div>
);
