import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { toast } from "sonner";
import {
  RefreshCcw, Search, X, Users, ChevronRight, Maximize2, Minimize2, Plus, Minus,
  Crosshair, Layers, Star, Radio, SlidersHorizontal, MapPin, Navigation,
  Flame, Car, Target, PanelRightClose, PanelRightOpen,
} from "lucide-react";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { loadGoogleMaps as loadMaps } from "@/lib/gmaps";
import api from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import {
  generatePartners, simulateTick, CITIES, CATEGORIES, STATUS_ORDER,
  statusColor, statusLabel, isOnline, isWorking, timeAgo,
} from "@/lib/partnerSim";
import { LIGHT_STYLE, DARK_STYLE, partnerIcon, customerIcon, makeClusterRenderer } from "@/pages/admin/livemap/mapAssets";
import PartnerDrawer from "@/pages/admin/livemap/PartnerDrawer";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "AIzaSyBOfVVQzn1ggzK97kP2TEfN8Ogq_uDwZms";
const CITY_MAP = Object.fromEntries(CITIES.map((c) => [c.name, c]));

/* Derive a UI status from a REAL /admin/partners/live partner record. */
function deriveStatus(p) {
  if (p.online === false || !p.live_location) return "offline";
  const aj = p.active_job;
  if (aj) {
    if (aj.delayed) return "delayed";
    if (aj.status === "assigned") return "travelling";
    if (aj.status === "arrived_shop" || aj.status === "arrived_customer") return "busy";
    return "on_job";
  }
  return "available";
}

/* Map a REAL partner payload into the UI partner model used across this page. */
function mapLivePartner(p) {
  const loc = p.live_location || {};
  const cc = CITY_MAP[p.city];
  const aj = p.active_job;
  const etaNum = aj ? (parseInt(aj.eta_label, 10) || aj.eta_min || 15) : 0;
  return {
    id: p.id,
    partnerId: p.partner_code || p.id,
    name: p.name || "Partner",
    phone: p.phone || "",
    avatar: p.photo || p.avatar || `https://i.pravatar.cc/120?u=${encodeURIComponent(p.id || Math.random())}`,
    category: p.category || (p.categories && p.categories[0]) || "Service",
    categories: (p.categories && p.categories.length) ? p.categories : (p.category ? [p.category] : []),
    city: p.city || "",
    cityCenter: cc ? { lat: cc.lat, lng: cc.lng } : (loc.lat != null ? { lat: loc.lat, lng: loc.lng } : { lat: 22.9, lng: 80 }),
    status: deriveStatus(p),
    online: p.online !== false && !!p.live_location,
    lat: loc.lat, lng: loc.lng,
    heading: Math.random() * Math.PI * 2,
    rating: p.rating != null ? Number(p.rating) : null,
    completedJobs: p.completed_jobs || 0,
    todayJobs: p.today_jobs || 0,
    todayEarnings: p.today_earnings || 0,
    onlineSince: p.online_since ? Date.parse(p.online_since) : Date.now(),
    coverageRadiusKm: p.radius_km || 5,
    lastUpdate: p.live_location_at ? Date.parse(p.live_location_at) : Date.now(),
    activeJob: aj ? {
      service: aj.service_name || "Service", bookingCode: aj.code || "",
      customer: aj.customer_name || "—", startedAt: aj.started_at ? Date.parse(aj.started_at) : Date.now(),
      etaMin: etaNum, promisedMin: aj.promised_min || Math.max(1, etaNum - 5),
      distanceKm: aj.distance_km != null ? aj.distance_km : 0,
      custOffset: { dlat: 0.012, dlng: 0.012 },
    } : null,
  };
}

