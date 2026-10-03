import { useMemo, useState } from "react";
import { Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Push one category's config from the current city to several other service areas at once.
export default function ApplyAcrossDialog({ cities, fromCity, categoryId, categoryName, onClose, onDone }) {
  const targets = cities.filter((c) => c.city !== fromCity);
  const [sel, setSel] = useState(() => new Set());
  const [scopes, setScopes] = useState(() => new Set(["services", "ratecards"]));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => targets.filter((c) => !q || c.city.toLowerCase().includes(q.toLowerCase())), [targets, q]);
  const toggle = (city) => setSel((s) => { const n = new Set(s); n.has(city) ? n.delete(city) : n.add(city); return n; });
  const toggleScope = (k) => setScopes((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allSel = shown.length > 0 && shown.every((c) => sel.has(c.city));

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post("/admin/price-manager/apply-across", {
        from: fromCity, category_id: categoryId, cities: [...sel], include: [...scopes] });
      toast.success(`Applied ${categoryName} to ${r.data.count} cit${r.data.count === 1 ? "y" : "ies"}`);
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Apply failed"); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="pm-apply-across-dialog">
        <DialogHeader><DialogTitle className="text-[17px]">Apply Across Cities</DialogTitle></DialogHeader>
        <p className="text-[13px] text-slate-500">
          Push the <b className="text-slate-800 dark:text-slate-100">{categoryName}</b> configuration from <b>{fromCity}</b> to the selected service areas.
        </p>

        <div>
          <p className="text-[13px] font-semibold text-slate-600 mb-1.5">What to apply</p>
          <div className="flex gap-1.5">
            {[["services", "Service prices"], ["ratecards", "Rate card"]].map(([k, l]) => (
              <label key={k} data-testid={`pm-across-scope-${k}`}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] cursor-pointer ${scopes.has(k) ? "border-[#0D47A1]/40 bg-[#0D47A1]/[0.05]" : "border-slate-200 dark:border-slate-700"}`}>
                <input type="checkbox" checked={scopes.has(k)} onChange={() => toggleScope(k)} className="h-4 w-4 rounded border-slate-300 text-[#0D47A1]" />{l}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[13px] font-semibold text-slate-600">Target cities ({sel.size})</p>
            <button onClick={() => setSel(allSel ? new Set() : new Set(shown.map((c) => c.city)))} className="text-[12px] font-semibold text-[#0D47A1] hover:underline" data-testid="pm-across-all">
              {allSel ? "Clear all" : "Select all"}
            </button>
          </div>
          {targets.length > 6 && (
            <div className="relative mb-2">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city…" className="h-9 w-full pl-8 pr-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px]" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto grid grid-cols-2 gap-1.5">
            {shown.map((c) => (
              <label key={c.city_key} data-testid={`pm-across-city-${c.city_key}`}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[13px] cursor-pointer ${sel.has(c.city) ? "border-[#0D47A1]/40 bg-[#0D47A1]/[0.05]" : "border-slate-200 dark:border-slate-700"}`}>
                <input type="checkbox" checked={sel.has(c.city)} onChange={() => toggle(c.city)} className="h-4 w-4 rounded border-slate-300 text-[#0D47A1]" />
                <span className="truncate flex-1">{c.city}</span>
                {sel.has(c.city) && <CheckCircle2 className="h-3.5 w-3.5 text-[#0D47A1]" />}
              </label>
            ))}
            {!shown.length && <p className="col-span-2 text-[13px] text-slate-400 py-3 text-center">No other cities available.</p>}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          This overwrites the {categoryName} prices/rate-card in the selected cities. Other categories stay untouched.
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={busy || !sel.size || !scopes.size} className="bg-[#0D47A1] hover:bg-[#0B3C8A]" data-testid="pm-across-confirm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Apply to ${sel.size} cit${sel.size === 1 ? "y" : "ies"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
