/* Google Maps visual assets for the Live Partner Map: clean light + dark map
   styles, premium teardrop partner markers (status-coloured) and the cluster
   renderer (coloured by dominant status with a live count). */
import { statusColor, STATUS_ORDER } from "@/lib/partnerSim";

export const LIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f7fb" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#dbe2ec" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e4efe6" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f1f4f9" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e7ecf3" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe3f2" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9db7cc" }] },
];

export const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8697ad" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }, { weight: 2 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1f2937" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#12271c" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#182130" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#223044" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1a2b" }] },
];

function teardropSVG(color, { selected } = {}) {
  const w = selected ? 46 : 38;
  const h = selected ? 58 : 48;
  const glow = selected
    ? `<circle cx="19" cy="19" r="18" fill="${color}" opacity="0.18"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 38 50">
    ${glow}
    <path d="M19 1C10.2 1 3 8.2 3 17c0 11.2 16 31 16 31s16-19.8 16-31C35 8.2 27.8 1 19 1z"
      fill="${color}" stroke="#ffffff" stroke-width="3"/>
    <circle cx="19" cy="17" r="6.2" fill="#ffffff"/>
    <circle cx="19" cy="17" r="3" fill="${color}"/>
  </svg>`;
}

export function partnerIcon(maps, status, opts = {}) {
  const color = statusColor(status);
  const svg = teardropSVG(color, opts);
  const w = opts.selected ? 46 : 38;
  const h = opts.selected ? 58 : 48;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(w, h),
    anchor: new maps.Point(w / 2, h),
  };
}

export function customerIcon(maps) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 38 50">
    <path d="M19 1C10.2 1 3 8.2 3 17c0 11.2 16 31 16 31s16-19.8 16-31C35 8.2 27.8 1 19 1z"
      fill="#DC2626" stroke="#ffffff" stroke-width="3"/>
    <path d="M19 10a4 4 0 100 8 4 4 0 000-8zm-7 14c0-3.9 3.1-6 7-6s7 2.1 7 6z" fill="#ffffff"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(34, 44),
    anchor: new maps.Point(17, 44),
  };
}

/* Cluster bubble coloured by the dominant status in the group. */
export function makeClusterRenderer(maps) {
  return {
    render({ count, position, markers }) {
      const tally = {};
      markers.forEach((m) => { const s = m.__status || "available"; tally[s] = (tally[s] || 0) + 1; });
      let dominant = "available";
      let max = -1;
      STATUS_ORDER.forEach((s) => { if ((tally[s] || 0) > max) { max = tally[s] || 0; dominant = s; } });
      const color = statusColor(dominant);
      const r = count < 10 ? 22 : count < 50 ? 27 : 33;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r * 2}" height="${r * 2}">
        <circle cx="${r}" cy="${r}" r="${r}" fill="${color}" opacity="0.22"/>
        <circle cx="${r}" cy="${r}" r="${r - 6}" fill="${color}" opacity="0.9"/>
        <circle cx="${r}" cy="${r}" r="${r - 6}" fill="none" stroke="#ffffff" stroke-width="2.5"/>
      </svg>`;
      return new maps.Marker({
        position,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new maps.Size(r * 2, r * 2),
          anchor: new maps.Point(r, r),
        },
        label: { text: String(count), color: "#ffffff", fontSize: "13px", fontWeight: "700" },
        zIndex: 1000 + count,
      });
    },
  };
}
