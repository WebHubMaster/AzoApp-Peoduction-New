/* 1:1 port of web InvoiceParts.jsx + Overlays.jsx (mobile variants) for the Partner app */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FileText, IndianRupee, CheckCircle2, Clock, RotateCcw, Search, X, Eye, Download, MoreHorizontal, Printer, Share2, Copy,
  ChevronLeft, ChevronRight, AlertTriangle, WifiOff, Inbox, MessageCircle, Link2, Store, CalendarDays, ArrowLeft, Loader2,
  CircleDollarSign, XCircle, AlertOctagon, HelpCircle, ChevronDown,
} from "lucide-react-native";
import { useTheme, palette } from "@/src/theme";
import { WDatePicker } from "@/src/components/reg/DatePicker";
import {
  money, shortDate, statusMeta, typeMeta, referenceOf, customerOf, DATE_PRESETS, pageList, Tone, StatusIcon, TimelineStep,
} from "@/src/lib/invoiceUtils";

/* ═══════════════════════════ theme tokens (tailwind slate + brand primary) ═══════════════════════════ */
export function useInv() {
  const { colors, mode, brand } = useTheme();
  const dark = mode === "dark";
  const P = palette(brand.primary);
  return {
    dark, P, primary: colors.primary, primaryDark: P[800], background: colors.background,
    surface: dark ? "#0F172A" : "#FFFFFF", surface2: dark ? "#1E293B" : "#FFFFFF", border: dark ? "#1E293B" : "#E2E8F0", border2: dark ? "#334155" : "#E2E8F0",
    t900: dark ? "#FFFFFF" : "#0F172A", t800: dark ? "#E2E8F0" : "#1E293B", t700: dark ? "#CBD5E1" : "#334155", t600: dark ? "#CBD5E1" : "#475569",
    t500: dark ? "#94A3B8" : "#64748B", t400: dark ? "#64748B" : "#94A3B8", subtle: dark ? "#1E293B" : "#F1F5F9", subtle2: dark ? "#0B1120" : "#F8FAFC",
    primary50: dark ? "rgba(23,37,84,0.6)" : P[50], primary700: dark ? "#93C5FD" : P[700], primary200: dark ? "#1E40AF" : P[200],
    emerald: dark ? "#34D399" : "#059669", rose: dark ? "#FB7185" : "#E11D48",
  };
}
const toneOf = (t: Tone, dark: boolean) => (dark ? { bg: t.bgD, fg: t.fgD, ring: t.ringD } : { bg: t.bg, fg: t.fg, ring: t.ring });

/* ═══════════════════════════ badges ═══════════════════════════ */
const STATUS_ICONS: Record<StatusIcon, any> = { check: CheckCircle2, clock: Clock, loader: Loader2, dollar: CircleDollarSign, rotate: RotateCcw, xcircle: XCircle, octagon: AlertOctagon, help: HelpCircle };
export function InvStatusBadge({ status, size = "md", testID }: { status?: string; size?: "sm" | "md"; testID?: string }) {
  const { dark } = useInv();
  const m = statusMeta(status); const c = toneOf(m.tone, dark); const Ico = STATUS_ICONS[m.icon];
  const sm = size === "sm";
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: sm ? 4 : 6, alignSelf: "flex-start", backgroundColor: c.bg, borderWidth: 1, borderColor: c.ring, paddingHorizontal: sm ? 8 : 10, paddingVertical: sm ? 2 : 4, borderRadius: 999 }}>
      <Ico size={sm ? 12 : 14} color={c.fg} strokeWidth={2.2} />
      <Text style={{ color: c.fg, fontSize: sm ? 10.5 : 11.5, fontWeight: "600" }} numberOfLines={1}>{m.label}</Text>
    </View>
  );
}
export function TypeChip({ type, testID }: { type?: string; testID?: string }) {
  const inv = useInv();
  const m = typeMeta(type);
  const c = m.tone === "primary" ? { bg: inv.primary50, fg: inv.primary700, ring: inv.primary200 } : toneOf(m.tone, inv.dark);
  return (
    <View testID={testID} style={{ alignSelf: "flex-start", backgroundColor: c.bg, borderWidth: 1, borderColor: c.ring, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: "600" }} numberOfLines={1}>{m.label}</Text>
    </View>
  );
}
/* kept for older imports */
export const InvTypeChip = TypeChip;

