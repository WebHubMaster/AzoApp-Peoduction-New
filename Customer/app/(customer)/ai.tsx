/** AI Assistant — port of web AiChat.jsx (customer role): session-based POST /ai/chat. */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Sparkles, Send, Bot, User as UserIcon } from "lucide-react-native";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, useTheme, shadowBtn } from "../../src/theme";

type Msg = { role: "user" | "assistant"; text: string };
const HELLO = "Hello! Please describe your home service issue, and I'll suggest the right service and an estimated price. 😊";

function Bubble({ m }: { m: Msg }) {
  const { c, isDark } = useTheme();
  const mine = m.role === "user";
  return (
    <View testID={`ai-msg-${m.role}`} style={{ flexDirection: mine ? "row-reverse" : "row", gap: 8, alignItems: "flex-start" }}>
      <View style={{ height: 28, width: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: mine ? (isDark ? SLATE[700] : SLATE[200]) : PRIMARY[700] }}>
        {mine ? <UserIcon size={16} color={isDark ? SLATE[200] : SLATE[600]} /> : <Bot size={16} color="#fff" />}
      </View>
      <View style={{ maxWidth: "80%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderTopRightRadius: mine ? 4 : 16, borderTopLeftRadius: mine ? 16 : 4, backgroundColor: mine ? PRIMARY[700] : (isDark ? SLATE[800] : SLATE[100]) }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: mine ? "#fff" : (isDark ? SLATE[100] : SLATE[700]) }}>{m.text}</Text>
      </View>
    </View>
  );
}

export default function AiScreen() {
  const router = useRouter();
  const { c, isDark } = useTheme();
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: HELLO }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); return () => clearTimeout(t); }, [msgs, busy]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const q = input.trim();
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const data: any = await api.post("/ai/chat", { message: q, ...(session ? { session_id: session } : {}) });
      setSession(data.session_id);
      setMsgs((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Sorry, the AI is currently unavailable. Please try again in a little while." }]);
    }
    setBusy(false);
  };

  return (
    <View testID="ai-page" style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="page-title" numberOfLines={1} style={{ fontSize: 24, fontWeight: "900", color: c.text, letterSpacing: -0.4 }}>AI Assistant</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Ask about services, bookings, invoices & more</Text>
        </View>
        <Pressable testID="book-new" onPress={() => router.push("/(site)/services" as any)} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4, ...shadowBtn })}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Booking</Text></Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View testID="ai-chat" style={{ height: 460, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSoft, backgroundColor: c.primarySoft }}>
            <Sparkles size={16} color={PRIMARY[700]} strokeWidth={1.5} />
            <Text style={{ fontWeight: "600", fontSize: 14, color: isDark ? PRIMARY[200] : PRIMARY[800] }}>AzoApp AI Assistant</Text>
            <View style={{ marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: c.surface }}><Text style={{ fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: PRIMARY[600] }}>Claude</Text></View>
          </View>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            {msgs.map((m, i) => <Bubble key={i} m={m} />)}
            {busy ? <View testID="ai-typing" style={{ flexDirection: "row", gap: 8 }}><View style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Bot size={16} color="#fff" /></View><View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: isDark ? SLATE[800] : SLATE[100] }}><ActivityIndicator size="small" color={PRIMARY[700]} /></View></View> : null}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.borderSoft }}>
            <TextInput testID="ai-chat-input" value={input} onChangeText={setInput} onSubmitEditing={send} returnKeyType="send" placeholder="Type your problem..." placeholderTextColor={SLATE[400]}
              style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], backgroundColor: c.surface, fontSize: 14, color: c.text, outlineStyle: "none" } as any} />
            <Pressable testID="ai-chat-send" onPress={send} disabled={busy} style={({ pressed }) => ({ height: 40, paddingHorizontal: 12, borderRadius: 6, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1 })}><Send size={16} color="#fff" /></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
