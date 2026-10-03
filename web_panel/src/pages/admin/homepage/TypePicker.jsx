import { useMemo, useState } from "react";
import { ChevronsUpDown, Search, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { metaOf } from "./meta";

export default function TypePicker({ value, onChange, types }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => types.filter((t) => {
    const m = metaOf(t);
    return `${m.label} ${m.desc}`.toLowerCase().includes(q.trim().toLowerCase());
  }), [types, q]);
  const cur = metaOf(value);
  const Icon = cur.icon;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="hp-add-type" aria-label="Section type"
          className="w-full h-10 px-3 inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 text-[14px] text-left hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 transition-colors">
          <Icon className="h-4 w-4 text-[#0D47A1] shrink-0" />
          <span className="flex-1 truncate text-[#111827] dark:text-white">{cur.label}</span>
          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" data-testid="hp-type-menu">
        <div className="relative border-b border-[#E5E7EB] dark:border-slate-700">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search section types..." data-testid="hp-type-search"
            className="w-full h-10 pl-9 pr-3 bg-transparent text-[13.5px] focus:outline-none" />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1" role="listbox">
          {list.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-slate-400">No section types match</p>}
          {list.map((t) => {
            const m = metaOf(t); const I = m.icon; const sel = t === value;
            return (
              <button key={t} type="button" role="option" aria-selected={sel} data-testid={`hp-type-${t}`} onClick={() => { onChange(t); setOpen(false); setQ(""); }}
                className={`w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:bg-slate-100 ${sel ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                <span className={`h-7 w-7 rounded-md grid place-items-center shrink-0 ${sel ? "bg-[#0D47A1] text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}><I className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-[#111827] dark:text-white">{m.label}</span>
                  <span className="block text-[12px] text-[#6B7280] truncate">{m.desc}</span>
                </span>
                {sel && <Check className="h-4 w-4 text-[#0D47A1] mt-1" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
