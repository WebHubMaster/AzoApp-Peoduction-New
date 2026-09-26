/** Port of web_panel/src/components/booking/BookingChat.jsx — customer ↔ partner thread (polling instead of SSE). */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, TextInput, Linking, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { MessageCircle, Phone, Send, Check, CheckCheck, X } from "lucide-react-native";
import { api } from "../../api/client";
import { PRIMARY, SLATE, EMERALD, useTheme } from "../../theme";

const QUICK = ["I'm at home, please come in", "Please call me", "Reaching the spot in 5 min", "Door is open", "Please share your live location"];

export function UnreadPill({ count, testID }: { count: number; testID?: string }) {
  if (!count) return null;
  return <View testID={testID} style={{ height: 18, minWidth: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "700" }}>{count > 9 ? "9+" : count}</Text></View>;
}

/** Server-driven unread summary (web ChatContext) — polls /bookings/chats/summary every 30s. */
export function useChatSummary(enabled: boolean) {
  const [chats, setChats] = useState<any[]>([]);
  const refresh = useCallback(async () => { if (!enabled) return; try { const d: any = await api.get("/bookings/chats/summary"); setChats(d?.chats || []); } catch { /* ignore */ } }, [enabled]);
  useEffect(() => { refresh(); const iv = setInterval(refresh, 30000); return () => clearInterval(iv); }, [refresh]);
  return { unreadFor: (id: string) => (chats.find((x) => x.booking_id === id) || {}).unread || 0, refresh };
}

const Ticks = ({ status }: { status: string }) => status === "seen" ? <CheckCheck size={14} color="#7DD3FC" /> : <Check size={14} color="rgba(255,255,255,0.7)" />;

