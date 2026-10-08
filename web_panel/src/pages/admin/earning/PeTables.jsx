import { useEffect, useState, useRef } from "react";
import { Table2, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Filter, Receipt, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Section, Seg, Bar, C, inr, pct, num, useSection } from "@/pages/admin/earning/peShared";
import { METHOD_LABEL } from "@/pages/admin/earning/PeFilters";

const PAGE_SIZES = [10, 25, 50, 100];

export function Pager({ page, pageSize, total, onPage, onSize, testid = "pe-pager" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0; const to = Math.min(page * pageSize, total);
  const Btn = ({ dis, onClick, children, t }) => <button data-testid={`${testid}-${t}`} disabled={dis} onClick={onClick} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 disabled:opacity-35 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">{children}</button>;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 flex-wrap text-[12.5px] text-slate-500" data-testid={testid}>
      <div className="flex items-center gap-3">
        <span data-testid={`${testid}-info`}>Showing <b className="text-slate-800 dark:text-slate-200">{num(from)}–{num(to)}</b> of <b className="text-slate-800 dark:text-slate-200">{num(total)}</b></span>
        <select data-testid={`${testid}-size`} value={pageSize} onChange={(e) => onSize(Number(e.target.value))} className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[12px]">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <Btn t="first" dis={page <= 1} onClick={() => onPage(1)}><ChevronsLeft className="h-4 w-4" /></Btn>
        <Btn t="prev" dis={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Btn>
        <span data-testid={`${testid}-page`} className="px-3 font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{page} / {pages}</span>
        <Btn t="next" dis={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></Btn>
        <Btn t="last" dis={page >= pages} onClick={() => onPage(pages)}><ChevronsRight className="h-4 w-4" /></Btn>
      </div>
    </div>
  );
}

const SortTh = ({ k, label, sort, order, onSort, align = "right", testid }) => {
  const on = sort === k; const I = !on ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-semibold whitespace-nowrap text-${align}`}>
      {onSort ? <button data-testid={testid} onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-slate-800 ${on ? "text-[#0D47A1]" : ""}`}>{label}<I className="h-3 w-3" /></button> : label}
    </th>
  );
};

function usePage(deps) {
  const key = JSON.stringify(deps);
  const [pg, setPg] = useState({ key, page: 1 });
  return [pg.key === key ? pg.page : 1, (page) => setPg({ key, page })];
}

function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v); const t = useRef();
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => setD(v), ms); return () => clearTimeout(t.current); }, [v, ms]);
  return d;
}

const DIM_TABS = [["service", "Service"], ["category", "Category"], ["city", "City"], ["partner", "Partner"], ["merchant", "Merchant"]];
const PROF_COLS = [["orders", "Orders"], ["revenue", "Gross Revenue"], ["refunds", "Refunds"], ["platform_revenue", "Platform Revenue"], ["commission", "Commission"], ["payout", "Payout"], ["profit", "Net Earning / Profit"], ["margin", "Margin %"]];

