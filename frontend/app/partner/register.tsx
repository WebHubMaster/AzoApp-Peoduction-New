import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { User, Briefcase, FileCheck2, MapPin, ClipboardCheck, Crosshair } from "lucide-react-native";
import { api, mediaUrl } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { TW, T, usePal } from "@/src/components/reg/tokens";
import { RegShell } from "@/src/components/reg/Shell";
import {
  Field, WInput, WTextarea, Combo, WSelect, StepTitle, PartnerStepper, PincodeBadge, OutOfArea, InfoBox,
  RejectedBanner, UnderReview, ReviewCard, RegNav, useServiceability, StepDef,
} from "@/src/components/reg/Fields";
import { WDatePicker } from "@/src/components/reg/DatePicker";
import { LivePhotoCapture, Uploader } from "@/src/components/reg/Photo";

const RB = "/partner/registration";
const STEPS: StepDef[] = [
  { key: "basic", label: "Basic", icon: User },
  { key: "work", label: "Work", icon: Briefcase },
  { key: "documents", label: "Documents", icon: FileCheck2 },
  { key: "address", label: "Address", icon: MapPin },
  { key: "review", label: "Review", icon: ClipboardCheck },
];
const TITLES = ["Basic Information", "Work Details", "Documents & KYC", "Address", "Review & Submit"];
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtAadhaar = (s: string) => String(s || "").replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");

