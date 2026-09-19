import React, { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/gmaps";

/*
  AddressMap — renders a REAL interactive Google Map when a Maps API key is
  configured (admin → Integration Center). The marker is draggable and clicking
  the map moves it; both report the new position via onPick(lat, lng) so the
  parent can reverse-geocode & auto-fill the address. Falls back to a static
  OpenStreetMap embed if no key is configured or the SDK fails to load.
*/
const INDIA = { lat: 22.9734, lng: 78.6569 };

export default function AddressMap({ mapsKey, lat, lng, onPick }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  const [failed, setFailed] = useState(false);
  onPickRef.current = onPick;

  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

  // Initialize the Google map once the SDK + key are ready.
  useEffect(() => {
    if (!mapsKey) return;
    let cancelled = false;
    loadGoogleMaps(mapsKey)
      .then((maps) => {
        if (cancelled || !elRef.current || mapRef.current) return;
        const center = hasPoint ? { lat, lng } : INDIA;
        const map = new maps.Map(elRef.current, {
          center,
          zoom: hasPoint ? 17 : 4,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        const marker = new maps.Marker({
          position: center,
          map,
          draggable: true,
          visible: hasPoint,
          animation: maps.Animation.DROP,
        });
        marker.addListener("dragend", (e) => {
          onPickRef.current?.(e.latLng.lat(), e.latLng.lng());
        });
        map.addListener("click", (e) => {
          const la = e.latLng.lat(), ln = e.latLng.lng();
          marker.setPosition({ lat: la, lng: ln });
          marker.setVisible(true);
          onPickRef.current?.(la, ln);
        });
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [mapsKey]);

  // Recenter / move marker when the parent updates coordinates (e.g. GPS detect).
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !hasPoint) return;
    const pos = { lat, lng };
    mapRef.current.panTo(pos);
    mapRef.current.setZoom(17);
    markerRef.current.setPosition(pos);
    markerRef.current.setVisible(true);
  }, [lat, lng, hasPoint]);

  // Fallback: static OpenStreetMap embed (no interactivity, but always shows).
  if (!mapsKey || failed) {
    if (!hasPoint) return null;
    return (
      <iframe title="address-map" className="w-full h-44 rounded-lg border border-slate-200"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.008}%2C${lat - 0.008}%2C${lng + 0.008}%2C${lat + 0.008}&layer=mapnik&marker=${lat}%2C${lng}`} />
    );
  }

  return (
    <div className="relative">
      <div ref={elRef} data-testid="google-address-map" className="w-full h-44 rounded-lg border border-slate-200 overflow-hidden bg-slate-100" />
      {!hasPoint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="pointer-events-none rounded-full bg-white/90 shadow px-3 py-1 text-[11px] font-semibold text-slate-600">
            Tap the map or use current location to set your spot
          </span>
        </div>
      )}
    </div>
  );
}
