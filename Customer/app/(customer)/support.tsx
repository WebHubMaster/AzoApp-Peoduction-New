/** Help & Support — port of web SupportCenter.jsx (list / new ticket / thread). */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { LifeBuoy, Plus, ArrowLeft, Inbox, CalendarRange, Filter, ArrowUpDown } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useToast } from "../../src/components/Toast";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, EMERALD, useTheme, shadowBtn, TC } from "../../src/theme";
import { SearchInput, OptionMenu, PrimaryButton } from "../../src/components/customer/ux";
import { FInput, FSelect } from "../../src/components/customer/FormControls";
import { SupportThread } from "../../src/components/customer/SupportThread";
import { STATUS_STYLE, STATUS_LABEL, PRIORITY_STYLE, STATUSES, ago, Badge } from "../../src/components/customer/supportShared";

const RANGES = [{ value: "all", label: "All time" }, { value: "today", label: "Today" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }];
const SORTS = [{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }];
const STATUS_OPTS = [{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))];
const cap = (s: string) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) });

const GreenBtn = ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) => (
  <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ alignSelf: "flex-start", height: 44, paddingHorizontal: 22, borderRadius: 12, backgroundColor: pressed ? EMERALD[700] : EMERALD[600], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, transform: [{ scale: pressed ? 0.98 : 1 }], ...shadowBtn })}><Plus size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{label}</Text></Pressable>
);

