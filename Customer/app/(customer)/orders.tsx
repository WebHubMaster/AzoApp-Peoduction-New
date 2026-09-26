/** My Bookings — 1:1 port of BookingsView (CustomerDashboard.jsx) mobile view: KPIs, search + filters, tabs, cards, paginator, all dialogs. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Package, Clock, CheckCircle2, AlertTriangle, IndianRupee, Plus, CreditCard } from "lucide-react-native";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { useAuth } from "../../src/context/AuthContext";
import { useSiteConfig } from "../../src/context/BrandContext";
import { useToast } from "../../src/components/Toast";
import { api } from "../../src/api/client";
import { fmtC } from "../../src/lib/format";
import { runPayment } from "../../src/lib/payments";
import { PRIMARY, useTheme, shadowBtn } from "../../src/theme";
import { StatTile, StatSkeleton, EmptyState, SkeletonList, SearchInput, SegTabs, FilterButton, FilterSheet, FilterLabel, DateRangePicker, OptionMenu, Paginator, inDateRange, DateRange } from "../../src/components/customer/ux";
import { ACTIVE_STATES, DONE_STATES, bkDate } from "../../src/components/customer/nav";
import { BookingCard, CardActions } from "../../src/components/customer/BookingCard";
import { CancelDialog, ReviewDialog, RescheduleDialog, AdditionalPayDialog } from "../../src/components/customer/BookingDialogs";
import { BookingDetailsDrawer, InvoiceDrawer } from "../../src/components/customer/BookingDrawers";
import { BookingChat, useChatSummary } from "../../src/components/customer/BookingChat";

const SORTS = [{ value: "new", label: "Newest first" }, { value: "old", label: "Oldest first" }, { value: "amt_hi", label: "Amount: High → Low" }, { value: "amt_lo", label: "Amount: Low → High" }];
const PAYMENTS = [{ value: "all", label: "All payments" }, { value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }, { value: "refunded", label: "Refunded" }];
const BK_TABS = [{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "searching", label: "Searching" }, { key: "ongoing", label: "Ongoing" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" }];
const ONGOING = ["assigned", "arrived_shop", "arrived_customer", "started"];
const matchTab = (b: any, tab: string) => {
  switch (tab) {
    case "active": return ACTIVE_STATES.includes(b.status);
    case "searching": return b.status === "searching";
    case "ongoing": return ONGOING.includes(b.status);
    case "completed": return DONE_STATES.includes(b.status);
    case "cancelled": return b.status === "cancelled";
    default: return true;
  }
};
const ALL_RANGE: DateRange = { preset: "All", from: null, to: null };
const PAGE_SIZE = 10;

export default function OrdersScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ focus?: string }>();
  const { bookings, wallet, loading, load: reload } = useCustomerData();
  const { user } = useAuth();
  const toast = useToast();
  const siteCfg: any = useSiteConfig();
  const focusCode = params.focus ? String(params.focus) : "";
  const [q, setQ] = useState(focusCode);
  const [tab, setTab] = useState("all");
  const [payment, setPayment] = useState("all");
  const [range, setRange] = useState<DateRange>(ALL_RANGE);
  const [sort, setSort] = useState("new");
  const [page, setPage] = useState(1);
  const [fOpen, setFOpen] = useState(false);
  const [cancelT, setCancelT] = useState<any>(null);
  const [rev, setRev] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [chat, setChat] = useState<any>(null);
  const [resched, setResched] = useState<any>(null);
  const [addl, setAddl] = useState<any>(null);
  const { unreadFor, refresh: refreshChats } = useChatSummary(!!user);
  useEffect(() => { if (focusCode) setQ(focusCode); }, [focusCode]);
  useEffect(() => { setPage(1); }, [q, tab, payment, range, sort]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = bookings.filter((b: any) => matchTab(b, tab) && (payment === "all" || b.payment_status === payment) && inDateRange(bkDate(b), range)
      && (!t || (b.code || "").toLowerCase().includes(t) || (b.service_name || "").toLowerCase().includes(t) || (b.partner_name || "").toLowerCase().includes(t)));
    return [...list].sort((a: any, b: any) => {
      if (sort === "new") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "old") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === "amt_hi") return (b.pricing?.total || 0) - (a.pricing?.total || 0);
      if (sort === "amt_lo") return (a.pricing?.total || 0) - (b.pricing?.total || 0);
      return 0;
    });
  }, [bookings, q, tab, payment, range, sort]);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters = (payment !== "all" ? 1 : 0) + (range.preset !== "All" ? 1 : 0) + (sort !== "new" ? 1 : 0);
  const counts: Record<string, number> = { all: bookings.length, active: bookings.filter((b: any) => ACTIVE_STATES.includes(b.status)).length, searching: bookings.filter((b: any) => b.status === "searching").length, ongoing: bookings.filter((b: any) => ONGOING.includes(b.status)).length, completed: bookings.filter((b: any) => DONE_STATES.includes(b.status)).length, cancelled: bookings.filter((b: any) => b.status === "cancelled").length };
  const spent = bookings.filter((b: any) => DONE_STATES.includes(b.status)).reduce((s: number, b: any) => s + (b.pricing?.total || 0), 0);
  const clearAll = () => { setPayment("all"); setRange(ALL_RANGE); setSort("new"); setTab("all"); };
  const goNew = () => router.push("/(site)/services" as any);
  const err = (e: any, fb: string) => toast.error(e?.message || fb);

  /* ---- mutations (unchanged business logic from web) ---- */
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
      toast.success("Booking repeated!"); setQ(nb.code); setTab("all");
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
    onRepeat: repeat, onCancel: setCancelT, onReview: setRev, onPay: pay, onPayAddl: setAddl, onSpare: spareAction, onRefresh: reload, onDetails: setDetails, onInvoice: setInvoice, onChat: setChat, onReschedule: setResched,
    onTrack: (b) => router.push(`/(customer)/track/${b.id}` as any), respondResched, cancelResched, unreadFor, toast,
  };

  return (
    <View testID="orders-page">
      {/* SectionHeader */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="page-title" numberOfLines={1} style={{ fontSize: 24, fontWeight: "900", color: c.text, letterSpacing: -0.4 }}>My Bookings</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Track, manage and rebook your home services</Text>
        </View>
        <Pressable testID="book-new" onPress={goNew} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4, ...shadowBtn })}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Booking</Text></Pressable>
      </View>

      {/* KPI (grid-cols-2) */}
      {loading && bookings.length === 0 ? <StatSkeleton /> : (
        <View style={{ gap: 12, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="kpi-total" label="Total" value={bookings.length} count icon={Package} tone="primary" /><StatTile testID="kpi-active" label="Active" value={counts.active} count icon={Clock} tone="violet" /></View>
          <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="kpi-completed" label="Completed" value={counts.completed} count icon={CheckCircle2} tone="green" /><StatTile testID="kpi-cancelled" label="Cancelled" value={counts.cancelled} count icon={AlertTriangle} tone="rose" /></View>
          <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="kpi-spent" label="Total Spent" value={fmtC(spent)} icon={IndianRupee} tone="amber" /><View style={{ flex: 1 }} /></View>
        </View>
      )}

      {/* Toolbar */}
      <View style={{ gap: 12, paddingVertical: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search service, booking ID, partner…" testID="bk-search" />
          <FilterButton activeCount={activeFilters} onPress={() => setFOpen(true)} testID="bk-filter-btn" />
        </View>
        <SegTabs tabs={BK_TABS} value={tab} onChange={setTab} testID="bk-tab" counts={counts} />
      </View>

      {/* List */}
      <View testID="orders-list" style={{ marginTop: 16 }}>
        {loading && bookings.length === 0 ? <SkeletonList rows={4} /> : null}
        {!loading && bookings.length === 0 ? <EmptyState icon={Package} title="No bookings yet" desc="Book your first home service in minutes." actionLabel="Book a Service" onAction={goNew} testID="orders-empty" /> : null}
        {!loading && bookings.length > 0 && filtered.length === 0 ? <EmptyState icon={Package} title="No bookings match" desc="Try adjusting filters or search." testID="orders-nomatch" /> : null}
        {paged.map((b: any) => <BookingCard key={b.id} b={b} focus={!!focusCode && focusCode === b.code} a={actions} />)}
      </View>
      <Paginator page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} testID="bk-pager" />

      {/* Mobile filter sheet */}
      <FilterSheet open={fOpen} onClose={() => setFOpen(false)} onClear={() => { clearAll(); setFOpen(false); }} onApply={() => setFOpen(false)} title="Filter bookings">
        <View><FilterLabel>Date range</FilterLabel><View style={{ alignSelf: "flex-start" }}><DateRangePicker value={range} onChange={setRange} testID="bk-date-m" /></View></View>
        <View><FilterLabel>Payment status</FilterLabel><View style={{ alignSelf: "flex-start" }}><OptionMenu value={payment} options={PAYMENTS} onChange={setPayment} icon={CreditCard} title="Payment status" testID="bk-payment" /></View></View>
        <View><FilterLabel>Sort by</FilterLabel><View style={{ alignSelf: "flex-start" }}><OptionMenu value={sort} options={SORTS} onChange={setSort} title="Sort by" testID="bk-sort-m" /></View></View>
      </FilterSheet>

      <CancelDialog booking={cancelT} reasons={siteCfg?.cancellation_reasons} onClose={() => setCancelT(null)} onConfirm={cancelBooking} />
      <ReviewDialog booking={rev} onClose={() => setRev(null)} onSubmit={submitReview} />
      <RescheduleDialog booking={resched} onClose={() => setResched(null)} onDone={reload} toast={toast} />
      <BookingDetailsDrawer booking={details} onClose={() => setDetails(null)} onInvoice={setInvoice} />
      <InvoiceDrawer booking={invoice} onClose={() => setInvoice(null)} toast={toast} />
      <AdditionalPayDialog booking={addl} onClose={() => setAddl(null)} onPay={payAdditional} walletBalance={wallet?.balance || 0} />
      <BookingChat booking={chat} open={!!chat} onClose={() => setChat(null)} onSeen={refreshChats} />
    </View>
  );
}
