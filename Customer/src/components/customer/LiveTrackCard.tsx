import { TC } from "@/src/theme";
/** Live partner tracking for the customer booking drawer — polls /bookings/{id}/track every 15s and
 *  draws partner + customer pins on a real Google Map (route via Directions). Falls back to
 *  OpenStreetMap/Leaflet only when no Google Maps key is configured. */
import React, { useCallback, useEffect, useState } from "react";
import { Platform, View, Text, ActivityIndicator } from "react-native";
import { Navigation, Clock, MapPin } from "lucide-react-native";
import { api } from "../../api/client";
import { PRIMARY, EMERALD } from "../../theme";

const ENROUTE = ["assigned", "arrived_shop", "arrived_customer", "started"];
type Pt = { lat: number; lng: number } | null;

/* ---- Google Maps (preferred) ---- */
function gmapHtml(p: Pt, c: Pt, key: string) {
  const P = p ? `{lat:${p.lat},lng:${p.lng}}` : "null";
  const C = c ? `{lat:${c.lat},lng:${c.lng}}` : "null";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#map{margin:0;height:100%;width:100%;background:#E2E8F0}</style></head><body>
<div id="map"></div>
<script>
function init(){
  var P=${P},C=${C},center=P||C;
  var map=new google.maps.Map(document.getElementById('map'),{center:center,zoom:14,disableDefaultUI:true,gestureHandling:'greedy',clickableIcons:false});
  function pin(pos,color,title){if(!pos)return;new google.maps.Marker({position:pos,map:map,title:title,icon:{path:google.maps.SymbolPath.CIRCLE,scale:9,fillColor:color,fillOpacity:1,strokeColor:'#fff',strokeWeight:3}});}
  pin(P,'#1258B7','Your professional');pin(C,'#059669','Your address');
  if(P&&C){
    var ds=new google.maps.DirectionsService();
    var dr=new google.maps.DirectionsRenderer({map:map,suppressMarkers:true,preserveViewport:false,polylineOptions:{strokeColor:'#1258B7',strokeWeight:5,strokeOpacity:0.85}});
    ds.route({origin:P,destination:C,travelMode:google.maps.TravelMode.DRIVING},function(res,status){
      if(status==='OK'){dr.setDirections(res);}else{var b=new google.maps.LatLngBounds();b.extend(P);b.extend(C);map.fitBounds(b,40);}
    });
  }else{map.setZoom(15);}
}
window.gm_authFailure=function(){document.body.innerHTML='<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#64748B;font-family:sans-serif;font-size:13px">Map unavailable</div>';};
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${key}&callback=init"></script>
</body></html>`;
}

function GMap({ p, c, mapsKey }: { p: Pt; c: Pt; mapsKey: string }) {
  const m = p || c;
  if (!m) return null;
  if (Platform.OS === "web") {
    const src = p && c
      ? `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${p.lat},${p.lng}&destination=${c.lat},${c.lng}&mode=driving`
      : `https://www.google.com/maps/embed/v1/view?key=${mapsKey}&center=${m.lat},${m.lng}&zoom=15`;
    return React.createElement("iframe", { title: "live-track", src, loading: "lazy", "data-testid": "live-track-map", style: { width: "100%", height: "100%", border: 0, borderRadius: 6 } });
  }
  const { WebView } = require("react-native-webview");
  return <WebView key={`${p?.lat}-${p?.lng}-${c?.lat}-${c?.lng}`} originWhitelist={["*"]} source={{ html: gmapHtml(p, c, mapsKey) }} javaScriptEnabled domStorageEnabled style={{ flex: 1, backgroundColor: TC.border }} testID="live-track-map" />;
}

