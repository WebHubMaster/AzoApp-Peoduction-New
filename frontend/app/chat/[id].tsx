import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Linking, Platform, ActivityIndicator, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { Icon } from "@/src/components/Icon";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useChats } from "@/src/context/ChatContext";
import { dismissChatNotification } from "@/src/lib/notifications";

/** Mirrors web BookingChat.QUICK — tap-to-send replies per role. */
const QUICK: Record<string, string[]> = {
  customer: ["I'm at home, please come in", "Please call me", "Reaching the spot in 5 min", "Door is open", "Please share your live location"],
  partner: ["I'm on the way", "Reaching in 5 min", "I'm at the gate", "Please share exact location", "Running 10 min late, sorry"],
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

/** WhatsApp-style ticks: ✓ sent · ✓✓ (blue) seen. */
function Ticks({ status }: { status: string }) {
  const seen = status === "seen";
  return <Icon name={seen ? "check-all" : "check"} size={13} color={seen ? "#7DD3FC" : "rgba(255,255,255,0.7)"} />;
}

function TypingDots({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center", height: 14 }}>
      {[0, 1, 2].map((i) => <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: 0.4 + i * 0.25 }} />)}
    </View>
  );
}

/**
 * Full-screen booking chat (customer ↔ assigned partner). Lives outside the
 * tab navigator so the floating bottom nav never overlaps the composer —
 * matches the web BookingChat slide-in sheet on mobile viewports.
 * Real-time: SSE booking_message / booking_seen / booking_typing, read receipts
 * (auto-seen while open), presence heartbeat (suppresses push while reading).
 */