function haversine(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const useDark = () => {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
};

export default function LivePartnerMap() {
  const dark = useDark();
  const { subscribe } = useRealtime();
  const [mode, setMode] = useState("demo"); // "real" once live partners load
  const [partners, setPartners] = useState(() => generatePartners(200));
  const [cityF, setCityF] = useState("all");
  const [catF, setCatF] = useState("all");
  const [statusF, setStatusF] = useState([]); // empty => all
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("status");
  const [selectedId, setSelectedId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlays, setOverlays] = useState({ partners: true, coverage: false, customers: false, heatmap: false, traffic: false });
  const [mapType, setMapType] = useState("roadmap");
  const [fullscreen, setFullscreen] = useState(false);
  const [historyId, setHistoryId] = useState(null);
  const [lastSync, setLastSync] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const gmapRef = useRef(null);
  const clustererRef = useRef(null);
  const infoRef = useRef(null);
  const markerMapRef = useRef(new Map());
  const posRef = useRef(new Map());
  const targetRef = useRef(new Map());
  const partnersRef = useRef(partners);
  const coverageRef = useRef([]);
  const custMarkersRef = useRef([]);
  const densityRef = useRef([]);
  const trafficRef = useRef(null);
  const routeRef = useRef(null);
  const selCustRef = useRef(null);
  const historyRef = useRef(null);
  const openDrawerRef = useRef(() => {});

  useEffect(() => { partnersRef.current = partners; }, [partners]);
  useEffect(() => { const t = setTimeout(() => setSearch(searchRaw.trim().toLowerCase()), 220); return () => clearTimeout(t); }, [searchRaw]);

  /* ---------------- derived data ---------------- */
  const ref = useMemo(() => (cityF !== "all" && CITY_MAP[cityF] ? CITY_MAP[cityF] : { lat: 22.9, lng: 80 }), [cityF]);
  const filtered = useMemo(() => {
    const list = partners.filter((p) => {
      if (cityF !== "all" && p.city !== cityF) return false;
      if (catF !== "all" && !p.categories.includes(catF)) return false;
      if (statusF.length && !statusF.includes(p.status)) return false;
      if (search) {
        const hay = `${p.name} ${p.phone} ${p.partnerId} ${p.city} ${p.categories.join(" ")}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
    const dist = (p) => haversine(ref, p);
    const cmp = {
      nearest: (a, b) => dist(a) - dist(b),
      status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
      name: (a, b) => a.name.localeCompare(b.name),
      rating: (a, b) => b.rating - a.rating,
      recent: (a, b) => b.lastUpdate - a.lastUpdate,
      active: (a, b) => (isWorking(b.status) ? 1 : 0) - (isWorking(a.status) ? 1 : 0),
    }[sort];
    return [...list].sort(cmp);
  }, [partners, cityF, catF, statusF, search, sort, ref]);

  const counts = useMemo(() => {
    const base = { available: 0, on_job: 0, travelling: 0, busy: 0, delayed: 0, offline: 0 };
    filtered.forEach((p) => { base[p.status] += 1; });
    return { ...base, total: filtered.length, online: filtered.filter((p) => isOnline(p.status)).length };
  }, [filtered]);
  const totals = useMemo(() => ({ total: partners.length, online: partners.filter((p) => isOnline(p.status)).length }), [partners]);

  const visKey = useMemo(() => filtered.map((p) => `${p.id}:${p.status}`).join("|") + `#${selectedId}#${overlays.partners}`, [filtered, selectedId, overlays.partners]);
  const filteredIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered]);

  /* ---------------- real data: fetch + realtime + poll ---------------- */
  const fetchLive = useCallback(() => {
    return api.get("/admin/partners/live").then((r) => {
      const mapped = (r.data?.partners || []).map(mapLivePartner).filter((p) => p.lat != null && p.lng != null);
      if (mapped.length) {
        mapped.forEach((p) => targetRef.current.set(p.id, { lat: p.lat, lng: p.lng }));
        setPartners(mapped);
        setMode("real");
        setLastSync(Date.now());
      }
    }).catch(() => {});
  }, []);
  useEffect(() => { fetchLive(); }, [fetchLive]);

  // SSE live updates — move markers / refresh roster with no page reload
  useEffect(() => subscribe((ev) => {
    if (!ev) return;
    if (ev.type === "partner_location" && ev.data?.id) {
      targetRef.current.set(ev.data.id, { lat: ev.data.lat, lng: ev.data.lng });
      setPartners((prev) => {
        const i = prev.findIndex((p) => p.id === ev.data.id);
        if (i === -1) { fetchLive(); return prev; }
        const next = prev.slice();
        next[i] = { ...next[i], lat: ev.data.lat, lng: ev.data.lng, lastUpdate: Date.now() };
        return next;
      });
      setLastSync(Date.now());
    } else if (["partner_status", "job_new", "job_update", "__resync__"].includes(ev.type)) {
      fetchLive();
    }
  }), [subscribe, fetchLive]);

  // poll every 15s once we are showing real data
  useEffect(() => {
    if (mode !== "real") return undefined;
    const id = setInterval(fetchLive, 15000);
    return () => clearInterval(id);
  }, [mode, fetchLive]);

  /* ---------------- demo simulation (fallback only, no toasts) ---------------- */
  useEffect(() => {
    if (mode !== "demo") return undefined;
    const id = setInterval(() => {
      const { partners: next } = simulateTick(partnersRef.current);
      next.forEach((p) => targetRef.current.set(p.id, { lat: p.lat, lng: p.lng }));
      setPartners(next);
      setLastSync(Date.now());
    }, 2500);
    return () => clearInterval(id);
  }, [mode]);

  /* ---------------- map init ---------------- */
  useEffect(() => {
    let cancelled = false;
    loadMaps(GOOGLE_MAPS_API_KEY).then((maps) => {
      if (cancelled || !mapRef.current) return;
      const map = new maps.Map(mapRef.current, {
        center: { lat: 22.9, lng: 80 }, zoom: 5,
        disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false,
        styles: dark ? DARK_STYLE : LIGHT_STYLE, mapTypeId: "roadmap",
      });
      gmapRef.current = map;
      infoRef.current = new maps.InfoWindow();
      clustererRef.current = new MarkerClusterer({
        map, renderer: makeClusterRenderer(maps),
        onClusterClick: (_e, cluster) => {
          const tally = {};
          cluster.markers.forEach((m) => { tally[m.__status] = (tally[m.__status] || 0) + 1; });
          const rows = STATUS_ORDER.filter((s) => tally[s]).map((s) =>
            `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin:2px 0"><span style="width:9px;height:9px;border-radius:50%;background:${statusColor(s)}"></span>${statusLabel(s)} <b style="margin-left:auto">${tally[s]}</b></div>`).join("");
          infoRef.current.setContent(`<div style="min-width:150px"><div style="font-weight:700;margin-bottom:4px">${cluster.markers.length} partners nearby</div>${rows}</div>`);
          infoRef.current.setPosition(cluster.position);
          infoRef.current.open(map);
          map.fitBounds(cluster.bounds, 60);
        },
      });
      setReady(true);
      map.addListener("click", () => infoRef.current && infoRef.current.close());
    }).catch(() => setError("load_failed"));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = gmapRef.current; if (!map) return;
    if (mapType === "roadmap") map.setOptions({ mapTypeId: "roadmap", styles: dark ? DARK_STYLE : LIGHT_STYLE });
    else map.setOptions({ mapTypeId: "hybrid", styles: [] });
  }, [dark, mapType, ready]);

  /* ---------------- selection + popup ---------------- */
  const openPopup = useCallback((id) => {
    const maps = window.google?.maps; const map = gmapRef.current;
    const p = partnersRef.current.find((x) => x.id === id);
    const marker = markerMapRef.current.get(id);
    if (!maps || !map || !p || !marker) return;
    const c = statusColor(p.status);
    infoRef.current.setContent(
      `<div style="min-width:184px;font-family:system-ui">
        <div style="display:flex;gap:8px;align-items:center">
          <img src="${p.avatar}" width="38" height="38" style="border-radius:10px;object-fit:cover"/>
          <div><div style="font-weight:700;color:#0f172a">${p.name}</div><div style="font-size:12px;color:#1d4ed8;font-weight:600">${p.category}</div></div>
        </div>
        <div style="margin-top:6px;font-size:12px;color:#334155">${p.rating != null ? `★ ${p.rating} · ` : ""}<span style="color:${c};font-weight:700">${statusLabel(p.status)}</span></div>
        <div style="font-size:12px;color:#64748b">${p.city} · ${haversine(ref, p).toFixed(1)} km away</div>
        <div style="font-size:11px;color:#94a3b8">Updated ${timeAgo(p.lastUpdate)}</div>
        <button id="popup-view-${id}" data-testid="popup-view-${id}" style="margin-top:8px;width:100%;padding:7px;border:none;border-radius:9px;background:#0D47A1;color:#fff;font-weight:600;font-size:12px;cursor:pointer">View Details</button>
      </div>`);
    infoRef.current.open(map, marker);
    maps.event.addListenerOnce(infoRef.current, "domready", () => {
      const btn = document.getElementById(`popup-view-${id}`);
      if (btn) btn.addEventListener("click", () => openDrawerRef.current(id));
    });
  }, [ref]);

  const openDrawer = useCallback((id) => {
    setSelectedId(id);
    const p = partnersRef.current.find((x) => x.id === id);
    const map = gmapRef.current;
    if (p && map) { map.panTo({ lat: p.lat, lng: p.lng }); if ((map.getZoom() || 5) < 12) map.setZoom(13); }
  }, []);
  useEffect(() => { openDrawerRef.current = openDrawer; }, [openDrawer]);
  const locate = useCallback((p) => { const map = gmapRef.current; if (map) { map.panTo({ lat: p.lat, lng: p.lng }); map.setZoom(15); } }, []);

  /* ---------------- marker sync ---------------- */
  useEffect(() => {
    if (!ready || !window.google?.maps) return;
    const maps = window.google.maps;
    const mm = markerMapRef.current;
    mm.forEach((m, id) => {
      if (!filteredIds.has(id) || !overlays.partners) { m.setMap(null); mm.delete(id); posRef.current.delete(id); }
    });
    if (overlays.partners) {
      filtered.forEach((p) => {
        let m = mm.get(p.id);
        const sel = p.id === selectedId;
        if (!m) {
          m = new maps.Marker({ position: { lat: p.lat, lng: p.lng }, icon: partnerIcon(maps, p.status, { selected: sel }), title: p.name });
          m.__status = p.status; m.__id = p.id;
          m.addListener("click", () => { setSelectedId(p.id); openPopup(p.id); });
          mm.set(p.id, m); posRef.current.set(p.id, { lat: p.lat, lng: p.lng });
        } else {
          m.__status = p.status;
          m.setIcon(partnerIcon(maps, p.status, { selected: sel }));
          m.setZIndex(sel ? 9999 : undefined);
        }
      });
    }
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      if (overlays.partners) clustererRef.current.addMarkers(Array.from(mm.values()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visKey, ready]);

  /* ---------------- smooth movement (rAF) ---------------- */
  useEffect(() => {
    if (!ready) return undefined;
    let raf;
    const step = () => {
      targetRef.current.forEach((t, id) => {
        const m = markerMapRef.current.get(id); if (!m) return;
        const cur = posRef.current.get(id) || t;
        const nl = cur.lat + (t.lat - cur.lat) * 0.18;
        const ng = cur.lng + (t.lng - cur.lng) * 0.18;
        posRef.current.set(id, { lat: nl, lng: ng });
        m.setPosition({ lat: nl, lng: ng });
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  /* ---------------- city fly-to ---------------- */
  useEffect(() => {
    if (!ready) return;
    const map = gmapRef.current; const maps = window.google.maps;
    const inView = partners.filter((p) => (cityF === "all" || p.city === cityF)
      && (catF === "all" || p.categories.includes(catF))
      && (!statusF.length || statusF.includes(p.status)));
    const fit = () => {
      if (inView.length === 0) { if (cityF !== "all" && CITY_MAP[cityF]) { map.panTo(CITY_MAP[cityF]); map.setZoom(11); } return; }
      const b = new maps.LatLngBounds();
      inView.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, 70);
    };
    if (cityF !== "all" && CITY_MAP[cityF]) { map.panTo(CITY_MAP[cityF]); setTimeout(fit, 260); } else fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityF, ready]);

  /* ---------------- coverage overlay ---------------- */
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps; const map = gmapRef.current;
    coverageRef.current.forEach((c) => c.setMap(null)); coverageRef.current = [];
    if (overlays.coverage) {
      filtered.filter((p) => p.status === "available").forEach((p) => {
        coverageRef.current.push(new maps.Circle({ map, center: { lat: p.lat, lng: p.lng }, radius: p.coverageRadiusKm * 1000, strokeColor: "#22C55E", strokeOpacity: 0.5, strokeWeight: 1, fillColor: "#22C55E", fillOpacity: 0.06 }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays.coverage, visKey, ready]);

  /* ---------------- density overlay ---------------- */
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps; const map = gmapRef.current;
    densityRef.current.forEach((c) => c.setMap(null)); densityRef.current = [];
    if (overlays.heatmap) {
      filtered.forEach((p) => {
        densityRef.current.push(new maps.Circle({ map, center: { lat: p.lat, lng: p.lng }, radius: 4500, clickable: false, strokeOpacity: 0, fillColor: p.status === "available" ? "#22C55E" : isWorking(p.status) ? "#3B82F6" : "#94A3B8", fillOpacity: 0.07 }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays.heatmap, visKey, ready]);

  /* ---------------- customers overlay ---------------- */
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps; const map = gmapRef.current;
    custMarkersRef.current.forEach((m) => m.setMap(null)); custMarkersRef.current = [];
    if (overlays.customers) {
      filtered.filter((p) => isWorking(p.status) && p.activeJob).forEach((p) => {
        const pos = { lat: p.lat + p.activeJob.custOffset.dlat, lng: p.lng + p.activeJob.custOffset.dlng };
        custMarkersRef.current.push(new maps.Marker({ map, position: pos, icon: customerIcon(maps), title: p.activeJob.customer }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays.customers, visKey, ready]);

  /* ---------------- traffic overlay ---------------- */
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps; const map = gmapRef.current;
    if (overlays.traffic) { if (!trafficRef.current) trafficRef.current = new maps.TrafficLayer(); trafficRef.current.setMap(map); }
    else if (trafficRef.current) trafficRef.current.setMap(null);
  }, [overlays.traffic, ready]);

  /* ---------------- selected: route + customer ---------------- */
  const selected = partners.find((p) => p.id === selectedId) || null;
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps; const map = gmapRef.current;
    if (routeRef.current) { routeRef.current.setMap(null); routeRef.current = null; }
    if (selCustRef.current) { selCustRef.current.setMap(null); selCustRef.current = null; }
    if (selected && isWorking(selected.status) && selected.activeJob) {
      const partnerPos = { lat: selected.lat, lng: selected.lng };
      const custPos = { lat: selected.lat + selected.activeJob.custOffset.dlat, lng: selected.lng + selected.activeJob.custOffset.dlng };
      routeRef.current = new maps.Polyline({ map, path: [partnerPos, custPos], strokeColor: statusColor(selected.status), strokeOpacity: 0.9, strokeWeight: 3, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }] });
      selCustRef.current = new maps.Marker({ map, position: custPos, icon: customerIcon(maps), title: selected.activeJob.customer });
    }
  }, [selectedId, ready, selected]);

  /* ---------------- location history path ---------------- */
  useEffect(() => {
    if (!ready) return;
    const maps = window.google.maps; const map = gmapRef.current;
    if (historyRef.current) { historyRef.current.setMap(null); historyRef.current = null; }
    const p = partnersRef.current.find((x) => x.id === historyId);
    if (p) {
      const path = []; let lat = p.lat, lng = p.lng, h = p.heading + Math.PI;
      for (let i = 0; i < 14; i += 1) { lat += Math.sin(h) * 0.0016; lng += Math.cos(h) * 0.0016; h += (Math.random() - 0.5) * 0.4; path.push({ lat, lng }); }
      historyRef.current = new maps.Polyline({ map, path: [{ lat: p.lat, lng: p.lng }, ...path], strokeColor: "#1976D2", strokeOpacity: 0.7, strokeWeight: 3 });
      map.panTo({ lat: p.lat, lng: p.lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyId, ready]);

  /* ---------------- controls ---------------- */
  const zoomBy = (d) => { const m = gmapRef.current; if (m) m.setZoom((m.getZoom() || 5) + d); };
  const fitAll = useCallback(() => {
    const maps = window.google?.maps; const map = gmapRef.current; if (!maps || !map || filtered.length === 0) return;
    const b = new maps.LatLngBounds(); filtered.forEach((p) => b.extend({ lat: p.lat, lng: p.lng })); map.fitBounds(b, 70);
  }, [filtered]);
  const toggleFullscreen = () => {
    const el = wrapRef.current; if (!el) return;
    if (!document.fullscreenElement) { el.requestFullscreen?.(); setFullscreen(true); } else { document.exitFullscreen?.(); setFullscreen(false); }
  };
  useEffect(() => { const h = () => setFullscreen(!!document.fullscreenElement); document.addEventListener("fullscreenchange", h); return () => document.removeEventListener("fullscreenchange", h); }, []);
  const refresh = () => { setLastSync(Date.now()); toast.success("Live data refreshed", { description: "Markers, counters & filters updated" }); };

  const toggleStatus = (s) => setStatusF((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const clearAll = () => { setCityF("all"); setCatF("all"); setStatusF([]); setSearchRaw(""); setSearch(""); };
  const anyFilter = cityF !== "all" || catF !== "all" || statusF.length > 0 || !!search;
  const hoverMarker = (id) => { const m = markerMapRef.current.get(id); const maps = window.google?.maps; if (m && maps) { m.setAnimation(maps.Animation.BOUNCE); setTimeout(() => m.setAnimation(null), 700); } };

  /* ======================= RENDER ======================= */
  return (
    <div data-testid="livemap" className="space-y-4 text-slate-800 dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Partner Operations</h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" data-testid="live-badge">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> LIVE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Command center · {totals.total} partners · {totals.online} online · Last sync {timeAgo(lastSync)}</p>
        </div>
        <button data-testid="livemap-refresh" onClick={refresh}
          className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 shadow-sm transition-colors">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5" data-testid="status-counters">
        <StatCard label="Available" status="available" value={counts.available} total={counts.total} active={statusF.includes("available")} onClick={() => toggleStatus("available")} />
        <StatCard label="On Job" status="on_job" value={counts.on_job} total={counts.total} active={statusF.includes("on_job")} onClick={() => toggleStatus("on_job")} />
        <StatCard label="Travelling" status="travelling" value={counts.travelling} total={counts.total} active={statusF.includes("travelling")} onClick={() => toggleStatus("travelling")} />
        <StatCard label="Delayed" status="delayed" value={counts.delayed} total={counts.total} active={statusF.includes("delayed")} onClick={() => toggleStatus("delayed")} />
        <StatCard label="Offline" status="offline" value={counts.offline} total={counts.total} active={statusF.includes("offline")} onClick={() => toggleStatus("offline")} />
        <StatCard label="Total" value={counts.total} sub={`${counts.online} online`} tone="primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input data-testid="livemap-search" value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Search partner, phone, service, city or partner ID…"
            className="w-full h-10 pl-9 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900" />
          {searchRaw && <button onClick={() => setSearchRaw("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
        </div>
        <div className="w-40"><PremiumSelect data-testid="livemap-city-filter" value={cityF} onChange={(e) => setCityF(e.target.value)} placeholder="All Cities"
          options={[{ value: "all", label: "All Cities" }, ...CITIES.map((c) => ({ value: c.name, label: c.name }))]} /></div>
        <div className="w-44"><PremiumSelect data-testid="livemap-category-filter" value={catF} onChange={(e) => setCatF(e.target.value)} placeholder="All Categories"
          options={[{ value: "all", label: "All Categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} /></div>
        <div className="w-40"><PremiumSelect data-testid="livemap-sort" value={sort} onChange={(e) => setSort(e.target.value)}
          options={[{ value: "status", label: "Sort · Status" }, { value: "nearest", label: "Sort · Nearest" }, { value: "name", label: "Sort · Name" }, { value: "rating", label: "Sort · Rating" }, { value: "recent", label: "Sort · Recent" }, { value: "active", label: "Sort · Active Job" }]} /></div>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="status-filter">
        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1"><SlidersHorizontal className="h-3.5 w-3.5" /> Status</span>
        <button data-testid="status-chip-all" onClick={() => setStatusF([])} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!statusF.length ? "bg-primary-600 border-primary-600 text-white" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>All</button>
        {STATUS_ORDER.map((s) => {
          const on = statusF.includes(s); const c = statusColor(s);
          return (
            <button key={s} data-testid={`status-chip-${s}`} onClick={() => toggleStatus(s)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1.5 transition-colors"
              style={on ? { background: c, borderColor: c, color: "#fff" } : { color: c }}>
              <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : c }} /> {statusLabel(s)}
            </button>
          );
        })}
      </div>

      {anyFilter && (
        <div className="flex flex-wrap items-center gap-2" data-testid="filter-chips">
          {cityF !== "all" && <Chip label={`City: ${cityF}`} onClear={() => setCityF("all")} testid="chip-city" />}
          {catF !== "all" && <Chip label={`Category: ${catF}`} onClear={() => setCatF("all")} testid="chip-category" />}
          {statusF.map((s) => <Chip key={s} label={`Status: ${statusLabel(s)}`} onClear={() => toggleStatus(s)} testid={`chip-status-${s}`} />)}
          {search && <Chip label={`Search: ${searchRaw}`} onClear={() => setSearchRaw("")} testid="chip-search" />}
          <button data-testid="clear-filters" onClick={clearAll} className="text-xs font-semibold text-red-500 hover:text-red-600 px-2">Clear all</button>
        </div>
      )}

      {(cityF !== "all" || catF !== "all") && (
        <div className="flex flex-wrap gap-3">
          {cityF !== "all" && <SummaryCard title={cityF} subtitle="City Operations" counts={counts} />}
          {catF !== "all" && <SummaryCard title={catF} subtitle="Service Category" counts={counts} accent />}
        </div>
      )}

      <div className={`grid gap-4 ${panelOpen ? "lg:grid-cols-[1fr_360px]" : "lg:grid-cols-1"}`}>
        <div ref={wrapRef} className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-100 dark:bg-slate-900"
          style={{ height: fullscreen ? "100vh" : "min(72vh, 760px)", minHeight: 460 }}>
          <div ref={mapRef} className="absolute inset-0" data-testid="gmap-canvas" />

          {error === "load_failed" && (
            <div className="absolute inset-0 grid place-items-center bg-white/90 dark:bg-slate-900/90 text-center p-6" data-testid="map-error">
              <div><MapPin className="h-8 w-8 mx-auto text-slate-300 mb-2" /><p className="text-sm font-semibold">Could not load Google Maps</p><p className="text-xs text-slate-400 mt-1">Check the API key & that Maps JavaScript API is enabled for this domain.</p></div>
            </div>
          )}

          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900 text-xs font-semibold">
              <button data-testid="ctrl-roadmap" onClick={() => setMapType("roadmap")} className={`px-3 py-1.5 ${mapType === "roadmap" ? "bg-primary-600 text-white" : "text-slate-500"}`}>Map</button>
              <button data-testid="ctrl-satellite" onClick={() => setMapType("hybrid")} className={`px-3 py-1.5 ${mapType === "hybrid" ? "bg-primary-600 text-white" : "text-slate-500"}`}>Satellite</button>
            </div>
          </div>

          <div className="absolute top-3 right-3 flex items-center gap-2">
            <div className="relative">
              <CtrlBtn testid="ctrl-layers" onClick={() => setOverlayOpen((v) => !v)} active={overlayOpen}><Layers className="h-4 w-4" /></CtrlBtn>
              {overlayOpen && <OverlayMenu overlays={overlays} setOverlays={setOverlays} onClose={() => setOverlayOpen(false)} />}
            </div>
            <CtrlBtn testid="ctrl-fullscreen" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</CtrlBtn>
          </div>

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2">
            <CtrlBtn testid="ctrl-zoom-in" onClick={() => zoomBy(1)}><Plus className="h-4 w-4" /></CtrlBtn>
            <CtrlBtn testid="ctrl-zoom-out" onClick={() => zoomBy(-1)}><Minus className="h-4 w-4" /></CtrlBtn>
            <CtrlBtn testid="ctrl-fit" onClick={fitAll}><Crosshair className="h-4 w-4" /></CtrlBtn>
          </div>

          <div className="absolute bottom-3 left-3">
            {legendOpen ? (
              <div className="rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-sm p-3 w-40" data-testid="map-legend">
                <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Legend</span><button onClick={() => setLegendOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button></div>
                {STATUS_ORDER.map((s) => (
                  <div key={s} className="flex items-center justify-between text-xs py-0.5">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor(s) }} />{statusLabel(s)}</span>
                    <span className="font-bold text-slate-400">{counts[s]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <button data-testid="legend-open" onClick={() => setLegendOpen(true)} className="rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-sm p-2.5"><Layers className="h-4 w-4 text-slate-500" /></button>
            )}
          </div>

          <button data-testid="panel-toggle" onClick={() => setPanelOpen((v) => !v)} className="hidden lg:flex absolute bottom-3 right-3 items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300">
            {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />} {panelOpen ? "Hide" : "Partners"}
          </button>

          {filtered.length === 0 && ready && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="pointer-events-auto rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-lg p-6 text-center max-w-xs" data-testid="no-results">
                <MapPin className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No partners found</p>
                <p className="text-xs text-slate-400 mt-1">{catF !== "all" ? `No ${catF} partners` : "No partners"}{cityF !== "all" ? ` in ${cityF}` : ""}{statusF.length ? " with the selected status" : ""}.</p>
                <button onClick={clearAll} data-testid="no-results-clear" className="mt-3 text-xs font-semibold px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">View All Partners</button>
              </div>
            </div>
          )}

          <button data-testid="mobile-list-btn" onClick={() => setSheetOpen(true)} className="lg:hidden absolute bottom-3 right-3 inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-full bg-primary-600 text-white shadow-lg">
            <Users className="h-4 w-4" /> {filtered.length}
          </button>
        </div>

        {panelOpen && (
          <div className="hidden lg:block">
            <ListPanel filtered={filtered} selectedId={selectedId} onSelect={openDrawer} onHover={hoverMarker} counts={counts} />
          </div>
        )}
      </div>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-[9994]" data-testid="mobile-sheet">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 h-[72vh] bg-white dark:bg-[#0f1729] rounded-t-2xl border-t border-slate-200 dark:border-slate-800 flex flex-col animate-[slideUp_.2s_ease]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold">Live Partners · {filtered.length}</span>
              <button onClick={() => setSheetOpen(false)} className="p-1.5 text-slate-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-hidden"><ListPanel embedded filtered={filtered} selectedId={selectedId} onSelect={(id) => { openDrawer(id); setSheetOpen(false); }} counts={counts} /></div>
          </div>
        </div>
      )}

      {selected && <PartnerDrawer partner={selected} onClose={() => setSelectedId(null)} onLocate={locate}
        historyOn={historyId === selected.id} onToggleHistory={(p) => setHistoryId((cur) => cur === p.id ? null : p.id)} />}

      <style>{`
        @keyframes slideInRight { from { transform: translateX(24px); opacity: .4 } to { transform: translateX(0); opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(24px); opacity:.5 } to { transform: translateY(0); opacity:1 } }
      `}</style>
    </div>
  );
}

/* ---------------- small components ---------------- */
function StatCard({ label, status, value, total, sub, active, tone, onClick }) {
  const c = status ? statusColor(status) : "#0D47A1";
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <button data-testid={`stat-${status || "total"}`} onClick={onClick} disabled={!onClick}
      className={`text-left rounded-2xl border p-3 transition-all ${onClick ? "cursor-pointer hover:shadow-md" : "cursor-default"} ${active ? "ring-2 ring-offset-1 dark:ring-offset-slate-950" : ""} ${tone === "primary" ? "bg-primary-600 border-primary-600 text-white" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}
      style={active ? { "--tw-ring-color": c } : undefined}>
      <div className="flex items-center gap-1.5 mb-1">
        {status && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />}
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${tone === "primary" ? "text-white/80" : "text-slate-400"}`}>{label}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-2xl font-extrabold leading-none ${tone === "primary" ? "text-white" : "text-slate-900 dark:text-white"}`}>{value}</span>
        {status != null && total > 0 && <span className="text-[11px] font-semibold text-slate-400 mb-0.5">{pct}%</span>}
      </div>
      {sub && <span className="text-[11px] text-white/80">{sub}</span>}
    </button>
  );
}

function Chip({ label, onClear, testid }) {
  return (
    <span data-testid={testid} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800">
      {label}<button onClick={onClear} className="hover:text-primary-900 dark:hover:text-white"><X className="h-3 w-3" /></button>
    </span>
  );
}

function SummaryCard({ title, subtitle, counts, accent }) {
  return (
    <div data-testid="summary-card" className={`rounded-2xl border p-4 flex-1 min-w-[260px] ${accent ? "bg-primary-50/60 dark:bg-primary-900/15 border-primary-100 dark:border-primary-800" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{subtitle}</p>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>Total <b>{counts.total}</b></span>
        {STATUS_ORDER.map((s) => <span key={s} className="flex items-center gap-1" style={{ color: statusColor(s) }}><span className="h-2 w-2 rounded-full" style={{ background: statusColor(s) }} />{statusLabel(s)} <b>{counts[s]}</b></span>)}
      </div>
    </div>
  );
}

function CtrlBtn({ children, onClick, active, testid }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={`h-9 w-9 grid place-items-center rounded-xl border shadow-sm transition-colors ${active ? "bg-primary-600 border-primary-600 text-white" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
      {children}
    </button>
  );
}

function OverlayMenu({ overlays, setOverlays, onClose }) {
  const items = [
    { k: "partners", label: "Partners", icon: Users }, { k: "coverage", label: "Service Coverage", icon: Target },
    { k: "customers", label: "Customer Locations", icon: Navigation }, { k: "heatmap", label: "Partner Density", icon: Flame },
    { k: "traffic", label: "Traffic", icon: Car },
  ];
  return (
    <div className="absolute top-11 right-0 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-2 z-20" data-testid="overlay-menu">
      <div className="flex items-center justify-between px-2 py-1"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Layers</span><button onClick={onClose} className="text-slate-400"><X className="h-3.5 w-3.5" /></button></div>
      {items.map(({ k, label, icon: Icon }) => (
        <button key={k} data-testid={`overlay-${k}`} onClick={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          <Icon className="h-4 w-4 text-slate-400" /><span className="flex-1 text-left">{label}</span>
          <span className={`h-4 w-7 rounded-full transition-colors relative ${overlays[k] ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-700"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${overlays[k] ? "left-3.5" : "left-0.5"}`} />
          </span>
        </button>
      ))}
    </div>
  );
}

function ListPanel({ filtered, selectedId, onSelect, onHover, counts, embedded }) {
  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col ${embedded ? "h-full rounded-none border-0" : ""}`}
      style={embedded ? undefined : { height: "min(72vh, 760px)" }} data-testid="partner-panel">
      {!embedded && (
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div><h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Radio className="h-4 w-4 text-primary-600" /> Live Partners</h3>
            <p className="text-xs text-slate-400">{filtered.length} partners · {counts.online} online</p></div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800" data-testid="partner-list">
        {filtered.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">No partners match the current filters.</p>}
        {filtered.map((p) => {
          const c = statusColor(p.status); const sel = p.id === selectedId;
          return (
            <button key={p.id} data-testid={`partner-row-${p.id}`} onClick={() => onSelect(p.id)}
              onMouseEnter={() => onHover?.(p.id, true)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${sel ? "bg-primary-50/70 dark:bg-primary-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
              <div className="relative shrink-0">
                <img src={p.avatar} alt="" className="h-11 w-11 rounded-xl object-cover" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900" style={{ background: c }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                  {p.rating != null && <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-500"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating}</span>}
                </div>
                <p className="text-xs text-slate-500 truncate">{p.category} · {p.city}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: c }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{statusLabel(p.status)}</span>
                  <span className="text-[11px] text-slate-400">· {timeAgo(p.lastUpdate)}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
