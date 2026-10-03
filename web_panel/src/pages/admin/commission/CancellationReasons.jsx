import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical, Loader2, MessageSquareX } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { errMsg, fmtDate } from "./shared";

export function buildReasons(settings) {
  const meta = settings?.cancellation_reasons_meta;
  if (Array.isArray(meta) && meta.length) return meta.map((m, i) => ({ id: m.id || `r${i}`, text: m.text, active: m.active !== false, updated_at: m.updated_at || null }));
  return (settings?.cancellation_reasons || []).map((t, i) => ({ id: `r${i}-${Date.now()}`, text: t, active: true, updated_at: null }));
}

function ReasonDialog({ initial, onClose, onSubmit }) {
  const [text, setText] = useState(initial?.text || "");
  const [active, setActive] = useState(initial ? initial.active : true);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) return toast.error("Reason name is required");
    setBusy(true);
    const ok = await onSubmit({ text: text.trim(), active });
    if (!ok) setBusy(false);
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md text-[14px]" data-testid="reason-dialog">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold">{initial ? "Edit Reason" : "Add Cancellation Reason"}</DialogTitle>
          <DialogDescription className="text-[12.5px]">Customers pick one of these reasons when cancelling a booking.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1">Reason Name</label>
            <Input autoFocus maxLength={120} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Booked by mistake" className="h-10 text-[14px] rounded-lg" data-testid="reason-name-input" />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1">Status</label>
            <div className="inline-flex rounded-lg border border-[#E5E7EB] dark:border-slate-700 p-0.5">
              {[[true, "Active"], [false, "Inactive"]].map(([v, l]) => (
                <button key={l} type="button" onClick={() => setActive(v)} data-testid={`reason-status-${l.toLowerCase()}`}
                  className={`h-8 px-4 rounded-md text-[13px] font-medium transition-colors ${active === v ? "bg-[#0D47A1] text-white" : "text-slate-600 dark:text-slate-300 hover:text-slate-900"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-[#F9FAFB] dark:bg-slate-800/40 p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Preview</p>
            <div className={`flex items-center gap-2 rounded-md border bg-white dark:bg-slate-900 px-3 py-2 text-[13.5px] ${active ? "border-[#E5E7EB] text-slate-700 dark:text-slate-200" : "border-slate-100 text-slate-400 line-through"}`}>
              <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 shrink-0" />{text.trim() || "Your reason"}
            </div>
            <p className="text-[12px] text-slate-500 mt-1.5">{active ? "This reason will appear to customers during cancellation." : "Inactive — hidden from customers until re-activated."}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" className="h-9 text-[13.5px]" onClick={onClose}>Cancel</Button>
          <Button className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={submit} disabled={busy} data-testid="reason-submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : initial ? "Save Reason" : "Add Reason"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasonRow({ r, i, onToggle, onEdit, onDelete, drag }) {
  return (
    <tr draggable onDragStart={() => drag.start(i)} onDragOver={(e) => { e.preventDefault(); drag.over(i); }} onDrop={drag.drop} onDragEnd={drag.end}
      className={`border-b border-[#F1F2F4] dark:border-slate-800 last:border-0 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${drag.overIdx === i ? "bg-blue-50/60" : ""}`} data-testid={`cancel-reason-row-${i}`}>
      <td className="pl-3 pr-1 py-2.5 w-8"><GripVertical className="h-4 w-4 text-slate-300 cursor-grab" /></td>
      <td className="px-3 py-2.5 text-[13.5px] text-[#111827] dark:text-white" data-testid={`cancel-reason-text-${i}`}>{r.text}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Switch checked={r.active} onCheckedChange={() => onToggle(i)} data-testid={`cancel-reason-toggle-${i}`} />
          <span className={`text-[12px] font-medium ${r.active ? "text-[#15803D]" : "text-slate-400"}`}>{r.active ? "Active" : "Inactive"}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-[12.5px] text-slate-500 whitespace-nowrap">{fmtDate(r.updated_at)}</td>
      <td className="pl-3 pr-4 py-2.5 text-right whitespace-nowrap">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#0D47A1]" onClick={() => onEdit(i)} data-testid={`cancel-reason-edit-${i}`}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#DC2626] hover:bg-red-50" onClick={() => onDelete(i)} data-testid={`remove-cancel-reason-${i}`}><Trash2 className="h-3.5 w-3.5" /></Button>
      </td>
    </tr>
  );
}

export default function CancellationReasons({ reasons, setReasons }) {
  const [dialog, setDialog] = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const persist = async (next, msg) => {
    const prev = reasons;
    setReasons(next);
    try {
      await api.put("/admin/settings", {
        cancellation_reasons: next.filter((r) => r.active).map((r) => r.text),
        cancellation_reasons_meta: next.map(({ id, text, active, updated_at }) => ({ id, text, active, updated_at })),
      });
      if (msg) toast.success(msg);
      return true;
    } catch (e) { setReasons(prev); toast.error(errMsg(e)); return false; }
  };
  const now = () => new Date().toISOString();
  const submit = async ({ text, active }) => {
    const next = dialog.index == null
      ? [...reasons, { id: `r${Date.now()}`, text, active, updated_at: now() }]
      : reasons.map((r, i) => (i === dialog.index ? { ...r, text, active, updated_at: now() } : r));
    const ok = await persist(next, dialog.index == null ? "Reason added" : "Reason updated");
    if (ok) setDialog(null);
    return ok;
  };
  const toggle = (i) => persist(reasons.map((r, idx) => (idx === i ? { ...r, active: !r.active, updated_at: now() } : r)), "Status updated");
  const drag = {
    overIdx,
    start: (i) => setDragIdx(i),
    over: (i) => setOverIdx(i),
    end: () => { setDragIdx(null); setOverIdx(null); },
    drop: () => {
      if (dragIdx == null || overIdx == null || dragIdx === overIdx) return;
      const next = [...reasons];
      const [m] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, m);
      persist(next, "Order updated");
    },
  };

  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 overflow-hidden" data-testid="cancel-reasons-editor">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 border-b border-[#E5E7EB] dark:border-slate-800">
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-semibold text-[#111827] dark:text-white">Cancellation Reasons</h2>
          <p className="text-[12.5px] text-[#6B7280]">Manage the reasons customers can select when cancelling a booking. Applies to all categories; an &quot;Other&quot; free-text option is always added. Drag to reorder.</p>
        </div>
        <Button className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none shrink-0" onClick={() => setDialog({ index: null })} data-testid="add-cancel-reason"><Plus className="h-4 w-4" /> Add Reason</Button>
      </div>
      {reasons.length === 0 ? (
        <div className="py-12 text-center"><MessageSquareX className="h-8 w-8 mx-auto text-slate-300" /><p className="mt-2 text-[13.5px] text-slate-500">No reasons yet — add a few so customers can pick one.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-[#F9FAFB] dark:bg-slate-800/50 border-b border-[#E5E7EB] dark:border-slate-800">
                {["", "Reason", "Status", "Last Updated", "Action"].map((h, i) => <th key={i} className={`py-2.5 text-[12px] font-semibold uppercase tracking-wide text-[#6B7280] ${i === 4 ? "text-right pl-3 pr-4" : "text-left px-3"}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {reasons.map((r, i) => <ReasonRow key={r.id} r={r} i={i} drag={drag} onToggle={toggle} onEdit={(idx) => setDialog({ index: idx })} onDelete={setConfirmIdx} />)}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <ReasonDialog initial={dialog.index == null ? null : reasons[dialog.index]} onClose={() => setDialog(null)} onSubmit={submit} />}
      <AlertDialog open={confirmIdx != null} onOpenChange={(o) => !o && setConfirmIdx(null)}>
        <AlertDialogContent className="max-w-sm" data-testid="reason-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[16px]">Delete this reason?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">&quot;{reasons[confirmIdx]?.text}&quot; will no longer be shown to customers. Past cancellations are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-[13.5px]">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9 text-[13.5px] bg-[#DC2626] hover:bg-[#B91C1C]" data-testid="reason-delete-confirm-btn"
              onClick={() => { const i = confirmIdx; setConfirmIdx(null); persist(reasons.filter((_, idx) => idx !== i), "Reason deleted"); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