export function ProfitabilityTable({ params, onDrill, onExport, exporting }) {
  const [dim, setDim] = useState("service");
  const [sort, setSort] = useState("revenue"); const [order, setOrder] = useState("desc");
  const [size, setSize] = useState(10);
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [page, setPage] = usePage([dim, dq, size, sort, order, params]);
  const st = useSection("/admin/platform-earning/breakdown", { ...params, dim, sort, order, page, page_size: size, dim_q: dq });
  const d = st.data;
  const onSort = (k) => { if (sort === k) setOrder((o) => (o === "desc" ? "asc" : "desc")); else { setSort(k); setOrder("desc"); } };
  const dimLabel = DIM_TABS.find((x) => x[0] === dim)[1];
  return (
    <Section testid="pe-profitability" title={`${dimLabel} Profitability`} subtitle="Server-side sorted & paginated · click a row to drill down" icon={Table2} state={st} isEmpty={d && !d.total && !dq}
      actions={<button disabled={exporting} onClick={() => onExport(dim, sort, order)} data-testid="pe-prof-export" className="text-[12px] font-semibold text-[#0D47A1] hover:underline disabled:opacity-50">Export CSV</button>}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="overflow-x-auto"><Seg testid="pe-prof-dim" options={DIM_TABS} value={dim} onChange={setDim} /></div>
        <div className="relative"><Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><Input data-testid="pe-prof-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${dimLabel.toLowerCase()}`} className="pl-9 w-56 h-9" /></div>
      </div>
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-auto max-h-[520px]">
        <table className="w-full text-[13px] min-w-[980px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <SortTh k="name" label={dimLabel} sort={sort} order={order} onSort={onSort} align="left" testid="pe-prof-sort-name" />
              {PROF_COLS.map(([k, l]) => <SortTh key={k} k={k} label={l} sort={sort} order={order} onSort={onSort} testid={`pe-prof-sort-${k}`} />)}
              <th className="sticky top-0 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-right font-semibold">Share</th>
            </tr>
          </thead>
          <tbody>
            {(d?.rows || []).map((r, i) => (
              <tr key={r.key} data-testid={`pe-prof-row-${i}`} onClick={() => onDrill(dim, dim === "partner" || dim === "merchant" ? r.key : r.name)} className="border-t border-slate-50 dark:border-slate-800 hover:bg-[#0D47A1]/[0.03] cursor-pointer transition-colors">
                <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 max-w-[220px] truncate">{r.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{num(r.orders)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: C.blue }}>{inr(r.revenue, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{r.refunds ? inr(r.refunds, 0) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(r.platform_revenue, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: C.purple }}>{inr(r.commission, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-orange-600">{inr(r.payout, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: r.profit < 0 ? C.red : C.green }}>{inr(r.profit, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{pct(r.margin)}</td>
                <td className="px-3 py-2.5 w-28"><div className="flex items-center gap-2"><Bar value={r.share} /><span className="text-[11px] text-slate-400 w-10 text-right">{pct(r.share, 0)}</span></div></td>
              </tr>
            ))}
            {d && !d.rows.length && <tr><td colSpan={10} className="py-10 text-center text-slate-400 text-[13px]">No matches</td></tr>}
          </tbody>
        </table>
      </div>
      {d && <Pager testid="pe-prof-pager" page={page} pageSize={size} total={d.total} onPage={setPage} onSize={setSize} />}
    </Section>
  );
}

const SRC_TONE = { booking: "bg-blue-50 text-blue-700", cancellation: "bg-red-50 text-red-600", registration_fee: "bg-slate-100 text-slate-700", starter_kit: "bg-amber-50 text-amber-700", membership: "bg-emerald-50 text-emerald-700", withdrawal_fee: "bg-orange-50 text-orange-700" };
const SRC_LABEL = { booking: "Booking Settlements", cancellation: "Cancellations" };
const REC_COLS = [["gross", "Gross"], ["commission", "Commission"], ["refund", "Refund"], ["partner_payout", "Partner Payout"], ["gateway_fee", "Gateway"], ["platform_revenue", "Platform Rev."], ["net_earning", "Net Earning"]];

export function RecordsTable({ params, search, setSearch, sortState, onOpen, onExport, exporting, innerRef, localSource, clearLocalSource }) {
  const [sort, setSort] = sortState; const [order, setOrder] = useState("desc");
  const [size, setSize] = useState(10);
  const dq = useDebounced(search);
  const [page, setPage] = usePage([dq, size, sort, order, params]);
  const st = useSection("/admin/platform-earning/records", { ...params, q: dq, sort, order, page, page_size: size });
  const d = st.data;
  const onSort = (k) => { if (sort === k) setOrder((o) => (o === "desc" ? "asc" : "desc")); else { setSort(k); setOrder("desc"); } };
  return (
    <div ref={innerRef}>
      <Section testid="pe-records" title="Financial Records" subtitle="Every earning traced to its source record" icon={Receipt} tone={C.navy} state={st} isEmpty={d && !d.total && !dq}
        actions={<button disabled={exporting} onClick={() => onExport("records", sort, order, dq)} data-testid="pe-records-export" className="text-[12px] font-semibold text-[#0D47A1] hover:underline disabled:opacity-50">Export CSV</button>}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md"><Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><Input data-testid="pe-records-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search booking, txn ref, customer, partner, service, city" className="pl-9 h-9" /></div>
          {localSource && <span data-testid="pe-records-type-chip" className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-[#E8F0FE] text-[#0D47A1] text-[12px] font-semibold"><Filter className="h-3 w-3" />{SRC_LABEL[localSource] || localSource}<button data-testid="pe-records-type-chip-remove" onClick={clearLocalSource} className="h-5 w-5 rounded-full hover:bg-[#0D47A1]/10 flex items-center justify-center"><X className="h-3 w-3" /></button></span>}
        </div>
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-auto max-h-[600px]">
          <table className="w-full text-[13px] min-w-[1180px]">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <SortTh k="date" label="Date" sort={sort} order={order} onSort={onSort} align="left" testid="pe-rec-sort-date" />
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-left font-semibold">Type / Reference</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-left font-semibold">Party</th>
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-left font-semibold">Service · City</th>
                {REC_COLS.map(([k, l]) => <SortTh key={k} k={k} label={l} sort={sort} order={order} onSort={onSort} testid={`pe-rec-sort-${k}`} />)}
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(d?.rows || []).map((r, i) => (
                <tr key={r.uid} data-testid={`pe-rec-row-${i}`} onClick={() => onOpen(r.uid)} className="border-t border-slate-50 dark:border-slate-800 hover:bg-[#0D47A1]/[0.03] cursor-pointer transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-slate-500">{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                  <td className="px-3 py-2.5"><span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${SRC_TONE[r.source] || "bg-slate-100"}`}>{r.source_label}</span><span className="block font-mono text-[11px] text-slate-500 mt-0.5">{r.booking_code || r.txn_ref || "—"}</span></td>
                  <td className="px-3 py-2.5 max-w-[170px]"><span className="block truncate text-slate-800 dark:text-slate-100 font-medium">{r.customer_name || r.partner_name || r.merchant_name || "—"}</span><span className="block truncate text-[11px] text-slate-400">{r.customer_name && r.partner_name ? `Partner: ${r.partner_name}` : r.merchant_name ? `Merchant: ${r.merchant_name}` : METHOD_LABEL[r.method] || r.method || ""}</span></td>
                  <td className="px-3 py-2.5 max-w-[170px]"><span className="block truncate text-slate-700 dark:text-slate-200">{r.service || "—"}</span><span className="block text-[11px] text-slate-400">{r.city || ""}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{inr(r.gross)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: C.purple }}>{r.commission ? inr(r.commission) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{r.refund + r.refund_pending ? inr(r.refund + r.refund_pending) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-orange-600">{r.partner_payout ? inr(r.partner_payout) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.has_gateway ? inr(r.gateway_fee) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: C.blue }}>{inr(r.platform_revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: r.net_earning < 0 ? C.red : C.green }}>{inr(r.net_earning)}</td>
                  <td className="px-3 py-2.5 text-right"><Eye className="h-4 w-4 text-slate-300 inline" /></td>
                </tr>
              ))}
              {d && !d.rows.length && <tr><td colSpan={12} className="py-10 text-center text-slate-400 text-[13px]" data-testid="pe-records-nomatch">No records match your search</td></tr>}
            </tbody>
          </table>
        </div>
        {d && <Pager testid="pe-rec-pager" page={page} pageSize={size} total={d.total} onPage={setPage} onSize={setSize} />}
      </Section>
    </div>
  );
}
