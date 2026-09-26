/** Port of web_panel AddressForm.jsx + AddressMap fallback (OSM embed). Feature blocks gated by admin address_config. */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Navigation, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react-native";
import { api } from "../../api/client";
import { useToast } from "../Toast";
import { PRIMARY, SLATE, EMERALD, AMBER, ROSE, useTheme } from "../../theme";
import { FInput, FSelect, onlyDigits, onlyAlpha } from "./FormControls";

const DEFAULT_TYPES = ["Apartment", "Independent House", "Villa", "Commercial Building", "Farmhouse", "Office"];
const LABELS = ["Home", "Office", "Parents", "Rental", "Other"];

export const emptyAddress = () => ({
  label: "Home", line: "", pincode: "", city: "", state: "", property_type: "Apartment",
  wing: "", floor: "", flat_no: "", landmark: "", instructions: "",
  lat: null as number | null, lng: null as number | null, is_default: false,
});

const Lbl = ({ children }: { children: React.ReactNode }) => <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400] }}>{children}</Text>;

function AddressMap({ lat, lng }: { lat: any; lng: any }) {
  const { isDark } = useTheme();
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${ln - 0.008}%2C${la - 0.008}%2C${ln + 0.008}%2C${la + 0.008}&layer=mapnik&marker=${la}%2C${ln}`;
  const box = { height: 176, borderRadius: 8, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], overflow: "hidden" as const };
  if (Platform.OS === "web") return <View testID="address-map" style={box}>{React.createElement("iframe", { title: "address-map", src, style: { width: "100%", height: "100%", border: 0 } })}</View>;
  return <View testID="address-map" style={box}><WebView source={{ uri: src }} style={{ flex: 1 }} /></View>;
}

export function AddressForm({ value, onChange, cfg = {}, onServiceability }: { value: any; onChange: (v: any) => void; cfg?: any; onServiceability?: (s: any) => void }) {
  const { c, isDark } = useTheme();
  const toast = useToast();
  const [locating, setLocating] = useState(false);
  const [svc, setSvc] = useState<any>(null);
  const [svcChecking, setSvcChecking] = useState(false);
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  const types: string[] = cfg.property_types?.length ? cfg.property_types : DEFAULT_TYPES;
  const hasPoint = !!(value.lat && value.lng);

  useEffect(() => {
    const p = String(value.pincode || "").trim();
    if (!/^\d{6}$/.test(p)) { setSvc(null); setSvcChecking(false); onServiceability?.(null); return; }
    let alive = true; setSvcChecking(true);
    api.get(`/geo/serviceability?pincode=${p}`, { auth: false })
      .then((r) => { if (alive) { setSvc(r); onServiceability?.(r); } })
      .catch(() => { if (alive) { setSvc(null); onServiceability?.(null); } })
      .finally(() => { if (alive) setSvcChecking(false); });
    return () => { alive = false; };
  }, [value.pincode]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyReverse = async (latitude: number, longitude: number) => {
    let data: any = null;
    try { data = await api.get(`/geo/reverse?lat=${latitude}&lng=${longitude}`, { auth: false }); }
    catch { onChange({ ...value, lat: latitude, lng: longitude }); toast.error("Located you on the map, but couldn't auto-fill the address"); return; }
    onChange({ ...value, line: data.line || value.line, city: data.city || value.city, state: data.state || value.state, pincode: data.pincode || value.pincode, lat: data.lat ?? latitude, lng: data.lng ?? longitude });
    toast.success("Location set — address auto-filled");
  };

  const detect = async () => {
    setLocating(true);
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) return toast.error("Location permission denied — please allow location access and try again");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await applyReverse(pos.coords.latitude, pos.coords.longitude);
    } catch { toast.error("Could not get your location — please try again"); }
    finally { setLocating(false); }
  };

  const pin = (on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? PRIMARY[700] : (isDark ? SLATE[700] : SLATE[200]), backgroundColor: on ? c.primarySoft : "transparent" });

  return (
    <View testID="address-form" style={{ gap: 12 }}>
      <Pressable testID="gps-detect-btn" onPress={detect} disabled={locating} style={{ height: 44, borderRadius: 8, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: locating ? 0.6 : 1, borderColor: hasPoint ? EMERALD[300] : PRIMARY[300], backgroundColor: hasPoint ? EMERALD[50] : PRIMARY[50] }}>
        {locating ? <ActivityIndicator size="small" color={PRIMARY[700]} /> : hasPoint ? <CheckCircle2 size={16} color={EMERALD[700]} /> : <Navigation size={16} color={PRIMARY[700]} />}
        <Text style={{ fontSize: 14, fontWeight: "600", color: hasPoint ? EMERALD[700] : PRIMARY[700] }}>{locating ? "Detecting location…" : hasPoint ? "Location set — tap to update" : "Use my current location"}</Text>
      </Pressable>
      {!hasPoint ? <View testID="gps-required-hint" style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: -6 }}><AlertCircle size={12} color={AMBER[500]} /><Text style={{ fontSize: 11, color: SLATE[400] }}>Required — we auto-fill your city & pincode from your location.</Text></View> : null}

      <AddressMap lat={value.lat} lng={value.lng} />

      <View>
        <Lbl>Address Label</Lbl>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {LABELS.map((l) => <Pressable key={l} testID={`addr-label-${l.toLowerCase()}`} onPress={() => set("label", l)} style={pin(value.label === l)}><Text style={{ fontSize: 12, fontWeight: "500", color: value.label === l ? c.primaryText : SLATE[500] }}>{l}</Text></Pressable>)}
        </View>
      </View>

      <FInput testID="addr-line" placeholder="House / Flat no, Building, Street" value={value.line || ""} onChange={(v) => set("line", v)} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><FInput testID="addr-pincode" placeholder="Pincode" keyboardType="number-pad" maxLength={6} value={value.pincode || ""} onChange={(v) => set("pincode", onlyDigits(v, 6))} /></View>
        <View style={{ flex: 1 }}><FInput testID="addr-city" placeholder="City" value={value.city || ""} onChange={(v) => set("city", onlyAlpha(v))} /></View>
      </View>

      {String(value.pincode || "").length === 6 && (svcChecking || svc) ? (
        <View testID="serviceability-status" style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: svcChecking ? (isDark ? SLATE[800] : SLATE[100]) : svc?.serviceable ? EMERALD[50] : ROSE[50] }}>
          {svcChecking ? <><ActivityIndicator size="small" color={SLATE[500]} /><Text style={{ fontSize: 12, fontWeight: "600", color: SLATE[600] }}>Checking availability…</Text></>
            : svc?.serviceable ? <><CheckCircle2 size={16} color={EMERALD[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: EMERALD[700] }}>We serve your area</Text></>
            : <View style={{ flex: 1, flexDirection: "row", gap: 6 }}><AlertTriangle size={16} color={ROSE[600]} /><Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: ROSE[600] }}>We don't serve this pincode yet, so this booking can't be placed here.{Array.isArray(svc?.serviced_cities) && svc.serviced_cities.length > 0 ? <Text> Currently serving: <Text style={{ fontWeight: "800" }}>{svc.serviced_cities.slice(0, 12).join(", ")}</Text>.</Text> : null}</Text></View>}
        </View>
      ) : null}

      {cfg.property_type ? <View><Lbl>Property Type</Lbl><View style={{ marginTop: 4 }}><FSelect testID="addr-property-type" title="Property Type" value={value.property_type || ""} options={types.map((t) => ({ value: t, label: t }))} onChange={(v) => set("property_type", v)} /></View></View> : null}

      {cfg.floor_flat ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><FInput testID="addr-wing" placeholder="Wing/Tower" value={value.wing || ""} onChange={(v) => set("wing", v)} /></View>
          <View style={{ flex: 1 }}><FInput testID="addr-floor" placeholder="Floor" value={value.floor || ""} onChange={(v) => set("floor", v)} /></View>
          <View style={{ flex: 1 }}><FInput testID="addr-flat" placeholder="Flat/Unit" value={value.flat_no || ""} onChange={(v) => set("flat_no", v)} /></View>
        </View>
      ) : null}

      {cfg.landmark_instructions ? (
        <>
          <FInput testID="addr-landmark" placeholder={`Landmark${cfg.mandatory_landmark ? " (required)" : ""}`} value={value.landmark || ""} onChange={(v) => set("landmark", v)} />
          <FInput testID="addr-instructions" multiline placeholder="Access instructions (e.g. Call before entering, inform security)" value={value.instructions || ""} onChange={(v) => set("instructions", v)} />
        </>
      ) : null}
    </View>
  );
}
