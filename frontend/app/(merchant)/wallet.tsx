import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, TextInput, Platform, KeyboardAvoidingView } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { AppShellHeader } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { SLATE } from "@/src/components/qr/qrKit";
import {
  useFin, KpiCard, Surface, SegTabs, DetailDrawer, KV, Timeline, EmptyState, RowsSkeleton, Paginator, StatusBadge,
  PremiumSelect, FBtn, Sk, LockedCard, money, shortDate, EMERALD, ROSE, AMBER, TAB,
} from "@/src/components/merchant/FinanceKit";

/* 1:1 port of web_panel/src/pages/merchant/finance/WalletModule.jsx (mobile view). */
const PANEL = "/merchant/panel";
const monthKey = (s?: string) => (s || "").slice(0, 7);
const wdId = (id?: string) => "WD-" + (id || "").slice(0, 6).toUpperCase();
type Tab = "overview" | "transactions" | "withdrawals";

export default function MerchantWallet() {
  const F = useFin();
  const { P, dark, colors, heading, muted, strong, link } = F;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const shopName = user?.shop_name || user?.name || "My Shop";

  const [tab, setTab] = useState<Tab>("overview");
  const [txf, setTxf] = useState({ q: "", direction: "", page: 1, page_size: 10 });
  const [detail, setDetail] = useState<any>(null);
  const [wdDetail, setWdDetail] = useState<any>(null);
  const [flow, setFlow] = useState(false);

  const accessQ = useQuery({ queryKey: ["m-panel-access"], queryFn: () => api.get<any>(`${PANEL}/access`) });
  const approved = !!(accessQ.data?.approved || user?.kyc_status === "approved");
  const ovQ = useQuery({ queryKey: ["m-wallet-overview"], queryFn: () => api.get<any>(`${PANEL}/wallet/overview`), enabled: approved });
  const wdsQ = useQuery({ queryKey: ["m-wallet-withdrawals"], queryFn: () => api.get<any[]>(`${PANEL}/wallet/withdrawals`), enabled: approved });
  const txQ = useQuery({
    queryKey: ["m-wallet-tx", txf],
    queryFn: () => api.get<any>(`${PANEL}/wallet/transactions?q=${encodeURIComponent(txf.q)}&direction=${txf.direction}&page=${txf.page}&page_size=${txf.page_size}`),
    enabled: approved && tab === "transactions",
  });
  // web: any filter change resets to page 1
  const patchTx = (p: Partial<typeof txf>) => setTxf((f) => ({ ...f, ...p, page: p.page ?? 1 }));

  const ov = ovQ.data;
  const s = ov?.summary || {};
  const cfg = ov?.config || {};
  const fin = ov?.finance || { eligible: false, blockers: [], banks: [], primary_bank: null };
  const eligible = !!fin.eligible;
  const wds: any[] = wdsQ.data || [];
  const tx = txQ.data || { items: [], total: 0, page: 1, pages: 1 };

  const trend = useMemo(() => {
    const led: any[] = s.ledger || [];
    if (!led.length) return null;
    const now = new Date(); const cur = monthKey(now.toISOString());
    const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
    let c = 0, p = 0;
    led.forEach((l) => { if (l.direction !== "credit") return; const m = monthKey(l.created_at); if (m === cur) c += l.amount; else if (m === prev) p += l.amount; });
    if (!p) return c > 0 ? 100 : null;
    return Math.round(((c - p) / p) * 100);
  }, [s.ledger]);

  const gotoKyc = () => router.push("/merchant/bankkyc");
  const startWithdraw = () => { if (!eligible) { gotoKyc(); toast.info("Complete Bank & KYC verification first"); } else setFlow(true); };
  const recentTx: any[] = (s.ledger || []).slice(0, 6);
  const load = () => { qc.invalidateQueries({ queryKey: ["m-wallet-overview"] }); qc.invalidateQueries({ queryKey: ["m-wallet-withdrawals"] }); if (tab === "transactions") txQ.refetch(); };

  const sectionTitle = (icon: any, title: string, onAll: () => void, testID: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={16} color={P[600]} />
        <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "700", color: heading }}>{title}</Text>
      </View>
      <Pressable testID={testID} onPress={onAll} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color: link }}>View all</Text>
        <Icon name="arrow-right" size={12} color={link} />
      </Pressable>
    </View>
  );

  const withdrawBtn = <FBtn label="Withdraw Money" onPress={startWithdraw} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={!!ov && ovQ.isFetching} onRefresh={load} tintColor={P[700]} colors={[P[700]]} />}
        testID="wallet-module"
      >
        {/* Page header (MerchantDashboard.jsx) */}
        <View style={{ marginBottom: 16 }}>
          <Text testID="merchant-wallet-header" style={{ fontSize: 20, lineHeight: 28, fontWeight: "800", color: heading }} numberOfLines={1}>Wallet & Withdraw</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <Icon name="store" size={14} color={P[700]} />
            <Text style={{ fontSize: 12, lineHeight: 16, color: muted }} numberOfLines={1}>{shopName}</Text>
          </View>
        </View>

        {accessQ.isLoading || (approved && !ov && !ovQ.isError) ? (
          <View style={{ gap: 20 }}>
            <Surface style={{ padding: 24 }}><Sk style={{ height: 160, borderRadius: 12 }} /></Surface>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {[0, 1, 2].map((i) => <Surface key={i} style={{ flex: 1, padding: 20 }}><Sk style={{ height: 40, width: 40, borderRadius: 12 }} /><Sk style={{ height: 12, width: 80, marginTop: 16 }} /><Sk style={{ height: 24, width: 96, marginTop: 8 }} /></Surface>)}
            </View>
          </View>
        ) : !approved ? (
          <LockedCard completion={accessQ.data?.completion ?? 0} status={accessQ.data?.status} onGo={() => router.push("/merchant/profilekyc")} />
        ) : ovQ.isError ? (
          <Surface><EmptyState icon="alert-circle-outline" title="Could not load wallet" hint={(ovQ.error as any)?.detail || "Please try again."} action={<FBtn label="Retry" onPress={load} />} /></Surface>
        ) : (
          <View style={{ gap: 20 }}>
            {/* HERO */}
            <LinearGradient colors={["#0D47A1", "#0f52ba", "#0a2e6b"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24, overflow: "hidden", boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.1), 0px 8px 10px -6px rgba(0,0,0,0.1)" }} testID="wallet-hero">
              <View style={{ position: "absolute", right: -64, top: -64, height: 224, width: 224, borderRadius: 112, backgroundColor: "rgba(255,255,255,0.1)" }} />
              <View style={{ position: "absolute", right: 40, bottom: -40, height: 128, width: 128, borderRadius: 64, backgroundColor: "rgba(125,211,252,0.1)" }} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="wallet-outline" size={16} color={P[100]} />
                <Text style={{ fontSize: 11, lineHeight: 14, textTransform: "uppercase", letterSpacing: 2.2, fontWeight: "600", color: P[100] }}>Available Balance</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                <Text testID="wallet-balance" style={{ fontSize: 36, lineHeight: 40, fontWeight: "800", color: "#fff", ...TAB }}>{money(s.available_balance)}</Text>
                {trend != null ? (
                  <View style={{ marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: trend >= 0 ? "rgba(52,211,153,0.2)" : "rgba(251,113,133,0.2)" }}>
                    <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: trend >= 0 ? EMERALD[100] : "#fecdd3" }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% <Text style={{ fontWeight: "400", opacity: 0.8 }}>this month</Text></Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
                {([["Withdrawable", s.withdrawable_balance], ["Pending", s.pending_balance], ["Withdrawn", s.total_withdrawn]] as [string, any][]).map(([k, v]) => (
                  <View key={k} style={{ flex: 1, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 10, lineHeight: 14, textTransform: "uppercase", letterSpacing: 0.25, color: P[100] }} numberOfLines={1}>{k}</Text>
                    <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: "#fff", marginTop: 2, ...TAB }} numberOfLines={1} adjustsFontSizeToFit>{money(v)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ gap: 12, marginTop: 24 }}>
                <FBtn testID="withdraw-btn" label="Withdraw Money" icon="cash" variant="white" size="lg" onPress={startWithdraw} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="shield-check-outline" size={16} color={P[100]} />
                  <Text style={{ fontSize: 12, lineHeight: 16, color: P[100] }}>Secured payouts to your verified bank account</Text>
                </View>
              </View>
            </LinearGradient>

            {/* KYC blocker */}
            {!eligible ? (
              <Surface testID="wallet-kyc-blocker" style={{ padding: 16, borderColor: dark ? "rgba(120,53,15,0.5)" : AMBER[200], backgroundColor: dark ? AMBER[950] : "rgba(255,251,235,0.6)" }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: dark ? AMBER[900] : AMBER[100], alignItems: "center", justifyContent: "center" }}><Icon name="alert-outline" size={20} color={AMBER[600]} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "600", color: strong }}>Complete Bank & KYC to withdraw</Text>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: dark ? "rgba(252,211,77,0.9)" : AMBER[700], marginTop: 2 }}>Pending: {(fin.blockers || []).join(", ") || "verification"}</Text>
                  </View>
                </View>
                <FBtn testID="wallet-complete-kyc" label="Complete Bank & KYC" onPress={gotoKyc} style={{ marginTop: 12 }} />
              </Surface>
            ) : null}

            {/* KPI grid (grid-cols-2 on mobile) */}
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}><KpiCard icon="trending-up" tone="emerald" label="Total Earned" value={money(s.total_earned)} sub="Lifetime earnings" trend={trend} testID="kpi-total-earned" /></View>
                <View style={{ flex: 1 }}><KpiCard icon="wallet-outline" tone="primary" label="Commission" value={money((s.total_referral || 0) + (s.total_customer || 0))} sub="Referral + booking" testID="kpi-commission" /></View>
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}><KpiCard icon="clock-outline" tone="amber" label="Processing" value={money(s.pending_balance)} sub="Locked in withdrawals" testID="kpi-processing" /></View>
                <View style={{ flex: 1 }} />
              </View>
            </View>

            <SegTabs tabs={["overview", "transactions", "withdrawals"] as Tab[]} value={tab} onChange={setTab} testidPrefix="wallet-tab" />

            {/* OVERVIEW */}
            {tab === "overview" ? (
              <View style={{ gap: 16 }}>
                <Surface style={{ padding: 20 }}>
                  {sectionTitle("receipt-text-outline", "Recent Activity", () => setTab("transactions"), "wallet-view-all-tx")}
                  {recentTx.length === 0 ? <EmptyState icon="receipt-text-outline" title="No activity yet" hint="Your wallet credits and debits will appear here." testID="wallet-overview-empty" /> : (
                    <View style={{ gap: 4 }}>{recentTx.map((t) => <TxRow key={t.id} t={t} onOpen={() => setDetail(t)} />)}</View>
                  )}
                </Surface>
                <Surface style={{ padding: 20 }}>
                  {sectionTitle("cash", "Recent Withdrawals", () => setTab("withdrawals"), "wallet-view-all-wd")}
                  {wds.length === 0 ? <EmptyState icon="cash" title="No withdrawals yet" hint="Withdraw your earnings to your verified bank account." action={withdrawBtn} testID="wallet-wd-empty" /> : (
                    <View style={{ gap: 8 }}>{wds.slice(0, 5).map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</View>
                  )}
                </Surface>
              </View>
            ) : null}

            {/* TRANSACTIONS */}
            {tab === "transactions" ? (
              <Surface style={{ padding: 16 }}>
                <View style={{ gap: 8, marginBottom: 16 }}>
                  <View style={{ position: "relative" }}>
                    <View style={{ position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}><Icon name="magnify" size={16} color={SLATE[400]} /></View>
                    <TextInput testID="wallet-tx-search" value={txf.q} onChangeText={(q) => patchTx({ q })} placeholder="Search description, reference…" placeholderTextColor={SLATE[400]}
                      style={{ height: 44, borderRadius: 6, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], backgroundColor: F.card, paddingLeft: 36, paddingRight: 12, fontSize: 14, color: heading }} />
                  </View>
                  <PremiumSelect testID="wallet-tx-direction" value={txf.direction} onChange={(direction) => patchTx({ direction })} height={44} radius={12} placeholder="All types"
                    options={[{ value: "", label: "All types" }, { value: "credit", label: "Credit" }, { value: "debit", label: "Debit" }]} />
                </View>
                {txQ.isLoading || (txQ.isFetching && !txQ.data) ? <RowsSkeleton /> : (tx.items || []).length === 0 ? (
                  <EmptyState icon="receipt-text-outline" title="No transactions found" hint="Try adjusting your search or filters." testID="wallet-tx-empty" />
                ) : (
                  <>
                    <View style={{ gap: 8 }}>{tx.items.map((t: any) => <TxRow key={t.id} t={t} onOpen={() => setDetail(t)} card />)}</View>
                    <Paginator page={tx.page || 1} pages={tx.pages || 1} total={tx.total || 0} pageSize={txf.page_size} onPage={(p) => patchTx({ page: p })} onPageSize={(n) => patchTx({ page_size: n })} />
                  </>
                )}
              </Surface>
            ) : null}

            {/* WITHDRAWALS */}
            {tab === "withdrawals" ? (
              <Surface style={{ padding: 16 }} testID="withdrawal-history">
                {wds.length === 0 ? <EmptyState icon="cash" title="No withdrawals yet" hint="Your withdrawal history will appear here." action={withdrawBtn} testID="wallet-wd-empty2" /> : (
                  <View style={{ gap: 8 }}>{wds.map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</View>
                )}
              </Surface>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Transaction detail drawer */}
      <DetailDrawer open={!!detail} onClose={() => setDetail(null)} title="Transaction details" subtitle={detail?.note} testID="wallet-tx-drawer">
        {detail ? (
          <View style={{ gap: 20 }}>
            <View style={{ borderRadius: 16, padding: 16, alignItems: "center", backgroundColor: detail.direction === "credit" ? (dark ? "rgba(2,44,34,0.3)" : EMERALD[50]) : (dark ? "rgba(76,5,25,0.3)" : ROSE[50]) }}>
              <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "800", color: detail.direction === "credit" ? EMERALD[600] : ROSE[500], ...TAB }}>{detail.direction === "credit" ? "+" : "−"}{money(detail.amount)}</Text>
              <View style={{ marginTop: 8 }}><StatusBadge status={detail.status} /></View>
            </View>
            <View>
              <KV k="Reference ID" v={detail.ref_id || (detail.id || "").slice(0, 10).toUpperCase()} mono />
              <KV k="Date" v={shortDate(detail.created_at)} />
              <KV k="Type" v={detail.kind} transform="capitalize" />
              <KV k="Direction" v={detail.direction} transform="capitalize" />
              <KV k="Amount" v={money(detail.amount)} strong />
              <KV k="Balance after" v={detail.balance != null ? money(detail.balance) : "—"} />
            </View>
          </View>
        ) : null}
      </DetailDrawer>

      {/* Withdrawal detail drawer */}
      <DetailDrawer open={!!wdDetail} onClose={() => setWdDetail(null)} title="Withdrawal details" subtitle={wdDetail ? wdId(wdDetail.id) : ""} testID="wallet-wd-drawer">
        {wdDetail ? (
          <View style={{ gap: 20 }}>
            <View style={{ borderRadius: 16, padding: 16, alignItems: "center", backgroundColor: dark ? "rgba(13,71,161,0.2)" : P[50] }}>
              <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "800", color: dark ? P[300] : P[700], ...TAB }}>{money(wdDetail.amount)}</Text>
              <View style={{ marginTop: 8 }}><StatusBadge status={wdDetail.status} /></View>
            </View>
            <View>
              <KV k="Withdrawal ID" v={wdId(wdDetail.id)} mono />
              <KV k="Requested" v={shortDate(wdDetail.requested_at)} />
              <KV k="Method" v={wdDetail.method} transform="uppercase" />
              <KV k="Bank" v={wdDetail.bank?.bank_name || (wdDetail.method === "upi" ? wdDetail.upi_id : "—")} />
              {wdDetail.bank?.account_number ? <KV k="Account" v={"••••" + String(wdDetail.bank.account_number).slice(-4)} mono /> : null}
              <KV k="Amount" v={money(wdDetail.amount)} />
              <KV k="Processing fee" v={"−" + money(wdDetail.fee || 0)} />
              <KV k="Net payable" v={money(wdDetail.net_amount ?? wdDetail.amount)} strong />
              {wdDetail.status === "rejected" && wdDetail.reason ? <KV k="Reason" v={wdDetail.reason} color={ROSE[500]} /> : null}
            </View>
            <View>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, color: SLATE[400], marginBottom: 12 }}>Timeline</Text>
              <Timeline steps={[
                { title: "Request submitted", time: shortDate(wdDetail.requested_at), done: true },
                { title: "Under review", done: wdDetail.status !== "pending", active: wdDetail.status === "pending" },
                { title: wdDetail.status === "rejected" ? "Rejected" : "Completed", time: wdDetail.processed_at ? shortDate(wdDetail.processed_at) : "", done: wdDetail.status === "completed" || wdDetail.status === "rejected" },
              ]} />
            </View>
          </View>
        ) : null}
      </DetailDrawer>

      {flow ? <WithdrawFlow ov={ov} cfg={cfg} fin={fin} onClose={() => setFlow(false)} onDone={() => { setFlow(false); load(); setTab("withdrawals"); }} /> : null}
    </View>
  );
}

