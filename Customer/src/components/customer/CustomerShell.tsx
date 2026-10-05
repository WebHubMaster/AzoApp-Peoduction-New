/**
 * CustomerShell — mobile view of web_panel/src/components/customer/CustomerShell.jsx:
 * sticky mobile header (avatar · deliver-to/brand · bell · theme) + 5-slot bottom nav + "More" sheet.
 */
import React, { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, Modal, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { MapPin, Moon, Sun, MoreHorizontal, LogOut, Globe } from "lucide-react-native";
import { useAuth } from "@/src/context/AuthContext";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useTheme, PRIMARY, SLATE, ROSE, TC } from "@/src/theme";
import { NAV, MOBILE_PRIMARY, NavKey, NavItem } from "@/src/components/customer/nav";
import { mediaUrl } from "@/src/api/client";
import { NotificationBell } from "@/src/components/customer/NotificationBell";
import { useChatOpen, isChatOpen } from "@/src/lib/chatPresence";
import { useRealtime } from "@/src/context/RealtimeContext";

export function Avatar({ user, size = 36 }: { user: any; size?: number }) {
  const initials = (user?.name || "U").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  if (user?.photo) return <Image source={{ uri: mediaUrl(user.photo) }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: "rgba(255,255,255,0.7)" }} contentFit="cover" cachePolicy="memory-disk" />;
  return (
    <LinearGradient colors={[PRIMARY[500], PRIMARY[800]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.7)" }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{initials}</Text>
    </LinearGradient>
  );
}

function ThemeToggle() {
  const { isDark, toggle, c } = useTheme();
  return (
    <Pressable testID="theme-toggle" onPress={toggle} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 6, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {isDark ? <Sun size={20} color="#FCD34D" /> : <Moon size={20} color={TC.textMuted} />}
    </Pressable>
  );
}

export function activeKeyFor(pathname: string): NavKey | null {
  const p = pathname.replace(/^\/\(customer\)/, "") || "/";
  if (p === "/" || p === "/index") return "home";
  const seg = p.split("/").filter(Boolean)[0];
  return (NAV.find((n) => n.key === seg)?.key as NavKey) || null;
}

