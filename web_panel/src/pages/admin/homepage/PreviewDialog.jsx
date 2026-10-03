import { useState } from "react";
import { Monitor, Tablet, Smartphone, ExternalLink, RotateCw, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const DEVICES = [["desktop", "Desktop", Monitor, "100%"], ["tablet", "Tablet", Tablet, "820px"], ["mobile", "Mobile", Smartphone, "390px"]];

export default function PreviewDialog({ onClose, dirty }) {
  const [dev, setDev] = useState("desktop");
  const [key, setKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const width = DEVICES.find((d) => d[0] === dev)[3];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[min(96vw,1600px)] w-full h-[92vh] p-0 gap-0 flex flex-col overflow-hidden" data-testid="hp-preview-dialog">
        <DialogHeader className="px-4 py-3 border-b border-[#E5E7EB] dark:border-slate-800 flex-row items-center gap-3 space-y-0 pr-12">
          <div className="min-w-0 flex-1 text-left">
            <DialogTitle className="text-[16px] font-semibold">Customer Homepage</DialogTitle>
            <DialogDescription className="text-[12px]">{dirty ? "Showing the published homepage — save your changes to see them here." : "Live preview of the published homepage."}</DialogDescription>
          </div>
          <div className="inline-flex rounded-lg border border-[#E5E7EB] dark:border-slate-700 p-0.5" role="tablist">
            {DEVICES.map(([k, l, I]) => (
              <button key={k} role="tab" aria-selected={dev === k} onClick={() => { setDev(k); }} data-testid={`hp-preview-${k}`}
                className={`h-8 px-3 rounded-md inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors ${dev === k ? "bg-[#0D47A1] text-white" : "text-slate-600 dark:text-slate-300 hover:text-slate-900"}`}><I className="h-3.5 w-3.5" /><span className="hidden sm:inline">{l}</span></button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Reload preview" onClick={() => { setLoading(true); setKey((k) => k + 1); }}><RotateCw className="h-4 w-4" /></Button>
          <Button variant="outline" className="h-8 text-[13px] hidden sm:inline-flex" onClick={() => window.open("/", "_blank", "noopener")}><ExternalLink className="h-3.5 w-3.5" /> Open</Button>
        </DialogHeader>
        <div className="flex-1 bg-[#EEF0F3] dark:bg-slate-950 overflow-auto flex justify-center p-3">
          <div className="relative h-full bg-white shadow-xl rounded-lg overflow-hidden transition-[width] duration-300 ease-out max-w-full" style={{ width }}>
            {loading && <div className="absolute inset-0 grid place-items-center bg-white"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
            <iframe key={key} title="Homepage preview" src="/" onLoad={() => setLoading(false)} className="h-full w-full border-0" data-testid="hp-preview-frame" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