function NewTicket({ meta, onCreated, onCancel }: { meta: any; onCreated: (t: any) => void; onCancel: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [subject, setSubject] = useState(""); const [category, setCategory] = useState("other"); const [priority, setPriority] = useState("medium"); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const lbl = { fontSize: 12, fontWeight: "600" as const, color: TC.textMuted, marginBottom: 4 };
  const submit = async () => {
    if (!subject.trim()) return toast.error("Please enter a subject");
    if (!message.trim()) return toast.error("Please describe your issue");
    setBusy(true);
    try { const data: any = await api.post("/support/tickets", { subject, category, priority, message }); toast.success(`Ticket ${data.code} created`); onCreated(data); }
    catch (e: any) { toast.error(e?.message || "Could not create ticket"); }
    finally { setBusy(false); }
  };
  return (
    <View testID="support-new-form" style={{ gap: 16 }}>
      <Pressable testID="support-new-back" onPress={onCancel} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><ArrowLeft size={16} color={TC.textMuted} /><Text style={{ fontSize: 14, color: TC.textMuted }}>Back</Text></Pressable>
      <View style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><LifeBuoy size={20} color={PRIMARY[600]} /><Text style={{ fontSize: 18, fontWeight: "700", color: c.text }}>Raise a new ticket</Text></View>
        <View><Text style={lbl}>Subject *</Text><FInput testID="support-subject" value={subject} onChange={setSubject} placeholder="Briefly, what's the issue?" /></View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Text style={lbl}>Category</Text><FSelect testID="support-category" title="Category" value={category} options={(meta?.categories || ["other"]).map(cap)} onChange={setCategory} /></View>
          <View style={{ flex: 1 }}><Text style={lbl}>Priority</Text><FSelect testID="support-priority" title="Priority" value={priority} options={(meta?.priorities || ["medium"]).map(cap)} onChange={setPriority} /></View>
        </View>
        <View><Text style={lbl}>Describe your issue *</Text><FInput testID="support-message" multiline value={message} onChange={setMessage} placeholder="Tell us what happened…" style={{ minHeight: 120 }} /></View>
        <PrimaryButton testID="support-submit" label="Submit ticket" onPress={submit} busy={busy} />
        <Text style={{ fontSize: 11, color: TC.textFaint, textAlign: "center" }}>You can attach screenshots inside the ticket chat after creating it.</Text>
      </View>
    </View>
  );
}

export default function SupportScreen() {
  const { c, isDark } = useTheme();
  const { user } = useAuth();
  const [meta, setMeta] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [view, setView] = useState<"list" | "new" | "thread">("list");
  const [active, setActive] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [range, setRange] = useState("all"); const [sort, setSort] = useState("newest");

  const loadList = useCallback(async () => { try { const data: any = await api.get("/support/tickets"); setTickets(data || []); } catch {} setLoading(false); }, []);
  useEffect(() => { api.get("/support/meta", { auth: false }).then(setMeta).catch(() => {}); loadList(); }, [loadList]);
  useEffect(() => { if (view !== "list") return; const iv = setInterval(loadList, 6000); return () => clearInterval(iv); }, [view, loadList]);
  const openTicket = (t: any) => { setActive(t); setView("thread"); };

  const rows = useMemo(() => {
    let out = [...tickets];
    if (status) out = out.filter((r) => r.status === status);
    if (q) { const s = q.toLowerCase(); out = out.filter((r) => (r.subject || "").toLowerCase().includes(s) || (r.code || "").toLowerCase().includes(s) || (r.category || "").toLowerCase().includes(s)); }
    if (range !== "all") { const cut = range === "today" ? new Date().setHours(0, 0, 0, 0) : Date.now() - Number(range) * 86400000; out = out.filter((r) => new Date(r.created_at).getTime() >= cut); }
    out.sort((a, b) => sort === "newest" ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return out;
  }, [tickets, q, status, range, sort]);

  if (view === "new") return <View testID="support-center"><NewTicket meta={meta} onCancel={() => setView("list")} onCreated={(t) => { loadList(); openTicket(t); }} /></View>;
  if (view === "thread" && active) return <View testID="support-center"><SupportThread ticket={active} myId={user?.id} tickets={tickets} onBack={() => { setView("list"); loadList(); }} onChanged={loadList} /></View>;

  return (
    <View testID="support-center" style={{ gap: 16 }}>
      <View style={{ width: "100%", alignItems: "flex-start" }}>
        <GreenBtn testID="support-new-btn" label="New Ticket" onPress={() => setView("new")} />
      </View>

      <SearchInput value={q} onChange={setQ} placeholder="Search your tickets…" testID="support-list-search" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <OptionMenu value={range} options={RANGES} onChange={setRange} icon={CalendarRange} title="Time range" testID="support-range" />
        <OptionMenu value={status} options={STATUS_OPTS} onChange={setStatus} icon={Filter} title="Status" testID="support-filter-status" placeholder="All statuses" />
        <OptionMenu value={sort} options={SORTS} onChange={setSort} icon={ArrowUpDown} title="Sort by" testID="support-sort" />
      </View>

      {loading ? <View style={{ paddingVertical: 64, alignItems: "center" }}><ActivityIndicator size="small" color={PRIMARY[500]} /></View>
        : rows.length === 0 ? (
          <View testID="support-empty" style={{ borderRadius: 6, borderWidth: 1, borderStyle: "dashed", borderColor: isDark ? SLATE[700] : TC.border, padding: 48, alignItems: "center" }}>
            <Inbox size={40} color={TC.textFaint} /><Text style={{ fontSize: 15, fontWeight: "500", color: TC.textMuted, marginTop: 12 }}>No tickets found</Text><Text style={{ fontSize: 14, color: TC.textFaint, marginBottom: 16 }}>Need help? Raise your first support ticket.</Text>
            <GreenBtn testID="support-empty-new" label="New Ticket" onPress={() => setView("new")} />
          </View>
        ) : (
          <View testID="support-list" style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
            {rows.map((tk, i) => (
              <Pressable key={tk.id} testID={`support-ticket-${tk.code}`} onPress={() => openTicket(tk)} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: c.borderSoft, backgroundColor: pressed ? c.bg : "transparent" })}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{tk.unread_user > 0 ? <View testID={`support-unread-${tk.code}`} style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: "#EF4444" }} /> : null}<Text style={{ fontSize: 12, color: TC.textMuted, fontFamily: "monospace" }}>{tk.code}</Text></View>
                  <View style={{ flexDirection: "row", gap: 6 }}><Badge style={PRIORITY_STYLE[tk.priority]}>{tk.priority}</Badge><Badge style={STATUS_STYLE[tk.status]}>{STATUS_LABEL[tk.status]}</Badge></View>
                </View>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: c.text }}>{tk.subject}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 12, color: TC.textMuted, textTransform: "capitalize" }}>{tk.category}</Text><Text style={{ fontSize: 12, color: TC.textFaint }}>{ago(tk.created_at)}</Text></View>
              </Pressable>
            ))}
          </View>
        )}
    </View>
  );
}
