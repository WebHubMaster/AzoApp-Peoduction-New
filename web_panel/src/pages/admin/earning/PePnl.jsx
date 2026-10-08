import { Scale, Layers, RotateCcw, ScanLine, Coins, ArrowDown, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Section, Bar, C, inr, pct, num } from "@/pages/admin/earning/peShared";

const SRC_COLOR = { commission: C.purple, convenience_fee: C.blue, platform_fee: "#1E88E5", other_fee: "#64B5F6", cancellation_fee: C.red, registration_fee: C.navy, starter_kit: C.amber, membership: C.green, withdrawal_fee: C.orange };

const Line = ({ label, value, tone, minus, strong, note, testid, indent }) => (
  <div data-testid={testid} className={`flex items-center justify-between gap-3 py-2 ${strong ? "border-t border-slate-200 dark:border-slate-700 mt-1 pt-3" : "border-b border-slate-50 dark:border-slate-800/60"}`}>
    <span className={`text-[13px] ${strong ? "font-bold text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"} ${indent ? "pl-3" : ""}`}>{minus && <span className="text-slate-400 mr-1">−</span>}{label}{note && <span className="block text-[11px] text-slate-400 font-normal">{note}</span>}</span>
    <span className={`tabular-nums text-[13px] ${strong ? "font-heading font-extrabold text-[16px]" : "font-semibold"}`} style={{ color: tone }}>{value}</span>
  </div>
);

export function PnlStatement({ state }) {
  const s = state.data; const p = s?.pnl;
  return (
    <Section testid="pe-pnl" title="Profit & Loss" subtitle="Statement derived from settled ledger, refunds & payouts" icon={Scale} tone={C.green} state={state} isEmpty={s && !s.has_data}>
      {p && <>
        <Line testid="pe-pnl-revenue" label="Total Revenue" note="Collections excluding GST" value={inr(p.revenue)} tone={C.blue} strong={false} />
        <Line label="GST collected (pass-through)" note="Not counted as revenue" value={inr(p.tax)} tone={C.amber} indent />
        <Line testid="pe-pnl-refunds" minus label="Refunds" value={inr(p.refunds)} tone={C.red} />
        {p.refund_pending > 0 && <Line minus label="Refunds pending / failed" value={inr(p.refund_pending)} tone={C.orange} />}
        <Line testid="pe-pnl-partner" minus label="Partner Payouts" value={inr(p.partner_payout)} tone={C.orange} />
        <Line testid="pe-pnl-merchant" minus label="Merchant Payouts" value={inr(p.merchant_payout)} tone={C.orange} />
        <Line testid="pe-pnl-net-rev" label="Net Platform Revenue" value={inr(p.platform_revenue)} tone={C.blue} strong />
        <Line testid="pe-pnl-gateway" minus label="Payment Gateway Charges" value={s.gateway_configured ? inr(p.gateway_fee) : "Not recorded"} tone={C.red} note={s.gateway_configured && s.gateway_coverage < 100 ? `Fee data on ${pct(s.gateway_coverage)} of records` : null} />
        <Line testid="pe-pnl-gross-profit" label="Gross Profit" value={inr(p.gross_profit)} tone={p.gross_profit < 0 ? C.red : C.green} strong />
        <Line testid="pe-pnl-opex" minus label="Operational & Other Expenses" value={s.expense_configured ? inr(p.operating_expenses) : "Expense data not configured"} tone={s.expense_configured ? C.red : "#94A3B8"} />
        <Line testid="pe-pnl-net-profit" label="Net Profit" value={s.expense_configured ? inr(p.net_profit) : "Expense data not configured"} tone={s.expense_configured ? C.green : "#94A3B8"} strong />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-900/10 p-3" data-testid="pe-pnl-gross-margin"><p className="text-[11px] font-semibold text-emerald-700">Gross Margin</p><p className="font-heading font-extrabold text-xl text-emerald-700 tabular-nums">{pct(p.gross_margin)}</p></div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3" data-testid="pe-pnl-net-margin"><p className="text-[11px] font-semibold text-slate-500">Net Margin</p><p className="font-heading font-extrabold text-xl tabular-nums" style={{ color: p.net_margin == null ? "#94A3B8" : C.green }}>{p.net_margin == null ? "—" : pct(p.net_margin)}</p>{p.net_margin == null && <p className="text-[10.5px] text-slate-400">Needs expense data</p>}</div>
        </div>
      </>}
    </Section>
  );
}

