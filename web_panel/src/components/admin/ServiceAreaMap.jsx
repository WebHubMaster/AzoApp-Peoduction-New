import React, { useEffect, useRef, useState } from "react";
import { MapPin, Crosshair, Pentagon, X } from "lucide-react";
import { loadGoogleMaps } from "@/lib/gmaps";

/**
 * ServiceAreaMap — pick a service-area centre (click / drag pin) with a live
 * radius circle, OR draw a custom polygon for oddly-shaped zones. Also renders
 * existing areas faintly for overlap context. Activates automatically when a
 * Google Maps API key is configured; degrades to a helpful placeholder + coord
 * readout otherwise (Find on map / Use my location still work in the form).
 *
 * Props: apiKey, value{lat,lng}, radiusKm, polygon[], otherAreas[],
 *        onChange(lat,lng), onPolygon(points|null)
 */
export default function ServiceAreaMap({ apiKey, value, radiusKm, polygon, otherAreas = [], onChange, onPolygon }) {
  const mapRef = useRef(null);
  const gmap = useRef(null);
  const marker = useRef(null);
  const circle = useRef(null);
  const poly = useRef(null);
  const mapsRef = useRef(null);
  const drawingRef = useRef(false);
  const others = useRef([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const hasPoint = value && value.lat != null && value.lng != null && !isNaN(Number(value.lat)) && !isNaN(Number(value.lng));
  const hasPoly = Array.isArray(polygon) && polygon.length >= 3;

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setError("");          // clear any stale failure so a valid key retries cleanly
    loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !mapRef.current) return;
      mapsRef.current = maps;
      const center = hasPoint ? { lat: Number(value.lat), lng: Number(value.lng) } : { lat: 23.3441, lng: 85.3096 };
      gmap.current = new maps.Map(mapRef.current, {
        center, zoom: hasPoint ? 12 : 5, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      });
      // Single click handler: in draw mode a click adds a polygon vertex, otherwise
      // it sets the service-area centre. (Google removed DrawingManager in v3.65, so
      // polygon drawing is implemented manually with an editable google.maps.Polygon.)
      gmap.current.addListener("click", (e) => {
        if (drawingRef.current) addVertex(e.latLng);
        else onChange(e.latLng.lat(), e.latLng.lng());
      });
      // If editing an existing area that already has a polygon, render it editable.
      if (hasPoly) renderExistingPolygon();
      setReady(true);
    }).catch((e) => { console.warn("[ServiceAreaMap] Google Maps failed:", e?.message || e); if (!cancelled) setError("load_failed"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  // other areas (faint) — overlap context
  useEffect(() => {
    if (!ready || !window.google?.maps) return;
    const maps = window.google.maps;
    others.current.forEach((o) => o.setMap(null));
    others.current = [];
    (otherAreas || []).forEach((a) => {
      if (a.center_lat != null && a.center_lat !== "" && a.radius_km) {
        others.current.push(new maps.Circle({ map: gmap.current, center: { lat: Number(a.center_lat), lng: Number(a.center_lng) },
          radius: Number(a.radius_km) * 1000, strokeColor: "#94a3b8", strokeOpacity: 0.5, strokeWeight: 1, fillColor: "#94a3b8", fillOpacity: 0.06 }));
      }
      if (Array.isArray(a.polygon) && a.polygon.length >= 3) {
        others.current.push(new maps.Polygon({ map: gmap.current, paths: a.polygon.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })),
          strokeColor: "#94a3b8", strokeOpacity: 0.5, strokeWeight: 1, fillColor: "#94a3b8", fillOpacity: 0.06 }));
      }
    });
  }, [ready, otherAreas]);

  // marker + circle (radius) when a point exists and there is no polygon
  useEffect(() => {
    if (!ready || !window.google?.maps) return;
    const maps = window.google.maps;
    if (!hasPoint || hasPoly) {
      if (marker.current) { marker.current.setMap(null); marker.current = null; }
      if (circle.current) { circle.current.setMap(null); circle.current = null; }
      return;
    }
    const pos = { lat: Number(value.lat), lng: Number(value.lng) };
    if (!marker.current) {
      marker.current = new maps.Marker({ position: pos, map: gmap.current, draggable: true });
      marker.current.addListener("dragend", (e) => onChange(e.latLng.lat(), e.latLng.lng()));
    } else marker.current.setPosition(pos);
    const radM = Math.max(0.1, Number(radiusKm) || 1) * 1000;
    if (!circle.current) {
      circle.current = new maps.Circle({ map: gmap.current, center: pos, radius: radM,
        strokeColor: "#2563eb", strokeOpacity: 0.7, strokeWeight: 1.5, fillColor: "#2563eb", fillOpacity: 0.12 });
    } else { circle.current.setCenter(pos); circle.current.setRadius(radM); }
    gmap.current.panTo(pos);
    if (circle.current.getBounds()) gmap.current.fitBounds(circle.current.getBounds());
  }, [ready, value?.lat, value?.lng, radiusKm, hasPoly]);

  // ── Manual polygon drawing (replaces the removed google.maps.drawing library) ──
  const emitPolygon = () => {
    if (!poly.current) return;
    const path = poly.current.getPath && poly.current.getPath();
    if (!path) return;
    const pts = path.getArray().map((ll) => ({ lat: ll.lat(), lng: ll.lng() }));
    if (pts.length >= 3) onPolygon && onPolygon(pts);
  };
  const attachPolyListeners = () => {
    if (!poly.current) return;
    const maps = mapsRef.current;
    // Ensure the polygon always owns a valid MVCArray path — a polygon created with
    // an empty `paths: []` (or without paths at all) can have `getPath()` return
    // undefined, which then blows up with "Cannot read properties of undefined
    // (reading 'addListener')" when we try to wire vertex listeners.
    let path = poly.current.getPath && poly.current.getPath();
    if (!path) {
      path = new maps.MVCArray();
      poly.current.setPath(path);
    }
    path.addListener("set_at", emitPolygon);
    path.addListener("insert_at", emitPolygon);
    path.addListener("remove_at", emitPolygon);
  };
  const newEditablePolygon = (paths = []) => {
    const maps = mapsRef.current;
    // Always construct with an MVCArray so getPath() is defined even when we start
    // with zero vertices (drawing mode adds them on click).
    const path = new maps.MVCArray(
      (paths || []).map((p) => new maps.LatLng(Number(p.lat), Number(p.lng)))
    );
    return new maps.Polygon({
      map: gmap.current, paths: path, editable: true, draggable: false,
      strokeColor: "#7c3aed", strokeWeight: 2, fillColor: "#7c3aed", fillOpacity: 0.15,
    });
  };
  const renderExistingPolygon = () => {
    if (!mapsRef.current || !hasPoly) return;
    if (poly.current) { poly.current.setMap(null); poly.current = null; }
    poly.current = newEditablePolygon(polygon.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })));
    attachPolyListeners();
  };
  const addVertex = (latLng) => {
    if (!poly.current) { poly.current = newEditablePolygon([]); attachPolyListeners(); }
    const path = poly.current.getPath();
    if (!path) return; // defensive: attachPolyListeners guarantees this, but be safe
    path.push(latLng);
    emitPolygon();
  };

  const startDraw = () => {
    if (!ready) return;
    if (drawing) { // toggle → finish drawing
      drawingRef.current = false;
      setDrawing(false);
      if (poly.current) {
        const p = poly.current.getPath && poly.current.getPath();
        if (!p || p.getLength() < 3) { poly.current.setMap(null); poly.current = null; onPolygon && onPolygon(null); }
      }
      return;
    }
    if (poly.current) { poly.current.setMap(null); poly.current = null; }
    onPolygon && onPolygon(null);
    drawingRef.current = true;
    setDrawing(true);
  };
  const clearPoly = () => {
    if (poly.current) { poly.current.setMap(null); poly.current = null; }
    drawingRef.current = false;
    setDrawing(false);
    onPolygon && onPolygon(null);
  };

  if (!apiKey || error) {
    return (
      <div data-testid="area-map-placeholder" className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 text-center">
        <MapPin className="h-6 w-6 mx-auto text-slate-400" />
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          {error === "load_failed" ? "Google Maps couldn't load — check the API key." : "Add a Google Maps API key in Integration Center → Google Maps to pick the centre or draw a polygon on the map."}
          {" "}Meanwhile, use <b>Find on map</b> or <b>Use my location</b> below — coordinates still get set correctly.
        </p>
        {hasPoint && (
          <p className="text-xs font-semibold text-emerald-600 mt-2 flex items-center justify-center gap-1" data-testid="area-map-coords">
            <Crosshair className="h-3.5 w-3.5" /> Centre: {Number(value.lat).toFixed(4)}, {Number(value.lng).toFixed(4)} · {radiusKm || 0} km
          </p>
        )}
        {hasPoly && <p className="text-xs font-semibold text-purple-600 mt-1">Polygon with {polygon.length} points set.</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <button type="button" data-testid="area-draw-polygon" onClick={startDraw}
          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${drawing ? "bg-purple-600 text-white border-purple-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-purple-300"}`}>
          <Pentagon className="h-3.5 w-3.5" /> {drawing ? "Finish polygon (click map to add points)" : "Draw polygon"}
        </button>
        {hasPoly && (
          <button type="button" data-testid="area-clear-polygon" onClick={clearPoly} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-red-500 hover:border-red-300 flex items-center gap-1">
            <X className="h-3.5 w-3.5" /> Clear polygon
          </button>
        )}
      </div>
      <div ref={mapRef} data-testid="area-map" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" style={{ height: "280px" }} />
      <p className="text-[11px] text-slate-400 mt-1">Click / drag the pin for a circular radius, or <b>Draw polygon</b> for a custom shape. Grey areas are existing zones (overlap check).</p>
    </div>
  );
}
