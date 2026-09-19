import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Save, Loader2, CheckCircle2, Plus, Trash2, Pencil, Search, X, FileText,
  Phone, Mail, MapPin, Clock, MessageSquare, Tag, Image as ImageIcon, Calendar,
  ChevronDown, Globe, Eye, EyeOff, FolderTree,
} from "lucide-react";
import RichEditor from "@/components/cms/RichEditor";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDateTimePicker from "@/components/ui/PremiumDateTimePicker";
import SeoPanel from "@/components/cms/SeoPanel";
import MediaLibraryPicker from "@/components/cms/MediaLibraryPicker";

const BRAND = "#0D47A1";
const inputCls = "w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30";
const areaCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30";
const labelCls = "text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500";

const Fld = ({ label, hint, children, className = "" }) => (
  <div className={className}>
    <label className={labelCls}>{label}</label>
    <div className="mt-1.5">{children}</div>
    {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

const Card = ({ title, desc, icon: Icon, children, right }) => (
  <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
    {(title || right) && (
      <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-start gap-3">
          {Icon && <span className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: BRAND }}><Icon className="h-4.5 w-4.5" /></span>}
          <div>
            <h3 className="font-heading font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
            {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
          </div>
        </div>
        {right}
      </div>
    )}
    <div className="p-5 sm:p-6">{children}</div>
  </div>
);

/* ── Premium full-width page shell with sticky save bar ── */
function CmsShell({ title, subtitle, breadcrumb, children, dirty, saving, savedAt, onSave, saveLabel = "Save Changes" }) {
  return (
    <div className="w-full pb-24">
      <div className="mb-5">
        {breadcrumb && <p className="text-xs text-slate-400 mb-1">{breadcrumb}</p>}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900 dark:text-white">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{subtitle}</p>}
          </div>
          {onSave && (
            <div className="flex items-center gap-3">
              {saving ? <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</span>
                : dirty ? <span className="text-xs text-amber-500 font-medium">Unsaved changes</span>
                : savedAt ? <span className="text-xs text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />All changes saved</span> : null}
            </div>
          )}
        </div>
      </div>
      {children}
      {onSave && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-4 sm:px-8 py-3 flex items-center justify-between md:pl-72">
          <span className="text-xs text-slate-400">{dirty ? "You have unsaved changes" : savedAt ? "All changes saved" : "Ready"}</span>
          <button onClick={onSave} disabled={saving || !dirty} data-testid="cms-save-btn"
            className="h-11 px-6 rounded-xl text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 shadow-lg" style={{ background: BRAND }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saveLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Tab switcher (Content / SEO) ── */
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1 mb-4 overflow-x-auto no-scrollbar">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} data-testid={`cms-tab-${t.key}`}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${active === t.key ? "text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}
          style={active === t.key ? { background: BRAND } : {}}>
          {t.icon && <t.icon className="h-4 w-4" />}{t.label}
        </button>
      ))}
    </div>
  );
}

/* =========================================================================
   PAGE EDITOR PRO — About / Contact / Privacy / Terms / Refund
   ========================================================================= */
