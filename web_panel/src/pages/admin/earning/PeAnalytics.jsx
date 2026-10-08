import { useState } from "react";
import { BadgePercent, Wallet, CreditCard, Trophy, ChevronRight, Info } from "lucide-react";
import { Section, Seg, Bar, Card, Skel, SectionError, C, inr, pct, num } from "@/pages/admin/earning/peShared";

export function CommissionAnalytics({ state, onDrill }) {
  const [dim, setDim] = useState("category");
  const d = state.data;
  const rows = d ? d[`by_${dim}`] || [] : [];
  return (
    <Section testid="pe-commission" title="Commission Analytics" subtitle="Platform commission from settled bookings" icon={BadgePercent} tone={C.purple} state={state} isEmpty={d && !d.count}>
      {d && <div className="grid lg:grid-cols-[minmax(0,320px)_1fr] gap-6">
        <div className="grid grid-cols-2 gap-2.5 content-start">
          {[["Total Commission", inr(d.total, 0), `${num(d.count)} bookings`, C.purple, "pe-comm-total"],
            ["Avg per Booking", inr(d.avg, 0), `Effective ${pct(d.effective_rate)}`, C.navy, "pe-comm-avg"],
            ["Partner Share", inr(d.partner_share, 0), "Paid to partners", C.orange, "pe-comm-partner"],
            ["Merchant Commission", inr(d.merchant_referral.amount + d.merchant_customer.amount, 0), `Referral ${inr(d.merchant_referral.amount, 0)} · Customer ${inr(d.merchant_customer.amount, 0)}`, C.orange, "pe-comm-merchant"],
          ].map(([l, v, sub, c, t]) => (
            <div key={l} data-testid={t} className="rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500">{l}</p>
              <p className="font-heading font-extrabold text-[17px] tabular-nums" style={{ color: c }}>{v}</p>
              <p className="text-[10.5px] text-slate-400 leading-snug">{sub}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mb-3"><p className="text-[12px] font-semibold text-slate-500">Commission by</p><Seg testid="pe-comm-dim" options={[["category", "Category"], ["service", "Service"], ["city", "City"]]} value={dim} onChange={setDim} /></div>
          <div className="space-y-2.5">
            {rows.map((r, i) => (
              <button key={r.name} data-testid={`pe-comm-row-${i}`} onClick={() => onDrill(dim, r.name)} className="w-full text-left group">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2 min-w-0"><span className="text-[11px] font-bold text-slate-300 w-4">{i + 1}</span><span className="font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-[#0D47A1]">{r.name}</span></span>
                  <span className="flex items-center gap-3 shrink-0 text-[12px]"><span className="text-slate-400 hidden sm:inline">{num(r.count)} txns · avg {inr(r.avg, 0)}</span><span className="font-semibold tabular-nums text-slate-900 dark:text-white w-20 text-right">{inr(r.amount, 0)}</span><span className="font-bold text-slate-500 w-11 text-right">{pct(r.pct)}</span></span>
                </div>
                <div className="mt-1.5 pl-6"><Bar value={r.pct} color={C.purple} /></div>
              </button>
            ))}
          </div>
        </div>
      </div>}
    </Section>
  );
}

const ST_COL = { completed: C.green, pending: C.orange, failed: C.red, rejected: "#94A3B8", processing: C.blue };

export function PayoutAnalytics({ state, onNavigate }) {
  const d = state.data;
  const statuses = d ? Object.entries(d.by_status) : [];
  return (
    <Section testid="pe-payouts" title="Payout Analytics" subtitle="Partner & merchant withdrawals in period" icon={Wallet} tone={C.orange} state={state} isEmpty={d && !d.partner.count && !d.merchant.count}
      actions={<button onClick={() => onNavigate?.("pm_withdrawals")} data-testid="pe-payouts-link" className="text-[12px] font-semibold text-[#0D47A1] hover:underline">Open withdrawals</button>}>
      {d && <>
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {[["Partner Payouts", d.partner, `Accrued ${inr(d.accrued.partner, 0)}`], ["Merchant Payouts", d.merchant, `Accrued ${inr(d.accrued.merchant, 0)}`]].map(([l, x, sub]) => (
            <button key={l} onClick={() => onNavigate?.("pm_withdrawals")} data-testid={`pe-payout-${l.split(" ")[0].toLowerCase()}`} className="text-left rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2.5 hover:border-[#0D47A1]/30 transition-colors">
              <p className="text-[11px] font-semibold text-slate-500">{l}</p>
              <p className="font-heading font-extrabold text-[17px] tabular-nums text-slate-900 dark:text-white">{inr(x.by_status.completed?.amount || 0, 0)}</p>
              <p className="text-[10.5px] text-slate-400">{num(x.count)} requests · {sub}</p>
            </button>
          ))}
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden mb-3 bg-slate-100">{statuses.map(([k, v]) => <div key={k} style={{ width: `${v.pct}%`, background: ST_COL[k] || C.slate }} />)}</div>
        <div className="divide-y divide-slate-50 dark:divide-slate-800">
          {statuses.map(([k, v]) => (
            <button key={k} data-testid={`pe-payout-status-${k}`} onClick={() => onNavigate?.("pm_withdrawals")} className="w-full flex items-center justify-between py-2 text-[13px] group">
              <span className="flex items-center gap-2 capitalize text-slate-700 dark:text-slate-200"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ST_COL[k] || C.slate }} />{k}</span>
              <span className="flex items-center gap-3"><span className="text-[11px] text-slate-400">{num(v.count)}</span><span className="font-semibold tabular-nums w-24 text-right">{inr(v.amount, 0)}</span><span className="text-[11px] font-bold text-slate-500 w-11 text-right">{pct(v.pct)}</span><ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-[#0D47A1]" /></span>
            </button>
          ))}
        </div>
      </>}
    </Section>
  );
}

export function GatewayCost({ state }) {
  const d = state.data;
  return (
    <Section testid="pe-gateway" title="Payment Gateway Cost" subtitle="Charges recorded on payment transactions" icon={CreditCard} tone={C.red} state={state} isEmpty={d && !d.by_method.length}>
      {d && !d.configured && <div data-testid="pe-gateway-missing" className="rounded-xl bg-slate-50 px-3.5 py-3 text-[12.5px] text-slate-500 flex gap-2"><Info className="h-4 w-4 shrink-0" />Gateway fee data is not recorded on payment transactions, so gateway cost is not shown.</div>}
      {d && d.configured && <>
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[["Gateway Charges", inr(d.total_fee, 0), C.red], ["Effective Fee", pct(d.fee_pct, 2), C.navy], ["Net After Fees", inr(d.net_after_fee, 0), C.green]].map(([l, v, c]) => (
            <div key={l} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5"><p className="text-[11px] font-semibold text-slate-500">{l}</p><p className="font-heading font-extrabold text-[15px] tabular-nums" style={{ color: c }}>{v}</p></div>
          ))}
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[13px] min-w-[420px]">
            <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="text-left font-semibold py-2 px-1">Method</th><th className="text-right font-semibold px-1">Txns</th><th className="text-right font-semibold px-1">Gross</th><th className="text-right font-semibold px-1">Fee</th><th className="text-right font-semibold px-1">Fee %</th><th className="text-right font-semibold px-1">Net</th></tr></thead>
            <tbody>{d.by_method.map((m) => (
              <tr key={m.method} data-testid={`pe-gw-${m.method}`} className="border-t border-slate-50 dark:border-slate-800">
                <td className="py-2 px-1 font-medium text-slate-700 dark:text-slate-200">{m.label}</td>
                <td className="text-right px-1 tabular-nums text-slate-500">{num(m.count)}</td>
                <td className="text-right px-1 tabular-nums">{inr(m.gross, 0)}</td>
                <td className="text-right px-1 tabular-nums text-red-600">{m.with_fee ? inr(m.fee, 0) : <span className="text-[11px] text-slate-400">Not recorded</span>}</td>
                <td className="text-right px-1 tabular-nums text-slate-500">{m.with_fee ? pct(m.fee_pct, 2) : "—"}</td>
                <td className="text-right px-1 tabular-nums font-semibold">{inr(m.net, 0)}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
        {d.coverage < 100 && <p className="text-[11px] text-slate-400 mt-2">Fee data present on {pct(d.coverage)} of payment-linked records.</p>}
      </>}
    </Section>
  );
}

const TOPS = [["service_revenue", "Top Revenue Service", "revenue", "service"], ["service_profit", "Top Profit Service", "profit", "service"], ["category_revenue", "Top Revenue Category", "revenue", "category"], ["category_profit", "Top Profit Category", "profit", "category"], ["city_revenue", "Top Revenue City", "revenue", "city"], ["partner", "Top Partner Contribution", "platform_revenue", "partner"], ["merchant", "Top Merchant Contribution", "revenue", "merchant"]];

export function TopPerformers({ state, onDrill }) {
  if (state.error) return <Card className="p-4"><SectionError onRetry={state.reload} testid="pe-top-error" /></Card>;
  const d = state.data;
  return (
    <div data-testid="pe-top">
      <div className="flex items-center gap-2 mb-3"><Trophy className="h-4 w-4 text-amber-500" /><p className="font-heading font-bold text-[15px] text-slate-900 dark:text-white">Top Performers</p></div>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x">
        {TOPS.map(([k, l, metric, dim]) => {
          const v = d?.[k];
          return (
            <Card key={k} data-testid={`pe-top-${k}`} onClick={() => v && onDrill(dim, dim === "partner" || dim === "merchant" ? v.key : v.name)} className={`p-4 min-w-[210px] flex-1 snap-start ${v ? "cursor-pointer hover:border-[#0D47A1]/30" : ""} transition-colors`}>
              <div className="flex items-center justify-between"><p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400">{l}</p><span className="text-[11px] font-black text-amber-500">#{1}</span></div>
              {!d ? <div className="mt-3 space-y-2"><Skel h="h-5" /><Skel h="h-3" w="w-2/3" /></div> : v ? <>
                <p className="mt-2 font-heading font-bold text-[15px] text-slate-900 dark:text-white truncate" title={v.name}>{v.name}</p>
                <p className="font-heading font-extrabold text-[18px] tabular-nums" style={{ color: metric === "profit" ? C.green : C.blue }}>{inr(v[metric], 0)}</p>
                <p className="text-[11px] text-slate-400">{num(v.orders)} orders · {metric === "profit" ? "profit" : metric === "platform_revenue" ? "platform earning" : "revenue"}</p>
              </> : <p className="mt-3 text-[12px] text-slate-400">No qualifying data</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
