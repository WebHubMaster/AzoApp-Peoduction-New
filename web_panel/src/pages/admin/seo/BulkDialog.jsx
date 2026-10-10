import { useState } from "react";
import { toast } from "sonner";
import { X, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { Btn, Field, inputCls, areaCls, Select, errMsg } from "./seoUi";

export default function BulkDialog({ keys, onClose, onDone }) {
  const [ch, setCh] = useState({ title_template: "", description_template: "", robots: "", og_image: "", clear_overrides: false });
  const [prev, setPrev] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmNoindex, setConfirmNoindex] = useState(false);
  const set = (k) => (e) => setCh((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const preview = async () => {
    setBusy(true);
    try { const { data } = await api.post("/admin/seo/bulk/preview", { keys, changes: ch }); setPrev(data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/seo/bulk/apply", { keys, changes: ch, confirm: true, confirm_noindex: confirmNoindex });
      toast.success(`Updated ${data.updated} page(s)${data.errors.length ? ` · ${data.errors.length} failed` : ""}`); onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/40 flex items-center justify-center p-4" data-testid="bulk-dialog">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"><div><p className="font-semibold text-slate-900">Bulk SEO edit</p><p className="text-xs text-slate-500">{keys.length} selected · preview before applying</p></div>
          <button onClick={onClose} data-testid="bulk-close" className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center"><X className="h-4 w-4" /></button></div>
        <div className="p-5 overflow-y-auto space-y-4">
          {!prev ? (
            <div className="grid md:grid-cols-2 gap-4">
              <Field className="md:col-span-2" label="Title template" hint="Tokens: {name} {category} {city} {site_name}. Leave empty to keep."><input data-testid="bulk-title" className={inputCls} value={ch.title_template} onChange={set("title_template")} placeholder="{name} at home in {city}" /></Field>
              <Field className="md:col-span-2" label="Description template"><textarea data-testid="bulk-description" className={areaCls} value={ch.description_template} onChange={set("description_template")} /></Field>
              <Field label="Robots"><Select testId="bulk-robots" value={ch.robots} onChange={set("robots")} options={[{ value: "", label: "Keep current" }, { value: "index,follow", label: "index, follow" }, { value: "noindex,follow", label: "noindex, follow" }]} /></Field>
              <Field label="Share image URL"><input data-testid="bulk-og-image" className={inputCls} value={ch.og_image} onChange={set("og_image")} /></Field>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" data-testid="bulk-clear" checked={ch.clear_overrides} onChange={set("clear_overrides")} />Clear custom title & description (revert to inherited defaults)</label>
            </div>
          ) : (
            <div data-testid="bulk-preview">
              {prev.removes_indexing > 0 && (
                <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 p-3 mb-3 text-sm text-rose-700 flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5" /><div>
                  <p className="font-semibold">{prev.removes_indexing} indexable page(s) will be removed from search results.</p>
                  <label className="flex items-center gap-2 mt-1"><input type="checkbox" checked={confirmNoindex} onChange={(e) => setConfirmNoindex(e.target.checked)} data-testid="bulk-confirm-noindex" />I understand and want to add noindex</label></div></div>
              )}
              <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {prev.items.map((it) => (
                  <div key={it.key} className="p-3 text-sm">
                    <p className="font-medium text-slate-800">{it.name}</p>
                    {it.skipped ? <p className="text-xs text-slate-500">Skipped — {it.reason}</p> : (
                      <div className="grid md:grid-cols-2 gap-2 mt-1 text-xs">
                        <div className="text-slate-500"><p className="line-through">{it.before.title}</p><p className="line-clamp-1">{it.before.robots}</p></div>
                        <div className="text-slate-800"><p className="font-medium">{it.after.title}</p><p className="line-clamp-1">{it.after.robots}</p></div>
                        {it.warnings.length > 0 && <p className="md:col-span-2 text-amber-700">{it.warnings.join(" · ")}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          {prev && <Btn variant="outline" onClick={() => setPrev(null)} data-testid="bulk-back">Back</Btn>}
          {!prev ? <Btn loading={busy} onClick={preview} data-testid="bulk-preview-btn">Preview changes</Btn>
            : <Btn loading={busy} disabled={!prev.count || (prev.removes_indexing > 0 && !confirmNoindex)} onClick={apply} data-testid="bulk-apply">Apply to {prev.count} page(s)</Btn>}
        </div>
      </div>
    </div>
  );
}
