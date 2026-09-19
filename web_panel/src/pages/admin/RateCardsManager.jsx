import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import {
  Plus, Trash2, Pencil, ChevronUp, ChevronDown, GripVertical, Search, X,
  Eye, Save, IndianRupee, Layers, ArrowLeft, ChevronRight, Percent,
} from "lucide-react";
import { RateCardModal } from "@/components/RateCardModal";

const uid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2));
const ACCENTS = ["#0D47A1", "#7C3AED", "#0D9488", "#DB2777", "#EA580C", "#059669", "#0284C7"];

const emptyRow = () => ({ id: uid(), description: "", service_charge: "", labour_charge: "", original_charge: "", warranty: "", note: "", discount_pct: "", discount_until: "" });
const emptyGroup = () => ({ id: uid(), name: "", note: "", rows: [emptyRow()] });
const emptyCard = (category_id = "") => ({
  category_id, title: "Standard rate card", subtitle: "Transparent, fixed prices — no surprises",
  brand_label: "AzoCover", accent_color: "#0D47A1", intro: "", footer_note: "",
  status: "active", groups: [emptyGroup()],
});

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ============ BUILDER ============ */
function Builder({ initial, categories, onDone, onCancel }) {
  const [card, setCard] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [q, setQ] = useState("");
  const [openGroups, setOpenGroups] = useState(() => new Set((initial.groups || []).map((g) => g.id)));

  const set = (k, v) => setCard((p) => ({ ...p, [k]: v }));
  const setGroups = (fn) => setCard((p) => ({ ...p, groups: fn(p.groups) }));
  const toggleGroup = (id) => setOpenGroups((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addGroup = () => { const g = emptyGroup(); setGroups((gs) => [...gs, g]); setOpenGroups((s) => new Set(s).add(g.id)); };
  const removeGroup = (gid) => setGroups((gs) => gs.filter((g) => g.id !== gid));
  const moveGroup = (idx, dir) => setGroups((gs) => {
    const n = [...gs]; const j = idx + dir; if (j < 0 || j >= n.length) return gs;
    [n[idx], n[j]] = [n[j], n[idx]]; return n;
  });
  const setGroupField = (gid, k, v) => setGroups((gs) => gs.map((g) => g.id === gid ? { ...g, [k]: v } : g));

  const addRow = (gid) => setGroups((gs) => gs.map((g) => g.id === gid ? { ...g, rows: [...g.rows, emptyRow()] } : g));
  const removeRow = (gid, rid) => setGroups((gs) => gs.map((g) => g.id === gid ? { ...g, rows: g.rows.filter((r) => r.id !== rid) } : g));
  const moveRow = (gid, idx, dir) => setGroups((gs) => gs.map((g) => {
    if (g.id !== gid) return g;
    const rows = [...g.rows]; const j = idx + dir; if (j < 0 || j >= rows.length) return g;
    [rows[idx], rows[j]] = [rows[j], rows[idx]]; return { ...g, rows };
  }));
  const setRowField = (gid, rid, k, v) => setGroups((gs) => gs.map((g) => g.id === gid
    ? { ...g, rows: g.rows.map((r) => r.id === rid ? { ...r, [k]: v } : r) } : g));

  const totalRows = card.groups.reduce((a, g) => a + g.rows.length, 0);

  const previewCard = useMemo(() => ({
    ...card,
    groups: card.groups.map((g, gi) => ({ ...g, order: gi, rows: g.rows.map((r, ri) => ({ ...r, order: ri })) })),
    category_name: (categories.find((c) => c.id === card.category_id) || {}).name || "",
  }), [card, categories]);

  const save = async () => {
    if (!card.category_id) { toast.error("Please pick a category"); return; }
    const clean = card.groups
      .map((g) => ({ ...g, name: g.name.trim(), rows: g.rows.filter((r) => r.description.trim() || r.service_charge) }))
      .filter((g) => g.name || g.rows.length);
    if (!clean.length) { toast.error("Add at least one group with a row"); return; }
    setSaving(true);
    try {
      const payload = { ...card, groups: clean };
      if (card.id) await api.put(`/ratecards/${card.id}`, payload);
      else await api.post("/ratecards", payload);
      toast.success(card.id ? "Rate card updated" : "Rate card created");
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const catName = (categories.find((c) => c.id === card.category_id) || {}).name || "Select category";

  return (
    <div>
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back to list
        </button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}><Eye className="h-4 w-4 mr-1" /> Preview</Button>
          <Button onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800"><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save rate card"}</Button>
        </div>
      </div>

      {/* card meta */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Category *">
            {card.id ? (
              <Input value={catName} disabled />
            ) : (
              <Select value={card.category_id} onValueChange={(v) => set("category_id", v)}>
                <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={c._hasCard}>
                      {c.name}{c._hasCard ? " (has card)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Title"><Input value={card.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Brand chip label"><Input value={card.brand_label} onChange={(e) => set("brand_label", e.target.value)} /></Field>
          <Field label="Subtitle" className="sm:col-span-2"><Input value={card.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></Field>
          <Field label="Accent colour">
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENTS.map((c) => (
                <button key={c} type="button" onClick={() => set("accent_color", c)}
                  className={`h-8 w-8 rounded-full border-2 ${card.accent_color === c ? "border-slate-900 scale-110" : "border-white shadow"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </Field>
          <Field label="Intro line (top of card)" className="sm:col-span-2 lg:col-span-2">
            <Textarea rows={2} value={card.intro} onChange={(e) => set("intro", e.target.value)} placeholder="e.g. Spare-part prices are indicative and confirmed after inspection." />
          </Field>
          <Field label="Footer note (terms)" className="sm:col-span-2 lg:col-span-1">
            <Textarea rows={2} value={card.footer_note} onChange={(e) => set("footer_note", e.target.value)} placeholder="e.g. Prices may vary by brand & city." />
          </Field>
          <div className="flex items-center gap-2">
            <Switch checked={card.status === "active"} onCheckedChange={(v) => set("status", v ? "active" : "inactive")} />
            <span className="text-sm text-slate-600">{card.status === "active" ? "Live on website" : "Hidden"}</span>
          </div>
        </div>
      </div>

      {/* builder toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <Layers className="h-4 w-4" /> {card.groups.length} groups · {totalRows} items
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter items while editing…" className="pl-9" />
          {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      {/* groups */}
      <div className="space-y-4">
        {card.groups.map((g, gi) => {
          const rows = q.trim()
            ? g.rows.filter((r) => (r.description || "").toLowerCase().includes(q.toLowerCase()))
            : g.rows;
          if (q.trim() && rows.length === 0 && !(g.name || "").toLowerCase().includes(q.toLowerCase())) return null;
          const isOpen = q.trim() ? true : openGroups.has(g.id);
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <GripVertical className="h-4 w-4 text-slate-300" />
                <button onClick={() => toggleGroup(g.id)} className="text-slate-500 hover:text-slate-800">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Input value={g.name} onChange={(e) => setGroupField(g.id, "name", e.target.value)}
                  placeholder="Group name (e.g. Electrical Parts)" className="font-semibold max-w-xs" />
                <Input value={g.note} onChange={(e) => setGroupField(g.id, "note", e.target.value)}
                  placeholder="Group note (optional)" className="flex-1 min-w-[120px]" />
                <span className="text-[11px] text-slate-400 shrink-0">{g.rows.length} rows</span>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moveGroup(gi, -1)} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><ChevronUp className="h-4 w-4" /></button>
                  <button onClick={() => moveGroup(gi, 1)} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><ChevronDown className="h-4 w-4" /></button>
                  <button onClick={() => removeGroup(g.id)} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              {isOpen && (
                <div className="p-4 space-y-3">
                  {rows.map((r) => {
                    const ri = g.rows.findIndex((x) => x.id === r.id);
                    return (
                      <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            <Input value={r.description} onChange={(e) => setRowField(g.id, r.id, "description", e.target.value)}
                              placeholder="Description (e.g. Inverter PCB repaired)" />
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              <div className="relative">
                                <IndianRupee className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <Input value={r.service_charge} onChange={(e) => setRowField(g.id, r.id, "service_charge", e.target.value)} placeholder="Service" className="pl-7" />
                              </div>
                              <div className="relative">
                                <IndianRupee className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <Input value={r.labour_charge} onChange={(e) => setRowField(g.id, r.id, "labour_charge", e.target.value)} placeholder="Labour" className="pl-7" />
                              </div>
                              <div className="relative">
                                <IndianRupee className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <Input value={r.original_charge} onChange={(e) => setRowField(g.id, r.id, "original_charge", e.target.value)} placeholder="MRP" className="pl-7" />
                              </div>
                              <Input value={r.warranty} onChange={(e) => setRowField(g.id, r.id, "warranty", e.target.value)} placeholder="Warranty" />
                              <Input value={r.note} onChange={(e) => setRowField(g.id, r.id, "note", e.target.value)} placeholder="Note" />
                            </div>
                            {/* Limited-time discount */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center pt-1">
                              <div className="relative">
                                <Percent className="h-3.5 w-3.5 text-rose-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <Input type="number" min="0" max="95" value={r.discount_pct ?? ""} onChange={(e) => setRowField(g.id, r.id, "discount_pct", e.target.value)} placeholder="% off" className="pl-7" data-testid={`rc-discount-pct-${r.id}`} />
                              </div>
                              <div className="sm:col-span-2">
                                <PremiumDatePicker value={r.discount_until || ""} onChange={(e) => setRowField(g.id, r.id, "discount_until", e.target.value)} placeholder="No expiry" data-testid={`rc-discount-until-${r.id}`} className="rounded-lg" />
                              </div>
                              <div className="sm:col-span-2 text-[11px] leading-tight">
                                {Number(r.discount_pct) > 0 && Number(r.service_charge) > 0 ? (
                                  <span className="text-slate-500">
                                    Customer pays{" "}
                                    <span className="line-through text-slate-400">₹{Number(r.service_charge).toLocaleString("en-IN")}</span>{" "}
                                    <span className="font-bold text-rose-600">₹{Math.round(Number(r.service_charge) * (1 - Number(r.discount_pct) / 100)).toLocaleString("en-IN")}</span>
                                    {r.discount_until ? <span className="text-slate-400"> · till {r.discount_until}</span> : <span className="text-slate-400"> · no expiry</span>}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">Optional limited-time % off</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => moveRow(g.id, ri, -1)} className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><ChevronUp className="h-3.5 w-3.5" /></button>
                            <button onClick={() => moveRow(g.id, ri, 1)} className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><ChevronDown className="h-3.5 w-3.5" /></button>
                            <button onClick={() => removeRow(g.id, r.id)} className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => addRow(g.id)}><Plus className="h-4 w-4 mr-1" /> Add row</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="outline" onClick={addGroup} className="mt-4"><Plus className="h-4 w-4 mr-1" /> Add group</Button>

      {preview && <RateCardModal card={previewCard} onClose={() => setPreview(false)} />}
    </div>
  );
}

/* ============ LIST + ROOT ============ */
export default function RateCardsManager() {
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // card object being built

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, catRes] = await Promise.all([
        api.get("/ratecards/admin"),
        api.get("/catalog/admin/categories"),
      ]);
      const list = cRes.data || [];
      setCards(list);
      const usedCat = new Set(list.map((x) => x.category_id));
      setCategories((catRes.data || []).map((c) => ({ ...c, _hasCard: usedCat.has(c.id) })));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => setEditing(emptyCard());
  const openEdit = async (id) => {
    try { const r = await api.get(`/ratecards/admin/${id}`); setEditing(r.data); }
    catch { toast.error("Could not open"); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this rate card?")) return;
    try { await api.delete(`/ratecards/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  if (editing) {
    return <Builder initial={editing} categories={categories} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading font-bold text-2xl text-slate-900 flex items-center gap-2">
            <IndianRupee className="h-6 w-6 text-primary-700" /> Rate Cards
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Build category-wise “Standard rate card” tables shown on every service page.</p>
        </div>
        <Button onClick={openNew} className="bg-primary-700 hover:bg-primary-800"><Plus className="h-4 w-4 mr-1" /> Create rate card</Button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm py-10 text-center">Loading…</p>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <IndianRupee className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No rate cards yet. Create one for a category — it’ll appear on all its service pages.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{c.category_name || "—"}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{c.title}</p>
                </div>
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.status === "active" ? "Live" : "Hidden"}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-4 text-sm">
                <span className="inline-flex items-center gap-1 text-slate-600"><Layers className="h-4 w-4 text-primary-600" /> {c.group_count} groups</span>
                <span className="inline-flex items-center gap-1 text-slate-600"><GripVertical className="h-4 w-4 text-primary-600" /> {c.row_count} items</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => openEdit(c.id)} className="flex-1"><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                <Button size="sm" variant="outline" onClick={() => del(c.id)} className="text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
