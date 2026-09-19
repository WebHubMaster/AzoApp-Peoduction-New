const esc = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const rows = (title, header, data) => [[title], header, ...data, []].map((r) => r.map(esc).join(",")).join("\n");

export function buildDashboardCsv(d, meta) {
  const parts = [
    rows("AzoApp Analytics Export", ["Generated at", "Range", "From", "To", "Filters"], [[d.generated_at, d.range, d.window?.from, d.window?.to, meta.filters]]),
    rows("KPIs", ["Metric", "Value", "Change % vs previous"], [
      ["Revenue (GMV)", d.gmv, d.compare?.gmv], ["Platform fee", d.platform_revenue, d.compare?.platform_revenue],
      ["Partner earnings", d.partner_earnings, d.compare?.partner_earnings], ["Merchant commission", d.merchant_commission, ""],
      ["Tax collected", d.earnings?.tax, ""], ["Refunds", d.earnings?.refunds, ""], ["Net platform revenue", d.earnings?.net_revenue, ""],
      ["Total bookings", d.total_bookings, d.compare?.total_bookings], ["Completed bookings", d.completed_bookings, d.compare?.completed_bookings],
      ["Pending bookings", d.pending_bookings, d.compare?.pending_bookings], ["Cancelled bookings", d.cancelled_bookings, d.compare?.cancelled_bookings],
      ["Avg order value", d.avg_order_value, d.compare?.avg_order_value], ["Active customers", d.active_customers, d.compare?.active_customers],
      ["Active partners", d.active_partners, d.compare?.active_partners], ["Active merchants", d.active_merchants, d.compare?.active_merchants],
      ["Total customers", d.customers, ""], ["Total partners", d.partners, ""], ["Total merchants", d.merchants, ""],
    ]),
    rows("Time series", ["Period", "GMV", "Platform fee", "Partner earnings", "Merchant commission", "Refunds", "Bookings", "Completed", "Cancelled"],
      (d.combined_series || []).map((r) => [r.date, r.gmv, r.platform_revenue, r.partner_earnings, r.merchant_commission, r.refunds, r.bookings, r.completed, r.cancelled])),
    rows("Booking status", ["Status", "Count"], (d.status_breakdown || []).map((s) => [s.status, s.count])),
    rows("Service performance", ["Service", "Category", "Bookings", "Completed", "Cancelled", "Revenue", "Platform fee", "Cancellation %", "Avg rating"],
      (d.top_services || []).map((s) => [s.name, s.category, s.bookings, s.completed, s.cancelled, s.revenue, s.platform_revenue, s.cancellation_rate, s.avg_rating ?? ""])),
    rows("Top partners", ["Partner", "City", "Bookings", "Completed", "Completion %", "Rating", "Earnings"],
      (d.top_partners || []).map((p) => [p.name, p.city, p.bookings, p.jobs, p.completion_rate, p.rating, p.revenue])),
    rows("City performance", ["City", "Bookings", "Completed", "GMV", "Platform fee", "Customers", "Partners", "Merchants"],
      (d.city_performance || []).map((c) => [c.city, c.bookings, c.completed, c.gmv, c.revenue, c.customers, c.partners, c.merchants])),
    rows("Recent bookings", ["Code", "Service", "Customer", "Partner", "Merchant", "Type", "Status", "Payment", "Amount", "Created"],
      (d.recent_bookings || []).map((b) => [b.code, b.service_name, b.customer_name, b.partner_name, b.merchant_name, b.booking_type, b.status, b.payment_status, b.pricing?.total, b.created_at])),
  ];
  return parts.join("\n");
}

export function downloadCsv(text, name) {
  const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
