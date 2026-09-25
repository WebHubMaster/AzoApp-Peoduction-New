/** Premium top-anchored location sheet: current city, search city/pincode with live serviceability, GPS detect, popular cities. */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MapPin, X, LocateFixed, CheckCircle2, AlertTriangle, Search, ChevronRight } from "lucide-react-native";
import { PRIMARY, SLATE, EMERALD, ROSE, shadowBtn } from "../../theme";
import { api } from "../../api/client";
import { detectLocation, setLocationName, useCity } from "../../lib/location";

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const city = useCity();
  const [val, setVal] = useState("");
  const [status, setStatus] = useState<"idle" | "locating" | "error" | "out_of_area">("idle");
  const [err, setErr] = useState("");
  const [oos, setOos] = useState<any>(null);
  const [pinCov, setPinCov] = useState<any>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const isPin = /^\d{6}$/.test(val.trim());
  const cities = useQuery({ queryKey: ["site-cities"], queryFn: () => api.get<any[]>("/site/cities", { auth: false }), staleTime: 300_000, enabled: open });

  useEffect(() => { if (open) { setVal(""); setStatus("idle"); setErr(""); setOos(null); } }, [open]);
  useEffect(() => {
    if (!isPin) { setPinCov(null); setPinChecking(false); return; }
    let alive = true; setPinChecking(true);
    api.get(`/geo/serviceability?pincode=${val.trim()}`, { auth: false }).then((r) => alive && setPinCov(r)).catch(() => alive && setPinCov(null)).finally(() => alive && setPinChecking(false));
    return () => { alive = false; };
  }, [val, isPin]);

  const save = (v?: string) => { let name = (v ?? val).trim(); if (!name) return; if (isPin && (pinCov?.city || pinCov?.area)) name = pinCov.city || pinCov.area; setLocationName(name); onClose(); };
  const detect = async () => {
    setStatus("locating"); setErr(""); setOos(null);
    const r = await detectLocation();
    if (r.ok) { setStatus("idle"); onClose(); return; }
    if ("outOfArea" in r) { setOos(r.outOfArea); setStatus("out_of_area"); return; }
    setStatus("error"); setErr(r.error);
  };
  const list: any[] = (cities.data || []).slice(0, 12);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.55)" }}>
        <View testID="app-location-sheet" style={{ backgroundColor: "#fff", borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 22, boxShadow: "0px 18px 40px rgba(15,23,42,0.25)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 20, fontWeight: "900", color: SLATE[900], letterSpacing: -0.4 }}>Your location</Text>
              <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 2 }}>We'll show services available in your area</Text>
            </View>
            <Pressable testID="app-location-close" onPress={onClose} style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: SLATE[100] }}><X size={18} color={SLATE[600]} /></Pressable>
          </View>

          {city ? (
            <View testID="app-location-current" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, alignSelf: "flex-start", backgroundColor: PRIMARY[50], borderRadius: 999, paddingHorizontal: 12, height: 34 }}>
              <MapPin size={14} color={PRIMARY[700]} /><Text style={{ fontSize: 13, fontWeight: "700", color: PRIMARY[800] }}>{city}</Text>
              <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: EMERALD[500] }} /><Text style={{ fontSize: 11, color: EMERALD[700], fontWeight: "600" }}>Current</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: SLATE[200], backgroundColor: SLATE[50], paddingHorizontal: 14 }}>
              <Search size={18} color={SLATE[400]} />
              <TextInput testID="app-location-input" value={val} onChangeText={setVal} onSubmitEditing={() => save()} placeholder="Enter city or pincode" placeholderTextColor={SLATE[400]} autoFocus style={{ flex: 1, fontSize: 14, color: SLATE[900], height: 48, paddingVertical: 0, outlineStyle: "none" } as any} />
              {pinChecking ? <ActivityIndicator size="small" color={PRIMARY[700]} /> : null}
            </View>
            <Pressable testID="app-location-set" onPress={() => save()} disabled={!val.trim()} style={{ height: 50, paddingHorizontal: 20, borderRadius: 16, backgroundColor: val.trim() ? PRIMARY[700] : SLATE[300], justifyContent: "center", ...shadowBtn }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Set</Text></Pressable>
          </View>
          {isPin && !pinChecking && pinCov ? (
            <View testID="app-location-pincode-badge" style={{ marginTop: 10, flexDirection: "row" }}>
              {pinCov.serviceable === true ? <View testID="app-location-pincode-serviceable" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: EMERALD[100], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}><CheckCircle2 size={14} color={EMERALD[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: EMERALD[700] }}>We serve your area{pinCov.city ? ` · ${pinCov.city}` : ""}</Text></View>
                : <View testID="app-location-pincode-blocked" style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ROSE[100], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}><AlertTriangle size={14} color={ROSE[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: ROSE[700] }}>Not in service area yet</Text></View>}
            </View>
          ) : null}

          <Pressable testID="app-location-detect" onPress={detect} disabled={status === "locating"} style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: PRIMARY[100], backgroundColor: PRIMARY[50], opacity: status === "locating" ? 0.7 : 1 }}>
            <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}>{status === "locating" ? <ActivityIndicator size="small" color="#fff" /> : <LocateFixed size={18} color="#fff" />}</View>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "700", color: PRIMARY[800] }}>{status === "locating" ? "Detecting your location…" : "Use my current location"}</Text><Text style={{ fontSize: 11, color: SLATE[500], marginTop: 1 }}>Using GPS · faster & accurate</Text></View>
            <ChevronRight size={18} color={PRIMARY[700]} />
          </Pressable>
          {status === "error" && err ? <Text testID="app-location-error" style={{ fontSize: 12, color: ROSE[600], marginTop: 8 }}>{err}</Text> : null}
          {status === "out_of_area" && oos ? (
            <View testID="app-location-out-of-area" style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: ROSE[50], borderWidth: 1, borderColor: ROSE[200] }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: ROSE[700] }}>We're not in {oos.city} yet</Text>
              <Text style={{ fontSize: 12, color: SLATE[600], marginTop: 2 }}>Pick a serviced city below to continue.</Text>
            </View>
          ) : null}

          {list.length ? (
            <View style={{ marginTop: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: SLATE[400], letterSpacing: 1, textTransform: "uppercase" }}>Popular cities</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
                {list.map((c: any) => (
                  <Pressable key={c.slug || c.city} testID={`app-location-city-${c.slug || c.city}`} onPress={() => save(c.city)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: city?.toLowerCase() === (c.city || "").toLowerCase() ? PRIMARY[600] : SLATE[200], backgroundColor: city?.toLowerCase() === (c.city || "").toLowerCase() ? PRIMARY[50] : "#fff" }}>
                    <MapPin size={13} color={PRIMARY[700]} /><Text style={{ fontSize: 13, fontWeight: "600", color: SLATE[800] }}>{c.city}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </View>
    </Modal>
  );
}
