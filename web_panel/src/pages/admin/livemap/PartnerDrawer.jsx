import { X, Star, Clock, AlertTriangle, Briefcase, CheckCircle2 } from "lucide-react";
import { statusColor, statusLabel, isWorking, timeAgo, inr } from "@/lib/partnerSim";

function StatusPill({ status }) {
  const c = statusColor(status);
  return (
    <span data-testid="drawer-status-pill" className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: `${c}1A`, color: c }}>
      <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {statusLabel(status)}
    </span>
  );
}

function Freshness({ p }) {
  if (p.status === "offline") {
    return <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" /> Last seen {timeAgo(p.lastUpdate)}</span>;
  }
  const fresh = Date.now() - p.lastUpdate < 60000;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${fresh ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
      <span className={`h-2 w-2 rounded-full ${fresh ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} /> {fresh ? "Live" : "Idle"} · Updated {timeAgo(p.lastUpdate)}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

export default function PartnerDrawer({ partner: p, onClose }) {
  if (!p) return null;
  const working = isWorking(p.status);
  const job = p.activeJob;
  return (
    <div className="fixed inset-0 z-[9995] flex justify-end" data-testid="partner-drawer">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} data-testid="drawer-backdrop" />
      <aside className="relative w-full max-w-[420px] h-full bg-white dark:bg-[#0f1729] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col animate-[slideInRight_.25s_ease]">
        {/* header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between mb-4">
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">Partner Profile</span>
            <button data-testid="drawer-close" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src={p.avatar} alt={p.name} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white dark:ring-slate-800 shadow" />
              <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white dark:border-[#0f1729]" style={{ background: statusColor(p.status) }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{p.name}</h3>
              <p className="text-sm text-primary-600 dark:text-primary-400 font-semibold">{p.category}</p>
              <div className="flex items-center gap-2 mt-1">
                {p.rating != null && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {p.rating}</span>}
                <StatusPill status={p.status} />
              </div>
            </div>
          </div>
          <div className="mt-3"><Freshness p={p} /></div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* status-specific banner */}
          {p.status === "available" && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/15 p-4" data-testid="drawer-available">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Available for new jobs</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-emerald-800/80 dark:text-emerald-200/70">
                <span>Service · <b>{p.category}</b></span>
                <span>Radius · <b>{p.coverageRadiusKm} km</b></span>
                <span>Location · <b>{p.city}</b></span>
                <span>Updated · <b>{timeAgo(p.lastUpdate)}</b></span>
              </div>
            </div>
          )}
          {working && job && (
            <div className={`rounded-2xl border p-4 ${p.status === "delayed" ? "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15" : "border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/15"}`} data-testid="drawer-job">
              <div className="flex items-center justify-between">
                <p className={`flex items-center gap-2 text-sm font-bold ${p.status === "delayed" ? "text-amber-700 dark:text-amber-300" : "text-blue-700 dark:text-blue-300"}`}>
                  {p.status === "delayed" ? <AlertTriangle className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />} {p.status === "delayed" ? "Delayed" : "Current Job"}
                </p>
                <span className="text-xs font-mono text-slate-400">#{job.bookingCode}</span>
              </div>
              <p className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">{job.service}</p>
              <div className="mt-2 space-y-1.5 text-xs">
                <Row label="Customer" value={job.customer} />
                <Row label="Location" value={p.city} />
                <Row label="Started" value={new Date(job.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                {p.status === "delayed" ? (
                  <>
                    <Row label="Promised ETA" value={`${job.promisedMin} min`} />
                    <Row label="Current ETA" value={<span className="text-amber-600">{job.etaMin} min</span>} />
                    <Row label="Delay" value={<span className="text-amber-600 font-bold">+{Math.max(0, job.etaMin - job.promisedMin)} min</span>} />
                  </>
                ) : (
                  <Row label="ETA" value={`${job.etaMin} min · ${job.distanceKm} km`} />
                )}
              </div>
            </div>
          )}
          {p.status === "offline" && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4" data-testid="drawer-offline">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-300"><Clock className="h-4 w-4" /> Offline</p>
              <p className="mt-1 text-xs text-slate-400">Last known location · <b className="text-slate-600 dark:text-slate-300">{p.city}</b></p>
              <p className="text-xs text-slate-400">Last seen {timeAgo(p.lastUpdate)}</p>
            </div>
          )}

          {/* profile stats */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <Row label="Partner ID" value={p.partnerId} />
            <Row label="Phone" value={p.phone} />
            <Row label="Category" value={p.categories.join(", ")} />
            <Row label="City" value={p.city} />
            <Row label="Coordinates" value={`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`} />
            <Row label="Rating" value={p.rating != null ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{p.rating}</span> : "—"} />
            <Row label="Completed Jobs" value={p.completedJobs.toLocaleString("en-IN")} />
            <Row label="Today's Jobs" value={p.todayJobs} />
            <Row label="Today's Earnings" value={inr(p.todayEarnings)} />
            <Row label="Online Duration" value={p.online ? `${Math.floor((Date.now() - p.onlineSince) / 3600000)}h ${Math.floor(((Date.now() - p.onlineSince) % 3600000) / 60000)}m` : "—"} />
          </div>
        </div>
      </aside>
    </div>
  );
}
