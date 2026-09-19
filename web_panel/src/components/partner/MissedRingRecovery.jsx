import React, { useCallback, useEffect, useState } from "react";
import { WifiOff, RefreshCw, MapPin, Zap, Loader2, IndianRupee, Clock } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";

const REASON = {
  offline: "You were offline / on another job",
  no_answer: "You didn't answer the ring",
  taken_back: "Request re-opened",
};
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** Still-open jobs this partner missed while offline / unanswered — one-tap re-grab. */
export default function MissedRingRecovery({ onAccepted }) {
  const { subscribe } = useRealtime();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get("/bookings/partner/missed").then((r) => setRows(r.data || [])).catch(() => setRows([])), []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 20000);
    window.addEventListener("focus", load);
    window.addEventListener("azo-partner-online", load);
    return () => { clearInterval(iv); window.removeEventListener("focus", load); window.removeEventListener("azo-partner-online", load); };
  }, [load]);
  useEffect(() => subscribe((ev) => { if (["job_taken", "job_request", "job_update", "__resync__"].includes(ev?.type)) load(); }), [subscribe, load]);

  const regrab = async (j) => {
    setBusy(j.id);
    try {
      await api.post(`/bookings/${j.id}/accept`);
      toast.success("Job is yours!", { description: `${j.service_name} · ${j.code}` });
      setRows((r) => (r || []).filter((x) => x.id !== j.id));
      onAccepted?.(j);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not grab — it may have been taken");
      load();
    } finally { setBusy(""); }
  };

  if (!rows || rows.length === 0) return null;
  return (
    <div data-testid="missed-ring-recovery" className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 shadow-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-xl grid place-items-center bg-amber-500 text-white"><WifiOff className="h-5 w-5" /></span>
          <div>
            <h3 className="font-heading font-bold text-slate-900 dark:text-white leading-tight">You missed {rows.length} job{rows.length > 1 ? "s" : ""} while offline</h3>
            <p className="text-xs text-amber-800 dark:text-amber-200">Still open — grab one before someone else does.</p>
          </div>
        </div>
        <button onClick={load} className="text-xs text-amber-800 dark:text-amber-200 hover:underline inline-flex items-center gap-1" data-testid="missed-refresh"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((j) => (
          <div key={j.id} data-testid={`missed-job-${j.code}`} className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 p-3">
            {j.service_image
              ? <img src={j.service_image} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
              : <span className="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center shrink-0 text-slate-400"><Zap className="h-5 w-5" /></span>}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-slate-800 dark:text-white truncate flex items-center gap-1.5">
                {j.service_name}
                {j.schedule_type === "emergency" && <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded-full px-1.5">Emergency</span>}
              </p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate"><MapPin className="h-3 w-3" /> {j.address_line || j.city || "—"}{j.eta_min != null ? ` · ~${j.eta_min} min` : ""}</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1"><Clock className="h-3 w-3" /> {REASON[j.missed_reason] || "Missed"} · {ago(j.created_at)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-heading font-extrabold text-emerald-600 text-sm inline-flex items-center"><IndianRupee className="h-3.5 w-3.5" />{j.total ?? "—"}</p>
              <button data-testid={`regrab-now-${j.code}`} onClick={() => regrab(j)} disabled={!!busy}
                className="mt-1 h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60">
                {busy === j.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Grab now
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
