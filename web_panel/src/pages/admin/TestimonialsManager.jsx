import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Star, GripVertical, Search, X, MessageSquareQuote } from "lucide-react";
import TestimonialCard, { TESTIMONIAL_THEMES, THEME_KEYS } from "@/components/TestimonialCard";

const EMPTY = { title: "", text: "", name: "", city: "", service: "", rating: 5, theme: "rose", order: 0, status: "active", avatar: "", photo: "" };

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

/* ---- add / edit form with live preview ---- */
function TestimonialForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim() || !f.text.trim() || !f.name.trim()) {
      toast.error("Title, review text and name are required");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...f, rating: Number(f.rating) || 5, order: Number(f.order) || 0 };
      if (f.id) await api.put(`/admin/testimonials/${f.id}`, payload);
      else await api.post("/admin/testimonials", payload);
      toast.success(f.id ? "Testimonial updated" : "Testimonial added");
      onSave();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* form */}
      <div className="space-y-4">
        <Field label="Heading / Title *">
          <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Very time convenient!" />
        </Field>
        <Field label="Review text *">
          <Textarea rows={4} value={f.text} onChange={(e) => set("text", e.target.value)} placeholder="What the customer loved…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer name *">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Priyanka" />
          </Field>
          <Field label="City (optional)">
            <Input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Delhi" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service tag (optional)">
            <Input value={f.service} onChange={(e) => set("service", e.target.value)} placeholder="AC repair" />
          </Field>
          <Field label="Avatar image URL (optional)">
            <Input value={f.avatar} onChange={(e) => set("avatar", e.target.value)} placeholder="https://…" />
          </Field>
        </div>

        <Field label="Customer / service photo (optional)" hint="Recommended: square image ≥ 600×600px (JP/PNG/WebP, up to 12MB). Shown prominently on the review card for extra trust.">
          <div className="flex items-center gap-3">
            {f.photo
              ? <img src={f.photo} alt="testimonial" className="h-16 w-16 rounded-xl object-cover border border-slate-200" />
              : <div className="h-16 w-16 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px] text-center px-1">No photo</div>}
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-primary-700 border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-50 w-fit">
                <input type="file" accept="image/*" className="hidden" data-testid="testimonial-photo-input"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("folder", "testimonials");
                    try {
                      setUploading(true);
                      const { data } = await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
                      set("photo", data.url);
                      toast.success("Photo uploaded");
                    } catch (err) {
                      toast.error(err?.response?.data?.detail || "Upload failed");
                    } finally { setUploading(false); }
                  }} />
                {uploading ? "Uploading…" : (f.photo ? "Change photo" : "Choose photo")}
              </label>
              {f.photo && <button type="button" onClick={() => set("photo", "")} className="text-xs text-red-600 hover:underline w-fit">Remove photo</button>}
            </div>
          </div>
        </Field>

        {/* rating */}
        <Field label={`Rating — ${Number(f.rating).toFixed(1)}`}>
          <div className="flex items-center gap-3">
            <input type="range" min="1" max="5" step="0.1" value={f.rating}
              onChange={(e) => set("rating", e.target.value)} className="flex-1 accent-amber-500" />
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-4 w-4 ${i < Math.floor(f.rating) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
              ))}
            </div>
          </div>
        </Field>

        {/* theme picker */}
        <Field label="Colour theme">
          <div className="flex flex-wrap gap-2">
            {THEME_KEYS.map((k) => {
              const th = TESTIMONIAL_THEMES[k];
              const sel = f.theme === k;
              return (
                <button key={k} type="button" onClick={() => set("theme", k)}
                  className={`h-9 w-9 rounded-full border-2 transition ${sel ? "border-slate-900 scale-110" : "border-white shadow"}`}
                  style={{ background: th.dot }} title={th.label} />
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Display order" hint="Lower shows first">
            <Input type="number" value={f.order} onChange={(e) => set("order", e.target.value)} />
          </Field>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={f.status === "active"} onCheckedChange={(v) => set("status", v ? "active" : "inactive")} />
            <span className="text-sm text-slate-600">{f.status === "active" ? "Visible on website" : "Hidden"}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800">{saving ? "Saving…" : (f.id ? "Update" : "Add testimonial")}</Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      {/* live preview */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">Live preview</p>
        <TestimonialCard t={f} className="max-w-sm shadow-lg" />
        <p className="text-[11px] text-slate-400 mt-3">This is exactly how it appears in the “What our customers say” carousel on the homepage.</p>
      </div>
    </div>
  );
}

export default function TestimonialsManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // object being edited OR "new"
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/testimonials")
      .then((r) => setRows((r.data || []).sort((a, b) => (a.order || 0) - (b.order || 0))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm("Delete this testimonial?")) return;
    try { await api.delete(`/admin/testimonials/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };
  const toggle = async (t) => {
    try { await api.put(`/admin/testimonials/${t.id}`, { status: t.status === "active" ? "inactive" : "active" }); load(); }
    catch { toast.error("Update failed"); }
  };

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [r.title, r.text, r.name, r.city, r.service].some((v) => (v || "").toLowerCase().includes(s));
  });

  return (
    <div>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading font-bold text-2xl text-slate-900 flex items-center gap-2">
            <MessageSquareQuote className="h-6 w-6 text-primary-700" /> Testimonials
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Create colourful customer reviews shown on the homepage carousel.</p>
        </div>
        {!editing && (
          <Button onClick={() => setEditing("new")} className="bg-primary-700 hover:bg-primary-800">
            <Plus className="h-4 w-4 mr-1" /> Add testimonial
          </Button>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <TestimonialForm
            initial={editing === "new" ? null : editing}
            onSave={() => { setEditing(null); load(); }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : (
        <>
          {/* search */}
          <div className="relative mb-4 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search testimonials…" className="pl-9" />
            {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm py-10 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
              <MessageSquareQuote className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No testimonials yet. Click “Add testimonial” to create your first colourful review.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <div key={t.id} className={`relative group ${t.status !== "active" ? "opacity-60" : ""}`}>
                  <TestimonialCard t={t} />
                  {/* order badge */}
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold bg-white/90 text-slate-500 rounded-full px-2 py-0.5 border border-slate-200">
                    <GripVertical className="h-3 w-3" /> #{t.order ?? 0}
                  </span>
                  {/* actions */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => toggle(t)} title={t.status === "active" ? "Hide" : "Show"} className="h-8 px-2 rounded-lg bg-white shadow border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                      {t.status === "active" ? "Hide" : "Show"}
                    </button>
                    <button onClick={() => setEditing(t)} className="h-8 w-8 rounded-lg bg-white shadow border border-slate-200 flex items-center justify-center text-primary-600 hover:bg-primary-50"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(t.id)} className="h-8 w-8 rounded-lg bg-white shadow border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
