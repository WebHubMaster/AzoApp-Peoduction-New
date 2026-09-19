import React, { forwardRef } from "react";

const money = (n, cur = "INR") => {
  const sym = cur === "INR" ? "₹" : cur + " ";
  return sym + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(iso).slice(0, 10);
  }
};

const TYPE_LABEL = {
  booking: "Tax Invoice",
  cancellation: "Cancellation Note",
  transaction: "Transaction Statement",
  withdrawal: "Withdrawal Statement",
  settlement: "Settlement Statement",
  commission: "Commission Statement",
  refund: "Refund Document",
  payment: "Payment Invoice",
};

const statusTone = (s) => {
  const k = (s || "").toLowerCase();
  if (["paid", "completed", "issued", "settled", "credited"].includes(k)) return { bg: "#ecfdf5", fg: "#047857", bd: "#a7f3d0" };
  if (["refunded", "cancelled", "rejected", "failed"].includes(k)) return { bg: "#fef2f2", fg: "#b91c1c", bd: "#fecaca" };
  if (["pending", "processing", "charged"].includes(k)) return { bg: "#fffbeb", fg: "#b45309", bd: "#fde68a" };
  return { bg: "#f1f5f9", fg: "#334155", bd: "#e2e8f0" };
};

function Badge({ children, tone }) {
  // Per user request: render the status as PLAIN COLORED TEXT (no pill box /
  // background / border). html2canvas (used for PDF export) does not reliably
  // vertically-centre text inside a padded/bordered box, which made the badge
  // text drift up/down in the downloaded PDF. Plain text rasterises perfectly
  // and looks identical on screen and in the PDF.
  return (
    <span
      style={{
        color: tone.fg,
        display: "inline-block",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        verticalAlign: "middle",
      }}
    >
      {children}
    </span>
  );
}

function Party({ label, name, lines }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{label}</p>
      <p className="text-[13px] font-semibold text-slate-900">{name || "—"}</p>
      {(lines || []).filter(Boolean).map((l, i) => (
        <p key={i} className="text-[12px] text-slate-500 leading-snug">{l}</p>
      ))}
    </div>
  );
}

/**
 * Premium, enterprise-grade A4 invoice. Fixed light styling so the PDF output
 * is identical regardless of the app theme. `inv` is the backend invoice doc.
 */
