import PremiumSelect from "@/components/ui/PremiumSelect";
/* Person360 — complete 360° profile for a Customer / Partner / Merchant (admin view).
   All data is the same underlying real data the user panels read; sections are server-paginated. */
import { useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Bell, CheckCheck, Wallet, ShoppingBag, IndianRupee, RotateCcw, MapPin, Gift, Award, Activity, History, FileText, ScrollText, Landmark, Star, Wrench, Users, Network, CreditCard, Package, Sparkles, Phone, Mail, Calendar, ShieldCheck, Store, User, TrendingUp, ArrowDownToLine, Receipt, CheckCircle2, XCircle, ShieldAlert, Loader2, Pencil, Ban, MessageSquare, BellRing, Navigation, Crown, Send, FileWarning, ArrowRight, Eye, Lock, ChevronDown, Trash2 } from "lucide-react";
import RangeCalendar from "./RangeCalendar";
import { usePaged, invalidatePaged, useDebounce, Card, KpiCard, DataGrid, Pager, Tabs, Drawer, SearchBox, Select, Btn, Pill, TierPill, Progress, Avatar, KV, Empty, ErrorState, Skeleton, money, Money, Num, dt, rel, useIsMobile } from "./ui";
import { StatValue } from "@/components/ExactHover";
import PartnerRegistration from "@/pages/partner/PartnerRegistration";
import MerchantRegistration from "@/pages/merchant/MerchantRegistration";

/* ---------- generic server-paged section ---------- */
const SectionTable = ({ role, uid, name, columns, placeholder = "Search…", statusOptions, typeOptions, typeLabel = "Type", onRow, summary, empty, extra }) => {
  const [q, setQ] = useState(""); const dq = useDebounce(q);
  const [status, setStatus] = useState(""); const [type, setType] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ key: "", order: "desc" });
  useEffect(() => { setPage(1); }, [dq, status, type, range.from, range.to, pageSize]);
  const params = useMemo(() => ({ q: dq, status, type, date_from: range.from, date_to: range.to, page, page_size: pageSize, ...(sort.key ? { sort: sort.key, order: sort.order } : {}), ...(extra || {}) }), [dq, status, type, range, page, pageSize, sort, extra]);
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/${name}`, params);
  const rows = data?.items || [];
  return (
    <Card data-testid={`section-${name}`}>
      {summary && data && <div className="p-4 border-b border-slate-100 dark:border-slate-800">{summary(data)}</div>}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
        <SearchBox value={q} onChange={setQ} placeholder={placeholder} testId={`${name}-search`} />
        <div className="flex flex-wrap gap-2">
          {statusOptions && <Select testId={`${name}-status`} value={status} onChange={setStatus} options={statusOptions} placeholder="All statuses" />}
          {typeOptions && <Select testId={`${name}-type`} value={type} onChange={setType} options={typeOptions} placeholder={`All ${typeLabel.toLowerCase()}s`} />}
          <RangeCalendar value={range} onChange={setRange} label="Date range" testId={`${name}-date`} align="right" />
        </div>
      </div>
      <DataGrid columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRow={onRow} sort={sort.key ? sort : null} onSort={(k) => setSort((s) => ({ key: k, order: s.key === k && s.order === "desc" ? "asc" : "desc" }))} empty={empty || <Empty title="No records" hint="Nothing has been recorded here yet." />} />
      {data && data.total > 0 && <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />}
    </Card>
  );
};

const Amt = ({ v, sign }) => <span className={`font-semibold ${sign === "credit" ? "text-emerald-700 dark:text-emerald-300" : sign === "debit" ? "text-rose-600 dark:text-rose-300" : ""}`}>{sign === "credit" ? "+" : sign === "debit" ? "−" : ""}<Money v={v} /></span>;
const Mono = ({ v }) => <span className="font-mono text-xs">{v || "—"}</span>;
const D = ({ v }) => <span className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{dt(v)}</span>;

/* ---------- invoice PDF view / download (sends the admin auth token) ---------- */
const _invoicePdfBlob = async (inv) => {
  const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
  return URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
};
const viewInvoice = async (inv) => {
  try { window.open(await _invoicePdfBlob(inv), "_blank"); }
  catch { toast.error("Could not open the invoice PDF"); }
};
const downloadInvoice = async (inv) => {
  try {
    const url = await _invoicePdfBlob(inv);
    const a = document.createElement("a"); a.href = url; a.download = `${inv.invoice_number || "invoice"}.pdf`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch { toast.error("Could not download the invoice PDF"); }
};

/* ---------- column sets ---------- */
const BOOKING_COLS = (role) => [
  { key: "code", label: "Booking", render: (r) => <div><Mono v={r.booking_code || r.code || r.id?.slice(0, 8)} /><p className="text-[11px] text-slate-400">{dt(r.created_at)}</p></div> },
  { key: "service", label: "Service", render: (r) => <span className="font-medium">{r.service_name || r.service || "—"}</span>, nowrap: false },
  ...(role !== "customer" ? [{ key: "customer", label: "Customer", render: (r) => <div className="text-xs"><p className="font-medium">{r.customer_name || "—"}</p><p className="text-slate-400">{r.customer_phone}</p></div> }] : []),
  ...(role !== "partner" ? [{ key: "partner", label: "Partner", render: (r) => r.partner_name || <span className="text-slate-300">unassigned</span> }] : []),
  ...(role !== "merchant" ? [{ key: "merchant", label: "Merchant", render: (r) => r.merchant_name || <span className="text-slate-300">—</span> }] : []),
  { key: "sched", label: "Scheduled", render: (r) => <span className="text-xs">{r.scheduled_at ? dt(r.scheduled_at) : r.scheduled_date ? `${r.scheduled_date} ${r.scheduled_time || ""}` : "—"}</span> },
  { key: "loc", label: "Location", render: (r) => <span className="text-xs text-slate-500 truncate max-w-[160px] inline-block">{typeof r.address === "string" ? r.address : r.address?.line || r.address?.city || r.pincode || "—"}</span> },
  { key: "status", label: "Status", render: (r) => <Pill s={r.status} /> },
  { key: "pay", label: "Payment", render: (r) => <Pill s={r.payment_status || (r.status === "paid" ? "paid" : "pending")} /> },
  ...(role === "merchant" ? [{ key: "comm", label: "Commission", align: "right", render: (r) => r.commission ? money(r.commission.merchant_customer ?? r.commission.merchant ?? r.commission.total ?? 0) : "—" }] : []),
  { key: "amount", label: "Amount", align: "right", sortKey: "pricing.total", render: (r) => <span className="font-semibold"><Money v={r.amount} /></span> },
];
const INVOICE_COLS = [
  { key: "no", label: "Invoice #", render: (r) => <Mono v={r.invoice_number} /> }, { key: "bk", label: "Booking", render: (r) => <Mono v={r.booking_code} /> },
  { key: "type", label: "Type", render: (r) => <Pill s={r.invoice_type || "invoice"} /> }, { key: "svc", label: "Service", render: (r) => r.service_name || "—" },
  { key: "date", label: "Date", sortKey: "created_at", render: (r) => <D v={r.created_at} /> }, { key: "status", label: "Status", render: (r) => <Pill s={r.status || r.payment_status} /> },
  { key: "amt", label: "Amount", align: "right", render: (r) => <span className="font-semibold"><Money v={r.total_amount} /></span> },
  { key: "act", label: "", align: "right", render: (r) => <div className="flex justify-end gap-1.5"><button onClick={(e) => { e.stopPropagation(); viewInvoice(r); }} data-testid={`inv-view-${r.id}`} className="h-7 px-2 rounded-lg text-[11px] font-bold ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-primary-300 inline-flex items-center gap-1"><Eye className="h-3 w-3" />View</button><button onClick={(e) => { e.stopPropagation(); downloadInvoice(r); }} data-testid={`inv-dl-${r.id}`} className="h-7 px-2 rounded-lg text-[11px] font-bold text-white bg-primary-600 hover:bg-primary-700 inline-flex items-center gap-1"><ArrowDownToLine className="h-3 w-3" />PDF</button></div> },
];
const REFUND_COLS = [
  { key: "id", label: "Refund ID", render: (r) => <Mono v={r.id?.slice(0, 8)} /> }, { key: "bk", label: "Booking", render: (r) => <div><Mono v={r.booking_code} /><p className="text-[11px] text-slate-400">{r.service_name}</p></div> },
  { key: "amt", label: "Refund", align: "right", render: (r) => <Amt v={r.refund_amount ?? r.amount} /> }, { key: "orig", label: "Original", align: "right", render: (r) => <Money v={r.original_amount} /> },
  { key: "reason", label: "Reason", render: (r) => <span className="text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate inline-block">{r.cancellation_reason || "—"}</span> },
  { key: "method", label: "Method", render: (r) => <span className="capitalize text-xs">{r.method || "—"}</span> }, { key: "date", label: "Initiated", sortKey: "created_at", render: (r) => <D v={r.created_at || r.initiated_at} /> },
  { key: "done", label: "Completed", render: (r) => <D v={r.completed_at} /> }, { key: "status", label: "Status", render: (r) => <Pill s={r.status} /> },
];
const LEDGER_COLS = (dirKey = "direction") => [
  { key: "date", label: "Date", sortKey: "created_at", render: (r) => <D v={r.created_at} /> }, { key: "id", label: "Txn ID", render: (r) => <Mono v={r.id?.slice(0, 8)} /> },
  { key: "kind", label: "Type", render: (r) => <Pill s={r.kind || r.type} /> }, { key: "ref", label: "Reference", render: (r) => <span className="text-xs text-slate-600 dark:text-slate-300 max-w-[220px] truncate inline-block">{r.note || r.booking_code || r.ref_id || "—"}</span> },
  { key: "cr", label: "Credit", align: "right", render: (r) => (r[dirKey] === "credit" ? <Amt v={r.amount} sign="credit" /> : <span className="text-slate-300">—</span>) },
  { key: "dr", label: "Debit", align: "right", render: (r) => (r[dirKey] === "debit" ? <Amt v={r.amount} sign="debit" /> : <span className="text-slate-300">—</span>) },
  { key: "bal", label: "Balance after", align: "right", render: (r) => r.wallet_balance != null || r.balance_after != null ? <Money v={r.wallet_balance ?? r.balance_after} /> : <span className="text-slate-300">—</span> },
  { key: "status", label: "Status", render: (r) => <Pill s={r.status || "completed"} /> },
];
const PAYMENT_COLS = [
  { key: "ref", label: "Txn ref", render: (r) => <Mono v={r.txn_ref || r.gateway_payment_id || r.id?.slice(0, 8)} /> }, { key: "bk", label: "Booking", render: (r) => <Mono v={r.booking_code} /> },
  { key: "svc", label: "Service", render: (r) => r.service_name || "—" }, { key: "method", label: "Method", render: (r) => <span className="text-xs capitalize">{r.method_label || r.method || r.gateway || "—"}</span> },
  { key: "date", label: "Date", sortKey: "created_at", render: (r) => <D v={r.created_at} /> }, { key: "status", label: "Status", render: (r) => <Pill s={r.status} /> },
  { key: "amt", label: "Amount", align: "right", render: (r) => <span className="font-semibold"><Money v={r.amount} /></span> },
];
const WITHDRAW_COLS = [
  { key: "date", label: "Requested", sortKey: "created_at", render: (r) => <D v={r.requested_at || r.created_at} /> }, { key: "amt", label: "Amount", align: "right", render: (r) => <span className="font-semibold"><Money v={r.amount} /></span> },
  { key: "fee", label: "Fee / Net", align: "right", render: (r) => <span className="text-xs"><Money v={r.fee || 0} /> / <b><Money v={r.net_amount ?? r.amount} /></b></span> }, { key: "method", label: "Method", render: (r) => <span className="capitalize text-xs">{r.method || "—"}{r.upi_id ? ` · ${r.upi_id}` : ""}</span> },
  { key: "ref", label: "Reference", render: (r) => <Mono v={r.payout?.utr || r.payout?.payout_id || r.reference} /> }, { key: "proc", label: "Processed", render: (r) => <D v={r.processed_at} /> },
  { key: "status", label: "Status", render: (r) => <Pill s={r.status} /> }, { key: "reason", label: "Reason", render: (r) => <span className="text-xs text-slate-500">{r.reason || r.payout?.failure_reason || "—"}</span> },
];
const EARN_COLS = [
  { key: "date", label: "Date", sortKey: "created_at", render: (r) => <D v={r.created_at} /> }, { key: "job", label: "Job", render: (r) => <Mono v={r.booking_code || r.ref_id?.slice(0, 8)} /> },
  { key: "cust", label: "Customer", render: (r) => r.customer_name || "—" }, { key: "svc", label: "Service", render: (r) => r.service_name || r.note || "—" },
  { key: "gross", label: "Gross", align: "right", render: (r) => r.gross != null ? <Money v={r.gross} /> : "—" }, { key: "comm", label: "Commission", align: "right", render: (r) => r.commission != null ? <span className="text-slate-500"><Money v={r.commission} /></span> : "—" },
  { key: "earn", label: "Partner earning", align: "right", render: (r) => <Amt v={r.amount} sign="credit" /> }, { key: "status", label: "Status", render: (r) => <Pill s={r.status || "completed"} /> },
];

/* ---------- booking detail drawer ---------- */
const BookingDrawer = ({ role, uid, bid, onClose }) => {
  const [b, setB] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { if (!bid) return; setB(null); setErr(null); api.get(`/admin/people/${role}/${uid}/bookings/${bid}`).then((r) => setB(r.data)).catch((e) => setErr(e?.response?.data?.detail || e.message)); }, [role, uid, bid]);
  const pr = b?.pricing || {};
  return (
    <Drawer open={!!bid} onClose={onClose} title={b ? `Booking ${b.booking_code || b.code || ""}` : "Booking"} subtitle={b?.service_name} testId="booking-drawer" width={560}>
      {err ? <ErrorState error={err} /> : !b ? <Skeleton rows={5} cols={3} /> : (
        <div className="space-y-5">
          <div className="flex items-center gap-2"><Pill s={b.status} /><Pill s={b.payment_status || (b.status === "paid" ? "paid" : "pending")} />{b.booking_type && <Pill s={b.booking_type} />}<span className="ml-auto text-lg font-extrabold">{money(b.amount)}</span></div>
          <KV cols={2} items={[{ k: "Customer", v: b.customer_name && `${b.customer_name} · ${b.customer_phone || ""}` }, { k: "Partner", v: b.partner_name || "Unassigned" }, { k: "Merchant", v: b.merchant_name }, { k: "Scheduled", v: b.scheduled_at ? dt(b.scheduled_at) : b.scheduled_date }, { k: "Created", v: dt(b.created_at) }, { k: "Payment method", v: b.payment_method }, { k: "Address", v: typeof b.address === "string" ? b.address : b.address ? [b.address.line, b.address.city, b.address.pincode].filter(Boolean).join(", ") : null }, { k: "Base / Total", v: `${money(pr.base)} / ${money(pr.total)}` }, { k: "Tax", v: pr.tax != null && money(pr.tax) }, { k: "Discount", v: pr.discount ? money(pr.discount) : null }]} />
          <div><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Booking timeline</p>
            <ol className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-2 space-y-3" data-testid="booking-timeline">
              {(b.timeline_full || []).map((t, i) => <li key={i} className="ml-4"><span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${["completed", "paid", "payment_received"].includes(t.status) ? "bg-emerald-500" : ["cancelled", "rejected"].includes(t.status) ? "bg-rose-500" : "bg-primary-500"}`} /><p className="text-sm font-semibold">{t.label}</p><p className="text-xs text-slate-400">{dt(t.at)}{t.reason ? ` · ${t.reason}` : ""}</p></li>)}
              {!(b.timeline_full || []).length && <li className="ml-4 text-sm text-slate-400">No timeline events recorded.</li>}
            </ol></div>
          {b.commission_ledger && <div><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Commission split</p><KV cols={4} items={[{ k: "Gross", v: money(b.commission_ledger.gross) }, { k: "Partner", v: money(b.commission_ledger.partner_earning) }, { k: "Platform", v: money(b.commission_ledger.platform_earning) }, { k: "Merchant", v: money(b.commission_ledger.merchant_referral) }]} /></div>}
          {[["Invoices", b.invoices, (i) => `${i.invoice_number} · ${money(i.total_amount)} · ${i.status || ""}`], ["Refunds", b.refunds, (r) => `${money(r.refund_amount ?? r.amount)} · ${r.status} · ${dt(r.created_at)}`], ["Payments", b.payments, (p) => `${p.method_label || p.method || p.gateway} · ${money(p.amount)} · ${p.status}`]].map(([t, arr, f]) => arr?.length ? <div key={t}><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">{t}</p><ul className="text-sm space-y-1">{arr.map((x, i) => <li key={i} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">{f(x)}</li>)}</ul></div> : null)}
        </div>)}
    </Drawer>
  );
};

