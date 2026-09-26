/** Refunds — port of RefundsView (CustomerDashboard.jsx): KPIs, search, date presets, tabs, cards with refund timeline. */
import React, { useMemo, useState } from "react";
import { PlainList } from "../../src/components/customer/ux";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Receipt, Clock, CheckCircle2, IndianRupee, Search } from "lucide-react-native";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { StatTile, StatusChip, EmptyState, SkeletonList, StatSkeleton } from "../../src/components/customer/ux";
import { fmt, fmtC } from "../../src/lib/format";
import { PRIMARY, SLATE } from "../../src/theme";

const REFUND_TABS = [{ key: "all", label: "All" }, { key: "pending", label: "Pending" }, { key: "processed", label: "Completed" }, { key: "failed", label: "Rejected" }];
const RANGES = ["All", "7 days", "30 days", "90 days"];
const REFUND_STATUS: Record<string, string> = { initiated: "blue", pending: "amber", processing: "amber", processed: "green", failed: "rose" };
const RefundStatusBadge = ({ status }: { status: string }) => <StatusChip tone={(REFUND_STATUS[status] || "slate") as any} label={status === "processed" ? "Refund successful" : `Refund ${(status || "").replace("_", " ")}`} />;
const Info = ({ label, value, cap }: { label: string; value: any; cap?: boolean }) => (
  <View style={{ width: "48%", borderRadius: 10, backgroundColor: SLATE[50], paddingHorizontal: 10, paddingVertical: 8 }}><Text style={{ fontSize: 10, fontWeight: "700", color: SLATE[400], textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text><Text style={{ fontSize: 13, fontWeight: "700", color: SLATE[800], marginTop: 2, textTransform: cap ? "capitalize" : "none" }}>{value}</Text></View>
);
const inRange = (d: string, preset: string) => { if (preset === "All" || !d) return true; const days = Number(preset.split(" ")[0]); return new Date(d).getTime() >= Date.now() - days * 86400000; };

export default function RefundsScreen() {
  const { refunds, loading } = useCustomerData();
  const [q, setQ] = useState(""); const [tab, setTab] = useState("all"); const [range, setRange] = useState("All");
  const pendingSet = ["initiated", "pending", "processing"];
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return refunds.filter((r: any) => {
      const tabOk = tab === "all" || (tab === "pending" ? pendingSet.includes(r.status) : tab === "processed" ? r.status === "processed" : r.status === "failed");
      return tabOk && inRange(r.cancelled_at, range) && (!t || (r.booking_code || "").toLowerCase().includes(t) || (r.service_name || "").toLowerCase().includes(t));
    });
  }, [refunds, q, tab, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalRefunded = refunds.reduce((s: number, r: any) => s + (r.status === "processed" ? Number(r.refund_amount || 0) : 0), 0);
  const pill = (on: boolean) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: on ? PRIMARY[700] : "#fff", borderWidth: 1, borderColor: on ? PRIMARY[700] : SLATE[200], justifyContent: "center" as const });
  const pillT = (on: boolean) => ({ fontSize: 13, fontWeight: "600" as const, color: on ? "#fff" : SLATE[700] });

  const header = (
    <View>
      <Text testID="page-title" style={{ fontSize: 24, fontWeight: "900", color: SLATE[900], letterSpacing: -0.4 }}>Refunds</Text>
      <Text style={{ fontSize: 13, color: SLATE[500], marginTop: 2, marginBottom: 16 }}>Track cancellations and refund status</Text>
      {loading && refunds.length === 0 ? <StatSkeleton /> : (
        <View style={{ gap: 12, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="rf-total" label="Total Refunds" value={refunds.length} count icon={Receipt} tone="primary" /><StatTile testID="rf-pending" label="Pending" value={refunds.filter((r: any) => pendingSet.includes(r.status)).length} count icon={Clock} tone="amber" /></View>
          <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="rf-done" label="Completed" value={refunds.filter((r: any) => r.status === "processed").length} count icon={CheckCircle2} tone="green" /><StatTile testID="rf-amt" label="Refunded Amount" value={fmtC(Math.round(totalRefunded))} icon={IndianRupee} tone="violet" /></View>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", height: 44, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", paddingHorizontal: 12, gap: 8 }}>
        <Search size={16} color={SLATE[400]} /><TextInput testID="rf-search" value={q} onChangeText={setQ} placeholder="Search booking ID, service…" placeholderTextColor={SLATE[400]} style={{ flex: 1, fontSize: 14, color: SLATE[800], height: 42, paddingVertical: 0, outlineStyle: "none" } as any} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>{RANGES.map((r) => <Pressable key={r} testID={`rf-range-${r.split(" ")[0]}`} onPress={() => setRange(r)} style={pill(range === r)}><Text style={pillT(range === r)}>{r}</Text></Pressable>)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>{REFUND_TABS.map((t) => <Pressable key={t.key} testID={`rf-tab-${t.key}`} onPress={() => setTab(t.key)} style={pill(tab === t.key)}><Text style={pillT(tab === t.key)}>{t.label}</Text></Pressable>)}</ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1 }} testID="refunds-page">
      <PlainList data={filtered} keyExtractor={(r: any) => r.id} ListHeaderComponent={header} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} initialNumToRender={6}
        ListEmptyComponent={loading && refunds.length === 0 ? <SkeletonList rows={3} /> : refunds.length === 0 ? <EmptyState icon={Receipt} title="No refunds yet" desc="No cancellations or refunds on your account." testID="refunds-empty" /> : <EmptyState icon={Receipt} title="No refunds match" desc="Adjust your filters." testID="refunds-nomatch" />}
        renderItem={({ item: r }) => (
          <View testID={`refund-${r.booking_code}`} style={{ borderRadius: 18, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", padding: 18, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}><Text style={{ fontSize: 15, fontWeight: "600", color: SLATE[900] }}>{r.service_name}</Text><RefundStatusBadge status={r.status} /><StatusChip tone="slate" label={r.method || "—"} /></View>
                <Text style={{ fontSize: 12, color: SLATE[400], marginTop: 4 }}>#{r.booking_code} · Cancelled {new Date(r.cancelled_at).toLocaleString("en-IN")}</Text>
                {r.cancellation_reason ? <Text style={{ fontSize: 13, color: SLATE[600], marginTop: 4 }}>Reason: {r.cancellation_reason}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}><Text style={{ fontSize: 18, fontWeight: "900", color: "#059669" }}>{fmt(r.refund_amount)}</Text><Text style={{ fontSize: 11, color: SLATE[400] }}>{r.refund_pct}% of {fmt(r.original_amount)}</Text></View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <Info label="Original" value={fmt(r.original_amount)} /><Info label="Refund %" value={`${r.refund_pct}%`} /><Info label="Refund amount" value={fmt(r.refund_amount)} /><Info label="Status" value={(r.status || "").replace("_", " ")} cap />
            </View>
            {(r.status_history || []).length ? (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: SLATE[100], paddingTop: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: SLATE[400], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Refund timeline</Text>
                {r.status_history.map((h: any, i: number) => <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: PRIMARY[500] }} /><Text style={{ fontSize: 12, fontWeight: "600", color: SLATE[700], textTransform: "capitalize" }}>{(h.status || "").replace("_", " ")}</Text><Text style={{ fontSize: 12, color: SLATE[400] }}>· {h.at ? new Date(h.at).toLocaleString("en-IN") : ""}{h.note ? ` · ${h.note}` : ""}</Text></View>)}
              </View>
            ) : null}
          </View>
        )} />
    </View>
  );
}
