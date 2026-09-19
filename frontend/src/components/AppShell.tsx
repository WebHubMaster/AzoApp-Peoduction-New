import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme, radius } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { api, mediaUrl } from "@/src/api/client";
import { initials } from "@/src/lib/format";

/**
 * Web-panel "appMode" header — floating glass card with brand wordmark on the
 * left and NotificationBell · ThemeToggle · divider · ProfileChip on the right.
 * Mirrors PanelLayout.jsx <header> (mobile) 1:1.
 */
export function AppShellHeader({ profileRoute }: { profileRoute: string }) {
  const { colors, mode, toggleMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const brand = useBrand();
  const [menu, setMenu] = useState(false);

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
            <Pressable testID="edit-profile-button" onPress={() => { setMenu(false); router.push(profileRoute as any); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
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
    </View>
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