/* ---------- generic entry detail drawer (earnings / wallet / withdrawals / rewards) ---------- */
const HUMAN = (k) => String(k || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const MONEYISH = /amount|balance|gross|commission|earning|fee|net|total|paid|price|refund|payout_amount|charge|cashback|bonus/i;
const DATEISH = /(_at|_on)$|date|created|updated|processed|requested|reviewed|submitted|completed|expires|scheduled/i;
const HIDE_KEYS = new Set(["_id", "__v", "id", "partner_id", "merchant_id", "user_id", "customer_id", "otp", "otps", "webhook_response", "raw", "meta", "seed", "commission_rate", "ref_type"]);
const renderFieldVal = (k, v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return MONEYISH.test(k) ? <Money v={v} /> : (Math.abs(v) >= 1000 ? <StatValue value={v} /> : String(v));
  if (typeof v === "string") {
    if (v.startsWith("data:") || v.startsWith("/uploads") || v.length > 300) return null; // skip raw docs
    if (DATEISH.test(k) && /^\d{4}-\d{2}-\d{2}/.test(v)) return dt(v);
    return v;
  }
  return null;
};
const flattenEntry = (obj, prefix = "") => {
  const out = [];
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (HIDE_KEYS.has(k)) return;
    const label = prefix ? `${prefix} · ${HUMAN(k)}` : HUMAN(k);
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flattenEntry(v, label));
    else if (Array.isArray(v)) { if (v.length) out.push({ k: label, v: v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") }); }
    else { const rv = renderFieldVal(k, v); if (rv !== null) out.push({ k: label, v: rv }); }
  });
  return out;
};

const EntryDrawer = ({ open, onClose, kind, entry, title, subtitle, amount, amountSign, statuses = [], highlight = [], onOpenBooking }) => {
  const items = useMemo(() => (entry ? flattenEntry(entry) : []), [entry]);
  return (
    <Drawer open={open} onClose={onClose} title={title} subtitle={subtitle} testId={`${kind}-detail-drawer`} width={560}>
      {!entry ? <Empty title="No details" /> : (
        <div className="space-y-5" data-testid={`${kind}-detail`}>
          <div className="flex flex-wrap items-center gap-2">
            {statuses.filter(Boolean).map((s, i) => <Pill key={i} s={s} />)}
            {amount != null && <span className={`ml-auto text-2xl font-extrabold ${amountSign === "debit" ? "text-rose-600 dark:text-rose-300" : amountSign === "credit" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-900 dark:text-white"}`}>{amountSign === "credit" ? "+" : amountSign === "debit" ? "−" : ""}<Money v={amount} /></span>}
          </div>
          {highlight.filter((h) => h && h.v != null && h.v !== "").length > 0 && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4"><KV cols={2} items={highlight} /></div>
          )}
          <div><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">All details</p><KV cols={2} items={items} /></div>
          {onOpenBooking && <button onClick={onOpenBooking} data-testid="open-related-booking" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl font-bold text-sm text-white bg-primary-600 hover:bg-primary-700"><ShoppingBag className="h-4 w-4" />View full booking</button>}
        </div>)}
    </Drawer>
  );
};

/* ---------- activity timeline ---------- */
const GROUP_STYLE = { user: "bg-primary-500", admin: "bg-amber-500", system: "bg-slate-400" };
const ActivityTimeline = ({ role, uid }) => {
  const [q, setQ] = useState(""); const dq = useDebounce(q);
  const [type, setType] = useState(""); const [group, setGroup] = useState(""); const [status, setStatus] = useState("");
  const [range, setRange] = useState({ from: "", to: "" }); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);
  useEffect(() => { setPage(1); }, [dq, type, group, status, range.from, range.to, pageSize]);
  const params = useMemo(() => ({ q: dq, type, group, status, date_from: range.from, date_to: range.to, page, page_size: pageSize }), [dq, type, group, status, range, page, pageSize]);
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/activity`, params);
  const types = data?.types || [];
  const [openDays, setOpenDays] = useState({});
  const [sel, setSel] = useState(null);
  const groups = useMemo(() => {
    const items = data?.items || []; const out = []; const idx = {};
    items.forEach((e) => { const k = dt(e.at, false); if (idx[k] === undefined) { idx[k] = out.length; out.push([k, []]); } out[idx[k]][1].push(e); });
    return out;
  }, [data]);
  useEffect(() => { if (groups.length) setOpenDays((o) => (Object.keys(o).length ? o : { [groups[0][0]]: true })); }, [groups]);
  return (
    <Card data-testid="section-activity">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
        <SearchBox value={q} onChange={setQ} placeholder="Search activity…" testId="activity-search" />
        <div className="flex flex-wrap gap-2">
          <Select testId="activity-type" value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))} placeholder="All types" />
          <Select testId="activity-group" value={group} onChange={setGroup} options={[{ value: "user", label: "User actions" }, { value: "admin", label: "Admin actions" }, { value: "system", label: "System events" }]} placeholder="All actors" />
          <Select testId="activity-status" value={status} onChange={setStatus} options={["completed", "paid", "cancelled", "pending", "assigned", "started", "searching", "unreviewed", "reviewed"]} placeholder="All statuses" />
          <RangeCalendar value={range} onChange={setRange} label="Date range" testId="activity-date" align="right" />
        </div>
      </div>
      {loading && !data ? <Skeleton rows={7} cols={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items?.length ? <Empty icon={Activity} title="No activity found" hint="Events will appear here as the account is used." /> : (
        <div className="p-3 space-y-2" data-testid="activity-list">
          {groups.map(([day, evs]) => {
            const isOpen = !!openDays[day];
            return <div key={day} className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
              <button data-testid={`activity-day-${day}`} onClick={() => setOpenDays((o) => ({ ...o, [day]: !o[day] }))} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                <span className="font-bold text-sm">{day}</span>
                <span className="ml-auto text-xs font-semibold text-slate-400">{evs.length} event{evs.length > 1 ? "s" : ""}</span>
              </button>
              {isOpen && <ol className="px-4 py-2 relative">
                <div className="absolute left-[21px] top-4 bottom-4 w-px bg-slate-200 dark:bg-slate-800" />
                {evs.map((e) => <li key={e.id} className="relative">
                  <button onClick={() => setSel(e)} data-testid={`activity-item-${e.id}`} className="w-full text-left flex gap-3 py-1.5">
                    <span className={`mt-1.5 h-[11px] w-[11px] rounded-full ring-4 ring-white dark:ring-slate-900 shrink-0 ${GROUP_STYLE[e.group] || "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{e.title}</p>{e.status && <Pill s={e.status} size="xs" />}<span className={`text-[10px] font-bold uppercase tracking-wide ${e.group === "admin" ? "text-amber-600" : e.group === "user" ? "text-primary-600" : "text-slate-400"}`}>{e.group}</span>{e.amount != null && <span className="ml-auto text-sm font-bold"><Money v={e.amount} /></span>}</div>
                      {e.detail && <p className="text-xs text-slate-500 mt-0.5 break-words line-clamp-2">{e.detail}</p>}
                      <p className="text-[11px] text-slate-400 mt-0.5">{new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {rel(e.at)}</p>
                    </div>
                  </button></li>)}
              </ol>}
            </div>;
          })}
        </div>)}
      {data && data.total > 0 && <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />}
      {sel && <EntryDrawer open onClose={() => setSel(null)} kind="activity" entry={sel} title={sel.title} subtitle={sel.detail} statuses={[sel.status, sel.group].filter(Boolean)} amount={sel.amount} amountSign={sel.amount != null ? "credit" : undefined} />}
    </Card>
  );
};