export function PageEditorPro({ pageKey, title, subtitle }) {
  const [doc, setDoc] = useState(null);
  const [orig, setOrig] = useState("");
  const [tab, setTab] = useState("content");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    setDoc(null);
    api.get(`/content/${pageKey}`).then((r) => {
      const d = r.data || {};
      if (!d.seo) d.seo = { seo_title: d.seo_title || "", meta_description: d.seo_description || "" };
      setDoc(d); setOrig(JSON.stringify(d)); setSavedAt(null);
    }).catch(() => { const d = { seo: {} }; setDoc(d); setOrig(JSON.stringify(d)); });
  }, [pageKey]);

  const dirty = useMemo(() => doc && JSON.stringify(doc) !== orig, [doc, orig]);
  const set = (k, v) => setDoc((p) => ({ ...p, [k]: v }));
  if (!doc) return <div className="p-10 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...doc,
        seo_title: doc.seo?.seo_title || doc.seo_title || "",
        seo_description: doc.seo?.meta_description || doc.seo_description || "",
      };
      const r = await api.put(`/admin/pages/${pageKey}`, payload);
      const d = r.data || payload; if (!d.seo) d.seo = payload.seo || {};
      setDoc(d); setOrig(JSON.stringify(d)); setSavedAt(Date.now());
      toast.success("Saved — live on the frontend");
    } catch (e) { toast.error(e?.response?.data?.detail || "Unable to save. Please try again."); }
    finally { setSaving(false); }
  };

  return (
    <CmsShell title={title} subtitle={subtitle} breadcrumb={`Website / CMS · ${title}`}
      dirty={dirty} saving={saving} savedAt={savedAt} onSave={save}>
      <Tabs tabs={[{ key: "content", label: "Content", icon: FileText }, { key: "seo", label: "SEO", icon: Globe }]} active={tab} onChange={setTab} />
      {tab === "content" ? (
        <div className="space-y-5">
          <Card title="Page Content" desc="This content renders on the public page." icon={FileText}>
            <Fld label="Page Heading"><input className={inputCls} value={doc.title || ""} onChange={(e) => set("title", e.target.value)} data-testid="page-heading" /></Fld>
            {pageKey === "contact" && (
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <Fld label="Phone"><div className="relative"><Phone className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={inputCls + " pl-9"} value={doc.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div></Fld>
                <Fld label="Email"><div className="relative"><Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={inputCls + " pl-9"} value={doc.email || ""} onChange={(e) => set("email", e.target.value)} /></div></Fld>
                <Fld label="Address"><div className="relative"><MapPin className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={inputCls + " pl-9"} value={doc.address || ""} onChange={(e) => set("address", e.target.value)} /></div></Fld>
                <Fld label="Business Hours"><div className="relative"><Clock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={inputCls + " pl-9"} value={doc.hours || ""} onChange={(e) => set("hours", e.target.value)} /></div></Fld>
                <Fld label="WhatsApp Number"><input className={inputCls} value={doc.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} /></Fld>
                <Fld label="Support Email"><input className={inputCls} value={doc.support_email || ""} onChange={(e) => set("support_email", e.target.value)} /></Fld>
                <Fld label="Google Maps Embed URL" className="sm:col-span-2"><input className={inputCls} value={doc.map_embed || ""} placeholder="https://www.google.com/maps/embed?…" onChange={(e) => set("map_embed", e.target.value)} /></Fld>
                <Fld label="CTA Text"><input className={inputCls} value={doc.cta_text || ""} onChange={(e) => set("cta_text", e.target.value)} /></Fld>
                <Fld label="CTA URL"><input className={inputCls} value={doc.cta_url || ""} onChange={(e) => set("cta_url", e.target.value)} /></Fld>
              </div>
            )}
            <div className="mt-4">
              <label className={labelCls}>Body</label>
              <div className="mt-1.5"><RichEditor value={doc.body || ""} onChange={(v) => set("body", v)} testId="page-editor" /></div>
            </div>
          </Card>
        </div>
      ) : (
        <Card title="Search Engine Optimization" desc="How this page appears on Google & social media." icon={Globe}>
          <SeoPanel seo={doc.seo || {}} onChange={(v) => set("seo", v)} pageTitle={doc.title || title} slug={pageKey} />
        </Card>
      )}
    </CmsShell>
  );
}

/* =========================================================================
   FAQ MANAGER PRO — category-based
   ========================================================================= */
