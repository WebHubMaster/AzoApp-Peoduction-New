import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Linking, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Icon } from "@/src/components/Icon";
import { useRealtime } from "@/src/context/RealtimeContext";
import { markChatSeen } from "@/src/lib/chatSeen";

const QUICK = ["I'm on the way", "Reaching in 5 min", "I'm at the gate", "Please share exact location", "Running 10 min late, sorry"];

export default function PartnerChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { subscribe } = useRealtime();
  const [chat, setChat] = useState<any>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<any>(`/bookings/${id}/messages`);
      setChat(data);
      const msgs = data?.messages || [];
      if (msgs.length) markChatSeen(String(id), msgs[msgs.length - 1].created_at);
      else markChatSeen(String(id));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // Real-time: refresh the thread the instant the other party sends a message.
  useEffect(() => subscribe((ev) => {
    if (ev?.type === "booking_message" && ev?.data?.booking_id === id) load();
  }), [subscribe, id, load]);
  // Poll while the screen is open (matches web behaviour).
  useEffect(() => { const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [load]);
  useEffect(() => { const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80); return () => clearTimeout(t); }, [chat]);

  const enabled = !!chat?.enabled;
  const me = chat?.me;
  const counterpart = chat?.customer; // partner app → counterpart is the customer
  const messages: any[] = chat?.messages || [];

  const send = async (t?: string) => {
    const msg = (t != null ? t : text).trim();
    if (!msg || sending || !id) return;
    setSending(true);
    try { await api.post(`/bookings/${id}/messages`, { text: msg }); setText(""); await load(); }
    catch { /* ignore */ }
    finally { setSending(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSubtle }}>
      <AppHeader title={counterpart?.name || "Customer"} back subtitle={chat?.status ? `${String(chat.status).replace(/_/g, " ")}` : "Chat"} variant="gradient" testID="chat-header"
        right={counterpart?.phone ? (
          <Pressable testID="chat-call" onPress={() => Linking.openURL(`tel:${counterpart.phone}`)} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Icon name="phone" size={18} color="#fff" />
          </Pressable>
        ) : undefined}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} testID="chat-messages" contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
          ) : !enabled ? (
            <View style={{ alignItems: "center", marginTop: 60, paddingHorizontal: 24 }}>
              <Icon name="message-outline" size={32} color="#CBD5E1" />
              <Text style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 }}>{chat?.comm_locked ? "Chat unlocks 30 minutes before your scheduled time." : "Chat opens once the booking is paid and the job is active."}</Text>
            </View>
          ) : messages.length === 0 ? (
            <Text style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 60 }}>No messages yet. Say hello 👋</Text>
          ) : messages.map((m) => {
            const mine = m.sender_id === me;
            return (
              <View key={m.id} style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <View style={{ maxWidth: "80%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: mine ? colors.primary : colors.surface, borderWidth: mine ? 0 : 1, borderColor: colors.border, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4 }}>
                  <Text style={{ color: mine ? "#fff" : colors.text, fontSize: 14, lineHeight: 19 }}>{m.text}</Text>
                  <Text style={{ color: mine ? "rgba(255,255,255,0.7)" : "#94A3B8", fontSize: 10, marginTop: 2 }}>{new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {enabled ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="chat-quick" contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }} style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, maxHeight: 52 }}>
              {QUICK.map((q) => (
                <Pressable key={q} onPress={() => send(q)} disabled={sending} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.primarySubtle, borderWidth: 1, borderColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
              <TextInput testID="chat-input" value={text} onChangeText={setText} placeholder="Type a message…" placeholderTextColor={colors.textMuted} onSubmitEditing={() => send()} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.text, fontSize: 14, backgroundColor: colors.background }} />
              <Pressable testID="chat-send" onPress={() => send()} disabled={sending || !text.trim()} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: sending || !text.trim() ? 0.5 : 1 }}>
                <Icon name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
