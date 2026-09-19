import React from "react";

const inr = (n) => {
  const v = Number(n || 0);
  return "\u20b9" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

function Row({ k, v, sub, strong, negative, muted }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <div className="min-w-0">
        <span className={`text-[12.5px] ${strong ? "font-bold text-slate-800 dark:text-slate-100" : muted ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>{k}</span>
        {sub ? <p className="text-[10.5px] text-slate-400 leading-tight mt-0.5">{sub}</p> : null}
      </div>
      <span className={`shrink-0 tabular-nums text-[12.5px] ${strong ? "font-extrabold text-slate-900 dark:text-white" : negative ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-medium text-slate-700 dark:text-slate-200"}`}>{v}</span>
    </div>
  );
}

/**
 * Partner-facing financial view — renders the SAME server `breakdown` (single source of
 * truth) as the customer, only with partner-oriented visibility:
 *   • Payment Summary        → partner-eligible items + PARTNER-ELIGIBLE SUBTOTAL
 *   • Customer-Only Charges  → Platform/Convenience fee + Tax (shown, but clearly
 *                              flagged as excluded from partner earnings) + CUSTOMER PAID TOTAL
 *   • Your Earning           → share %, partner earning, platform earning, NET EARNING
 *   • Cancelled bookings     → original amount preserved + Payment & Refund block
 * NO local math — every number comes from `booking.breakdown`.
 */
export default function PartnerEarningSummary({ booking, fmt, className = "" }) {
  const money = fmt || inr;
  const bd = booking && booking.breakdown;
  if (!bd) return null;
  const earning = bd.earning || null;
  const customerOnly = Array.isArray(bd.customer_only_charges) ? bd.customer_only_charges.filter((c) => Number(c.amount || 0) > 0) : [];
  const charges = Array.isArray(bd.additional_charges) ? bd.additional_charges.filter((c) => Number(c.amount || 0) > 0) : [];
  const discount = Number(bd.discount || 0);
  const refund = bd.refund || null;
  const cancelled = booking.status === "cancelled" || !!refund;
  const eligibleSubtotal = bd.partner_eligible_subtotal != null ? Number(bd.partner_eligible_subtotal) : null;
  const customerPaid = bd.customer_paid_total != null ? Number(bd.customer_paid_total) : Number(bd.total || 0);

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden ${className}`} data-testid="partner-earning-summary">
      {/* PAYMENT SUMMARY (partner-eligible) */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Payment Summary</span>
      </div>
      <div className="px-3 py-2.5">
        <Row k="Service Amount" v={money(bd.services_subtotal)} />
        {charges.map((c) => <Row key={c.key || c.label} k={c.label} v={money(c.amount)} />)}
        {discount > 0 && (
          <Row k={`Coupon Discount${bd.coupon_code ? ` (${bd.coupon_code})` : ""}`}
            v={`- ${money(discount)}`} negative
            sub="AzoApp-funded · does not reduce your earning" />
        )}
        <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
          <Row k="Partner-eligible subtotal" v={money(eligibleSubtotal != null ? eligibleSubtotal : bd.subtotal)} strong />
        </div>
      </div>

      {/* CUSTOMER-ONLY CHARGES (shown but excluded from earnings) */}
      {(customerOnly.length > 0 || Number(bd.tax || 0) > 0) && (
        <>
          <div className="px-3 py-2 bg-amber-50/70 dark:bg-amber-900/10 border-y border-amber-100 dark:border-amber-900/30">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Customer-only charges</span>
          </div>
          <div className="px-3 py-2.5">
            {customerOnly.map((c) => (
              <Row key={c.key || c.label} k={c.label} v={money(c.amount)}
                sub={c.note || "Customer-only charge \u00b7 excluded from your earnings"} />
            ))}
            {Number(bd.tax || 0) > 0 && (
              <Row k={`Tax / GST${bd.gst_pct ? ` (${bd.gst_pct}%)` : ""}`} v={money(bd.tax)}
                sub="Collected from customer · excluded from your earnings" />
            )}
            <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
              <Row k="Customer paid total" v={money(customerPaid)} strong />
            </div>
          </div>
        </>
      )}

      {/* YOUR EARNING */}
      {earning && !cancelled && (
        <>
          <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/15 border-y border-emerald-100 dark:border-emerald-900/30">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Your earning</span>
          </div>
          <div className="px-3 py-2.5" data-testid="partner-earning-block">
            <Row k="Eligible amount" v={money(earning.base)} />
            <Row k="Partner share" v={`${earning.partner_share_pct}%`} muted />
            <Row k="Partner Earning" v={money(earning.partner_earning)} strong />
            <Row k="AzoApp Platform share" v={`${earning.platform_share_pct}%`} muted />
            <Row k="AzoApp Platform Earning" v={money(earning.platform_earning)} />
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-600 dark:bg-emerald-700">
            <span className="text-[12px] font-bold uppercase tracking-wider text-white">Net Earning</span>
            <span className="text-[15px] font-extrabold text-white tabular-nums" data-testid="partner-net-earning">{money(earning.net_earning)}</span>
          </div>
        </>
      )}

      {/* CANCELLED — original amount preserved + refund */}
      {cancelled && refund && (
        <>
          <div className="px-3 py-2 bg-rose-50 dark:bg-rose-900/15 border-y border-rose-100 dark:border-rose-900/30">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Payment &amp; refund</span>
          </div>
          <div className="px-3 py-2.5" data-testid="partner-refund-block">
            <Row k="Original booking amount" v={money(refund.original_amount)} strong />
            <Row k="Paid amount" v={money(bd.paid)} />
            <Row k={`Customer Refund${refund.refund_pct != null ? ` (${refund.refund_pct}%)` : ""}`}
              v={`- ${money(refund.refund_amount)}`} negative />
            <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
              <Row k="Amount retained" v={money(refund.retained)} strong />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
