import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, Platform } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/src/theme";
import { api } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

const EMERALD = "#059669";
const SLATE400 = "#94A3B8";
const num = (v: any) => Number(v || 0);

/* ── AdditionalWork: rate-card extras during an active job (mobile mirror of web ActiveJob) ── */
export function AdditionalWork({ b, onUpdate }: { b: any; onUpdate: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [rcOpen, setRcOpen] = useState(false);
  const addl = b.additional || null;
  const rcQ = useQuery({ queryKey: ["ratecard", b.category_id], queryFn: () => api.get<any>(`/ratecards/by-category/${b.category_id}`), enabled: !!b.category_id });
  const rcCard = rcQ.data && (rcQ.data.groups || []).length ? rcQ.data : null;

  // Group identical items (same rate-card row) so repeated adds show as a quantity, not duplicate lines.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; ids: string[]; description: string; part: number; labour: number; warranty: string; qty: number }>();
    for (const it of (addl?.items || [])) {
      const key = it.ratecard_row_id || `${it.description}|${it.part_charge}|${it.labour_charge}`;
      const g = map.get(key) || { key, ids: [], description: it.description, part: num(it.part_charge), labour: num(it.labour_charge), warranty: it.warranty || "", qty: 0 };
      g.ids.push(it.id);
      g.qty += 1;
      map.set(key, g);
    }
    return Array.from(map.values());
  }, [addl]);

  const addAdditionalRow = async (row: any, quiet = false) => {
    // Billing rule: the rate card's service/product charge is the ITEM cost — it goes
    // 100% to the partner, tax-free & commission-free (→ part_charge). Only the labour
    // charge is commissionable, and GST is levied solely on that commission portion.
    const part = num(row.service_charge);
    const labour = num(row.labour_charge);
    if (part <= 0 && labour <= 0) { toast.error("This item has no charge to add"); return; }
    try {
      await api.post(`/bookings/${b.id}/additional`, { items: [{ description: row.description, part_charge: part, labour_charge: labour, warranty: row.warranty || "", ratecard_row_id: row.id, category_id: b.category_id }] });
      if (!quiet) toast.success(`Added "${row.description}" — ask customer to pay`);
      onUpdate();
    } catch (e: any) { toast.error(e?.detail || "Failed to add"); }
  };

  // Remove ONE instance of a rate-card row (the quantity "minus" control).
  const removeAdditionalRow = async (rowId: string) => {
    const list = (addl?.items || []).filter((i: any) => i.ratecard_row_id === rowId);
    if (!list.length) return;
    try { await api.del(`/bookings/${b.id}/additional/${list[list.length - 1].id}`); onUpdate(); }
    catch (e: any) { toast.error(e?.detail || "Failed"); }
  };

  // Remove an entire grouped line (the trash button on the summary list).
  const removeGroup = async (ids: string[]) => {
    try {
      for (const id of ids) { await api.del(`/bookings/${b.id}/additional/${id}`); }
      toast.success("Removed");
      onUpdate();
    } catch (e: any) { toast.error(e?.detail || "Failed"); }
  };

  return (
    <View testID={`additional-section-${b.code}`} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 14, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="wrench-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Additional work</Text></View>
        {addl && num(addl.total) > 0 ? (
          <View style={{ backgroundColor: addl.status === "paid" ? "#D1FAE5" : "#FEF3C7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color: addl.status === "paid" ? "#047857" : "#B45309", fontSize: 11, fontWeight: "700" }}>{addl.status === "paid" ? "Paid" : "Payment pending"}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 }}>If any extra parts or labour were used, add them from the category rate card. <Text style={{ color: "#B45309", fontWeight: "700" }}>Please collect the additional payment from the customer before completing the job. Once it's received, complete the job — an itemised invoice is shared with both you and the customer for full transparency.</Text></Text>
      {groups.length > 0 ? (
        <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: 6, padding: 12, gap: 6, marginBottom: 12 }}>
          {groups.map((g) => (
            <View key={g.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                {g.description}
                {g.qty > 1 ? <Text style={{ color: colors.primary, fontWeight: "800" }}>{"  "}×{g.qty}</Text> : null}
                <Text style={{ color: SLATE400 }}> · {fmt(num(g.part) + num(g.labour))}</Text>
              </Text>
              {addl.status !== "paid" ? <Pressable testID={`addl-remove-${g.key}`} onPress={() => removeGroup(g.ids)} hitSlop={8}><Icon name="trash-can-outline" size={16} color="#EF4444" /></Pressable> : null}
            </View>
          ))}
          {num(addl.parts_total) > 0 ? <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>Product / parts (no tax, no commission)</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmt(addl.parts_total)}</Text></View> : null}
          {num(addl.labour_total) > 0 ? <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: num(addl.parts_total) > 0 ? 0 : 1, borderTopColor: colors.border, paddingTop: num(addl.parts_total) > 0 ? 0 : 6 }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>Service &amp; labour (commission applies)</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmt(addl.labour_total)}</Text></View> : null}
          {num(addl.gst) > 0 ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>Est. Govt. Taxes</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmt(addl.gst)}</Text></View> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>Additional total</Text><Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{fmt(addl.total)}</Text></View>
          {addl.status === "paid" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 2 }}><Icon name="check-circle-outline" size={14} color="#047857" /><Text style={{ color: "#047857", fontSize: 12, fontWeight: "600" }}>Customer paid — you can complete the job now</Text></View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 2 }}><Icon name="alert-outline" size={14} color="#B45309" /><Text style={{ color: "#B45309", fontSize: 12, fontWeight: "600" }}>Waiting for customer to pay the additional amount</Text></View>
          )}
        </View>
      ) : null}
      {addl?.status !== "paid" ? (
        rcCard ? (
          <Pressable testID={`add-additional-${b.code}`} onPress={() => setRcOpen(true)} style={{ alignSelf: "flex-start", height: 36, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: "#93C5FD", flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Add from rate card</Text>
          </Pressable>
        ) : (
          <Text style={{ color: SLATE400, fontSize: 12 }}>No rate card configured for this category — additional work unavailable.</Text>
        )
      ) : null}
      {rcCard ? <RateCardSheet open={rcOpen} onClose={() => setRcOpen(false)} card={rcCard} items={addl?.items || []} onAdd={(r) => addAdditionalRow(r, true)} onRemoveRow={removeAdditionalRow} /> : null}
    </View>
  );
}

