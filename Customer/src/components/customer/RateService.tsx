/** Rate Service — pending (unrated) completed bookings, rated one at a time (latest first). */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Keyboard, Platform, ActivityIndicator, AppState, Animated, Easing } from "react-native";
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

type Pending = { id: string; code: string; service_name: string; partner_name: string; partner_photo?: string; tip_amount?: number; completed_at: string; auto_prompt: boolean };
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

  useEffect(() => { load(); if (!isCustomer) return; const t = setInterval(() => { if (AppState.currentState === "active") load(); }, 10000); return () => clearInterval(t); }, [load, isCustomer]);
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
  const [done, setDone] = useState(0);
  const [kb, setKb] = useState(0);
  useEffect(() => { setStars(0); setComment(""); setBusy(false); setDone(0); }, [booking?.id]);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => setKb(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const submit = async () => {
    if (!booking || !stars) return;
    setBusy(true);
    try { await api.post(`/bookings/${booking.id}/review`, { rating: stars, comment: comment.trim() }); setDone(stars); setTimeout(() => onClose(true), 2200); }
    catch (e: any) { setBusy(false); if (/already reviewed/i.test(e?.message || "")) onClose(true); else toast.error(e?.message || "Could not submit rating"); }
  };

  return (
    <Modal visible={!!booking} transparent animationType="slide" statusBarTranslucent onRequestClose={() => onClose(!!done)}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)", paddingBottom: kb }}>
        <Pressable style={{ flex: 1 }} onPress={() => onClose(!!done)} />
        <View testID="rate-service-modal" style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: kb ? 16 : insets.bottom + 20 }}>
          {done ? <ThanksBurst stars={done} name={booking?.partner_name} onDone={() => onClose(true)} /> : <>
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
          </>}
        </View>
      </View>
    </Modal>
  );
}

const BURST = ["#F59E0B", "#16A34A", "#3B82F6", "#EC4899", "#FBBF24", "#8B5CF6", "#10B981", "#F97316"];

/** Thank-you celebration: pop-in badge, star burst and confetti dots. */
function ThanksBurst({ stars, name, onDone }: { stars: number; name?: string; onDone: () => void }) {
  const { c, isDark } = useTheme();
  const pop = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 450, delay: 250, useNativeDriver: true }),
    ]).start();
  }, [pop, burst, fade]);
  return (
    <Pressable testID="rate-thanks" onPress={onDone} style={{ alignItems: "center", paddingVertical: 24 }}>
      <View style={{ height: 120, width: 120, alignItems: "center", justifyContent: "center" }}>
        {BURST.map((col, i) => {
          const a = (i / BURST.length) * Math.PI * 2;
          const r = 58 + (i % 2) * 10;
          return (
            <Animated.View key={i} style={{ position: "absolute", opacity: burst.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 0] }),
              transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * r] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * r] }) }, { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
              {i % 2 ? <Star size={14} color={col} fill={col} /> : <View style={{ height: 9, width: 9, borderRadius: 5, backgroundColor: col }} />}
            </Animated.View>
          );
        })}
        <Animated.View style={{ height: 76, width: 76, borderRadius: 38, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center", boxShadow: "0px 10px 24px rgba(22,163,74,0.35)", transform: [{ scale: pop }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] }) }] } as any}>
          <Check size={40} color="#fff" strokeWidth={3} />
        </Animated.View>
      </View>
      <Animated.View style={{ alignItems: "center", opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <View style={{ flexDirection: "row", gap: 4, marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={22} color={n <= stars ? "#F59E0B" : "#CBD5E1"} fill={n <= stars ? "#FBBF24" : "transparent"} />)}
        </View>
        <Text testID="rate-thanks-title" style={{ fontSize: 20, fontWeight: "800", color: isDark ? "#fff" : TC.text, marginTop: 12 }}>Thank you!</Text>
        <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 4, textAlign: "center" }}>{name ? `Your feedback helps ${name} and others serve you better.` : "Your feedback helps us serve you better."}</Text>
      </Animated.View>
    </Pressable>
  );
}
