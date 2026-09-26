/** Support ticket thread — port of web SupportCenter.jsx `Thread` (mobile: conversation + info panel below). */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, ShieldCheck, MoreVertical, X, Send, Paperclip, CheckCircle2, Check, CheckCheck, Hash, Tag, AlertCircle, CalendarDays, Clock, FileText } from "lucide-react-native";
import { api } from "../../api/client";
import { useToast } from "../Toast";
import { PRIMARY, SLATE, EMERALD, useTheme } from "../../theme";
import { CenterDialog } from "./BookingDialogs";
import { STATUS_STYLE, STATUS_LABEL, PRIORITY_STYLE, timeStr, dateFull, dayKey, daySep, ago, Badge, AttachmentView, assetToFormData } from "./supportShared";

const InfoRow = ({ icon: Icon, label, value, testID }: { icon: any; label: string; value: any; testID?: string }) => {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 }}>
      <Icon size={16} color={SLATE[400]} style={{ marginTop: 1 }} /><Text style={{ fontSize: 12, color: SLATE[500], width: 96 }}>{label}</Text>
      {typeof value === "string" || !value ? <Text testID={testID} style={{ fontSize: 12, fontWeight: "500", color: c.text, flex: 1 }}>{value || "—"}</Text> : <View style={{ flex: 1 }}>{value}</View>}
    </View>
  );
};

