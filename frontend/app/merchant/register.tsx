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

const RB = "/merchant/registration";
const STEPS: { key: string; label: string; icon: MdiName }[] = [
  { key: "basic", label: "Owner", icon: "account" },
  { key: "shop", label: "Shop", icon: "storefront" },
  { key: "address", label: "Address", icon: "map-marker" },
  { key: "review", label: "Review", icon: "clipboard-check" },
];
const TITLES = ["Owner Details", "Shop Details", "Shop Address", "Review & Submit"];

export default function MerchantRegister() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [status, setStatus] = useState("incomplete");
  const [rejection, setRejection] = useState("");
  const [score, setScore] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [meta, setMeta] = useState<any>({ categories: [], shop_types: [] });

  const [basic, setBasic] = useState<any>({ full_name: "", dob: "", gender: "", email: "", mobile: user?.phone || "", owner_photo: "" });
  const [shop, setShop] = useState<any>({ shop_name: "", shop_type_id: "", shop_type_name: "", categories: [], gst_number: "", gst_url: "", shop_verification_photo: "", shop_photo_lat: null, shop_photo_lng: null, shop_photo_verified: false });
  const [addr, setAddr] = useState<any>({ manual_address: "", city: "", district: "", state: "", pincode: "", lat: null, lng: null, location_address: "" });
  const [picker, setPicker] = useState<PickerCfg | null>(null);

  const [states, setStates] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { api.get<{ id: string; name: string }[]>(`/geo/states`).then(setStates).catch(() => {}); }, []);
  useEffect(() => { if (addr.state) api.get<{ id: string; name: string }[]>(`/geo/districts?state=${encodeURIComponent(addr.state)}`).then(setDistricts).catch(() => {}); }, [addr.state]);
  useEffect(() => { if (addr.state && addr.district) api.get<{ id: string; name: string }[]>(`/geo/cities?state=${encodeURIComponent(addr.state)}&district=${encodeURIComponent(addr.district)}`).then(setCities).catch(() => {}); }, [addr.state, addr.district]);

  const { checking: pinChecking, cov: pinCov } = useServiceability(addr.pincode);
  const blocked = !!(pinCov && pinCov.serviceable === false);

  const applyScore = (r: any) => { if (r?.score) { setScore(r.score.score ?? 0); setMissing(r.score.missing || []); } };

  const load = async () => {
    try {
      const [p, m] = await Promise.all([api.get<any>(`${RB}/profile`), api.get<any>(`${RB}/meta`)]);
      setMeta(m || {});
      setStatus(p?.kyc_status || p?.profile?.status || "incomplete");
      setRejection(p?.rejection_reason || "");
      applyScore(p);
      const pr = p?.profile || {};
      if (pr.basic) setBasic((b: any) => ({ ...b, ...pr.basic, mobile: user?.phone || pr.basic.mobile }));
      if (pr.shop) setShop((s: any) => ({ ...s, ...pr.shop }));
      if (pr.address) setAddr((a: any) => ({ ...a, ...pr.address }));
    } catch { /* noop */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveSection = async (section: string, payload: any) => {
    try { const r = await api.put<any>(`${RB}/${section}`, payload); applyScore(r); return true; }
    catch (e: any) { toast.error(e?.detail || "Could not save"); return false; }
  };

  const validate = (): string | null => {
    if (step === 0) {
      if (!basic.full_name?.trim()) return "Enter owner full name";
      if (!basic.dob?.trim()) return "Enter date of birth";
      if (!basic.gender) return "Select gender";
      const em = String(basic.email || "").trim();
      if (!em) return "Email is required";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return "Enter a valid email address";
      if (!basic.owner_photo) return "Please capture the owner live photo";
    }
    if (step === 1) {
      if (!shop.shop_name?.trim()) return "Enter shop name";
      if (!shop.shop_type_id) return "Select shop type";
      if (!shop.categories.length) return "Select a category served";
      if (!shop.shop_verification_photo) return "Capture the shop verification photo";
      if (shop.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/.test(shop.gst_number)) return "Enter a valid GST number or leave it blank";
    }
    if (step === 2) {
      if (!addr.manual_address?.trim()) return "Enter full shop address";
      if (!addr.city?.trim() || !addr.district?.trim() || !addr.state?.trim() || !addr.pincode?.trim()) return "Fill city, district, state & pincode";
      if (addr.lat == null || addr.lng == null) return "Tap 'Use current location' to capture shop GPS";
      if (blocked) return "We don't serve this pincode yet — your application can't be submitted for this area.";
    }
    return null;
  };

  const next = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    let ok = true;
    if (step === 0) ok = await saveSection("basic", basic);
    else if (step === 1) ok = await saveSection("shop", shop);
    else if (step === 2) ok = await saveSection("address", addr);
    setBusy(false);
    if (ok && step < 3) setStep(step + 1);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.put(`${RB}/basic`, basic); await api.put(`${RB}/shop`, shop); await api.put(`${RB}/address`, addr);
      await api.post(`${RB}/submit`);
      toast.success("Application submitted for review 🎉");
      setStatus("under_review");
      refresh?.();
    } catch (e: any) { toast.error(e?.detail || "Please complete all required fields"); }
    setBusy(false);
  };

  const onRefreshStatus = async () => {
    setRefreshing(true);
    try {
      const p = await api.get<any>(`${RB}/profile`);
      const st = p?.kyc_status || p?.profile?.status;
      setStatus(st);
      if (st === "approved") { await refresh?.(); router.replace("/(merchant)"); return; }
    } catch { /* noop */ }
    setRefreshing(false);
  };

  const useLocation = async () => {
    setLocBusy(true);
    try {
      const r = await detectLocation();
      if (!r) { toast.error("Location permission needed. Enable it in Settings."); setLocBusy(false); return; }
      const g = r.geo || {};
      setAddr((a: any) => ({ ...a, lat: r.lat, lng: r.lng, location_address: g.display || "", manual_address: a.manual_address || g.line || g.display || "", city: g.city || a.city, state: g.state || a.state, district: a.district || g.city || "", pincode: g.pincode || a.pincode }));
      toast.success("Location detected & address filled");
    } catch { toast.error("Could not fetch location"); }
    setLocBusy(false);
  };

  const onShopPhoto = async (data: any) => {
    if (data._lat == null || data._lng == null) {
      toast.error("Enable location so the shop photo captures GPS, then retry.");
      return;
    }
    try {
      const r = await api.put<any>(`${RB}/shop-photo`, { shop_verification_photo: data.url, lat: data._lat, lng: data._lng });
      setShop((s: any) => ({ ...s, ...(r.photo || {}) }));
      applyScore(r);
    } catch (e: any) { toast.error(e?.detail || "Could not save photo"); }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><AppHeader title="Merchant Registration" variant="gradient" /><View style={{ padding: spacing.lg }}><CardSkeleton /></View></View>;

  if (status === "under_review" || status === "approved") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppHeader title="Merchant Registration" variant="gradient" testID="merchant-register-header" />
        <UnderReviewCard onRefresh={onRefreshStatus} refreshing={refreshing} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Merchant Registration" subtitle={`Step ${step + 1} of 4 · ${STEPS[step].label}`} variant="gradient" testID="merchant-register-header" />
      <Stepper steps={STEPS} step={step} onStep={setStep} />

      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100, gap: spacing.md }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ScoreBanner score={score} title="Complete your shop profile" subtitle="A complete profile builds trust and speeds up approval." />
        {status === "rejected" ? <StatusBanner status="rejected" reason={rejection} /> : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={STEPS[step].icon} size={18} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{TITLES[step]}</Text>
        </View>

        {step === 0 ? (
          <Card>
            <PhotoField base={RB} docType="owner_photo" label="Owner live photo" mode="both" cameraType="front" dashed hint="Take a clear selfie (or pick from gallery)" value={basic.owner_photo} onUploaded={(d) => setBasic((b: any) => ({ ...b, owner_photo: d.url }))} />
            <View style={{ height: spacing.sm }} />
            <Field label="Owner full name" value={basic.full_name} onChange={(v: string) => setBasic({ ...basic, full_name: v })} />
            <Field label="Mobile number" value={basic.mobile} disabled hint="Locked to your login number" />
            <Field label="Date of birth (YYYY-MM-DD)" value={basic.dob} onChange={(v: string) => setBasic({ ...basic, dob: v })} keyboard="numbers-and-punctuation" placeholder="1990-05-14" />
            <PickRow label="Gender" value={basic.gender ? basic.gender[0].toUpperCase() + basic.gender.slice(1) : ""} onPress={() => setPicker({ title: "Gender", options: [{ id: "male", name: "Male" }, { id: "female", name: "Female" }, { id: "other", name: "Other" }], onSel: (o) => setBasic({ ...basic, gender: o.id }) })} />
            <Field label="Email" value={basic.email} onChange={(v: string) => setBasic({ ...basic, email: v })} keyboard="email-address" autoCap="none" placeholder="you@email.com" last />
          </Card>
        ) : step === 1 ? (
          <Card>
            <Field label="Shop name" value={shop.shop_name} onChange={(v: string) => setShop({ ...shop, shop_name: v })} placeholder="e.g. Sharma Electricals" />
            <PickRow label="Shop type" value={shop.shop_type_name} onPress={() => setPicker({ title: "Shop type", search: true, options: (meta.shop_types || []).map((c: any) => ({ id: c.id, name: c.name })), onSel: (o) => setShop({ ...shop, shop_type_id: o.id, shop_type_name: o.name }) })} />
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm, marginTop: 12, marginBottom: 8 }}>Category served <Text style={{ color: colors.textMuted, fontWeight: "500" }}>(select one)</Text></Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(meta.categories || []).map((c: any) => {
                const on = shop.categories.some((x: any) => (x.category_id || x) === c.id);
                return (
                  <Pressable key={c.id} testID={`mcat-${c.id}`} onPress={() => setShop({ ...shop, categories: on ? [] : [{ category_id: c.id, category_name: c.name }] })}
                    style={{ paddingHorizontal: 14, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.primary : colors.surfaceSubtle, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                    <Text style={{ color: on ? "#fff" : colors.textSecondary, fontWeight: "700", fontSize: fontSize.xs }}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ height: spacing.md }} />
            <Field label="GST number (optional)" value={shop.gst_number} onChange={(v: string) => setShop({ ...shop, gst_number: v.toUpperCase() })} autoCap="characters" placeholder="22ABCDE1234F1Z5" />
            <PhotoField base={RB} docType="gst" label="GST certificate (optional)" value={shop.gst_url} onUploaded={(d) => setShop((s: any) => ({ ...s, gst_url: d.url }))} />
            <View style={{ height: spacing.sm }} />
            <PhotoField base={RB} docType="shop_verification" label="Shop verification photo (GPS)" mode="camera" cameraType="back" gps dashed hint="Take a photo of your shop front — GPS is captured with the shot" value={shop.shop_verification_photo} onUploaded={onShopPhoto} />
            {shop.shop_verification_photo ? (
              <Text style={{ color: shop.shop_photo_verified ? colors.success : colors.textMuted, fontSize: fontSize.xs, marginTop: 6, fontWeight: "700" }}>
                {shop.shop_photo_verified ? "✓ GPS verified — matches shop location" : "Captured with GPS (verified against address after you set location)"}
              </Text>
            ) : null}
          </Card>
        ) : step === 2 ? (
          <Card>
            <Button title="Use current location" variant="outline" icon="crosshairs-gps" onPress={useLocation} loading={locBusy} testID="use-current-location" />
            <View style={{ height: spacing.sm }} />
            <Field label="Full shop address" value={addr.manual_address} onChange={(v: string) => setAddr({ ...addr, manual_address: v })} placeholder="Shop no, street, area…" />
            <PickRow label="State" value={addr.state} onPress={() => setPicker({ title: "State", search: true, options: states, optionsKey: "states", onSel: (o) => setAddr({ ...addr, state: o.name, district: "", city: "" }) } as any)} />
            <PickRow label="District" value={addr.district} onPress={() => addr.state ? setPicker({ title: "District", search: true, options: districts, optionsKey: "districts", onSel: (o) => setAddr({ ...addr, district: o.name, city: "" }) } as any) : toast.info("Select state first")} />
            <PickRow label="City / Sub-district" value={addr.city} onPress={() => addr.district ? setPicker({ title: "City", search: true, options: cities, optionsKey: "cities", onSel: (o) => setAddr({ ...addr, city: o.name }) } as any) : toast.info("Select district first")} />
            <Field label="Pincode" value={addr.pincode} onChange={(v: string) => setAddr({ ...addr, pincode: v.replace(/[^0-9]/g, "").slice(0, 6) })} keyboard="number-pad" maxLength={6} last />
            <View style={{ marginTop: 10 }}><PincodeBadge pincode={addr.pincode} checking={pinChecking} cov={pinCov} /></View>
            {addr.lat ? (
              <View testID="reg-location-captured" style={{ marginTop: 10, backgroundColor: colors.successSubtle, borderWidth: 1, borderColor: colors.success, borderRadius: radius.md, padding: 12 }}>
                <Text style={{ color: colors.success, fontWeight: "700", fontSize: fontSize.sm }}>📍 Location captured</Text>
                <Text style={{ color: colors.success, fontSize: fontSize.xs, marginTop: 3 }}>Lat {Number(addr.lat).toFixed(5)}, Lng {Number(addr.lng).toFixed(5)}</Text>
              </View>
            ) : null}
            {blocked ? (
              <View testID="reg-out-of-area" style={{ marginTop: 10, backgroundColor: colors.warningSubtle, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, padding: 12 }}>
                <Text style={{ color: colors.warning, fontWeight: "800", fontSize: fontSize.sm }}>We&apos;re not in this area yet</Text>
                <Text style={{ color: colors.warning, fontSize: fontSize.xs, marginTop: 3 }}>Pincode {addr.pincode} is outside our current service areas.</Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card>
            {basic.owner_photo ? (
              <View style={{ alignItems: "center", marginBottom: spacing.md }}>
                <View style={{ width: 84, height: 84, borderRadius: 20, overflow: "hidden", borderWidth: 2, borderColor: colors.success }}>
                  <Image source={{ uri: mediaUrl(basic.owner_photo) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </View>
                <Text style={{ color: colors.success, fontWeight: "700", fontSize: fontSize.sm, marginTop: 6 }}>Owner photo captured ✓</Text>
              </View>
            ) : null}
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.lg, marginBottom: 8 }}>Review & submit</Text>
            <Rev k="Owner" v={basic.full_name} />
            <Rev k="Mobile" v={basic.mobile} />
            <Rev k="DOB" v={basic.dob} />
            <Rev k="Gender" v={basic.gender} />
            <Rev k="Email" v={basic.email} />
            <Rev k="Shop name" v={shop.shop_name} />
            <Rev k="Shop type" v={shop.shop_type_name} />
            <Rev k="Category" v={shop.categories.map((c: any) => c.category_name).join(", ")} />
            <Rev k="GST" v={shop.gst_number || "—"} />
            <Rev k="Shop photo" v={shop.shop_verification_photo ? (shop.shop_photo_verified ? "Verified ✓ (GPS)" : "Captured (GPS)") : "Missing"} />
            <Rev k="Address" v={addr.manual_address} />
            <Rev k="Location" v={[addr.city, addr.district, addr.state, addr.pincode].filter(Boolean).join(", ")} last />
            {missing.length ? (
              <View style={{ marginTop: 12, backgroundColor: colors.dangerSubtle, borderRadius: radius.md, padding: 12 }}>
                <Text style={{ color: colors.danger, fontWeight: "800", fontSize: fontSize.xs, marginBottom: 4 }}>Still required:</Text>
                <Text style={{ color: colors.danger, fontSize: fontSize.xs }}>{missing.join(", ")}</Text>
              </View>
            ) : null}
            <View style={{ marginTop: 12, backgroundColor: colors.primarySubtle, borderRadius: radius.md, padding: 12, flexDirection: "row", gap: 8 }}>
              <Icon name="shield-check" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.xs, flex: 1 }}>After submission your profile will be sent to admin for verification. You&apos;ll get an update within 24–48 hours. Bank &amp; KYC details are collected later, only at your first withdrawal.</Text>
            </View>
          </Card>
        )}
      </KeyboardAwareScrollView>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: spacing.md, padding: spacing.lg, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button title="Back" variant="outline" onPress={() => setStep(step - 1)} testID="reg-back" /></View> : null}
        <View style={{ flex: 1.4 }}>
          {step < 3 ? <Button title="Save & Continue" onPress={next} loading={busy} disabled={step === 2 && blocked} testID="reg-next" /> : <Button title={status === "rejected" ? "Re-submit" : "Submit Application"} icon="check" onPress={submit} loading={busy} disabled={score < 100} testID="reg-submit" />}
        </View>
      </View>

      <PickerSheet cfg={picker ? { ...picker, options: (picker as any).optionsKey ? (({ states, districts, cities } as any)[(picker as any).optionsKey]) : picker.options } : null} onClose={() => setPicker(null)} />
    </View>
  );
}
