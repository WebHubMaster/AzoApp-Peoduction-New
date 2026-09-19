import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, ArrowRight, Star, Clock, Tag, TrendingUp, History } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { isDiscountActive } from "@/lib/ratecard";

/**
 * ServiceSearch — premium search box with live service suggestions (with price).
 * As the user types (debounced), it queries GET /catalog/services?q= and shows a
 * dropdown of matching services with thumbnail, rating, duration and price.
 *
 * Props:
 *   variant: "navbar" | "hero"  (styling)
 *   placeholder, className, autoFocus
 */
export default function ServiceSearch({
  variant = "navbar",
  placeholder = "Search for 'AC service', 'cleaning', 'salon'…",
  className = "",
  autoFocus = false,
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [cardRows, setCardRows] = useState([]);
  const [trending, setTrending] = useState([]);
  const [recent, setRecent] = useState(() => {
    try { return (JSON.parse(localStorage.getItem("azo_recent_searches")) || []).filter((x) => typeof x === "string"); } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const timer = useRef(null);

  const priceOf = (s) =>
    s.discounted_price > 0 && s.discounted_price < s.base_price ? s.discounted_price : s.base_price;

  // Load trending services once (shown when the box is focused but empty)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/catalog/services", { params: { trending: true } });
        let list = data || [];
        if (!list.length) {
          const f = await api.get("/catalog/services", { params: { featured: true } });
          list = f.data || [];
        }
        if (alive) setTrending(list.slice(0, 6));
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const runSearch = useCallback(async (text) => {
    if (!text || text.trim().length < 2) {
      setResults([]);
      setCardRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const term = text.trim();
    try {
      const [svcRes, rcRes] = await Promise.allSettled([
        api.get("/catalog/services", { params: { q: term } }),
        api.get("/ratecards/search", { params: { q: term } }),
      ]);
      setResults(svcRes.status === "fulfilled" ? (svcRes.value.data || []).slice(0, 6) : []);
      setCardRows(rcRes.status === "fulfilled" ? (rcRes.value.data || []).slice(0, 5) : []);
    } catch (e) {
      setResults([]);
      setCardRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q), 250);
    return () => timer.current && clearTimeout(timer.current);
  }, [q, runSearch]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Remember the actual SEARCH TERMS the user runs (not viewed services), so the
  // "Recent" section reflects what they searched. Newest first, de-duped, max 6.
  const pushRecent = useCallback((term) => {
    const t = (term || "").trim();
    if (t.length < 2) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      try { localStorage.setItem("azo_recent_searches", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const goAll = () => {
    pushRecent(q);
    setOpen(false);
    navigate(`/services${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  };
  const goService = (s) => {
    pushRecent(q);
    setOpen(false);
    setQ("");
    navigate(`/service/${s.id}`);
  };
  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem("azo_recent_searches"); } catch { /* ignore */ }
  };
  const runRecent = (term) => {
    setQ(term);
    setOpen(true);
    setActive(-1);
  };
  const goRateCard = (row) => {
    pushRecent(q);
    setOpen(false);
    setQ("");
    // Surface the matching rate-card row on the services page (bookable)
    navigate(`/services?q=${encodeURIComponent(row.description || "")}${row.category_id ? `&category=${row.category_id}` : ""}`);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && results[active]) goService(results[active]);
      else goAll();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const isHero = variant === "hero";
  const inputCls = isHero
    ? "w-full h-14 pl-12 pr-28 rounded-2xl border border-slate-200 bg-white text-[15px] shadow-[0_10px_40px_-12px_rgba(13,71,161,0.25)] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition"
    : "w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300";

  return (
    <div ref={boxRef} className={`relative ${className}`} data-testid={`service-search-${variant}`}>
      <Search className={`absolute ${isHero ? "left-4 h-5 w-5" : "left-3.5 h-4 w-4"} top-1/2 -translate-y-1/2 text-slate-400`} />
      <input
        data-testid={isHero ? "hero-search" : "nav-search"}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={inputCls}
      />
      {isHero && (
        <button
          onClick={goAll}
          data-testid="hero-search-btn"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-4 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold inline-flex items-center gap-1 transition"
        >
          Search <ArrowRight className="h-4 w-4" />
        </button>
      )}
      {loading && !isHero && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
      )}

      {open && (q.trim().length >= 2 || trending.length > 0 || recent.length > 0) && (
        <div
          data-testid="search-suggestions"
          className="absolute z-[60] mt-2 left-0 right-0 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        >
          {q.trim().length < 2 && (recent.length > 0 || trending.length > 0) && (
            <div className="max-h-[420px] overflow-y-auto">
              {recent.length > 0 && (
                <div data-testid="recent-searches">
                  <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <History className="h-3.5 w-3.5 text-slate-400" /> Recent
                    </p>
                    <button onClick={clearRecent} data-testid="recent-clear" className="text-[11px] font-semibold text-slate-400 hover:text-rose-500">Clear</button>
                  </div>
                  <div className="flex flex-wrap gap-2 px-4 pb-3">
                    {recent.map((term, i) => (
                      <button key={term} data-testid={`recent-item-${i}`} onClick={() => runRecent(term)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-600 text-[13px] font-medium transition-colors">
                        <History className="h-3 w-3 opacity-60" /> {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {trending.length > 0 && (
                <div data-testid="trending-searches" className={recent.length > 0 ? "border-t border-slate-100" : ""}>
                  <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-primary-600" /> Trending now
                  </p>
                  <ul className="pb-1">
                    {trending.map((s, i) => {
                      const price = priceOf(s);
                      const off = s.discounted_price > 0 && s.discounted_price < s.base_price;
                      return (
                        <li key={s.id}>
                          <button
                            data-testid={`trending-item-${i}`}
                            onClick={() => goService(s)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                          >
                            <div className="h-11 w-11 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                              {s.image ? <img src={s.image} alt={s.name} className="h-full w-full object-cover" loading="lazy" /> : <Search className="h-4 w-4 text-slate-300" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{s.rating || "4.8"}</span>
                                {s.category_name ? <span className="truncate">· {s.category_name}</span> : null}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-heading font-extrabold text-slate-900">{fmt(price)}</p>
                              {off && <p className="text-[11px] text-slate-400 line-through leading-none">{fmt(s.base_price)}</p>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!loading && q.trim().length >= 2 && results.length === 0 && cardRows.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              No results found for &ldquo;{q.trim()}&rdquo;
            </div>
          )}
          {!loading && (results.length > 0 || cardRows.length > 0) && (
            <div className="max-h-[380px] overflow-y-auto">
              {results.length > 0 && (
                <>
                  <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Services</p>
                  <ul className="pb-1">
                    {results.map((s, i) => {
                      const price = priceOf(s);
                      const off = s.discounted_price > 0 && s.discounted_price < s.base_price;
                      return (
                        <li key={s.id}>
                          <button
                            data-testid={`search-suggestion-${i}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => goService(s)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${active === i ? "bg-primary-50" : "hover:bg-slate-50"}`}
                          >
                            <div className="h-11 w-11 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                              {s.image ? (
                                <img src={s.image} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <Search className="h-4 w-4 text-slate-300" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{s.rating || "4.8"}</span>
                                {s.duration_min ? <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{s.duration_min}m</span> : null}
                                {s.category_name ? <span className="truncate">· {s.category_name}</span> : null}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-heading font-extrabold text-slate-900">{fmt(price)}</p>
                              {off && <p className="text-[11px] text-slate-400 line-through leading-none">{fmt(s.base_price)}</p>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {cardRows.length > 0 && (
                <>
                  <p className="px-4 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100">Rate card</p>
                  <ul className="pb-1">
                    {cardRows.map((row, i) => {
                      const sc = Number(row.service_charge) || 0;
                      const pct = Number(row.discount_pct) || 0;
                      const dActive = isDiscountActive(row);
                      const price = dActive && sc ? Math.round(sc * (1 - pct / 100)) : sc;
                      const orig = dActive && sc ? sc : (Number(row.original_charge) || 0);
                      return (
                        <li key={`${row.card_id}-${row.row_id}`}>
                          <button
                            data-testid={`search-ratecard-${i}`}
                            onClick={() => goRateCard(row)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                          >
                            <div className="h-11 w-11 rounded-xl shrink-0 flex items-center justify-center text-white font-bold" style={{ background: row.accent_color || "#0D47A1" }}>
                              <Tag className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">{row.description}</p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                <span className="inline-flex items-center gap-1 font-medium text-primary-700">{row.brand_label || "AzoCover"}</span>
                                {dActive ? <span className="font-bold text-rose-600">{Math.round(pct)}% OFF</span> : null}
                                {row.category_name ? <span className="truncate">· {row.category_name}</span> : null}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {price > 0 && <p className={`text-sm font-heading font-extrabold ${dActive ? "text-rose-600" : "text-slate-900"}`}>{fmt(price)}</p>}
                              {orig > price && orig > 0 && <p className="text-[11px] text-slate-400 line-through leading-none">{fmt(orig)}</p>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <button
                onClick={goAll}
                data-testid="search-see-all"
                className="w-full flex items-center justify-center gap-1 px-4 py-3 border-t border-slate-100 text-sm font-semibold text-primary-700 hover:bg-primary-50 transition"
              >
                See all results for &ldquo;{q.trim()}&rdquo; <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
