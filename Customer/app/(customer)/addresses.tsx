/** My Addresses — 1:1 port of AddressBook (CustomerDashboard.jsx): list, add/edit sheet (AddressForm), delete, set default. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Plus, MapPin, Pencil, Trash2, Star } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { useToast } from "../../src/components/Toast";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, useTheme, shadowBtn, shadowElev } from "../../src/theme";
import { EmptyState, BottomSheet, PrimaryButton } from "../../src/components/customer/ux";
import { Checkbox } from "../../src/components/customer/FormControls";
import { AddressForm, emptyAddress } from "../../src/components/customer/AddressForm";

export default function AddressesScreen() {
  const router = useRouter();
  const { c, isDark } = useTheme();
  const { refresh } = useAuth();
  const { cfg: allCfg } = useCustomerData();
  const cfg = allCfg?.address_config || {};
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyAddress());
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/auth/addresses").then((r) => setList(r || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const onSaved = () => { refresh(); };
  const openAdd = () => { setEditing(null); setForm(emptyAddress()); setOpen(true); };
  const openEdit = (a: any) => { setEditing(a.id); setForm({ ...emptyAddress(), ...a }); setOpen(true); };
  const save = async () => {
    if (!form.line || !form.pincode) return toast.error("Please enter address & pincode");
    if (cfg.mandatory_landmark && cfg.landmark_instructions && !form.landmark) return toast.error("Landmark is required");
    setBusy(true);
    try { if (editing) await api.put(`/auth/address/${editing}`, form); else await api.post("/auth/address", form); toast.success("Address saved"); setOpen(false); await load(); onSaved(); }
    catch (e: any) { toast.error(e?.message || "Save failed"); }
    setBusy(false);
  };
  const del = async (id: string) => { try { await api.del(`/auth/address/${id}`); toast.success("Address removed"); await load(); onSaved(); } catch (e: any) { toast.error(e?.message || "Failed"); } };
  const setDefault = async (id: string) => { try { await api.post(`/auth/address/${id}/default`); await load(); onSaved(); } catch (e: any) { toast.error(e?.message || "Failed"); } };

  return (
    <View testID="address-book" style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="page-title" numberOfLines={1} style={{ fontSize: 24, fontWeight: "900", color: c.text, letterSpacing: -0.4 }}>My Addresses</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Saved locations for faster checkout</Text>
        </View>
        <Pressable testID="book-new" onPress={() => router.push("/(site)/services" as any)} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4, ...shadowBtn })}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Booking</Text></Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text testID="address-count" style={{ fontSize: 14, color: c.textMuted }}>{list.length} saved location{list.length !== 1 ? "s" : ""}</Text>
        <Pressable testID="add-address-btn" onPress={openAdd} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4, ...shadowBtn })}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Add Address</Text></Pressable>
      </View>

      {list.length === 0 ? <EmptyState icon={MapPin} title="No saved addresses" desc="Save your home or office address for faster booking." actionLabel="Add Address" onAction={openAdd} testID="address-empty" /> : null}

      <View style={{ gap: 12 }}>
        {list.map((a) => (
          <View key={a.id} testID={`address-card-${a.id}`} style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 16, ...shadowElev }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontWeight: "600", fontSize: 15, color: c.text }}>{a.label}</Text>
                {a.is_default ? <View testID={`default-badge-${a.id}`} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: c.primarySoft }}><Text style={{ fontSize: 10, fontWeight: "600", color: c.primaryText }}>Default</Text></View> : null}
              </View>
              <View style={{ flexDirection: "row", gap: 4 }}>
                <Pressable testID={`edit-address-${a.id}`} onPress={() => openEdit(a)} hitSlop={8} style={{ padding: 4 }}><Pencil size={16} color={SLATE[400]} /></Pressable>
                <Pressable testID={`delete-address-${a.id}`} onPress={() => del(a.id)} hitSlop={8} style={{ padding: 4 }}><Trash2 size={16} color={SLATE[400]} /></Pressable>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: isDark ? SLATE[300] : SLATE[600], marginTop: 4 }}>{a.line}</Text>
            <Text style={{ fontSize: 12, color: SLATE[400], marginTop: 2 }}>{[a.city, a.pincode].filter(Boolean).join(" · ")}{a.property_type ? ` · ${a.property_type}` : ""}</Text>
            {a.landmark ? <Text style={{ fontSize: 12, color: SLATE[400] }}>Landmark: {a.landmark}</Text> : null}
            {!a.is_default ? <Pressable testID={`set-default-${a.id}`} onPress={() => setDefault(a.id)} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4 }}><Star size={12} color={c.primaryText} /><Text style={{ fontSize: 12, color: c.primaryText }}>Set as default</Text></Pressable> : null}
          </View>
        ))}
      </View>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={editing ? "Edit Address" : "Add Address"} testID="address-dialog"
        footer={<PrimaryButton testID="save-address-btn" label={busy ? "Saving…" : "Save Address"} onPress={save} busy={busy} style={{ borderRadius: 12 }} />}>
        <Text style={{ fontSize: 14, color: c.textMuted, marginTop: -8 }}>Fill in your service location details.</Text>
        <AddressForm value={form} onChange={setForm} cfg={cfg} />
        <Checkbox testID="addr-set-default" checked={!!form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} label="Set as default address" />
      </BottomSheet>
    </View>
  );
}