/* web MerchantDashboard lockedCard — shared in FinanceKit.LockedCard */

function TxRow({ t, onOpen, card }: { t: any; onOpen: () => void; card?: boolean }) {
  const { dark, strong, hairline } = useFin();
  const credit = t.direction === "credit";
  return (
    <Pressable testID={`wallet-tx-item-${t.id}`} onPress={onOpen}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 10, borderWidth: card ? 1 : 0, borderColor: hairline, backgroundColor: pressed ? (dark ? "rgba(30,41,59,0.5)" : "#f8fafc") : "transparent" })}>
      <View style={{ height: 36, width: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: credit ? (dark ? EMERALD[950] : EMERALD[50]) : (dark ? ROSE[950] : ROSE[50]) }}>
        <Icon name={credit ? "arrow-bottom-right" : "arrow-top-right"} size={16} color={credit ? EMERALD[600] : ROSE[500]} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: strong }} numberOfLines={1}>{t.note}</Text>
        <Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400], marginTop: 1 }} numberOfLines={1}>{shortDate(t.created_at)} · <Text style={{ textTransform: "capitalize" }}>{t.status}</Text></Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: credit ? EMERALD[600] : ROSE[500], ...TAB }}>{credit ? "+" : "−"}{money(t.amount)}</Text>
    </Pressable>
  );
}

