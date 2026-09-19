import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Search, ChevronLeft, ChevronRight, Eye, X } from "lucide-react";
import { Card, SectionTitle, Sel, EmptyState, sMeta, fmt, fmtDate } from "./kit";
import { ComboSelect } from "./FilterDrawer";

const PayBadge = ({ s }) => {
  const m = { paid: "bg-emerald-50 text-emerald-700", pending: "bg-amber-50 text-amber-700", failed: "bg-red-50 text-red-600", refunded: "bg-fuchsia-50 text-fuchsia-700" };
  return s ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${m[s] || "bg-slate-100 text-slate-500"}`}>{s}</span> : <span className="text-slate-300">—</span>;
};
const StatusBadge = ({ s }) => <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap" style={{ background: `${sMeta(s).hex}1a`, color: sMeta(s).hex }}>{sMeta(s).label}</span>;

export default function RecentBookings({ rows, onOpenBooking, onReset, faServices }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [sortKey, setSortKey] = useState("created_at"); const [sortDir, setSortDir] = useState("desc");
  const [statusF, setStatusF] = useState(""); const [serviceF, setServiceF] = useState(""); const [payF, setPayF] = useState(""); const [dayF, setDayF] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);

  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [dq, statusF, serviceF, payF, dayF, pageSize]);

  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).filter(Boolean), [rows]);
  const pays = useMemo(() => Array.from(new Set(rows.map((r) => r.payment_status))).filter(Boolean), [rows]);
  const days = useMemo(() => Array.from(new Set(rows.map((r) => (r.created_at || "").slice(0, 10)))).filter(Boolean).sort().reverse(), [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (dq) { const s = dq.toLowerCase(); out = out.filter((r) => [r.code, r.service_name, r.customer_name, r.partner_name, r.merchant_name].some((v) => (v || "").toLowerCase().includes(s))); }
    if (statusF) out = out.filter((r) => r.status === statusF);
    if (serviceF) out = out.filter((r) => r.service_name === serviceF);
    if (payF) out = out.filter((r) => r.payment_status === payF);
    if (dayF) out = out.filter((r) => (r.created_at || "").startsWith(dayF));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      let av, bv;
      if (sortKey === "amount") { av = a.pricing?.total || 0; bv = b.pricing?.total || 0; }
      else if (sortKey === "created_at") { av = a.created_at || ""; bv = b.created_at || ""; }
      else { av = (a[sortKey] || "").toString().toLowerCase(); bv = (b[sortKey] || "").toString().toLowerCase(); }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [rows, dq, statusF, serviceF, payF, dayF, sortKey, sortDir]);

  const total = filtered.length; const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize; const pageRows = filtered.slice(start, start + pageSize);
  const sort = (k) => { if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(k); setSortDir("desc"); } };
  const arrow = (k) => sortKey === k ? <span className="text-primary-500">{sortDir === "asc" ? "↑" : "↓"}</span> : <span className="text-slate-300">↕</span>;
  const localActive = dq || statusF || serviceF || payF || dayF;

  return (
    <Card className="p-5" data-testid="dash-recent">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <SectionTitle icon={ClipboardList} sub={`${rows.length} booking${rows.length === 1 ? "" : "s"} in selected period`}>Recent Bookings</SectionTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input data-testid="rb-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bookings…" className="h-11 w-full sm:w-52 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" />
          </div>
          <ComboSelect className="w-40" testid="rb-status" placeholder="All Status" value={statusF} onChange={setStatusF} options={statuses.map((s) => ({ value: s, label: sMeta(s).label }))} />
          <ComboSelect className="w-40" testid="rb-payment" placeholder="All Payments" value={payF} onChange={setPayF} options={pays.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
          <ComboSelect className="w-44" testid="rb-service" placeholder="All Services" value={serviceF} onChange={setServiceF} options={faServices} />
          <ComboSelect className="w-40" testid="rb-day" placeholder="Any date" value={dayF} onChange={setDayF} options={days.map((s) => ({ value: s, label: fmtDate(s) }))} />
          {localActive && <button data-testid="rb-clear" onClick={() => { setQ(""); setStatusF(""); setServiceF(""); setPayF(""); setDayF(""); }} className="h-11 px-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1"><X className="h-3.5 w-3.5" />Clear</button>}
        </div>
      </div>

      {total === 0 ? <EmptyState onReset={localActive ? undefined : onReset} text={rows.length === 0 ? "No booking data available for this period." : "No bookings match these filters."} /> : (
        <>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2.5 pr-3 cursor-pointer select-none" onClick={() => sort("code")}>Booking {arrow("code")}</th>
                  <th className="py-2.5 pr-3 cursor-pointer select-none" onClick={() => sort("service_name")}>Service {arrow("service_name")}</th>
                  <th className="py-2.5 pr-3">Customer</th><th className="py-2.5 pr-3">Partner</th><th className="py-2.5 pr-3">Merchant</th>
                  <th className="py-2.5 pr-3 cursor-pointer select-none" onClick={() => sort("created_at")}>Date {arrow("created_at")}</th>
                  <th className="py-2.5 pr-3 cursor-pointer select-none" onClick={() => sort("status")}>Status {arrow("status")}</th>
                  <th className="py-2.5 pr-3 text-right cursor-pointer select-none" onClick={() => sort("amount")}>Amount {arrow("amount")}</th>
                  <th className="py-2.5 pr-3">Payment</th><th className="py-2.5" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((b) => (
                  <tr key={b.id} data-testid={`rb-row-${b.code}`} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">#{b.code}<span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${b.booking_type === "merchant" ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-500"}`}>{b.booking_type}</span></td>
                    <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{b.service_name}</td>
                    <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">{b.customer_name || "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">{b.partner_name || "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">{b.merchant_name || "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(b.created_at)}</td>
                    <td className="py-2.5 pr-3"><StatusBadge s={b.status} /></td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{fmt(b.pricing?.total)}</td>
                    <td className="py-2.5 pr-3"><PayBadge s={b.payment_status} /></td>
                    <td className="py-2.5"><button data-testid={`rb-view-${b.code}`} onClick={() => onOpenBooking?.(b)} className="text-primary-600 hover:text-primary-800"><Eye className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-2.5">
            {pageRows.map((b) => (
              <button key={b.id} data-testid={`rb-card-${b.code}`} onClick={() => onOpenBooking?.(b)} className="w-full text-left rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5 active:scale-[.99] transition-transform">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{b.service_name}</p><p className="text-[11px] text-slate-400">#{b.code} · {fmtDate(b.created_at)}</p></div>
                  <StatusBadge s={b.status} />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <div className="text-slate-500 dark:text-slate-400 min-w-0"><p className="truncate">{b.customer_name || "—"}</p><p className="truncate text-[11px]">Partner: {b.partner_name || "—"}</p></div>
                  <div className="text-right shrink-0"><p className="font-bold text-slate-800 dark:text-white">{fmt(b.pricing?.total)}</p><PayBadge s={b.payment_status} /></div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Rows</span>
              <Sel testid="rb-pagesize" value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</Sel>
              <span className="ml-1" data-testid="rb-showing">Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}</span>
            </div>
            <div className="flex items-center gap-1">
              <button data-testid="rb-prev" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 px-2">Page {page} / {pages}</span>
              <button data-testid="rb-next" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
