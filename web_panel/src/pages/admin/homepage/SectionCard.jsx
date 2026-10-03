import { GripVertical, MoreVertical, Pencil, Eye, Copy, ArrowUp, ArrowDown, EyeOff, Trash2, ChevronDown, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasLimit, typeHasConfig } from "@/pages/admin/adminSectionsPro";
import MiniPreview from "./MiniPreview";
import { metaOf, AUTO_SOURCE } from "./meta";
import { L } from "./AddSectionPanel";

export function StatusPill({ on, onToggle, tid, compact }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={on ? "Active — click to disable" : "Disabled — click to enable"} onClick={onToggle} data-testid={tid}
      className={`inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2.5 rounded-full text-[12px] font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${on ? "bg-green-50 border-green-200 text-[#15803D] dark:bg-green-900/20 dark:border-green-900/40" : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700"}`}>
      <span className={`flex items-center h-4 w-7 p-0.5 rounded-full transition-colors ${on ? "bg-[#16A34A]" : "bg-slate-300 dark:bg-slate-600"}`}>
        <span className={`block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? "translate-x-3" : "translate-x-0"}`} />
      </span>
      <span className={compact ? "hidden sm:inline" : ""}>{on ? "Active" : "Disabled"}</span>
    </button>
  );
}

const IconBtn = ({ label, children, ...p }) => (
  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={label} className="h-8 w-8 text-slate-500 hover:text-[#111827]" {...p}>{children}</Button></TooltipTrigger><TooltipContent className="text-xs">{label}</TooltipContent></Tooltip>
);

function configSummary(s, services, cats) {
  const c = s.config || {};
  if (c.service_ids?.length) return `${c.service_ids.length} service${c.service_ids.length > 1 ? "s" : ""} selected: ${c.service_ids.slice(0, 3).map((id) => services.find((x) => x.id === id)?.name || "—").join(", ")}${c.service_ids.length > 3 ? "…" : ""}`;
  if (c.category_id) return `Category: ${cats.find((x) => x.id === c.category_id)?.name || c.category_id}`;
  if (s.type === "promo_banner") return c.image ? `Banner image set${c.link ? ` · links to ${c.link}` : ""}` : "No banner image yet";
  if (s.type === "video") return c.video ? "Video set" : "No video yet";
  return AUTO_SOURCE[s.type] || "";
}

