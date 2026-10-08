import { useEffect, useState } from "react";

// Current customer location (azo_location); re-renders when the location changes.
export default function useCityKey() {
  const [city, setCity] = useState(() => localStorage.getItem("azo_location") || "");
  useEffect(() => {
    const sync = () => setCity(localStorage.getItem("azo_location") || "");
    window.addEventListener("azo-location-changed", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("azo-location-changed", sync); window.removeEventListener("storage", sync); };
  }, []);
  return city;
}
