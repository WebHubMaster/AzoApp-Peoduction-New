import PremiumSelect from "@/components/ui/PremiumSelect";
import { useState, useEffect } from "react";
import { Navigation, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { onlyDigits, onlyAlpha } from "@/lib/validation";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import AddressMap from "@/components/site/AddressMap";
import { reverseGeocodeGoogle } from "@/lib/gmaps";

const DEFAULT_TYPES = ["Apartment", "Independent House", "Villa", "Commercial Building", "Farmhouse", "Office"];

const Lbl = ({ children }) => (
  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{children}</label>
);

/**
 * Advanced address capture (Module 1.2). All feature blocks are gated by `cfg`
 * (admin-configurable address_config). Reports serviceability via onServiceability.
 * `mapsKey` (Google Maps API key) enables the real interactive map.
 */
export const AddressForm = ({ value, onChange, cfg = {}, onServiceability, mapsKey = "" }) => {
  const [locating, setLocating] = useState(false);
  const [svc, setSvc] = useState(null);
  const [svcChecking, setSvcChecking] = useState(false);
  const set = (k, v) => onChange({ ...value, [k]: v });
  const types = cfg.property_types?.length ? cfg.property_types : DEFAULT_TYPES;

  // Live serviceability: whenever a full 6-digit delivery pincode is present we
  // check it against the admin Service Areas and surface a green/red badge so the
  // customer has clarity BEFORE booking. Result is reported up via onServiceability
  // (Checkout uses it to prevent bookings to a location we can't serve).
  useEffect(() => {
    const p = String(value.pincode || "").trim();
    if (!/^\d{6}$/.test(p)) { setSvc(null); setSvcChecking(false); onServiceability?.(null); return; }
    let alive = true;
    setSvcChecking(true);
    api.get(`/geo/serviceability?pincode=${p}`)
      .then((r) => { if (alive) { setSvc(r.data); onServiceability?.(r.data); } })
      .catch(() => { if (alive) { setSvc(null); onServiceability?.(null); } })
      .finally(() => { if (alive) setSvcChecking(false); });
    return () => { alive = false; };
  }, [value.pincode]);

  // Reverse-geocode a coordinate and auto-fill as many address fields as possible.
  // Prefer Google (precise street + pincode) when a Maps key is configured,
  // otherwise fall back to the backend (OpenStreetMap/Nominatim).
  const applyReverse = async (latitude, longitude, { silent = false } = {}) => {
    let data = null;
    if (mapsKey) {
      try { data = await reverseGeocodeGoogle(mapsKey, latitude, longitude); } catch { data = null; }
    }
    if (!data) {
      try {
        const res = await api.get(`/geo/reverse?lat=${latitude}&lng=${longitude}`);
        data = res.data;
      } catch {
        onChange({ ...value, lat: latitude, lng: longitude });
        if (!silent) toast.error("Located you on the map, but couldn't auto-fill the address");
        return;
      }
    }
    onChange({
      ...value,
      line: data.line || value.line, city: data.city || value.city,
      state: data.state || value.state, pincode: data.pincode || value.pincode,
      lat: data.lat ?? latitude, lng: data.lng ?? longitude,
    });
    if (!silent) toast.success("Location set — address auto-filled");
  };

  const detect = () => {
    if (!navigator.geolocation) return toast.error("Location not supported on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await applyReverse(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      (err) => {
        const msg = err.code === 1
          ? "Location permission denied — please allow location access in your browser and try again"
          : err.code === 3
            ? "Getting your location took too long — please try again"
            : "Could not get your location — please try again or drop the pin on the map";
        toast.error(msg);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  };

  return (
    <div className="space-y-3" data-testid="address-form">
      <button type="button" data-testid="gps-detect-btn" onClick={detect} disabled={locating}
        className={`w-full flex items-center justify-center gap-2 h-11 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60 ${value.lat && value.lng ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100"}`}>
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : (value.lat && value.lng ? <CheckCircle2 className="h-4 w-4" /> : <Navigation className="h-4 w-4" />)}
        {locating ? "Detecting location…" : (value.lat && value.lng ? "Location set — tap to update" : "Use my current location")}
      </button>
      {!(value.lat && value.lng) && (
        <p className="text-[11px] text-slate-400 -mt-1 flex items-center gap-1" data-testid="gps-required-hint">
          <AlertCircle className="h-3 w-3 text-amber-500" /> Required — we auto-fill your city &amp; pincode from your location.
        </p>
      )}

      <AddressMap
        mapsKey={mapsKey}
        lat={typeof value.lat === "number" ? value.lat : parseFloat(value.lat)}
        lng={typeof value.lng === "number" ? value.lng : parseFloat(value.lng)}
        onPick={(la, ln) => applyReverse(la, ln, { silent: false })}
      />

      <div>
        <Lbl>Address Label</Lbl>
        <div className="flex gap-2 mt-1">
          {["Home", "Office", "Parents", "Rental", "Other"].map((l) => (
            <button key={l} type="button" data-testid={`addr-label-${l.toLowerCase()}`} onClick={() => set("label", l)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${value.label === l ? "border-primary-700 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-500"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <Input data-testid="addr-line" placeholder="House / Flat no, Building, Street" value={value.line || ""} onChange={(e) => set("line", e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Input data-testid="addr-pincode" placeholder="Pincode" value={value.pincode || ""} inputMode="numeric" maxLength={6}
            onChange={(e) => set("pincode", onlyDigits(e.target.value, 6))} />
        </div>
        <Input data-testid="addr-city" placeholder="City" value={value.city || ""} onChange={(e) => set("city", onlyAlpha(e.target.value))} />
      </div>

      {String(value.pincode || "").length === 6 && (svcChecking || svc) && (
        <div data-testid="serviceability-status" className={`flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2 ${svcChecking ? "bg-slate-100 text-slate-600" : svc && svc.serviceable ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
          {svcChecking ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Checking availability…</>
          ) : svc && svc.serviceable ? (
            <><CheckCircle2 className="h-4 w-4" /> We serve your area</>
          ) : (
            <span className="flex-1"><AlertTriangle className="h-4 w-4 inline mr-1 -mt-0.5" /> We don&apos;t serve this pincode yet, so this booking can&apos;t be placed here.
              {svc && Array.isArray(svc.serviced_cities) && svc.serviced_cities.length > 0 && (<> Currently serving: <b>{svc.serviced_cities.slice(0, 12).join(", ")}</b>.</>)}
            </span>
          )}
        </div>
      )}

      {cfg.property_type && (
        <div>
          <Lbl>Property Type</Lbl>
          <PremiumSelect data-testid="addr-property-type" value={value.property_type || ""} onChange={(e) => set("property_type", e.target.value)}
            className="w-full h-10 mt-1 px-3 rounded-md border border-slate-200 bg-white text-sm">
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </PremiumSelect>
        </div>
      )}

      {cfg.floor_flat && (
        <div className="grid grid-cols-3 gap-2">
          <Input data-testid="addr-wing" placeholder="Wing/Tower" value={value.wing || ""} onChange={(e) => set("wing", e.target.value)} />
          <Input data-testid="addr-floor" placeholder="Floor" value={value.floor || ""} onChange={(e) => set("floor", e.target.value)} />
          <Input data-testid="addr-flat" placeholder="Flat/Unit" value={value.flat_no || ""} onChange={(e) => set("flat_no", e.target.value)} />
        </div>
      )}

      {cfg.landmark_instructions && (
        <>
          <Input data-testid="addr-landmark" placeholder={`Landmark${cfg.mandatory_landmark ? " (required)" : ""}`} value={value.landmark || ""} onChange={(e) => set("landmark", e.target.value)} />
          <Textarea data-testid="addr-instructions" placeholder="Access instructions (e.g. Call before entering, inform security)" value={value.instructions || ""} onChange={(e) => set("instructions", e.target.value)} className="min-h-[60px]" />
        </>
      )}
    </div>
  );
};

export const emptyAddress = () => ({
  label: "Home", line: "", pincode: "", city: "", state: "", property_type: "Apartment",
  wing: "", floor: "", flat_no: "", landmark: "", instructions: "",
  lat: null, lng: null, is_default: false,
});