export default function SectionCard({ s, i, total, expanded, dirty, canDrag, drag, services, cats, onToggleExpand, onChange, onEdit, onPreview, onDuplicate, onMove, onDelete }) {
  const m = metaOf(s.type); const Icon = m.icon;
  const lim = s.config?.limit ?? 8;
  const isOver = drag.overId === s.id && drag.dragId !== s.id;
  return (
    <div
      onDragOver={(e) => { if (drag.dragId) { e.preventDefault(); drag.over(s.id); } }}
      onDrop={(e) => { e.preventDefault(); drag.drop(); }}
      className={`relative group rounded-xl border bg-white dark:bg-slate-900 transition-[box-shadow,border-color,opacity,transform] duration-150 ${drag.dragId === s.id ? "opacity-60 scale-[0.995] shadow-lg" : "hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.18)]"} ${dirty ? "border-amber-300 dark:border-amber-700" : "border-[#E5E7EB] dark:border-slate-800"}`}
      data-testid={`hp-section-${i}`}>
      {isOver && <span className={`absolute left-2 right-2 h-0.5 rounded bg-[#2563EB] ${drag.after ? "-bottom-[7px]" : "-top-[7px]"}`} data-testid="hp-drop-indicator" />}
      <div className="flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-2.5">
        <span draggable={canDrag} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; drag.start(s.id); }} onDragEnd={drag.end}
          className={`p-1 rounded text-slate-300 ${canDrag ? "cursor-grab active:cursor-grabbing hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" : "opacity-40 cursor-not-allowed"}`}
          title={canDrag ? "Drag to reorder" : "Clear search, filter & sort to reorder"} aria-label="Drag handle" data-testid={`hp-drag-${i}`}><GripVertical className="h-4 w-4" /></span>
        <MiniPreview s={s} className="h-11 w-[72px] shrink-0 hidden sm:block" />
        <button type="button" onClick={onToggleExpand} className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 rounded" aria-expanded={expanded} data-testid={`hp-expand-${i}`}>
          <span className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-[#0D47A1] shrink-0" />
            <span className="text-[14px] font-semibold text-[#111827] dark:text-white truncate">{m.label}</span>
            <span className="text-[11px] text-slate-400 tabular-nums">#{i + 1}</span>
            {dirty && <span className="text-[10.5px] font-semibold text-[#B45309] bg-amber-50 dark:bg-amber-900/20 rounded px-1.5 py-px" data-testid={`hp-dirty-${i}`}>Edited</span>}
          </span>
          <span className="block text-[12.5px] text-[#6B7280] truncate mt-0.5">
            Title: <span className="text-slate-700 dark:text-slate-300" data-testid={`hp-title-text-${i}`}>{s.title || <i className="text-slate-400">untitled</i>}</span>
            {s.subtitle ? <> · {s.subtitle}</> : null}
            {hasLimit(s.type) && <> · Items: <span className="tabular-nums">{lim}</span></>}
          </span>
        </button>
        <StatusPill compact on={!!s.enabled} onToggle={() => onChange({ enabled: !s.enabled })} tid={`hp-toggle-${i}`} />
        <IconBtn label={expanded ? "Collapse" : "Expand"} onClick={onToggleExpand} className="h-8 w-8 text-slate-500 hover:text-[#111827] hidden sm:inline-flex"><ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} /></IconBtn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Section actions" className="h-8 w-8 text-slate-500" data-testid={`hp-menu-${i}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 text-[13px]">
            <DropdownMenuItem onSelect={onEdit} data-testid={`hp-menu-edit-${i}`}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={onPreview}><Eye className="h-3.5 w-3.5 mr-2" /> Preview</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate} data-testid={`hp-menu-duplicate-${i}`}><Copy className="h-3.5 w-3.5 mr-2" /> Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={i === 0 || !canDrag} onSelect={() => onMove(-1)} data-testid={`hp-menu-up-${i}`}><ArrowUp className="h-3.5 w-3.5 mr-2" /> Move Up</DropdownMenuItem>
            <DropdownMenuItem disabled={i === total - 1 || !canDrag} onSelect={() => onMove(1)} data-testid={`hp-menu-down-${i}`}><ArrowDown className="h-3.5 w-3.5 mr-2" /> Move Down</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onChange({ enabled: !s.enabled })}>{s.enabled ? <><EyeOff className="h-3.5 w-3.5 mr-2" /> Disable</> : <><Power className="h-3.5 w-3.5 mr-2" /> Enable</>}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-[#DC2626] focus:text-[#DC2626]" data-testid={`hp-del-${i}`}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-[#F1F2F4] dark:border-slate-800 px-4 py-3.5 space-y-3" data-testid={`hp-body-${i}`}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_110px] gap-3">
              <L label="Title"><Input className="h-10 rounded-lg" placeholder="Title" value={s.title || ""} onChange={(e) => onChange({ title: e.target.value })} data-testid={`hp-title-${i}`} tabIndex={expanded ? 0 : -1} /></L>
              <L label="Subtitle / Eyebrow"><Input className="h-10 rounded-lg" placeholder="Subtitle" value={s.subtitle || ""} onChange={(e) => onChange({ subtitle: e.target.value })} data-testid={`hp-subtitle-${i}`} tabIndex={expanded ? 0 : -1} /></L>
              {hasLimit(s.type) && <L label="Item Limit"><Input type="number" min="1" className="h-10 rounded-lg" value={lim} onChange={(e) => onChange({ config: { ...(s.config || {}), limit: Number(e.target.value) } })} data-testid={`hp-limit-${i}`} tabIndex={expanded ? 0 : -1} /></L>}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <p className="text-[12.5px] text-slate-500 truncate">{configSummary(s, services, cats)}{typeHasConfig(s.type) && " — use Edit for full configuration."}</p>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" className="h-8 text-[13px]" onClick={onEdit} data-testid={`hp-edit-${i}`} tabIndex={expanded ? 0 : -1}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button variant="outline" className="h-8 text-[13px]" onClick={onPreview} tabIndex={expanded ? 0 : -1}><Eye className="h-3.5 w-3.5" /> Preview</Button>
                <Button variant="ghost" className="h-8 text-[13px] text-slate-500" onClick={onToggleExpand} tabIndex={expanded ? 0 : -1}>Collapse</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
