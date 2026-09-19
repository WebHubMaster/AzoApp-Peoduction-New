import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import api from "@/lib/api";

const CartCtx = createContext(null);
const KEY = "azo_cart_v1";

const uid = () => Math.random().toString(36).slice(2, 10);

/* Signature used to detect identical cart lines (for qty-merging). Add-on quantity
   is part of the signature so two lines that differ ONLY by add-on qty stay merged
   on the SAME line (the add-on qty is set independently, not by stacking lines). */
const lineSig = (x) =>
  x.custom
    ? `custom|${x.ratecard_row_id || x.custom_name}|${x.custom_price}|${x.category_id}`
    : `svc|${x.service_id}|${x.tier_index}|${[...(x.addons || [])].sort().join(",")}`;

/* Collapse duplicate lines into one line with summed qty (keeps order). */
const consolidate = (list) => {
  const out = [];
  const map = new Map();
  for (const x of list || []) {
    const sig = lineSig(x);
    if (map.has(sig)) {
      const i = map.get(sig);
      out[i] = { ...out[i], qty: (out[i].qty || 1) + (x.qty || 1) };
    } else {
      map.set(sig, out.length);
      out.push({ ...x, qty: Math.max(1, x.qty || 1), addonQty: x.addonQty || {} });
    }
  }
  return out;
};

/* Add-ons subtotal for a line — each add-on priced at its OWN independent quantity
   (default 1). This is NEVER multiplied by the main service quantity. */
export const addonsTotal = (item) =>
  (item.addons || []).reduce((s, name) => {
    const a = (item.addonsCatalog || []).find((x) => x.name === name);
    const q = Math.max(1, Number((item.addonQty || {})[name]) || 1);
    return s + (a ? (Number(a.price) || 0) * q : 0);
  }, 0);

/* Per-unit base price (add-ons excluded — they carry their own qty). */
export const unitBase = (item) => {
  if (item.tier_index != null && item.tiers?.[item.tier_index]) {
    return Number(item.tiers[item.tier_index].price) || 0;
  }
  return item.discounted_price > 0 && item.discounted_price < item.base_price
    ? Number(item.discounted_price) || 0 : Number(item.base_price) || 0;
};

/* Full line estimate = base × main qty + Σ(add-on price × add-on qty).
   Real total comes from /bookings/cart-quote at checkout (source of truth). */
export const lineEstimate = (item) =>
  unitBase(item) * Math.max(1, item.qty || 1) + addonsTotal(item);

/* Per-unit estimate (base + add-ons at their own qty) — legacy helper kept for
   backward compatibility; prefer lineEstimate for line totals. */
export const unitEstimate = (item) => unitBase(item) + addonsTotal(item);

/* Build a cart line from a full service object */
export const lineFromService = (svc, { tier_index = null, addons = [], qty = 1 } = {}) => {
  const tiers = svc.tiers || [];
  let ti = tier_index;
  if (ti == null && tiers.length) {
    const bi = tiers.findIndex((t) => t.badge);
    ti = bi >= 0 ? bi : 0;
  }
  return {
    id: uid(),
    service_id: svc.id,
    name: svc.name,
    image: svc.image,
    price_type: svc.price_type,
    tax_pct: svc.tax_pct,
    category_name: svc.category_name,
    category_id: svc.category_id,
    subcategory_name: svc.subcategory_name,
    duration_min: svc.duration_min,
    rating: svc.rating,
    base_price: svc.base_price,
    discounted_price: svc.discounted_price,
    tiers,
    addonsCatalog: svc.addons || [],
    tier_index: ti,
    addons,
    addonQty: {},
    qty: Math.max(1, qty),
  };
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try { return consolidate(JSON.parse(localStorage.getItem(KEY)) || []); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  // Admin-configured Minimum Labor Charge — used ONLY for display hints (e.g. the
  // rate-card "+ ₹X labour" label). Actual pricing is applied by the backend.
  const [minLabour, setMinLabour] = useState(0);
  useEffect(() => {
    api.get("/auth/config")
      .then((r) => setMinLabour(Number(r.data?.business?.min_labour_charge) || 0))
      .catch(() => {});
  }, []);

  const addService = useCallback((svc, opts = {}) => {
    const line = lineFromService(svc, opts);
    setItems((prev) => {
      // merge identical service+tier+addons -> bump qty
      const sig = (x) => `${x.service_id}|${x.tier_index}|${[...(x.addons || [])].sort().join(",")}`;
      const idx = prev.findIndex((p) => sig(p) === sig(line));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + (opts.qty || 1) };
        return next;
      }
      return [...prev, line];
    });
    return line;
  }, []);

  /* Add a rate-card ROW as a custom cart line (booked under its category).
     Only the row's OWN labour is included here; if the row has no labour, the
     admin Minimum Labor Charge is applied authoritatively by the backend at
     quote/checkout time (so it always reconciles, even for older cart items). */
  const addCustom = useCallback((row) => {
    const rowLabour = Number(row.labour_charge) || 0;
    const price = (Number(row.service_charge) || 0) + rowLabour;
    const line = {
      id: uid(),
      custom: true,
      service_id: null,
      name: row.description || "Rate-card service",
      custom_name: row.description || "Rate-card service",
      custom_price: price,
      category_id: row.category_id || "",
      category_name: row.category_name || "",
      ratecard_row_id: row.row_id || "",
      labour_charge: rowLabour,
      image: "",
      price_type: "fixed",
      tax_pct: 0,
      base_price: price,
      discounted_price: 0,
      tiers: [],
      addonsCatalog: [],
      tier_index: null,
      addons: [],
      qty: 1,
    };
    setItems((prev) => {
      // merge identical rate-card row -> bump qty (no duplicate rows)
      const sig = (x) => `custom|${x.ratecard_row_id || x.custom_name}|${x.custom_price}|${x.category_id}`;
      const idx = prev.findIndex((p) => p.custom && sig(p) === sig(line));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, line];
    });
    return line;
  }, []);

  const removeItem = useCallback((id) => setItems((p) => p.filter((x) => x.id !== id)), []);
  const updateItem = useCallback((id, patch) =>
    setItems((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))), []);
  const setQty = useCallback((id, qty) =>
    setItems((p) => p.map((x) => (x.id === id ? { ...x, qty: Math.max(1, qty) } : x))), []);
  // Set the INDEPENDENT quantity for a single add-on on a line (default 1). This
  // never affects the main service quantity.
  const setAddonQty = useCallback((id, name, qty) =>
    setItems((p) => p.map((x) => (x.id === id
      ? { ...x, addonQty: { ...(x.addonQty || {}), [name]: Math.max(1, Number(qty) || 1) } }
      : x))), []);
  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, x) => s + x.qty, 0), [items]);
  const estimateTotal = useMemo(
    () => items.reduce((s, x) => s + lineEstimate(x), 0), [items]);

  return (
    <CartCtx.Provider value={{ items, addService, addCustom, removeItem, updateItem, setQty, setAddonQty, clear, count, estimateTotal, minLabourCharge: minLabour }}>
      {children}
    </CartCtx.Provider>
  );
};

export const useCart = () => useContext(CartCtx);
