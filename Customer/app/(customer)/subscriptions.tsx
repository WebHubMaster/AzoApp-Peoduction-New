/** Customer Subscriptions — browse recurring (Maid) services, pick a plan (Weekly/
 * Monthly/Quarterly/Yearly), choose start date + time + address, pay the full amount
 * upfront and activate. Premium full-width subscription cards with progress bar, attendance
 * calendar, payment snapshot, maid details and invoice download — parity with the web panel. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { CalendarHeart, CheckCircle2, MapPin, Clock, ChevronDown, Download, Phone, User, IndianRupee, Calendar, XCircle, Mail, LocateFixed, AlertCircle } from "lucide-react-native";
import * as Location from "expo-location";
import { api } from "../../src/api/client";
import { saveInvoicePdf, openInvoicePdf, emailInvoice } from "../../src/lib/invoiceActions";
import { useToast } from "../../src/components/Toast";
import { PRIMARY, SLATE, EMERALD, AMBER, useTheme, TC } from "../../src/theme";
import { EmptyState, BottomSheet, PrimaryButton, SegTabs, SkeletonList } from "../../src/components/customer/ux";
import { SchedulePicker } from "../../src/components/customer/SchedulePicker";
import { openPreparedOrder } from "../../src/lib/payments";

const ROSE = "#F43F5E";
const money = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const etaText = (iso?: string) => {
  if (!iso) return "shortly";
  const d = new Date(iso); if (isNaN(d as any)) return "shortly";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  if (d <= now) return "shortly";
  if (d.toDateString() === now.toDateString()) return `by ${time} today`;
  if (d.toDateString() === tmr.toDateString()) return `by ${time} tomorrow`;
  return `by ${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
};
const todayPlus = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

const DAY_META: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: "Completed", color: "#059669", bg: "#ECFDF5" },
  replacement_completed: { label: "Replacement", color: "#0D9488", bg: "#F0FDFA" },
  in_progress: { label: "In progress", color: "#B45309", bg: "#FFFBEB" },
  maid_absent: { label: "Maid absent", color: ROSE, bg: "#FFF1F2" },
  customer_cancel: { label: "Cancelled by you", color: "#D97706", bg: "#FFFBEB" },
  weekly_off: { label: "Weekly off", color: TC.textMuted, bg: "#F1F5F9" },
  scheduled: { label: "Upcoming", color: "#0659B2", bg: "#F0F7FE" },
  paused: { label: "Paused", color: "#475569", bg: "#F1F5F9" },
  cancelled: { label: "Plan cancelled", color: ROSE, bg: "#FFF1F2" },
};

// Monthly vs paying the Daily plan for the same number of working days.
function monthlySaving(plans: any[]) {
  const d = plans.find((x) => x.plan_type === "daily");
  const m = plans.find((x) => x.plan_type === "monthly");
  if (!d || !m || !d.working_days || !m.working_days) return null;
  const full = (Number(d.price) / Number(d.working_days)) * Number(m.working_days);
  const amount = Math.round(full - Number(m.price));
  return amount > 0 ? { amount, pct: Math.round((amount / full) * 100) } : null;
}

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
  const [err, setErr] = useState<string>("");
  const [locating, setLocating] = useState(false);

  const useCurrentLocation = async () => {
    setErr(""); setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setErr("Location permission denied. Enable it in settings or add an address from My Addresses."); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let rev: any = {};
      try { rev = await api.get(`/geo/reverse?lat=${lat}&lng=${lng}`, { auth: false }); } catch (_) {}
      const line = rev.line || rev.formatted || "Current location";
      const city = rev.city || rev.town || rev.state || "";
      const pincode = String(rev.pincode || rev.postcode || "");

      // De-dupe: if the SAME address already exists, just SELECT it instead of
      // creating another "Current location" copy on every tap. Match on the
      // resolved line+pincode, or on near-identical coordinates (~11m).
      const norm = (s: any) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
      const close = (a: any, b: any) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-4;
      const existing = addresses.find((a) =>
        (close(a.lat, lat) && close(a.lng, lng)) ||
        (norm(a.line) === norm(line) && String(a.pincode || "") === pincode && norm(a.city) === norm(city)),
      );
      if (existing) { setAddrId(existing.id); toast.success("Using your current location"); return; }

      const u = await api.post<any>("/auth/address", {
        label: "Current location",
        line,
        city,
        state: rev.state || "",
        pincode,
        lat, lng, is_default: false,
      });
      const list = (u?.addresses || []) as any[];
      setAddresses(list);
      const latest = list[list.length - 1];
      if (latest) setAddrId(latest.id);
      toast.success("Current location added as service address");
    } catch (e: any) {
      setErr(e?.detail || "Couldn't fetch your current location. Please try again.");
    } finally { setLocating(false); }
  };

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get<any>(`/subscriptions/plans/${service.id}`);
        const ps = p.plans || []; setPlans(ps); setSel((ps.find((x: any) => x.plan_type === "monthly") || ps[0])?.plan_type || "");
      } catch (e: any) { toast.error(e?.detail || "Could not load plans"); }
      try { const a = await api.get<any[]>("/auth/addresses"); setAddresses(a || []); setAddrId((a || [])[0]?.id || ""); } catch (_) {}
    })();
  }, [service.id]);

  const plan = plans.find((p) => p.plan_type === sel);
  const book = async () => {
    setErr("");
    if (!plan) { setErr("Please select a plan to continue."); return; }
    if (!addrId) { setErr("Add a service address first — pick one below or use your current location."); return; }
    if (!startDate || !time) { setErr("Pick a start date and time."); return; }
    setBusy(true);
    try {
      const sub = await api.post<any>("/subscriptions", {
        service_id: service.id, plan_type: sel, start_date: startDate,
        preferred_time: time, address_id: addrId,
      });
      // Upfront full payment. Try to create a real gateway order and open the
      // in-app payment WebView (same host the normal checkout uses). If no gateway
      // is configured the backend returns 409 → fall back to the dev mock activate.
      let order: any = null;
      try { order = await api.post<any>(`/subscriptions/${sub.id}/pay/order`); } catch (_) { order = null; }
      if (order && (order.order_id || order.payment_session_id || order.payment_url || order.fields)) {
        const ok = await openPreparedOrder(order, { purpose: "subscription", subscriptionId: sub.id, toast });
        if (!ok) { setBusy(false); return; } // user closed / payment not completed — keep sheet open
        onDone();
      } else {
        await api.post(`/subscriptions/${sub.id}/pay/mock`);
        toast.success("Subscription active! Full amount paid.");
        onDone();
      }
    } catch (e: any) { toast.error(e?.detail || "Booking failed"); } finally { setBusy(false); }
  };

  return (
    <BottomSheet open onClose={onClose} title={service.name} testID="sub-plan-sheet"
      footer={<PrimaryButton label={busy ? "Processing…" : `Pay ${money(plan?.price)} & Activate`} disabled={busy || !plan} onPress={book} testID="sub-book-pay" />}>
      <View>
        {err ? (
          <View testID="sub-error-banner" style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 6, backgroundColor: "#FFF0F0", borderWidth: 1, borderColor: "#FFE0E1", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
            <AlertCircle size={16} color="#E60000" />
            <Text style={{ flex: 1, color: "#E60000", fontSize: 12.5, fontWeight: "600" }}>{err}</Text>
          </View>
        ) : null}
        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Choose a plan</Text>
        <View style={{ gap: 8 }}>
          {plans.map((p) => {
            const on = p.plan_type === sel;
            const save = p.plan_type === "monthly" ? monthlySaving(plans) : null;
            return (
              <Pressable key={p.plan_type} testID={`sub-plan-${p.plan_type}`} onPress={() => setSel(p.plan_type)}
                style={{ borderWidth: on ? 2 : 1, borderColor: on ? PRIMARY[700] : c.border, borderRadius: 6, padding: 12, backgroundColor: on ? PRIMARY[50] : c.surface }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                    <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{p.label}</Text>
                    {save ? (
                      <View testID="sub-plan-best-value" style={{ backgroundColor: "#16A34A", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 }}>BEST VALUE</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: TC.primaryText, fontWeight: "800", fontSize: 16 }}>{money(p.price)}</Text>
                    {on ? <CheckCircle2 testID={`sub-plan-check-${p.plan_type}`} size={18} color={TC.primaryText} /> : null}
                  </View>
                </View>
                <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{p.working_days} working days · {p.duration_days}-day period</Text>
                {save ? <Text testID="sub-plan-saving" style={{ color: "#15803D", fontSize: 12, fontWeight: "700", marginTop: 4 }}>Save {money(save.amount)} ({save.pct}%) vs Daily</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>Schedule</Text>
        <SchedulePicker
          value={startDate ? `${startDate}T${time || "09:00"}` : null}
          onChange={(v) => {
            if (!v) return;
            const [d, t] = v.split("T");
            setStartDate(d);
            if (t) setTime(t.slice(0, 5));
          }}
        />

        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>Service address</Text>
        <Pressable testID="sub-use-current-location" onPress={useCurrentLocation} disabled={locating}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 6, borderWidth: 1, borderColor: PRIMARY[300], backgroundColor: PRIMARY[50], opacity: locating ? 0.6 : 1, marginBottom: 10 }}>
          <LocateFixed size={16} color={TC.primaryText} />
          <Text style={{ color: TC.primaryText, fontWeight: "700", fontSize: 13 }}>{locating ? "Fetching your location…" : "Use current location"}</Text>
        </Pressable>
        {addresses.length === 0 ? (
          <Text style={{ color: TC.textFaint, fontSize: 13 }}>No saved address. Use your current location above, or add one from My Addresses.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {addresses.map((a) => {
              const on = a.id === addrId;
              const meta = [a.city, a.pincode].filter(Boolean).join(" · ");
              const coords = (a.lat != null && a.lng != null && a.lat !== "" && a.lng !== "") ? `${Number(a.lat).toFixed(5)}, ${Number(a.lng).toFixed(5)}` : "";
              return (
                <Pressable key={a.id} testID={`sub-addr-${a.id}`} onPress={() => { setAddrId(a.id); setErr(""); }} style={{ flexDirection: "row", gap: 10, borderWidth: on ? 2 : 1, borderColor: on ? PRIMARY[700] : c.border, borderRadius: 6, padding: 10 }}>
                  <MapPin size={16} color={TC.primaryText} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 13, fontWeight: "600" }}>{a.label ? `${a.label} · ` : ""}{a.line || a.address_line || "Saved address"}</Text>
                    {meta ? <Text style={{ color: TC.textFaint, fontSize: 11, marginTop: 2 }}>{meta}</Text> : null}
                    {coords ? <Text style={{ color: TC.textFaint, fontSize: 11, marginTop: 1 }}>Location: {coords}</Text> : null}
                  </View>
                  {on ? <CheckCircle2 size={16} color={TC.primaryText} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

/* ------------------------------------------------------- subscription card -- */
function OverviewChip({ icon: Icon, label, value, color, bg }: any) {
  const { c } = useTheme();
  return (
    <View style={{ flexBasis: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: c.border, borderRadius: 6, padding: 10, backgroundColor: c.surface }}>
      <View style={{ height: 34, width: 34, borderRadius: 6, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Icon size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: TC.textFaint, fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: 14, fontWeight: "800", marginTop: 1 }}>{value}</Text>
      </View>
    </View>
  );
}

