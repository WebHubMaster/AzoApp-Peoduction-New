import { useState } from "react";
import { X, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bump, inr } from "./pricingUtils";

const ACTIONS = [
  { k: "inc", label: "Increase by %" },
  { k: "dec", label: "Decrease by %" },
  { k: "set", label: "Set base price" },
  { k: "mrp", label: "Set MRP" },
  { k: "enable", label: "Enable" },
  { k: "disable", label: "Disable" },
];

const needsValue = (a) => ["inc", "dec", "set", "mrp"].includes(a);

export default function BulkUpdateBar({ ids, prices, setPrices, onClear }) {
  const [action, setAction] = useState("inc");
  const [val, setVal] = useState("");

  // preview the effect on the first affected priced service
  const sample = ids.map((id) => prices[id]).find((sp) => sp && Number(sp.price) > 0);
  let preview = null;
  if (sample && needsValue(action) && val !== "") {
    const cur = Number(sample.price) || 0;
    const v = Number(val);
    if (action === "inc") preview = Math.round(cur * (1 + v / 100));
    else if (action === "dec") preview = Math.round(cur * (1 - v / 100));
    else if (action === "set") preview = v;
    else if (action === "mrp") preview = null;
  }

  const apply = () => {
    const v = Number(val);
    setPrices((p) => {
      const next = { ...p };
      ids.forEach((id) => {
        const sp = { enabled: true, ...(next[id] || {}) };
        if (action === "inc") next[id] = bump(sp, 1 + v / 100);
        else if (action === "dec") next[id] = bump(sp, 1 - v / 100);
        else if (action === "set") next[id] = { ...sp, price: v };
        else if (action === "mrp") next[id] = { ...sp, mrp: v };
        else if (action === "enable") next[id] = { ...sp, enabled: true };
        else if (action === "disable") next[id] = { ...sp, enabled: false };
      });
      return next;
    });
    onClear();
    setVal("");
  };

  const disabled = needsValue(action) && (val === "" || isNaN(Number(val)));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#0D47A1]/30 bg-[#0D47A1]/[0.04] px-3 py-2.5" data-testid="pm-bulk-bar">
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0D47A1]">
        <Wand2 className="h-4 w-4" />{ids.length} selected
      </span>
      <select value={action} onChange={(e) => setAction(e.target.value)} data-testid="pm-bulk-action"
        className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-[13px]">
        {ACTIONS.map((a) => <option key={a.k} value={a.k}>{a.label}</option>)}
      </select>
      {needsValue(action) && (
        <input type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder={action === "inc" || action === "dec" ? "%" : "₹"} data-testid="pm-bulk-value"
          className="h-9 w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-[13px]" />
      )}
      {preview != null && (
        <span className="text-[12px] text-slate-500">e.g. {inr(sample.price)} → <b className="text-slate-800 dark:text-slate-100">{inr(preview)}</b></span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" className="h-9 bg-[#0D47A1] hover:bg-[#0B3C8A]" onClick={apply} disabled={disabled} data-testid="pm-bulk-apply">Apply Changes</Button>
        <button onClick={onClear} className="p-1.5 text-slate-400 hover:text-slate-700" data-testid="pm-bulk-clear"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
