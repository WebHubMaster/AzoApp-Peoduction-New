import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, TextInput, Platform, Alert, ActivityIndicator, StyleProp, ViewStyle, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import type { ImagePickerAsset } from "expo-image-picker";
import { api, API_BASE, getToken, mediaUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { Icon, MdiName } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { SLATE } from "@/src/components/qr/qrKit";
import { pickImage, uploadAsset, SourceSheet } from "@/src/components/reg/Photo";
import { useFin, Surface, StatusBadge, EmptyState, PremiumSelect, Sk, SecurityNote, LockedCard, EMERALD, ROSE, AMBER, TAB } from "@/src/components/merchant/FinanceKit";

/* 1:1 port of web_panel/src/pages/merchant/MerchantFinanceKyc.jsx (mobile view). */
const PANEL = "/merchant/panel";
const UPLOAD_BASE = "/merchant/registration";
const EMPTY_BANK = { account_holder: "", bank_name: "", account_number: "", confirm_account: "", ifsc: "", account_type: "savings", upi_id: "", passbook_url: "" };
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const maskAcc = (a?: string) => (a ? "•••• •••• " + String(a).slice(-4) : "");
const fdate = (s?: string) => { try { return s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null; } catch { return null; } };
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
type Bank = typeof EMPTY_BANK;
type PanForm = { pan_number: string; pan_url: string };

/* multipart upload → /merchant/registration/upload · web reports live % (XHR), native = indeterminate */
async function uploadDoc(asset: ImagePickerAsset, docType: string, onPct: (p: number) => void): Promise<string> {
  if (Platform.OS !== "web") { const r = await uploadAsset(UPLOAD_BASE, docType, asset); return r.url; }
  const token = await getToken();
  const blob = await (await fetch(asset.uri)).blob();
  const fd = new FormData();
  fd.append("file", blob, asset.fileName || `${docType}_${Date.now()}.jpg`);
  fd.append("doc_type", docType);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${UPLOAD_BASE}/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded * 100) / e.total)); };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) { let d = "Upload failed"; try { d = JSON.parse(xhr.responseText)?.detail || d; } catch { /* noop */ } return reject(new Error(d)); }
      resolve(JSON.parse(xhr.responseText).url);
    };
    xhr.send(fd);
  });
}

/* shadcn Button — default(h-10) / outline / ghost; web sizes: sm=h-8 text-xs, h-11 */
function Btn({ label, icon, onPress, variant = "default", disabled, height = 40, small, color, style, testID, loading }: { label: string; icon?: MdiName; onPress: () => void; variant?: "default" | "outline" | "ghost"; disabled?: boolean; height?: number; small?: boolean; color?: string; style?: StyleProp<ViewStyle>; testID?: string; loading?: boolean }) {
  const { P, dark, card, body } = useFin();
  const fg = color || (variant === "default" ? "#ffffff" : body);
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [{ height, borderRadius: 6, paddingHorizontal: small ? 12 : 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: variant === "default" ? (pressed ? P[800] : P[700]) : variant === "outline" ? card : pressed ? (dark ? SLATE[800] : ROSE[50]) : "transparent", borderWidth: variant === "outline" ? 1 : 0, borderColor: dark ? SLATE[700] : SLATE[200], opacity: disabled ? 0.5 : 1 }, style]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={small ? 14 : 16} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: small ? 12 : 14, lineHeight: small ? 16 : 20, fontWeight: "500" }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/* shadcn Input — h-11 rounded-md border-input bg-background px-3 text-sm */
function Input({ value, onChangeText, placeholder, mono, upper, keyboardType, maxLength, error, testID }: { value: string; onChangeText: (t: string) => void; placeholder: string; mono?: boolean; upper?: boolean; keyboardType?: "default" | "number-pad"; maxLength?: number; error?: boolean; testID?: string }) {
  const { dark, card, heading } = useFin();
  return (
    <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={SLATE[400]} keyboardType={keyboardType} maxLength={maxLength} autoCapitalize={upper ? "characters" : "none"} autoCorrect={false}
      style={{ height: 44, borderRadius: 6, borderWidth: 1, borderColor: error ? ROSE[400] : dark ? SLATE[700] : SLATE[200], backgroundColor: card, paddingHorizontal: 12, fontSize: 14, color: heading, fontFamily: mono ? MONO : undefined, textTransform: upper ? "uppercase" : undefined }} />
  );
}

