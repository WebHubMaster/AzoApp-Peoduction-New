import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { Bell, ChevronDown, LogOut, X, User as UserIcon, ShieldCheck, Save } from "lucide-react-native";
import { Image } from "expo-image";
import { useTheme } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { useBrand } from "@/src/context/BrandContext";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";


/* ─────────────── Notification bell (dynamic /notifications + unread badge) ─────────────── */
function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const notifs = useQuery({ queryKey: ["partner-notifs"], queryFn: () => api.get<any[]>("/notifications"), refetchInterval: 30000 });
  const unread = (Array.isArray(notifs.data) ? notifs.data : []).filter((n) => !n.read).length;
  return (
    <>
      <Pressable testID="notif-bell" onPress={() => router.push("/merchant/notifications" as any)} hitSlop={6}
        style={{ height: 38, width: 38, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <Bell size={18} color={colors.textSecondary} strokeWidth={1.9} />
        {unread > 0 ? (
          <View style={{ position: "absolute", top: -6, right: -6, height: 18, minWidth: 18, paddingHorizontal: 4, borderRadius: 6, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface }}>
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </>
  );
}

/* ─────────────── Edit Profile modal (PUT /auth/profile) ─────────────── */
function EditProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && user) { setName(user.name || ""); setEmail(user.email || ""); } }, [open, user]);
  const role = user?.role;
  const approved = user?.kyc_status === "approved" || user?.verified_partner || user?.verified_merchant;
  const locked = (role === "partner" || role === "merchant") && !!approved;
  const save = async () => {
    if (!locked && !name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = locked ? {} : { name: name.trim(), email: email.trim() };
      const data = await api.put<any>("/auth/profile", payload);
      setUser(data);
      toast.success("Profile updated");
      onClose();
    } catch (e: any) { toast.error(e?.detail || "Could not update profile"); }
    setSaving(false);
  };
  const L = (s: string) => <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", color: colors.textMuted }}>{s}</Text>;
  const field = { height: 46, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, marginTop: 6, color: colors.text, fontSize: 15 } as const;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, maxHeight: "90%", backgroundColor: colors.card, borderTopLeftRadius: 6, borderTopRightRadius: 6 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 28 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>Edit Profile</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={20} color={colors.textMuted} /></Pressable>
          </View>
          {locked ? (
            <View testID="profile-locked-banner" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.warningSubtle, borderWidth: 1, borderColor: colors.warning, borderRadius: 6, padding: 12, marginBottom: 14 }}>
              <ShieldCheck size={16} color={colors.warning} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12.5, color: colors.warning }}>Your profile is approved and locked — contact admin to change your details.</Text>
            </View>
          ) : null}
          <View style={{ gap: 12 }}>
            <View>{L("Name")}<TextInput testID="profile-name-input" value={name} onChangeText={setName} editable={!locked} placeholder="Your name" placeholderTextColor={colors.textMuted} style={[field, { opacity: locked ? 0.6 : 1 }]} /></View>
            <View>{L("Email")}<TextInput testID="profile-email-input" value={email} onChangeText={setEmail} editable={!locked} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.textMuted} style={[field, { opacity: locked ? 0.6 : 1 }]} /></View>
            <View>{L("Phone")}<TextInput value={user?.phone || ""} editable={false} style={[field, { opacity: 0.6 }]} /></View>
          </View>
          <Pressable testID="profile-save-btn" onPress={save} disabled={saving}
            style={{ marginTop: 18, height: 48, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: saving ? 0.7 : 1 }}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={16} color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}

/* ─────────────── Profile chip (avatar + dropdown: edit / logout) ─────────────── */
function ProfileChip() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const initials = (user?.name || "A").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const photo = mediaUrl((user as any)?.photo);
  return (
    <>
      <Pressable testID="profile-chip" onPress={() => setOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingLeft: 3, paddingRight: 6, borderRadius: 6 }}>
        <View style={{ height: 30, width: 30, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {photo ? <Image testID="profile-chip-photo" source={{ uri: photo }} style={{ height: 30, width: 30 }} contentFit="cover" /> : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{initials}</Text>}
        </View>
        <ChevronDown size={16} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={() => setOpen(false)} />
        <View style={{ position: "absolute", top: insets.top + 58, right: 12, width: 232, backgroundColor: colors.card, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 6, boxShadow: "0px 12px 40px rgba(2,6,23,0.25)" }}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "800", color: colors.text }}>{user?.name || "—"}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{user?.phone || ""}</Text>
          </View>
          <Pressable testID="edit-profile-button" onPress={() => { setOpen(false); setEdit(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 6 }}>
            <UserIcon size={16} color={colors.textSecondary} /><Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary }}>Edit Profile</Text>
          </Pressable>
          <Pressable testID="logout-button" onPress={async () => { setOpen(false); await logout(); router.replace("/(auth)/welcome"); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 6 }}>
            <LogOut size={16} color="#DC2626" /><Text style={{ fontSize: 14, fontWeight: "700", color: "#DC2626" }}>Logout</Text>
          </Pressable>
        </View>
      </Modal>
      <EditProfileModal open={edit} onClose={() => setEdit(false)} />
    </>
  );
}

/**
 * Persistent merchant top navbar — mirrors the web PanelLayout appMode header:
 * brand logo on the left (same as the partner header), notification bell + profile
 * chip on the right. Rendered by the merchant layouts so it shows on every page.
 */
export function MerchantTopBar() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const brand = useBrand();
  const b = brand?.branding || ({} as any);
  // Match web PanelLayout: dark mode → logo_dark (fallback light), else logo_light (fallback dark/logo).
  const logo = mediaUrl(
    (mode === "dark" ? b.logo_dark || b.logo_light : b.logo_light || b.logo_dark) || b.logo,
  );
  const brandName = b.site_name || "AzoApp";
  const dark = mode === "dark";
  // Same as the partner header: full-size brand logo (or site name + tagline) — no page title.
  return (
    <View style={{ backgroundColor: colors.background, paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8 }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View testID="merchant-top-bar" style={{ backgroundColor: dark ? "rgba(30,41,59,0.92)" : "rgba(255,255,255,0.92)", borderRadius: 6, borderWidth: 1, borderColor: dark ? colors.border : "rgba(255,255,255,0.6)", paddingHorizontal: 12, paddingVertical: 8, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, boxShadow: "0px 6px 20px rgba(2,32,71,0.08)", elevation: 3 }}>
        <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }} testID="merchant-brand">
          {logo ? (
            <Image testID="merchant-brand-logo" source={{ uri: logo }} style={{ height: 40, width: 150 }} contentFit="contain" contentPosition="left" transition={150} />
          ) : (
            <View testID="merchant-brand-fallback">
              <Text style={{ color: colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, lineHeight: 28 }} numberOfLines={1}>{brandName}</Text>
              <Text style={{ color: colors.primary, fontSize: 7.5, fontWeight: "700", marginTop: -2, letterSpacing: 0.2 }} numberOfLines={1}>— {b.tagline || "Service at Your Doorstep"} —</Text>
            </View>
          )}
        </View>
        <NotificationBell />
        <ProfileChip />
      </View>
    </View>
  );
}

export default MerchantTopBar;
