import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ImagePlus, X, Trash2, Pencil, Copy, Eye, Power, GripVertical, Plus,
  Images, CalendarClock, MousePointerClick, Percent, TrendingUp, Monitor, Tablet, Smartphone,
} from "lucide-react";
import {
  PageHeader, KpiCard, Card, SectionTitle, Field, PInput, PSelect, BtnPrimary, BtnGhost,
  Badge, Skeleton, EmptyState,
} from "@/components/marketing/mkit";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";

const BRAND = "#0D47A1";
const BLANK = {
  title: "", subtitle: "", desktop_image: "", mobile_image: "", cta_text: "", button_url: "",
  position: "home_hero", priority: 1, order: 0, start_date: "", end_date: "", status: "active",
};
const POSITIONS = [["home_hero", "Home Hero"], ["category_top", "Category Top"], ["checkout", "Checkout"], ["sidebar", "Sidebar"]];

/* Drag & drop image uploader with aspect-ratio hint */
function DropUpload({ label, ratio, value, onChange, folder = "banner" }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("folder", folder);
    setBusy(true);
    try { const { data } = await api.post("/media/upload", fd); onChange(data.url); toast.success("Image uploaded"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Upload failed"); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
        <span className="text-[10px] text-slate-400">Recommended {ratio}</span>
      </div>
      {value ? (
        <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <img src={value} alt="" className="w-full h-28 object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
            <button type="button" onClick={() => ref.current?.click()} className="text-white text-xs bg-white/20 px-3 py-1.5 rounded-lg">Replace</button>
            <button type="button" onClick={() => onChange("")} className="text-white text-xs bg-red-500/80 px-3 py-1.5 rounded-lg">Remove</button>
          </div>
        </div>
      ) : (
        <div onClick={() => ref.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); }}
          className={`h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition ${drag ? "border-[#0D47A1] bg-[#0D47A1]/5" : "border-slate-300 dark:border-slate-600 text-slate-400 hover:border-[#0D47A1]"}`}>
          {busy ? <span className="text-xs">Uploading…</span> : <><ImagePlus className="h-6 w-6" /><span className="text-[11px] mt-1">Drag & drop or click to upload</span></>}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <PInput className="mt-2 !h-9 text-xs" placeholder="…or paste image URL" value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* Live device preview */
function DevicePreview({ banner }) {
  const [device, setDevice] = useState("desktop");
  const b = banner || {};
  const img = device === "mobile" ? (b.mobile_image || b.desktop_image) : (b.desktop_image || b.mobile_image);
  const frameW = device === "desktop" ? "w-full" : device === "tablet" ? "max-w-[420px]" : "max-w-[240px]";
  const Overlay = () => (
    <div className="absolute inset-0 flex flex-col justify-center px-6 bg-gradient-to-r from-black/55 to-transparent">
      <p className="text-white font-heading font-bold text-lg leading-tight drop-shadow">{b.title || "Banner title"}</p>
      <p className="text-white/85 text-xs mt-1 max-w-[70%]">{b.subtitle || "Your subtitle goes here"}</p>
      {b.cta_text && <span className="mt-3 inline-block w-fit text-xs font-bold text-white px-3 py-1.5 rounded-lg" style={{ background: BRAND }}>{b.cta_text}</span>}
    </div>
  );
  return (
    <Card className="p-5">
      <SectionTitle icon={Monitor} title="Live preview"
        right={
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {[["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]].map(([k, I]) => (
              <button key={k} onClick={() => setDevice(k)} title={k}
                className={`h-8 w-8 grid place-items-center rounded-lg transition ${device === k ? "text-white" : "text-slate-500"}`}
                style={device === k ? { background: BRAND } : {}}><I className="h-4 w-4" /></button>
            ))}
          </div>
        } />
      <div className="flex justify-center py-2">
        <div className={`${frameW} transition-all`}>
          {/* device chrome */}
          <div className="rounded-2xl border-[6px] border-slate-800 dark:border-slate-700 overflow-hidden bg-slate-900 shadow-xl">
            {device === "desktop" && (
              <div className="h-6 bg-slate-800 flex items-center gap-1.5 px-3">
                <span className="h-2 w-2 rounded-full bg-red-400" /><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="ml-3 h-3 flex-1 rounded bg-slate-700" />
              </div>
            )}
            <div className={`relative bg-slate-200 ${device === "mobile" ? "aspect-[9/12]" : "aspect-[16/6]"}`}>
              {img ? <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-slate-400 text-xs">No image</div>}
              <Overlay />
            </div>
          </div>
          {b.button_url && <p className="text-center text-[11px] text-slate-400 mt-2">→ {b.button_url}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function BannersManager() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [preview, setPreview] = useState(null);
  const [dragId, setDragId] = useState(null);

  const load = useCallback(() => {
    api.get("/admin/banners").then((r) => {
      const list = (r.data || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      setRows(list);
    }).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm({ ...BLANK, order: (rows || []).length }); setEditing({}); };
  const openEdit = (b) => { setForm({ ...BLANK, ...b }); setEditing(b); };

  const save = async () => {
    if (!form.title) return toast.error("Title is required");
    const payload = { ...form, priority: Number(form.priority) || 1, order: Number(form.order) || 0, image: form.desktop_image || form.mobile_image };
    try {
      if (editing && editing.id) await api.put(`/admin/banners/${editing.id}`, payload);
      else await api.post("/admin/banners", payload);
      toast.success(editing?.id ? "Banner updated" : "Banner created");
      setEditing(null); setForm(BLANK); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };
  const remove = async (b) => { if (!window.confirm(`Delete banner "${b.title}"?`)) return; try { await api.delete(`/admin/banners/${b.id}`); toast.success("Deleted"); load(); } catch { toast.error("Delete failed"); } };
  const toggle = async (b) => { try { await api.put(`/admin/banners/${b.id}`, { status: b.status === "active" ? "inactive" : "active" }); load(); } catch { toast.error("Failed"); } };
  const duplicate = async (b) => { const { id, _id, created_at, ...rest } = b; try { await api.post("/admin/banners", { ...rest, title: `${b.title} (copy)`, status: "inactive", image: b.desktop_image || b.image }); toast.success("Duplicated"); load(); } catch { toast.error("Failed"); } };

  // drag reorder
  const onDrop = async (targetId) => {
    if (!dragId || dragId === targetId) return;
    const arr = [...rows];
    const fromIdx = arr.findIndex((x) => x.id === dragId);
    const toIdx = arr.findIndex((x) => x.id === targetId);
    const [moved] = arr.splice(fromIdx, 1); arr.splice(toIdx, 0, moved);
    setRows(arr); setDragId(null);
    try {
      await Promise.all(arr.map((b, i) => (b.order !== i ? api.put(`/admin/banners/${b.id}`, { order: i }) : null)).filter(Boolean));
      toast.success("Order updated");
    } catch { toast.error("Reorder failed"); load(); }
  };

  const stats = (() => {
    const list = rows || [];
    const now = new Date().toISOString();
    let active = 0, scheduled = 0, clicks = 0, impressions = 0, conversions = 0;
    list.forEach((b) => {
      if (b.start_date && b.start_date > now) scheduled++;
      else if ((b.status || "active") === "active") active++;
      clicks += b.clicks || 0; impressions += b.impressions || 0; conversions += b.conversions || 0;
    });
    const ctr = impressions ? ((clicks / impressions) * 100).toFixed(1) : "0.0";
    return { active, scheduled, clicks, ctr, conversions };
  })();

  /* Editor view */
  if (editing) {
    return (
      <div className="space-y-5" data-testid="banner-editor">
        <button onClick={() => { setEditing(null); setForm(BLANK); }} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white"><X className="h-4 w-4" /> Back to banners</button>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-6 space-y-4">
            <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Images className="h-5 w-5" style={{ color: BRAND }} /> {editing.id ? "Edit Banner" : "Create Banner"}</h2>
            <Field label="Title" required><PInput value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Monsoon AC Service" /></Field>
            <Field label="Subtitle"><PInput value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="Flat 30% off deep cleaning" /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <DropUpload label="Desktop image" ratio="16:6 · 1600×600" value={form.desktop_image} onChange={(v) => set("desktop_image", v)} />
              <DropUpload label="Mobile image" ratio="4:3 · 800×600" value={form.mobile_image} onChange={(v) => set("mobile_image", v)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="CTA text"><PInput value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} placeholder="Book Now" /></Field>
              <Field label="Destination URL"><PInput value={form.button_url} onChange={(e) => set("button_url", e.target.value)} placeholder="/services or /category/ac" /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Display position"><PSelect value={form.position} onChange={(e) => set("position", e.target.value)}>{POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</PSelect></Field>
              <Field label="Priority"><PInput type="number" value={form.priority} onChange={(e) => set("priority", e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Start date"><PremiumDatePicker value={(form.start_date || "").slice(0, 10)} onChange={(e) => set("start_date", e.target.value)} className="rounded-xl" /></Field>
              <Field label="End date"><PremiumDatePicker value={(form.end_date || "").slice(0, 10)} onChange={(e) => set("end_date", e.target.value)} className="rounded-xl" /></Field>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <Field label="Status"><PSelect value={form.status} onChange={(e) => set("status", e.target.value)} className="!w-auto"><option value="active">Active</option><option value="inactive">Inactive</option></PSelect></Field>
              <BtnPrimary onClick={save}>{editing.id ? "Update Banner" : "Create Banner"}</BtnPrimary>
            </div>
          </Card>
          <div><DevicePreview banner={form} /></div>
        </div>
      </div>
    );
  }

  /* List view */
  return (
    <div className="space-y-6" data-testid="banners-manager">
      <PageHeader icon={Images} title="Banners & Sliders" subtitle="Manage promotional banners across web and mobile experiences.">
        <BtnPrimary onClick={openNew} data-testid="banner-new"><Plus className="h-4 w-4" /> Create Banner</BtnPrimary>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Active Banners" value={stats.active} icon={Images} tone="emerald" />
        <KpiCard label="Scheduled" value={stats.scheduled} icon={CalendarClock} tone="sky" />
        <KpiCard label="Clicks" value={stats.clicks.toLocaleString("en-IN")} icon={MousePointerClick} tone="brand" />
        <KpiCard label="CTR" value={`${stats.ctr}%`} icon={Percent} tone="amber" />
        <KpiCard label="Conversions" value={stats.conversions.toLocaleString("en-IN")} icon={TrendingUp} tone="violet" />
      </div>

      {rows === null ? <Skeleton rows={4} /> : rows.length === 0 ? (
        <EmptyState icon={Images} title="No banners yet" hint="Create your first promotional banner." action={<BtnPrimary onClick={openNew}><Plus className="h-4 w-4" /> Create Banner</BtnPrimary>} />
      ) : (
        <div>
          <p className="text-xs text-slate-400 mb-3 flex items-center gap-1"><GripVertical className="h-3.5 w-3.5" /> Drag cards to reorder how banners appear to customers</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((b) => (
              <div key={b.id} draggable onDragStart={() => setDragId(b.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(b.id)}
                className={`group ${dragId === b.id ? "opacity-50" : ""}`} data-testid={`banner-card-${b.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="relative h-32 bg-slate-100 dark:bg-slate-800">
                    <img src={b.desktop_image || b.image || b.mobile_image || "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="} alt="" className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="h-7 w-7 grid place-items-center rounded-lg bg-black/40 text-white cursor-grab"><GripVertical className="h-4 w-4" /></span>
                      <Badge status={b.status === "active" ? "active" : "inactive"} />
                    </div>
                    <span className="absolute top-2 right-2 text-[10px] font-semibold bg-black/45 text-white px-2 py-0.5 rounded-full">#{(b.order ?? 0) + 1}</span>
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{b.title}</p>
                    <p className="text-xs text-slate-400 truncate">{b.subtitle}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize">{(b.position || "home_hero").replace("_", " ")}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">P{b.priority || 1}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                      <span>{(b.clicks || 0).toLocaleString("en-IN")} clicks</span>
                      <span>CTR {b.ctr || 0}%</span>
                      <span>{b.conversions || 0} conv</span>
                    </div>
                    <div className="flex items-center gap-1 mt-3 border-t border-slate-100 dark:border-slate-800 pt-2">
                      <IconBtn title="Edit" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Duplicate" onClick={() => duplicate(b)}><Copy className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Preview" onClick={() => setPreview(b)}><Eye className="h-4 w-4" /></IconBtn>
                      <IconBtn title={b.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggle(b)}><Power className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Delete" danger onClick={() => remove(b)}><Trash2 className="h-4 w-4" /></IconBtn>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setPreview(null)} data-testid="banner-preview-modal">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl">
            <DevicePreview banner={preview} />
          </div>
        </div>
      )}
    </div>
  );
}

const IconBtn = ({ children, title, danger, ...rest }) => (
  <button {...rest} title={title}
    className={`h-8 w-8 grid place-items-center rounded-lg transition ${danger ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
    {children}
  </button>
);