export function RevenueBreakdown({ state }) {
  const rows = state.data?.revenue_sources || [];
  return (
    <Section testid="pe-revenue-breakdown" title="Revenue Breakdown" subtitle="Where platform revenue comes from" icon={Layers} tone={C.purple} state={state} isEmpty={!rows.length}>
      <div className="flex h-2.5 rounded-full overflow-hidden mb-5 bg-slate-100">
        {rows.map((r) => <div key={r.key} title={`${r.label} ${pct(r.pct)}`} style={{ width: `${r.pct}%`, background: SRC_COLOR[r.key] || C.slate }} />)}
      </div>
      <div className="space-y-3.5">
        {rows.map((r) => (
          <div key={r.key} data-testid={`pe-rev-src-${r.key}`}>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: SRC_COLOR[r.key] || C.slate }} /><span className="font-medium text-slate-700 dark:text-slate-200 truncate">{r.label}</span></span>
              <span className="flex items-center gap-3 shrink-0"><span className="text-[11px] text-slate-400">{num(r.count)} txns</span><span className="font-semibold tabular-nums text-slate-900 dark:text-white w-24 text-right">{inr(r.amount, 0)}</span><span className="text-[11px] font-bold text-slate-500 w-12 text-right">{pct(r.pct)}</span></span>
            </div>
            <div className="mt-1.5"><Bar value={r.pct} color={SRC_COLOR[r.key] || C.slate} /></div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const FlowStep = ({ label, value, tone, sub, testid }) => (
  <div data-testid={testid} className="rounded-xl border border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
    <div><p className="text-[12px] font-semibold text-slate-500">{label}</p>{sub && <p className="text-[11px] text-slate-400">{sub}</p>}</div>
    <p className="font-heading font-extrabold text-[18px] tabular-nums" style={{ color: tone }}>{value}</p>
  </div>
);

export function RefundImpact({ state, onNavigate }) {
  const s = state.data; const p = s?.pnl;
  return (
    <Section testid="pe-refund-impact" title="Refund Impact" subtitle="How cancellations & refunds affect earnings" icon={RotateCcw} tone={C.red} state={state} isEmpty={s && !s.has_data}
      actions={<button onClick={() => onNavigate?.("refunds")} data-testid="pe-refunds-link" className="text-[12px] font-semibold text-[#0D47A1] hover:underline">View refunds</button>}>
      {p && <>
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {[["Total Refunds", num(s.counts.cancellations), "records"], ["Refunded Amount", inr(p.refunds, 0), "processed"], ["Collection Lost", inr(p.refunds + p.refund_pending, 0), "incl. pending/failed"], ["Retained as Fees", inr(s.cancellation_fee, 0), "cancellation fees"]].map(([l, v, sub]) => (
            <div key={l} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5"><p className="text-[11px] font-semibold text-slate-500">{l}</p><p className="font-heading font-bold text-[15px] text-slate-900 dark:text-white tabular-nums">{v}</p><p className="text-[10.5px] text-slate-400">{sub}</p></div>
          ))}
        </div>
        <div className="space-y-1.5">
          <FlowStep testid="pe-flow-gross" label="Gross Collection" value={inr(p.gross_collection, 0)} tone={C.blue} />
          <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-slate-300" /></div>
          <FlowStep testid="pe-flow-refund" label="Refund Impact" sub="Refunded + pending refunds" value={`−${inr(p.refunds + p.refund_pending, 0)}`} tone={C.red} />
          <div className="flex justify-center"><ArrowDown className="h-4 w-4 text-slate-300" /></div>
          <FlowStep testid="pe-flow-net" label="Net Collection After Refunds" value={inr(p.gross_collection - p.refunds - p.refund_pending, 0)} tone={C.green} />
        </div>
        <p className="text-[11px] text-slate-400 mt-3 flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-px" />Commission is only booked on completion, so cancelled bookings carry no commission to reverse. {s.reconciliation && "Commission reversed: ₹0 (no reversal entries in ledger)."}</p>
      </>}
    </Section>
  );
}

export function Reconciliation({ state }) {
  const r = state.data?.reconciliation;
  return (
    <Section testid="pe-reconciliation" title="Financial Reconciliation" subtitle="Collections vs recorded platform share" icon={ScanLine} tone={C.navy} state={state} isEmpty={state.data && !state.data.has_data}>
      {r && <>
        {!r.matched ? (
          <div data-testid="pe-recon-warning" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 mb-3 flex gap-2 text-[12.5px] text-red-700"><AlertTriangle className="h-4 w-4 shrink-0 mt-px" /><span><b>Reconciliation difference detected:</b> {inr(r.difference)} between calculated and recorded platform revenue. See anomaly alerts for affected records.</span></div>
        ) : (
          <div data-testid="pe-recon-ok" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 mb-3 flex gap-2 text-[12.5px] text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0 mt-px" /><span>Reconciled — calculated and recorded totals match{Math.abs(r.difference) > 0 ? ` (rounding ${inr(r.difference)})` : ""}.</span></div>
        )}
        <Line label="Gross Collection" value={inr(r.gross_collection)} tone={C.blue} />
        <Line minus label="GST (pass-through)" value={inr(r.tax)} tone={C.amber} />
        <Line minus label="Refunds (incl. pending)" value={inr(r.refunds + r.refund_pending)} tone={C.red} />
        <Line minus label="Partner / Merchant Payouts" value={inr(r.payouts)} tone={C.orange} />
        <Line label="Calculated Platform Revenue" value={inr(r.calculated)} strong />
        <Line label="Recorded in source records" value={inr(r.recorded)} tone={C.blue} />
        <Line minus label="Fees / Charges (gateway)" value={inr(r.fees_charges)} tone={C.red} />
        <Line testid="pe-recon-net" label="Platform Net Earning" value={inr(r.net_earning)} tone={C.green} strong />
      </>}
    </Section>
  );
}

export function FeeAnalytics({ state }) {
  const d = state.data; const items = d?.items || [];
  return (
    <Section testid="pe-fees" title="Platform Fee Analytics" subtitle="Collected · Refunded · Net collected" icon={Coins} tone={C.blue} state={state} isEmpty={d && !items.length}>
      {d && <>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[13px] min-w-[420px]">
            <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="text-left font-semibold py-2 px-1">Fee</th><th className="text-right font-semibold px-1">Txns</th><th className="text-right font-semibold px-1">Collected</th><th className="text-right font-semibold px-1">Refunded</th><th className="text-right font-semibold px-1">Net</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.key} data-testid={`pe-fee-${i.key}`} className="border-t border-slate-50 dark:border-slate-800">
                  <td className="py-2.5 px-1 font-medium text-slate-700 dark:text-slate-200">{i.label}</td>
                  <td className="text-right px-1 text-slate-500 tabular-nums">{num(i.count)}</td>
                  <td className="text-right px-1 font-semibold tabular-nums">{inr(i.collected, 0)}</td>
                  <td className="text-right px-1 text-slate-400 text-[11px]">{i.refunded == null ? "Not tracked" : inr(i.refunded, 0)}</td>
                  <td className="text-right px-1 font-semibold tabular-nums text-emerald-700">{inr(i.net, 0)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 dark:border-slate-700"><td className="py-2.5 px-1 font-bold">Total Platform Fees</td><td /><td className="text-right px-1 font-heading font-extrabold tabular-nums">{inr(d.total_collected, 0)}</td><td /><td className="text-right px-1 font-heading font-extrabold tabular-nums text-emerald-700">{inr(d.total_net, 0)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-px" />{d.note}</p>
      </>}
    </Section>
  );
}
