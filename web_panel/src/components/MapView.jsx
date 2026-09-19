import React from "react";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { MapPin } from "lucide-react";

/**
 * MapView — one map component used everywhere. When a Google Maps API key is
 * configured in the admin Integration Center it renders a real Google map
 * (Maps Embed API); otherwise it gracefully falls back to OpenStreetMap.
 * Pass either {lat,lng} or a free-text {query}.
 */
export default function MapView({ lat, lng, query, label, zoom = 15, height = 176, className = "", rounded = true }) {
  const { maps_api_key: key } = useSiteConfig();
  const hasGeo = lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
  const cls = `w-full border-0 ${rounded ? "rounded-xl" : ""} ${className}`;
  const style = { height: typeof height === "number" ? `${height}px` : height };

  if (!hasGeo && !query) {
    return (
      <div className={`flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-slate-800 text-slate-500 text-sm px-3 text-center ${rounded ? "rounded-xl" : ""}`} style={style}>
        <MapPin className="h-4 w-4 shrink-0" /> {label || "Location not available"}
      </div>
    );
  }

  if (key) {
    // Real Google map via the Embed API (no SDK needed).
    const q = hasGeo ? `${lat},${lng}` : encodeURIComponent(query);
    const src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&zoom=${zoom}`;
    return <iframe title={`gmap-${label || q}`} className={cls} style={style} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={src} />;
  }

  // OpenStreetMap fallback.
  if (hasGeo) {
    const d = 0.008;
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
    return <iframe title={`osm-${label || lat}`} className={cls} style={style} loading="lazy" src={src} />;
  }
  const src = `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
  return <iframe title={`osm-q-${query}`} className={cls} style={style} loading="lazy" src={src} />;
}

/** Build a Google Maps directions link (used by "Navigate" buttons). */
export function directionsUrl({ lat, lng, query }) {
  const dest = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(query || "");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
