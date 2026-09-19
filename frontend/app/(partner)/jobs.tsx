import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { useTheme, spacing, palette } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useToast } from "@/src/components/Toast";
import { AppShellHeader, Surface, KitEmpty } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";

/* ── helpers (1:1 with web JobRequest.jsx) ── */
const ago = (iso: string | undefined, now: number) => {
  if (!iso) return "just now";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};
const earnFracOf = (b: any) => { const p = b?.commission_config?.partner_pct ?? b?.partner_pct; return p == null ? null : p / 100; };
const commBaseOf = (b: any) => Number(b?.pricing?.commissionable_base || 0) + (b?.coupon_code ? Number(b?.pricing?.discount || 0) : 0);
const estEarning = (b: any) => commBaseOf(b) * (earnFracOf(b) ?? 0.75);

function CountdownRing({ createdAt, expiryMin, now, size = 46 }: { createdAt?: string; expiryMin: number; now: number; size?: number }) {
  if (!createdAt || !expiryMin) return null;
  const total = expiryMin * 60000;
  const remain = Math.max(0, total - (now - new Date(createdAt).getTime()));
  if (remain <= 0) return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="clock-outline" size={14} color="#E11D48" /><Text style={{ color: "#E11D48", fontSize: 11, fontWeight: "700" }}>Expiring…</Text></View>
  );
  const frac = remain / total;
  const mm = Math.floor(remain / 60000);
  const ss = Math.floor((remain % 60000) / 1000);
  const label = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const color = frac > 0.5 ? "#10b981" : frac > 0.2 ? "#f59e0b" : "#ef4444";
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={3.5} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - frac)} />
      </Svg>
      <Text style={{ color, fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{label}</Text>
    </View>
  );
}

