/** Location store — mirrors localStorage azo_location / azo_geo + "azo-location-changed" event from the web panel. */
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api/client";

let _city = "";
const subs = new Set<(c: string) => void>();
const emit = () => subs.forEach((f) => f(_city));
storage.getItem("azo_location").then((v) => { if (v) { _city = v; emit(); } });

export const setLocationName = (name: string) => { _city = name; storage.setItem("azo_location", name); emit(); };
export const getLocationName = () => _city;

export function useCity() {
  const [city, setCity] = useState(_city);
  useEffect(() => { subs.add(setCity); setCity(_city); return () => { subs.delete(setCity); }; }, []);
  return city && city !== "Your area" ? city : "";
}
export function useRawLocation() {
  const [city, setCity] = useState(_city);
  useEffect(() => { subs.add(setCity); setCity(_city); return () => { subs.delete(setCity); }; }, []);
  return city;
}

export type DetectResult = { ok: true } | { ok: false; error: string } | { ok: false; outOfArea: { city: string; pincode: string; servicedCities: string[] } };

/** Same flow as web LocationGate.allow / LocationButton.detect. */
export async function detectLocation(): Promise<DetectResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return { ok: false, error: "Location permission was denied. You can enable it from your device settings, or just enter your city manually." };
  let pos: Location.LocationObject;
  try {
    pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    return { ok: false, error: "We couldn't detect your location. Please retry." };
  }
  const lat = pos.coords.latitude, lng = pos.coords.longitude;
  storage.setItem("azo_geo", JSON.stringify({ lat, lng }));
  if (!_city) setLocationName("Your area");
  api.get(`/geo/reverse?lat=${lat}&lng=${lng}`).then((d) => { const nm = d?.city || d?.town || d?.state; if (nm) setLocationName(nm); }).catch(() => {});
  const cov = await api.get(`/serviceability?lat=${lat}&lng=${lng}`, { auth: false }).catch(() => null);
  if (cov && cov.serviceable === false) {
    const rev = await Promise.race([api.get(`/geo/reverse?lat=${lat}&lng=${lng}`).catch(() => ({})), new Promise<any>((r) => setTimeout(() => r({}), 1500))]);
    return { ok: false, outOfArea: { city: rev.city || rev.town || rev.state || "Your area", pincode: rev.postcode || rev.pincode || "", servicedCities: cov.serviced_cities || [] } };
  }
  return { ok: true };
}
