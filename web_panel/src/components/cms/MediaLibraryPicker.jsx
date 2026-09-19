import { useEffect, useRef, useState } from "react";
import { X, UploadCloud, Search, Trash2, Check, Copy, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { uploadImage } from "@/lib/imageUpload";
import { toast } from "sonner";

/**
 * Media Library modal. Browse + upload + search + pick an image.
 * onSelect(url) is called with the chosen image URL. Used across CMS editors.
 */
export default function MediaLibraryPicker({ open, onClose, onSelect, folder = "media" }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const fileRef = useRef();

  const load = () => api.get("/media").then((r) => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
  useEffect(() => { if (open) load(); }, [open]);
  if (!open) return null;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setPct(0);
    try {
      const data = await uploadImage(api, file, { folder, onProgress: setPct });
      toast.success("Uploaded");
      await load();
      onSelect?.(data.url);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); setPct(0); if (fileRef.current) fileRef.current.value = ""; }
  };

  const del = async (id) => { await api.delete(`/media/${id}`); load(); };
  const list = (rows || []).filter((m) => !q || `${m.original || ""} ${m.name || ""} ${m.folder || ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" data-testid="media-library-modal">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white">Media Library</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media…" data-testid="media-search"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/40" />
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="media-upload-btn"
            className="h-10 px-4 rounded-lg bg-[#0D47A1] hover:bg-[#0b3c88] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-70">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" />{pct || 1}%</> : <><UploadCloud className="h-4 w-4" />Upload</>}
          </button>
          <input ref={fileRef} type="file" accept="image/*,.svg" className="hidden" onChange={pick} />
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {rows === null ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-square rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}</div>
          ) : list.length === 0 ? (
            <p className="text-center text-slate-400 py-16 text-sm">No media found. Upload your first image.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {list.map((m) => (
                <div key={m.id} className="relative group rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700 bg-slate-50 dark:bg-slate-800">
                  <button type="button" onClick={() => { onSelect?.(m.url); onClose?.(); }} data-testid="media-item" className="block w-full aspect-square">
                    <img src={m.thumb_url || m.url} alt={m.original || ""} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 p-1.5 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(m.url); toast.success("URL copied"); }} className="h-6 w-6 rounded bg-white/90 text-slate-700 flex items-center justify-center"><Copy className="h-3 w-3" /></button>
                    <button type="button" onClick={() => del(m.id)} className="h-6 w-6 rounded bg-red-500 text-white flex items-center justify-center"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  <button type="button" onClick={() => { onSelect?.(m.url); onClose?.(); }} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-[#0D47A1] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><Check className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
