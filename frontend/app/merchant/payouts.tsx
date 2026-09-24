import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Linking, Platform } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, Button, Badge, EmptyState, CardSkeleton, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

const BASE = "/merchant/panel/finance-kyc";

async function pickImage(): Promise<string | null> {
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && !perm.canAskAgain) { Linking.openSettings(); return null; }
    if (!perm.granted) return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ["images"] });
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  const asset = res.assets[0];
  return `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
}

export default function MerchantPayouts() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const elig = useQuery({ queryKey: ["merchant-fkyc"], queryFn: () => api.get<any>(BASE) });
  const banks = useQuery({ queryKey: ["merchant-banks"], queryFn: () => api.get<any[]>(`${BASE}/banks`) });
  const e = elig.data || {};
  const bankList: any[] = banks.data || [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["merchant-fkyc"] }); qc.invalidateQueries({ queryKey: ["merchant-banks"] }); };

  const setPrimary = useMutation({ mutationFn: (id: string) => api.post(`${BASE}/banks/${id}/primary`), onSuccess: () => { toast.success("Primary account updated"); refresh(); }, onError: (x: any) => toast.error(x?.detail || "Failed") });
  const delBank = useMutation({ mutationFn: (id: string) => api.del(`${BASE}/banks/${id}`), onSuccess: () => { toast.info("Bank removed"); refresh(); }, onError: (x: any) => toast.error(x?.detail || "Failed") });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Payouts & Bank" back embedded subtitle="Verify KYC to withdraw commission" variant="gradient" testID="merchant-payouts-header" />
      <ScreenScroll refreshing={elig.isFetching} onRefresh={refresh} contentStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        {elig.isLoading ? <CardSkeleton /> : (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: e.eligible ? colors.successSubtle : colors.warningSubtle, alignItems: "center", justifyContent: "center" }}>
                <Icon name={e.eligible ? "check-decagram" : "alert-circle-outline"} size={22} color={e.eligible ? colors.success : colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>{e.eligible ? "Payouts enabled" : "KYC pending"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{e.eligible ? "Your verified bank account will receive payouts." : "Complete the steps below to enable withdrawals."}</Text>
              </View>
            </View>
            {!e.eligible && (e.blockers || []).length > 0 ? (
              <View style={{ marginTop: spacing.md, gap: 6 }}>
                {(e.blockers as string[]).map((bl) => (
                  <View key={bl} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name="circle-medium" size={16} color={colors.danger} />
                    <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>{bl}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        )}

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>Bank accounts</Text>
          <Pressable testID="m-add-bank" onPress={() => setAddOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="plus-circle" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: fontSize.sm }}>Add</Text>
          </Pressable>
        </View>
        {banks.isLoading ? <CardSkeleton /> : bankList.length === 0 ? (
          <Card><EmptyState icon="bank-outline" title="No bank account" subtitle="Add a bank account with passbook to receive payouts." /></Card>
        ) : bankList.map((bk) => (
          <Card key={bk.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>{bk.bank_name}</Text>
                  {bk.is_primary ? <Badge label="Primary" tone="primary" /> : null}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 3 }}>{bk.account_holder}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}>A/C ••••{String(bk.account_number || "").slice(-4)} · {bk.ifsc}</Text>
              </View>
              <Badge label={bk.status || "pending"} tone={statusTone(bk.status)} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              {!bk.is_primary ? <View style={{ flex: 1 }}><Button title="Set primary" variant="outline" size="sm" onPress={() => setPrimary.mutate(bk.id)} loading={setPrimary.isPending} testID={`m-primary-${bk.id}`} /></View> : null}
              <View style={{ flex: 1 }}><Button title="Remove" variant="outline" size="sm" onPress={() => delBank.mutate(bk.id)} testID={`m-del-${bk.id}`} /></View>
            </View>
          </Card>
        ))}
      </ScreenScroll>

      <AddBankModal open={addOpen} onClose={() => setAddOpen(false)} onDone={refresh} colors={colors} insets={insets} toast={toast} />
    </View>
  );
}

function AddBankModal({ open, onClose, onDone, colors, insets, toast }: any) {
  const [f, setF] = useState({ account_holder: "", bank_name: "", account_number: "", ifsc: "", upi_id: "" });
  const [passbook, setPassbook] = useState<string | null>(null);
  const set = (k: string) => (v: string) => setF((s: any) => ({ ...s, [k]: v }));
  const submit = useMutation({
    mutationFn: () => api.post(`${BASE}/banks`, { ...f, ifsc: f.ifsc.toUpperCase(), passbook_url: passbook }),
    onSuccess: () => { toast.success("Bank added — pending verification"); setF({ account_holder: "", bank_name: "", account_number: "", ifsc: "", upi_id: "" }); setPassbook(null); onClose(); onDone(); },
    onError: (e: any) => toast.error(e?.detail || "Could not add bank"),
  });
  const box = { flexDirection: "row" as const, alignItems: "center" as const, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 50 };
  const input = { flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.md, fontWeight: "600" as const };
  const go = () => {
    if (!f.account_holder || !f.bank_name || !f.account_number || !f.ifsc) return toast.error("Fill holder, bank, account number & IFSC");
    if (!passbook) return toast.error("Upload passbook / cheque image");
    submit.mutate();
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>Add bank account</Text>
            <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
          </View>
          {[["account", "Account holder name", "account_holder", "default"], ["bank", "Bank name", "bank_name", "default"], ["numeric", "Account number", "account_number", "number-pad"], ["barcode", "IFSC code", "ifsc", "default"], ["at", "UPI ID (optional)", "upi_id", "default"]].map(([ic, ph, key, kb]) => (
            <View key={key as string} style={box}>
              <Icon name={ic as any} size={18} color={colors.textMuted} />
              <TextInput value={(f as any)[key as string]} onChangeText={(t) => set(key as string)(key === "account_number" ? t.replace(/[^0-9]/g, "") : key === "ifsc" ? t.toUpperCase() : t)} placeholder={ph as string} placeholderTextColor={colors.textMuted} keyboardType={kb as any} autoCapitalize={key === "ifsc" ? "characters" : "none"} style={input} />
            </View>
          ))}
          <Pressable onPress={async () => setPassbook(await pickImage())} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, padding: 10 }}>
            {passbook ? <Image source={{ uri: passbook }} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" /> : <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="camera-plus" size={22} color={colors.primary} /></View>}
            <Text style={{ color: passbook ? colors.success : colors.textSecondary, fontSize: fontSize.sm, fontWeight: "700", flex: 1 }}>{passbook ? "Image selected — tap to change" : "Passbook / cheque photo (required)"}</Text>
          </Pressable>
          <Button title="Add bank account" onPress={go} loading={submit.isPending} testID="m-submit-bank" />
        </View>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
