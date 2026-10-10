import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Trash2, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import useProgressive, { LoadMoreSentinel } from "@/hooks/useProgressive";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const PARTNER_NOTIFS_CHANGED = "azo-partner-notifs-changed";

const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/** Full Notifications page — same list/logic as the Partner app (remove one, clear all). */
export default function PartnerNotificationsPage() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = useCallback(() => api.get("/notifications").then((r) => setItems(Array.isArray(r.data) ? r.data : r.data?.items || [])).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  const { subscribe } = useRealtime();
  useEffect(() => subscribe("notification", load), [subscribe, load]);
  const shown = useProgressive(items || []);
  const changed = () => window.dispatchEvent(new Event(PARTNER_NOTIFS_CHANGED));

  const removeOne = async (id) => {
    const prev = items;
    setItems((p) => p.filter((n) => n.id !== id));
    try { await api.delete(`/notifications/${id}`); changed(); } catch { setItems(prev); toast.error("Could not remove notification"); }
  };
  const clearAll = async () => {
    const prev = items;
    setBusy(true); setItems([]);
    try { await api.delete("/notifications"); changed(); toast.success("All notifications cleared"); } catch { setItems(prev); toast.error("Could not clear notifications"); }
    setBusy(false); setConfirm(false);
  };

  return (
    <div data-testid="partner-notifications-page" className="max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary-700 text-white flex items-center justify-center shrink-0"><Bell className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">Notifications</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{items?.length ? `${items.length} notification${items.length > 1 ? "s" : ""}` : "Job rings, booking updates and payouts"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button data-testid="notif-refresh" onClick={load} className="h-9 w-9 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
          {items?.length ? (
            <button data-testid="notif-clear-all" disabled={busy} onClick={() => setConfirm(true)} className="h-9 px-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-red-100 disabled:opacity-60">
              <Trash2 className="h-4 w-4" /> Clear all
            </button>
          ) : null}
        </div>
      </div>

      {items === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div data-testid="notif-empty" className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <Bell className="h-8 w-8 mx-auto text-slate-300" />
          <p className="font-semibold text-slate-700 dark:text-slate-200 mt-2">No notifications</p>
          <p className="text-sm text-slate-500">Job rings, booking updates and payouts will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.items.map((n, i) => (
            <div key={n.id || i} data-testid={`notif-row-${n.id || i}`} className="flex gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 transition-colors hover:border-primary-200">
              <div className="h-10 w-10 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0"><BellRing className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 break-words">{n.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">{n.body || n.message}</p>
                <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
              </div>
              <button data-testid={`notif-remove-${n.id}`} onClick={() => removeOne(n.id)} aria-label="Remove" className="h-7 w-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 shrink-0"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <LoadMoreSentinel list={shown} testId="notif-load-more" />
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>This removes every notification from your list. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="notif-clear-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="notif-clear-confirm" onClick={clearAll} className="bg-red-600 hover:bg-red-700">Clear all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
