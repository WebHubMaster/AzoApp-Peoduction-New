/* 1:1 port of web_panel/src/pages/merchant/finance/invoices/invoiceUtils.js */
import { MEDIA_ORIGIN } from "@/src/api/client";

export const money = (n: any, cur = "INR", frac = 0) =>
  (cur === "INR" ? "₹" : cur + " ") +
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: frac, maximumFractionDigits: Math.max(frac, 2) });

export const shortDate = (s?: string) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return String(s).slice(0, 10); }
};
export const longDate = (s?: string) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }); } catch { return String(s).slice(0, 10); }
};
export const dateTime = (s?: string) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return String(s).slice(0, 16); }
};

/* ── status system (light / dark tailwind hexes) ── */
export type Tone = { bg: string; fg: string; ring: string; dot: string; bgD: string; fgD: string; ringD: string };
const EMERALD: Tone = { bg: "#ECFDF5", fg: "#047857", ring: "#A7F3D0", dot: "#10B981", bgD: "rgba(2,44,34,0.4)", fgD: "#6EE7B7", ringD: "#065F46" };
const AMBER: Tone = { bg: "#FFFBEB", fg: "#B45309", ring: "#FDE68A", dot: "#F59E0B", bgD: "rgba(69,26,3,0.4)", fgD: "#FCD34D", ringD: "#92400E" };
const BLUE: Tone = { bg: "#EFF6FF", fg: "#1D4ED8", ring: "#BFDBFE", dot: "#3B82F6", bgD: "rgba(23,37,84,0.4)", fgD: "#93C5FD", ringD: "#1E40AF" };
const VIOLET: Tone = { bg: "#F5F3FF", fg: "#6D28D9", ring: "#DDD6FE", dot: "#8B5CF6", bgD: "rgba(46,16,101,0.4)", fgD: "#C4B5FD", ringD: "#5B21B6" };
const ROSE: Tone = { bg: "#FFF1F2", fg: "#BE123C", ring: "#FECDD3", dot: "#F43F5E", bgD: "rgba(76,5,25,0.4)", fgD: "#FDA4AF", ringD: "#9F1239" };
const SLATE: Tone = { bg: "#F1F5F9", fg: "#475569", ring: "#E2E8F0", dot: "#94A3B8", bgD: "#1E293B", fgD: "#CBD5E1", ringD: "#334155" };
const TEAL: Tone = { bg: "#F0FDFA", fg: "#0F766E", ring: "#99F6E4", dot: "#14B8A6", bgD: "rgba(4,47,46,0.4)", fgD: "#5EEAD4", ringD: "#115E59" };
const INDIGO: Tone = { bg: "#EEF2FF", fg: "#4338CA", ring: "#C7D2FE", dot: "#6366F1", bgD: "rgba(30,27,75,0.4)", fgD: "#A5B4FC", ringD: "#3730A3" };

export type StatusIcon = "check" | "clock" | "loader" | "dollar" | "rotate" | "xcircle" | "octagon" | "help";
export const STATUS_META: Record<string, { label: string; icon: StatusIcon; tone: Tone }> = {
  paid: { label: "Paid", icon: "check", tone: EMERALD },
  pending: { label: "Pending", icon: "clock", tone: AMBER },
  processing: { label: "Processing", icon: "loader", tone: BLUE },
  charged: { label: "Charged", icon: "clock", tone: AMBER },
  partially_paid: { label: "Partially Paid", icon: "dollar", tone: BLUE },
  refunded: { label: "Refunded", icon: "rotate", tone: VIOLET },
  cancelled: { label: "Cancelled", icon: "xcircle", tone: ROSE },
  failed: { label: "Failed", icon: "octagon", tone: ROSE },
  default: { label: "Unknown", icon: "help", tone: SLATE },
};
export const statusMeta = (s?: string) => {
  const k = (s || "").toLowerCase().replace(/\s+/g, "_");
  return STATUS_META[k] || { ...STATUS_META.default, label: s ? s.replace(/_/g, " ") : "Unknown" };
};

