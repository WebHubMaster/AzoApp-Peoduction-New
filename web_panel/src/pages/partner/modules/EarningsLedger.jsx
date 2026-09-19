import React, { useCallback, useEffect, useMemo, useState } from "react";
import api, { fmt, fmtC } from "@/lib/api";
import {
  TrendingUp, Wallet, CalendarDays, Layers, ReceiptText, Banknote, ArrowDownLeft,
} from "lucide-react";
import { Surface, Section, Kpi, StatusBadge, EmptyState, Segmented, Sheet, DetailRow, SkeletonKpis, Pagination, SortHead, cx } from "@/components/partner/ui/kit";
import { TrendArea } from "@/components/partner/ui/charts";

const RANGES = [{ key: "7", label: "7 Days" }, { key: "14", label: "14 Days" }, { key: "30", label: "30 Days" }];

// Total deduction (platform commission) so every view balances: Service Cost − Net = Commission.
const deduc = (l) => (l.commission != null ? Math.max(0, Number(l.commission) || 0)
  : Math.max(0, (Number(l.base ?? l.gross) || 0) - (Number(l.net_earning ?? l.partner_earning) || 0)));

export default function EarningsLedger() {
  const [e, setE] = useState(null);
  const [sum, setSum] = useState(null);
  const [range, setRange] = useState("14");
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(() => {
    api.get("/wallet/partner/earnings").then((r) => setE(r.data)).catch(() => {});
    api.get("/partner/earnings-summary").then((r) => setSum(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const ledgerRaw = e?.ledger || [];
  const sorted = useMemo(() => {
    const map = { code: "booking_code", gross: "gross", commission: "platform_earning", net: "partner_earning", date: "created_at" };
    const k = map[sort.key] || "created_at";
    const arr = [...ledgerRaw].sort((a, b) => {
      const av = a[k]; const bv = b[k];
      if (typeof av === "number" || typeof bv === "number") return (Number(av) || 0) - (Number(bv) || 0);
      return String(av || "").localeCompare(String(bv || ""));
    });
    return sort.dir === "desc" ? arr.reverse() : arr;
  }, [ledgerRaw, sort]);
  const paged = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);
  const toggleSort = (key) => { setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" })); setPage(1); };

  if (!e || !sum) {
    return <div className="w-full space-y-5"><Surface className="p-6"><div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Surface><SkeletonKpis n={4} /></div>;
  }

  const daily = (sum.daily || []).slice(-Number(range));
  const payouts = sum.payouts || [];
  const ledger = paged;

  return (
    <div className="w-full space-y-5" data-testid="earnings-ledger">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600 text-white p-6 shadow-[0_20px_45px_-20px_rgba(13,71,161,0.7)]">
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] bg-[size:26px_26px]" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-primary-100 text-sm flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> Total Earnings</p>
            <p className="font-heading font-black text-4xl sm:text-5xl mt-1.5 tabular-nums leading-none" title={fmt(e.total_earned)}>{fmtC(e.total_earned)}</p>
            <p className="text-primary-100 text-sm mt-2">{e.jobs || sum.jobs_paid || 0} jobs completed</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/10 px-5 py-3">
            <p className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Wallet balance</p>
            <p className="font-heading font-black text-2xl mt-0.5 tabular-nums">{fmtC(e.wallet_balance)}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Today" value={fmt(sum.today)} icon={CalendarDays} tone="primary" />
        <Kpi label="This Week" value={fmt(sum.this_week)} icon={CalendarDays} tone="emerald" />
        <Kpi label="This Month" value={fmt(sum.this_month)} icon={CalendarDays} tone="violet" />
        <Kpi label="Lifetime" value={fmt(sum.lifetime)} icon={Layers} tone="amber" />
      </div>

      {/* Trend + Payout side by side (full width) */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Section title="Earnings Trend" icon={TrendingUp} className="xl:col-span-2" right={<Segmented options={RANGES} value={range} onChange={setRange} size="sm" />}>
          <TrendArea data={daily} xKey="date" yKey="amount" name="Earnings" height={250} />
        </Section>
        <Section title="Payout History" icon={Banknote} bodyClass="p-0">
          {payouts.length === 0 ? (
            <EmptyState icon={Banknote} title="No payouts yet" desc="Your withdrawal payouts will appear here." className="py-8" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[280px] overflow-y-auto">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="h-9 w-9 rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 flex items-center justify-center shrink-0"><Banknote className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmt(p.net_amount || p.amount)} <span className="text-[11px] text-slate-400 uppercase">{(p.method || "").toUpperCase()}</span></p>
                    <p className="text-[11px] text-slate-400">{new Date(p.requested_at).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Ledger */}
      <Section title="Earnings Ledger" subtitle={ledgerRaw.length ? `${ledgerRaw.length} transactions` : undefined} icon={ReceiptText} bodyClass="p-0">
        {ledgerRaw.length === 0 ? (
          <EmptyState icon={ReceiptText} title="No earnings yet" desc="Complete jobs to start earning. Every settled job will appear here with its full commission breakdown." />
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3"><SortHead label="Job" active={sort.key === "code"} dir={sort.dir} onClick={() => toggleSort("code")} /></th>
                    <th className="px-4 py-3 text-right"><SortHead label="Gross" align="right" active={sort.key === "gross"} dir={sort.dir} onClick={() => toggleSort("gross")} /></th>
                    <th className="px-4 py-3 text-right"><SortHead label="Commission" align="right" active={sort.key === "commission"} dir={sort.dir} onClick={() => toggleSort("commission")} /></th>
                    <th className="px-4 py-3 text-right"><SortHead label="Net Earnings" align="right" active={sort.key === "net"} dir={sort.dir} onClick={() => toggleSort("net")} /></th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ledger.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => setDetail(l)}>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-200">#{l.booking_code}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{fmt(l.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600 dark:text-rose-400">-{fmt(deduc(l))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400">+{fmt(l.net_earning ?? l.partner_earning)}</td>
                      <td className="px-4 py-3 text-right"><StatusBadge status={l.status || "completed"} dot={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {ledger.map((l) => (
                <button key={l.id} onClick={() => setDetail(l)} className="w-full text-left flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 dark:active:bg-slate-800/50">
                  <span className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center shrink-0"><ArrowDownLeft className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><p className="font-mono text-sm text-slate-700 dark:text-slate-200">#{l.booking_code}</p><p className="text-[11px] text-slate-400">Gross {fmt(l.gross)} · Comm {fmt(deduc(l))}</p></div>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">+{fmt(l.net_earning ?? l.partner_earning)}</p>
                </button>
              ))}
            </div>
            <Pagination page={page} pageSize={pageSize} total={sorted.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </Section>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title="Earning Details">
        {detail && (() => {
          const gross = Number(detail.gross) || 0;
          const tax = Number(detail.tax) || 0;
          const net = Number(detail.net_earning ?? detail.partner_earning) || 0;
          // Actual service cost (tax-excluded) = the commission base the split is computed on.
          const serviceCost = Number(detail.base) || Math.max(0, gross - tax);
          const rates = detail.rates || {};
          const partnerPct = rates.partner_pct;
          // Platform commission (merchant-inclusive) = service cost − partner earning.
          const platformComm = Number(detail.commission != null ? detail.commission : Math.max(0, serviceCost - net));
          const platformPct = serviceCost > 0 ? Math.round((platformComm / serviceCost) * 1000) / 10 : (rates.platform_pct ?? null);
          const pct = (v) => (serviceCost > 0 ? Math.max(0, (v / serviceCost) * 100) : 0);
          // Cancellation earning: base is the retained Cancellation Charge, not a
          // completed job's service cost — label it clearly (same source as invoice).
          const isCancel = detail.kind === "cancellation" || detail.status === "cancelled";
          const costLabel = isCancel ? "Cancellation Charge (excl. tax)" : "Service Cost (excl. tax)";
          const earnLabel = isCancel ? "Partner Earning" : "Partner Commission";
          const platLabel = isCancel ? "Platform Share" : "Platform Commission";
          return (
          <div className="space-y-1">
            <div className="text-center py-4">
              <p className="text-[11px] uppercase tracking-widest text-slate-400">{isCancel ? "Your Earning" : "Net Earning"}</p>
              <p className="font-heading font-black text-3xl text-emerald-600 dark:text-emerald-400 tabular-nums">+{fmt(net)}</p>
              <StatusBadge status={detail.status || "completed"} className="mt-2" />
            </div>

            {serviceCost > 0 && (
                <div className="px-1 pb-3" data-testid="earning-breakdown-bar">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div style={{ width: `${pct(net)}%` }} className="bg-emerald-500 transition-all duration-300" />
                    <div style={{ width: `${pct(platformComm)}%` }} className="bg-rose-400 transition-all duration-300" />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Partner {fmt(net)}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-400" /> Platform {fmt(platformComm)}</span>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-2 tabular-nums">{isCancel ? "Cancellation Charge" : "Service Cost"} {fmt(serviceCost)} = Partner {fmt(net)} + Platform {fmt(platformComm)}</p>
                </div>
            )}
            <DetailRow label="Job" value={`#${detail.booking_code}`} mono />
            <DetailRow label={costLabel} value={fmt(serviceCost)} />
            <DetailRow label={`${earnLabel}${partnerPct != null ? ` (${partnerPct}%)` : ""}`} value={`+${fmt(net)}`} />
            <DetailRow label={`${platLabel}${platformPct != null ? ` (${platformPct}%)` : ""}`} value={`-${fmt(platformComm)}`} />
            {tax ? <DetailRow label="Est. Govt. Taxes (customer-borne)" value={fmt(tax)} /> : null}
            {detail.bonus ? <DetailRow label="Bonus" value={`+${fmt(detail.bonus)}`} /> : null}
            {detail.penalty ? <DetailRow label="Penalty" value={`-${fmt(detail.penalty)}`} /> : null}
            <DetailRow label={isCancel ? "Your Earning" : "Net Earning"} value={fmt(net)} strong />
          </div>
          );
        })()}
      </Sheet>
    </div>
  );
}