export default function BookingChatScreen() {
  const { id, role: roleParam, service } = useLocalSearchParams<{ id: string; role?: string; service?: string }>();
  const role = roleParam === "customer" ? "customer" : "partner";
  const router = useRouter();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { subscribe } = useRealtime();
  const { refresh: refreshChats } = useChats();
  const [chat, setChat] = useState<any>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const meRef = useRef<string>("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<any>(`/bookings/${id}/messages`);
      meRef.current = data?.me || "";
      setChat(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [id]);
  const markSeen = useCallback(async () => {
    if (!id) return;
    try { await api.post(`/bookings/${id}/messages/seen`); refreshChats(); } catch { /* ignore */ }
  }, [id, refreshChats]);

  useEffect(() => { load(); markSeen(); dismissChatNotification(String(id)); }, [load, markSeen, id]);
  useEffect(() => subscribe((ev) => {
    const d = ev?.data || {};
    if (d.booking_id !== id) return;
    if (ev.type === "booking_message") { load(); if (d.sender_id !== meRef.current) markSeen(); setTyping(false); }
    else if (ev.type === "booking_seen") load();
    else if (ev.type === "booking_typing") {
      setTyping(!!d.typing);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (d.typing) typingTimer.current = setTimeout(() => setTyping(false), 4000);
    }
  }), [subscribe, id, load, markSeen]);
  // Fallback poll + presence heartbeat while the screen is open.
  useEffect(() => {
    const iv = setInterval(load, 5000);
    const hb = setInterval(markSeen, 15000);
    return () => { clearInterval(iv); clearInterval(hb); };
  }, [load, markSeen]);
  useEffect(() => { const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80); return () => clearTimeout(t); }, [chat, typing]);

  const enabled = !!chat?.enabled;
  const me = chat?.me;
  const counterpart = role === "customer" ? chat?.partner : chat?.customer;
  const fallbackName = role === "customer" ? "Your partner" : "Customer";
  const subtitle = chat?.counterpart_online ? "Online" : role === "customer" ? "On the way" : "Your customer";
  const quick = QUICK[role];
  const messages: any[] = chat?.messages || [];
  const photo = mediaUrl(counterpart?.photo);
  const dark = mode === "dark";
  const otherBubbleBg = dark ? "#1E293B" : "#FFFFFF";
  const otherBubbleBorder = dark ? "#334155" : "#E2E8F0";

  const sendTyping = (t: boolean) => { if (id) api.post(`/bookings/${id}/typing`, { typing: t }).catch(() => {}); };
  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2500) { lastTypingSent.current = now; sendTyping(true); }
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => { lastTypingSent.current = 0; sendTyping(false); }, 2000);
  };

  const send = async (t?: string) => {
    const msg = (t != null ? t : text).trim();
    if (!msg || sending || !id) return;
    setSending(true);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    lastTypingSent.current = 0;
    try { await api.post(`/bookings/${id}/messages`, { text: msg }); setText(""); await load(); refreshChats(); }
    catch { /* ignore */ }
    finally { setSending(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="chat-screen">
      <StatusBar style={dark ? "light" : "dark"} />
      {/* Header — web SheetHeader: avatar · name · green-dot subtitle · call */}
      <View testID="chat-header" style={{ paddingTop: insets.top + 6, paddingBottom: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable testID="header-back-button" onPress={() => router.back()} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
          <Icon name="chevron-left" size={28} color={colors.text} />
        </Pressable>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: 40, height: 40 }} /> : <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 16 }}>{(counterpart?.name || "?").trim()[0]?.toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="chat-title" numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{counterpart?.name || fallbackName}</Text>
          {typing ? (
            <Text testID="chat-typing" numberOfLines={1} style={{ color: colors.primary, fontSize: 12, fontStyle: "italic", marginTop: 1 }}>typing…</Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: chat?.counterpart_online ? "#10B981" : "#CBD5E1" }} />
              <Text numberOfLines={1} style={{ color: "#059669", fontSize: 12, flexShrink: 1 }}>{subtitle}{service ? ` · ${service}` : ""}</Text>
            </View>
          )}
        </View>
        {counterpart?.phone ? (
          <Pressable testID="chat-call" onPress={() => Linking.openURL(`tel:${counterpart.phone}`)} hitSlop={8} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: dark ? "rgba(16,185,129,0.18)" : "#ECFDF5", alignItems: "center", justifyContent: "center" }}>
            <Icon name="phone" size={18} color="#059669" />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} testID="chat-messages" style={{ flex: 1, backgroundColor: colors.surfaceSubtle }} contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
          ) : !enabled ? (
            <View testID="chat-locked" style={{ alignItems: "center", marginTop: 40, paddingHorizontal: 24 }}>
              <Icon name="message-outline" size={32} color="#CBD5E1" />
              <Text style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 }}>
                {chat?.comm_locked ? "Chat unlocks 30 minutes before your scheduled time." : "Chat opens once your booking is paid and a partner is on the way."}
              </Text>
            </View>
          ) : messages.length === 0 && !typing ? (
            <Text testID="chat-empty" style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 40 }}>No messages yet. Say hello 👋</Text>
          ) : messages.map((m) => {
            const mine = m.sender_id === me;
            return (
              <View key={m.id} testID={mine ? "chat-msg-mine" : "chat-msg-other"} style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <View style={{ maxWidth: "80%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: mine ? colors.primary : otherBubbleBg, borderWidth: mine ? 0 : 1, borderColor: otherBubbleBorder, borderBottomRightRadius: mine ? 6 : 16, borderBottomLeftRadius: mine ? 16 : 6 }}>
                  <Text style={{ color: mine ? "#fff" : colors.text, fontSize: 14, lineHeight: 19 }}>{m.text}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 }}>
                    <Text style={{ color: mine ? "rgba(255,255,255,0.7)" : "#94A3B8", fontSize: 10 }}>{fmtTime(m.created_at)}</Text>
                    {mine ? <View testID={`tick-${m.status}`}><Ticks status={m.status} /></View> : null}
                  </View>
                </View>
              </View>
            );
          })}
          {enabled && typing ? (
            <View testID="chat-typing-bubble" style={{ flexDirection: "row", justifyContent: "flex-start" }}>
              <View style={{ borderRadius: 16, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: otherBubbleBg, borderWidth: 1, borderColor: otherBubbleBorder }}>
                <TypingDots color={colors.textMuted} />
              </View>
            </View>
          ) : null}
        </ScrollView>

        {enabled ? (
          <View style={{ backgroundColor: colors.surface }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="chat-quick" contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }} style={{ borderTopWidth: 1, borderTopColor: colors.border, maxHeight: 54 }} keyboardShouldPersistTaps="handled">
              {quick.map((q) => (
                <Pressable key={q} testID={`quick-${q.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} onPress={() => send(q)} disabled={sending} style={({ pressed }) => ({ height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.primarySubtle, borderWidth: 1, borderColor: dark ? "rgba(255,255,255,0.08)" : "#DBEAFE", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, paddingBottom: Math.max(insets.bottom, 8) + 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TextInput testID="chat-input" value={text} onChangeText={onType} placeholder="Type a message…" placeholderTextColor={colors.textMuted} onSubmitEditing={() => send()} returnKeyType="send" blurOnSubmit={false} style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.text, fontSize: 14, backgroundColor: colors.surface }} />
              <Pressable testID="chat-send" onPress={() => send()} disabled={sending || !text.trim()} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: sending || !text.trim() ? 0.5 : 1 }}>
                <Icon name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
