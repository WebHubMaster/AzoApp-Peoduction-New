/* Admin → Mobile App → Customer App Home: manage every block of the Customer Mobile App home screen. */
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Smartphone, ImagePlus, Plus, Trash2, ArrowUp, ArrowDown, Save, RefreshCw } from "lucide-react";

const ICONS = ["shield-check", "clock", "indian-rupee", "credit-card", "headphones", "zap", "map-pin", "wallet", "gift", "star", "sparkles", "flame", "badge-percent", "truck", "phone", "heart", "check-circle", "award", "users", "home"];
const SECTION_LABELS = { categories: "Service Categories grid", offer_banner: "Offer banner (first booking)", quick_features: "Quick features strip", most_booked: "Most Booked Services", why_choose: "Why Choose Us", trending: "Trending Near You", salon: "Salon at Home (category tabs)", offers: "Offers & Savings" };
const uid = () => Math.random().toString(36).slice(2, 9);

function Field({ label, children, hint, className = "" }) {
  return (
    <div className={className}>
      {label && <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</label>}
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function IconSelect({ value, onChange, testid }) {
  return (
    <select data-testid={testid} value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm w-full">
      {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
    </select>
  );
}

function ImageUpload({ value, onChange, folder = "app_home", testid, wide = false }) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {value
        ? <img src={value} alt="" className={`${wide ? "h-16 w-28" : "h-16 w-16"} rounded-xl object-cover border border-slate-200`} />
        : <div className={`${wide ? "h-16 w-28" : "h-16 w-16"} rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400`}><ImagePlus className="h-5 w-5" /></div>}
      <div className="flex flex-col gap-1.5">
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-primary-700 border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-50 w-fit">
          <input type="file" accept="image/*" className="hidden" data-testid={testid} onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const fd = new FormData(); fd.append("file", file); fd.append("folder", folder);
            try { setUploading(true); const { data } = await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }); onChange(data.url); toast.success("Image uploaded"); }
            catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); } finally { setUploading(false); }
          }} />
          {uploading ? "Uploading…" : value ? "Change image" : "Choose image"}
        </label>
        {value && <button type="button" onClick={() => onChange("")} className="text-xs text-red-600 hover:underline w-fit">Remove</button>}
      </div>
    </div>
  );
}

const Card = ({ title, sub, children, right }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div><p className="font-heading font-bold text-base text-slate-900 dark:text-white">{title}</p>{sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}</div>
      {right}
    </div>
    {children}
  </div>
);

