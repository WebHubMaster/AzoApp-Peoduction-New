/** My Profile — 1:1 port of ProfileEditor + DeleteAccount (CustomerDashboard.jsx). */
import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Plus, ShieldAlert } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { useToast } from "../../src/components/Toast";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, ROSE, useTheme, shadowBtn, shadowElev } from "../../src/theme";
import { PrimaryButton } from "../../src/components/customer/ux";
import { PField, FInput, FSelect, DateField, onlyDigits } from "../../src/components/customer/FormControls";
import { ProfilePhotoPicker } from "../../src/components/customer/ProfilePhotoPicker";
import { CenterDialog } from "../../src/components/customer/BookingDialogs";

const LANGS = [["en", "English"], ["hi", "हिन्दी"], ["bn", "বাংলা"], ["ta", "தமிழ்"], ["te", "తెలుగు"], ["mr", "मराठी"]].map(([value, label]) => ({ value, label }));
const COMM = [["all", "All (SMS, WhatsApp, Email)"], ["sms", "SMS only"], ["whatsapp", "WhatsApp only"], ["email", "Email only"], ["none", "Do not contact"]].map(([value, label]) => ({ value, label }));
const GENDERS = [{ value: "", label: "Select" }, { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }];

function DeleteAccount() {
  const { c, isDark } = useTheme();
  const { logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try { const data: any = await api.post("/auth/delete-account", { reason: "User requested" }); toast.success(data.message || "Request submitted"); setOpen(false); if (data.status === "deleted") { await logout(); router.replace("/(site)" as any); } }
    catch (e: any) { toast.error(e?.message || "Failed"); }
    setBusy(false);
  };
  return (
    <View testID="danger-zone" style={{ borderRadius: 16, borderWidth: 1, borderColor: isDark ? "rgba(136,19,55,0.5)" : ROSE[200], backgroundColor: c.surface, padding: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <ShieldAlert size={20} color={ROSE[500]} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 16, color: c.text }}>Delete Account</Text><Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>This removes your account and data. An admin may need to approve the request.</Text></View>
        <Pressable testID="delete-account-btn" onPress={() => setOpen(true)} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: ROSE[200], backgroundColor: pressed ? ROSE[50] : c.surface, alignItems: "center", justifyContent: "center" })}><Text style={{ fontSize: 14, fontWeight: "500", color: ROSE[600] }}>Delete</Text></Pressable>
      </View>
      <CenterDialog open={open} onClose={() => setOpen(false)} testID="delete-account-dialog">
        <Text style={{ fontSize: 18, fontWeight: "600", color: c.text }}>Delete your account?</Text>
        <Text style={{ fontSize: 14, color: c.textMuted }}>This requests permanent deletion. It cannot be undone once approved.</Text>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Pressable testID="delete-cancel" onPress={() => setOpen(false)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 14, fontWeight: "500", color: c.text }}>Cancel</Text></Pressable>
          <Pressable testID="delete-confirm" onPress={del} disabled={busy} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 6, backgroundColor: pressed ? ROSE[700] : ROSE[600], alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 })}><Text style={{ fontSize: 14, fontWeight: "500", color: "#fff" }}>{busy ? "Deleting…" : "Yes, delete"}</Text></Pressable>
        </View>
      </CenterDialog>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { c, isDark } = useTheme();
  const { user, refresh } = useAuth();
  const { cfg } = useCustomerData();
  const toast = useToast();
  const fields = cfg?.profile_fields || {};
  const [f, setF] = useState({
    name: user?.name || "", email: user?.email || "", gender: user?.gender || "", dob: user?.dob || "",
    alternate_mobile: user?.alternate_mobile || "", language: user?.language || "en", communication_pref: user?.communication_pref || "all",
    gst_number: user?.gst_number || "", company_name: user?.company_name || "", photo: user?.photo || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const filled = [f.name, f.email, f.gender, f.dob, f.photo].filter(Boolean).length;
  const completion = Math.round((filled / 5) * 100);
  const save = async () => {
    setBusy(true);
    try { await api.put("/auth/profile", f); toast.success("Profile updated"); await refresh(); }
    catch (e: any) { toast.error(e?.message || "Save failed"); }
    setBusy(false);
  };

  return (
    <View testID="profile-page" style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="page-title" numberOfLines={1} style={{ fontSize: 24, fontWeight: "900", color: c.text, letterSpacing: -0.4 }}>My Profile</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Manage your personal details & preferences</Text>
        </View>
        <Pressable testID="book-new" onPress={() => router.push("/(site)/services" as any)} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4, ...shadowBtn })}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Booking</Text></Pressable>
      </View>

      <View testID="profile-editor" style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 24, ...shadowElev }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <ProfilePhotoPicker value={f.photo} onChange={(d) => set("photo", d)} size={80} testID="profile-photo" />
          <View style={{ flex: 1 }}>
            <Text testID="profile-name" style={{ fontWeight: "700", fontSize: 18, color: c.text }}>{f.name || "Your name"}</Text>
            <Text testID="profile-phone" style={{ fontSize: 14, color: SLATE[400] }}>{user?.phone}</Text>
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ height: 6, width: 128, borderRadius: 3, backgroundColor: isDark ? SLATE[800] : SLATE[100], overflow: "hidden" }}><View style={{ height: "100%", width: `${completion}%`, backgroundColor: PRIMARY[600] }} /></View>
              <Text testID="profile-completion" style={{ fontSize: 12, fontWeight: "600", color: SLATE[500] }}>{completion}% complete</Text>
            </View>
          </View>
        </View>
        <View style={{ gap: 16 }}>
          <PField label="Full Name"><FInput testID="pf-name" value={f.name} onChange={(v) => set("name", v)} /></PField>
          {fields.email ? <PField label="Email"><FInput testID="pf-email" value={f.email} onChange={(v) => set("email", v)} keyboardType="email-address" /></PField> : null}
          {fields.gender ? <PField label="Gender"><FSelect testID="pf-gender" title="Gender" value={f.gender} options={GENDERS} onChange={(v) => set("gender", v)} /></PField> : null}
          {fields.dob ? <PField label="Date of Birth"><DateField testID="pf-dob" value={f.dob} onChange={(v) => set("dob", v)} placeholder="Select date of birth" fromYear={1940} toYear={new Date().getFullYear()} maxDate={new Date()} /></PField> : null}
          {fields.alternate_mobile ? <PField label="Alternate Mobile"><FInput testID="pf-altmobile" keyboardType="number-pad" maxLength={10} value={f.alternate_mobile} onChange={(v) => set("alternate_mobile", onlyDigits(v, 10))} /></PField> : null}
          {fields.language ? <PField label="Language"><FSelect testID="pf-language" title="Language" value={f.language} options={LANGS} onChange={(v) => set("language", v)} /></PField> : null}
          {fields.communication_pref ? <PField label="Communication Preference"><FSelect testID="pf-comm" title="Communication Preference" value={f.communication_pref} options={COMM} onChange={(v) => set("communication_pref", v)} /></PField> : null}
          {fields.gst ? <PField label="GST Number (B2B)"><FInput testID="pf-gst" value={f.gst_number} onChange={(v) => set("gst_number", v)} /></PField> : null}
          {fields.company ? <PField label="Company Name (B2B)"><FInput testID="pf-company" value={f.company_name} onChange={(v) => set("company_name", v)} /></PField> : null}
        </View>
        <PrimaryButton testID="save-profile" label={busy ? "Saving…" : "Save Profile"} onPress={save} busy={busy} style={{ marginTop: 24, borderRadius: 12, alignSelf: "flex-start", paddingHorizontal: 16, height: 40 }} />
      </View>

      <DeleteAccount />
    </View>
  );
}
