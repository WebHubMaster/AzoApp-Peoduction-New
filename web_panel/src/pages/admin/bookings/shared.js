export const ORDER = { pending: 1, pending_payment: 1, searching: 1.5, assigned: 2, arrived_shop: 2.3, arrived_customer: 2.6, started: 3, completed: 4, paid: 5, on_hold: 5.5, cancelled: 6 };
const TONES = {
  amber: "bg-amber-50 text-[#B45309] ring-amber-600/15", amberDot: "bg-[#F59E0B]",
  blue: "bg-blue-50 text-[#1D4ED8] ring-blue-600/15", blueDot: "bg-[#2563EB]",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/15", indigoDot: "bg-indigo-500",
  green: "bg-green-50 text-[#15803D] ring-green-600/15", greenDot: "bg-[#16A34A]",
  red: "bg-red-50 text-[#B91C1C] ring-red-600/15", redDot: "bg-[#DC2626]",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/15", slateDot: "bg-slate-400",
};
const STATUS_TONE = { pending: "amber", pending_payment: "amber", on_hold: "amber", searching: "blue", assigned: "blue", arrived_shop: "blue", arrived_customer: "blue", started: "indigo", completed: "green", paid: "green", cancelled: "red" };
const PAY_TONE = { paid: "green", completed: "green", pending: "amber", failed: "red", refunded: "slate", partially_refunded: "slate" };
export const label = (s) => (s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");
export const tone = (s, map = STATUS_TONE) => { const t = map[s] || "slate"; return { pill: TONES[t], dot: TONES[`${t}Dot`] }; };
export const payTone = (s) => tone(s, PAY_TONE);
export const IN_PROGRESS = ["searching", "assigned", "arrived_shop", "arrived_customer", "started", "on_hold"];

export const amountOf = (b) => Number(b?.pricing?.total ?? 0);
export const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const dParts = (iso) => {
  if (!iso) return ["—", ""];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ["—", ""];
  return [d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })];
};
export const initials = (n) => (n || "?").split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

const day = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const RANGES = [
  ["all", "All dates"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 Days"],
  ["30d", "Last 30 Days"], ["month", "This Month"], ["lastmonth", "Last Month"], ["custom", "Custom Range"],
];
export function rangeBounds(r) {
  const now = new Date(); const t = day(now);
  const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  switch (r.key) {
    case "today": return [t, add(t, 1)];
    case "yesterday": return [add(t, -1), t];
    case "7d": return [add(t, -6), add(t, 1)];
    case "30d": return [add(t, -29), add(t, 1)];
    case "month": return [new Date(now.getFullYear(), now.getMonth(), 1), add(t, 1)];
    case "lastmonth": return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
    case "custom": return [r.from ? day(r.from) : null, r.to ? add(day(r.to), 1) : null];
    default: return [null, null];
  }
}

export const COLS_CSV = [
  ["Code", (b) => b.code], ["Service", (b) => b.service_name], ["Category", (b) => b.category_name], ["Customer", (b) => b.customer_name],
  ["Partner", (b) => b.partner_name || ""], ["Type", (b) => b.booking_type], ["Status", (b) => b.status], ["Amount", amountOf],
  ["Payment", (b) => b.payment_status || ""], ["Created", (b) => b.created_at], ["Scheduled", (b) => b.scheduled_at || ""],
];
export function exportCsv(rows, name = "bookings") {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [COLS_CSV.map((c) => c[0]).map(esc).join(","), ...rows.map((b) => COLS_CSV.map((c) => esc(c[1](b))).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
}
