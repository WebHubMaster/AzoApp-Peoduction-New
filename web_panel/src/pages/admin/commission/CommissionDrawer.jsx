import { useState } from "react";
import { Loader2, CheckCircle2, ChevronDown, Calculator } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { COMM, CANC, EMPTY, KEYS, sum, ok100, round2, inr, errMsg, toRates } from "./shared";

function PctField({ k, label, hint, f, set, dot }) {
  const v = f[k];
  const bad = v !== "" && (Number(v) < 0 || Number(v) > 100);
  return (
    <div className="min-w-0">
      <label className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1">
        {dot && <span className={`h-2 w-2 rounded-sm ${dot}`} />}{label}
      </label>
      <div className="relative">
        <Input type="number" min="0" max="100" step="0.01" inputMode="decimal" data-testid={`cc-${k}`} value={v ?? ""} placeholder="0"
          onChange={(e) => set(k, e.target.value)} className={`h-10 pr-8 text-[14px] rounded-lg tabular-nums ${bad ? "border-red-400 focus-visible:ring-red-100" : ""}`} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">%</span>
      </div>
      {hint && <p className="text-[11.5px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Group({ title, total, tid, children, hint }) {
  const good = ok100(total);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14px] font-semibold text-[#111827] dark:text-white">{title}</p>
          <p className="text-[12px] text-[#6B7280]">{hint}</p>
        </div>
        <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-md tabular-nums transition-colors ${good ? "bg-green-50 text-[#15803D]" : "bg-red-50 text-[#B91C1C]"}`} data-testid={tid}>Total {round2(total)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
      {!good && <p className="text-[12px] text-[#DC2626]">Must total exactly 100%.</p>}
    </section>
  );
}

function Preview({ f }) {
  const [amt, setAmt] = useState(1000);
  const a = Number(amt) || 0;
  const share = (k) => round2((a * (Number(f[k]) || 0)) / 100);
  return (
    <section className="rounded-xl border border-[#E5E7EB] dark:border-slate-700 bg-[#F9FAFB] dark:bg-slate-800/40 p-3.5" data-testid="cc-simulator">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Calculator className="h-4 w-4 text-[#2563EB]" /> Live calculation</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-slate-500">Booking amount</span>
          <div className="relative w-28">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">₹</span>
            <Input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} className="h-8 pl-6 text-[13px] rounded-md tabular-nums" data-testid="cc-sim-amount" />
          </div>
        </div>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 gap-px mb-3">
        {COMM.map((c) => <div key={c.k} style={{ width: `${Math.max(0, Math.min(100, Number(f[c.k]) || 0))}%` }} className={`${c.bar} cc-bar-seg`} />)}
      </div>
      <div className="space-y-1.5">
        {COMM.map((c) => (
          <div key={c.k} className="flex items-center gap-2 text-[13px]" data-testid={`cc-sim-${c.k}`}>
            <span className={`h-2 w-2 rounded-sm ${c.dot}`} />
            <span className="text-slate-600 dark:text-slate-300">{c.k === "partner_pct" ? "Partner Earnings" : c.label}</span>
            <b className="ml-auto tabular-nums text-[#111827] dark:text-white">{inr(share(c.k))}</b>
          </div>
        ))}
        <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-2" />
        <div className="flex items-center text-[12.5px] text-slate-500"><span>If cancelled before work starts — customer refund</span><b className="ml-auto tabular-nums text-slate-700 dark:text-slate-200" data-testid="cc-sim-refund">{inr(share("customer_refund_pct"))}</b></div>
        <div className="flex items-center text-[12.5px] text-slate-500"><span>Partner cancellation charge</span><b className="ml-auto tabular-nums text-slate-700 dark:text-slate-200" data-testid="cc-sim-pcancel">{inr(share("partner_cancellation_pct"))}</b></div>
      </div>
      <p className="text-[11.5px] text-slate-400 mt-2.5 leading-snug">GST excluded. If a merchant share isn&apos;t applicable, it is absorbed by Platform.</p>
    </section>
  );
}

function CategoryPicker({ list, ids, setIds, title, tid }) {
  const [open, setOpen] = useState(true);
  const all = list.length > 0 && ids.length === list.length;
  const toggle = (id) => setIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <section className="rounded-xl border border-[#E5E7EB] dark:border-slate-700" data-testid={tid}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-[13.5px] font-semibold text-slate-700 dark:text-slate-200">
        <span>{title} <span className="font-normal text-slate-400">({ids.length} selected)</span></span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3 space-y-2">
          <label className="flex items-center gap-2 text-[12.5px] text-slate-500 cursor-pointer">
            <Checkbox checked={all} onCheckedChange={() => setIds(all ? [] : list.map((x) => x.id))} data-testid={`${tid}-all`} /> Select all
          </label>
          <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 pr-1">
            {list.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300 cursor-pointer min-w-0">
                <Checkbox checked={ids.includes(o.id)} onCheckedChange={() => toggle(o.id)} data-testid={`cc-apply-${o.id}`} />
                <span className="truncate">{o.name}</span>
                {!o.configured && <span className="text-[10.5px] font-semibold text-[#DC2626] shrink-0">required</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const TITLES = {
  single: ["Configure Commission", null],
  bulk: ["Bulk Configure", "Apply one commission & refund rule to multiple categories at once."],
  default: ["Platform Default Split", "Fallback used only for categories that are not configured yet."],
};

export default function CommissionDrawer({ mode, cat, categories, defaults, onClose, onSaved }) {
  const seed = mode === "single" ? cat?.commission : mode === "default" ? defaults : null;
  const [f, setF] = useState(seed ? Object.fromEntries(KEYS.map((k) => [k, seed[k] ?? ""])) : EMPTY);
  const [ids, setIds] = useState(mode === "bulk" ? categories.filter((c) => !c.configured).map((c) => c.id) : []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const commTotal = sum(f, COMM);
  const cancTotal = sum(f, CANC);
  const filled = KEYS.every((k) => f[k] !== "" && f[k] != null && Number(f[k]) >= 0 && Number(f[k]) <= 100);
  const valid = filled && ok100(commTotal) && ok100(cancTotal) && (mode !== "bulk" || ids.length > 0);
  const others = categories.filter((c) => c.id !== cat?.id);

  const save = async () => {
    if (!valid) return toast.error(mode === "bulk" && !ids.length ? "Select at least one category" : "Fill all fields — each split must total 100%");
    setBusy(true);
    const rates = toRates(f);
    try {
      if (mode === "single") {
        await api.put(`/admin/category-commissions/${cat.id}`, rates);
        if (ids.length) await api.post("/admin/category-commissions/bulk", { category_ids: ids, rates });
        toast.success(`Commission saved for ${cat.name}${ids.length ? ` + ${ids.length} more` : ""}`);
      } else if (mode === "bulk") {
        await api.post("/admin/category-commissions/bulk", { category_ids: ids, rates });
        toast.success(`Commission applied to ${ids.length} ${ids.length === 1 ? "category" : "categories"}`);
      } else {
        await api.put("/admin/settings", { commission: { ...(defaults || {}), ...rates } });
        toast.success("Platform default split saved");
      }
      setDone(true);
      setTimeout(onSaved, 650);
    } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };

  const [title, sub] = TITLES[mode];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0 text-[14px]" data-testid="cc-modal">
        <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] dark:border-slate-800 text-left space-y-0.5">
          <SheetTitle className="text-[17px] font-semibold text-[#111827] dark:text-white">{title}</SheetTitle>
          <SheetDescription className="text-[12.5px] text-[#6B7280]">
            {mode === "single" ? <>Category: <b className="text-slate-700 dark:text-slate-200" data-testid="cc-drawer-category">{cat.name}</b> · {cat.service_count} services</> : sub}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 relative">
          {mode === "bulk" && <CategoryPicker list={categories} ids={ids} setIds={setIds} title="Categories" tid="cc-bulk-picker" />}
          <Group title="Commission Split" hint="Of service cost, GST excluded" total={commTotal} tid="cc-comm-total">
            {COMM.map((c) => <PctField key={c.k} k={c.k} label={c.label} f={f} set={set} dot={c.dot} />)}
          </Group>
          <Preview f={f} />
          <Group title="Refund Policy" hint="Customer cancels before work starts" total={cancTotal} tid="cc-canc-total">
            {CANC.map((c) => <PctField key={c.k} k={c.k} label={c.label} hint={c.hint} f={f} set={set} />)}
          </Group>
          {mode === "single" && others.length > 0 && <CategoryPicker list={others} ids={ids} setIds={setIds} title="Also apply to (optional)" tid="cc-apply-others" />}
          {done && (
            <div className="absolute inset-0 bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm grid place-items-center" data-testid="cc-save-success">
              <div className="text-center cc-pop"><CheckCircle2 className="h-12 w-12 mx-auto text-[#16A34A]" /><p className="mt-2 text-[14px] font-semibold text-[#111827] dark:text-white">Saved</p></div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] dark:border-slate-800 flex justify-end gap-2 bg-white dark:bg-slate-900">
          <Button variant="outline" className="h-9 text-[13.5px]" onClick={onClose} data-testid="cc-cancel">Cancel</Button>
          <Button onClick={save} disabled={busy || !valid} className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none min-w-[140px]" data-testid="cc-save">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "default" ? "Save Default" : "Save Commission"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
