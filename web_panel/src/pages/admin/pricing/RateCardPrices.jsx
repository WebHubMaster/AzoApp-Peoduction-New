import { useMemo, useState } from "react";
import { Receipt, Wand2, Layers, Send, Eye, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceInput } from "./ServicePriceRow";
import ApplyAcrossDialog from "./ApplyAcrossDialog";
import { RateCardModal } from "@/components/RateCardModal";
import { rateTemplateValues, buildCityCard } from "./pricingUtils";

function RowEditor({ r, values, setValues }) {
  const v = values?.[r.id] || {};
  const set = (k, val) => setValues((o) => ({ ...(o || {}), [r.id]: { ...((o || {})[r.id] || {}), [k]: val === "" ? "" : String(val) } }));
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3" data-testid={`pm-rc-row-${r.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{r.description || "—"}</p>
        <div className="flex gap-1.5 shrink-0">
          {r.warranty && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">{r.warranty}</span>}
          {Number(r.discount_pct) > 0 && <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">{r.discount_pct}% off</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriceInput value={v.service_charge} onChange={(x) => set("service_charge", x)} placeholder={r.service_charge || "Service"} tid={`pm-rc-${r.id}`} w="w-[110px]" />
        <PriceInput value={v.labour_charge} onChange={(x) => set("labour_charge", x)} placeholder={r.labour_charge || "Labour"} w="w-[110px]" />
        <PriceInput value={v.original_charge} onChange={(x) => set("original_charge", x)} placeholder={r.original_charge || "MRP"} w="w-[110px]" />
        {!v.service_charge && r.service_charge ? <span className="text-[11px] text-slate-400">inherits template ₹{r.service_charge}</span> : null}
      </div>
      {r.note && <p className="text-[11px] text-slate-400 mt-1.5">{r.note}</p>}
    </div>
  );
}

export default function RateCardPrices({ cards, values, setValues, selectedCat, setSelectedCat, city, cities, onApplied }) {
  const [acrossOpen, setAcrossOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pct, setPct] = useState("");
  const withCards = useMemo(() => cards || [], [cards]);
  const current = useMemo(() => withCards.find((c) => c.category_id === selectedCat) || withCards[0] || null, [withCards, selectedCat]);
  const previewCard = useMemo(() => buildCityCard(current, values), [current, values]);

  if (!withCards.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 py-12 text-center" data-testid="pm-ratecards-empty">
        <Receipt className="h-8 w-8 mx-auto text-slate-300" />
        <p className="mt-2 text-[14px] font-semibold text-slate-700 dark:text-slate-200">No Rate Cards Configured</p>
        <p className="text-[13px] text-slate-400 mt-1">Create category rate cards in Services → Services Config → Rate Cards.</p>
      </div>
    );
  }

  const applyTemplate = () => {
    if (!current) return;
    const tpl = rateTemplateValues(current);
    setValues((o) => ({ ...(o || {}), ...tpl }));
  };

  const applyPct = () => {
    const f = 1 + Number(pct) / 100;
    if (!current || !pct || !Number.isFinite(f)) return;
    const rows = current.groups.flatMap((g) => g.rows);
    setValues((o) => {
      const next = { ...(o || {}) };
      rows.forEach((r) => {
        const ov = next[r.id] || {};
        const scale = (k) => {
          const raw = ov[k] !== undefined && ov[k] !== "" ? ov[k] : r[k];
          const n = Number(raw);
          return n > 0 ? String(Math.round(n * f)) : (ov[k] ?? "");
        };
        next[r.id] = { service_charge: scale("service_charge"), labour_charge: scale("labour_charge"), original_charge: scale("original_charge") };
      });
      return next;
    });
    setPct("");
  };

  const accent = current?.accent_color || "#0D47A1";

  return (
    <div className="space-y-3.5" data-testid="pm-ratecards">
      {/* header: category selector + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-[#0D47A1]" />
          <select value={current?.category_id || ""} onChange={(e) => setSelectedCat(e.target.value)} data-testid="pm-rc-category"
            className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-[14px] font-semibold">
            {withCards.map((c) => <option key={c.id} value={c.category_id}>{c.category_name || c.title}</option>)}
          </select>
        </div>
        <span className="text-[12px] text-slate-400 hidden sm:inline">Rate card prices here are specific to <b className="text-slate-600 dark:text-slate-300">{city}</b>.</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="relative w-20"><Input value={pct} onChange={(e) => setPct(e.target.value)} type="number" placeholder="+10" className="h-10 pr-6 text-[13px]" data-testid="pm-rc-bulk-pct" /><Percent className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" /></div>
            <Button variant="outline" size="sm" className="h-10" onClick={applyPct} data-testid="pm-rc-bulk-apply">Adjust</Button>
          </div>
          <Button variant="outline" size="sm" className="h-10" onClick={() => setPreviewOpen(true)} data-testid="pm-rc-preview"><Eye className="h-4 w-4 mr-1.5" />Preview</Button>
          <Button variant="outline" size="sm" className="h-10" onClick={applyTemplate} data-testid="pm-rc-use-template"><Wand2 className="h-4 w-4 mr-1.5" />Use Template</Button>
          <Button size="sm" className="h-10 bg-[#0D47A1] hover:bg-[#0B3C8A]" onClick={() => setAcrossOpen(true)} data-testid="pm-rc-apply-across"><Send className="h-4 w-4 mr-1.5" />Apply Across Cities</Button>
        </div>
      </div>

      {current && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-testid="pm-rc-card">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700" style={{ background: `${accent}0d` }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: accent }}>{current.brand_label || "AzoCover"}</span>
              <p className="text-[16px] font-bold text-slate-800 dark:text-slate-100">{current.category_name}</p>
              <span className="text-[12px] text-slate-400">· {current.title}</span>
            </div>
            {current.subtitle && <p className="text-[12px] text-slate-500 mt-0.5">{current.subtitle}</p>}
            {current.intro && <p className="text-[12px] text-slate-400 mt-1">{current.intro}</p>}
          </div>
          <p className="text-[12px] text-slate-400 px-4 pt-3">Rows with an empty Service charge stay hidden in this city. Blank fields inherit the category template.</p>
          <div className="p-3.5 grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-4">
            {current.groups.map((g) => (
              <div key={g.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.name}</p>
                  {g.note && <span className="text-[11px] text-slate-400">· {g.note}</span>}
                </div>
                <div className="space-y-1.5">
                  {g.rows.map((r) => <RowEditor key={r.id} r={r} values={values} setValues={setValues} />)}
                  {!g.rows.length && <p className="text-[12px] text-slate-400">No rows.</p>}
                </div>
              </div>
            ))}
          </div>
          {current.footer_note && <p className="text-[11px] text-slate-400 px-4 pb-3 border-t border-slate-100 dark:border-slate-800 pt-2">{current.footer_note}</p>}
        </div>
      )}

      {acrossOpen && current && (
        <ApplyAcrossDialog cities={cities} fromCity={city} categoryId={current.category_id} categoryName={current.category_name}
          onClose={() => setAcrossOpen(false)} onDone={() => { setAcrossOpen(false); onApplied?.(); }} />
      )}

      {previewOpen && current && (
        previewCard && previewCard.groups.length
          ? <RateCardModal card={{ ...previewCard, category_name: `${previewCard.category_name} · ${city}` }} onClose={() => setPreviewOpen(false)} />
          : <PreviewEmpty city={city} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

function PreviewEmpty({ city, onClose }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" data-testid="pm-rc-preview-empty">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm text-center">
        <Eye className="h-8 w-8 mx-auto text-slate-300" />
        <p className="mt-2 text-[14px] font-semibold text-slate-700 dark:text-slate-200">Nothing priced yet</p>
        <p className="text-[13px] text-slate-400 mt-1">No rate-card rows have a Service charge for {city}, so the customer card would be empty. Set prices or use the template, then preview.</p>
        <Button className="mt-4 bg-[#0D47A1] hover:bg-[#0B3C8A]" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