/* ---------- logs — date-grouped, expandable, click for detail + error reason (#14) ---------- */
const LogsList = ({ role, uid }) => {
  const [q, setQ] = useState(""); const dq = useDebounce(q); const [type, setType] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [dq, type]);
  const params = useMemo(() => ({ q: dq, type, page, page_size: 200 }), [dq, type, page]);
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/logs`, params);
  const [openDays, setOpenDays] = useState({}); const [sel, setSel] = useState(null);
  const groups = useMemo(() => { const items = data?.items || []; const out = []; const idx = {}; items.forEach((e) => { const k = dt(e.created_at, false) || "—"; if (idx[k] === undefined) { idx[k] = out.length; out.push([k, []]); } out[idx[k]][1].push(e); }); return out; }, [data]);
  useEffect(() => { if (groups.length) setOpenDays((o) => (Object.keys(o).length ? o : { [groups[0][0]]: true })); }, [groups]);
  const isErr = (e) => !!(e.meta?.error || e.meta?.success === false || e.level === "error" || /error|fail|declin|denied|could not|unable/i.test(`${e.action} ${e.detail}`));
  return <Card data-testid="section-logs">
    <div className="flex flex-col lg:flex-row lg:items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
      <SearchBox value={q} onChange={setQ} placeholder="Search logs…" testId="logs-search" />
      <Select testId="logs-type" value={type} onChange={setType} options={[{ value: "admin", label: "Admin" }, { value: role, label: "User" }, { value: "system", label: "System" }]} placeholder="All actors" />
    </div>
    {loading && !data ? <Skeleton rows={7} cols={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items?.length ? <Empty icon={ScrollText} title="No logs recorded" hint="Every key action on this profile is logged here (kept for 30 days)." /> : (
      <div className="p-3 space-y-2" data-testid="logs-list">{groups.map(([day, logs]) => {
        const isOpen = !!openDays[day];
        return <div key={day} className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
          <button data-testid={`logs-day-${day}`} onClick={() => setOpenDays((o) => ({ ...o, [day]: !o[day] }))} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
            <span className="font-bold text-sm">{day}</span>
            <span className="ml-auto text-xs font-semibold text-slate-400">{logs.length} log{logs.length > 1 ? "s" : ""}</span>
          </button>
          {isOpen && <ul className="divide-y divide-slate-100 dark:divide-slate-800">{logs.map((e) => { const err = isErr(e);
            return <li key={e.id}><button onClick={() => setSel(e)} data-testid={`log-item-${e.id}`} className="w-full text-left flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
              <span className={`h-2 w-2 rounded-full shrink-0 ${err ? "bg-rose-500" : e.actor_role === "admin" ? "bg-amber-500" : e.actor_role === "system" ? "bg-slate-400" : "bg-primary-500"}`} />
              <div className="flex-1 min-w-0"><p className="font-semibold capitalize flex items-center gap-1.5">{(e.action || "").replace(/_/g, " ")}{err && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded"><ShieldAlert className="h-2.5 w-2.5" />ERROR</span>}</p><p className="text-xs text-slate-500 truncate">{e.detail || e.meta?.error || "—"}</p></div>
              <div className="text-right text-xs"><p className="font-medium">{e.actor_name || e.actor_role}</p><p className="text-slate-400">{e.created_at ? new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</p></div>
            </button></li>; })}</ul>}
        </div>;
      })}</div>)}
    {data && data.total > 0 && <Pager page={data.page} pages={data.pages} total={data.total} pageSize={200} onPage={setPage} />}
    {sel && <EntryDrawer open onClose={() => setSel(null)} kind="log" entry={sel} title={(sel.action || "Log").replace(/_/g, " ")} subtitle={sel.detail} statuses={[sel.actor_role, isErr(sel) ? "error" : null].filter(Boolean)} highlight={[{ k: "Actor", v: sel.actor_name || sel.actor_role }, { k: "Action", v: (sel.action || "").replace(/_/g, " ") }, { k: "When", v: dt(sel.created_at) }, { k: "Detail", v: sel.detail }, { k: "Error reason", v: sel.meta?.error || sel.meta?.reason || sel.meta?.message }]} />}
  </Card>;
};

/* ---------- profile change history ---------- */
const ProfileChanges = ({ role, uid, onReviewed }) => {
  const [status, setStatus] = useState(""); const [range, setRange] = useState({ from: "", to: "" }); const [page, setPage] = useState(1);
  const [doc, setDoc] = useState(null);
  const params = useMemo(() => ({ status: status || "all", date_from: range.from, date_to: range.to, page, page_size: 20 }), [status, range, page]);
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/profile-changes`, params);
  const review = async (id) => { try { await api.post(`/admin/people/profile-updates/${id}/review`); invalidatePaged("/admin/people"); reload(); onReviewed?.(); toast.success("Marked as reviewed"); } catch { toast.error("Failed"); } };
  const groups = useMemo(() => { const g = {}; (data?.items || []).forEach((c) => { const k = dt(c.changed_at, false); (g[k] = g[k] || []).push(c); }); return Object.entries(g); }, [data]);
  return (
    <Card data-testid="section-profile-changes">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
        <Tabs tabs={[{ key: "", label: "All" }, { key: "unread", label: "Unreviewed" }, { key: "reviewed", label: "Reviewed" }]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} counts={data?.summary ? { unread: data.summary.unread, reviewed: data.summary.reviewed, "": data.summary.all } : {}} />
        <div className="lg:ml-auto"><RangeCalendar value={range} onChange={(r) => { setRange(r); setPage(1); }} label="Changed date" testId="changes-date" align="right" /></div>
      </div>
      {loading && !data ? <Skeleton rows={4} cols={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : !groups.length ? <Empty icon={History} title="No profile changes" hint="This user has not edited their profile yet." /> : (
        <div className="p-4 space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}><p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{day}</p>
              <div className="space-y-2">{items.map((c) => (
                <div key={c.id} data-testid={`change-${c.id}`} className={`rounded-xl ring-1 p-3 ${c.reviewed ? "ring-slate-200 dark:ring-slate-800" : "ring-red-200 dark:ring-red-900/40 bg-red-50/30 dark:bg-red-900/10"}`}>
                  <div className="flex flex-wrap items-center gap-2"><Sparkles className="h-4 w-4 text-primary-500" /><p className="text-sm font-semibold">Profile updated</p><Pill s={c.reviewed ? "reviewed" : "unreviewed"} size="xs" /><span className="text-xs text-slate-400 ml-auto">{new Date(c.changed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · via {c.updated_from} · {c.section}</span>{!c.reviewed && <button onClick={() => review(c.id)} data-testid={`change-review-${c.id}`} className="h-7 px-2.5 rounded-lg bg-primary-600 text-white text-[11px] font-bold">Mark reviewed</button>}</div>
                  <div className="mt-3 space-y-2.5">{c.changes.map((ch, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">{ch.label}</p>
                      {(ch.old || ch.new) && (
                        <div className="flex flex-wrap items-center gap-2">
                          {ch.old ? <span className="inline-flex max-w-full items-center px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs line-through break-words">{ch.old}</span> : <span className="text-xs text-slate-400 italic">not set</span>}
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {ch.new ? <span className="inline-flex max-w-full items-center px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold break-words">{ch.new}</span> : <span className="text-xs text-slate-400 italic">removed</span>}
                        </div>
                      )}
                      {(ch.docs || []).map((d, di) => (
                        <div key={di} className="mt-1.5 flex flex-wrap items-center gap-2" data-testid={`change-doc-${c.id}-${di}`}>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{d.label}:</span>
                          {d.old_url ? <button onClick={() => setDoc({ url: d.old_url, kind: d.old_kind, label: `${d.label} (previous)` })} data-testid={`view-old-${c.id}-${di}`} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold ring-1 ring-rose-200 text-rose-700 dark:text-rose-300 dark:ring-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20"><Eye className="h-3 w-3" />View old</button> : <span className="text-[11px] text-slate-400">no previous</span>}
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          {d.new_url ? <button onClick={() => setDoc({ url: d.new_url, kind: d.new_kind, label: `${d.label} (new)` })} data-testid={`view-new-${c.id}-${di}`} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold ring-1 ring-emerald-200 text-emerald-700 dark:text-emerald-300 dark:ring-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"><Eye className="h-3 w-3" />View new</button> : <span className="text-[11px] text-slate-400">removed</span>}
                        </div>
                      ))}
                      {!ch.old && !ch.new && !(ch.docs || []).length && <span className="text-xs text-slate-400">{ch.masked ? "Updated (sensitive)" : "Changed"}</span>}
                    </div>))}</div>
                  {c.reviewed && <p className="text-[11px] text-slate-400 mt-1.5">Reviewed by {c.reviewed_by_name || "Admin"} · {dt(c.reviewed_at)}</p>}
                </div>))}</div>
            </div>))}
        </div>)}
      {data && data.total > 0 && <Pager page={data.page} pages={data.pages} total={data.total} pageSize={20} onPage={setPage} />}
      <DocLightbox doc={doc} onClose={() => setDoc(null)} />
    </Card>
  );
};

/* ---------- misc sections ---------- */
/* ---------- document viewer (shows the actual uploaded image / PDF) ---------- */
const DocThumb = ({ doc, onOpen }) => (
  <button type="button" onClick={() => onOpen(doc)} data-testid={`doc-${doc.type}`}
    className="group relative rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-800/60 text-left hover:ring-primary-400 transition">
    <div className="h-28 w-full grid place-items-center overflow-hidden">
      {doc.kind === "pdf"
        ? <div className="flex flex-col items-center text-rose-500"><FileText className="h-9 w-9" /><span className="text-[10px] font-bold mt-1">PDF</span></div>
        : <img src={doc.url} alt={doc.label} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />}
    </div>
    <div className="px-2 py-1.5 border-t border-slate-100 dark:border-slate-800"><p className="text-[11px] font-semibold truncate">{doc.label}</p></div>
  </button>
);

const DocLightbox = ({ doc, onClose }) => {
  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4" data-testid="doc-lightbox" onClick={onClose}>
      <div className="max-w-3xl w-full max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <FileText className="h-4 w-4 text-primary-600" /><p className="font-bold text-sm">{doc.label}</p>
          <a href={doc.url} target="_blank" rel="noreferrer" className="ml-auto text-xs font-bold text-primary-700 underline">Open in new tab</a>
          <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><XCircle className="h-5 w-5" /></button>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-950 grid place-items-center max-h-[80vh] overflow-auto">
          {doc.kind === "pdf"
            ? <iframe title={doc.label} src={doc.url} className="w-full h-[75vh] rounded-lg bg-white" />
            : <img src={doc.url} alt={doc.label} className="max-w-full max-h-[80vh] object-contain rounded-lg" />}
        </div>
      </div>
    </div>
  );
};

const docKind = (u) => (String(u || "").toLowerCase().split("?")[0].endsWith(".pdf") ? "pdf" : "image");

const DocsGallery = ({ docs }) => {
  const [open, setOpen] = useState(null);
  if (!docs?.length) return null;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" data-testid="viewable-documents">{docs.map((d, i) => <DocThumb key={d.type + i} doc={d} onOpen={setOpen} />)}</div>
      <DocLightbox doc={open} onClose={() => setOpen(null)} />
    </>
  );
};

