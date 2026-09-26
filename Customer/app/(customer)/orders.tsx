/** My Bookings — port of BookingsView (CustomerDashboard.jsx): KPIs, search, tabs, cards, all mutations. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Package, Clock, CheckCircle2, AlertTriangle, IndianRupee, Search, Plus } from "lucide-react-native";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { useAuth } from "../../src/context/AuthContext";
import { useToast } from "../../src/components/Toast";
import { useSiteConfig } from "../../src/context/BrandContext";
import { api } from "../../src/api/client";
import { fmt, fmtC } from "../../src/lib/format";
import { runPayment } from "../../src/lib/payments";
import { PRIMARY, SLATE } from "../../src/theme";
import { StatTile, StatSkeleton, EmptyState, SkeletonList } from "../../src/components/customer/ux";
import { ACTIVE_STATES, DONE_STATES } from "../../src/components/customer/nav";
import { BookingCard, CardActions } from "../../src/components/customer/BookingCard";
import { CancelDialog, ReviewDialog, RescheduleDialog, DetailsSheet, AdditionalPayDialog } from "../../src/components/customer/BookingDialogs";

const BK_TABS = [{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "searching", label: "Searching" }, { key: "ongoing", label: "Ongoing" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" }];
const matchTab = (b: any, tab: string) => {
  switch (tab) {
    case "active": return ACTIVE_STATES.includes(b.status);
    case "searching": return b.status === "searching";
    case "ongoing": return ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status);
    case "completed": return DONE_STATES.includes(b.status);
    case "cancelled": return b.status === "cancelled";
    default: return true;
  }
};

export default function OrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();
  const { bookings, wallet, loading, load: reload } = useCustomerData();
  const { user } = useAuth();
  const toast = useToast();
  const cfg: any = useSiteConfig();
  const [q, setQ] = useState(params.focus ? String(params.focus) : "");
  const [tab, setTab] = useState("all");
  const [cancelT, setCancelT] = useState<any>(null);
  const [rev, setRev] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [resched, setResched] = useState<any>(null);
  const [addl, setAddl] = useState<any>(null);
  useEffect(() => { if (params.focus) setQ(String(params.focus)); }, [params.focus]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return bookings.filter((b: any) => matchTab(b, tab) && (!t || (b.code || "").toLowerCase().includes(t) || (b.service_name || "").toLowerCase().includes(t) || (b.partner_name || "").toLowerCase().includes(t)))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [bookings, q, tab]);
  const counts: Record<string, number> = { all: bookings.length, active: bookings.filter((b: any) => ACTIVE_STATES.includes(b.status)).length, searching: bookings.filter((b: any) => b.status === "searching").length, ongoing: bookings.filter((b: any) => matchTab(b, "ongoing")).length, completed: bookings.filter((b: any) => DONE_STATES.includes(b.status)).length, cancelled: bookings.filter((b: any) => b.status === "cancelled").length };
  const spent = bookings.filter((b: any) => DONE_STATES.includes(b.status)).reduce((s: number, b: any) => s + (b.pricing?.total || 0), 0);
  const err = (e: any, fb: string) => toast.error(e?.message || fb);
  /* ---- mutations (same business logic as web) ---- */
  const pay = async (b: any) => { const ok = b.order_group_id ? await runPayment({ purpose: "booking_group", groupId: b.order_group_id }, toast) : await runPayment({ purpose: "booking", bookingId: b.id }, toast); if (ok) reload(); };
  const payAdditional = async (b: any, method: "online" | "wallet" = "online") => {
    if (method === "online") { const ok = await runPayment({ purpose: "additional", bookingId: b.id }, toast); if (ok) reload(); return; }
    try { await api.post(`/bookings/${b.id}/additional/pay`, { method }); toast.success("Additional work paid"); reload(); } catch (e) { err(e, "Payment failed"); }
  };
  const repeat = async (b: any) => {
    try {
      const data: any = await api.get(`/bookings/${b.id}/repeat-preview`);
      if (!data.available) return toast.error((data.issues || []).join(", ") || "This service is unavailable now");
      const when = new Date(Date.now() + 60 * 60 * 1000);
      const nb: any = await api.post("/bookings", { service_id: data.service.id, address: data.address, schedule_type: "schedule", scheduled_at: when.toISOString(), addons: data.addons || [] });
      toast.success("Booking repeated!"); setQ(nb.code);
      await runPayment({ purpose: "booking", bookingId: nb.id }, toast); reload();
    } catch (e) { err(e, "Could not repeat"); }
  };
  const cancelBooking = async (b: any, reason: string) => {
    try { const d: any = await api.post(`/bookings/${b.id}/cancel`, { reason }); toast.success(d?.message || "Booking cancelled"); setCancelT(null); reload(); } catch (e) { err(e, "Cancel failed"); }
  };
  const submitReview = async (b: any, stars: number, cmt: string) => {
    try { await api.post(`/bookings/${b.id}/review`, { rating: stars, comment: cmt }); toast.success("Thanks for your review!"); setRev(null); reload(); } catch (e) { err(e, "Could not submit review"); }
  };
  const spareAction = async (b: any, partId: string, action: string) => {
    try { await api.post(`/bookings/${b.id}/spare-parts/${partId}/action`, { action }); toast.success(`Spare part ${action}d`); reload(); } catch (e) { err(e, "Failed"); }
  };
  const respondResched = async (b: any, action: "accept" | "reject") => {
    try { await api.post(`/bookings/${b.id}/reschedule/respond`, { action }); toast.success(action === "accept" ? "Reschedule accepted" : "Reschedule declined"); reload(); } catch (e) { err(e, "Could not respond"); }
  };
  const cancelResched = async (b: any) => {
    try { await api.post(`/bookings/${b.id}/reschedule/cancel`); toast.success("Reschedule request withdrawn"); reload(); } catch (e) { err(e, "Could not withdraw"); }
  };
  const actions: CardActions = {
    onRepeat: repeat, onCancel: setCancelT, onReview: setRev, onPay: pay, onPayAddl: setAddl, onSpare: spareAction, onRefresh: reload, onDetails: setDetails, onReschedule: setResched,
    onTrack: (b) => router.push(`/(customer)/track/${b.id}` as any), respondResched, cancelResched, toast,
  };

  const header = (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <View><Text testID="page-title" style={{ fontSize: 24, fontWeight: "900", color: SLATE[900], letterSpacing: -0.4 }}>My Bookings</Text><Text style={{ fontSize: 13, color: SLATE[500], marginTop: 2 }}>Track, manage and rebook your home services</Text></View>
        <Pressable testID="bk-new" onPress={() => router.push("/(site)/services" as any)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 6 }}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>New</Text></Pressable>
      </View>
      {loading && bookings.length === 0 ? <StatSkeleton /> : (
        <View style={{ gap: 12, marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile testID="kpi-total" label="Total" value={bookings.length} count icon={Package} tone="primary" />
            <StatTile testID="kpi-active" label="Active" value={counts.active} count icon={Clock} tone="violet" />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile testID="kpi-completed" label="Completed" value={counts.completed} count icon={CheckCircle2} tone="green" />
            <StatTile testID="kpi-cancelled" label="Cancelled" value={counts.cancelled} count icon={AlertTriangle} tone="rose" />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile testID="kpi-spent" label="Total Spent" value={fmtC(Math.round(spent))} icon={IndianRupee} tone="amber" />
            <View style={{ flex: 1 }} />
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", height: 44, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", paddingHorizontal: 12, gap: 8 }}>
        <Search size={16} color={SLATE[400]} /><TextInput testID="bk-search" value={q} onChangeText={setQ} placeholder="Search service, booking ID, partner…" placeholderTextColor={SLATE[400]} style={{ flex: 1, fontSize: 14, color: SLATE[800], height: 42, paddingVertical: 0, outlineStyle: "none" } as any} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
        {BK_TABS.map((t) => (
          <Pressable key={t.key} testID={`bk-tab-${t.key}`} onPress={() => setTab(t.key)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: tab === t.key ? PRIMARY[700] : "#fff", borderWidth: 1, borderColor: tab === t.key ? PRIMARY[700] : SLATE[200], flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: tab === t.key ? "#fff" : SLATE[700] }}>{t.label}</Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: tab === t.key ? "rgba(255,255,255,0.8)" : SLATE[400] }}>{counts[t.key] ?? 0}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1 }} testID="orders-page">
      <FlatList data={filtered} keyExtractor={(b: any) => b.id} ListHeaderComponent={header} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} initialNumToRender={6}
        renderItem={({ item }) => <BookingCard b={item} focus={!!params.focus && params.focus === item.code} a={actions} />}
        ListEmptyComponent={loading && bookings.length === 0 ? <SkeletonList rows={4} /> : bookings.length === 0
          ? <EmptyState icon={Package} title="No bookings yet" desc="Book your first home service in minutes." actionLabel="Book a Service" onAction={() => router.push("/(site)/services" as any)} testID="orders-empty" />
          : <EmptyState icon={Package} title="No bookings match" desc="Try adjusting filters or search." testID="orders-nomatch" />} />
      <CancelDialog booking={cancelT} reasons={cfg?.cancellation_reasons} onClose={() => setCancelT(null)} onConfirm={cancelBooking} />
      <ReviewDialog booking={rev} onClose={() => setRev(null)} onSubmit={submitReview} />
      <RescheduleDialog booking={resched} onClose={() => setResched(null)} onDone={reload} toast={toast} />
      <DetailsSheet booking={details} onClose={() => setDetails(null)} />
      <AdditionalPayDialog booking={addl} onClose={() => setAddl(null)} onPay={payAdditional} walletBalance={wallet?.balance || 0} />
    </View>
  );
}
