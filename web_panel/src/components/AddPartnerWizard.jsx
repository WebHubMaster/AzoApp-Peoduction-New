import { useState } from "react";
import api from "@/lib/api";
import { phoneInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Phone, ArrowRight } from "lucide-react";
import PartnerRegistration from "@/pages/partner/PartnerRegistration";

/**
 * Add-partner flow for Admin (basePrefix="/admin") and Merchant (basePrefix="/merchant").
 * Step 1 captures the phone and creates a partner "shell"; then it opens the EXACT
 * same full registration wizard the partner uses (via /partners/{uid}/reg/* proxy).
 */
export default function AddPartnerWizard({ open, onOpenChange, basePrefix = "/admin", onCreated }) {
  const [phone, setPhone] = useState("");
  const [uid, setUid] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setPhone(""); setUid(null); setBusy(false); };
  const close = (v) => { if (!v) reset(); onOpenChange(v); };

  const createShell = async () => {
    if (!phone.trim()) return toast.error("Enter partner's mobile number");
    setBusy(true);
    try {
      const { data } = await api.post(`${basePrefix}/partners/shell`, { phone: phone.trim() });
      setUid(data.user_id);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not start registration"); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={uid ? "max-w-3xl max-h-[92vh] overflow-y-auto" : "max-w-md"}>
        <DialogHeader><DialogTitle>Add Partner{uid ? " — Registration" : ""}</DialogTitle></DialogHeader>
        {!uid ? (
          <div className="space-y-4" data-testid="add-partner-phone">
            <p className="text-sm text-slate-500">Enter the partner&apos;s mobile number to begin. You&apos;ll then fill the full registration wizard on their behalf.</p>
            <div className="relative">
              <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input data-testid="shell-phone" className="pl-9" inputMode="tel" placeholder="Mobile number (+91…)" value={phone} onChange={(e) => setPhone(phoneInput(e.target.value))} />
            </div>
            <Button data-testid="shell-continue" onClick={createShell} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">
              {busy ? "Starting…" : <>Continue to registration <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </div>
        ) : (
          <PartnerRegistration
            regBase={`${basePrefix}/partners/${uid}/reg`}
            embedded
            onComplete={() => { toast.success("Partner registered & sent for verification"); close(false); onCreated?.(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
