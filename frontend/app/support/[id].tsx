import React, { useCallback, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Platform, Modal, Alert, ActivityIndicator } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Badge, CardSkeleton, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { pickImage, uploadAsset } from "@/src/components/reg/Photo";

const GREEN = "#059669";
const SLATE400 = "#94A3B8";
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };

const prioTone = (p?: string): any => ({ low: "neutral", medium: "info", high: "warning", urgent: "danger" }[(p || "").toLowerCase()] || "warning");
const timeStr = (t?: string) => (t ? new Date(t).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "");
const dateFull = (t?: string) => (t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const dayKey = (t?: string) => (t ? new Date(t).toDateString() : "");
const daySep = (t?: string) => {
  if (!t) return "";
  const d = new Date(t), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === y.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
};
const ago = (t?: string) => {
  if (!t) return "";
  const s = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? "s" : ""} ago`; }
  const d = Math.floor(s / 86400); return `${d} day${d > 1 ? "s" : ""} ago`;
};

export default function SupportThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const lastTypingSent = useRef(0);

  const { data, isLoading } = useQuery({ queryKey: ["support-ticket", id], queryFn: () => api.get<any>(`/support/tickets/${id}`), enabled: !!id, refetchInterval: 3000 });
  const listQ = useQuery({ queryKey: ["support-tickets"], queryFn: () => api.get<any[]>("/support/tickets") });
  const ticket = data || {};
  const messages: any[] = ticket?.messages || [];
  const myId = user?.id;
  const isClosed = (ticket?.status || "").toLowerCase() === "closed";
  const attachments = messages.flatMap((m) => m.attachments || []);
  const others = (Array.isArray(listQ.data) ? listQ.data : []).filter((x: any) => x.id !== id);

  const send = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/messages`, { text: text.trim(), attachments: pending }),
    onSuccess: () => { setText(""); setPending([]); qc.invalidateQueries({ queryKey: ["support-ticket", id] }); qc.invalidateQueries({ queryKey: ["support-tickets"] }); },
    onError: (e: any) => toast.error(e?.detail || "Could not send"),
  });
  const close = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/close`),
    onSuccess: () => { toast.info("Ticket closed"); qc.invalidateQueries({ queryKey: ["support-ticket", id] }); qc.invalidateQueries({ queryKey: ["support-tickets"] }); },
    onError: (e: any) => toast.error(e?.detail || "Could not close"),
  });

  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 3000) return;
    lastTypingSent.current = now;
    api.post(`/support/tickets/${id}/typing`).catch(() => {});
  }, [id]);

  const addAttachment = async () => {
    if (pending.length >= 5) return toast.error("Up to 5 attachments per message");
    try {
      const asset = await pickImage("gallery");
      if (!asset) return;
      setUploading(true);
      const res = await uploadAsset("/support", "support", asset);
      setPending((p) => [...p, res]);
    } catch (e: any) {
      toast.error(e?.message || "Could not upload");
    } finally { setUploading(false); }
  };

  const confirmClose = () => {
    const msg = "Close this ticket? You won't be able to reply after closing — you'd need to raise a new ticket.";
    if (Platform.OS === "web") {
      // RN Web polyfills Alert.alert to a single-button window.alert (no callback),
      // so use window.confirm to get a working OK path.
      if (typeof window !== "undefined" && window.confirm(msg)) close.mutate();
      return;
    }
    Alert.alert("Close ticket?", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Close ticket", style: "destructive", onPress: () => close.mutate() },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader
        title={ticket?.code || "Ticket"} back subtitle={ticket?.subject} variant="gradient" testID="ticket-thread-header"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable testID="ticket-details-btn" onPress={() => setDetails(true)} hitSlop={8}><Icon name="information-outline" size={23} color="#fff" /></Pressable>
            {!isClosed ? <Pressable testID="close-ticket" onPress={confirmClose} hitSlop={8}><Icon name="close-circle-outline" size={23} color="#fff" /></Pressable> : null}
          </View>
        }
      />

      {/* status strip */}
      {!isLoading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Badge label={STATUS_LABEL[ticket?.status] || (ticket?.status || "").replace(/_/g, " ")} tone={statusTone(ticket?.status)} />
          <Badge label={ticket?.priority} tone={prioTone(ticket?.priority)} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN }} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Updated {ago(ticket?.updated_at)}</Text>
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {isLoading ? (
          <View style={{ padding: spacing.lg }}><CardSkeleton /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {messages.map((m, i) => {
              const rows: React.ReactNode[] = [];
              const prevDay = i > 0 ? dayKey(messages[i - 1].at) : null;
              const sep = dayKey(m.at) !== prevDay ? daySep(m.at) : null;
              if (sep) rows.push(
                <View key={`sep-${m.id || i}`} style={{ alignItems: "center", marginVertical: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: SLATE400, backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>{sep}</Text>
                </View>
              );
              if (m.system) {
                rows.push(
                  <View key={m.id || i} style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 11, color: colors.textMuted, backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, textAlign: "center" }}>{m.text}</Text>
                  </View>
                );
                return rows;
              }
              const mine = myId ? m.sender_id === myId : m.sender_role !== "admin";
              const isAdmin = m.sender_role === "admin";
              const atts = m.attachments || [];
              rows.push(
                <View key={m.id || i} style={{ alignItems: mine ? "flex-end" : "flex-start", maxWidth: "100%" }}>
                  {!mine ? <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 3, marginLeft: 4 }}>{isAdmin ? "Support" : m.sender_name}</Text> : null}
                  {atts.length > 0 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: atts.length && (m.text || "").trim() ? 6 : 0, justifyContent: mine ? "flex-end" : "flex-start" }}>
                      {atts.map((a: any, ai: number) => (a.kind === "pdf" ? (
                        <Pressable key={ai} onPress={() => Linking.openURL(mediaUrl(a.url) || a.url)} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 220 }}>
                          <Icon name="file-pdf-box" size={18} color="#EF4444" />
                          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12, flexShrink: 1 }}>{a.name || "Document.pdf"}</Text>
                        </Pressable>
                      ) : (
                        <Pressable key={ai} onPress={() => setLightbox(mediaUrl(a.url) || a.url)}>
                          <Image source={{ uri: mediaUrl(a.thumb_url || a.url) }} style={{ width: 116, height: 116, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} contentFit="cover" />
                        </Pressable>
                      )))}
                    </View>
                  ) : null}
                  {(m.text || "").trim() ? (
                    <View style={{ maxWidth: "82%", backgroundColor: mine ? GREEN : colors.surface, borderWidth: mine ? 0 : 1, borderColor: colors.border, borderRadius: radius.lg, borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4, paddingHorizontal: 14, paddingVertical: 9 }}>
                      <Text style={{ color: mine ? "#fff" : colors.text, fontSize: fontSize.sm, lineHeight: 20 }}>{m.text}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4, justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <Text style={{ color: mine ? "rgba(255,255,255,0.8)" : colors.textMuted, fontSize: 10 }}>{timeStr(m.at)}</Text>
                        {mine ? <Icon name={ticket?.unread_admin === 0 ? "check-all" : "check"} size={13} color="rgba(255,255,255,0.9)" /> : null}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
              return rows;
            })}

            {ticket?.agent_typing ? (
              <View testID="support-agent-typing" style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 }}>
                <Icon name="shield-check" size={13} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Support is typing…</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

        {!isClosed ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: insets.bottom + 8 }}>
            {pending.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {pending.map((a, i) => (
                  <View key={i} style={{ position: "relative" }}>
                    {a.kind === "pdf" ? (
                      <View style={{ width: 60, height: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSubtle }}><Icon name="file-pdf-box" size={24} color="#EF4444" /></View>
                    ) : (
                      <Image source={{ uri: mediaUrl(a.thumb_url || a.url) }} style={{ width: 60, height: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} contentFit="cover" />
                    )}
                    <Pressable onPress={() => setPending((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="close" size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Pressable testID="attach-file" onPress={addAttachment} disabled={uploading} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
                {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="paperclip" size={20} color={colors.textSecondary} />}
              </Pressable>
              <TextInput testID="ticket-reply" value={text} onChangeText={(v) => { setText(v); pingTyping(); }} placeholder="Type a message…" placeholderTextColor={colors.textMuted} multiline style={{ flex: 1, minHeight: 46, maxHeight: 110, borderRadius: radius.xl, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 13 : 8, paddingBottom: 8, color: colors.text, fontSize: fontSize.sm }} />
              <Pressable testID="send-reply" onPress={() => (text.trim() || pending.length) && !send.isPending && send.mutate()} disabled={send.isPending || (!text.trim() && !pending.length)} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: GREEN, alignItems: "center", justifyContent: "center", opacity: (!text.trim() && !pending.length) || send.isPending ? 0.5 : 1 }}>
                {send.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="send" size={20} color="#fff" />}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="check-circle" size={16} color={GREEN} />
            <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: fontSize.sm }}>This ticket is closed. Please raise a new ticket for further help.</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Ticket details sheet */}
      <Modal visible={details} transparent animationType="slide" onRequestClose={() => setDetails(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setDetails(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%" }}>
            <View style={{ alignItems: "center", paddingTop: 10 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} /></View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: 14 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "900" }}>Ticket details</Text>
              <View style={{ gap: 2 }}>
                <DetailRow icon="pound" label="Ticket ID" value={ticket?.code} colors={colors} />
                <DetailRow icon="tag-outline" label="Department" value={ticket?.category} colors={colors} cap />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                  <Icon name="alert-circle-outline" size={16} color={colors.textMuted} /><Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, width: 96 }}>Priority</Text><Badge label={ticket?.priority} tone={prioTone(ticket?.priority)} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                  <Icon name="check-circle-outline" size={16} color={colors.textMuted} /><Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, width: 96 }}>Status</Text><Badge label={STATUS_LABEL[ticket?.status] || ticket?.status} tone={statusTone(ticket?.status)} />
                </View>
                <DetailRow icon="calendar" label="Created" value={dateFull(ticket?.created_at)} colors={colors} />
                <DetailRow icon="clock-outline" label="Updated" value={dateFull(ticket?.updated_at)} colors={colors} />
                {ticket?.assigned_name ? <DetailRow icon="shield-check" label="Agent" value={ticket.assigned_name} colors={colors} /> : null}
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" }}>Attachments · {attachments.length}</Text>
              {attachments.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>No attachments yet — use the clip icon to add screenshots.</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {attachments.map((a: any, i: number) => (a.kind === "pdf" ? (
                    <Pressable key={i} onPress={() => Linking.openURL(mediaUrl(a.url) || a.url)} style={{ width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSubtle }}><Icon name="file-pdf-box" size={26} color="#EF4444" /></Pressable>
                  ) : (
                    <Pressable key={i} onPress={() => { setDetails(false); setLightbox(mediaUrl(a.url) || a.url); }}><Image source={{ uri: mediaUrl(a.thumb_url || a.url) }} style={{ width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} contentFit="cover" /></Pressable>
                  )))}
                </View>
              )}

              <View style={{ height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" }}>Your other tickets · {others.length}</Text>
              {others.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>This is your only ticket.</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {others.slice(0, 12).map((p: any) => (
                    <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, flex: 1 }}>{p.subject}</Text>
                      <Badge label={STATUS_LABEL[p.status] || p.status} tone={statusTone(p.status)} />
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Lightbox */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable onPress={() => setLightbox(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {lightbox ? <Image source={{ uri: lightbox }} style={{ width: "100%", height: "80%" }} contentFit="contain" /> : null}
          <View style={{ position: "absolute", top: insets.top + 12, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={22} color="#fff" /></View>
        </Pressable>
      </Modal>
    </View>
  );
}

function DetailRow({ icon, label, value, colors, cap }: { icon: any; label: string; value?: string; colors: any; cap?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, width: 96 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "700", flex: 1, textTransform: cap ? "capitalize" : "none" }} numberOfLines={2}>{value || "—"}</Text>
    </View>
  );
}
