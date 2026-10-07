/** Rate Service — pending (unrated) completed bookings, rated one at a time (latest first). */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, AppState } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Star, CheckCircle2, X } from "lucide-react-native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { useToast } from "../Toast";
import { KeyboardFixedBottom } from "../KeyboardFixedBottom";
import { PRIMARY, TC, useTheme } from "../../theme";

type Pending = { id: string; code: string; service_name: string; partner_name: string; completed_at: string; auto_prompt: boolean };
type Ctx = { items: Pending[]; openLatest: () => void };
const RateCtx = createContext<Ctx>({ items: [], openLatest: () => {} });
export const useRateService = () => useContext(RateCtx);

const LIVE_EVENTS = ["booking_update", "booking_completed", "__resync__"];
const NO_AUTO_PATHS = ["/login", "/book", "/payment"];

export function RateServiceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const path = usePathname();
  const [items, setItems] = useState<Pending[]>([]);
  const [current, setCurrent] = useState<Pending | null>(null);
  const handled = useRef(new Set<string>());
  const isCustomer = user?.role === "customer";

  const load = useCallback(async () => {
    if (!isCustomer) { setItems([]); return; }
    try { const r = await api.get<{ items: Pending[] }>("/bookings/my/pending-reviews"); setItems(r.items || []); } catch { /* keep last */ }
  }, [isCustomer]);

  useEffect(() => { load(); if (!isCustomer) return; const t = setInterval(load, 20000); return () => clearInterval(t); }, [load, isCustomer]);
  useEffect(() => { load(); }, [path, load]);
  useEffect(() => subscribe((ev) => { if (LIVE_EVENTS.includes(ev?.type)) setTimeout(load, 600); }), [subscribe, load]);
  useEffect(() => { const s = AppState.addEventListener("change", (st) => { if (st === "active") load(); }); return () => s.remove(); }, [load]);

  // Auto-popup once per booking right after the partner completes it.
  useEffect(() => {
    if (current || !isCustomer || NO_AUTO_PATHS.some((p) => path.startsWith(p))) return;
    const next = items[0]?.auto_prompt && !handled.current.has(items[0].id) ? items[0] : null;
    if (next) { handled.current.add(next.id); setCurrent(next); }
  }, [items, current, isCustomer, path]);

  const openLatest = useCallback(() => { if (items[0]) { handled.current.add(items[0].id); setCurrent(items[0]); } }, [items]);

  const close = useCallback((rated: boolean) => {
    const b = current;
    setCurrent(null);
    if (!b) return;
    items.forEach((x) => handled.current.add(x.id));
    if (rated) setItems((xs) => xs.filter((x) => x.id !== b.id).map((x) => ({ ...x, auto_prompt: false })));
    else { setItems((xs) => xs.map((x) => ({ ...x, auto_prompt: false }))); api.post(`/bookings/${b.id}/review-prompt-dismiss`).catch(() => {}); }
    setTimeout(load, 400);
  }, [current, load, items]);

  return (
    <RateCtx.Provider value={{ items, openLatest }}>
      {children}
      <RateSheet booking={current} onClose={close} />
    </RateCtx.Provider>
  );
}

/** Small pill pinned just above the bottom nav (right side). Pinned behind the keyboard. */
export function RateServiceButton({ bottom }: { bottom: number }) {
  const { items, openLatest } = useRateService();
  const { c, isDark } = useTheme();
  if (!items.length) return null;
  const b = items[0];
  return (
    <KeyboardFixedBottom testID="rate-service-bar" style={{ position: "absolute", right: 12, bottom: bottom + 10, zIndex: 50 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface, borderRadius: 999, paddingLeft: 10, paddingRight: 4, paddingVertical: 4, borderWidth: 1, borderColor: c.border, boxShadow: "0px 6px 18px rgba(15,23,42,0.16)" } as any}>
        <CheckCircle2 size={16} color="#16A34A" />
        <View style={{ maxWidth: 110 }}>
          <Text testID="rate-service-name" numberOfLines={1} style={{ fontSize: 11, fontWeight: "700", color: isDark ? "#fff" : TC.text }}>{b.service_name}</Text>
          <Text style={{ fontSize: 9, color: c.textFaint }}>Completed{items.length > 1 ? ` · ${items.length} to rate` : ""}</Text>
        </View>
        <Pressable testID="rate-service-btn" onPress={openLatest} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PRIMARY[700], borderRadius: 999, paddingHorizontal: 12, height: 32, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Star size={12} color="#FDE68A" fill="#FDE68A" />
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>Rate service</Text>
        </Pressable>
      </View>
    </KeyboardFixedBottom>
  );
}

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function RateSheet({ booking, onClose }: { booking: Pending | null; onClose: (rated: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { c, isDark } = useTheme();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStars(0); setComment(""); setBusy(false); }, [booking?.id]);

  const submit = async () => {
    if (!booking || !stars) return;
    setBusy(true);
    try { await api.post(`/bookings/${booking.id}/review`, { rating: stars, comment: comment.trim() }); toast.success("Thanks for your rating!"); onClose(true); }
    catch (e: any) { setBusy(false); if (/already reviewed/i.test(e?.message || "")) onClose(true); else toast.error(e?.message || "Could not submit rating"); }
  };

  return (
    <Modal visible={!!booking} transparent animationType="slide" statusBarTranslucent onRequestClose={() => onClose(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" }}>
        <Pressable style={{ flex: 1 }} onPress={() => onClose(false)} />
        <View testID="rate-service-modal" style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#16A34A", letterSpacing: 0.5 }}>SERVICE COMPLETED</Text>
              <Text testID="rate-modal-service" style={{ fontSize: 18, fontWeight: "800", color: isDark ? "#fff" : TC.text, marginTop: 4 }}>{booking?.service_name}</Text>
              <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>#{booking?.code}{booking?.partner_name ? ` · by ${booking.partner_name}` : ""}</Text>
            </View>
            <Pressable testID="rate-modal-close" onPress={() => onClose(false)} hitSlop={10} style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}><X size={16} color={c.textFaint} /></Pressable>
          </View>
          <Text style={{ textAlign: "center", marginTop: 20, fontSize: 14, fontWeight: "600", color: c.textMuted }}>How was your experience?</Text>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} testID={`rate-star-${n}`} onPress={() => setStars(n)} hitSlop={4} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.88 : n <= stars ? 1.08 : 1 }] })}>
                <Star size={38} color={n <= stars ? "#F59E0B" : "#CBD5E1"} fill={n <= stars ? "#FBBF24" : "transparent"} />
              </Pressable>
            ))}
          </View>
          <Text testID="rate-star-label" style={{ textAlign: "center", marginTop: 6, height: 18, fontSize: 13, fontWeight: "700", color: "#D97706" }}>{LABELS[stars]}</Text>
          <TextInput testID="rate-comment" value={comment} onChangeText={setComment} placeholder="Share more about your experience (optional)" placeholderTextColor={c.textFaint} multiline maxLength={500}
            style={{ marginTop: 12, minHeight: 80, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, fontSize: 14, color: isDark ? "#fff" : TC.text, textAlignVertical: "top" }} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            <Pressable testID="rate-later-btn" onPress={() => onClose(false)} style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontWeight: "700", color: c.textMuted }}>Not now</Text>
            </Pressable>
            <Pressable testID="rate-submit-btn" disabled={!stars || busy} onPress={submit} style={{ flex: 2, height: 48, borderRadius: 12, backgroundColor: PRIMARY[700], opacity: !stars || busy ? 0.5 : 1, alignItems: "center", justifyContent: "center" }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: "800", color: "#fff" }}>Submit rating</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