function WdRow({ w, onOpen }: { w: any; onOpen: () => void }) {
  const { dark, strong, hairline, P, heading } = useFin();
  return (
    <Pressable testID={`wd-item-${w.id}`} onPress={onOpen}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: hairline, padding: 12, backgroundColor: pressed ? (dark ? "rgba(30,41,59,0.5)" : "#f8fafc") : "transparent" })}>
      <View style={{ height: 36, width: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: dark ? "rgba(13,71,161,0.3)" : P[50] }}><Icon name="cash" size={16} color={P[700]} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: strong }}>{wdId(w.id)}</Text>
        <Text style={{ fontSize: 11, lineHeight: 14, color: SLATE[400], marginTop: 1 }}>{shortDate(w.requested_at)} · {(w.method || "").toUpperCase()}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: heading, ...TAB }}>{money(w.amount)}</Text>
        <View style={{ marginTop: 4 }}><StatusBadge status={w.status} /></View>
      </View>
    </Pressable>
  );
}

/* ── multi-step withdraw ── */
function WithdrawFlow({ ov, cfg, fin, onClose, onDone }: { ov: any; cfg: any; fin: any; onClose: () => void; onDone: () => void }) {
  const { P, dark, card, heading, muted, strong, well, primarySubtle, primaryText } = useFin();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const s = ov?.summary || {};
  const banks: any[] = (fin.banks || []).filter((b: any) => b.status === "approved");
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState(fin.primary_bank?.id || banks[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const amt = Number(amount) || 0;
  const min = cfg.min_withdrawal || 100, max = cfg.max_withdrawal || 50000;
  const maxAllowed = Math.min(max, s.withdrawable_balance || 0);
  const fee = Math.round((amt * (cfg.processing_fee_pct || 0) / 100 + (cfg.processing_fee_flat || 0)) * 100) / 100;
  const net = Math.max(0, amt - fee);
  const bank = banks.find((b) => b.id === bankId) || fin.primary_bank || {};
  const masked = bank.account_number ? "••••" + String(bank.account_number).slice(-4) : "";
  const amtError = amt > 0 && amt < min ? `Minimum ₹${min}` : amt > maxAllowed ? `Max ${money(maxAllowed)}` : "";

  const submit = async () => {
    setBusy(true);
    try {
      const data = await api.post<any>(`${PANEL}/withdraw`, { amount: amt, method: "bank", bank });
      setResult(data); setStep(5); toast.success("Withdrawal request submitted");
    } catch (e: any) { toast.error(e?.detail || "Withdrawal failed"); } finally { setBusy(false); }
  };

  const h3 = { fontSize: 20, lineHeight: 28, fontWeight: "700" as const, color: heading };
  const sub = { fontSize: 14, lineHeight: 20, color: muted, marginTop: 4 };
  const row = { flexDirection: "row" as const, gap: 8, marginTop: 24 };
  const outline = { flex: 1, height: 44 };
  const primary = { flex: 1, height: 44 };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" }} testID="withdraw-flow">
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ maxHeight: "92%", backgroundColor: card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: dark ? SLATE[800] : SLATE[200], boxShadow: "0px -20px 50px rgba(15,23,42,0.25)" }}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }}>
            {step < 5 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 }}>
                {[1, 2, 3, 4].map((n) => <View key={n} style={{ height: 6, borderRadius: 3, width: n === step ? 24 : 12, backgroundColor: n === step ? P[600] : n < step ? P[400] : (dark ? SLATE[700] : SLATE[200]) }} />)}
              </View>
            ) : null}

            {step === 1 ? (
              <View>
                <Text style={h3}>Enter amount</Text>
                <Text style={sub}>Available {money(s.withdrawable_balance)} · Min {money(min)} · Max {money(max)}</Text>
                <View style={{ marginTop: 16, position: "relative" }}>
                  <View style={{ position: "absolute", left: 16, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}><Text style={{ fontSize: 24, lineHeight: 32, fontWeight: "700", color: SLATE[400] }}>₹</Text></View>
                  <TextInput testID="withdraw-amount" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))} placeholder="0" placeholderTextColor={SLATE[400]} keyboardType="numeric" autoFocus
                    style={{ height: 64, borderRadius: 6, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], backgroundColor: card, paddingLeft: 40, paddingRight: 12, fontSize: 30, fontWeight: "800", color: heading }} />
                </View>
                {amtError ? <Text testID="withdraw-amount-error" style={{ fontSize: 12, lineHeight: 16, color: ROSE[500], marginTop: 6 }}>{amtError}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                  {[500, 1000, 2000, 5000].map((q) => (
                    <Pressable key={q} disabled={q > maxAllowed} testID={`withdraw-quick-${q}`} onPress={() => setAmount(String(q))} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center", opacity: q > maxAllowed ? 0.4 : 1 }}>
                      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color: dark ? SLATE[300] : SLATE[600] }}>₹{q >= 1000 ? q / 1000 + "k" : q}</Text>
                    </Pressable>
                  ))}
                  <Pressable testID="withdraw-quick-max" onPress={() => setAmount(String(Math.floor(maxAllowed)))} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: P[200], backgroundColor: primarySubtle, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: primaryText }}>Max</Text>
                  </Pressable>
                </View>
                <View style={row}>
                  <FBtn label="Cancel" variant="outline" onPress={onClose} style={outline} testID="withdraw-cancel" />
                  <FBtn label="Continue" disabled={!amt || !!amtError} onPress={() => setStep(2)} style={primary} testID="withdraw-next-1" />
                </View>
              </View>
            ) : null}

            {step === 2 ? (
              <View>
                <Text style={h3}>Select bank account</Text>
                <Text style={sub}>Money will be sent to your verified account.</Text>
                <View style={{ gap: 8, marginTop: 16 }}>
                  {banks.map((b) => {
                    const on = bankId === b.id;
                    return (
                      <Pressable key={b.id} testID={`withdraw-bank-${b.id}`} onPress={() => setBankId(b.id)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? P[500] : (dark ? SLATE[700] : SLATE[200]), padding: on ? 13 : 14, backgroundColor: on ? (dark ? "rgba(13,71,161,0.2)" : `${P[50]}80`) : "transparent", boxShadow: on ? `0px 0px 0px 2px ${dark ? "rgba(13,71,161,0.4)" : P[100]}` : undefined }}>
                        <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="bank-outline" size={20} color={P[700]} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: "600", color: strong, flexShrink: 1 }} numberOfLines={1}>{b.bank_name}</Text>
                            {b.is_primary ? <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: dark ? "rgba(13,71,161,0.5)" : P[100] }}><Text style={{ fontSize: 9, lineHeight: 12, color: primaryText }}>PRIMARY</Text></View> : null}
                          </View>
                          <Text style={{ fontSize: 12, lineHeight: 16, color: muted }}>••••{String(b.account_number).slice(-4)} · {b.ifsc}</Text>
                        </View>
                        {on ? <Icon name="check-circle" size={20} color={P[600]} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={row}>
                  <FBtn label="Back" variant="outline" onPress={() => setStep(1)} style={outline} testID="withdraw-back-2" />
                  <FBtn label="Review" disabled={!bankId} onPress={() => setStep(3)} style={primary} testID="withdraw-next-2" />
                </View>
              </View>
            ) : null}

            {step === 3 ? (
              <View>
                <Text style={h3}>Review withdrawal</Text>
                <View style={{ borderRadius: 16, backgroundColor: well, padding: 16, marginTop: 16 }}>
                  <KV k="Withdrawal amount" v={money(amt)} />
                  <KV k="Processing fee" v={"−" + money(fee)} />
                  <KV k="Net amount" v={money(net)} strong />
                  <KV k="Bank account" v={`${bank.bank_name || "—"} ${masked}`} />
                  <KV k="Expected processing" v="1–2 business days" />
                </View>
                <View style={row}>
                  <FBtn label="Back" variant="outline" onPress={() => setStep(2)} style={outline} testID="withdraw-back-3" />
                  <FBtn label="Confirm" onPress={() => setStep(4)} style={primary} testID="withdraw-next-3" />
                </View>
              </View>
            ) : null}

            {step === 4 ? (
              <View style={{ alignItems: "center" }}>
                <View style={{ height: 56, width: 56, borderRadius: 16, backgroundColor: primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="shield-check-outline" size={28} color={P[700]} /></View>
                <Text style={{ ...h3, marginTop: 16 }}>Confirm withdrawal</Text>
                <Text style={{ ...sub, textAlign: "center" }}>You are about to withdraw <Text style={{ fontWeight: "700", color: strong }}>{money(amt)}</Text> to {bank.bank_name} {masked}. This can&apos;t be undone once submitted.</Text>
                <View style={{ ...row, alignSelf: "stretch" }}>
                  <FBtn label="Back" variant="outline" onPress={() => setStep(3)} style={outline} testID="withdraw-back-4" />
                  <FBtn label={busy ? "Submitting…" : "Confirm & Submit"} disabled={busy} onPress={submit} style={primary} testID="withdraw-submit" />
                </View>
              </View>
            ) : null}

            {step === 5 && result ? (
              <View style={{ alignItems: "center", paddingVertical: 8 }} testID="withdraw-success">
                <View style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: dark ? EMERALD[950] : EMERALD[50], alignItems: "center", justifyContent: "center" }}><Icon name="check-circle-outline" size={36} color={EMERALD[600]} /></View>
                <Text style={{ ...h3, marginTop: 16 }}>Withdrawal submitted!</Text>
                <Text style={sub}>Your request is now pending approval.</Text>
                <View style={{ borderRadius: 16, backgroundColor: well, padding: 16, marginTop: 16, alignSelf: "stretch" }}>
                  <KV k="Withdrawal ID" v={wdId(result.id)} mono />
                  <KV k="Amount" v={money(result.amount)} strong />
                  <KV k="Bank" v={`${bank.bank_name || "—"} ${masked}`} />
                  <KV k="Expected arrival" v="1–2 business days" />
                </View>
                <FBtn label="Done" onPress={onDone} style={{ height: 44, alignSelf: "stretch", marginTop: 20 }} testID="withdraw-done" />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