export default function CustomerShell({ badges = {}, children }: { badges?: Partial<Record<NavKey, number>>; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { branding } = useSiteConfig();
  const { c, isDark } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const chatOpen = useChatOpen();
  const { subscribe } = useRealtime();

  // Pleasant chime when a support reply arrives while the user is NOT viewing the
  // chat (inside the chat it stays silent — SupportThread only fires a haptic).
  const playChime = useCallback(() => {
    if (Platform.OS === "web") return;
    try {
      const AA = require("expo-audio");
      const p = AA.createAudioPlayer(require("../../../assets/sounds/message-chime.wav"));
      try { p.volume = 0.6; } catch { /* ignore */ }
      p.seekTo?.(0); p.play();
      setTimeout(() => { try { p.pause(); p.remove?.(); } catch { /* ignore */ } }, 1600);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => subscribe((ev) => {
    if (ev?.type === "support_message" && !isChatOpen()) playChime();
  }), [subscribe, playChime]);

  const active = activeKeyFor(pathname);
  const brandLogo = (isDark ? branding.logo_dark || branding.logo_light : branding.logo_light || branding.logo_dark) || "";
  const brandName = branding.site_name || "AzoApp";
  const primaryNav = MOBILE_PRIMARY.map((k) => NAV.find((n) => n.key === k)!).filter(Boolean);
  const moreNav = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.key));
  const location = user?.addresses?.find((a: any) => a.is_default)?.city || user?.addresses?.[0]?.city || "Patna";

  const go = (n: NavItem) => { setMoreOpen(false); router.push(n.route as any); };
  const doLogout = async () => { setMoreOpen(false); await logout(); router.replace("/(site)"); };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Mobile header */}
      <View testID="customer-header" style={{ paddingTop: insets.top, backgroundColor: isDark ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.92)", borderBottomWidth: 1, borderBottomColor: isDark ? SLATE[800] : "rgba(226,232,240,0.7)", zIndex: 30 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, height: 56 }}>
          <Pressable testID="m-avatar" onPress={() => go(NAV.find((n) => n.key === "profile")!)}><Avatar user={user} size={36} /></Pressable>
          {brandLogo ? (
            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}>
              <Image testID="app-brand-logo" source={{ uri: brandLogo }} style={{ height: 36, width: 160 }} contentFit="contain" contentPosition="left" />
            </View>
          ) : (
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MapPin size={12} color={PRIMARY[600]} /><Text style={{ fontSize: 11, color: c.textFaint }}>Deliver to</Text>
              </View>
              <Text testID="header-location" numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: isDark ? "#fff" : TC.text, lineHeight: 18 }}>{location}</Text>
            </View>
          )}
          <Pressable testID="m-goto-site" onPress={() => router.replace("/(site)")} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 6, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Globe size={20} color={isDark ? PRIMARY[300] : PRIMARY[700]} />
          </Pressable>
          <NotificationBell />
          <ThemeToggle />
        </View>
      </View>

      {/* Page content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>

      {/* Bottom nav */}
      {!chatOpen && (
      <View testID="m-bottom-nav" style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.95)", borderTopWidth: 1, borderTopColor: c.border, paddingBottom: insets.bottom, flexDirection: "row" }}>
        {primaryNav.map((n) => {
          const on = active === n.key;
          const badge = badges[n.key] || 0;
          const color = on ? (isDark ? PRIMARY[300] : PRIMARY[700]) : SLATE[400];
          return (
            <Pressable key={n.key} testID={`m-nav-${n.key}`} onPress={() => go(n)} style={({ pressed }) => ({ flex: 1, height: 64, alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 8, paddingBottom: 6, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <NavIcon on={on} icon={n.icon} badge={badge} testID={`m-nav-${n.key}-badge`} />
              <Text style={{ fontSize: 10, fontWeight: "700", color }}>{n.short || n.label}</Text>
            </Pressable>
          );
        })}
        <Pressable testID="m-nav-more" onPress={() => setMoreOpen(true)} style={({ pressed }) => ({ flex: 1, height: 64, alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 8, paddingBottom: 6, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <NavIcon on={moreOpen || moreNav.some((n) => n.key === active)} icon={MoreHorizontal} />
          <Text style={{ fontSize: 10, fontWeight: "700", color: moreOpen || moreNav.some((n) => n.key === active) ? (isDark ? PRIMARY[300] : PRIMARY[700]) : TC.textFaint }}>More</Text>
        </Pressable>
      </View>
      )}

      {/* More sheet */}
      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} onPress={() => setMoreOpen(false)} />
        <View testID="more-sheet" style={{ backgroundColor: c.surface, borderTopLeftRadius: 6, borderTopRightRadius: 6, padding: 24, paddingBottom: insets.bottom + 24 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: c.text, marginBottom: 8 }}>More</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingBottom: 8 }}>
            {moreNav.map((n) => {
              const on = active === n.key;
              return (
                <Pressable key={n.key} testID={`more-${n.key}`} onPress={() => go(n)}
                  style={({ pressed }) => ({ width: "30.5%", flexGrow: 1, alignItems: "center", gap: 8, borderRadius: 6, padding: 16, borderWidth: 1,
                    borderColor: on ? (isDark ? PRIMARY[700] : PRIMARY[300]) : c.border, backgroundColor: on ? c.primarySoft : c.surface, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                  <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: isDark ? "rgba(7,52,115,0.40)" : PRIMARY[100], alignItems: "center", justifyContent: "center" }}>
                    <n.icon size={20} color={c.primaryText} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "600", textAlign: "center", color: isDark ? SLATE[200] : TC.text2 }}>{n.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable testID="more-logout" onPress={doLogout} style={({ pressed }) => ({ marginTop: 8, height: 48, borderRadius: 6, backgroundColor: isDark ? "rgba(136,19,55,0.20)" : ROSE[50], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <LogOut size={16} color={ROSE[600]} /><Text style={{ color: ROSE[600], fontWeight: "700", fontSize: 14 }}>Logout</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

/** Web PanelLayout parity: active tab = 36px rounded-2xl blue gradient with white icon + soft glow; inactive = grey outline icon. */
function NavIcon({ on, icon: IconCmp, badge = 0, testID }: { on: boolean; icon: any; badge?: number; testID?: string }) {
  const inner = (
    <>
      <IconCmp size={18} color={on ? "#fff" : TC.textFaint} strokeWidth={2} />
      {badge > 0 ? (
        <View testID={testID} style={{ position: "absolute", top: -4, right: -4, height: 16, minWidth: 16, paddingHorizontal: 4, borderRadius: 6, backgroundColor: ROSE[500], alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" }}>
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
    </>
  );
  if (!on) return <View style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center" }}>{inner}</View>;
  return (
    <LinearGradient colors={[PRIMARY[600], PRIMARY[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 36, width: 36, borderRadius: 6, alignItems: "center", justifyContent: "center", transform: [{ scale: 1.05 }], boxShadow: "0px 4px 12px rgba(37,99,235,0.40)" } as any}>
      {inner}
    </LinearGradient>
  );
}
