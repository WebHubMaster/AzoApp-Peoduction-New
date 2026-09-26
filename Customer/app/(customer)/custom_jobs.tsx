/** Custom Requests — port of components/customer/MyCustomJobs.jsx + CustomJobWizard.jsx (mobile bottom sheet, 5 steps). */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Modal, ActivityIndicator, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Sparkles, Plus, ClipboardList, MapPin, IndianRupee, ExternalLink, RefreshCcw, X, User, Wrench, BadgeCheck, ArrowLeft, ArrowRight } from "lucide-react-native";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/context/AuthContext";
import { useToast } from "../../src/components/Toast";
import { isPhone10, isPincode6, onlyDigits, onlyAlpha } from "../../src/lib/format";
import { PRIMARY, SLATE, EMERALD, ROSE, AMBER, SKY, VIOLET } from "../../src/theme";

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: AMBER[100], fg: AMBER[700] },
  under_review: { label: "Under Review", bg: SKY[100], fg: SKY[700] },
  converted_to_service: { label: "Converted to Service", bg: VIOLET[100], fg: VIOLET[700] },
  service_active: { label: "Service Created", bg: EMERALD[100], fg: EMERALD[700] },
  rejected: { label: "Rejected", bg: ROSE[100], fg: ROSE[700] },
  closed: { label: "Closed", bg: SLATE[200], fg: SLATE[600] },
};
const rupee = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN");
const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };

export default function CustomJobsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const load = useCallback(() => { setLoading(true); api.get<any[]>("/custom-jobs/mine").then((d) => setRows(d || [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Sparkles size={22} color={PRIMARY[600]} /><Text testID="page-title" style={{ fontSize: 22, fontWeight: "900", color: SLATE[900], letterSpacing: -0.4 }}>My Custom Job Requests</Text></View>
        <Text style={{ fontSize: 13, color: SLATE[500], marginTop: 2 }}>Track services you asked us to build for you.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable testID="mcj-refresh" onPress={load} style={{ height: 40, width: 40, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}><RefreshCcw size={16} color={SLATE[500]} /></Pressable>
        <Pressable testID="mcj-new" onPress={() => setWizardOpen(true)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4 }}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Service</Text></Pressable>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }} testID="my-custom-jobs">
      {loading ? <View style={{ padding: 16 }}>{header}<View style={{ paddingVertical: 80, alignItems: "center" }}><ActivityIndicator color={PRIMARY[600]} size="large" /></View></View> : (
        <FlatList data={rows} keyExtractor={(r: any) => r.id} ListHeaderComponent={header} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          ListEmptyComponent={
            <View testID="mcj-empty" style={{ borderRadius: 24, borderWidth: 1, borderStyle: "dashed", borderColor: SLATE[300], padding: 36, alignItems: "center" }}>
              <View style={{ height: 64, width: 64, borderRadius: 18, backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center", marginBottom: 16 }}><ClipboardList size={32} color={PRIMARY[500]} /></View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[800] }}>No custom requests yet</Text>
              <Text style={{ fontSize: 13, color: SLATE[500], marginTop: 4, textAlign: "center" }}>Can&apos;t find the service you need? Request a custom service and our team will build it for you.</Text>
              <Pressable testID="mcj-empty-new" onPress={() => setWizardOpen(true)} style={{ marginTop: 20, height: 44, paddingHorizontal: 22, borderRadius: 12, backgroundColor: PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 8 }}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700" }}>Request a Custom Service</Text></Pressable>
            </View>}
          renderItem={({ item: r }) => {
            const st = STATUS_STYLE[r.display_status] || STATUS_STYLE[r.status] || STATUS_STYLE.pending;
            const live = r.display_status === "service_active" && r.service?.id;
            return (
              <View testID={`mcj-card-${r.request_id}`} style={{ borderRadius: 18, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", padding: 16, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "800", color: SLATE[900] }}>{r.work_name}</Text><Text style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{r.request_id} · {r.category_name}</Text></View>
                  <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }}><Text testID={`mcj-status-${r.request_id}`} style={{ fontSize: 11, fontWeight: "700", color: st.fg }}>{st.label}</Text></View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><IndianRupee size={13} color={SLATE[500]} /><Text style={{ fontSize: 12, color: SLATE[500] }}>{rupee(r.expected_budget)}</Text></View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MapPin size={13} color={SLATE[500]} /><Text style={{ fontSize: 12, color: SLATE[500] }}>{r.pincode}</Text></View>
                  <Text style={{ fontSize: 12, color: SLATE[500] }}>{fmtDate(r.created_at)}</Text>
                </View>
                {live ? <Pressable testID={`mcj-view-${r.request_id}`} onPress={() => router.push(`/(site)/service/${r.service.id}` as any)} style={{ marginTop: 12, height: 38, borderRadius: 10, backgroundColor: EMERALD[50], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}><ExternalLink size={14} color={EMERALD[700]} /><Text style={{ color: EMERALD[700], fontWeight: "700", fontSize: 14 }}>View Service</Text></Pressable> : null}
              </View>
            );
          }} />
      )}
      <Wizard open={wizardOpen} onClose={() => setWizardOpen(false)} onSubmitted={() => setTimeout(load, 400)} />
    </View>
  );
}

/* ---------------- Wizard ---------------- */
const STEPS = [{ id: 1, label: "About You", icon: User }, { id: 2, label: "Category", icon: Wrench }, { id: 3, label: "The Work", icon: ClipboardList }, { id: 4, label: "Budget & Area", icon: MapPin }, { id: 5, label: "Review", icon: BadgeCheck }];
const Field = ({ label, required, hint, children }: any) => (
  <View style={{ marginBottom: 14 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}><Text style={{ fontSize: 13, fontWeight: "600", color: SLATE[700] }}>{label}{required ? <Text style={{ color: ROSE[500] }}> *</Text> : null}</Text>{hint ? <Text style={{ fontSize: 11, color: SLATE[400] }}>{hint}</Text> : null}</View>
    {children}
  </View>
);
const inp = { height: 46, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 14, fontSize: 14, color: SLATE[900], backgroundColor: "#fff", outlineStyle: "none" } as any;
const StepHead = ({ title, sub }: { title: string; sub: string }) => <View style={{ marginBottom: 16 }}><Text style={{ fontSize: 20, fontWeight: "900", color: SLATE[900] }}>{title}</Text><Text style={{ fontSize: 13, color: SLATE[500], marginTop: 2 }}>{sub}</Text></View>;
const Row = ({ k, v, onEdit }: any) => <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: SLATE[100], gap: 10 }}><Text style={{ fontSize: 13, color: SLATE[500] }}>{k}</Text><Text style={{ fontSize: 13, fontWeight: "600", color: SLATE[900], flex: 1, textAlign: "right" }} numberOfLines={2}>{v}</Text><Pressable onPress={onEdit}><Text style={{ fontSize: 12, fontWeight: "700", color: PRIMARY[700] }}>Edit</Text></Pressable></View>;

function Wizard({ open, onClose, onSubmitted }: { open: boolean; onClose: () => void; onSubmitted: () => void }) {
  const { user, login } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [meta, setMeta] = useState({ min_budget: 299, max_budget: 500000 });
  const [categories, setCategories] = useState<any[]>([]);
  const [step, setStep] = useState(1);
  const [idem] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [otp, setOtp] = useState(""); const [otpSent, setOtpSent] = useState(false); const [verified, setVerified] = useState(false);
  const [categoryId, setCategoryId] = useState(""); const [catQuery, setCatQuery] = useState("");
  const [workName, setWorkName] = useState(""); const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(""); const [pincode, setPincode] = useState(""); const [area, setArea] = useState<any>(null); const [areaLoading, setAreaLoading] = useState(false);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<any>(null);
  const normalized = () => { let p = (phone || "").trim().replace(/\s/g, ""); if (!p.startsWith("+")) p = "+91" + p.replace(/^0+/, ""); return p; };

  useEffect(() => {
    if (!open) return;
    setStep(1); setResult(null); setCategoryId(""); setWorkName(""); setDescription(""); setBudget(""); setPincode(""); setArea(null); setOtp(""); setOtpSent(false);
    api.get<any>("/custom-jobs/meta", { auth: false }).then(setMeta).catch(() => {});
    api.get<any[]>("/catalog/categories", { auth: false }).then((c) => setCategories((c || []).filter((x) => x.active !== false))).catch(() => {});
    if (user) { setName(user.name || ""); setPhone((user.phone || "").replace("+91", "")); setVerified(true); } else { setName(""); setPhone(""); setVerified(false); }
  }, [open, user]);
  useEffect(() => {
    if (!isPincode6(pincode)) { setArea(null); return; }
    setAreaLoading(true);
    api.get<any>(`/geo/serviceability?pincode=${pincode}`, { auth: false }).then((d) => setArea({ serviceable: !!d.serviceable, area: d.city || d.area || "", reason: d.reason })).catch(() => setArea({ serviceable: false, reason: "Could not verify pincode" })).finally(() => setAreaLoading(false));
  }, [pincode]);

  const sendOtp = async () => {
    if (!isPhone10(phone)) return toast.error("Enter a valid 10-digit mobile number");
    if (name.trim().length < 2) return toast.error("Please enter your full name");
    try { const d: any = await api.post("/auth/send-otp", { phone: normalized() }, { auth: false }); if (d.sent === false) return toast.error(d.message || "Could not send OTP"); setOtpSent(true); if (d.dev_otp) { setOtp(d.dev_otp); toast.success(`OTP sent · Dev OTP: ${d.dev_otp}`); } else toast.success(d.message || "OTP sent to your mobile"); }
    catch (e: any) { toast.error(e?.message || "Failed to send OTP"); }
  };
  const verifyOtp = async () => {
    if (otp.length < 4) return toast.error("Enter the OTP");
    try { const d: any = await api.post("/auth/verify-otp", { phone: normalized(), otp, name: name.trim() }, { auth: false }); if (d?.token && d?.user?.role === "customer") await login(d.token, d.user); setVerified(true); toast.success("Mobile verified!"); }
    catch (e: any) { toast.error(e?.message || "Invalid OTP"); }
  };
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60;
  const budgetNum = Number(budget);
  const budgetOk = budget !== "" && !Number.isNaN(budgetNum) && budgetNum >= meta.min_budget && budgetNum <= meta.max_budget;
  const okBy: Record<number, boolean> = { 1: verified && nameOk, 2: !!categoryId, 3: workName.trim().length >= 3 && workName.trim().length <= 100 && description.trim().length >= 10 && description.trim().length <= 1000, 4: budgetOk && isPincode6(pincode) && area?.serviceable === true, 5: true };
  const canNext = okBy[step];
  const selectedCat = categories.find((c) => c.id === categoryId);
  const filteredCats = categories.filter((c) => !catQuery.trim() || c.name.toLowerCase().includes(catQuery.trim().toLowerCase()));
  const submit = async () => {
    if (!(okBy[1] && okBy[2] && okBy[3] && okBy[4])) return;
    setBusy(true);
    try { const d: any = await api.post("/custom-jobs", { full_name: name.trim(), mobile: normalized(), category_id: categoryId, work_name: workName.trim(), description: description.trim(), expected_budget: budgetNum, pincode, city: area?.area || "", idempotency_key: idem }); setResult(d); onSubmitted(); }
    catch (e: any) { toast.error(e?.message || "Could not submit your request. Please try again."); }
    setBusy(false);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" }}>
        <View testID="cjr-sheet" style={{ height: "92%", backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }}>
          {result ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }} testID="cjr-success">
              <View style={{ height: 80, width: 80, borderRadius: 40, backgroundColor: EMERALD[50], alignItems: "center", justifyContent: "center" }}><BadgeCheck size={40} color={EMERALD[600]} /></View>
              <Text style={{ fontSize: 24, fontWeight: "900", color: SLATE[900], marginTop: 18, textAlign: "center" }}>Custom Job Request Submitted!</Text>
              <Text style={{ fontSize: 14, color: SLATE[500], marginTop: 6, textAlign: "center" }}>Our team will review it and build the service for you. Track it under Custom Requests.</Text>
              <View style={{ marginTop: 18, borderRadius: 16, backgroundColor: PRIMARY[50], paddingHorizontal: 22, paddingVertical: 12, alignItems: "center" }}><Text style={{ fontSize: 11, fontWeight: "700", color: PRIMARY[600], textTransform: "uppercase", letterSpacing: 1 }}>Request ID</Text><Text testID="cjr-request-id" style={{ fontSize: 20, fontWeight: "900", color: PRIMARY[700], letterSpacing: 1 }}>{result.request_id}</Text></View>
              <Pressable testID="cjr-done" onPress={onClose} style={{ marginTop: 22, height: 48, paddingHorizontal: 28, borderRadius: 14, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>View my requests</Text></Pressable>
              <Pressable onPress={() => { onClose(); router.push("/(site)/services" as any); }} style={{ marginTop: 12 }}><Text style={{ color: SLATE[500], fontWeight: "600" }}>Browse services instead</Text></Pressable>
            </View>
          ) : (
            <>
              <LinearGradient colors={[PRIMARY[700], PRIMARY[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ height: 32, width: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}><Sparkles size={16} color="#fff" /></View><View><Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Request a Custom Service</Text><Text style={{ color: PRIMARY[100], fontSize: 11 }}>Can&apos;t find what you need? We&apos;ll build it for you.</Text></View></View>
                  <Pressable testID="cjr-close" onPress={onClose} style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}><X size={16} color="#fff" /></Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>{STEPS.map((s) => <View key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s.id <= step ? "#fff" : "rgba(255,255,255,0.3)" }} />)}</View>
                <Text style={{ color: PRIMARY[100], fontSize: 11, marginTop: 6 }}>Step {step} of 5 · {STEPS[step - 1].label}</Text>
              </LinearGradient>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
                {step === 1 ? (
                  <View>
                    <StepHead title="Tell us about you" sub="We'll use this to contact you about your request." />
                    <Field label="Full Name" required><TextInput testID="cjr-name" value={name} onChangeText={(v) => setName(onlyAlpha(v).slice(0, 60))} placeholder="e.g. Rahul Kumar" placeholderTextColor={SLATE[400]} style={inp} editable={!user} /></Field>
                    <Field label="Mobile Number" required>
                      <View style={{ flexDirection: "row", gap: 8 }}><TextInput testID="cjr-phone" value={phone} onChangeText={(v) => { setPhone(onlyDigits(v).slice(0, 10)); if (!user) { setVerified(false); setOtpSent(false); } }} keyboardType="number-pad" placeholder="10-digit mobile number" placeholderTextColor={SLATE[400]} style={{ ...inp, flex: 1 }} editable={!user} />
                        {verified ? <View style={{ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: EMERALD[50], flexDirection: "row", alignItems: "center", gap: 6 }}><BadgeCheck size={16} color={EMERALD[600]} /><Text style={{ color: EMERALD[700], fontWeight: "700", fontSize: 13 }}>Verified</Text></View>
                          : <Pressable testID="cjr-send-otp" onPress={sendOtp} style={{ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: PRIMARY[700], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{otpSent ? "Resend" : "Send OTP"}</Text></Pressable>}</View>
                    </Field>
                    {otpSent && !verified ? <Field label="Enter OTP" required><View style={{ flexDirection: "row", gap: 8 }}><TextInput testID="cjr-otp" value={otp} onChangeText={(v) => setOtp(onlyDigits(v).slice(0, 6))} keyboardType="number-pad" placeholder="6-digit OTP" placeholderTextColor={SLATE[400]} style={{ ...inp, flex: 1, letterSpacing: 4 }} /><Pressable testID="cjr-verify" onPress={verifyOtp} style={{ height: 46, paddingHorizontal: 16, borderRadius: 12, backgroundColor: EMERALD[600], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Verify</Text></Pressable></View></Field> : null}
                  </View>
                ) : null}
                {step === 2 ? (
                  <View>
                    <StepHead title="Pick a category" sub="Choose the closest category for your work." />
                    <TextInput testID="cjr-cat-search" value={catQuery} onChangeText={setCatQuery} placeholder="Search categories…" placeholderTextColor={SLATE[400]} style={{ ...inp, marginBottom: 12 }} />
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                      {filteredCats.map((c) => { const on = c.id === categoryId; return (
                        <Pressable key={c.id} testID={`cjr-cat-${c.id}`} onPress={() => setCategoryId(c.id)} style={{ width: "47.5%", borderRadius: 14, borderWidth: 2, borderColor: on ? PRIMARY[600] : SLATE[200], backgroundColor: on ? PRIMARY[50] : "#fff", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
                          {c.image ? <Image source={{ uri: c.image }} style={{ height: 36, width: 36, borderRadius: 10 }} contentFit="cover" /> : <View style={{ height: 36, width: 36, borderRadius: 10, backgroundColor: SLATE[100] }} />}<Text numberOfLines={2} style={{ flex: 1, fontSize: 13, fontWeight: "600", color: on ? PRIMARY[700] : SLATE[800] }}>{c.name}</Text>
                        </Pressable>); })}
                    </View>
                  </View>
                ) : null}
                {step === 3 ? (
                  <View>
                    <StepHead title="Describe the work" sub="Be specific so our team can scope it right." />
                    <Field label="Work Name" required hint={`${workName.trim().length}/100`}><TextInput testID="cjr-work" value={workName} onChangeText={(v) => setWorkName(v.slice(0, 100))} placeholder="e.g. Main Gate Grill Repair" placeholderTextColor={SLATE[400]} style={inp} /></Field>
                    <Field label="Describe Your Work" required hint={`${description.trim().length}/1000`}><TextInput testID="cjr-desc" value={description} onChangeText={(v) => setDescription(v.slice(0, 1000))} multiline placeholder="e.g. The main gate grill has come loose and needs welding / re-fixing." placeholderTextColor={SLATE[400]} style={{ ...inp, height: 130, paddingTop: 12, textAlignVertical: "top" }} /></Field>
                  </View>
                ) : null}
                {step === 4 ? (
                  <View>
                    <StepHead title="Budget & service area" sub="Tell us your expected budget and where the work is." />
                    <Field label="Expected Budget" required hint={`₹${meta.min_budget} – ₹${Number(meta.max_budget).toLocaleString("en-IN")}`}><TextInput testID="cjr-budget" value={budget} onChangeText={(v) => setBudget(onlyDigits(v).slice(0, 7))} keyboardType="number-pad" placeholder={`e.g. 1500 (min ${meta.min_budget})`} placeholderTextColor={SLATE[400]} style={{ ...inp, borderColor: budget && !budgetOk ? ROSE[400] : SLATE[200] }} /></Field>
                    <Field label="Service Pincode" required><TextInput testID="cjr-pincode" value={pincode} onChangeText={(v) => setPincode(onlyDigits(v).slice(0, 6))} keyboardType="number-pad" placeholder="6-digit pincode" placeholderTextColor={SLATE[400]} style={inp} />
                      {areaLoading ? <Text style={{ fontSize: 12, color: SLATE[400], marginTop: 6 }}>Checking serviceability…</Text> : area ? <View testID="cjr-area" style={{ marginTop: 8, borderRadius: 12, padding: 10, backgroundColor: area.serviceable ? EMERALD[50] : ROSE[50], flexDirection: "row", alignItems: "center", gap: 8 }}><MapPin size={14} color={area.serviceable ? EMERALD[600] : ROSE[600]} /><Text style={{ fontSize: 13, fontWeight: "600", color: area.serviceable ? EMERALD[700] : ROSE[700] }}>{area.serviceable ? `We serve ${area.area || "your area"}` : area.reason || "Sorry, this pincode isn't serviceable yet"}</Text></View> : null}
                    </Field>
                  </View>
                ) : null}
                {step === 5 ? (
                  <View>
                    <StepHead title="Review your request" sub="Please confirm the details before submitting." />
                    <Row k="Name" v={name} onEdit={() => setStep(1)} /><Row k="Mobile" v={normalized()} onEdit={() => setStep(1)} /><Row k="Category" v={selectedCat?.name} onEdit={() => setStep(2)} /><Row k="Work" v={workName} onEdit={() => setStep(3)} /><Row k="Description" v={description} onEdit={() => setStep(3)} /><Row k="Budget" v={rupee(budgetNum)} onEdit={() => setStep(4)} /><Row k="Pincode" v={`${pincode}${area?.area ? ` · ${area.area}` : ""}`} onEdit={() => setStep(4)} />
                  </View>
                ) : null}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: Math.max(insets.bottom, 12) + 4, borderTopWidth: 1, borderTopColor: SLATE[100], backgroundColor: "#fff" }}>
                {step > 1 ? <Pressable testID="cjr-back" onPress={() => setStep(step - 1)} style={{ height: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], flexDirection: "row", alignItems: "center", gap: 6 }}><ArrowLeft size={16} color={SLATE[600]} /><Text style={{ fontWeight: "600", color: SLATE[600] }}>Back</Text></Pressable> : null}
                {step < 5 ? <Pressable testID="cjr-next" disabled={!canNext} onPress={() => setStep(step + 1)} style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: PRIMARY[700], opacity: canNext ? 1 : 0.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Continue</Text><ArrowRight size={16} color="#fff" /></Pressable>
                  : <Pressable testID="cjr-submit" disabled={busy} onPress={submit} style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: EMERALD[600], opacity: busy ? 0.6 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <ActivityIndicator color="#fff" /> : <><BadgeCheck size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Submit Custom Job Request</Text></>}</Pressable>}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