function SubCard({ s }: { s: any }) {
  const { c } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const set = s.settlement || {};
  const status = (set.status && set.status !== "none") ? set.status : (s.status || "");
  const active = status === "active";
  const wd = s.working_days || 0;
  const done = s.completed_days || 0;
  const absent = s.absent_days || 0;
  const pct = wd ? Math.min(100, Math.round((done / wd) * 100)) : 0;
  const absentPct = wd ? Math.min(100 - pct, Math.round((absent / wd) * 100)) : 0;
  const schedule: any[] = s.schedule || [];
  const todayDay = schedule.find((d: any) => d.date === todayPlus(0) && (d.status === "scheduled" || d.status === "in_progress"));
  const addr = s.address || {};

  const downloadInvoice = async () => {
    setInvBusy(true);
    try {
      // Resolve the invoice id, then download the PDF INSIDE the app (authorised
      // /invoices/{id}/pdf) — the raw backend URL is never opened in a browser. After
      // it lands, offer a one-tap "Open" so the PDF opens in the native viewer.
      const r = await api.get<any>(`/subscriptions/${s.id}/invoice`);
      if (!r?.invoice_id) throw new Error("no invoice");
      const inv = { id: r.invoice_id, invoice_number: `AzoApp-${s.code}` };
      const saved = await saveInvoicePdf(inv);
      toast.action("Invoice saved", { label: "Open", onPress: () => openInvoicePdf(saved.openUri, saved.platform) });
    } catch (e: any) { toast.error(e?.detail || "Invoice not available yet"); } finally { setInvBusy(false); }
  };

  const emailInvoiceNow = async () => {
    setEmailBusy(true);
    try {
      const r = await api.get<any>(`/subscriptions/${s.id}/invoice`);
      if (!r?.invoice_id) throw new Error("no invoice");
      const res = await emailInvoice(r.invoice_id);
      toast.success(res?.sent_to ? `Invoice emailed to ${res.sent_to}` : "Invoice emailed to you");
    } catch (e: any) { toast.error(e?.detail || "Could not email the invoice"); } finally { setEmailBusy(false); }
  };

  return (
    <View testID={`my-sub-${s.id}`} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 6, backgroundColor: c.surface, overflow: "hidden" }}>
      {/* header */}
      <View style={{ padding: 14, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ height: 40, width: 40, borderRadius: 6, backgroundColor: TC.primarySoft, alignItems: "center", justifyContent: "center" }}>
            <CalendarHeart size={20} color={TC.primaryText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{s.service_name}</Text>
            <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 1 }}>{s.plan_label} Subscription · {s.code}</Text>
          </View>
          <View style={{ borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: active ? EMERALD[50] : PRIMARY[50] }}>
            <Text style={{ color: active ? EMERALD[700] : PRIMARY[700], fontWeight: "700", fontSize: 11, textTransform: "capitalize" }}>{status.replace(/_/g, " ")}</Text>
          </View>
        </View>
        <Text style={{ color: c.textMuted, fontSize: 12 }}>{s.start_date} → {s.end_date}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <User size={13} color={TC.textFaint} />
          <Text style={{ color: c.textMuted, fontSize: 12 }}>Maid: <Text style={{ fontWeight: "800", color: c.text }}>{s.partner_name || "Assigning soon"}</Text>{s.preferred_time ? ` · ${s.preferred_time}` : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
          <Text style={{ color: TC.textFaint, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>Total</Text>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 20 }}>{money(s.price)}</Text>
        </View>
      </View>

      {/* maid assignment ETA — under admin review */}
      {s.payment_status === "paid" && !s.partner_name ? (
        <View style={{ marginHorizontal: 14, marginBottom: 4, borderRadius: 16, borderWidth: 1, borderColor: AMBER[200], backgroundColor: AMBER[50], paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <Clock size={16} color={AMBER[700]} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: AMBER[900] ?? "#78350F", fontWeight: "800", fontSize: 13 }}>Maid assignment under review</Text>
            <Text style={{ color: AMBER[700], fontSize: 12, marginTop: 1 }}>Our team is assigning the best-fit maid — expected to be confirmed {etaText(s.assignment_eta)}. We'll notify you once confirmed.</Text>
          </View>
        </View>
      ) : null}

      {/* overview chips */}
      <View style={{ paddingHorizontal: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <OverviewChip icon={IndianRupee} label="Customer Paid" value={money(s.price)} color={TC.primaryText} bg={PRIMARY[50]} />
        <OverviewChip icon={Calendar} label="Working Days" value={String(wd)} color="#0659B2" bg="#F0F7FE" />
        <OverviewChip icon={CheckCircle2} label="Completed" value={String(done)} color="#059669" bg="#ECFDF5" />
        <OverviewChip icon={XCircle} label="Absent" value={String(absent)} color={ROSE} bg="#FFF1F2" />
      </View>

      {/* progress */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "700" }}>Service progress</Text>
          <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: "700" }}>{done} / {wd} completed</Text>
        </View>
        <View testID={`my-sub-progress-${s.id}`} style={{ height: 9, borderRadius: 6, backgroundColor: c.border, overflow: "hidden", flexDirection: "row" }}>
          <View style={{ width: `${pct}%`, backgroundColor: "#059669" }} />
          <View style={{ width: `${absentPct}%`, backgroundColor: "#FB7185" }} />
        </View>
      </View>

      {/* actions */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 14, flexDirection: "row", gap: 8 }}>
        <Pressable testID={`my-sub-details-btn-${s.id}`} onPress={() => setOpen(!open)}
          style={{ flex: 1, height: 40, borderRadius: 6, borderWidth: 1.5, borderColor: PRIMARY[200], backgroundColor: TC.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Text style={{ color: TC.primaryText, fontWeight: "700", fontSize: 13 }}>{open ? "Hide Details" : "View Details"}</Text>
          <ChevronDown size={15} color={TC.primaryText} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
        </Pressable>
        <Pressable testID={`my-sub-invoice-btn-${s.id}`} disabled={invBusy} onPress={downloadInvoice}
          style={{ flex: 1, height: 40, borderRadius: 6, borderWidth: 1.5, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Download size={15} color={c.textMuted} />
          <Text style={{ color: c.textMuted, fontWeight: "700", fontSize: 13 }}>{invBusy ? "Preparing…" : "Invoice"}</Text>
        </Pressable>
        <Pressable testID={`my-sub-email-btn-${s.id}`} disabled={emailBusy} onPress={emailInvoiceNow}
          style={{ height: 40, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1.5, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <Mail size={15} color={c.textMuted} />
          <Text style={{ color: c.textMuted, fontWeight: "700", fontSize: 13 }}>{emailBusy ? "Sending…" : "Email"}</Text>
        </Pressable>
      </View>

      {/* expanded */}
      {open ? (
        <View testID={`my-sub-expanded-${s.id}`} style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, padding: 14, gap: 12 }}>
          {/* service calendar */}
          <View style={{ backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 12 }}>
            <Text style={{ color: c.text, fontWeight: "800", fontSize: 14, marginBottom: 10 }}>Service calendar</Text>
            <View style={{ gap: 6 }}>
              {schedule.map((d) => {
                const m = DAY_META[d.status] || DAY_META.scheduled;
                const dt = new Date(d.date + "T00:00:00");
                return (
                  <View key={d.date} testID={`my-sub-day-${s.id}-${d.date}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: m.bg, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: m.color, fontWeight: "800", fontSize: 12 }}>{String(dt.getDate()).padStart(2, "0")} {dt.toLocaleString("en", { month: "short" })} · {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()]}</Text>
                      <Text style={{ color: m.color, fontSize: 11, opacity: 0.85 }}>{m.label}</Text>
                    </View>
                    {d.arrival_at ? <Text style={{ color: EMERALD[700], fontWeight: "800", fontSize: 12 }}>{new Date(d.arrival_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>

          {/* attendance — maid name · date · arrival time only (no rate/earnings) */}
          <View style={{ backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "800", fontSize: 14 }}>Attendance</Text>
            {(s.attendance || []).length ? (
              (s.attendance || []).slice().reverse().map((a: any) => {
                const dt = new Date(a.date + "T00:00:00");
                return (
                  <View key={a.date} testID={`my-sub-attend-${s.id}-${a.date}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, borderRadius: 6, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: EMERALD[50], paddingHorizontal: 10, paddingVertical: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: "800", fontSize: 12 }}>{a.maid_name || s.partner_name || "Maid"}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 11 }}>{String(dt.getDate()).padStart(2, "0")} {dt.toLocaleString("en", { month: "short" })} {dt.getFullYear()}</Text>
                    </View>
                    <Text style={{ color: EMERALD[700], fontWeight: "800", fontSize: 12 }}>Arrived {new Date(a.arrival_time).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>No arrivals recorded yet. Your maid's arrival time will show here each day.</Text>
            )}
            {[
              ["Amount paid", money(s.price)],
              ["Weekly off", (s.weekly_offs || []).length ? (s.weekly_offs as number[]).map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]).join(", ") : "None"],
              ["Subscription status", status.replace(/_/g, " ")],
            ].map(([k, v]) => (
              <View key={String(k)} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: c.textMuted, fontSize: 12 }}>{k}</Text>
                <Text style={{ color: c.text, fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>{v}</Text>
              </View>
            ))}
          </View>

          {/* maid details */}
          <View style={{ backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "800", fontSize: 14 }}>Maid details</Text>
            {s.partner_name ? (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>Maid</Text>
                  <Text style={{ color: c.text, fontSize: 12, fontWeight: "800" }}>{s.partner_name}</Text>
                </View>
                {s.partner_phone ? (
                  <Pressable testID={`my-sub-call-${s.id}`} onPress={() => Linking.openURL(`tel:${s.partner_phone}`)} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: c.textMuted, fontSize: 12 }}>Phone</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Phone size={12} color={TC.primaryText} /><Text style={{ color: TC.primaryText, fontSize: 12, fontWeight: "700" }}>{s.partner_phone}</Text></View>
                  </Pressable>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>Service time</Text>
                  <Text style={{ color: c.text, fontSize: 12, fontWeight: "700" }}>{s.preferred_time || "—"}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>Address</Text>
                  <Text style={{ color: c.text, fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" }}>{[addr.label, addr.line || addr.address_line, addr.city, addr.pincode].filter(Boolean).join(", ") || "—"}</Text>
                </View>
              </>
            ) : (
              <Text style={{ color: TC.textFaint, fontSize: 12 }}>Maid assignment is under review — expected to be confirmed {etaText(s.assignment_eta)}.</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function SubscriptionsScreen() {
  const { c } = useTheme();
  const router = useRouter();
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
    <View testID="subscriptions-page" style={{ gap: 14 }}>
        <SegTabs tabs={[{ key: "browse", label: "Browse Plans" }, { key: "mine", label: "My Subscriptions" }]} value={tab} onChange={setTab} counts={{ mine: mine.length }} />

        {loading ? <SkeletonList rows={3} /> : tab === "browse" ? (
          services.length === 0 ? (
            <View testID="sub-browse-empty" style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 24, alignItems: "center", gap: 10, marginTop: 8 }}>
              <View style={{ height: 72, width: 72, borderRadius: 6, backgroundColor: TC.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <CalendarHeart size={36} color={TC.primaryText} />
              </View>
              <Text style={{ color: c.text, fontWeight: "800", fontSize: 17, textAlign: "center" }}>No subscription plans yet</Text>
              <Text style={{ color: c.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 300 }}>Recurring maid & home-help plans will appear here. Set it once and a verified pro visits on schedule — no rebooking needed.</Text>
              <View style={{ alignSelf: "stretch", gap: 8, marginTop: 6 }}>
                {([["Verified maids", "Background-checked & rated pros"], ["Pay once", "Full plan upfront, no surprises"], ["Daily attendance", "Arrival captured by location"]] as [string, string][]).map(([t2, d2]) => (
                  <View key={t2} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <CheckCircle2 size={18} color={EMERALD[600]} />
                    <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "700", fontSize: 13 }}>{t2}</Text><Text style={{ color: c.textMuted, fontSize: 11 }}>{d2}</Text></View>
                  </View>
                ))}
              </View>
              <Pressable testID="sub-browse-cta" onPress={() => router.push("/(site)/services" as any)} style={{ alignSelf: "stretch", marginTop: 6, height: 46, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Explore all services</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {services.map((s) => (
                <Pressable key={s.id} testID={`sub-service-${s.id}`} onPress={() => setPicked(s)} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 6, backgroundColor: c.surface, overflow: "hidden" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
                    <View style={{ height: 52, width: 52, borderRadius: 6, backgroundColor: TC.primarySoft, alignItems: "center", justifyContent: "center" }}>
                      <CalendarHeart size={26} color={TC.primaryText} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{s.name}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{s.category_name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <View style={{ backgroundColor: EMERALD[50], borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ color: EMERALD[700], fontWeight: "700", fontSize: 11 }}>{(s.subscription_plans || []).length} plans</Text>
                        </View>
                        <Text style={{ color: TC.textFaint, fontSize: 11 }}>{((s.subscription_plans || []).map((p: any) => p.label || p.plan_type).join(" · ")) || "Flexible plans"}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ marginHorizontal: 16, marginBottom: 16, height: 44, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Choose a plan</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          mine.length === 0 ? (
            <EmptyState icon={Clock} title="No subscriptions yet" desc="Book a plan from Browse Plans to get started." />
          ) : (
            <View style={{ gap: 14 }}>{mine.map((s) => <SubCard key={s.id} s={s} />)}</View>
          )
        )}
      {picked ? <PlanSheet service={picked} onClose={() => setPicked(null)} onDone={() => { setPicked(null); setTab("mine"); load(); }} /> : null}
    </View>
  );
}
