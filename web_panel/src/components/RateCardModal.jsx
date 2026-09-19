import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronDown, Search, ShieldCheck, X, Sparkles,
  Wrench, ScrollText, Info, BadgeCheck, Plus, Minus, Check,
} from "lucide-react";
import api from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { isDiscountActive } from "@/lib/ratecard";
import DiscountCountdown from "@/components/DiscountCountdown";
import { toast } from "sonner";

/* -------- helpers -------- */
const isNum = (v) => v !== "" && v !== null && v !== undefined && !isNaN(Number(v));
const money = (v) => (isNum(v) ? `\u20b9${Number(v).toLocaleString("en-IN")}` : v);
const hexA = (hex, a) => (typeof hex === "string" && /^#([0-9a-f]{6})$/i.test(hex) ? `${hex}${a}` : hex);

function highlight(text, q) {
  if (!q) return text;
  const s = String(text);
  const idx = s.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {s.slice(0, idx)}
      <mark className="bg-amber-200/70 text-slate-900 rounded px-0.5">{s.slice(idx, idx + q.length)}</mark>
      {s.slice(idx + q.length)}
    </>
  );
}

/* -------- one group -------- */
function GroupBlock({ group, q, forceOpen, index, accent, innerRef, onAdd, addedIds, cartApi, minLabour = 0 }) {
  const [open, setOpen] = useState(index === 0);
  useEffect(() => { setOpen(q ? true : index === 0); }, [q, index]);
  const isOpen = forceOpen ? true : open;

  return (
    <div ref={innerRef} className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden scroll-mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-slate-50/70 transition-colors"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <span className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: hexA(accent, "14"), color: accent }}>
          <Wrench className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-bold text-slate-900 truncate">{group.name || "Services"}</span>
            <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0"
              style={{ background: hexA(accent, "14"), color: accent }}>
              {group.rows.length}
            </span>
          </span>
          {group.note && <span className="block text-[12px] text-slate-400 mt-0.5 truncate">{group.note}</span>}
        </span>
        <ChevronDown className={`h-5 w-5 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden"
          >
            <div className="hidden sm:grid grid-cols-[1fr_160px] px-5 py-2 border-y border-slate-100 bg-slate-50/60 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">
              <span>Description</span>
              <span className="text-right">Charges</span>
            </div>
            <div className="divide-y divide-slate-100">
              {group.rows.map((r) => (
                <div key={r.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-1 sm:gap-3 px-4 sm:px-5 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="min-w-0">
                    <p className="text-[15px] text-slate-800">{highlight(r.description, q)}</p>
                    {(r.warranty || r.note) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {r.warranty && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                            <ShieldCheck className="h-3 w-3" /> {r.warranty} warranty
                          </span>
                        )}
                        {r.note && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                            <Info className="h-3 w-3" /> {r.note}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="sm:text-right shrink-0">
                    {(() => {
                      const sc = Number(r.service_charge) || 0;
                      const pct = Number(r.discount_pct) || 0;
                      const dActive = isDiscountActive(r);
                      const scEff = dActive && sc ? Math.round(sc * (1 - pct / 100)) : sc;
                      return (
                        <>
                          {dActive && (
                            <span className="inline-flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-white bg-rose-500 rounded-full px-1.5 py-0.5">
                                {Math.round(pct)}% OFF
                              </span>
                              {r.discount_until && <DiscountCountdown until={r.discount_until} />}
                            </span>
                          )}
                          <div className="flex items-baseline sm:justify-end gap-2">
                            {dActive && sc > 0 ? (
                              <span className="text-xs text-slate-400 line-through">{money(sc)}</span>
                            ) : (r.original_charge && isNum(r.original_charge) && (
                              <span className="text-xs text-slate-400 line-through">{money(r.original_charge)}</span>
                            ))}
                            <span className={`text-[16px] font-extrabold tracking-tight ${dActive ? "text-rose-600" : "text-slate-900"}`}>{money(dActive ? scEff : r.service_charge)}</span>
                          </div>
                        </>
                      );
                    })()}
                    {r.labour_charge ? (
                      <p className="text-[11px] text-slate-400 sm:text-right mt-0.5">+ {money(r.labour_charge)} labour</p>
                    ) : (minLabour > 0 && (
                      <p className="text-[11px] text-slate-400 sm:text-right mt-0.5">+ {money(minLabour)} labour</p>
                    ))}
                    {cartApi ? (
                      (() => {
                        const qty = cartApi.qtyOf(r);
                        if (qty > 0) {
                          return (
                            <div className="mt-2 inline-flex items-center gap-2 sm:justify-end">
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600">
                                <Check className="h-3.5 w-3.5" /> Added
                              </span>
                              <div className="inline-flex items-center rounded-lg ring-1 overflow-hidden" style={{ borderColor: accent, boxShadow: `inset 0 0 0 1px ${hexA(accent, "33")}` }}>
                                <button onClick={() => cartApi.dec(r)} data-testid={`ratecard-dec-${r.id}`}
                                  className="h-8 w-8 flex items-center justify-center hover:bg-slate-50 transition" style={{ color: accent }}>
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span data-testid={`ratecard-qty-${r.id}`} className="w-8 text-center text-[13px] font-extrabold text-slate-900">{qty}</span>
                                <button onClick={() => cartApi.inc(r)} data-testid={`ratecard-inc-${r.id}`}
                                  className="h-8 w-8 flex items-center justify-center text-white transition hover:opacity-90" style={{ background: accent }}>
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <button
                            onClick={() => cartApi.inc(r)}
                            data-testid={`ratecard-add-${r.id}`}
                            className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold rounded-lg px-3 py-1.5 text-white transition hover:opacity-90 active:scale-[0.98]"
                            style={{ background: accent }}>
                            <Plus className="h-3.5 w-3.5" /> Add
                          </button>
                        );
                      })()
                    ) : onAdd ? (
                      (() => {
                        const added = addedIds?.has(r.id);
                        return (
                          <button
                            onClick={() => onAdd(r, group)}
                            data-testid={`ratecard-add-${r.id}`}
                            className={`mt-2 inline-flex items-center gap-1 text-[12px] font-bold rounded-lg px-3 py-1.5 transition hover:opacity-90 active:scale-[0.98] ${added ? "text-white bg-emerald-600" : "text-white"}`}
                            style={added ? undefined : { background: accent }}>
                            {added ? <><Check className="h-3.5 w-3.5" /> Added · add again</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
                          </button>
                        );
                      })()
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------- modal -------- */
export function RateCardModal({ card, onClose, onAdd, cartApi, minLabour = 0 }) {
  const [q, setQ] = useState("");
  const [addedIds, setAddedIds] = useState(() => new Set());
  const bodyRef = useRef(null);
  const groupRefs = useRef({});
  const accent = card.accent_color || "#0D47A1";
  const handleAdd = onAdd ? (r, g) => { try { onAdd(r, g); } finally { setAddedIds((prev) => new Set(prev).add(r.id)); } } : null;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const filtered = useMemo(() => {
    const groups = card.groups || [];
    if (!q.trim()) return groups;
    const s = q.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        rows: (g.rows || []).filter((r) =>
          (r.description || "").toLowerCase().includes(s) ||
          (r.note || "").toLowerCase().includes(s) ||
          (r.warranty || "").toLowerCase().includes(s) ||
          String(r.service_charge || "").includes(s)),
      }))
      .filter((g) => g.rows.length > 0 || (g.name || "").toLowerCase().includes(s));
  }, [card, q]);

  const totalRows = (card.groups || []).reduce((a, g) => a + (g.rows || []).length, 0);
  const matchRows = filtered.reduce((a, g) => a + (g.rows || []).length, 0);
  const jump = (id) => groupRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[3px]" onClick={onClose} />
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.99 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="relative w-full sm:max-w-2xl bg-white rounded-t-[28px] sm:rounded-[24px] shadow-[0_24px_70px_-12px_rgba(16,24,40,0.35)] ring-1 ring-black/5 max-h-[94vh] sm:max-h-[88vh] flex flex-col overflow-hidden"
        role="dialog" aria-modal="true"
      >
        {/* accent top strip */}
        <div className="h-1.5 w-full shrink-0" style={{ background: `linear-gradient(90deg, ${accent}, ${hexA(accent, "88")})` }} />

        {/* header (light, premium) */}
        <div className="px-5 sm:px-6 pt-4 pb-4 shrink-0 border-b border-slate-100"
          style={{ background: `linear-gradient(180deg, ${hexA(accent, "0A")}, #ffffff)` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[12px] font-extrabold rounded-full pl-1.5 pr-2.5 py-1 ring-1"
                style={{ color: accent, background: hexA(accent, "12"), borderColor: hexA(accent, "22") }}>
                <Sparkles className="h-3.5 w-3.5" /> {card.brand_label || "AzoCover"}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                <BadgeCheck className="h-3.5 w-3.5 text-slate-400" /> {card.category_name}
              </span>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="h-9 w-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <h2 className="mt-3 text-[22px] leading-tight font-extrabold text-slate-900 tracking-tight">{card.title || "Standard rate card"}</h2>
          {card.subtitle && <p className="text-[13.5px] text-slate-500 mt-0.5">{card.subtitle}</p>}

          {/* search */}
          <div className="mt-3.5 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search a repair, part or price…"
              className="w-full h-11 rounded-xl bg-white text-slate-800 placeholder:text-slate-400 pl-10 pr-9 text-sm border border-slate-200 outline-none focus:ring-2 transition"
              style={{ "--tw-ring-color": hexA(accent, "55") }} />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* quick-jump chips */}
          {!q && (card.groups || []).length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
              {(card.groups || []).map((g) => (
                <button key={g.id} onClick={() => jump(g.id)}
                  className="shrink-0 text-[12px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1.5 hover:border-slate-300 hover:text-slate-900 transition">
                  {g.name}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11.5px] text-slate-400 mt-2.5">
            {q ? `${matchRows} of ${totalRows} items match` : `${totalRows} items · ${(card.groups || []).length} groups · updated regularly`}
          </p>
        </div>

        {/* body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-[#FAFBFC]">
          {card.intro && !q && (
            <div className="rounded-2xl p-3.5 flex gap-2.5 border" style={{ background: hexA(accent, "0A"), borderColor: hexA(accent, "1A") }}>
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" style={{ color: accent }} />
              <p className="text-[12.5px] leading-relaxed text-slate-600">{card.intro}</p>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No items match “{q}”. Try another word.</p>
            </div>
          ) : (
            filtered.map((g, i) => (
              <GroupBlock key={g.id} group={g} q={q} forceOpen={!!q} index={i} accent={accent}
                innerRef={(el) => { groupRefs.current[g.id] = el; }} onAdd={handleAdd} addedIds={addedIds} cartApi={cartApi} minLabour={minLabour} />
            ))
          )}

          {card.footer_note && (
            <div className="rounded-2xl bg-slate-100/70 p-3.5 flex gap-2.5">
              <ScrollText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-slate-500 leading-relaxed">{card.footer_note}</p>
            </div>
          )}
        </div>

        {handleAdd && (
          <div className="shrink-0 border-t border-slate-100 bg-white px-4 sm:px-6 py-3 flex items-center gap-3" data-testid="ratecard-footer">
            <p className="text-[13px] font-semibold text-slate-600">
              {addedIds.size > 0
                ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-4 w-4" />{addedIds.size} item{addedIds.size > 1 ? "s" : ""} added — customer will be asked to pay</span>
                : "Tap Add on any item to add it as extra work"}
            </p>
            <button onClick={onClose} data-testid="ratecard-done"
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
              style={{ background: accent }}>
              <Check className="h-4 w-4" /> Done · Close
            </button>
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  );
}

/* -------- self-contained trigger bar -------- */
export default function RateCardBar({ serviceId, categoryId, categorySlug, className = "", addable = false }) {
  const [card, setCard] = useState(null);
  const [open, setOpen] = useState(false);
  const cart = useCart();

  useEffect(() => {
    let path = null;
    if (serviceId) path = `/ratecards/by-service/${serviceId}`;
    else if (categorySlug) path = `/ratecards/by-category/${categorySlug}`;
    else if (categoryId) path = `/ratecards/by-category/${categoryId}`;
    if (!path) return;
    api.get(path).then((r) => { if (r.data && (r.data.groups || []).length) setCard(r.data); }).catch(() => {});
  }, [serviceId, categoryId, categorySlug]);

  if (!card) return null;
  const accent = card.accent_color || "#0D47A1";

  const handleAdd = (row) => {
    const sc = Number(row.service_charge) || 0;
    const pct = Number(row.discount_pct) || 0;
    const eff = isDiscountActive(row) && sc ? Math.round(sc * (1 - pct / 100)) : sc;
    cart.addCustom({
      description: row.description,
      service_charge: eff,
      labour_charge: row.labour_charge,
      category_id: card.category_id,
      category_name: card.category_name,
      row_id: row.id,
    });
    const rowLabour = Number(row.labour_charge) || 0;
    const effLabour = rowLabour > 0 ? rowLabour : (cart.minLabourCharge || 0);
    const price = eff + effLabour;
    toast.success(`Added "${row.description}" · \u20b9${price.toLocaleString("en-IN")}`);
  };

  // Live qty stepper wiring for the cart (customer flow)
  const findLine = (row) =>
    (cart.items || []).find((x) => x.custom && x.ratecard_row_id === row.id && x.category_id === card.category_id);
  const cartApi = {
    qtyOf: (row) => findLine(row)?.qty || 0,
    inc: (row) => handleAdd(row),
    dec: (row) => {
      const line = findLine(row);
      if (!line) return;
      if (line.qty <= 1) cart.removeItem(line.id);
      else cart.setQty(line.id, line.qty - 1);
    },
  };

  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="rate-card-bar"
        className={`group w-full flex items-center gap-3 rounded-2xl border border-slate-200 bg-white hover:shadow-md transition-all px-4 py-3.5 text-left ${className}`}
        style={{ boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
        <span className="inline-flex items-center gap-1 text-[12px] font-extrabold shrink-0" style={{ color: accent }}>
          <Sparkles className="h-4 w-4" /> {card.brand_label || "AzoCover"}
        </span>
        <span className="text-sm font-medium text-slate-700 flex-1">{card.title || "Standard rate card"}{addable ? " · tap to book items" : ""}</span>
        <ChevronRight className="h-5 w-5 text-slate-400 group-hover:translate-x-0.5 transition" />
      </button>
      <AnimatePresence>{open && <RateCardModal card={card} onClose={() => setOpen(false)} cartApi={addable ? cartApi : undefined} minLabour={cart.minLabourCharge || 0} />}</AnimatePresence>
    </>
  );
}