/* ── RateCardSheet — RN mirror of web RateCardModal (add extra work from category rate card) ── */
function RateCardSheet({ open, onClose, card, items, onAdd, onRemoveRow }: { open: boolean; onClose: () => void; card: any; items: any[]; onAdd: (row: any) => Promise<void> | void; onRemoveRow: (rowId: string) => Promise<void> | void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const accent = card?.accent_color || "#0D47A1";
  const groups: any[] = card?.groups || [];

  // Live quantity per rate-card row, derived from the booking's additional items.
  const countByRow = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of (items || [])) { const k = it.ratecard_row_id; if (k) m[k] = (m[k] || 0) + 1; }
    return m;
  }, [items]);
  const totalCount = (items || []).length;

  const filtered = !q.trim() ? groups : groups.map((g) => ({
    ...g,
    rows: (g.rows || []).filter((r: any) =>
      (r.description || "").toLowerCase().includes(q.trim().toLowerCase()) ||
      (r.warranty || "").toLowerCase().includes(q.trim().toLowerCase()) ||
      String(r.service_charge || "").includes(q.trim())),
  })).filter((g) => g.rows.length > 0);

  const mut = async (id: string, fn: () => Promise<void> | void) => {
    if (busy.has(id)) return;
    setBusy((p) => new Set(p).add(id));
    try { await fn(); } finally { setBusy((p) => { const n = new Set(p); n.delete(id); return n; }); }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 6, borderTopRightRadius: 6, maxHeight: "88%", paddingBottom: insets.bottom + 12 }}>
          <View style={{ height: 6, backgroundColor: accent }} />
          <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${accent}1A`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Icon name="star-four-points-outline" size={13} color={accent} /><Text style={{ color: accent, fontSize: 12, fontWeight: "800" }}>{card?.brand_label || "AzoCover"}</Text>
                </View>
                <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "500" }}>{card?.category_name}</Text></View>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={18} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 10 }}>{card?.title || "Standard rate card"}</Text>
            {card?.subtitle ? <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{card.subtitle}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 12, height: 44, marginTop: 12 }}>
              <Icon name="magnify" size={18} color={SLATE400} />
              <TextInput testID="ratecard-search" value={q} onChangeText={setQ} placeholder="Search a repair, part or price…" placeholderTextColor={SLATE400} style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 14 }} />
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 48 }}><Icon name="magnify" size={32} color={SLATE400} /><Text style={{ color: SLATE400, fontSize: 14, marginTop: 10 }}>No items match “{q}”.</Text></View>
            ) : filtered.map((g) => (
              <View key={g.id} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 3, borderLeftColor: accent }}>
                  <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: `${accent}1A`, alignItems: "center", justifyContent: "center" }}><Icon name="wrench" size={16} color={accent} /></View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }}>{g.name || "Services"}</Text>
                  <View style={{ backgroundColor: `${accent}1A`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: accent, fontSize: 11, fontWeight: "700" }}>{(g.rows || []).length}</Text></View>
                </View>
                {(g.rows || []).map((r: any) => {
                  const sc = num(r.service_charge);
                  const qty = countByRow[r.id] || 0;
                  const isBusy = busy.has(r.id);
                  return (
                    <View key={r.id} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14 }}>{r.description}</Text>
                        {r.warranty ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 6, backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Icon name="shield-check-outline" size={11} color="#047857" /><Text style={{ color: "#047857", fontSize: 10.5, fontWeight: "600" }}>{r.warranty} warranty</Text>
                          </View>
                        ) : null}
                        {qty > 0 ? (
                          <View testID={`ratecard-qty-${r.id}`} style={{ alignSelf: "flex-start", marginTop: 8, flexDirection: "row", alignItems: "center", borderRadius: 6, borderWidth: 1.5, borderColor: accent, overflow: "hidden", opacity: isBusy ? 0.6 : 1 }}>
                            <Pressable testID={`ratecard-qty-minus-${r.id}`} disabled={isBusy} onPress={() => mut(r.id, () => onRemoveRow(r.id))} hitSlop={6} style={{ width: 34, height: 32, alignItems: "center", justifyContent: "center" }}>
                              <Icon name="minus" size={16} color={accent} />
                            </Pressable>
                            <View style={{ minWidth: 34, height: 32, alignItems: "center", justifyContent: "center", borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: accent }}>
                              <Text testID={`ratecard-qty-value-${r.id}`} style={{ color: accent, fontSize: 15, fontWeight: "800" }}>{qty}</Text>
                            </View>
                            <Pressable testID={`ratecard-qty-plus-${r.id}`} disabled={isBusy} onPress={() => mut(r.id, () => onAdd(r))} hitSlop={6} style={{ width: 34, height: 32, alignItems: "center", justifyContent: "center" }}>
                              <Icon name="plus" size={16} color={accent} />
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable testID={`ratecard-add-${r.id}`} disabled={isBusy} onPress={() => mut(r.id, () => onAdd(r))} style={{ alignSelf: "flex-start", marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: accent, opacity: isBusy ? 0.6 : 1 }}>
                            <Icon name="plus" size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Add</Text>
                          </Pressable>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>{fmt(sc)}</Text>
                        {num(r.labour_charge) > 0 ? <Text style={{ color: SLATE400, fontSize: 11, marginTop: 2 }}>+ {fmt(r.labour_charge)} labour</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }} testID="ratecard-footer">
            <Text style={{ color: totalCount > 0 ? "#047857" : colors.textMuted, fontSize: 13, fontWeight: "600", flex: 1 }}>{totalCount > 0 ? `${totalCount} item${totalCount > 1 ? "s" : ""} added — customer will be asked to pay` : "Tap Add on any item, then adjust the quantity"}</Text>
            <Pressable testID="ratecard-done" onPress={onClose} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 6, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: accent }}><Icon name="check" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Done</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