/* ═══════════════════════════ KPI cards ═══════════════════════════ */
function KpiTile({ icon: Ico, tone, label, value, sub, testID }: { icon: any; tone: "primary" | "slate" | "emerald" | "amber" | "violet"; label: string; value: string; sub?: string; testID?: string }) {
  const inv = useInv();
  const TONES: Record<string, { bg: string; fg: string }> = {
    primary: { bg: inv.primary50, fg: inv.primary700 },
    slate: { bg: inv.subtle, fg: inv.t600 },
    emerald: { bg: inv.dark ? "rgba(2,44,34,0.4)" : "#ECFDF5", fg: inv.dark ? "#34D399" : "#059669" },
    amber: { bg: inv.dark ? "rgba(69,26,3,0.4)" : "#FFFBEB", fg: inv.dark ? "#FBBF24" : "#D97706" },
    violet: { bg: inv.dark ? "rgba(46,16,101,0.4)" : "#F5F3FF", fg: inv.dark ? "#A78BFA" : "#7C3AED" },
  };
  const c = TONES[tone];
  return (
    <View testID={testID} style={{ width: 196, borderRadius: 16, backgroundColor: inv.surface, borderWidth: 1, borderColor: inv.border, padding: 16, boxShadow: "0px 4px 16px rgba(2,32,71,0.05)", elevation: 1 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}><Ico size={18} color={c.fg} strokeWidth={1.9} /></View>
      <Text style={{ color: inv.t400, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 12 }}>{label}</Text>
      <Text style={{ color: inv.t900, fontSize: 22, fontWeight: "800", lineHeight: 26, marginTop: 2 }} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={{ color: inv.t400, fontSize: 12, marginTop: 4 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}
export function InvoiceKpis({ summary = {}, currency = "INR", rangeLabel = "All Time" }: { summary?: any; currency?: string; rangeLabel?: string }) {
  const cnt = summary.total_count ?? 0;
  const paidPct = summary.total_amount ? Math.round(((summary.paid_amount || 0) / summary.total_amount) * 100) : 0;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }} snapToAlignment="start" decelerationRate="fast" testID="invoice-kpis">
      <KpiTile icon={FileText} tone="primary" label="Invoices" value={String(cnt)} sub={rangeLabel} testID="inv-kpi-count" />
      <KpiTile icon={IndianRupee} tone="slate" label="Total Amount" value={money(summary.total_amount, currency)} sub="Gross invoice value" testID="inv-kpi-total" />
      <KpiTile icon={CheckCircle2} tone="emerald" label="Paid" value={money(summary.paid_amount, currency)} sub={`${summary.paid_count ?? 0} invoice${(summary.paid_count ?? 0) === 1 ? "" : "s"} · ${paidPct}% settled`} testID="inv-kpi-paid" />
      <KpiTile icon={Clock} tone="amber" label="Pending" value={money(summary.pending_amount, currency)} sub={`${summary.pending_count ?? 0} awaiting payment`} testID="inv-kpi-pending" />
      <KpiTile icon={RotateCcw} tone="violet" label="Refunded" value={money(summary.refunded_amount, currency)} sub={`${summary.refunded_count ?? 0} refunded`} testID="inv-kpi-refunded" />
    </ScrollView>
  );
}

/* ═══════════════════════════ chips / buttons ═══════════════════════════ */
export function Chip({ on, onPress, children, testID, icon, count, height = 40 }: { on: boolean; onPress: () => void; children: React.ReactNode; testID?: string; icon?: React.ReactNode; count?: number; height?: number }) {
  const inv = useInv();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ height, paddingHorizontal: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: on ? inv.primary : inv.surface, borderWidth: 1, borderColor: on ? inv.primary : inv.border2, transform: [{ scale: pressed ? 0.97 : 1 }], boxShadow: on ? "0px 1px 2px rgba(13,71,161,0.3)" : undefined })}>
      {icon}
      <Text style={{ color: on ? "#fff" : inv.t700, fontSize: 12, fontWeight: "600" }}>{children}</Text>
      {count != null ? <View style={{ paddingHorizontal: 6, borderRadius: 6, backgroundColor: on ? "rgba(255,255,255,0.2)" : inv.subtle }}><Text style={{ fontSize: 10, color: on ? "#fff" : inv.t500 }}>{count}</Text></View> : null}
    </Pressable>
  );
}
export function OutlineBtn({ onPress, icon, label, disabled, busy, testID, flex = 1, height = 44, primary }: { onPress: () => void; icon?: React.ReactNode; label?: string; disabled?: boolean; busy?: boolean; testID?: string; flex?: number; height?: number; primary?: boolean }) {
  const inv = useInv();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || busy} style={({ pressed }) => ({ flex, height, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: primary ? inv.primary : inv.surface, borderWidth: primary ? 0 : 1, borderColor: inv.border2, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}>
      {busy ? <ActivityIndicator size="small" color={primary ? "#fff" : inv.primary700} /> : icon}
      {label ? <Text style={{ color: primary ? "#fff" : inv.t700, fontSize: 14, fontWeight: "600" }}>{label}</Text> : null}
    </Pressable>
  );
}
export function IconSquare({ onPress, children, testID, badge }: { onPress: () => void; children: React.ReactNode; testID?: string; badge?: number }) {
  const inv = useInv();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ position: "relative", height: 44, width: 44, borderRadius: 12, borderWidth: 1, borderColor: inv.border2, backgroundColor: inv.surface, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {children}
      {badge ? <View style={{ position: "absolute", top: -4, right: -4, height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: inv.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: inv.background }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{badge}</Text></View> : null}
    </Pressable>
  );
}
export function ActiveChip({ label, onRemove, testID }: { label: React.ReactNode; onRemove: () => void; testID?: string }) {
  const inv = useInv();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 32, paddingLeft: 10, paddingRight: 4, borderRadius: 8, backgroundColor: inv.primary50, borderWidth: 1, borderColor: inv.primary200 }}>
      {typeof label === "string" ? <Text style={{ color: inv.primary700, fontSize: 12, fontWeight: "600" }}>{label}</Text> : label}
      <Pressable onPress={onRemove} hitSlop={6} style={{ height: 24, width: 24, alignItems: "center", justifyContent: "center", borderRadius: 6 }}><X size={12} color={inv.primary700} /></Pressable>
    </View>
  );
}

