/** Ports of site/Promotions.jsx, home/HomeBlocks.jsx (Reviews, GrowCta, Faq, Blog) and site/SiteFooter.jsx — mobile. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ArrowRight, Ticket, Tag, CalendarClock, Copy, Check, Crown, Sparkles, ShieldCheck, Star, Quote, User, Store, Wrench, ChevronDown, Search, Calendar } from "lucide-react-native";
import { api, mediaUrl } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { fmt } from "@/src/lib/format";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { PRIMARY, SLATE, AMBER, EMERALD } from "@/src/theme";
import { Container, SectionHead, Scroller, Sk, ErrorState, compactNum, isPositive, stripHtml } from "@/src/components/site/ui";

const ring = { borderWidth: 1, borderColor: "rgba(226,232,240,0.8)" } as const;
const fmtDate = (d?: string) => { try { return new Date(d as string).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; } };

/* ---------- Promotions (offers · membership banner · coupons) ---------- */
export function Promotions() {
  const router = useRouter();
  const toast = useToast();
  const [promo, setPromo] = useState<any>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const load = () => { setError(false); api.get("/site/promotions", { auth: false }).then(setPromo).catch(() => setError(true)); };
  useEffect(load, []);
  if (error) return <Container style={{ paddingVertical: 32 }}><ErrorState onRetry={load} text="We couldn't load offers right now." /></Container>;
  if (!promo) return <Container style={{ paddingVertical: 40 }}><Sk style={{ height: 24, width: 160, marginBottom: 16 }} /><View style={{ flexDirection: "row", gap: 20, overflow: "hidden" }}>{[0, 1, 2].map((i) => <Sk key={i} style={{ width: 320, height: 180 }} />)}</View></Container>;
  const offers = promo.offers || [], coupons = promo.coupons || [], plans = promo.membership || [];
  const topPlan = plans.find((p: any) => (p.badge || "").toLowerCase().includes("popular")) || plans[0];
  const maxPct = plans.length ? Math.max(...plans.map((p: any) => p.discount_pct || 0)) : 0;
  const copyCoupon = async (code: string) => {
    storage.setItem("azo_coupon", code);
    try { await Clipboard.setStringAsync(code); } catch {}
    setCopied(code); setTimeout(() => setCopied(null), 1800);
    toast.success(`Coupon ${code} copied — apply at checkout`);
  };
  const grab = async (o: any) => { if (o.code || o.coupon_code) await copyCoupon(o.code || o.coupon_code); router.push((o.link || o.destination || "/(site)/services") as any); };
  return (
    <>
      {offers.length > 0 ? (
        <View testID="home-offers" style={{ paddingVertical: 40 }}>
          <Container>
            <SectionHead eyebrow="Deals of the day" title="Offers & savings" onSeeAll={() => router.push("/(site)/services")} seeAllLabel="Browse services" />
            <Scroller testID="home-offers-row">
              {offers.map((o: any) => (
                <Pressable key={o.id} testID={`offer-${o.id}`} onPress={() => grab(o)} style={{ width: 300, height: 190, borderRadius: 24, overflow: "hidden", backgroundColor: o.bg_color || "#0D47A1" }}>
                  {o.image ? <Image source={{ uri: mediaUrl(o.image) }} style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.25 }} contentFit="cover" /> : null}
                  <View style={{ position: "absolute", right: -40, bottom: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.10)" }} />
                  <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {o.discount_label ? <Text style={{ backgroundColor: "#fff", color: SLATE[900], fontSize: 12, fontWeight: "800", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>{o.discount_label}</Text> : null}
                        {o.subtitle ? <Text style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700", color: "rgba(255,255,255,0.8)" }}>{o.subtitle}</Text> : null}
                      </View>
                      <Text numberOfLines={2} style={{ color: "#fff", fontWeight: "800", fontSize: 20, lineHeight: 24, marginTop: 12 }}>{o.title}</Text>
                      {o.description ? <Text numberOfLines={2} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{o.description}</Text> : null}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      {o.code || o.coupon_code ? <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff", backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, letterSpacing: 1 }}>{o.code || o.coupon_code}</Text> : <View />}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{o.cta_text || "Grab offer"}</Text><ArrowRight size={16} color="#fff" /></View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </Scroller>
          </Container>
        </View>
      ) : null}

      {topPlan ? (
        <View testID="home-membership-banner" style={{ paddingVertical: 16 }}>
          <Container>
            <View style={{ borderRadius: 28, overflow: "hidden", backgroundColor: SLATE[900], padding: 24, borderWidth: 1, borderColor: SLATE[800] }}>
              <View style={{ position: "absolute", left: -60, top: 20, width: 260, height: 260, borderRadius: 130, backgroundColor: `${topPlan.color || "#0D47A1"}66` }} />
              <View style={{ position: "absolute", right: -24, top: -24 }}><Crown size={176} color="rgba(255,255,255,0.06)" /></View>
              <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}><Sparkles size={14} color="#fff" /><Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#fff" }}>{topPlan.badge || "Membership"}</Text></View>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 24, lineHeight: 30, marginTop: 16 }}>{maxPct > 0 ? <>Save up to <Text style={{ color: "#FCD34D" }}>{maxPct}%</Text> on every booking</> : topPlan.name}</Text>
              <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 12, fontSize: 14 }}>{topPlan.description || topPlan.tagline}</Text>
              {Array.isArray(topPlan.benefits) && topPlan.benefits.length > 0 ? <View testID="membership-benefits" style={{ marginTop: 20, gap: 10 }}>{topPlan.benefits.slice(0, 4).map((b: string) => <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><ShieldCheck size={16} color="#6EE7B7" /><Text style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", flex: 1 }}>{b}</Text></View>)}</View> : null}
              <View style={{ marginTop: 24, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", padding: 24 }}>
                <Text style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700", color: "rgba(255,255,255,0.7)" }}>{topPlan.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 36 }}>{fmt(topPlan.price)}</Text>
                  {topPlan.original_price > topPlan.price ? <Text style={{ color: "rgba(255,255,255,0.5)", textDecorationLine: "line-through" }}>{fmt(topPlan.original_price)}</Text> : null}
                  {topPlan.duration_days > 0 ? <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>/ {topPlan.duration_days >= 365 ? "year" : `${topPlan.duration_days} days`}</Text> : null}
                </View>
                {plans.length > 1 ? <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{plans.length} plans available</Text> : null}
                <Pressable testID="membership-cta" onPress={() => router.push("/(site)/membership")} style={{ marginTop: 20, height: 48, borderRadius: 16, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}><Text style={{ color: SLATE[900], fontWeight: "700", fontSize: 14 }}>Explore plans</Text><ArrowRight size={16} color={SLATE[900]} /></Pressable>
              </View>
            </View>
          </Container>
        </View>
      ) : null}

      {coupons.length > 0 ? (
        <View testID="home-coupons" style={{ paddingVertical: 40 }}>
          <Container>
            <SectionHead eyebrow="Save instantly" title="Coupons for you" subtitle="Tap to copy — the code auto-applies at checkout." />
            <View style={{ gap: 16 }}>
              {coupons.map((c: any) => (
                <View key={c.code} testID={`coupon-${c.code}`} style={{ flexDirection: "row", borderRadius: 24, backgroundColor: "#fff", ...ring, overflow: "hidden" }}>
                  <View style={{ width: 104, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", paddingVertical: 20, paddingHorizontal: 16 }}>
                    <Ticket size={20} color="rgba(255,255,255,0.8)" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 16, marginTop: 4, textAlign: "center", lineHeight: 20 }}>{c.label}</Text>
                    <View style={{ position: "absolute", right: -8, top: "50%", marginTop: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" }} />
                  </View>
                  <View style={{ flex: 1, padding: 16, borderLeftWidth: 1, borderStyle: "dashed", borderLeftColor: SLATE[200] }}>
                    <Text numberOfLines={1} style={{ fontWeight: "700", color: SLATE[900], fontSize: 16 }}>{c.title}</Text>
                    <Text numberOfLines={2} style={{ fontSize: 12, color: SLATE[500], marginTop: 2 }}>{c.description}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {c.min_order > 0 ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Tag size={12} color={SLATE[500]} /><Text style={{ fontSize: 11, color: SLATE[500] }}>Min {fmt(c.min_order)}</Text></View> : null}
                      {c.max_discount > 0 ? <Text style={{ fontSize: 11, color: SLATE[500] }}>· Up to {fmt(c.max_discount)}</Text> : null}
                      {c.valid_until ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ fontSize: 11, color: SLATE[500] }}>·</Text><CalendarClock size={12} color={SLATE[500]} /><Text style={{ fontSize: 11, color: SLATE[500] }}>Till {fmtDate(c.valid_until)}</Text></View> : null}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: PRIMARY[700], backgroundColor: PRIMARY[50], borderWidth: 1, borderColor: PRIMARY[100], borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, letterSpacing: 1 }}>{c.code}</Text>
                      <Pressable testID={`coupon-copy-${c.code}`} onPress={() => copyCoupon(c.code)} style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 32, paddingHorizontal: 10, borderRadius: 8 }}>
                        {copied === c.code ? <Check size={14} color={PRIMARY[700]} /> : <Copy size={14} color={PRIMARY[700]} />}<Text style={{ fontSize: 12, fontWeight: "600", color: PRIMARY[700] }}>{copied === c.code ? "Copied" : "Copy & use"}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </Container>
        </View>
      ) : null}
    </>
  );
}

/* ---------- Reviews ---------- */
const THEMES: Record<string, { bg: string; ring: string; title: string; badge: string; quote: string }> = {
  rose: { bg: "#FFF1F2", ring: "#FFE4E6", title: "#E11D48", badge: "#E11D48", quote: "#FECDD3" },
  violet: { bg: "#F5F3FF", ring: "#EDE9FE", title: "#6D28D9", badge: "#6D28D9", quote: "#DDD6FE" },
  teal: { bg: "#F0FDFA", ring: "#CCFBF1", title: "#0D9488", badge: "#0D9488", quote: "#99F6E4" },
  amber: { bg: "#FFFBEB", ring: "#FEF3C7", title: "#D97706", badge: "#F59E0B", quote: "#FDE68A" },
  sky: { bg: "#F0F9FF", ring: "#E0F2FE", title: "#0284C7", badge: "#0284C7", quote: "#BAE6FD" },
  emerald: { bg: "#ECFDF5", ring: "#D1FAE5", title: "#059669", badge: "#059669", quote: "#A7F3D0" },
  indigo: { bg: "#EEF2FF", ring: "#E0E7FF", title: "#4F46E5", badge: "#4F46E5", quote: "#C7D2FE" },
  slate: { bg: "#F8FAFC", ring: "#E2E8F0", title: "#1E293B", badge: "#334155", quote: "#E2E8F0" },
};
export function TestimonialCard({ t }: { t: any }) {
  const th = THEMES[t.theme] || THEMES.rose;
  const rating = Number(t.rating || 5), full = Math.floor(rating);
  return (
    <View style={{ width: 300, borderRadius: 16, borderWidth: 1, borderColor: th.ring, backgroundColor: th.bg, padding: 24, boxShadow: "0px 8px 30px -16px rgba(15,23,42,0.25)" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ flex: 1, fontWeight: "800", fontSize: 18, lineHeight: 24, color: th.title }}>{t.title || "Great service"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ flexDirection: "row", gap: 2 }}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} color={i < full ? AMBER[400] : AMBER[200]} fill={i < full ? AMBER[400] : AMBER[200]} />)}</View><Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: th.badge }}>{rating.toFixed(1)}</Text></View>
      </View>
      <View style={{ marginTop: 12, transform: [{ rotate: "180deg" }], alignSelf: "flex-start" }}><Quote size={24} color={th.quote} fill={th.quote} /></View>
      <Text style={{ fontSize: 15, color: SLATE[700], lineHeight: 24 }}>{t.text}</Text>
      <View style={{ marginTop: 16, alignItems: "flex-end" }}>
        <Quote size={24} color={th.quote} fill={th.quote} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4 }}>
          {t.photo || t.avatar ? <Image source={{ uri: mediaUrl(t.photo || t.avatar) }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" /> : <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: th.bg, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}><User size={16} color={th.title} /></View>}
          <Text style={{ fontWeight: "700", color: th.title }}>{t.name || "Customer"}</Text>
        </View>
        {t.city || t.service ? <Text style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{[t.service, t.city].filter(Boolean).join(" · ")}</Text> : null}
      </View>
    </View>
  );
}
export function ReviewsSection() {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState(false);
  const { stats = {} } = useSiteConfig();
  const load = () => { setError(false); api.get<any[]>("/content/testimonials", { auth: false }).then((r) => setItems(Array.isArray(r) ? r : [])).catch(() => setError(true)); };
  useEffect(load, []);
  if (error) return <Container style={{ paddingVertical: 32 }}><ErrorState onRetry={load} text="We couldn't load customer reviews." /></Container>;
  if (items === null) return <Container style={{ paddingVertical: 48 }}><Sk style={{ height: 24, width: 220, marginBottom: 20 }} /><View style={{ flexDirection: "row", gap: 20, overflow: "hidden" }}>{[0, 1, 2].map((i) => <Sk key={i} style={{ width: 320, height: 260 }} />)}</View></Container>;
  if (!items.length) return null;
  const avg = items.reduce((a, t) => a + (Number(t.rating) || 0), 0) / items.length;
  return (
    <View testID="home-reviews" style={{ paddingVertical: 40, backgroundColor: "rgba(248,250,252,0.7)", borderTopWidth: 1, borderBottomWidth: 1, borderColor: SLATE[100] }}>
      <Container>
        <SectionHead eyebrow="Loved by customers" title="What our customers say" right={(
          <View testID="reviews-summary" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 16, paddingVertical: 10 }}>
            <Quote size={20} color={PRIMARY[700]} />
            <View><View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ fontWeight: "800", color: SLATE[900] }}>{avg.toFixed(1)}</Text><Star size={16} color={AMBER[400]} fill={AMBER[400]} /></View><Text style={{ fontSize: 11, color: SLATE[500], marginTop: 2 }}>{items.length} featured review{items.length === 1 ? "" : "s"}{stats.reviews && isPositive(stats.reviews) ? ` · ${compactNum(stats.reviews)} total` : ""}</Text></View>
          </View>
        )} />
        <Scroller testID="home-reviews-row">{items.map((t) => <TestimonialCard key={t.id} t={t} />)}</Scroller>
      </Container>
    </View>
  );
}

