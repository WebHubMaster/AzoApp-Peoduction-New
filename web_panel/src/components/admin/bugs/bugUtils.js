import { CheckCircle2, CircleDot } from "lucide-react";

export const fmtDate = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const APP_LABEL = { customer: "Customer App", partner: "Partner App", merchant: "Merchant App" };
export const CAT_LABEL = { payment: "Payment", booking: "Booking", login: "Login", account: "Account", other: "Other" };
export const STATUS_LABEL = { "": "All reports", open: "Open", solved: "Solved" };
export const ROLE_LABEL = { "": "All apps", customer: "Customer App", partner: "Partner App" };
export const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Last updated" },
  { value: "status", label: "Status" },
  { value: "category", label: "Category" },
];
export const isSolved = (s) => s === "solved" || s === "closed";
export const shortId = (id) => `BUG-${String(id || "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;

export const statusMeta = (s) => (isSolved(s)
  ? { label: "Solved", icon: CheckCircle2, badge: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800", bar: "bg-emerald-500" }
  : { label: "Open", icon: CircleDot, badge: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:ring-orange-800", bar: "bg-orange-500" });

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
export const DATE_PRESETS = [
  { key: "today", label: "Today", range: () => ({ from: day(), to: day() }) },
  { key: "yesterday", label: "Yesterday", range: () => ({ from: day(-1), to: day(-1) }) },
  { key: "7", label: "Last 7 days", range: () => ({ from: day(-6), to: day() }) },
  { key: "30", label: "Last 30 days", range: () => ({ from: day(-29), to: day() }) },
  { key: "month", label: "This month", range: () => { const t = day(); return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: t }; } },
];
export const presetLabel = (r) => {
  if (!r) return "";
  const p = DATE_PRESETS.find((x) => { const v = x.range(); return iso(v.from) === r.from && iso(v.to) === r.to; });
  if (p) return p.label;
  const f = (s) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
};
