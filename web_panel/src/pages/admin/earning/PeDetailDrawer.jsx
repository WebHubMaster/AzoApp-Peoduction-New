import { X, ExternalLink, Clock, FileText, Link2, CheckCircle2, RotateCcw, Banknote, PlusCircle, RefreshCw } from "lucide-react";
import { Skel, SectionError, C, inr, dtt, useSection } from "@/pages/admin/earning/peShared";
import { METHOD_LABEL } from "@/pages/admin/earning/PeFilters";

const KIND_ICON = { created: PlusCircle, updated: RefreshCw, booking: Clock, payment: Banknote, paid: CheckCircle2, refunded: RotateCcw };
const Row = ({ k, v, tone, mono, testid }) => (
  <div data-testid={testid} className="flex items-start justify-between gap-4 py-2 border-b border-slate-50 dark:border-slate-800 last:border-0 text-[13px]">
    <span className="text-slate-500 shrink-0">{k}</span>
    <span className={`text-right text-slate-800 dark:text-slate-100 break-all ${mono ? "font-mono text-[12px]" : "font-medium"}`} style={{ color: tone }}>{v ?? "—"}</span>
  </div>
);
const Block = ({ title, icon: Icon, children }) => (
  <div className="rounded-[14px] border border-slate-100 dark:border-slate-800 p-4">
    <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-400 mb-2">{Icon && <Icon className="h-3.5 w-3.5" />}{title}</p>
    {children}
  </div>
);

export default function PeDetailDrawer({ uid, onClose, onNavigate, onOpenBooking }) {
  const st = useSection(`/admin/platform-earning/records/${encodeURIComponent(uid || "")}`, {}, !!uid);
  if (!uid) return null;
  const d = st.data; const f = d?.fact || {};
  const flow = d ? [
    ["Gross amount collected", f.gross, C.blue, false],
    ["GST (pass-through)", f.tax, C.amber, true],
    ["Refund to customer", (f.refund || 0) + (f.refund_pending || 0), C.red, true],
    ["Partner payout", f.partner_payout, C.orange, true],
    ["Merchant payout", f.merchant_payout, C.orange, true],
  ].filter((x, i) => i === 0 || x[1]) : [];
  return (
    <div className="fixed inset-0 z-[9991]" data-testid="pe-detail-drawer">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute inset-0 md:left-auto md:w-[560px] bg-white dark:bg-slate-900 flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{f.source_label || "Financial record"}</p>
            <p className="font-heading font-extrabold text-lg text-slate-900 dark:text-white truncate" data-testid="pe-detail-ref">{f.booking_code || f.txn_ref || uid.split(":")[1]?.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} data-testid="pe-detail-close" className="p-1 text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {st.error ? <SectionError onRetry={st.reload} testid="pe-detail-error" /> : !d ? <div className="space-y-3"><Skel h="h-24" /><Skel h="h-40" /><Skel h="h-32" /></div> : <>
            <div className="rounded-[14px] p-4 text-white" style={{ background: C.navy }}>
              <p className="text-[11px] font-semibold text-white/60">Net platform earning</p>
              <p className="font-heading font-extrabold text-[28px] tabular-nums" data-testid="pe-detail-net">{inr(f.net_earning)}</p>
              <p className="text-[12px] text-white/70">Profit impact {f.net_earning >= 0 ? "+" : ""}{inr(f.net_earning)} · {dtt(f.date)}</p>
            </div>
            <Block title="How it was calculated" icon={FileText}>
              {flow.map(([k, v, c, minus]) => <Row key={k} k={`${minus ? "− " : ""}${k}`} v={inr(v)} tone={c} />)}
              <Row k="= Platform share" v={inr(f.platform_revenue)} tone={C.blue} testid="pe-detail-platform" />
              {f.commission ? <Row k="  · Commission" v={inr(f.commission)} tone={C.purple} /> : null}
              {f.platform_fee ? <Row k="  · Platform / convenience fees" v={inr(f.platform_fee)} /> : null}
              {f.cancellation_fee ? <Row k="  · Cancellation fee retained" v={inr(f.cancellation_fee)} /> : null}
              {f.other_income ? <Row k="  · Direct platform income" v={inr(f.other_income)} /> : null}
              <Row k="− Gateway fee" v={f.has_gateway ? inr(f.gateway_fee) : "Not recorded"} tone={C.red} />
              <Row k="= Net platform earning" v={inr(f.net_earning)} tone={f.net_earning < 0 ? C.red : C.green} />
              {Math.abs(f.variance || 0) > 1 && <p className="mt-2 text-[12px] text-red-600 font-semibold" data-testid="pe-detail-variance">Reconciliation difference on this record: {inr(f.variance)}</p>}
            </Block>
            <Block title="References" icon={Link2}>
              <Row k="Transaction reference" v={f.txn_ref} mono />
              <Row k="Booking reference" v={f.booking_code} mono />
              <Row k="Customer" v={f.customer_name} />
              <Row k="Partner" v={f.partner_name} />
              <Row k="Merchant" v={f.merchant_name} />
              <Row k="Service" v={f.service ? `${f.service}${f.category ? ` · ${f.category}` : ""}` : null} />
              <Row k="City" v={f.city} />
              <Row k="Payment method" v={METHOD_LABEL[f.method] || f.method} />
              <Row k="Status" v={[f.booking_status, f.txn_status, f.refund_status].filter(Boolean).join(" · ") || null} />
              <Row k="Date / time" v={dtt(f.date)} />
              {d.invoices?.length > 0 && <Row k="Invoices" v={d.invoices.map((i) => i.number).filter(Boolean).join(", ")} mono />}
            </Block>
            <Block title="Audit trail" icon={Clock}>
              {!d.audit.length ? <p className="text-[12px] text-slate-400">No audit events stored for this record.</p> : (
                <div className="relative pl-6" data-testid="pe-detail-audit"><div className="absolute left-[9px] top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
                  {d.audit.map((e, i) => { const I = KIND_ICON[e.kind] || Clock; return (
                    <div key={i} className="relative pb-3 last:pb-0">
                      <span className="absolute -left-6 top-0 h-[18px] w-[18px] rounded-full bg-white dark:bg-slate-900 border border-slate-200 flex items-center justify-center"><I className="h-2.5 w-2.5 text-[#0D47A1]" /></span>
                      <p className="text-[13px] text-slate-700 dark:text-slate-200">{e.label}</p><p className="text-[11px] text-slate-400">{dtt(e.at)}</p>
                    </div>); })}
                </div>)}
            </Block>
            <div className="flex flex-wrap gap-2">
              {d.booking?.id && <button data-testid="pe-detail-open-booking" onClick={() => onOpenBooking?.(d.booking.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-700 hover:border-[#0D47A1]/40"><ExternalLink className="h-3.5 w-3.5" />Open booking</button>}
              <button data-testid="pe-detail-view-txns" onClick={() => onNavigate?.("ledger")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-700 hover:border-[#0D47A1]/40"><ExternalLink className="h-3.5 w-3.5" />View Transactions</button>
              {d.refunds?.length > 0 && <button onClick={() => onNavigate?.("refunds")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-700 hover:border-[#0D47A1]/40"><ExternalLink className="h-3.5 w-3.5" />View Refunds</button>}
              {d.invoices?.length > 0 && <button onClick={() => onNavigate?.("invoices")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-700 hover:border-[#0D47A1]/40"><ExternalLink className="h-3.5 w-3.5" />View Invoices</button>}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
