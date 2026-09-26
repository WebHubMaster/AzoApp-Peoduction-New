/** Wallet — port of WalletView + WalletTopup (CustomerDashboard.jsx): balance, top-up, stats, transactions. */
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp, IndianRupee, Receipt, Wallet, Search } from "lucide-react-native";
import { useCustomerData } from "../../src/context/CustomerDataContext";
import { useToast } from "../../src/components/Toast";
import { runPayment } from "../../src/lib/payments";
import { fmt, fmtC } from "../../src/lib/format";
import { PRIMARY, SLATE, EMERALD, ROSE } from "../../src/theme";
import { StatTile, EmptyState } from "../../src/components/customer/ux";

function WalletTopup({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [amt, setAmt] = useState("500");
  const [busy, setBusy] = useState(false);
  const add = async () => { setBusy(true); try { const ok = await runPayment({ purpose: "wallet", amount: Number(amt) }, toast); if (ok) onDone(); } finally { setBusy(false); } };
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {[100, 250, 500, 1000].map((v) => (
          <Pressable key={v} testID={`topup-preset-${v}`} onPress={() => setAmt(String(v))} style={{ height: 34, paddingHorizontal: 14, borderRadius: 10, backgroundColor: Number(amt) === v ? "#fff" : "rgba(255,255,255,0.2)", justifyContent: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: Number(amt) === v ? PRIMARY[700] : "#fff" }}>₹{v}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput testID="topup-amount" value={amt} onChangeText={(t) => setAmt(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="Amount" placeholderTextColor="rgba(255,255,255,0.6)" style={{ width: 110, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", color: "#fff", paddingHorizontal: 12, fontSize: 15, fontWeight: "700", outlineStyle: "none" } as any} />
        <Pressable testID="topup-btn" disabled={busy || !Number(amt)} onPress={add} style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", opacity: busy || !Number(amt) ? 0.6 : 1 }}>
          <Text style={{ color: PRIMARY[700], fontWeight: "800", fontSize: 15 }}>{busy ? "Processing…" : "Add Money"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
export default function WalletScreen() {
  const { wallet, load } = useCustomerData();
  const [type, setType] = useState<"all" | "credit" | "debit">("all");
  const [q, setQ] = useState("");
  const txns: any[] = wallet?.transactions || [];
  const credits = txns.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const debits = txns.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return txns.filter((x) => (type === "all" || x.type === type) && (!t || (x.note || "").toLowerCase().includes(t) || (x.kind || "").toLowerCase().includes(t)))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [txns, type, q]);

  const header = (
    <View>
      <Text testID="page-title" style={{ fontSize: 24, fontWeight: "900", color: SLATE[900], letterSpacing: -0.4 }}>Wallet</Text>
      <Text style={{ fontSize: 13, color: SLATE[500], marginTop: 2, marginBottom: 16 }}>Your AzoApp balance, top-ups and payments</Text>
      <LinearGradient colors={[PRIMARY[800], PRIMARY[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 22, overflow: "hidden" }}>
        <View style={{ position: "absolute", right: -24, bottom: -24, height: 128, width: 128, borderRadius: 64, backgroundColor: "rgba(255,255,255,0.1)" }} />
        <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>Available Balance</Text>
        <Text testID="wallet-balance" style={{ color: "#fff", fontSize: 38, fontWeight: "900", marginTop: 4, letterSpacing: -0.5 }}>{fmt(wallet?.balance || 0)}</Text>
        <WalletTopup onDone={load} />
      </LinearGradient>
      <View style={{ gap: 12, marginTop: 16 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <StatTile testID="w-credits" label="Total Added" value={fmtC(Math.round(credits))} icon={TrendingUp} tone="green" />
          <StatTile testID="w-debits" label="Total Spent" value={fmtC(Math.round(debits))} icon={IndianRupee} tone="rose" />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <StatTile testID="w-count" label="Transactions" value={txns.length} count icon={Receipt} tone="primary" />
          <StatTile testID="w-bal" label="Balance" value={fmtC(Math.round(wallet?.balance || 0))} icon={Wallet} tone="amber" />
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", height: 44, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", paddingHorizontal: 12, gap: 8, marginTop: 18 }}>
        <Search size={16} color={SLATE[400]} /><TextInput testID="w-search" value={q} onChangeText={setQ} placeholder="Search transactions…" placeholderTextColor={SLATE[400]} style={{ flex: 1, fontSize: 14, color: SLATE[800], height: 42, paddingVertical: 0, outlineStyle: "none" } as any} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
        {(["all", "credit", "debit"] as const).map((k) => (
          <Pressable key={k} testID={`w-type-${k}`} onPress={() => setType(k)} style={{ height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: type === k ? PRIMARY[700] : "#fff", borderWidth: 1, borderColor: type === k ? PRIMARY[700] : SLATE[200], justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: type === k ? "#fff" : SLATE[700] }}>{k === "all" ? "All types" : k === "credit" ? "Credits" : "Debits"}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={{ fontSize: 17, fontWeight: "800", color: SLATE[900], marginBottom: 10 }}>Transactions</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }} testID="wallet-page">
      <FlatList data={filtered} keyExtractor={(t: any, i) => t.id || String(i)} ListHeaderComponent={header} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} initialNumToRender={8}
        ListEmptyComponent={txns.length === 0 ? <EmptyState icon={Wallet} title="No transactions yet" desc="Add money or make a booking to see activity here." testID="wallet-empty" /> : <EmptyState icon={Wallet} title="No transactions match" desc="Adjust your filters." testID="wallet-nomatch" />}
        renderItem={({ item: t }) => {
          const credit = t.type === "credit";
          return (
            <View testID={`txn-${t.id}`} style={{ borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: credit ? EMERALD[50] : ROSE[50], alignItems: "center", justifyContent: "center" }}>{credit ? <TrendingUp size={18} color={EMERALD[600]} /> : <IndianRupee size={18} color={ROSE[600]} />}</View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: SLATE[800], textTransform: "capitalize" }}>{(t.kind || "").replace(/_/g, " ")}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: SLATE[400] }}>{t.note} · {new Date(t.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "800", color: credit ? EMERALD[600] : SLATE[700] }}>{credit ? "+" : "-"}{fmt(t.amount)}</Text>
            </View>
          );
        }} />
    </View>
  );
}