/* ═══════════════════════════ date chips ═══════════════════════════ */
export function DateChips({ value, onChange, dateFrom, dateTo, onDateFrom, onDateTo, onApplyCustom, customApplied }: {
  value: string; onChange: (k: string) => void; dateFrom: string; dateTo: string; onDateFrom: (v: string) => void; onDateTo: (v: string) => void; onApplyCustom: () => void; customApplied: boolean;
}) {
  const inv = useInv();
  const [open, setOpen] = useState(value === "custom");
  useEffect(() => { if (value === "custom") setOpen(true); }, [value]);
  const canApply = !!(dateFrom || dateTo);
  return (
    <View style={{ gap: 10 }} testID="invoice-date-filters">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingBottom: 2 }}>
        {DATE_PRESETS.map(([k, l]) => (
          <Chip key={k} on={value === k} onPress={() => { onChange(k); if (k !== "custom") setOpen(false); }} testID={`invoice-range-${k}`}
            icon={k === "custom" ? <CalendarDays size={14} color={value === k ? "#fff" : inv.t700} /> : undefined}>{l}</Chip>
        ))}
      </ScrollView>
      {value === "custom" && open ? (
        <View testID="invoice-custom-range" style={{ borderRadius: 16, borderWidth: 1, borderColor: inv.border, backgroundColor: inv.surface, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, color: inv.t400, textTransform: "uppercase", marginBottom: 4 }}>From Date</Text><WDatePicker testID="invoice-date-from" value={dateFrom} onChange={onDateFrom} placeholder="From date" /></View>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, color: inv.t400, textTransform: "uppercase", marginBottom: 4 }}>To Date</Text><WDatePicker testID="invoice-date-to" value={dateTo} min={dateFrom || undefined} onChange={onDateTo} placeholder="To date" /></View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable testID="invoice-date-apply" onPress={onApplyCustom} disabled={!canApply} style={{ height: 40, paddingHorizontal: 20, borderRadius: 10, backgroundColor: inv.primary, alignItems: "center", justifyContent: "center", opacity: canApply ? 1 : 0.5 }}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Apply</Text></Pressable>
            {customApplied ? <Text style={{ fontSize: 11, color: inv.emerald, fontWeight: "600" }}>Applied</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════ search ═══════════════════════════ */
export function SearchBox({ value, onChange, searching, placeholder = "Search invoice #, booking, customer...", autoFocus }: { value: string; onChange: (v: string) => void; searching?: boolean; placeholder?: string; autoFocus?: boolean }) {
  const inv = useInv();
  return (
    <View style={{ flex: 1, position: "relative", height: 44, borderRadius: 12, borderWidth: 1, borderColor: inv.border2, backgroundColor: inv.surface, flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 10 }}>
      <Search size={16} color={inv.t400} />
      <TextInput testID="invoice-search" value={value} onChangeText={onChange} autoFocus={autoFocus} placeholder={placeholder} placeholderTextColor={inv.t400} style={{ flex: 1, marginLeft: 8, color: inv.t900, fontSize: 14, paddingVertical: 0 }} returnKeyType="search" />
      {searching ? <ActivityIndicator size="small" color={inv.primary700} testID="invoice-search-spinner" /> : value ? <Pressable testID="invoice-search-clear" onPress={() => onChange("")} hitSlop={8} style={{ height: 24, width: 24, alignItems: "center", justifyContent: "center", borderRadius: 6 }}><X size={14} color={inv.t400} /></Pressable> : null}
    </View>
  );
}

/* ═══════════════════════════ mobile cards ═══════════════════════════ */
export type RowActions = { onView: (inv: any) => void; onPreview: (inv: any) => void; onDownload: (inv: any) => void; onPrint: (inv: any) => void; onShare: (inv: any, ch: string) => void; onCopy: (inv: any) => void };
export function InvoiceCardList({ items, busyId, onMore, ...a }: { items: any[]; busyId: string | null; onMore: (inv: any) => void } & RowActions) {
  const inv = useInv();
  return (
    <View style={{ gap: 12 }} testID="invoice-card-list">
      {items.map((it) => {
        const cust = customerOf(it);
        return (
          <View key={it.id} testID={`invoice-card-${it.invoice_number}`} style={{ borderRadius: 16, backgroundColor: inv.surface, borderWidth: 1, borderColor: inv.border, boxShadow: "0px 4px 16px rgba(2,32,71,0.05)", elevation: 1, overflow: "hidden" }}>
            <Pressable onPress={() => a.onView(it)} style={({ pressed }) => ({ padding: 16, opacity: pressed ? 0.92 : 1 })}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: inv.t900, fontWeight: "600", fontSize: 15, letterSpacing: -0.2 }} numberOfLines={1}>{it.invoice_number}</Text>
                  <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}><TypeChip type={it.invoice_type} /><Text style={{ fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: inv.t400 }}>{referenceOf(it)}</Text></View>
                </View>
                <InvStatusBadge status={it.payment_status} size="sm" testID={`invoice-status-${it.invoice_number}`} />
              </View>
              <View style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, color: inv.t700, fontWeight: "500" }} numberOfLines={1}>{cust}</Text>
                  <Text style={{ fontSize: 12, color: inv.t400, marginTop: 2 }}>{shortDate(it.issue_date)}</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: inv.t900 }}>{money(it.total_amount, it.currency)}</Text>
              </View>
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
              <OutlineBtn testID={`invoice-card-view-${it.invoice_number}`} onPress={() => a.onView(it)} icon={<Eye size={16} color={inv.t700} />} label="View" />
              <OutlineBtn testID={`invoice-card-download-${it.invoice_number}`} onPress={() => a.onDownload(it)} busy={busyId === it.id} icon={<Download size={16} color={inv.t700} />} label="Download" />
              <Pressable testID={`invoice-more-${it.invoice_number}`} onPress={() => onMore(it)} style={{ height: 44, width: 44, borderRadius: 12, borderWidth: 1, borderColor: inv.border2, alignItems: "center", justifyContent: "center" }}><MoreHorizontal size={16} color={inv.t500} /></Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════ row menu (web DropdownMenu → bottom sheet) ═══════════════════════════ */
