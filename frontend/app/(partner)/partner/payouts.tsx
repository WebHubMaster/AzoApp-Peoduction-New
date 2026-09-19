import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Linking, Platform } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { ScreenScroll } from "@/src/components/Screen";
import { Button } from "@/src/components/ui";
import { LinearGradient } from "expo-linear-gradient";
import { AppShellHeader, Surface, KitEmpty, StatusBadge } from "@/src/components/AppShell";
import { ProgressRing } from "@/src/components/ProgressRing";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

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

export default function PartnerPayouts() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const elig = useQuery({ queryKey: ["partner-fkyc"], queryFn: () => api.get<any>("/partner/finance-kyc") });
  const banks = useQuery({ queryKey: ["partner-banks"], queryFn: () => api.get<any[]>("/partner/finance-kyc/banks") });

  const e = elig.data || {};
  const bankList: any[] = banks.data || [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["partner-fkyc"] }); qc.invalidateQueries({ queryKey: ["partner-banks"] }); };

  const setPrimary = useMutation({
    mutationFn: (id: string) => api.post(`/partner/finance-kyc/banks/${id}/primary`),
    onSuccess: () => { toast.success("Primary account updated"); refresh(); },
    onError: (err: any) => toast.error(err?.detail || "Failed"),
  });
  const delBank = useMutation({
    mutationFn: (id: string) => api.del(`/partner/finance-kyc/banks/${id}`),
    onSuccess: () => { toast.info("Bank account removed"); refresh(); },
    onError: (err: any) => toast.error(err?.detail || "Failed"),
  });

  const kycPct = Math.round(((e.pan?.status === "approved" ? 1 : 0) + (bankList.some((b) => b.status === "approved") ? 1 : 0)) / 2 * 100);
  const [pan, setPan] = useState("");
  const [panImg, setPanImg] = useState<string | null>(null);
  const submitPan = useMutation({
    mutationFn: () => api.post("/partner/finance-kyc/pan", { pan_number: pan.toUpperCase(), pan_url: panImg }),
    onSuccess: () => { toast.success("PAN submitted for verification"); setPan(""); setPanImg(null); refresh(); },
    onError: (err: any) => toast.error(err?.detail || "Could not submit PAN"),
  });
  const SLATE400 = "#94A3B8";
  const CardHead = ({ icon, title, right }: { icon: any; title: string; right?: React.ReactNode }) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={20} color={colors.primary} /></View>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{title}</Text>
      </View>
      {right}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScreenScroll refreshing={elig.isFetching && !elig.isLoading} onRefresh={refresh} contentStyle={{ paddingBottom: insets.bottom + 110 }}>
        {/* Hero */}
        <LinearGradient colors={[colors.primary, colors.secondary, "#1E88E5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24, boxShadow: "0px 16px 32px rgba(13,71,161,0.25)", elevation: 6 }} testID="payouts-header">
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}><Icon name={e.eligible ? "shield-check-outline" : "shield-alert-outline"} size={24} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800", lineHeight: 26 }}>{e.eligible ? "KYC verified — payouts enabled" : "Complete KYC to withdraw"}</Text>
              <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 }}><Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{e.eligible ? "Verified" : "Pending"}</Text></View>
              {!e.eligible ? <Text style={{ color: "#fff", fontSize: 16, marginTop: 12, lineHeight: 24 }}>Pending: {(e.blockers || []).join(", ") || "verification"}</Text> : <Text style={{ color: "#BFDBFE", fontSize: 14, marginTop: 12 }}>Your verified bank account will receive payouts.</Text>}
              {!e.eligible ? (
                <View style={{ gap: 8, marginTop: 12 }}>
                  {[["PAN Card", e.pan?.status === "approved"], ["Bank Account", bankList.some((b) => b.status === "approved")]].map(([l, ok]) => (
                    <View key={String(l)} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Icon name={ok ? "check-circle-outline" : "alert-outline"} size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{String(l)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={{ alignItems: "center", justifyContent: "flex-start" }}>
              <ProgressRing pct={kycPct} color="#fff" trackColor="rgba(255,255,255,0.25)" size={68} stroke={6} label="" centerBottom="KYC DONE" light />
            </View>
          </View>
        </LinearGradient>

        {/* PAN card */}
        <Surface style={{ overflow: "hidden" }}>
          <CardHead icon="credit-card-outline" title="PAN Card" right={<StatusBadge status={e.pan ? e.pan.status || "pending" : "incomplete"} label={e.pan ? undefined : "Incomplete"} />} />
          <View style={{ padding: 20, gap: 12 }}>
            {e.pan ? (
              <>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", fontFamily: "monospace" }}>{e.pan.pan_number || "•••• submitted"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{e.pan.status === "approved" ? "Your PAN is verified." : "Submitted — locked until reviewed by admin."}</Text>
              </>
            ) : (
              <>
                <Field colors={colors} placeholder="PAN NUMBER (ABCDE1234F)" value={pan} onChange={(t: string) => setPan(t.toUpperCase().slice(0, 10))} autoCap testID="pan-input" />
                <ImagePickField colors={colors} label="PAN card image" img={panImg} onPick={async () => setPanImg(await pickImage())} />
                <Button title="Submit PAN" onPress={() => (pan.length >= 10 ? submitPan.mutate() : toast.error("Enter a valid 10-char PAN"))} loading={submitPan.isPending} disabled={pan.length < 10} testID="submit-pan" />
                <Text style={{ color: SLATE400, fontSize: 13, lineHeight: 19 }}>You can upload only one PAN card. It locks once submitted, until reviewed.</Text>
              </>
            )}
          </View>
        </Surface>

        {/* Bank accounts */}
        <Surface style={{ overflow: "hidden" }}>
          <CardHead icon="bank-outline" title="Bank Accounts" right={
            <Pressable testID="add-bank" onPress={() => setAddOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
              <Icon name="plus" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>Add bank</Text>
            </Pressable>} />
          {banks.isLoading ? <View style={{ padding: 20 }}><View style={{ height: 60, borderRadius: 12, backgroundColor: colors.surfaceSubtle }} /></View>
            : bankList.length === 0 ? (
            <KitEmpty icon="bank-outline" title="No bank accounts yet" desc="Add a verified bank account or UPI to receive your withdrawals. Each account is reviewed before you can withdraw to it."
              action={<Pressable testID="add-bank-empty" onPress={() => setAddOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.primary }}><Icon name="plus" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Add bank account</Text></Pressable>} />
          ) : (
            <View style={{ padding: 16, gap: 12 }}>
              {bankList.map((bk) => (
                <View key={bk.id} style={{ borderRadius: 16, borderWidth: 1, borderColor: bk.is_primary ? "#93C5FD" : colors.border, padding: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="bank-outline" size={20} color={colors.primary} /></View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>{bk.bank_name}</Text>{bk.is_primary ? <View style={{ backgroundColor: "#DBEAFE", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "700" }}>PRIMARY</Text></View> : null}</View>
                        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{bk.account_holder}</Text>
                        <Text style={{ color: SLATE400, fontSize: 12, marginTop: 1 }}>••••{String(bk.account_number || "").slice(-4)} · {bk.ifsc}</Text>
                      </View>
                    </View>
                    <StatusBadge status={bk.status || "pending"} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    {!bk.is_primary ? <View style={{ flex: 1 }}><Button title="Set primary" variant="outline" size="sm" onPress={() => setPrimary.mutate(bk.id)} loading={setPrimary.isPending} testID={`primary-${bk.id}`} /></View> : null}
                    <View style={{ flex: 1 }}><Button title="Remove" variant="outline" size="sm" onPress={() => delBank.mutate(bk.id)} testID={`del-${bk.id}`} /></View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Surface>
      </ScreenScroll>

      <AddBankModal open={addOpen} onClose={() => setAddOpen(false)} onDone={refresh} />
    </View>
  );
}

function AddBankModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [f, setF] = useState({ account_holder: "", bank_name: "", account_number: "", ifsc: "", upi_id: "" });
  const [passbook, setPassbook] = useState<string | null>(null);
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = useMutation({
    mutationFn: () => api.post("/partner/finance-kyc/banks", { ...f, ifsc: f.ifsc.toUpperCase(), passbook_url: passbook }),
    onSuccess: () => { toast.success("Bank added — pending verification"); setF({ account_holder: "", bank_name: "", account_number: "", ifsc: "", upi_id: "" }); setPassbook(null); onClose(); onDone(); },
    onError: (e: any) => toast.error(e?.detail || "Could not add bank"),
  });
  const go = () => {
    if (!f.account_holder || !f.bank_name || !f.account_number || !f.ifsc) return toast.error("Fill holder, bank, account number & IFSC");
    if (!passbook) return toast.error("Upload passbook / cheque image");
    submit.mutate();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add bank account" insets={insets} colors={colors}>
      <Field colors={colors} icon="account" placeholder="Account holder name" value={f.account_holder} onChange={set("account_holder")} />
      <Field colors={colors} icon="bank" placeholder="Bank name" value={f.bank_name} onChange={set("bank_name")} />
      <Field colors={colors} icon="numeric" placeholder="Account number" value={f.account_number} onChange={(t) => set("account_number")(t.replace(/[^0-9]/g, ""))} keyboard="number-pad" />
      <Field colors={colors} icon="barcode" placeholder="IFSC code" value={f.ifsc} onChange={(t) => set("ifsc")(t.toUpperCase())} autoCap />
      <Field colors={colors} icon="at" placeholder="UPI ID (optional)" value={f.upi_id} onChange={set("upi_id")} />
      <ImagePickField colors={colors} label="Passbook / cheque photo (required)" img={passbook} onPick={async () => setPassbook(await pickImage())} />
      <Button title="Add bank account" onPress={go} loading={submit.isPending} testID="submit-bank" />
    </Sheet>
  );
}

function Sheet({ open, onClose, title, children, insets, colors }: any) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}

function Field({ colors, icon, placeholder, value, onChange, keyboard, autoCap, testID }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 50 }}>
      {icon ? <Icon name={icon} size={18} color={colors.textMuted} /> : null}
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={keyboard || "default"} autoCapitalize={autoCap ? "characters" : "none"} style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.md, fontWeight: "600" }} />
    </View>
  );
}

function ImagePickField({ colors, label, img, onPick }: any) {
  return (
    <Pressable onPress={onPick} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, padding: 10 }}>
      {img ? <Image source={{ uri: img }} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" /> : <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="camera-plus" size={22} color={colors.primary} /></View>}
      <Text style={{ color: img ? colors.success : colors.textSecondary, fontSize: fontSize.sm, fontWeight: "700", flex: 1 }}>{img ? "Image selected — tap to change" : label}</Text>
    </Pressable>
  );
}
