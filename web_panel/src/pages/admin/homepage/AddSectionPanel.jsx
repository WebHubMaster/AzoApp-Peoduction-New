import { useState } from "react";
import { Plus, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SECTION_TYPES, hasLimit, typeHasConfig, SectionConfig } from "@/pages/admin/adminSectionsPro";
import TypePicker from "./TypePicker";
import { metaOf } from "./meta";

export const L = ({ label, htmlFor, children, hint }) => (
  <div className="min-w-0">
    <label htmlFor={htmlFor} className="block text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[12px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

export default function AddSectionPanel({ onAdd, services, cats }) {
  const [add, setAdd] = useState({ type: "featured_services", title: "", subtitle: "", limit: 8, config: {} });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await onAdd(add);
    setBusy(false);
    if (ok) setAdd({ type: add.type, title: "", subtitle: "", limit: 8, config: {} });
  };
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 lg:sticky lg:top-[88px]" data-testid="hp-add-panel">
      <div className="px-4 pt-4 pb-3 border-b border-[#F1F2F4] dark:border-slate-800">
        <h2 className="text-[16px] font-semibold text-[#111827] dark:text-white">Add Section</h2>
        <p className="text-[12.5px] text-[#6B7280]">Choose a section to add to your homepage.</p>
      </div>
      <div className="p-4 space-y-3.5">
        <L label="Section Type"><TypePicker value={add.type} types={SECTION_TYPES} onChange={(t) => setAdd({ ...add, type: t, config: {} })} /></L>
        <p className="-mt-2 text-[12px] text-slate-400">{metaOf(add.type).desc}</p>
        <L label="Title" htmlFor="hp-add-title"><Input id="hp-add-title" data-testid="hp-add-title" className="h-10 rounded-lg" placeholder={metaOf(add.type).label} value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></L>
        <L label="Subtitle / Eyebrow" htmlFor="hp-add-subtitle"><Input id="hp-add-subtitle" data-testid="hp-add-subtitle" className="h-10 rounded-lg" placeholder="e.g. HANDPICKED" value={add.subtitle} onChange={(e) => setAdd({ ...add, subtitle: e.target.value })} /></L>
        {hasLimit(add.type) && <L label="Item Limit" htmlFor="hp-add-limit"><Input id="hp-add-limit" type="number" min="1" data-testid="hp-add-limit" className="h-10 rounded-lg w-28" value={add.limit} onChange={(e) => setAdd({ ...add, limit: e.target.value })} /></L>}
        {typeHasConfig(add.type) && <div className="space-y-3 rounded-lg border border-[#F1F2F4] dark:border-slate-800 bg-[#F9FAFB] dark:bg-slate-800/40 p-3"><SectionConfig type={add.type} config={add.config} onChange={(c) => setAdd({ ...add, config: c })} services={services} cats={cats} /></div>}
        <Button onClick={submit} disabled={busy} data-testid="hp-add-submit" className="w-full h-10 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Add Section</>}
        </Button>
        <p className="flex items-center gap-1.5 text-[12px] text-slate-400"><Info className="h-3.5 w-3.5" /> Configure the section after adding it. New sections are added at the end, enabled.</p>
      </div>
    </section>
  );
}
