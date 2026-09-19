import { fmt } from "@/lib/api";
import { ArrowDown } from "lucide-react";

const Line = ({ l, v, minus, strong, muted, testId }) => (
  <div className={`flex justify-between gap-3 text-xs ${strong ? "font-semibold text-slate-800 dark:text-slate-100" : muted ? "text-slate-400" : "text-slate-600 dark:text-slate-300"}`} data-testid={testId}>
    <span>{l}</span><span className={minus ? "text-emerald-600" : ""}>{minus ? "− " : ""}{v}</span>
  </div>
);

const TONES = {
  slate: ["border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30", "text-slate-600 dark:text-slate-300"],
  emerald: ["border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/10", "text-emerald-700 dark:text-emerald-300"],
  amber: ["border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10", "text-amber-700 dark:text-amber-300"],
  sky: ["border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/10", "text-sky-700 dark:text-sky-300"],
  violet: ["border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/10", "text-violet-700 dark:text-violet-300"],
  rose: ["border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-900/10", "text-rose-700 dark:text-rose-300"],
};

const Step = ({ n, title, tone = "slate", children, testId }) => {
  const [box, txt] = TONES[tone] || TONES.slate;
  return (
    <div className={`rounded-xl border p-3 space-y-1 ${box}`} data-testid={testId}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${txt}`}>Step {n} · {title}</p>
      {children}
    </div>
  );
};

const Arrow = () => <div className="flex justify-center -my-1"><ArrowDown className="h-3.5 w-3.5 text-slate-300" /></div>;

const DISC_LABEL = { discount: "Coupon discount", membership_discount: "Member discount", membership_visit_waiver: "Free visiting (Member)", loyalty_discount: "Loyalty points", referral_discount: "Referral discount" };

function BillSteps({ bill, couponCode }) {
  const discs = Object.entries(bill.discounts || {});
  return (
    <>
      <Step n={1} title="Charges (before tax)" testId="flow-charges">
        <Line l="Service amount" v={fmt(bill.service_amount)} />
        {bill.addons_total > 0 && <Line l="Add-ons" v={fmt(bill.addons_total)} />}
        {bill.emergency_fee > 0 && <Line l="Emergency / Instant fee" v={fmt(bill.emergency_fee)} />}
        {bill.surge > 0 && <Line l="Surge" v={fmt(bill.surge)} />}
        {bill.visiting_charge > 0 && <Line l="Visiting charge" v={fmt(bill.visiting_charge)} />}
        {bill.convenience_fee > 0 && <Line l="Convenience fee" v={fmt(bill.convenience_fee)} />}
        {bill.platform_fee > 0 && <Line l="Platform fee" v={fmt(bill.platform_fee)} />}
        {bill.other_charges > 0 && <Line l="Other charges" v={fmt(bill.other_charges)} />}
        <Line l="Gross charges" v={fmt(bill.gross_charges)} strong testId="flow-gross" />
      </Step>
      <Arrow />
      <Step n={2} title="Discounts (never refunded)" tone="emerald" testId="flow-discounts">
        {discs.length === 0 && <Line l="No discount applied" v={fmt(0)} muted />}
        {discs.map(([k, v]) => <Line key={k} l={`${DISC_LABEL[k] || k}${k === "discount" && couponCode ? ` (${couponCode})` : ""}`} v={fmt(v)} minus />)}
        <Line l="Taxable amount (gross − discounts)" v={fmt(bill.taxable)} strong testId="flow-taxable" />
      </Step>
      <Arrow />
      <Step n={3} title={`Tax ${bill.gst_pct ? `@ ${bill.gst_pct}%` : ""} on taxable amount`} tone="amber" testId="flow-tax">
        <Line l="GST collected (goes to government)" v={fmt(bill.gst)} />
        <Line l="Customer paid (taxable + GST)" v={fmt(bill.total)} strong testId="flow-total" />
      </Step>
    </>
  );
}

function SplitSteps({ c, base, startStep, baseLabel }) {
  const r = c.rates || {};
  const pe = c.partner_earning ?? c.partner_net;
  const pg = c.platform_gross;
  const mr = c.merchant_referral ?? c.merchant_partner_comm ?? 0;
  const mc = c.merchant_customer ?? c.merchant_customer_comm ?? 0;
  const pl = c.platform_earning ?? c.platform_commission;
  return (
    <>
      <Step n={startStep} title={`${baseLabel} → Partner ${r.partner_pct ?? ""}%`} tone="sky" testId="flow-partner">
        <Line l={`Commission base (tax excluded)`} v={fmt(base)} strong />
        <Line l={`Partner earning (${r.partner_pct}% of base)`} v={fmt(pe)} minus />
        <Line l="Remaining → goes to Platform" v={fmt(pg)} strong testId="flow-platform-gross" />
      </Step>
      <Arrow />
      <Step n={startStep + 1} title="Platform distributes merchant referrals" tone="violet" testId="flow-merchants">
        <Line l={`Merchant · Partner referral (${r.merchant_partner_referral_pct}%)${c.merchant_partner_name ? ` → ${c.merchant_partner_name}` : ""}`} v={fmt(mr)} minus={mr > 0} muted={!(mr > 0)} />
        <Line l={`Merchant · Customer (${r.merchant_customer_pct}%)${c.merchant_customer_name ? ` → ${c.merchant_customer_name}` : ""}`} v={fmt(mc)} minus={mc > 0} muted={!(mc > 0)} />
        <Line l={`Platform keeps (${r.platform_pct}%${(mr > 0 && mc > 0) ? "" : " + unreferred merchant shares"})`} v={fmt(pl)} strong testId="flow-platform-net" />
        <Line l="Check: partner + merchants + platform" v={fmt(Number(pe || 0) + Number(mr || 0) + Number(mc || 0) + Number(pl || 0))} muted testId="flow-check" />
      </Step>
    </>
  );
}

export function CommissionFlow({ comm, couponCode }) {
  const bill = comm.bill || {};
  const isCancel = comm.kind === "cancellation";
  return (
    <div className="space-y-1.5" data-testid="commission-flow">
      <BillSteps bill={bill} couponCode={couponCode} />
      {!isCancel && (<><Arrow /><SplitSteps c={comm} base={comm.base} startStep={4} baseLabel="Commission" /></>)}
      {isCancel && (
        <>
          <Arrow />
          <Step n={4} title={comm.partner_was_assigned ? `Cancellation — Customer refund ${comm.customer_refund_pct}%` : "Cancellation — no partner assigned → 100% refund"} tone="rose" testId="flow-cancel">
            <Line l="Amount customer actually paid" v={fmt(comm.original_amount)} strong />
            <Line l={`Service share refunded (${comm.customer_refund_pct}% of ${fmt(comm.service_amount)})`} v={fmt(comm.service_refund)} minus />
            <Line l={`Tax refunded proportionally (${comm.customer_refund_pct}% of ${fmt(comm.tax)})`} v={fmt(comm.gst_refund)} minus />
            <Line l="Total refund to customer" v={fmt(comm.customer_refund)} strong testId="flow-refund" />
            <Line l={`Retained · service share (${comm.partner_cancellation_pct}%)`} v={fmt(comm.partner_cancellation_amount)} />
            <Line l="Retained · tax (stays as tax liability)" v={fmt(comm.gst_retained)} />
            <Line l="Total retained" v={fmt(comm.retained_amount)} strong testId="flow-retained" />
          </Step>
          {comm.partner_was_assigned && (<><Arrow /><SplitSteps c={comm} base={comm.partner_cancellation_amount} startStep={5} baseLabel="Retained share" /></>)}
        </>
      )}
    </div>
  );
}
