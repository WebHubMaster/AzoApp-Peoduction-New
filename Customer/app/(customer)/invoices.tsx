/** My Invoices — port of web_panel/src/components/invoices/InvoiceCenter.jsx (customer role, mobile view). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Modal, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileText, IndianRupee, CheckCircle2, Clock, RotateCcw, ReceiptText, RefreshCw, ArrowUpDown, User, CalendarDays, Wallet, Download, Eye, AlertTriangle, X, Share2, Mail, MessageCircle, Copy, Layers, CreditCard, Printer } from "lucide-react-native";
import { api, API_BASE } from "../../src/api/client";
import { downloadInvoicePdf, openLocalFile, shareInvoicePdf } from "../../src/lib/invoiceActions";
import { useToast } from "../../src/components/Toast";
import { PRIMARY, SLATE, EMERALD, AMBER, VIOLET, ROSE, BLUE, useTheme, shadowBtn, TC } from "../../src/theme";
import { SearchInput, FilterButton, FilterSheet, FilterLabel, OptionMenu, LoadMoreFooter, useOnScrollEnd, useOnPullRefresh, EmptyState, SkeletonList, Shimmer, BottomSheet, MiniCalendar, PillTrigger, StatSlider, CARD_W } from "../../src/components/customer/ux";
import { DrawerShell, Btn } from "../../src/components/customer/BookingDialogs";

const money = (n: any, cur = "INR") => (cur === "INR" ? "₹" : cur + " ") + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const shortDate = (s?: string) => { try { return new Date(s!).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return (s || "").slice(0, 10); } };
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DATE_PRESETS = [["all", "All time"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 Days"], ["30d", "Last 30 Days"], ["this_month", "This Month"], ["last_month", "Last Month"], ["this_year", "This Year"], ["custom", "Custom"]];
const TYPES = [["all", "All Types"], ["booking", "Booking"], ["cancellation", "Cancellation"], ["refund", "Refund Receipt"], ["transaction", "Transaction"], ["withdrawal", "Withdrawal"]].map(([value, label]) => ({ value, label }));
const PAY_STATUS = ["all", "paid", "pending", "processing", "refunded", "cancelled", "failed"].map((s) => ({ value: s, label: s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1) }));
const SORTS = [["newest", "Newest first"], ["oldest", "Oldest first"], ["amount_high", "Highest amount"], ["amount_low", "Lowest amount"], ["number", "Invoice number"]].map(([value, label]) => ({ value, label }));
const TYPE_LABEL: Record<string, string> = { booking: "Service Invoice", cancellation: "Cancellation", refund: "Refund Receipt", transaction: "Transaction", withdrawal: "Withdrawal" };
const BADGE: Record<string, { bg: string; fg: string }> = { paid: { bg: EMERALD[50], fg: EMERALD[700] }, pending: { bg: AMBER[50], fg: AMBER[700] }, processing: { bg: BLUE[50], fg: BLUE[700] }, refunded: { bg: VIOLET[50], fg: VIOLET[700] }, cancelled: { bg: ROSE[50], fg: ROSE[700] }, failed: { bg: ROSE[50], fg: ROSE[700] } };
const KPI_TONE: Record<string, { bg: string; fg: string }> = { primary: { bg: PRIMARY[50], fg: PRIMARY[700] }, emerald: { bg: EMERALD[50], fg: EMERALD[600] }, amber: { bg: AMBER[50], fg: AMBER[600] }, violet: { bg: VIOLET[50], fg: VIOLET[500] }, slate: { bg: SLATE[100], fg: SLATE[600] } };

const StatusBadge = ({ status, testID }: { status?: string; testID?: string }) => {
  const s = BADGE[(status || "").toLowerCase()] || { bg: SLATE[100], fg: SLATE[600] };
  return <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: s.bg }}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: s.fg }} /><Text style={{ fontSize: 11, fontWeight: "600", color: s.fg, textTransform: "capitalize" }}>{(status || "not submitted").replace(/_/g, " ")}</Text></View>;
};
function KpiCard({ icon: Icon, tone, label, value, sub, testID, w }: any) {
  const { c } = useTheme(); const t = KPI_TONE[tone] || KPI_TONE.slate;
  return (
    <View testID={testID} style={{ width: w ?? "47.5%", flexGrow: w ? 0 : 1, borderRadius: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16 }}>
      <View style={{ height: 40, width: 40, borderRadius: 6, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}><Icon size={18} color={t.fg} /></View>
      <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: TC.textFaint, marginTop: 12 }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 24, fontWeight: "800", color: c.text, marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 12, color: TC.textFaint, marginTop: 4 }}>{sub}</Text> : null}
    </View>
  );
}
const KV = ({ k, v, strong, mono }: { k: string; v: any; strong?: boolean; mono?: boolean }) => { const { c, isDark } = useTheme(); return <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}><Text style={{ fontSize: 14, color: c.textMuted }}>{k}</Text><Text style={{ fontSize: 14, fontWeight: strong ? "700" : "500", color: strong ? c.text : (isDark ? SLATE[200] : SLATE[700]), fontFamily: mono ? "monospace" : undefined, textAlign: "right", flexShrink: 1 }}>{v}</Text></View>; };
const Section = ({ icon: Icon, title, children }: any) => { const { c } = useTheme(); return <View><View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}><Icon size={14} color={TC.textFaint} /><Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: TC.textFaint }}>{title}</Text></View><View style={{ borderRadius: 6, borderWidth: 1, borderColor: c.borderSoft, paddingHorizontal: 14 }}>{children}</View></View>; };

function DatePick({ value, onChange, placeholder, testID }: { value: string; onChange: (v: string) => void; placeholder: string; testID: string }) {
  const [open, setOpen] = useState(false);
  return <><PillTrigger testID={testID} icon={CalendarDays} label={value || placeholder} onPress={() => setOpen(true)} /><BottomSheet open={open} onClose={() => setOpen(false)} title={placeholder} testID={`${testID}-sheet`}><MiniCalendar from={value ? new Date(value) : null} onPick={(d) => { onChange(isoD(d)); setOpen(false); }} testID={`${testID}-cal`} /></BottomSheet></>;
}

export default function InvoicesScreen() {
  const { c, isDark } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [items, setItems] = useState<any[]>([]); const [page, setPage] = useState(1); const [more, setMore] = useState<"idle" | "loading" | "error">("idle"); const [range, setRange] = useState("all"); const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const [type, setType] = useState("all"); const [payStatus, setPayStatus] = useState("all"); const [search, setSearch] = useState(""); const [minAmount, setMinAmount] = useState(""); const [maxAmount, setMaxAmount] = useState(""); const [sort, setSort] = useState("newest");
  const [showFilters, setShowFilters] = useState(false); const [drawerInv, setDrawerInv] = useState<any>(null); const [drawerFull, setDrawerFull] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null); const [emailFor, setEmailFor] = useState<any>(null); const [emailTo, setEmailTo] = useState(""); const [emailBusy, setEmailBusy] = useState(false); const [shareFor, setShareFor] = useState<any>(null);
  const PAGE_SIZE = 10;
  // Guard so one invoice can't fire multiple concurrent download requests to the server.
  const downloadingRef = useRef<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const params = useCallback((pg: number) => {
    const p: Record<string, string> = { page: String(pg), page_size: String(PAGE_SIZE), range, invoice_type: type, payment_status: payStatus, sort };
    if (search) p.search = search; if (minAmount) p.min_amount = minAmount; if (maxAmount) p.max_amount = maxAmount;
    if (range === "custom") { if (dateFrom) p.date_from = dateFrom; if (dateTo) p.date_to = dateTo; }
    return new URLSearchParams(p).toString();
  }, [range, type, payStatus, sort, search, minAmount, maxAmount, dateFrom, dateTo]);
  // Fetch one small page; retry once so slow/flaky networks still get through.
  const fetchPage = useCallback(async (pg: number) => {
    try { return await api.get<any>(`/invoices?${params(pg)}`, { timeoutMs: 60000 }); } catch { return await api.get<any>(`/invoices?${params(pg)}`, { timeoutMs: 60000 }); }
  }, [params]);
  const load = useCallback(async () => {
    setLoading(true); setError(false); setMore("idle");
    try { const r = await fetchPage(1); setData(r); setItems(r?.items || []); setPage(1); } catch { setError(true); } finally { setLoading(false); }
  }, [fetchPage]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const total = data?.total ?? items.length;
  const hasMore = items.length < total;
  const loadMore = async () => {
    if (loading || more === "loading" || !hasMore) return;
    setMore("loading");
    try {
      const r = await fetchPage(page + 1);
      setItems((prev) => { const seen = new Set(prev.map((x) => x.id)); return [...prev, ...(r?.items || []).filter((x: any) => !seen.has(x.id))]; });
      setPage(page + 1); setMore("idle");
      if (!(r?.items || []).length) setData((d: any) => ({ ...d, total: items.length }));
    } catch { setMore("error"); }
  };
  useOnScrollEnd(() => { if (more !== "error") loadMore(); });
  useOnPullRefresh(load);

  const publicUrl = async (inv: any, kind: "pdf" | "page" | "html", download = false) => { const s: any = await api.get(`/invoices/${inv.id}/share-link`); return kind === "pdf" ? `${API_BASE}${s.path}${download ? "&download=1" : ""}` : `${API_BASE}/invoices/pub/${inv.id}/${kind}?s=${s.sig}`; };
  const downloadById = async (inv: any) => {
    if (!inv?.id) return;
    if (downloadingRef.current.has(inv.id)) { toast.info("Invoice is already downloading… please wait."); return; }
    downloadingRef.current.add(inv.id);
    setDownloading((m) => ({ ...m, [inv.id]: true }));
    toast.info("Downloading invoice PDF… please wait a moment.");
    try {
      const r = await downloadInvoicePdf(inv);
      toast.success(r.status === "saved" ? "Invoice saved to Downloads — opening PDF" : r.status === "downloaded" ? "Invoice downloaded — opening PDF" : "Invoice ready — choose a PDF app to view or save.");
      if (r.openUri) { try { await openLocalFile(r.openUri); } catch { toast.error("Downloaded, but no PDF viewer was found to open it"); } }
    } catch {
      toast.error("Invoice could not be downloaded");
    } finally {
      downloadingRef.current.delete(inv.id);
      setDownloading((m) => { const n = { ...m }; delete n[inv.id]; return n; });
    }
  };
  const openDrawer = (inv: any) => { setDrawerInv(inv); setDrawerFull(null); api.get(`/invoices/${inv.id}`).then(setDrawerFull).catch(() => {}); };
  const openPreview = async (inv: any) => { setDrawerInv(null); try { setPreview({ ...inv, url: await publicUrl(inv, "html") }); } catch { toast.error("Invoice could not be loaded. Please try again."); } };
  const shareInvoice = async (inv: any, channel: "whatsapp" | "copy") => {
    const text = `Invoice ${inv.invoice_number} · ${money(inv.total_amount, inv.currency)} · ${(inv.payment_status || "").toUpperCase()} — AzoApp`;
    if (channel === "copy") { await Clipboard.setStringAsync(text); toast.success("Invoice details copied"); return; }
    // Share the ACTUAL PDF file — never a backend URL.
    toast.info("Preparing invoice PDF…");
    try {
      const r = await shareInvoicePdf(inv, "whatsapp");
      if (r === "fallback") toast.info("Shared invoice details — PDF couldn't be attached this time");
    } catch { toast.error("Could not share invoice"); }
  };
  const sendEmail = async () => {
    const addr = emailTo.trim(); if (!addr.includes("@")) { toast.error("Enter a valid email address."); return; }
    setEmailBusy(true);
    try { const r: any = await api.post(`/invoices/${emailFor.id}/email`, { to: addr }); toast.success("Invoice emailed" + (r?.sent_to ? ` → ${r.sent_to}` : "")); setEmailFor(null); } catch (e: any) { toast.error(e?.message || "Could not send email."); } finally { setEmailBusy(false); }
  };
  const resetFilters = () => { setType("all"); setPayStatus("all"); setMinAmount(""); setMaxAmount(""); };
  const summary = data?.summary || {}; const cur = items[0]?.currency || "INR";
  const activeFilterCount = useMemo(() => [type !== "all", payStatus !== "all", !!minAmount, !!maxAmount].filter(Boolean).length, [type, payStatus, minAmount, maxAmount]);
  const filteredView = !!(activeFilterCount || search || range !== "all");
  const bd = drawerFull?.breakdown; const d = drawerInv;
  const inputStyle = { height: 44, borderRadius: 6, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, fontSize: 14, color: c.text, backgroundColor: c.surface, marginTop: 6, outlineStyle: "none" } as any;

  return (
    <View testID="invoice-center" style={{ gap: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoice #, booking…" testID="invoice-search" />
        <FilterButton activeCount={activeFilterCount} onPress={() => setShowFilters(true)} testID="invoice-filters-btn" />
        <Pressable testID="invoice-refresh" onPress={load} style={{ height: 40, width: 40, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }}><RefreshCw size={16} color={c.text} /></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {DATE_PRESETS.map(([k, l]) => { const on = range === k; return <Pressable key={k} testID={`invoice-range-${k}`} onPress={() => setRange(k)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 6, backgroundColor: on ? PRIMARY[700] : (isDark ? SLATE[800] : SLATE[100]), justifyContent: "center", ...(on ? shadowBtn : {}) }}><Text style={{ fontSize: 12, fontWeight: "600", color: on ? "#fff" : (isDark ? SLATE[300] : SLATE[600]) }}>{l}</Text></Pressable>; })}
      </ScrollView>
      {range === "custom" ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}><DatePick value={dateFrom} onChange={setDateFrom} placeholder="From" testID="invoice-date-from" /><Text style={{ color: TC.textFaint }}>to</Text><DatePick value={dateTo} onChange={setDateTo} placeholder="To" testID="invoice-date-to" /></View> : null}

      {loading && !data ? (
        <StatSlider>
          {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: CARD_W }}><Shimmer style={{ height: 120, borderRadius: 6, width: "100%" }} /></View>)}
        </StatSlider>
      ) : (
        <StatSlider testID="inv-kpi-slider">
          <View style={{ width: CARD_W }}><KpiCard w="100%" icon={FileText} tone="primary" label="Invoices" value={summary.total_count ?? 0} sub="In current view" testID="inv-kpi-count" /></View>
          <View style={{ width: CARD_W }}><KpiCard w="100%" icon={IndianRupee} tone="slate" label="Total Amount" value={money(summary.total_amount, cur)} sub="Gross value" testID="inv-kpi-total" /></View>
          <View style={{ width: CARD_W }}><KpiCard w="100%" icon={CheckCircle2} tone="emerald" label="Paid" value={money(summary.paid_amount, cur)} sub="Settled" testID="inv-kpi-paid" /></View>
          <View style={{ width: CARD_W }}><KpiCard w="100%" icon={Clock} tone="amber" label="Pending" value={money(summary.pending_amount, cur)} sub="Awaiting payment" testID="inv-kpi-pending" /></View>
          <View style={{ width: CARD_W }}><KpiCard w="100%" icon={RotateCcw} tone="violet" label="Refunded" value={money(summary.refunded_amount, cur)} sub="Returned" testID="inv-kpi-refunded" /></View>
        </StatSlider>
      )}

      {loading ? <SkeletonList rows={4} /> : error ? (
        <View testID="invoice-error" style={{ borderRadius: 6, borderWidth: 1, borderColor: ROSE[200], backgroundColor: c.surface, padding: 40, alignItems: "center" }}>
          <AlertTriangle size={36} color={ROSE[400]} /><Text style={{ marginTop: 12, fontSize: 15, fontWeight: "600", color: c.text }}>Unable to load invoices</Text><Text style={{ fontSize: 14, color: TC.textFaint, marginTop: 4 }}>Something went wrong. Please try again.</Text>
          <Btn tone="outline" label="Try Again" onPress={load} testID="invoice-retry" style={{ marginTop: 16 }} />
        </View>
      ) : items.length === 0 ? (
        <View>
          <EmptyState icon={FileText} title={filteredView ? "No invoices match your filters" : "No invoices yet"} desc={filteredView ? "Try clearing filters or changing the date range." : "Your booking invoices will appear here."} actionLabel={filteredView ? "Clear Filters" : undefined} onAction={() => { resetFilters(); setSearch(""); setRange("all"); }} testID="invoice-empty" />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {items.map((inv) => (
            <Pressable key={inv.id} testID={`invoice-card-${inv.invoice_number}`} onPress={() => openDrawer(inv)} style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 16, ...shadowBtn }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{inv.invoice_number}</Text><StatusBadge status={inv.payment_status} /></View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={{ fontSize: 12, color: c.textMuted }}>{TYPE_LABEL[inv.invoice_type] || inv.invoice_type} · {inv.customer_snapshot?.name || inv.booking_code || "—"}</Text><Text style={{ fontSize: 11, color: TC.textFaint, marginTop: 2 }}>{shortDate(inv.issue_date)}</Text></View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>{money(inv.display_amount ?? inv.total_amount, inv.currency)}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Btn tone="outline" icon={Eye} label="View" onPress={() => openDrawer(inv)} testID={`invoice-view-${inv.invoice_number}`} style={{ flex: 1, height: 36 }} />
                <Btn tone="outline" icon={Download} label={downloading[inv.id] ? "Downloading…" : "Download"} disabled={!!downloading[inv.id]} onPress={() => downloadById(inv)} testID={`invoice-download-${inv.invoice_number}`} style={{ flex: 1, height: 36 }} />
                <Pressable testID={`invoice-more-${inv.invoice_number}`} onPress={() => setShareFor(inv)} style={{ height: 36, width: 36, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Share2 size={16} color={c.textMuted} /></Pressable>
              </View>
            </Pressable>
          ))}
          <LoadMoreFooter hasMore={hasMore} loading={more === "loading"} error={more === "error"} onLoadMore={loadMore} total={items.length} testID="invoice-load-more" />
        </View>
      )}
      {items.length > 0 ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: -8 }}><ArrowUpDown size={14} color={TC.textFaint} /><OptionMenu value={sort} options={SORTS} onChange={setSort} title="Sort by" testID="invoice-sort" /></View> : null}

      <FilterSheet open={showFilters} onClose={() => setShowFilters(false)} onClear={resetFilters} onApply={() => setShowFilters(false)} title="Filters">
        <View><FilterLabel>Invoice Type</FilterLabel><View style={{ alignSelf: "flex-start" }}><OptionMenu value={type} options={TYPES} onChange={setType} icon={Layers} title="Invoice Type" testID="invoice-type-filter" /></View></View>
        <View><FilterLabel>Payment Status</FilterLabel><View style={{ alignSelf: "flex-start" }}><OptionMenu value={payStatus} options={PAY_STATUS} onChange={setPayStatus} icon={CreditCard} title="Payment Status" testID="invoice-paystatus-filter" /></View></View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><FilterLabel>Min Amount</FilterLabel><TextInput testID="invoice-min-amount" value={minAmount} onChangeText={(v) => setMinAmount(v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="0" placeholderTextColor={TC.textFaint} style={inputStyle} /></View>
          <View style={{ flex: 1 }}><FilterLabel>Max Amount</FilterLabel><TextInput testID="invoice-max-amount" value={maxAmount} onChangeText={(v) => setMaxAmount(v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder="Any" placeholderTextColor={TC.textFaint} style={inputStyle} /></View>
        </View>
      </FilterSheet>

      <DrawerShell open={!!d} onClose={() => { setDrawerInv(null); setDrawerFull(null); }} title={d?.invoice_number || "Invoice"} testID="invoice-detail-drawer"
        footer={d ? <View style={{ flexDirection: "row", gap: 8 }}><Btn tone="outline" icon={Download} label={downloading[d.id] ? "Downloading…" : "Download"} disabled={!!downloading[d.id]} onPress={() => downloadById(d)} testID="drawer-download" style={{ flex: 1, height: 44, borderRadius: 6 }} /><Btn icon={Eye} label="View Invoice" onPress={() => openPreview(d)} testID="drawer-view-full" style={{ flex: 1, height: 44, borderRadius: 6 }} /></View> : null}>
        {d ? <>
          <View style={{ borderRadius: 6, padding: 16, backgroundColor: isDark ? "rgba(30,41,59,0.5)" : TC.bg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View><Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: TC.textFaint }}>{d.invoice_type === "cancellation" ? "Total order value" : "Total amount"}</Text><Text style={{ fontSize: 24, fontWeight: "800", color: c.text }}>{money(d.invoice_type === "cancellation" ? (d.original_amount ?? d.total_amount) : d.total_amount, d.currency)}</Text></View>
            <StatusBadge status={d.payment_status} />
          </View>
          <Section icon={User} title="Customer"><KV k="Name" v={d.customer_snapshot?.name || "—"} /><KV k="Mobile" v={d.customer_snapshot?.phone || d.customer_snapshot?.mobile || "—"} />{d.customer_snapshot?.email ? <KV k="Email" v={d.customer_snapshot.email} /> : null}</Section>
          <Section icon={CalendarDays} title="Booking / Reference"><KV k="Type" v={(d.invoice_type || "").replace(/^\w/, (x: string) => x.toUpperCase())} />{d.booking_code ? <KV k="Booking ID" v={d.booking_code} mono /> : null}{d.service_name ? <KV k="Service" v={d.service_name} /> : null}{d.transaction_id ? <KV k="Reference" v={String(d.transaction_id).slice(0, 12)} mono /> : null}<KV k="Date" v={shortDate(d.issue_date)} /></Section>
          <Section icon={Wallet} title="Payment summary">
            {(bd?.service_items || []).length > 0 ? <View testID="drawer-service-items" style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSoft, gap: 6 }}>
              {bd.service_items.map((it: any, i: number) => <View key={i}><View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}><Text style={{ fontSize: 14, color: isDark ? SLATE[300] : TC.text2, flex: 1 }}>{it.name}{Number(it.qty) > 1 ? ` ×${it.qty}` : ""}</Text><Text style={{ fontSize: 14, fontWeight: "500", color: c.text }}>{money(it.amount, d.currency)}</Text></View>{(it.addons || []).map((a: any, ai: number) => <View key={ai} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingLeft: 12 }}><Text style={{ fontSize: 12.5, color: c.textMuted, flex: 1 }}>↳ {a.name}{Number(a.qty) > 1 ? ` ×${a.qty}` : ""}</Text><Text style={{ fontSize: 12.5, color: isDark ? SLATE[300] : TC.textMuted }}>{money(a.amount, d.currency)}</Text></View>)}</View>)}
              {(bd.additional_charges || []).filter((x: any) => Number(x.amount) > 0).map((x: any) => <View key={x.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}><Text style={{ fontSize: 14, color: c.textMuted }}>{x.label}</Text><Text style={{ fontSize: 14, color: isDark ? SLATE[200] : TC.text2 }}>{money(x.amount, d.currency)}</Text></View>)}
            </View> : null}
            {bd ? <>{bd.subtotal != null ? <KV k="Subtotal" v={money(bd.subtotal, d.currency)} /> : null}{Number(bd.discount) > 0 ? <KV k={`Coupon Discount${bd.coupon_code ? ` (${bd.coupon_code})` : ""}`} v={"−" + money(bd.discount, d.currency)} /> : null}{Number(bd.tax) > 0 ? <><KV k="Taxable Amount" v={money(bd.taxable, d.currency)} /><KV k="Est. Govt. Taxes" v={money(bd.tax, d.currency)} /></> : null}</>
              : <>{d.subtotal != null ? <KV k="Subtotal" v={money(d.subtotal, d.currency)} /> : null}{Number(d.visiting_charge) > 0 ? <KV k="Visiting Charge" v={money(d.visiting_charge, d.currency)} /> : null}{Number(d.fees) - Number(d.visiting_charge || 0) > 0.001 ? <KV k="Platform / Service Fees" v={money(Number(d.fees) - Number(d.visiting_charge || 0), d.currency)} /> : null}{d.discount ? <KV k="Discount" v={"−" + money(d.discount, d.currency)} /> : null}{d.tax ? <><KV k="Taxable Amount" v={money(d.taxable ?? (Number(d.subtotal || 0) + Math.max(0, Number(d.fees || 0) - Number(d.visiting_charge || 0))), d.currency)} /><KV k="Est. Govt. Taxes" v={money(d.tax, d.currency)} /></> : null}</>}
            {d.invoice_type !== "cancellation" ? <KV k="Total amount" v={money(d.total_amount, d.currency)} strong /> : null}
            {d.invoice_type === "cancellation" && d.original_amount != null ? <KV k="Total Order Value" v={money(d.original_amount, d.currency)} strong /> : null}
            {d.invoice_type === "cancellation" && d.cancellation_pct != null ? <KV k="Customer Refund" v={`${d.cancellation_pct}%`} /> : null}
            {d.invoice_type === "cancellation" && d.refund ? <KV k="Refund Issued (see Refund Receipt)" v={money(d.refund, d.currency)} /> : null}
            {d.refund && d.invoice_type !== "cancellation" ? <KV k="Refunded" v={money(d.refund, d.currency)} /> : null}
          </Section>
        </> : null}
      </DrawerShell>

      {/* Full invoice preview (server-rendered public page) */}
      <Modal visible={!!preview} animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: "600", color: c.text }}>{preview?.invoice_number || "Invoice"}</Text>
            <Pressable testID="invoice-share" onPress={() => setShareFor(preview)} style={{ height: 36, width: 36, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Share2 size={16} color={c.text} /></Pressable>
            <Pressable testID="invoice-email-btn" onPress={() => { setEmailTo(preview?.customer_snapshot?.email || ""); setEmailFor(preview); }} style={{ height: 36, width: 36, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Mail size={16} color={c.text} /></Pressable>
            <Pressable testID="invoice-open-print" onPress={() => downloadById(preview)} style={{ height: 36, width: 36, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><Printer size={16} color={c.text} /></Pressable>
            <Pressable testID="invoice-download-pdf" onPress={() => downloadById(preview)} style={{ height: 36, width: 36, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Download size={16} color="#fff" /></Pressable>
            <Pressable testID="invoice-close-btn" onPress={() => setPreview(null)} style={{ height: 36, width: 36, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><X size={16} color={c.text} /></Pressable>
          </View>
          {preview?.url ? <WebView source={{ uri: preview.url }} style={{ flex: 1, backgroundColor: isDark ? SLATE[950] : TC.surfaceAlt }} /> : null}
        </View>
      </Modal>

      <BottomSheet open={!!shareFor} onClose={() => setShareFor(null)} title="Share invoice" testID="invoice-share-sheet">
        {[["whatsapp", MessageCircle, "Share on WhatsApp"], ["copy", Copy, "Copy invoice details"], ["email", Mail, "Email invoice"], ["download", Download, "Download PDF"]].map(([k, Icon, l]: any) => (
          <Pressable key={k} testID={`share-${k}`} onPress={() => { const inv = shareFor; setShareFor(null); if (k === "email") { setEmailTo(inv?.customer_snapshot?.email || ""); setEmailFor(inv); } else if (k === "download") downloadById(inv); else shareInvoice(inv, k); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}><Icon size={18} color={c.text} /><Text style={{ fontSize: 15, color: c.text }}>{l}</Text></Pressable>
        ))}
      </BottomSheet>
      <BottomSheet open={!!emailFor} onClose={() => setEmailFor(null)} title="Email invoice" testID="invoice-email-sheet" footer={<Btn label={emailBusy ? "Sending…" : "Send"} disabled={emailBusy} onPress={sendEmail} testID="invoice-email-send" style={{ height: 44, borderRadius: 6 }} />}>
        <Text style={{ fontSize: 14, color: c.textMuted }}>Send this invoice to which email?</Text>
        <TextInput testID="invoice-email-input" value={emailTo} onChangeText={setEmailTo} autoCapitalize="none" keyboardType="email-address" placeholder="name@example.com" placeholderTextColor={TC.textFaint} style={inputStyle} />
      </BottomSheet>
    </View>
  );
}
