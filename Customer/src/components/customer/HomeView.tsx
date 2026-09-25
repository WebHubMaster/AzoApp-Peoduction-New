/** 1:1 port of HomeView + LiveBookingCard from web_panel/src/pages/customer/CustomerDashboard.jsx (mobile breakpoint). */
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { MapPin, Plus, Package, Wallet, LifeBuoy, CheckCircle2, Clock, Receipt, ChevronRight, Zap, Star, Gift, Navigation } from "lucide-react-native";
import { fmt, fmtC } from "@/src/lib/format";
import { mediaUrl } from "@/src/api/client";
import { useTheme, PRIMARY, SLATE, AMBER, ORANGE, shadowElev, shadowBtn } from "@/src/theme";
import { StatTile, StatusChip, EmptyState, SkeletonList, StatSkeleton } from "@/src/components/customer/ux";
import { ACTIVE_STATES, DONE_STATES, statusText, statusTone, bkDate, NavKey } from "@/src/components/customer/nav";

interface Props {
  user: any; bookings: any[]; wallet: any; refunds: any[]; categories: any[]; services: any[]; referral: any; loading: boolean;
  onNavigate: (k: NavKey, code?: string) => void; onBook: () => void; onCategory: (id: string) => void; onOpenBooking: (b: any) => void; onService: (id: string) => void;
}

const H2 = ({ children }: { children: React.ReactNode }) => {
  const { c } = useTheme();
  return <Text style={{ fontWeight: "700", fontSize: 18, color: c.text }}>{children}</Text>;
};
const LinkBtn = ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) => (
  <Pressable testID={testID} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
    <Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY[600] }}>{label}</Text><ChevronRight size={16} color={PRIMARY[600]} />
  </Pressable>
);

