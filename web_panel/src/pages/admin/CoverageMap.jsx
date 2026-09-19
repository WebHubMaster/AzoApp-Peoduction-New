import React, { useEffect, useRef, useState } from "react";
import { Map as MapIcon, Loader2, RefreshCcw, Layers } from "lucide-react";
import api from "@/lib/api";
import { loadGoogleMaps } from "@/lib/gmaps";

/* Coverage Map — every active service area (circle + polygon) plus launch-demand
   pins on one map so ops instantly see coverage gaps vs where customers are
   asking for service. Activates when a Google Maps key is configured. */
export default function CoverageMap() {
  const [data, setData] = useState({ areas: [], demand_pins: [] });
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState(null);
  const [error, setError] = useState("");
  const mapRef = useRef(null);
  const gmap = useRef(null);
  const shapes = useRef([]);

  const load = () => {
    setLoading(true);
    api.get("/admin/coverage-map").then((r) => setData(r.data || { areas: [], demand_pins: [] }))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    api.get("/auth/config").then((r) => setApiKey(r.data?.integrations?.google_maps_api_key || "")).catch(() => setApiKey(""));
    load();
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then((maps) => {
      if (!mapRef.current) return;
      gmap.current = new maps.Map(mapRef.current, { center: { lat: 23.0, lng: 82.0 }, zoom: 5, mapTypeControl: false, streetViewControl: false });
    }).catch(() => setError("load_failed"));
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !gmap.current || !window.google?.maps) return;
    const maps = window.google.maps;
    shapes.current.forEach((s) => s.setMap(null));
    shapes.current = [];
    const bounds = new maps.LatLngBounds();
    let any = false;
    (data.areas || []).forEach((a) => {
      if (Array.isArray(a.polygon) && a.polygon.length >= 3) {
        const path = a.polygon.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
        shapes.current.push(new maps.Polygon({ map: gmap.current, paths: path, strokeColor: "#7c3aed", strokeWeight: 2, fillColor: "#7c3aed", fillOpacity: 0.12 }));
        path.forEach((p) => { bounds.extend(p); any = true; });
      } else if (a.center_lat != null && a.center_lat !== "" && a.radius_km) {
        const c = new maps.Circle({ map: gmap.current, center: { lat: Number(a.center_lat), lng: Number(a.center_lng) }, radius: Number(a.radius_km) * 1000,
          strokeColor: "#2563eb", strokeOpacity: 0.7, strokeWeight: 1.5, fillColor: "#2563eb", fillOpacity: 0.1 });
        shapes.current.push(c);
        if (c.getBounds()) { bounds.union(c.getBounds()); any = true; }
      }
    });
    (data.demand_pins || []).forEach((d) => {
      const m = new maps.Marker({ map: gmap.current, position: { lat: Number(d.lat), lng: Number(d.lng) }, title: `${d.pincode} · ${d.count} request(s)`,
        icon: { path: maps.SymbolPath.CIRCLE, scale: Math.min(14, 6 + d.count), fillColor: "#f59e0b", fillOpacity: 0.9, strokeColor: "#fff", strokeWeight: 2 } });
      const info = new maps.InfoWindow({ content: `<b>${d.pincode}</b> — ${d.count} waitlist request(s)<br/>${d.city || ""}` });
      m.addListener("click", () => info.open(gmap.current, m));
      shapes.current.push(m);
      bounds.extend({ lat: Number(d.lat), lng: Number(d.lng) }); any = true;
    });
    if (any) gmap.current.fitBounds(bounds);
  }, [data, apiKey]);

  return (
    <div data-testid="coverage-map-page">
      <div className="rounded-2xl border border-primary-200 bg-primary-50/60 dark:bg-primary-900/15 dark:border-primary-800 p-5 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-heading font-bold text-primary-900 dark:text-primary-100 flex items-center gap-2"><Layers className="h-5 w-5" /> Coverage map</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">Blue circles &amp; purple polygons are your active service areas. Amber pins are launch-demand pincodes (bigger = more requests). Pins sitting <b>outside</b> every zone are your coverage gaps.</p>
          </div>
          <button onClick={load} className="text-sm font-semibold text-primary-700 hover:underline flex items-center gap-1" data-testid="coverage-refresh"><RefreshCcw className="h-4 w-4" /> Refresh</button>
        </div>
        <div className="flex gap-4 mt-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-500/40 border border-blue-600" /> Radius area</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-purple-500/40 border border-purple-600" /> Polygon area</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500 border border-white" /> Launch demand</span>
          <span className="text-slate-400">· {loading ? "loading…" : `${data.areas?.length || 0} areas · ${data.demand_pins?.length || 0} demand pins`}</span>
        </div>
      </div>

      {!apiKey || error ? (
        <div data-testid="coverage-map-fallback" className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-8 text-center">
          <MapIcon className="h-8 w-8 mx-auto text-slate-400" />
          <p className="text-sm text-slate-500 mt-3 max-w-lg mx-auto">
            {error === "load_failed" ? "Google Maps couldn't load — check the API key." : "Add a Google Maps API key in Integration Center → Google Maps to see the visual coverage heatmap."}
          </p>
          {!loading && (
            <div className="mt-4 text-left max-w-md mx-auto text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-semibold">{data.areas?.length || 0} active areas · {data.demand_pins?.length || 0} demand pins</p>
              {(data.demand_pins || []).slice(0, 8).map((d) => (
                <div key={d.pincode} className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1">
                  <span>{d.pincode} · {d.city || "—"}</span><span className="font-semibold text-amber-600">{d.count} req</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div ref={mapRef} data-testid="coverage-map" className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" style={{ height: "72vh" }} />
      )}
    </div>
  );
}
