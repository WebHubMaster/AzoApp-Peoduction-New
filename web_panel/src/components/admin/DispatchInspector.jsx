import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api, { fmt } from "@/lib/api";
import {
  X, Radio, Send, Eye, CheckCircle2, XCircle, Clock, UserPlus, Activity,
  Loader2, Layers, Users, Timer, MapPin, Phone, RefreshCw, User as UserIcon,
  Wallet, ChevronRight,
} from "lucide-react";

const JK = "'Inter',system-ui,sans-serif";

const SOURCE_LABEL = {
  auto_broadcast: "Wave 1 · nearest",
  partner_online: "Partner came online",
  partner_reject_reoffer: "Re-offer after reject",
  auto_escalation_timeout: "Escalated · timeout",
  auto_escalation_reject: "Escalated · reject",
  auto_escalation_no_local: "Escalated · no local partner",
  auto_escalation_pool_refresh: "Re-matched · new partner",
  auto_nearby_wave: "Nearby-area ring",
  auto_escalation_assigned_reject: "Re-dispatch · drop-off",
  admin_redispatch: "Admin redispatch",
  admin_ring: "Admin rang again",
};

const clockTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

const EVENT_STYLE = {
  rung: { color: "#1976D2", bg: "#E8F1FD", Icon: Send },
  seen: { color: "#6366F1", bg: "#EEF0FE", Icon: Eye },
  accepted: { color: "#16A34A", bg: "#E9F8EF", Icon: CheckCircle2 },
  rejected: { color: "#DC2626", bg: "#FDECEC", Icon: XCircle },
  timeout: { color: "#F59E0B", bg: "#FEF5E7", Icon: Clock },
  status: { color: "#64748B", bg: "#EEF2F7", Icon: Activity },
  manual_assign: { color: "#0D47A1", bg: "#E6EDF8", Icon: UserPlus },
};

const eventText = (e) => {
  const who = e.partner_name || "Partner";
  switch (e.type) {
    case "rung": return { title: `${who} notified`, sub: SOURCE_LABEL[e.source] || e.source };
    case "seen": return { title: `${who} viewed the request`, sub: null };
    case "accepted": return { title: `${who} accepted`, sub: e.response_ms ? `responded in ${(e.response_ms / 1000).toFixed(1)}s` : null };
    case "rejected": return { title: `${who} rejected`, sub: null };
    case "timeout": return { title: `${who} timed out`, sub: null };
    case "manual_assign": return { title: `Admin assigned ${who}`, sub: "manual assignment" };
    case "status": return { title: `Status → ${(e.status || "").replace(/_/g, " ")}`, sub: null };
    default: return { title: e.type, sub: null };
  }
};

const SummaryStat = ({ label, value, color }) => (
  <div className="rounded-xl border border-[#E6EAF0] bg-white p-3" data-testid={`inspector-stat-${label.toLowerCase()}`}>
    <p className="text-[22px] font-extrabold leading-none" style={{ fontFamily: JK, color: color || "#172033" }}>{value}</p>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B] mt-1.5">{label}</p>
  </div>
);

const DetailRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2.5 py-1.5">
    <Icon className="h-4 w-4 text-[#94A3B8] shrink-0" />
    <span className="text-[12px] text-[#64748B] w-24 shrink-0">{label}</span>
    <span className="text-[13px] font-semibold text-[#172033] truncate">{value || "—"}</span>
  </div>
);

