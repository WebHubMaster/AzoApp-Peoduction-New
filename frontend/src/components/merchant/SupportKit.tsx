import React from "react";
import { View, Text, Pressable, Linking, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { FileText } from "lucide-react-native";
import { mediaUrl } from "@/src/api/client";
import { SLATE } from "@/src/components/qr/qrKit";
import { useFin } from "@/src/components/merchant/FinanceKit";

/* 1:1 RN port of the shared atoms in web_panel/src/components/SupportCenter.jsx */
export const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };
export const STATUSES = ["open", "in_progress", "resolved", "closed"];
const STATUS_STYLE: Record<string, { bg: string; fg: string; dbg: string; dfg: string }> = {
  open: { bg: "#dbeafe", fg: "#1d4ed8", dbg: "rgba(30,58,138,0.3)", dfg: "#93c5fd" },
  in_progress: { bg: "#fef3c7", fg: "#b45309", dbg: "rgba(120,53,15,0.3)", dfg: "#fcd34d" },
  resolved: { bg: "#d1fae5", fg: "#047857", dbg: "rgba(6,78,59,0.3)", dfg: "#6ee7b7" },
  closed: { bg: "#e2e8f0", fg: "#475569", dbg: "#334155", dfg: "#cbd5e1" },
};
const PRIORITY_STYLE: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#f1f5f9", fg: "#475569" }, medium: { bg: "#e0f2fe", fg: "#0369a1" },
  high: { bg: "#ffedd5", fg: "#c2410c" }, urgent: { bg: "#fee2e2", fg: "#b91c1c" },
};
export const EMERALD600 = "#059669", EMERALD700 = "#047857", EMERALD500 = "#10b981";

export const timeStr = (t?: string) => t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const dateFull = (t?: string) => t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const dayKey = (t?: string) => t ? new Date(t).toDateString() : "";
export const daySep = (t?: string) => {
  if (!t) return "";
  const d = new Date(t), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === y.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};
export const ago = (t?: string) => {
  if (!t) return "";
  const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `about ${Math.floor(s / 3600)} hour${Math.floor(s / 3600) > 1 ? "s" : ""} ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) > 1 ? "s" : ""} ago`;
};
const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

/* px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize */
export function StatusBadge({ status, testID }: { status?: string; testID?: string }) {
  const { dark } = useFin();
  const s = STATUS_STYLE[status || ""] || STATUS_STYLE.closed;
  return <SBadge bg={dark ? s.dbg : s.bg} fg={dark ? s.dfg : s.fg} label={STATUS_LABEL[status || ""] || status || ""} testID={testID} />;
}
export function PriorityBadge({ priority, testID }: { priority?: string; testID?: string }) {
  const s = PRIORITY_STYLE[priority || ""] || PRIORITY_STYLE.low;
  return <SBadge bg={s.bg} fg={s.fg} label={cap(priority || "")} testID={testID} />;
}
function SBadge({ bg, fg, label, testID }: { bg: string; fg: string; label: string; testID?: string }) {
  return (
    <View testID={testID} style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "600", color: fg }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* flex items-start gap-2 py-1.5 · icon 16 slate-400 · label text-xs slate-500 w-24 · value text-xs medium */
export function InfoRow({ icon, label, value, children }: { icon: React.ReactNode; label: string; value?: string; children?: React.ReactNode }) {
  const { strong } = useFin();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[500], width: 96 }}>{label}</Text>
      {children ? <View style={{ flex: 1 }}>{children}</View> : <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: "500", color: strong }}>{value || "—"}</Text>}
    </View>
  );
}

/* attachment: pdf chip (max-w 220) or 96×96 image thumb */
export function AttachmentView({ a, onOpen, style }: { a: any; onOpen?: (url: string) => void; style?: StyleProp<ViewStyle> }) {
  const { dark, body } = useFin();
  const border = dark ? SLATE[700] : SLATE[200];
  if (a.kind === "pdf") {
    return (
      <Pressable onPress={() => Linking.openURL(mediaUrl(a.url) || a.url)} style={[{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: dark ? SLATE[800] : "#fff", paddingHorizontal: 12, paddingVertical: 8, maxWidth: 220 }, style]}>
        <FileText size={16} color="#ef4444" />
        <Text style={{ fontSize: 12, lineHeight: 16, color: body, flexShrink: 1 }} numberOfLines={1}>{a.name || "Document.pdf"}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => onOpen?.(a.url)} style={[{ borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: border }, style]}>
      <Image source={{ uri: mediaUrl(a.thumb_url || a.url) }} style={{ height: 96, width: 96 }} contentFit="cover" />
    </Pressable>
  );
}
