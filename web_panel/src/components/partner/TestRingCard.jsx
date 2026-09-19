import React, { useEffect, useState } from "react";
import { BellRing, Loader2, CheckCircle2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { usePushDeviceState, openPushPrompt } from "@/components/PushRegistrar";

/** Partner self-check: fire a synthetic job ring at this account via SSE + push. */
export default function TestRingCard() {
  const { perm, registered } = usePushDeviceState();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null); // {sentAt, push, doneAt, verb}

  useEffect(() => {
    const h = (e) => setLast((l) => (l ? { ...l, doneAt: Date.now(), verb: e.detail?.verb } : l));
    window.addEventListener("azo-test-ring-done", h);
    return () => window.removeEventListener("azo-test-ring-done", h);
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/partner/test-ring");
      setLast({ sentAt: Date.now(), push: data.push || {}, doneAt: null });
      const p = data.push || {};
      if ((p.success || 0) > 0) toast.success("Test ring sent — screen ring + push notification on your device");
      else toast("Test ring sent to this screen", { description: p.skipped === "no_devices" ? "Push (browser-closed) skipped: this device is not registered yet — tap Fix in the bell menu." : p.error ? `Push failed: ${p.error}` : "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send test ring");
    } finally { setBusy(false); }
  };

  const pushOk = perm === "granted" && registered === true;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-4 sm:p-5" data-testid="test-ring-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-11 w-11 rounded-xl grid place-items-center bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"><BellRing className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 className="font-heading font-bold text-slate-900 dark:text-white leading-tight">Alert check</h3>
            <p className="text-xs text-slate-400">Ring this phone like a real job to confirm sound, vibration &amp; push.</p>
            <p className="text-[11px] mt-1 flex items-center gap-1.5" data-testid="test-ring-device-state">
              <Smartphone className="h-3.5 w-3.5" />
              {pushOk ? <span className="text-emerald-600 font-semibold">Background push: ON (device registered)</span>
                : perm === "denied" ? <span className="text-red-600 font-semibold">Background push: blocked in browser</span>
                : <span className="text-amber-600 font-semibold">Background push: OFF (device not registered)</span>}
              {!pushOk && <button type="button" onClick={openPushPrompt} className="text-primary-700 dark:text-primary-300 font-semibold hover:underline" data-testid="test-ring-fix">Fix</button>}
            </p>
          </div>
        </div>
        <button data-testid="test-ring-send" onClick={send} disabled={busy}
          className="h-10 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Send me a test job ring
        </button>
      </div>
      {last && (
        <div className="mt-3 text-[11px] rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 flex flex-wrap gap-x-4 gap-y-1" data-testid="test-ring-result">
          <span className="text-slate-600 dark:text-slate-300">Sent {new Date(last.sentAt).toLocaleTimeString()}</span>
          <span className="text-emerald-600">Screen ring: delivered via live connection</span>
          <span className={(last.push?.success || 0) > 0 ? "text-emerald-600" : "text-amber-600"}>
            Push: {(last.push?.success || 0) > 0 ? `sent to ${last.push.success} device(s)` : last.push?.skipped === "no_devices" ? "skipped — device not registered" : last.push?.error ? `failed (${last.push.error})` : "not sent"}
          </span>
          {last.doneAt && <span className="text-emerald-700 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> You {last.verb} it in {((last.doneAt - last.sentAt) / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  );
}
