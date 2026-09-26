/** Port of web_panel/src/components/booking/ServiceBreakdown.jsx — renders the server `breakdown` (single source of truth). */
import React from "react";
import { View, Text } from "react-native";
import { PRIMARY, SLATE, useTheme } from "../../theme";
import { fmt } from "../../lib/format";

export function deriveServiceItems(booking: any) {
  if (!booking) return [];
  const items = Array.isArray(booking.items) ? booking.items.filter(Boolean) : [];
  const p = booking.pricing || {};
  if (items.length) {
    return items.map((it: any) => {
      const qty = Math.max(1, Number(it.qty || 1));
      const addons = (Array.isArray(it.addons) ? it.addons : []).map((a: any) => (a && typeof a === "object" ? a : { name: String(a), price: 0, qty: 1 })).filter((a: any) => a.name)
        .map((a: any) => { const aq = Math.max(1, Number(a.qty || 1)); const rate = Number(a.price || a.rate || 0); return { name: a.name, qty: aq, rate, amount: rate * aq }; });
      const addonSum = addons.reduce((s: number, a: any) => s + a.amount, 0);
      let rate = it.base_price != null ? Number(it.base_price) : null;
      if (rate == null) { const unit = it.unit_service_value != null ? Number(it.unit_service_value) : (qty ? Number(it.price || it.total || 0) / qty : 0); rate = Math.max(unit - addonSum, 0); }
      return { name: it.service_name || it.name || it.custom_name || "Service", qty, rate, amount: rate * qty, addons, tier_label: it.tier_label };
    });
  }
  const base = Number(p.base || 0); const addonsTotal = Number(p.addons_total || 0);
  const raw = Array.isArray(booking.addons) ? booking.addons : [];
  const addons = raw.map((a: any, i: number) => {
    const each = raw.length ? addonsTotal / raw.length : 0;
    if (a && typeof a === "object") { const aq = Math.max(1, Number(a.qty || 1)); const rate = Number(a.price || 0); return { name: a.name, qty: aq, rate, amount: rate * aq }; }
    const amt = i === raw.length - 1 ? addonsTotal - each * (raw.length - 1) : each;
    return { name: String(a), qty: 1, rate: amt, amount: amt };
  });
  if (!booking.service_name && !base && !addonsTotal) return [];
  return [{ name: booking.service_name || booking.category_name || "Service", qty: 1, rate: base, amount: base, addons }];
}

function deriveCharges(booking: any) {
  const bd = booking?.breakdown || {};
  if (Array.isArray(bd.additional_charges)) return bd.additional_charges.map((c: any) => ({ label: c.label, amount: Number(c.amount || 0) })).filter((c: any) => c.amount > 0);
  const p = booking?.pricing || {};
  return [["emergency_fee", "Emergency Fee"], ["surge", "Surge Charge"], ["visiting_charge", "Visiting Charge"], ["convenience_fee", "Convenience Fee"], ["platform_fee", "Platform Fee"]]
    .map(([k, label]) => ({ label, amount: Number(p[k] || 0) })).filter((c) => c.amount > 0);
}

