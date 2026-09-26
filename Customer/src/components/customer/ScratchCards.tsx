/** Port of web_panel/src/components/growth/ScratchCardsPanel.jsx — carousel, View All grid, scratch modal (drag to reveal), claim → wallet. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, PanResponder } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Gift, Sparkles, Check, Clock, X, ArrowLeft } from "lucide-react-native";
import { api } from "../../api/client";
import { PRIMARY, SLATE, EMERALD, AMBER, useTheme } from "../../theme";

const fmt = (n: any) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function ScratchTile({ card, onOpen, width }: { card: any; onOpen: () => void; width: any }) {
  const { isDark } = useTheme();
  const claimed = card.status === "claimed"; const expired = card.status === "expired"; const available = card.status === "available";
  const inner = available ? <><Gift size={28} color="#fff" /><View><Text style={{ fontWeight: "700", color: "#fff", fontSize: 15 }}>Scratch to reveal 🎁</Text><Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>Booking {card.booking_code || ""}</Text></View></>
    : card.status === "scratched" ? <><Sparkles size={28} color="#fff" /><View><Text style={{ fontWeight: "700", color: "#fff", fontSize: 15 }}>{card.is_win ? fmt(card.reward_amount) : "No win"}</Text><Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>Tap to claim</Text></View></>
    : claimed ? <><View style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: EMERALD[500], alignItems: "center", justifyContent: "center" }}><Check size={16} color="#fff" /></View><View><Text style={{ fontWeight: "700", color: isDark ? EMERALD[300] : EMERALD[700], fontSize: 15 }}>{card.is_win ? `${fmt(card.reward_amount)} won` : "Better luck next"}</Text><Text style={{ fontSize: 11, color: EMERALD[600], marginTop: 2 }}>Claimed</Text></View></>
    : <><Clock size={28} color={SLATE[400]} /><Text style={{ fontWeight: "700", color: SLATE[500], fontSize: 15 }}>Expired</Text></>;
  const box = { width, aspectRatio: 4 / 5, borderRadius: 16, padding: 16, justifyContent: "space-between" as const, overflow: "hidden" as const };
  if (available || card.status === "scratched") {
    return <Pressable testID={`scratch-tile-${card.id}`} onPress={onOpen} style={({ pressed }) => ({ width, transform: [{ scale: pressed ? 0.95 : 1 }] })}><LinearGradient colors={[PRIMARY[500], PRIMARY[800]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ ...box, width: "100%" }}>{inner}</LinearGradient></Pressable>;
  }
  return <View testID={`scratch-tile-${card.id}`} style={{ ...box, backgroundColor: claimed ? (isDark ? "rgba(6,78,59,0.2)" : EMERALD[50]) : (isDark ? SLATE[800] : SLATE[100]), borderWidth: claimed ? 1 : 0, borderColor: EMERALD[200], opacity: expired ? 0.7 : 1 }}>{inner}</View>;
}

function ScratchModal({ card, onClose, onDone, toast }: { card: any; onClose: () => void; onDone: () => void; toast: any }) {
  const { c } = useTheme();
  const [revealed, setRevealed] = useState(card.status === "scratched");
  const [reward, setReward] = useState<any>(card.status === "scratched" ? card : null);
  const [progress, setProgress] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const revealing = useRef(false);
  const doReveal = useCallback(async () => {
    if (revealing.current) return; revealing.current = true;
    try { const d: any = await api.post(`/growth/scratch-cards/${card.id}/scratch`); if (d?.ok) { setReward(d.card); setRevealed(true); } else toast.error(d?.detail || "Could not reveal"); }
    catch (e: any) { toast.error(e?.message || "Could not reveal"); revealing.current = false; }
  }, [card.id, toast]);
  const moves = useRef(0);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: () => { moves.current += 1; const p = Math.min(1, moves.current / 45); setProgress(p); if (p >= 1) doReveal(); },
  })).current;
  const claim = async () => {
    setClaiming(true);
    try { const d: any = await api.post(`/growth/scratch-cards/${card.id}/claim`); if (d?.ok) { toast.success((d.credited || 0) > 0 ? `${fmt(d.credited)} added to your wallet 🎉` : "Reward claimed"); onDone(); } else toast.error(d?.detail || "Could not claim"); }
    catch (e: any) { toast.error(e?.message || "Could not claim"); }
    setClaiming(false);
  };
  const win = reward?.is_win ?? card.is_win; const amount = reward?.reward_amount ?? card.reward_amount;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Pressable style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} onPress={onClose} />
        <View testID="scratch-modal" style={{ width: "100%", maxWidth: 384, borderRadius: 24, backgroundColor: c.surface, padding: 24, alignItems: "center" }}>
          <Pressable testID="scratch-modal-close" onPress={onClose} style={{ position: "absolute", right: 12, top: 12, height: 36, width: 36, alignItems: "center", justifyContent: "center" }}><X size={20} color={SLATE[400]} /></Pressable>
          <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400] }}>Scratch Card</Text>
          <View style={{ marginTop: 16, width: "100%", maxWidth: 320, height: 200, borderRadius: 16, overflow: "hidden" }}>
            <LinearGradient colors={[PRIMARY[600], PRIMARY[800]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {win ? <><Text style={{ fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.85)" }}>You won</Text><Text style={{ fontSize: 48, fontWeight: "900", color: "#fff", marginTop: 4 }}>{fmt(amount)}</Text><Text style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>cashback</Text></>
                : <Text style={{ fontSize: 24, fontWeight: "900", color: "#fff", textAlign: "center" }}>Better luck{"\n"}next time!</Text>}
            </LinearGradient>
            {!revealed ? (
              <View testID="scratch-canvas" {...pan.panHandlers} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: 1 - progress * 0.85 }}>
                <LinearGradient colors={["#9ca3af", "#6b7280"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                <Text style={{ fontSize: 18, fontWeight: "700", color: "rgba(255,255,255,0.85)" }}>Scratch here 🎁</Text>
              </View>
            ) : null}
          </View>
          {revealed ? <Pressable testID="scratch-claim" disabled={claiming} onPress={claim} style={{ marginTop: 20, width: "100%", height: 48, borderRadius: 16, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: claiming ? 0.6 : 1 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{claiming ? "Claiming…" : win ? "Claim to Wallet" : "Okay"}</Text></Pressable>
            : <Text style={{ marginTop: 20, fontSize: 14, color: SLATE[500] }}>Scratch the grey area to reveal your reward</Text>}
        </View>
      </View>
    </Modal>
  );
}

export function ScratchCardsPanel({ onClaimed, toast }: { onClaimed?: () => void; toast: any }) {
  const { c, isDark } = useTheme();
  const [data, setData] = useState<any>({ cards: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any>(null);
  const [viewAll, setViewAll] = useState(false);
  const load = useCallback(() => { setLoading(true); api.get<any>("/growth/scratch-cards").then((r) => setData(r || { cards: [] })).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  const cards: any[] = data.cards || []; const summary = data.summary || {};
  if (!loading && cards.length === 0) {
    return (
      <View testID="scratch-empty" style={{ borderRadius: 24, borderWidth: 1, borderStyle: "dashed", borderColor: isDark ? SLATE[700] : SLATE[300], padding: 24, alignItems: "center", marginBottom: 20 }}>
        <View style={{ height: 48, width: 48, borderRadius: 16, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 8 }}><Gift size={24} color={PRIMARY[600]} /></View>
        <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>No scratch cards yet</Text>
        <Text style={{ fontSize: 14, color: SLATE[500], marginTop: 2, textAlign: "center" }}>Complete eligible bookings to unlock cashback rewards.</Text>
      </View>
    );
  }
  const openCard = (x: any) => (x.status === "available" || x.status === "scratched") && setActive(x);
  const modal = active ? <ScratchModal card={active} toast={toast} onClose={() => setActive(null)} onDone={() => { setActive(null); load(); onClaimed?.(); }} /> : null;
  if (viewAll) {
    return (
      <View testID="scratch-viewall" style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Pressable testID="scratch-viewall-back" onPress={() => setViewAll(false)} style={{ height: 36, width: 36, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} color={c.textMuted} /></Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Sparkles size={20} color={AMBER[500]} /><Text style={{ fontSize: 18, fontWeight: "700", color: c.text }}>All Scratch Cards</Text></View>
            <Text style={{ fontSize: 12, color: SLATE[500] }}>Earned {fmt(summary.earned)} · {cards.length} card{cards.length > 1 ? "s" : ""} · scratched cards auto-remove after 30 days</Text>
          </View>
        </View>
        <View testID="scratch-grid" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{cards.map((x) => <ScratchTile key={x.id} card={x} width="47%" onOpen={() => openCard(x)} />)}</View>
        {modal}
      </View>
    );
  }
  return (
    <View testID="scratch-panel" style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}><Sparkles size={20} color={AMBER[500]} /><Text style={{ fontSize: 18, fontWeight: "700", color: c.text }}>Scratch Cards & Cashback</Text></View>
        {cards.length > 1 ? <Pressable testID="scratch-viewall-btn" onPress={() => setViewAll(true)}><Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY[600] }}>View All ({cards.length})</Text></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="scratch-carousel" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        {cards.map((x) => <ScratchTile key={x.id} card={x} width={160} onOpen={() => openCard(x)} />)}
      </ScrollView>
      {modal}
    </View>
  );
}
