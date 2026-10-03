export const COMM = [
  { k: "partner_pct", label: "Partner Commission", short: "Partner", bar: "bg-[#0D47A1]", dot: "bg-[#0D47A1]" },
  { k: "platform_pct", label: "Platform Commission", short: "Platform", bar: "bg-[#60A5FA]", dot: "bg-[#60A5FA]" },
  { k: "merchant_partner_referral_pct", label: "Merchant · Partner Referral", short: "Merchant referral", bar: "bg-[#F59E0B]", dot: "bg-[#F59E0B]" },
  { k: "merchant_customer_pct", label: "Merchant · Customer", short: "Merchant customer", bar: "bg-[#14B8A6]", dot: "bg-[#14B8A6]" },
];
export const CANC = [
  { k: "customer_refund_pct", label: "Customer Refund", hint: "Refunded to the customer" },
  { k: "partner_cancellation_pct", label: "Partner Cancellation", hint: "Retained as cancellation charge" },
];
export const KEYS = [...COMM, ...CANC].map((x) => x.k);
export const EMPTY = Object.fromEntries(KEYS.map((k) => [k, ""]));
export const sum = (f, list) => list.reduce((s, x) => s + (Number(f?.[x.k]) || 0), 0);
export const ok100 = (n) => Math.abs(n - 100) < 0.01;
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const merchantPct = (r) => round2((Number(r?.merchant_partner_referral_pct) || 0) + (Number(r?.merchant_customer_pct) || 0));
export const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const errMsg = (e, fb = "Save failed") => { const d = e?.response?.data?.detail; return typeof d === "string" ? d : fb; };
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const toRates = (f) => Object.fromEntries(KEYS.map((k) => [k, Number(f[k])]));

export function exportCsv(categories) {
  const head = ["Category", "Services", "Partner %", "Platform %", "Merchant Partner Referral %", "Merchant Customer %", "Customer Refund %", "Partner Cancellation %", "Status", "Last Updated"];
  const rows = categories.map((c) => {
    const r = c.commission || {};
    return [c.name, c.service_count, ...KEYS.map((k) => r[k] ?? ""), c.configured ? "Configured" : "Rate Required", c.commission_updated_at || ""];
  });
  const csv = [head, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `commission-by-category-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
