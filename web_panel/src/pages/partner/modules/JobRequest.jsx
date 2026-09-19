import React, { useEffect, useState } from "react";
import api, { fmt } from "@/lib/api";
import { MapPin, Navigation2, Clock, Wallet, Zap, Store, RefreshCw, CheckCircle2, X, Radar } from "lucide-react";
import { Surface, StatusBadge, EmptyState, SkeletonList, cx } from "@/components/partner/ui/kit";
import { Button } from "@/components/ui/button";

/* live "x ago" ------------------------------------------------------------- */
const useNow = (ms = 5000) => {
  const [, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((v) => v + 1), ms); return () => clearInterval(id); }, [ms]);
  return Date.now();
};
const ago = (iso, now) => {
  if (!iso) return "just now";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

// Known partner earning fraction from the booking's snapshotted commission config;
// null when the rate isn't known (legacy bookings) so we don't show a wrong number.
const earnFracOf = (b) => {
  const p = b?.commission_config?.partner_pct ?? b?.partner_pct;
  return p == null ? null : p / 100;
};
// Commission base ADDS BACK the coupon discount (platform-absorbed) so the partner's
// earning is never reduced by a customer coupon.
const commBaseOf = (b) => {
  const base = Number(b?.pricing?.commissionable_base || 0);
  const coupon = b?.coupon_code ? Number(b?.pricing?.discount || 0) : 0;
  return base + coupon;
};
const estEarning = (b) => commBaseOf(b) * (earnFracOf(b) ?? 0.75);

/* Real accept-expiry countdown ring — driven by created_at + dispatch auto-expiry. */
function CountdownRing({ createdAt, expiryMin, now, size = 46 }) {
  if (!createdAt || !expiryMin) return null;
  const total = expiryMin * 60000;
  const elapsed = now - new Date(createdAt).getTime();
  const remain = Math.max(0, total - elapsed);
  if (remain <= 0) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400"><Clock className="h-3.5 w-3.5" /> Expiring…</span>
  );
  const frac = remain / total;
  const mm = Math.floor(remain / 60000);
  const ss = Math.floor((remain % 60000) / 1000);
  const label = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const color = frac > 0.5 ? "#10b981" : frac > 0.2 ? "#f59e0b" : "#ef4444";
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`Accept within ${label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-slate-200 dark:text-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums" style={{ color }}>{label}</span>
    </div>
  );
}

function JobCard({ b, partnerId, onAccept, onDecline, now, expiryMin }) {
  const [busy, setBusy] = useState("");
  const det = (b.eligible_detail || {})[partnerId] || {};
  const a = b.address || {};
  const fresh = (now - new Date(b.created_at || now).getTime()) < 90000;
  const doAccept = async () => { setBusy("accept"); try { await onAccept(b.id); } finally { setBusy(""); } };
  const doDecline = async () => { setBusy("decline"); try { await onDecline(b.id); } finally { setBusy(""); } };

  return (
    <Surface className={cx("overflow-hidden transition-all", fresh && "ring-1 ring-primary-200 dark:ring-primary-800")}>
      {/* accent strip */}
      <div className={cx("h-1 w-full", b.schedule_type === "emergency" ? "bg-rose-500" : "bg-gradient-to-r from-primary-600 to-primary-400")} />
      <div className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <p className="font-heading font-bold text-slate-900 dark:text-white leading-snug break-words">{b.service_name}</p>
              {b.schedule_type === "emergency" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 rounded-full px-2 py-0.5 mt-0.5"><Zap className="h-3 w-3" /> Emergency</span>
              )}
              {b.booking_type === "merchant" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 rounded-full px-2 py-0.5 mt-0.5"><Store className="h-3 w-3" /> {b.merchant_name || "Shop"}</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">#{b.code}</p>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t border-slate-100 dark:border-slate-800 pt-2 sm:border-0 sm:pt-0">
            <div className="text-left sm:text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Est. earning</p>
              <p className="font-heading font-extrabold text-xl text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(estEarning(b))}</p>
            </div>
            <CountdownRing createdAt={b.created_at} expiryMin={expiryMin} now={now} />
          </div>
        </div>

        {/* meta chips */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Meta icon={Navigation2} label="Distance" value={det.distance_km != null ? `${det.distance_km} km` : "—"} />
          <Meta icon={Clock} label="Travel" value={det.eta_min != null ? `${det.eta_min} min` : "—"} />
          <Meta icon={Wallet} label="Payment" value={(b.payment_mode || b.payment_method || "Online").replace(/_/g, " ")} cap />
          <Meta icon={Clock} label="Requested" value={ago(b.created_at, now)} />
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 flex items-start gap-1.5">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
          <span className="min-w-0">{a.line}{a.city ? `, ${a.city}` : ""} {a.pincode || ""}</span>
        </p>
        {/* Point #9 — every service in this order, individually itemised + add-on earning */}
        {((b.items || []).length > 1 || (b.items || []).some((it) => (it.addons || []).length > 0)) && (
          <div className="mt-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-3 py-2 space-y-1" data-testid={`req-items-${b.code}`}>
            {(b.items || []).map((it, i) => (
              <div key={i} className="text-[12.5px]" data-testid={`req-item-${i}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300 truncate">{i + 1}. {it.service_name || it.name || it.custom_name}{(it.qty || 1) > 1 ? ` × ${it.qty}` : ""}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">{fmt(it.price ?? it.total ?? it.custom_price ?? 0)}</span>
                </div>
                {(it.addons || []).map((a, ai) => {
                  const lineCost = (Number(a.price) || 0) * (a.qty || 1);
                  const frac = earnFracOf(b);
                  return (
                    <div key={ai} className="flex items-center justify-between gap-2 pl-4 text-[11px] text-slate-500 dark:text-slate-400" data-testid={`req-item-${i}-addon-${ai}`}>
                      <span className="truncate">↳ {a.name}{(a.qty || 1) > 1 ? ` × ${a.qty}` : ""}</span>
                      <span className="shrink-0 tabular-nums">{fmt(lineCost)}{frac != null && <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> · you earn {fmt(lineCost * frac)}</span>}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {b.notes && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 italic">&ldquo;{b.notes}&rdquo;</p>}
        {b.coupon_code && (
          <div className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2" data-testid={`req-coupon-${b.code}`}>
            <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 shrink-0">Coupon {b.coupon_code}</span>
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">Funded by AzoApp — your earning is not reduced.</span>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button data-testid={`accept-${b.code}`} onClick={doAccept} disabled={!!busy}
            className="flex-1 bg-primary-700 hover:bg-primary-800 text-white font-semibold h-11 rounded-xl">
            {busy === "accept" ? "Accepting…" : (<><CheckCircle2 className="h-4 w-4 mr-1.5" /> Accept Job</>)}
          </Button>
          <Button data-testid={`decline-${b.code}`} onClick={doDecline} disabled={!!busy} variant="outline"
            className="h-11 rounded-xl border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-4">
            {busy === "decline" ? "…" : (<><X className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Decline</span></>)}
          </Button>
        </div>
      </div>
    </Surface>
  );
}

const Meta = ({ icon: Icon, label, value, cap }) => (
  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
    <p className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</p>
    <p className={cx("text-[13px] font-semibold text-slate-800 dark:text-slate-100 mt-0.5 truncate", cap && "capitalize")}>{value}</p>
  </div>
);

export default function JobRequest({ jobs, loading, partnerId, online, connected, onAccept, onDecline, onReload }) {
  const now = useNow(1000);
  const [expiryMin, setExpiryMin] = useState(5);
  useEffect(() => {
    api.get("/auth/config").then((r) => {
      const v = r.data?.business?.job_auto_expiry_minutes;
      if (v) setExpiryMin(Number(v));
    }).catch(() => {});
  }, []);
  const lastUpdated = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="w-full space-y-4" data-testid="jobs-list">
      {/* live status bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cx("relative flex h-2.5 w-2.5", online ? "" : "opacity-60")}>
            {online && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
            <span className={cx("relative inline-flex rounded-full h-2.5 w-2.5", online ? "bg-emerald-500" : "bg-slate-400")} />
          </span>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{online ? "Online — receiving requests" : "Offline"}</p>
          <StatusBadge status={connected ? "active" : "pending"} dot className="hidden sm:inline-flex" />
          {jobs.length > 0 && <span className="text-xs text-slate-400 hidden sm:inline">· {jobs.length} nearby</span>}
        </div>
        <button onClick={onReload} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:opacity-70 shrink-0">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><SkeletonList n={3} /></div>
      ) : jobs.length === 0 ? (
        <Surface className="p-2 max-w-2xl mx-auto">
          <EmptyState
            icon={Radar}
            title={online ? "No new job requests" : "You're offline"}
            desc={online
              ? "Stay online to receive nearby service requests. New jobs will ring here instantly."
              : "Go online from the Dashboard to start receiving nearby service requests."}
          />
          <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center justify-between text-xs text-slate-400">
            <span>Live dispatch {connected ? "connected" : "reconnecting…"}</span>
            <span>Updated {lastUpdated}</span>
          </div>
        </Surface>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((b) => (
            <JobCard key={b.id} b={b} partnerId={partnerId} now={now} expiryMin={expiryMin} onAccept={onAccept} onDecline={onDecline} />
          ))}
        </div>
      )}
    </div>
  );
}
