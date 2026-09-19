import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Card, Button, CardSkeleton } from "@/src/components/ui";
import { Icon, MdiName } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import {
  ScoreBanner, Stepper, StatusBanner, UnderReviewCard, Field, PickRow, Rev,
  PickerSheet, PickerCfg, PhotoField, useServiceability, PincodeBadge, detectLocation,
} from "@/src/components/RegKit";

const RB = "/partner/registration";
const STEPS: { key: string; label: string; icon: MdiName }[] = [
  { key: "basic", label: "Basic", icon: "account" },
  { key: "work", label: "Work", icon: "briefcase" },
  { key: "documents", label: "Documents", icon: "file-check" },
  { key: "address", label: "Address", icon: "map-marker" },
  { key: "review", label: "Review", icon: "clipboard-check" },
];
const TITLES = ["Basic Information", "Work Details", "Documents & KYC", "Address", "Review & Submit"];

export default function PartnerRegister() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("incomplete");
  const [rejection, setRejection] = useState("");
  const [score, setScore] = useState(0);
  const [meta, setMeta] = useState<any>({ educations: [], experiences: [], categories: [] });

  const [basic, setBasic] = useState<any>({ full_name: "", dob: "", gender: "", email: "", merchant_code: "", education_id: "", education_name: "", state: "", district: "", city: "", village: "", pincode: "", live_photo_url: "" });
  const [work, setWork] = useState<any>({ categories: [] });
  const [docs, setDocs] = useState<any>({ aadhaar_number: "", aadhaar_front_url: "", aadhaar_back_url: "", education_certificate_url: "", aadhaar_ocr: {} });
  const [addr, setAddr] = useState<any>({ manual_address: "", lat: null, lng: null, location_address: "" });

  const [states, setStates] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [villages, setVillages] = useState<string[]>([]);
  const [picker, setPicker] = useState<PickerCfg | null>(null);
  const [locBusy, setLocBusy] = useState(false);

  const { checking: pinChecking, cov: pinCov } = useServiceability(basic.pincode);
  const blocked = !!(pinCov && pinCov.serviceable === false);

  const load = async () => {
    try {
      const [p, m] = await Promise.all([api.get<any>(`${RB}/profile`), api.get<any>(`${RB}/meta`)]);
      setMeta(m || {});
      setStatus(p?.kyc_status || p?.profile?.status || "incomplete");
      setRejection(p?.rejection_reason || "");
      setScore(p?.score?.score || 0);
      const pr = p?.profile || {};
      if (pr.basic) setBasic((b: any) => ({ ...b, ...pr.basic }));
      if (pr.work?.categories?.length) setWork({ categories: pr.work.categories });
      if (pr.documents) setDocs((d: any) => ({ ...d, ...pr.documents, aadhaar_ocr: pr.documents.aadhaar_ocr || {} }));
      if (pr.address) setAddr((a: any) => ({ ...a, ...pr.address }));
    } catch { /* noop */ }
    try { setStates(await api.get<{ id: string; name: string }[]>(`/geo/states`)); } catch { /* noop */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (basic.state) api.get<{ id: string; name: string }[]>(`/geo/districts?state=${encodeURIComponent(basic.state)}`).then(setDistricts).catch(() => {}); }, [basic.state]);
  useEffect(() => { if (basic.state && basic.district) api.get<{ id: string; name: string }[]>(`/geo/cities?state=${encodeURIComponent(basic.state)}&district=${encodeURIComponent(basic.district)}`).then(setCities).catch(() => {}); }, [basic.state, basic.district]);
  useEffect(() => { if (basic.state && basic.district && basic.city) api.get<string[]>(`/geo/villages?state=${encodeURIComponent(basic.state)}&district=${encodeURIComponent(basic.district)}&city=${encodeURIComponent(basic.city)}`).then(setVillages).catch(() => {}); }, [basic.state, basic.district, basic.city]);

  const saveSection = async (section: string, payload: any) => {
    try { const r = await api.put<any>(`${RB}/${section}`, payload); if (r?.score?.score != null) setScore(r.score.score); return true; }
    catch (e: any) { toast.error(e?.detail || "Could not save"); return false; }
  };

  const validate = (): string | null => {
    if (step === 0) {
      const req = ["full_name", "dob", "gender", "education_id", "state", "district", "city", "pincode"];
      for (const f of req) if (!String(basic[f] || "").trim()) return "Please fill all required fields";
      const em = String(basic.email || "").trim();
      if (!em) return "Email is required";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return "Enter a valid email address";
      if (!String(basic.live_photo_url || "").trim()) return "Please capture your live photo";
      if (blocked) return "We don't serve this pincode yet — registration can't be submitted for this area.";
    }
    if (step === 1) {
      if (!work.categories.length) return "Please select your service category";
      if (work.categories.some((c: any) => !c.experience_id)) return "Select your experience for the service";
    }
    if (step === 2) {
      if (!/^\d{12}$/.test(docs.aadhaar_number)) return "Enter a valid 12-digit Aadhaar number";
      if (!docs.aadhaar_front_url || !docs.aadhaar_back_url) return "Upload Aadhaar front & back";
      if (basic.education_id && !docs.education_certificate_url) return "Upload your education certificate";
      if (docs.aadhaar_ocr?.ocr_ran && !docs.aadhaar_ocr?.matched) return "Please enter a valid Aadhaar number or upload the correct ID.";
    }
    if (step === 3 && !addr.manual_address?.trim()) return "Enter your address";
    return null;
  };

  const next = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    const map = ["basic", "work", "documents", "address"];
    let ok = true;
    if (step < 4) ok = await saveSection(map[step], step === 0 ? basic : step === 1 ? work : step === 2 ? docs : addr);
    setBusy(false);
    if (ok && step < 4) setStep(step + 1);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.put(`${RB}/basic`, basic); await api.put(`${RB}/work`, work);
      await api.put(`${RB}/documents`, docs); await api.put(`${RB}/address`, addr);
      await api.post(`${RB}/submit`);
      toast.success("Application submitted for review 🎉");
      setStatus("under_review");
      refresh?.();
    } catch (e: any) { toast.error(e?.detail || "Could not submit"); }
    setBusy(false);
  };

  const onRefreshStatus = async () => {
    setRefreshing(true);
    try {
      const p = await api.get<any>(`${RB}/profile`);
      const st = p?.kyc_status || p?.profile?.status;
      setStatus(st);
      if (st === "approved") { await refresh?.(); router.replace("/(partner)"); return; }
    } catch { /* noop */ }
    setRefreshing(false);
  };

  const useLocation = async () => {
    setLocBusy(true);
    try {
      const r = await detectLocation();
      if (!r) { toast.error("Location permission needed. Enable it in Settings."); setLocBusy(false); return; }
      setAddr((a: any) => ({ ...a, lat: r.lat, lng: r.lng, location_address: r.geo.display || "", manual_address: a.manual_address || r.geo.display || "" }));
      if (r.geo.pincode) setBasic((b: any) => ({ ...b, pincode: r.geo.pincode }));
      toast.success("Location captured — address updated");
    } catch { toast.error("Could not fetch location"); }
    setLocBusy(false);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><AppHeader title="Partner Registration" variant="gradient" /><View style={{ padding: spacing.lg }}><CardSkeleton /></View></View>;

  if (status === "under_review" || status === "approved") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppHeader title="Partner Registration" variant="gradient" testID="partner-register-header" />
        <UnderReviewCard onRefresh={onRefreshStatus} refreshing={refreshing} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Partner Registration" subtitle={`Step ${step + 1} of 5 · ${STEPS[step].label}`} variant="gradient" testID="partner-register-header" />
      <Stepper steps={STEPS} step={step} onStep={setStep} />

      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100, gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScoreBanner score={score} title="Complete your profile" subtitle="A complete profile builds trust and speeds up approval." />
        {status === "rejected" ? <StatusBanner status="rejected" reason={rejection} /> : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={STEPS[step].icon} size={18} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{TITLES[step]}</Text>
        </View>

        {step === 0 ? (
          <Card>
            <PhotoField base={RB} docType="live_photo" label="Live / profile photo" mode="both" cameraType="front" dashed hint="Take a clear selfie (or pick from gallery)" value={basic.live_photo_url} onUploaded={(d) => setBasic((b: any) => ({ ...b, live_photo_url: d.url }))} />
            <View style={{ height: spacing.sm }} />
            <Field label="Full name (as per Aadhaar)" value={basic.full_name} onChange={(v: string) => setBasic({ ...basic, full_name: v })} />
            <Field label="Date of birth (YYYY-MM-DD)" value={basic.dob} onChange={(v: string) => setBasic({ ...basic, dob: v })} keyboard="numbers-and-punctuation" placeholder="1995-08-21" />
            <PickRow label="Gender" value={basic.gender ? basic.gender[0].toUpperCase() + basic.gender.slice(1) : ""} onPress={() => setPicker({ title: "Gender", options: [{ id: "male", name: "Male" }, { id: "female", name: "Female" }, { id: "other", name: "Other" }], onSel: (o) => setBasic({ ...basic, gender: o.id }) })} />
            <Field label="Email" value={basic.email} onChange={(v: string) => setBasic({ ...basic, email: v })} keyboard="email-address" autoCap="none" placeholder="you@example.com" />
            <Field label="Merchant code (optional)" value={basic.merchant_code} onChange={(v: string) => setBasic({ ...basic, merchant_code: v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) })} autoCap="characters" hint="If a shopkeeper referred you, enter their code" maxLength={7} />
            <PickRow label="Education" value={basic.education_name} onPress={() => setPicker({ title: "Education", search: true, options: meta.educations || [], onSel: (o) => setBasic({ ...basic, education_id: o.id, education_name: o.name }) })} />
            <PickRow label="State" value={basic.state} onPress={() => setPicker({ title: "State", search: true, options: states, optionsKey: "states", onSel: (o) => setBasic({ ...basic, state: o.name, district: "", city: "", village: "" }) } as any)} />
            <PickRow label="District" value={basic.district} onPress={() => basic.state ? setPicker({ title: "District", search: true, options: districts, optionsKey: "districts", onSel: (o) => setBasic({ ...basic, district: o.name, city: "", village: "" }) } as any) : toast.info("Select state first")} />
            <PickRow label="City / Sub-district" value={basic.city} onPress={() => basic.district ? setPicker({ title: "City", search: true, options: cities, optionsKey: "cities", onSel: (o) => setBasic({ ...basic, city: o.name, village: "" }) } as any) : toast.info("Select district first")} />
            <PickRow label="Village (optional)" value={basic.village} onPress={() => basic.city ? setPicker({ title: "Village", search: true, options: villages.map((s) => ({ id: s, name: s })), optionsKey: "villages", onSel: (o) => setBasic({ ...basic, village: o.name }) } as any) : toast.info("Select city first")} />
            <Field label="Pincode" value={basic.pincode} onChange={(v: string) => setBasic({ ...basic, pincode: v.replace(/[^0-9]/g, "").slice(0, 6) })} keyboard="number-pad" maxLength={6} last />
            <View style={{ marginTop: 10 }}><PincodeBadge pincode={basic.pincode} checking={pinChecking} cov={pinCov} /></View>
            {blocked ? (
              <View testID="reg-out-of-area" style={{ marginTop: 10, backgroundColor: colors.warningSubtle, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, padding: 12 }}>
                <Text style={{ color: colors.warning, fontWeight: "800", fontSize: fontSize.sm }}>We&apos;re not in this area yet</Text>
                <Text style={{ color: colors.warning, fontSize: fontSize.xs, marginTop: 3 }}>Pincode {basic.pincode} is outside our current service areas, so registration can&apos;t be submitted for it.</Text>
              </View>
            ) : null}
          </Card>
        ) : step === 1 ? (
          <Card>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md, marginBottom: 4 }}>Service category</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginBottom: 10 }}>Choose your main service — only one can be selected</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(meta.categories || []).map((c: any) => {
                const sel = work.categories.find((x: any) => x.category_id === c.id);
                return (
                  <Pressable key={c.id} testID={`cat-${c.id}`} onPress={() => setWork({ categories: sel ? [] : [{ category_id: c.id, category_name: c.name, experience_id: "", experience_label: "" }] })}
                    style={{ paddingHorizontal: 14, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: sel ? colors.primarySubtle : colors.surfaceSubtle, borderWidth: 1.5, borderColor: sel ? colors.primary : colors.border }}>
                    <Icon name={sel ? "radiobox-marked" : "radiobox-blank"} size={15} color={sel ? colors.primary : colors.textMuted} />
                    <Text style={{ color: sel ? colors.primary : colors.textSecondary, fontWeight: "700", fontSize: fontSize.sm }}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            {work.categories.length > 0 ? (
              <View style={{ marginTop: spacing.md, gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }}>Experience in this service</Text>
                {work.categories.map((c: any) => (
                  <PickRow key={c.category_id} label={c.category_name} value={c.experience_label} last onPress={() => setPicker({ title: "Experience", options: (meta.experiences || []).map((e: any) => ({ id: e.id, name: e.label || e.name })), onSel: (o) => setWork({ categories: work.categories.map((x: any) => x.category_id === c.category_id ? { ...x, experience_id: o.id, experience_label: o.name } : x) }) })} />
                ))}
              </View>
            ) : null}
          </Card>
        ) : step === 2 ? (
          <Card>
            <Field label="Aadhaar number" value={docs.aadhaar_number} onChange={(v: string) => setDocs({ ...docs, aadhaar_number: v.replace(/[^0-9]/g, "").slice(0, 12), aadhaar_ocr: {} })} keyboard="number-pad" maxLength={12} />
            <PhotoField base={RB} docType="aadhaar_front" label="Aadhaar front" value={docs.aadhaar_front_url} extra={{ aadhaar_number: docs.aadhaar_number }} onUploaded={(d) => setDocs((p: any) => ({ ...p, aadhaar_front_url: d.url, aadhaar_ocr: d.ocr || p.aadhaar_ocr }))} />
            <PhotoField base={RB} docType="aadhaar_back" label="Aadhaar back" value={docs.aadhaar_back_url} extra={{ aadhaar_number: docs.aadhaar_number }} onUploaded={(d) => setDocs((p: any) => ({ ...p, aadhaar_back_url: d.url, aadhaar_ocr: d.ocr || p.aadhaar_ocr }))} />
            {docs.aadhaar_ocr?.matched ? (
              <Text style={{ color: colors.success, fontSize: fontSize.xs, marginTop: 6, fontWeight: "700" }}>✓ Aadhaar number verified via OCR</Text>
            ) : docs.aadhaar_ocr?.ocr_ran ? (
              <Text style={{ color: colors.danger, fontSize: fontSize.xs, marginTop: 6, fontWeight: "700" }}>Please enter a valid Aadhaar number or upload the correct ID.</Text>
            ) : null}
            {basic.education_id ? (
              <PhotoField base={RB} docType="education_certificate" label={`Education certificate (${basic.education_name})`} value={docs.education_certificate_url} onUploaded={(d) => setDocs((p: any) => ({ ...p, education_certificate_url: d.url }))} last />
            ) : null}
          </Card>
        ) : step === 3 ? (
          <Card>
            <Button title="Use current location" variant="outline" icon="crosshairs-gps" onPress={useLocation} loading={locBusy} testID="reg-choose-location" />
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.md, marginBottom: 8 }}>Full address where you can be reached.</Text>
            <TextInput testID="addr-input" value={addr.manual_address} onChangeText={(v) => setAddr({ ...addr, manual_address: v })} placeholder="House / street / area, landmark, city, pincode" placeholderTextColor={colors.textMuted} multiline style={{ minHeight: 100, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: 12, color: colors.text, fontSize: fontSize.md, textAlignVertical: "top" }} />
            {addr.lat ? (
              <View testID="reg-location-captured" style={{ marginTop: 10, backgroundColor: colors.successSubtle, borderWidth: 1, borderColor: colors.success, borderRadius: radius.md, padding: 12 }}>
                <Text style={{ color: colors.success, fontWeight: "700", fontSize: fontSize.sm }}>📍 Location captured</Text>
                {addr.location_address ? <Text style={{ color: colors.success, fontSize: fontSize.xs, marginTop: 3 }}>{addr.location_address}</Text> : null}
                <Text style={{ color: colors.success, fontSize: fontSize.xs, marginTop: 3, opacity: 0.85 }}>Lat {Number(addr.lat).toFixed(5)}, Lng {Number(addr.lng).toFixed(5)}</Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card>
            {basic.live_photo_url ? (
              <View style={{ alignItems: "center", marginBottom: spacing.md }}>
                <View style={{ width: 84, height: 84, borderRadius: 20, overflow: "hidden", borderWidth: 2, borderColor: colors.success }}>
                  <Image source={{ uri: mediaUrl(basic.live_photo_url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </View>
                <Text style={{ color: colors.success, fontWeight: "700", fontSize: fontSize.sm, marginTop: 6 }}>Live photo captured ✓</Text>
              </View>
            ) : null}
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.lg, marginBottom: 8 }}>Review & submit</Text>
            <Rev k="Name" v={basic.full_name} />
            <Rev k="Date of birth" v={basic.dob} />
            <Rev k="Gender" v={basic.gender} />
            <Rev k="Email" v={basic.email} />
            <Rev k="Education" v={basic.education_name} />
            <Rev k="Location" v={[basic.city, basic.district, basic.state].filter(Boolean).join(", ")} />
            <Rev k="Pincode" v={basic.pincode} />
            <Rev k="Categories" v={work.categories.map((c: any) => `${c.category_name} (${c.experience_label})`).join(", ")} />
            <Rev k="Aadhaar" v={docs.aadhaar_number ? `••••${docs.aadhaar_number.slice(-4)}` : "—"} />
            <Rev k="Address" v={addr.manual_address} last />
            <View style={{ marginTop: 12, backgroundColor: colors.primarySubtle, borderRadius: radius.md, padding: 12, flexDirection: "row", gap: 8 }}>
              <Icon name="shield-check" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.xs, flex: 1 }}>After submission your profile & KYC will be sent to admin for review. You&apos;ll get an update within 24–48 hours.</Text>
            </View>
          </Card>
        )}
      </KeyboardAwareScrollView>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: spacing.md, padding: spacing.lg, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button title="Back" variant="outline" onPress={() => setStep(step - 1)} testID="reg-back" /></View> : null}
        <View style={{ flex: 1.4 }}>
          {step < 4 ? <Button title="Save & Continue" onPress={next} loading={busy} disabled={step === 0 && blocked} testID="reg-next" /> : <Button title={status === "rejected" ? "Re-submit" : "Submit Application"} icon="check" onPress={submit} loading={busy} testID="reg-submit" />}
        </View>
      </View>

      <PickerSheet cfg={picker ? { ...picker, options: (picker as any).optionsKey ? (({ states, districts, cities, villages: villages.map((s) => ({ id: s, name: s })) } as any)[(picker as any).optionsKey]) : picker.options } : null} onClose={() => setPicker(null)} />
    </View>
  );
}
