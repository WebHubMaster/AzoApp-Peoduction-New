import React from "react";

const inr = (n) => {
  const v = Number(n || 0);
  return "\u20b9" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

/**
 * Legacy fallback ONLY (pre-`breakdown` bookings). Modern bookings always carry the
 * authoritative server `breakdown.service_items` which we render directly — no local
 * recomputation, so a Qty>1 line and an independent add-on qty are always correct.
 */
export function deriveServiceItems(booking) {
  if (!booking) return [];
  const items = Array.isArray(booking.items) ? booking.items.filter(Boolean) : [];
  const p = booking.pricing || {};
  if (items.length) {
    return items.map((it) => {
      const qty = Math.max(1, Number(it.qty || 1));
      const rawAddons = Array.isArray(it.addons) ? it.addons : [];
      const addons = rawAddons
        .map((a) => (a && typeof a === "object" ? a : { name: String(a), price: 0, qty: 1 }))
        .filter((a) => a.name)
        .map((a) => {
          const aq = Math.max(1, Number(a.qty || 1));
          const rate = Number(a.price || a.rate || 0);
          return { name: a.name, qty: aq, rate, amount: rate * aq };
        });
      const addonSum = addons.reduce((s, a) => s + a.amount, 0);
      let rate = it.base_price != null ? Number(it.base_price) : null;
      if (rate == null) {
        const unit = it.unit_service_value != null ? Number(it.unit_service_value)
          : (qty ? Number(it.price || it.total || 0) / qty : 0);
        rate = Math.max(unit - addonSum, 0);
      }
      return {
        name: it.service_name || it.name || it.custom_name || "Service",
        category: it.category_name || booking.category_name || "",
        qty, rate, amount: rate * qty, addons,
      };
    });
  }
  const base = Number(p.base || 0);
  const addonsTotal = Number(p.addons_total || 0);
  const rawAddons = Array.isArray(booking.addons) ? booking.addons : [];
  const addons = rawAddons.map((a, i) => {
    const each = rawAddons.length ? addonsTotal / rawAddons.length : 0;
    if (a && typeof a === "object") {
      const aq = Math.max(1, Number(a.qty || 1));
      const rate = Number(a.price || 0);
      return { name: a.name, qty: aq, rate, amount: rate * aq };
    }
    const amt = i === rawAddons.length - 1 ? addonsTotal - each * (rawAddons.length - 1) : each;
    return { name: String(a), qty: 1, rate: amt, amount: amt };
  });
  if (!booking.service_name && !base && !addonsTotal) return [];
  return [{
    name: booking.service_name || booking.category_name || "Service",
    category: booking.category_name || "", qty: 1, rate: base, amount: base, addons,
  }];
}

/** Additional charge rows (Visiting / Emergency / Surge …) as their OWN lines — never
 * merged into the service amount. Prefer the authoritative server breakdown. */
function deriveCharges(booking, hidePlatformFees) {
  const bd = (booking && booking.breakdown) || {};
  if (Array.isArray(bd.additional_charges)) {
    return bd.additional_charges
      .map((c) => ({ label: c.label, amount: Number(c.amount || 0), note: c.note }))
      .filter((c) => c.amount > 0);
  }
  const p = (booking && booking.pricing) || {};
  const map = [["emergency_fee", "Emergency Fee"], ["surge", "Surge Charge"],
    ["visiting_charge", "Visiting Charge"], ["convenience_fee", "Convenience Fee"],
    ["platform_fee", "Platform Fee"]];
  return map
    .filter(([k]) => !hidePlatformFees || !["convenience_fee", "platform_fee"].includes(k))
    .map(([k, label]) => ({ label, amount: Number(p[k] || 0) }))
    .filter((c) => c.amount > 0);
}

/**
 * Complete, tax-EXCLUDED breakdown of every service + add-on in a booking. Renders the
 * authoritative server `breakdown` (single source of truth) so Customer, Partner and
 * Admin panels always show the SAME numbers — no local math, no double-counting.
 */
export default function ServiceBreakdown({ booking, items, fmt, className = "", title = "Service breakdown", compact = false, showCharges = false, hidePlatformFees = false, showCount = true }) {
  const money = fmt || inr;
  const bd = (booking && booking.breakdown) || null;
  const list = (items && items.length)
    ? items
    : (bd && Array.isArray(bd.service_items) && bd.service_items.length
      ? bd.service_items
      : deriveServiceItems(booking));
  if (!list.length) return null;

  const servicesSubtotal = bd && bd.services_subtotal != null
    ? Number(bd.services_subtotal)
    : list.reduce((s, it) => s + Number(it.amount ?? it.price ?? it.total ?? 0), 0);
  const charges = showCharges ? deriveCharges(booking, hidePlatformFees) : [];
  const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
  const totalServiceAmount = servicesSubtotal + chargesTotal;
  const heading = showCount ? `${title} (${list.length})` : title;

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden ${className}`} data-testid="service-breakdown">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{heading}</span>
        <span className="text-[10px] font-semibold text-slate-400">Excl. taxes</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((it, i) => {
          const name = it.name || it.service_name || it.custom_name || "Service";
          const qty = Math.max(1, Number(it.qty || 1));
          // `amount` is the SERVICE-only line total (rate × qty). Add-ons are listed and
          // priced separately below with their OWN independent quantity.
          const rate = it.rate != null ? Number(it.rate) : Number(it.base_price || 0);
          const amount = it.amount != null ? Number(it.amount) : rate * qty;
          const addons = Array.isArray(it.addons) ? it.addons.filter((a) => a && (a.name || typeof a === "string")) : [];
          return (
            <div key={i} className={compact ? "px-3 py-2" : "px-3 py-2.5"} data-testid={`svc-line-${i}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                    <span className="text-slate-400 mr-1">{i + 1}.</span>{name}
                    {qty > 1 && <span className="text-primary-700 dark:text-primary-300 font-bold"> {"\u00d7"} {qty}</span>}
                  </p>
                  {(qty > 1 || it.tier_label) && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {qty > 1 ? `${money(rate)} \u00d7 ${qty}` : ""}
                      {it.tier_label ? `${qty > 1 ? " \u00b7 " : ""}${it.tier_label}` : ""}
                    </p>
                  )}
                </div>
                <span className="text-[13px] font-bold text-slate-900 dark:text-white shrink-0 tabular-nums">{money(amount)}</span>
              </div>
              {addons.length > 0 && (
                <div className="mt-1.5 pl-3 border-l-2 border-primary-100 dark:border-primary-900/40 space-y-1">
                  {addons.map((a, ai) => {
                    const an = a && typeof a === "object" ? a.name : String(a);
                    const aq = Math.max(1, Number((a && a.qty) || 1));
                    const ar = Number((a && (a.rate != null ? a.rate : a.price)) || 0);
                    const aAmt = a && a.amount != null ? Number(a.amount) : ar * aq;
                    return (
                      <div key={ai} data-testid={`svc-line-${i}-addon-${ai}`}>
                        <div className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="text-slate-500 dark:text-slate-400 truncate">
                            + {an}{aq > 1 ? <span className="text-primary-600 dark:text-primary-300 font-semibold"> {"\u00d7"} {aq}</span> : null}
                          </span>
                          {aAmt ? <span className="font-medium text-slate-600 dark:text-slate-300 shrink-0 tabular-nums">{money(aAmt)}</span> : null}
                        </div>
                        {aq > 1 && ar > 0 && (
                          <p className="text-[10.5px] text-slate-400 pl-3.5">{money(ar)} {"\u00d7"} {aq}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800">
        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">Services total (excl. taxes)</span>
        <span className="text-[13px] font-extrabold text-slate-900 dark:text-white tabular-nums" data-testid="services-subtotal">{money(servicesSubtotal)}</span>
      </div>
      {showCharges && charges.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 space-y-1" data-testid="service-charges">
          {charges.map((c, ci) => (
            <div key={ci} className="flex items-center justify-between text-[12px]">
              <span className="text-slate-500 dark:text-slate-400">{c.label}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">{money(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {showCharges && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-primary-50 dark:bg-primary-900/20 border-t border-primary-100 dark:border-primary-900/40" data-testid="total-service-amount">
          <span className="text-[12px] font-bold text-primary-700 dark:text-primary-300">Total Service Amount (excl. taxes)</span>
          <span className="text-[14px] font-extrabold text-primary-800 dark:text-primary-200 tabular-nums">{money(totalServiceAmount)}</span>
        </div>
      )}
    </div>
  );
}
