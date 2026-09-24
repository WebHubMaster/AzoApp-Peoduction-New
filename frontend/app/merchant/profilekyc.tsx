import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { User, Store, MapPin, ClipboardCheck, Navigation } from "lucide-react-native";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { AppHeader } from "@/src/components/Screen";
import { TW, T, usePal } from "@/src/components/reg/tokens";
import { ScoreRing } from "@/src/components/reg/Shell";
import {
  Field, WInput, WTextarea, Combo, WSelect, StepTitle, MerchantProgress, PincodeBadge, OutOfArea, InfoBox,
  RejectedBanner, ApprovedBanner, ReviewCard, RegNav, useServiceability, StepDef,
} from "@/src/components/reg/Fields";
import { WDatePicker } from "@/src/components/reg/DatePicker";
import { LivePhotoCapture, GpsPhotoCapture, Uploader } from "@/src/components/reg/Photo";
import { MapPreview } from "@/src/components/reg/MapPreview";

const REG = "/merchant/registration";
const STEPS: StepDef[] = [
  { key: "basic", label: "Owner", icon: User },
  { key: "shop", label: "Shop", icon: Store },
  { key: "address", label: "Address", icon: MapPin },
  { key: "review", label: "Review", icon: ClipboardCheck },
];
const TITLES = ["Owner Details", "Shop Details", "Shop Address", "Review & Submit"];

