import React, { useState, useEffect } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme, radius } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { api, mediaUrl } from "@/src/api/client";
import { initials } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

/**
 * Web-panel "appMode" header — floating glass card with brand wordmark on the
 * left and NotificationBell · ThemeToggle · divider · ProfileChip on the right.
 * Mirrors PanelLayout.jsx <header> (mobile) 1:1.
 */
export function AppShellHeader({ profileRoute, crumbLabel, panelTitle }: { profileRoute: string; crumbLabel?: string; panelTitle?: string }) {
  const { colors, mode, toggleMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const brand = useBrand();
  const [menu, setMenu] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const notifs = useQuery({ queryKey: ["partner-notifs"], queryFn: () => api.get<any[]>("/notifications"), refetchInterval: 30000 });
  const unread = (notifs.data || []).filter((n) => !n.read).length;
  const logo = mode === "dark" ? brand.branding.logo_dark || brand.branding.logo : brand.branding.logo || brand.branding.logo_light;
  const dark = mode === "dark";

  const iconBtn = {
    height: 36,
    width: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  return (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, backgroundColor: colors.background }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View
        testID="app-shell-header"
        style={{
          backgroundColor: dark ? "rgba(30,41,59,0.92)" : "rgba(255,255,255,0.92)",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: dark ? colors.border : "rgba(255,255,255,0.6)",
          minHeight: 56,
          paddingVertical: 8,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          boxShadow: "0px 6px 20px rgba(2,32,71,0.08)",
          elevation: 3,
        }}
      >
        {/* Brand */}
        <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }} testID="app-brand">
          {logo ? (
            <Image source={{ uri: mediaUrl(logo) }} style={{ height: 40, width: 150 }} contentFit="contain" contentPosition="left" />
          ) : crumbLabel ? (
            /* Web PanelLayout appMode brand: initial square + page crumb + panel title */
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <LinearGradient colors={[colors.secondary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 10px rgba(21,101,192,0.3)", elevation: 3 }}>
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900", fontFamily: "PublicSans-ExtraBold" }}>{(brand.branding.site_name || "A")[0]}</Text>
              </LinearGradient>
              <View style={{ minWidth: 0 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800", fontFamily: "PublicSans-ExtraBold", lineHeight: 17 }} numberOfLines={1}>{crumbLabel}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }} numberOfLines={1}>{panelTitle || ""}</Text>
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ color: colors.primary, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, lineHeight: 28 }} numberOfLines={1}>
                {brand.branding.site_name}
              </Text>
              <Text style={{ color: colors.primary, fontSize: 7.5, fontWeight: "700", marginTop: -2, letterSpacing: 0.2 }} numberOfLines={1}>
                — {brand.branding.tagline || "Service at Your Doorstep"} —
              </Text>
            </View>
          )}
        </View>

        {/* Bell */}
        <Pressable testID="partner-notifications" onPress={() => router.push(profileRoute.startsWith("/(partner)") ? "/partner/notifications" : "/notifications")} style={iconBtn}>
          <Icon name="bell-outline" size={17} color={colors.textMuted} />
          {unread > 0 ? (
            <View style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface }}>
              <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>

        {/* Theme */}
        <Pressable testID="theme-toggle" onPress={toggleMode} style={iconBtn}>
          <Icon name={dark ? "weather-night" : "white-balance-sunny"} size={17} color={colors.textMuted} />
        </Pressable>

        <View style={{ height: 24, width: 1, backgroundColor: colors.border }} />

        {/* Profile chip */}
        <Pressable testID="partner-profile-chip" onPress={() => setMenu(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingLeft: 2, paddingRight: 4, borderRadius: 8 }}>
          {user?.photo ? (
            <Image source={{ uri: mediaUrl(user.photo) }} style={{ width: 28, height: 28, borderRadius: 8 }} contentFit="cover" />
          ) : (
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{initials(user?.name)}</Text>
            </View>
          )}
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Profile dropdown (web ProfileChip menu) */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setMenu(false)}>
          <View style={{ position: "absolute", right: 16, top: insets.top + 12 + 56, width: 224, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 6, boxShadow: "0px 12px 32px rgba(15,23,42,0.18)", elevation: 8 }}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{user?.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{user?.phone}</Text>
            </View>
            <Pressable testID="edit-profile-button" onPress={() => { setMenu(false); setEditOpen(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
              <Icon name="account-outline" size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "500" }}>Edit Profile</Text>
            </Pressable>
            <Pressable testID="logout-button" onPress={async () => { setMenu(false); await logout(); router.replace("/(auth)/login"); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
              <Icon name="logout" size={16} color="#DC2626" />
              <Text style={{ color: "#DC2626", fontSize: 14, fontWeight: "500" }}>Logout</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ProfileEditModal open={editOpen} onClose={() => setEditOpen(false)} />
    </View>
  );
}

/**
 * Edit Profile dialog — mirrors the web panel's ProfileEditModal (PanelLayout.jsx)
 * 1:1: photo picker + name/email/phone, approved partners/merchants are LOCKED to
 * photo-only edits, and it PUTs /auth/profile then refreshes the auth user.
 */
export function ProfileEditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) { setName(user.name || ""); setEmail((user as any).email || ""); setPhoto((user as any).photo || ""); }
  }, [open, user]);

  const role = (user as any)?.role;
  const approved = (user as any)?.kyc_status === "approved" || (user as any)?.verified_partner || (user as any)?.verified_merchant;
  const locked = (role === "partner" || role === "merchant") && !!approved;

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.error("Please allow photo access to change your picture."); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (a?.base64) { setPhoto(`data:${a.mimeType || "image/jpeg"};base64,${a.base64}`); toast.info("Photo ready — don't forget to save."); }
    } catch { toast.error("Could not open the gallery. Please try again."); }
  };

  const save = async () => {
    if (!locked && !name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = locked ? { photo } : { name: name.trim(), email: email.trim(), photo };
      const data = await api.put<any>("/auth/profile", payload);
      setUser(data);
      toast.success("Profile updated");
      onClose();
    } catch (e: any) {
      toast.error(e?.detail || e?.message || "Could not update profile");
    } finally { setSaving(false); }
  };

  const avatarUri = photo ? (photo.startsWith("data:") ? photo : mediaUrl(photo)) : undefined;
  const label = { color: colors.textMuted, fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.4, textTransform: "uppercase" as const };
  const field = (editable: boolean) => ({
    height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: editable ? colors.surface : colors.surfaceSubtle,
    paddingHorizontal: 12, color: editable ? colors.text : colors.textMuted, fontSize: 15, marginTop: 6,
  });

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
          <View testID="profile-edit-modal" style={{ width: "100%", maxWidth: 440, maxHeight: "90%", backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, boxShadow: "0px 20px 50px rgba(15,23,42,0.25)", elevation: 12 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Edit Profile</Text>
                <Pressable testID="profile-edit-close" onPress={onClose} hitSlop={10}><Icon name="close" size={20} color={colors.textMuted} /></Pressable>
              </View>

              {locked ? (
                <View testID="profile-locked-banner" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", borderRadius: 12, borderWidth: 1, borderColor: "#FDE68A", backgroundColor: "#FFFBEB", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 }}>
                  <Icon name="shield-check" size={16} color="#B45309" />
                  <Text style={{ flex: 1, color: "#92400E", fontSize: 12.5, lineHeight: 18 }}>Your profile is approved and locked. You can update only your profile picture — contact admin to change other details.</Text>
                </View>
              ) : null}

              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <View style={{ width: 88, height: 88 }}>
                  <View style={{ width: 88, height: 88, borderRadius: 44, overflow: "hidden", backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={{ width: 88, height: 88 }} contentFit="cover" />
                    ) : (
                      <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 30 }}>{initials(name || user?.name)}</Text>
                    )}
                  </View>
                  <Pressable testID="profile-photo-btn" onPress={pickPhoto} style={{ position: "absolute", bottom: -2, right: -2, height: 32, width: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface }}>
                    <Icon name="camera" size={16} color="#fff" />
                  </Pressable>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>Tap the camera to change your photo</Text>
              </View>

              <View style={{ gap: 14 }}>
                <View>
                  <Text style={label}>Name</Text>
                  <TextInput testID="profile-name-input" value={name} onChangeText={setName} editable={!locked} placeholder="Your name" placeholderTextColor={colors.textMuted} style={field(!locked)} />
                </View>
                <View>
                  <Text style={label}>Email</Text>
                  <TextInput testID="profile-email-input" value={email} onChangeText={setEmail} editable={!locked} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={colors.textMuted} style={field(!locked)} />
                </View>
                <View>
                  <Text style={label}>Phone</Text>
                  <TextInput value={user?.phone || ""} editable={false} style={field(false)} />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                <Pressable testID="profile-cancel-btn" onPress={onClose} style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "600" }}>Cancel</Text>
                </Pressable>
                <Pressable testID="profile-save-btn" onPress={save} disabled={saving} style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: saving ? 0.7 : 1 }}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="content-save" size={16} color="#fff" />}
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{saving ? "Saving…" : "Save"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ── web partner kit primitives (kit.jsx / FinanceKit.jsx) ── */

export const STATUS_TONE: Record<string, "emerald" | "amber" | "rose" | "blue" | "slate" | "violet"> = {
  completed: "emerald", paid: "emerald", verified: "emerald", approved: "emerald", active: "emerald", online: "emerald", success: "emerald", credit: "emerald",
  pending: "amber", processing: "amber", waiting: "amber", in_progress: "amber", started: "amber", incomplete: "amber",
  rejected: "rose", failed: "rose", cancelled: "rose", canceled: "rose", offline: "rose", inactive: "rose", reversed: "rose", debit: "rose",
  assigned: "blue", new: "blue", open: "blue", adjusted: "blue", arrived_customer: "blue", arrived_shop: "blue", under_review: "blue", submitted: "blue",
};
export const TONE_COLORS = {
  emerald: { bg: "#D1FAE5", fg: "#047857", dot: "#10B981" },
  amber: { bg: "#FEF3C7", fg: "#B45309", dot: "#F59E0B" },
  rose: { bg: "#FFE4E6", fg: "#BE123C", dot: "#F43F5E" },
  blue: { bg: "#DBEAFE", fg: "#1D4ED8", dot: "#3B82F6" },
  violet: { bg: "#EDE9FE", fg: "#6D28D9", dot: "#8B5CF6" },
  slate: { bg: "#F1F5F9", fg: "#475569", dot: "#94A3B8" },
};

export function StatusBadge({ status, label }: { status?: string; label?: string }) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  const c = TONE_COLORS[STATUS_TONE[key] || "slate"];
  const text = label || (key ? key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "—");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: "600" }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** Surface — rounded-2xl white card, border slate-200/80, shadow-card */
