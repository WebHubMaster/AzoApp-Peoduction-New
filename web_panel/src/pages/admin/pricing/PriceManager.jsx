import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Loader2, Copy, Tags, Layers, Receipt, Wallet, Clock } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import CityNav from "./CityNav";
import PricingSummary from "./PricingSummary";
import ServicePrices from "./ServicePrices";
import CityCategories from "./CityCategories";
import CityFees from "./CityFees";
import RateCardPrices from "./RateCardPrices";
import CopyCityDialog from "./CopyCityDialog";
import { relTime } from "./pricingUtils";

const TABS = [
  { k: "services", label: "Service Prices", icon: Tags },
  { k: "categories", label: "Categories", icon: Layers },
  { k: "fees", label: "Fees & Charges", icon: Wallet },
  { k: "ratecards", label: "Rate Card", icon: Receipt },
];

const pv = (sp) => JSON.stringify([sp?.price, sp?.enabled, sp?.tiers, sp?.plans]);

function changeSummary(data, edit) {
  if (!data || !edit) return { total: 0 };
  let services = 0, mrp = 0, addons = 0;
  const ids = new Set([...Object.keys(data.prices || {}), ...Object.keys(edit.prices || {})]);
  ids.forEach((id) => {
    const o = data.prices[id] || {}, n = edit.prices[id] || {};
    if (pv(o) !== pv(n)) services++;
    if (JSON.stringify(o.mrp) !== JSON.stringify(n.mrp)) mrp++;
    if (JSON.stringify(o.addons || {}) !== JSON.stringify(n.addons || {})) addons++;
  });
  const rc = JSON.stringify(data.ratecards) !== JSON.stringify(edit.ratecards);
  const fees = JSON.stringify(data.fees) !== JSON.stringify(edit.fees);
  const cats = JSON.stringify(data.categories) !== JSON.stringify(edit.categories);
  return { services, mrp, addons, rc, fees, cats, total: services + mrp + addons + (rc ? 1 : 0) + (fees ? 1 : 0) + (cats ? 1 : 0) };
}

export default function PriceManager({ onNavigate }) {
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState("");
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState("services");
  const [busy, setBusy] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState("");

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
    setSelectedCat((sc) => sc || d.all_categories[0]?.id || "");
  }, []);
  useEffect(() => { load(city); }, [city, load]);

  const summary = useMemo(() => changeSummary(data, edit), [data, edit]);
  const dirty = summary.total > 0;
  const patch = (k) => (v) => setEdit((e) => ({ ...e, [k]: typeof v === "function" ? v(e[k]) : v }));

  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.put(`/admin/price-manager/city/${encodeURIComponent(city)}`, {
        categories: edit.categories, fees: edit.fees, services: edit.prices, ratecards: edit.ratecards });
      setData(d);
      setEdit({ categories: d.categories, fees: d.fees, prices: d.prices, ratecards: d.ratecards });
      toast.success(`Pricing updated for ${city}`);
      loadCities();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };

  const switchCity = (c) => {
    if (dirty && !window.confirm("You have unsaved pricing changes. Leave without saving?")) return;
    setCity(c);
  };
  const goAreas = () => { if (!dirty || window.confirm("You have unsaved changes. Leave without saving?")) onNavigate?.("service_areas"); };

  const bits = [];
  if (summary.services) bits.push(`Prices ${summary.services}`);
  if (summary.mrp) bits.push(`MRP ${summary.mrp}`);
  if (summary.addons) bits.push(`Add-ons ${summary.addons}`);
  if (summary.rc) bits.push("Rate card");
  if (summary.fees) bits.push("Fees");
  if (summary.cats) bits.push("Categories");

  return (
    <div className="space-y-4 px-0.5" data-testid="price-manager">
      {/* page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[24px] font-bold text-slate-900 dark:text-white leading-tight">Price Manager</h2>
          <p className="text-[14px] text-slate-500 mt-0.5">Manage service prices, add-ons, MRP, fees and rate cards by service area.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.updated_at && (
            <span className="hidden md:inline-flex items-center gap-1 text-[12px] text-slate-400 mr-1"><Clock className="h-3.5 w-3.5" />Updated {relTime(data.updated_at)}</span>
          )}
          <Button variant="outline" className="h-10" onClick={() => setCopyOpen(true)} disabled={!city} data-testid="pm-copy-btn"><Copy className="h-4 w-4 mr-1.5" />Copy from City</Button>
          <Button onClick={save} disabled={!dirty || busy} className="h-10 bg-[#0D47A1] hover:bg-[#0B3C8A] min-w-[140px]" data-testid="pm-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" />Save Changes</>}
          </Button>
        </div>
      </div>

      <CityNav cities={cities} city={city} setCity={switchCity} onManageAreas={goAreas} />

      {dirty && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5" data-testid="pm-unsaved">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-semibold">{summary.total} unsaved change{summary.total > 1 ? "s" : ""}</span>
          {bits.length > 0 && <span className="text-amber-700">· {bits.join(" · ")}</span>}
          <Button size="sm" className="h-8 ml-auto bg-[#0D47A1] hover:bg-[#0B3C8A]" onClick={save} disabled={busy}>Save Changes</Button>
        </div>
      )}

      {!data || !edit || !city ? (
        cities.length === 0 && data === null
          ? null
          : <div className="h-48 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          <PricingSummary data={data} edit={edit} />
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 px-2 overflow-x-auto">
              {TABS.map((t) => (
                <button key={t.k} type="button" onClick={() => setTab(t.k)} data-testid={`pm-tab-${t.k}`}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.k ? "border-[#0D47A1] text-[#0D47A1]" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
                  <t.icon className="h-4 w-4" />{t.label}
                </button>
              ))}
            </div>
            <div className="p-3.5 lg:p-4">
              {tab === "services" && <ServicePrices data={data} edit={edit} setPrices={patch("prices")} setRatecards={patch("ratecards")} onGoRateCards={() => setTab("ratecards")} selectedCat={selectedCat} setSelectedCat={setSelectedCat} />}
              {tab === "categories" && <CityCategories data={data} selected={edit.categories} setSelected={patch("categories")} />}
              {tab === "fees" && <CityFees city={city} defaults={data.fee_defaults} fees={edit.fees} setFees={patch("fees")} />}
              {tab === "ratecards" && <RateCardPrices cards={data.rate_cards} values={edit.ratecards} setValues={patch("ratecards")} selectedCat={selectedCat} setSelectedCat={setSelectedCat} city={city} cities={cities} onApplied={() => { load(city); loadCities(); }} />}
            </div>
          </div>
        </>
      )}

      {copyOpen && <CopyCityDialog cities={cities} to={city} onClose={() => setCopyOpen(false)} onDone={() => { setCopyOpen(false); load(city); loadCities(); }} />}
    </div>
  );
}