/* ---------- starter kit — delivery tracking + admin status control (#11) ---------- */
const KIT_FLOW = [
  { key: "processing", label: "Preparing" },
  { key: "shipped", label: "Shipped" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];
const StarterKit = ({ role, uid }) => {
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/starter-kit`, useMemo(() => ({}), []));
  const [busy, setBusy] = useState("");
  const setStage = async (id, status) => {
    setBusy(id + status);
    try { await api.post(`/starter-kit/admin/purchases/${id}/tracking`, { status }); toast.success("Delivery status updated — partner notified"); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
    finally { setBusy(""); }
  };
  if (loading && !data) return <Skeleton rows={3} cols={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const items = data?.items || [];
  if (!items.length) return <Empty icon={Package} title="No starter kit purchases" hint="This partner hasn't bought the AzoApp Pro starter kit yet." />;
  return <div className="space-y-4" data-testid="section-starter-kit">{items.map((r) => {
    const cur = r.tracking_status || "processing";
    const curIdx = KIT_FLOW.findIndex((s) => s.key === cur);
    return <Card key={r.id} className="p-5" data-testid={`kit-${r.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-primary-50 dark:bg-primary-900/30 grid place-items-center"><Package className="h-5 w-5 text-primary-600" /></div>
        <div className="flex-1 min-w-0"><p className="font-bold">AzoApp Pro Starter Kit · <Money v={r.amount} /></p><p className="text-xs text-slate-400">{dt(r.created_at)} · {r.method || "—"} · {r.order_id || r.payment_id || ""}</p></div>
        <Pill s={r.status} />
      </div>
      <div className="mt-5 flex items-center" data-testid={`kit-stepper-${r.id}`}>{KIT_FLOW.map((s, i) => {
        const done = i <= curIdx; const isCur = i === curIdx;
        return <div key={s.key} className="contents">
          <div className="flex flex-col items-center gap-1.5 shrink-0 w-16">
            <div className={`h-9 w-9 rounded-full grid place-items-center text-xs font-bold ${done ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"} ${isCur ? "ring-4 ring-emerald-200 dark:ring-emerald-900/40" : ""}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</div>
            <span className={`text-[10px] font-semibold text-center leading-tight ${done ? "text-emerald-700 dark:text-emerald-300" : "text-slate-400"}`}>{s.label}</span>
          </div>
          {i < KIT_FLOW.length - 1 && <div className={`h-0.5 flex-1 mx-1 mb-4 ${i < curIdx ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />}
        </div>;
      })}</div>
      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Update delivery status</p>
        <div className="flex flex-wrap gap-2">{KIT_FLOW.map((s) => (
          <button key={s.key} data-testid={`kit-stage-${r.id}-${s.key}`} disabled={busy === r.id + s.key || s.key === cur} onClick={() => setStage(r.id, s.key)}
            className={`h-9 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${s.key === cur ? "bg-emerald-600 text-white cursor-default" : "ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50"}`}>
            {busy === r.id + s.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : s.key === cur ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{s.label}</button>))}</div>
        <p className="text-[11px] text-slate-400 mt-2">Partner sees this live in their app and gets a notification on each change.</p>
      </div>
    </Card>;
  })}</div>;
};

/* ---------- registration documents card (Profile tab) ---------- */
const ProfileDocs = ({ role, uid }) => {
  const { data, loading, error } = usePaged(`/admin/people/${role}/${uid}/sections/kyc`, useMemo(() => ({}), []));
  const docs = data?.viewable_documents || [];
  if (loading && !data) return <Card className="p-5" data-testid="profile-docs-loading"><Skeleton rows={2} cols={3} /></Card>;
  if (error) return null;
  return (
    <Card className="p-5" data-testid="profile-docs">
      <h3 className="font-bold mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary-600" />Uploaded documents & photos</h3>
      {docs.length ? <DocsGallery docs={docs} /> : <p className="text-sm text-slate-400 flex items-center gap-1.5"><FileWarning className="h-4 w-4" />No documents uploaded at registration.</p>}
    </Card>
  );
};

/* ---------- map helpers (#5) ---------- */
const latOf = (a) => a?.lat ?? a?.latitude;
const lngOf = (a) => a?.lng ?? a?.longitude;
const mapsDirUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
const NavigateBtn = ({ lat, lng, className = "" }) => {
  if (lat == null || lng == null) return null;
  return (
    <a href={mapsDirUrl(lat, lng)} target="_blank" rel="noreferrer" data-testid="navigate-map-btn"
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl font-bold text-xs text-white bg-primary-600 hover:bg-primary-700 shadow ${className}`}>
      <Navigation className="h-3.5 w-3.5" />Navigate on map
    </a>
  );
};


const Addresses = ({ role, uid }) => {
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/addresses`, useMemo(() => ({}), []));
  if (loading && !data) return <Skeleton rows={3} cols={3} />; if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.items?.length) return <Card><Empty icon={MapPin} title="No saved addresses" /></Card>;
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="section-addresses">{data.items.map((a, i) => (
    <Card key={a.id || i} className="p-4"><div className="flex items-center gap-2 mb-2"><MapPin className="h-4 w-4 text-primary-600" /><p className="font-bold">{a.label || "Address"}</p>{a.is_default && <Pill s="active">Default</Pill>}{a.source && <Pill s={a.source} size="xs" />}</div>
      <p className="text-sm text-slate-700 dark:text-slate-200">{[a.line, a.wing, a.flat_no && `Flat ${a.flat_no}`, a.floor && `Floor ${a.floor}`].filter(Boolean).join(", ") || a.address || "—"}</p>
      <KV cols={2} items={[{ k: "City", v: a.city }, { k: "District", v: a.district }, { k: "State", v: a.state }, { k: "Pincode", v: a.pincode }, { k: "Landmark", v: a.landmark }, { k: "Property", v: a.property_type }, { k: "Lat / Lng", v: (latOf(a)) && `${latOf(a)}, ${lngOf(a)}` }, { k: "Instructions", v: a.instructions }]} />
      {latOf(a) != null && <div className="mt-2.5"><NavigateBtn lat={latOf(a)} lng={lngOf(a)} /></div>}
    </Card>))}</div>;
};
const BankKyc = ({ role, uid }) => {
  const bank = usePaged(`/admin/people/${role}/${uid}/sections/bank`, useMemo(() => ({}), []));
  const kyc = usePaged(`/admin/people/${role}/${uid}/sections/kyc`, useMemo(() => ({}), []));
  const [busy, setBusy] = useState("");
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState("");
  const act = async (kind, id, action, why) => {
    if (action === "reject" && !String(why || "").trim()) { toast.error("A rejection reason is required"); return; }
    setBusy(id);
    try {
      const url = kind === "bank" ? `/admin/${role}/finance/banks/${id}/action` : `/admin/${role}/${uid}/finance/pan/action`;
      await api.post(url, { action, reason: (why || "").trim() });
      toast.success(`${kind === "bank" ? "Bank account" : "PAN"} ${action === "approve" ? "approved" : "rejected"}`);
      setReject(null); setReason(""); bank.reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
    finally { setBusy(""); }
  };
  const reviewButtons = ({ kind, id, name, status }) => (status === "approved"
    ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"><Lock className="h-3 w-3" />Verified &amp; locked</span>
    : <div className="flex items-center gap-2">
        <button data-testid={`${kind}-approve-${id}`} disabled={busy === id} onClick={() => act(kind, id, "approve", "")} className="h-8 px-3 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">{busy === id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}Approve</button>
        <button data-testid={`${kind}-reject-${id}`} disabled={busy === id} onClick={() => { setReject({ kind, id, name }); setReason(""); }} className="h-8 px-3 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-300 ring-1 ring-rose-300 dark:ring-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 inline-flex items-center gap-1"><XCircle className="h-3 w-3" />Reject</button>
      </div>);
  if ((bank.loading && !bank.data) || (kyc.loading && !kyc.data)) return <Skeleton rows={4} cols={3} />;
  if (bank.error || kyc.error) return <ErrorState error={bank.error || kyc.error} onRetry={() => { bank.reload(); kyc.reload(); }} />;
  const k = kyc.data || {}, b = bank.data || {};
  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-testid="section-bank-kyc">
    <Card className="p-5"><div className="flex items-center gap-2 mb-3"><ShieldCheck className="h-5 w-5 text-primary-600" /><h3 className="font-bold">KYC &amp; verification</h3><Pill s={k.kyc_status || "pending"} className="ml-auto" /></div>
      <KV cols={2} items={[{ k: "Verified", v: k.verified ? "Yes" : "No" }, { k: "Stage", v: k.verification_stage }, { k: "Submitted", v: k.submitted_at && dt(k.submitted_at) }, { k: "Reviewed", v: k.reviewed_at && dt(k.reviewed_at) }, { k: "Rejection reason", v: k.rejection_reason }, { k: "PAN", v: k.kyc?.pan || k.kyc?.pan_number || b.pan?.pan || b.pan?.pan_number }, { k: "Aadhaar", v: k.kyc?.aadhaar || k.kyc?.aadhaar_number }]} />
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mt-4 mb-2">Uploaded documents</p>
      {k.viewable_documents?.length
        ? <DocsGallery docs={k.viewable_documents} />
        : <p className="text-sm text-slate-400 flex items-center gap-1.5"><FileWarning className="h-4 w-4" />No documents uploaded yet.</p>}
    </Card>
    <div className="space-y-4">
      {(b.pan || role !== "customer") && (
        <Card className="p-5" data-testid="pan-card"><div className="flex items-center gap-2 mb-3"><CreditCard className="h-5 w-5 text-primary-600" /><h3 className="font-bold">PAN verification</h3><Pill s={(b.pan?.status) || "pending"} className="ml-auto" /></div>
          {b.pan ? <>
            <KV cols={2} items={[{ k: "PAN number", v: b.pan.pan || b.pan.pan_number || b.pan.number }, { k: "Name on PAN", v: b.pan.name || b.pan.holder }, { k: "Submitted", v: b.pan.submitted_at && dt(b.pan.submitted_at) }, { k: "Reviewed", v: b.pan.reviewed_at && dt(b.pan.reviewed_at) }, { k: "Reason", v: b.pan.reason }]} />
            {(b.pan_documents || []).length > 0 && <div className="mt-3"><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">PAN card image</p><DocsGallery docs={b.pan_documents} /></div>}
            <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-400">Approving locks it — the {role} can no longer edit their PAN.</span>{reviewButtons({ kind: "pan", id: uid, name: "PAN", status: b.pan.status })}</div>
          </> : <p className="text-sm text-slate-400 flex items-center gap-1.5"><FileWarning className="h-4 w-4" />PAN not submitted yet.</p>}
        </Card>)}
      <Card className="p-5"><div className="flex items-center gap-2 mb-3"><Landmark className="h-5 w-5 text-primary-600" /><h3 className="font-bold">Bank accounts</h3><Pill s="reviewed" className="ml-auto">{(b.banks || []).length} account(s)</Pill></div>
        {b.upi && <p className="text-sm mb-3"><span className="text-slate-400">UPI:</span> <b>{b.upi}</b></p>}
        {b.banks?.length ? <div className="space-y-2.5">{b.banks.map((x) => <div key={x.id} className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 p-3" data-testid={`bank-${x.id}`}><div className="flex items-center gap-2"><p className="font-semibold">{x.bank_name || "Bank"}</p>{x.is_primary && <Pill s="active">Primary</Pill>}<Pill s={x.status} className="ml-auto" /></div><KV cols={2} items={[{ k: "Holder", v: x.account_holder }, { k: "Account", v: x.account_number }, { k: "IFSC", v: x.ifsc }, { k: "UPI", v: x.upi_id }, { k: "Submitted", v: x.submitted_at && dt(x.submitted_at) }, { k: "Reviewed", v: x.reviewed_at && dt(x.reviewed_at) }, { k: "Reason", v: x.reason }]} />{(x.passbook_url || x.cancelled_cheque || x.cheque_url) && <div className="mt-2.5"><p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">Passbook / cheque</p><DocsGallery docs={[{ type: `pb-${x.id}`, label: `${x.bank_name || "Bank"} passbook`, url: x.passbook_url || x.cancelled_cheque || x.cheque_url, kind: docKind(x.passbook_url || x.cancelled_cheque || x.cheque_url) }]} /></div>}<div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">{reviewButtons({ kind: "bank", id: x.id, name: x.bank_name || "Bank", status: x.status })}</div></div>)}</div> : <Empty icon={Landmark} title="No bank accounts" hint="The partner adds these from their app; each one needs admin review before payouts." />}
      </Card>
    </div>
    {reject && (
      <Modal title={`Reject ${reject.kind === "bank" ? "bank account" : "PAN"}`} icon={ShieldAlert} onClose={() => setReject(null)}
        footer={<><button onClick={() => setReject(null)} className="h-10 px-4 rounded-xl font-bold text-slate-600 ring-1 ring-slate-200 dark:ring-slate-700">Cancel</button>
          <button data-testid="finance-reject-confirm" onClick={() => act(reject.kind, reject.id, "reject", reason)} disabled={!reason.trim() || busy === reject.id} className="h-10 px-5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2">{busy === reject.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Reject &amp; notify</button></>}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Rejecting <b>{reject.name}</b>. The reason is shared with the {role} so they can correct and resubmit.</p>
        <textarea data-testid="finance-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Name on bank account does not match PAN" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-rose-400" />
      </Modal>)}
  </div>;
};
const SimpleList = ({ role, uid, name, render, icon = Package, title = "No records", typeOptions, onRow }) => {
  const [page, setPage] = useState(1); const [q, setQ] = useState(""); const dq = useDebounce(q); const [type, setType] = useState("");
  const params = useMemo(() => ({ page, page_size: 25, q: dq, type }), [page, dq, type]);
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/${name}`, params);
  return <Card data-testid={`section-${name}`}>
    <div className="flex gap-2 p-3 border-b border-slate-100 dark:border-slate-800"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search…" testId={`${name}-search`} />{typeOptions && <Select value={type} onChange={(v) => { setType(v); setPage(1); }} options={typeOptions} placeholder="All types" />}</div>
    {loading && !data ? <Skeleton rows={4} cols={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items?.length ? <Empty icon={icon} title={title} /> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{data.items.map((r, i) => <div key={r.id || i} className={`px-4 py-3 ${onRow ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition" : ""}`} onClick={onRow ? () => onRow(r) : undefined} data-testid={onRow ? `${name}-row-${i}` : undefined}>{render(r, data)}</div>)}</div>}
    {data && data.total > 0 && <Pager page={data.page} pages={data.pages} total={data.total} pageSize={25} onPage={setPage} />}
  </Card>;
};

/* ---------- approval / rejection workflow ---------- */
const REJECT_PRESETS = ["Incomplete KYC", "Invalid documents", "Incorrect information", "Service category not supported", "Duplicate registration", "Other"];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const RejectDialog = ({ role, name, onCancel, onConfirm, busy }) => {
  const [preset, setPreset] = useState("Incomplete KYC");
  const [detail, setDetail] = useState("");
  const finalReason = preset === "Other" ? detail.trim() : (detail.trim() ? `${preset} — ${detail.trim()}` : preset);
  const valid = finalReason.length > 0;
  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm md:p-4" data-testid="reject-modal" onClick={onCancel}>
      <div className="w-full md:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl md:rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl grid place-items-center bg-rose-50 text-rose-600 dark:bg-rose-900/30"><ShieldAlert className="h-5 w-5" /></span>
          <div><h3 className="font-bold text-slate-900 dark:text-white">Reject {role}</h3><p className="text-xs text-slate-500 truncate">{name} · a reason is required and shared with the {role}</p></div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Select a reason</p>
            <div className="flex flex-wrap gap-2">
              {REJECT_PRESETS.map((r) => (
                <button key={r} data-testid={`reject-preset-${r}`} onClick={() => setPreset(r)} className={`px-3 py-1.5 rounded-full text-sm font-semibold ring-1 transition ${preset === r ? "bg-rose-600 text-white ring-rose-600" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:ring-rose-300"}`}>{r}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">{preset === "Other" ? "Reason (required)" : "Additional detail (optional)"}</p>
            <textarea data-testid="reject-reason-input" value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} placeholder={preset === "Other" ? "Describe the reason for rejection…" : "Add any specifics the applicant should fix…"} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 outline-none resize-none" />
            <p className="mt-2 text-xs text-slate-500">Will be sent as: <span className="font-semibold text-slate-700 dark:text-slate-200">{finalReason || "—"}</span></p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="h-10 px-4 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button data-testid="reject-confirm" onClick={() => onConfirm(finalReason)} disabled={!valid || busy} className="h-10 px-5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Reject {role}</button>
        </div>
      </div>
    </div>
  );
};

const ReviewStrip = ({ role, uid, u, onDone }) => {
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = u.kyc_status || "pending";
  const act = async (decision, reason) => {
    setBusy(true);
    try {
      await api.post(`/admin/people/${role}/${uid}/review`, { decision, reason });
      toast.success(decision === "approve" ? `${cap(role)} approved successfully` : `${cap(role)} application rejected`);
      setShowReject(false);
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed. Please try again.");
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800" data-testid="review-strip">
      {status === "rejected" && (
        <div className="mb-3 rounded-xl ring-1 ring-rose-200 dark:ring-rose-900/40 bg-rose-50/70 dark:bg-rose-900/20 px-4 py-3" data-testid="rejection-banner">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-sm"><ShieldAlert className="h-4 w-4" />Application rejected</div>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-200"><span className="font-semibold">Reason:</span> {u.rejection_reason || "Not provided"}</p>
          <p className="mt-0.5 text-xs text-rose-600/80 dark:text-rose-300/70">{u.kyc_reviewed_at ? dt(u.kyc_reviewed_at) : ""}{u.kyc_reviewed_by_name ? ` · by ${u.kyc_reviewed_by_name}` : ""}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Registration status:</span>
        <Pill s={status}>{status}</Pill>
        {status === "approved" && u.kyc_reviewed_by_name && <span className="text-xs text-slate-400">approved by {u.kyc_reviewed_by_name}{u.kyc_reviewed_at ? ` · ${dt(u.kyc_reviewed_at, false)}` : ""}</span>}
        <div className="ml-auto flex items-center gap-2">
          {status !== "approved" && <button data-testid="approve-btn" onClick={() => act("approve")} disabled={busy} className="h-10 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Approve</button>}
          {status !== "rejected" && <button data-testid="reject-btn" onClick={() => setShowReject(true)} disabled={busy} className="h-10 px-4 rounded-xl font-bold text-rose-700 dark:text-rose-300 ring-1 ring-rose-300 dark:ring-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 inline-flex items-center gap-2"><XCircle className="h-4 w-4" />Reject</button>}
        </div>
      </div>
      {showReject && <RejectDialog role={role} name={u.shop_name || u.name} busy={busy} onCancel={() => setShowReject(false)} onConfirm={(reason) => act("reject", reason)} />}
    </div>
  );
};


/* ---------- tab registry ---------- */
/* ---------- admin actions toolbar: Edit / Suspend / SMS / Email / Push (#3) ---------- */
const Modal = ({ title, icon: Icon, onClose, children, footer, wide }) => (
  <div className="fixed inset-0 z-[75] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm md:p-4" onClick={onClose}>
    <div className={`w-full ${wide ? "md:max-w-2xl" : "md:max-w-lg"} bg-white dark:bg-slate-900 rounded-t-2xl md:rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        {Icon && <Icon className="h-5 w-5 text-primary-600" />}<h3 className="font-bold">{title}</h3>
        <button onClick={onClose} className="ml-auto h-7 w-7 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><XCircle className="h-5 w-5" /></button>
      </div>
      <div className="p-5 space-y-3 max-h-[70vh] overflow-auto">{children}</div>
      {footer && <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">{footer}</div>}
    </div>
  </div>
);

const Inp = (props) => <input {...props} className={`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-400 outline-none ${props.className || ""}`} />;

const ActionBtn = ({ icon: Icon, label, onClick, tone = "" }) => (
  <button onClick={onClick} data-testid={`action-${label.toLowerCase()}`}
    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl font-bold text-xs ring-1 transition ${tone || "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700 hover:ring-primary-300"}`}>
    <Icon className="h-3.5 w-3.5" />{label}
  </button>
);

const renderTpl = (text, vars) => (text || "").replace(/\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}/g, (m, k) => (vars[k] ?? m));

const PersonActions = ({ role, uid, u, onDone, onDeleted }) => {
  const [modal, setModal] = useState(null);  // 'edit' | 'suspend' | 'email' | 'push'
  const [busy, setBusy] = useState(false);
  const suspended = !!(u.suspended || u.status_label === "suspended");
  const [form, setForm] = useState({});
  // template picker state (email / push)
  const [tpls, setTpls] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplQ, setTplQ] = useState("");
  const [sel, setSel] = useState(null);
  const [vars, setVars] = useState({});

  const open = (m) => {
    if (m === "edit") setForm({
      name: u.name || "", email: u.email || "", alternate_mobile: u.alternate_mobile || "",
      gender: u.gender || "", dob: u.dob || "", language: u.language || "",
      city: u.city || "", state: u.state || "", pincode: u.pincode || "", landmark: u.landmark || "",
      ...(role === "partner" ? { skills: Array.isArray(u.skills) ? u.skills.join(", ") : (u.skills || ""), service_pincodes: Array.isArray(u.service_pincodes) ? u.service_pincodes.join(", ") : (u.service_pincodes || "") } : {}),
      ...(role === "merchant" ? { shop_name: u.shop_name || "", shop_type: u.shop_type || "", company_name: u.company_name || "", gst_number: u.gst_number || "" } : {}),
    });
    else if (m === "suspend") setForm({ reason: "", days: "" });
    else if (m === "delete") setForm({ reason: "", confirm: false });
    setModal(m);
  };
  useEffect(() => {
    if (modal !== "email" && modal !== "push") return;
    setSel(null); setVars({}); setTplQ(""); setTplLoading(true);
    api.get("/admin/partners/notify-templates", { params: { channel: modal } })
      .then((r) => setTpls(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTpls([]))
      .finally(() => setTplLoading(false));
  }, [modal]);
  const pickTpl = (t) => {
    // Pre-fill known variables from the person's own record (admin can still edit).
    const ctx = {
      name: u.name || u.shop_name || "",
      shop_name: u.shop_name || "",
      phone: u.phone || "", mobile: u.phone || "",
      email: u.email || "",
      city: u.city || "", state: u.state || "",
      partner_code: u.partner_code || "", merchant_code: u.merchant_code || "",
      business: "AzoApp", brand: "AzoApp",
    };
    setSel(t);
    setVars(Object.fromEntries((t.variables || []).map((v) => [v, ctx[v] ?? ""])));
  };
  const filteredTpls = tpls.filter((t) => (t.name || "").toLowerCase().includes(tplQ.toLowerCase()) || (t.subject || "").toLowerCase().includes(tplQ.toLowerCase()));

  const call = async (fn) => { setBusy(true); try { await fn(); onDone?.(); setModal(null); } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); } finally { setBusy(false); } };
  const doEdit = () => call(async () => {
    const payload = { ...form };
    if (role === "partner") {
      payload.skills = String(form.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
      payload.service_pincodes = String(form.service_pincodes || "").split(",").map((s) => s.trim()).filter(Boolean);
    }
    const r = await api.post(`/admin/people/${role}/${uid}/edit`, payload);
    toast.success(`Updated ${(r.data?.updated || []).join(", ") || "profile"}`);
  });
  const doSuspend = () => call(async () => { await api.post(`/admin/people/${role}/${uid}/suspend`, { suspend: !suspended, reason: form.reason, days: Number(form.days) || 0 }); toast.success(suspended ? "Reinstated" : "Suspended"); });
  const doRestore = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/people/${role}/${uid}/restore`);
      toast.success(`${u.name || "Account"} restored`);
      invalidatePaged("/admin/people");
      onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Restore failed"); }
    finally { setBusy(false); }
  };
  const doPurge = async () => {
    setModal(null);
    setBusy(true);
    try {
      await api.post(`/admin/people/${role}/${uid}/purge`);
      toast.success(`${u.name || "Account"} permanently deleted`);
      invalidatePaged("/admin/people");
      onDeleted?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
    finally { setBusy(false); }
  };
  // Destructive: delete does NOT use `call` (which refreshes the now-gone profile) — it redirects back to the list instead.
  const doDelete = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/people/${role}/${uid}/delete`, { reason: form.reason || "" });
      toast.success(`${u.name || "Account"} deleted permanently`);
      invalidatePaged("/admin/people");
      setModal(null);
      onDeleted?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
    finally { setBusy(false); }
  };
  const doSendTpl = () => call(async () => { const r = await api.post(`/admin/people/${role}/${uid}/message`, { channel: modal, template_id: sel.id, variables: vars }); toast.success(r.data?.note || `${modal.toUpperCase()} sent to ${u.name}`); });

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="person-actions">
      <ActionBtn icon={Pencil} label="Edit" onClick={() => open("edit")} />
      <ActionBtn icon={Ban} label={suspended ? "Unsuspend" : "Suspend"} onClick={() => open("suspend")}
        tone={suspended ? "bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700" : "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 ring-rose-200 dark:ring-rose-800 hover:ring-rose-300"} />
      <ActionBtn icon={Mail} label="Email" onClick={() => open("email")} />
      <ActionBtn icon={BellRing} label="Push" onClick={() => open("push")} />
      {u.deleted
        ? <><ActionBtn icon={RotateCcw} label="Restore" onClick={doRestore} tone="bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700" /><ActionBtn icon={Trash2} label="Delete forever" onClick={() => setModal("purge")} tone="bg-rose-600 text-white ring-rose-600 hover:bg-rose-700" /></>
        : <ActionBtn icon={Trash2} label="Delete" onClick={() => open("delete")} tone="bg-rose-600 text-white ring-rose-600 hover:bg-rose-700" />}

      {modal === "purge" && (
        <Modal title="Delete forever?" icon={Trash2} onClose={() => setModal(null)}
          footer={<><button onClick={() => setModal(null)} className="h-10 px-4 rounded-xl font-bold text-slate-600 ring-1 ring-slate-200 dark:ring-slate-700">Cancel</button><button onClick={doPurge} disabled={busy} data-testid="purge-confirm" className="h-10 px-5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Delete forever</button></>}>
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 ring-1 ring-rose-200 dark:ring-rose-800 p-3 flex gap-2.5">
            <FileWarning className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700 dark:text-rose-300">This permanently removes <b>{u.name || "this account"}</b> ({u.phone}) — it <b>cannot be undone</b>. Past bookings, invoices and financial records are kept for audit.</p>
          </div>
        </Modal>)}
      {modal === "delete" && (
        <Modal title={`Delete ${role} account`} icon={Trash2} onClose={() => setModal(null)}
          footer={<><button onClick={() => setModal(null)} className="h-10 px-4 rounded-xl font-bold text-slate-600 ring-1 ring-slate-200 dark:ring-slate-700">Cancel</button>
            <button onClick={doDelete} disabled={busy || !form.confirm} data-testid="delete-confirm" className="h-10 px-5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Delete permanently</button></>}>
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 ring-1 ring-rose-200 dark:ring-rose-800 p-3 mb-3 flex gap-2.5">
            <FileWarning className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700 dark:text-rose-300">This permanently deletes <b>{u.name || "this user"}</b> ({u.phone}) and their profile{role !== "customer" ? ", KYC & documents" : ""}. Past bookings, invoices and financial records are kept for audit. <b>This cannot be undone.</b></p>
          </div>
          <div className="mb-3"><label className="text-xs font-semibold text-slate-500">Reason (optional — logged)</label><textarea rows={2} value={form.reason || ""} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this account being deleted?" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-rose-400" /></div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input type="checkbox" data-testid="delete-confirm-check" checked={!!form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
            I understand this action is permanent.
          </label>
        </Modal>)}

      {modal === "edit" && role === "partner" && (
        <div className="fixed inset-0 z-[75] flex items-stretch md:items-center justify-center bg-slate-900/60 backdrop-blur-sm md:p-4" onClick={() => setModal(null)} data-testid="partner-edit-wizard">
          <div className="w-full md:max-w-3xl bg-slate-100 dark:bg-slate-900 md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-screen md:max-h-[94vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
              <span className="h-9 w-9 rounded-xl grid place-items-center bg-primary-50 text-primary-600 dark:bg-primary-900/30"><Pencil className="h-4.5 w-4.5" /></span>
              <div className="min-w-0 flex-1"><h3 className="font-bold text-slate-900 dark:text-white truncate">Edit partner — registration form</h3><p className="text-xs text-slate-500 truncate">{u.name} · {u.phone}</p></div>
              <button onClick={() => setModal(null)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><XCircle className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-3 sm:p-5 bg-white dark:bg-slate-900">
              <PartnerRegistration adminEdit embedded regBase={`/admin/partners/${uid}/reg`} lockedPhone={u.phone}
                onComplete={() => { setModal(null); onDone?.(); }} />
            </div>
          </div>
        </div>)}

      {modal === "edit" && role === "merchant" && (
        <div className="fixed inset-0 z-[75] flex items-stretch md:items-center justify-center bg-slate-900/60 backdrop-blur-sm md:p-4" onClick={() => setModal(null)} data-testid="merchant-edit-wizard">
          <div className="w-full md:max-w-3xl bg-slate-100 dark:bg-slate-900 md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-screen md:max-h-[94vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 shrink-0">
              <span className="h-9 w-9 rounded-xl grid place-items-center bg-primary-50 text-primary-600 dark:bg-primary-900/30"><Store className="h-4.5 w-4.5" /></span>
              <div className="min-w-0 flex-1"><h3 className="font-bold text-slate-900 dark:text-white truncate">Edit merchant — registration form</h3><p className="text-xs text-slate-500 truncate">{u.shop_name || u.name} · {u.phone}</p></div>
              <button onClick={() => setModal(null)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><XCircle className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-3 sm:p-5 bg-white dark:bg-slate-900">
              <MerchantRegistration adminEdit embedded regBase={`/admin/merchants/${uid}/reg`} lockedPhone={u.phone}
                onComplete={() => { setModal(null); onDone?.(); }} />
            </div>
          </div>
        </div>)}

      {modal === "edit" && role !== "partner" && role !== "merchant" && (
        <Modal wide title={`Edit ${role} — registration details`} icon={Pencil} onClose={() => setModal(null)}
          footer={<><button onClick={() => setModal(null)} className="h-10 px-4 rounded-xl font-bold text-slate-600 ring-1 ring-slate-200 dark:ring-slate-700">Cancel</button>
            <button onClick={doEdit} disabled={busy} data-testid="edit-save" className="h-10 px-5 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</button></>}>
          {[
            { title: "Personal details", icon: User, fields: [["name", "Full name"], ["email", "Email"], ["alternate_mobile", "Alternate mobile"], ["gender", "Gender", { options: ["Male", "Female", "Other"] }], ["dob", "Date of birth", { type: "date" }], ["language", "Language", { options: [{ value: "en", label: "English" }, { value: "hi", label: "Hindi" }] }]] },
            { title: "Location", icon: MapPin, fields: [["city", "City"], ["state", "State"], ["pincode", "Pincode"], ["landmark", "Landmark"]] },
            ...(role === "partner" ? [{ title: "Skills & service areas", icon: Wrench, fields: [["skills", "Skills (comma separated)"], ["service_pincodes", "Service pincodes (comma separated)"]] }] : []),
            ...(role === "merchant" ? [{ title: "Business", icon: Store, fields: [["shop_name", "Shop name"], ["shop_type", "Shop type"], ["company_name", "Company name"], ["gst_number", "GST number"]] }] : []),
          ].map((sec) => (
            <div key={sec.title} className="mb-1">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2 flex items-center gap-1.5"><sec.icon className="h-3.5 w-3.5" />{sec.title}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{sec.fields.map(([k, lbl, opt]) => (
                <div key={k} className={k === "landmark" || k === "skills" || k === "service_pincodes" || k === "company_name" ? "sm:col-span-2" : ""}>
                  <label className="text-xs font-semibold text-slate-500">{lbl}</label>
                  {opt?.options
                    ? <PremiumSelect data-testid={`edit-${k}`} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder="Select…" className="w-full rounded-xl"><option value="">Select…</option>{opt.options.map((o) => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}</PremiumSelect>
                    : <Inp data-testid={`edit-${k}`} type={opt?.type || "text"} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={lbl} />}
                </div>))}</div>
            </div>))}
          <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Locked — cannot be edited</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[["Mobile (login)", u.phone], ["Aadhaar", u.aadhaar_number || (u.aadhaar_front_url ? "Document on file" : "—")], ["Education", u.education_certificate_url ? "Certificate on file" : (u.education || "—")], ["KYC documents", "Manage in the Bank & KYC tab"]].map(([lbl, val]) => (
                <div key={lbl} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" /><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">{lbl}</p><p className="text-sm font-medium truncate">{val}</p></div></div>))}
            </div>
          </div>
        </Modal>)}

      {modal === "suspend" && (
        <Modal title={suspended ? `Reinstate ${role}` : `Suspend ${role}`} icon={Ban} onClose={() => setModal(null)}
          footer={<><button onClick={() => setModal(null)} className="h-10 px-4 rounded-xl font-bold text-slate-600 ring-1 ring-slate-200 dark:ring-slate-700">Cancel</button>
            <button onClick={doSuspend} disabled={busy || (!suspended && !form.reason?.trim())} data-testid="suspend-confirm" className={`h-10 px-5 rounded-xl font-bold text-white disabled:opacity-50 inline-flex items-center gap-2 ${suspended ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{suspended ? "Reinstate account" : "Suspend account"}</button></>}>
          {suspended
            ? <p className="text-sm text-slate-600 dark:text-slate-300">This will reinstate <b>{u.name}</b> and restore their access immediately.</p>
            : <>
              <div><label className="text-xs font-semibold text-slate-500">Reason (shared with the user)</label><textarea rows={3} value={form.reason || ""} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this account being suspended?" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-rose-400" /></div>
              <div><label className="text-xs font-semibold text-slate-500">Duration in days (optional — blank = indefinite)</label><Inp type="number" min="1" value={form.days || ""} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} placeholder="e.g. 7" /></div>
            </>}
        </Modal>)}

      {(modal === "email" || modal === "push") && (
        <Modal title={`Send ${modal === "email" ? "Email" : "Push"} · choose a template`} icon={modal === "email" ? Mail : BellRing} onClose={() => setModal(null)}
          footer={<><button onClick={() => setModal(null)} className="h-10 px-4 rounded-xl font-bold text-slate-600 ring-1 ring-slate-200 dark:ring-slate-700">Cancel</button>
            <button onClick={doSendTpl} disabled={busy || !sel} data-testid="message-send" className="h-10 px-5 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send {modal === "email" ? "Email" : "Push"}</button></>}>
          <p className="text-xs text-slate-500">To <b>{u.name}</b>{modal === "email" ? ` · ${u.email || "no email on file"}` : " · in-app + push"}</p>
          {/* searchable template list */}
          <div><label className="text-xs font-semibold text-slate-500">Template</label>
            <Inp data-testid="tpl-search" value={tplQ} onChange={(e) => setTplQ(e.target.value)} placeholder="Search templates…" />
            <div className="mt-2 max-h-40 overflow-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 divide-y divide-slate-100 dark:divide-slate-800" data-testid="tpl-list">
              {tplLoading ? <p className="p-3 text-xs text-slate-400">Loading templates…</p>
                : filteredTpls.length === 0 ? <p className="p-3 text-xs text-slate-400">No {modal} templates found. Create one in Notifications → Templates.</p>
                : filteredTpls.map((t) => (
                  <button key={t.id} data-testid={`tpl-opt-${t.id}`} onClick={() => pickTpl(t)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-primary-900/20 ${sel?.id === t.id ? "bg-primary-50 dark:bg-primary-900/30 font-semibold text-primary-700 dark:text-primary-200" : ""}`}>
                    {t.name}{t.subject ? <span className="block text-[11px] text-slate-400 truncate">{t.subject}</span> : null}
                  </button>))}
            </div>
          </div>
          {sel && (
            <>
              {(sel.variables || []).length > 0 && (
                <div className="space-y-2" data-testid="tpl-variables">
                  <label className="text-xs font-semibold text-slate-500">Fill in the template variables</label>
                  {sel.variables.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-primary-600 w-28 shrink-0 truncate">{`{{${v}}}`}</span>
                      <Inp data-testid={`tpl-var-${v}`} value={vars[v] ?? ""} onChange={(e) => setVars((p) => ({ ...p, [v]: e.target.value }))} placeholder={`Enter ${v}`} />
                    </div>))}
                </div>
              )}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3" data-testid="tpl-preview">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Preview</p>
                {modal === "email" && sel.subject && <p className="text-sm font-bold mb-1">{renderTpl(sel.subject, vars)}</p>}
                <div className="text-sm text-slate-700 dark:text-slate-200 prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: renderTpl(sel.body, vars) }} />
              </div>
            </>
          )}
          <p className="text-[11px] text-slate-400">If the {modal.toUpperCase()} gateway is not configured in the Integration Center, it is delivered as an in-app notification.</p>
        </Modal>)}
    </div>
  );
};


const TABS = {
  customer: [["overview", "Overview", Sparkles], ["profile", "Profile", User], ["bookings", "Bookings", ShoppingBag], ["invoices", "Invoices", FileText], ["refunds", "Refunds", RotateCcw], ["wallet", "Wallet", Wallet], ["payments", "Payments", CreditCard], ["addresses", "Addresses", MapPin], ["referrals", "Refer & Earn", Gift], ["changes", "Profile Changes", History], ["logs", "Logs", ScrollText]],
  partner: [["overview", "Overview", Sparkles], ["profile", "Profile", User], ["jobs", "Jobs", Wrench], ["wallet", "Wallet", Wallet], ["withdrawals", "Withdrawals", ArrowDownToLine], ["bank", "Bank & KYC", ShieldCheck], ["invoices", "Invoices", FileText], ["rewards", "Rewards & Penalties", Award], ["skills", "Skills", Star], ["starter-kit", "Starter Kit", Package], ["changes", "Profile Changes", History], ["logs", "Logs", ScrollText]],
  merchant: [["overview", "Overview", Sparkles], ["profile", "Owner & Shop", Store], ["bookings", "Bookings", ShoppingBag], ["customers", "Customers", Users], ["network", "Partner Network", Network], ["transactions", "Transactions", Receipt], ["wallet", "Wallet", Wallet], ["withdrawals", "Payouts", ArrowDownToLine], ["refunds", "Refunds", RotateCcw], ["bank", "KYC & Bank", ShieldCheck], ["referrals", "Referral Earnings", Gift], ["changes", "Profile Changes", History], ["logs", "Logs", ScrollText]],
};
const OVERVIEW_EXTRA = { page_size: 5 };
const BK_STATUS = ["searching", "assigned", "arrived_customer", "started", "completed", "paid", "cancelled", "pending", "on_hold"];

export default function Person360({ role, uid, onBack, onCountsChanged, onOpenUser }) {
  const [tab, setTab] = useState("overview");
  const [bid, setBid] = useState(null);
  const [entry, setEntry] = useState(null);
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/overview`, useMemo(() => ({}), []));
  const mobile = useIsMobile(900);
  const refresh = useCallback(() => { invalidatePaged("/admin/people"); reload(); onCountsChanged?.(); }, [reload, onCountsChanged]);
  const reviewAll = async () => { try { await api.post(`/admin/people/${role}/${uid}/profile-updates/review-all`); toast.success("All updates marked reviewed"); refresh(); } catch { toast.error("Failed"); } };
  useEffect(() => { setTab("overview"); }, [uid]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const u = data?.user || {}; const s = data?.stats || {}; const p = data?.profile || {};
  const tabs = TABS[role].map(([key, label, icon]) => ({ key, label, icon }));
  const name = u.shop_name && role === "merchant" ? u.shop_name : u.name;
  const code = u.partner_code || u.merchant_code || (u.id ? `ID ${String(u.id).slice(0, 8)}` : "");
  const kpis = {
    customer: [[IndianRupee, "Lifetime spend", money(s.total_spent), `AOV ${money(s.avg_order_value)}`, "emerald"], [ShoppingBag, "Bookings", s.bookings_count, `${s.completed_count ?? 0} done · ${s.active_count ?? 0} active · ${s.cancelled_count ?? 0} cancelled`, "primary"], [Wallet, "Wallet", money(s.wallet), `${money(s.wallet_credits)} in · ${money(s.wallet_debits)} out`, "violet"], [RotateCcw, "Refunded", money(s.total_refunded), `${s.refunds_count ?? 0} refunds`, "rose"], [Gift, "Referral rewards", money(s.referral_rewards), `${s.referrals_count ?? 0} friends referred`, "amber"]],
    partner: [[TrendingUp, "Lifetime earned", money(s.total_earned), `today ${money(s.earned_today)} · week ${money(s.earned_week)} · month ${money(s.earned_month)}`, "emerald"], [Wrench, "Jobs", s.bookings_count, `${s.completed_count ?? 0} done · ${s.active_count ?? 0} active · ${s.cancelled_count ?? 0} cancelled`, "primary"], [Wallet, "Wallet", money(s.wallet), `${money(s.withdrawn)} withdrawn · ${s.pending_withdrawals ?? 0} pending`, "violet"], [Star, "Rating", u.rating ?? "—", `${u.jobs_completed ?? s.completed_count ?? 0} jobs completed`, "amber"], [ShieldCheck, "KYC", u.kyc_status || "pending", data?.pan_status ? `PAN ${data.pan_status}` : `${data?.bank_count ?? 0} bank account(s)`, "sky"], [Award, "Rewards", `${s.incentives ?? 0} / ${s.penalties ?? 0}`, "incentives / penalties", "rose"]],
    merchant: [[TrendingUp, "Total earned", money(s.total_earned), `${money(s.referral_earning)} referral commission`, "emerald"], [ShoppingBag, "Bookings", s.bookings_count, `${s.completed_count ?? 0} done · ${s.active_count ?? 0} active`, "primary"], [Wallet, "Wallet", money(s.wallet), `${money(s.withdrawn)} withdrawn · ${money(s.total_debited)} debited`, "violet"], [Users, "Customers", s.customers, "unique customers served", "sky"], [Network, "Partner network", s.network_partners, "referred partners", "amber"], [ShieldCheck, "KYC", u.kyc_status || "pending", u.verified_merchant ? "Verified merchant" : "Not verified", "rose"]],
  }[role];
  const profileItems = [{ k: "Full name", v: u.name }, { k: "Phone", v: u.phone }, { k: "Email", v: u.email }, { k: "Alternate mobile", v: u.alternate_mobile }, { k: "Gender", v: u.gender }, { k: "Date of birth", v: u.dob }, { k: "Language", v: u.language }, { k: "Communication", v: u.communication_pref }, { k: "Company", v: u.company_name }, { k: "GST", v: u.gst_number || u.gstin }, { k: "City", v: u.city }, { k: "State", v: u.state }, { k: "Service area", v: u.service_area_name }, { k: "Pincodes", v: (u.service_pincodes || []).join(", ") }, { k: "Experience", v: (u.experience_years && `${u.experience_years} yrs`) || u.experience_display }, { k: "Education", v: u.education }, { k: "Skills", v: (u.skills || []).join(", ") }, { k: "Categories", v: (u.categories || []).join(", ") }, { k: "Registered address", v: u.address_text }, { k: "Shop name", v: u.shop_name }, { k: "Shop type", v: u.shop_type }, { k: "Shop address", v: typeof u.shop_address === "string" ? u.shop_address : u.shop_address?.line }, { k: "Referral code", v: u.referral_code }, { k: "Referred by merchant", v: u.referred_by_merchant }, { k: "Account type", v: u.account_type }, { k: "Status", v: u.status_label }, { k: "Joined", v: dt(u.created_at) }, { k: "Last login", v: u.last_login_at && dt(u.last_login_at) }, { k: "Profile updated", v: u.profile_updated_at && dt(u.profile_updated_at) }, { k: "Demo account", v: u.is_demo ? "Yes" : null }];
  const entryCfg = (() => {
    if (!entry) return null;
    const r = entry.row || {};
    const openBk = (id) => () => { setBid(id); setEntry(null); };
    if (entry.kind === "wallet") {
      const sign = r.direction || r.type;
      return { title: `Transaction · ${(r.id || "").slice(0, 8) || "—"}`, subtitle: HUMAN(r.kind || r.type || "wallet"), amount: r.amount, amountSign: sign,
        statuses: [r.kind || r.type, r.status || "completed"], highlight: [{ k: "Type", v: HUMAN(r.kind || r.type) }, { k: "Direction", v: HUMAN(sign) }, { k: "Balance after", v: (r.wallet_balance ?? r.balance_after) != null ? <Money v={r.wallet_balance ?? r.balance_after} /> : null }, { k: "Reference", v: r.note || r.booking_code || r.ref_id }, { k: "Date", v: dt(r.created_at) }],
        onOpenBooking: r.booking_id ? openBk(r.booking_id) : null };
    }
    if (entry.kind === "earnings") {
      return { title: `Earning · ${r.booking_code || (r.ref_id || "").slice(0, 8)}`, subtitle: r.service_name, amount: r.amount, amountSign: "credit",
        statuses: [r.status || "completed", r.kind || "earning"], highlight: [{ k: "Customer", v: r.customer_name }, { k: "Service", v: r.service_name }, { k: "Gross value", v: r.gross != null ? <Money v={r.gross} /> : null }, { k: "Platform commission", v: r.commission != null ? <Money v={r.commission} /> : null }, { k: "Partner earning", v: <Money v={r.amount} /> }, { k: "Date", v: dt(r.created_at) }],
        onOpenBooking: r.ref_id ? openBk(r.ref_id) : null };
    }
    if (entry.kind === "withdrawals") {
      return { title: `Withdrawal · ${(r.id || "").slice(0, 8)}`, subtitle: HUMAN(r.method || "payout"), amount: r.amount, amountSign: "debit",
        statuses: [r.status], highlight: [{ k: "Amount", v: <Money v={r.amount} /> }, { k: "Fee", v: <Money v={r.fee || 0} /> }, { k: "Net paid", v: <Money v={r.net_amount ?? r.amount} /> }, { k: "Method", v: HUMAN(r.method) }, { k: "UPI", v: r.upi_id }, { k: "UTR", v: r.payout?.utr }, { k: "Requested", v: dt(r.requested_at || r.created_at) }, { k: "Processed", v: r.processed_at ? dt(r.processed_at) : null }, { k: "Reason", v: r.reason || r.payout?.failure_reason }],
        onOpenBooking: null };
    }
    if (entry.kind === "rewards") {
      return { title: r.name || r.title || HUMAN(r.kind || "reward"), subtitle: r.reason || r.note, amount: r.amount, amountSign: r.kind === "penalty" ? "debit" : "credit",
        statuses: [r.kind, r.status].filter(Boolean), highlight: [{ k: "Type", v: HUMAN(r.kind) }, { k: "Amount", v: <Money v={r.amount} /> }, { k: "Reason", v: r.reason || r.note }, { k: "Date", v: dt(r.created_at) }, { k: "Status", v: r.status ? HUMAN(r.status) : null }],
        onOpenBooking: (r.booking_id || r.ref_id) ? openBk(r.booking_id || r.ref_id) : null };
    }
    return null;
  })();
  return (
    <div className="w-full space-y-4" data-testid={`person360-${role}`}>
      <button onClick={onBack} data-testid="back-btn" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4" />Back to {role}s</button>
      {/* header */}
      <Card className="p-4 md:p-5 overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-600 via-primary-400 to-emerald-400" />
        {loading && !data ? <Skeleton rows={2} cols={4} /> : (
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <Avatar name={name} src={u.photo} size={mobile ? 56 : 72} dot={data?.unread_updates > 0} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white truncate" data-testid="person-name">{name || "—"}</h1>{u.deleted ? <span data-testid="deleted-badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-white bg-rose-600"><Trash2 className="h-3 w-3" />Deleted</span> : <Pill s={u.status_label || "active"} />}{role === "partner" && <Pill s={u.partner_status === "online" ? "online" : "offline"} />}{role !== "customer" && <Pill s={u.kyc_status || "pending"}>KYC {u.kyc_status || "pending"}</Pill>}{role === "customer" && s.tier && <TierPill tier={s.tier} label={s.tier_label} />}{u.verified_merchant && <Pill s="verified" />}{role === "partner" && u.premium_partner && <span data-testid="pro-badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm"><Crown className="h-3 w-3" />PRO</span>}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{code}</span><span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{u.phone}</span>{u.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{u.email}</span>}<span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Member since {dt(u.created_at, false)}</span>{role === "merchant" && u.name && u.shop_name && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />Owner: {u.name}</span>}<span>Last activity {rel(s.last_activity_at)}</span></div>
              {role !== "customer" && <Progress v={s.profile_completion ?? 0} className="mt-2 max-w-xs" />}
            </div>
            {data?.unread_updates > 0 && (
              <div className="rounded-xl ring-1 ring-red-200 dark:ring-red-900/40 bg-red-50/70 dark:bg-red-900/20 px-3 py-2.5 flex items-center gap-3 md:max-w-xs" data-testid="profile-updated-banner">
                <Bell className="h-5 w-5 text-red-500 shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-red-700 dark:text-red-300">Profile updated · {data.unread_updates} unreviewed</p><p className="text-xs text-red-600/80 dark:text-red-300/80 truncate">{data.last_update?.summary} · {rel(data.last_update?.changed_at)}</p></div>
                <div className="flex flex-col gap-1"><button onClick={() => setTab("changes")} className="text-[11px] font-bold text-red-700 underline">View</button><button onClick={reviewAll} data-testid="mark-all-reviewed" className="h-7 px-2 rounded-lg bg-red-600 text-white text-[11px] font-bold inline-flex items-center gap-1"><CheckCheck className="h-3 w-3" />Reviewed</button></div>
              </div>)}
          </div>)}
        {role !== "customer" && !(loading && !data) && <ReviewStrip role={role} uid={uid} u={u} onDone={refresh} />}
        {!(loading && !data) && <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800"><PersonActions role={role} uid={uid} u={u} onDone={refresh} onDeleted={() => { onCountsChanged?.(); onBack?.(); }} /></div>}
      </Card>
      <Tabs tabs={tabs} value={tab} onChange={setTab} dots={{ changes: data?.unread_updates > 0 }} />
      {/* body */}
      {tab === "overview" && <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{kpis.map(([I, l, v, sub, t]) => <KpiCard key={l} icon={I} label={l} value={v} sub={sub} tone={t} loading={loading && !data} />)}</div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="p-5 xl:col-span-2"><h3 className="font-bold mb-3">Key details</h3><KV cols={4} items={profileItems.filter((i) => i.v).slice(0, 16)} /></Card>
          <Card className="p-5"><h3 className="font-bold mb-3">Recent profile changes</h3>{data?.last_update ? <div className="text-sm"><p className="font-semibold">{data.last_update.summary}</p><p className="text-xs text-slate-400">{dt(data.last_update.changed_at)} · <Pill s={data.last_update.reviewed ? "reviewed" : "unreviewed"} size="xs" /></p><button onClick={() => setTab("changes")} className="mt-3 text-xs font-bold text-primary-700">View full history →</button></div> : <p className="text-sm text-slate-400">No profile changes recorded yet.</p>}
            {role === "customer" && data?.membership && <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800"><p className="text-[11px] uppercase font-semibold text-slate-400">Membership</p><p className="font-semibold">{data.membership.plan_name || data.membership.plan_id}</p><p className="text-xs text-slate-400">Valid till {dt(data.membership.expires_at, false)}</p></div>}
            {role === "customer" && s.tier_perks && <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800"><p className="text-[11px] uppercase font-semibold text-slate-400 mb-1">{s.tier_label} perks</p><ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">{s.tier_perks.map((x) => <li key={x}>• {x}</li>)}</ul></div>}
            {role === "partner" && s.starter_kit && <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800"><p className="text-[11px] uppercase font-semibold text-slate-400">Starter kit</p><Pill s={s.starter_kit.tracking_status || s.starter_kit.status} /></div>}
          </Card>
        </div>
        {role === "merchant" && (
          <Card className="p-5" data-testid="merchant-advanced-panel">
            <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary-600" /><h3 className="font-bold">Advanced features</h3><span className="text-xs text-slate-400">— manage everything for this merchant</span></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: "customers", icon: Users, label: "Customers", val: `${s.customers ?? 0}`, sub: "served", cls: "bg-sky-50 dark:bg-sky-900/30 text-sky-600" },
                { key: "network", icon: Network, label: "Partner network", val: `${s.network_partners ?? 0}`, sub: "referred partners", cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600" },
                { key: "transactions", icon: Receipt, label: "Commission ledger", val: money(s.total_earned), sub: "total earned", cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600" },
                { key: "wallet", icon: Wallet, label: "Wallet", val: money(s.wallet), sub: `${money(s.withdrawn)} withdrawn`, cls: "bg-violet-50 dark:bg-violet-900/30 text-violet-600" },
                { key: "withdrawals", icon: ArrowDownToLine, label: "Payouts", val: `${s.pending_withdrawals ?? 0}`, sub: "pending requests", cls: "bg-primary-50 dark:bg-primary-900/30 text-primary-600" },
                { key: "refunds", icon: RotateCcw, label: "Refunds", val: `${s.refunds_count ?? 0}`, sub: money(s.total_refunded), cls: "bg-rose-50 dark:bg-rose-900/30 text-rose-600" },
                { key: "referrals", icon: Gift, label: "Referrals", val: `${s.referrals_count ?? s.network_partners ?? 0}`, sub: money(s.referral_earning), cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600" },
                { key: "bank", icon: Landmark, label: "Bank & KYC", val: u.kyc_status || "pending", sub: u.verified_merchant ? "verified" : "review", cls: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300" },
              ].map((f) => (
                <button key={f.key} onClick={() => setTab(f.key)} data-testid={`adv-${f.key}`}
                  className="group text-left rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-primary-300 dark:hover:ring-primary-700 bg-white dark:bg-slate-800/60 p-3.5 transition">
                  <div className="flex items-center justify-between"><span className={`h-8 w-8 grid place-items-center rounded-lg ${f.cls}`}><f.icon className="h-4 w-4" /></span><ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-primary-500 transition" /></div>
                  <p className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white leading-none truncate">{f.val}</p>
                  <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 mt-1">{f.label}</p>
                  <p className="text-[11px] text-slate-400 truncate">{f.sub}</p>
                </button>
              ))}
            </div>
          </Card>
        )}
        {role === "customer" && (
          <Card className="p-5" data-testid="customer-advanced-panel">
            <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary-600" /><h3 className="font-bold">Advanced features</h3><span className="text-xs text-slate-400">— manage everything for this customer</span></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: "bookings", icon: ShoppingBag, label: "Bookings", val: `${s.bookings_count ?? 0}`, sub: `${s.completed_count ?? 0} done · ${s.active_count ?? 0} active`, cls: "bg-primary-50 dark:bg-primary-900/30 text-primary-600" },
                { key: "invoices", icon: FileText, label: "Invoices", val: `${s.invoices_count ?? 0}`, sub: `${money(s.total_spent)} spent`, cls: "bg-sky-50 dark:bg-sky-900/30 text-sky-600" },
                { key: "wallet", icon: Wallet, label: "Wallet", val: money(s.wallet), sub: `${money(s.wallet_credits)} in · ${money(s.wallet_debits)} out`, cls: "bg-violet-50 dark:bg-violet-900/30 text-violet-600" },
                { key: "refunds", icon: RotateCcw, label: "Refunds", val: `${s.refunds_count ?? 0}`, sub: money(s.total_refunded), cls: "bg-rose-50 dark:bg-rose-900/30 text-rose-600" },
                { key: "payments", icon: CreditCard, label: "Payments", val: money(s.total_paid), sub: "total paid", cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600" },
                { key: "addresses", icon: MapPin, label: "Addresses", val: `${s.addresses ?? 0}`, sub: "saved locations", cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600" },
                { key: "referrals", icon: Gift, label: "Refer & Earn", val: `${s.referrals_count ?? 0}`, sub: money(s.referral_rewards), cls: "bg-amber-50 dark:bg-amber-900/30 text-amber-600" },
              ].map((f) => (
                <button key={f.key} onClick={() => setTab(f.key)} data-testid={`adv-${f.key}`}
                  className="group text-left rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-primary-300 dark:hover:ring-primary-700 bg-white dark:bg-slate-800/60 p-3.5 transition">
                  <div className="flex items-center justify-between"><span className={`h-8 w-8 grid place-items-center rounded-lg ${f.cls}`}><f.icon className="h-4 w-4" /></span><ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-primary-500 transition" /></div>
                  <p className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white leading-none truncate">{f.val}</p>
                  <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 mt-1">{f.label}</p>
                  <p className="text-[11px] text-slate-400 truncate">{f.sub}</p>
                </button>
              ))}
            </div>
          </Card>
        )}
        <SectionTable role={role} uid={uid} name={role === "partner" ? "jobs" : "bookings"} columns={BOOKING_COLS(role)} placeholder="Recent bookings…" onRow={(r) => setBid(r.id)} extra={OVERVIEW_EXTRA} />
      </div>}
      {tab === "profile" && <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {role === "customer" ? (
          <div className="xl:col-span-2 space-y-4" data-testid="customer-profile-details">
            <Card className="p-5"><h3 className="font-bold mb-3 flex items-center gap-2"><User className="h-4 w-4 text-primary-600" />Personal information</h3><KV cols={2} items={[{ k: "Full name", v: u.name }, { k: "Gender", v: u.gender }, { k: "Date of birth", v: u.dob }, { k: "Language", v: u.language }].filter((i) => i.v)} /></Card>
            <Card className="p-5"><h3 className="font-bold mb-3 flex items-center gap-2"><Phone className="h-4 w-4 text-primary-600" />Contact details</h3><KV cols={2} items={[{ k: "Phone", v: u.phone }, { k: "Email", v: u.email }, { k: "Alternate mobile", v: u.alternate_mobile }, { k: "Communication preference", v: u.communication_pref }].filter((i) => i.v)} /></Card>
            <Card className="p-5"><h3 className="font-bold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary-600" />Account &amp; status</h3><KV cols={2} items={[{ k: "Customer since", v: dt(u.created_at) }, { k: "Account type", v: u.account_type || "Standard" }, { k: "Status", v: u.status_label }, { k: "Referral code", v: u.referral_code }, { k: "Referred by", v: u.referred_by_merchant }, { k: "Last login", v: u.last_login_at && dt(u.last_login_at) }, { k: "Profile updated", v: u.profile_updated_at && dt(u.profile_updated_at) }, { k: "Demo account", v: u.is_demo ? "Yes" : null }].filter((i) => i.v)} /></Card>
            <Card className="p-5"><h3 className="font-bold mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-primary-600" />Wallet &amp; spend</h3><KV cols={2} items={[{ k: "Wallet balance", v: money(s.wallet) }, { k: "Lifetime spend", v: money(s.total_spent) }, { k: "Membership", v: data?.membership?.plan_name || data?.membership?.plan_id }].filter((i) => i.v)} /></Card>
          </div>
        ) : (
          <Card className="p-5 xl:col-span-2"><h3 className="font-bold mb-3">{role === "merchant" ? "Owner details" : "Profile"}</h3><KV cols={3} items={profileItems} /></Card>
        )}
        <div className="space-y-4">
          {role !== "customer" && <ProfileDocs role={role} uid={uid} />}
          {p?.basic && <Card className="p-5"><h3 className="font-bold mb-3">Registration · Basic</h3><KV cols={2} items={Object.entries(p.basic).filter(([k, v]) => v && typeof v !== "object" && !/photo|pan|aadhaar/i.test(k)).map(([k, v]) => ({ k: k.replace(/_/g, " "), v: String(v) }))} /></Card>}
          {p?.work && <Card className="p-5"><h3 className="font-bold mb-3">Registration · Work</h3><KV cols={2} items={Object.entries(p.work).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => ({ k: k.replace(/_/g, " "), v: String(v) }))} /></Card>}
          {p?.shop && <Card className="p-5"><h3 className="font-bold mb-3">Shop</h3><KV cols={2} items={Object.entries(p.shop).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => ({ k: k.replace(/_/g, " "), v: String(v) }))} /></Card>}
          {p?.address && <Card className="p-5"><h3 className="font-bold mb-3">Registered address</h3><KV cols={2} items={Object.entries(p.address).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => ({ k: k.replace(/_/g, " "), v: String(v) }))} /></Card>}
          {p?.completion_score != null && <Card className="p-5"><h3 className="font-bold mb-2">Profile completion</h3><Progress v={p.completion_score} /><p className="text-xs text-slate-400 mt-2">Registration status: <Pill s={p.status} size="xs" /></p></Card>}
          {role === "customer" && <Addresses role={role} uid={uid} />}
        </div>
      </div>}
      {(tab === "bookings" || tab === "jobs") && <SectionTable role={role} uid={uid} name={tab} columns={BOOKING_COLS(role)} placeholder="Search booking code, service, name…" statusOptions={BK_STATUS} onRow={(r) => setBid(r.id)} empty={<Empty icon={ShoppingBag} title="No booking history available" />} />}
      {tab === "invoices" && <SectionTable role={role} uid={uid} name="invoices" columns={INVOICE_COLS} placeholder="Invoice number or booking…" typeOptions={["invoice", "receipt", "credit_note", "commission", "payout"]} empty={<Empty icon={FileText} title="No invoices generated yet" />} />}
      {tab === "refunds" && <SectionTable role={role} uid={uid} name="refunds" columns={REFUND_COLS} placeholder="Booking, reason…" statusOptions={["initiated", "processing", "completed", "failed", "pending"]} empty={<Empty icon={RotateCcw} title="No refunds recorded" />} />}
      {tab === "wallet" && <SectionTable role={role} uid={uid} name="wallet" onRow={(r) => setEntry({ kind: "wallet", row: r })} columns={LEDGER_COLS(role === "customer" ? "type" : "direction")} placeholder="Note, reference…" typeOptions={role === "customer" ? ["booking_payment", "topup", "refund", "referral_reward", "admin_adjustment", "cashback"] : ["earning", "withdrawal", "incentive", "penalty", "adjustment", "commission", "referral", "accept_streak_bonus"]}
        summary={(d) => <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><KpiCard icon={Wallet} label="Available balance" value={money(d.summary?.balance)} tone="primary" /><KpiCard icon={TrendingUp} label="Total credits" value={money(d.summary?.credits)} tone="emerald" /><KpiCard icon={ArrowDownToLine} label="Total debits" value={money(d.summary?.debits)} tone="rose" /><Card className="p-3 text-xs"><p className="text-[11px] uppercase font-semibold text-slate-400 mb-1">By type</p>{Object.entries(d.summary?.by_kind || {}).slice(0, 5).map(([k, v]) => <p key={k} className="flex justify-between capitalize"><span>{k.replace(/_/g, " ")}</span><b>{money(v)}</b></p>)}{!Object.keys(d.summary?.by_kind || {}).length && <p className="text-slate-400">—</p>}</Card></div>}
        empty={<Empty icon={Wallet} title="No transaction history available" />} />}
      {tab === "transactions" && <SectionTable role={role} uid={uid} name="transactions" columns={LEDGER_COLS()} placeholder="Note, reference…" typeOptions={["commission", "referral", "withdrawal", "adjustment", "settlement", "refund"]} empty={<Empty icon={Receipt} title="No transactions yet" />} />}
      {tab === "payments" && <SectionTable role={role} uid={uid} name="payments" columns={PAYMENT_COLS} placeholder="Txn ref, booking…" statusOptions={["created", "paid", "captured", "failed", "refunded", "pending"]} empty={<Empty icon={CreditCard} title="No payment transactions" />} />}
      {tab === "earnings" && <SectionTable role={role} uid={uid} name="earnings" onRow={(r) => setEntry({ kind: "earnings", row: r })} columns={EARN_COLS} placeholder="Job, note…" summary={() => <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><KpiCard icon={IndianRupee} label="Today" value={money(s.earned_today)} tone="emerald" /><KpiCard icon={IndianRupee} label="This week" value={money(s.earned_week)} tone="sky" /><KpiCard icon={IndianRupee} label="This month" value={money(s.earned_month)} tone="violet" /><KpiCard icon={IndianRupee} label="Lifetime" value={money(s.total_earned)} tone="primary" /></div>} empty={<Empty icon={TrendingUp} title="No earnings yet" />} />}
      {tab === "withdrawals" && <SectionTable role={role} uid={uid} name="withdrawals" onRow={(r) => setEntry({ kind: "withdrawals", row: r })} columns={WITHDRAW_COLS} placeholder="Reference, UTR…" statusOptions={["pending", "processing", "approved", "paid", "completed", "failed", "rejected"]} empty={<Empty icon={ArrowDownToLine} title="No withdrawal requests" />} />}
      {tab === "bank" && <BankKyc role={role} uid={uid} />}
      {tab === "addresses" && <Addresses role={role} uid={uid} />}
      {tab === "referrals" && (role === "merchant"
        ? <SimpleList role={role} uid={uid} name="referrals" icon={Gift} title="No partner referrals yet" render={(r) => <div className="flex flex-wrap items-center gap-3"><Avatar name={r.partner_name} size={36} /><div className="flex-1 min-w-0"><p className="font-semibold">{r.partner_name}</p><p className="text-xs text-slate-400">{r.partner_phone} · referred {dt(r.created_at, false)}</p></div><div className="text-right"><p className="font-bold">{money(r.commission_total ?? r.total_commission ?? 0)}</p><p className="text-[11px] text-slate-400">lifetime commission</p></div><Pill s={r.status || "active"} /></div>} />
        : <SimpleList role={role} uid={uid} name="referrals" icon={Gift} title="No referral activity yet" render={(r, d) => <div className="flex flex-wrap items-center gap-3"><Avatar name={r.name} size={36} /><div className="flex-1 min-w-0"><p className="font-semibold">{r.name}</p><p className="text-xs text-slate-400">{r.phone} · joined {dt(r.created_at, false)}{d.code ? ` · code ${d.code}` : ""}</p></div><div className="text-right"><p className="font-bold">{r.reward_amount != null ? money(r.reward_amount) : "—"}</p><p className="text-[11px] text-slate-400">{r.credited_at ? `credited ${dt(r.credited_at, false)}` : "reward"}</p></div>{r.reward_status && <Pill s={r.reward_status} />}</div>} />)}
      {tab === "rewards" && <SimpleList role={role} uid={uid} name="rewards" icon={Award} title="No rewards or penalties" typeOptions={["incentive", "penalty", "accept_streak_bonus"]} onRow={(r) => setEntry({ kind: "rewards", row: r })} render={(r) => <div className="flex flex-wrap items-center gap-3"><Pill s={r.kind} /><div className="flex-1 min-w-0"><p className="font-semibold">{r.name || r.title || r.note || r.reason || r.kind}</p><p className="text-xs text-slate-400">{dt(r.created_at)}</p></div><p className={`font-bold ${r.kind === "penalty" ? "text-rose-600" : "text-emerald-700"}`}>{r.kind === "penalty" ? "−" : "+"}<Money v={r.amount} /></p>{r.status && <Pill s={r.status} />}</div>} />}
      {tab === "skills" && <SkillsPanel role={role} uid={uid} />}
      {tab === "starter-kit" && <StarterKit role={role} uid={uid} />}
      {tab === "customers" && <SimpleList role={role} uid={uid} name="customers" icon={Users} title="No customers yet" render={(r) => <div className="flex flex-wrap items-center gap-3 cursor-pointer" onClick={() => r.customer_id && onOpenUser?.({ id: r.customer_id, role: "customer" })}><Avatar name={r.name} size={36} /><div className="flex-1 min-w-0"><p className="font-semibold">{r.name || "—"}</p><p className="text-xs text-slate-400">{r.phone}{r.city ? ` · ${r.city}` : ""}{r.source ? ` · ${r.source}` : ""}</p></div><div className="text-right text-xs"><p className="font-bold text-sm">{r.bookings} bookings</p><p className="text-slate-400">spent {money(r.spent)}</p></div><div className="text-right text-xs text-slate-400"><p>first {dt(r.first_at, false)}</p><p>last {rel(r.last_at)}</p></div></div>} />}
      {tab === "network" && <SimpleList role={role} uid={uid} name="network" icon={Network} title="No referred partners" render={(r) => <div className="flex flex-wrap items-center gap-3 cursor-pointer" onClick={() => onOpenUser?.({ id: r.id, role: "partner" })}><Avatar name={r.name} size={36} /><div className="flex-1 min-w-0"><p className="font-semibold">{r.name}</p><p className="text-xs text-slate-400 font-mono">{r.partner_code} · {r.phone}{r.city ? ` · ${r.city}` : ""}</p></div><span className="inline-flex items-center gap-1 text-sm font-semibold"><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />{r.rating ?? "—"}</span><span className="text-xs text-slate-500">{r.jobs_completed ?? 0} jobs</span><Pill s={r.partner_status === "online" ? "online" : "offline"} /><Pill s={r.kyc_status || "pending"} /></div>} />}
      {tab === "activity" && <ActivityTimeline role={role} uid={uid} />}
      {tab === "changes" && <ProfileChanges role={role} uid={uid} onReviewed={refresh} />}
      {tab === "logs" && <LogsList role={role} uid={uid} />}
      <BookingDrawer role={role} uid={uid} bid={bid} onClose={() => setBid(null)} />
      {entryCfg && <EntryDrawer open={!!entry} onClose={() => setEntry(null)} kind={entry.kind} entry={entry.row} {...entryCfg} />}
    </div>
  );
}

const SkillsPanel = ({ role, uid }) => {
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}/${uid}/sections/skills`, useMemo(() => ({}), []));
  if (loading && !data) return <Skeleton rows={3} cols={3} />; if (error) return <ErrorState error={error} onRetry={reload} />;
  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-testid="section-skills">
    <Card className="p-5"><h3 className="font-bold mb-3">Skills</h3>{data?.user_skills?.length ? <div className="flex flex-wrap gap-2 mb-3">{data.user_skills.map((s) => <span key={s} className="px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 text-sm font-semibold capitalize">{s}</span>)}</div> : <p className="text-sm text-slate-400">No skills listed.</p>}
      {data?.skills?.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{data.skills.map((s) => <div key={s.id} className="py-2 flex items-center gap-3"><p className="font-medium flex-1">{s.skill_name || s.name || s.skill_id}</p>{s.level && <Pill s={s.level} />}{s.status && <Pill s={s.status} />}{s.score != null && <span className="text-xs font-bold">{s.score}%</span>}</div>)}</div> : null}</Card>
    <Card className="p-5"><h3 className="font-bold mb-3">Certificates</h3>{data?.certificates?.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{data.certificates.map((c) => <div key={c.id} className="py-2 flex items-center gap-3"><Award className="h-4 w-4 text-amber-500" /><div className="flex-1"><p className="font-medium">{c.title || c.name}</p><p className="text-xs text-slate-400">{c.issuer || ""} {c.issued_on || ""}</p></div><Pill s={c.status || "submitted"} /></div>)}</div> : <p className="text-sm text-slate-400">No certificates submitted.</p>}</Card>
  </div>;
};