export function Surface({ children, style, testID }: { children: React.ReactNode; style?: any; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, boxShadow: "0px 4px 16px rgba(2,32,71,0.05)", elevation: 1 }, style]}>
      {children}
    </View>
  );
}

/** kit EmptyState — 56px slate square icon, bold title, muted desc */
export function KitEmpty({ icon, title, desc, action, testID }: { icon: any; title: string; desc?: string; action?: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Icon name={icon} size={28} color="#94A3B8" />
      </View>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, textAlign: "center" }}>{title}</Text>
      {desc ? <Text style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 4, maxWidth: 320, lineHeight: 20 }}>{desc}</Text> : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

/** FinanceKit SegTabs — slate pill container with white active tab */
export function SegTabs({ tabs, value, onChange, testidPrefix = "tab" }: { tabs: string[]; value: string; onChange: (v: string) => void; testidPrefix?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.surfaceSubtle }}>
      {tabs.map((t) => {
        const on = value === t;
        return (
          <Pressable key={t} testID={`${testidPrefix}-${t}`} onPress={() => onChange(t)} style={{ paddingHorizontal: 16, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.surface : "transparent", boxShadow: on ? "0px 1px 3px rgba(15,23,42,0.08)" : undefined }}>
            <Text style={{ color: on ? colors.primary : colors.textMuted, fontSize: 14, fontWeight: "600", textTransform: "capitalize" }}>{t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** FinanceKit KV row */
export function KV({ k, v, mono, strong }: { k: string; v: React.ReactNode; mono?: boolean; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle }}>
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{k}</Text>
      {typeof v === "string" || typeof v === "number" ? (
        <Text style={{ color: strong ? colors.text : colors.textSecondary, fontSize: 14, fontWeight: strong ? "700" : "500", textAlign: "right", fontFamily: mono ? "monospace" : undefined, flexShrink: 1 }}>{v}</Text>
      ) : v}
    </View>
  );
}

/** Web money(): always 2 decimals */
export const money = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const shortDate = (s?: string) => { try { return new Date(s || "").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return (s || "").slice(0, 10); } };
