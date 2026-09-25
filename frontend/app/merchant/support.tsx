import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, TextInput, Platform, Alert, ActivityIndicator, useWindowDimensions, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LifeBuoy, Plus, Send, Paperclip, X, ArrowLeft, FileText, CheckCircle2, ShieldCheck, Search, Inbox, MoreVertical, Hash, CalendarDays, Clock, Check, CheckCheck, Tag, AlertCircle } from "lucide-react-native";
import { api, mediaUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { Icon } from "@/src/components/Icon";
import { SLATE } from "@/src/components/qr/qrKit";
import { pickImage, uploadAsset, SourceSheet } from "@/src/components/reg/Photo";
import { useFin, PremiumSelect } from "@/src/components/merchant/FinanceKit";
import { STATUS_LABEL, STATUSES, EMERALD500, EMERALD600, EMERALD700, StatusBadge, PriorityBadge, InfoRow, AttachmentView, timeStr, dateFull, dayKey, daySep, ago } from "@/src/components/merchant/SupportKit";

/* 1:1 port of web_panel/src/components/SupportCenter.jsx (mobile view) — merchant panel. */
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
const confirmAsync = (title: string, msg: string) => new Promise<boolean>((res) => {
  if (Platform.OS === "web") return res(window.confirm(msg));
  Alert.alert(title, msg, [{ text: "Cancel", style: "cancel", onPress: () => res(false) }, { text: "OK", onPress: () => res(true) }]);
});

/* shadcn Button — default h-10 rounded-md px-4 text-sm font-medium */
function Btn({ label, icon, onPress, bg, pressedBg, disabled, loading, style, testID, height = 40 }: { label: string; icon?: React.ReactNode; onPress: () => void; bg: string; pressedBg: string; disabled?: boolean; loading?: boolean; style?: any; testID?: string; height?: number }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [{ height, borderRadius: 6, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: pressed ? pressedBg : bg, opacity: disabled ? 0.5 : 1 }, style]}>
      {loading ? <ActivityIndicator size="small" color="#fff" /> : <>{icon}<Text style={{ color: "#fff", fontSize: 14, lineHeight: 20, fontWeight: "500" }}>{label}</Text></>}
    </Pressable>
  );
}
/* shadcn Input — h-10 rounded-md border-input bg-background px-3 text-sm */
function Input({ value, onChangeText, placeholder, testID, paddingLeft = 12, multiline, height = 40, onKeyPress, style }: { value: string; onChangeText: (t: string) => void; placeholder: string; testID?: string; paddingLeft?: number; multiline?: boolean; height?: number; onKeyPress?: (e: any) => void; style?: any }) {
  const { dark, card, heading } = useFin();
  return (
    <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={SLATE[400]} multiline={multiline} onKeyPress={onKeyPress}
      style={[{ height, borderRadius: multiline ? 8 : 6, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], backgroundColor: dark ? SLATE[800] : card, paddingLeft, paddingRight: 12, paddingVertical: multiline ? 8 : 0, fontSize: 14, color: heading, textAlignVertical: multiline ? "top" : "center" }, style]} />
  );
}
const Label = ({ children }: { children: string }) => <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color: SLATE[500], marginBottom: 4 }}>{children}</Text>;
const Section = ({ children }: { children: string }) => <Text style={{ fontSize: 11, lineHeight: 14, textTransform: "uppercase", letterSpacing: 0.55, color: SLATE[400], fontWeight: "700", marginBottom: 8 }}>{children}</Text>;
const IconBtn = ({ icon, onPress, testID, disabled }: { icon: React.ReactNode; onPress: () => void; testID?: string; disabled?: boolean }) => {
  const { dark } = useFin();
  return <Pressable testID={testID} onPress={onPress} disabled={disabled} hitSlop={4} style={({ pressed }) => ({ height: 32, width: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? (dark ? SLATE[800] : SLATE[100]) : "transparent" })}>{icon}</Pressable>;
};
function Avatar({ size, icon }: { size: number; icon: number }) {
  const { P } = useFin();
  return <View style={{ height: size, width: size, borderRadius: size / 2, backgroundColor: P[100], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={icon} color={P[700]} /></View>;
}

/* -------- new ticket form -------- */
function NewTicket({ meta, onCreated, onCancel }: { meta: any; onCreated: (t: any) => void; onCancel: () => void }) {
  const { card, dark, heading, P } = useFin();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("medium");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!subject.trim()) return toast.error("Please enter a subject");
    if (!message.trim()) return toast.error("Please describe your issue");
    setBusy(true);
    try { const data = await api.post<any>("/support/tickets", { subject, category, priority, message }); toast.success(`Ticket ${data.code} created`); onCreated(data); }
    catch (e: any) { toast.error(e?.detail || "Could not create ticket"); } finally { setBusy(false); }
  };
  const opts = (arr: string[]) => (arr || []).map((v) => ({ value: v, label: cap(v) }));
  return (
    <View testID="support-new-form">
      <Pressable testID="support-new-back" onPress={onCancel} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16, alignSelf: "flex-start" }}><ArrowLeft size={16} color={SLATE[500]} /><Text style={{ fontSize: 14, lineHeight: 20, color: SLATE[500] }}>Back</Text></Pressable>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: dark ? SLATE[800] : SLATE[200], backgroundColor: card, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><LifeBuoy size={20} color={P[600]} /><Text style={{ fontSize: 18, lineHeight: 28, fontWeight: "700", color: heading }}>Raise a new ticket</Text></View>
        <View><Label>Subject *</Label><Input testID="support-subject" value={subject} onChangeText={setSubject} placeholder="Briefly, what's the issue?" /></View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Label>Category</Label><PremiumSelect testID="support-category" value={category} onChange={(v) => setCategory(String(v))} options={opts(meta?.categories || ["other"])} placeholder="Category" /></View>
          <View style={{ flex: 1 }}><Label>Priority</Label><PremiumSelect testID="support-priority" value={priority} onChange={(v) => setPriority(String(v))} options={opts(meta?.priorities || ["medium"])} placeholder="Priority" /></View>
        </View>
        <View><Label>Describe your issue *</Label><Input testID="support-message" value={message} onChangeText={setMessage} placeholder="Tell us what happened…" multiline height={120} /></View>
        <Btn testID="support-submit" label="Submit ticket" onPress={submit} loading={busy} bg={P[700]} pressedBg={P[800]} />
        <Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400], textAlign: "center" }}>You can attach screenshots inside the ticket chat after creating it.</Text>
      </View>
    </View>
  );
}

