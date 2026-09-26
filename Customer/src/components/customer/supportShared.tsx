/** Shared helpers for Support Center (port of web SupportCenter.jsx constants). */
import React from "react";
import { View, Text, Pressable, Platform, Linking } from "react-native";
import { Image } from "expo-image";
import { FileText } from "lucide-react-native";
import { SLATE, BLUE, AMBER, EMERALD, SKY } from "../../theme";

export const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open: { bg: BLUE[100], fg: BLUE[700] }, in_progress: { bg: AMBER[100], fg: AMBER[700] },
  resolved: { bg: EMERALD[100], fg: EMERALD[700] }, closed: { bg: SLATE[200], fg: SLATE[600] },
};
export const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };
export const PRIORITY_STYLE: Record<string, { bg: string; fg: string }> = {
  low: { bg: SLATE[100], fg: SLATE[600] }, medium: { bg: SKY[100], fg: SKY[700] }, high: { bg: "#FFEDD5", fg: "#C2410C" }, urgent: { bg: "#FEE2E2", fg: "#B91C1C" },
};
export const STATUSES = ["open", "in_progress", "resolved", "closed"];

export const timeStr = (t?: string) => t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const dateFull = (t?: string) => t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const dayKey = (t?: string) => t ? new Date(t).toDateString() : "";
export const daySep = (t?: string) => {
  if (!t) return "";
  const d = new Date(t), today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === y.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};
export const ago = (t?: string) => {
  if (!t) return "";
  const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `about ${h} hour${h > 1 ? "s" : ""} ago`; }
  const d = Math.floor(s / 86400); return `${d} day${d > 1 ? "s" : ""} ago`;
};

export const Badge = ({ style, children, testID }: { style?: { bg: string; fg: string }; children: React.ReactNode; testID?: string }) => (
  <View testID={testID} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: style?.bg || SLATE[100], alignSelf: "flex-start" }}><Text style={{ fontSize: 11, fontWeight: "600", textTransform: "capitalize", color: style?.fg || SLATE[600] }}>{children}</Text></View>
);

export function AttachmentView({ a, onOpen }: { a: any; onOpen?: (url: string) => void }) {
  if (a.kind === "pdf") {
    return (
      <Pressable onPress={() => Linking.openURL(a.url)} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 8, maxWidth: 220 }}>
        <FileText size={16} color="#EF4444" /><Text numberOfLines={1} style={{ fontSize: 12, color: SLATE[700] }}>{a.name || "Document.pdf"}</Text>
      </Pressable>
    );
  }
  return <Pressable onPress={() => onOpen?.(a.url)} style={{ borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: SLATE[200] }}><Image source={{ uri: a.thumb_url || a.url }} style={{ height: 96, width: 96 }} contentFit="cover" /></Pressable>;
}

/* Build a multipart body for POST /support/upload from an expo-image-picker asset. */
export async function assetToFormData(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fd = new FormData();
  const name = asset.fileName || `photo-${Date.now()}.jpg`;
  const type = asset.mimeType || "image/jpeg";
  if (Platform.OS === "web") { const blob = await (await fetch(asset.uri)).blob(); fd.append("file", blob, name); }
  else fd.append("file", { uri: asset.uri, name, type } as any);
  return fd;
}
