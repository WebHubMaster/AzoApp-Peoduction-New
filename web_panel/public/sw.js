/* AzoApp service worker — SELF-UNREGISTERING KILL SWITCH.
 *
 * WHY: the previous service worker cached same-origin static assets "cache-first".
 * Because the app's JS is served at an UN-hashed URL (/static/js/bundle.js), that
 * meant a browser which had once installed the SW would keep serving a STALE
 * JavaScript bundle indefinitely — even after backend/config changes — which broke
 * login for returning users while fresh browsers worked fine.
 *
 * This version intercepts NOTHING and instead tears the service worker down:
 * it deletes every cache and unregisters itself, then reloads open tabs so they
 * load fresh from the network. Browsers automatically re-fetch /sw.js on their
 * next navigation (byte comparison), so every previously-stuck client self-heals
 * with no user action required. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 0. Claim control IMMEDIATELY so the OLD caching SW stops intercepting
    //    fetches during this activation — otherwise the reload below would be
    //    served the stale cached bundle again by the previous service worker.
    try { await self.clients.claim(); } catch (e) { /* ignore */ }
    // 1. Nuke all caches created by any previous SW version.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* ignore */ }
    // 2. Unregister this service worker entirely.
    try { await self.registration.unregister(); } catch (e) { /* ignore */ }
    // 3. Reload any open windows so they pick up the fresh network bundle.
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => {
        try { c.navigate(c.url); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  })());
});

// Do NOT handle fetch — every request goes straight to the network.