export default function DispatchInspector({ bookingId, booking, onClose, onAssign }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/bookings/${bookingId}/dispatch-timeline`);
      setData(data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const b = data?.booking || {};
  const s = data?.summary || {};
  const events = data?.events || [];

  return (
    <AnimatePresence>
      {bookingId && (
        <div className="fixed inset-0 z-[90]" data-testid="dispatch-inspector">
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} />
          <motion.aside
            className="absolute right-0 top-0 h-full w-full sm:w-[460px] bg-[#F6F8FC] shadow-2xl flex flex-col"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.28 }}
            style={{ fontFamily: JK }}>
            {/* Header */}
            <div className="shrink-0 bg-[#0D47A1] text-white px-5 py-4 flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5" /> Dispatch Inspector
                </p>
                <h3 className="text-lg font-extrabold mt-1 truncate">{b.code || "—"}</h3>
                <p className="text-[13px] text-white/80 truncate">{b.service_name || "Service"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={load} title="Refresh" data-testid="inspector-refresh"
                  className="h-8 w-8 rounded-md hover:bg-white/15 flex items-center justify-center transition-colors">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button onClick={onClose} title="Close" data-testid="inspector-close"
                  className="h-8 w-8 rounded-md hover:bg-white/15 flex items-center justify-center transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {booking && (
                <section>
                  <p className="text-[12px] font-bold uppercase tracking-wider text-[#64748B] mb-2 flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5 text-[#0D47A1]" /> Booking details
                  </p>
                  <div className="rounded-xl border border-[#E6EAF0] bg-white px-3.5 py-2 divide-y divide-[#F1F5F9]">
                    <DetailRow icon={UserIcon} label="Customer" value={booking.customer_name} />
                    <DetailRow icon={Phone} label="Phone" value={booking.customer_phone} />
                    <DetailRow icon={MapPin} label="Location" value={[booking.address?.city, booking.address?.pincode].filter(Boolean).join(" ")} />
                    <DetailRow icon={Wallet} label="Amount" value={fmt(booking.pricing?.total || 0)} />
                    <DetailRow icon={CheckCircle2} label="Payment" value={(booking.payment_status || "—").replace(/_/g, " ")} />
                  </div>
                </section>
              )}
              {loading && (
                <div className="flex items-center justify-center py-20 text-[#64748B]">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}

              {!loading && data && (
                <>
                  {/* Dispatch status summary */}
                  <section>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-[#64748B] mb-3 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[#0D47A1]" /> Dispatch status
                    </p>
                    <div className="grid grid-cols-3 gap-2.5">
                      <SummaryStat label="Wave" value={s.waves ?? 0} color="#0D47A1" />
                      <SummaryStat label="Notified" value={s.rung ?? 0} color="#1976D2" />
                      <SummaryStat label="Seen" value={s.seen ?? 0} color="#6366F1" />
                      <SummaryStat label="Accepted" value={s.accepted ?? 0} color="#16A34A" />
                      <SummaryStat label="Rejected" value={s.rejected ?? 0} color="#DC2626" />
                      <SummaryStat label="Timeout" value={s.timeout ?? 0} color="#F59E0B" />
                    </div>
                  </section>

                  {/* Still-eligible partners not yet rung */}
                  {(data.waiting || []).length > 0 && (
                    <section>
                      <p className="text-[12px] font-bold uppercase tracking-wider text-[#64748B] mb-3 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-[#0D47A1]" /> Eligible · not yet rung ({data.waiting.length})
                      </p>
                      <div className="space-y-2">
                        {data.waiting.slice(0, 6).map((w) => (
                          <div key={w.partner_id} className="flex items-center justify-between rounded-xl border border-[#E6EAF0] bg-white px-3 py-2">
                            <span className="text-[13px] font-semibold text-[#172033] truncate">{w.partner_name || "Partner"}</span>
                            <span className="text-[12px] text-[#64748B] flex items-center gap-2 shrink-0">
                              {w.nearby && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#FEF5E7] text-[#B45309]">Nearby</span>}
                              {w.eta_min != null && <span className="flex items-center gap-1"><Timer className="h-3 w-3" />~{w.eta_min}m</span>}
                              {w.distance_km != null && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{w.distance_km}km</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Partner response timeline */}
                  <section>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-[#64748B] mb-3 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-[#0D47A1]" /> Partner response timeline
                    </p>
                    {events.length === 0 ? (
                      <p className="text-[13px] text-[#64748B] rounded-xl border border-dashed border-[#E6EAF0] bg-white px-4 py-6 text-center">
                        No dispatch events recorded for this booking yet.
                      </p>
                    ) : (
                      <ol className="relative pl-1">
                        {events.map((e, i) => {
                          const st = EVENT_STYLE[e.type] || EVENT_STYLE.status;
                          const { title, sub } = eventText(e);
                          const last = i === events.length - 1;
                          return (
                            <li key={i} className="relative flex gap-3 pb-5 last:pb-0" data-testid={`inspector-event-${i}`}>
                              {!last && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-[#E6EAF0]" />}
                              <span className="relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: st.bg, color: st.color }}>
                                <st.Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 pt-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-semibold text-[#94A3B8] tabular-nums">{clockTime(e.at)}</span>
                                </div>
                                <p className="text-[13.5px] font-semibold text-[#172033] leading-tight mt-0.5">{title}</p>
                                {sub && <p className="text-[12px] text-[#64748B] mt-0.5">{sub}</p>}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </section>
                </>
              )}

              {!loading && !data && (
                <p className="text-center text-[#64748B] py-20 text-sm">Could not load dispatch details.</p>
              )}
            </div>

            {onAssign && (
              <div className="shrink-0 border-t border-[#E6EAF0] bg-white px-5 py-4">
                <button onClick={() => onAssign(booking)} data-testid="inspector-assign"
                  className="w-full h-11 rounded-md bg-[#0D47A1] hover:bg-[#083A87] text-white font-bold text-[14px] flex items-center justify-center gap-2 transition-colors">
                  <UserPlus className="h-5 w-5" /> Assign Partner <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
