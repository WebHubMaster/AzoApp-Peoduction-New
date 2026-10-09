import React, { useEffect, useState } from "react";
import { CheckCircle2, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { shortId } from "./bugUtils";

const MIN = 5;
const MAX = 1000;

export default function ResolveDialog({ bug, saving, onCancel, onConfirm }) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (bug) { setNote(bug.resolution_note || ""); setTouched(false); } }, [bug]);
  const len = note.trim().length;
  const error = len < MIN ? `Please write at least ${MIN} characters.` : len > MAX ? `Keep it under ${MAX} characters.` : "";
  const submit = () => { setTouched(true); if (!error && !saving) onConfirm(note.trim()); };

  return (
    <Dialog open={!!bug} onOpenChange={(o) => { if (!o && !saving) onCancel(); }}>
      <DialogContent data-testid="bug-resolve-dialog" className="sm:max-w-lg rounded-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Resolve bug</DialogTitle>
          <DialogDescription className="break-words"><span className="font-mono text-xs">{bug && shortId(bug.id)}</span> · {bug?.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="bug-note" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Resolution note <span className="text-rose-500">*</span></label>
          <Textarea id="bug-note" data-testid="bug-resolve-note" value={note} rows={5} maxLength={MAX + 50} onBlur={() => setTouched(true)} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Fixed in version 1.2.4. Please update the app and try again." aria-invalid={touched && !!error} className={touched && error ? "border-rose-400 focus-visible:ring-rose-200" : ""} />
          <div className="flex items-center justify-between text-xs">
            {touched && error ? <span data-testid="bug-resolve-error" className="text-rose-600">{error}</span> : <span className="flex items-center gap-1 text-slate-500"><Eye className="h-3.5 w-3.5" />The reporter will see this note in their app.</span>}
            <span className="tabular-nums text-slate-400">{len}/{MAX}</span>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button type="button" data-testid="bug-resolve-cancel" disabled={saving} onClick={onCancel} className="h-10 px-4 rounded-md border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Cancel</button>
          <button type="button" data-testid="bug-resolve-confirm" disabled={saving} onClick={submit} className="h-10 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
            {saving ? "Saving…" : <><CheckCircle2 className="h-4 w-4" />Mark Solved & Notify</>}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
