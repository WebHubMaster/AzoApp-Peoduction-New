import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, CalendarClock, ChevronDown, Loader2, Send } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { initials } from "../bookings/shared";
import { fmtDate } from "./subShared";

const daysLeft = (iso) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(`${iso}T00:00:00`) - t) / 86400000); };
const leftText = (n) => (n <= 0 ? "Ends today" : n === 1 ? "Ends tomorrow" : `Ends in ${n} days`);
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

function Item({ s, busy, onNudge, onOpen }) {
  const n = daysLeft(s.end_date);
  const last = s.last_renewal_nudge?.at;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[#F1F2F4] dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors" data-testid={`renewal-row-${s.code}`}>
      <span className="h-7 w-7 rounded-full grid place-items-center text-[10.5px] font-semibold bg-blue-50 text-[#0D47A1] shrink-0">{initials(s.customer_name)}</span>
      <button type="button" onClick={() => onOpen(s)} className="min-w-0 flex-1 text-left">
        <p className="text-[13.5px] text-[#111827] dark:text-white truncate"><span className="font-mono font-semibold text-[#0D47A1]">#{s.code}</span> · {s.customer_name}</p>
        <p className="text-[11.5px] text-slate-400 truncate">{s.plan_label} · {s.partner_name || "Unassigned"} · ends {fmtDate(s.end_date)}</p>
      </button>
      <span className={`hidden sm:inline-flex h-[22px] px-2 rounded-md text-[11.5px] font-medium ring-1 items-center ${n <= 1 ? "bg-red-50 text-[#B91C1C] ring-red-600/15" : "bg-amber-50 text-[#B45309] ring-amber-600/15"}`}>{leftText(n)}</span>
      <span className="hidden md:block w-24 text-right text-[11.5px] text-slate-400" data-testid={`renewal-last-${s.code}`}>{last ? `Nudged ${ago(last)}` : "Not nudged"}</span>
      <Button variant="outline" disabled={busy} className="h-7 px-2.5 text-[12.5px] shrink-0" onClick={() => onNudge([s.id])} data-testid={`renewal-nudge-${s.code}`}><Send className="h-3.5 w-3.5" /> Nudge</Button>
    </div>
  );
}

export default function RenewalsPanel({ refreshKey, onOpen }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/subscriptions/admin/renewals", { params: { days: 3 } }).then((r) => setRows(r.data || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const nudge = async (ids) => {
    setBusy(true);
    try {
      const { data } = await api.post("/subscriptions/admin/renewals/nudge", { ids });
      toast.success(data.sent === 1 ? "Renewal reminder sent" : `Renewal reminders sent to ${data.sent} customers`);
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send reminder"); } finally { setBusy(false); }
  };
  if (!rows) return null;
  const pending = rows.filter((s) => !s.last_renewal_nudge);
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 overflow-hidden" data-testid="renewals-panel">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="h-8 w-8 rounded-lg grid place-items-center bg-amber-50 text-[#B45309] shrink-0"><CalendarClock className="h-4 w-4" /></span>
        <button type="button" onClick={() => setOpen((o) => !o)} disabled={!rows.length} className="min-w-0 flex-1 text-left" data-testid="renewals-toggle">
          <p className="text-[14px] font-semibold text-[#111827] dark:text-white">Renewals due <span className="ml-1 text-[11.5px] font-semibold text-[#B45309] bg-amber-50 rounded px-1.5 py-0.5" data-testid="renewals-count">{rows.length}</span></p>
          <p className="text-[12px] text-slate-500 truncate">{rows.length ? "Active subscriptions ending in the next 3 days — remind customers to renew." : "No subscriptions are ending in the next 3 days."}</p>
        </button>
        {rows.length > 1 && <Button disabled={busy} className="h-8 text-[12.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none shrink-0" onClick={() => nudge((pending.length ? pending : rows).map((s) => s.id))} data-testid="renewals-nudge-all">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />} Nudge {pending.length ? `${pending.length} pending` : "all"}</Button>}
        {rows.length > 0 && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
      </div>
      {open && rows.length > 0 && <div className="cc-rise">{rows.map((s) => <Item key={s.id} s={s} busy={busy} onNudge={nudge} onOpen={onOpen} />)}</div>}
    </section>
  );
}