/* ── invoice types ── */
export const TYPE_META: Record<string, { label: string; tone: Tone | "primary" }> = {
  booking: { label: "Booking", tone: "primary" },
  commission: { label: "Commission", tone: TEAL },
  refund: { label: "Refund", tone: VIOLET },
  adjustment: { label: "Adjustment", tone: SLATE },
  cancellation: { label: "Cancellation", tone: ROSE },
  transaction: { label: "Transaction", tone: INDIGO },
  withdrawal: { label: "Withdrawal", tone: AMBER },
};
export const typeMeta = (t?: string) => TYPE_META[(t || "").toLowerCase()] || { label: t ? t.replace(/_/g, " ") : "Other", tone: SLATE };

export const TYPE_OPTIONS = ["booking", "commission", "refund", "adjustment", "cancellation", "transaction", "withdrawal"];
export const STATUS_OPTIONS = ["paid", "pending", "partially_paid", "refunded", "cancelled", "failed"];

/* ── date presets ── */
export const DATE_PRESETS: [string, string][] = [
  ["all", "All Time"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 Days"],
  ["30d", "Last 30 Days"], ["this_month", "This Month"], ["last_month", "Last Month"], ["this_year", "This Year"], ["custom", "Custom"],
];
export const presetLabel = (k: string) => (DATE_PRESETS.find(([key]) => key === k) || [])[1] || "All Time";

/* ── sorting ── */
export const SORT_OPTIONS: [string, string][] = [
  ["newest", "Newest first"], ["oldest", "Oldest first"],
  ["amount_high", "Highest amount"], ["amount_low", "Lowest amount"],
  ["number", "Invoice # (Z→A)"], ["number_asc", "Invoice # (A→Z)"],
  ["customer", "Customer (A→Z)"], ["customer_desc", "Customer (Z→A)"],
  ["status", "Status (A→Z)"], ["status_desc", "Status (Z→A)"],
];

/* ── helpers ── */
const shortId = (s?: string, prefix = "") => (s ? prefix + String(s).replace(/-/g, "").slice(0, 8).toUpperCase() : "");
export const referenceOf = (inv: any) =>
  inv?.booking_code || inv?.reference_id || shortId(inv?.transaction_id, "TXN-") || shortId(inv?.withdrawal_id, "WD-") || "—";
export const customerOf = (inv: any) => inv?.customer_snapshot?.name || inv?.merchant_snapshot?.name || inv?.partner_snapshot?.name || "—";
export const customerPhone = (inv: any) => inv?.customer_snapshot?.phone || inv?.customer_snapshot?.mobile || "";

const WEB_ORIGIN = (process.env.EXPO_PUBLIC_WEB_URL || MEDIA_ORIGIN).replace(/\/+$/, "");
export const invoiceLink = (inv: any) => `${WEB_ORIGIN}/merchant?invoice=${encodeURIComponent(inv?.id || "")}`;
export const shareText = (inv: any) =>
  `Invoice ${inv.invoice_number} · ${money(inv.total_amount, inv.currency)} · ${statusMeta(inv.payment_status).label} — AzoApp Merchant\n${invoiceLink(inv)}`;

/* filters */
export type Filters = { types: string[]; statuses: string[]; customer: string; minAmount: string; maxAmount: string; booking: string };
export const EMPTY_FILTERS: Filters = { types: [], statuses: [], customer: "", minAmount: "", maxAmount: "", booking: "" };
export const countFilters = (f: Filters) => [f.types.length > 0, f.statuses.length > 0, !!f.customer, !!(f.minAmount || f.maxAmount), !!f.booking].filter(Boolean).length;

/* Build a timeline for the detail view from invoice fields */
export type TimelineStep = { title: string; time: string; done?: boolean; active?: boolean };
export const buildTimeline = (inv: any): TimelineStep[] => {
  if (!inv) return [];
  const steps: TimelineStep[] = [];
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

/* pagination page list (web pageList) */
export function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); set.add(4); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); set.add(pages - 3); }
  const arr = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
}