export function RowMenuSheet({ inv, onClose, ...a }: { inv: any | null; onClose: () => void } & RowActions) {
  const t = useInv();
  const run = (fn: () => void) => { onClose(); setTimeout(fn, 60); };
  const Item = ({ icon, label, onPress, testID, tone }: { icon: any; label: string; onPress: () => void; testID?: string; tone?: string }) => {
    const Ico = icon;
    return (
      <Pressable testID={testID} onPress={() => run(onPress)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, height: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: pressed ? t.subtle : "transparent" })}>
        <Ico size={16} color={tone || t.t500} /><Text style={{ color: t.t800, fontSize: 14, fontWeight: "500" }}>{label}</Text>
      </Pressable>
    );
  };
  const Sep = () => <View style={{ height: 1, backgroundColor: t.border, marginVertical: 4 }} />;
  return (
    <ActionSheet open={!!inv} onClose={onClose} title={inv?.invoice_number || "Invoice"} testID="invoice-row-menu">
      {inv ? (
        <View>
          <Item icon={Eye} label="View Details" onPress={() => a.onView(inv)} testID="invoice-menu-view" />
          <Item icon={FileText} label="View Invoice" onPress={() => a.onPreview(inv)} testID={`invoice-menu-preview-${inv.invoice_number}`} />
          <Item icon={Download} label="Download PDF" onPress={() => a.onDownload(inv)} testID="invoice-menu-download" />
          <Item icon={Printer} label="Print Invoice" onPress={() => a.onPrint(inv)} testID="invoice-menu-print" />
          <Sep />
          <Item icon={MessageCircle} label="Share on WhatsApp" onPress={() => a.onShare(inv, "whatsapp")} tone={t.emerald} testID="invoice-menu-whatsapp" />
          <Item icon={Link2} label="Copy Link" onPress={() => a.onShare(inv, "copy")} testID="invoice-menu-copy-link" />
          <Item icon={Share2} label="Share…" onPress={() => a.onShare(inv, "system")} testID="invoice-menu-share" />
          <Sep />
          <Item icon={Copy} label="Copy Invoice Number" onPress={() => a.onCopy(inv)} testID={`invoice-menu-copy-${inv.invoice_number}`} />
        </View>
      ) : null}
    </ActionSheet>
  );
}

