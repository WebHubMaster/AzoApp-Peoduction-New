import React from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";

/** App header — sticky, safe-area aware. Plain (surface) or gradient variant. */
export function AppHeader({
  title,
  subtitle,
  back,
  right,
  variant = "plain",
  embedded = false,
  testID,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  variant?: "plain" | "gradient";
  embedded?: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const gradient = variant === "gradient";
  const fg = gradient ? "#FFFFFF" : colors.text;
  const subFg = gradient ? "rgba(255,255,255,0.85)" : colors.textMuted;

  const inner = (
    <View style={{ paddingTop: (embedded ? 12 : insets.top + 6), paddingBottom: 12, paddingHorizontal: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {back ? (
          <Pressable
            testID="header-back-button"
            onPress={() => router.back()}
            hitSlop={10}
            style={{ marginLeft: -6, marginRight: 2 }}
          >
            <Icon name="chevron-left" size={28} color={fg} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text testID={testID} style={{ color: fg, fontSize: fontSize.xl, fontWeight: "800" }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: subFg, fontSize: fontSize.xs, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );

  if (gradient) {
    return (
      <>
        {!embedded ? <StatusBar style="light" /> : null}
        <LinearGradient colors={[colors.primary, colors.primaryHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {inner}
        </LinearGradient>
      </>
    );
  }
  return (
    <>
      {!embedded ? <StatusBar style={colors.text === "#0F172A" ? "dark" : "light"} /> : null}
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>{inner}</View>
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