/* ---------- Grow CTA ---------- */
export function GrowCta({ navigate }: { navigate: (p: string) => void }) {
  const { stats = {}, branding } = useSiteConfig();
  const partners = compactNum(stats.partners), merchants = compactNum(stats.merchants);
  return (
    <View testID="home-grow-cta" style={{ paddingVertical: 40 }}>
      <Container style={{ gap: 20 }}>
        <View style={{ borderRadius: 28, backgroundColor: PRIMARY[700], padding: 32, overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -48, bottom: -48, width: 224, height: 224, borderRadius: 112, backgroundColor: "rgba(255,255,255,0.10)" }} />
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}><Store size={24} color="#fff" /></View>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 24, marginTop: 20 }}>Are you a shopkeeper?</Text>
          <Text style={{ color: PRIMARY[100], marginTop: 8, fontSize: 16, lineHeight: 24 }}>Refer partners & book services for your customers. Earn <Text style={{ color: "#fff", fontWeight: "700" }}>lifetime commission</Text> on every job.</Text>
          {merchants !== null && isPositive(stats.merchants) ? <Text style={{ fontSize: 12, color: "rgba(207,226,252,0.8)", marginTop: 12 }}>{merchants} merchant{Number(stats.merchants) === 1 ? "" : "s"} already earning with {branding.site_name || "AzoApp"}</Text> : null}
          <Pressable testID="cta-merchant" onPress={() => navigate("/login")} style={{ marginTop: 24, alignSelf: "flex-start", height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ color: PRIMARY[700], fontWeight: "700", fontSize: 14 }}>Join as Merchant</Text><ArrowRight size={16} color={PRIMARY[700]} /></Pressable>
        </View>
        <View style={{ borderRadius: 28, backgroundColor: SLATE[900], padding: 32, overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -48, bottom: -48, width: 224, height: 224, borderRadius: 112, backgroundColor: "rgba(251,191,36,0.10)" }} />
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}><Wrench size={24} color="#FCD34D" /></View>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 24, marginTop: 20 }}>Skilled professional?</Text>
          <Text style={{ color: SLATE[300], marginTop: 8, fontSize: 16, lineHeight: 24 }}>Get verified, receive nearby job requests, and grow your earnings with transparent payouts.</Text>
          {partners !== null && isPositive(stats.partners) ? <Text style={{ fontSize: 12, color: SLATE[400], marginTop: 12 }}>Join {partners} verified partners on the platform</Text> : null}
          <Pressable testID="cta-partner" onPress={() => navigate("/login")} style={{ marginTop: 24, alignSelf: "flex-start", height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: AMBER[400], flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ color: SLATE[900], fontWeight: "700", fontSize: 14 }}>Become a Partner</Text><ArrowRight size={16} color={SLATE[900]} /></Pressable>
        </View>
      </Container>
    </View>
  );
}