const Meta = ({ icon, label, value, colors, cap }: { icon: MdiName; label: string; value: string; colors: any; cap?: boolean }) => (
  <View style={{ width: "48.5%", borderRadius: 12, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 12, paddingVertical: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name={icon} size={12} color="#94A3B8" />
      <Text style={{ color: "#94A3B8", fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
    </View>
    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginTop: 2, textTransform: cap ? "capitalize" : "none" }} numberOfLines={1}>{value}</Text>
  </View>
);

function RequestCard({ b, partnerId, now, expiryMin, onAccept, onDecline }: { b: any; partnerId?: string; now: number; expiryMin: number; onAccept: (id: string) => Promise<void>; onDecline: (id: string) => Promise<void> }) {
  const { colors } = useTheme();
  const P = palette(colors.primary);
  const [busy, setBusy] = useState("");
  const det = (b.eligible_detail || {})[partnerId || ""] || {};
  const a = b.address || {};
  const fresh = now - new Date(b.created_at || now).getTime() < 90000;
  const doAccept = async () => { setBusy("accept"); try { await onAccept(b.id); } finally { setBusy(""); } };
  const doDecline = async () => { setBusy("decline"); try { await onDecline(b.id); } finally { setBusy(""); } };
  const items: any[] = b.items || [];
  const showItems = items.length > 1 || items.some((it) => (it.addons || []).length > 0);
  const frac = earnFracOf(b);

  return (
    <Surface testID={`request-${b.code}`} style={{ overflow: "hidden", borderColor: fresh ? P[200] : colors.border }}>
      {b.schedule_type === "emergency" ? <View style={{ height: 4, backgroundColor: "#F43F5E" }} /> : (
        <LinearGradient colors={[P[600], P[400]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 4 }} />
      )}
      <View style={{ padding: 20 }}>
        <View style={{ gap: 8 }}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, lineHeight: 22, flexShrink: 1 }}>{b.service_name}</Text>
              {b.schedule_type === "emergency" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFE4E6", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 }}>
                  <Icon name="flash" size={12} color="#BE123C" /><Text style={{ color: "#BE123C", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Emergency</Text>
                </View>
              ) : null}
              {b.booking_type === "merchant" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySubtle, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 }}>
                  <Icon name="storefront-outline" size={12} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "600" }}>{b.merchant_name || "Shop"}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>#{b.code}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, paddingTop: 8 }}>
            <View>
              <Text style={{ color: "#94A3B8", fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" }}>Est. earning</Text>
              <Text style={{ color: "#059669", fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{fmt(estEarning(b))}</Text>
            </View>
            <CountdownRing createdAt={b.created_at} expiryMin={expiryMin} now={now} />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, justifyContent: "space-between" }}>
          <Meta icon="navigation-variant-outline" label="Distance" value={det.distance_km != null ? `${det.distance_km} km` : "—"} colors={colors} />
          <Meta icon="clock-outline" label="Travel" value={det.eta_min != null ? `${det.eta_min} min` : "—"} colors={colors} />
          <Meta icon="wallet-outline" label="Payment" value={String(b.payment_mode || b.payment_method || "Online").replace(/_/g, " ")} colors={colors} cap />
          <Meta icon="clock-outline" label="Requested" value={ago(b.created_at, now)} colors={colors} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 12 }}>
          <Icon name="map-marker-outline" size={16} color="#94A3B8" />
          <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1, lineHeight: 20 }}>{a.line}{a.city ? `, ${a.city}` : ""} {a.pincode || ""}</Text>
        </View>

        {showItems ? (
          <View testID={`req-items-${b.code}`} style={{ marginTop: 10, borderRadius: 12, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
            {items.map((it, i) => (
              <View key={i}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, flex: 1 }} numberOfLines={1}>{i + 1}. {it.service_name || it.name || it.custom_name}{(it.qty || 1) > 1 ? ` × ${it.qty}` : ""}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600" }}>{fmt(it.price ?? it.total ?? it.custom_price ?? 0)}</Text>
                </View>
                {(it.addons || []).map((ad: any, ai: number) => {
                  const lineCost = (Number(ad.price) || 0) * (ad.qty || 1);
                  return (
                    <View key={ai} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingLeft: 16 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }} numberOfLines={1}>↳ {ad.name}{(ad.qty || 1) > 1 ? ` × ${ad.qty}` : ""}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{fmt(lineCost)}{frac != null ? <Text style={{ color: "#059669", fontWeight: "600" }}> · you earn {fmt(lineCost * frac)}</Text> : null}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}
        {b.notes ? <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 6, fontStyle: "italic" }}>“{b.notes}”</Text> : null}
        {b.coupon_code ? (
          <View testID={`req-coupon-${b.code}`} style={{ marginTop: 8, flexDirection: "row", gap: 8, borderRadius: 12, backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0", paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: "#047857", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Coupon {b.coupon_code}</Text>
            <Text style={{ color: "rgba(4,120,87,0.8)", fontSize: 11, flex: 1 }}>Funded by AzoApp — your earning is not reduced.</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 }}>
          <Pressable testID={`accept-${b.code}`} onPress={doAccept} disabled={!!busy} style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: P[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: busy ? 0.6 : 1 }}>
            {busy === "accept" ? <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Accepting…</Text> : (<><Icon name="check-circle-outline" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Accept Job</Text></>)}
          </Pressable>
          <Pressable testID={`decline-${b.code}`} onPress={doDecline} disabled={!!busy} style={{ height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
            {busy === "decline" ? <Text style={{ color: colors.textMuted }}>…</Text> : <Icon name="close" size={16} color={colors.textMuted} />}
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}

export default function PartnerJobRequest() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [expiryMin, setExpiryMin] = useState(5);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    api.get<any>("/auth/config").then((r) => { const v = r?.business?.job_auto_expiry_minutes; if (v) setExpiryMin(Number(v)); }).catch(() => {});
  }, []);

  const { connected, subscribe } = useRealtime();
  const q = useQuery({ queryKey: ["partner-jobs"], queryFn: () => api.get<any[]>("/bookings/partner/jobs"), refetchInterval: connected ? 60000 : 10000 });
  // Live dispatch (web PartnerDashboard): taken → drop instantly; new/accepted/update → reload.
  useEffect(() => subscribe((ev) => {
    if (ev.type === "job_taken") { const id = ev.data?.id; qc.setQueryData<any[]>(["partner-jobs"], (prev) => (prev || []).filter((j) => j.id !== id)); }
    else if (["job_request", "job_accepted", "booking_update", "__resync__"].includes(ev.type)) qc.invalidateQueries({ queryKey: ["partner-jobs"] });
  }), [subscribe]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobs = q.data || [];
  const online = user?.partner_status === "online";
  const lastUpdated = new Date(q.dataUpdatedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const reload = () => { qc.invalidateQueries({ queryKey: ["partner-jobs"] }); qc.invalidateQueries({ queryKey: ["partner-active"] }); };

  const accept = async (id: string) => {
    try { await api.post(`/bookings/${id}/accept`, {}); toast.success("Job accepted!"); reload(); router.push("/(partner)/active"); }
    catch (e: any) { toast.error(e?.detail || "Could not accept"); }
  };
  const decline = async (id: string) => {
    try { await api.post(`/bookings/${id}/reject`, { reason: "" }); toast.success("Job declined"); qc.setQueryData<any[]>(["partner-jobs"], (prev) => (prev || []).filter((j) => j.id !== id)); reload(); }
    catch (e: any) { toast.error(e?.detail || "Could not decline"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView
        testID="jobs-list"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* live status bar */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? "#10B981" : "#94A3B8" }} />
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{online ? "Online — receiving requests" : "Offline"}</Text>
          </View>
          <Pressable testID="jobs-refresh" onPress={reload} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>Refresh</Text>
          </Pressable>
        </View>

        {q.isLoading ? (
          [0, 1, 2].map((i) => (
            <Surface key={i} style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceSubtle }} />
              <View style={{ flex: 1, gap: 8 }}><View style={{ height: 14, width: "33%", borderRadius: 8, backgroundColor: colors.surfaceSubtle }} /><View style={{ height: 12, width: "50%", borderRadius: 8, backgroundColor: colors.surfaceSubtle }} /></View>
              <View style={{ height: 24, width: 64, borderRadius: 999, backgroundColor: colors.surfaceSubtle }} />
            </Surface>
          ))
        ) : jobs.length === 0 ? (
          <Surface style={{ padding: 8 }}>
            <KitEmpty
              icon="radar"
              title={online ? "No new job requests" : "You're offline"}
              desc={online ? "Stay online to receive nearby service requests. New jobs will ring here instantly." : "Go online from the Dashboard to start receiving nearby service requests."}
              testID="jobs-empty"
            />
            <View style={{ borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>Live dispatch {connected ? "connected" : "reconnecting…"}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>Updated {lastUpdated}</Text>
            </View>
          </Surface>
        ) : (
          jobs.map((b) => <RequestCard key={b.id} b={b} partnerId={user?.id} now={now} expiryMin={expiryMin} onAccept={accept} onDecline={decline} />)
        )}
      </ScrollView>
    </View>
  );
}
