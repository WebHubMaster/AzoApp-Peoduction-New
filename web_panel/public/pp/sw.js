/* AzoApp Web Push service worker (standard VAPID Web Push).
 * The backend (webpush_service.py) encrypts and sends an FCM-style JSON payload
 * { notification: {title, body, icon, ...}, data: {...}, fcmOptions: {link} }.
 * This SW renders that notification and opens the app on click — no Firebase SDK. */
/* eslint-disable no-restricted-globals */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    try { payload = { notification: { title: "AzoApp", body: event.data && event.data.text() } }; }
    catch (e2) { payload = {}; }
  }

  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || data.title || "AzoApp";
  const body = n.body || data.body || "";
  const link = (payload.fcmOptions && payload.fcmOptions.link) || data.link || data.click_action || "/";

  const options = {
    body,
    icon: n.icon || "/icon.png",
    badge: n.badge || "/icon.png",
    tag: data.tag || n.tag || undefined,
    renotify: !!(data.tag || n.tag),
    requireInteraction: data.type === "job_request",
    vibrate: [200, 100, 200, 100, 200],
    data: { ...data, link },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          try { client.navigate(link); } catch (e) { /* ignore */ }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
      return undefined;
    })
  );
});
