import { TC } from "@/src/theme";
/** Port of web RateCardBar + RateCardModal (customer flow): bar → bottom sheet with groups/rows + live cart qty stepper. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Sparkles, ChevronRight, ChevronDown, Search, ShieldCheck, Info, Plus, Minus } from "lucide-react-native";
import { api } from "../../api/client";
import { useCart } from "../../context/CartContext";
import { useToast } from "../Toast";
import { SLATE, EMERALD } from "../../theme";
import { BottomSheet } from "../customer/ux";

const money = (v: any) => (v !== "" && v != null && !isNaN(Number(v)) ? `\u20b9${Number(v).toLocaleString("en-IN")}` : String(v ?? ""));
const isDiscountActive = (r: any) => Number(r.discount_pct) > 0 && (!r.discount_until || new Date(r.discount_until).getTime() > Date.now());

export function RateCardBar({ serviceId, categoryId, addable = false }: { serviceId?: string; categoryId?: string; addable?: boolean }) {
  const cart = useCart();
  const toast = useToast();
  const [card, setCard] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [openG, setOpenG] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const path = serviceId ? `/ratecards/by-service/${serviceId}` : categoryId ? `/ratecards/by-category/${categoryId}` : null;
    if (!path) return;
    api.get(path, { auth: false }).then((r: any) => { if (r && (r.groups || []).length) setCard(r); }).catch(() => {});
  }, [serviceId, categoryId]);
  const groups = useMemo(() => {
    if (!card) return [];
    const t = q.trim().toLowerCase();
    return (card.groups || []).map((g: any) => ({ ...g, rows: (g.rows || []).filter((r: any) => !t || String(r.description || "").toLowerCase().includes(t)) })).filter((g: any) => g.rows.length);
  }, [card, q]);
  if (!card) return null;
  const accent = card.accent_color || "#0D47A1";
  const minLabour = cart.minLabourCharge || 0;
  const findLine = (row: any) => (cart.items || []).find((x) => x.custom && x.ratecard_row_id === row.id && x.category_id === card.category_id);
  const add = (row: any) => {
    const sc = Number(row.service_charge) || 0; const pct = Number(row.discount_pct) || 0;
    const eff = isDiscountActive(row) && sc ? Math.round(sc * (1 - pct / 100)) : sc;
    cart.addCustom({ description: row.description, service_charge: eff, labour_charge: row.labour_charge, category_id: card.category_id, category_name: card.category_name, row_id: row.id });
    const rl = Number(row.labour_charge) || 0;
    toast.success(`Added "${row.description}" · \u20b9${(eff + (rl > 0 ? rl : minLabour)).toLocaleString("en-IN")}`);
  };
  const dec = (row: any) => { const line = findLine(row); if (!line) return; if (line.qty <= 1) cart.removeItem(line.id); else cart.setQty(line.id, line.qty - 1); };

  return (
    <>
      <Pressable testID="rate-card-bar" onPress={() => setOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 6, borderWidth: 1, borderColor: TC.border, backgroundColor: TC.surface, paddingHorizontal: 16, paddingVertical: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Sparkles size={16} color={accent} /><Text style={{ fontSize: 12, fontWeight: "800", color: accent }}>{card.brand_label || "AzoCover"}</Text></View>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: TC.text2 }} numberOfLines={1}>{card.title || "Standard rate card"}{addable ? " · tap to book items" : ""}</Text>
        <ChevronRight size={20} color={TC.textFaint} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={card.title || "Rate card"} testID="rate-card-sheet" maxHeight="90%">
        <View style={{ flexDirection: "row", alignItems: "center", height: 40, borderRadius: 6, borderWidth: 1, borderColor: TC.border, paddingHorizontal: 12, gap: 8, marginTop: -8 }}>
          <Search size={16} color={TC.textFaint} /><TextInput testID="rate-card-search" value={q} onChangeText={setQ} placeholder="Search items…" placeholderTextColor={TC.textFaint} style={{ flex: 1, fontSize: 14, color: TC.text, outlineStyle: "none" } as any} />
        </View>
        {groups.map((g: any, gi: number) => {
          const isOpen = openG[g.id] ?? (gi === 0 || !!q);
          return (
            <View key={g.id || gi} style={{ borderRadius: 6, borderWidth: 1, borderColor: TC.border, backgroundColor: TC.surface, overflow: "hidden" }}>
              <Pressable testID={`rc-group-${gi}`} onPress={() => setOpenG((o) => ({ ...o, [g.id]: !isOpen }))} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontWeight: "700", color: TC.text }}>{g.title || g.name}</Text><Text style={{ fontSize: 11, color: TC.textFaint }}>{g.rows.length} item{g.rows.length !== 1 ? "s" : ""}</Text></View>
                <ChevronDown size={20} color={TC.textFaint} style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }} />
              </Pressable>
              {isOpen ? g.rows.map((r: any, ri: number) => {
                const sc = Number(r.service_charge) || 0; const pct = Number(r.discount_pct) || 0; const dA = isDiscountActive(r); const eff = dA && sc ? Math.round(sc * (1 - pct / 100)) : sc;
                const qty = findLine(r)?.qty || 0;
                return (
                  <View key={r.id || ri} testID={`rc-row-${r.id}`} style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: TC.borderSoft, gap: 6 }}>
                    <Text style={{ fontSize: 15, color: TC.text }}>{r.description}</Text>
                    {(r.warranty || r.note) ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {r.warranty ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[100], borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><ShieldCheck size={12} color={EMERALD[700]} /><Text style={{ fontSize: 10.5, fontWeight: "600", color: EMERALD[700] }}>{r.warranty} warranty</Text></View> : null}
                      {r.note ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: TC.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><Info size={12} color={TC.textMuted} /><Text style={{ fontSize: 10.5, color: TC.textMuted }}>{r.note}</Text></View> : null}
                    </View> : null}
                    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                      <View>
                        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                          {dA ? <View style={{ backgroundColor: "#F43F5E", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 3 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{Math.round(pct)}% OFF</Text></View> : null}
                          {(dA && sc > 0) || r.original_charge ? <Text style={{ fontSize: 12, color: TC.textFaint, textDecorationLine: "line-through", marginBottom: 2 }}>{money(dA ? sc : r.original_charge)}</Text> : null}
                          <Text style={{ fontSize: 16, fontWeight: "800", color: dA ? "#E11D48" : TC.text }}>{money(dA ? eff : r.service_charge)}</Text>
                        </View>
                        {Number(r.labour_charge) > 0 ? <Text style={{ fontSize: 11, color: TC.textFaint }}>+ {money(r.labour_charge)} labour</Text> : minLabour > 0 ? <Text style={{ fontSize: 11, color: TC.textFaint }}>+ {money(minLabour)} labour</Text> : null}
                      </View>
                      {addable ? (qty > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 6, borderWidth: 1, borderColor: accent, height: 34 }}>
                          <Pressable testID={`rc-dec-${r.id}`} onPress={() => dec(r)} style={{ paddingHorizontal: 10, height: "100%", justifyContent: "center" }}><Minus size={14} color={accent} /></Pressable>
                          <Text testID={`rc-qty-${r.id}`} style={{ width: 24, textAlign: "center", fontWeight: "700", color: TC.text }}>{qty}</Text>
                          <Pressable testID={`rc-inc-${r.id}`} onPress={() => add(r)} style={{ paddingHorizontal: 10, height: "100%", justifyContent: "center" }}><Plus size={14} color={accent} /></Pressable>
                        </View>
                      ) : (
                        <Pressable testID={`rc-add-${r.id}`} onPress={() => add(r)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 6, backgroundColor: accent, flexDirection: "row", alignItems: "center", gap: 4 }}><Plus size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Add</Text></Pressable>
                      )) : null}
                    </View>
                  </View>
                );
              }) : null}
            </View>
          );
        })}
        {groups.length === 0 ? <Text style={{ textAlign: "center", color: TC.textFaint, paddingVertical: 24 }}>No items match your search.</Text> : null}
      </BottomSheet>
    </>
  );
}