/* ═══════════════════════════ pagination (web AdvancedPaginator, <sm variant) ═══════════════════════════ */
export function AdvancedPaginator({ page, pages, total, pageSize, onPage, onPageSize, noun = "invoice" }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void; onPageSize: (n: number) => void; noun?: string }) {
  const inv = useInv();
  const [sizeOpen, setSizeOpen] = useState(false);
  const pgs = Math.max(1, pages || 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const ghost = { height: 36, minWidth: 36, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: inv.border2, backgroundColor: inv.surface, alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View testID="invoice-pagination" style={{ gap: 12, paddingTop: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: inv.subtle }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Text testID="pagination-info" style={{ fontSize: 12, color: inv.t500 }}>Showing <Text style={{ fontWeight: "700", color: inv.t800 }}>{from}–{to}</Text> of <Text style={{ fontWeight: "700", color: inv.t800 }}>{total}</Text> {noun}{total === 1 ? "" : "s"}</Text>
        <Pressable testID="page-size" onPress={() => setSizeOpen(true)} style={{ ...ghost, width: 104, flexDirection: "row", gap: 6 }}><Text style={{ fontSize: 12, color: inv.t700 }}>{pageSize} / page</Text><ChevronDown size={14} color={inv.t400} /></Pressable>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
        <Pressable testID="page-prev" disabled={page <= 1} onPress={() => onPage(page - 1)} style={{ ...ghost, opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={16} color={inv.t600} /></Pressable>
        {pageList(page, pgs).map((p, i) => p === "…"
          ? <Text key={`e${i}`} style={{ paddingHorizontal: 4, color: inv.t400, fontSize: 14 }}>…</Text>
          : <Pressable key={p} testID={`page-${p}`} onPress={() => onPage(p as number)} style={{ ...ghost, backgroundColor: p === page ? inv.primary : inv.surface, borderColor: p === page ? inv.primary : inv.border2 }}><Text style={{ fontSize: 14, fontWeight: "600", color: p === page ? "#fff" : inv.t600 }}>{p}</Text></Pressable>)}
        <Pressable testID="page-next" disabled={page >= pgs} onPress={() => onPage(page + 1)} style={{ ...ghost, opacity: page >= pgs ? 0.4 : 1 }}><ChevronRight size={16} color={inv.t600} /></Pressable>
      </View>
      <ActionSheet open={sizeOpen} onClose={() => setSizeOpen(false)} title="Rows per page" testID="page-size-sheet">
        {[10, 25, 50, 100].map((n) => (
          <Pressable key={n} testID={`page-size-${n}`} onPress={() => { setSizeOpen(false); onPageSize(n); }} style={{ height: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: "center", backgroundColor: n === pageSize ? inv.primary50 : "transparent" }}>
            <Text style={{ fontSize: 14, fontWeight: n === pageSize ? "700" : "500", color: n === pageSize ? inv.primary700 : inv.t800 }}>{n} / page</Text>
          </Pressable>
        ))}
      </ActionSheet>
    </View>
  );
}

/* ═══════════════════════════ skeletons ═══════════════════════════ */
export const Sk = ({ h, w, r = 8, style }: { h: number; w?: number | string; r?: number; style?: any }) => { const inv = useInv(); return <View style={[{ height: h, width: (w ?? "100%") as any, borderRadius: r, backgroundColor: inv.subtle }, style]} />; };
export function KpiSkeleton() {
  const inv = useInv();
  return (
    <View testID="invoice-kpi-skeleton" style={{ flexDirection: "row", gap: 12, overflow: "hidden", marginHorizontal: -16, paddingHorizontal: 16 }}>
      {[0, 1, 2].map((i) => <View key={i} style={{ width: 196, borderRadius: 16, backgroundColor: inv.surface, borderWidth: 1, borderColor: inv.border, padding: 20 }}><Sk h={40} w={40} r={12} /><Sk h={12} w={80} style={{ marginTop: 16 }} /><Sk h={28} w={112} style={{ marginTop: 8 }} /><Sk h={12} w={96} style={{ marginTop: 8 }} /></View>)}
    </View>
  );
}
export function TableSkeleton() {
  const inv = useInv();
  return (
    <View testID="invoice-table-skeleton" style={{ padding: 16, gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ borderRadius: 16, borderWidth: 1, borderColor: inv.border, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Sk h={16} w={128} /><Sk h={20} w={64} r={999} /></View>
          <Sk h={12} w={96} style={{ marginTop: 12 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}><Sk h={16} w={112} /><Sk h={24} w={80} /></View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}><View style={{ flex: 1 }}><Sk h={44} r={12} /></View><View style={{ flex: 1 }}><Sk h={44} r={12} /></View></View>
        </View>
      ))}
    </View>
  );
}
export function DetailSkeleton() {
  return (
    <View testID="invoice-detail-skeleton" style={{ gap: 20 }}>
      <Sk h={96} r={16} />
      {[0, 1, 2].map((i) => <View key={i}><Sk h={12} w={96} style={{ marginBottom: 8 }} /><Sk h={112} r={12} /></View>)}
    </View>
  );
}
export function DocumentSkeleton() {
  const inv = useInv();
  return (
    <View testID="invoice-document-skeleton" style={{ backgroundColor: inv.surface, borderRadius: 8, padding: 24, gap: 24, boxShadow: "0px 10px 40px rgba(2,6,23,0.14)" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Sk h={48} w={140} /><Sk h={48} w={110} /></View>
      <View style={{ flexDirection: "row", gap: 16 }}><View style={{ flex: 1 }}><Sk h={80} /></View><View style={{ flex: 1 }}><Sk h={80} /></View><View style={{ flex: 1 }}><Sk h={80} /></View></View>
      <Sk h={160} /><View style={{ alignItems: "flex-end" }}><Sk h={112} w={220} /></View>
    </View>
  );
}

/* ═══════════════════════════ empty / error ═══════════════════════════ */
export function InvEmpty({ filtered, onClear, hint }: { filtered: boolean; onClear: () => void; hint?: string }) {
  const inv = useInv();
  return (
    <View testID="invoice-empty" style={{ paddingVertical: 64, paddingHorizontal: 24, alignItems: "center" }}>
      <View style={{ height: 64, width: 64, borderRadius: 16, backgroundColor: inv.subtle, alignItems: "center", justifyContent: "center" }}><Inbox size={28} color={inv.t400} strokeWidth={1.6} /></View>
      <Text style={{ fontWeight: "700", fontSize: 18, color: inv.t900, marginTop: 16, textAlign: "center" }}>{filtered ? "No invoices match your current filters." : "No invoices yet"}</Text>
      <Text style={{ fontSize: 14, color: inv.t500, marginTop: 4, textAlign: "center", maxWidth: 360, lineHeight: 20 }}>{filtered ? "Try a different date range, clear the search, or reset filters to see all invoices." : (hint || "Your commission & booking invoices will appear here as soon as bookings complete.")}</Text>
      {filtered ? <View style={{ marginTop: 20, width: 160 }}><OutlineBtn testID="invoice-clear-filters" onPress={onClear} icon={<X size={16} color={inv.t700} />} label="Clear Filters" /></View> : null}
    </View>
  );
}
export function InvError({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  const inv = useInv();
  return (
    <View testID="invoice-error" style={{ paddingVertical: 56, paddingHorizontal: 24, alignItems: "center" }}>
      <View style={{ height: 64, width: 64, borderRadius: 16, backgroundColor: inv.dark ? "rgba(76,5,25,0.4)" : "#FFF1F2", alignItems: "center", justifyContent: "center" }}>{offline ? <WifiOff size={28} color="#F43F5E" strokeWidth={1.7} /> : <AlertTriangle size={28} color="#F43F5E" strokeWidth={1.7} />}</View>
      <Text style={{ fontWeight: "700", fontSize: 18, color: inv.t900, marginTop: 16 }}>{offline ? "No internet connection" : "Unable to load invoices"}</Text>
      <Text style={{ fontSize: 14, color: inv.t500, marginTop: 4, textAlign: "center", maxWidth: 360 }}>{offline ? "Check your connection and try again." : "Something went wrong while fetching your invoices."}</Text>
      <Pressable testID="invoice-retry" onPress={onRetry} style={{ marginTop: 20, height: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: inv.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "600" }}>{offline ? "Reconnect" : "Try Again"}</Text></Pressable>
    </View>
  );
}

/* ═══════════════════════════ page header ═══════════════════════════ */
export function PageHeader({ shopName, title = "My Invoices", subtitle = "Commission & booking invoices for your shop" }: { shopName: string; title?: string; subtitle?: string }) {
  const inv = useInv();
  return (
    <View>
      <Text testID="partner-invoices-header" style={{ fontSize: 24, fontWeight: "800", color: inv.t900, letterSpacing: -0.4 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: inv.t500, marginTop: 2 }}>{subtitle}</Text>
      <View testID="invoice-merchant-name" style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: inv.subtle, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 }}>
        <Store size={14} color={inv.primary700} /><Text style={{ fontSize: 12, fontWeight: "600", color: inv.t600 }}>{shopName}</Text>
      </View>
    </View>
  );
}

/* ═══════════════════════════ timeline (FinanceKit.Timeline) ═══════════════════════════ */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  const inv = useInv();
  return (
    <View style={{ paddingLeft: 20, position: "relative" }}>
      <View style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 1, backgroundColor: inv.border2 }} />
      {steps.map((s, i) => (
        <View key={i} style={{ position: "relative", paddingBottom: i === steps.length - 1 ? 0 : 16 }}>
          <View style={{ position: "absolute", left: -20, top: 2, height: 14, width: 14, borderRadius: 7, borderWidth: 3, borderColor: inv.surface, backgroundColor: s.done ? "#10B981" : s.active ? inv.primary : inv.dark ? "#475569" : "#CBD5E1" }} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: s.done || s.active ? inv.t900 : inv.t400 }}>{s.title}</Text>
          {s.time ? <Text style={{ fontSize: 11, color: inv.t400, marginTop: 2 }}>{s.time}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/* ═══════════════════════════ overlays ═══════════════════════════ */
/** SlideOver (mobile) — full-screen app-style page */
export function FullSheet({ open, onClose, title, subtitle, children, footer, headerRight, testID }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; headerRight?: React.ReactNode; testID?: string }) {
  const inv = useInv(); const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} statusBarTranslucent presentationStyle="fullScreen">
      <View testID={testID} style={{ flex: 1, backgroundColor: inv.dark ? "#020617" : "#F8FAFC" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10, paddingTop: insets.top + 10, backgroundColor: inv.surface, borderBottomWidth: 1, borderBottomColor: inv.border2 }}>
          <Pressable testID="slideover-back" onPress={onClose} style={({ pressed }) => ({ height: 44, width: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? inv.subtle : "transparent" })}><ArrowLeft size={20} color={inv.t600} /></Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: inv.t900, lineHeight: 20 }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={{ fontSize: 11, color: inv.t400 }} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {headerRight}
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: footer ? 112 + insets.bottom : 24 + insets.bottom }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        {footer ? <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: inv.border2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: inv.surface }}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

/** Bottom sheet — used for share options / menus */
export function ActionSheet({ open, onClose, title, children, testID }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; testID?: string }) {
  const inv = useInv(); const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }} testID={testID}>
        <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,23,42,0.5)" }} onPress={onClose} />
        <View style={{ backgroundColor: inv.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: inv.border2, paddingBottom: insets.bottom + 12, boxShadow: "0px -10px 40px rgba(0,0,0,0.2)" }}>
          <View style={{ alignSelf: "center", height: 6, width: 48, borderRadius: 3, backgroundColor: inv.dark ? "#334155" : "#E2E8F0", marginTop: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
            <Text style={{ fontWeight: "700", color: inv.t900, fontSize: 15 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ height: 36, width: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><X size={16} color={inv.t400} /></Pressable>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

/** Share options (InvoiceViewer.ShareSheet) */
export function ShareSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (ch: string) => void }) {
  const inv = useInv();
  const Item = ({ icon: Ico, bg, fg, title, sub, ch, testID }: any) => (
    <Pressable testID={testID} onPress={() => onPick(ch)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 56, backgroundColor: pressed ? inv.subtle : "transparent" })}>
      <View style={{ height: 44, width: 44, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Ico size={20} color={fg} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "600", color: inv.t900 }}>{title}</Text><Text style={{ fontSize: 12, color: inv.t400 }}>{sub}</Text></View>
    </Pressable>
  );
  return (
    <ActionSheet open={open} onClose={onClose} title="Share invoice" testID="invoice-share-sheet">
      <Item icon={MessageCircle} bg={inv.dark ? "rgba(2,44,34,0.4)" : "#ECFDF5"} fg={inv.emerald} title="WhatsApp" sub="Send invoice summary & link" ch="whatsapp" testID="share-whatsapp" />
      <Item icon={Link2} bg={inv.primary50} fg={inv.primary700} title="Copy Link" sub="Copy a link to this invoice" ch="copy" testID="share-copy" />
      <Item icon={Share2} bg={inv.subtle} fg={inv.t600} title="System Share" sub="Share via installed apps" ch="system" testID="share-system" />
      <Item icon={Copy} bg={inv.subtle} fg={inv.t600} title="Copy Details" sub="Invoice number, amount & status" ch="text" testID="share-text" />
    </ActionSheet>
  );
}

/* ═══════════════════════════ misc ═══════════════════════════ */
export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  const t = useRef<any>(null);
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => setV(value), ms); return () => clearTimeout(t.current); }, [value, ms]);
  return v;
}