export function FaqManagerPro() {
  const [faqs, setFaqs] = useState([]);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [editing, setEditing] = useState(null); // faq object being edited/created
  const [catMgr, setCatMgr] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/faqs").then((r) => setFaqs(Array.isArray(r.data) ? r.data : []));
    api.get("/admin/faq-categories").then((r) => setCats(Array.isArray(r.data) ? r.data : []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const catNames = cats.map((c) => c.name);
  const list = faqs.filter((f) => (!filterCat || f.category === filterCat) && (!q || `${f.question} ${f.answer}`.toLowerCase().includes(q.toLowerCase())));
  const grouped = useMemo(() => {
    const b = {};
    list.forEach((f) => { const c = f.category || "General"; (b[c] = b[c] || []).push(f); });
    return b;
  }, [list]);

  const blank = { question: "", answer: "", category: catNames[0] || "General", status: "active", order: 0 };
  const save = async () => {
    if (!editing.question?.trim()) return toast.error("Question is required");
    try {
      if (editing.id) await api.put(`/admin/faqs/${editing.id}`, editing);
      else await api.post("/admin/faqs", editing);
      toast.success("Saved — live on the frontend"); setEditing(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };
  const del = async (id) => { if (!window.confirm("Delete this FAQ?")) return; await api.delete(`/admin/faqs/${id}`); toast.success("Deleted"); load(); };

  return (
    <CmsShell title="FAQ" subtitle="Create category-based questions & answers. They appear grouped on the storefront." breadcrumb="Website / CMS · FAQ">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={inputCls + " pl-9"} placeholder="Search FAQs…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="faq-admin-search" />
        </div>
        <PremiumSelect className={`${inputCls} !w-auto min-w-[150px]`} value={filterCat} onChange={(e) => setFilterCat(e.target.value)} placeholder="All categories">
          <option value="">All categories</option>
          {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </PremiumSelect>
        <button onClick={() => setCatMgr(true)} className="h-11 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 text-sm font-semibold inline-flex items-center gap-2"><FolderTree className="h-4 w-4" />Categories</button>
        <button onClick={() => setEditing({ ...blank })} data-testid="faq-add-btn" className="h-11 px-5 rounded-lg text-white text-sm font-bold inline-flex items-center gap-2" style={{ background: BRAND }}><Plus className="h-4 w-4" />Add FAQ</button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card><p className="text-center text-slate-400 py-10">No FAQs yet. Click “Add FAQ” to create one.</p></Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, items]) => (
            <Card key={cat} title={cat} desc={`${items.length} question${items.length === 1 ? "" : "s"}`} icon={MessageSquare}>
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {items.map((f) => (
                  <div key={f.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{f.question}</p>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2 rt-editor" dangerouslySetInnerHTML={{ __html: f.answer || "" }} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${f.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{f.status === "active" ? "Active" : "Hidden"}</span>
                      <button onClick={() => setEditing({ ...f })} className="text-slate-400 hover:text-[#0D47A1]" data-testid={`faq-edit-${f.id}`}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(f.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* FAQ editor modal */}
      {editing && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">{editing.id ? "Edit FAQ" : "Add FAQ"}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <Fld label="Question"><input className={inputCls} value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} data-testid="faq-question-input" /></Fld>
              <div className="grid sm:grid-cols-2 gap-4">
                <Fld label="Category">
                  <PremiumSelect className={inputCls} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} data-testid="faq-category-select">
                    {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
                    {!catNames.includes(editing.category) && editing.category && <option value={editing.category}>{editing.category}</option>}
                  </PremiumSelect>
                </Fld>
                <div className="grid grid-cols-2 gap-4">
                  <Fld label="Order"><input type="number" className={inputCls} value={editing.order || 0} onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })} /></Fld>
                  <Fld label="Status">
                    <PremiumSelect className={inputCls} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} searchable={false}>
                      <option value="active">Active</option><option value="inactive">Hidden</option>
                    </PremiumSelect>
                  </Fld>
                </div>
              </div>
              <div>
                <label className={labelCls}>Answer</label>
                <div className="mt-1.5"><RichEditor value={editing.answer} onChange={(v) => setEditing({ ...editing, answer: v })} minHeight={180} testId="faq-answer" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="h-10 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 text-sm font-semibold">Cancel</button>
              <button onClick={save} data-testid="faq-save-btn" className="h-10 px-5 rounded-lg text-white text-sm font-bold" style={{ background: BRAND }}>Save FAQ</button>
            </div>
          </div>
        </div>
      )}

      {catMgr && <CategoryManager cats={cats} onClose={() => { setCatMgr(false); load(); }} />}
    </CmsShell>
  );
}

function CategoryManager({ cats, onClose }) {
  const [rows, setRows] = useState(cats);
  const [name, setName] = useState("");
  const reload = () => api.get("/admin/faq-categories").then((r) => setRows(Array.isArray(r.data) ? r.data : []));
  const add = async () => { if (!name.trim()) return; await api.post("/admin/faq-categories", { name: name.trim() }); setName(""); reload(); };
  const del = async (id) => { await api.delete(`/admin/faq-categories/${id}`); reload(); };
  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4"><h3 className="font-heading font-bold text-slate-900 dark:text-white">FAQ Categories</h3><button onClick={onClose} className="text-slate-400"><X className="h-5 w-5" /></button></div>
        <div className="flex gap-2 mb-4">
          <input className={inputCls} placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} data-testid="faq-cat-input" />
          <button onClick={add} className="h-11 px-4 rounded-lg text-white text-sm font-bold" style={{ background: BRAND }}><Plus className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800">
              <span className="text-sm text-slate-700 dark:text-slate-200">{c.name}</span>
              <button onClick={() => del(c.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   BLOG MANAGER PRO — advanced
   ========================================================================= */
const slugify = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function BlogManagerPro() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("content");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get("/admin/blogs").then((r) => setRows(Array.isArray(r.data) ? r.data : [])), []);
  useEffect(() => { load(); }, [load]);

  const list = rows.filter((b) => !q || `${b.title} ${b.category || ""} ${(b.tags || []).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const blank = { title: "", slug: "", excerpt: "", body: "", image: "", image_alt: "", image_caption: "", author: "AzoApp", category: "", tags: [], status: "draft", publish_at: "", seo: {} };

  const openNew = () => { setEditing({ ...blank }); setTab("content"); };
  const openEdit = (b) => { setEditing({ ...blank, ...b, seo: b.seo || {} }); setTab("content"); };

  const save = async () => {
    if (!editing.title?.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      const payload = { ...editing, slug: editing.slug || slugify(editing.title) };
      if (editing.id) await api.put(`/admin/blogs/${editing.id}`, payload);
      else await api.post("/admin/blogs", payload);
      toast.success(payload.status === "published" ? "Published — live on the frontend" : "Saved");
      setEditing(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };
  const del = async (id) => { if (!window.confirm("Delete this blog post?")) return; await api.delete(`/admin/blogs/${id}`); toast.success("Deleted"); load(); };

  const statusPill = (s) => s === "published" ? "bg-emerald-100 text-emerald-700" : s === "scheduled" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500";

  if (editing) {
    const e = editing;
    const setE = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
    return (
      <CmsShell title={e.id ? "Edit Blog Post" : "New Blog Post"} breadcrumb="Website / CMS · Blog"
        dirty saving={saving} onSave={save} saveLabel={e.status === "published" ? "Publish" : "Save"}>
        <div className="mb-4"><button onClick={() => setEditing(null)} className="text-sm text-slate-500 hover:text-[#0D47A1] inline-flex items-center gap-1"><X className="h-4 w-4" />Back to list</button></div>
        <Tabs tabs={[{ key: "content", label: "Content", icon: FileText }, { key: "seo", label: "SEO", icon: Globe }]} active={tab} onChange={setTab} />
        {tab === "content" ? (
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <Card title="Basic Information" icon={FileText}>
                <div className="space-y-4">
                  <Fld label="Blog Title"><input className={inputCls} value={e.title} onChange={(ev) => { const t = ev.target.value; setEditing((p) => ({ ...p, title: t, slug: p.slug && p.slug !== slugify(p.title) ? p.slug : slugify(t) })); }} data-testid="blog-title-input" /></Fld>
                  <Fld label="Slug" hint="auto-generated from title, editable"><input className={inputCls} value={e.slug} onChange={(ev) => setE("slug", ev.target.value)} /></Fld>
                  <Fld label="Short Excerpt"><textarea className={areaCls} rows={2} value={e.excerpt} onChange={(ev) => setE("excerpt", ev.target.value)} /></Fld>
                </div>
              </Card>
              <Card title="Content" icon={FileText}>
                <RichEditor value={e.body} onChange={(v) => setE("body", v)} testId="blog-body" />
              </Card>
            </div>
            <div className="space-y-5">
              <Card title="Publish" icon={Calendar}>
                <div className="space-y-4">
                  <Fld label="Status">
                    <PremiumSelect className={inputCls} value={e.status} onChange={(ev) => setE("status", ev.target.value)} data-testid="blog-status-select" searchable={false}>
                      <option value="draft">Draft</option><option value="published">Published</option><option value="scheduled">Scheduled</option>
                    </PremiumSelect>
                  </Fld>
                  {(e.status === "scheduled" || e.publish_at) && (
                    <Fld label="Publish Date/Time" hint="future date keeps it hidden until then">
                      <PremiumDateTimePicker className={inputCls} value={(e.publish_at || "").slice(0, 16)} onChange={(ev) => setE("publish_at", ev.target.value ? new Date(ev.target.value).toISOString() : "")} />
                    </Fld>
                  )}
                  <Fld label="Author"><input className={inputCls} value={e.author} onChange={(ev) => setE("author", ev.target.value)} /></Fld>
                  <Fld label="Category"><input className={inputCls} value={e.category} placeholder="e.g. Home Appliances" onChange={(ev) => setE("category", ev.target.value)} /></Fld>
                  <Fld label="Tags" hint="comma separated"><input className={inputCls} value={(e.tags || []).join(", ")} onChange={(ev) => setE("tags", ev.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></Fld>
                </div>
              </Card>
              <Card title="Featured Image" icon={ImageIcon}>
                <div className="space-y-3">
                  {e.image ? (
                    <div className="relative rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                      <img src={e.image} alt="" className="w-full aspect-video object-cover" />
                      <button onClick={() => setE("image", "")} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-red-500 text-white flex items-center justify-center"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setMediaOpen(true)} data-testid="blog-image-btn" className="w-full aspect-video rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-slate-400 hover:border-[#0D47A1] hover:text-[#0D47A1]">
                      <ImageIcon className="h-6 w-6" /><span className="text-xs mt-1">Select from Media Library</span>
                    </button>
                  )}
                  <Fld label="Image Alt Text"><input className={inputCls} value={e.image_alt} onChange={(ev) => setE("image_alt", ev.target.value)} /></Fld>
                  <Fld label="Image Caption"><input className={inputCls} value={e.image_caption} onChange={(ev) => setE("image_caption", ev.target.value)} /></Fld>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card title="Search Engine Optimization" desc="Article schema is generated automatically from these fields." icon={Globe}>
            <SeoPanel seo={e.seo || {}} onChange={(v) => setE("seo", v)} pageTitle={e.title} pageDescription={e.excerpt} slug={`blog/${e.slug}`} />
          </Card>
        )}
        <MediaLibraryPicker open={mediaOpen} onClose={() => setMediaOpen(false)} folder="blog" onSelect={(u) => setE("image", u)} />
      </CmsShell>
    );
  }

  return (
    <CmsShell title="Blog" subtitle="Write, schedule and publish articles. Published posts appear on the website automatically." breadcrumb="Website / CMS · Blog">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={inputCls + " pl-9"} placeholder="Search posts…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button onClick={openNew} data-testid="blog-add-btn" className="h-11 px-5 rounded-lg text-white text-sm font-bold inline-flex items-center gap-2" style={{ background: BRAND }}><Plus className="h-4 w-4" />New Post</button>
      </div>
      {list.length === 0 ? (
        <Card><p className="text-center text-slate-400 py-10">No blog posts yet.</p></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {list.map((b) => (
            <div key={b.id} className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden group">
              <div className="aspect-video bg-slate-100 dark:bg-slate-800 overflow-hidden">
                {b.image ? <img src={b.image} alt={b.image_alt || ""} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon className="h-8 w-8" /></div>}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusPill(b.status)}`}>{b.status}</span>
                  {b.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">{b.category}</span>}
                </div>
                <h3 className="font-heading font-bold text-slate-900 dark:text-white text-sm line-clamp-2">{b.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{b.excerpt}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400">{b.author}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(b)} className="text-slate-400 hover:text-[#0D47A1]" data-testid={`blog-edit-${b.id}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(b.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CmsShell>
  );
}
