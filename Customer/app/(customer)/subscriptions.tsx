/** Customer Subscriptions — browse recurring (Maid) services, pick a plan (Daily/Weekly/
 * Monthly/Yearly), choose start date + time + address, pay the full amount upfront and
 * activate. Also shows the customer's existing subscriptions. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { CalendarHeart, CheckCircle2, MapPin, Clock } from "lucide-react-native";
import { api } from "../../src/api/client";
import { useToast } from "../../src/components/Toast";
import { PRIMARY, SLATE, EMERALD, useTheme } from "../../src/theme";
import { EmptyState, BottomSheet, PrimaryButton, SegTabs, SkeletonList } from "../../src/components/customer/ux";

const money = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayPlus = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

function PlanSheet({ service, onClose, onDone }: { service: any; onClose: () => void; onDone: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [sel, setSel] = useState<string>("");
  const [addrId, setAddrId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(todayPlus(1));
  const [time, setTime] = useState<string>("09:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get<any>(`/subscriptions/plans/${service.id}`);
        setPlans(p.plans || []); setSel((p.plans || [])[0]?.plan_type || "");
      } catch (e: any) { toast.error(e?.detail || "Could not load plans"); }
      try { const a = await api.get<any[]>("/auth/addresses"); setAddresses(a || []); setAddrId((a || [])[0]?.id || ""); } catch (_) {}
    })();
  }, [service.id]);

  const plan = plans.find((p) => p.plan_type === sel);
  const book = async () => {
    if (!plan) return toast.error("Select a plan");
    if (!addrId) return toast.error("Add a service address first");
    setBusy(true);
    try {
      const sub = await api.post<any>("/subscriptions", {
        service_id: service.id, plan_type: sel, start_date: startDate,
        preferred_time: time, address_id: addrId,
      });
      // Upfront full payment — mock when gateway not configured, else create order.
      try {
        await api.post(`/subscriptions/${sub.id}/pay/mock`);
        toast.success("Subscription active! Full amount paid.");
      } catch (e: any) {
        // gateway live path: create order (kept simple — inform user)
        await api.post(`/subscriptions/${sub.id}/pay/order`);
        toast.info("Complete payment to activate your subscription.");
      }
      onDone();
    } catch (e: any) { toast.error(e?.detail || "Booking failed"); } finally { setBusy(false); }
  };

  return (
    <BottomSheet open onClose={onClose} title={service.name} testID="sub-plan-sheet"
      footer={<PrimaryButton label={busy ? "Processing…" : `Pay ${money(plan?.price)} & Activate`} disabled={busy || !plan} onPress={book} testID="sub-book-pay" />}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Choose a plan</Text>
        <View style={{ gap: 8 }}>
          {plans.map((p) => {
            const on = p.plan_type === sel;
            return (
              <Pressable key={p.plan_type} testID={`sub-plan-${p.plan_type}`} onPress={() => setSel(p.plan_type)}
                style={{ borderWidth: on ? 2 : 1, borderColor: on ? PRIMARY[700] : c.border, borderRadius: 14, padding: 12, backgroundColor: on ? PRIMARY[50] : c.surface }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{p.label}</Text>
                  <Text style={{ color: PRIMARY[700], fontWeight: "800", fontSize: 16 }}>{money(p.price)}</Text>
                </View>
                <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{p.working_days} working days · {p.duration_days}-day period</Text>
                {on ? <CheckCircle2 size={16} color={PRIMARY[700]} style={{ position: "absolute", top: 12, right: 12 }} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>Schedule</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textMuted, fontSize: 11, marginBottom: 4 }}>Start date</Text>
            <TextInput testID="sub-start-date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={SLATE[400]}
              style={{ height: 44, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, color: c.text }} />
          </View>
          <View style={{ width: 120 }}>
            <Text style={{ color: c.textMuted, fontSize: 11, marginBottom: 4 }}>Time</Text>
            <TextInput testID="sub-time" value={time} onChangeText={setTime} placeholder="09:00" placeholderTextColor={SLATE[400]}
              style={{ height: 44, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, color: c.text }} />
          </View>
        </View>

        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>Service address</Text>
        {addresses.length === 0 ? (
          <Text style={{ color: SLATE[400], fontSize: 13 }}>No saved address. Please add one from My Addresses.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {addresses.map((a) => {
              const on = a.id === addrId;
              return (
                <Pressable key={a.id} onPress={() => setAddrId(a.id)} style={{ flexDirection: "row", gap: 10, borderWidth: on ? 2 : 1, borderColor: on ? PRIMARY[700] : c.border, borderRadius: 12, padding: 10 }}>
                  <MapPin size={16} color={PRIMARY[700]} />
                  <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>{a.line || a.address_line || `${a.city || ""} ${a.pincode || ""}`}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {plan ? (
          <View style={{ marginTop: 16, borderRadius: 12, backgroundColor: EMERALD[50], padding: 12 }}>
            <Text style={{ color: EMERALD[700], fontSize: 12 }}>You pay the full {plan.label.toLowerCase()} amount upfront. The maid is paid based on actual completed days; commission &amp; tax apply as configured.</Text>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

function SubCard({ s }: { s: any }) {
  const { c } = useTheme();
  const set = s.settlement || {};
  return (
    <View testID={`my-sub-${s.id}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14, backgroundColor: c.surface, gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{s.plan_label} · {s.service_name}</Text>
        <Text style={{ color: s.status === "active" ? EMERALD[600] : PRIMARY[700], fontWeight: "700", fontSize: 12, textTransform: "capitalize" }}>{(set.status && set.status !== "none") ? set.status : s.status.replace("_", " ")}</Text>
      </View>
      <Text style={{ color: c.textMuted, fontSize: 12 }}>{s.start_date} → {s.end_date} · {s.code}</Text>
      <View style={{ flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: c.borderSoft, paddingTop: 8 }}>
        {[["Paid", money(s.price)], ["Completed", `${s.completed_days || 0}/${s.working_days}`], ["Maid earned", money(s.accrued_earning)]].map(([k, v]) => (
          <View key={String(k)} style={{ flex: 1 }}><Text style={{ color: SLATE[400], fontSize: 10, textTransform: "uppercase" }}>{k}</Text><Text style={{ color: c.text, fontWeight: "700", fontSize: 13 }}>{v}</Text></View>
        ))}
      </View>
      {s.partner_name ? <Text style={{ color: c.textMuted, fontSize: 12 }}>Maid: <Text style={{ fontWeight: "700" }}>{s.partner_name}</Text></Text> : <Text style={{ color: SLATE[400], fontSize: 12 }}>Maid will be assigned soon.</Text>}
    </View>
  );
}

export default function SubscriptionsScreen() {
  const { c } = useTheme();
  const [tab, setTab] = useState("browse");
  const [services, setServices] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [svcs, subs] = await Promise.all([
        api.get<any[]>("/catalog/services"),
        api.get<any[]>("/subscriptions/mine"),
      ]);
      setServices((svcs || []).filter((s) => s.is_subscription));
      setMine(subs || []);
    } catch (_) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <CalendarHeart size={22} color={PRIMARY[700]} />
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>Subscriptions</Text>
        </View>
        <SegTabs tabs={[{ key: "browse", label: "Browse Plans" }, { key: "mine", label: "My Subscriptions" }]} value={tab} onChange={setTab} counts={{ mine: mine.length }} />

        {loading ? <SkeletonList rows={3} /> : tab === "browse" ? (
          services.length === 0 ? (
            <EmptyState icon={CalendarHeart} title="No subscription services yet" desc="Recurring maid & home-help plans will appear here." />
          ) : (
            <View style={{ gap: 12 }}>
              {services.map((s) => (
                <Pressable key={s.id} testID={`sub-service-${s.id}`} onPress={() => setPicked(s)} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14, backgroundColor: c.surface }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{s.name}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{s.category_name} · {(s.subscription_plans || []).length} plans</Text>
                    </View>
                    <View style={{ backgroundColor: PRIMARY[50], borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ color: PRIMARY[700], fontWeight: "700", fontSize: 13 }}>Choose plan</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          mine.length === 0 ? (
            <EmptyState icon={Clock} title="No subscriptions yet" desc="Book a plan from Browse Plans to get started." />
          ) : (
            <View style={{ gap: 12 }}>{mine.map((s) => <SubCard key={s.id} s={s} />)}</View>
          )
        )}
      </ScrollView>
      {picked ? <PlanSheet service={picked} onClose={() => setPicked(null)} onDone={() => { setPicked(null); setTab("mine"); load(); }} /> : null}
    </View>
  );
}
