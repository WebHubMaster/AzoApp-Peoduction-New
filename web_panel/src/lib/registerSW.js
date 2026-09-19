// AzoApp service-worker manager.
//
// The app no longer uses a caching service worker (it caused returning users to
// be stuck on a stale JS bundle). This module now ACTIVELY UNREGISTERS any
// service worker a browser may still have from an older build and clears its
// caches, so every client always loads fresh from the network.
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const cleanup = async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map((reg) => {
          // Keep Firebase Cloud Messaging's own SW (push notifications) intact.
          const url = (reg.active && reg.active.scriptURL) || '';
          if (url.includes('firebase-messaging-sw')) return Promise.resolve();
          return reg.unregister().catch(() => {});
        })
      );
    } catch (e) { /* ignore */ }
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)).map((p) => (p && p.catch ? p.catch(() => {}) : p)));
      }
    } catch (e) { /* ignore */ }
  };

  // If an old service worker is currently controlling this page, force a single
  // reload the moment control changes (i.e. when the kill-switch SW takes over or
  // unregisters), so the page is guaranteed to load the fresh network bundle.
  let reloaded = false;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }

  window.addEventListener('load', () => { cleanup(); });
}
