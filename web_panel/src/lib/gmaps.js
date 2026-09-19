/* Shared Google Maps JS loader — dedupes across the whole app (one <script>)
   and requests the geometry library for spatial helpers. Polygon drawing is done
   manually (Google removed the DrawingManager/drawing library as of Maps JS
   v3.65). Uses a window-global promise so components in different files never
   double-load the SDK. */
export function loadGoogleMaps(key) {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (window.__azoMapsPromise) return window.__azoMapsPromise;
  if (!key) return Promise.reject(new Error("No Google Maps API key configured"));

  // Google fires this global when a key is INVALID / referrer-blocked / the Maps
  // JavaScript API is not enabled / billing is off. We capture the reason so a map
  // can fail FAST with an accurate message instead of waiting on a poll timeout.
  window.__azoMapsAuthFail = false;
  window.gm_authFailure = () => { window.__azoMapsAuthFail = true; };

  window.__azoMapsPromise = new Promise((resolve, reject) => {
    // Poll for the core SDK. With the weekly channel the script's `onload` can fire
    // a tick BEFORE `google.maps.Map` is attached, so a naive check would wrongly
    // report "couldn't load". We poll for up to ~10s (bail on a Google auth failure).
    // NOTE: we intentionally do NOT require the legacy `drawing` library — Google
    // REMOVED DrawingManager as of Maps JS v3.65; polygon drawing is done manually.
    const DEADLINE = Date.now() + 10000;
    const ready = () => !!(window.google?.maps?.Map);
    const poll = () => {
      if (ready()) return resolve(window.google.maps);
      if (window.__azoMapsAuthFail)
        return reject(new Error("Google Maps auth failed — check the API key (Maps JavaScript API enabled? billing on? domain allowed?)"));
      if (Date.now() > DEADLINE)
        return reject(new Error("Google Maps loaded without core library"));
      setTimeout(poll, 150);
    };

    const existing = document.getElementById("azo-gmaps-sdk");
    if (existing) {
      // Script already on the page (added by another map component) — just poll.
      poll();
      return;
    }
    const s = document.createElement("script");
    s.id = "azo-gmaps-sdk";
    // NOTE: do NOT add &loading=async here — these components call `new
    // google.maps.Map(...)` synchronously inside the .then(), which requires the
    // classic (non-async) bootstrap where the constructors are ready on `onload`.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&v=weekly`;
    s.async = true; s.defer = true;
    s.onload = poll;            // begin polling once the bootstrap has run
    s.onerror = () => reject(new Error("Failed to load Google Maps — network/script error"));
    document.head.appendChild(s);
    // Also start polling immediately in case onload already fired / is delayed.
    poll();
  }).catch((e) => {
    // IMPORTANT: never cache a rejected promise — otherwise a single transient
    // failure would make EVERY map on the app permanently show "couldn't load"
    // until a full page reload. Clearing it lets the next attempt retry cleanly.
    window.__azoMapsPromise = null;
    const bad = document.getElementById("azo-gmaps-sdk");
    if (bad && !window.google?.maps) bad.remove();
    throw e;
  });
  return window.__azoMapsPromise;
}

/* Precise reverse geocoding via Google (far more accurate street/pincode than
   OSM/Nominatim). Returns {line, city, state, pincode, lat, lng, formatted}. */
export async function reverseGeocodeGoogle(key, lat, lng) {
  const maps = await loadGoogleMaps(key);
  const geocoder = new maps.Geocoder();
  const resp = await geocoder.geocode({ location: { lat, lng } });
  const results = resp?.results || [];
  if (!results.length) throw new Error("No address found");
  const best = results[0];
  const get = (type) => {
    const c = (best.address_components || []).find((x) => x.types.includes(type));
    return c ? c.long_name : "";
  };
  const pincode = get("postal_code");
  const city = get("locality") || get("postal_town") || get("administrative_area_level_2") || get("sublocality");
  const state = get("administrative_area_level_1");
  const line =
    [get("premise"), get("street_number"), get("route"), get("sublocality_level_1") || get("sublocality"), get("neighborhood")]
      .filter(Boolean).join(", ") || best.formatted_address || "";
  return { line, city, state, pincode, lat, lng, formatted: best.formatted_address || "" };
}
