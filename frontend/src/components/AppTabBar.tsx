import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme, radius, fontSize, spacing } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";

export interface MoreItem {
  key: string;
  label: string;
  icon: MdiName;
  onPress: () => void;
  active?: boolean;
  badge?: number;
}

const TAB_META: Record<string, { label: string; icon: MdiName }> = {
  index: { label: "Dashboard", icon: "view-dashboard-outline" },
  map: { label: "Map QR", icon: "qrcode-scan" },
  jobs: { label: "Job Request", icon: "briefcase-outline" },
  active: { label: "Active Job", icon: "navigation-variant-outline" },
  wallet: { label: "Wallet & Withdraw", icon: "wallet-outline" },
  customers: { label: "Customers", icon: "account-group-outline" },
  profile: { label: "Profile", icon: "account-circle-outline" },
};

/**
 * Floating "glass" pill bottom navigation — mirrors the web panel's appMode
 * mobile tab bar: gradient active icon squares + a "More" sheet with the full menu.
 */
export function AppTabBar({
  state,
  navigation,
  moreItems = [],
  onLogout,
  hideTabs = [],
  hideBarRoutes = [],
  badges = {},
}: BottomTabBarProps & { moreItems?: MoreItem[]; onLogout?: () => void; hideTabs?: string[]; hideBarRoutes?: string[]; badges?: Record<string, number> }) {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);

  // Full-screen routes (e.g. the support chat thread) hide the entire bar so it
  // never overlaps a bottom composer / intercepts its touches.
  if (hideBarRoutes.includes(state.routes[state.index]?.name)) return null;

  const routes = state.routes.filter((r) => TAB_META[r.name] && !hideTabs.includes(r.name));

  const go = (name: string, key: string) => {
    Haptics.selectionAsync().catch(() => {});
    const target = state.routes.find((r) => r.name === name);
    const isFocused = state.index === state.routes.findIndex((r) => r.name === name);
    const event = navigation.emit({ type: "tabPress", target: target?.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(name as never);
  };

  const activeName = state.routes[state.index]?.name;
  const activeIsMore = !routes.some((r) => r.name === activeName);

  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, pointerEvents: "box-none" }}>
      <View style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 8, paddingTop: 8, pointerEvents: "box-none" }}>
        <View
          testID="app-bottom-nav"
          style={{
            alignSelf: "center",
            width: "100%",
            maxWidth: 448,
            borderRadius: 28,
            boxShadow: "0px 10px 30px -10px rgba(15,23,42,0.35), 0px 4px 12px -6px rgba(15,23,42,0.2)",
            elevation: 12,
          }}
        >
          {/* Frosted-glass pill — mirrors the web panel's `.glass` (rgba(255,255,255,0.72) + blur(18px) saturate) */}
          <BlurView
            intensity={40}
            tint={mode === "dark" ? "dark" : "light"}
            experimentalBlurMethod="dimezisBlurView"
            style={{
              flexDirection: "row",
              borderRadius: 28,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: mode === "dark" ? "rgba(51,65,85,0.6)" : "rgba(255,255,255,0.5)",
              backgroundColor: mode === "dark" ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.72)",
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
          >
            {routes.map((r) => {
              const meta = TAB_META[r.name];
              const focused = state.routes[state.index]?.name === r.name;
              return <TabButton key={r.key} icon={meta.icon} label={meta.label} focused={focused} badge={badges[r.name]} onPress={() => go(r.name, r.key)} />;
            })}
            {moreItems.length > 0 ? (
              <TabButton icon="dots-horizontal" label="More" focused={moreOpen || activeIsMore} onPress={() => setMoreOpen(true)} testID="tab-more" />
            ) : null}
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
              <Pressable testID="more-close" onPress={() => setMoreOpen(false)} hitSlop={10}><Icon name="close" size={22} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
                {moreItems.map((it) => (
                  <Pressable
                    key={it.key}
                    testID={`more-${it.key}`}
                    onPress={() => { setMoreOpen(false); setTimeout(it.onPress, 120); }}
                    style={{
                      width: "31%",
                      alignItems: "center",
                      paddingTop: 12,
                      paddingBottom: 12,
                      paddingHorizontal: 6,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: it.active ? "#BFDBFE" : colors.border,
                      backgroundColor: it.active ? colors.primarySubtle : colors.surface,
                      boxShadow: "0px 2px 8px rgba(2,32,71,0.04)",
                    }}
                  >
                    <View style={{ height: 44, width: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: it.active ? "transparent" : colors.surfaceSubtle, overflow: "hidden" }}>
                      {it.active ? (
                        <LinearGradient colors={[colors.secondary, "#42A5F5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 44, width: 44, alignItems: "center", justifyContent: "center" }}>
                          <Icon name={it.icon} size={20} color="#fff" />
                        </LinearGradient>
                      ) : (
                        <Icon name={it.icon} size={20} color={colors.textMuted} />
                      )}
                    </View>
                    <Text numberOfLines={2} style={{ color: it.active ? colors.primaryHover : colors.textSecondary, fontSize: 11, fontWeight: "600", textAlign: "center", lineHeight: 15, marginTop: 8 }}>{it.label}</Text>
                  </Pressable>
                ))}
              </View>
              {onLogout ? (
                <Pressable testID="more-logout" onPress={() => { setMoreOpen(false); setTimeout(onLogout, 120); }} style={{ marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 16, backgroundColor: "#FEF2F2" }}>
                  <Icon name="logout" size={16} color="#DC2626" />
                  <Text style={{ color: "#DC2626", fontWeight: "700", fontSize: 14 }}>Logout</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TabButton({ icon, label, focused, onPress, testID, badge }: { icon: MdiName; label: string; focused: boolean; onPress: () => void; testID?: string; badge?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID || `tab-${label.toLowerCase().split(" ")[0]}`} onPress={onPress} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 8, paddingBottom: 6 }}>
      <View style={{ height: 40, width: 40, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "visible", transform: [{ scale: focused ? 1.05 : 1 }] }}>
        {focused ? (
          <LinearGradient colors={[colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 36, width: 36, borderRadius: 16, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 10px rgba(21,101,192,0.4)", elevation: 4 }}>
            <Icon name={icon} size={18} color="#fff" />
          </LinearGradient>
        ) : (
          <Icon name={icon} size={18} color={colors.tabInactive} />
        )}
        {badge && badge > 0 ? (
          <View style={{ position: "absolute", top: 0, right: 0, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface }}>
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 10, fontWeight: "600", color: focused ? colors.primary : colors.tabInactive, maxWidth: 64 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