/* -------- chat thread (mobile: conversation card + info panel stacked) -------- */
function Thread({ ticket, myId, tickets, onBack, onChanged }: { ticket: any; myId?: string; tickets: any[]; onBack: () => void; onChanged: () => void }) {
  const { card, dark, heading, body, strong, P, hairline } = useFin();
  const toast = useToast();
  const { height: winH } = useWindowDimensions();
  const [t, setT] = useState<any>(ticket);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const endRef = useRef<ScrollView>(null);
  const lastTypingSent = useRef(0);
  const closed = t.status === "closed";
  const border = dark ? SLATE[800] : SLATE[200];
  const bubbleBorder = dark ? SLATE[700] : SLATE[100];

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<any>(`/support/tickets/${ticket.id}`);
      setT((prev: any) => {
        const a = prev || {};
        if ((a.messages?.length || 0) === (data.messages?.length || 0) && !!a.agent_typing === !!data.agent_typing && a.status === data.status && a.last_message_at === data.last_message_at) return a;
        return data;
      });
    } catch { /* ignore */ }
  }, [ticket.id]);
  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 3000) return;
    lastTypingSent.current = now;
    api.post(`/support/tickets/${ticket.id}/typing`).catch(() => {});
  }, [ticket.id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const iv = setInterval(refresh, 3000); return () => clearInterval(iv); }, [refresh]);
  useEffect(() => { setTimeout(() => endRef.current?.scrollToEnd({ animated: true }), 50); }, [t.messages?.length, t.agent_typing]);

  const pickFile = async (source: "camera" | "gallery") => {
    setUploading(true);
    try { const asset = await pickImage(source, "back"); if (asset) { const data = await uploadAsset("/support", "support", asset); setPending((p) => [...p, data]); } }
    catch (e: any) { toast.error(e?.message || "Could not upload"); }
    setUploading(false);
  };
  const send = async () => {
    if (!text.trim() && pending.length === 0) return;
    setSending(true);
    try { const data = await api.post<any>(`/support/tickets/${ticket.id}/messages`, { text, attachments: pending }); setT(data); setText(""); setPending([]); onChanged(); }
    catch (e: any) { toast.error(e?.detail || "Could not send"); } finally { setSending(false); }
  };
  const closeTicket = async () => {
    setMenuOpen(false);
    if (!(await confirmAsync("Close ticket", "Close this ticket? You won't be able to reply after closing — you'd need to raise a new ticket."))) return;
    try { const data = await api.post<any>(`/support/tickets/${ticket.id}/close`); setT(data); onChanged(); toast.success("Ticket closed"); }
    catch { toast.error("Could not close"); }
  };

  const allAttachments: any[] = (t.messages || []).flatMap((m: any) => m.attachments || []);
  const others = (tickets || []).filter((x) => x.id !== ticket.id);
  let lastDay: string | null = null;
  const cardH = Math.max(480, winH - 230);

  return (
    <View style={{ gap: 16 }} testID="support-thread">
      {/* ---- main conversation ---- */}
      <View style={{ height: cardH, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: card, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: hairline, zIndex: 20 }}>
          <IconBtn testID="support-thread-back" onPress={onBack} icon={<ArrowLeft size={16} color={heading} />} />
          <Avatar size={36} icon={20} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[400], fontFamily: MONO }}>{t.code}</Text>
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", color: heading }} numberOfLines={1} testID="support-thread-subject">{t.subject}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400] }}>Updated {ago(t.updated_at)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: EMERALD500 }} /><Text style={{ fontSize: 11, lineHeight: 14, color: EMERALD500 }}>Live</Text></View>
            </View>
          </View>
          <StatusBadge status={t.status} testID="support-thread-status" />
          {!closed ? (
            <View style={{ position: "relative" }}>
              <IconBtn testID="support-menu-btn" onPress={() => setMenuOpen((v) => !v)} icon={<MoreVertical size={16} color={heading} />} />
              {menuOpen ? (
                <View style={{ position: "absolute", right: 0, top: 36, zIndex: 30, width: 176, borderRadius: 12, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], backgroundColor: dark ? SLATE[800] : "#fff", paddingVertical: 6, boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.1), 0px 8px 10px -6px rgba(0,0,0,0.1)" }}>
                  <Pressable testID="support-close-btn" onPress={closeTicket} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? "#fef2f2" : "transparent" })}><X size={14} color="#dc2626" /><Text style={{ fontSize: 14, lineHeight: 20, color: "#dc2626" }}>Close ticket</Text></Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* messages */}
        <ScrollView ref={endRef} style={{ flex: 1, backgroundColor: dark ? "rgba(2,6,23,0.3)" : "rgba(248,250,252,0.6)" }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" testID="support-messages">
          {(t.messages || []).map((m: any) => {
            const sep = dayKey(m.at) !== lastDay ? daySep(m.at) : null;
            lastDay = dayKey(m.at);
            const mine = m.sender_id === myId;
            const isAdmin = m.sender_role === "admin";
            return (
              <React.Fragment key={m.id}>
                {sep ? <View style={{ alignItems: "center", marginVertical: 8 }}><Text style={{ fontSize: 10, lineHeight: 14, fontWeight: "700", letterSpacing: 0.5, color: SLATE[400], backgroundColor: dark ? SLATE[800] : "rgba(226,232,240,0.7)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>{sep}</Text></View> : null}
                {m.system ? (
                  <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400], backgroundColor: dark ? SLATE[800] : SLATE[100], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>{m.text}</Text></View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    {!mine ? <Avatar size={28} icon={14} /> : null}
                    <View style={{ maxWidth: "76%", gap: 4, alignItems: mine ? "flex-end" : "flex-start" }}>
                      {!mine ? <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "600", color: SLATE[500], paddingHorizontal: 4 }}>{isAdmin ? "Support" : m.sender_name}</Text> : null}
                      {(m.attachments || []).length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{m.attachments.map((a: any, i: number) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</View> : null}
                      {m.text ? (
                        <View style={{ borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: mine ? EMERALD500 : (dark ? SLATE[800] : "#fff"), borderWidth: mine ? 0 : 1, borderColor: bubbleBorder, boxShadow: "0px 1px 2px rgba(0,0,0,0.05)" }}>
                          <Text style={{ fontSize: 14, lineHeight: 20, color: mine ? "#fff" : body }}>{m.text}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, justifyContent: mine ? "flex-end" : "flex-start" }}>
                            <Text style={{ fontSize: 10, lineHeight: 14, color: mine ? "rgba(255,255,255,0.8)" : SLATE[400] }}>{timeStr(m.at)}</Text>
                            {mine ? (t.unread_admin === 0 ? <CheckCheck size={12} color="rgba(255,255,255,0.8)" /> : <Check size={12} color="rgba(255,255,255,0.8)" />) : null}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )}
              </React.Fragment>
            );
          })}
          {t.agent_typing ? (
            <View style={{ flexDirection: "row" }} testID="support-agent-typing">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: dark ? SLATE[800] : "#fff", borderWidth: 1, borderColor: bubbleBorder, paddingHorizontal: 14, paddingVertical: 10 }}>
                <ShieldCheck size={12} color={P[600]} /><Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "600", color: P[600] }}>Support is typing</Text>
                <View style={{ flexDirection: "row", gap: 4, marginLeft: 4 }}>{[0, 1, 2].map((i) => <View key={i} style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: P[400] }} />)}</View>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* composer */}
        {closed ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: hairline, backgroundColor: dark ? SLATE[900] : SLATE[50], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }} testID="support-closed-note">
            <CheckCircle2 size={16} color={EMERALD500} /><Text style={{ fontSize: 14, lineHeight: 20, color: SLATE[500], flexShrink: 1, textAlign: "center" }}>This ticket is closed. Please raise a new ticket for further help.</Text>
          </View>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: hairline, padding: 12 }}>
            <Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400], textAlign: "right", marginBottom: 6 }}>Enter to send · Shift+Enter for newline</Text>
            {pending.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {pending.map((a, i) => (
                  <View key={i} style={{ position: "relative" }}>
                    {a.kind === "pdf" ? <View style={{ height: 64, width: 64, borderRadius: 8, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center", backgroundColor: SLATE[50] }}><FileText size={24} color="#ef4444" /></View>
                      : <Image source={{ uri: mediaUrl(a.thumb_url || a.url) }} style={{ height: 64, width: 64, borderRadius: 8, borderWidth: 1, borderColor: border }} contentFit="cover" />}
                    <Pressable testID={`support-pending-remove-${i}`} onPress={() => setPending((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, height: 20, width: 20, borderRadius: 10, backgroundColor: SLATE[800], alignItems: "center", justifyContent: "center" }}><X size={12} color="#fff" /></Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], padding: 8 }}>
              <Pressable testID="support-attach-btn" onPress={() => setPick(true)} disabled={uploading} style={({ pressed }) => ({ height: 36, width: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? (dark ? SLATE[800] : SLATE[100]) : "transparent" })}>
                {uploading ? <ActivityIndicator size="small" color={SLATE[500]} /> : <Paperclip size={16} color={SLATE[500]} />}
              </Pressable>
              <TextInput testID="support-reply-input" value={text} onChangeText={(v) => { setText(v); pingTyping(); }} placeholder="Type a message…" placeholderTextColor={SLATE[400]} multiline
                onKeyPress={(e: any) => { if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) { e.preventDefault?.(); send(); } }}
                style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 8, fontSize: 14, lineHeight: 20, color: heading, maxHeight: 112, minHeight: 36 }} />
              <Btn testID="support-send-btn" label="Send" icon={<Send size={16} color="#fff" />} onPress={send} loading={sending} disabled={sending || (!text.trim() && pending.length === 0)} bg={EMERALD600} pressedBg={EMERALD700} height={36} />
            </View>
          </View>
        )}
      </View>

      {/* ---- info panel ---- */}
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: card, overflow: "hidden" }} testID="support-ticket-info">
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: hairline, gap: 2 }}>
          <Section>Ticket details</Section>
          <InfoRow icon={<Hash size={16} color={SLATE[400]} />} label="Ticket ID" value={t.code} />
          <InfoRow icon={<Tag size={16} color={SLATE[400]} />} label="Department" value={cap(t.category || "")} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}><AlertCircle size={16} color={SLATE[400]} /><Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[500], width: 96 }}>Priority</Text><PriorityBadge priority={t.priority} /></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}><CheckCircle2 size={16} color={SLATE[400]} /><Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[500], width: 96 }}>Status</Text><StatusBadge status={t.status} /></View>
          <InfoRow icon={<CalendarDays size={16} color={SLATE[400]} />} label="Created" value={dateFull(t.created_at)} />
          <InfoRow icon={<Clock size={16} color={SLATE[400]} />} label="Updated" value={dateFull(t.updated_at)} />
          {t.assigned_name ? <InfoRow icon={<ShieldCheck size={16} color={SLATE[400]} />} label="Agent" value={t.assigned_name} /> : null}
        </View>
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: hairline }}>
          <Section>{`Attachments · ${allAttachments.length}`}</Section>
          {allAttachments.length === 0 ? <Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[400] }}>No attachments yet — use the clip icon to add screenshots.</Text>
            : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{allAttachments.map((a, i) => <AttachmentView key={i} a={a} onOpen={setLightbox} />)}</View>}
        </View>
        <View style={{ padding: 16 }}>
          <Section>{`Your other tickets · ${others.length}`}</Section>
          {others.length === 0 ? <Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[400] }}>This is your only ticket.</Text>
            : <View style={{ gap: 6 }}>{others.slice(0, 12).map((p) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: hairline, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, color: strong }} numberOfLines={1}>{p.subject}</Text>
                <StatusBadge status={p.status} />
              </View>
            ))}</View>}
        </View>
      </View>

      <SourceSheet open={pick} onClose={() => setPick(false)} onPick={pickFile} title="Attach screenshot" />
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable testID="support-lightbox" onPress={() => setLightbox(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {lightbox ? <Image source={{ uri: mediaUrl(lightbox) }} style={{ width: "90%", height: "90%", borderRadius: 8 }} contentFit="contain" /> : null}
          <View style={{ position: "absolute", top: 16, right: 16, height: 40, width: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}><X size={20} color="#fff" /></View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* -------- main -------- */
export default function MerchantSupport({ title = "Help & Support" }: { title?: string }) {
  const { P, dark, colors, heading, muted, card } = useFin();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const shopName = user?.shop_name || user?.name || "My Shop";
  const [meta, setMeta] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [view, setView] = useState<"list" | "new" | "thread">("list");
  const [active, setActive] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ status: "", q: "" });
  const [range, setRange] = useState("all");
  const [sort, setSort] = useState("newest");

  const loadList = useCallback(async () => {
    try { const data = await api.get<any[]>("/support/tickets"); setTickets(Array.isArray(data) ? data : []); } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { api.get<any>("/support/meta").then(setMeta).catch(() => {}); loadList(); }, [loadList]);
  useEffect(() => { if (view !== "list") return; const iv = setInterval(loadList, 6000); return () => clearInterval(iv); }, [view, loadList]);
  const openTicket = (t: any) => { setActive(t); setView("thread"); };

  const rows = useMemo(() => {
    let out = [...tickets];
    if (f.status) out = out.filter((r) => r.status === f.status);
    if (f.q) { const q = f.q.toLowerCase(); out = out.filter((r) => (r.subject || "").toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q)); }
    if (range !== "all") {
      const cut = Date.now() - (range === "today" ? 1 : Number(range)) * 86400000;
      out = out.filter((r) => new Date(r.created_at).getTime() >= (range === "today" ? new Date().setHours(0, 0, 0, 0) : cut));
    }
    out.sort((a, b) => sort === "newest" ? +new Date(b.created_at) - +new Date(a.created_at) : +new Date(a.created_at) - +new Date(b.created_at));
    return out;
  }, [tickets, f, range, sort]);

  const border = dark ? SLATE[800] : SLATE[200];
  const newBtn = (testID: string) => <Btn testID={testID} label="New Ticket" icon={<Plus size={16} color="#fff" />} onPress={() => setView("new")} bg={EMERALD600} pressedBg={EMERALD700} style={{ alignSelf: "flex-start" }} />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadList} tintColor={P[700]} colors={[P[700]]} />} testID="support-center">
        {/* Page header (MerchantDashboard.jsx) */}
        <View style={{ marginBottom: 16 }}>
          <Text testID="merchant-support-header" style={{ fontSize: 20, lineHeight: 28, fontWeight: "800", color: heading }} numberOfLines={1}>Help & Support</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}><Icon name="store" size={14} color={P[700]} /><Text style={{ fontSize: 12, lineHeight: 16, color: muted }} numberOfLines={1}>{shopName}</Text></View>
        </View>

        {view === "list" ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <View style={{ flexShrink: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><LifeBuoy size={24} color={P[600]} /><Text style={{ fontSize: 24, lineHeight: 32, fontWeight: "800", color: heading }}>{title}</Text></View>
                <Text style={{ fontSize: 14, lineHeight: 20, color: SLATE[500] }} testID="support-count">{rows.length} ticket{rows.length !== 1 ? "s" : ""} · chat with our support team, attach screenshots, track status.</Text>
              </View>
              {newBtn("support-new-btn")}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1, minWidth: 200, position: "relative" }}>
                <View style={{ position: "absolute", left: 12, top: 12, zIndex: 1 }}><Search size={16} color={SLATE[400]} /></View>
                <Input testID="support-list-search" value={f.q} onChangeText={(q) => setF({ ...f, q })} placeholder="Search your tickets…" paddingLeft={36} />
              </View>
              <PremiumSelect testID="support-range" value={range} onChange={(v) => setRange(String(v))} placeholder="Range" style={{ minWidth: 140 }} options={[{ value: "all", label: "All time" }, { value: "today", label: "Today" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }]} />
              <PremiumSelect testID="support-filter-status" value={f.status} onChange={(v) => setF({ ...f, status: String(v) })} placeholder="All statuses" style={{ minWidth: 150 }} options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
              <PremiumSelect testID="support-sort" value={sort} onChange={(v) => setSort(String(v))} placeholder="Sort" style={{ minWidth: 140 }} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]} />
            </View>

            {loading ? (
              <View style={{ paddingVertical: 64, alignItems: "center" }} testID="support-loading"><ActivityIndicator size="small" color={P[500]} /></View>
            ) : rows.length === 0 ? (
              <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: dark ? SLATE[700] : SLATE[300], padding: 48, alignItems: "center" }} testID="support-empty">
                <Inbox size={40} color={SLATE[300]} />
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "500", color: SLATE[500], marginTop: 12 }}>No tickets found</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: SLATE[400], marginBottom: 16 }}>Need help? Raise your first support ticket.</Text>
                {newBtn("support-empty-new-btn")}
              </View>
            ) : (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: card, overflow: "hidden" }} testID="support-list">
                {rows.map((tk) => (
                  <Pressable key={tk.id} testID={`support-ticket-${tk.code}`} onPress={() => openTicket(tk)}
                    style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: dark ? "rgba(30,41,59,0.6)" : SLATE[50], gap: 8, backgroundColor: pressed ? (dark ? "rgba(30,41,59,0.4)" : SLATE[50]) : "transparent" })}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {tk.unread_user > 0 ? <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: "#ef4444" }} testID={`support-unread-${tk.code}`} /> : null}
                        <Text style={{ fontSize: 12, lineHeight: 16, color: SLATE[500], fontFamily: MONO }}>{tk.code}</Text>
                      </View>
                      <View style={{ flex: 1 }}><PriorityBadge priority={tk.priority} /></View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1 }}><StatusBadge status={tk.status} /></View><View style={{ flex: 1 }} /></View>
                    <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: heading }} numberOfLines={1}>{tk.subject}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : null}

        {view === "new" ? <NewTicket meta={meta} onCancel={() => setView("list")} onCreated={(t) => { loadList(); openTicket(t); }} /> : null}

        {view === "thread" && active ? <Thread ticket={active} myId={user?.id} tickets={tickets} onBack={() => { setView("list"); loadList(); }} onChanged={loadList} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