export default function HomeView({ user, bookings, wallet, refunds, categories, services, referral, loading, onNavigate, onBook, onCategory, onOpenBooking, onService }: Props) {
  const { c, isDark } = useTheme();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name || "there").split(" ")[0];
  const location = user?.addresses?.find((a: any) => a.is_default)?.city || user?.addresses?.[0]?.city || "Patna";
  const live = bookings.find((b) => ["searching", "assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status));
  const recent = [...bookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4);
  const popular = [...services].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  const completed = bookings.filter((b) => DONE_STATES.includes(b.status)).length;
  const activeC = bookings.filter((b) => ACTIVE_STATES.includes(b.status)).length;
  const totalRefunded = refunds.reduce((s, r) => s + (r.status === "processed" ? Number(r.refund_amount || 0) : 0), 0);
  const [q, setQ] = useState("");
  const svcMatches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(t) || (s.category_name || "").toLowerCase().includes(t)).slice(0, 6);
  }, [q, services]);

  const card = { borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, ...shadowElev } as const;

  return (
    <View testID="customer-home" style={{ gap: 24 }}>
      {/* HERO (azo-mesh) */}
      <View style={{ borderRadius: 24, overflow: "hidden", zIndex: 20 }}>
        <LinearGradient colors={[PRIMARY[800], PRIMARY[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20 }}>
          <View pointerEvents="none" style={{ position: "absolute", left: -120, top: -220, width: 460, height: 420, borderRadius: 230, backgroundColor: "rgba(255,255,255,0.12)" }} />
          <View pointerEvents="none" style={{ position: "absolute", right: -160, top: -190, width: 360, height: 380, borderRadius: 190, backgroundColor: "rgba(13,71,161,0.55)" }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MapPin size={16} color="rgba(255,255,255,0.8)" /><Text testID="home-location" style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>{location}</Text>
          </View>
          <Text testID="home-greeting" style={{ color: "#fff", fontWeight: "900", fontSize: 24, lineHeight: 32, marginTop: 6 }}>{greet}, {firstName} 👋</Text>
          <Text style={{ color: "rgba(255,255,255,0.85)", marginTop: 4, fontSize: 14 }}>What service do you need today?</Text>

          <View style={{ marginTop: 16, position: "relative", zIndex: 20 }}>
            <TextInput testID="home-search" value={q} onChangeText={setQ} placeholder="Search AC repair, electrician, cleaning…" placeholderTextColor={SLATE[400]}
              style={{ height: 48, paddingLeft: 20, paddingRight: 128, borderRadius: 16, backgroundColor: "#fff", color: SLATE[800], fontSize: 14, boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.1)" }} />
            <Pressable testID="home-book-cta" onPress={onBook} style={({ pressed }) => ({ position: "absolute", right: 6, top: 6, height: 36, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4 })}>
              <Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>Book</Text>
            </Pressable>
            {svcMatches.length > 0 ? (
              <View testID="home-search-results" style={{ position: "absolute", top: 56, left: 0, right: 0, borderRadius: 16, backgroundColor: "#fff", overflow: "hidden", boxShadow: "0px 25px 50px -12px rgba(0,0,0,0.25)", zIndex: 30 }}>
                {svcMatches.map((s) => (
                  <Pressable key={s.id} testID={`home-search-${s.id}`} onPress={() => onService(s.id)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? SLATE[50] : "#fff" })}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: PRIMARY[100], alignItems: "center", justifyContent: "center" }}><Zap size={16} color={PRIMARY[700]} /></View>
                      <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "500", color: SLATE[800] }}>{s.name}</Text><Text style={{ fontSize: 12, color: SLATE[400] }}>{s.category_name}</Text></View>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: PRIMARY[700] }}>{fmt(s.base_price)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([["orders", Package, "Bookings"], ["wallet", Wallet, "Wallet"], ["addresses", MapPin, "Addresses"], ["support", LifeBuoy, "Support"]] as [NavKey, any, string][]).map(([k, Ic, l]) => (
              <Pressable key={k} testID={`quick-${k}`} onPress={() => onNavigate(k)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: pressed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 14, height: 36, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                <Ic size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </LinearGradient>
      </View>

      {/* QUICK STATS */}
      {loading ? <StatSkeleton /> : (
        <View testID="home-stats" style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile testID="stat-total" label="Total Bookings" value={bookings.length} count icon={Package} tone="primary" onPress={() => onNavigate("orders")} />
            <StatTile testID="stat-completed" label="Completed" value={completed} count icon={CheckCircle2} tone="green" onPress={() => onNavigate("orders", "completed")} />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile testID="stat-active" label="Active" value={activeC} count icon={Clock} tone="violet" onPress={() => onNavigate("orders")} />
            <StatTile testID="stat-wallet" label="Wallet" value={fmtC(wallet.balance)} icon={Wallet} tone="amber" onPress={() => onNavigate("wallet")} />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile testID="stat-refunds" label="Refunded" value={fmtC(totalRefunded)} icon={Receipt} tone="slate" onPress={() => onNavigate("refunds")} />
            <View style={{ flex: 1 }} />
          </View>
        </View>
      )}

      {/* LIVE BOOKING */}
      {live ? <LiveBookingCard b={live} onOpen={() => onOpenBooking(live)} /> : null}

      {/* SERVICE DISCOVERY */}
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <H2>Explore Services</H2>
          <LinkBtn label="View all" onPress={onBook} testID="home-explore-viewall" />
        </View>
        <View testID="home-categories" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {categories.slice(0, 12).map((cat) => (
            <Pressable key={cat.id} testID={`cat-${cat.slug}`} onPress={() => onCategory(cat.id)} style={({ pressed }) => ({ width: "30.5%", flexGrow: 1, maxWidth: "31.5%", ...card, padding: 12, alignItems: "center", transform: [{ translateY: pressed ? -2 : 0 }] })}>
              <View style={{ width: 56, height: 56, borderRadius: 16, overflow: "hidden", backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
                {cat.image ? <Image source={{ uri: mediaUrl(cat.image) }} style={{ width: 56, height: 56 }} contentFit="cover" /> : <Zap size={24} color={PRIMARY[600]} />}
              </View>
              <Text numberOfLines={2} style={{ marginTop: 8, fontSize: 12, fontWeight: "600", color: isDark ? SLATE[200] : SLATE[700], textAlign: "center", lineHeight: 15 }}>{cat.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* POPULAR SERVICES */}
      {popular.length > 0 ? (
        <View>
          <View style={{ marginBottom: 12 }}><H2>Popular Services</H2></View>
          <View testID="home-popular" style={{ gap: 12 }}>
            {popular.map((s) => (
              <Pressable key={s.id} testID={`svc-${s.id}`} onPress={() => onService(s.id)} style={({ pressed }) => ({ flexDirection: "row", gap: 12, ...card, padding: 12, transform: [{ translateY: pressed ? -2 : 0 }] })}>
                <View style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden", backgroundColor: c.surfaceAlt }}>
                  {s.image ? <Image source={{ uri: mediaUrl(s.image) }} style={{ width: 64, height: 64 }} contentFit="cover" /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 14, color: c.text }}>{s.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: c.textFaint }}>{s.category_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: c.primaryText }}>{fmt(s.base_price)}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                      <Star size={12} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 11, color: AMBER[600] }}>{(s.rating || 4.8).toFixed(1)}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* PROMO */}
      <LinearGradient colors={[AMBER[400], ORANGE[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 20, ...shadowElev }}>
        <Gift size={32} color="#fff" />
        <Text testID="home-refer-title" style={{ color: "#fff", fontWeight: "900", fontSize: 20, marginTop: 8 }}>Refer & Earn ₹{referral?.reward_amount || 100}</Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginTop: 2 }}>Invite friends — you both earn on their first booking.</Text>
        <Pressable testID="home-invite-friends" onPress={() => onNavigate("referral")} style={({ pressed }) => ({ marginTop: 12, alignSelf: "flex-start", height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? "rgba(255,255,255,0.9)" : "#fff", justifyContent: "center" })}>
          <Text style={{ color: ORANGE[600], fontWeight: "700", fontSize: 14 }}>Invite friends</Text>
        </Pressable>
      </LinearGradient>

      {/* RECENT BOOKINGS */}
      <View testID="home-recent">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <H2>Recent Bookings</H2>
          <LinkBtn label="All" onPress={() => onNavigate("orders")} testID="home-recent-all" />
        </View>
        {loading ? <SkeletonList rows={3} /> : recent.length === 0 ? (
          <EmptyState icon={Package} title="No bookings yet" desc="Book your first home service in minutes." actionLabel="Book a Service" onAction={onBook} testID="home-empty" />
        ) : (
          <View style={{ gap: 12 }}>
            {recent.map((b) => (
              <Pressable key={b.id} testID={`recent-${b.code}`} onPress={() => onOpenBooking(b)} style={({ pressed }) => ({ ...card, padding: 16, transform: [{ translateY: pressed ? -2 : 0 }] })}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontWeight: "600", fontSize: 16, color: c.text }}>{b.service_name}</Text>
                  <StatusChip label={statusText(b.status)} tone={statusTone(b.status)} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ fontSize: 12, color: c.textFaint }}>#{b.code} · {new Date(bkDate(b)).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</Text>
                  <Text style={{ fontWeight: "700", fontSize: 16, color: isDark ? "#fff" : SLATE[800] }}>{fmt(b.pricing?.total)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export function LiveBookingCard({ b, onOpen }: { b: any; onOpen: () => void }) {
  const { c, isDark } = useTheme();
  const STEPS = ["searching", "assigned", "arrived_customer", "started", "completed"];
  const idx = Math.max(0, STEPS.indexOf(b.status === "arrived_shop" ? "assigned" : b.status));
  const pct = ((idx + 1) / STEPS.length) * 100;
  return (
    <View testID="live-booking" style={{ borderRadius: 24, borderWidth: 1, borderColor: isDark ? PRIMARY[800] : PRIMARY[200], backgroundColor: isDark ? "rgba(7,52,115,0.15)" : "rgba(235,243,254,0.6)", padding: 20, ...shadowElev }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY[600] }} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: c.primaryText }}>LIVE BOOKING</Text>
        </View>
        <StatusChip label={statusText(b.status)} tone={statusTone(b.status)} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 18, color: c.text }}>{b.service_name}</Text>
          <Text style={{ fontSize: 12, color: c.textMuted }}>#{b.code}{b.partner_name ? ` · ${b.partner_name}` : ""}</Text>
        </View>
        <Text style={{ fontWeight: "900", fontSize: 20, color: c.text }}>{fmt(b.pricing?.total)}</Text>
      </View>
      <View style={{ marginTop: 12, height: 8, borderRadius: 999, backgroundColor: isDark ? SLATE[800] : "rgba(255,255,255,0.7)", overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct}%`, borderRadius: 999, backgroundColor: PRIMARY[600] }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        {["Searching", "Assigned", "Arrived", "Started", "Done"].map((s, i) => <Text key={s} style={{ fontSize: 10, fontWeight: "600", color: i <= idx ? c.primaryText : SLATE[400] }}>{s}</Text>)}
      </View>
      <Pressable testID="track-booking" onPress={onOpen} style={({ pressed }) => ({ marginTop: 16, height: 40, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, ...shadowBtn })}>
        <Navigation size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>Track Booking</Text>
      </Pressable>
    </View>
  );
}
