/* 1:1 port of web MerchantInvoices.jsx (role="partner") — "My Invoices", mobile (<md) variant */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { SlidersHorizontal, RefreshCw, ArrowUpDown, Search } from "lucide-react-native";
import { api, ApiError } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/components/Toast";
import { AppShellHeader, Surface } from "@/src/components/AppShell";
import {
  PageHeader, InvoiceKpis, KpiSkeleton, DateChips, SearchBox, InvoiceCardList, AdvancedPaginator, TableSkeleton, InvEmpty, InvError,
  IconSquare, ActiveChip, ActionSheet, RowMenuSheet, EmailSheet, useDebounced, useInv,
} from "@/src/components/invoice";
import InvoiceFilterSheet from "@/src/components/invoices/FilterSheet";
import InvoiceDetailPanel from "@/src/components/invoices/DetailPanel";
import InvoiceViewer from "@/src/components/invoices/Viewer";
import { clearInvoiceHtmlCache } from "@/src/components/invoices/Viewer";
import { SORT_OPTIONS, presetLabel, typeMeta, statusMeta, shareText, EMPTY_FILTERS, countFilters, Filters } from "@/src/lib/invoiceUtils";
import { downloadInvoicePdf, printInvoice, shareInvoicePdf, copyText, emailInvoice, emailInvoiceCompose, getInvoiceShareLink } from "@/src/lib/invoiceActions";

