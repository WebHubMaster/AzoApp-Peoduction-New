import { useMemo, useState } from "react";
import { Search, ChevronDown, AlertTriangle, CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import ServicePriceRow from "./ServicePriceRow";
import CategoryRateCardPanel from "./CategoryRateCardPanel";
import BulkUpdateBar from "./BulkUpdateBar";
import { isPriced, pct } from "./pricingUtils";

export default function ServicePrices({ data, edit, setPrices, setRatecards, onGoRateCards }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectedCat, setSelectedCat] = useState(() => data.all_categories[0]?.id || "");

  const enabledCats = new Set(edit.categories);

  const list = useMemo(() => {
    const ql = q.toLowerCase();
    const matchQ = (s) => !q || s.name.toLowerCase().includes(ql) ||
      (s.category_name || "").toLowerCase().includes(ql) ||
      (s.addons || []).some((a) => a.toLowerCase().includes(ql));
    return data.all_services.filter((s) =>
      (cat === "all" || s.category_id === cat) && matchQ(s) &&
      (!onlyMissing || !isPriced(s, edit.prices[s.id])));
  }, [data, cat, q, onlyMissing, edit.prices]);

  const missingCount = data.all_services.filter((s) => !isPriced(s, edit.prices[s.id])).length;
  const groups = data.all_categories
    .map((c) => ({ c, rows: list.filter((s) => s.category_id === c.id) }))
    .filter((g) => g.rows.length);

  const activeCard = data.rate_cards.find((rc) => rc.category_id === selectedCat) || null;
  const activeCatName = data.all_categories.find((c) => c.id === selectedCat)?.name;

  const setOne = (id) => (sp) => setPrices((p) => ({ ...p, [id]: sp }));
  const toggleSel = (id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
  const toggleCat = (id) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectCat = (id) => { setSelectedCat(id); toggleCat(id); };
  const selectAllVisible = () => setSel(new Set(list.map((s) => s.id)));

  return (
    <div className="space-y-3.5" data-testid="pm-services">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search service, add-on or category…" className="pl-9 h-10 text-[14px]" data-testid="pm-search" />
        </div>
        <select value={cat} onChange={(e) => { setCat(e.target.value); if (e.target.value !== "all") setSelectedCat(e.target.value); }} data-testid="pm-cat-filter"
          className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-[14px]">
          <option value="all">All Categories</option>
          {data.all_categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300 px-1">
          <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} data-testid="pm-only-missing" />Only missing
        </label>
        <Button variant={selectMode ? "default" : "outline"} size="sm" className={`h-10 ${selectMode ? "bg-[#0D47A1] hover:bg-[#0B3C8A]" : ""}`}
          onClick={() => { setSelectMode((m) => !m); setSel(new Set()); }} data-testid="pm-bulk-toggle">
          <CheckSquare className="h-4 w-4 mr-1" />Bulk Update
        </Button>
      </div>

      {missingCount > 0 && !onlyMissing && (
        <div className="flex items-center gap-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="pm-missing-banner">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="font-semibold">{missingCount}</span> service{missingCount > 1 ? "s" : ""} require pricing.
          <button onClick={() => setOnlyMissing(true)} className="ml-auto font-semibold text-amber-900 hover:underline" data-testid="pm-fix-missing">Fix Missing Prices →</button>
        </div>
      )}

      {selectMode && (
        sel.size > 0
          ? <BulkUpdateBar ids={[...sel]} prices={edit.prices} setPrices={setPrices} onClear={() => setSel(new Set())} />
          : <div className="flex items-center gap-3 text-[13px] text-slate-500 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2.5">
              Select services to bulk-update.
              <button onClick={selectAllVisible} className="font-semibold text-[#0D47A1] hover:underline" data-testid="pm-select-all">Select all in view ({list.length})</button>
            </div>
      )}

      {/* two-panel workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <div className="space-y-3 min-w-0">
          {groups.map(({ c, rows }) => {
            const priced = rows.filter((s) => isPriced(s, edit.prices[s.id])).length;
            const isOpen = !collapsed.has(c.id);
            const isSel = selectedCat === c.id;
            return (
              <div key={c.id} data-testid={`pm-group-${c.id}`}
                className={`rounded-xl border overflow-hidden transition-colors ${isSel ? "border-[#0D47A1]/50 ring-1 ring-[#0D47A1]/20" : "border-slate-200 dark:border-slate-700"}`}>
                <button type="button" onClick={() => selectCat(c.id)} data-testid={`pm-group-head-${c.id}`}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${isSel ? "bg-[#0D47A1]/[0.06]" : "bg-slate-50 dark:bg-slate-800"}`}>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                    <p className="text-[12px] text-slate-400">{rows.length} service{rows.length > 1 ? "s" : ""} · {priced}/{rows.length} priced</p>
                  </div>
                  {!enabledCats.has(c.id) && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">OFF</span>}
                  <div className="w-24 shrink-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div className={`h-full rounded-full ${priced === rows.length ? "bg-emerald-500" : "bg-[#0D47A1]"}`} style={{ width: `${pct(priced, rows.length)}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 tabular-nums w-8 text-right">{pct(priced, rows.length)}%</span>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((s) => (
                      <ServicePriceRow key={s.id} s={s} sp={edit.prices[s.id]} onChange={setOne(s.id)}
                        selectable={selectMode} selected={sel.has(s.id)} onSelect={(on) => toggleSel(s.id, on)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!groups.length && (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 py-12 text-center" data-testid="pm-no-services">
              <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">No Services Available</p>
              <p className="text-[13px] text-slate-400 mt-1">{q || onlyMissing || cat !== "all" ? "Nothing matches your filters." : "No services found for this city."}</p>
            </div>
          )}
        </div>

        <div className="xl:sticky xl:top-4 self-start">
          <CategoryRateCardPanel card={activeCard} categoryName={activeCatName} values={edit.ratecards}
            setValues={setRatecards} onGoRateCards={onGoRateCards} />
        </div>
      </div>
    </div>
  );
}
