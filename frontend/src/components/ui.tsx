import React from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useTheme, makeStyles, spacing, radius, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { initials } from "@/src/lib/format";

/* ------------------------------------------------------------------ Card */
export function Card({
  children,
  style,
  padded = true,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: padded ? spacing.lg : 0,
          boxShadow: "0px 2px 8px rgba(15,23,42,0.05)",
          elevation: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------------------------------------------------------------- Button */
type BtnVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  fullWidth = true,
  size = "md",
  testID,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: MdiName;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
  testID?: string;
}) {
  const { colors } = useTheme();
  const heights = { sm: 40, md: 50, lg: 56 };
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
      ? colors.primarySubtle
      : variant === "danger"
      ? colors.danger
      : "transparent";
  const fg =
    variant === "primary" || variant === "danger"
      ? "#FFFFFF"
      : variant === "secondary"
      ? colors.primary
      : colors.primary;
  const border =
    variant === "outline" ? colors.border : variant === "secondary" ? "transparent" : "transparent";
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => ({
        height: heights[size],
        borderRadius: radius.md,
        backgroundColor: bg,
        borderWidth: variant === "outline" ? 1.5 : 0,
        borderColor: border,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        width: fullWidth ? "100%" : undefined,
        paddingHorizontal: spacing.lg,
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={{ color: fg, fontWeight: "700", fontSize: fontSize.md }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Badge */
type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";
export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: MdiName }) {
  const { colors } = useTheme();
  const map: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: colors.successSubtle, fg: colors.success },
    warning: { bg: colors.warningSubtle, fg: colors.warning },
    danger: { bg: colors.dangerSubtle, fg: colors.danger },
    info: { bg: colors.infoSubtle, fg: colors.info },
    primary: { bg: colors.primarySubtle, fg: colors.primary },
    neutral: { bg: colors.surfaceSubtle, fg: colors.textSecondary },
  };
  const c = map[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        backgroundColor: c.bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
      }}
    >
      {icon ? <Icon name={icon} size={12} color={c.fg} /> : null}
      <Text style={{ color: c.fg, fontSize: fontSize.xs, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function statusTone(status?: string): Tone {
  const s = (status || "").toLowerCase();
  if (["approved", "verified", "completed", "active", "paid", "credit", "online"].includes(s)) return "success";
  if (["pending", "processing", "searching", "assigned"].includes(s)) return "warning";
  if (["rejected", "cancelled", "failed", "offline", "debit", "penalty"].includes(s)) return "danger";
  if (["under_review", "started", "arrived", "in_progress"].includes(s)) return "info";
  return "neutral";
}

/* -------------------------------------------------------------- StatCard */
export function StatCard({
  label,
  value,
  icon,
  tone = "primary",
  sub,
  style,
  testID,
}: {
  label: string;
  value: string;
  icon?: MdiName;
  tone?: Tone;
  sub?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const map: Record<Tone, string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
    primary: colors.primary,
    neutral: colors.textSecondary,
  };
  return (
    <Card style={[{ flex: 1 }, style]} testID={testID}>
      {icon ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: colors.primarySubtle,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.sm,
          }}
        >
          <Icon name={icon} size={18} color={map[tone]} />
        </View>
      ) : null}
      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------- SectionTitle */
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
      <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- Avatar */
export function Avatar({ name, uri, size = 44 }: { name?: string; uri?: string; size?: number }) {
  const { colors } = useTheme();
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primarySubtle,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.primary, fontWeight: "800", fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

/* ----------------------------------------------------------- EmptyState */
export function EmptyState({
  icon = "inbox-outline",
  title,
  subtitle,
  action,
  onAction,
  testID,
}: {
  icon?: MdiName;
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.surfaceSubtle,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
        }}
      >
        <Icon name={icon} size={34} color={colors.textMuted} />
      </View>
      <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800", textAlign: "center" }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: spacing.lg, minWidth: 180 }}>
          <Button title={action} onPress={onAction} size="sm" />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- Skeleton */
export function Skeleton({ height = 16, width = "100%", radius: r = 8, style }: { height?: number; width?: any; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height, width, borderRadius: r, backgroundColor: colors.surfaceSubtle }, style]} />;
}

export function CardSkeleton() {
  return (
    <Card>
      <Skeleton height={14} width="55%" />
      <Skeleton height={26} width="40%" style={{ marginTop: 10 }} />
      <Skeleton height={12} width="70%" style={{ marginTop: 12 }} />
    </Card>
  );
}

/* ----------------------------------------------------------------- Row */
export function InfoRow({ icon, label, value, tone }: { icon?: MdiName; label: string; value?: string; tone?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        {icon ? <Icon name={icon} size={16} color={colors.textMuted} /> : null}
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>{label}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "700", flexShrink: 1, textAlign: "right" }} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------- GradientCard */
export function GradientHeaderCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryHover]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius.lg, padding: spacing.lg, overflow: "hidden" }, style]}
    >
      {children}
    </LinearGradient>
  );
}

/* -------------------------------------------------------------- ListTile */
export function ListTile({
  icon,
  title,
  subtitle,
  right,
  onPress,
  testID,
}: {
  icon?: MdiName;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            backgroundColor: colors.primarySubtle,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={19} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "700" }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right ?? <Icon name="chevron-right" size={22} color={colors.textMuted} />}
    </Pressable>
  );
}
