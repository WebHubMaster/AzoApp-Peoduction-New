import { PriceInput } from "./ServicePriceRow";

export default function RateCardPrices({ cards, values, setValues }) {
  const set = (id, k, v) => setValues((o) => ({ ...(o || {}), [id]: { ...((o || {})[id] || {}), [k]: v === "" ? "" : String(v) } }));
  if (!cards.length) return <p className="text-sm text-slate-400 text-center py-8">No rate cards created yet.</p>;
  return (
    <div className="space-y-4" data-testid="pm-ratecards">
      <p className="text-sm text-slate-500">Jis row ka Service charge khali hai, wo row is city me nahi dikhegi.</p>
      {cards.map((c) => (
        <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <p className="bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200">{c.title}</p>
          {c.groups.map((g) => (
            <div key={g.id} className="px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{g.name}</p>
              {g.rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 py-1">
                  <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 min-w-[160px]">{r.description}</span>
                  <PriceInput value={values?.[r.id]?.service_charge} onChange={(v) => set(r.id, "service_charge", v)} placeholder="Service" tid={`pm-rc-${r.id}`} />
                  <PriceInput value={values?.[r.id]?.labour_charge} onChange={(v) => set(r.id, "labour_charge", v)} placeholder="Labour" />
                  <PriceInput value={values?.[r.id]?.original_charge} onChange={(v) => set(r.id, "original_charge", v)} placeholder="MRP" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