export function SupportThread({ ticket, myId, tickets, onBack, onChanged }: { ticket: any; myId?: string; tickets: any[]; onBack: () => void; onChanged: () => void }) {
  const { c, isDark } = useTheme();
  const toast = useToast();
  const [t, setT] = useState<any>(ticket);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastTypingSent = useRef(0);
  const closed = t.status === "closed";

  const refresh = useCallback(async () => {
    try {
      const data: any = await api.get(`/support/tickets/${ticket.id}`);
      setT((prev: any) => {
        const a = prev || {};
        if ((a.messages?.length || 0) === (data.messages?.length || 0) && !!a.agent_typing === !!data.agent_typing && a.status === data.status && a.last_message_at === data.last_message_at) return a;
        return data;
      });
    } catch {}
  }, [ticket.id]);
  const pingTyping = useCallback(() => { const now = Date.now(); if (now - lastTypingSent.current < 3000) return; lastTypingSent.current = now; api.post(`/support/tickets/${ticket.id}/typing`).catch(() => {}); }, [ticket.id]);

  useEffect(() => { refresh(); const iv = setInterval(refresh, 3000); return () => clearInterval(iv); }, [refresh]);
  useEffect(() => { const h = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(h); }, [t.messages?.length, t.agent_typing]);

  const pickFiles = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.error("Photo library permission denied");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.8 });
    if (res.canceled) return;
    setUploading(true);
    for (const a of res.assets) {
      try { const data: any = await api.post("/support/upload", await assetToFormData(a)); setPending((p) => [...p, data]); }
      catch (e: any) { toast.error(e?.message || `Could not upload ${a.fileName || "file"}`); }
    }
    setUploading(false);
  };
  const send = async () => {
    if (!text.trim() && pending.length === 0) return;
    setSending(true);
    try { const data: any = await api.post(`/support/tickets/${ticket.id}/messages`, { text, attachments: pending }); setT(data); setText(""); setPending([]); onChanged(); }
    catch (e: any) { toast.error(e?.message || "Could not send"); }
    finally { setSending(false); }
  };
  const closeTicket = async () => {
    setConfirmClose(false);
    try { const data: any = await api.post(`/support/tickets/${ticket.id}/close`); setT(data); onChanged(); toast.success("Ticket closed"); } catch { toast.error("Could not close"); }
  };

  const allAttachments = (t.messages || []).flatMap((m: any) => m.attachments || []);
  const others = (tickets || []).filter((x) => x.id !== ticket.id);
  const panel = { borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" as const };
  const sec = { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.8, color: SLATE[400], fontWeight: "700" as const, marginBottom: 8 };

  return (
    <View testID="support-thread" style={{ gap: 16 }}>
      <View style={{ ...panel, height: 520 }}>
        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
          <Pressable testID="support-thread-back" onPress={onBack} hitSlop={8} style={{ height: 32, width: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><ArrowLeft size={16} color={c.text} /></Pressable>
          <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={20} color={c.primaryText} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: c.text }}><Text style={{ fontSize: 12, color: SLATE[400], fontFamily: "monospace" }}>{t.code}</Text>  {t.subject}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ fontSize: 11, color: SLATE[400] }}>Updated {ago(t.updated_at)}</Text><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: EMERALD[500] }} /><Text style={{ fontSize: 11, color: EMERALD[500] }}>Live</Text></View>
          </View>
          <Badge testID="thread-status" style={STATUS_STYLE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          {!closed ? <Pressable testID="support-thread-menu" onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={{ height: 32, width: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><MoreVertical size={16} color={c.text} /></Pressable> : null}
        </View>
        {menuOpen ? (
          <View style={{ position: "absolute", right: 12, top: 52, zIndex: 20, width: 176, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingVertical: 6, boxShadow: "0px 10px 30px rgba(15,23,42,0.25)" } as any}>
            <Pressable testID="support-close-btn" onPress={() => { setMenuOpen(false); setConfirmClose(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}><X size={14} color="#DC2626" /><Text style={{ fontSize: 14, color: "#DC2626" }}>Close ticket</Text></Pressable>
          </View>
        ) : null}

        {/* messages */}
        <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: isDark ? "rgba(2,6,23,0.3)" : "rgba(248,250,252,0.6)" }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
          {(t.messages || []).map((m: any, idx: number, arr: any[]) => {
            const sep = idx === 0 || dayKey(m.at) !== dayKey(arr[idx - 1]?.at) ? daySep(m.at) : null;
            const mine = m.sender_id === myId; const isAdmin = m.sender_role === "admin";
            return (
              <View key={m.id} style={{ gap: 8 }}>
                {sep ? <View style={{ alignItems: "center", marginVertical: 8 }}><Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: SLATE[400], backgroundColor: isDark ? SLATE[800] : "rgba(226,232,240,0.7)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>{sep}</Text></View> : null}
                {m.system ? <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, color: SLATE[400], backgroundColor: isDark ? SLATE[800] : SLATE[100], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>{m.text}</Text></View> : (
                  <View testID={`support-msg-${m.id}`} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    {!mine ? <View style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={14} color={c.primaryText} /></View> : null}
                    <View style={{ maxWidth: "76%", gap: 4, alignItems: mine ? "flex-end" : "flex-start" }}>
                      {!mine ? <Text style={{ fontSize: 11, fontWeight: "600", color: SLATE[500], paddingHorizontal: 4 }}>{isAdmin ? "Support" : m.sender_name}</Text> : null}
                      {(m.attachments || []).length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{m.attachments.map((a: any, i: number) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</View> : null}
                      {m.text ? (
                        <View style={{ borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: mine ? EMERALD[500] : c.surface, borderWidth: mine ? 0 : 1, borderColor: c.borderSoft }}>
                          <Text style={{ fontSize: 14, color: mine ? "#fff" : (isDark ? SLATE[100] : SLATE[700]) }}>{m.text}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, justifyContent: mine ? "flex-end" : "flex-start" }}>
                            <Text style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.8)" : SLATE[400] }}>{timeStr(m.at)}</Text>
                            {mine ? (t.unread_admin === 0 ? <CheckCheck size={12} color="rgba(255,255,255,0.8)" /> : <Check size={12} color="rgba(255,255,255,0.8)" />) : null}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          {t.agent_typing ? (
            <View testID="support-agent-typing" style={{ flexDirection: "row" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderSoft, paddingHorizontal: 14, paddingVertical: 10 }}>
                <ShieldCheck size={12} color={PRIMARY[600]} /><Text style={{ fontSize: 11, fontWeight: "600", color: PRIMARY[600] }}>Support is typing</Text><ActivityIndicator size="small" color={PRIMARY[400]} />
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* composer */}
        {closed ? (
          <View testID="support-closed-note" style={{ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: c.borderSoft, backgroundColor: c.bg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <CheckCircle2 size={16} color={EMERALD[500]} /><Text style={{ fontSize: 14, color: SLATE[500], flex: 1 }}>This ticket is closed. Please raise a new ticket for further help.</Text>
          </View>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: c.borderSoft, padding: 12, gap: 8 }}>
            {pending.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {pending.map((a, i) => (
                  <View key={i} testID={`support-pending-${i}`} style={{ position: "relative" }}>
                    {a.kind === "pdf" ? <View style={{ height: 64, width: 64, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}><FileText size={24} color="#EF4444" /></View> : <Image source={{ uri: a.thumb_url || a.url }} style={{ height: 64, width: 64, borderRadius: 8 }} contentFit="cover" />}
                    <Pressable onPress={() => setPending((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, height: 20, width: 20, borderRadius: 10, backgroundColor: SLATE[800], alignItems: "center", justifyContent: "center" }}><X size={12} color="#fff" /></Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], padding: 8 }}>
              <Pressable testID="support-attach-btn" onPress={pickFiles} disabled={uploading} style={{ height: 36, width: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" }}>{uploading ? <ActivityIndicator size="small" color={SLATE[500]} /> : <Paperclip size={16} color={SLATE[500]} />}</Pressable>
              <TextInput testID="support-reply-input" value={text} onChangeText={(v) => { setText(v); pingTyping(); }} placeholder="Type a message…" placeholderTextColor={SLATE[400]} multiline style={{ flex: 1, fontSize: 14, color: c.text, paddingHorizontal: 4, paddingVertical: 8, maxHeight: 112, outlineStyle: "none" } as any} />
              <Pressable testID="support-send-btn" onPress={send} disabled={sending || (!text.trim() && pending.length === 0)} style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: 8, backgroundColor: pressed ? EMERALD[700] : EMERALD[600], flexDirection: "row", alignItems: "center", gap: 4, opacity: sending || (!text.trim() && pending.length === 0) ? 0.5 : 1 })}>
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <><Send size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Send</Text></>}
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* info panel */}
      <View testID="support-ticket-info" style={panel}>
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
          <Text style={sec}>Ticket details</Text>
          <InfoRow icon={Hash} label="Ticket ID" value={t.code} testID="info-code" />
          <InfoRow icon={Tag} label="Department" value={<Text style={{ fontSize: 12, fontWeight: "500", color: c.text, textTransform: "capitalize" }}>{t.category}</Text>} />
          <InfoRow icon={AlertCircle} label="Priority" value={<Badge style={PRIORITY_STYLE[t.priority]}>{t.priority}</Badge>} />
          <InfoRow icon={CheckCircle2} label="Status" value={<Badge style={STATUS_STYLE[t.status]}>{STATUS_LABEL[t.status]}</Badge>} />
          <InfoRow icon={CalendarDays} label="Created" value={dateFull(t.created_at)} />
          <InfoRow icon={Clock} label="Updated" value={dateFull(t.updated_at)} />
          {t.assigned_name ? <InfoRow icon={ShieldCheck} label="Agent" value={t.assigned_name} /> : null}
        </View>
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
          <Text style={sec}>Attachments · {allAttachments.length}</Text>
          {allAttachments.length === 0 ? <Text style={{ fontSize: 12, color: SLATE[400] }}>No attachments yet — use the clip icon to add screenshots.</Text> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{allAttachments.map((a: any, i: number) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</View>}
        </View>
        <View style={{ padding: 16 }}>
          <Text style={sec}>Your other tickets · {others.length}</Text>
          {others.length === 0 ? <Text style={{ fontSize: 12, color: SLATE[400] }}>This is your only ticket.</Text> : (
            <View style={{ gap: 6 }}>{others.slice(0, 12).map((p) => <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: c.borderSoft, paddingHorizontal: 10, paddingVertical: 6 }}><Text numberOfLines={1} style={{ fontSize: 12, color: c.text, flex: 1 }}>{p.subject}</Text><Badge style={STATUS_STYLE[p.status]}>{STATUS_LABEL[p.status]}</Badge></View>)}</View>
          )}
        </View>
      </View>

      <CenterDialog open={confirmClose} onClose={() => setConfirmClose(false)} testID="support-close-dialog">
        <Text style={{ fontSize: 18, fontWeight: "600", color: c.text }}>Close this ticket?</Text>
        <Text style={{ fontSize: 14, color: c.textMuted }}>You won&apos;t be able to reply after closing — you&apos;d need to raise a new ticket.</Text>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Pressable testID="support-close-cancel" onPress={() => setConfirmClose(false)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 14, fontWeight: "500", color: c.text }}>Cancel</Text></Pressable>
          <Pressable testID="support-close-confirm" onPress={closeTicket} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 6, backgroundColor: pressed ? "#B91C1C" : "#DC2626", alignItems: "center", justifyContent: "center" })}><Text style={{ fontSize: 14, fontWeight: "500", color: "#fff" }}>Close ticket</Text></Pressable>
        </View>
      </CenterDialog>

      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable testID="support-lightbox" onPress={() => setLightbox(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {lightbox ? <Image source={{ uri: lightbox }} style={{ width: "100%", height: "80%", borderRadius: 8 }} contentFit="contain" /> : null}
          <View style={{ position: "absolute", top: 16, right: 16, height: 40, width: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}><X size={20} color="#fff" /></View>
        </Pressable>
      </Modal>
    </View>
  );
}
