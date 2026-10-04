import React from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";

/** App header — REMOVED app-wide per product decision. We no longer render a page
 * title/subtitle bar on any screen. For non-embedded (standalone) screens we still
 * emit a thin safe-area spacer + StatusBar so content never sits under the notch.
 * Props kept for backwards-compatibility with existing call sites. */
export function AppHeader({
  embedded = false,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  variant?: "plain" | "gradient";
  embedded?: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (embedded) return null;
  return (
    <>
      <StatusBar style={colors.text === "#0F172A" ? "dark" : "light"} />
      <View style={{ height: insets.top, backgroundColor: colors.background }} />
    </>
  );
}

export function HeaderIconButton({ icon, onPress, badge, testID }: { icon: MdiName; onPress?: () => void; badge?: number; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={8} style={{ padding: 4 }}>
      <Icon name={icon} size={24} color={colors.text === "#0F172A" ? colors.text : "#FFFFFF"} />
      {badge && badge > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Scrollable screen body with pull-to-refresh, themed background. */
export function ScreenScroll({
  children,
  refreshing,
  onRefresh,
  contentStyle,
  bottomInset = true,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  bottomInset?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        { padding: spacing.lg, paddingBottom: (bottomInset ? insets.bottom : 0) + 96, gap: spacing.lg },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function ScreenContainer({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
}
