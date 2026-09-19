import React from "react";
import { View, Text } from "react-native";
import { useTheme, radius, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "info" | "danger" | "violet"; icon: MdiName }> = {
  paid: { label: "Paid", tone: "success", icon: "check-circle" },
  pending: { label: "Pending", tone: "warning", icon: "clock-outline" },
  processing: { label: "Processing", tone: "info", icon: "progress-clock" },
  partially_paid: { label: "Partially Paid", tone: "info", icon: "circle-half-full" },
  refunded: { label: "Refunded", tone: "violet", icon: "backup-restore" },
  cancelled: { label: "Cancelled", tone: "danger", icon: "close-circle" },
  failed: { label: "Failed", tone: "danger", icon: "alert-octagon" },
  rejected: { label: "rejected", tone: "danger", icon: "close-circle" },
};

export function InvStatusBadge({ status }: { status?: string }) {
  const { colors } = useTheme();
  const key = (status || "").toLowerCase().replace(/\s+/g, "_");
  const meta = STATUS[key] || { label: status || "—", tone: "info" as const, icon: "help-circle" as MdiName };
  const toneMap: Record<string, { bg: string; fg: string }> = {
    success: { bg: colors.successSubtle, fg: colors.success },
    warning: { bg: colors.warningSubtle, fg: colors.warning },
    info: { bg: colors.infoSubtle, fg: colors.info },
    danger: { bg: colors.dangerSubtle, fg: colors.danger },
    violet: { bg: "rgba(139,92,246,0.14)", fg: "#8B5CF6" },
  };
  const c = toneMap[meta.tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: c.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill }}>
      <Icon name={meta.icon} size={12} color={c.fg} />
      <Text style={{ color: c.fg, fontSize: fontSize.xs, fontWeight: "700" }}>{meta.label}</Text>
    </View>
  );
}

const TYPE: Record<string, { label: string; color: string }> = {
  booking: { label: "Booking", color: "#2563EB" },
  commission: { label: "Commission", color: "#0D9488" },
  refund: { label: "Refund", color: "#8B5CF6" },
  adjustment: { label: "Adjustment", color: "#64748B" },
  cancellation: { label: "Cancellation", color: "#E11D48" },
  transaction: { label: "Transaction", color: "#4F46E5" },
  withdrawal: { label: "Withdrawal", color: "#D97706" },
};

export function InvTypeChip({ type }: { type?: string }) {
  const meta = TYPE[(type || "").toLowerCase()] || { label: type || "Other", color: "#64748B" };
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: meta.color + "1A", paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.sm }}>
      <Text style={{ color: meta.color, fontSize: fontSize.xs, fontWeight: "700" }}>{meta.label}</Text>
    </View>
  );
}
