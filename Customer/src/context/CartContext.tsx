/** Port of web_panel/src/context/CartContext.jsx — same line shape, estimates and merge rules (persisted in AsyncStorage). */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "azo_cart_v1";
const uid = () => Math.random().toString(36).slice(2, 10);
const sigOf = (x: any) => (x.custom ? `custom|${x.ratecard_row_id || x.custom_name}|${x.custom_price}|${x.category_id}` : `svc|${x.service_id}|${x.tier_index}|${[...(x.addons || [])].sort().join(",")}`);

export const addonsTotal = (item: any) => (item.addons || []).reduce((s: number, name: string) => {
  const a = (item.addonsCatalog || []).find((x: any) => x.name === name);
  const q = Math.max(1, Number((item.addonQty || {})[name]) || 1);
  return s + (a ? (Number(a.price) || 0) * q : 0);
}, 0);
export const unitBase = (item: any) => {
  if (item.tier_index != null && item.tiers?.[item.tier_index]) return Number(item.tiers[item.tier_index].price) || 0;
  return item.discounted_price > 0 && item.discounted_price < item.base_price ? Number(item.discounted_price) || 0 : Number(item.base_price) || 0;
};
export const lineEstimate = (item: any) => unitBase(item) * Math.max(1, item.qty || 1) + addonsTotal(item);

export const lineFromService = (svc: any, { tier_index = null, addons = [], qty = 1 }: { tier_index?: number | null; addons?: string[]; qty?: number } = {}) => {
  const tiers = svc.tiers || [];
  let ti = tier_index;
  if (ti == null && tiers.length) { const bi = tiers.findIndex((t: any) => t.badge); ti = bi >= 0 ? bi : 0; }
  return { id: uid(), service_id: svc.id, name: svc.name, image: svc.image, price_type: svc.price_type, tax_pct: svc.tax_pct, category_name: svc.category_name, category_id: svc.category_id,
    subcategory_name: svc.subcategory_name, duration_min: svc.duration_min, rating: svc.rating, base_price: svc.base_price, discounted_price: svc.discounted_price, tiers,
    addonsCatalog: svc.addons || [], tier_index: ti, addons, addonQty: {} as Record<string, number>, qty: Math.max(1, qty) };
};

/** Cart item → API request line (cart-quote / validate-coupon / bookings). */
export const toReqItem = (it: any) => (it.custom
  ? { custom: true, custom_name: it.custom_name, custom_price: it.custom_price, labour_charge: it.labour_charge || 0, category_id: it.category_id, category_name: it.category_name, qty: it.qty }
  : { service_id: it.service_id, tier_index: it.tier_index, addons: (it.addons || []).map((n: string) => ({ name: n, qty: Math.max(1, (it.addonQty || {})[n] || 1) })), qty: it.qty, category_id: it.category_id });

interface CartCtx { items: any[]; addService: (svc: any, opts?: any) => any; removeItem: (id: string) => void; updateItem: (id: string, patch: any) => void; setQty: (id: string, qty: number) => void; setAddonQty: (id: string, name: string, qty: number) => void; clear: () => void; count: number; estimateTotal: number; ready: boolean }
const Ctx = createContext<CartCtx | null>(null);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<any[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(KEY).then((raw) => { try { if (raw) setItems(JSON.parse(raw)); } catch {} setReady(true); }).catch(() => setReady(true)); }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => {}); }, [items, ready]);

  const addService = useCallback((svc: any, opts: any = {}) => {
    const line = lineFromService(svc, opts);
    setItems((prev) => {
      const idx = prev.findIndex((p) => sigOf(p) === sigOf(line));
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + (opts.qty || 1) }; return next; }
      return [...prev, line];
    });
    return line;
  }, []);
  const removeItem = useCallback((id: string) => setItems((p) => p.filter((x) => x.id !== id)), []);
  const updateItem = useCallback((id: string, patch: any) => setItems((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))), []);
  const setQty = useCallback((id: string, qty: number) => setItems((p) => p.map((x) => (x.id === id ? { ...x, qty: Math.max(1, qty) } : x))), []);
  const setAddonQty = useCallback((id: string, name: string, qty: number) => setItems((p) => p.map((x) => (x.id === id ? { ...x, addonQty: { ...(x.addonQty || {}), [name]: Math.max(1, Number(qty) || 1) } } : x))), []);
  const clear = useCallback(() => setItems([]), []);
  const count = useMemo(() => items.reduce((s, x) => s + (x.qty || 1), 0), [items]);
  const estimateTotal = useMemo(() => items.reduce((s, x) => s + lineEstimate(x), 0), [items]);
  return <Ctx.Provider value={{ items, addService, removeItem, updateItem, setQty, setAddonQty, clear, count, estimateTotal, ready }}>{children}</Ctx.Provider>;
};
export const useCart = () => { const c = useContext(Ctx); if (!c) throw new Error("useCart outside CartProvider"); return c; };