const qs = (o: Record<string, any>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export default function PartnerInvoices() {
  const t = useInv();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { invoice: deepLinkId } = useLocalSearchParams<{ invoice?: string }>();
  const role = "partner"; const shopName = user?.name || "Partner";

  /* ── list state ── */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [range, setRange] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "" });
  const [sort, setSort] = useState("newest");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounced(searchRaw.trim(), 350);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [pulling, setPulling] = useState(false);

  /* ── detail / viewer state ── */
  const [selected, setSelected] = useState<any>(null);
  const [viewerInv, setViewerInv] = useState<any>(null);
  const [fullCache, setFullCache] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [menuFor, setMenuFor] = useState<any>(null);
  const [emailFor, setEmailFor] = useState<any>(null);
  const [emailing, setEmailing] = useState(false);

  const params = useMemo(() => ({
    page, page_size: pageSize, range, sort,
    date_from: range === "custom" ? applied.from || undefined : undefined,
    date_to: range === "custom" ? applied.to || undefined : undefined,
    search: search || undefined,
    invoice_type: filters.types.length ? filters.types.join(",") : "all",
    payment_status: filters.statuses.length ? filters.statuses.join(",") : "all",
    min_amount: filters.minAmount || undefined, max_amount: filters.maxAmount || undefined,
    customer: filters.customer || undefined, booking_id: filters.booking || undefined,
  }), [page, pageSize, range, sort, applied, search, filters]);

  const q = useQuery({
    queryKey: ["partner-invoices", params],
    queryFn: () => api.get<any>(`/invoices?${qs(params)}`),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const data = q.data;
  const loading = q.isFetching;
  const error: null | "offline" | "error" = q.isError ? ((q.error as ApiError)?.status === 0 ? "offline" : "error") : null;
  const load = useCallback(() => { clearInvoiceHtmlCache(); return q.refetch(); }, [q]);

  // reset to page 1 whenever filters / search / sort / size change
  const resetKey = JSON.stringify({ range, applied, sort, search, filters, pageSize });
  const firstRun = useRef(true);
  useEffect(() => { if (firstRun.current) { firstRun.current = false; return; } setPage(1); }, [resetKey]);

  // reconnect handling
  const errRef = useRef(error); errRef.current = error;
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => { if (s.isConnected && errRef.current === "offline") { toast.success("Back online"); q.refetch(); } });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── full invoice fetch (cached) ── */
  const cacheRef = useRef(fullCache); cacheRef.current = fullCache;
  const fetchFull = useCallback(async (id: string) => {
    if (cacheRef.current[id]) return cacheRef.current[id];
    const r = await api.get<any>(`/invoices/${id}`);
    setFullCache((c) => ({ ...c, [id]: r }));
    return r;
  }, []);

  const openDetail = async (inv: any) => {
    setSelected(inv);
    if (cacheRef.current[inv.id]) return;
    setDetailLoading(true);
    try { await fetchFull(inv.id); } catch { toast.error("Invoice details could not be loaded"); }
    finally { setDetailLoading(false); }
  };
  const openViewer = async (inv: any) => {
    setViewerInv({ id: inv.id, invoice_number: inv.invoice_number, issue_date: inv.issue_date });
    setViewerLoading(true);
    try { setViewerInv(await fetchFull(inv.id)); }
    catch { toast.error("Invoice could not be loaded"); setViewerInv(null); }
    finally { setViewerLoading(false); }
  };

  // deep-link: /partner/invoices?invoice=<id>
  useEffect(() => {
    if (deepLinkId) { openViewer({ id: deepLinkId }); router.setParams({ invoice: undefined } as any); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId]);

  /* ── actions ── */
  const download = async (inv: any) => {
    if (!inv?.id) return;
    setBusyId(inv.id);
    toast.info("Preparing invoice...");
    try {
      const r = await downloadInvoicePdf(inv);
      if (r === "saved") toast.success("Invoice saved to your Downloads");
      else if (r === "downloaded") toast.success("Invoice downloaded successfully");
      else toast.success("Invoice ready — choose where to save it");
    }
    catch { toast.error("Invoice could not be downloaded"); }
    finally { setBusyId(null); }
  };
  const print = async (inv: any) => {
    if (!inv?.id) return;
    setPrinting(true);
    try { await printInvoice(inv); }
    catch (e: any) { if (!/cancel|dismiss/i.test(String(e?.message || ""))) toast.error("Invoice could not be printed"); }
    finally { setPrinting(false); }
  };
  const share = async (inv: any, channel: string) => {
    if (!inv) return;
    if (channel === "email") {
      if (Platform.OS === "web") { setEmailFor(inv); return; }
      toast.info("Opening email…");
      try {
        const r = await emailInvoiceCompose(inv);
        if (r === "sent") toast.success("Invoice emailed");
      } catch { setEmailFor(inv); }  // no mail app / attach failed → fall back to the send sheet
      return;
    }
    if (channel === "whatsapp" || channel === "system") {
      toast.info("Preparing invoice…");
      try {
        const r = await shareInvoicePdf(inv, channel as any);
        if (r === "downloaded") toast.success("Invoice PDF downloaded — attach it in WhatsApp");
        else if (r === "fallback") toast.info("Shared invoice details — PDF couldn't be attached this time");
      }
      catch { toast.error("Could not prepare the invoice PDF"); }
      return;
    }
    if (channel === "copy") {
      toast.info("Preparing link…");
      try {
        const link = await getInvoiceShareLink(inv);
        (await copyText(link)) ? toast.success("Invoice link copied — anyone can open it") : toast.error("Could not copy link");
      } catch { toast.error("Could not create the share link"); }
      return;
    }
    if (channel === "text") { (await copyText(shareText(inv))) ? toast.success("Invoice details copied") : toast.error("Could not copy"); return; }
  };
  const copyNumber = async (inv: any) => { (await copyText(inv.invoice_number)) ? toast.success(`Copied ${inv.invoice_number}`) : toast.error("Could not copy"); };

  const sendEmail = async (email: string) => {
    const inv = emailFor; if (!inv) return;
    setEmailing(true);
    try {
      const r = await emailInvoice(inv, email || undefined);
      setEmailFor(null);
      toast.success(r?.sent_to ? `Invoice emailed to ${r.sent_to}` : "Invoice emailed");
    } catch (e: any) {
      toast.error((e as ApiError)?.detail || "Could not email the invoice");
    } finally { setEmailing(false); }
  };

  const applyCustom = () => { setApplied({ from: dateFrom, to: dateTo }); };
  const onRangeChange = (k: string) => { setRange(k); if (k !== "custom") setApplied({ from: "", to: "" }); };
  const onRangeApplyFromDrawer = (k: string, f: string, tt: string) => { setRange(k); setDateFrom(f); setDateTo(tt); setApplied(k === "custom" ? { from: f, to: tt } : { from: "", to: "" }); };
  const clearAll = () => { setFilters(EMPTY_FILTERS); setSearchRaw(""); setRange("all"); setApplied({ from: "", to: "" }); setDateFrom(""); setDateTo(""); };

  const items: any[] = data?.items || [];
  const summary = data?.summary || {};
  const cur = items[0]?.currency || "INR";
  const nFilters = countFilters(filters);
  const isFiltered = nFilters > 0 || !!search || range !== "all";
  const emptyHint = role === "partner" ? "Your booking, earnings & withdrawal documents will appear here." : undefined;
  const searching = loading && !!data && (searchRaw.trim() !== search || !!search);
  const rangeLabel = range === "custom" && (applied.from || applied.to) ? `${applied.from || "…"} → ${applied.to || "…"}` : presetLabel(range);
  const rowActions = { onView: openDetail, onPreview: openViewer, onDownload: download, onPrint: print, onShare: share, onCopy: copyNumber };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }} testID="merchant-invoices">
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 110, gap: 20 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={async () => { setPulling(true); clearInvoiceHtmlCache(); try { await q.refetch(); } finally { setPulling(false); } }} tintColor={t.primary} colors={[t.primary]} />}>
        {/* ── page header ── */}
        <PageHeader shopName={shopName} title="My Invoices" subtitle="Booking, earnings, settlement & withdrawal documents" />

        {/* ── mobile toolbar ── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <SearchBox value={searchRaw} onChange={setSearchRaw} searching={searching} />
          <IconSquare testID="invoice-filters-btn-m" onPress={() => setShowFilters(true)} badge={nFilters || undefined}><SlidersHorizontal size={18} color={t.t600} /></IconSquare>
          <IconSquare testID="invoice-sort-btn-m" onPress={() => setSortOpen(true)}><ArrowUpDown size={18} color={t.t600} /></IconSquare>
          <IconSquare testID="invoice-refresh-m" onPress={() => load()}><RefreshCw size={18} color={t.t600} /></IconSquare>
        </View>

        {/* ── date filters ── */}
        <DateChips value={range} onChange={onRangeChange} dateFrom={dateFrom} dateTo={dateTo} onDateFrom={setDateFrom} onDateTo={setDateTo} onApplyCustom={applyCustom}
          customApplied={range === "custom" && !!(applied.from || applied.to) && applied.from === dateFrom && applied.to === dateTo} />

        {/* ── active filter chips ── */}
        {(nFilters > 0 || search) ? (
          <View testID="invoice-active-filters" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: t.t500, marginRight: 4 }}>{nFilters} filter{nFilters === 1 ? "" : "s"} applied{search ? " · search" : ""}</Text>
            {filters.types.map((x) => <ActiveChip key={x} label={`Type: ${typeMeta(x).label}`} onRemove={() => setFilters((f) => ({ ...f, types: f.types.filter((y) => y !== x) }))} />)}
            {filters.statuses.map((s) => <ActiveChip key={s} label={statusMeta(s).label} onRemove={() => setFilters((f) => ({ ...f, statuses: f.statuses.filter((y) => y !== s) }))} />)}
            {(filters.minAmount || filters.maxAmount) ? <ActiveChip label={`₹${filters.minAmount || 0} – ${filters.maxAmount ? "₹" + filters.maxAmount : "any"}`} onRemove={() => setFilters((f) => ({ ...f, minAmount: "", maxAmount: "" }))} /> : null}
            {filters.customer ? <ActiveChip label={`Customer: ${filters.customer}`} onRemove={() => setFilters((f) => ({ ...f, customer: "" }))} /> : null}
            {filters.booking ? <ActiveChip label={`Booking: ${filters.booking}`} onRemove={() => setFilters((f) => ({ ...f, booking: "" }))} /> : null}
            {search ? <ActiveChip label={<View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Search size={12} color={t.primary700} /><Text style={{ color: t.primary700, fontSize: 12, fontWeight: "600" }}>{search}</Text></View>} onRemove={() => setSearchRaw("")} /> : null}
            <Pressable testID="invoice-clear-all" onPress={clearAll} style={{ marginLeft: 4 }}><Text style={{ fontSize: 12, fontWeight: "600", color: t.primary700 }}>Clear all</Text></Pressable>
          </View>
        ) : null}

        {/* ── KPIs ── */}
        {loading && !data ? <KpiSkeleton /> : <InvoiceKpis summary={summary} currency={cur} rangeLabel={rangeLabel} />}

        {/* ── list ── */}
        <Surface testID="invoice-list-surface" style={{ overflow: "hidden" }}>
          {loading && !data ? <TableSkeleton /> : error ? <InvError offline={error === "offline"} onRetry={() => load()} />
            : items.length === 0 ? <InvEmpty filtered={isFiltered} onClear={clearAll} hint={emptyHint} />
            : (
              <View style={{ opacity: loading ? 0.6 : 1 }} pointerEvents={loading ? "none" : "auto"}>
                <View style={{ padding: 12 }}>
                  <InvoiceCardList items={items} busyId={busyId} onMore={setMenuFor} {...rowActions} />
                </View>
                <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                  <AdvancedPaginator page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={(p) => setPage(p)} onPageSize={setPageSize} />
                </View>
              </View>
            )}
        </Surface>
      </ScrollView>

      {/* ── overlays ── */}
      <ActionSheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by" testID="invoice-sort-sheet">
        {SORT_OPTIONS.map(([k, l]) => (
          <Pressable key={k} testID={`invoice-sort-${k}`} onPress={() => { setSort(k); setSortOpen(false); }} style={{ height: 40, paddingHorizontal: 12, borderRadius: 8, justifyContent: "center", backgroundColor: sort === k ? t.primary50 : "transparent" }}>
            <Text style={{ fontSize: 14, fontWeight: sort === k ? "600" : "400", color: sort === k ? t.primary700 : t.t800 }}>{l}</Text>
          </Pressable>
        ))}
      </ActionSheet>
      <RowMenuSheet inv={menuFor} onClose={() => setMenuFor(null)} {...rowActions} />
      <InvoiceFilterSheet open={showFilters} onClose={() => setShowFilters(false)} filters={filters} onApply={setFilters}
        range={range} dateFrom={dateFrom} dateTo={dateTo} onRangeApply={onRangeApplyFromDrawer} counts={summary} />
      <InvoiceDetailPanel inv={selected} full={selected ? fullCache[selected.id] : null} loading={detailLoading} onClose={() => setSelected(null)}
        onDownload={download} onPreview={(inv) => { openViewer(inv); }} onPrint={print} onShare={share} onCopy={copyNumber} downloading={!!selected && busyId === selected.id} merchantName={shopName} role={role} />
      <InvoiceViewer inv={viewerInv} loading={viewerLoading} onClose={() => setViewerInv(null)} onDownload={download} onPrint={print} onShare={share}
        downloading={!!viewerInv && busyId === viewerInv.id} printing={printing} />
      <EmailSheet inv={emailFor} onClose={() => setEmailFor(null)} onSend={sendEmail} sending={emailing} />
    </View>
  );
}
