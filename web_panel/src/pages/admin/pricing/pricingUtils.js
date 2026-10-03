// Shared pricing helpers for Price Manager. Mirrors the strict city-pricing rules
// used by the backend (a service is "priced" only when enabled + has a positive price).
export const isPriced = (s, sp) => {
  if (!sp || sp.enabled === false) return false;
  if (s.tiers?.length) return s.tiers.some((t) => Number(sp.tiers?.[t]?.price) > 0);
  if (s.is_subscription) return (s.plans || []).some((p) => Number(sp.plans?.[p.plan_type]) > 0);
  return Number(sp.price) > 0;
};

export const svcStatus = (s, sp) => {
  if (sp && sp.enabled === false) return "disabled";
  return isPriced(s, sp) ? "priced" : "missing";
};

// % bump applied to a single service-price object (price, mrp, tiers, add-ons, plans).
export function bump(sp, f) {
  const r = (v) => (v === "" || v == null ? v : Math.round(Number(v) * f * 100) / 100);
  return {
    ...sp, price: r(sp.price), mrp: r(sp.mrp),
    tiers: Object.fromEntries(Object.entries(sp.tiers || {}).map(([k, v]) => [k, { ...v, price: r(v.price), mrp: r(v.mrp) }])),
    addons: Object.fromEntries(Object.entries(sp.addons || {}).map(([k, v]) => [k, r(v)])),
    plans: Object.fromEntries(Object.entries(sp.plans || {}).map(([k, v]) => [k, r(v)])),
  };
}

export const inr = (v) => (v == null || v === "" ? "—" : `₹${Math.round(Number(v)).toLocaleString("en-IN")}`);

export const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);

// Build the city-override value map from a global rate card's TEMPLATE defaults.
export function rateTemplateValues(card) {
  const out = {};
  (card?.groups || []).forEach((g) => (g.rows || []).forEach((r) => {
    if (!r.id) return;
    out[r.id] = {
      service_charge: r.service_charge ? String(r.service_charge) : "",
      labour_charge: r.labour_charge ? String(r.labour_charge) : "",
      original_charge: r.original_charge ? String(r.original_charge) : "",
    };
  }));
  return out;
}

export function relTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
