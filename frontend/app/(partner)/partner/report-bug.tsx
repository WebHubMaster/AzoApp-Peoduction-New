import React from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme, spacing } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { AppShellHeader } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { uploadAsset } from "@/src/components/reg/Photo";

type BugRow = {
  id: string; title: string; description: string; category?: string; screenshot_url?: string | null;
  status: string; resolution_note?: string | null; created_at: string;
};

const CATEGORIES = [
  { key: "payment", label: "Payment" },
  { key: "booking", label: "Booking" },
  { key: "login", label: "Login" },
  { key: "account", label: "Account" },
  { key: "other", label: "Other" },
];
const CAT_LABEL: Record<string, string> = { payment: "Payment", booking: "Booking", login: "Login", account: "Account", other: "Other" };

export default function PartnerReportBug() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [category, setCategory] = React.useState("other");
  const [shot, setShot] = React.useState<{ url: string; thumb_url?: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const q = useQuery({ queryKey: ["partner-bugs"], queryFn: () => api.get<BugRow[]>("/bugs/my") });
  const rows = q.data || [];
  const solved = (s: string) => s === "solved" || s === "closed";

  const pickShot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.error("Photo permission denied"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    try {
      const data: any = await uploadAsset("/support", "bug", res.assets[0]);
      setShot({ url: data.url, thumb_url: data.thumb_url });
    } catch (e: any) { toast.error(e?.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!title.trim()) { toast.error("Please add a short title"); return; }
    if (!desc.trim()) { toast.error("Please describe the bug"); return; }
    setSubmitting(true);
    try {
      await api.post("/bugs", { title: title.trim(), description: desc.trim(), category, screenshot_url: shot?.url || null });
      setTitle(""); setDesc(""); setCategory("other"); setShot(null);
      qc.invalidateQueries({ queryKey: ["partner-bugs"] });
      toast.success("Bug report sent — thank you! 🐞");
    } catch (e: any) { toast.error(e?.detail || e?.message || "Could not send"); }
    finally { setSubmitting(false); }
  };

  const removeRow = (b: BugRow) => {
    Alert.alert("Delete report?", "This permanently removes your bug report.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.del(`/bugs/${b.id}`); qc.invalidateQueries({ queryKey: ["partner-bugs"] }); }
        catch (e: any) { toast.error(e?.detail || "Could not delete"); }
      } },
    ]);
  };

  const inputStyle = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 12, color: colors.text, fontSize: 14 } as any;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" crumbLabel="Report a Bug" />
      <ScrollView testID="partner-report-bug" contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <Icon name="bug-outline" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>Report a Bug</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Found a problem in the app? Let us know and we'll fix it.</Text>
          </View>
        </View>

        {/* Form */}
        <View testID="bug-form" style={{ gap: 14, width: "100%" }}>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 }}>Title</Text>
            <TextInput testID="bug-title" value={title} onChangeText={setTitle} placeholder="e.g. Earnings not updating" placeholderTextColor={colors.textMuted} style={[inputStyle, { height: 46 }]} maxLength={160} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 }}>Category</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <Pressable key={c.key} testID={`bug-category-${c.key}`} onPress={() => setCategory(c.key)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surfaceSubtle }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#fff" : colors.textSecondary }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 }}>Describe the bug</Text>
            <TextInput testID="bug-description" value={desc} onChangeText={setDesc} placeholder="What happened? What did you expect? Steps to reproduce…" placeholderTextColor={colors.textMuted} multiline style={[inputStyle, { minHeight: 110, paddingTop: 10, textAlignVertical: "top" }]} maxLength={4000} />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 }}>Screenshot (optional)</Text>
            {shot ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Image source={{ uri: mediaUrl(shot.thumb_url || shot.url) }} style={{ width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: colors.border }} />
                <Pressable testID="bug-remove-shot" onPress={() => setShot(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border }}>
                  <Icon name="close" size={16} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable testID="bug-attach-shot" onPress={pickShot} disabled={uploading} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, backgroundColor: colors.surfaceSubtle }}>
                {uploading ? <ActivityIndicator color={colors.primary} /> : <><Icon name="camera-outline" size={18} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "700" }}>Attach screenshot</Text></>}
              </Pressable>
            )}
          </View>
          <Pressable testID="bug-submit" onPress={submit} disabled={submitting} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 6, backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? <ActivityIndicator color="#fff" /> : <><Icon name="send" size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Submit Bug Report</Text></>}
          </Pressable>
        </View>

        {/* My reports */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }}>My Reports</Text>
          {q.isLoading ? (
            <View style={{ padding: 30, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
          ) : rows.length === 0 ? (
            <View testID="bug-empty" style={{ alignItems: "center", gap: 8, padding: 30, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }}>
              <Icon name="inbox-outline" size={28} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>No bug reports yet.</Text>
            </View>
          ) : rows.map((b) => (
            <View key={b.id} testID={`bug-row-${b.id}`} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: solved(b.status) ? "#6EE7B7" : colors.border, padding: 14, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.text }}>{b.title}</Text>
                {b.category ? (
                  <View testID={`bug-category-badge-${b.id}`} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>{CAT_LABEL[b.category] || "Other"}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: solved(b.status) ? "#D1FAE5" : "#FEF3C7" }}>
                  <Icon name={solved(b.status) ? "check-circle-outline" : "clock-outline"} size={13} color={solved(b.status) ? "#047857" : "#B45309"} />
                  <Text style={{ fontSize: 11, fontWeight: "800", color: solved(b.status) ? "#047857" : "#B45309" }}>{solved(b.status) ? "Solved" : "Open"}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>{b.description}</Text>
              {b.screenshot_url ? <Image source={{ uri: mediaUrl(b.screenshot_url) }} style={{ width: 96, height: 96, borderRadius: 10, borderWidth: 1, borderColor: colors.border }} /> : null}
              {solved(b.status) && b.resolution_note ? (
                <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10 }}>
                  <Icon name="check-circle-outline" size={16} color="#047857" />
                  <Text style={{ flex: 1, fontSize: 13, color: "#065F46" }}><Text style={{ fontWeight: "800" }}>Resolution: </Text>{b.resolution_note}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</Text>
                {solved(b.status) ? (
                  <Pressable testID={`bug-delete-${b.id}`} onPress={() => removeRow(b)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: "#FEE2E2" }}>
                    <Icon name="delete-outline" size={14} color="#DC2626" /><Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "700" }}>Delete</Text>
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
