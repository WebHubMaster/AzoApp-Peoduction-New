import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TrendingUp, Users, Wrench } from "lucide-react";
import api from "@/lib/api";
import {
  ReportCards, DateRangeFilter, Pagination, SearchBox, TypeBadge, ModuleHeader,
  EmptyState, fmt, fmtDate,
} from "./ReferralShared";

const TYPE_TABS = [["", "All"], ["customer", "Customer"], ["partner", "Partner"]];

export default function MerchantCommission() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [type, setType] = useState("");
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [date, setDate] = useState({ range: "" });

  useEffect(() => { const t = setTimeout(() => setQ(qRaw), 350); return () => clearTimeout(t); }, [qRaw]);
  useEffect(() => { setPage(1); }, [type, q, date, pageSize]);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, page_size: pageSize, type, q, range: date.range || "",
      date_from: date.date_from || "", date_to: date.date_to || "" };
    api.get("/merchant/referral/commission", { params })
      .then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [page, pageSize, type, q, date]);
  useEffect(() => { load(); }, [load]);

  const s = data?.summary || {};
  const cards = useMemo(() => [
    { label: "Total Commission", value: s.total, money: true, primary: true, sub: `${s.transactions || 0} transactions` },
    { label: "This Month", value: s.this_month, money: true },
    { label: "Last Month", value: s.last_month, money: true },
    { label: "This Week", value: s.this_week, money: true },
    { label: "Today", value: s.today, money: true },
    { label: "Yesterday", value: s.yesterday, money: true },
    { label: "Customer Commission", value: s.customer_commission, money: true },
    { label: "Partner Commission", value: s.partner_commission, money: true },
  ], [s]);

  const items = data?.items || [];

  return (
    <div data-testid="merchant-commission">
      <ModuleHeader title="Commission" subtitle="Your actual earned referral commission — customer & partner" icon={TrendingUp} />
      <ReportCards cards={cards} />

      <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
          {TYPE_TABS.map(([k, lbl]) => (
            <button key={k || "all"} data-testid={`type-tab-${k || "all"}`} onClick={() => setType(k)}
              className={`h-9 px-3.5 rounded-lg text-sm font-semibold transition ${type === k
                ? "bg-primary-600 text-white" : "text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}>{lbl}</button>
          ))}
        </div>
        <SearchBox value={qRaw} onChange={setQRaw} placeholder="Search service, name or booking code…" />
        <DateRangeFilter value={date} onChange={setDate} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* desktop table header */}
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <div className="col-span-2">Date</div>
          <div className="col-span-3">Referral / Service</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2 text-right">Eligible</div>
          <div className="col-span-1 text-right">%</div>
          <div className="col-span-2 text-right">Earned</div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState title="No commission yet" desc="Commission from your referred customers and partners will appear here." />
        ) : items.map((it) => (
          <div key={it.id} data-testid={`commission-row-${it.id}`}
            className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-1 px-4 py-3 border-t border-slate-100 dark:border-slate-800 items-center">
            <div className="md:col-span-2 order-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{fmtDate(it.date)}</p>
              <p className="text-[11px] text-slate-400">{it.booking_code || ""}</p>
            </div>
            <div className="md:col-span-3 order-3 md:order-2 col-span-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{it.service_name}</p>
              <p className="text-[11px] text-slate-400 truncate">{it.name}</p>
            </div>
            <div className="md:col-span-2 order-2 md:order-3 flex md:block justify-end">
              <TypeBadge type={it.referral_type} />
            </div>
            <div className="md:col-span-2 order-4 text-right md:text-right">
              <span className="md:hidden text-[11px] text-slate-400 mr-1">Eligible</span>
              <span className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">{fmt(it.eligible_amount)}</span>
            </div>
            <div className="md:col-span-1 order-5 text-right">
              <span className="text-sm text-slate-500 tabular-nums">{it.commission_pct}%</span>
            </div>
            <div className="md:col-span-2 order-6 text-right">
              <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(it.earned)}</span>
            </div>
          </div>
        ))}
      </div>

      <Pagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0}
        pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
    </div>
  );
}
