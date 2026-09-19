import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MapPin, RefreshCcw, Users, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { useRealtime } from "@/context/RealtimeContext";
import { loadGoogleMaps as loadMaps } from "@/lib/gmaps";

const STATUS_LABEL = {
  assigned: "On the way", arrived_shop: "At shop", arrived_customer: "At customer", started: "Working",
};

export default function LivePartnerMap() {
  const [key, setKey] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [partners, setPartners] = useState([]);
  const [surgeByCity, setSurgeByCity] = useState({});
  const [areas, setAreas] = useState([]);
  const [filterCities, setFilterCities] = useState([]);
  const [filterCats, setFilterCats] = useState([]);
  const [cityF, setCityF] = useState("all");
  const [catF, setCatF] = useState("all");
  const { subscribe, connected } = useRealtime();
  const mapRef = useRef(null);
  const gmapRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const fittedRef = useRef(false);

  const fetchLive = useCallback(() => {
    api.get("/admin/partners/live").then((r) => {
      setPartners(r.data.partners || []);
      setSurgeByCity(r.data.surge_by_city || {});
      setAreas(r.data.areas || []);
      setFilterCities(r.data.filter_cities || []);
      setFilterCats(r.data.filter_categories || []);
    }).catch(() => {});
  }, []);

  // Filter dropdowns are driven by ALL active Service-Area cities + ALL active
  // service categories (not just whoever is online). Fall back to values seen in
  // the roster so nothing configured is ever missing.
  const cities = useMemo(() => {
    const set = new Set(filterCities);
    partners.forEach((p) => { if (p.city) set.add(p.city); });
    return Array.from(set).filter(Boolean).sort();
  }, [filterCities, partners]);
  const cats = useMemo(() => {
    const set = new Set(filterCats);
    partners.forEach((p) => {
      (p.categories || []).forEach((c) => c && set.add(c));
      if (p.category) set.add(p.category);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [filterCats, partners]);
  const filtered = useMemo(() => partners.filter((p) => {
    if (cityF !== "all" && (p.city || "") !== cityF) return false;
    if (catF !== "all") {
      const served = new Set([...(p.categories || []), ...(p.category ? [p.category] : [])]);
      if (!served.has(catF)) return false;
    }
    return true;
  }), [partners, cityF, catF]);
  const filterProps = { cities, cats, cityF, setCityF, catF, setCatF };
  // Re-fit the real Google Map to the filtered markers when filters change.
  useEffect(() => { fittedRef.current = false; }, [cityF, catF]);

  // Live updates via SSE — move markers / refresh the roster with no page reload.
  useEffect(() => subscribe((ev) => {
    if (!ev) return;
    if (ev.type === "partner_location" && ev.data?.id) {
      setPartners((prev) => {
        const idx = prev.findIndex((p) => p.id === ev.data.id);
        if (idx === -1) { fetchLive(); return prev; }
        const next = prev.slice();
        next[idx] = { ...next[idx], live_location: { lat: ev.data.lat, lng: ev.data.lng }, live_location_at: ev.data.at };
        return next;
      });
    } else if (["partner_status", "job_new", "job_update", "__resync__"].includes(ev.type)) {
      fetchLive();
    }
  }), [subscribe, fetchLive]);

  // resolve maps key from public config
  useEffect(() => {
    api.get("/auth/config").then((r) => setKey(r.data?.integrations?.google_maps_api_key || "")).catch(() => setKey(""));
  }, []);

  // init map once key present
  useEffect(() => {
    if (key === null) return;
    if (!key) { setError("no_key"); fetchLive(); return; }  // demo preview still loads live data
    loadMaps(key).then((maps) => {
      if (!mapRef.current) return;
      gmapRef.current = new maps.Map(mapRef.current, {
        center: { lat: 20.5937, lng: 78.9629 }, zoom: 5, mapTypeControl: false, streetViewControl: false,
      });
      setReady(true);
      fetchLive();
    }).catch(() => setError("load_failed"));
  }, [key, fetchLive]);

  // poll every 15s (works for both the real map and the demo preview)
  useEffect(() => {
    if (!ready && error !== "no_key") return undefined;
    const id = setInterval(fetchLive, 15000);
    return () => clearInterval(id);
  }, [ready, error, fetchLive]);

  // render markers
  useEffect(() => {
    if (!ready || !window.google?.maps) return;
    const maps = window.google.maps;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new maps.LatLngBounds();
    filtered.forEach((p) => {
      const loc = p.live_location;
      if (!loc) return;
      const pos = { lat: loc.lat, lng: loc.lng };
      const job = p.active_job;
      const busy = !!job;
      const delayed = !!(job && job.delayed);
      const marker = new maps.Marker({
        position: pos, map: gmapRef.current, title: p.name,
        icon: {
          path: maps.SymbolPath.CIRCLE, scale: 9, fillOpacity: 1, strokeWeight: 2,
          strokeColor: delayed ? "#ef4444" : "#fff",
          fillColor: busy ? (delayed ? "#ef4444" : "#f59e0b") : "#10b981",
        },
      });
      const etaLine = busy
        ? `<br/><b>ETA:</b> ${job.eta_label || "—"}${delayed ? ' <span style="color:#dc2626;font-weight:700">· DELAYED</span>' : ""}${job.distance_km != null ? ` · ${job.distance_km} km` : ""}`
        : "";
      const info = new maps.InfoWindow({
        content: `<div style="font-size:13px"><b>${p.name || "Partner"}</b><br/>${p.phone || ""}<br/>${busy ? `${STATUS_LABEL[job.status] || job.status} · ${job.service_name || ""} (#${job.code})` : "Available"}${etaLine}</div>`,
      });
      marker.addListener("click", () => info.open(gmapRef.current, marker));
      markersRef.current.push(marker);
      bounds.extend(pos);
    });
    if (markersRef.current.length > 0 && !fittedRef.current) {
      gmapRef.current.fitBounds(bounds);
      fittedRef.current = true;
    }
    // Coverage circles for service areas that have a centre + radius.
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];
    areas.forEach((a) => {
      if (a.center_lat == null || a.center_lng == null || !a.radius_km) return;
      const circle = new maps.Circle({
        map: gmapRef.current, center: { lat: Number(a.center_lat), lng: Number(a.center_lng) },
        radius: Number(a.radius_km) * 1000, strokeColor: "#6366f1", strokeOpacity: 0.6,
        strokeWeight: 1.5, fillColor: "#6366f1", fillOpacity: 0.08,
      });
      circlesRef.current.push(circle);
    });
  }, [filtered, areas, ready]);

  if (error === "no_key") {
    return <DemoMap partners={filtered} connected={connected} onRefresh={fetchLive} totalOnline={partners.length}
      surgeByCity={surgeByCity} areas={areas} {...filterProps} />;
  }

  return (
    <div data-testid="livemap">
      <SurgeChips surgeByCity={surgeByCity} />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> On a job</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Delayed</span>
          <span className="flex items-center gap-1 ml-2"><Users className="h-4 w-4" /> {filtered.length}/{partners.length} online</span>
          <span className={`flex items-center gap-1 ml-2 font-medium ${connected ? "text-emerald-600" : "text-amber-600"}`} data-testid="livemap-live">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse"}`} /> {connected ? "Live" : "Connecting…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MapFilters {...filterProps} />
          <button onClick={fetchLive} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50" data-testid="livemap-refresh"><RefreshCcw className="h-4 w-4" /> Refresh</button>
        </div>
      </div>
      {error === "load_failed" && <p className="text-sm text-red-600 mb-2">Could not load Google Maps — check that the API key is valid and Maps JavaScript API is enabled.</p>}
      <div ref={mapRef} className="w-full rounded-xl border border-slate-200 overflow-hidden" style={{ height: "70vh" }} />
    </div>
  );
}

/* Live surge % per city — so ops can see where prices are up right now. */
function SurgeChips({ surgeByCity }) {
  const entries = Object.entries(surgeByCity || {});
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3" data-testid="surge-chips">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
        <TrendingUp className="h-3.5 w-3.5" /> Live surge
      </span>
      {entries.map(([city, v]) => (
        <span key={city} data-testid={`surge-chip-${city}`}
          className="text-xs font-bold rounded-full px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          title={v.rule || ""}>
          {city} +{v.pct}%
        </span>
      ))}
    </div>
  );
}

/* Shared city + service-category filter dropdowns for the live map. */
function MapFilters({ cities, cats, cityF, setCityF, catF, setCatF }) {
  const sel = "h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500";
  return (
    <>
      <PremiumSelect data-testid="livemap-city-filter" className={`${sel} rounded-lg`} value={cityF} onChange={(e) => setCityF(e.target.value)}>
        <option value="all">All cities</option>
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </PremiumSelect>
      <PremiumSelect data-testid="livemap-category-filter" className={`${sel} rounded-lg`} value={catF} onChange={(e) => setCatF(e.target.value)}>
        <option value="all">All categories</option>
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </PremiumSelect>
    </>
  );
}


/* ---------------------------------------------------------------------------
 * DemoMap — a lightweight, dependency-free preview of the live partner map,
 * shown when no Google Maps API key is configured. It plots each partner's
 * live GPS onto a stylised canvas (simple equirectangular projection) so you
 * can see exactly how tracking behaves. Updates live via SSE + polling.
 * The moment a real Google Maps key is added, the component switches to the
 * real Google Maps automatically.
 * ------------------------------------------------------------------------- */
function DemoMap({ partners, connected, onRefresh, totalOnline, cities, cats, cityF, setCityF, catF, setCatF, surgeByCity, areas }) {
  const [sel, setSel] = useState(null);
  const pts = (partners || []).filter((p) => p.live_location && typeof p.live_location.lat === "number");
  const delayedCount = pts.filter((p) => p.active_job && p.active_job.delayed).length;

  const lats = pts.map((p) => p.live_location.lat);
  const lngs = pts.map((p) => p.live_location.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  // pad so single/identical points don't divide-by-zero and markers aren't on the edge
  if (!isFinite(minLat) || minLat === maxLat) { minLat -= 0.02; maxLat += 0.02; }
  if (!isFinite(minLng) || minLng === maxLng) { minLng -= 0.02; maxLng += 0.02; }
  const project = (loc) => {
    const x = 6 + ((loc.lng - minLng) / (maxLng - minLng)) * 88;      // 6%..94%
    const y = 6 + (1 - (loc.lat - minLat) / (maxLat - minLat)) * 88;  // invert lat
    return { x, y };
  };
  const selected = pts.find((p) => p.id === sel) || null;

  return (
    <div data-testid="livemap-demo">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 text-sm text-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> On a job</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Delayed{delayedCount ? ` (${delayedCount})` : ""}</span>
          <span className="flex items-center gap-1 ml-1"><Users className="h-4 w-4" /> {pts.length}/{totalOnline ?? pts.length} online</span>
          <span className={`flex items-center gap-1 ml-1 font-medium ${connected ? "text-emerald-600" : "text-amber-600"}`} data-testid="livemap-live">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse"}`} /> {connected ? "Live" : "Connecting…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MapFilters cities={cities} cats={cats} cityF={cityF} setCityF={setCityF} catF={catF} setCatF={setCatF} />
          <button onClick={onRefresh} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50" data-testid="livemap-refresh">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <SurgeChips surgeByCity={surgeByCity} />

      {/* demo notice */}
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
        <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
        <span><b>Demo preview</b> — showing live partner positions on a simulated map. Add your <b>Google Maps API key</b> in Integration Center → Google Maps to switch to the real map. Tracking already works live.</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        {/* stylised map canvas */}
        <div className="relative w-full rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
          style={{ height: "70vh", background: "linear-gradient(135deg,#eef2f7 0%,#e6f0ea 100%)" }}>
          {/* decorative grid / roads */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            {Array.from({ length: 11 }, (_, i) => (
              <line key={`v${i}`} x1={`${i * 10}%`} y1="0" x2={`${i * 10}%`} y2="100%" stroke="#cbd5e1" strokeWidth="1" opacity="0.5" />
            ))}
            {Array.from({ length: 11 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={`${i * 10}%`} x2="100%" y2={`${i * 10}%`} stroke="#cbd5e1" strokeWidth="1" opacity="0.5" />
            ))}
            <line x1="0" y1="42%" x2="100%" y2="55%" stroke="#94a3b8" strokeWidth="6" opacity="0.35" strokeLinecap="round" />
            <line x1="30%" y1="0" x2="52%" y2="100%" stroke="#94a3b8" strokeWidth="6" opacity="0.35" strokeLinecap="round" />
            <line x1="0" y1="78%" x2="100%" y2="70%" stroke="#94a3b8" strokeWidth="4" opacity="0.3" strokeLinecap="round" />
          </svg>
          <span className="absolute top-3 left-3 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Patna · demo grid</span>

          {/* coverage circles for service areas with a centre + radius */}
          {(areas || []).map((a, i) => {
            if (a.center_lat == null || a.center_lng == null || !a.radius_km) return null;
            const { x, y } = project({ lat: Number(a.center_lat), lng: Number(a.center_lng) });
            const latSpan = (maxLat - minLat) || 0.04;
            const rDeg = Number(a.radius_km) / 111;             // km → latitude degrees
            const hPct = Math.min(60, (rDeg / latSpan) * 88);   // circle diameter as % of canvas height
            if (x < -20 || x > 120 || y < -20 || y > 120) return null;
            return (
              <div key={`area-${i}`} data-testid={`coverage-circle-${i}`}
                className="absolute rounded-full border-2 border-indigo-400/70 bg-indigo-400/10 pointer-events-none"
                style={{ left: `${x}%`, top: `${y}%`, width: `${hPct}%`, height: `${hPct}%`, transform: "translate(-50%,-50%)" }}>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-indigo-500">{a.name} · {a.radius_km}km</span>
              </div>
            );
          })}

          {pts.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-slate-400 text-sm" data-testid="livemap-demo-empty">
              No online partners sharing location right now
            </div>
          )}

          {pts.map((p) => {
            const { x, y } = project(p.live_location);
            const job = p.active_job;
            const busy = !!job;
            const delayed = !!(job && job.delayed);
            const isSel = p.id === sel;
            const dotColor = busy ? (delayed ? "bg-red-500" : "bg-amber-500") : "bg-emerald-500";
            const pingColor = busy ? (delayed ? "bg-red-400" : "bg-amber-400") : "bg-emerald-400";
            return (
              <button key={p.id} data-testid={`livemap-marker-${p.id}`}
                onClick={() => setSel(isSel ? null : p.id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none flex flex-col items-center"
                style={{ left: `${x}%`, top: `${y}%`, zIndex: isSel ? 30 : (delayed ? 20 : 10) }}
                title={p.name}>
                {/* live ETA badge for on-a-job partners */}
                {busy && (
                  <span data-testid={`livemap-eta-${p.id}`}
                    className={`mb-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow-sm border ${delayed ? "bg-red-600 text-white border-red-700" : "bg-white text-amber-700 border-amber-300"}`}>
                    {delayed ? "⚠ " : ""}{job.eta_label || "—"}
                  </span>
                )}
                <span className="relative flex items-center justify-center">
                  <span className={`absolute inline-flex h-6 w-6 rounded-full opacity-40 ${pingColor} animate-ping`} />
                  <span className={`relative inline-flex h-4 w-4 rounded-full border-2 border-white shadow ${dotColor} ${isSel ? "ring-2 ring-primary-500" : ""}`} />
                </span>
              </button>
            );
          })}

          {/* selected info popup */}
          {selected && (() => {
            const { x, y } = project(selected.live_location);
            const job = selected.active_job;
            const busy = !!job;
            const delayed = !!(job && job.delayed);
            return (
              <div className="absolute -translate-x-1/2 z-40" style={{ left: `${x}%`, top: `calc(${y}% + 14px)` }} data-testid="livemap-popup">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 px-3 py-2 min-w-[190px]">
                  <p className="font-heading font-bold text-sm text-slate-900 dark:text-white">{selected.name || "Partner"}</p>
                  {selected.phone && <p className="text-xs text-slate-500">{selected.phone}</p>}
                  <p className={`text-xs mt-1 font-medium ${busy ? "text-amber-600" : "text-emerald-600"}`}>
                    {busy ? `${STATUS_LABEL[job.status] || job.status} · ${job.service_name || ""} (#${job.code || ""})` : "Available"}
                  </p>
                  {busy && (
                    <p className={`text-xs mt-1 flex items-center gap-1 font-semibold ${delayed ? "text-red-600" : "text-slate-600 dark:text-slate-300"}`}>
                      {delayed ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      ETA {job.eta_label || "—"}{job.distance_km != null ? ` · ${job.distance_km} km` : ""}{delayed ? " · DELAYED" : ""}
                    </p>
                  )}
                  {selected.city && <p className="text-[10px] text-slate-400 mt-1">{selected.city}{selected.category ? ` · ${selected.category}` : ""}</p>}
                  <p className="text-[10px] text-slate-400">{selected.live_location.lat.toFixed(4)}, {selected.live_location.lng.toFixed(4)}</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* partner roster side list */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">Online partners</div>
          <div className="max-h-[calc(70vh-42px)] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {pts.length === 0 && <p className="p-4 text-sm text-slate-400">Nobody online right now.</p>}
            {pts.map((p) => {
              const job = p.active_job;
              const busy = !!job;
              const delayed = !!(job && job.delayed);
              return (
                <button key={p.id} onClick={() => setSel(p.id)} data-testid={`livemap-list-${p.id}`}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${p.id === sel ? "bg-primary-50/60 dark:bg-primary-900/20" : ""}`}>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${busy ? (delayed ? "bg-red-500" : "bg-amber-500") : "bg-emerald-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.name || "Partner"}</p>
                    <p className="text-xs text-slate-500 truncate">{busy ? (job.service_name || "On a job") : "Available"}{p.city ? ` · ${p.city}` : ""}</p>
                  </div>
                  {busy && (
                    <span className={`shrink-0 flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5 ${delayed ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                      {delayed ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{job.eta_label || "—"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
