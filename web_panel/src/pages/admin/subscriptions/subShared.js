import { tone, label } from "../bookings/shared";

const SUB_TONE = { active: "blue", completed: "green", pending_payment: "amber", cancelled: "red", paused: "slate", expired: "slate" };
const SET_TONE = { none: "slate", pending: "amber", review: "blue", approved: "indigo", paid: "green" };
const PAY_TONE = { paid: "green", pending: "amber", failed: "red", refunded: "slate", partially_refunded: "slate" };
export const SET_LABEL = { none: "Not Generated", pending: "Pending", review: "In Review", approved: "Approved", paid: "Settled" };

export const subTone = (s) => tone(s, SUB_TONE);
export const setTone = (s) => tone(s, SET_TONE);
export const payTone = (s) => tone(s, PAY_TONE);
export const setStatus = (s) => (s.settlement || {}).status || "none";
export const setAmount = (s) => Number((s.settlement || {}).amount ?? s.settlement_amount ?? 0);
export const paidOf = (s) => Number(s.total_payable ?? s.price ?? 0);
export const planDuration = (s) => (s.duration_days ? `${s.duration_days} ${s.duration_days === 1 ? "Day" : "Days"}` : label(s.plan_type));
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export function attendance(s) {
  const days = (s.schedule || []).filter((d) => !["weekly_off", "paused", "cancelled"].includes(d.status));
  const c = (st) => days.filter((d) => st.includes(d.status)).length;
  const completed = c(["completed", "replacement_completed"]);
  const missed = c(["maid_absent"]);
  const cancelled = c(["customer_cancel"]);
  const pending = c(["scheduled", "in_progress"]);
  const done = days.length - pending;
  return { total: days.length, completed, missed, cancelled, pending, rate: done > 0 ? Math.round((completed / done) * 100) : null };
}

const CSV = [
  ["Code", (s) => s.code], ["Customer", (s) => s.customer_name], ["Phone", (s) => s.customer_phone], ["Service", (s) => s.service_name],
  ["Plan", (s) => s.plan_label], ["Maid", (s) => s.partner_name || ""], ["Start", (s) => s.start_date], ["End", (s) => s.end_date],
  ["Paid", paidOf], ["Payment", (s) => s.payment_status], ["Earned", (s) => s.accrued_earning ?? 0], ["Status", (s) => s.status],
  ["Settlement", setStatus], ["Settlement Amount", setAmount], ["Created", (s) => s.created_at],
];
export function exportSubsCsv(rows, name = "subscriptions") {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [CSV.map((c) => esc(c[0])).join(","), ...rows.map((r) => CSV.map((c) => esc(c[1](r))).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
}
