import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Linking, Platform, ScrollView, ActivityIndicator } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { ScreenScroll } from "@/src/components/Screen";
import { Button } from "@/src/components/ui";
import { LinearGradient } from "expo-linear-gradient";
import { AppShellHeader, Surface, KitEmpty, StatusBadge } from "@/src/components/AppShell";
import { ProgressRing } from "@/src/components/ProgressRing";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { uploadAsset } from "@/src/components/reg/Photo";

const SLATE400 = "#94A3B8";
const REG_BASE = "/partner/registration";

/** Resolve a doc url for viewing — data: URIs pass through, everything else via mediaUrl. */
const docUri = (u?: string | null) => (!u ? undefined : /^data:/.test(u) ? u : mediaUrl(u));
const isPdf = (u?: string | null) => !!u && /\.pdf($|\?)|application\/pdf/i.test(u);

export default function PartnerPayouts() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState<{ url: string; label: string } | null>(null);

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

  const panStatus: string | undefined = e.pan?.status;
  const panApproved = panStatus === "approved";
  const panPending = panStatus === "pending";
  const panRejected = panStatus === "rejected";
  const bankDone = bankList.some((b) => b.status === "approved");
  const steps: [string, boolean][] = [["PAN Card", panApproved], ["Bank Account", bankDone]];
  const kycPct = Math.round(((panApproved ? 1 : 0) + (bankDone ? 1 : 0)) / 2 * 100);

  const [pan, setPan] = useState("");
  const [panImg, setPanImg] = useState<string | null>(null);
  const submitPan = useMutation({
    mutationFn: () => api.post("/partner/finance-kyc/pan", { pan_number: pan.toUpperCase(), pan_url: panImg }),
    onSuccess: () => { toast.success("PAN submitted for verification"); setPan(""); setPanImg(null); refresh(); },
    onError: (err: any) => toast.error(err?.detail || "Could not submit PAN"),
  });

  const heroColors: [string, string, string] = e.eligible
    ? ["#059669", "#10B981", "#34D399"]
    : [colors.primary, colors.secondary, "#1E88E5"];

  const CardHead = ({ icon, title, right }: { icon: any; title: string; right?: React.ReactNode }) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={20} color={colors.primary} /></View>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }} numberOfLines={1}>{title}</Text>
      </View>
      {right}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScreenScroll refreshing={elig.isFetching && !elig.isLoading} onRefresh={refresh} contentStyle={{ paddingBottom: insets.bottom + 110 }}>
        {/* KYC status hero */}
        <LinearGradient colors={heroColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 20, boxShadow: "0px 16px 32px rgba(13,71,161,0.25)", elevation: 6 }} testID="payouts-header">
          <View style={{ flexDirection: "row", gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
              <Icon name={e.eligible ? "shield-check-outline" : "shield-alert-outline"} size={24} color="#fff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Title + status chip inline */}
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", lineHeight: 24, flexShrink: 1 }}>{e.eligible ? "Verified — withdrawal enabled" : "Complete KYC to withdraw"}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{e.eligible ? "Verified" : "Pending"}</Text>
                </View>
              </View>
              {!e.eligible && (e.blockers || []).length > 0 ? (
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 6, lineHeight: 19 }}>Pending: {(e.blockers || []).join(", ")}</Text>
              ) : e.eligible ? (
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 6, lineHeight: 19 }}>Your verified bank account will receive payouts.</Text>
              ) : null}
              {/* Step chips — one responsive row */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {steps.map(([label, ok]) => (
                  <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ok ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Icon name={ok ? "check-circle-outline" : "alert-outline"} size={14} color={ok ? "#fff" : "rgba(255,255,255,0.8)"} />
                    <Text style={{ color: ok ? "#fff" : "rgba(255,255,255,0.8)", fontSize: 12.5, fontWeight: "700" }}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
            {/* Circular KYC progress ring */}
            <View style={{ alignItems: "center", justifyContent: "flex-start" }} testID="kyc-ring">
              <ProgressRing pct={kycPct} color="#fff" trackColor="rgba(255,255,255,0.22)" size={70} stroke={7} label="" centerBottom="KYC done" light />
            </View>
          </View>
        </LinearGradient>

        {/* PAN card */}
        <Surface style={{ overflow: "hidden" }}>
          <CardHead icon="credit-card-outline" title="PAN Card" right={<StatusBadge status={panStatus || "incomplete"} label={panStatus ? undefined : "Incomplete"} />} />
          <View style={{ padding: 20, gap: 12 }}>
            {panRejected && e.pan?.reason ? (
              <View style={{ flexDirection: "row", gap: 8, backgroundColor: colors.dangerSubtle, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Icon name="alert-outline" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13, flex: 1, lineHeight: 19 }}><Text style={{ fontWeight: "800" }}>Rejected: </Text>{e.pan.reason}</Text>
              </View>
            ) : null}

            {panApproved ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.successSubtle, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 }}>
                <Icon name="lock-outline" size={20} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14 }}>PAN <Text style={{ fontFamily: "monospace", fontWeight: "800" }}>{e.pan.pan_number}</Text></Text>
                  <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700", marginTop: 1 }}>Verified &amp; locked</Text>
                </View>
                {e.pan?.pan_url ? (
                  <Pressable testID="pan-view" onPress={() => setViewDoc({ url: e.pan.pan_url, label: "PAN Card" })} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Icon name="eye-outline" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>View</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : panPending ? (
              <View style={{ backgroundColor: colors.warningSubtle, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 }} testID="pan-pending">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Icon name="clock-outline" size={20} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Submitted — under review</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>PAN <Text style={{ fontFamily: "monospace", fontWeight: "800" }}>{e.pan?.pan_number}</Text> · locked until reviewed by admin.</Text>
                  </View>
                  {e.pan?.pan_url ? (
                    <Pressable testID="pan-view" onPress={() => setViewDoc({ url: e.pan.pan_url, label: "PAN Card" })} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Icon name="eye-outline" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>View</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }}>
                  <Icon name="lock-outline" size={12} color={colors.warning} />
                  <Text style={{ color: colors.warning, fontSize: 11 }}>You can resubmit only if it is rejected.</Text>
                </View>
              </View>
            ) : (
              <>
                <Field colors={colors} placeholder="PAN number (ABCDE1234F)" value={pan} onChange={(t: string) => setPan(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} autoCap testID="pan-input" />
                <UploadTile colors={colors} label="PAN card image" value={panImg} docType="pan_url" onUploaded={setPanImg} testID="pan-upload" />
                <Button title={panRejected ? "Resubmit PAN" : "Submit PAN"} onPress={() => submitPan.mutate()} loading={submitPan.isPending} disabled={pan.length < 10 || !panImg} testID="submit-pan" />
                <Text style={{ color: SLATE400, fontSize: 12, lineHeight: 18 }}>You can upload only one PAN card. It locks once submitted, until reviewed.</Text>
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
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{bk.bank_name || "Bank"}</Text>
                          {bk.is_primary ? <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#DBEAFE", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}><Icon name="star" size={9} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "800" }}>PRIMARY</Text></View> : null}
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 18 }}>{bk.account_holder} · A/C {bk.account_number} · {bk.ifsc}{bk.upi_id ? ` · UPI ${bk.upi_id}` : ""}</Text>
                        {bk.status === "rejected" && bk.reason ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Rejected: {bk.reason}</Text> : null}
                      </View>
                    </View>
                    <StatusBadge status={bk.status || "pending"} />
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {bk.passbook_url ? <View style={{ flexGrow: 1 }}><Button title="Passbook" icon="eye-outline" variant="outline" size="sm" onPress={() => setViewDoc({ url: bk.passbook_url, label: `${bk.bank_name || "Bank"} passbook` })} testID={`passbook-${bk.id}`} /></View> : null}
                    {bk.status === "approved" && !bk.is_primary ? <View style={{ flexGrow: 1 }}><Button title="Set primary" icon="star" variant="outline" size="sm" onPress={() => setPrimary.mutate(bk.id)} loading={setPrimary.isPending} testID={`primary-${bk.id}`} /></View> : null}
                    <View style={{ flexGrow: 1 }}><Button title="Remove" icon="trash-can-outline" variant="danger" size="sm" onPress={() => delBank.mutate(bk.id)} testID={`del-${bk.id}`} /></View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Surface>
      </ScreenScroll>

      <AddBankModal open={addOpen} onClose={() => setAddOpen(false)} onDone={refresh} />
      <DocViewer doc={viewDoc} onClose={() => setViewDoc(null)} />
    </View>
  );
}

function AddBankModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [f, setF] = useState({ account_holder: "", bank_name: "", account_number: "", confirm_number: "", ifsc: "", upi_id: "" });
  const [passbook, setPassbook] = useState<string | null>(null);
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const mismatch = !!f.confirm_number && f.account_number !== f.confirm_number;
  const canSubmit = !!f.account_holder && !!f.account_number && !mismatch && !!f.ifsc && !!passbook;
  const submit = useMutation({
    mutationFn: () => {
      const { confirm_number, ...payload } = f;
      return api.post("/partner/finance-kyc/banks", { ...payload, ifsc: f.ifsc.toUpperCase(), passbook_url: passbook });
    },
    onSuccess: () => { toast.success("Bank submitted for verification"); setF({ account_holder: "", bank_name: "", account_number: "", confirm_number: "", ifsc: "", upi_id: "" }); setPassbook(null); onClose(); onDone(); },
    onError: (e: any) => toast.error(e?.detail || "Could not add bank"),
  });
  const go = () => {
    if (!f.account_holder || !f.account_number || !f.ifsc) return toast.error("Fill account holder, account number & IFSC");
    if (f.account_number !== f.confirm_number) return toast.error("Account numbers do not match");
    if (!passbook) return toast.error("Upload passbook / cancelled cheque image");
    submit.mutate();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add Bank Account" insets={insets} colors={colors}>
      <FieldLabel colors={colors} label="Account holder name"><Field colors={colors} placeholder="Account holder name" value={f.account_holder} onChange={set("account_holder")} /></FieldLabel>
      <FieldLabel colors={colors} label="Bank name"><Field colors={colors} placeholder="Bank name" value={f.bank_name} onChange={set("bank_name")} /></FieldLabel>
      <FieldLabel colors={colors} label="Account number"><Field colors={colors} placeholder="Account number" value={f.account_number} onChange={(t) => set("account_number")(t.replace(/[^0-9]/g, ""))} keyboard="number-pad" /></FieldLabel>
      <FieldLabel colors={colors} label="Confirm account number">
        <Field colors={colors} placeholder="Confirm account number" value={f.confirm_number} onChange={(t) => set("confirm_number")(t.replace(/[^0-9]/g, ""))} keyboard="number-pad" />
        {mismatch ? <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4, marginLeft: 4 }}>Account numbers do not match</Text> : null}
      </FieldLabel>
      <FieldLabel colors={colors} label="IFSC code"><Field colors={colors} placeholder="SBIN0001234" value={f.ifsc} onChange={(t) => set("ifsc")(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} autoCap /></FieldLabel>
      <FieldLabel colors={colors} label="UPI ID (optional)"><Field colors={colors} placeholder="yourname@upi" value={f.upi_id} onChange={set("upi_id")} /></FieldLabel>
      <UploadTile colors={colors} label="Passbook / cancelled cheque" value={passbook} docType="passbook_url" onUploaded={setPassbook} testID="passbook-upload" />
      <Button title={submit.isPending ? "Submitting…" : "Submit for verification"} onPress={go} loading={submit.isPending} disabled={!canSubmit} testID="submit-bank" />
    </Sheet>
  );
}

