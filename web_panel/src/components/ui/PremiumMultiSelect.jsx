import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search, X } from "lucide-react";

/**
 * PremiumMultiSelect — global premium multi-select.
 * value: array of values. onChange(nextArray).
 * options: [{ value, label, disabled, keywords }] OR <option> children.
 * Features: chips, search, Select All / Clear All, selected count, checkboxes,
 * keyboard support, mobile bottom-sheet, viewport-aware portal positioning.
 */
export default function PremiumMultiSelect({
  value = [],
  onChange,
  children,
  options: optionsProp,
  placeholder = "Select...",
  className = "",
  disabled = false,
  searchable,
  loading = false,
  maxChips = 3,
  showSelectAll = true,
  "data-testid": testId,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  const selectedVals = Array.isArray(value) ? value.map(String) : [];

  const options = useMemo(() => {
    if (Array.isArray(optionsProp)) return optionsProp.map((o) => ({ value: o.value, label: o.label ?? String(o.value), disabled: !!o.disabled, keywords: o.keywords }));
    const out = [];
    React.Children.forEach(children, (ch) => {
      if (!ch || !ch.props) return;
      const raw = ch.props.children;
      const toText = (n) => (n == null || typeof n === "boolean") ? "" : (typeof n === "string" || typeof n === "number") ? String(n) : Array.isArray(n) ? n.map(toText).join("") : (n.props && n.props.children != null) ? toText(n.props.children) : "";
      const label = toText(raw).trim();
      out.push({ value: ch.props.value ?? "", label: label || String(ch.props.value ?? ""), disabled: !!ch.props.disabled });
    });
    return out;
  }, [optionsProp, children]);

  const showSearch = searchable ?? options.length > 7;
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => String(o.label).toLowerCase().includes(q) || String(o.keywords || "").toLowerCase().includes(q));
  }, [options, query]);

  const selectedOpts = options.filter((o) => selectedVals.includes(String(o.value)));

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const measure = useCallback(() => { if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect()); }, []);
  const openMenu = useCallback(() => { if (disabled || loading) return; measure(); setQuery(""); setHighlight(0); setOpen(true); }, [disabled, loading, measure]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onScrollResize = () => { if (!isMobile) measure(); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    setTimeout(() => searchRef.current?.focus(), 30);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onScrollResize); window.removeEventListener("scroll", onScrollResize, true); };
  }, [open, isMobile, measure]);

  const toggle = useCallback((opt) => {
    if (opt.disabled) return;
    const v = String(opt.value);
    const next = selectedVals.includes(v) ? selectedVals.filter((x) => x !== v) : [...selectedVals, v];
    const mapped = options.filter((o) => next.includes(String(o.value))).map((o) => o.value);
    onChange?.(mapped);
  }, [selectedVals, options, onChange]);

  const selectAll = () => onChange?.(options.filter((o) => !o.disabled).map((o) => o.value));
  const clearAll = () => onChange?.([]);

  const onKeyDown = (e) => {
    if (!open && (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ")) { e.preventDefault(); openMenu(); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(filtered.length - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    if (e.key === "Enter") { e.preventDefault(); const o = filtered[highlight]; if (o) toggle(o); }
  };

  const menuList = (
    <div ref={menuRef} data-testid={testId ? `${testId}-menu` : undefined}
      className={isMobile
        ? "fixed inset-x-0 bottom-0 z-[9999] max-h-[75vh] rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl border-t border-slate-200 dark:border-slate-700 flex flex-col animate-[slideUp_.18s_ease]"
        : "fixed z-[9999] rounded-xl bg-white dark:bg-slate-900 shadow-xl ring-1 ring-black/5 dark:ring-white/10 border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"}
      style={isMobile ? {} : rect ? { top: rect.bottom + 6, left: rect.left, width: rect.width, maxHeight: Math.min(340, window.innerHeight - rect.bottom - 20) } : {}}>
      {isMobile && (
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{placeholder}</span>
          <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400"><X className="h-5 w-5" /></button>
        </div>
      )}
      {showSearch && (
        <div className="p-2 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              placeholder="Search..." data-testid={testId ? `${testId}-search` : undefined}
              className="w-full h-9 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
        </div>
      )}
      {showSelectAll && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-500">{selectedVals.length} selected</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={selectAll} className="font-medium text-primary-600 hover:underline">Select all</button>
            <button type="button" onClick={clearAll} className="font-medium text-slate-500 hover:text-red-600">Clear all</button>
          </div>
        </div>
      )}
      <div className="overflow-y-auto no-scrollbar py-1 flex-1">
        {filtered.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400">{query ? "No matching results" : "No options"}</div>}
        {filtered.map((o, i) => {
          const isSel = selectedVals.includes(String(o.value));
          const isHi = i === highlight;
          return (
            <button key={`${o.value}-${i}`} type="button" disabled={o.disabled}
              data-testid={testId ? `${testId}-opt-${o.value}` : undefined}
              onMouseEnter={() => setHighlight(i)} onClick={() => toggle(o)}
              className={`w-full flex items-center gap-2.5 px-3 ${isMobile ? "py-3" : "py-2"} text-left text-sm transition-colors ${o.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${isHi ? "bg-slate-100 dark:bg-slate-800" : ""}`}>
              <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${isSel ? "bg-primary-600 border-primary-600" : "border-slate-300 dark:border-slate-600"}`}>{isSel && <Check className="h-3 w-3 text-white" />}</span>
              <span className={`flex-1 truncate ${isSel ? "text-primary-700 dark:text-primary-300 font-medium" : "text-slate-600 dark:text-slate-300"}`}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown} disabled={disabled} data-testid={testId} {...rest}
        className={`group w-full min-h-10 px-2 py-1 inline-flex items-center gap-2 rounded-lg border bg-white dark:bg-slate-900 text-sm transition-all ${disabled ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700" : "cursor-pointer border-slate-200 dark:border-slate-600 hover:border-primary-300 dark:hover:border-primary-500"} ${open ? "border-primary-400 ring-2 ring-primary-100 dark:ring-primary-900/40" : ""} ${className}`}>
        <span className="flex-1 flex flex-wrap items-center gap-1 py-0.5">
          {selectedOpts.length === 0 && <span className="text-slate-400 px-1">{loading ? "Loading..." : placeholder}</span>}
          {selectedOpts.slice(0, maxChips).map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium px-2 py-0.5">
              {o.label}
              <X className="h-3 w-3 hover:text-red-600" onClick={(e) => { e.stopPropagation(); toggle(o); }} />
            </span>
          ))}
          {selectedOpts.length > maxChips && <span className="text-xs text-slate-500 px-1">+{selectedOpts.length - maxChips} more</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <>
          {isMobile && <div className="fixed inset-0 z-[9998] bg-black/30" onClick={() => setOpen(false)} />}
          {menuList}
        </>, document.body)}
    </>
  );
}
