import React from "react";
import { User, CalendarDays, Wallet, Percent, History, Download, Share2, FileText, MoreHorizontal, Printer, Copy, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Timeline } from "@/components/merchant/finance/FinanceKit";
import { SlideOver } from "./Overlays";
import { InvStatusBadge, TypeChip, DetailSkeleton } from "./InvoiceParts";
import { money, shortDate, longDate, buildTimeline, referenceOf } from "./invoiceUtils";

function Section({ icon: Icon, title, children, testid }) {
  return (
    <section data-testid={testid}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {title}</p>
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4">{children}</div>
    </section>
  );
}
function Row({ k, v, strong, mono, muted, testid }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
      <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{k}</span>
      <span data-testid={testid} className={`text-sm text-right break-words ${mono ? "font-mono text-[12.5px]" : ""} ${strong ? "font-bold text-slate-900 dark:text-white" : muted ? "text-slate-400" : "font-medium text-slate-800 dark:text-slate-200"}`}>{v}</span>
    </div>
  );
}
// Emphasised total row with a dashed separator on top. `green` makes the amount
// green + bold (used for the partner's NET EARNING).
function TotalRow({ k, v, green, testid }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-dashed border-slate-300 dark:border-slate-600 last:border-b-0">
      <span className="text-[13px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{k}</span>
      <span data-testid={testid} className={`text-base font-extrabold tabular-nums ${green ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>{v}</span>
    </div>
  );
}
// Small in-card subheading (e.g. "Earning Breakdown").
function SubCap({ children }) {
  return <p className="pt-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{children}</p>;
}

/**
 * Invoice detail — right drawer (desktop) / full-screen page (mobile).
 * `inv` = list-row summary (instant), `full` = fetched full invoice (line items etc.).
 */
export default function InvoiceDetailPanel({ inv, full, loading, onClose, onDownload, onPreview, onPrint, onShare, onCopy, downloading, merchantName, role = "merchant" }) {
  const d = full || inv;
  const open = !!inv;
  const cur = d?.currency || "INR";
  const cust = d?.customer_snapshot || {};
  const biz = d?.business_snapshot || {};
  const partner = d?.partner_snapshot || {};
  const paid = (d?.payment_status || "").toLowerCase() === "paid" ? d.total_amount : (d?.paid_amount ?? (d?.payment_status === "partially_paid" ? d?.paid_amount || 0 : 0));
  const balance = Math.max(0, (d?.total_amount || 0) - (paid || 0) - (d?.refund || 0));
  const commission = d?.commission || 0;
  const maskedPII = !!d?.customer_pii_masked;
  // Itemised line items (services + add-ons). Add-ons are marked with a leading "+ ".
  const lineItems = (d?.line_items || []).map((it) => ({
    ...it,
    isAddon: /^\s*\+/.test(it.desc || "") || (it.detail || "").toLowerCase() === "add-on",
    desc: (it.desc || "Item").replace(/^\s*\+\s*/, ""),
    qty: Number(it.qty || 1),
    amount: Number(it.amount || 0),
  }));
  // Booking-detail service list = only real services/add-ons (skip fee lines like surge/emergency)
  const serviceLines = lineItems.filter((it) => !/surge|emergency/i.test(it.desc));
  const otherFees = Math.max(0, Number(d?.fees || 0) - Number(d?.visiting_charge || 0));
  // Commission Rate = the configured platform commission % (of service cost, GST
  // excluded) — NOT commission/total. Prefer the snapshotted pct; else derive from
  // the commissionable base (service subtotal), never the GST-inclusive total.
  const commBase = d?.commission_base ?? d?.subtotal ?? d?.total_amount;
  const rate = d?.commission_pct != null
    ? d.commission_pct
    : (commission && commBase ? Math.round((commission / commBase) * 1000) / 10 : null);
  // Cancellation payment summary figures (customer booking view).
  const isCancel = d?.invoice_type === "cancellation";
  const bookingTotal = Number(d?.original_amount ?? d?.total_amount ?? 0);
  const custRefund = Number(d?.refund || 0);
  const amountRetained = Math.max(0, bookingTotal - custRefund);

  // ── Data-driven Payment Summary breakdown ──────────────────────────────────
  // The canonical `breakdown` is the single source of truth: `services_subtotal`
  // is the PURE service amount (services + add-ons) and each optional charge is a
  // separate entry — Emergency/Visiting/etc. are NEVER folded into Service Amount.
  // For partner/merchant the backend already strips the 100%-platform fees here,
  // so every figure below reconciles for whichever role is viewing.
  const bd0 = d?.breakdown || null;
  const acList = Array.isArray(bd0?.additional_charges) ? bd0.additional_charges : [];
  const CHARGE_LABEL = { emergency_fee: "Emergency Charge", visiting_charge: "Visiting Charge", surge: "Surge Charge", convenience_fee: "Convenience Fee", platform_fee: "Platform Fee" };
  const chargeLines = acList
    .map((c) => ({ key: c.key, label: CHARGE_LABEL[c.key] || c.label || c.key, amount: Number(c.amount || 0), note: c.note }))
    .filter((c) => c.amount > 0);
  // Pure service amount — prefer canonical value; else derive from itemised lines;
  // else strip emergency/surge out of the stored (folded) subtotal.
  const svcFromLines = serviceLines.reduce((s, it) => s + Number(it.amount || 0), 0);
  const emergencySurgeFromLines = lineItems.filter((it) => /surge|emergency|urgent/i.test(it.desc)).reduce((s, it) => s + Number(it.amount || 0), 0);
  const serviceAmt = bd0?.services_subtotal != null
    ? Number(bd0.services_subtotal)
    : (svcFromLines > 0 ? svcFromLines : Math.max(0, Number(d?.subtotal || 0) - emergencySurgeFromLines));
  const psDiscount = Number(bd0?.discount ?? d?.discount ?? 0);
  const psTax = Number(bd0?.tax ?? d?.tax ?? 0);
  // Subtotal = (service + all applicable charges) − discount  (== taxable base).
  const grossCharges = serviceAmt + chargeLines.reduce((s, c) => s + c.amount, 0);
  const psSubtotal = bd0?.taxable != null ? Number(bd0.taxable) : Math.round((grossCharges - psDiscount) * 100) / 100;
  const psTotal = bd0?.total != null ? Number(bd0.total) : Math.round((psSubtotal + psTax) * 100) / 100;
  const psRetained = Math.max(0, Math.round((psTotal - custRefund) * 100) / 100);

  const headerRight = d && (
    <>
      <button onClick={() => onShare(d, "system")} aria-label="Share" className="h-11 w-11 sm:h-9 sm:w-9 rounded-xl sm:rounded-lg grid place-items-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="detail-share"><Share2 className="h-[18px] w-[18px] sm:h-4 sm:w-4" /></button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button aria-label="More" className="h-11 w-11 sm:h-9 sm:w-9 rounded-xl sm:rounded-lg grid place-items-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="detail-more"><MoreHorizontal className="h-[18px] w-[18px] sm:h-4 sm:w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-xl">
          <DropdownMenuItem onClick={() => onPreview(d)} className="gap-2 h-10 rounded-lg" data-testid="detail-menu-preview"><FileText className="h-4 w-4 text-slate-500" /> View Invoice</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDownload(d)} className="gap-2 h-10 rounded-lg"><Download className="h-4 w-4 text-slate-500" /> Download PDF</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPrint(d)} className="gap-2 h-10 rounded-lg"><Printer className="h-4 w-4 text-slate-500" /> Print Invoice</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onShare(d, "whatsapp")} className="gap-2 h-10 rounded-lg"><Share2 className="h-4 w-4 text-emerald-600" /> Share on WhatsApp</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCopy(d)} className="gap-2 h-10 rounded-lg"><Copy className="h-4 w-4 text-slate-500" /> Copy Invoice Number</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <SlideOver open={open} onClose={onClose} title={d?.invoice_number || "Invoice"} subtitle={d ? `Issued ${shortDate(d.issue_date)}` : ""} headerRight={headerRight} testid="invoice-detail-drawer" width={520}
      footer={d && (
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 sm:h-11 flex-1 rounded-xl" onClick={() => onDownload(d)} disabled={downloading} data-testid="drawer-download">
            {downloading ? <span className="h-4 w-4 mr-1.5 rounded-full border-2 border-primary-200 border-t-primary-700 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download PDF
          </Button>
          <Button variant="outline" className="h-12 sm:h-11 flex-1 rounded-xl sm:hidden" onClick={() => onShare(d, "system")} data-testid="drawer-share"><Share2 className="h-4 w-4 mr-1.5" /> Share Invoice</Button>
          <Button className="h-12 sm:h-11 flex-1 rounded-xl bg-[#0D47A1] hover:bg-primary-800 text-white hidden sm:inline-flex" onClick={() => onPreview(d)} data-testid="drawer-view-full"><FileText className="h-4 w-4 mr-1.5" /> View Invoice</Button>
        </div>
      )}>
      {!d ? null : (
        <div className="space-y-5">
          {/* Invoice header card */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900 p-4" data-testid="detail-header-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {biz.logo ? <img src={biz.logo} alt="AzoApp" className="h-10 w-10 rounded-xl object-contain bg-white border border-slate-200 dark:border-slate-700 p-1" />
                  : <span className="h-10 w-10 rounded-xl bg-[#0D47A1] text-white font-heading font-black grid place-items-center shadow-md shadow-primary-500/30">A</span>}
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">AzoApp · {role === "partner" ? "Partner" : "Merchant"}</p>
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{role === "partner" ? (partner.name || merchantName) : (d.merchant_snapshot?.name || merchantName)}</p>
                </div>
              </div>
              <InvStatusBadge status={d.payment_status} testid="detail-status" />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Invoice Total</p>
                <p className="font-heading font-extrabold text-3xl text-slate-900 dark:text-white tabular-nums leading-tight" data-testid="detail-total">{money(d.total_amount, cur, 2)}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{d.invoice_number}</p>
                <p className="text-xs text-slate-400 mt-0.5">{longDate(d.issue_date)}</p>
                <div className="mt-1.5 flex justify-end"><TypeChip type={d.invoice_type} /></div>
              </div>
            </div>
          </div>

          {loading && !full ? <DetailSkeleton /> : (
            <>
              <Section icon={User} title="Customer Details" testid="detail-customer">
                <Row k="Customer name" v={cust.name || "—"} strong />
                <Row k="Mobile" v={maskedPII ? <span className="tracking-widest text-slate-400">*****</span> : (cust.phone || cust.mobile ? <a href={`tel:${cust.phone || cust.mobile}`} className="inline-flex items-center gap-1 text-primary-700 dark:text-primary-300"><Phone className="h-3.5 w-3.5" />{cust.phone || cust.mobile}</a> : "—")} />
                <Row k="Email" v={maskedPII ? <span className="tracking-widest text-slate-400">*****</span> : (cust.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" />{cust.email}</span> : "—")} />
                <Row k="Address" v={maskedPII ? <span className="tracking-widest text-slate-400">*****</span> : (cust.address ? <span className="inline-flex items-start gap-1 max-w-[220px]"><MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />{cust.address}</span> : "—")} />
                {maskedPII && <p className="py-2 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1"><span className="text-amber-500">🔒</span> Customer contact hidden after completion for privacy.</p>}
              </Section>

              <Section icon={CalendarDays} title="Booking Details" testid="detail-booking">
                <Row k="Booking ID" v={d.booking_code || "—"} mono />
                {serviceLines.length > 1 ? (
                  <div className="py-2.5 border-b border-slate-100 dark:border-slate-800/70">
                    <span className="text-sm text-slate-500 dark:text-slate-400">Services</span>
                    <div className="mt-1.5 space-y-1">
                      {serviceLines.map((it, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 text-sm">
                          <span className={`${it.isAddon ? "pl-2 text-slate-500 dark:text-slate-400" : "font-medium text-slate-800 dark:text-slate-200"}`}>{it.isAddon ? "↳ " : ""}{it.desc}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                          <span className="tabular-nums text-slate-700 dark:text-slate-300">{money(it.amount, cur, 2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Row k="Service" v={d.service_name || (serviceLines[0]?.desc) || "—"} />
                )}
                {d.booking_date && <Row k="Booking date" v={shortDate(d.booking_date)} />}
                <Row k="Reference ID" v={referenceOf(d)} mono />
                {d.transaction_id && <Row k="Transaction ID" v={d.transaction_id} mono />}
                {d.payment_method && <Row k="Payment method" v={d.payment_method} />}
              </Section>

              <Section icon={Wallet} title="Payment Summary" testid="detail-payment">
                {isCancel ? (
                  <>
                    <Row k="Service Amount" v={money(serviceAmt, cur, 2)} testid="detail-service-amount" />
                    {chargeLines.map((c) => (
                      <Row key={c.key} k={c.label} v={money(c.amount, cur, 2)} testid={`detail-charge-${c.key}`} />
                    ))}
                    {psDiscount > 0 ? <Row k="Coupon Discount" v={<span className="text-emerald-600 dark:text-emerald-400">− {money(psDiscount, cur, 2)}</span>} testid="detail-discount" /> : null}
                    <TotalRow k="Subtotal" v={money(psSubtotal, cur, 2)} testid="detail-subtotal" />
                    {psTax > 0 ? <Row k="Est. Govt. Taxes" v={money(psTax, cur, 2)} testid="detail-tax" /> : null}
                    <TotalRow k="Total Booking Amount" v={money(psTotal, cur, 2)} testid="detail-booking-total" />
                    <Row k="Paid Amount" v={money(psTotal, cur, 2)} testid="detail-paid" />
                    <Row k="Customer Refund" v={custRefund > 0 ? <span className="text-emerald-600 dark:text-emerald-400">− {money(custRefund, cur, 2)}</span> : money(0, cur, 2)} muted={!custRefund} testid="detail-customer-refund" />
                    <TotalRow k="Amount Retained" v={money(psRetained, cur, 2)} testid="detail-amount-retained" />
                  </>
                ) : (
                <>
                {lineItems.length > 0 ? (
                  <div className="py-2.5 border-b border-slate-100 dark:border-slate-800/70 space-y-1.5">
                    {lineItems.map((it, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 text-sm">
                        <span className={`${it.isAddon ? "pl-3 text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>
                          {it.isAddon ? "↳ " : ""}{it.desc}{it.qty > 1 ? ` ×${it.qty}` : ""}
                          {it.detail && !it.isAddon ? <span className="block text-[11px] text-slate-400">{it.detail}</span> : null}
                        </span>
                        <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200 shrink-0">{money(it.amount, cur, 2)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Row k="Subtotal" v={money(d.subtotal ?? d.total_amount, cur, 2)} strong={lineItems.length > 0} />
                {Number(d.visiting_charge) > 0 ? <Row k="Visiting Charge" v={money(d.visiting_charge, cur, 2)} /> : null}
                {otherFees > 0.001 ? <Row k="Platform / Service Fees" v={money(otherFees, cur, 2)} /> : null}
                {d.discount ? <Row k="Discount" v={<span className="text-emerald-600 dark:text-emerald-400">− {money(d.discount, cur, 2)}</span>} /> : null}
                {d.tax ? <Row k="Est. Govt. Taxes" v={money(d.tax, cur, 2)} /> : <Row k="Est. Govt. Taxes" v="Not applicable" muted />}
                <Row k="Total Amount" v={money(d.total_amount, cur, 2)} strong />
                <Row k="Paid Amount" v={money(paid, cur, 2)} testid="detail-paid" />
                {balance > 0 && d.invoice_type !== "cancellation" ? <Row k="Balance" v={money(balance, cur, 2)} strong testid="detail-balance" /> : null}
                <Row k="Refunded Amount" v={money(d.refund || 0, cur, 2)} muted={!d.refund} />
                </>
                )}
              </Section>

              {d?.role_earning ? (
                <Section icon={Percent} title={d.role_earning.role === "partner" ? "Your Earning" : "Your Commission"} testid="detail-commission">
                  {d.role_earning.role === "partner" && !d.role_earning.is_cancellation ? (
                    (() => {
                      // Clean, unambiguous partner breakdown:
                      // Service Amount + Visiting Charge = Commissionable Amount → × Rate = Partner Earning → Total.
                      const re = d.role_earning;
                      const base = Number(re.base || 0);                                   // commissionable base
                      const service = Number(re.service_cost != null ? re.service_cost : base);
                      const vc = Number(re.visiting_charge || 0);
                      // Visiting charge folded INTO the commission base (service + vc == base)
                      // vs. paid ON TOP of the partner's commission.
                      const vcInBase = vc > 0 && Math.abs((service + vc) - base) < 0.02;
                      return (
                        <>
                          <Row k="Service Amount" v={money(service, cur, 2)} testid="detail-earn-service" />
                          {vcInBase ? <Row k="Visiting Charge" v={money(vc, cur, 2)} /> : null}
                          <div className="flex items-center justify-between gap-4 py-2.5 border-t border-dashed border-slate-200 dark:border-slate-700">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Commissionable Amount</span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums" data-testid="detail-commissionable">{money(base, cur, 2)}</span>
                          </div>
                          {re.rate != null ? <Row k="Commission Rate" v={`${re.rate}%`} testid="detail-commission-rate" /> : null}
                          <Row k="Partner Earning" v={money(re.commission, cur, 2)} testid="detail-partner-earning" />
                          {vc > 0 && !vcInBase ? <Row k="Visiting Charge (paid to you)" v={"+ " + money(vc, cur, 2)} /> : null}
                          <Row k="Est. Govt. Taxes" v={<span className="text-slate-400">Excluded</span>} />
                          <div className="flex items-center justify-between gap-4 py-3 border-t border-slate-200 dark:border-slate-700">
                            <span className="text-[13px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Total Partner Earning</span>
                            <span data-testid="detail-net" className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{money(re.net, cur, 2)}</span>
                          </div>
                          {re.coupon_code ? (
                            <div className="mt-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5" data-testid="detail-coupon-note">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Coupon {re.coupon_code}</span>
                                {Number(re.coupon_discount || 0) > 0 ? <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">{money(re.coupon_discount, cur, 2)} off</span> : null}
                              </div>
                              <div className="flex items-center justify-between gap-3 mt-1">
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">Discount Bearer</span>
                                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{re.coupon_bearer || "AzoApp Platform"}</span>
                              </div>
                              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1.5">{re.coupon_note || "Coupon discount is funded by AzoApp and does not affect Partner earnings."}</p>
                            </div>
                          ) : null}
                        </>
                      );
                    })()
                  ) : d.role_earning.role === "partner" && d.role_earning.is_cancellation ? (
                    (() => {
                      // Partner cancellation earning — "Earning Breakdown" layout.
                      const re = d.role_earning;
                      const shareRate = re.rate;                          // e.g. 80
                      const platformRate = shareRate != null ? Math.round((100 - shareRate) * 100) / 100 : null;
                      return (
                        <>
                          <Row k="Eligible Earning Amount" v={<span>{money(re.base, cur, 2)} <span className="text-[11px] text-slate-400">(excl. tax)</span></span>} testid="detail-earn-base" />
                          {shareRate != null ? <Row k="Your Share Rate" v={`${shareRate}%`} testid="detail-commission-rate" /> : null}
                          <SubCap>Earning Breakdown</SubCap>
                          {shareRate != null ? <Row k="Partner Share" v={`${shareRate}%`} /> : null}
                          <Row k="Partner Earning" v={money(re.net, cur, 2)} testid="detail-partner-earning" />
                          {platformRate != null ? <Row k="Platform Share" v={`${platformRate}%`} /> : null}
                          {re.platform != null ? <Row k="AzoApp Platform Earning" v={money(re.platform, cur, 2)} testid="detail-platform-share" /> : null}
                          <TotalRow k="Net Earning" v={money(re.net, cur, 2)} green testid="detail-net" />
                          {re.coupon_code ? (
                            <div className="mt-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5" data-testid="detail-coupon-note">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Coupon {re.coupon_code}</span>
                                {Number(re.coupon_discount || 0) > 0 ? <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">{money(re.coupon_discount, cur, 2)} off</span> : null}
                              </div>
                              <div className="flex items-center justify-between gap-3 mt-1">
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">Discount Bearer</span>
                                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{re.coupon_bearer || "AzoApp Platform"}</span>
                              </div>
                              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1.5">{re.coupon_note || "Coupon discount is funded by AzoApp and does not affect Partner earnings."}</p>
                            </div>
                          ) : null}
                        </>
                      );
                    })()
                  ) : (
                    <>
                      {d.role_earning.base != null && <Row k={d.role_earning.service_label || "Total Service Amount"} v={<span>{money(d.role_earning.base, cur, 2)} <span className="text-[11px] text-slate-400">(excl. tax)</span></span>} testid="detail-earn-base" />}
                      {d.role_earning.role === "merchant" ? (
                        <>
                          <Row k={`Commission Referred By Partner${d.role_earning.referral_pct != null ? ` (${d.role_earning.referral_pct}%)` : ""}`} v={money(d.role_earning.referral || 0, cur, 2)} muted={!d.role_earning.referral} />
                          <Row k={`Commission By Referred Customer${d.role_earning.customer_pct != null ? ` (${d.role_earning.customer_pct}%)` : ""}`} v={money(d.role_earning.customer || 0, cur, 2)} muted={!d.role_earning.customer} />
                          <Row k={d.role_earning.commission_label} v={money(d.role_earning.commission, cur, 2)} />
                        </>
                      ) : (
                        <>
                          {d.role_earning.rate != null && <Row k="Your Share Rate" v={`${d.role_earning.rate}%`} testid="detail-commission-rate" />}
                          {d.role_earning.platform != null && <Row k={d.role_earning.platform_label || "Platform Share"} v={money(d.role_earning.platform, cur, 2)} testid="detail-platform-share" />}
                        </>
                      )}
                      <div className="flex items-start justify-between gap-4 py-2.5">
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{d.role_earning.net_label}</span>
                        <span data-testid="detail-net" className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{money(d.role_earning.net, cur, 2)}</span>
                      </div>
                    </>
                  )}
                </Section>
              ) : commission ? (
                <Section icon={Percent} title="Commission Details" testid="detail-commission">
                  <Row k="Commission" v={money(commission, cur, 2)} />
                  {rate != null && <Row k="Commission Rate" v={`${rate}%`} testid="detail-commission-rate" />}
                  <Row k="Net Amount" v={money((d.total_amount || 0) - commission, cur, 2)} strong />
                </Section>
              ) : null}

              <Section icon={History} title="Timeline" testid="detail-timeline">
                <div className="py-3"><Timeline steps={buildTimeline(d)} /></div>
              </Section>
            </>
          )}
        </div>
      )}
    </SlideOver>
  );
}
