import { useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import PremiumDatePicker, { keepPremiumCal } from "@/components/ui/PremiumDatePicker";
import { RANGES } from "./shared";

export const rangeText = (r) => {
  if (r.key !== "custom") return RANGES.find((x) => x[0] === r.key)[1];
  const f = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "…");
  return `${f(r.from)} – ${f(r.to)}`;
};

export default function DateRangeMenu({ value, onChange, full }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState({ from: value.from || "", to: value.to || "" });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`h-9 text-[13px] justify-between ${full ? "w-full" : ""} ${value.key !== "all" ? "border-[#0D47A1]/40 text-[#0D47A1]" : ""}`} data-testid="bk-date">
          <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{rangeText(value)}</span><ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1" data-testid="bk-date-menu" onInteractOutside={keepPremiumCal}>
        {RANGES.map(([k, l]) => (
          <button key={k} type="button" data-testid={`bk-date-${k}`} onClick={() => { if (k === "custom") { onChange({ key: "custom", ...c }); return; } onChange({ key: k }); setOpen(false); }}
            className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${value.key === k ? "text-[#0D47A1] font-medium" : "text-slate-700 dark:text-slate-200"}`}>
            {l}{value.key === k && <Check className="h-3.5 w-3.5" />}
          </button>
        ))}
        {value.key === "custom" && (
          <div className="border-t border-[#F1F2F4] dark:border-slate-700 mt-1 p-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11.5px] text-slate-500 min-w-0">Start<PremiumDatePicker className="!h-8 !text-[12.5px] mt-0.5 !px-2 !gap-1.5" value={c.from} max={c.to || undefined} onChange={(e) => setC({ ...c, from: e.target.value })} placeholder="Start" data-testid="bk-date-from" /></label>
              <label className="text-[11.5px] text-slate-500 min-w-0">End<PremiumDatePicker className="!h-8 !text-[12.5px] mt-0.5 !px-2 !gap-1.5" value={c.to} min={c.from || undefined} onChange={(e) => setC({ ...c, to: e.target.value })} placeholder="End" data-testid="bk-date-to" /></label>
            </div>
            <Button className="w-full h-8 text-[13px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={() => { onChange({ key: "custom", ...c }); setOpen(false); }} data-testid="bk-date-apply">Apply range</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
