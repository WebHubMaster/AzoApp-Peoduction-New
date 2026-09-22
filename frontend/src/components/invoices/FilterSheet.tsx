/* 1:1 port of web InvoiceFilterDrawer.jsx (mobile = full-screen sheet, works on a local draft) */
import React, { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { RotateCcw, Check, CheckCircle2, Clock, CircleDollarSign, XCircle, AlertOctagon } from "lucide-react-native";
import { WDatePicker } from "@/src/components/reg/DatePicker";
import { FullSheet, Chip, OutlineBtn, useInv } from "@/src/components/invoice";
import { DATE_PRESETS, TYPE_OPTIONS, STATUS_OPTIONS, typeMeta, statusMeta, EMPTY_FILTERS, countFilters, Filters } from "@/src/lib/invoiceUtils";

const STATUS_ICON: Record<string, any> = { paid: CheckCircle2, pending: Clock, partially_paid: CircleDollarSign, refunded: RotateCcw, cancelled: XCircle, failed: AlertOctagon };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const inv = useInv();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: inv.t400 }}>{title}</Text>
        {hint ? <Text style={{ fontSize: 11, color: inv.t400 }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function InvoiceFilterSheet({ open, onClose, filters, onApply, range, dateFrom, dateTo, onRangeApply, counts = {} }: {
  open: boolean; onClose: () => void; filters: Filters; onApply: (f: Filters) => void; range: string; dateFrom: string; dateTo: string;
  onRangeApply: (k: string, f: string, t: string) => void; counts?: any;
}) {
  const inv = useInv();
  const [draft, setDraft] = useState<Filters>(filters);
  const [dRange, setDRange] = useState(range);
  const [dFrom, setDFrom] = useState(dateFrom);
  const [dTo, setDTo] = useState(dateTo);
  useEffect(() => { if (open) { setDraft(filters); setDRange(range); setDFrom(dateFrom); setDTo(dateTo); } }, [open, filters, range, dateFrom, dateTo]);

  const n = countFilters(draft) + (dRange !== "all" ? 1 : 0);
  const reset = () => { setDraft(EMPTY_FILTERS); setDRange("all"); setDFrom(""); setDTo(""); };
  const apply = () => { onApply(draft); onRangeApply(dRange, dFrom, dTo); onClose(); };
  const amountErr = !!(draft.minAmount && draft.maxAmount && Number(draft.minAmount) > Number(draft.maxAmount));
  const input = { height: 44, borderRadius: 10, borderWidth: 1, borderColor: inv.border2, backgroundColor: inv.surface, color: inv.t900, fontSize: 14, paddingHorizontal: 12 };
  const lbl = { fontSize: 10.5, fontWeight: "700" as const, letterSpacing: 0.8, textTransform: "uppercase" as const, color: inv.t400, marginBottom: 4 };

  return (
    <FullSheet open={open} onClose={onClose} title="Filters" subtitle={n ? `${n} filter${n > 1 ? "s" : ""} applied` : "Refine your invoice list"} testID="invoice-filter-drawer"
      footer={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <OutlineBtn testID="invoice-filter-reset" onPress={reset} height={48} icon={<RotateCcw size={16} color={inv.t700} />} label="Reset Filters" />
          <OutlineBtn testID="invoice-filter-apply" onPress={apply} disabled={amountErr} height={48} flex={1.4} primary label={`Apply Filters${n ? ` (${n})` : ""}`} />
        </View>
      }>
      <View style={{ gap: 24 }}>
        <Section title="Date Range">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {DATE_PRESETS.map(([k, l]) => <Chip key={k} on={dRange === k} onPress={() => setDRange(k)} testID={`filter-range-${k}`} icon={dRange === k ? <Check size={14} color="#fff" /> : undefined}>{l}</Chip>)}
          </View>
          {dRange === "custom" ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><Text style={lbl}>From</Text><WDatePicker testID="filter-date-from" value={dFrom} onChange={setDFrom} placeholder="From" /></View>
              <View style={{ flex: 1 }}><Text style={lbl}>To</Text><WDatePicker testID="filter-date-to" value={dTo} min={dFrom || undefined} onChange={setDTo} placeholder="To" /></View>
            </View>
          ) : null}
        </Section>

        <Section title="Invoice Type" hint={draft.types.length ? `${draft.types.length} selected` : "Any"}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {TYPE_OPTIONS.map((t) => { const on = draft.types.includes(t); return (
              <Chip key={t} on={on} onPress={() => setDraft((d) => ({ ...d, types: toggle(d.types, t) }))} testID={`filter-type-${t}`} count={counts.type_counts?.[t]} icon={on ? <Check size={14} color="#fff" /> : undefined}>{typeMeta(t).label}</Chip>
            ); })}
          </View>
        </Section>

        <Section title="Payment Status" hint={draft.statuses.length ? `${draft.statuses.length} selected` : "Any"}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {STATUS_OPTIONS.map((s) => { const on = draft.statuses.includes(s); const Ico = STATUS_ICON[s]; return (
              <Chip key={s} on={on} onPress={() => setDraft((d) => ({ ...d, statuses: toggle(d.statuses, s) }))} testID={`filter-status-${s}`} count={counts.status_counts?.[s]}
                icon={<View style={{ flexDirection: "row", gap: 4 }}>{on ? <Check size={14} color="#fff" /> : null}<Ico size={14} color={on ? "#fff" : inv.t700} /></View>}>{statusMeta(s).label}</Chip>
            ); })}
          </View>
        </Section>

        <Section title="Amount Range">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, position: "relative", justifyContent: "center" }}><Text style={{ position: "absolute", left: 12, color: inv.t400, fontSize: 14, zIndex: 1 }}>₹</Text>
              <TextInput testID="invoice-min-amount" keyboardType="decimal-pad" value={draft.minAmount} onChangeText={(v) => setDraft((d) => ({ ...d, minAmount: v }))} placeholder="Minimum" placeholderTextColor={inv.t400} style={{ ...input, paddingLeft: 28 }} /></View>
            <View style={{ flex: 1, position: "relative", justifyContent: "center" }}><Text style={{ position: "absolute", left: 12, color: inv.t400, fontSize: 14, zIndex: 1 }}>₹</Text>
              <TextInput testID="invoice-max-amount" keyboardType="decimal-pad" value={draft.maxAmount} onChangeText={(v) => setDraft((d) => ({ ...d, maxAmount: v }))} placeholder="Maximum" placeholderTextColor={inv.t400} style={{ ...input, paddingLeft: 28 }} /></View>
          </View>
          {amountErr ? <Text testID="invoice-amount-error" style={{ fontSize: 11, color: inv.rose, marginTop: 6 }}>Minimum amount cannot exceed maximum amount.</Text> : null}
        </Section>

        <Section title="Customer">
          <TextInput testID="invoice-customer-filter" value={draft.customer} onChangeText={(v) => setDraft((d) => ({ ...d, customer: v }))} placeholder="Customer name or mobile" placeholderTextColor={inv.t400} style={input} />
        </Section>

        <Section title="Booking Reference">
          <TextInput testID="invoice-booking-filter" value={draft.booking} onChangeText={(v) => setDraft((d) => ({ ...d, booking: v.toUpperCase() }))} autoCapitalize="characters" placeholder="e.g. AZOFAE448" placeholderTextColor={inv.t400} style={{ ...input, fontFamily: "monospace" }} />
        </Section>
      </View>
    </FullSheet>
  );
}
