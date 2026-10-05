import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, RefreshControl, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader } from "@/src/components/AppShell";
import { useAuth } from "@/src/context/AuthContext";
import { Badge, Button, CardSkeleton, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { timeAgo } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

const GREEN = "#059669";
const SLATE400 = "#94A3B8";
const FALLBACK_CATS = ["booking", "payment", "refund", "account", "technical", "other"];
const FALLBACK_PRIOS = ["low", "medium", "high", "urgent"];
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed" };
const prioTone = (p?: string): any => ({ low: "neutral", medium: "info", high: "warning", urgent: "danger" }[(p || "").toLowerCase()] || "warning");
const inputStyle = (colors: any) => ({ height: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.text, fontSize: fontSize.md });

export default function SupportList() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("medium");

  const { data, isLoading, isFetching } = useQuery({ queryKey: ["support-tickets"], queryFn: () => api.get<any[]>("/support/tickets") });
  const metaQ = useQuery({ queryKey: ["support-meta"], queryFn: () => api.get<any>("/support/meta") });
  const CATS: string[] = metaQ.data?.categories?.length ? metaQ.data.categories : FALLBACK_CATS;
  const PRIOS: string[] = metaQ.data?.priorities?.length ? metaQ.data.priorities : FALLBACK_PRIOS;
  const tickets = Array.isArray(data) ? data : [];

  const create = useMutation({
    mutationFn: () => api.post("/support/tickets", { subject: subject.trim(), category, priority, message: message.trim() }),
    onSuccess: () => { toast.success("Ticket created"); setOpen(false); setSubject(""); setMessage(""); qc.invalidateQueries({ queryKey: ["support-tickets"] }); },
    onError: (e: any) => toast.error(e?.detail || "Could not create ticket"),
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState("all");
  const [sort, setSort] = useState("newest");

  /* anchored dropdown (floats above the ticket list) */
  const [openDD, setOpenDD] = useState<string | null>(null);
  const triggerRefs = React.useRef<Record<string, any>>({});
  const [ddAnchor, setDdAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const openDropdown = (id: string) => {
    const node = triggerRefs.current[id];
    if (node?.measureInWindow) node.measureInWindow((x: number, y: number, w: number, h: number) => { setDdAnchor({ x, y, w, h }); setOpenDD(id); });
    else setOpenDD(id);
  };

  const now = Date.now();
  const list = tickets
    .filter((t) => !search.trim() || `${t.subject} ${t.code} ${t.category}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((t) => !status || t.status === status)
    .filter((t) => range === "all" || now - new Date(t.created_at).getTime() < (range === "7d" ? 7 : 30) * 86400000)
    .sort((x, y) => (sort === "newest" ? 1 : -1) * (new Date(y.updated_at || y.created_at).getTime() - new Date(x.updated_at || x.created_at).getTime()));

  /* compact pill-style filter (matches customer app) */
  const Pill = ({ id, icon, value, options }: { id: string; icon: any; value: string; options: [string, string][] }) => (
    <>
      <Pressable ref={(n) => { triggerRefs.current[id] = n; }} testID={`support-${id}`} onPress={() => (openDD === id ? setOpenDD(null) : openDropdown(id))}
        style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={15} color={SLATE400} />
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{options.find((o) => o[0] === value)?.[1]}</Text>
        <Icon name="chevron-down" size={16} color={SLATE400} />
      </Pressable>
      <Modal visible={openDD === id} transparent animationType="fade" onRequestClose={() => setOpenDD(null)} statusBarTranslucent>
        <Pressable testID={`support-${id}-backdrop`} style={{ flex: 1 }} onPress={() => setOpenDD(null)}>
          {ddAnchor ? (
            <View style={{ position: "absolute", top: ddAnchor.y + ddAnchor.h + 4, left: ddAnchor.x, minWidth: Math.max(ddAnchor.w, 150), backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4, boxShadow: "0px 10px 28px rgba(15,23,42,0.22)", elevation: 24 }}>
              {options.map(([v, l]) => (
                <Pressable key={v} testID={`support-${id}-${v || "all"}`} onPress={() => { (id === "range" ? setRange : id === "status" ? setStatus : setSort)(v); setOpenDD(null); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: v === value ? colors.primarySubtle : "transparent" }}>
                  <Text style={{ color: v === value ? colors.primary : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>{l}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );

  const NewBtn = ({ testID, full, center }: { testID: string; full?: boolean; center?: boolean }) => (
    <Pressable testID={testID} onPress={() => setOpen(true)} style={{ alignSelf: full ? "stretch" : center ? "center" : "flex-start", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, paddingHorizontal: 22, borderRadius: radius.md, backgroundColor: GREEN, boxShadow: "0px 6px 16px rgba(5,150,105,0.3)", elevation: 3 }}>
      <Icon name="plus" size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>New Ticket</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute={user?.role === "merchant" ? "/(merchant)/profile" : "/(partner)/profile"} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 16 }}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ["support-tickets"] })} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <NewBtn full testID="new-ticket" />

        {/* search */}
        <View style={{ height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="magnify" size={18} color={SLATE400} />
          <TextInput testID="support-search" value={search} onChangeText={setSearch} placeholder="Search your tickets..." placeholderTextColor={SLATE400} style={{ flex: 1, color: colors.text, fontSize: 15 }} />
          {search ? <Pressable testID="support-search-clear" onPress={() => setSearch("")} hitSlop={8}><Icon name="close" size={16} color={SLATE400} /></Pressable> : null}
        </View>

        {/* filters — single horizontal scrolling row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}>
          <Pill id="range" icon="calendar-range" value={range} options={[["all", "All time"], ["7d", "Last 7 days"], ["30d", "Last 30 days"]]} />
          <Pill id="status" icon="filter-variant" value={status} options={[["", "All statuses"], ["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"], ["closed", "Closed"]]} />
          <Pill id="sort" icon="sort" value={sort} options={[["newest", "Newest first"], ["oldest", "Oldest first"]]} />
        </ScrollView>

        {/* list */}
        {isLoading ? (
          <View style={{ gap: spacing.md }}><CardSkeleton /><CardSkeleton /></View>
        ) : list.length === 0 ? (
          <View testID="support-empty" style={{ borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: "#CBD5E1", backgroundColor: colors.surface, paddingVertical: 56, paddingHorizontal: 24, alignItems: "center" }}>
            <Icon name="inbox-outline" size={64} color="#CBD5E1" />
            <Text style={{ color: colors.textSecondary, fontSize: 17, fontWeight: "600", marginTop: 16 }}>No tickets found</Text>
            <Text style={{ color: SLATE400, fontSize: 14, marginTop: 6, textAlign: "center" }}>{tickets.length ? "Try changing your search or filters." : "Need help? Raise your first support ticket."}</Text>
            <View style={{ marginTop: 24 }}><NewBtn center testID="new-ticket-empty" /></View>
          </View>
        ) : (
          <View testID="support-list" style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
            {list.map((item, i) => (
              <Pressable key={item.id} testID={`ticket-${item.id}`} onPress={() => router.push((user?.role === "partner" ? "/partner/support/" : "/support/") + item.id)}
                style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 14, gap: 8, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: colors.border, backgroundColor: pressed ? colors.surfaceSubtle : "transparent" })}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {item.unread_user > 0 ? <View testID={`support-unread-${item.code}`} style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: "#EF4444" }} /> : null}
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{item.code}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Badge label={item.priority} tone={prioTone(item.priority)} />
                    <Badge label={STATUS_LABEL[item.status] || (item.status || "").replace(/_/g, " ")} tone={statusTone(item.status)} />
                  </View>
                </View>
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>{item.subject}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "capitalize" }} numberOfLines={1}>{item.last_preview || item.category}</Text>
                  <Text style={{ color: SLATE400, fontSize: 12 }}>{timeAgo(item.updated_at || item.created_at)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New ticket sheet */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }} behavior="padding" keyboardVerticalOffset={0}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "900" }}>New Ticket</Text>
            <TextInput testID="ticket-subject" value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={colors.textMuted} style={inputStyle(colors)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATS.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={{ paddingHorizontal: 14, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: category === c ? colors.primary : colors.surfaceSubtle }}>
                  <Text style={{ color: category === c ? "#fff" : colors.textSecondary, fontSize: fontSize.xs, fontWeight: "700", textTransform: "capitalize" }}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {PRIOS.map((p) => (
                <Pressable key={p} onPress={() => setPriority(p)} style={{ flex: 1, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: priority === p ? colors.primarySubtle : colors.surfaceSubtle, borderWidth: 1, borderColor: priority === p ? colors.primary : colors.border }}>
                  <Text style={{ color: priority === p ? colors.primary : colors.textSecondary, fontSize: fontSize.xs, fontWeight: "800", textTransform: "capitalize" }}>{p}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput testID="ticket-message" value={message} onChangeText={setMessage} placeholder="Describe your issue" placeholderTextColor={colors.textMuted} multiline style={[inputStyle(colors), { height: 90, paddingTop: 12, textAlignVertical: "top" }]} />
            <Button title="Submit ticket" onPress={() => subject.trim() ? create.mutate() : toast.error("Enter a subject")} loading={create.isPending} testID="submit-ticket" />
            <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: "center", marginTop: 2 }}>You can attach screenshots inside the ticket chat after creating it.</Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