/* label: text-xs font-bold uppercase tracking-wide text-slate-400 */
const Label = ({ children }: { children: string }) => <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, color: SLATE[400] }}>{children}</Text>;
const IconBtn = ({ icon, color, onPress, testID }: { icon: MdiName; color: string; onPress: () => void; testID?: string }) => (
  <Pressable testID={testID} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ height: 32, width: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? "rgba(255,255,255,0.8)" : "transparent" })}><Icon name={icon} size={16} color={color} /></Pressable>
);

/* Surface section title: h-8 w-8 rounded-lg bg-primary-50 icon + font-heading font-bold */
function SectionHead({ icon, title, right }: { icon: MdiName; title: string; right: React.ReactNode }) {
  const { heading, primarySubtle, primaryText } = useFin();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ height: 32, width: 32, borderRadius: 8, backgroundColor: primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={16} color={primaryText} /></View>
        <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "700", color: heading }}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/* Uploading… box (border-2 dashed primary-300 p-3 + progress bar) */
function UploadingBox({ pct, testID }: { pct: number | null; testID?: string }) {
  const { P, dark } = useFin();
  return (
    <View testID={testID} style={{ borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: P[300], padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><ActivityIndicator size="small" color={P[700]} /><Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: P[700] }}>Uploading…{pct != null ? ` ${pct}%` : ""}</Text></View>
      <View style={{ marginTop: 8, height: 6, borderRadius: 3, backgroundColor: dark ? SLATE[700] : SLATE[200], overflow: "hidden" }}><View style={{ height: "100%", width: `${pct ?? 100}%`, borderRadius: 3, backgroundColor: P[600], opacity: pct == null ? 0.5 : 1 }} /></View>
    </View>
  );
}

