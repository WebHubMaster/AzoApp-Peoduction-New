import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Save, Loader2, Copy, Tags, Layers, Receipt, Wallet, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ServicePrices from "./ServicePrices";
import CityCategories from "./CityCategories";
import CityFees from "./CityFees";
import RateCardPrices from "./RateCardPrices";
import CopyCityDialog from "./CopyCityDialog";

const TABS = [
  { k: "services", label: "Service Prices", icon: Tags },
  { k: "categories", label: "Categories", icon: Layers },
  { k: "fees", label: "Fees & Charges", icon: Wallet },
  { k: "ratecards", label: "Rate Card", icon: Receipt },
];

function CityPicker({ cities, city, setCity }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="pm-city-picker">
      {cities.map((c) => (
        <button key={c.city_key} type="button" onClick={() => setCity(c.city)} data-testid={`pm-city-${c.city_key}`}
          className={`px-3.5 py-2 rounded-xl border text-sm font-semibold transition-colors ${city === c.city ? "bg-[#0D47A1] text-white border-[#0D47A1]" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#0D47A1]"}`}>
          <MapPin className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />{c.city}
          <span className={`ml-2 text-[11px] font-medium ${city === c.city ? "text-white/80" : c.configured ? "text-emerald-600" : "text-amber-600"}`}>
            {c.configured ? `${c.priced_services} priced` : "not set"}
          </span>
        </button>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { setCity(custom.trim()); setCustom(""); } }} className="flex gap-1.5">
        <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+ Add city" className="h-9 w-36" data-testid="pm-add-city-input" />
      </form>
    </div>
  );
}

export default function PriceManager() {
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState("");
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState("services");
  const [busy, setBusy] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const loadCities = useCallback(() => api.get("/admin/price-manager/cities").then((r) => {
    setCities(r.data);
    setCity((c) => c || r.data[0]?.city || "");
  }), []);
  useEffect(() => { loadCities(); }, [loadCities]);

  const load = useCallback(async (c) => {
    if (!c) return;
    setData(null);
    const { data: d } = await api.get(`/admin/price-manager/city/${encodeURIComponent(c)}`);
    setData(d);
    setEdit({ categories: d.categories, fees: d.fees, prices: d.prices, ratecards: d.ratecards });
  }, []);
  useEffect(() => { load(city); }, [city, load]);

  const dirty = useMemo(() => data && edit && JSON.stringify(edit) !== JSON.stringify(
    { categories: data.categories, fees: data.fees, prices: data.prices, ratecards: data.ratecards }), [data, edit]);
  const patch = (k) => (v) => setEdit((e) => ({ ...e, [k]: typeof v === "function" ? v(e[k]) : v }));

  const save = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.put(`/admin/price-manager/city/${encodeURIComponent(city)}`, {
        categories: edit.categories, fees: edit.fees, services: edit.prices, ratecards: edit.ratecards });
      setData(d);
      setEdit({ categories: d.categories, fees: d.fees, prices: d.prices, ratecards: d.ratecards });
      toast.success(`${city} prices updated`);
      loadCities();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };

  const switchCity = (c) => {
    if (dirty && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    setCity(c);
  };

  return (
    <div className="space-y-5" data-testid="price-manager">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Price Manager</h2>
          <p className="text-sm text-slate-500">City chunein aur us city ke liye har service, variant, add-on, plan, category aur fees set karein. Jahan price set nahi hai, wo service us city me nahi dikhegi.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={!city} data-testid="pm-copy-btn"><Copy className="h-4 w-4 mr-1" />Copy from city</Button>
          <Button onClick={save} disabled={!dirty || busy} className="bg-[#0D47A1] hover:bg-[#0B3C8A] min-w-[130px]" data-testid="pm-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Save {city}</>}
          </Button>
        </div>
      </div>
      <CityPicker cities={cities} city={city} setCity={switchCity} />
      {dirty && <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-testid="pm-unsaved"><AlertTriangle className="h-4 w-4" />Unsaved changes for {city} — Save dabayein.</div>}
      {!data || !edit ? <div className="h-48 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 px-3 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.k} type="button" onClick={() => setTab(t.k)} data-testid={`pm-tab-${t.k}`}
                className={`flex items-center gap-1.5 px-3.5 py-3 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === t.k ? "border-[#0D47A1] text-[#0D47A1]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                <t.icon className="h-4 w-4" />{t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === "services" && <ServicePrices data={data} edit={edit} setPrices={patch("prices")} />}
            {tab === "categories" && <CityCategories data={data} selected={edit.categories} setSelected={patch("categories")} />}
            {tab === "fees" && <CityFees defaults={data.fee_defaults} fees={edit.fees} setFees={patch("fees")} />}
            {tab === "ratecards" && <RateCardPrices cards={data.rate_cards} values={edit.ratecards} setValues={patch("ratecards")} />}
          </div>
        </div>
      )}
      {copyOpen && <CopyCityDialog cities={cities} to={city} onClose={() => setCopyOpen(false)} onDone={() => { setCopyOpen(false); load(city); loadCities(); }} />}
    </div>
  );
}