export default function PartnerRegistration() {
  const P = usePal();
  const router = useRouter();
  const toast = useToast();
  const { user, logout, refresh } = useAuth();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("incomplete");
  const [rejection, setRejection] = useState("");
  const [score, setScore] = useState<any>({ score: 0, sections: {} });
  const [step, setStep] = useState(0);
  const [meta, setMeta] = useState<any>({ educations: [], experiences: [], categories: [] });

  const [basic, setBasic] = useState<any>({ full_name: "", dob: "", gender: "", email: "", merchant_code: "", education_id: "", education_name: "", live_photo_url: "", state: "", district: "", city: "", village: "", pincode: "" });
  const [work, setWork] = useState<any>({ categories: [] });
  const [docs, setDocs] = useState<any>({ aadhaar_number: "", aadhaar_front_url: "", aadhaar_back_url: "", education_certificate_url: "", aadhaar_ocr: {} });
  const [addr, setAddr] = useState<any>({ manual_address: "", lat: null, lng: null, location_address: "" });

  const [states, setStates] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);
  const [locBusy, setLocBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { checking: pinChecking, cov: pinCov } = useServiceability(basic.pincode, (u) => api.get(u));

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([api.get<any>(`${RB}/profile`), api.get<any>(`${RB}/meta`)]);
      setMeta(m);
      setStatus(p.kyc_status);
      setRejection(p.rejection_reason || "");
      setScore(p.score);
      const pr = p.profile;
      setBasic({ ...pr.basic });
      setWork({ categories: pr.work.categories || [] });
      setDocs({ ...pr.documents, aadhaar_ocr: pr.documents.aadhaar_ocr || {} });
      setAddr({ ...pr.address });
    } catch { toast.error("Failed to load profile"); }
    setLoading(false);
  }, []);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  useEffect(() => { api.get<any[]>("/geo/states").then(setStates).catch(() => {}); }, []);
  useEffect(() => {
    if (basic.state) api.get<any[]>(`/geo/districts?state=${encodeURIComponent(basic.state)}`).then(setDistricts).catch(() => {});
    else setDistricts([]);
  }, [basic.state]);
  useEffect(() => {
    if (basic.state && basic.district) api.get<any[]>(`/geo/cities?state=${encodeURIComponent(basic.state)}&district=${encodeURIComponent(basic.district)}`).then(setCities).catch(() => {});
    else setCities([]);
  }, [basic.state, basic.district]);
  useEffect(() => {
    if (basic.state && basic.district && basic.city) api.get<any[]>(`/geo/villages?state=${encodeURIComponent(basic.state)}&district=${encodeURIComponent(basic.district)}&city=${encodeURIComponent(basic.city)}`).then((r) => setVillages((r || []).map((v: any) => ({ id: v, name: v })))).catch(() => {});
    else setVillages([]);
  }, [basic.state, basic.district, basic.city]);

  useEffect(() => { if (!loading && status === "approved") { refresh?.(); router.replace("/(partner)"); } }, [loading, status]);

  const editable = status === "incomplete" || status === "rejected";
  const phoneDisplay = user?.phone || "";
  const blocked = !!(pinCov && pinCov.serviceable === false);

  const saveSection = async (section: string, payload: any) => {
    setSaving(true);
    try { const data = await api.put<any>(`${RB}/${section}`, payload); setScore(data.score); return true; }
    catch (e: any) { toast.error(e?.detail || "Save failed"); return false; }
    finally { setSaving(false); }
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      for (const f of ["full_name", "dob", "gender", "education_id", "state", "district", "city", "pincode"])
        if (!String(basic[f] || "").trim()) return "Please fill all required fields";
      if (!String(basic.email || "").trim()) return "Email is required";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(basic.email).trim())) return "Enter a valid email address";
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
    if (step === 3 && !String(addr.manual_address || "").trim()) return "Enter your address";
    return null;
  };

  const next = async () => {
    const err = validateStep();
    if (err) return toast.error(err);
    const map = ["basic", "work", "documents", "address"];
    if (step < 4) {
      const ok = await saveSection(map[step], step === 0 ? basic : step === 1 ? work : step === 2 ? docs : addr);
      if (!ok) return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`${RB}/submit`);
      toast.success("Application submitted!");
      await loadProfile();
      refresh?.();
    } catch (e: any) { toast.error(e?.detail || "Submit failed"); }
    finally { setSaving(false); }
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    const u = await refresh?.();
    await loadProfile();
    setRefreshing(false);
    if (u?.kyc_status === "approved") router.replace("/(partner)");
  };

  const toggleCat = (cat: any) => setWork((w: any) => (w.categories.find((c: any) => c.category_id === cat.id)
    ? { categories: [] }
    : { categories: [{ category_id: cat.id, category_name: cat.name, experience_id: "", experience_label: "" }] }));
  const setCatExp = (catId: string, exp: any) => setWork((w: any) => ({ categories: w.categories.map((c: any) => c.category_id === catId ? { ...c, experience_id: exp.id, experience_label: exp.label } : c) }));

  const chooseLocation = async () => {
    setLocBusy(true);
    try {
      let lp = await Location.getForegroundPermissionsAsync();
      if (!lp.granted) lp = await Location.requestForegroundPermissionsAsync();
      if (!lp.granted) { toast.error("Location permission denied"); setLocBusy(false); return; }
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = coords.latitude, lng = coords.longitude;
      try {
        const data = await api.get<any>(`/geo/reverse?lat=${lat}&lng=${lng}`);
        setAddr((a: any) => ({ ...a, lat, lng, location_address: data.display || "", manual_address: data.display || a.manual_address || "" }));
        if (data.pincode) setBasic((b: any) => ({ ...b, pincode: data.pincode }));
        toast.success("Location captured — address updated");
      } catch { toast.error("Could not fetch address"); }
    } catch { toast.error("Could not fetch address"); }
    setLocBusy(false);
  };

  const doLogout = async () => { await logout(); router.replace("/(auth)/welcome"); };

  if (loading) return <View style={{ flex: 1, backgroundColor: TW.slate50, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color={P[600]} /></View>;

  if (status === "under_review") {
    return <RegShell kind="partner" onLogout={doLogout} testID="partner-registration"><UnderReview onRefresh={refreshStatus} refreshing={refreshing} /></RegShell>;
  }

  const catCard = (c: any) => {
    const sel = work.categories.find((x: any) => x.category_id === c.id);
    return (
      <Pressable key={c.id} testID={`reg-cat-${c.id}`} onPress={() => toggleCat(c)}
        style={{ width: "48%", borderRadius: 12, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8, borderColor: sel ? P[600] : TW.slate200, backgroundColor: sel ? P[50] : "#fff" }}>
        <View style={{ height: 16, width: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: sel ? P[600] : "transparent", borderWidth: sel ? 0 : 2, borderColor: TW.slate300 }}>
          {sel ? <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: "#fff" }} /> : null}
        </View>
        <Text style={{ flex: 1, ...T.sm, fontWeight: "500", color: sel ? P[700] : TW.slate600 }}>{c.name}</Text>
      </Pressable>
    );
  };

  return (
    <RegShell kind="partner" score={score?.score} scoreTitle="Complete your profile" onLogout={doLogout} testID="partner-registration"
      nav={<RegNav step={step} total={5} onBack={() => setStep((s) => Math.max(0, s - 1))} saving={saving} onNext={next} nextDisabled={step === 0 && blocked} onSubmit={submit} />}>
      {status === "rejected" ? <RejectedBanner reason={rejection} /> : null}
      <PartnerStepper steps={STEPS} step={step} onStep={setStep} />
      <StepTitle Icon={STEPS[step].icon} title={TITLES[step]} />

      {step === 0 ? (
        <View style={{ gap: 16 }} testID="step-basic">
          <LivePhotoCapture value={basic.live_photo_url} editable={editable} base={RB} onCaptured={(url) => setBasic((b: any) => ({ ...b, live_photo_url: url }))} />
          <Field label="Full Name (as per Aadhaar)" required>
            <WInput testID="reg-name" value={basic.full_name} onChangeText={(v) => setBasic({ ...basic, full_name: v })} placeholder="Enter full name" />
          </Field>
          <Field label="Date of Birth" required>
            <WDatePicker testID="reg-dob" value={basic.dob || ""} onChange={(v) => setBasic({ ...basic, dob: v })} placeholder="Select date of birth" min="1940-01-01" max={todayISO()} />
          </Field>
          <Field label="Gender" required>
            <WSelect testID="reg-gender" value={basic.gender || ""} onChange={(v) => setBasic({ ...basic, gender: v })} placeholder="Select gender"
              options={[{ value: "", label: "Select gender" }, { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]} />
          </Field>
          <Field label="Mobile Number" hint="Used for login — cannot be changed">
            <WInput testID="reg-mobile" value={phoneDisplay || basic.mobile} disabled />
          </Field>
          <Field label="Merchant Code (optional)" hint="If a shopkeeper referred you, enter their code">
            <WInput testID="reg-merchant-code" value={basic.merchant_code || ""} maxLength={7} uppercase placeholder="7-CHAR CODE"
              onChangeText={(v) => setBasic({ ...basic, merchant_code: v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) })} />
          </Field>
          <Field label="Email ID" required>
            <WInput testID="reg-email" keyboardType="email-address" autoCapitalize="none" value={basic.email} onChangeText={(v) => setBasic({ ...basic, email: v })} placeholder="you@example.com" />
          </Field>
          <Field label="Education" required>
            <Combo testID="reg-education" placeholder="Search & select education" options={meta.educations} value={basic.education_id} display={basic.education_name}
              onSelect={(o) => setBasic({ ...basic, education_id: o.id, education_name: o.name })} />
          </Field>
          <Field label="State" required>
            <Combo testID="reg-state" placeholder="Search state" options={states} value={basic.state} display={basic.state}
              onSelect={(o) => setBasic({ ...basic, state: o.name, district: "", city: "", village: "" })} />
          </Field>
          <Field label="District" required>
            <Combo testID="reg-district" placeholder="Search district" options={districts} value={basic.district} display={basic.district} disabled={!basic.state}
              onSelect={(o) => setBasic({ ...basic, district: o.name, city: "", village: "" })} />
          </Field>
          <Field label="City / Sub-district" required>
            <Combo testID="reg-city" placeholder="Search city" options={cities} value={basic.city} display={basic.city} disabled={!basic.district}
              onSelect={(o) => setBasic({ ...basic, city: o.name, village: "" })} />
          </Field>
          <Field label="Village (optional)">
            <Combo testID="reg-village" placeholder="Search village" options={villages} value={basic.village} display={basic.village} disabled={!basic.city}
              onSelect={(o) => setBasic({ ...basic, village: o.name })} />
          </Field>
          <Field label="Pincode" required hint="Auto-fills when you use Choose Current Location; you may also type it">
            <WInput testID="reg-pincode" value={basic.pincode} maxLength={6} keyboardType="number-pad" placeholder="6-digit pincode"
              onChangeText={(v) => setBasic({ ...basic, pincode: v.replace(/\D/g, "").slice(0, 6) })} />
          </Field>
          {String(basic.pincode || "").length === 6 ? <View style={{ marginTop: -4 }}><PincodeBadge pincode={basic.pincode} checking={pinChecking} cov={pinCov} /></View> : null}
          {blocked ? <OutOfArea pincode={basic.pincode} subject="registration" /> : null}
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: 20 }} testID="step-work">
          <Field label="Service Category" hint="Choose your main service — only one can be selected" required>
            <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 10, justifyContent: "space-between" }}>
              {(meta.categories || []).map(catCard)}
            </View>
          </Field>
          {work.categories.length > 0 ? (
            <View>
              <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate700, marginBottom: 8 }}>Experience in this service <Text style={{ color: TW.red500 }}>*</Text></Text>
              <View style={{ gap: 10 }}>
                {work.categories.map((c: any) => (
                  <View key={c.category_id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: TW.slate50, borderRadius: 12, padding: 12 }}>
                    <Text numberOfLines={1} style={{ flex: 1, ...T.sm, fontWeight: "500", color: TW.slate700 }}>{c.category_name}</Text>
                    <View style={{ width: 176 }}>
                      <Combo testID={`reg-exp-${c.category_id}`} placeholder="Experience" options={meta.experiences} labelKey="label" value={c.experience_id} display={c.experience_label} onSelect={(o) => setCatExp(c.category_id, o)} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: 16 }} testID="step-documents">
          <Field label="Aadhaar Card Number" required hint="Please enter valid details.">
            <WInput testID="reg-aadhaar" value={docs.aadhaar_number} maxLength={12} keyboardType="number-pad" tracking placeholder="12-digit Aadhaar number"
              onChangeText={(v) => setDocs({ ...docs, aadhaar_number: v.replace(/\D/g, "").slice(0, 12), aadhaar_ocr: {} })} />
          </Field>
          <Uploader label="Aadhaar Front Image" docType="aadhaar_front" required base={RB} value={docs.aadhaar_front_url} aadhaar={docs.aadhaar_number} ocr={docs.aadhaar_ocr}
            onUploaded={(d) => setDocs((p: any) => ({ ...p, aadhaar_front_url: d.url, aadhaar_ocr: d.ocr || p.aadhaar_ocr }))} />
          <Uploader label="Aadhaar Back Image" docType="aadhaar_back" required base={RB} value={docs.aadhaar_back_url} aadhaar={docs.aadhaar_number}
            onUploaded={(d) => setDocs((p: any) => ({ ...p, aadhaar_back_url: d.url, aadhaar_ocr: d.ocr || p.aadhaar_ocr }))} />
          {basic.education_id ? (
            <Uploader label={`Education Certificate (${basic.education_name})`} docType="education_certificate" required base={RB} value={docs.education_certificate_url}
              onUploaded={(d) => setDocs((p: any) => ({ ...p, education_certificate_url: d.url }))} />
          ) : null}
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 16 }} testID="step-address">
          <Field label="Full Address" required>
            <WTextarea testID="reg-address" value={addr.manual_address} rows={3} onChangeText={(v) => setAddr({ ...addr, manual_address: v })} placeholder="House / Street / Area / Landmark" />
          </Field>
          <Pressable testID="reg-choose-location" disabled={locBusy} onPress={chooseLocation}
            style={({ pressed }) => ({ width: "100%", height: 48, borderRadius: 12, borderWidth: 1, borderColor: P[200], backgroundColor: pressed ? P[50] : "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 })}>
            {locBusy ? <ActivityIndicator size="small" color={P[700]} /> : <Crosshair size={16} color={P[700]} />}
            <Text style={{ ...T.sm, fontWeight: "600", color: P[700] }}>Choose Current Location</Text>
          </Pressable>
          {addr.lat ? (
            <View testID="reg-location-captured" style={{ borderRadius: 12, backgroundColor: TW.emerald50, borderWidth: 1, borderColor: TW.emerald200, padding: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MapPin size={16} color={TW.emerald700} /><Text style={{ ...T.sm, fontWeight: "500", color: TW.emerald700 }}>Location captured</Text></View>
              <Text style={{ ...T.xs, color: TW.emerald600, marginTop: 4 }}>{addr.location_address}</Text>
              <Text style={{ ...T.px11, color: TW.emerald500, marginTop: 2 }}>Lat {Number(addr.lat).toFixed(5)}, Lng {Number(addr.lng).toFixed(5)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: 16 }} testID="step-review">
          {basic.live_photo_url ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: TW.slate200, padding: 16 }}>
              <Image source={{ uri: mediaUrl(basic.live_photo_url) }} style={{ height: 64, width: 64, borderRadius: 16, borderWidth: 2, borderColor: TW.emerald200 }} contentFit="cover" />
              <View>
                <Text style={{ ...T.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: TW.slate400 }}>Live Photo</Text>
                <Text style={{ ...T.sm, fontWeight: "600", color: TW.emerald700, marginTop: 2 }}>Captured ✓</Text>
              </View>
            </View>
          ) : null}
          <ReviewCard title="Basic Information" onEdit={() => setStep(0)} rows={[
            ["Full Name", basic.full_name], ["Date of Birth", basic.dob], ["Mobile", phoneDisplay],
            ["Email", basic.email || "—"], ["Education", basic.education_name],
            ["Location", `${basic.city}, ${basic.district}, ${basic.state} - ${basic.pincode}`],
            ["Village", basic.village || "—"],
          ]} />
          <ReviewCard title="Work Details" onEdit={() => setStep(1)} rows={work.categories.map((c: any) => [c.category_name, c.experience_label])} />
          <ReviewCard title="Documents & KYC" onEdit={() => setStep(2)} rows={[
            ["Aadhaar Number", fmtAadhaar(docs.aadhaar_number)],
            ["OCR Verified", docs.aadhaar_ocr?.matched ? "Yes ✓" : "Not verified"],
            ["Aadhaar Front", docs.aadhaar_front_url ? "Uploaded ✓" : "—"],
            ["Aadhaar Back", docs.aadhaar_back_url ? "Uploaded ✓" : "—"],
            ...(basic.education_id ? [["Education Certificate", docs.education_certificate_url ? "Uploaded ✓" : "—"] as [string, any]] : []),
          ]} />
          <ReviewCard title="Address" onEdit={() => setStep(3)} rows={[
            ["Address", addr.manual_address],
            ["GPS", addr.lat ? `${Number(addr.lat).toFixed(4)}, ${Number(addr.lng).toFixed(4)}` : "—"],
          ]} />
          <InfoBox text="After submission your profile & KYC will be sent to admin for review. You’ll get an update within 24–48 hours." />
        </View>
      ) : null}
    </RegShell>
  );
}
