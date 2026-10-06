import { useEffect, useState, useCallback } from "react";
import { UserX, RefreshCcw, Loader2, Star, CalendarClock, ShieldAlert } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function fmtDate(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function SuspendedPartners() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/partners/suspended")
      .then((r) => setRows(r.data?.partners || []))
      .catch(() => toast.error("Could not load suspended partners"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const reactivate = async (p) => {
    setBusyId(p.id);
    try {
      await api.post(`/admin/partners/${p.id}/unsuspend`);
      toast.success(`${p.name} reactivated`);
      load();
    } catch {
      toast.error("Reactivation failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="suspended-partners-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white flex items-center gap-2">
            <UserX className="h-6 w-6 text-rose-600" /> Suspended Partners
          </h1>
          <p className="text-slate-500 text-sm">All currently suspended partner profiles. Reactivate any partner manually before their suspension ends.</p>
        </div>
        <Button variant="outline" data-testid="suspended-refresh" onClick={load} className="gap-2">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center text-slate-500" data-testid="suspended-empty">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          No suspended partners right now.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-left">
              <tr>
                {["Partner", "Partner ID", "Rating", "Suspended On", "Reactivates On", "Type", ""].map((h) => (
                  <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800" data-testid={`suspended-row-${p.id}`}>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</div>
                    {p.phone ? <div className="text-xs text-slate-400">{p.phone}</div> : null}
                    {p.reason ? <div className="text-xs text-rose-500 mt-0.5">{p.reason}</div> : null}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{p.partner_id}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> {p.rating?.toFixed ? p.rating.toFixed(1) : p.rating}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtDate(p.suspended_at)}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-slate-400" /> {fmtDate(p.suspend_until)}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.auto ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>
                      {p.auto ? "Auto (low rating)" : "Manual"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" data-testid={`reactivate-${p.id}`} disabled={busyId === p.id} onClick={() => reactivate(p)} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                      {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Reactivate
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
