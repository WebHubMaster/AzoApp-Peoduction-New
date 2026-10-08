/** Rate Service — pending (unrated) completed bookings, rated one at a time (latest first). */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, AppState } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Star, Check, X } from "lucide-react-native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { useToast } from "../Toast";
import { KeyboardFixedBottom } from "../KeyboardFixedBottom";
import { onForegroundPush, onFcmNotificationOpen } from "../../lib/notifications";
import { PRIMARY, TC, useTheme } from "../../theme";

type Pending = { id: string; code: string; service_name: string; partner_name: string; completed_at: string; auto_prompt: boolean };
type Ctx = { items: Pending[]; openLatest: () => void };
const RateCtx = createContext<Ctx>({ items: [], openLatest: () => {} });
export const useRateService = () => useContext(RateCtx);

const LIVE_EVENTS = ["booking_update", "booking_completed", "__resync__"];
const NO_AUTO_PATHS = ["/login", "/book", "/payment"];
const DONE = ["completed", "paid"];

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
    try { const r = await api.get<{ items: Pending[] }>("/bookings/my/pending-reviews"); setItems(r.items || []); return r.items || []; } catch { return null; }
  }, [isCustomer]);

  const live = useRef({ current, path, isCustomer });
  live.current = { current, path, isCustomer };

  // Instant popup straight from the live "job completed" event — no wait for the next fetch.
  const openLive = useCallback(async (id: string) => {
    const list = await load();
    const b = list?.find((x) => x.id === id && x.auto_prompt);
    const { current: cur, path: p, isCustomer: ok } = live.current;
    if (!b || !ok || cur || handled.current.has(id) || NO_AUTO_PATHS.some((x) => (p || "").startsWith(x))) return;
    handled.current.add(id);
    setCurrent(b);
  }, [load]);

  useEffect(() => { load(); if (!isCustomer) return; const t = setInterval(load, 10000); return () => clearInterval(t); }, [load, isCustomer]);
  useEffect(() => { load(); }, [path, load]);
  useEffect(() => subscribe((ev) => {
    if (!LIVE_EVENTS.includes(ev?.type)) return;
    if (DONE.includes(ev?.data?.status) && ev?.data?.id) openLive(ev.data.id);
    else setTimeout(load, 300);
  }), [subscribe, load, openLive]);
  useEffect(() => {
    const onPush = (d: Record<string, any>) => { if (d?.booking_id) openLive(String(d.booking_id)); };
    const a = onForegroundPush(onPush); const b = onFcmNotificationOpen(onPush);
    return () => { a(); b(); };
  }, [openLive]);
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

function completedLabel(iso?: string) {
  if (!iso) return "Completed";
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Completed today";
  if (days === 1) return "Completed yesterday";
  return `Completed ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

/** Full-width strip docked on top of the bottom nav. Stays pinned behind the keyboard. */
export function RateServiceButton({ bottom }: { bottom: number }) {
  const { items, openLatest } = useRateService();
  const { c, isDark } = useTheme();
  if (!items.length) return null;
  const b = items[0];
  return (
    <KeyboardFixedBottom testID="rate-service-bar" style={{ position: "absolute", left: 0, right: 0, bottom, zIndex: 50 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, boxShadow: "0px -8px 20px -12px rgba(15,23,42,0.18)" } as any}>
        <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          <Check size={20} color={isDark ? "#F1F5F9" : "#1E293B"} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text testID="rate-service-name" numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: isDark ? "#fff" : TC.text }}>{b.service_name}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>
            {completedLabel(b.completed_at)}{items.length > 1 ? <Text style={{ color: c.textFaint }}>{`  \u00b7 ${items.length - 1} more`}</Text> : null}
          </Text>
        </View>
        <Pressable testID="rate-service-btn" onPress={openLatest} style={({ pressed }) => ({ backgroundColor: PRIMARY[700], borderRadius: 12, paddingHorizontal: 18, height: 40, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Text style={{ color: "#fff", fontSize: 13.5, fontWeight: "600" }}>Rate service</Text>
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
