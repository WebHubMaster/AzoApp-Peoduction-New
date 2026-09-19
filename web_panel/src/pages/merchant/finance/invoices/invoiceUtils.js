import {
  CheckCircle2, Clock, CircleDollarSign, RotateCcw, XCircle, AlertOctagon, Loader2, HelpCircle,
} from "lucide-react";

/* ────────────────────────── formatting ────────────────────────── */
export const money = (n, cur = "INR", frac = 0) =>
  (cur === "INR" ? "₹" : cur + " ") +
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: frac, maximumFractionDigits: Math.max(frac, 2) });

export const shortDate = (s) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return String(s).slice(0, 10); }
};
export const longDate = (s) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return String(s).slice(0, 10); }
};
export const dateTime = (s) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(s).slice(0, 16); }
};

/* ────────────────────────── status system ────────────────────────── */
export const STATUS_META = {
  paid:           { label: "Paid",           icon: CheckCircle2,     cls: "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/70", dot: "bg-emerald-500" },
  pending:        { label: "Pending",        icon: Clock,            cls: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/70", dot: "bg-amber-500" },
  processing:     { label: "Processing",     icon: Loader2,          cls: "bg-blue-50 text-blue-700 ring-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/70", dot: "bg-blue-500" },
  charged:        { label: "Charged",        icon: Clock,            cls: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/70", dot: "bg-amber-500" },
  partially_paid: { label: "Partially Paid", icon: CircleDollarSign, cls: "bg-blue-50 text-blue-700 ring-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/70", dot: "bg-blue-500" },
  refunded:       { label: "Refunded",       icon: RotateCcw,        cls: "bg-violet-50 text-violet-700 ring-violet-200/80 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/70", dot: "bg-violet-500" },
  cancelled:      { label: "Cancelled",      icon: XCircle,          cls: "bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/70", dot: "bg-rose-500" },
  failed:         { label: "Failed",         icon: AlertOctagon,     cls: "bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/70", dot: "bg-rose-500" },
  default:        { label: "Unknown",        icon: HelpCircle,       cls: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700", dot: "bg-slate-400" },
};
export const statusMeta = (s) => {
  const k = (s || "").toLowerCase().replace(/\s+/g, "_");
  return STATUS_META[k] || { ...STATUS_META.default, label: s ? s.replace(/_/g, " ") : "Unknown" };
};

/* ────────────────────────── invoice types ────────────────────────── */
export const TYPE_META = {
  booking:      { label: "Booking",      cls: "bg-primary-50 text-primary-700 ring-primary-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800/70" },
  commission:   { label: "Commission",   cls: "bg-teal-50 text-teal-700 ring-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/60" },
  refund:       { label: "Refund",       cls: "bg-violet-50 text-violet-700 ring-violet-200/80 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/60" },
  adjustment:   { label: "Adjustment",   cls: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700" },
  cancellation: { label: "Cancellation", cls: "bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/60" },
  transaction:  { label: "Transaction",  cls: "bg-indigo-50 text-indigo-700 ring-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800/60" },
  withdrawal:   { label: "Withdrawal",   cls: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/60" },
};
export const typeMeta = (t) => TYPE_META[(t || "").toLowerCase()] || { label: t ? t.replace(/_/g, " ") : "Other", cls: TYPE_META.adjustment.cls };

export const TYPE_OPTIONS = ["booking", "commission", "refund", "adjustment", "cancellation", "transaction", "withdrawal"];
export const STATUS_OPTIONS = ["paid", "pending", "partially_paid", "refunded", "cancelled", "failed"];

/* ────────────────────────── date presets ────────────────────────── */
export const DATE_PRESETS = [
  ["all", "All Time"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 Days"],
  ["30d", "Last 30 Days"], ["this_month", "This Month"], ["last_month", "Last Month"], ["this_year", "This Year"], ["custom", "Custom"],
];
export const presetLabel = (k) => (DATE_PRESETS.find(([key]) => key === k) || [])[1] || "All Time";

/* ────────────────────────── sorting ────────────────────────── */
export const SORT_OPTIONS = [
  ["newest", "Newest first"], ["oldest", "Oldest first"],
  ["amount_high", "Highest amount"], ["amount_low", "Lowest amount"],
  ["number", "Invoice # (Z→A)"], ["number_asc", "Invoice # (A→Z)"],
  ["customer", "Customer (A→Z)"], ["customer_desc", "Customer (Z→A)"],
  ["status", "Status (A→Z)"], ["status_desc", "Status (Z→A)"],
];
/* column key → [ascending sort, descending sort] */
export const COLUMN_SORTS = {
  date: ["oldest", "newest"],
  number: ["number_asc", "number"],
  amount: ["amount_low", "amount_high"],
  customer: ["customer", "customer_desc"],
  status: ["status", "status_desc"],
};
export const columnSortState = (sort, col) => {
  const pair = COLUMN_SORTS[col];
  if (!pair) return null;
  if (sort === pair[0]) return "asc";
  if (sort === pair[1]) return "desc";
  return null;
};
export const nextColumnSort = (sort, col) => {
  const pair = COLUMN_SORTS[col];
  if (!pair) return sort;
  if (sort === pair[1]) return pair[0];
  return pair[1];
};

/* ────────────────────────── helpers ────────────────────────── */
const shortId = (s, prefix = "") => (s ? prefix + String(s).replace(/-/g, "").slice(0, 8).toUpperCase() : "");
export const referenceOf = (inv) =>
  inv?.booking_code || inv?.reference_id || shortId(inv?.transaction_id, "TXN-") || shortId(inv?.withdrawal_id, "WD-") || "—";
export const customerOf = (inv) => inv?.customer_snapshot?.name || inv?.merchant_snapshot?.name || inv?.partner_snapshot?.name || "—";
export const customerPhone = (inv) => inv?.customer_snapshot?.phone || inv?.customer_snapshot?.mobile || "";

export const invoiceLink = (inv) => `${window.location.origin}/merchant?invoice=${encodeURIComponent(inv?.id || "")}`;
export const shareText = (inv) =>
  `Invoice ${inv.invoice_number} · ${money(inv.total_amount, inv.currency)} · ${statusMeta(inv.payment_status).label} — AzoApp Merchant\n${invoiceLink(inv)}`;

export const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    return true;
  } catch { return false; }
};

/* Build a timeline for the detail view from invoice fields */
export const buildTimeline = (inv) => {
  if (!inv) return [];
  const steps = [];
  if (inv.booking_date) steps.push({ title: "Booking created", time: dateTime(inv.booking_date), done: true });
  steps.push({ title: "Invoice issued", time: dateTime(inv.issue_date || inv.created_at), done: true });
  const ps = (inv.payment_status || "").toLowerCase();
  if (ps === "paid") steps.push({ title: "Payment received", time: dateTime(inv.paid_at || inv.updated_at || inv.issue_date), done: true });
  else if (ps === "partially_paid") steps.push({ title: "Partial payment received", time: dateTime(inv.updated_at || inv.issue_date), active: true });
  else if (ps === "refunded") steps.push({ title: "Amount refunded", time: dateTime(inv.refunded_at || inv.updated_at || inv.issue_date), done: true });
  else if (ps === "cancelled") steps.push({ title: "Invoice cancelled", time: dateTime(inv.updated_at || inv.issue_date), done: true });
  else if (ps === "failed") steps.push({ title: "Payment failed", time: dateTime(inv.updated_at || inv.issue_date), active: true });
  else steps.push({ title: "Awaiting payment", time: "", active: true });
  if (inv.commission) steps.push({ title: "Commission credited", time: dateTime(inv.updated_at || inv.issue_date), done: ps === "paid" });
  return steps;
};
