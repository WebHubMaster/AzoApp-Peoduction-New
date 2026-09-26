/** Wallet — 1:1 port of WalletView + WalletTopup (CustomerDashboard.jsx) + ScratchCardsPanel. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp, IndianRupee, Receipt, Wallet, Layers } from "lucide-react-native";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { useToast } from "../../src/components/Toast";
import { fmt, fmtC } from "../../src/lib/format";
import { runPayment } from "../../src/lib/payments";
import { PRIMARY, SLATE, EMERALD, ROSE, useTheme } from "../../src/theme";
import { StatTile, EmptyState, SearchInput, OptionMenu, DateRangePicker, Paginator, inDateRange, DateRange } from "../../src/components/customer/ux";
import { ScratchCardsPanel } from "../../src/components/customer/ScratchCards";

const TYPES = [{ value: "all", label: "All types" }, { value: "credit", label: "Credits" }, { value: "debit", label: "Debits" }];
const ALL_RANGE: DateRange = { preset: "All", from: null, to: null };
const PAGE_SIZE = 10;
const fmtTs = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function WalletTopup({ onDone, toast }: { onDone: () => void; toast: any }) {
  const [amt, setAmt] = useState<string>("500");
  const [busy, setBusy] = useState(false);
  const add = async () => { setBusy(true); try { const ok = await runPayment({ purpose: "wallet", amount: Number(amt) }, toast); if (ok) onDone(); } finally { setBusy(false); } };
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {[100, 250, 500, 1000].map((v) => { const on = Number(amt) === v; return <Pressable key={v} testID={`topup-preset-${v}`} onPress={() => setAmt(String(v))} style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: on ? "#fff" : "rgba(255,255,255,0.2)", justifyContent: "center", transform: [{ scale: pressed ? 0.96 : 1 }] })}><Text style={{ fontSize: 14, fontWeight: "700", color: on ? PRIMARY[700] : "#fff" }}>₹{v}</Text></Pressable>; })}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput testID="topup-amount" value={amt} onChangeText={(v) => setAmt(v.replace(/[^0-9]/g, ""))} keyboardType="numeric" placeholder="Amount" placeholderTextColor="rgba(255,255,255,0.6)" style={{ width: 112, height: 40, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", paddingHorizontal: 12, fontSize: 14, outlineStyle: "none" } as any} />
        <Pressable testID="topup-btn" disabled={busy || !Number(amt)} onPress={add} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", opacity: busy || !Number(amt) ? 0.6 : 1 }}><Text style={{ fontSize: 14, fontWeight: "700", color: PRIMARY[700] }}>{busy ? "Processing…" : "Add Money"}</Text></Pressable>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const { c, isDark } = useTheme();
  const { wallet, load: reload } = useCustomerData();
  const toast = useToast();
  const [type, setType] = useState("all"); const [q, setQ] = useState(""); const [range, setRange] = useState<DateRange>(ALL_RANGE); const [page, setPage] = useState(1);
  const txns: any[] = wallet?.transactions || [];
  useEffect(() => { setPage(1); }, [type, q, range]);
  const credits = txns.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const debits = txns.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return txns.filter((x) => (type === "all" || x.type === type) && inDateRange(x.created_at, range) && (!t || (x.note || "").toLowerCase().includes(t) || (x.kind || "").toLowerCase().includes(t)))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [txns, type, q, range]);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <View testID="wallet-page">
      <View style={{ marginBottom: 20 }}>
        <Text testID="page-title" style={{ fontSize: 24, fontWeight: "900", color: c.text, letterSpacing: -0.4 }}>Wallet</Text>
        <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Your AzoApp balance, top-ups and payments</Text>
      </View>
      <ScratchCardsPanel onClaimed={reload} toast={toast} />
      <View style={{ gap: 16, marginBottom: 20 }}>
        <LinearGradient colors={[PRIMARY[600], PRIMARY[800], "#1E7AD6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24, overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -24, bottom: -24, height: 128, width: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.1)" }} />
          <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Available Balance</Text>
          <Text testID="wallet-balance" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 36, fontWeight: "900", color: "#fff", marginTop: 6 }}>{fmtC(wallet?.balance || 0)}</Text>
          <WalletTopup onDone={reload} toast={toast} />
        </LinearGradient>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="w-credits" label="Total Added" value={fmtC(credits)} icon={TrendingUp} tone="green" /><StatTile testID="w-debits" label="Total Spent" value={fmtC(debits)} icon={IndianRupee} tone="rose" /></View>
          <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="w-count" label="Transactions" value={txns.length} count icon={Receipt} tone="primary" /><StatTile testID="w-bal" label="Balance" value={fmtC(wallet?.balance || 0)} icon={Wallet} tone="amber" /></View>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search transactions…" testID="w-search" style={{ minWidth: 180 }} />
        <OptionMenu value={type} options={TYPES} onChange={setType} icon={Layers} title="Transaction type" testID="w-type" />
        <DateRangePicker value={range} onChange={setRange} testID="w-date" />
      </View>

      <Text style={{ fontSize: 18, fontWeight: "700", color: c.text, marginBottom: 12 }}>Transactions</Text>
      <View testID="txn-list" style={{ gap: 8 }}>
        {txns.length === 0 ? <EmptyState icon={Wallet} title="No transactions yet" desc="Add money or make a booking to see activity here." testID="wallet-empty" /> : null}
        {txns.length > 0 && filtered.length === 0 ? <EmptyState icon={Wallet} title="No transactions match" desc="Adjust your filters." testID="wallet-nomatch" /> : null}
        {paged.map((t, i) => {
          const credit = t.type === "credit";
          return (
            <View key={t.id || i} testID={`txn-${t.id || i}`} style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                <View style={{ height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: credit ? (isDark ? "rgba(6,78,59,0.3)" : EMERALD[50]) : (isDark ? "rgba(136,19,55,0.3)" : ROSE[50]) }}>{credit ? <TrendingUp size={20} color={EMERALD[600]} /> : <IndianRupee size={20} color={ROSE[600]} />}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: c.text, textTransform: "capitalize" }}>{(t.kind || "").replace(/_/g, " ")}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: SLATE[400] }}>{t.note} · {fmtTs(t.created_at)}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: credit ? EMERALD[600] : (isDark ? SLATE[200] : SLATE[700]) }}>{credit ? "+" : "-"}{fmt(t.amount)}</Text>
            </View>
          );
        })}
      </View>
      <Paginator page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} testID="w-pager" />
    </View>
  );
}
