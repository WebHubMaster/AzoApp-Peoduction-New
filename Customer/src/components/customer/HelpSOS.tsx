/** Help & SOS — on a started job. Help → real-time WhatsApp-style chat with Support; SOS → calls 112. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, ActivityIndicator, Linking, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { LifeBuoy, AlertTriangle, X, Send, ShieldCheck } from "lucide-react-native";
import { api } from "../../api/client";
import { useToast } from "../Toast";
import { useRealtime } from "../../context/RealtimeContext";
import { PRIMARY, ROSE, TC } from "../../theme";

const callSOS = () => Alert.alert("Emergency", "Call emergency number 112?", [
  { text: "Cancel", style: "cancel" },
  { text: "Call 112", style: "destructive", onPress: () => Linking.openURL("tel:112").catch(() => {}) },
]);

export function HelpSOS({ booking, testPrefix = "" }: { booking: any; testPrefix?: string }) {
  const toast = useToast();
  const { subscribe } = useRealtime();
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const typingTimer = useRef<any>(null);
  const lastTyping = useRef(0);
  const code = booking?.code || "";

  const openChat = async () => {
    setOpen(true);
    if (ticket) return;
    setLoading(true);
    try {
      const list: any = await api.get("/support/tickets").catch(() => []);
      const existing = (list || []).find((t: any) => t.booking_code === code && t.status !== "closed");
      if (existing) setTicket(await api.get(`/support/tickets/${existing.id}`));
      else setTicket(await api.post("/support/tickets", {
        subject: `Help · Booking ${code}`, category: "booking", priority: "high",
        message: `I need help with my ongoing ${booking?.service_name || "service"} (Booking ${code}).`, booking_code: code,
      }));
    } catch (e: any) { toast.error(e?.message || "Could not reach support"); setOpen(false); }
    setLoading(false);
  };

  const refresh = useCallback(async () => {
    if (!ticket?.id) return;
    try { const d: any = await api.get(`/support/tickets/${ticket.id}`); setTicket(d); if (d?.agent_typing) setAgentTyping(true); } catch {}
  }, [ticket?.id]);

  useEffect(() => {
    if (!open || !ticket?.id) return undefined;
    const iv = setInterval(refresh, 4000);
    return () => clearInterval(iv);
  }, [open, ticket?.id, refresh]);

  useEffect(() => {
    if (!ticket?.id) return undefined;
    return subscribe((ev) => {
      if (ev?.data?.ticket_id !== ticket.id) return;
      if (ev.type === "support_message") refresh();
      if (ev.type === "support_typing" && ev.data.actor === "agent") {
        setAgentTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setAgentTyping(false), 4000);
      }
    });
  }, [subscribe, ticket?.id, refresh]);

  useEffect(() => { const h = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(h); }, [ticket?.messages?.length, agentTyping]);

  const pingTyping = () => {
    const now = Date.now();
    if (!ticket?.id || now - lastTyping.current < 3000) return;
    lastTyping.current = now;
    api.post(`/support/tickets/${ticket.id}/typing`).catch(() => {});
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !ticket?.id) return;
    setSending(true);
    try { setTicket(await api.post(`/support/tickets/${ticket.id}/messages`, { text: body })); setText(""); }
    catch (e: any) { toast.error(e?.message || "Could not send"); }
    setSending(false);
  };

  const msgs = (ticket?.messages || []).filter((m: any) => !m.internal);

  return (
    <>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable testID={`${testPrefix}help-btn`} onPress={openChat} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: PRIMARY[200], backgroundColor: PRIMARY[50], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <LifeBuoy size={16} color={PRIMARY[700]} /><Text style={{ fontWeight: "700", color: PRIMARY[700] }}>Help</Text>
        </Pressable>
        <Pressable testID={`${testPrefix}sos-btn`} onPress={callSOS} style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: ROSE[600], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <AlertTriangle size={16} color="#fff" /><Text style={{ fontWeight: "700", color: "#fff" }}>SOS · 112</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View testID="help-sos-modal" style={{ height: "85%", backgroundColor: TC.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: TC.borderSoft }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={18} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", color: TC.text }}>Support Team</Text>
                <Text style={{ fontSize: 11, color: TC.textFaint }}>{agentTyping ? "typing…" : `${ticket?.code ? `${ticket.code} · ` : ""}Booking ${code}`}</Text>
              </View>
              <Pressable testID="help-sos-close" onPress={() => setOpen(false)} hitSlop={10}><X size={20} color={TC.textMuted} /></Pressable>
            </View>
            <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: TC.bg }} contentContainerStyle={{ padding: 14, gap: 8 }}>
              {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={PRIMARY[600]} /> : null}
              {msgs.map((m: any, i: number) => {
                if (m.system || m.sender_role === "system") return <Text key={m.id || i} style={{ textAlign: "center", fontSize: 11, color: TC.textFaint }}>{m.text}</Text>;
                const mine = m.sender_id && m.sender_id === ticket?.user_id;
                return (
                  <View key={m.id || i} style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                    <View style={{ maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: mine ? PRIMARY[600] : TC.surface, borderWidth: mine ? 0 : 1, borderColor: TC.borderSoft }}>
                      {!mine ? <Text style={{ fontSize: 10, fontWeight: "700", color: PRIMARY[600], marginBottom: 2 }}>{m.sender_name || "Support"}</Text> : null}
                      <Text style={{ fontSize: 14, color: mine ? "#fff" : TC.text }}>{m.text}</Text>
                    </View>
                  </View>
                );
              })}
              {agentTyping ? <Text testID="help-sos-agent-typing" style={{ fontSize: 11, fontWeight: "600", color: PRIMARY[600] }}>Support is typing…</Text> : null}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: TC.borderSoft }}>
              <TextInput testID="help-sos-input" value={text} onChangeText={(v) => { setText(v); pingTyping(); }} onSubmitEditing={send}
                placeholder="Type your message…" placeholderTextColor={TC.textFaint} editable={!!ticket && !sending}
                style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: TC.border, backgroundColor: TC.input, paddingHorizontal: 12, color: TC.text }} />
              <Pressable testID="help-sos-send" onPress={send} disabled={!text.trim() || sending} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: PRIMARY[600], alignItems: "center", justifyContent: "center", opacity: !text.trim() || sending ? 0.4 : 1 }}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={18} color="#fff" />}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
