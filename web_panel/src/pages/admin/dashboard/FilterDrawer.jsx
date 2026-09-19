import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Search, X, SlidersHorizontal, RotateCcw } from "lucide-react";

/* Premium searchable single-select. options: [{value,label}] or strings */
export function ComboSelect({ value, onChange, options = [], placeholder = "Select", testid, className = "", label, clearable = true, searchable = true }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef(null); const pop = useRef(null); const inp = useRef(null);
  const [rect, setRect] = useState(null);
  const opts = useMemo(() => options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)), [options]);
  const cur = opts.find((o) => o.value === value);
  const list = useMemo(() => (q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts), [opts, q]);

  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (ref.current?.contains(e.target) || pop.current?.contains(e.target)) return; setOpen(false); };
    const re = () => ref.current && setRect(ref.current.getBoundingClientRect());
    document.addEventListener("mousedown", down); window.addEventListener("resize", re); window.addEventListener("scroll", re, true);
    setTimeout(() => inp.current?.focus(), 30);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("resize", re); window.removeEventListener("scroll", re, true); };
  }, [open]);
  useEffect(() => { setHi(0); }, [q, open]);

  const openIt = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()); setQ(""); setOpen(true); };
  const pick = (v) => { onChange(v); setOpen(false); };
  const onKey = (e) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && list[hi]) pick(list[hi].value);
  };
  const w = rect ? Math.max(rect.width, 220) : 240;
  const below = rect ? window.innerHeight - rect.bottom > 320 : true;
  const style = rect ? { position: "fixed", left: Math.min(rect.left, window.innerWidth - w - 8), width: w, zIndex: 120, ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }) } : {};

  return (
    <div className={className}>
      {label && <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">{label}</p>}
      <button ref={ref} type="button" data-testid={testid} onClick={openIt}
        className={`w-full h-11 px-3 rounded-xl border bg-white dark:bg-slate-900 text-sm flex items-center gap-2 transition-all duration-150 ${open ? "border-primary-500 ring-2 ring-primary-100" : cur ? "border-primary-200 hover:border-primary-400" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
        <span className={`flex-1 text-left truncate ${cur ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>{cur ? cur.label : placeholder}</span>
        {cur && clearable ? (
          <span role="button" data-testid={testid ? `${testid}-clear` : undefined} onClick={(e) => { e.stopPropagation(); onChange(""); }} className="h-5 w-5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 grid place-items-center"><X className="h-3.5 w-3.5" /></span>
        ) : <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={pop} style={style} data-testid={testid ? `${testid}-menu` : undefined}
              initial={{ opacity: 0, y: below ? -4 : 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: below ? -4 : 4, scale: 0.98 }} transition={{ duration: 0.12 }}
              className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-2xl shadow-slate-900/15 p-1.5">
              {searchable && (
                <div className="relative mb-1">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search…" data-testid={testid ? `${testid}-search` : undefined}
                    className="w-full h-9 pl-8 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:bg-white" />
                </div>
              )}
              <div className="max-h-60 overflow-y-auto">
                <button type="button" onClick={() => pick("")} className={`w-full flex items-center justify-between px-2.5 h-9 rounded-lg text-sm transition-colors ${!value ? "bg-primary-50 text-primary-800 font-semibold" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>{placeholder}{!value && <Check className="h-4 w-4" />}</button>
                {list.map((o, i) => (
                  <button key={o.value} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)} data-testid={testid ? `${testid}-opt-${String(o.value).replace(/\s+/g, "_")}` : undefined}
                    className={`w-full flex items-center justify-between px-2.5 h-9 rounded-lg text-sm transition-colors ${o.value === value ? "bg-primary-50 text-primary-800 font-semibold" : hi === i ? "bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100" : "text-slate-700 dark:text-slate-200"}`}>
                    <span className="truncate">{o.label}</span>{o.value === value && <Check className="h-4 w-4" />}
                  </button>
                ))}
                {list.length === 0 && <p className="px-2.5 py-3 text-xs text-slate-400 text-center">No matches for “{q}”</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </div>
  );
}

/* Right-side drawer with all analytics filters. defs: [{key, label, options}] */
export function FilterDrawer({ open, onClose, defs, values, onChange, onClear, activeCount }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="fd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] flex justify-end" onMouseDown={onClose} data-testid="filter-drawer-overlay">
          <motion.aside onMouseDown={(e) => e.stopPropagation()} data-testid="filter-drawer"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="h-full w-full max-w-[420px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 grid place-items-center"><SlidersHorizontal className="h-4 w-4" /></span>
                <div><p className="font-heading font-bold text-slate-900 dark:text-white">Filters</p><p className="text-[11px] text-slate-400">{activeCount ? `${activeCount} active` : "Narrow every metric on the dashboard"}</p></div>
              </div>
              <button onClick={onClose} data-testid="filter-drawer-close" className="h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 grid place-items-center"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {defs.map((f) => (
                <ComboSelect key={f.key} label={f.label} placeholder={f.placeholder} options={f.options} value={values[f.key]} onChange={(v) => onChange(f.key, v)} testid={`filter-${f.key}`} />
              ))}
              {defs.length === 0 && <p className="text-sm text-slate-400">No filterable data yet.</p>}
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={onClear} data-testid="filter-drawer-clear" className="h-10 px-3 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Clear all</button>
              <button onClick={onClose} data-testid="filter-drawer-apply" className="h-10 px-5 rounded-xl text-sm font-bold bg-primary-700 text-white hover:bg-primary-800 shadow-sm">Done</button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>, document.body);
}
