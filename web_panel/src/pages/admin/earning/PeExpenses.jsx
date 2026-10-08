import { useEffect, useMemo, useState } from "react";
import { Wallet2, Plus, Pencil, Trash2, Loader2, Search, History } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { Section, Bar, C, inr, pct, num, dtt, useSection } from "@/pages/admin/earning/peShared";
import { Pager } from "@/pages/admin/earning/PeTables";

const MODE_LABEL = { bank_transfer: "Bank Transfer", upi: "UPI", card: "Card", cash: "Cash", cheque: "Cheque", other: "Other" };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const BLANK = { date: "", category: "", amount: "", description: "", vendor: "", payment_mode: "bank_transfer", reference: "" };

function ExpenseDialog({ open, initial, meta, onClose, onSaved }) {
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(null);
  if (open && key !== (initial?.id || "new")) { setKey(initial?.id || "new"); setF(initial ? { ...BLANK, ...initial, amount: String(initial.amount) } : { ...BLANK, date: todayISO() }); }
  if (!open && key) setKey(null);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const valid = f.date && f.category && Number(f.amount) > 0;
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const body = { ...f, amount: Number(f.amount) };
      ["id", "created_by", "created_at", "updated_at", "updated_by", "history", "deleted"].forEach((k) => delete body[k]);
      if (initial?.id) await api.put(`/admin/platform-earning/expenses/${initial.id}`, body);
      else await api.post("/admin/platform-earning/expenses", body);
      toast.success(initial?.id ? "Expense updated" : "Expense recorded");
      onSaved();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(Array.isArray(d) ? d.map((x) => x.msg).join(", ") : d || "Could not save expense");
    } finally { setBusy(false); }
  };
  const cats = (meta?.categories || []).map((c) => ({ value: c, label: c }));
  const modes = (meta?.payment_modes || Object.keys(MODE_LABEL)).map((m) => ({ value: m, label: MODE_LABEL[m] || m }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="pe-expense-dialog">
        <DialogHeader><DialogTitle className="font-heading">{initial?.id ? "Edit expense" : "Record operating expense"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[12px] font-semibold text-slate-600 block mb-1">Date *</label><PremiumDatePicker data-testid="pe-exp-date" value={f.date} max={todayISO()} onChange={(e) => set("date", e.target.value)} /></div>
          <div><label className="text-[12px] font-semibold text-slate-600 block mb-1">Amount (₹) *</label><Input data-testid="pe-exp-amount" type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" /></div>
          <div className="col-span-2"><label className="text-[12px] font-semibold text-slate-600 block mb-1">Category *</label><PremiumSelect data-testid="pe-exp-category" value={f.category} onChange={(e) => set("category", e.target.value)} options={cats} placeholder="Select category" searchable /></div>
          <div className="col-span-2"><label className="text-[12px] font-semibold text-slate-600 block mb-1">Description</label><Input data-testid="pe-exp-description" value={f.description} maxLength={300} onChange={(e) => set("description", e.target.value)} placeholder="e.g. October office rent" /></div>
          <div><label className="text-[12px] font-semibold text-slate-600 block mb-1">Vendor / Paid to</label><Input data-testid="pe-exp-vendor" value={f.vendor} maxLength={120} onChange={(e) => set("vendor", e.target.value)} /></div>
          <div><label className="text-[12px] font-semibold text-slate-600 block mb-1">Payment mode</label><PremiumSelect data-testid="pe-exp-mode" value={f.payment_mode} onChange={(e) => set("payment_mode", e.target.value)} options={modes} /></div>
          <div className="col-span-2"><label className="text-[12px] font-semibold text-slate-600 block mb-1">Reference / Invoice no.</label><Input data-testid="pe-exp-reference" value={f.reference} maxLength={80} onChange={(e) => set("reference", e.target.value)} /></div>
        </div>
        {initial?.history?.length > 0 && (
          <div className="mt-1 rounded-xl bg-slate-50 p-3 max-h-32 overflow-y-auto" data-testid="pe-exp-history">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1 mb-1"><History className="h-3 w-3" />Audit</p>
            {initial.history.map((h, i) => <p key={i} className="text-[11.5px] text-slate-600"><b className="capitalize">{h.action}</b> by {h.by?.name} · {dtt(h.at)}{h.amount_before != null && h.amount_before !== h.amount ? ` · ${inr(h.amount_before)} → ${inr(h.amount)}` : ""}</p>)}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} data-testid="pe-exp-cancel">Cancel</Button>
          <Button disabled={!valid || busy} onClick={save} data-testid="pe-exp-save" className="bg-[#0D47A1] hover:bg-[#0B3C8A]">{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{initial?.id ? "Save changes" : "Add expense"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PeExpenses({ range, onChanged, innerRef, openSignal }) {
  const [page, setPage] = useState(1); const [size, setSize] = useState(10);
  const [q, setQ] = useState(""); const [tick, setTick] = useState(0);
  const [dlg, setDlg] = useState(null);
  useEffect(() => { setPage(1); }, [range]);
  const [lastSignal, setLastSignal] = useState(openSignal);
  if (openSignal !== lastSignal) { setLastSignal(openSignal); if (openSignal) setDlg({}); }
  const params = useMemo(() => ({ date_from: range.from || undefined, date_to: range.to || undefined, q: q || undefined, page, page_size: size, _t: tick || undefined }), [range, q, page, size, tick]);
  const meta = useSection("/admin/platform-earning/expenses/meta", { _t: tick || undefined });
  const st = useSection("/admin/platform-earning/expenses", params);
  const d = st.data;
  const changed = () => { setDlg(null); setTick((t) => t + 1); onChanged?.(); };
  const remove = async (row) => {
    if (!window.confirm(`Delete expense of ${inr(row.amount)} (${row.category})? It will be removed from P&L; audit trail is kept.`)) return;
    try { await api.delete(`/admin/platform-earning/expenses/${row.id}`); toast.success("Expense deleted"); changed(); }
    catch { toast.error("Could not delete expense"); }
  };
  return (
    <div ref={innerRef}>
      <Section testid="pe-expenses" title="Operating Expenses" subtitle="Recorded costs used for Net Profit — only what you enter here is counted" icon={Wallet2} tone={C.red} state={st}
        actions={<Button size="sm" data-testid="pe-add-expense" onClick={() => setDlg({})} className="h-8 gap-1 bg-[#0D47A1] hover:bg-[#0B3C8A]"><Plus className="h-4 w-4" />Add expense</Button>}>
        {d && <div className="grid lg:grid-cols-[minmax(0,300px)_1fr] gap-6">
          <div>
            <p className="text-[11px] font-semibold text-slate-500">Total in period</p>
            <p data-testid="pe-exp-total" className="font-heading font-extrabold text-[24px] tabular-nums" style={{ color: C.red }}>{inr(d.amount, 0)}</p>
            <p className="text-[11px] text-slate-400 mb-4">{num(d.total)} expense entr{d.total === 1 ? "y" : "ies"}</p>
            <div className="space-y-2.5">
              {d.by_category.map((c) => (
                <div key={c.category} data-testid={`pe-exp-cat-${c.category}`}>
                  <div className="flex justify-between text-[12.5px]"><span className="text-slate-700 truncate">{c.category}</span><span className="font-semibold tabular-nums">{inr(c.amount, 0)} <span className="text-[11px] text-slate-400 font-normal">{pct(c.pct, 0)}</span></span></div>
                  <div className="mt-1"><Bar value={c.pct} color={C.red} /></div>
                </div>
              ))}
              {!d.by_category.length && <p className="text-[12px] text-slate-400">No expenses recorded for this period. Net Profit shows "Expense data not configured" until the first expense is added.</p>}
            </div>
          </div>
          <div className="min-w-0">
            <div className="relative mb-3 max-w-sm"><Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><Input data-testid="pe-exp-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search description, vendor, reference" className="pl-9 h-9" /></div>
            <div className="rounded-xl border border-slate-100 overflow-auto max-h-[420px]">
              <table className="w-full text-[13px] min-w-[640px]">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500"><tr>{["Date", "Category", "Description / Vendor", "Mode", "Amount", ""].map((h, i) => <th key={i} className={`sticky top-0 bg-slate-50 px-3 py-2.5 font-semibold ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {d.rows.map((r, i) => (
                    <tr key={r.id} data-testid={`pe-exp-row-${i}`} className="border-t border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 text-[12px]">{new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{r.category}</td>
                      <td className="px-3 py-2.5 max-w-[240px]"><span className="block truncate text-slate-700">{r.description || "—"}</span><span className="block truncate text-[11px] text-slate-400">{[r.vendor, r.reference].filter(Boolean).join(" · ")}</span></td>
                      <td className="px-3 py-2.5 text-[12px] text-slate-500">{MODE_LABEL[r.payment_mode] || r.payment_mode}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: C.red }}>{inr(r.amount)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button data-testid={`pe-exp-edit-${i}`} onClick={() => setDlg(r)} className="p-1.5 rounded-md text-slate-400 hover:text-[#0D47A1] hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
                        <button data-testid={`pe-exp-delete-${i}`} onClick={() => remove(r)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  {!d.rows.length && <tr><td colSpan={6} className="py-8 text-center text-[13px] text-slate-400">No expenses {q ? "match your search" : "in this period"}</td></tr>}
                </tbody>
              </table>
            </div>
            {d.total > 0 && <Pager testid="pe-exp-pager" page={page} pageSize={size} total={d.total} onPage={setPage} onSize={(s) => { setSize(s); setPage(1); }} />}
          </div>
        </div>}
      </Section>
      <ExpenseDialog open={!!dlg} initial={dlg?.id ? dlg : null} meta={meta.data} onClose={() => setDlg(null)} onSaved={changed} />
    </div>
  );
}
