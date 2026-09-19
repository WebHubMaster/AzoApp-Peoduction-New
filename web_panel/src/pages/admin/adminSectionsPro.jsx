import HomeStatsControl from "@/pages/admin/HomeStatsControl";
import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { uploadImage } from "@/lib/imageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, Trash2, Pencil, ChevronUp, ChevronDown, Bold, Italic, List, ListOrdered, Heading, Link2, ImagePlus, Plus, Star, Copy, Sparkles, Layers, Tag, Globe, Info, Check, ChevronRight, Search as SearchIcon, Image as ImageIcon, MapPin, Phone, Clock, User as UserIcon, CheckCircle2, Loader2, RefreshCw, Calendar, Briefcase, Mail, Bell, Send, Users, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { applySiteTheme, useSiteConfig } from "@/context/SiteConfigContext";
import DataTable from "@/components/admin/DataTable";
import BannersManagerPro from "@/components/marketing/BannersManager";

/* =============== Reusable: Image Upload (S3-ready via /media/upload) =============== */
export const ImageUpload = ({ value, onChange, label, folder = "media", hint }) => {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setPct(0);
    try {
      const data = await uploadImage(api, file, { folder, onProgress: setPct });
      onChange(data.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      setPct(0);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div>
      {label && <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</label>}
      <div className="mt-1 flex items-center gap-3">
        {value ? (
          <div className="relative group">
            <img src={value} alt="" className="h-20 w-20 rounded-lg object-contain bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <button type="button" onClick={() => onChange("")} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} data-testid="image-upload-btn" className="h-20 w-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-slate-400 hover:border-primary-500 hover:text-primary-600 transition disabled:opacity-70">
            {busy ? (
              <div className="w-full px-2 text-center">
                <span className="text-[10px] font-semibold text-primary-600" data-testid="image-upload-pct">{pct || 1}%</span>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-primary-500 transition-[width] duration-200" style={{ width: `${pct || 1}%` }} />
                </div>
              </div>
            ) : (<><ImagePlus className="h-5 w-5" /><span className="text-[10px] mt-1">Upload</span></>)}
          </button>
        )}
        <div className="flex-1">
          <Input placeholder="…or paste an image URL" value={value || ""} onChange={(e) => onChange(e.target.value)} />
          {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
        </div>
        <input ref={ref} type="file" accept="image/*,.svg,image/svg+xml" className="hidden" onChange={pick} />
      </div>
    </div>
  );
};

/* =============== Reusable: Tag input (comma / Enter / paste → chips) =============== */
export const TagInput = ({ value = [], onChange, placeholder = "Type & press Enter (or use commas)" }) => {
  const [t, setT] = useState("");
  const commit = (raw) => {
    const parts = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    parts.forEach((p) => { if (!next.includes(p)) next.push(p); });
    if (next.length !== value.length) onChange(next);
    setT("");
  };
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(t); }
    else if (e.key === "Backspace" && !t && value.length) { onChange(value.slice(0, -1)); }
  };
  const onChangeInput = (e) => {
    const v = e.target.value;
    // typing a comma finalises the current chip(s) immediately
    if (v.includes(",")) commit(v);
    else setT(v);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((tag) => (
          <Badge key={tag} className="bg-primary-50 text-primary-700 border-0 gap-1 dark:bg-primary-900/30 dark:text-primary-300">
            {tag}<button type="button" onClick={() => onChange(value.filter((x) => x !== tag))}><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
      <Input value={t} placeholder={placeholder} onChange={onChangeInput} onKeyDown={onKey}
        onBlur={() => commit(t)}
        onPaste={(e) => { const txt = e.clipboardData.getData("text"); if (txt.includes(",")) { e.preventDefault(); commit(txt); } }} />
    </div>
  );
};

/* Keywords input: same chip UX but reads/writes a COMMA-SEPARATED STRING
   (keeps backend SEO fields — seo.keywords / meta_keywords — unchanged). */
export const KeywordsInput = ({ value = "", onChange, placeholder = "Type a keyword, press Enter or comma" }) => {
  const arr = String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
  return <TagInput value={arr} onChange={(next) => onChange(next.join(", "))} placeholder={placeholder} />;
};

/* =============== Reusable: Rich text (contenteditable) =============== */
export const RichText = ({ value, onChange, placeholder = "Write a rich description…" }) => {
  const ref = useRef();
  useEffect(() => { if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || ""; }, [value]);
  const cmd = (c, v = null) => { document.execCommand(c, false, v); ref.current?.focus(); onChange(ref.current.innerHTML); };
  const Btn = ({ icon: I, c, arg }) => (
    <button type="button" onMouseDown={(e) => { e.preventDefault(); c === "link" ? cmd("createLink", prompt("Link URL") || "") : cmd(c, arg); }}
      className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"><I className="h-4 w-4" /></button>
  );
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1 py-1">
        <Btn icon={Bold} c="bold" /><Btn icon={Italic} c="italic" />
        <Btn icon={Heading} c="formatBlock" arg="<h3>" />
        <Btn icon={List} c="insertUnorderedList" /><Btn icon={ListOrdered} c="insertOrderedList" />
        <Btn icon={Link2} c="link" />
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        className="min-h-[120px] px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none prose-sm rt-editor" />
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
    {title && <h3 className="font-heading font-bold text-slate-900 dark:text-white">{title}</h3>}
    {children}
  </div>
);
const Field = ({ label, children }) => (
  <div><label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</label><div className="mt-1">{children}</div></div>
);
const StatusPill = ({ s }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>{s === "active" ? "Active" : "Inactive"}</span>
);
const Tbl = ({ children }) => <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto"><table className="w-full text-sm">{children}</table></div>;

/* =============== SEO fields (shared) =============== */
const SeoFields = ({ seo = {}, onChange }) => {
  const set = (k, v) => onChange({ ...seo, [k]: v });
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Field label="SEO Title (max 255)"><Input maxLength={255} value={seo.title || ""} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="Canonical URL"><Input value={seo.canonical || ""} onChange={(e) => set("canonical", e.target.value)} /></Field>
      <Field label="Meta Keywords"><KeywordsInput value={seo.keywords || ""} onChange={(v) => set("keywords", v)} /></Field>
      <Field label="OG Title"><Input value={seo.og_title || ""} onChange={(e) => set("og_title", e.target.value)} /></Field>
      <div className="md:col-span-2"><Field label="Meta Description (max 500)"><Textarea maxLength={500} value={seo.description || ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
      <div className="md:col-span-2"><Field label="OG Description"><Textarea value={seo.og_description || ""} onChange={(e) => set("og_description", e.target.value)} /></Field></div>
      <div className="md:col-span-2"><ImageUpload label="SEO / OG Image" folder="seo" value={seo.og_image || seo.image || ""} onChange={(v) => onChange({ ...seo, og_image: v, image: v })} /></div>
      <div className="md:col-span-2"><Field label="JSON-LD Schema Markup"><Textarea className="font-mono text-xs" placeholder='{"@context":"https://schema.org", ...}' value={seo.schema_jsonld || ""} onChange={(e) => set("schema_jsonld", e.target.value)} /></Field></div>
    </div>
  );
};

/* =============== Advanced SEO section (shared: category / sub-category) =============== */
const AdvancedSeoSection = ({ seo = {}, onChange, name, slug, description, fallbackImage = "" }) => {
  const set = (k, v) => onChange({ ...seo, [k]: v });
  const previewObj = { seo, name, short_description: description, description, rating: 0, review_count: 0, base_price: 0 };
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/20 p-3 flex gap-2 text-xs text-primary-800 dark:text-primary-200">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Fields marked * are mandatory for Google ranking. A rich-result schema (CollectionPage + Breadcrumb) is generated automatically so this page ranks high and shows first in search.</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="SEO Title *"><Input maxLength={255} value={seo.title || ""} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Meta Keywords *"><KeywordsInput placeholder="e.g. ac repair, ac service near me" value={seo.keywords || ""} onChange={(v) => set("keywords", v)} /></Field>
        <div className="md:col-span-2"><Field label="Meta Description * (max 160 chars ideal)"><Textarea maxLength={500} value={seo.description || ""} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <Field label="Canonical URL"><Input value={seo.canonical || ""} onChange={(e) => set("canonical", e.target.value)} /></Field>
        <Field label="OG Title"><Input value={seo.og_title || ""} onChange={(e) => set("og_title", e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="OG Description"><Textarea value={seo.og_description || ""} onChange={(e) => set("og_description", e.target.value)} /></Field></div>
        <div className="md:col-span-2"><ImageUpload label="Social / OG Image *" folder="seo" value={seo.og_image || seo.image || fallbackImage || ""} onChange={(v) => onChange({ ...seo, og_image: v, image: v })} /></div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><SearchIcon className="h-3.5 w-3.5" />Google preview</p>
        <SerpPreview f={previewObj} slug={slug} />
      </div>
      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
        <Check className="h-4 w-4" />Auto structured-data (schema.org) enabled — helps this page appear first in Google.
      </div>
    </div>
  );
};


/* =============== CATEGORIES (premium) =============== */
export const CategoriesManagerPro = () => {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const blank = { name: "", slug: "", icon: "wrench", image: "", description: "", required_skill: "", is_featured: false, show_on_home: true, order: 0, status: "active", seo: {} };
  const [f, setF] = useState(blank);
  const load = () => api.get("/catalog/admin/categories").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const catSlug = f.slug || slugify(f.name);
  const save = async () => {
    if (!f.name) return toast.error("Name required");
    const seo = f.seo || {};
    const missing = [];
    if (!seo.title) missing.push("SEO title");
    if (!seo.description) missing.push("Meta description");
    if (!seo.keywords) missing.push("Meta keywords");
    if (!(f.image || seo.og_image || seo.image)) missing.push("Image");
    if (missing.length) return toast.error(`SEO required: ${missing.join(", ")}`);
    const payload = { ...f, slug: catSlug };
    try {
      if (edit) { await api.put(`/catalog/categories/${edit}`, payload); toast.success("Category updated"); }
      else { await api.post("/catalog/categories", payload); toast.success("Category created"); }
      setF(blank); setEdit(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const toggle = async (c) => { await api.put(`/catalog/categories/${c.id}`, { status: c.status === "active" ? "inactive" : "active" }); load(); };
  const del = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? This removes its sub-categories & services permanently.`)) return;
    try { await api.delete(`/catalog/categories/${c.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const editRow = (c) => { setEdit(c.id); setF({ ...blank, ...c, seo: c.seo || {} }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <div className="grid xl:grid-cols-5 gap-5">
      <div className="xl:col-span-2 space-y-4">
        <Section title={edit ? "Edit Category" : "Add Category"}>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="URL Slug"><div className="flex items-center gap-2"><span className="text-xs text-slate-400">/category/</span><Input value={f.slug} placeholder={slugify(f.name) || "auto-generated"} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></div></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Required Skill"><Input placeholder="e.g. ac" value={f.required_skill} onChange={(e) => setF({ ...f, required_skill: e.target.value })} /></Field>
            <Field label="Display Order"><Input type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
          </div>
          <ImageUpload label="Category Image" folder="category" value={f.image} onChange={(v) => setF({ ...f, image: v })} />
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Featured</span><Switch checked={f.is_featured} onCheckedChange={(v) => setF({ ...f, is_featured: v })} /></div>
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Show on Homepage</span><Switch checked={f.show_on_home} onCheckedChange={(v) => setF({ ...f, show_on_home: v })} /></div>
        </Section>
        <Section title="Advanced SEO (rank #1 on Google)"><AdvancedSeoSection seo={f.seo} onChange={(v) => setF({ ...f, seo: v })} name={f.name} slug={catSlug} description={f.description} fallbackImage={f.image} /></Section>
        <div className="flex gap-2">
          <Button onClick={save} className="bg-primary-700 hover:bg-primary-800 flex-1">{edit ? "Update Category" : "Create Category"}</Button>
          {edit && <Button variant="outline" onClick={() => { setEdit(null); setF(blank); }}>Cancel</Button>}
        </div>
      </div>
      <div className="xl:col-span-3">
        <Tbl>
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-left"><tr>{["Category", "Services", "Subs", "Featured", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3"><div className="flex items-center gap-2">{c.image && <img src={c.image} alt="" className="h-8 w-8 rounded object-cover" />}<span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span></div></td>
                <td className="px-4 py-3 text-slate-500">{c.service_count ?? 0}</td>
                <td className="px-4 py-3 text-slate-500">{c.subcategory_count ?? 0}</td>
                <td className="px-4 py-3">{c.is_featured ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : "—"}</td>
                <td className="px-4 py-3"><button onClick={() => toggle(c)}><StatusPill s={c.status} /></button></td>
                <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => editRow(c)} className="text-primary-700"><Pencil className="h-4 w-4" /></button><button onClick={() => del(c)} className="text-red-500"><Trash2 className="h-4 w-4" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </div>
    </div>
  );
};

/* =============== SUB-CATEGORIES =============== */
export const SubCategoriesManager = () => {
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const blank = { category_id: "", name: "", slug: "", image: "", description: "", is_featured: false, order: 0, status: "active", seo: {} };
  const [f, setF] = useState(blank);
  const load = () => { api.get("/catalog/admin/categories").then((r) => setCats(r.data)); api.get("/catalog/admin/subcategories").then((r) => setRows(r.data)); };
  useEffect(() => { load(); }, []);
  const subSlug = f.slug || slugify(f.name);
  const save = async () => {
    if (!f.category_id || !f.name) return toast.error("Parent category & name required");
    const seo = f.seo || {};
    const missing = [];
    if (!seo.title) missing.push("SEO title");
    if (!seo.description) missing.push("Meta description");
    if (!seo.keywords) missing.push("Meta keywords");
    if (!(f.image || seo.og_image || seo.image)) missing.push("Image");
    if (missing.length) return toast.error(`SEO required: ${missing.join(", ")}`);
    const payload = { ...f, slug: subSlug };
    if (edit) { await api.put(`/catalog/subcategories/${edit}`, payload); toast.success("Updated"); }
    else { await api.post("/catalog/subcategories", payload); toast.success("Sub-category created"); }
    setF(blank); setEdit(null); load();
  };
  const toggle = async (s) => { await api.put(`/catalog/subcategories/${s.id}`, { status: s.status === "active" ? "inactive" : "active" }); load(); };
  const del = async (s) => { if (!window.confirm(`Delete "${s.name}"?`)) return; await api.delete(`/catalog/subcategories/${s.id}`); load(); };
  const editRow = (s) => { setEdit(s.id); setF({ ...blank, ...s, seo: s.seo || {} }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <div className="grid xl:grid-cols-5 gap-5">
      <div className="xl:col-span-2 space-y-4">
        <Section title={edit ? "Edit Sub-category" : "Add Sub-category"}>
          <Field label="Parent Category">
            <Select value={f.category_id} onValueChange={(v) => setF({ ...f, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Order"><Input type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
          </div>
          <Field label="URL Slug"><div className="flex items-center gap-2"><span className="text-xs text-slate-400">/category/</span><Input value={f.slug} placeholder={slugify(f.name) || "auto-generated"} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></div></Field>
          <ImageUpload label="Image" folder="subcategory" value={f.image} onChange={(v) => setF({ ...f, image: v })} />
          <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Featured</span><Switch checked={f.is_featured} onCheckedChange={(v) => setF({ ...f, is_featured: v })} /></div>
        </Section>
        <Section title="Advanced SEO (rank #1 on Google)"><AdvancedSeoSection seo={f.seo} onChange={(v) => setF({ ...f, seo: v })} name={f.name} slug={subSlug} description={f.description} fallbackImage={f.image} /></Section>
        <div className="flex gap-2"><Button onClick={save} className="bg-primary-700 hover:bg-primary-800 flex-1">{edit ? "Update" : "Create"}</Button>{edit && <Button variant="outline" onClick={() => { setEdit(null); setF(blank); }}>Cancel</Button>}</div>
      </div>
      <div className="xl:col-span-3">
        <Tbl>
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-left"><tr>{["Sub-category", "Parent", "Services", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No sub-categories yet</td></tr>}
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{s.name}</td>
                <td className="px-4 py-3 text-slate-500">{s.category_name}</td>
                <td className="px-4 py-3 text-slate-500">{s.service_count ?? 0}</td>
                <td className="px-4 py-3"><button onClick={() => toggle(s)}><StatusPill s={s.status} /></button></td>
                <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => editRow(s)} className="text-primary-700"><Pencil className="h-4 w-4" /></button><button onClick={() => del(s)} className="text-red-500"><Trash2 className="h-4 w-4" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </div>
    </div>
  );
};

/* =============== ADD-ON SERVICES (category-wise library) =============== */
export const AddonsManager = () => {
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const blank = { category_id: "", name: "", price: 0, description: "", status: "active" };
  const [f, setF] = useState(blank);
  const load = () => {
    api.get("/catalog/admin/categories").then((r) => setCats(r.data || [])).catch(() => setCats([]));
    api.get("/catalog/admin/addons").then((r) => setRows(r.data || [])).catch(() => setRows([]));
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!f.category_id) return toast.error("Category is required");
    if (!f.name?.trim()) return toast.error("Add-on name is required");
    const payload = { ...f, price: Number(f.price) || 0 };
    try {
      if (edit) { await api.put(`/catalog/addons/${edit}`, payload); toast.success("Add-on updated"); }
      else { await api.post("/catalog/addons", payload); toast.success("Add-on created"); }
      setF(blank); setEdit(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to save"); }
  };
  const toggle = async (a) => { await api.put(`/catalog/addons/${a.id}`, { status: a.status === "active" ? "inactive" : "active" }); load(); };
  const del = async (a) => { if (!window.confirm(`Delete add-on "${a.name}"?`)) return; try { await api.delete(`/catalog/addons/${a.id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  const editRow = (a) => { setEdit(a.id); setF({ ...blank, ...a }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const shown = rows.filter((r) => filterCat === "all" || r.category_id === filterCat);
  return (
    <div className="grid xl:grid-cols-5 gap-5">
      <div className="xl:col-span-2 space-y-4">
        <Section title={edit ? "Edit Add-on" : "Add Add-on Service"}>
          <p className="text-xs text-slate-400 mb-3">Create reusable add-ons per category. When creating a service in that category you can attach these, and customers see them under <b>&ldquo;Frequently Added&rdquo;</b> / <b>&ldquo;Add-ons&rdquo;</b> at booking.</p>
          <Field label="Category">
            <Select value={f.category_id} onValueChange={(v) => setF({ ...f, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Add-on Name"><Input placeholder="e.g. MCB Replace" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Price (₹)"><Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          </div>
          <Field label="Description (optional)"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Active</span><Switch checked={f.status === "active"} onCheckedChange={(v) => setF({ ...f, status: v ? "active" : "inactive" })} /></div>
        </Section>
        <div className="flex gap-2"><Button onClick={save} className="bg-primary-700 hover:bg-primary-800 flex-1">{edit ? "Update Add-on" : "Create Add-on"}</Button>{edit && <Button variant="outline" onClick={() => { setEdit(null); setF(blank); }}>Cancel</Button>}</div>
      </div>
      <div className="xl:col-span-3 space-y-3">
        <div className="w-56">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger><SelectValue placeholder="Filter by category" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Tbl>
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 text-left"><tr>{["Add-on", "Category", "Price", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No add-ons yet. Create your first add-on on the left.</td></tr>}
            {shown.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{a.name}</td>
                <td className="px-4 py-3 text-slate-500">{a.category_name}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-nowrap">₹{Number(a.price) || 0}</td>
                <td className="px-4 py-3"><button onClick={() => toggle(a)}><StatusPill s={a.status} /></button></td>
                <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => editRow(a)} className="text-primary-700"><Pencil className="h-4 w-4" /></button><button onClick={() => del(a)} className="text-red-500"><Trash2 className="h-4 w-4" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      </div>
    </div>
  );
};


/* =============== SERVICE WIZARD (Advanced Builder) =============== */
const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const WIZ_STEPS = [
  { key: "basics", label: "Basics", icon: Info },
  { key: "category", label: "Category", icon: Layers },
  { key: "media", label: "Media", icon: ImageIcon },
  { key: "variants", label: "Variants & Pricing", icon: Tag },
  { key: "highlights", label: "Highlights & FAQs", icon: Sparkles },
  { key: "seo", label: "SEO", icon: Globe },
  { key: "publish", label: "Publish", icon: Check },
];

const blankSvc = {
  category_id: "", subcategory_id: "", name: "", slug: "", tags: [], short_description: "", description: "",
  image: "", gallery: [], price_type: "fixed", base_price: 0, discounted_price: 0, tax_pct: 0, tax_ids: [], tax_inclusive: false,
  provider_id: "", duration_min: 60, max_qty: 5, members_required: 1, required_skill: "",
  addons: [], tiers: [], highlights: [], faqs: [], rating: 4.8, review_count: 0,
  cancelable: true, at_store: false, at_doorstep: true, approval_status: "approved",
  is_featured: false, is_trending: false, show_on_home: true, status: "active", seo: {},
};

/* ---- Premium stepper ---- */
const WizardStepper = ({ step, setStep, done }) => (
  <div className="relative">
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {WIZ_STEPS.map((s, i) => {
        const I = s.icon; const active = i === step; const complete = done.includes(i);
        return (
          <div key={s.key} className="flex items-center shrink-0">
            <button onClick={() => setStep(i)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all
                ${active ? "bg-primary-700 text-white shadow-lg shadow-primary-700/20"
                  : complete ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300 hover:bg-slate-200"}`}>
              <span className={`h-6 w-6 rounded-lg flex items-center justify-center ${active ? "bg-white/20" : complete ? "bg-emerald-500 text-white" : "bg-white dark:bg-slate-800"}`}>
                {complete && !active ? <Check className="h-3.5 w-3.5" /> : <I className="h-3.5 w-3.5" />}
              </span>
              <span className="whitespace-nowrap hidden sm:inline">{s.label}</span>
            </button>
            {i < WIZ_STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-0.5" />}
          </div>
        );
      })}
    </div>
    <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-500"
        style={{ width: `${((step + 1) / WIZ_STEPS.length) * 100}%` }} />
    </div>
  </div>
);

const VLabel = ({ children }) => <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{children}</label>;

/* ---- Rich variant editor (Urban-Company style packs / variants) ---- */
const VariantEditor = ({ tiers, onChange }) => {
  const upd = (i, patch) => { const t = [...tiers]; t[i] = { ...t[i], ...patch }; onChange(t); };
  const add = () => onChange([...tiers, { label: "", qty: 1, price: 0, original_price: 0, badge: "", image: "", rating: 4.8, review_count: 0, description: "" }]);
  const dup = (i) => { const c = { ...tiers[i], label: `${tiers[i].label || "Variant"} copy` }; const t = [...tiers]; t.splice(i + 1, 0, c); onChange(t); };
  const rm = (i) => onChange(tiers.filter((_, x) => x !== i));
  return (
    <div className="space-y-4">
      {tiers.length === 0 && (
        <div className="text-center py-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
          <Tag className="h-8 w-8 mx-auto text-slate-300" />
          <p className="text-sm text-slate-500 mt-2">No variants yet. Add packs like <b>1 AC / 2 ACs</b> or <b>Full legs / Full body</b> — each with its own image, price &amp; rating.</p>
        </div>
      )}
      <div className="space-y-4">
        {tiers.map((t, i) => {
          const off = t.original_price > t.price && t.price > 0 ? Math.round((1 - t.price / t.original_price) * 100) : 0;
          const L = VLabel;
          return (
            <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-primary-700 bg-primary-50 dark:bg-primary-900/20 px-2.5 py-1 rounded-full">Variant {i + 1}</span>
                <div className="flex gap-2">
                  {off > 0 && <span className="text-xs text-emerald-600 font-bold self-center">{off}% off</span>}
                  <button type="button" onClick={() => dup(i)} title="Duplicate variant" className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 flex items-center justify-center hover:bg-slate-200"><Copy className="h-4 w-4" /></button>
                  <button type="button" onClick={() => rm(i)} title="Remove" className="h-8 w-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="shrink-0">
                  <L>Variant image</L>
                  {t.image
                    ? <div className="relative w-28"><img src={t.image} alt="" className="h-28 w-28 rounded-xl object-cover border border-slate-200" /><button type="button" onClick={() => upd(i, { image: "" })} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center"><X className="h-3.5 w-3.5" /></button></div>
                    : <div className="w-28"><ImageUpload folder="service" value="" onChange={(v) => v && upd(i, { image: v })} /></div>}
                </div>
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2 md:col-span-2"><L>Variant name *</L><Input placeholder="e.g. 2 ACs / Full body / 60 min" value={t.label} onChange={(e) => upd(i, { label: e.target.value })} /></div>
                  <div><L>Badge</L><Input placeholder="e.g. Bestseller" value={t.badge} onChange={(e) => upd(i, { badge: e.target.value })} /></div>
                  <div><L>Quantity</L><Input type="number" placeholder="e.g. 2" value={t.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} /></div>
                  <div><L>Selling price (₹) *</L><Input type="number" placeholder="e.g. 1098" value={t.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} /></div>
                  <div><L>Original price (₹)</L><Input type="number" placeholder="e.g. 1198" value={t.original_price} onChange={(e) => upd(i, { original_price: Number(e.target.value) })} /></div>
                  <div><L>Rating (0-5)</L><Input type="number" step="0.1" max="5" placeholder="e.g. 4.8" value={t.rating} onChange={(e) => upd(i, { rating: Number(e.target.value) })} /></div>
                  <div><L>Reviews count</L><Input type="number" placeholder="e.g. 2900000" value={t.review_count} onChange={(e) => upd(i, { review_count: Number(e.target.value) })} /></div>
                  <div className="col-span-2 md:col-span-4"><L>Short line</L><Input placeholder="e.g. Foam-jet deep clean · 2 pros · 60 min" value={t.description} onChange={(e) => upd(i, { description: e.target.value })} /></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" onClick={add} className="gap-1 mt-4"><Plus className="h-4 w-4" />Add Variant / Pack</Button>
    </div>
  );
};

/* ---- Highlights editor ---- */
const HighlightsEditor = ({ items, onChange }) => {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (t) { onChange([...items, t]); setV(""); } };
  return (
    <div>
      <div className="flex gap-2">
        <Input placeholder="e.g. Highly rated for better cooling & sanitisation" value={v}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" onClick={add} className="bg-slate-800 hover:bg-slate-900 shrink-0"><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-2 mt-3">
        {items.map((h, i) => (
          <div key={i} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-lg px-3 py-2">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{h}</span>
            <button type="button" onClick={() => onChange(items.filter((_, x) => x !== i))} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-slate-400">No highlights yet — these show under the &ldquo;✨ HIGHLIGHTS&rdquo; section on the service page.</p>}
      </div>
    </div>
  );
};

/* ---- Add-on picker: choose from the category-wise Add-on Library ---- */
const ServiceAddonPicker = ({ categoryId, selected, onChange }) => {
  const [lib, setLib] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!categoryId) { setLib([]); return; }
    setLoading(true);
    api.get(`/catalog/admin/addons?category_id=${categoryId}`)
      .then((r) => setLib(r.data || [])).catch(() => setLib([])).finally(() => setLoading(false));
  }, [categoryId]);
  const isSel = (a) => (selected || []).some((s) => (s.name || "").toLowerCase() === (a.name || "").toLowerCase());
  const toggle = (a) => {
    if (isSel(a)) onChange((selected || []).filter((s) => (s.name || "").toLowerCase() !== (a.name || "").toLowerCase()));
    else onChange([...(selected || []), { name: a.name, price: Number(a.price) || 0 }]);
  };
  if (!categoryId) return <p className="text-xs text-slate-400">Select a category first to pick its add-ons.</p>;
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">Pick reusable add-ons for this category. Selected add-ons appear under <b>&ldquo;Frequently Added&rdquo;</b> &amp; <b>&ldquo;Add-ons&rdquo;</b> when a customer books this service. Manage the library in <b>Add-on Services</b>.</p>
      {loading ? <p className="text-xs text-slate-400">Loading add-ons…</p> : lib.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">No add-ons in this category yet. Create them in the <b>Add-on Services</b> menu first.</p>
      ) : (
        <div className="space-y-2">
          {lib.map((a) => (
            <label key={a.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${isSel(a) ? "bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-800" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}>
              <input type="checkbox" checked={isSel(a)} onChange={() => toggle(a)} className="h-4 w-4 accent-primary-600" />
              <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{a.name}</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">+₹{Number(a.price) || 0}</span>
            </label>
          ))}
        </div>
      )}
      {(selected || []).length > 0 && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-3">{(selected || []).length} add-on(s) selected for this service.</p>
      )}
    </div>
  );
};


/* ---- FAQ editor ---- */
const FaqEditor = ({ items, onChange }) => {
  const upd = (i, patch) => { const t = [...items]; t[i] = { ...t[i], ...patch }; onChange(t); };
  return (
    <div className="space-y-3">
      {items.map((q, i) => (
        <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Question" value={q.question} onChange={(e) => upd(i, { question: e.target.value })} />
            <button type="button" onClick={() => onChange(items.filter((_, x) => x !== i))} className="text-red-500 shrink-0"><Trash2 className="h-4 w-4" /></button>
          </div>
          <Textarea placeholder="Answer" value={q.answer} onChange={(e) => upd(i, { answer: e.target.value })} />
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...items, { question: "", answer: "" }])} className="gap-1"><Plus className="h-4 w-4" />Add FAQ</Button>
    </div>
  );
};

/* ---- Google SERP live preview ---- */
const SerpPreview = ({ f, slug }) => {
  const seo = f.seo || {};
  const title = seo.title || f.name || "Service title";
  const desc = seo.description || f.short_description || f.description || "Your meta description preview appears here — keep it under 160 characters for best results.";
  const url = `azoapp.com › service › ${slug || "service-slug"}`;
  const showStars = Number(f.rating) > 0 && Number(f.review_count) > 0;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 font-sans">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-6 w-6 rounded-full bg-primary-700 flex items-center justify-center text-white text-[10px] font-bold">A</div>
        <div className="leading-tight"><p className="text-[13px] text-slate-800 dark:text-slate-200">AzoApp</p><p className="text-[11px] text-slate-500">{url}</p></div>
      </div>
      <p className="text-[18px] text-[#1a0dab] dark:text-blue-400 leading-snug hover:underline cursor-pointer truncate">{title}</p>
      {showStars && (
        <div className="flex items-center gap-1 text-[12px] text-slate-600 dark:text-slate-300 mt-0.5">
          <span className="text-amber-500">{"★".repeat(Math.round(f.rating))}{"☆".repeat(5 - Math.round(f.rating))}</span>
          <span className="font-medium">{Number(f.rating).toFixed(1)}</span>
          <span className="text-slate-400">· {Number(f.review_count).toLocaleString("en-IN")} reviews</span>
          {(f.discounted_price || f.base_price) > 0 && <span className="text-slate-400">· {fmt(f.discounted_price || f.base_price)}</span>}
        </div>
      )}
      <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{desc}</p>
    </div>
  );
};

/* ---- Live customer-card preview ---- */
const LivePreview = ({ f }) => {
  const price = f.discounted_price || f.base_price;
  return (
    <div className="sticky top-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />Live preview</p>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-lg">
        <div className="h-36 bg-slate-100 dark:bg-slate-700 relative">
          {f.image ? <img src={f.image} alt="" className="h-full w-full object-cover" /> : <div className="h-full flex items-center justify-center text-slate-300"><ImageIcon className="h-8 w-8" /></div>}
          {f.tiers?.find((t) => t.badge) && <span className="absolute top-2 left-2 bg-primary-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">{f.tiers.find((t) => t.badge).badge}</span>}
        </div>
        <div className="p-3">
          <p className="font-heading font-bold text-slate-900 dark:text-slate-100 truncate">{f.name || "Service name"}</p>
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{f.rating || 0}
            {f.review_count > 0 && <span>({Number(f.review_count).toLocaleString("en-IN")})</span>}
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="font-heading font-extrabold text-slate-900 dark:text-white">{fmt(price)}</span>
            {f.discounted_price > 0 && f.discounted_price < f.base_price && <span className="text-xs text-slate-400 line-through">{fmt(f.base_price)}</span>}
          </div>
          <button className="mt-2 w-full border border-primary-600 text-primary-700 font-semibold text-sm rounded-lg py-1.5">Add</button>
        </div>
      </div>
      {f.highlights?.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-800">
          <p className="text-xs font-bold flex items-center gap-1 text-slate-700 dark:text-slate-200"><Sparkles className="h-3.5 w-3.5 text-amber-500" />HIGHLIGHTS</p>
          <ul className="mt-1.5 space-y-1">{f.highlights.slice(0, 3).map((h, i) => <li key={i} className="text-[11px] text-slate-500 flex gap-1"><Check className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />{h}</li>)}</ul>
        </div>
      )}
    </div>
  );
};

export const ServiceWizard = () => {
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState([]);
  const [subs, setSubs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [list, setList] = useState([]);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState(blankSvc);
  const [done, setDone] = useState([]);
  const [taxes, setTaxes] = useState([]);

  const loadList = useCallback(() => api.get("/catalog/admin/services").then((r) => setList(r.data)), []);
  useEffect(() => {
    api.get("/catalog/admin/categories").then((r) => setCats(r.data));
    api.get("/admin/users?role=partner").then((r) => setProviders(r.data)).catch(() => {});
    api.get("/admin/collection/taxes").then((r) => setTaxes((r.data || []).filter((t) => (t.status || "active") === "active"))).catch(() => {});
    loadList();
  }, [loadList]);
  useEffect(() => { if (f.category_id) api.get(`/catalog/admin/subcategories?category_id=${f.category_id}`).then((r) => setSubs(r.data)); else setSubs([]); }, [f.category_id]);

  const slug = f.slug || slugify(f.name);
  const taxPct = (ids) => taxes.filter((t) => (ids || []).includes(t.id)).reduce((s, t) => s + Number(t.percentage || 0), 0);

  // Auto-fill SEO defaults from service details when entering the SEO step (only empty fields; admin can modify)
  useEffect(() => {
    if (step !== 5) return;
    setF((prev) => {
      const s = { ...(prev.seo || {}) };
      let changed = false;
      const plain = (prev.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!s.title && prev.name) { s.title = prev.name; changed = true; }
      if (!s.description) { const d = prev.short_description || plain; if (d) { s.description = d.slice(0, 160); changed = true; } }
      if (!s.keywords) { const kw = [prev.name, ...(prev.tags || []), prev.category_name].filter(Boolean).join(", "); if (kw) { s.keywords = kw.toLowerCase(); changed = true; } }
      if (!s.og_title && s.title) { s.og_title = s.title; changed = true; }
      if (!s.og_description && s.description) { s.og_description = s.description; changed = true; }
      if (!s.og_image && !s.image && prev.image) { s.og_image = prev.image; s.image = prev.image; changed = true; }
      return changed ? { ...prev, seo: s } : prev;
    });
  }, [step]);

  const openNew = () => { setF(blankSvc); setEditId(null); setStep(0); setDone([]); setShowForm(true); };
  const openEdit = async (id) => {
    const { data } = await api.get(`/catalog/admin/services/${id}`);
    setF({ ...blankSvc, ...data, seo: data.seo || {}, faqs: data.faqs || [], gallery: data.gallery || [], tags: data.tags || [], tiers: data.tiers || [], highlights: data.highlights || [], tax_ids: data.tax_ids || [] });
    setEditId(id); setStep(0); setDone([0, 1, 2, 3, 4, 5, 6]); setShowForm(true);
  };

  // Deep-link support: /admin?tab=services&editService=<id> (used by "Switch to
  // New Service" from a Custom Job Request) auto-opens the prefilled editor.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eid = params.get("editService");
    if (!eid) return;
    openEdit(eid).catch(() => {});
    params.delete("editService");
    const q = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => { if (!done.includes(step)) setDone([...done, step]); setStep(Math.min(step + 1, WIZ_STEPS.length - 1)); };

  const submit = async () => {
    if (!f.name) { setStep(0); return toast.error("Service title is required"); }
    if (!f.category_id) { setStep(1); return toast.error("Category is required"); }
    if (Number(f.discounted_price) > Number(f.base_price) && Number(f.discounted_price) > 0) { setStep(3); return toast.error("Discounted price cannot exceed original price"); }
    // Mandatory SEO gate
    const seo = f.seo || {};
    const missing = [];
    if (!seo.title) missing.push("SEO title");
    if (!seo.description) missing.push("Meta description");
    if (!seo.keywords) missing.push("Meta keywords");
    if (!(f.image || seo.og_image || seo.image)) missing.push("Main / OG image");
    if (missing.length) { setStep(5); return toast.error(`SEO required: ${missing.join(", ")}`); }
    const payload = {
      ...f, slug, base_price: Number(f.base_price), discounted_price: Number(f.discounted_price),
      tax_pct: Number(f.tax_pct), duration_min: Number(f.duration_min), max_qty: Number(f.max_qty),
      members_required: Number(f.members_required), rating: Number(f.rating), review_count: Number(f.review_count),
    };
    try {
      if (editId) { await api.put(`/catalog/services/${editId}`, payload); toast.success("Service updated"); }
      else { await api.post("/catalog/services", payload); toast.success("Service added successfully!"); }
      setShowForm(false); setF(blankSvc); setEditId(null); loadList();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to save"); }
  };
  const toggle = async (s, field) => { await api.put(`/catalog/services/${s.id}`, { [field]: field === "status" ? (s.status === "active" ? "inactive" : "active") : (field === "approval_status" ? (s.approval_status === "approved" ? "disapproved" : "approved") : !s[field]) }); loadList(); };
  const del = async (s) => { if (!window.confirm("Are you sure? This will remove the service permanently.")) return; try { await api.delete(`/catalog/services/${s.id}`); toast.success("Deleted"); loadList(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  const duplicate = async (s) => { try { await api.post(`/catalog/services/${s.id}/duplicate`); toast.success(`Duplicated "${s.name}" as draft — edit & publish`); loadList(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed to duplicate"); } };

  if (!showForm) {
    const columns = [
      { key: "name", label: "Service", sortable: true, render: (s) => (
        <div className="flex items-center gap-3">
          {s.image ? <img src={s.image} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" /> : <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0"><ImageIcon className="h-4 w-4 text-slate-300" /></div>}
          <div className="min-w-0"><p className="font-medium text-slate-800 dark:text-slate-100 truncate">{s.name}</p><p className="text-[11px] text-slate-400 truncate">/{s.slug || "—"}</p></div>
        </div>
      ) },
      { key: "base_price", label: "Price", sortable: true, render: (s) => (
        <span className="whitespace-nowrap">{fmt(s.discounted_price || s.base_price)}{s.discounted_price > 0 && s.discounted_price < s.base_price && <span className="text-slate-400 line-through ml-1 text-xs">{fmt(s.base_price)}</span>}</span>
      ), exportValue: (s) => s.discounted_price || s.base_price },
      { key: "review_count", label: "Rating", sortable: true, render: (s) => s.review_count > 0 ? <span className="flex items-center gap-1 text-xs text-slate-500"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{s.rating} <span className="text-slate-400">({Number(s.review_count).toLocaleString("en-IN")})</span></span> : <span className="text-slate-300">—</span> },
      { key: "is_featured", label: "Featured", render: (s) => <button onClick={() => toggle(s, "is_featured")} title="Toggle featured">{s.is_featured ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : <Star className="h-4 w-4 text-slate-300" />}</button> },
      { key: "status", label: "Status", render: (s) => <button onClick={() => toggle(s, "status")}><StatusPill s={s.status} /></button> },
      { key: "_actions", label: "", render: (s) => (
        <div className="flex gap-1.5">
          <button onClick={() => duplicate(s)} title="Duplicate" data-testid={`dup-svc-${s.id}`} className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center"><Copy className="h-4 w-4" /></button>
          <button onClick={() => openEdit(s.id)} title="Edit" data-testid={`edit-svc-${s.id}`} className="h-8 w-8 rounded-lg text-primary-700 hover:bg-primary-50 flex items-center justify-center"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => del(s)} title="Delete" className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center"><Trash2 className="h-4 w-4" /></button>
        </div>
      ) },
    ];
    const filters = [
      { key: "category_id", label: "Category", options: cats.map((c) => ({ label: c.name, value: c.id })), match: (r, v) => r.category_id === v },
      { key: "status", label: "Status", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }], match: (r, v) => r.status === v },
      { key: "approval_status", label: "Approval", options: [{ label: "Approved", value: "approved" }, { label: "Pending", value: "disapproved" }], match: (r, v) => (v === "approved" ? r.approval_status !== "disapproved" : r.approval_status === "disapproved") },
    ];
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-heading font-extrabold text-xl text-slate-900 dark:text-white">Services</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{list.length} total · search, filter &amp; manage</p>
          </div>
          <Button onClick={openNew} data-testid="add-service-btn" className="bg-primary-700 hover:bg-primary-800 gap-2"><Plus className="h-4 w-4" />Add New Service</Button>
        </div>
        <DataTable title="All Services" rows={list} columns={columns} filters={filters}
          searchKeys={["name", "category_name", "slug"]} pageSize={10} exportName="services"
          searchPlaceholder="Search services by name, category or slug…" emptyText="No services yet — click Add New Service" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-slate-900 dark:text-white">{editId ? "Edit Service" : "Add Advanced Service"}</h2>
          <p className="text-xs text-slate-400">SEO-optimised · rich variants · Google rich-snippet ready</p>
        </div>
        <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
      </div>

      <WizardStepper step={step} setStep={setStep} done={done} />

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-5">
          {step === 0 && (
            <Section title="Basic Information">
              <Field label="Service Title *"><Input placeholder="e.g. Foam-jet AC service" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="URL Slug"><div className="flex items-center gap-2"><span className="text-xs text-slate-400">/service/</span><Input value={f.slug} placeholder={slugify(f.name) || "auto-generated"} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></div></Field>
              <Field label="Tags"><TagInput value={f.tags} onChange={(v) => setF({ ...f, tags: v })} /></Field>
              <Field label="Short Description"><Input placeholder="One-line summary shown on cards" value={f.short_description} onChange={(e) => setF({ ...f, short_description: e.target.value })} /></Field>
              <Field label="Full Description"><RichText value={f.description} onChange={(v) => setF({ ...f, description: v })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rating (0-5)"><Input type="number" step="0.1" max="5" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} /></Field>
                <Field label="Reviews count"><Input type="number" value={f.review_count} onChange={(e) => setF({ ...f, review_count: e.target.value })} /></Field>
              </div>
            </Section>
          )}
          {step === 1 && (
            <Section title="Category & Operations">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Category *">
                  <Select value={f.category_id} onValueChange={(v) => setF({ ...f, category_id: v, subcategory_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Sub-category (optional)">
                  <Select value={f.subcategory_id || "none"} onValueChange={(v) => setF({ ...f, subcategory_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">None</SelectItem>{subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Provider (optional)">
                  <Select value={f.provider_id || "none"} onValueChange={(v) => setF({ ...f, provider_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Auto-match" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Auto-match (any eligible)</SelectItem>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Duration (minutes)"><Input type="number" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></Field>
                <Field label="Max Quantity"><Input type="number" value={f.max_qty} onChange={(e) => setF({ ...f, max_qty: e.target.value })} /></Field>
                <Field label="Members Required"><Input type="number" value={f.members_required} onChange={(e) => setF({ ...f, members_required: e.target.value })} /></Field>
              </div>
            </Section>
          )}
          {step === 2 && (
            <Section title="Media">
              <ImageUpload label="Main Image (424 x 551 recommended)" folder="service" value={f.image} onChange={(v) => setF({ ...f, image: v })} />
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Gallery (960 x 540)</label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {(f.gallery || []).map((g, i) => (
                    <div key={i} className="relative"><img src={g} alt="" className="h-20 w-32 object-cover rounded-lg border border-slate-200 dark:border-slate-700" /><button onClick={() => setF({ ...f, gallery: f.gallery.filter((_, x) => x !== i) })} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center"><X className="h-3.5 w-3.5" /></button></div>
                  ))}
                  <ImageUpload folder="service" value="" onChange={(v) => v && setF({ ...f, gallery: [...(f.gallery || []), v] })} />
                </div>
              </div>
            </Section>
          )}
          {step === 3 && (
            <Section title="Variants & Pricing">
              <Field label="Price Type">
                <Select value={f.price_type} onValueChange={(v) => setF({ ...f, price_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["fixed", "Fixed"], ["per_hour", "Hourly"], ["per_person", "Per Person"], ["per_sqft", "Per Sq Ft"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Original Price (₹)"><Input type="number" value={f.base_price} onChange={(e) => setF({ ...f, base_price: e.target.value })} /></Field>
                <Field label="Discounted Price (₹)"><Input type="number" value={f.discounted_price} onChange={(e) => setF({ ...f, discounted_price: e.target.value })} /></Field>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Taxes (from Integration Center)</label>
                {taxes.length === 0
                  ? <p className="text-xs text-slate-400 mt-1">No taxes created yet. Add them in <b>Integration Center → Taxes</b>.</p>
                  : <div className="flex flex-wrap gap-2 mt-2">
                      {taxes.map((t) => {
                        const sel = (f.tax_ids || []).includes(t.id);
                        return (
                          <button type="button" key={t.id} onClick={() => {
                            const ids = sel ? (f.tax_ids || []).filter((x) => x !== t.id) : [...(f.tax_ids || []), t.id];
                            setF({ ...f, tax_ids: ids, tax_pct: taxPct(ids) });
                          }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${sel ? "border-primary-700 bg-primary-50 text-primary-700 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-primary-300"}`}>
                            {sel && <Check className="h-3 w-3 inline mr-1" />}{t.name} · {t.percentage}%
                          </button>
                        );
                      })}
                    </div>}
                <p className="text-xs text-slate-500 mt-2">Total tax applied: <b>{Number(f.tax_pct || 0)}%</b> {(f.tax_ids || []).length > 1 && <span className="text-slate-400">({(f.tax_ids || []).length} taxes)</span>}</p>
              </div>
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Tax Inclusive</span><Switch checked={f.tax_inclusive} onCheckedChange={(v) => setF({ ...f, tax_inclusive: v })} /></div>
              <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                <p className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1"><Tag className="h-4 w-4 text-primary-600" />Variants / Packs</p>
                <p className="text-xs text-slate-400 mb-3">Urban-Company style — e.g. <b>1 AC / 2 ACs</b> or <b>Full legs / Full body</b>. Each variant can have its own image, price, rating &amp; &ldquo;Bestseller&rdquo; badge. Duplicate a variant to reuse it with minor changes.</p>
                <VariantEditor tiers={f.tiers || []} onChange={(t) => setF({ ...f, tiers: t })} />
              </div>
            </Section>
          )}
          {step === 4 && (
            <div className="space-y-5">
              <Section title="Add-ons (Frequently Added)"><ServiceAddonPicker categoryId={f.category_id} selected={f.addons || []} onChange={(a) => setF({ ...f, addons: a })} /></Section>
              <Section title="Highlights"><HighlightsEditor items={f.highlights || []} onChange={(h) => setF({ ...f, highlights: h })} /></Section>
              <Section title="Frequently Asked Questions"><FaqEditor items={f.faqs || []} onChange={(q) => setF({ ...f, faqs: q })} /></Section>
            </div>
          )}
          {step === 5 && (
            <Section title="SEO Configuration (required for Google ranking)">
              <div className="rounded-lg bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/20 p-3 flex gap-2 text-xs text-primary-800 dark:text-primary-200">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Fields marked * are mandatory. A rich-snippet schema (with your ⭐ rating) is generated automatically so this service can appear with stars in Google search results.</span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="SEO Title *"><Input maxLength={255} value={f.seo.title || ""} onChange={(e) => setF({ ...f, seo: { ...f.seo, title: e.target.value } })} /></Field>
                <Field label="Meta Keywords *"><KeywordsInput placeholder="ac service, ac repair, split ac" value={f.seo.keywords || ""} onChange={(v) => setF({ ...f, seo: { ...f.seo, keywords: v } })} /></Field>
                <div className="md:col-span-2"><Field label="Meta Description * (max 160 chars ideal)"><Textarea maxLength={500} value={f.seo.description || ""} onChange={(e) => setF({ ...f, seo: { ...f.seo, description: e.target.value } })} /></Field></div>
                <Field label="Canonical URL"><Input value={f.seo.canonical || ""} onChange={(e) => setF({ ...f, seo: { ...f.seo, canonical: e.target.value } })} /></Field>
                <Field label="OG Title"><Input value={f.seo.og_title || ""} onChange={(e) => setF({ ...f, seo: { ...f.seo, og_title: e.target.value } })} /></Field>
                <div className="md:col-span-2"><Field label="OG Description"><Textarea value={f.seo.og_description || ""} onChange={(e) => setF({ ...f, seo: { ...f.seo, og_description: e.target.value } })} /></Field></div>
                <div className="md:col-span-2"><ImageUpload label="SEO / OG Image *" folder="seo" value={f.seo.og_image || f.seo.image || f.image || ""} onChange={(v) => setF({ ...f, seo: { ...f.seo, og_image: v, image: v } })} /></div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><SearchIcon className="h-3.5 w-3.5" />Google preview</p>
                <SerpPreview f={f} slug={slug} />
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <Check className="h-4 w-4" />Auto rich-snippet schema {Number(f.rating) > 0 && Number(f.review_count) > 0 ? "with ⭐ AggregateRating" : "(add reviews count for star ratings)"} enabled.
              </div>
            </Section>
          )}
          {step === 6 && (
            <Section title="Publish Controls">
              {[["cancelable", "Cancelable"], ["at_doorstep", "At Doorstep"], ["at_store", "At Store"], ["is_featured", "Featured"], ["is_trending", "Trending"], ["show_on_home", "Show on Homepage"]].map(([k, l]) => (
                <div key={k} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">{l}</span><Switch checked={!!f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} /></div>
              ))}
              <div className="flex items-center justify-between py-2"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Approval</span>
                <Select value={f.approval_status} onValueChange={(v) => setF({ ...f, approval_status: v })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">Approved</SelectItem><SelectItem value="disapproved">Disapproved</SelectItem></SelectContent></Select>
              </div>
              <div className="flex items-center justify-between py-2"><span className="text-sm font-medium text-slate-600 dark:text-slate-300">Status</span>
                <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive (Draft)</SelectItem></SelectContent></Select>
              </div>
            </Section>
          )}

          <div className="flex gap-2 pt-2">
            {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
            {step < WIZ_STEPS.length - 1
              ? <Button data-testid="wiz-next" className="bg-primary-700 hover:bg-primary-800 ml-auto" onClick={next}>Next</Button>
              : <Button data-testid="wiz-publish" className="bg-primary-700 hover:bg-primary-800 ml-auto" onClick={submit}>{editId ? "Update Service" : "Publish Service"}</Button>}
          </div>
        </div>

        <div className="lg:col-span-1"><LivePreview f={f} /></div>
      </div>
    </div>
  );
};

/* =============== HOMEPAGE BUILDER =============== */
const SECTION_TYPES = ["hero_banner", "popular_categories", "featured_categories", "featured_services", "trending_services", "most_requested", "recommended_services", "promo_banner", "coupons", "faq", "blog", "why_choose_us", "how_it_works"];
export const HomepageBuilder = () => {
  const [rows, setRows] = useState([]);
  const [add, setAdd] = useState({ type: "featured_services", title: "", subtitle: "", limit: 8 });
  const load = () => api.get("/admin/homepage-sections").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => { await api.post("/admin/homepage-sections", { type: add.type, title: add.title, subtitle: add.subtitle, enabled: true, order: rows.length, config: { limit: Number(add.limit) } }); toast.success("Section added"); setAdd({ ...add, title: "" }); load(); };
  const patch = async (id, data) => { await api.put(`/admin/homepage-sections/${id}`, data); load(); };
  const del = async (id) => { await api.delete(`/admin/homepage-sections/${id}`); load(); };
  const move = async (i, dir) => {
    const j = i + dir; if (j < 0 || j >= rows.length) return;
    const a = rows[i], b = rows[j];
    await Promise.all([api.put(`/admin/homepage-sections/${a.id}`, { order: b.order }), api.put(`/admin/homepage-sections/${b.id}`, { order: a.order })]);
    load();
  };
  return (
    <div className="space-y-5">
    <HomeStatsControl />
    <div className="grid xl:grid-cols-3 gap-5">
      <Section title="Add Section">
        <Field label="Type"><Select value={add.type} onValueChange={(v) => setAdd({ ...add, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SECTION_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Title"><Input value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></Field>
        <Field label="Subtitle / Eyebrow"><Input value={add.subtitle} onChange={(e) => setAdd({ ...add, subtitle: e.target.value })} /></Field>
        <Field label="Item Limit"><Input type="number" value={add.limit} onChange={(e) => setAdd({ ...add, limit: e.target.value })} /></Field>
        <Button onClick={create} className="w-full bg-primary-700 hover:bg-primary-800">Add Section</Button>
      </Section>
      <div className="xl:col-span-2 space-y-3">
        {rows.map((s, i) => (
          <div key={s.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="flex flex-col"><button onClick={() => move(i, -1)} className="text-slate-400 hover:text-primary-700"><ChevronUp className="h-4 w-4" /></button><button onClick={() => move(i, 1)} className="text-slate-400 hover:text-primary-700"><ChevronDown className="h-4 w-4" /></button></div>
              <div className="flex-1">
                <Badge className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-0 capitalize mb-1">{s.type.replace(/_/g, " ")}</Badge>
                <Input className="mb-1" placeholder="Title" defaultValue={s.title} onBlur={(e) => patch(s.id, { title: e.target.value })} />
                <div className="flex gap-2">
                  <Input placeholder="Subtitle" defaultValue={s.subtitle} onBlur={(e) => patch(s.id, { subtitle: e.target.value })} />
                  <Input type="number" className="w-24" placeholder="Limit" defaultValue={s.config?.limit || 8} onBlur={(e) => patch(s.id, { config: { ...s.config, limit: Number(e.target.value) } })} />
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Switch checked={!!s.enabled} onCheckedChange={(v) => patch(s.id, { enabled: v })} />
                <button onClick={() => del(s.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
};

/* =============== BANNER MANAGER =============== */
export const BannerManager = () => <BannersManagerPro />;

/* =============== MEDIA MANAGER =============== */
export const MediaManager = () => {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/media").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const del = async (id) => { await api.delete(`/media/${id}`); load(); };
  return (
    <div className="space-y-4">
      <Section title="Upload Media"><ImageUpload folder="media" value="" onChange={() => load()} hint="JPG / PNG / GIF / WebP. Auto-compressed + thumbnail. Stored on S3 when configured." /></Section>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {rows.map((m) => (
          <div key={m.id} className="relative group bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <img src={m.thumb_url || m.url} alt="" className="h-28 w-full object-cover" />
            <button onClick={() => del(m.id)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        {rows.length === 0 && <p className="col-span-full text-center text-slate-400 py-10">No media yet</p>}
      </div>
    </div>
  );
};

/* =============== BRANDING & THEME =============== */
export const BrandingSettings = ({ onSaved }) => {
  const [s, setS] = useState(null);
  const { refresh } = useSiteConfig();
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const b = s.branding || {};
  const th = s.theme || {};
  const setB = (k, v) => setS((p) => ({ ...p, branding: { ...p.branding, [k]: v } }));
  const setSoc = (k, v) => setS((p) => ({ ...p, branding: { ...p.branding, social: { ...(p.branding?.social || {}), [k]: v } } }));
  const setTh = (k, v) => { const theme = { ...s.theme, [k]: v }; setS((p) => ({ ...p, theme })); applySiteTheme(theme); };
  const save = async () => { await api.put("/admin/settings", { branding: s.branding, theme: s.theme }); applySiteTheme(s.theme); refresh?.(); toast.success("Branding saved — logo, favicon & colours applied instantly"); onSaved?.(s); };
  return (
    <div className="grid lg:grid-cols-2 gap-5 max-w-5xl">
      <Section title="Brand">
        <Field label="Site Name"><Input value={b.site_name || ""} onChange={(e) => setB("site_name", e.target.value)} /></Field>
        <Field label="Tagline"><Input value={b.tagline || ""} onChange={(e) => setB("tagline", e.target.value)} /></Field>
        <ImageUpload label="Logo (Light mode)" folder="brand" value={b.logo_light} onChange={(v) => setB("logo_light", v)} />
        <ImageUpload label="Logo (Dark mode)" folder="brand" value={b.logo_dark} onChange={(v) => setB("logo_dark", v)} />
        <ImageUpload label="Email & Invoice Logo (PNG / JPG)" folder="brand" value={b.email_logo} onChange={(v) => setB("email_logo", v)} />
        <p className="text-[11px] text-slate-400 -mt-2">Use a PNG or JPG here. Email apps like Gmail block SVG logos — this raster logo is what shows on emails &amp; invoices. Leave empty to fall back to the light-mode logo.</p>
        <ImageUpload label="Favicon" folder="brand" value={b.favicon} onChange={(v) => setB("favicon", v)} />
        <Field label="Footer Text"><Textarea value={b.footer_text || ""} onChange={(e) => setB("footer_text", e.target.value)} /></Field>
      </Section>
      <div className="space-y-5">
        <Section title="Theme">
          <div className="grid grid-cols-3 gap-3">
            {[["primary", "Primary"], ["secondary", "Secondary"], ["accent", "Accent"]].map(([k, l]) => (
              <Field key={k} label={l}><input type="color" value={th[k] || (k === "accent" ? "#F59E0B" : "#6D28D9")} onChange={(e) => setTh(k, e.target.value)} className="h-10 w-full rounded border border-slate-200 dark:border-slate-700" /></Field>
            ))}
          </div>
          <Field label="Default Mode"><Select value={th.default_mode || "light"} onValueChange={(v) => setTh("default_mode", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="system">System</SelectItem></SelectContent></Select></Field>
        </Section>
        <Section title="Contact & Social">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input value={b.phone || ""} onChange={(e) => setB("phone", e.target.value)} /></Field>
            <Field label="Email"><Input value={b.email || ""} onChange={(e) => setB("email", e.target.value)} /></Field>
          </div>
          <Field label="Address"><Input value={b.address || ""} onChange={(e) => setB("address", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            {["facebook", "instagram", "twitter", "youtube", "linkedin"].map((k) => (
              <Field key={k} label={k}><Input value={(b.social || {})[k] || ""} onChange={(e) => setSoc(k, e.target.value)} /></Field>
            ))}
          </div>
        </Section>
      </div>
      <Button onClick={save} className="bg-primary-700 hover:bg-primary-800 w-fit">Save Branding & Theme</Button>
    </div>
  );
};

/* =============== ABOUT / CONTACT / PAGES =============== */
export const PageEditor = ({ pageKey, title }) => {
  const [doc, setDoc] = useState(null);
  useEffect(() => { api.get(`/content/${pageKey}`).then((r) => setDoc(r.data || {})); }, [pageKey]);
  if (!doc) return null;
  const set = (k, v) => setDoc({ ...doc, [k]: v });
  const save = async () => { await api.put(`/admin/pages/${pageKey}`, doc); toast.success("Saved — live on frontend"); };
  return (
    <div className="max-w-3xl space-y-4">
      <Section title={title}>
        <Field label="Heading"><Input value={doc.title || ""} onChange={(e) => set("title", e.target.value)} /></Field>
        {pageKey === "contact" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input value={doc.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Email"><Input value={doc.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Address"><Input value={doc.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="Business Hours"><Input value={doc.hours || ""} onChange={(e) => set("hours", e.target.value)} /></Field>
          </div>
        )}
        <Field label="Body"><RichText value={doc.body || ""} onChange={(v) => set("body", v)} /></Field>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 bg-slate-50/60 dark:bg-slate-800/40">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">SEO (Google)</p>
          <Field label="Meta title"><Input value={doc.seo_title || ""} maxLength={70} placeholder={doc.title || title} onChange={(e) => set("seo_title", e.target.value)} /></Field>
          <Field label="Meta description">
            <textarea value={doc.seo_description || ""} maxLength={180} rows={2} placeholder="One-line summary shown in Google results…"
              onChange={(e) => set("seo_description", e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" />
            <p className="text-[11px] text-slate-400 mt-1">{(doc.seo_description || "").length}/180 characters</p>
          </Field>
        </div>
        <Button onClick={save} className="bg-primary-700 hover:bg-primary-800">Save</Button>
      </Section>
    </div>
  );
};


/* =========================================================================
   Job Requests console — live customer work-requests + manual assign
   ========================================================================= */
const JOB_SC = {
  searching: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  arrived_shop: "bg-blue-100 text-blue-700", arrived_customer: "bg-blue-100 text-blue-700",
  started: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  paid: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-700",
};
export const JobStatusBadge = ({ s }) => (
  <Badge className={`border-0 capitalize ${JOB_SC[s] || "bg-slate-100 text-slate-600"}`}>{(s || "").replace(/_/g, " ")}</Badge>
);

const timeAgo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso); const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return d.toLocaleDateString();
};

function AssignModal({ booking, onClose, onDone }) {
  const [partners, setPartners] = useState(null);
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.get(`/admin/bookings/${booking.id}/eligible-partners`)
      .then((r) => setPartners(r.data.partners || []))
      .catch(() => setPartners([]));
  }, [booking.id]);
  const assign = async () => {
    if (!sel) return toast.error("Select a partner first");
    setBusy(true);
    try {
      await api.post(`/admin/bookings/${booking.id}/assign`, { partner_id: sel });
      toast.success("Job assigned — partner notified via app, SMS & email");
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Assign failed"); }
    finally { setBusy(false); }
  };
  const ql = q.trim().toLowerCase();
  const shown = (partners || []).filter((p) =>
    !ql || [p.name, p.phone, p.partner_code].some((v) => String(v || "").toLowerCase().includes(ql)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary-700" /> Assign partner · {booking.code}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-1">Eligible & available providers for <b>{booking.category_name || booking.service_name}</b>. Online providers are listed first.</p>
        {/* Search box — quickly find a professional by name */}
        <div className="relative mt-2">
          <SearchIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="assign-partner-search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9"
            placeholder="Search professional by name or phone…" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto space-y-2 mt-2">
          {partners === null && <div className="py-10 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading providers…</div>}
          {partners && partners.length === 0 && <div className="py-10 text-center text-slate-400">No eligible provider found for this category.</div>}
          {partners && partners.length > 0 && shown.length === 0 && <div className="py-10 text-center text-slate-400">No professional matches “{q}”.</div>}
          {shown.map((p) => (
            <label key={p.id} data-testid={`assign-partner-${p.id}`}
              className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${sel === p.id ? "border-primary-500 bg-primary-50/60 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700 hover:border-primary-300"}`}>
              <input type="radio" name="assignp" className="accent-primary-700" checked={sel === p.id} onChange={() => setSel(p.id)} />
              <div className="h-9 w-9 rounded-lg bg-primary-700 text-white grid place-items-center text-xs font-bold shrink-0">
                {(p.name || "P").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{p.name}</span>
                  <span className={`h-2 w-2 rounded-full ${p.partner_status === "online" ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <span className="text-[11px] text-slate-400 capitalize">{p.partner_status}</span>
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                  <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{(p.rating ?? 5).toFixed?.(1) ?? p.rating}</span>
                  <span>{p.jobs_completed || 0} jobs</span>
                  {p.distance_km != null && <span>{p.distance_km} km</span>}
                  {p.is_current && <span className="text-emerald-600 font-semibold">current</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-primary-700 hover:bg-primary-800" onClick={assign} disabled={busy || !sel} data-testid="assign-confirm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign & Notify"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JobDetailModal({ booking, onClose, onAssign }) {
  const b = booking;
  const addr = b.address || {};
  const price = b.pricing || {};
  const rows = [
    ["Base", price.base], ["Add-ons", price.addons_total], ["Surge", price.surge],
    ["Discount", price.discount != null ? -price.discount : null], ["Tax", price.tax], ["Visitation", price.visitation],
  ].filter(([, v]) => v != null && v !== 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{b.service_name}</span>{b.tier_label && <Badge className="bg-slate-100 text-slate-600 border-0">{b.tier_label}</Badge>}
            <JobStatusBadge s={b.status} /><span className="font-mono text-xs text-slate-400">{b.code}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Customer</p>
            <p className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1"><UserIcon className="h-4 w-4" />{b.customer_name || "—"}</p>
            {b.customer_phone && <p className="text-slate-500 flex items-center gap-1 mt-0.5"><Phone className="h-4 w-4" />{b.customer_phone}</p>}
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Provider</p>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{b.partner_name || <span className="text-amber-600">Not assigned yet</span>}</p>
            <p className="text-slate-500 mt-0.5">{(b.eligible_partner_ids || []).length} eligible provider(s)</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Address & schedule</p>
            <p className="text-slate-700 dark:text-slate-200 flex items-start gap-1"><MapPin className="h-4 w-4 mt-0.5 shrink-0" />{[addr.line, addr.city, addr.pincode].filter(Boolean).join(", ") || "—"}</p>
            <p className="text-slate-500 flex items-center gap-1 mt-1"><Calendar className="h-4 w-4" />{b.schedule_type === "scheduled" ? (b.scheduled_at || "").replace("T", " ") : (b.schedule_type || "now")}</p>
            {b.notes && <p className="text-slate-500 mt-1">Note: {b.notes}</p>}
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Price</p>
            {rows.map(([k, v]) => <div key={k} className="flex justify-between text-slate-600 dark:text-slate-300"><span>{k}</span><span>{fmt(v)}</span></div>)}
            <div className="flex justify-between font-bold text-slate-900 dark:text-white border-t border-slate-100 dark:border-slate-700 mt-1 pt-1"><span>Total</span><span>{fmt(price.total)}</span></div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Timeline</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(b.timeline || []).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                  <span className="capitalize text-slate-700 dark:text-slate-200">{(t.status || "").replace(/_/g, " ")}</span>
                  {t.by === "admin" && <span className="text-[10px] text-slate-400">(admin)</span>}
                  <span className="text-slate-400 ml-auto">{timeAgo(t.at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {["searching", "assigned"].includes(b.status) &&
            <Button className="bg-primary-700 hover:bg-primary-800" onClick={() => onAssign(b)} data-testid="detail-assign">
              {b.partner_name ? "Reassign" : "Assign partner"}
            </Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const JobRequestsConsole = () => {
  const [tab, setTab] = useState("awaiting");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [page, setPage] = useState(1);
  const PER = 8;
  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/job-requests?status=${tab}`)
      .then((r) => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, [tab]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, q, cat]);
  const openDetail = (id) => api.get(`/admin/job-requests/${id}`).then((r) => setDetail(r.data)).catch(() => toast.error("Failed to load request"));
  const TABS = [["awaiting", "Awaiting Partner"], ["assigned", "Assigned / In-progress"], ["completed", "Completed"], ["all", "All"]];

  // category options derived from the loaded rows (id → name)
  const catMap = {};
  rows.forEach((r) => { if (r.category_id) catMap[r.category_id] = r.category_name || r.category_id; });
  const catOptions = Object.entries(catMap).sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  const ql = q.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (cat !== "all" && r.category_id !== cat) return false;
    if (!ql) return true;
    return [r.code, r.service_name, r.customer_name, r.customer_phone, r.city, r.partner_name, r.category_name]
      .some((v) => String(v || "").toLowerCase().includes(ql));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER));
  const cur = Math.min(page, pageCount);
  const pageRows = filtered.slice((cur - 1) * PER, cur * PER);

  return (
    <div data-testid="job-requests-console">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex-wrap">
          {TABS.map(([k, l]) => (
            <button key={k} data-testid={`jr-tab-${k}`} onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${tab === k ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>{l}</button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={load} data-testid="jr-refresh"><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      {/* toolbar: search + category filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <SearchIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="jr-search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9"
            placeholder="Search by booking code, service, customer, phone or city…" />
        </div>
        <div className="w-56">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger data-testid="jr-category"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {catOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap" data-testid="jr-count">{filtered.length} request{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {loading ? <div className="py-20 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading requests…</div>
        : filtered.length === 0 ? <div className="py-20 text-center text-slate-400">No requests match your filters.</div>
          : (
            <>
              <div className="grid gap-3">
                {pageRows.map((r) => (
                  <div key={r.id} data-testid={`jr-row-${r.id}`} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-bold text-slate-900 dark:text-white">{r.service_name}</span>
                        {r.category_name && <Badge className="bg-primary-50 text-primary-700 border-0 dark:bg-primary-900/30 dark:text-primary-300">{r.category_name}</Badge>}
                        {r.tier_label && <Badge className="bg-slate-100 text-slate-600 border-0 dark:bg-slate-800 dark:text-slate-300">{r.tier_label}</Badge>}
                        <JobStatusBadge s={r.status} />
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="font-mono">{r.code}</span>
                        <span className="flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" />{r.customer_name}</span>
                        {r.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.city}</span>}
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{timeAgo(r.created_at)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-heading font-bold text-slate-900 dark:text-white">{fmt(r.total)}</p>
                      {r.partner_name ? <p className="text-xs text-emerald-600 font-semibold">{r.partner_name}</p>
                        : <p className="text-xs text-amber-600 font-semibold">{r.eligible_count} eligible</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" data-testid={`jr-view-${r.id}`} onClick={() => openDetail(r.id)}>View</Button>
                      {["searching", "assigned"].includes(r.status) &&
                        <Button size="sm" className="bg-primary-700 hover:bg-primary-800" data-testid={`jr-assign-${r.id}`} onClick={() => setAssignFor(r)}>{r.partner_name ? "Reassign" : "Assign"}</Button>}
                    </div>
                  </div>
                ))}
              </div>

              {/* pagination */}
              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-2 mt-5" data-testid="jr-pagination">
                  <Button size="sm" variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>Prev</Button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                    <button key={n} data-testid={`jr-page-${n}`} onClick={() => setPage(n)}
                      className={`h-8 w-8 rounded-lg text-sm font-semibold transition ${n === cur ? "bg-primary-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>{n}</button>
                  ))}
                  <Button size="sm" variant="outline" disabled={cur >= pageCount} onClick={() => setPage(cur + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
      {detail && <JobDetailModal booking={detail} onClose={() => setDetail(null)} onAssign={(bk) => { setDetail(null); setAssignFor(bk); }} />}
      {assignFor && <AssignModal booking={assignFor} onClose={() => setAssignFor(null)} onDone={() => { setAssignFor(null); load(); }} />}
    </div>
  );
};

/* =========================================================================
   Advanced Notification Center — targeted push + in-app broadcasts
   ========================================================================= */
const SEND_TO = [
  ["all", "All Users"], ["specific", "Specific User"], ["provider", "Provider"], ["customer", "Customer"],
];
const NOTIF_TYPES = [["general", "General"], ["category", "Category"], ["url", "URL"]];


function ComposeNotification({ onSent }) {
  const [sendTo, setSendTo] = useState("all");
  const [userId, setUserId] = useState("");
  const [userQ, setUserQ] = useState("");
  const [userOpts, setUserOpts] = useState([]);
  const [type, setType] = useState("general");
  const [cats, setCats] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageOn, setImageOn] = useState(false);
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/catalog/categories").then((r) => setCats(r.data || [])).catch(() => setCats([])); }, []);
  useEffect(() => {
    if (sendTo !== "specific") return;
    const t = setTimeout(() => {
      api.get(`/admin/notifications/audience?send_to=specific&q=${encodeURIComponent(userQ)}`)
        .then((r) => setUserOpts(r.data || [])).catch(() => setUserOpts([]));
    }, 250);
    return () => clearTimeout(t);
  }, [sendTo, userQ]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "notifications");
    setUploading(true);
    try { const { data } = await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }); setImage(data.url); }
    catch { toast.error("Image upload failed"); } finally { setUploading(false); }
  };

  const send = async () => {
    if (!title.trim() || !message.trim()) return toast.error("Title and message are required");
    if (sendTo === "specific" && !userId) return toast.error("Please select a user");
    if (type === "category" && !categoryId) return toast.error("Please select a category");
    if (type === "url" && !url.trim()) return toast.error("Please enter a URL");
    setBusy(true);
    try {
      const payload = { send_to: sendTo, type, title, message, image: imageOn ? image : "" };
      if (sendTo === "specific") payload.user_id = userId;
      if (type === "category") payload.category_id = categoryId;
      if (type === "url") payload.url = url;
      const { data } = await api.post("/admin/notifications/send", payload);
      toast.success(`Sent to ${data.recipients} user${data.recipients === 1 ? "" : "s"}${data.push_delivered ? ` · ${data.push_delivered} push delivered` : ""}`);
      setTitle(""); setMessage(""); setImage(""); setImageOn(false); setUrl(""); setUserId("");
      onSent && onSent();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to send"); } finally { setBusy(false); }
  };

  const selectedUser = userOpts.find((u) => u.id === userId);

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* form */}
      <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <Field label="Send To *">
          <Select value={sendTo} onValueChange={(v) => { setSendTo(v); setUserId(""); }}>
            <SelectTrigger data-testid="nc-sendto"><SelectValue /></SelectTrigger>
            <SelectContent>{SEND_TO.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        {sendTo === "specific" && (
          <Field label="Select user *">
            <div className="relative mb-2">
              <SearchIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input data-testid="nc-user-search" className="pl-9" placeholder="Search by name or phone…" value={userQ} onChange={(e) => setUserQ(e.target.value)} />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {userOpts.length === 0 && <p className="text-xs text-slate-400 p-3">Type to search users…</p>}
              {userOpts.map((u) => (
                <button key={u.id} type="button" data-testid={`nc-user-${u.id}`} onClick={() => setUserId(u.id)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${userId === u.id ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                  <span className="text-slate-700 dark:text-slate-200">{u.name} <span className="text-slate-400">· {u.phone}</span></span>
                  <Badge className="bg-slate-100 text-slate-500 border-0 capitalize">{u.role}</Badge>
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Type Notification *">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger data-testid="nc-type"><SelectValue /></SelectTrigger>
            <SelectContent>{NOTIF_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>

        {type === "category" && (
          <Field label="Category *">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="nc-category"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
        {type === "url" && (
          <Field label="URL *"><Input data-testid="nc-url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        )}

        <Field label="Title *"><Input data-testid="nc-title" placeholder="Enter the title here" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Message *"><Textarea data-testid="nc-message" rows={4} placeholder="Enter message here" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>

        <div className="flex items-center gap-3">
          <Switch data-testid="nc-image-toggle" checked={imageOn} onCheckedChange={setImageOn} />
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Attach image</span>
        </div>
        {imageOn && (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4">
            {image ? (
              <div className="relative w-fit">
                <img src={image} alt="" className="h-28 rounded-lg object-cover" />
                <button type="button" onClick={() => setImage("")} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white grid place-items-center"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
                <ImagePlus className="h-5 w-5" /> {uploading ? "Uploading…" : "Browse image to upload"}
                <input type="file" accept="image/*" className="hidden" data-testid="nc-image-file" onChange={onFile} />
              </label>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button data-testid="nc-send" onClick={send} disabled={busy} className="bg-primary-700 hover:bg-primary-800">
            <Send className="h-4 w-4 mr-1" /> {busy ? "Sending…" : "Send Notifications"}
          </Button>
        </div>
      </div>

      {/* live preview */}
      <div className="lg:col-span-2">
        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Live preview</p>
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            {imageOn && image && <img src={image} alt="" className="w-full h-32 object-cover" />}
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-md bg-primary-700 grid place-items-center text-white text-[10px] font-bold">AZ</div>
                <span className="text-xs font-semibold text-slate-500">AzoApp</span>
                <span className="text-[10px] text-slate-400 ml-auto">now</span>
              </div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">{title || "Notification title"}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{message || "Your message preview will appear here."}</p>
              {type !== "general" && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary-600 font-semibold">
                  <LinkIcon className="h-3 w-3" />{type === "category" ? (cats.find((c) => c.id === categoryId)?.name || "Category") : url || "URL"}
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3 text-center">
            To: {SEND_TO.find(([v]) => v === sendTo)?.[1]}{sendTo === "specific" && selectedUser ? ` — ${selectedUser.name}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function NotificationHistory({ reloadKey }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/admin/notifications/campaigns").then((r) => setRows(r.data || [])).catch(() => setRows([])); }, [reloadKey]);
  if (rows === null) return <div className="py-16 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  if (rows.length === 0) return <div className="py-16 text-center text-slate-400">No notifications sent yet.</div>;
  return (
    <div className="grid gap-3" data-testid="nc-history">
      {rows.map((r) => (
        <div key={r.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
          {r.image ? <img src={r.image} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" /> : <div className="h-12 w-12 rounded-lg bg-primary-50 dark:bg-primary-900/30 grid place-items-center shrink-0"><Bell className="h-5 w-5 text-primary-600" /></div>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{r.title}</span>
              <Badge className="bg-slate-100 text-slate-600 border-0 capitalize dark:bg-slate-800 dark:text-slate-300">{r.type}</Badge>
              <Badge className="bg-primary-50 text-primary-700 border-0 capitalize dark:bg-primary-900/30 dark:text-primary-300">{r.send_to}</Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{r.message}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{r.recipients}</p>
            <p className="text-[11px] text-slate-400">recipients</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export const NotificationCenter = () => {
  const [tab, setTab] = useState("compose");
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div data-testid="notification-center">
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-5 w-fit">
        {[["compose", "Add Notification"], ["history", "History"], ["diagnostics", "Diagnostics"]].map(([k, l]) => (
          <button key={k} data-testid={`nc-tab-${k}`} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === k ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>{l}</button>
        ))}
      </div>
      {tab === "compose" && <ComposeNotification onSent={() => setReloadKey((k) => k + 1)} />}
      {tab === "history" && <NotificationHistory reloadKey={reloadKey} />}
      {tab === "diagnostics" && <NotificationDiagnostics />}
    </div>
  );
};



/* =============== Diagnostics: verify the full push chain end-to-end =============== */
function DiagStatusPill({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}
function NotificationDiagnostics() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerRows, setPickerRows] = useState([]);
  const [target, setTarget] = useState(null);
  const [title, setTitle] = useState("AzoApp test notification");
  const [body, setBody] = useState("Ye ek test push hai — agar aapko ye mila to setup 100% working hai.");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [h, l] = await Promise.all([
        api.get("/admin/notifications/health"),
        api.get("/admin/notifications/delivery-logs?limit=30"),
      ]);
      setHealth(h.data);
      setLogs(l.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load diagnostics");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!pickerQ.trim()) { setPickerRows([]); return; }
      try {
        const { data } = await api.get(`/admin/notifications/audience?send_to=all&q=${encodeURIComponent(pickerQ)}`);
        setPickerRows(data || []);
      } catch { setPickerRows([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [pickerQ]);

  const sendTest = async () => {
    if (!target) return toast.error("Please select a user first");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/notifications/test-push", {
        user_id: target.id, title: title.trim(), body: body.trim(),
      });
      const p = data?.push || {};
      const ps = data?.push_state;
      const why = ps && !ps.ok && ps.reason ? ` — device reported: ${ps.reason}${ps.error ? ` (${ps.error})` : ""}` : "";
      if (p.error) toast.error(`Push failed: ${p.error}`, { duration: 6000 });
      else if (p.skipped === "not_configured") toast.error("FCM service account not configured — save your Firebase settings in the Integration Center", { duration: 6000 });
      else if (p.skipped === "no_devices") toast.error(`${target.name} has no registered device${why || " (the partner hasn't tapped 'Allow notifications' in the app yet)"}`, { duration: 10000 });
      else toast.success(`Sent to ${p.success || 0} device(s), ${p.failure || 0} failed`);
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test failed");
    } finally { setBusy(false); }
  };

  if (loading || !health) return (
    <div className="flex items-center gap-2 text-sm text-slate-500 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading diagnostics…</div>
  );

  const reasonEntries = Object.entries(health.reasons || {});
  return (
    <div className="space-y-5" data-testid="notification-diagnostics">
      <div className={`rounded-2xl border p-4 ${health.ready_for_push ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl ${health.ready_for_push ? "bg-emerald-500" : "bg-amber-500"} text-white flex items-center justify-center shrink-0`}>
            {health.ready_for_push ? <CheckCircle2 className="h-5 w-5" /> : <Info className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900">
              {health.ready_for_push ? "Push notifications are 100% configured" : "Push notifications are NOT ready"}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {health.ready_for_push
                ? `Firebase project: ${health.service_account.project_id || health.web_config.project_id || "(configured)"} · ${health.devices.total} registered devices · ${health.online_partners} partners online right now`
                : "Fix these so booking alerts reach partners:"}
            </p>
            {reasonEntries.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-amber-800">
                {reasonEntries.map(([k, v]) => <li key={k}>• {v}</li>)}
              </ul>
            )}
          </div>
          <button onClick={reload} className="text-slate-500 hover:text-slate-800 text-xs font-medium inline-flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {health.web_api_key && health.web_api_key.ok === false && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4" data-testid="diag-apikey-blocked">
          <p className="font-bold text-red-800 flex items-center gap-2"><Info className="h-4 w-4" /> Partners&apos; phones cannot get a push token — Web API key is restricted</p>
          <p className="text-xs text-red-700 mt-1">Browser error on devices: <code className="bg-white/70 px-1 rounded">installations/request-failed</code>. Server probe with the same key:</p>
          <ul className="mt-2 space-y-1 text-xs">
            {(health.web_api_key.checks || []).map((c) => (
              <li key={c.api} className="flex items-center gap-2" data-testid={`diag-apikey-check-${c.api.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{c.ok ? "allowed" : "blocked"}</span>
                <span className="font-medium text-slate-800">{c.api}</span>
                {!c.ok && <span className="text-slate-500 truncate">· HTTP {c.status} {c.reason}</span>}
              </li>
            ))}
          </ul>
          <ol className="mt-3 text-xs text-red-900 space-y-1 list-decimal list-inside bg-white/70 rounded-xl p-3">
            <li>Open <b>Google Cloud Console → APIs &amp; Services → Credentials</b> (project <b>{health.web_config.project_id}</b>).</li>
            <li>Click the <b>Browser key</b> that matches the Firebase web <code>apiKey</code>.</li>
            <li>Under <b>API restrictions</b> choose <b>Don&apos;t restrict key</b> — or allow: <b>Firebase Installations API</b>, <b>Firebase Cloud Messaging API</b>, <b>FCM Registration API</b>.</li>
            <li>Save, wait ~1 minute, press <b>Refresh</b> above, then ask partners to tap <b>Fix now</b> in their app.</li>
          </ol>
        </div>
      )}
      {health.web_api_key && health.web_api_key.ok === true && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5" data-testid="diag-apikey-ok"><CheckCircle2 className="h-4 w-4" /> Web API key allowed for Firebase Installations + FCM Registration — phones can obtain push tokens.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-100 p-4 bg-white">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Service Account</p>
          <DiagStatusPill ok={health.service_account.configured} label={health.service_account.configured ? "Uploaded" : "Missing"} />
          {health.service_account.project_id && (
            <p className="mt-2 text-[11px] text-slate-500 truncate">Project: <span className="font-medium text-slate-700">{health.service_account.project_id}</span></p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-100 p-4 bg-white">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Web Config</p>
          <DiagStatusPill ok={health.web_config.configured} label={health.web_config.configured ? "All fields set" : "Incomplete"} />
          {health.web_config.missing_fields?.length > 0 && (
            <p className="mt-2 text-[11px] text-red-600">Missing: {health.web_config.missing_fields.join(", ")}</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-100 p-4 bg-white">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">VAPID Key</p>
          <DiagStatusPill ok={health.vapid_key_configured} label={health.vapid_key_configured ? "Set" : "Missing"} />
        </div>
        <div className="rounded-2xl border border-slate-100 p-4 bg-white">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Registered Devices</p>
          <p className="text-2xl font-black text-primary-700">{health.devices.total}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Partner: {health.devices.by_role.partner || 0} · Customer: {health.devices.by_role.customer || 0} · Admin: {health.devices.by_role.admin || 0}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 p-5 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Send className="h-4 w-4 text-primary-700" />
          <h3 className="font-bold text-slate-900">Send a real test push</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Pick a user and send a synthetic push to verify the full chain (SA → web-config → device → FCM). In-app SSE ping bhi bhejta hai (foreground toast).</p>
        <div className="space-y-3">
          <div className="relative">
            <Input data-testid="diag-user-search" value={pickerQ} onChange={(e) => setPickerQ(e.target.value)}
              placeholder="Search user by name or phone…" />
            {pickerRows.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-lg">
                {pickerRows.map((u) => (
                  <button key={u.id} onClick={() => { setTarget(u); setPickerRows([]); setPickerQ(""); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2">
                    <span className="text-xs text-slate-400 uppercase w-16 shrink-0">{u.role}</span>
                    <span className="font-medium text-sm text-slate-800 truncate">{u.name}</span>
                    <span className="text-[11px] text-slate-500 ml-auto shrink-0">{u.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {target && (
            <div className="flex items-center gap-2 rounded-xl bg-primary-50 border border-primary-100 px-3 py-2">
              <UserIcon className="h-4 w-4 text-primary-700" />
              <span className="text-sm font-semibold text-slate-800">{target.name}</span>
              <span className="text-xs text-slate-500">· {target.role} · {target.phone}</span>
              <button onClick={() => setTarget(null)} className="ml-auto text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
          )}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Body" />
          <Button data-testid="diag-send-test" onClick={sendTest} disabled={busy || !target} className="w-full bg-primary-700 hover:bg-primary-800">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Send test push</>}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 p-5 bg-white" data-testid="diag-partners-without-device">
        <div className="flex items-center gap-2 mb-1">
          <UserIcon className="h-4 w-4 text-amber-600" />
          <h3 className="font-bold text-slate-900">Online partners without a registered device</h3>
          <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">{(health.partners_without_device || []).length}</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">{`These partners are online now, but no push token is registered from their phone/browser — when the browser is closed they won't receive a push (the in-app ring still works). "Last device report" shows the reason their browser gave.`}</p>
        {(health.partners_without_device || []).length === 0 ? (
          <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Every online partner has a registered device.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="text-left font-semibold py-2 pr-3">Partner</th><th className="text-left font-semibold py-2 pr-3">Phone</th><th className="text-left font-semibold py-2 pr-3">Last device report</th><th className="text-left font-semibold py-2">Detail</th>
              </tr></thead>
              <tbody>
                {(health.partners_without_device || []).map((p) => {
                  const ps = p.push_state;
                  return (
                    <tr key={p.id} className="border-b border-slate-50" data-testid={`diag-nodevice-${p.id}`}>
                      <td className="py-2 pr-3 font-medium text-slate-800">{p.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{p.phone}</td>
                      <td className="py-2 pr-3">
                        {ps ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${ps.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{ps.reason || (ps.ok ? "registered" : "failed")}</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-500">never attempted</span>}
                        {ps?.at && <span className="ml-1 text-slate-400">{new Date(ps.at).toLocaleString()}</span>}
                      </td>
                      <td className="py-2 text-slate-500 max-w-[320px] truncate" title={ps?.error || ""}>{ps ? (ps.error || `permission: ${ps.permission || "?"}`) : "The partner never tapped 'Allow notifications' in this browser"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 p-5 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-primary-700" />
          <h3 className="font-bold text-slate-900">Recent delivery attempts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="text-left font-semibold py-2 pr-3">When</th>
                <th className="text-left font-semibold py-2 pr-3">User</th>
                <th className="text-left font-semibold py-2 pr-3">Title</th>
                <th className="text-left font-semibold py-2 pr-3">Status</th>
                <th className="text-left font-semibold py-2 pr-3">Devices</th>
                <th className="text-left font-semibold py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">No deliveries logged yet.</td></tr>
              )}
              {logs.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-slate-800">{r.user?.name || r.user_id?.slice(0, 8)}</span>
                    {r.user?.role && <span className="text-slate-400 ml-1">({r.user.role})</span>}
                  </td>
                  <td className="py-2 pr-3 truncate max-w-[220px]" title={r.title}>{r.title}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === "sent" ? "bg-emerald-100 text-emerald-700" : r.status === "failed" || r.status === "error" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{r.status}</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{r.success || 0}/{r.tokens || 0}{r.failure ? ` (${r.failure} failed)` : ""}</td>
                  <td className="py-2 text-slate-500 truncate max-w-[280px]" title={r.detail}>{r.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 p-5 bg-white" data-testid="diag-registration-attempts">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4 text-primary-700" />
          <h3 className="font-bold text-slate-900">Device registration attempts (browser reports)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <th className="text-left font-semibold py-2 pr-3">When</th><th className="text-left font-semibold py-2 pr-3">User</th><th className="text-left font-semibold py-2 pr-3">Result</th><th className="text-left font-semibold py-2 pr-3">Permission</th><th className="text-left font-semibold py-2">Error / Browser</th>
            </tr></thead>
            <tbody>
              {(health.registration_attempts || []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">No registration attempts reported yet — a partner has to log in and tap "Allow notifications".</td></tr>
              )}
              {(health.registration_attempts || []).map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{new Date(r.at).toLocaleString()}</td>
                  <td className="py-2 pr-3"><span className="font-medium text-slate-800">{r.user?.name || r.user_id?.slice(0, 8)}</span>{r.user?.role && <span className="text-slate-400 ml-1">({r.user.role})</span>}</td>
                  <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{r.reason || (r.ok ? "registered" : "failed")}</span></td>
                  <td className="py-2 pr-3 text-slate-600">{r.permission || "—"}</td>
                  <td className="py-2 text-slate-500 max-w-[360px] truncate" title={`${r.error || ""} ${r.user_agent || ""}`}>{r.error || r.user_agent || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
