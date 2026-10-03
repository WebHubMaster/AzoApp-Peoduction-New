import { useMemo, useState } from "react";
import { MapPin, Search, ArrowRight, CheckCircle2, AlertTriangle, MapPinOff } from "lucide-react";
import { pct } from "./pricingUtils";

function CityTab({ c, active, onClick }) {
  const done = c.priced_services || 0;
  const total = c.total_services || 0;
  const full = total > 0 && done >= total;
  const none = done === 0;
  const p = pct(done, total);
  return (
    <button type="button" onClick={onClick} data-testid={`pm-city-${c.city_key}`}
      className={`group relative shrink-0 w-[168px] text-left rounded-xl border px-3 py-2.5 transition-all duration-150 ${active
        ? "bg-[#0D47A1] border-[#0D47A1] shadow-sm shadow-[#0D47A1]/20"
        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-[#0D47A1]/60 hover:shadow-sm"}`}>
      <div className="flex items-center gap-1.5">
        <MapPin className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : "text-[#0D47A1]"}`} />
        <span className={`text-[14px] font-semibold truncate ${active ? "text-white" : "text-slate-800 dark:text-slate-100"}`}>{c.city}</span>
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${c.status === "inactive" ? "bg-slate-300" : "bg-emerald-400"}`} title={c.status === "inactive" ? "Inactive area" : "Active area"} />
      </div>
      <div className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${active ? "text-white/85" : full ? "text-emerald-600" : none ? "text-amber-600" : "text-slate-500"}`}>
        {full ? <CheckCircle2 className="h-3 w-3" /> : none ? <AlertTriangle className="h-3 w-3" /> : null}
        {full ? "Fully priced" : `${done} / ${total || "—"} priced`}
      </div>
      <div className={`mt-1.5 h-1 rounded-full overflow-hidden ${active ? "bg-white/25" : "bg-slate-100 dark:bg-slate-800"}`}>
        <div className={`h-full rounded-full transition-all ${active ? "bg-white" : full ? "bg-emerald-500" : none ? "bg-amber-400" : "bg-[#0D47A1]"}`} style={{ width: `${p}%` }} />
      </div>
    </button>
  );
}

export default function CityNav({ cities, city, setCity, onManageAreas }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => cities.filter((c) => !q || c.city.toLowerCase().includes(q.toLowerCase())), [cities, q]);

  if (!cities.length) return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center" data-testid="pm-no-areas">
      <MapPinOff className="h-8 w-8 mx-auto text-slate-300" />
      <p className="mt-3 text-[15px] font-semibold text-slate-800 dark:text-slate-100">No Service Areas Configured</p>
      <p className="mt-1 text-[13px] text-slate-500 max-w-md mx-auto">Create and activate cities from Services → Services Config → Service Areas before managing prices.</p>
      <button onClick={onManageAreas} data-testid="pm-manage-areas-empty" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0D47A1] hover:underline">
        Manage Service Areas <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5" data-testid="pm-city-nav">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Service Areas</p>
          <p className="text-[12px] text-slate-400">Cities come from Services → Services Config → Service Areas.</p>
        </div>
        <div className="flex items-center gap-2">
          {cities.length > 6 && (
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city…" data-testid="pm-city-search"
                className="h-9 w-40 pl-8 pr-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30" />
            </div>
          )}
          <button onClick={onManageAreas} data-testid="pm-manage-areas" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0D47A1] hover:underline whitespace-nowrap">
            Manage Service Areas <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
        {shown.map((c) => <CityTab key={c.city_key} c={c} active={city === c.city} onClick={() => setCity(c.city)} />)}
        {!shown.length && <p className="text-[13px] text-slate-400 py-3">No city matches “{q}”.</p>}
      </div>
    </div>
  );
}