export function ServiceBreakdown({ booking, title = "Service breakdown", showCharges = false, showCount = true }: { booking: any; title?: string; showCharges?: boolean; showCount?: boolean }) {
  const { c, isDark } = useTheme();
  const bd = booking?.breakdown || null;
  const list: any[] = bd && Array.isArray(bd.service_items) && bd.service_items.length ? bd.service_items : deriveServiceItems(booking);
  if (!list.length) return null;
  const servicesSubtotal = bd && bd.services_subtotal != null ? Number(bd.services_subtotal) : list.reduce((s, it) => s + Number(it.amount ?? it.price ?? it.total ?? 0), 0);
  const charges = showCharges ? deriveCharges(booking) : [];
  const chargesTotal = charges.reduce((s: number, x: any) => s + x.amount, 0);
  const soft = isDark ? "rgba(30,41,59,0.6)" : SLATE[50];
  const line = isDark ? SLATE[800] : SLATE[100];
  return (
    <View testID="service-breakdown" style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: soft, borderBottomWidth: 1, borderBottomColor: line }}>
        <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: c.textMuted }}>{showCount ? `${title} (${list.length})` : title}</Text>
        <Text style={{ fontSize: 10, fontWeight: "600", color: SLATE[400] }}>Excl. taxes</Text>
      </View>
      {list.map((it, i) => {
        const name = it.name || it.service_name || it.custom_name || "Service";
        const qty = Math.max(1, Number(it.qty || 1));
        const rate = it.rate != null ? Number(it.rate) : Number(it.base_price || 0);
        const amount = it.amount != null ? Number(it.amount) : rate * qty;
        const addons = Array.isArray(it.addons) ? it.addons.filter((a: any) => a && (a.name || typeof a === "string")) : [];
        return (
          <View key={i} testID={`svc-line-${i}`} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: i < list.length - 1 ? 1 : 0, borderBottomColor: line }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: c.text }}><Text style={{ color: SLATE[400] }}>{i + 1}. </Text>{name}{qty > 1 ? <Text style={{ color: c.primaryText, fontWeight: "700" }}> × {qty}</Text> : null}</Text>
                {qty > 1 || it.tier_label ? <Text style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{qty > 1 ? `${fmt(rate)} × ${qty}` : ""}{it.tier_label ? `${qty > 1 ? " · " : ""}${it.tier_label}` : ""}</Text> : null}
              </View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }}>{fmt(amount)}</Text>
            </View>
            {addons.length > 0 ? (
              <View style={{ marginTop: 6, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100], gap: 4 }}>
                {addons.map((a: any, ai: number) => {
                  const an = a && typeof a === "object" ? a.name : String(a);
                  const aq = Math.max(1, Number((a && a.qty) || 1));
                  const ar = Number((a && (a.rate != null ? a.rate : a.price)) || 0);
                  const aAmt = a && a.amount != null ? Number(a.amount) : ar * aq;
                  return (
                    <View key={ai} testID={`svc-line-${i}-addon-${ai}`}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <Text numberOfLines={1} style={{ fontSize: 12, color: c.textMuted, flex: 1 }}>+ {an}{aq > 1 ? <Text style={{ color: c.primaryText, fontWeight: "600" }}> × {aq}</Text> : null}</Text>
                        {aAmt ? <Text style={{ fontSize: 12, fontWeight: "500", color: isDark ? SLATE[300] : SLATE[600] }}>{fmt(aAmt)}</Text> : null}
                      </View>
                      {aq > 1 && ar > 0 ? <Text style={{ fontSize: 10.5, color: SLATE[400], paddingLeft: 14 }}>{fmt(ar)} × {aq}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: soft, borderTopWidth: 1, borderTopColor: line }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: isDark ? SLATE[200] : SLATE[700] }}>Services total (excl. taxes)</Text>
        <Text testID="services-subtotal" style={{ fontSize: 13, fontWeight: "800", color: c.text }}>{fmt(servicesSubtotal)}</Text>
      </View>
      {showCharges && charges.length > 0 ? (
        <View testID="service-charges" style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: line, gap: 4 }}>
          {charges.map((x: any, ci: number) => <View key={ci} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 12, color: c.textMuted }}>{x.label}</Text><Text style={{ fontSize: 12, fontWeight: "500", color: isDark ? SLATE[200] : SLATE[700] }}>{fmt(x.amount)}</Text></View>)}
        </View>
      ) : null}
      {showCharges ? (
        <View testID="total-service-amount" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: isDark ? "rgba(7,52,115,0.25)" : PRIMARY[50], borderTopWidth: 1, borderTopColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100] }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: c.primaryText }}>Total Service Amount (excl. taxes)</Text>
          <Text style={{ fontSize: 14, fontWeight: "800", color: isDark ? PRIMARY[200] : PRIMARY[800] }}>{fmt(servicesSubtotal + chargesTotal)}</Text>
        </View>
      ) : null}
    </View>
  );
}