/* ---- OpenStreetMap fallback (no Google key configured) ---- */
function OsmMap({ p, c }: { p: Pt; c: Pt }) {
  const center = p || c;
  if (!center) return null;
  if (Platform.OS === "web") {
    const d = 0.01;
    const m = (p || c)!;
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${m.lng - d}%2C${m.lat - d}%2C${m.lng + d}%2C${m.lat + d}&layer=mapnik&marker=${m.lat}%2C${m.lng}`;
    return React.createElement("iframe", { title: "live-track", src, loading: "lazy", "data-testid": "live-track-map", style: { width: "100%", height: "100%", border: 0, borderRadius: 6 } });
  }
  const { WebView } = require("react-native-webview");
  const pins = [p ? `L.marker([${p.lat},${p.lng}],{icon:L.divIcon({className:'',html:'<div style="width:18px;height:18px;border-radius:9px;background:#1258B7;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>'})}).addTo(m);` : "",
    c ? `L.marker([${c.lat},${c.lng}],{icon:L.divIcon({className:'',html:'<div style="width:18px;height:18px;border-radius:9px;background:#059669;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>'})}).addTo(m);` : ""].join("");
  const fit = p && c ? `m.fitBounds([[${p.lat},${p.lng}],[${c.lat},${c.lng}]],{padding:[30,30]});` : `m.setView([${center.lat},${center.lng}],15);`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>html,body,#m{margin:0;height:100%;background:#E2E8F0}</style></head><body><div id="m"></div><script>var m=L.map('m',{zoomControl:false,attributionControl:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(m);${pins}${fit}</script></body></html>`;
  return <WebView key={`${p?.lat}-${p?.lng}`} originWhitelist={["*"]} source={{ html }} javaScriptEnabled style={{ flex: 1, backgroundColor: TC.border }} testID="live-track-map" />;
}

export function LiveTrackCard({ booking }: { booking: any }) {
  const [data, setData] = useState<any>(null);
  const bookingId = booking?.id;
  const bookingStatus = booking?.status;
  const poll = useCallback(async () => {
    if (!bookingId) return;
    try { setData(await api.get<any>(`/bookings/${bookingId}/track`)); } catch { /* keep last */ }
  }, [bookingId]);
  useEffect(() => {
    if (!ENROUTE.includes(bookingStatus)) return undefined;
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [poll, bookingStatus]);
  if (!ENROUTE.includes(booking?.status)) return null;
  const p = data?.partner_location?.lat != null ? data.partner_location : null;
  const c = data?.customer_location?.lat != null ? data.customer_location : null;
  const mapsKey = (data?.maps_key || "").trim();
  const arrived = ["arrived_customer", "started"].includes(data?.status || booking.status);
  return (
    <View testID="live-track" style={{ borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: TC.border, backgroundColor: TC.surface }}>
      <View style={{ height: 180, backgroundColor: TC.surfaceAlt }}>
        {data ? (p || c
          ? (mapsKey ? <GMap p={p} c={c} mapsKey={mapsKey} /> : <OsmMap p={p} c={c} />)
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}><MapPin size={20} color={TC.textFaint} /><Text style={{ color: TC.textMuted, fontSize: 12.5 }}>Waiting for your professional&apos;s location…</Text></View>)
          : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={PRIMARY[600]} /></View>}
      </View>
      <View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: arrived ? EMERALD[50] : PRIMARY[50], alignItems: "center", justifyContent: "center" }}>{arrived ? <MapPin size={18} color={EMERALD[600]} /> : <Navigation size={18} color={PRIMARY[600]} />}</View>
        <View style={{ flex: 1 }}>
          <Text testID="live-track-eta" style={{ fontSize: 14, fontWeight: "800", color: TC.text }}>{data?.eta_text || (arrived ? "Professional has arrived" : "Professional is on the way")}</Text>
          <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 2 }}>
            {data?.partner?.name ? `${data.partner.name} · ` : ""}{data?.distance_km != null && !arrived ? `${data.distance_km} km away` : "Live location updates every 15s"}
          </Text>
        </View>
        {!arrived && data?.eta_minutes != null ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: TC.primarySoft, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}><Clock size={12} color={TC.primaryText} /><Text style={{ fontSize: 12, fontWeight: "800", color: TC.primaryText }}>{data.eta_minutes} min</Text></View> : null}
      </View>
    </View>
  );
}
