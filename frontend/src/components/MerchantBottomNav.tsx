import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import {
  LayoutDashboard, Users, QrCode, Wallet, MoreHorizontal,
  Store, Network, TrendingUp, CreditCard, Sparkles, LifeBuoy,
  LogOut, X, type LucideIcon,
} from "lucide-react-native";
import { useTheme } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";

/**
 * Merchant bottom navigation — floating "glass" pill that mirrors the web panel's
 * mobile appMode tab bar (PanelLayout.jsx) 1:1, using the SAME lucide icons as web.
 *
 * Primary tabs (web MERCHANT_TABS): Home · Customers · Scan QR · Wallet + More.
 * "More" sheet (web NAV minus primary): Profile & KYC · My Partners · Commission
 * · Bank & KYC · Analytics · Help & Support + Logout.
 */

type Item = { key: string; label: string; icon: LucideIcon; route: string };

const PRIMARY: Item[] = [
  { key: "home", label: "Home", icon: LayoutDashboard, route: "/(merchant)" },
  { key: "customers", label: "Customers", icon: Users, route: "/(merchant)/customers" },
  { key: "scanqr", label: "Scan QR", icon: QrCode, route: "/merchant/scanqr" },
  { key: "wallet", label: "Wallet", icon: Wallet, route: "/(merchant)/wallet" },
];

const MORE: Item[] = [
  { key: "profilekyc", label: "Profile & KYC", icon: Store, route: "/merchant/profilekyc" },
  { key: "partners", label: "My Partners", icon: Network, route: "/merchant/partners" },
  { key: "commission", label: "Commission", icon: TrendingUp, route: "/merchant/commission" },
  { key: "bankkyc", label: "Bank & KYC", icon: CreditCard, route: "/merchant/bankkyc" },
  { key: "analytics", label: "Analytics", icon: Sparkles, route: "/merchant/analytics" },
  { key: "support", label: "Help & Support", icon: LifeBuoy, route: "/support" },
];

/** Map the current route (useSegments) → active primary/more key. */
function useActiveKey(): string {
  const seg = useSegments() as string[];
  const last = seg[seg.length - 1] || "";
  if (last === "(merchant)" || last === "index" || seg.length === 0) return "home";
  if (last === "customers") return "customers";
  if (last === "wallet") return "wallet";
  if (last === "scanqr") return "scanqr";
  const more = MORE.find((m) => last === m.key);
  return more ? more.key : last;
}

export function MerchantBottomNav() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = useActiveKey();
  const activeIsMore = !PRIMARY.some((p) => p.key === active);

  const go = (route: string) => {
    Haptics.selectionAsync().catch(() => {});
    router.replace(route as any);
  };
  const goMore = (route: string) => {
    setMoreOpen(false);
    setTimeout(() => router.push(route as any), 120);
  };

  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, pointerEvents: "box-none" }}>
      <View style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 8, paddingTop: 8, pointerEvents: "box-none" }}>
        <View
          testID="merchant-bottom-nav"
          style={{
            alignSelf: "center", width: "100%", maxWidth: 448, borderRadius: 28,
            boxShadow: "0px 10px 30px -10px rgba(15,23,42,0.35), 0px 4px 12px -6px rgba(15,23,42,0.2)",
            elevation: 12,
          }}
        >
          <BlurView
            intensity={90}
            tint={mode === "dark" ? "dark" : "light"}
            experimentalBlurMethod="dimezisBlurView"
            style={{
              flexDirection: "row", borderRadius: 28, overflow: "hidden", borderWidth: 1,
              borderColor: mode === "dark" ? "rgba(51,65,85,0.6)" : "rgba(255,255,255,0.5)",
              backgroundColor: mode === "dark" ? "rgba(15,23,42,0.94)" : "rgba(255,255,255,0.96)",
              paddingHorizontal: 6, paddingVertical: 4,
            }}
          >
            {PRIMARY.map((p) => (
              <TabButton key={p.key} Icon={p.icon} label={p.label} focused={active === p.key} onPress={() => go(p.route)} testID={`tab-${p.key}`} />
            ))}
            <TabButton Icon={MoreHorizontal} label="More" focused={moreOpen || activeIsMore} onPress={() => setMoreOpen(true)} testID="tab-more" />
          </BlurView>
        </View>
      </View>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setMoreOpen(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: insets.bottom + 20, maxHeight: "88%" }}>
            <View style={{ alignSelf: "center", height: 6, width: 48, borderRadius: 3, backgroundColor: colors.border, marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>All Menu</Text>
              <Pressable testID="more-close" onPress={() => setMoreOpen(false)} hitSlop={10}><X size={22} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
                {MORE.map((it) => {
                  const on = active === it.key;
                  const It = it.icon;
                  return (
                    <Pressable
                      key={it.key}
                      testID={`more-${it.key}`}
                      onPress={() => goMore(it.route)}
                      style={{
                        width: "31%", alignItems: "center", paddingVertical: 12, paddingHorizontal: 6,
                        borderRadius: 16, borderWidth: 1, borderColor: on ? "#BFDBFE" : colors.border,
                        backgroundColor: on ? colors.primarySubtle : colors.surface,
                        boxShadow: "0px 2px 8px rgba(2,32,71,0.04)",
                      }}
                    >
                      <View style={{ height: 44, width: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? "transparent" : colors.surfaceSubtle, overflow: "hidden" }}>
                        {on ? (
                          <LinearGradient colors={[colors.secondary, "#42A5F5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center" }}>
                            <It size={20} color="#fff" strokeWidth={1.9} />
                          </LinearGradient>
                        ) : (
                          <It size={20} color={colors.textMuted} strokeWidth={1.9} />
                        )}
                      </View>
                      <Text numberOfLines={2} style={{ color: on ? colors.primaryHover : colors.textSecondary, fontSize: 11, fontWeight: "600", textAlign: "center", lineHeight: 15, marginTop: 8 }}>{it.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable testID="more-logout" onPress={async () => { setMoreOpen(false); await logout(); router.replace("/(auth)/login"); }} style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 16, backgroundColor: "#FEF2F2" }}>
                <LogOut size={16} color="#DC2626" strokeWidth={2} />
                <Text style={{ color: "#DC2626", fontWeight: "700", fontSize: 14 }}>Logout</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TabButton({ Icon, label, focused, onPress, testID }: { Icon: LucideIcon; label: string; focused: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 8, paddingBottom: 6 }}>
      <View style={{ height: 40, width: 40, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "visible", transform: [{ scale: focused ? 1.05 : 1 }] }}>
        {focused ? (
          <LinearGradient colors={[colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 36, width: 36, borderRadius: 16, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 10px rgba(21,101,192,0.4)", elevation: 4 }}>
            <Icon size={18} color="#fff" strokeWidth={2} />
          </LinearGradient>
        ) : (
          <Icon size={18} color={colors.tabInactive} strokeWidth={2} />
        )}
      </View>
      <Text style={{ fontSize: 10, fontWeight: "600", color: focused ? colors.primary : colors.tabInactive, maxWidth: 64 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default MerchantBottomNav;
