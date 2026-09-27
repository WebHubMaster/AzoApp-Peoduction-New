/** Partner (maid) Subscriptions — web panel parity with the mobile app screen.
 * Service-session flow: today = Start (customer OTP) → in_progress → Complete
 * (optional photo proof); past days = direct Mark done (backdated). */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CalendarHeart, ArrowLeft, Phone, MapPin, Camera, Play, CheckCircle2 } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { EmptyState, SkeletonList, StatusChip } from "@/components/customer/ux";
import { toast } from "sonner";

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // backend weekday(): Mon=0..Sun=6
const dayLabel = (iso) => {
  if (iso === todayIso()) return "Today";
  if (iso === plusDays(1)) return "Tomorrow";
  const d = new Date(iso + "T00:00:00");
  return `${WD_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

const DAY_META = {
  scheduled: ["Scheduled", "bg-blue-50 text-blue-700"],
  in_progress: ["In progress", "bg-amber-50 text-amber-700"],
  completed: ["Completed", "bg-emerald-50 text-emerald-700"],
  replacement_completed: ["Replacement", "bg-violet-50 text-violet-700"],
  maid_absent: ["Maid Absent", "bg-rose-50 text-rose-700"],
  customer_cancel: ["Customer Cancel", "bg-amber-50 text-amber-700"],
  weekly_off: ["Weekly Off", "bg-slate-100 text-slate-500"],
};
const setTone = (st) => ({ active: "green", paid: "green", completed: "blue", approved: "blue", pending: "amber", review: "violet", cancelled: "rose" }[st] || "slate");

function StatCol({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="flex-1">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}

function SubDetail({ sub, onBack, reload }) {
  const [busy, setBusy] = useState("");
  const [startFor, setStartFor] = useState("");
  const [otpVal, setOtpVal] = useState("");
  const [completeFor, setCompleteFor] = useState("");
  const [photoData, setPhotoData] = useState(null);
  const s = sub;
  const schedule = s.schedule || [];
  const canStart = (d) => s.status === "active" && d.status === "scheduled" && d.date === todayIso();
  const canComplete = (d) => s.status === "active" && d.status === "in_progress";
  const canMarkPast = (d) => s.status === "active" && d.status === "scheduled" && d.date < todayIso();
  const pendingDays = schedule.filter((d) => canMarkPast(d));
  const addr = s.address || {};
  const addrText = [addr.label, addr.line || addr.address_line, addr.city, addr.pincode].filter(Boolean).join(", ") || "—";
  const weeklyOffText = (s.weekly_offs || []).length ? s.weekly_offs.map((d) => WD_FULL[d]).join(", ") : "None";

  const startDay = async (date) => {
    setBusy("start-" + date);
    try {
      await api.post(`/subscriptions/${s.id}/days/${date}/start`, { otp: otpVal.trim() });
      toast.success("Service started");
      setStartFor(""); setOtpVal("");
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not start service"); } finally { setBusy(""); }
  };
  const completeDay = async (date, photo = null) => {
    setBusy("done-" + date);
    try {
      await api.post(`/subscriptions/${s.id}/days/${date}/complete`, photo ? { photo } : {});
      toast.success("Marked completed");
      setCompleteFor(""); setPhotoData(null);
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not mark completed"); } finally { setBusy(""); }
  };
  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhotoData(r.result);
    r.readAsDataURL(f);
  };

  const set = s.settlement || {};
  return (
    <div className="w-full space-y-4" data-testid="partner-sub-detail">
      <button onClick={onBack} data-testid="partner-sub-back" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800">
        <ArrowLeft className="h-4 w-4" /> All subscriptions
      </button>

      {/* Hero */}
      <div className="rounded-2xl p-6 text-white bg-gradient-to-br from-primary-700 via-primary-800 to-slate-900">
        <p className="text-[11px] uppercase tracking-widest text-primary-200 font-bold">{s.plan_label || s.plan_type} {s.category_name || "Maid"} Subscription</p>
        <h2 className="text-2xl font-extrabold mt-1">{s.customer_name}</h2>
        <p className="text-sm text-primary-200 mt-0.5">{s.start_date} → {s.end_date} · {s.code}</p>
        <div className="grid grid-cols-3 gap-3 mt-5 max-w-xl">
          {[["Working", s.working_days], ["Completed", s.completed_days], ["Absent", s.absent_days]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase text-primary-200">{k}</p><p className="text-xl font-extrabold mt-0.5">{v ?? 0}</p></div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Customer & work details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2.5" data-testid="partner-sub-customer-card">
          <p className="font-bold text-slate-900">Customer & work details</p>
          {[
            ["Customer", s.customer_name || "—"],
            ["Phone", s.customer_phone ? <a href={`tel:${s.customer_phone}`} className="inline-flex items-center gap-1 text-primary-700 font-semibold"><Phone className="h-3.5 w-3.5" />{s.customer_phone}</a> : "—"],
            ["Address", <span className="inline-flex items-start gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />{addrText}</span>],
            ["Work", `${s.service_name || "Home Maid"}${s.category_name ? " · " + s.category_name : ""}`],
            ["Preferred time", s.preferred_time || "—"],
            ["Duration", `${s.start_date} → ${s.end_date}${s.duration_days ? ` · ${s.duration_days} days` : ""}`],
            ["Weekly off", weeklyOffText],
            ...(s.notes ? [["Notes", s.notes]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 text-sm border-t border-slate-50 pt-2 first:border-0 first:pt-0">
              <span className="text-slate-500">{k}</span>
              <span className="text-slate-800 font-medium text-right">{v}</span>
            </div>
          ))}
        </div>

        {/* Earnings breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2.5" data-testid="partner-sub-earning-card">
          <p className="font-bold text-slate-900">Earnings breakdown</p>
          {[
            ["Maximum Partner Allocation", fmt(s.partner_allocation), "text-slate-800"],
            ["Per-day earning", fmt(s.per_day_earning), "text-slate-800"],
            ["Earned so far", fmt(s.accrued_earning), "text-emerald-600 font-bold"],
            ["Absent Adjustment (to platform)", "−" + fmt(s.absent_adjustment), "text-rose-600"],
          ].map(([k, v, c]) => (
            <div key={k} className="flex justify-between text-sm"><span className="text-slate-500">{k}</span><span className={c}>{v}</span></div>
          ))}
          <div className="flex justify-between items-center border-t border-slate-100 pt-2.5">
            <span className="text-slate-500 text-sm">Settlement</span>
            <div className="flex items-center gap-2">
              <StatusChip label={(set.status && set.status !== "none") ? set.status : (s.status === "active" ? "active" : "pending")} tone={setTone((set.status && set.status !== "none") ? set.status : s.status)} />
              <span className="font-extrabold text-primary-700">{fmt(set.amount ?? s.settlement_amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily schedule + service session flow */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="font-bold text-slate-900 mb-3">Daily schedule & earnings</p>
        {pendingDays.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 mb-3" data-testid="partner-sub-pending-banner">
            <p className="text-xs text-amber-700 font-medium">{pendingDays.length} past day(s) not marked yet — neeche "Mark done" se aap baad me bhi mark kar sakti hain.</p>
          </div>
        )}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-96 overflow-y-auto pr-1">
          {schedule.map((d) => {
            const [lbl, tone] = DAY_META[d.status] || DAY_META.scheduled;
            return (
              <div key={d.date} data-testid={`partner-sub-day-${d.date}`} className="border border-slate-100 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700">{dayLabel(d.date)} · {d.date}</p>
                    <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded ${tone}`}>{lbl}</span>
                    {d.proof_photo && <a href={d.proof_photo} target="_blank" rel="noreferrer" className="block text-[10px] text-primary-700 font-semibold mt-1">Photo proof ✓</a>}
                  </div>
                  {!canStart(d) && !canComplete(d) && !canMarkPast(d) && (
                    <span className={`text-sm font-bold ${d.earning > 0 ? "text-emerald-600" : "text-slate-400"}`}>{d.status === "weekly_off" ? "—" : (d.earning > 0 ? "+" + fmt(d.earning) : fmt(0))}</span>
                  )}
                </div>
                {canStart(d) && startFor !== d.date && (
                  <button data-testid={`partner-sub-start-${d.date}`} onClick={() => { setStartFor(d.date); setOtpVal(""); }}
                    className="w-full h-8 rounded-lg bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                    <Play className="h-3.5 w-3.5" /> Start Service
                  </button>
                )}
                {canStart(d) && startFor === d.date && (
                  <div className="flex gap-1.5" data-testid={`partner-sub-otp-row-${d.date}`}>
                    <input data-testid={`partner-sub-otp-input-${d.date}`} value={otpVal} onChange={(e) => setOtpVal(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="Customer OTP" inputMode="numeric"
                      className="flex-1 h-8 px-2 rounded-lg border border-primary-300 text-sm font-bold tracking-widest text-center outline-none focus:ring-2 focus:ring-primary-200" />
                    <button data-testid={`partner-sub-otp-confirm-${d.date}`} disabled={otpVal.length !== 4 || busy} onClick={() => startDay(d.date)}
                      className="h-8 px-3 rounded-lg bg-primary-700 text-white text-xs font-semibold disabled:opacity-50">
                      {busy ? "…" : "Start"}
                    </button>
                  </div>
                )}
                {canComplete(d) && completeFor !== d.date && (
                  <button data-testid={`partner-sub-complete-${d.date}`} onClick={() => { setCompleteFor(d.date); setPhotoData(null); }}
                    className="w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Complete Service
                  </button>
                )}
                {canComplete(d) && completeFor === d.date && (
                  <div className="space-y-1.5" data-testid={`partner-sub-proof-row-${d.date}`}>
                    <label className="w-full h-8 rounded-lg border border-dashed border-primary-400 text-primary-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer">
                      <Camera className="h-3.5 w-3.5" /> {photoData ? "Photo attached ✓" : "Add photo proof (optional)"}
                      <input data-testid={`partner-sub-photo-${d.date}`} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                    </label>
                    <button data-testid={`partner-sub-confirm-${d.date}`} disabled={busy} onClick={() => completeDay(d.date, photoData)}
                      className="w-full h-8 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
                      {busy ? "…" : "Mark Completed"}
                    </button>
                  </div>
                )}
                {canMarkPast(d) && (
                  <button data-testid={`partner-sub-markdone-${d.date}`} disabled={busy === "done-" + d.date} onClick={() => completeDay(d.date)}
                    className="w-full h-8 rounded-lg bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold disabled:opacity-50">
                    {busy === "done-" + d.date ? "…" : "Mark done"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PartnerSubscriptions() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    api.get("/subscriptions/partner/mine").then((r) => setSubs(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const open = subs.find((x) => x.id === openId);

  const upcoming = useMemo(() => subs
    .filter((s) => s.status === "active")
    .flatMap((s) => (s.schedule || [])
      .filter((d) => d.status === "scheduled" && d.date >= todayIso() && d.date <= plusDays(7))
      .map((d) => ({ subId: s.id, code: s.code, date: d.date, customer: s.customer_name, time: s.preferred_time || "", earning: s.per_day_earning || 0 })))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7), [subs]);

  if (open) return <SubDetail sub={open} onBack={() => setOpenId(null)} reload={load} />;

  return (
    <div className="w-full space-y-4" data-testid="partner-subscriptions">
      {upcoming.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="partner-upcoming">
          <p className="font-bold text-slate-900 mb-2">Upcoming work · next 7 days</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-6 divide-y-0">
            {upcoming.map((t) => (
              <button key={`${t.subId}-${t.date}`} data-testid={`partner-task-${t.subId}-${t.date}`} onClick={() => setOpenId(t.subId)}
                className="w-full flex items-center gap-3 py-2 text-left hover:bg-slate-50 rounded-lg px-2">
                <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${t.date === todayIso() ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-primary-700"}`}>{dayLabel(t.date)}</span>
                <span className="flex-1 text-sm font-medium text-slate-800">{t.customer}</span>
                <span className="text-xs text-slate-400">{t.time || "—"} · {fmt(t.earning)}/day</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? <SkeletonList rows={3} /> : subs.length === 0 ? (
        <EmptyState icon={CalendarHeart} title="No subscriptions yet" desc="Recurring maid subscriptions assigned to you will appear here." testId="partner-subscriptions-empty" />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {subs.map((s) => {
            const set = s.settlement || {};
            const st = (set.status && set.status !== "none") ? set.status : s.status;
            return (
              <button key={s.id} data-testid={`partner-sub-${s.id}`} onClick={() => setOpenId(s.id)} className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-primary-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{s.plan_label || s.plan_type} · {s.customer_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.start_date} → {s.end_date} · {s.code}</p>
                  </div>
                  <StatusChip label={st.replace(/_/g, " ")} tone={setTone(st)} />
                </div>
                <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100">
                  <StatCol label="Completed" value={String(s.completed_days || 0)} tone="text-emerald-600" />
                  <StatCol label="Absent" value={String(s.absent_days || 0)} tone="text-rose-600" />
                  <StatCol label="Earned" value={fmt(s.accrued_earning)} tone="text-emerald-600" />
                  <StatCol label="Settlement" value={fmt(set.amount ?? s.settlement_amount)} tone="text-primary-700" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
