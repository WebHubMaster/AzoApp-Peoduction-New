// Rate-card row pricing with limited-time discount support.
// A row may carry: service_charge, labour_charge, discount_pct, discount_until (YYYY-MM-DD).

export function isDiscountActive(row) {
  const pct = Number(row?.discount_pct) || 0;
  if (pct <= 0) return false;
  const until = String(row?.discount_until || "").trim();
  if (!until) return true; // no expiry -> always on
  const end = new Date(`${until}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() >= Date.now();
}

// Returns { base, effective, pct, active, hasOff }
export function rowPricing(row) {
  const service = Number(row?.service_charge) || 0;
  const labour = Number(row?.labour_charge) || 0;
  const base = service + labour;
  const pct = Number(row?.discount_pct) || 0;
  const active = isDiscountActive(row);
  const effective = active && base ? Math.round(base * (1 - pct / 100)) : base;
  return { base, effective, pct, active, hasOff: active && effective < base };
}