export default function MerchantBankKyc() {
  const F = useFin();
  const { P, dark, colors, heading, muted, strong, primaryText, hairline, card } = F;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const shopName = user?.shop_name || user?.name || "My Shop";

  const accessQ = useQuery({ queryKey: ["m-panel-access"], queryFn: () => api.get<any>(`${PANEL}/access`) });
  const approved = !!(accessQ.data?.approved || user?.kyc_status === "approved");

  const [data, setData] = useState<any>(null);
  const [pan, setPan] = useState<PanForm>({ pan_number: "", pan_url: "" });
  const [showBank, setShowBank] = useState(false);
  const [bank, setBank] = useState<Bank>(EMPTY_BANK);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<Record<string, number | null>>({});
  const [pick, setPick] = useState<{ field: "pan_url" | "passbook_url"; title: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.get<any>(`${PANEL}/finance-kyc`).then(setData).catch(() => {}), []);
  useEffect(() => { if (approved) load(); }, [approved, load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const runUpload = async (source: "camera" | "gallery") => {
    if (!pick) return;
    const field = pick.field;
    try {
      const asset = await pickImage(source, "back");
      if (!asset) return;
      setUploadPct((p) => ({ ...p, [field]: Platform.OS === "web" ? 0 : null }));
      const url = await uploadDoc(asset, field, (pct) => setUploadPct((p) => ({ ...p, [field]: pct })));
      setUploadPct((p) => ({ ...p, [field]: 100 }));
      if (field === "pan_url") setPan((s) => ({ ...s, pan_url: url })); else setBank((s) => ({ ...s, passbook_url: url }));
      toast.success("Document uploaded");
    } catch (e: any) { toast.error(e?.message || "Upload failed — please try again"); }
    finally { setTimeout(() => setUploadPct((p) => { const n = { ...p }; delete n[field]; return n; }), 700); }
  };

  const submitPan = async () => {
    setBusy(true);
    try { await api.post(`${PANEL}/finance-kyc/pan`, { pan_number: pan.pan_number, pan_url: pan.pan_url }); toast.success("PAN submitted for verification"); setPan({ pan_number: "", pan_url: "" }); load(); }
    catch (e: any) { toast.error(e?.detail || "Failed"); } finally { setBusy(false); }
  };
  const submitBank = async () => {
    if (bank.account_number !== bank.confirm_account) return toast.error("Account numbers do not match");
    if (!IFSC_RE.test(bank.ifsc)) return toast.error("Invalid IFSC code");
    setBusy(true);
    try { const { confirm_account, ...payload } = bank; await api.post(`${PANEL}/finance-kyc/banks`, payload); toast.success("Bank submitted for verification"); setShowBank(false); setBank(EMPTY_BANK); load(); }
    catch (e: any) { toast.error(e?.detail || "Failed"); } finally { setBusy(false); }
  };
  const setPrimary = async (id: string) => { try { await api.post(`${PANEL}/finance-kyc/banks/${id}/primary`); toast.success("Primary account updated"); load(); } catch (e: any) { toast.error(e?.detail || "Failed"); } };
  const delBank = (id: string) => {
    const go = async () => { try { await api.del(`${PANEL}/finance-kyc/banks/${id}`); toast.success("Bank removed"); load(); } catch (e: any) { toast.error(e?.detail || "Failed"); } };
    if (Platform.OS === "web") { if (window.confirm("Remove this bank account?")) go(); return; }
    Alert.alert("Remove bank", "Remove this bank account?", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: go }]);
  };

  const panStatus = data?.pan?.status;
  const panOk = panStatus === "approved";
  const panPending = panStatus === "pending";
  const panRejected = panStatus === "rejected";
  const banks: any[] = data?.banks || [];
  const bankOk = banks.some((b) => b.status === "approved");
  const doneCount = (panOk ? 1 : 0) + (bankOk ? 1 : 0);
  const canConfirm = !!(bank.account_holder && bank.bank_name && bank.account_number && bank.confirm_account && bank.ifsc);
  const accMismatch = !!bank.confirm_account && bank.confirm_account !== bank.account_number;
  const ifscBad = !!bank.ifsc && !IFSC_RE.test(bank.ifsc);
  const inputBorder = dark ? SLATE[700] : SLATE[200];
  const emeraldBg = dark ? EMERALD[950] : EMERALD[50];
  const amberBg = dark ? AMBER[950] : AMBER[50];
  const roseBg = dark ? ROSE[950] : ROSE[50];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P[700]} colors={[P[700]]} />}
        testID="merchant-finance-kyc"
      >
        {/* Page header (MerchantDashboard.jsx) */}
        <View style={{ marginBottom: 16 }}>
          <Text testID="merchant-bankkyc-header" style={{ fontSize: 20, lineHeight: 28, fontWeight: "800", color: heading }} numberOfLines={1}>Bank & KYC</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <Icon name="store" size={14} color={P[700]} />
            <Text style={{ fontSize: 12, lineHeight: 16, color: muted }} numberOfLines={1}>{shopName}</Text>
          </View>
        </View>

        {!accessQ.isLoading && !approved ? (
          <LockedCard completion={accessQ.data?.completion ?? 0} status={accessQ.data?.status} onGo={() => router.push("/merchant/profilekyc")} />
        ) : !data ? (
          <View style={{ gap: 20 }}>
            <Surface style={{ padding: 24 }}><Sk style={{ height: 96, borderRadius: 12 }} /></Surface>
            <Surface style={{ padding: 24 }}><Sk style={{ height: 128, borderRadius: 12 }} /></Surface>
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            {/* progress header */}
            <LinearGradient colors={data.eligible ? ["#059669", "#065f46"] : ["#0D47A1", "#0a2e6b"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: 24, padding: 24, overflow: "hidden", boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.1), 0px 4px 6px -4px rgba(0,0,0,0.1)" }} testID="mfk-hero">
              <View style={{ position: "absolute", right: -56, top: -56, height: 192, width: 192, borderRadius: 96, backgroundColor: "rgba(255,255,255,0.1)" }} />
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
                <View style={{ height: 48, width: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}><Icon name={data.eligible ? "shield-check-outline" : "alert-outline"} size={24} color="#fff" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text testID="mfk-eligibility" style={{ fontSize: 20, lineHeight: 28, fontWeight: "800", color: "#fff" }}>{data.eligible ? "Withdrawal-eligible" : "Complete KYC to withdraw"}</Text>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{data.eligible ? "Your PAN and bank account are verified. You can withdraw earnings anytime." : `Pending: ${(data.blockers || []).join(", ")}`}</Text>
                  <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" }}><View style={{ height: "100%", borderRadius: 4, backgroundColor: "#fff", width: `${(doneCount / 2) * 100}%` }} /></View>
                    <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: "#fff", ...TAB }}>{doneCount}/2 verified</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>

            {/* PAN */}
            <Surface style={{ padding: 20 }} testID="mfk-pan-card">
              <SectionHead icon="credit-card-outline" title="PAN Card" right={<StatusBadge status={panStatus} testID="mfk-pan-status" />} />
              {data.pan?.reason && panRejected ? <View style={{ marginBottom: 12, borderRadius: 8, backgroundColor: roseBg, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ fontSize: 14, lineHeight: 20, color: dark ? ROSE[400] : "#e11d48" }}>Rejected: {data.pan.reason}</Text></View> : null}
              {panOk ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 24, rowGap: 8, borderRadius: 12, backgroundColor: emeraldBg, paddingHorizontal: 16, paddingVertical: 14 }}>
                  <Icon name="lock-outline" size={20} color={dark ? EMERALD[400] : EMERALD[600]} />
                  <View><Label>PAN Number</Label><Text style={{ fontFamily: MONO, fontWeight: "700", fontSize: 16, lineHeight: 24, color: heading }}>{data.pan.pan_number}</Text></View>
                  {fdate(data.pan.verified_at) ? <View><Label>Verified</Label><Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: EMERALD[600] }}>{fdate(data.pan.verified_at)}</Text></View> : null}
                  <Text style={{ width: "100%", fontSize: 12, lineHeight: 16, fontWeight: "600", color: dark ? EMERALD[400] : EMERALD[600] }}>Verified & locked</Text>
                  {data.pan.pan_url ? <Btn small height={32} variant="outline" icon="eye-outline" label="View" onPress={() => setPreview(data.pan.pan_url)} style={{ marginLeft: "auto" }} testID="mfk-pan-view" /> : null}
                </View>
              ) : panPending ? (
                <View testID="mfk-pan-pending" style={{ borderRadius: 12, backgroundColor: amberBg, paddingHorizontal: 16, paddingVertical: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Icon name="clock-outline" size={20} color={dark ? AMBER[400] : AMBER[600]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: strong }}>Submitted — under review</Text>
                      <Text style={{ fontSize: 12, lineHeight: 16, color: muted }}>PAN <Text style={{ fontFamily: MONO, fontWeight: "700" }}>{data.pan?.pan_number}</Text> · locked until reviewed by admin.</Text>
                    </View>
                    {data.pan?.pan_url ? <Pressable testID="mfk-pan-view" onPress={() => setPreview(data.pan.pan_url)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="eye-outline" size={14} color={primaryText} /><Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: primaryText }}>View</Text></Pressable> : null}
                  </View>
                  <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="lock-outline" size={12} color={dark ? "#fcd34d" : AMBER[700]} /><Text style={{ fontSize: 11, lineHeight: 14, color: dark ? "#fcd34d" : AMBER[700] }}>You can resubmit only if it is rejected.</Text></View>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  <View>
                    <Label>PAN Number</Label>
                    <View style={{ marginTop: 4 }}><Input testID="mfk-pan-number" placeholder="ABCDE1234F" mono upper maxLength={10} value={pan.pan_number} onChangeText={(t) => setPan({ ...pan, pan_number: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} /></View>
                  </View>
                  <View>
                    <Label>PAN Document</Label>
                    <View style={{ marginTop: 4 }}>
                      {uploadPct.pan_url !== undefined ? <UploadingBox pct={uploadPct.pan_url} testID="mfk-pan-uploading" /> : pan.pan_url ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: dark ? "#065f46" : "#6ee7b7", backgroundColor: emeraldBg, padding: 8 }}>
                          <Image source={{ uri: mediaUrl(pan.pan_url) }} style={{ height: 36, width: 48, borderRadius: 4 }} contentFit="cover" />
                          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "500", color: dark ? EMERALD[400] : EMERALD[700] }}>Uploaded</Text>
                          <IconBtn icon="eye-outline" color={SLATE[500]} onPress={() => setPreview(pan.pan_url)} testID="mfk-pan-preview" />
                          <IconBtn icon="refresh" color={SLATE[500]} onPress={() => setPick({ field: "pan_url", title: "PAN Document" })} testID="mfk-pan-replace" />
                          <IconBtn icon="trash-can-outline" color={ROSE[500]} onPress={() => setPan({ ...pan, pan_url: "" })} testID="mfk-pan-delete" />
                        </View>
                      ) : (
                        <Pressable testID="mfk-pan-upload" onPress={() => setPick({ field: "pan_url", title: "PAN Document" })}
                          style={({ pressed }) => ({ height: 44, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: pressed ? P[400] : inputBorder, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 })}>
                          <Icon name="cloud-upload-outline" size={16} color={SLATE[500]} /><Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: SLATE[500] }}>Upload PAN (image/PDF)</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <View>
                    <Btn testID="mfk-submit-pan" height={44} label={panRejected ? "Resubmit PAN for verification" : "Submit PAN for verification"} onPress={submitPan} loading={busy} disabled={busy || pan.pan_number.length !== 10 || !pan.pan_url || uploadPct.pan_url !== undefined} style={{ alignSelf: "flex-start" }} />
                    <Text style={{ marginTop: 8, fontSize: 11, lineHeight: 14, color: SLATE[400] }}>You can upload only one PAN card. It locks once submitted, until reviewed.</Text>
                  </View>
                </View>
              )}
            </Surface>

            {/* Bank accounts */}
            <Surface style={{ padding: 20 }} testID="mfk-banks-card">
              <SectionHead icon="bank-outline" title="Bank Accounts" right={<Btn small height={32} variant="outline" icon="plus" label="Add bank" onPress={() => setShowBank((s) => !s)} testID="mfk-add-bank-btn" />} />

              {banks.length === 0 && !showBank ? (
                <EmptyState icon="office-building-outline" title="No bank accounts yet" hint="Add a bank account to receive your withdrawals." testID="mfk-banks-empty"
                  action={<Btn height={40} icon="plus" label="Add bank account" onPress={() => setShowBank(true)} testID="mfk-banks-empty-add" />} />
              ) : (
                <View style={{ gap: 12 }}>
                  {banks.map((b) => (
                    <View key={b.id} testID={`mfk-bank-${b.id}`} style={{ borderRadius: 16, borderWidth: 1, padding: 16, borderColor: b.is_primary ? (dark ? P[700] : P[300]) : inputBorder, boxShadow: b.is_primary ? `0px 0px 0px 1px ${dark ? "rgba(13,71,161,0.4)" : P[100]}` : undefined }}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: F.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="bank-outline" size={20} color={primaryText} /></View>
                        <StatusBadge status={b.status} />
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
                        <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "600", color: heading }} numberOfLines={1}>{b.bank_name}</Text>
                        {b.is_primary ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: dark ? "rgba(13,71,161,0.5)" : P[100] }}><Icon name="star" size={10} color={primaryText} /><Text style={{ fontSize: 9, lineHeight: 12, fontWeight: "600", color: primaryText }}>PRIMARY</Text></View> : null}
                      </View>
                      <Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[500], marginTop: 2 }}>{b.account_holder}</Text>
                      <Text style={{ fontSize: 14, lineHeight: 20, fontFamily: MONO, color: dark ? SLATE[300] : SLATE[700], marginTop: 4 }}>{maskAcc(b.account_number)}</Text>
                      <Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400] }}>{b.ifsc}{b.upi_id ? ` · UPI ${b.upi_id}` : ""}</Text>
                      {b.status === "rejected" && b.reason ? <Text style={{ fontSize: 12, lineHeight: 16, color: "#e11d48", marginTop: 4 }}>Rejected: {b.reason}</Text> : null}
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                        {b.status === "approved" && !b.is_primary ? <Btn small height={32} variant="outline" icon="star-outline" label="Set primary" onPress={() => setPrimary(b.id)} testID={`mfk-primary-${b.id}`} /> : null}
                        <Btn small height={32} variant="ghost" icon="trash-can-outline" label="Remove" color={ROSE[500]} onPress={() => delBank(b.id)} testID={`mfk-remove-${b.id}`} />
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {showBank ? (
                <View testID="mfk-bank-form" style={{ gap: 12, borderTopWidth: 1, borderTopColor: hairline, paddingTop: 16, marginTop: 16 }}>
                  <Input testID="mfk-bank-holder" placeholder="Account holder name" value={bank.account_holder} onChangeText={(t) => setBank({ ...bank, account_holder: t })} />
                  <Input testID="mfk-bank-name" placeholder="Bank name" value={bank.bank_name} onChangeText={(t) => setBank({ ...bank, bank_name: t })} />
                  <Input testID="mfk-bank-acc" placeholder="Account number" keyboardType="number-pad" value={bank.account_number} onChangeText={(t) => setBank({ ...bank, account_number: t.replace(/\D/g, "") })} />
                  <View>
                    <Input testID="mfk-bank-acc2" placeholder="Confirm account number" keyboardType="number-pad" error={accMismatch} value={bank.confirm_account} onChangeText={(t) => setBank({ ...bank, confirm_account: t.replace(/\D/g, "") })} />
                    {accMismatch ? <Text style={{ fontSize: 11, lineHeight: 14, color: ROSE[500], marginTop: 4 }}>Account numbers don’t match</Text> : null}
                  </View>
                  <View>
                    <Input testID="mfk-bank-ifsc" placeholder="IFSC code" mono upper maxLength={11} error={ifscBad} value={bank.ifsc} onChangeText={(t) => setBank({ ...bank, ifsc: t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} />
                    {ifscBad ? <Text style={{ fontSize: 11, lineHeight: 14, color: ROSE[500], marginTop: 4 }}>Invalid IFSC (e.g. HDFC0001234)</Text> : null}
                  </View>
                  <PremiumSelect testID="mfk-bank-type" value={bank.account_type} onChange={(v) => setBank({ ...bank, account_type: String(v) })} height={44} radius={6} placeholder="Account type"
                    options={[{ value: "savings", label: "Savings" }, { value: "current", label: "Current" }]} />
                  <Pressable testID="mfk-passbook-upload" disabled={uploadPct.passbook_url !== undefined} onPress={() => setPick({ field: "passbook_url", title: "Passbook / Cheque" })}
                    style={({ pressed }) => ({ height: 44, borderRadius: 6, borderWidth: 1, borderColor: bank.passbook_url ? (dark ? "#065f46" : "#6ee7b7") : inputBorder, backgroundColor: pressed ? (dark ? SLATE[800] : SLATE[50]) : card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, opacity: uploadPct.passbook_url !== undefined ? 0.7 : 1 })}>
                    {uploadPct.passbook_url !== undefined ? <><ActivityIndicator size="small" color={F.body} /><Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: F.body }}>Uploading…{uploadPct.passbook_url != null ? ` ${uploadPct.passbook_url}%` : ""}</Text></>
                      : bank.passbook_url ? <><Icon name="check-circle-outline" size={16} color={dark ? EMERALD[400] : EMERALD[700]} /><Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: dark ? EMERALD[400] : EMERALD[700] }}>Passbook uploaded</Text></>
                      : <><Icon name="cloud-upload-outline" size={16} color={F.body} /><Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: F.body }}>Upload passbook / cheque</Text></>}
                  </Pressable>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Btn height={44} variant="outline" label="Cancel" onPress={() => { setShowBank(false); setBank(EMPTY_BANK); }} testID="mfk-bank-cancel" />
                    <Btn height={44} label="Submit for verification" onPress={submitBank} loading={busy} disabled={busy || !canConfirm} style={{ flex: 1 }} testID="mfk-submit-bank" />
                  </View>
                </View>
              ) : null}
            </Surface>

            <SecurityNote />
          </View>
        )}
      </ScrollView>

      <SourceSheet open={!!pick} onClose={() => setPick(null)} onPick={runUpload} title={pick?.title || "Upload document"} />

      {/* document preview */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable testID="mfk-preview-modal" onPress={() => setPreview(null)} style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.7)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ width: "100%", maxWidth: 512 }}>
            <Pressable testID="mfk-preview-close" onPress={() => setPreview(null)} hitSlop={8} style={{ alignSelf: "flex-end", marginBottom: 4, height: 36, width: 36, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={20} color="#fff" /></Pressable>
            {preview ? <Image source={{ uri: mediaUrl(preview) }} style={{ width: "100%", height: Math.min(width - 48, 512) * 0.7, borderRadius: 16, backgroundColor: "#0f172a" }} contentFit="contain" /> : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