export default function AppHomeManager() {
  const [cfg, setCfg] = useState(null);
  const [cats, setCats] = useState([]);
  const [offers, setOffers] = useState([]);
  const [services, setServices] = useState([]);
  const [saving, setSaving] = useState(false);
  const load = () => api.get("/admin/app-home").then((r) => setCfg(r.data));
  useEffect(() => {
    load();
    api.get("/catalog/categories").then((r) => setCats(r.data || [])).catch(() => {});
    api.get("/site/promotions").then((r) => setOffers(r.data?.offers || [])).catch(() => {});
    api.get("/catalog/services").then((r) => setServices(r.data || [])).catch(() => {});
  }, []);
  if (!cfg) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  const set = (patch) => setCfg((p) => ({ ...p, ...patch }));
  const setIn = (k, patch) => setCfg((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  const upList = (k, i, patch) => setCfg((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const rmList = (k, i) => setCfg((p) => ({ ...p, [k]: p[k].filter((_, j) => j !== i) }));
  const move = (k, i, d) => setCfg((p) => { const a = [...p[k]]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, [k]: a }; });
  const save = async () => {
    setSaving(true);
    const known = new Set(cfg.sections.map((x) => x.key));
    const extra = (cfg.custom_sections || []).filter((c) => !known.has(`custom:${c.id}`)).map((c) => ({ key: `custom:${c.id}`, enabled: true }));
    const body = { ...cfg, sections: [...cfg.sections, ...extra].filter((x) => !x.key.startsWith("custom:") || (cfg.custom_sections || []).some((c) => `custom:${c.id}` === x.key)) };
    try { const { data } = await api.put("/admin/app-home", body); setCfg(data); toast.success("Customer App home saved — live in the app within a minute"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5" data-testid="app-home-manager">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0"><Smartphone className="h-5 w-5" /></span>
          <div>
            <p className="font-heading font-bold text-lg text-slate-900 dark:text-white">Customer App · Home Page</p>
            <p className="text-sm text-slate-500 mt-0.5">Everything on the mobile home screen — logo, hero slider, quick features, Why Choose Us, section order &amp; visibility. Categories, services, offers and coupons stay live from the catalog.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} data-testid="app-home-reload"><RefreshCw className="h-4 w-4 mr-1" />Reload</Button>
          <Button onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800 text-white" data-testid="app-home-save"><Save className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>

      <Card title="Branding (header)" sub="Leave empty to use the global Branding & Theme logo / tagline.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="App logo"><ImageUpload value={cfg.branding.logo} onChange={(v) => setIn("branding", { logo: v })} wide testid="app-home-logo-input" /></Field>
          <div className="space-y-3">
            <Field label="Tagline"><Input data-testid="app-home-tagline" value={cfg.branding.tagline || ""} onChange={(e) => setIn("branding", { tagline: e.target.value })} placeholder="Service at Your Doorstep" /></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={cfg.branding.show_tagline !== false} onCheckedChange={(v) => setIn("branding", { show_tagline: v })} /> Show tagline under logo</label>
          </div>
        </div>
      </Card>

      <Card title="Hero slider" sub="Swipeable slides at the top of the home screen." right={<Button size="sm" variant="outline" data-testid="hero-add" onClick={() => set({ hero_slides: [...cfg.hero_slides, { id: `slide-${uid()}`, enabled: true, badge: "", title: "", highlight: "", subtitle: "", image: "", side_text: "", rating_value: "", rating_label: "Customer Rating", cta_label: "Book a Service", cta_link: "/services", features: [] }] })}><Plus className="h-4 w-4 mr-1" />Add slide</Button>}>
        {cfg.hero_slides.map((s, i) => (
          <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3" data-testid={`hero-slide-${i}`}>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={s.enabled !== false} onCheckedChange={(v) => upList("hero_slides", i, { enabled: v })} /> Slide {i + 1}</label>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => move("hero_slides", i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => move("hero_slides", i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="text-red-600" onClick={() => rmList("hero_slides", i)} data-testid={`hero-remove-${i}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Eyebrow text (e.g. Salon at home)"><Input value={s.badge || ""} onChange={(e) => upList("hero_slides", i, { badge: e.target.value })} /></Field>
              <Field label="Side text (next to image)"><Input value={s.side_text || ""} onChange={(e) => upList("hero_slides", i, { side_text: e.target.value })} /></Field>
              <Field label="Headline"><Input data-testid={`hero-title-${i}`} value={s.title || ""} onChange={(e) => upList("hero_slides", i, { title: e.target.value })} /></Field>
              <Field label="Headline (line 2, optional)"><Input value={s.highlight || ""} onChange={(e) => upList("hero_slides", i, { highlight: e.target.value })} /></Field>
              <Field label="Subtitle" className="sm:col-span-2"><Input value={s.subtitle || ""} onChange={(e) => upList("hero_slides", i, { subtitle: e.target.value })} /></Field>
              <Field label="Rating value"><Input value={s.rating_value || ""} onChange={(e) => upList("hero_slides", i, { rating_value: e.target.value })} placeholder="4.8 (empty = live rating)" /></Field>
              <Field label="Rating label"><Input value={s.rating_label || ""} onChange={(e) => upList("hero_slides", i, { rating_label: e.target.value })} /></Field>
              <Field label="Button label"><Input value={s.cta_label || ""} onChange={(e) => upList("hero_slides", i, { cta_label: e.target.value })} /></Field>
              <Field label="Button link" hint="/services · /services?category=ID · /service/ID · /membership · /offers"><Input value={s.cta_link || ""} onChange={(e) => upList("hero_slides", i, { cta_link: e.target.value })} /></Field>
              <Field label="Slider poster image (full banner · recommended 1000×430px)" className="sm:col-span-2"><ImageUpload value={s.image} onChange={(v) => upList("hero_slides", i, { image: v })} wide testid={`hero-image-${i}`} /></Field>
            </div>
            <Field label="Feature bullets (icon · title · sub)">
              <div className="space-y-2">
                {(s.features || []).map((f, fi) => (
                  <div key={fi} className="grid grid-cols-[140px_1fr_1fr_36px] gap-2 items-center">
                    <IconSelect value={f.icon} onChange={(v) => upList("hero_slides", i, { features: s.features.map((x, k) => (k === fi ? { ...x, icon: v } : x)) })} />
                    <Input value={f.title || ""} placeholder="Verified" onChange={(e) => upList("hero_slides", i, { features: s.features.map((x, k) => (k === fi ? { ...x, title: e.target.value } : x)) })} />
                    <Input value={f.sub || ""} placeholder="Experts" onChange={(e) => upList("hero_slides", i, { features: s.features.map((x, k) => (k === fi ? { ...x, sub: e.target.value } : x)) })} />
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={() => upList("hero_slides", i, { features: s.features.filter((_, k) => k !== fi) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => upList("hero_slides", i, { features: [...(s.features || []), { icon: "shield-check", title: "", sub: "" }] })}><Plus className="h-4 w-4 mr-1" />Add bullet</Button>
              </div>
            </Field>
          </div>
        ))}
      </Card>

      <Card title="Quick features strip" sub="Small cards under the offer banner." right={<Button size="sm" variant="outline" data-testid="qf-add" onClick={() => set({ quick_features: [...cfg.quick_features, { id: `qf-${uid()}`, enabled: true, icon: "zap", title: "", sub: "", link: "/services" }] })}><Plus className="h-4 w-4 mr-1" />Add</Button>}>
        {cfg.quick_features.map((q, i) => (
          <div key={q.id} className="grid grid-cols-[44px_130px_1fr_1fr_1fr_36px] gap-2 items-center" data-testid={`qf-row-${i}`}>
            <Switch checked={q.enabled !== false} onCheckedChange={(v) => upList("quick_features", i, { enabled: v })} />
            <IconSelect value={q.icon} onChange={(v) => upList("quick_features", i, { icon: v })} />
            <Input value={q.title || ""} placeholder="Title" onChange={(e) => upList("quick_features", i, { title: e.target.value })} />
            <Input value={q.sub || ""} placeholder="Sub text" onChange={(e) => upList("quick_features", i, { sub: e.target.value })} />
            <Input value={q.link || ""} placeholder="/services" onChange={(e) => upList("quick_features", i, { link: e.target.value })} />
            <Button size="icon" variant="ghost" className="text-red-600" onClick={() => rmList("quick_features", i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </Card>

      <Card title="Why Choose Us" right={<Switch checked={cfg.why_choose.enabled !== false} onCheckedChange={(v) => setIn("why_choose", { enabled: v })} data-testid="why-enabled" />}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title"><Input data-testid="why-title" value={cfg.why_choose.title || ""} onChange={(e) => setIn("why_choose", { title: e.target.value })} /></Field>
          <Field label="Side text"><Input value={cfg.why_choose.side_text || ""} onChange={(e) => setIn("why_choose", { side_text: e.target.value })} /></Field>
          <Field label="Image (family / right side)" className="sm:col-span-2"><ImageUpload value={cfg.why_choose.image} onChange={(v) => setIn("why_choose", { image: v })} wide testid="why-image" /></Field>
        </div>
        <div className="space-y-2">
          {(cfg.why_choose.items || []).map((it, i) => (
            <div key={i} className="grid grid-cols-[150px_1fr_36px] gap-2 items-center">
              <IconSelect value={it.icon} onChange={(v) => setIn("why_choose", { items: cfg.why_choose.items.map((x, k) => (k === i ? { ...x, icon: v } : x)) })} />
              <Input value={it.title || ""} onChange={(e) => setIn("why_choose", { items: cfg.why_choose.items.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
              <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setIn("why_choose", { items: cfg.why_choose.items.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setIn("why_choose", { items: [...(cfg.why_choose.items || []), { icon: "shield-check", title: "" }] })}><Plus className="h-4 w-4 mr-1" />Add point</Button>
        </div>
      </Card>

      <Card title="Offer banner" sub="Big banner after the categories. Uses an active Offer from Marketing → Offers (code, discount).">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Eyebrow"><Input value={cfg.offer_banner.eyebrow || ""} onChange={(e) => setIn("offer_banner", { eyebrow: e.target.value })} /></Field>
          <Field label="Offer"><select data-testid="offer-select" value={cfg.offer_banner.offer_id || ""} onChange={(e) => setIn("offer_banner", { offer_id: e.target.value })} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm w-full"><option value="">Auto (first active offer)</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.title} · {o.code}</option>)}</select></Field>
          <Field label="Button label"><Input value={cfg.offer_banner.cta_label || ""} onChange={(e) => setIn("offer_banner", { cta_label: e.target.value })} /></Field>
          <Field label="Button link"><Input value={cfg.offer_banner.cta_link || ""} onChange={(e) => setIn("offer_banner", { cta_link: e.target.value })} /></Field>
          <Field label="Banner image (right side)" className="sm:col-span-2"><ImageUpload value={cfg.offer_banner.image} onChange={(v) => setIn("offer_banner", { image: v })} wide testid="offer-image" /></Field>
        </div>
      </Card>

      <Card title="Salon at Home tabs" sub="Pick the categories shown as tabs (e.g. For Women / For Men). Leave empty to auto-detect categories containing “salon”." right={<Switch checked={cfg.salon.enabled !== false} onCheckedChange={(v) => setIn("salon", { enabled: v })} />}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Title"><Input value={cfg.salon.title || ""} onChange={(e) => setIn("salon", { title: e.target.value })} /></Field>
          <Field label="Icon"><IconSelect value={cfg.salon.icon} onChange={(v) => setIn("salon", { icon: v })} /></Field>
          <Field label="Services per tab"><Input type="number" value={cfg.salon.limit || 8} onChange={(e) => setIn("salon", { limit: Number(e.target.value) })} /></Field>
        </div>
        <div className="space-y-2">
          {(cfg.salon.tabs || []).map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_36px] gap-2 items-center">
              <Input value={t.label || ""} placeholder="Tab label (For Women)" onChange={(e) => setIn("salon", { tabs: cfg.salon.tabs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
              <select value={t.category_id || ""} onChange={(e) => setIn("salon", { tabs: cfg.salon.tabs.map((x, k) => (k === i ? { ...x, category_id: e.target.value } : x)) })} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"><option value="">Select category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setIn("salon", { tabs: cfg.salon.tabs.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" data-testid="salon-add-tab" onClick={() => setIn("salon", { tabs: [...(cfg.salon.tabs || []), { label: "", category_id: "" }] })}><Plus className="h-4 w-4 mr-1" />Add tab</Button>
        </div>
      </Card>

      <Card title="Categories grid">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Max categories shown" hint="The last tile becomes “More Services”"><Input type="number" value={cfg.categories.limit} onChange={(e) => setIn("categories", { limit: Number(e.target.value) })} /></Field>
          <Field label="More tile label"><Input value={cfg.categories.more_label || ""} onChange={(e) => setIn("categories", { more_label: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm mt-6"><Switch checked={cfg.categories.show_more !== false} onCheckedChange={(v) => setIn("categories", { show_more: v })} /> Show “More Services” tile</label>
        </div>
      </Card>

      <Card title="Custom home sections" sub="Create your own rows: hand-picked services, a whole category, or a promo banner. They appear on the app home in the order below." right={<Button size="sm" variant="outline" data-testid="custom-add" onClick={() => set({ custom_sections: [...(cfg.custom_sections || []), { id: uid(), enabled: true, type: "services", title: "", subtitle: "", icon: "sparkles", service_ids: [], category_id: "", limit: 8, image: "", link: "/services" }], sections: [...cfg.sections] })}><Plus className="h-4 w-4 mr-1" />Add section</Button>}>
        {(cfg.custom_sections || []).length === 0 && <p className="text-sm text-slate-400">No custom sections yet.</p>}
        {(cfg.custom_sections || []).map((c, i) => (
          <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3" data-testid={`custom-section-${i}`}>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={c.enabled !== false} onCheckedChange={(v) => upList("custom_sections", i, { enabled: v })} /> Section {i + 1}</label>
              <Button size="icon" variant="ghost" className="text-red-600" data-testid={`custom-remove-${i}`} onClick={() => set({ custom_sections: cfg.custom_sections.filter((_, k) => k !== i), sections: cfg.sections.filter((x) => x.key !== `custom:${c.id}`) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Type"><select data-testid={`custom-type-${i}`} value={c.type} onChange={(e) => upList("custom_sections", i, { type: e.target.value })} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm w-full"><option value="services">Hand-picked services</option><option value="category">All services of a category</option><option value="banner">Promo banner (image + link)</option></select></Field>
              <Field label="Title"><Input data-testid={`custom-title-${i}`} value={c.title || ""} onChange={(e) => upList("custom_sections", i, { title: e.target.value })} placeholder="e.g. Monsoon Essentials" /></Field>
              <Field label="Icon"><IconSelect value={c.icon} onChange={(v) => upList("custom_sections", i, { icon: v })} /></Field>
              {c.type === "services" && <Field label="Services (multi-select)" className="sm:col-span-3"><select multiple data-testid={`custom-services-${i}`} value={c.service_ids || []} onChange={(e) => upList("custom_sections", i, { service_ids: Array.from(e.target.selectedOptions).map((o) => o.value) })} className="h-36 rounded-md border border-slate-200 bg-white px-2 text-sm w-full">{services.map((sv) => <option key={sv.id} value={sv.id}>{sv.name} · {sv.category_name}</option>)}</select></Field>}
              {c.type === "category" && <Field label="Category"><select data-testid={`custom-category-${i}`} value={c.category_id || ""} onChange={(e) => upList("custom_sections", i, { category_id: e.target.value })} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm w-full"><option value="">Select category</option>{cats.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}</select></Field>}
              {c.type !== "banner" && <Field label="Max items"><Input type="number" value={c.limit || 8} onChange={(e) => upList("custom_sections", i, { limit: Number(e.target.value) })} /></Field>}
              {c.type === "banner" && <><Field label="Banner image" className="sm:col-span-2"><ImageUpload value={c.image} onChange={(v) => upList("custom_sections", i, { image: v })} wide testid={`custom-image-${i}`} /></Field><Field label="Link"><Input value={c.link || ""} onChange={(e) => upList("custom_sections", i, { link: e.target.value })} placeholder="/services" /></Field><Field label="Subtitle" className="sm:col-span-3"><Input value={c.subtitle || ""} onChange={(e) => upList("custom_sections", i, { subtitle: e.target.value })} /></Field></>}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Sections — order & visibility" sub="Drag order with arrows; toggle to hide a block; edit titles for service rows.">
        {cfg.sections.map((s, i) => (
          <div key={s.key} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2" data-testid={`section-row-${s.key}`}>
            <Switch checked={s.enabled !== false} onCheckedChange={(v) => upList("sections", i, { enabled: v })} data-testid={`section-toggle-${s.key}`} />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 w-56 shrink-0">{SECTION_LABELS[s.key] || (s.key.startsWith("custom:") ? `Custom · ${(cfg.custom_sections || []).find((c) => `custom:${c.id}` === s.key)?.title || "section"}` : s.key)}</span>
            {["most_booked", "trending", "offers"].includes(s.key) && (
              <>
                <Input className="h-8" value={s.title || ""} onChange={(e) => upList("sections", i, { title: e.target.value })} placeholder="Title" />
                <Input className="h-8 w-20" type="number" value={s.limit || 8} onChange={(e) => upList("sections", i, { limit: Number(e.target.value) })} />
                <div className="w-32"><IconSelect value={s.icon} onChange={(v) => upList("sections", i, { icon: v })} /></div>
              </>
            )}
            <div className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => move("sections", i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => move("sections", i, 1)}><ArrowDown className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </Card>

      <div className="flex justify-end"><Button onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800 text-white" data-testid="app-home-save-bottom"><Save className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Save changes"}</Button></div>
    </div>
  );
}
