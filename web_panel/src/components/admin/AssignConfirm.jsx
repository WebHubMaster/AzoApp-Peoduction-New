import React from "react";
import { Star, Phone, MapPin, Clock, MessageCircle, X, Wrench, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Human "free in ~X" label for a partner who is currently on a job. */
export const busyLabel = (p) => {
  if (!p?.busy) return "";
  const m = p.busy_free_in_min;
  if (m == null) return "On a job";
  if (m < 60) return `Free in ~${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `Free in ~${h}h${r ? ` ${r}m` : ""}`;
};

/**
 * AssignConfirm — small confirmation sheet shown before a manual partner assignment.
 * Props: partner (row from /eligible-partners or /dispatch-attention), booking {code, service_name},
 * busy (saving flag), onConfirm(), onCancel().
 */
export default function AssignConfirm({ partner: p, booking, busy, onConfirm, onCancel }) {
  if (!p) return null;
  const status = p.availability || (p.busy ? "busy" : (p.partner_status === "online" ? "online" : "offline"));
  const statusLabel = status === "busy" ? "On a job" : status === "online" ? "Online" : "Offline";
  const statusCls = status === "busy" ? "bg-amber-100 text-amber-700" : status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  const area = p.area || [p.city, (p.service_pincodes || [])[0]].filter(Boolean).join(" ") || "—";
  const wa = `https://wa.me/${String(p.phone || "").replace(/[^\d]/g, "")}`;
  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel} data-testid="assign-confirm">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0 ${status === "offline" ? "bg-slate-100 text-slate-500" : "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"}`}>{(p.name || "P").charAt(0)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Confirm assignment</p>
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white truncate">{p.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
              {p.nearby && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Nearby area</span>}
              {p.category && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{p.category}</span>}
              {p.rating != null && <span className="text-[10px] flex items-center gap-0.5 text-slate-500"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating}</span>}
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" /> Reach time</p>
            <p className="font-semibold text-slate-800 dark:text-slate-100 mt-0.5" data-testid="assign-confirm-eta">
              {p.eta_min != null ? `~${p.eta_min} min` : "—"}{p.distance_km != null && <span className="text-slate-400 font-normal"> · {p.distance_km} km</span>}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> Area</p>
            <p className="font-semibold text-slate-800 dark:text-slate-100 mt-0.5 truncate">{area}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 col-span-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</p>
              <p className="font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{p.phone || "—"}</p>
            </div>
            {p.phone && (<>
              <a href={`tel:${p.phone}`} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white" title="Call"><Phone className="h-4 w-4" /></a>
              <a href={wa} target="_blank" rel="noreferrer" className="h-9 w-9 rounded-lg border border-emerald-200 flex items-center justify-center text-emerald-600 hover:bg-emerald-50" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>
            </>)}
          </div>
        </div>

        {booking && (
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> Job <b className="text-slate-700 dark:text-slate-200">#{booking.code}</b> · {booking.service_name}</p>
        )}

        {status === "busy" && (
          <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200 flex gap-2" data-testid="assign-confirm-busy">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              This partner is currently on <b>{p.busy_job_service || "another job"}</b>{p.busy_job_code ? ` (#${p.busy_job_code})` : ""} — expected to be <b>{busyLabel(p).toLowerCase()}</b>. They will take this job after finishing.
            </span>
          </div>
        )}
        {status === "offline" && (
          <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-600 dark:text-slate-300 flex gap-2" data-testid="assign-confirm-offline">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Partner is <b>offline</b>. They will be notified by in-app alert + SMS — please confirm by phone first.</span>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy} data-testid="assign-confirm-cancel">Cancel</Button>
          <Button className={`flex-1 ${status === "offline" ? "bg-slate-700 hover:bg-slate-800" : "bg-primary-700 hover:bg-primary-800"}`} onClick={onConfirm} disabled={busy} data-testid="assign-confirm-ok">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Assigning…</> : status === "offline" ? "Force assign" : "Confirm assign"}
          </Button>
        </div>
      </div>
    </div>
  );
}
