import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { hasLimit, typeHasConfig, SectionConfig } from "@/pages/admin/adminSectionsPro";
import { metaOf, AUTO_SOURCE } from "./meta";
import { StatusPill } from "./SectionCard";
import MiniPreview from "./MiniPreview";
import { L } from "./AddSectionPanel";

export default function SectionDrawer({ s, services, cats, onClose, onSave }) {
  const [f, setF] = useState({ title: s.title || "", subtitle: s.subtitle || "", enabled: !!s.enabled, config: { ...(s.config || {}) } });
  const [busy, setBusy] = useState(false);
  const m = metaOf(s.type);
  const save = async () => { setBusy(true); const ok = await onSave(f); if (!ok) setBusy(false); };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] p-0 flex flex-col gap-0 text-[14px]" data-testid="hp-drawer">
        <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] dark:border-slate-800 text-left space-y-0.5">
          <SheetTitle className="text-[17px] font-semibold text-[#111827] dark:text-white">Edit {m.label}</SheetTitle>
          <SheetDescription className="text-[12.5px] text-[#6B7280]">{m.desc}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <MiniPreview s={{ ...s, ...f }} className="h-24 w-full" />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Status</span>
            <StatusPill on={f.enabled} onToggle={() => setF({ ...f, enabled: !f.enabled })} tid="hp-drawer-status" />
          </div>
          <L label="Title" htmlFor="hp-d-title"><Input id="hp-d-title" className="h-10 rounded-lg" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="hp-drawer-title" /></L>
          <L label="Subtitle / Eyebrow" htmlFor="hp-d-sub"><Input id="hp-d-sub" className="h-10 rounded-lg" value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} data-testid="hp-drawer-subtitle" /></L>
          {hasLimit(s.type) && <L label="Item Limit" htmlFor="hp-d-lim" hint="Maximum number of items shown in this section."><Input id="hp-d-lim" type="number" min="1" className="h-10 rounded-lg w-28" value={f.config.limit ?? 8} onChange={(e) => setF({ ...f, config: { ...f.config, limit: Number(e.target.value) } })} data-testid="hp-drawer-limit" /></L>}
          {typeHasConfig(s.type)
            ? <div className="space-y-3 rounded-lg border border-[#F1F2F4] dark:border-slate-800 bg-[#F9FAFB] dark:bg-slate-800/40 p-3"><p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Section content</p><SectionConfig type={s.type} config={f.config} onChange={(c) => setF({ ...f, config: { ...f.config, ...c } })} services={services} cats={cats} /></div>
            : AUTO_SOURCE[s.type] && <p className="rounded-lg border border-blue-100 bg-blue-50/60 dark:bg-blue-900/10 dark:border-blue-900/30 px-3 py-2 text-[12.5px] text-[#1E3A8A] dark:text-blue-200">{AUTO_SOURCE[s.type]}</p>}
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] dark:border-slate-800 flex justify-end gap-2">
          <Button variant="outline" className="h-9 text-[13.5px]" onClick={onClose} data-testid="hp-drawer-cancel">Cancel</Button>
          <Button className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none min-w-[120px]" onClick={save} disabled={busy} data-testid="hp-drawer-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Section"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