/* ---------- FAQ ---------- */
export function FaqSection({ title, subtitle, seeded }: { title?: string; subtitle?: string; seeded?: any[] }) {
  const [groups, setGroups] = useState<any[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  useEffect(() => {
    api.get<any[]>("/content/faqs/grouped", { auth: false }).then((r) => setGroups(Array.isArray(r) ? r : [])).catch(() => {
      api.get<any[]>("/content/faqs", { auth: false }).then((list) => {
        const b: Record<string, any[]> = {}; (list || []).forEach((f) => { const c = f.category || "General"; (b[c] = b[c] || []).push(f); });
        setGroups(Object.entries(b).map(([category, faqs]) => ({ category, faqs })));
      }).catch(() => setGroups(seeded ? [{ category: "General", faqs: seeded }] : []));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    if (!groups) return null;
    const needle = q.trim().toLowerCase();
    return groups.map((g) => ({ ...g, faqs: (g.faqs || []).filter((f: any) => !needle || `${f.question} ${f.answer}`.toLowerCase().includes(needle)) })).filter((g) => g.faqs.length);
  }, [groups, q]);
  const total = (groups || []).reduce((a, g) => a + (g.faqs?.length || 0), 0);
  if (groups && !total) return null;
  return (
    <View testID="home-faq" style={{ paddingVertical: 48, backgroundColor: "rgba(248,250,252,0.7)", borderTopWidth: 1, borderColor: SLATE[100] }}>
      <Container>
        <SectionHead align="center" eyebrow="Got questions?" title={title || "Frequently asked questions"} subtitle={subtitle} />
        {total > 4 ? (
          <View style={{ position: "relative", marginTop: -8, marginBottom: 32 }}>
            <View style={{ position: "absolute", left: 14, top: 14, zIndex: 1 }}><Search size={16} color={SLATE[400]} /></View>
            <TextInput testID="faq-search" value={q} onChangeText={setQ} placeholder="Search questions…" placeholderTextColor={SLATE[400]} style={{ height: 44, paddingLeft: 40, paddingRight: 16, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], fontSize: 14, color: SLATE[900] }} />
          </View>
        ) : null}
        {!groups ? <View style={{ gap: 16 }}>{[0, 1, 2, 3].map((i) => <Sk key={i} style={{ height: 56 }} />)}</View>
          : filtered!.length === 0 ? <Text style={{ textAlign: "center", fontSize: 14, color: SLATE[500], paddingVertical: 24 }}>No questions match “{q}”.</Text>
          : <View style={{ gap: 36 }}>
            {filtered!.map((g) => (
              <View key={g.category} testID={`faq-cat-${g.category}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}><View style={{ height: 24, width: 6, borderRadius: 3, backgroundColor: PRIMARY[700] }} /><Text style={{ fontWeight: "800", fontSize: 18, color: SLATE[900] }}>{g.category}</Text><Text style={{ fontSize: 12, fontWeight: "500", color: SLATE[400] }}>({g.faqs.length})</Text></View>
                <View style={{ gap: 16 }}>
                  {g.faqs.map((f: any) => {
                    const isOpen = !!open[f.id];
                    return (
                      <View key={f.id} style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: isOpen ? PRIMARY[300] : SLATE[200] }}>
                        <Pressable testID={`faq-${f.id}`} onPress={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingVertical: 16 }}>
                          <Text style={{ flex: 1, fontWeight: "600", color: SLATE[800], fontSize: 15 }}>{f.question}</Text>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isOpen ? PRIMARY[700] : SLATE[100], alignItems: "center", justifyContent: "center", transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}><ChevronDown size={16} color={isOpen ? "#fff" : SLATE[500]} /></View>
                        </Pressable>
                        {isOpen ? <Text style={{ paddingHorizontal: 20, paddingBottom: 20, fontSize: 14, color: SLATE[600], lineHeight: 22 }}>{stripHtml(f.answer)}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>}
      </Container>
    </View>
  );
}

/* ---------- Blog ---------- */
export function BlogSection({ title, subtitle, seeded, limit }: { title?: string; subtitle?: string; seeded?: any[]; limit?: number }) {
  const router = useRouter();
  const [blogs, setBlogs] = useState<any[] | null>(seeded && seeded.length ? seeded : null);
  useEffect(() => {
    if (seeded && seeded.length) { setBlogs(seeded); return; }
    api.get<any[]>("/content/blogs", { auth: false }).then((r) => setBlogs(Array.isArray(r) ? r : [])).catch(() => setBlogs([]));
  }, [seeded]);
  const list = (blogs || []).slice(0, limit || 3);
  if (blogs && !list.length) return null;
  return (
    <View testID="home-blog" style={{ paddingVertical: 48, backgroundColor: "#fff", borderTopWidth: 1, borderColor: SLATE[100] }}>
      <Container>
        <SectionHead eyebrow={subtitle || "Insights"} title={title || "Latest from our blog"} right={<Pressable testID="blog-see-all" onPress={() => router.push("/(site)/blog")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY[700] }}>View all</Text><ArrowRight size={16} color={PRIMARY[700]} /></Pressable>} />
        {!blogs ? <View style={{ gap: 20 }}>{[0, 1, 2].map((i) => <Sk key={i} style={{ height: 288 }} />)}</View> : (
          <View style={{ gap: 20 }}>
            {list.map((b) => (
              <Pressable key={b.id} testID={`blog-card-${b.slug || b.id}`} onPress={() => router.push(`/(site)/blog/${b.slug || b.id}` as any)} style={{ borderRadius: 16, overflow: "hidden", backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200] }}>
                <View style={{ aspectRatio: 16 / 9, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" }}>{b.image ? <Image source={{ uri: mediaUrl(b.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Quote size={32} color={SLATE[300]} />}</View>
                <View style={{ padding: 20 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {b.category ? <Text style={{ fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: PRIMARY[50], color: PRIMARY[700], fontWeight: "600" }}>{b.category}</Text> : null}
                    {b.publish_at || b.created_at ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Calendar size={12} color={SLATE[400]} /><Text style={{ fontSize: 11, color: SLATE[400] }}>{fmtDate(b.publish_at || b.created_at)}</Text></View> : null}
                  </View>
                  <Text numberOfLines={2} style={{ fontWeight: "700", color: SLATE[900], fontSize: 16, lineHeight: 22 }}>{b.title}</Text>
                  <Text numberOfLines={2} style={{ fontSize: 14, color: SLATE[500], marginTop: 6 }}>{b.excerpt}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}><Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY[700] }}>Read more</Text><ArrowRight size={16} color={PRIMARY[700]} /></View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </Container>
    </View>
  );
}

/* ---------- Footer ---------- */
export function SiteFooter({ navigate }: { navigate: (p: string) => void }) {
  const { branding, stats = {} } = useSiteConfig();
  const cols: [string, [string, string][]][] = [
    ["Company", [["About us", "/(site)/about"], ["Contact us", "/(site)/contact"], ["Blog", "/(site)/blog"], ["All services", "/(site)/services"]]],
    ["For customers", [["Browse categories", "/(site)/services"], ["Help & support", "/(site)/contact"], ["My account", "/login"]]],
    ["For professionals", [["Register as a pro", "/login"], ["Partner login", "/login"], ["For merchants", "/login"]]],
  ];
  return (
    <View testID="site-footer" style={{ backgroundColor: SLATE[950], paddingHorizontal: 16, paddingTop: 40, paddingBottom: 32 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>{(branding.site_name || "A")[0]}</Text></View>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20 }}>{branding.site_name || "AzoApp"}</Text>
      </View>
      <Text style={{ fontSize: 14, color: SLATE[400], marginTop: 12, lineHeight: 22 }}>{branding.footer_text || "Trusted, verified home-service professionals at your doorstep — book in seconds, pay securely."}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><ShieldCheck size={14} color={EMERALD[400]} /><Text style={{ fontSize: 12, color: SLATE[300] }}>{stats.verified_partners ? `${stats.verified_partners} verified professionals` : "Verified professionals"}</Text></View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Star size={14} color={AMBER[400]} /><Text style={{ fontSize: 12, color: SLATE[300] }}>{stats.rating ? `Rated ${stats.rating} / 5` : "Rated by real customers"}</Text></View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 24, marginTop: 32 }}>
        {cols.map(([title, links]) => (
          <View key={title} style={{ width: "45%", flexGrow: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, marginBottom: 12 }}>{title}</Text>
            {links.map(([label, to]) => <Pressable key={label} onPress={() => navigate(to)} style={{ paddingVertical: 6 }}><Text style={{ color: SLATE[400], fontSize: 14 }}>{label}</Text></Pressable>)}
          </View>
        ))}
      </View>
      {branding.phone || branding.email ? <Text style={{ color: SLATE[400], fontSize: 12, marginTop: 24 }}>{[branding.phone, branding.email].filter(Boolean).join(" · ")}</Text> : null}
      <Text style={{ color: SLATE[500], fontSize: 12, marginTop: 24, borderTopWidth: 1, borderTopColor: SLATE[800], paddingTop: 16 }}>© {new Date().getFullYear()} {branding.site_name || "AzoApp"}. All rights reserved.</Text>
    </View>
  );
}
