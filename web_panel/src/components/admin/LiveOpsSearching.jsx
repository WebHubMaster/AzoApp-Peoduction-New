import React, { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api, { fmt } from "@/lib/api";
import { toast } from "sonner";
import AssignConfirm, { busyLabel } from "@/components/admin/AssignConfirm";
import {
  Wrench, MapPin, User as UserIcon, Radio, Clock, Users, AlertTriangle,
  UserPlus, Eye, Search, X, Loader2, Star, Timer, ChevronRight, RadioTower,
} from "lucide-react";

const JK = "'Plus Jakarta Sans','Public Sans',system-ui,sans-serif";

export const fmtDur = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
};

/* ───────────────────────── KPI command card ───────────────────────── */
const KPI_TONE = {
  amber: { fg: "#B45309", bg: "#FEF5E7", ring: "#F59E0B" },
  blue: { fg: "#0D47A1", bg: "#E6EDF8", ring: "#0D47A1" },
  green: { fg: "#15803D", bg: "#E9F8EF", ring: "#16A34A" },
  slate: { fg: "#334155", bg: "#EEF2F7", ring: "#64748B" },
};
export const KpiCommand = ({ label, value, desc, icon: Icon, tone = "slate", highlight }) => {
  const t = KPI_TONE[tone] || KPI_TONE.slate;
  return (
    <div data-testid={`liveops-kpi-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      className="rounded-2xl bg-white dark:bg-[#111827] border p-4 flex items-start justify-between transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(13,71,161,.25)]"
      style={{ fontFamily: JK, borderColor: highlight ? t.ring : "#E6EAF0" }}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B] dark:text-[#94A3B8]">{label}</p>
        <p key={value} className="azo-kpi-pop text-[30px] font-extrabold leading-none mt-2 text-[#172033] dark:text-[#F8FAFC]">{value}</p>
        <p className="text-[12px] text-[#94A3B8] mt-1.5 truncate">{desc}</p>
      </div>
      <span className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: t.bg, color: t.fg }}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
  );
};

/* ───────────────────────── Searching job card ───────────────────────── */
export const SearchingCard = ({ x, now, ttl = 25, longWaitSec = 180, onDetails, onAssign }) => {
  const wave = Math.max(1, Number(x.dispatch_wave || 0) || 1);
  const notified = (x.offered_partner_ids || []).length || (x.eligible_partner_ids || []).length || 0;
  const startedMs = new Date(x.dispatch_started_at || x.created_at || Date.now()).getTime();
  const lastWaveMs = new Date(x.dispatch_last_wave_at || x.dispatch_started_at || x.created_at || Date.now()).getTime();
  const waitingSec = Math.max(0, (now - startedMs) / 1000);
  const ringElapsed = Math.max(0, (now - lastWaveMs) / 1000);
  const remaining = Math.max(0, ttl - ringElapsed);
  const pct = Math.max(2, Math.min(100, (remaining / ttl) * 100));
  const longWait = waitingSec > longWaitSec;
  const exhausted = !!x.dispatch_exhausted;

  return (
    <motion.div layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0, transition: { duration: 0.25 } }}
      transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.3 }}
      data-testid={`liveops-row-${x.id}`}
      style={{ fontFamily: JK }}
      className={`rounded-2xl bg-white dark:bg-[#111827] border overflow-hidden transition-shadow hover:shadow-[0_10px_28px_-12px_rgba(13,71,161,.3)] ${longWait ? "border-[#F59E0B]/50" : "border-[#E6EAF0] dark:border-[#1F2937]"}`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <span className="h-11 w-11 rounded-xl grid place-items-center shrink-0 bg-[#E6EDF8] text-[#0D47A1] dark:bg-[#0D47A1]/20 dark:text-[#3B82F6]">
            <Wrench className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15.5px] font-extrabold text-[#172033] dark:text-[#F8FAFC]">{x.service_name}</span>
              <span className="font-mono text-[11px] text-[#94A3B8]">#{x.code}</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#FEF5E7] text-[#B45309] border border-[#F59E0B]/30">
                <span className="relative flex h-2 w-2"><span className="azo-search-dot absolute inline-flex h-2 w-2 rounded-full bg-[#F59E0B]" /></span>
                SEARCHING
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[#64748B] dark:text-[#94A3B8]">
              <span className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" />{x.customer_name || "—"}</span>
              {x.address?.city && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{x.address.city}{x.address?.pincode ? ` ${x.address.pincode}` : ""}</span>}
              <span className="flex items-center gap-1.5 text-[#B45309]"><RadioTower className="h-3.5 w-3.5" />Searching for nearby partners…</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[16px] font-extrabold text-[#172033] dark:text-[#F8FAFC]">{fmt(x.pricing?.total || 0)}</p>
            <p className="text-[11px] text-[#94A3B8] capitalize">{(x.payment_status || "—").replace(/_/g, " ")}</p>
          </div>
        </div>

        {/* dispatch progress strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#0D47A1] dark:text-[#3B82F6] bg-[#E6EDF8] dark:bg-[#0D47A1]/15 px-2 py-1 rounded-lg">
            <Radio className="h-3.5 w-3.5" /> Wave {wave}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
            <Users className="h-3.5 w-3.5" /> {notified} notified
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#64748B] dark:text-[#94A3B8]">
            <Clock className="h-3.5 w-3.5" /> Waiting {fmtDur(waitingSec)}
          </span>
          {longWait && (
            <span data-testid={`liveops-longwait-${x.id}`} className="inline-flex items-center gap-1 font-semibold text-[#B45309] bg-[#FEF5E7] px-2 py-1 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5" /> Waiting too long
            </span>
          )}
        </div>

        {/* ring countdown bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-[#EEF2F7] dark:bg-[#1F2937] overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: exhausted ? "#DC2626" : "#F59E0B" }}
              animate={{ width: `${exhausted ? 100 : pct}%` }} transition={{ ease: "linear", duration: 0.5 }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-[#64748B] dark:text-[#94A3B8] w-24 text-right">
            {exhausted ? "Escalation needed" : `${Math.ceil(remaining)}s remaining`}
          </span>
        </div>

        {/* actions */}
        <div className="mt-4 flex items-center gap-2.5">
          <button data-testid={`liveops-details-${x.id}`} onClick={() => onDetails(x)}
            className="h-10 min-w-[44px] px-4 rounded-md border border-[#E6EAF0] dark:border-[#1F2937] text-[13px] font-semibold text-[#334155] dark:text-[#F8FAFC] hover:bg-[#F6F8FC] dark:hover:bg-[#1F2937] inline-flex items-center gap-2 transition-colors">
            <Eye className="h-4 w-4" /> View Details
          </button>
          <button data-testid={`liveops-assign-${x.id}`} onClick={() => onAssign(x)}
            className="h-10 flex-1 sm:flex-none px-5 rounded-md bg-[#0D47A1] hover:bg-[#083A87] text-white text-[13px] font-bold inline-flex items-center justify-center gap-2 transition-colors">
            <UserPlus className="h-4 w-4" /> Assign Partner
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/* ───────────────────────── Assignment drawer ───────────────────────── */
const availOf = (p) => (p.busy ? "busy" : (p.partner_status === "online" ? "online" : "offline"));
const AVAIL = {
  online: { label: "Available", cls: "bg-[#E9F8EF] text-[#15803D]", dot: "#16A34A" },
  busy: { label: "On a job", cls: "bg-[#FEF5E7] text-[#B45309]", dot: "#F59E0B" },
  offline: { label: "Offline", cls: "bg-[#EEF2F7] text-[#64748B]", dot: "#94A3B8" },
};

export const AssignDrawer = ({ booking, onClose, onAssigned }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!booking) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/bookings/${booking.id}/eligible-partners`, { params: { include_offline: true } });
      setData(data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [booking]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const partners = useMemo(() => {
    const all = [...(data?.partners || []), ...(data?.nearby_partners || [])];
    const ql = q.trim().toLowerCase();
    if (!ql) return all;
    return all.filter((p) => [p.name, p.phone, p.city].some((v) => String(v || "").toLowerCase().includes(ql)));
  }, [data, q]);

  const assign = async (p) => {
    setBusyId(p.id);
    try {
      await api.post(`/admin/bookings/${booking.id}/assign`, { partner_id: p.id });
      toast.success("Partner assigned successfully", { description: `${p.name} has been assigned to #${booking.code}` });
      setConfirm(null);
      onAssigned?.(booking.id);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not assign partner");
    } finally { setBusyId(""); }
  };

  if (!booking) return null;
  return (
    <>
      {confirm && (
        <AssignConfirm partner={{ ...confirm, availability: availOf(confirm) }} booking={booking} busy={busyId === confirm.id}
          onConfirm={() => assign(confirm)} onCancel={() => setConfirm(null)} />
      )}
      <AnimatePresence>
        <div className="fixed inset-0 z-[88]" data-testid="assign-drawer">
          <motion.div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-[#F6F8FC] dark:bg-[#0B1220] shadow-2xl flex flex-col"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.28 }} style={{ fontFamily: JK }}>
            <div className="shrink-0 bg-[#0D47A1] text-white px-5 py-4 flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" /> Assign a partner
                </p>
                <h3 className="text-lg font-extrabold mt-1 truncate">{booking.code}</h3>
                <p className="text-[13px] text-white/80 truncate">
                  {booking.service_name}{data?.category ? ` · ${data.category}` : ""}
                </p>
              </div>
              <button onClick={onClose} data-testid="assign-drawer-close" className="h-8 w-8 rounded-md hover:bg-white/15 flex items-center justify-center transition-colors"><X className="h-5 w-5" /></button>
            </div>

            <div className="shrink-0 px-5 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <input data-testid="assign-drawer-search" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search partner, phone or city…"
                  className="w-full h-11 pl-9 pr-3 rounded-md border border-[#E6EAF0] bg-white dark:bg-[#111827] dark:border-[#1F2937] text-[14px] text-[#172033] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30 focus:border-[#0D47A1]" />
              </div>
              <p className="text-[12px] text-[#64748B] mt-2">
                {loading ? "Finding eligible partners…" : `${partners.length} eligible${data?.nearby_radius_km ? ` · nearby within ${data.nearby_radius_km} km` : ""}`}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
              {loading && (
                <div className="flex items-center justify-center py-16 text-[#64748B]"><Loader2 className="h-6 w-6 animate-spin" /></div>
              )}
              {!loading && partners.length === 0 && (
                <div className="text-center py-16 text-[#64748B]">
                  <Users className="h-8 w-8 mx-auto mb-3 text-[#CBD5E1]" />
                  <p className="text-[14px] font-semibold text-[#334155] dark:text-[#F8FAFC]">No eligible partners found</p>
                  <p className="text-[12.5px] mt-1">No partner matches this service &amp; area right now.</p>
                </div>
              )}
              {!loading && partners.map((p) => {
                const a = AVAIL[availOf(p)];
                const eta = p.eta_min != null ? `ETA ${p.eta_min} min` : (p.distance_km != null ? `${p.distance_km} km` : "");
                return (
                  <div key={p.id} data-testid={`assign-partner-${p.id}`}
                    className="rounded-xl border border-[#E6EAF0] dark:border-[#1F2937] bg-white dark:bg-[#111827] p-3 flex items-center gap-3">
                    <span className="h-10 w-10 rounded-full grid place-items-center font-bold text-[14px] shrink-0 bg-[#E6EDF8] text-[#0D47A1] dark:bg-[#0D47A1]/20 dark:text-[#3B82F6]">
                      {(p.name || "P").charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-[#172033] dark:text-[#F8FAFC] truncate">{p.name}</span>
                        {p.nearby && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FEF5E7] text-[#B45309] shrink-0">Nearby</span>}
                      </div>
                      <div className="flex items-center gap-2.5 mt-0.5 text-[12px] text-[#64748B] dark:text-[#94A3B8]">
                        {p.rating != null && <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating}</span>}
                        {p.distance_km != null && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{p.distance_km} km</span>}
                        {p.eta_min != null && <span className="flex items-center gap-0.5"><Timer className="h-3 w-3" />{p.eta_min}m</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${a.cls}`}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.dot }} />
                          {p.busy ? (busyLabel(p) || a.label) : a.label}
                        </span>
                        {eta && <span className="text-[11px] text-[#0D47A1] dark:text-[#3B82F6] font-semibold">{eta}</span>}
                      </div>
                    </div>
                    <button data-testid={`assign-do-${p.id}`} onClick={() => setConfirm(p)} disabled={busyId === p.id}
                      className="h-9 px-4 rounded-md bg-[#0D47A1] hover:bg-[#083A87] disabled:opacity-60 text-white text-[12.5px] font-bold inline-flex items-center gap-1.5 transition-colors shrink-0">
                      {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Assign <ChevronRight className="h-3.5 w-3.5" /></>}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.aside>
        </div>
      </AnimatePresence>
    </>
  );
};