/** Web "Profile & KYC" = MerchantRegistration embedded inside the panel. */
export default function MerchantProfileKyc() {
  const { colors } = useTheme();
  const P = usePal();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { refresh } = useAuth();

  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("incomplete");
  const [rejection, setRejection] = useState("");
  const [score, setScore] = useState<any>({ score: 0, sections: {}, missing: [] });
  const [meta, setMeta] = useState<any>({ categories: [], shop_types: [] });

  const [basic, setBasic] = useState<any>({ full_name: "", dob: "", gender: "", email: "", mobile: "", owner_photo: "" });
  const [shop, setShop] = useState<any>({ shop_name: "", shop_type_id: "", shop_type_name: "", categories: [], gst_number: "", gst_url: "", shop_verification_photo: "", shop_photo_lat: null, shop_photo_lng: null, shop_photo_distance_m: null, shop_photo_verified: false, shop_photo_gps_ok: false });
  const [addr, setAddr] = useState<any>({ manual_address: "", city: "", district: "", state: "", pincode: "", lat: null, lng: null, location_address: "" });
  const [locating, setLocating] = useState(false);
  const { checking: pinChecking, cov: pinCov } = useServiceability(addr.pincode, (u) => api.get(u));
  const blocked = !!(pinCov && pinCov.serviceable === false);

  const load = useCallback(async () => {
    const data = await api.get<any>(`${REG}/profile`);
    const p = data.profile;
    setBasic((b: any) => ({ ...b, ...p.basic }));
    setShop((s: any) => ({ ...s, ...p.shop }));
    setAddr((a: any) => ({ ...a, ...p.address }));
    setScore(data.score);
    setStatus(data.kyc_status || p.status);
    setRejection(data.rejection_reason || "");
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch(() => { toast.error("Failed to load profile"); setLoaded(true); });
    api.get<any>(`${REG}/meta`).then(setMeta).catch(() => {});
  }, [load]);

  // Embedded: never redirect away — approved merchants VIEW their profile here.
  const editable = status !== "approved" && status !== "under_review";

  const saveSection = async (section: string, payload: any) => {
    const data = await api.put<any>(`${REG}/${section}`, payload);
    setScore(data.score);
    return data;
  };

  const next = async () => {
    setSaving(true);
    try {
      if (step === 0) {
        const em = String(basic.email || "").trim();
        if (!em) { toast.error("Email is required"); setSaving(false); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast.error("Enter a valid email address"); setSaving(false); return; }
        await saveSection("basic", basic);
      } else if (step === 1) await saveSection("shop", shop);
      else if (step === 2) {
        if (blocked) { toast.error("We don't serve this pincode yet — your application can't be submitted for this area."); setSaving(false); return; }
        await saveSection("address", addr);
      }
      if (step < STEPS.length - 1) setStep(step + 1);
    } catch (e: any) { toast.error(e?.detail || "Could not save"); }
    finally { setSaving(false); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`${REG}/submit`);
      toast.success("Application submitted for review");
      await load();
      setStep(STEPS.length - 1);
      await refresh?.();
    } catch (e: any) { toast.error(e?.detail || "Please complete all required fields"); }
    finally { setSaving(false); }
  };

  const savePhoto = async ({ url, lat, lng, captured_at }: { url: string; lat: number; lng: number; captured_at: string }) => {
    try {
      const data = await api.put<any>(`${REG}/shop-photo`, { shop_verification_photo: url, lat, lng, captured_at });
      setShop((s: any) => ({ ...s, ...data.photo }));
      setScore(data.score);
    } catch (e: any) { toast.error(e?.detail || "Could not save photo"); }
  };

  const useCurrent = async () => {
    setLocating(true);
    try {
      let lp = await Location.getForegroundPermissionsAsync();
      if (!lp.granted) lp = await Location.requestForegroundPermissionsAsync();
      if (!lp.granted) { toast.error("Location permission denied. Please allow location and retry."); setLocating(false); return; }
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = coords.latitude, lng = coords.longitude;
      try {
        const data = await api.get<any>(`/geo/reverse?lat=${lat}&lng=${lng}`);
        setAddr((a: any) => ({ ...a, lat, lng, manual_address: a.manual_address || data.line || data.display || "", location_address: data.display || "", city: data.city || a.city, state: data.state || a.state, district: a.district || data.city || "", pincode: data.pincode || a.pincode }));
        toast.success("Location detected & address filled");
      } catch {
        setAddr((a: any) => ({ ...a, lat, lng }));
        toast.info("Location captured (autofill unavailable)");
      }
    } catch { toast.error("Location permission denied. Please allow location and retry."); }
    setLocating(false);
  };

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AppHeader title="Profile & KYC" back embedded variant="gradient" testID="merchant-profilekyc-header" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color={P[400]} /></View>
      </View>
    );
  }

  const hasGps = addr.lat != null && addr.lng != null;
  const pinBadge = String(addr.pincode || "").length === 6 ? <View style={{ marginTop: 4 }}><PincodeBadge pincode={addr.pincode} checking={pinChecking} cov={pinCov} /></View> : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Profile & KYC" back embedded variant="gradient" testID="merchant-profilekyc-header" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load().catch(() => {})} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="reg-embedded"
      >
        {/* Score header (web score banner) */}
        <LinearGradient colors={["#0D47A1", "#1565C0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 22, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <ScoreRing score={score?.score || 0} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "800", ...T.lg }}>Complete your shop profile</Text>
            <Text style={{ color: "rgba(224,242,254,0.85)", ...T.sm, marginTop: 2 }}>A complete profile builds trust and speeds up approval.</Text>
          </View>
        </LinearGradient>

        {/* Status banners */}
        {status === "approved" ? <ApprovedBanner who="Merchant" /> : null}
        {status === "under_review" ? (
          <View testID="reg-under-review" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: colors.warningSubtle, borderWidth: 1, borderColor: colors.warning, borderRadius: 16, padding: spacing.md }}>
            <View style={{ marginTop: 1 }}><ClipboardCheck size={18} color={colors.warning} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.warning, fontWeight: "800", ...T.sm }}>Under review</Text>
              <Text style={{ color: colors.warning, ...T.sm, marginTop: 2, opacity: 0.9 }}>Your application is being reviewed. You'll be notified within 24–48 hours.</Text>
            </View>
          </View>
        ) : null}
        {status === "rejected" ? <RejectedBanner reason={rejection} /> : null}

        <MerchantProgress steps={STEPS} step={step} />
        <StepTitle Icon={STEPS[step].icon} title={TITLES[step]} />

        {step === 0 ? (
          <View style={{ gap: 16 }} testID="step-owner">
            <LivePhotoCapture value={basic.owner_photo} editable={editable} base={REG} onCaptured={(url: string) => setBasic((b: any) => ({ ...b, owner_photo: url }))} />
            <Field label="Owner Full Name" required>
              <WInput testID="reg-name" value={basic.full_name} disabled={!editable} onChangeText={(v: string) => setBasic({ ...basic, full_name: v })} placeholder="Enter full name" />
            </Field>
            <Field label="Mobile Number" hint="Locked to your login number">
              <WInput value={basic.mobile} disabled />
            </Field>
            <Field label="Date of Birth" required>
              <WDatePicker testID="reg-dob" value={basic.dob || ""} disabled={!editable} onChange={(v: string) => setBasic({ ...basic, dob: v })} placeholder="Date of Birth" />
            </Field>
            <Field label="Gender" required>
              <WSelect testID="reg-gender" value={basic.gender || ""} disabled={!editable} onChange={(v: string) => setBasic({ ...basic, gender: v })} placeholder="Select gender"
                options={[{ value: "", label: "Select gender" }, { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]} />
            </Field>
            <Field label="Email" required>
              <WInput keyboardType="email-address" autoCapitalize="none" value={basic.email || ""} disabled={!editable} onChangeText={(v: string) => setBasic({ ...basic, email: v })} placeholder="you@email.com" testID="reg-email" />
            </Field>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={{ gap: 16 }} testID="step-shop">
            <Field label="Shop Name" required>
              <WInput testID="reg-shop-name" value={shop.shop_name} disabled={!editable} onChangeText={(v: string) => setShop({ ...shop, shop_name: v })} placeholder="e.g. Sharma Electricals" />
            </Field>
            <Field label="Shop Type" required>
              <Combo testID="reg-shop-type" disabled={!editable} value={shop.shop_type_id} display={shop.shop_type_name} options={meta.shop_types || []} placeholder="Select shop type"
                onSelect={(o: any) => setShop({ ...shop, shop_type_id: o.id, shop_type_name: o.name })} />
            </Field>
            <Field label="Category Served" required hint="Select one category">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} testID="reg-categories">
                {(meta.categories || []).map((c: any) => {
                  const on = (shop.categories || []).some((x: any) => (x.category_id || x) === c.id);
                  return (
                    <Pressable key={c.id} testID={`reg-mcat-${c.id}`} disabled={!editable} onPress={() => setShop({ ...shop, categories: on ? [] : [{ category_id: c.id, category_name: c.name }] })}
                      style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, backgroundColor: on ? P[700] : "#fff", borderColor: on ? P[700] : TW.slate200 }}>
                      <Text style={{ ...T.sm, fontWeight: "500", color: on ? "#fff" : TW.slate600 }}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            <Field label="GST Number (optional)">
              <WInput testID="reg-gst" value={shop.gst_number || ""} disabled={!editable} uppercase onChangeText={(v: string) => setShop({ ...shop, gst_number: v.toUpperCase() })} placeholder="22ABCDE1234F1Z5" />
            </Field>
            <Uploader label="GST Certificate (optional)" docType="gst" base={REG} variant="merchant" value={shop.gst_url} onUploaded={(d: any) => setShop({ ...shop, gst_url: d.url })} />
            <GpsPhotoCapture value={shop.shop_verification_photo} lat={shop.shop_photo_lat} lng={shop.shop_photo_lng} distance={shop.shop_photo_distance_m}
              verified={shop.shop_photo_verified} gpsOk={shop.shop_photo_gps_ok} base={REG} editable={editable} onCaptured={savePhoto} />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: 16 }} testID="step-address">
            <View style={{ gap: 12 }}>
              <Pressable testID="use-current-location" disabled={!editable || locating} onPress={useCurrent}
                style={({ pressed }) => ({ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: pressed ? P[800] : P[700], opacity: !editable || locating ? 0.6 : 1 })}>
                {locating ? <ActivityIndicator size="small" color="#fff" /> : <Navigation size={20} color="#fff" />}
                <Text style={{ ...T.base, fontWeight: "600", color: "#fff" }}>{locating ? "Detecting location…" : "📍 Use Current Location"}</Text>
              </Pressable>
              {hasGps ? <MapPreview lat={Number(addr.lat)} lng={Number(addr.lng)} /> : null}
            </View>
            <Field label="Full Shop Address" required>
              <WTextarea testID="reg-addr" rows={2} pad={12} value={addr.manual_address} editable={editable} onChangeText={(v: string) => setAddr({ ...addr, manual_address: v })} placeholder="Shop no, street, area…" />
            </Field>
            <Field label="City" required><WInput testID="reg-city" value={addr.city} disabled={!editable} onChangeText={(v: string) => setAddr({ ...addr, city: v })} /></Field>
            <Field label="District" required><WInput testID="reg-district" value={addr.district} disabled={!editable} onChangeText={(v: string) => setAddr({ ...addr, district: v })} /></Field>
            <Field label="State" required><WInput testID="reg-state" value={addr.state} disabled={!editable} onChangeText={(v: string) => setAddr({ ...addr, state: v })} /></Field>
            <Field label="Pincode" required><WInput testID="reg-pincode" value={addr.pincode} disabled={!editable} keyboardType="number-pad" maxLength={6} onChangeText={(v: string) => setAddr({ ...addr, pincode: v.replace(/\D/g, "").slice(0, 6) })} /></Field>
            {pinBadge}
            {blocked ? <OutOfArea pincode={addr.pincode} subject="your application" /> : null}
          </View>
        ) : null}

        {step === 3 ? (
          <View style={{ gap: 16 }} testID="step-review">
            <ReviewCard title="Owner Details" editable={editable} onEdit={() => setStep(0)} rows={[
              ["Name", basic.full_name], ["Mobile", basic.mobile], ["DOB", basic.dob],
              ["Gender", basic.gender], ["Live Photo", basic.owner_photo ? "Captured ✓" : "Missing"],
            ]} />
            <ReviewCard title="Shop Details" editable={editable} onEdit={() => setStep(1)} rows={[
              ["Shop Name", shop.shop_name], ["Type", shop.shop_type_name],
              ["Categories", (shop.categories || []).map((c: any) => c.category_name).join(", ")],
              ["GST", shop.gst_number || "—"],
              ["Shop Photo", shop.shop_verification_photo ? (shop.shop_photo_verified ? "Verified ✓ (GPS matched)" : "Captured (GPS)") : "Missing"],
            ]} />
            <ReviewCard title="Shop Address" editable={editable} onEdit={() => setStep(2)} rows={[
              ["Address", addr.manual_address], ["City", addr.city], ["District", addr.district],
              ["State", addr.state], ["Pincode", addr.pincode],
              ["GPS", addr.lat != null ? `${Number(addr.lat).toFixed(4)}, ${Number(addr.lng).toFixed(4)}` : "Not set"],
            ]} />
            {score?.missing?.length > 0 ? (
              <View style={{ borderRadius: 12, backgroundColor: TW.red50, borderWidth: 1, borderColor: TW.red100, padding: 12 }}>
                <Text style={{ ...T.sm, fontWeight: "600", color: TW.red600, marginBottom: 4 }}>Still required:</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {score.missing.map((m: string) => (
                    <View key={m} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: TW.red100, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ ...T.px11, color: TW.red600 }}>{m}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            <InfoBox text="After submission your profile will be sent to admin for verification. You'll get an update within 24–48 hours. Bank & KYC details are collected later, only at your first withdrawal." />
          </View>
        ) : null}

        {/* nav */}
        <View style={{ marginTop: spacing.sm }}>
          {editable ? (
            <RegNav step={step} total={STEPS.length} onBack={() => setStep((s) => Math.max(0, s - 1))} saving={saving} onNext={next} nextDisabled={step === 2 && blocked}
              onSubmit={submit} submitLabel={status === "rejected" ? "Re-submit" : "Submit Application"} submitDisabled={(score?.score || 0) < 100} />
          ) : (
            <RegNav step={step} total={STEPS.length} onBack={() => setStep((s) => Math.max(0, s - 1))} viewOnly onViewNext={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