export function BookingChat({ booking, open, onClose, onSeen }: { booking: any; open: boolean; onClose: () => void; onSeen?: () => void }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<any>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastTyping = useRef(0);
  const stopTimer = useRef<any>(null);
  const id = booking?.id;

  const load = useCallback(async () => { if (!id) return; try { setChat(await api.get(`/bookings/${id}/messages`)); } catch { /* ignore */ } }, [id]);
  const markSeen = useCallback(async () => { if (!id) return; try { await api.post(`/bookings/${id}/messages/seen`); onSeen?.(); } catch { /* ignore */ } }, [id, onSeen]);

  useEffect(() => {
    if (!open) return undefined;
    load(); markSeen();
    const iv = setInterval(load, 5000);
    const hb = setInterval(markSeen, 15000);
    return () => { clearInterval(iv); clearInterval(hb); api.post(`/bookings/${id}/typing`, { typing: false, present: false }).catch(() => {}); };
  }, [open, load, markSeen, id]);
  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }, [chat, open]);

  const sendTyping = (t: boolean) => api.post(`/bookings/${id}/typing`, { typing: t }).catch(() => {});
  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 2500) { lastTyping.current = now; sendTyping(true); }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => { lastTyping.current = 0; sendTyping(false); }, 2000);
  };
  const send = async (t?: string) => {
    const msg = (t != null ? t : text).trim();
    if (!msg || sending) return;
    setSending(true); clearTimeout(stopTimer.current); lastTyping.current = 0;
    try { await api.post(`/bookings/${id}/messages`, { text: msg }); setText(""); await load(); } catch { /* ignore */ }
    setSending(false);
  };

  const enabled = !!chat?.enabled;
  const partner = chat?.partner;
  const typing = !!chat?.counterpart_typing;
  const call = () => { if (partner?.phone) Linking.openURL(`tel:${String(partner.phone).replace(/\s/g, "")}`); };
  const bg = isDark ? SLATE[950] : SLATE[50];
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.surface }}>
        <View testID={`chat-sheet-${booking?.code}`} style={{ flex: 1, paddingTop: insets.top }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
            <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100], alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {partner?.photo ? <Image source={{ uri: partner.photo }} style={{ height: 40, width: 40 }} contentFit="cover" /> : <Text style={{ fontWeight: "700", color: c.primaryText }}>{(partner?.name || "?")[0]}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", color: c.text }}>{partner?.name || "Your partner"}</Text>
              {typing ? <Text testID="chat-typing" style={{ fontSize: 12, color: c.primaryText, fontStyle: "italic" }}>typing…</Text>
                : <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: chat?.counterpart_online ? EMERALD[500] : SLATE[300] }} /><Text numberOfLines={1} style={{ fontSize: 12, color: EMERALD[600] }}>{chat?.counterpart_online ? "Online" : "On the way"} · {booking?.service_name}</Text></View>}
            </View>
            {partner?.phone ? <Pressable onPress={call} style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: isDark ? "rgba(6,78,59,0.3)" : EMERALD[50], alignItems: "center", justifyContent: "center" }}><Phone size={16} color={EMERALD[600]} /></Pressable> : null}
            <Pressable testID="chat-close" onPress={onClose} hitSlop={8} style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center" }}><X size={20} color={SLATE[400]} /></Pressable>
          </View>

          <ScrollView ref={scrollRef} testID="chat-messages" style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ padding: 16, gap: 8 }}>
            {!enabled ? (
              <View style={{ alignItems: "center", marginTop: 40, paddingHorizontal: 24 }}>
                <MessageCircle size={32} color={SLATE[300]} />
                <Text style={{ fontSize: 14, color: SLATE[400], textAlign: "center", marginTop: 8 }}>{chat?.comm_locked ? "Chat unlocks 30 minutes before your scheduled time." : "Chat opens once your booking is paid and a partner is on the way."}</Text>
              </View>
            ) : null}
            {enabled && !(chat.messages || []).length ? <Text style={{ textAlign: "center", fontSize: 14, color: SLATE[400], marginTop: 40 }}>No messages yet. Say hello 👋</Text> : null}
            {enabled ? (chat.messages || []).map((m: any) => {
              const mine = m.sender_id === chat.me;
              return (
                <View key={m.id} testID={mine ? "chat-msg-mine" : "chat-msg-other"} style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <View style={{ maxWidth: "80%", borderRadius: 16, borderBottomRightRadius: mine ? 6 : 16, borderBottomLeftRadius: mine ? 16 : 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: mine ? PRIMARY[700] : c.surface, borderWidth: mine ? 0 : 1, borderColor: c.border }}>
                    <Text style={{ fontSize: 14, color: mine ? "#fff" : c.text }}>{m.text}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 }}>
                      <Text style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.7)" : SLATE[400] }}>{new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</Text>
                      {mine ? <Ticks status={m.status} /> : null}
                    </View>
                  </View>
                </View>
              );
            }) : null}
          </ScrollView>

          {enabled ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="chat-quick" style={{ flexGrow: 0, borderTopWidth: 1, borderTopColor: c.borderSoft }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              {QUICK.map((q) => <Pressable key={q} disabled={sending} onPress={() => send(q)} style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: isDark ? "rgba(7,52,115,0.35)" : PRIMARY[50], borderWidth: 1, borderColor: isDark ? PRIMARY[800] : PRIMARY[100], justifyContent: "center" }}><Text style={{ fontSize: 12, fontWeight: "600", color: c.primaryText }}>{q}</Text></Pressable>)}
            </ScrollView>
          ) : null}
          {enabled ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: c.borderSoft }}>
              <TextInput testID="chat-input" value={text} onChangeText={onType} onSubmitEditing={() => send()} placeholder="Type a message…" placeholderTextColor={SLATE[400]} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, fontSize: 14, color: c.text, backgroundColor: c.surface, outlineStyle: "none" } as any} />
              <Pressable testID="chat-send" disabled={sending || !text.trim()} onPress={() => send()} style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: sending || !text.trim() ? 0.5 : 1 }}><Send size={16} color="#fff" /></Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
