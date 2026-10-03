import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowRight, AlertTriangle, Check } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isPriced } from "./pricingUtils";

const SCOPES = [
  { k: "services", label: "Service prices" },
  { k: "mrp", label: "MRP values" },
  { k: "addons", label: "Add-on prices" },
  { k: "fees", label: "Fees & charges" },
  { k: "ratecards", label: "Rate cards" },
  { k: "categories", label: "Category availability" },
];

export default function CopyCityDialog({ cities, to, onClose, onDone }) {
  const sources = cities.filter((c) => c.configured && c.city !== to);
  const [from, setFrom] = useState(sources[0]?.city || "");
  const [pct, setPct] = useState(0);
  const [scopes, setScopes] = useState(() => new Set(SCOPES.map((s) => s.k)));
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!from) return;
    setSrc(null);
    api.get(`/admin/price-manager/city/${encodeURIComponent(from)}`).then((r) => setSrc(r.data)).catch(() => setSrc(null));
  }, [from]);

  const counts = useMemo(() => {
    if (!src) return null;
    const sp = src.prices || {};
    const services = src.all_services.filter((s) => isPriced(s, sp[s.id])).length;
    const addons = Object.values(sp).reduce((n, v) => n + Object.values(v?.addons || {}).filter((x) => Number(x) > 0).length, 0);
    const mrp = Object.values(sp).filter((v) => Number(v?.mrp) > 0).length;
    const rc = Object.keys(src.ratecards || {}).length;
    return { services, addons, mrp, rc, cats: (src.categories || []).length };
  }, [src]);

  const toggle = (k) => setScopes((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const run = async () => {
    setBusy(true);
    try {
      await api.post("/admin/price-manager/copy", { from, to, adjust_pct: Number(pct) || 0, include: [...scopes] });
      toast.success(`Pricing copied from ${from} to ${to}`);
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Copy failed"); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="pm-copy-dialog">
        <DialogHeader><DialogTitle className="text-[17px]">Copy Prices from City</DialogTitle></DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="flex-1 text-[13px] font-semibold text-slate-600">Source City
                <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-[14px]" data-testid="pm-copy-from">
                  {sources.map((c) => <option key={c.city_key} value={c.city}>{c.city}</option>)}
                </select>
              </label>
              <ArrowRight className="h-4 w-4 text-slate-400 mt-5" />
              <div className="flex-1 text-[13px] font-semibold text-slate-600">Target City
                <div className="mt-1 h-10 rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800 px-2.5 text-[14px] flex items-center font-bold text-slate-800 dark:text-slate-100">{to}</div>
              </div>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-slate-600 mb-1.5">What to copy</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SCOPES.map((s) => (
                  <label key={s.k} data-testid={`pm-copy-scope-${s.k}`}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[13px] cursor-pointer ${scopes.has(s.k) ? "border-[#0D47A1]/40 bg-[#0D47A1]/[0.05]" : "border-slate-200 dark:border-slate-700"}`}>
                    <input type="checkbox" checked={scopes.has(s.k)} onChange={() => toggle(s.k)} className="h-4 w-4 rounded border-slate-300 text-[#0D47A1]" />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="block text-[13px] font-semibold text-slate-600">Adjust prices by %
              <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 h-10" data-testid="pm-copy-pct" />
              <span className="text-[12px] text-slate-400 font-normal">e.g. 10 = 10% higher, -5 = 5% lower</span>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!from || !scopes.size} className="bg-[#0D47A1] hover:bg-[#0B3C8A]" data-testid="pm-copy-review">Review Changes</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="pm-copy-review-step">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-[13px]">
              <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Copying from <b>{from}</b> → <b>{to}</b>{Number(pct) ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}</p>
              {!src ? <div className="py-2 flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading preview…</div> : (
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {scopes.has("services") && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" />{counts?.services} priced services</li>}
                  {scopes.has("addons") && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" />{counts?.addons} add-on prices</li>}
                  {scopes.has("mrp") && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" />{counts?.mrp} MRP values</li>}
                  {scopes.has("ratecards") && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" />{counts?.rc} rate-card rows</li>}
                  {scopes.has("categories") && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" />{counts?.cats} category toggles</li>}
                  {scopes.has("fees") && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" />Fees & charges</li>}
                </ul>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              This will copy the selected pricing configuration into <b>{to}</b>. Existing {to} values for these items will be overwritten.
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={run} disabled={busy} className="bg-[#0D47A1] hover:bg-[#0B3C8A]" data-testid="pm-copy-confirm">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply Copy"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
