import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Camera, X, Send, Inbox, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { mediaSrc } from "@/lib/api";
import useProgressive, { LoadMoreSentinel } from "@/hooks/useProgressive";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIES = [["payment", "Payment"], ["booking", "Booking"], ["login", "Login"], ["account", "Account"], ["other", "Other"]];
const CAT_LABEL = Object.fromEntries(CATEGORIES);
const solved = (s) => s === "solved" || s === "closed";
const inputCls = "w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-200";

function BugRow({ b, onDelete }) {
  const ok = solved(b.status);
  return (
    <div data-testid={`bug-row-${b.id}`} className={`rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-2 ${ok ? "border-emerald-300" : "border-slate-200 dark:border-slate-700"}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <p className="flex-1 min-w-[140px] font-bold text-slate-800 dark:text-slate-100 break-words">{b.title}</p>
        {b.category ? <span data-testid={`bug-category-badge-${b.id}`} className="px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-[11px] font-extrabold text-primary-700">{CAT_LABEL[b.category] || "Other"}</span> : null}
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {ok ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{ok ? "Solved" : "Open"}
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{b.description}</p>
      {b.screenshot_url ? <a href={mediaSrc(b.screenshot_url)} target="_blank" rel="noreferrer"><img src={mediaSrc(b.screenshot_url)} alt="" className="h-24 w-24 rounded-lg border border-slate-200 object-cover" /></a> : null}
      {ok && b.resolution_note ? (
        <div className="flex gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2.5 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /><p><b>Resolution: </b>{b.resolution_note}</p>
        </div>
      ) : null}
      <div className="flex items-center justify-between pt-0.5">
        <p className="text-[11px] text-slate-400">{b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</p>
        {ok ? <button data-testid={`bug-delete-${b.id}`} onClick={() => onDelete(b)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" /> Delete</button> : null}
      </div>
    </div>
  );
}

/** Report a Bug — same form + "My Reports" list as the Partner app. */
export default function PartnerReportBug() {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("other");
  const [shot, setShot] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState(null);
  const [del, setDel] = useState(null);
  const fileRef = useRef();
  const load = useCallback(() => api.get("/bugs/my").then((r) => setRows(r.data || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const shown = useProgressive(rows || []);

  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Please choose an image");
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("doc_type", "bug");
      const { data } = await api.post("/support/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setShot({ url: data.url, thumb_url: data.thumb_url });
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    setUploading(false);
  };
  const submit = async () => {
    if (!title.trim()) return toast.error("Please add a short title");
    if (!desc.trim()) return toast.error("Please describe the bug");
    setSubmitting(true);
    try {
      await api.post("/bugs", { title: title.trim(), description: desc.trim(), category, screenshot_url: shot?.url || null });
      setTitle(""); setDesc(""); setCategory("other"); setShot(null); load();
      toast.success("Bug report sent — thank you!");
    } catch (err) { toast.error(err?.response?.data?.detail || "Could not send"); }
    setSubmitting(false);
  };
  const remove = async () => {
    const b = del; setDel(null);
    try { await api.delete(`/bugs/${b.id}`); load(); } catch (err) { toast.error(err?.response?.data?.detail || "Could not delete"); }
  };

  return (
    <div data-testid="partner-report-bug" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <section data-testid="bug-form" className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary-700 text-white flex items-center justify-center shrink-0"><Bug className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">Report a Bug</h2>
            <p className="text-xs text-slate-500">Found a problem in the app? Let us know and we'll fix it.</p>
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Title</span>
          <input data-testid="bug-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Earnings not updating" className={`${inputCls} h-11 mt-1.5`} />
        </label>
        <div>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Category</span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {CATEGORIES.map(([k, l]) => (
              <button key={k} type="button" data-testid={`bug-category-${k}`} onClick={() => setCategory(k)}
                className={`px-3.5 py-2 rounded-md border text-xs font-bold transition-colors ${category === k ? "bg-primary-700 border-primary-700 text-white" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-primary-300"}`}>{l}</button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Describe the bug</span>
          <textarea data-testid="bug-description" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={4000} rows={5} placeholder="What happened? What did you expect? Steps to reproduce…" className={`${inputCls} py-2.5 mt-1.5 resize-y`} />
        </label>
        <div>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Screenshot (optional)</span>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} data-testid="bug-file-input" />
          {shot ? (
            <div className="flex items-center gap-3 mt-1.5">
              <img src={mediaSrc(shot.thumb_url || shot.url)} alt="" className="h-[72px] w-[72px] rounded-lg border border-slate-200 object-cover" />
              <button data-testid="bug-remove-shot" onClick={() => setShot(null)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300"><X className="h-4 w-4" /> Remove</button>
            </div>
          ) : (
            <button data-testid="bug-attach-shot" disabled={uploading} onClick={() => fileRef.current?.click()} className="mt-1.5 w-full h-11 rounded-md border border-dashed border-primary-400 bg-slate-50 dark:bg-slate-800 text-primary-700 dark:text-primary-300 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {uploading ? <span className="h-4 w-4 rounded-full border-2 border-primary-200 border-t-primary-700 animate-spin" /> : <><Camera className="h-4 w-4" /> Attach screenshot</>}
            </button>
          )}
        </div>
        <button data-testid="bug-submit" disabled={submitting} onClick={submit} className="w-full h-12 rounded-md bg-primary-700 hover:bg-primary-800 text-white font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.99] transition-transform">
          {submitting ? <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <><Send className="h-4 w-4" /> Submit Bug Report</>}
        </button>
      </section>

      <section className="space-y-3" data-testid="bug-list">
        <h3 className="font-heading font-extrabold text-slate-900 dark:text-white">My Reports</h3>
        {rows === null ? (
          <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div data-testid="bug-empty" className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-400">
            <Inbox className="h-7 w-7 mx-auto" /><p className="text-sm mt-1.5">No bug reports yet.</p>
          </div>
        ) : (
          <>
            {shown.items.map((b) => <BugRow key={b.id} b={b} onDelete={setDel} />)}
            <LoadMoreSentinel list={shown} testId="bugs-load-more" />
          </>
        )}
      </section>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete report?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes your bug report.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="bug-delete-confirm" onClick={remove} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
