/** Wallet — 1:1 port of WalletView + WalletTopup (CustomerDashboard.jsx) + ScratchCardsPanel. */
import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp, IndianRupee, Receipt, Wallet, Layers } from "lucide-react-native";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { useToast } from "../../src/components/Toast";
import { fmt, fmtC } from "../../src/lib/format";
import { runPayment } from "../../src/lib/payments";
import { PRIMARY, SLATE, EMERALD, ROSE, useTheme, TC } from "../../src/theme";
import { StatTile, StatSlider, CARD_W, EmptyState, SkeletonList, SearchInput, OptionMenu, DateRangePicker, LoadMoreFooter, useOnPullRefresh, DateRange } from "../../src/components/customer/ux";
import { api } from "../../src/api/client";
import { useServerList } from "../../src/lib/useServerList";

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
        {[100, 250, 500, 1000].map((v) => { const on = Number(amt) === v; return <Pressable key={v} testID={`topup-preset-${v}`} onPress={() => setAmt(String(v))} style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: 6, backgroundColor: on ? "#fff" : "rgba(255,255,255,0.2)", justifyContent: "center", transform: [{ scale: pressed ? 0.96 : 1 }] })}><Text style={{ fontSize: 14, fontWeight: "700", color: on ? PRIMARY[700] : TC.surface }}>₹{v}</Text></Pressable>; })}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput testID="topup-amount" value={amt} onChangeText={(v) => setAmt(v.replace(/[^0-9]/g, ""))} keyboardType="numeric" placeholder="Amount" placeholderTextColor="rgba(255,255,255,0.6)" style={{ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", paddingHorizontal: 12, fontSize: 14, outlineStyle: "none" } as any} />
        <Pressable testID="topup-btn" disabled={busy || !Number(amt)} onPress={add} style={{ flex: 1, height: 44, borderRadius: 6, backgroundColor: TC.surface, alignItems: "center", justifyContent: "center", opacity: busy || !Number(amt) ? 0.6 : 1 }}><Text style={{ fontSize: 14, fontWeight: "700", color: TC.primaryText }}>{busy ? "Processing…" : "Add Money"}</Text></Pressable>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const { c, isDark } = useTheme();
  const { wallet, load: reloadCtx } = useCustomerData();
  const toast = useToast();
  const [type, setType] = useState("all"); const [q, setQ] = useState(""); const [range, setRange] = useState<DateRange>(ALL_RANGE);
  // Server-side: 10 transactions per request, next page loads on scroll.
  const qs = new URLSearchParams({ type, search: q.trim(), page_size: String(PAGE_SIZE), ...(range.preset !== "All" && range.from ? { date_from: range.from.toISOString() } : {}), ...(range.preset !== "All" && range.to ? { date_to: range.to.toISOString() } : {}) }).toString();
  const list = useServerList<any>((pg) => api.get(`/wallet/transactions?${qs}&page=${pg}`, { timeoutMs: 60000 }), qs);
  const m: any = list.meta || {};
  const credits = Number(m.credits || 0); const debits = Number(m.debits || 0); const txCount = Number(m.count || 0);
  const paged = list.items;
  const reload = () => { reloadCtx(); list.refresh(true); };
  useOnPullRefresh(() => { reloadCtx(); return list.refresh(true); });

  return (
    <View testID="wallet-page">
      <View style={{ gap: 16, marginBottom: 20 }}>
        <LinearGradient colors={[PRIMARY[600], PRIMARY[800], "#1E7AD6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 6, padding: 24, overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -24, bottom: -24, height: 128, width: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.1)" }} />
          <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Available Balance</Text>
          <Text testID="wallet-balance" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 36, fontWeight: "900", color: "#fff", marginTop: 6 }}>{fmtC(wallet?.balance || 0)}</Text>
          <WalletTopup onDone={reload} toast={toast} />
        </LinearGradient>
        <View>
          <StatSlider testID="wallet-stats-slider">
            <View style={{ width: CARD_W }}><StatTile testID="w-credits" label="Total Added" value={fmtC(credits)} icon={TrendingUp} tone="green" /></View>
            <View style={{ width: CARD_W }}><StatTile testID="w-debits" label="Total Spent" value={fmtC(debits)} icon={IndianRupee} tone="rose" /></View>
            <View style={{ width: CARD_W }}><StatTile testID="w-count" label="Transactions" value={txCount} count icon={Receipt} tone="primary" /></View>
            <View style={{ width: CARD_W }}><StatTile testID="w-bal" label="Balance" value={fmtC(wallet?.balance || 0)} icon={Wallet} tone="amber" /></View>
          </StatSlider>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search transactions…" testID="w-search" style={{ flex: 1, minWidth: 120 }} />
        <OptionMenu value={type} options={TYPES} onChange={setType} icon={Layers} title="Transaction type" testID="w-type" />
        <DateRangePicker value={range} onChange={setRange} testID="w-date" />
      </View>

      <Text style={{ fontSize: 18, fontWeight: "700", color: c.text, marginBottom: 12 }}>Transactions</Text>
      <View testID="txn-list" style={{ gap: 8 }}>
        {list.loading ? <SkeletonList rows={3} /> : null}
        {!list.loading && list.error ? <EmptyState icon={Wallet} title="Couldn't load transactions" desc="Slow connection. Please try again." actionLabel="Retry" onAction={() => list.refresh()} testID="wallet-error" /> : null}
        {!list.loading && !list.error && txCount === 0 ? <EmptyState icon={Wallet} title="No transactions yet" desc="Add money or make a booking to see activity here." testID="wallet-empty" /> : null}
        {!list.loading && !list.error && txCount > 0 && list.total === 0 ? <EmptyState icon={Wallet} title="No transactions match" desc="Adjust your filters." testID="wallet-nomatch" /> : null}
        {list.loading ? null : paged.map((t: any, i: number) => {
          const credit = t.type === "credit";
          return (
            <View key={t.id || i} testID={`txn-${t.id || i}`} style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                <View style={{ height: 40, width: 40, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: credit ? (isDark ? "rgba(6,78,59,0.3)" : EMERALD[50]) : (isDark ? "rgba(136,19,55,0.3)" : ROSE[50]) }}>{credit ? <TrendingUp size={20} color={EMERALD[600]} /> : <IndianRupee size={20} color={ROSE[600]} />}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: c.text, textTransform: "capitalize" }}>{(t.kind || "").replace(/_/g, " ")}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: TC.textFaint }}>{t.note} · {fmtTs(t.created_at)}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: credit ? EMERALD[600] : (isDark ? SLATE[200] : SLATE[700]) }}>{credit ? "+" : "-"}{fmt(t.amount)}</Text>
            </View>
          );
        })}
      </View>
      {list.loading ? null : <LoadMoreFooter hasMore={list.hasMore} loading={list.more === "loading"} error={list.more === "error"} onLoadMore={list.loadMore} total={list.items.length} testID="w-load-more" />}
    </View>
  );
}