/* Upload tile — uploads via the shared /partner/registration/upload endpoint (same backend logic as web) and stores the returned URL. */
function UploadTile({ colors, label, value, docType, onUploaded, testID }: { colors: any; label: string; value: string | null; docType: string; onUploaded: (url: string) => void; testID?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const has = !!value;
  const pick = async () => {
    if (busy) return;
    try {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { if (!perm.canAskAgain) Linking.openSettings(); return; }
      }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true);
      const d = await uploadAsset(REG_BASE, docType, res.assets[0]);
      onUploaded(d.url);
      toast.success("Uploaded");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed — please try again");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable testID={testID} onPress={pick} disabled={busy}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 2, borderStyle: "dashed", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, borderColor: has ? colors.success : colors.border, backgroundColor: has ? colors.successSubtle : "transparent" }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: has ? colors.successSubtle : colors.surfaceSubtle }}>
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : has ? <Icon name="check-circle" size={22} color={colors.success} /> : <Icon name="upload" size={22} color={colors.textMuted} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{busy ? "Uploading…" : has ? "Uploaded — tap to replace" : "Tap to upload (image)"}</Text>
      </View>
      {has && !busy ? <Image source={{ uri: docUri(value) }} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" /> : null}
    </Pressable>
  );
}

function DocViewer({ doc, onClose }: { doc: { url: string; label: string } | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!doc) return null;
  const uri = docUri(doc.url);
  const pdf = isPdf(doc.url);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.85)", paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Icon name="credit-card-outline" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", flex: 1 }} numberOfLines={1}>{doc.label}</Text>
          {uri ? <Pressable onPress={() => Linking.openURL(uri)} hitSlop={8}><Text style={{ color: "#93C5FD", fontSize: 13, fontWeight: "800" }}>Open</Text></Pressable> : null}
          <Pressable onPress={onClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={20} color="#fff" /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 16 }} maximumZoomScale={4} minimumZoomScale={1}>
          {pdf || !uri ? (
            <Pressable onPress={() => uri && Linking.openURL(uri)} style={{ alignItems: "center", gap: 12, padding: 24 }}>
              <Icon name="file-pdf-box" size={64} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Tap to open document</Text>
            </Pressable>
          ) : (
            <Image source={{ uri }} style={{ width: "100%", height: 480, borderRadius: 12 }} contentFit="contain" />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Sheet({ open, onClose, title, children, insets, colors }: any) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <ScrollView style={{ maxHeight: "88%", backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}

function FieldLabel({ colors, label, children }: any) {
  return (
    <View>
      <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

function Field({ colors, placeholder, value, onChange, keyboard, autoCap, testID }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 50 }}>
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={keyboard || "default"} autoCapitalize={autoCap ? "characters" : "none"} autoCorrect={false} style={{ flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: "600" }} />
    </View>
  );
}