const InvoiceDocument = forwardRef(function InvoiceDocument({ inv }, ref) {
  if (!inv) return null;
  const biz = inv.business_snapshot || {};
  const cur = inv.currency || biz.currency || "INR";
  const cust = inv.customer_snapshot || {};
  const items = inv.line_items || [];
  const st = statusTone(inv.status);
  const pst = statusTone(inv.payment_status);

  const _vc = Number(inv.visiting_charge || 0);
  const _otherFees = Math.round((Number(inv.fees || 0) - _vc) * 100) / 100;
  // Taxable Amount (audit spec #3): the portion GST is charged on (excludes the
  // untaxed visiting charge). Informational row — not added to the total again.
  const _taxable = inv.taxable != null
    ? Number(inv.taxable)
    : Math.round((Number(inv.subtotal || 0) + _otherFees) * 100) / 100;
  const _isCancel = inv.invoice_type === "cancellation";
  const rows = [
    ["Subtotal", inv.subtotal, false],
    // cost / charge lines FIRST
    _vc > 0 ? ["Visiting Charge", _vc, false] : null,
    _otherFees > 0.001 ? ["Platform / Service Fees", _otherFees, false] : null,
    inv.discount ? ["Discount", -Math.abs(inv.discount), false] : null,
    inv.commission ? ["Platform Fee", inv.commission, "muted"] : null,
    // tax (GST) LAST — computed on the taxable amount shown just above it
    _taxable > 0 && inv.tax ? ["Taxable Amount", _taxable, "muted"] : null,
    inv.tax ? ["Est. Govt. Taxes", inv.tax, false] : null,
    // Cancellation breakdown — headline is the ORIGINAL order value; the refund is on
    // the separate Refund Receipt, shown here only as muted info.
    _isCancel && inv.cancellation_pct != null ? [`Customer Refund ${Math.round(inv.cancellation_pct * 100) / 100}%`, null, "pct"] : null,
    _isCancel && inv.refund ? ["Refund Issued (see Refund Receipt)", -Math.abs(inv.refund), "muted"] : null,
    inv.refund && !_isCancel ? ["Total Customer Refund", -Math.abs(inv.refund), false] : null,
  ].filter(Boolean);

  const bizAddr = [biz.address, [biz.city, biz.state, biz.zip].filter(Boolean).join(", "), biz.country].filter(Boolean);

  return (
    <div
      ref={ref}
      className="bg-white text-slate-800 mx-auto"
      style={{ width: 794, minHeight: 1123, padding: "44px 48px", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", boxSizing: "border-box" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-6" style={{ borderBottom: "2px solid #0D47A1" }}>
        <div className="flex items-start gap-3">
          {biz.logo ? (
            <img src={biz.logo} alt="logo" style={{ height: 52, maxWidth: 230, width: "auto", objectFit: "contain" }} crossOrigin="anonymous" />
          ) : (
            <>
              <div style={{ height: 48, width: 48, borderRadius: 10, background: "#0D47A1" }}
                className="flex items-center justify-center text-white text-xl font-bold">
                {(biz.name || "A").charAt(0)}
              </div>
              <div>
                <p className="text-[18px] font-bold text-slate-900 leading-tight">{biz.name || "AzoApp"}</p>
                {biz.legal_name ? <p className="text-[11px] text-slate-500">{biz.legal_name}</p> : null}
                {biz.tagline ? <p className="text-[11px] text-slate-400 italic">{biz.tagline}</p> : null}
              </div>
            </>
          )}
        </div>
        <div className="text-right">
          <p className="text-[22px] font-bold tracking-tight" style={{ color: "#0D47A1" }}>
            {(TYPE_LABEL[inv.invoice_type] || "Invoice").toUpperCase()}
          </p>
          <p className="text-[13px] font-semibold text-slate-700 mt-0.5">{inv.invoice_number}</p>
          <div className="mt-2" style={{ marginTop: 10, textAlign: "right" }}>
            <Badge tone={st}>{inv.status}</Badge>
            <span style={{ display: "inline-block", padding: "0 6px", color: "#cbd5e1", fontSize: 12, verticalAlign: "middle" }}>|</span>
            <Badge tone={pst}>{inv.payment_status}</Badge>
          </div>
        </div>
      </div>

      {/* Business + meta */}
      <div className="grid grid-cols-3 gap-6 mt-6">
        <Party label="From" name={biz.name} lines={[...bizAddr, biz.phone, biz.email, biz.gst ? `GSTIN: ${biz.gst}` : "", biz.pan ? `PAN: ${biz.pan}` : ""]} />
        <Party label="Bill To" name={cust.name} lines={[cust.address, cust.phone, cust.email]} />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Invoice Details</p>
          <table className="text-[12px] w-full">
            <tbody>
              <tr><td className="text-slate-500 py-0.5">Invoice Date</td><td className="text-right font-medium text-slate-800">{fmtDate(inv.issue_date)}</td></tr>
              {inv.booking_code ? <tr><td className="text-slate-500 py-0.5">Booking ID</td><td className="text-right font-medium text-slate-800">{inv.booking_code}</td></tr> : null}
              {inv.booking_date ? <tr><td className="text-slate-500 py-0.5">Booking Date</td><td className="text-right font-medium text-slate-800">{fmtDate(inv.booking_date)}</td></tr> : null}
              {inv.transaction_id ? <tr><td className="text-slate-500 py-0.5">Txn ID</td><td className="text-right font-medium text-slate-800" style={{ wordBreak: "break-all" }}>{inv.transaction_id}</td></tr> : null}
              {inv.withdrawal_id ? <tr><td className="text-slate-500 py-0.5">Withdrawal ID</td><td className="text-right font-medium text-slate-800" style={{ wordBreak: "break-all" }}>{inv.withdrawal_id}</td></tr> : null}
              <tr><td className="text-slate-500 py-0.5">Payment</td><td className="text-right font-medium text-slate-800">{inv.payment_method || "—"}</td></tr>
              <tr><td className="text-slate-500 py-0.5">Currency</td><td className="text-right font-medium text-slate-800">{cur}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Provider row (merchant/partner + service professional) intentionally
          removed — these details are NOT shown on invoices per requirement. */}

      {/* Line items */}
      <table className="w-full mt-6 text-[12.5px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#0D47A1", color: "#fff" }}>
            <th className="text-left font-semibold px-3 py-2.5" style={{ borderTopLeftRadius: 8 }}>Description</th>
            <th className="text-center font-semibold px-3 py-2.5" style={{ width: 60 }}>Qty</th>
            <th className="text-right font-semibold px-3 py-2.5" style={{ width: 130, borderTopRightRadius: 8 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eef2f7" }}>
              <td className="px-3 py-2.5">
                <p className="font-medium text-slate-800">{it.desc}</p>
                {it.detail ? <p className="text-[11px] text-slate-400">{it.detail}</p> : null}
              </td>
              <td className="text-center px-3 py-2.5 text-slate-600">{it.qty || 1}</td>
              <td className="text-right px-3 py-2.5 font-medium text-slate-800">{money(it.amount, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mt-5">
        <div style={{ width: 300 }}>
          {rows.map(([label, val, muted], i) => (
            <div key={i} className="flex justify-between py-1.5 text-[12.5px]" style={{ color: muted ? "#94a3b8" : "#475569" }}>
              <span>{label}</span>
              {muted === "pct" ? null : <span className="font-medium">{money(val, cur)}</span>}
            </div>
          ))}
          <div className="flex justify-between items-center mt-2 px-3 py-3 rounded-lg" style={{ background: "#0D47A1", color: "#fff" }}>
            <span className="text-[13px] font-semibold">
              {_isCancel ? "Total Order Value" : inv.invoice_type === "withdrawal" ? "Net Payable" : "Total"}
            </span>
            <span className="text-[17px] font-bold">{money(_isCancel ? (Number(inv.original_amount != null ? inv.original_amount : inv.total_amount) || 0) : inv.total_amount, cur)}</span>
          </div>
        </div>
      </div>

      {inv.notes ? (
        <div className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Notes</p>
          <p className="text-[12px] text-slate-600">{inv.notes}</p>
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-8 pt-5" style={{ borderTop: "1px solid #eef2f7" }}>
        {biz.terms ? <p className="text-[10.5px] text-slate-500 leading-relaxed"><b className="text-slate-600">Terms &amp; Conditions: </b>{biz.terms}</p> : null}
        {biz.refund_policy ? <p className="text-[10.5px] text-slate-500 leading-relaxed mt-1"><b className="text-slate-600">Refund Policy: </b>{biz.refund_policy}</p> : null}
        <div className="flex items-center justify-between mt-4">
          <p className="text-[11px] text-slate-400">{biz.footer || "Thank you for your business."}</p>
          <p className="text-[11px] text-slate-500 text-right">
            {biz.support ? <>Support: {biz.support}<br /></> : null}
            {biz.website || ""}
          </p>
        </div>
      </div>
    </div>
  );
});

export default InvoiceDocument;
export { money as invMoney, fmtDate as invDate };
