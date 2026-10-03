import { useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function CopyCityDialog({ cities, to, onClose, onDone }) {
  const sources = cities.filter((c) => c.configured && c.city !== to);
  const [from, setFrom] = useState(sources[0]?.city || "");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api.post("/admin/price-manager/copy", { from, to, adjust_pct: Number(pct) || 0 });
      toast.success(`Prices copied from ${from} to ${to}`);
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Copy failed"); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="pm-copy-dialog">
        <DialogHeader><DialogTitle>Copy prices to {to}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">Source city ke saare prices, categories, fees aur rate card {to} me copy honge ({to} ke purane prices replace ho jayenge).</p>
        <label className="text-sm font-medium">From city
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-slate-200 px-2" data-testid="pm-copy-from">
            {sources.map((c) => <option key={c.city_key} value={c.city}>{c.city}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Adjust prices by %
          <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1" data-testid="pm-copy-pct" />
          <span className="text-xs text-slate-400">e.g. 10 = 10% mehnga, -5 = 5% sasta</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={!from || busy} className="bg-[#0D47A1]" data-testid="pm-copy-confirm">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Copy"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
