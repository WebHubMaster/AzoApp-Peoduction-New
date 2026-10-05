/** Help & SOS — on a started job. Help → real-time WhatsApp-style chat with Support; SOS → calls 112. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, ActivityIndicator, Linking, Alert, useWindowDimensions } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LifeBuoy, AlertTriangle, X, Send, ShieldCheck, Paperclip } from "lucide-react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { api } from "../../api/client";
import { assetToFormData } from "./supportShared";
import { useToast } from "../Toast";
import { useRealtime } from "../../context/RealtimeContext";
import { PRIMARY, ROSE, TC } from "../../theme";

const getPos = async () => {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const p = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch { return null; }
};

export function HelpSOS({ booking, testPrefix = "" }: { booking: any; testPrefix?: string }) {
  const toast = useToast();
  const { subscribe } = useRealtime();
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const typingTimer = useRef<any>(null);
  const lastTyping = useRef(0);
  const code = booking?.code || "";
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const kbH = useKeyboardState((k) => (k.isVisible ? k.height : 0));
  // WhatsApp-style: the whole sheet lifts above the keyboard and shrinks so the
  // composer sits directly on top of it; when closed it respects the bottom safe area.
  const sheetH = kbH > 0 ? Math.max(300, winH - kbH - insets.top - 8) : Math.round(winH * 0.85);
  const composerPad = kbH > 0 ? 12 : Math.max(insets.bottom, 12);

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

  const tid = ticket?.id;
  const refresh = useCallback(async () => {
    if (!tid) return;
    try { const d: any = await api.get(`/support/tickets/${tid}`); setTicket(d); if (d?.agent_typing) setAgentTyping(true); } catch {}
  }, [tid]);

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

  const raiseSOS = async () => {
    const pos = await getPos();
    try { setTicket(await api.post("/support/sos", { booking_code: code, ...(pos || {}) })); toast.success("SOS sent — support team alerted"); }
    catch (e: any) { toast.error(e?.message || "Could not alert support"); }
    Linking.openURL("tel:112").catch(() => {});
  };
  const callSOS = () => Alert.alert("SOS", "Alert our support team and call emergency number 112?", [
    { text: "Cancel", style: "cancel" },
    { text: "SOS · Call 112", style: "destructive", onPress: raiseSOS },
  ]);

  const sendPhoto = async () => {
    if (!ticket?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.error("Photo library permission denied");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const att: any = await api.post("/support/upload", await assetToFormData(res.assets[0]));
      setTicket(await api.post(`/support/tickets/${ticket.id}/messages`, { text: "", attachments: [att] }));
    } catch (e: any) { toast.error(e?.message || "Could not send photo"); }
    setUploading(false);
  };

  const msgs = (ticket?.messages || []).filter((m: any) => !m.internal);

  return (
    <>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable testID={`${testPrefix}help-btn`} onPress={openChat} style={{ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: PRIMARY[200], backgroundColor: PRIMARY[50], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <LifeBuoy size={16} color={PRIMARY[700]} /><Text style={{ fontWeight: "700", color: PRIMARY[700] }}>Help</Text>
        </Pressable>
        <Pressable testID={`${testPrefix}sos-btn`} onPress={callSOS} style={{ flex: 1, height: 44, borderRadius: 6, backgroundColor: ROSE[600], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <AlertTriangle size={16} color="#fff" /><Text style={{ fontWeight: "700", color: "#fff" }}>SOS · 112</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View testID="help-sos-modal" style={{ height: sheetH, marginBottom: kbH, backgroundColor: TC.surface, borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: TC.borderSoft }}>
              <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={18} color="#fff" /></View>
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
                    <View style={{ maxWidth: "78%", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: mine ? PRIMARY[600] : TC.surface, borderWidth: mine ? 0 : 1, borderColor: TC.borderSoft }}>
                      {!mine ? <Text style={{ fontSize: 10, fontWeight: "700", color: PRIMARY[600], marginBottom: 2 }}>{m.sender_name || "Support"}</Text> : null}
                      {(m.attachments || []).filter((a: any) => a.kind !== "pdf").map((a: any, j: number) => <Image key={j} testID="help-sos-msg-photo" source={{ uri: a.thumb_url || a.url }} style={{ width: 200, height: 150, borderRadius: 6, marginTop: 2 }} contentFit="cover" />)}
                      {m.text ? <Text style={{ fontSize: 14, color: mine ? "#fff" : TC.text }}>{m.text}</Text> : null}
                    </View>
                  </View>
                );
              })}
              {agentTyping ? <Text testID="help-sos-agent-typing" style={{ fontSize: 11, fontWeight: "600", color: PRIMARY[600] }}>Support is typing…</Text> : null}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: composerPad, borderTopWidth: 1, borderTopColor: TC.borderSoft, backgroundColor: TC.surface }}>
              <Pressable testID="help-sos-attach" onPress={sendPhoto} disabled={!ticket || uploading} style={{ width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderColor: TC.border, alignItems: "center", justifyContent: "center", opacity: !ticket ? 0.4 : 1 }}>
                {uploading ? <ActivityIndicator size="small" color={TC.textMuted} /> : <Paperclip size={18} color={TC.textMuted} />}
              </Pressable>
              <TextInput testID="help-sos-input" value={text} onChangeText={(v) => { setText(v); pingTyping(); }} onSubmitEditing={send}
                placeholder="Type your message…" placeholderTextColor={TC.textFaint} editable={!!ticket && !sending}
                style={{ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: TC.border, backgroundColor: TC.input, paddingHorizontal: 12, color: TC.text }} />
              <Pressable testID="help-sos-send" onPress={send} disabled={!text.trim() || sending} style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: PRIMARY[600], alignItems: "center", justifyContent: "center", opacity: !text.trim() || sending ? 0.4 : 1 }}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={18} color="#fff" />}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
