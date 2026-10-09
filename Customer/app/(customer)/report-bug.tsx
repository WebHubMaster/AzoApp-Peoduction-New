/** Report a Bug — customer reports an app bug (title + description + optional screenshot),
 * sees the live status (Open → Solved) with the admin's resolution note, and can delete
 * a report once it's solved. */
import React, { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Alert } from "react-native";
import { Bug, Camera, X, Send, CheckCircle2, Clock, Trash2, Inbox } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { api, mediaUrl } from "../../src/api/client";
import { assetToFormData } from "../../src/components/customer/supportShared";
import { PRIMARY, TC, useTheme } from "../../src/theme";

type BugRow = {
  id: string; title: string; description: string; category?: string; screenshot_url?: string | null;
  status: string; resolution_note?: string | null; created_at: string; resolved_at?: string | null;
};

const CATEGORIES = [
  { key: "payment", label: "Payment" },
  { key: "booking", label: "Booking" },
  { key: "login", label: "Login" },
  { key: "account", label: "Account" },
  { key: "other", label: "Other" },
];
const CAT_LABEL: Record<string, string> = { payment: "Payment", booking: "Booking", login: "Login", account: "Account", other: "Other" };

export default function ReportBugScreen() {
  useTheme();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("other");
  const [shot, setShot] = useState<{ url: string; thumb_url?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<BugRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<BugRow[]>("/bugs/my").then((r) => setRows(r || [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickShot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to attach a screenshot."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    try {
      const data: any = await api.post("/support/upload", await assetToFormData(res.assets[0]));
      setShot({ url: data.url, thumb_url: data.thumb_url });
    } catch { Alert.alert("Upload failed", "Could not upload the screenshot. Please try again."); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!title.trim()) { Alert.alert("Add a title", "Please add a short title for the bug."); return; }
    if (!desc.trim()) { Alert.alert("Describe the bug", "Please describe what went wrong."); return; }
    setSubmitting(true);
    try {
      await api.post("/bugs", { title: title.trim(), description: desc.trim(), category, screenshot_url: shot?.url || null });
      setTitle(""); setDesc(""); setCategory("other"); setShot(null);
      load();
      Alert.alert("Thank you! 🐞", "Your bug report has been sent to our team.");
    } catch (e: any) { Alert.alert("Could not send", e?.detail || "Please try again."); }
    finally { setSubmitting(false); }
  };

  const removeRow = (b: BugRow) => {
    Alert.alert("Delete report?", "This will permanently remove your bug report.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.del(`/bugs/${b.id}`); setRows((p) => p.filter((x) => x.id !== b.id)); }
        catch (e: any) { Alert.alert("Could not delete", e?.detail || "Please try again."); }
      } },
    ]);
  };

  const inputStyle = { borderWidth: 1, borderColor: TC.border, backgroundColor: TC.surface, borderRadius: 6, paddingHorizontal: 12, color: TC.text, fontSize: 14 } as any;
  const solved = (s: string) => s === "solved" || s === "closed";

  return (
    <View style={{ flex: 1 }} testID="report-bug-page">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 18 }} keyboardShouldPersistTaps="handled">
        {/* Intro */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}>
            <Bug size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: TC.text }}>Report a Bug</Text>
            <Text style={{ fontSize: 12, color: TC.textFaint }}>Spotted something broken? Tell us and we'll fix it.</Text>
          </View>
        </View>

        {/* Form */}
        <View testID="bug-form" style={{ gap: 14, width: "100%" }}>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: TC.text2, marginBottom: 6 }}>Title</Text>
            <TextInput testID="bug-title" value={title} onChangeText={setTitle} placeholder="e.g. Payment screen crashes" placeholderTextColor={TC.textFaint} style={[inputStyle, { height: 46 }]} maxLength={160} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: TC.text2, marginBottom: 6 }}>Category</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <Pressable key={c.key} testID={`bug-category-${c.key}`} onPress={() => setCategory(c.key)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: on ? PRIMARY[600] : TC.border, backgroundColor: on ? PRIMARY[600] : TC.surface }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#fff" : TC.text2 }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: TC.text2, marginBottom: 6 }}>Describe the bug</Text>
            <TextInput testID="bug-description" value={desc} onChangeText={setDesc} placeholder="What happened? What did you expect? Steps to reproduce…" placeholderTextColor={TC.textFaint} multiline style={[inputStyle, { minHeight: 110, paddingTop: 10, textAlignVertical: "top" }]} maxLength={4000} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: TC.text2, marginBottom: 6 }}>Screenshot (optional)</Text>
            {shot ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Image source={{ uri: mediaUrl(shot.thumb_url || shot.url) }} style={{ width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: TC.border }} />
                <Pressable testID="bug-remove-shot" onPress={() => setShot(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: TC.surface, borderWidth: 1, borderColor: TC.border }}>
                  <X size={16} color={TC.text2} /><Text style={{ color: TC.text2, fontWeight: "600" }}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable testID="bug-attach-shot" onPress={pickShot} disabled={uploading} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: PRIMARY[400], backgroundColor: TC.surface }}>
                {uploading ? <ActivityIndicator color={PRIMARY[600]} /> : <><Camera size={18} color={PRIMARY[600]} /><Text style={{ color: PRIMARY[700], fontWeight: "700" }}>Attach screenshot</Text></>}
              </Pressable>
            )}
          </View>
          <Pressable testID="bug-submit" onPress={submit} disabled={submitting} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 6, backgroundColor: PRIMARY[600], opacity: submitting ? 0.7 : 1 }}>
            {submitting ? <ActivityIndicator color="#fff" /> : <><Send size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Submit Bug Report</Text></>}
          </Pressable>
        </View>

        {/* My reports */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: TC.text }}>My Reports</Text>
          {loading ? (
            <View style={{ padding: 30, alignItems: "center" }}><ActivityIndicator color={PRIMARY[600]} /></View>
          ) : rows.length === 0 ? (
            <View testID="bug-empty" style={{ alignItems: "center", gap: 8, padding: 30, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: TC.border }}>
              <Inbox size={28} color={TC.textFaint} />
              <Text style={{ color: TC.textFaint, fontSize: 13 }}>No bug reports yet.</Text>
            </View>
          ) : rows.map((b) => (
            <View key={b.id} testID={`bug-row-${b.id}`} style={{ backgroundColor: TC.surface, borderRadius: 14, borderWidth: 1, borderColor: solved(b.status) ? "#A7F3D0" : TC.border, padding: 14, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: TC.text }}>{b.title}</Text>
                {b.category ? (
                  <View testID={`bug-category-badge-${b.id}`} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: PRIMARY[50] || "#EFF6FF", borderWidth: 1, borderColor: PRIMARY[200] || "#BFDBFE" }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: PRIMARY[700] }}>{CAT_LABEL[b.category] || "Other"}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: solved(b.status) ? "#D1FAE5" : "#FEF3C7" }}>
                  {solved(b.status) ? <CheckCircle2 size={13} color="#047857" /> : <Clock size={13} color="#B45309" />}
                  <Text style={{ fontSize: 11, fontWeight: "800", color: solved(b.status) ? "#047857" : "#B45309" }}>{solved(b.status) ? "Solved" : "Open"}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: TC.text2, lineHeight: 19 }}>{b.description}</Text>
              {b.screenshot_url ? <Image source={{ uri: mediaUrl(b.screenshot_url) }} style={{ width: 96, height: 96, borderRadius: 10, borderWidth: 1, borderColor: TC.border }} /> : null}
              {solved(b.status) && b.resolution_note ? (
                <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10 }}>
                  <CheckCircle2 size={16} color="#047857" />
                  <Text style={{ flex: 1, fontSize: 13, color: "#065F46" }}><Text style={{ fontWeight: "800" }}>Resolution: </Text>{b.resolution_note}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                <Text style={{ fontSize: 11, color: TC.textFaint }}>{b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</Text>
                {solved(b.status) ? (
                  <Pressable testID={`bug-delete-${b.id}`} onPress={() => removeRow(b)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: "#FEE2E2" }}>
                    <Trash2 size={14} color="#DC2626" /><Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "700" }}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
